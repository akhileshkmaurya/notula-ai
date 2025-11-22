const { app, BrowserWindow, ipcMain, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');

let whisper = null;
const USE_WHISPER = true;
let sysAudioProcess = null;
let pulseModules = []; // Track loaded PulseAudio modules to unload them later

if (USE_WHISPER) {
  try {
    whisper = require('@kutalia/whisper-node-addon');
    console.log('✅ Whisper addon loaded');
  } catch (e) {
    console.error('❌ Failed to load whisper addon:', e);
    whisper = null;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile('index.html');
  // win.webContents.openDevTools();
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Save transcript file
ipcMain.handle('save-transcript', async (event, { filename, content }) => {
  try {
    const recordingsDir = path.join(app.getPath('documents'), 'notula-ai-recordings');
    if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });
    const outPath = path.join(recordingsDir, filename);
    fs.writeFileSync(outPath, content, 'utf8');
    return { ok: true, path: outPath };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// Save raw recording (mic/system WAV) to disk
ipcMain.handle('save-recording', async (event, { filename, data }) => {
  try {
    const recordingsDir = path.join(app.getPath('documents'), 'notula-ai-recordings');
    if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });
    const outPath = path.join(recordingsDir, filename);
    fs.writeFileSync(outPath, data);
    return { ok: true, path: outPath };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

// Transcribe mixed audio
ipcMain.handle('transcribe-both', async (event, { sysPath }) => {
  try {
    let result = null;
    if (USE_WHISPER && whisper) {
      if (sysPath) {
        const sysFile = path.join(app.getPath('documents'), 'notula-ai-recordings', sysPath);
        const resp = await whisper.transcribe({ fname_inp: sysFile, model: 'models/ggml-base.en.bin' });
        result = resp.transcription || resp.segments || [];
      }
    }
    return { ok: true, result };
  } catch (err) {
    console.error('Transcription error:', err);
    return { ok: false, error: String(err) };
  }
});

// --- PulseAudio Helpers ---

function execPromise(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject({ error, stderr });
      else resolve(stdout.trim());
    });
  });
}

async function getPidFromWindowId(windowId) {
  try {
    const parts = windowId.split(':');
    if (parts.length < 2) return null;
    const xid = parts[1];
    const output = await execPromise(`xprop -id ${xid} _NET_WM_PID`);
    const match = output.match(/=\s*(\d+)/);
    return match ? match[1] : null;
  } catch (e) {
    console.error('Error getting PID from window ID:', e);
    return null;
  }
}

async function getSinkInputsForPid(pid) {
  try {
    const stdout = await execPromise('pactl list sink-inputs');
    const inputs = [];
    let currentInput = null;

    stdout.split('\n').forEach(line => {
      const match = line.match(/^Sink Input #(\d+)/);
      if (match) {
        if (currentInput && currentInput.pid === pid) {
          inputs.push(currentInput.id);
        }
        currentInput = { id: match[1], pid: null };
      } else if (currentInput) {
        const pidMatch = line.match(/application\.process\.id = "(\d+)"/);
        if (pidMatch) {
          currentInput.pid = pidMatch[1];
        }
      }
    });
    if (currentInput && currentInput.pid === pid) {
      inputs.push(currentInput.id);
    }
    return inputs;
  } catch (e) {
    console.error('Error listing sink inputs:', e);
    return [];
  }
}

async function getDefaultSource() {
  try {
    return await execPromise('pactl get-default-source');
  } catch (e) {
    console.error('Error getting default source:', e);
    return null;
  }
}

async function setupAppRecording(pid, outPath) {
  try {
    // 1. Create Null Sink
    const nullSinkId = await execPromise('pactl load-module module-null-sink sink_name=NotulaRecorder sink_properties=device.description="Notula_Recorder"');
    pulseModules.push(nullSinkId);
    console.log(`Created Null Sink: ${nullSinkId}`);

    // 2. Create Loopback (Null -> Default) so user can still hear audio
    const defaultSink = await execPromise('pactl get-default-sink');
    const loopbackId = await execPromise(`pactl load-module module-loopback source=NotulaRecorder.monitor sink=${defaultSink}`);
    pulseModules.push(loopbackId);
    console.log(`Created Loopback: ${loopbackId}`);

    // 3. Move App Streams to Null Sink
    const inputs = await getSinkInputsForPid(pid);
    if (inputs.length === 0) {
      console.warn(`No active audio streams found for PID ${pid}. Audio might not be recorded until the app plays sound.`);
    }
    for (const inputId of inputs) {
      await execPromise(`pactl move-sink-input ${inputId} NotulaRecorder`);
      console.log(`Moved sink input ${inputId} to NotulaRecorder`);
    }

    // 4. Start ffmpeg recording (Mix Mic + App)
    const appMonitor = 'NotulaRecorder.monitor';
    const micSource = await getDefaultSource();

    console.log(`Starting ffmpeg. App: ${appMonitor}, Mic: ${micSource}`);

    const args = [
      '-f', 'pulse', '-i', appMonitor,
    ];

    if (micSource) {
      args.push('-f', 'pulse', '-i', micSource);
      // Boost mic volume (input 1) by 4x (~12dB) before mixing
      // amix reduces each input by 1/N (so 0.5 here). 
      // Boosting mic helps if system mic volume is low.
      args.push('-filter_complex', '[1:a]volume=4.0[mic];[0:a][mic]amix=inputs=2:duration=longest');
    } else {
      console.warn('No default mic source found, recording only app audio.');
      args.push('-ac', '1'); // Ensure mono if no mix
    }

    args.push(
      '-acodec', 'pcm_s16le',
      '-ar', '44100',
      '-y', // overwrite
      outPath
    );

    sysAudioProcess = spawn('ffmpeg', args);

    sysAudioProcess.stdout.on('data', (data) => console.log(`ffmpeg stdout: ${data}`));
    sysAudioProcess.stderr.on('data', (data) => console.error(`ffmpeg stderr: ${data}`));
    sysAudioProcess.on('close', (code) => console.log(`ffmpeg process exited with code ${code}`));

    return { ok: true, path: outPath };

  } catch (err) {
    console.error('Error setting up app recording:', err);
    await cleanupPulseModules();
    return { ok: false, error: String(err) };
  }
}

async function cleanupPulseModules() {
  for (const modId of pulseModules) {
    try {
      await execPromise(`pactl unload-module ${modId}`);
      console.log(`Unloaded module ${modId}`);
    } catch (e) {
      console.error(`Failed to unload module ${modId}:`, e);
    }
  }
  pulseModules = [];
}

async function getSystemAudioDevice() {
  // Fallback for global system audio
  return new Promise((resolve, reject) => {
    exec('pactl get-default-sink', (error, stdout, stderr) => {
      if (error) return reject(`Failed to get default sink: ${stderr}`);
      const defaultSink = stdout.trim();

      exec('pactl list sources', (error, stdout, stderr) => {
        if (error) return reject(`Failed to list sources: ${stderr}`);

        let currentSource = {};
        const sources = [];

        stdout.split('\n').forEach(line => {
          if (line.startsWith('Source #')) {
            if (Object.keys(currentSource).length > 0) sources.push(currentSource);
            currentSource = {};
          } else {
            const [key, ...value] = line.split(':');
            if (key && value.length > 0) currentSource[key.trim()] = value.join(':').trim();
          }
        });
        if (Object.keys(currentSource).length > 0) sources.push(currentSource);

        for (const source of sources) {
          if (source['Monitor of Sink'] === defaultSink) return resolve(source['Name']);
        }
        reject('Could not find a monitor source for the default sink.');
      });
    });
  });
}

// --- IPC Handlers ---

ipcMain.handle('get-sources', async () => {
  try {
    const sources = await desktopCapturer.getSources({ types: ['window', 'screen'] });
    return sources.map(s => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL()
    }));
  } catch (e) {
    console.error('Error getting sources:', e);
    return [];
  }
});

ipcMain.handle('start-sys-audio', async (event, { filename, sourceId }) => {
  console.log(`IPC_MAIN: start-sys-audio received. Source: ${sourceId || 'System Default'}`);
  try {
    const recordingsDir = path.join(app.getPath('documents'), 'notula-ai-recordings');
    if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });
    const outPath = path.join(recordingsDir, filename);

    if (sourceId && sourceId !== 'default') {
      // App-specific recording
      const pid = await getPidFromWindowId(sourceId);
      if (!pid) {
        throw new Error(`Could not find PID for window ID: ${sourceId}`);
      }
      console.log(`Mapped source ${sourceId} to PID ${pid}`);
      return await setupAppRecording(pid, outPath);
    } else {
      // Global system recording (legacy/default)
      console.log('Detecting default system audio device...');
      const device = await getSystemAudioDevice();
      const micSource = await getDefaultSource();
      console.log(`Found device: ${device}, Mic: ${micSource}. Starting ffmpeg...`);

      const args = [
        '-f', 'pulse', '-i', device,
      ];

      if (micSource) {
        args.push('-f', 'pulse', '-i', micSource);
        args.push('-filter_complex', '[1:a]volume=4.0[mic];[0:a][mic]amix=inputs=2:duration=longest');
      } else {
        args.push('-ac', '1');
      }

      args.push(
        '-acodec', 'pcm_s16le',
        '-ar', '44100',
        '-y',
        outPath
      );

      sysAudioProcess = spawn('ffmpeg', args);

      sysAudioProcess.stdout.on('data', (data) => console.log(`ffmpeg stdout: ${data}`));
      sysAudioProcess.stderr.on('data', (data) => console.error(`ffmpeg stderr: ${data}`));
      sysAudioProcess.on('close', (code) => console.log(`ffmpeg process exited with code ${code}`));

      return { ok: true, path: outPath };
    }
  } catch (err) {
    console.error('Error starting sys audio:', err);
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('stop-sys-audio', async (event) => {
  try {
    if (sysAudioProcess) {
      sysAudioProcess.kill('SIGINT');
      sysAudioProcess = null;
    }
    await cleanupPulseModules();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});
