const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');

let whisper = null;
const USE_WHISPER = true;
let sysAudioProcess = null;

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
  win.webContents.openDevTools();
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

// Transcribe both mic + system
ipcMain.handle('transcribe-both', async (event, { micPath, sysPath }) => {
  try {
    let micResult = null, sysResult = null;
    if (USE_WHISPER && whisper) {
      if (micPath) {
        const micFile = path.join(app.getPath('documents'), 'notula-ai-recordings', micPath);
        const resp = await whisper.transcribe({ fname_inp: micFile, model: 'models/ggml-base.en.bin' });
        micResult = resp.transcription || resp.segments || [];
      }
      if (sysPath) {
        const sysFile = path.join(app.getPath('documents'), 'notula-ai-recordings', sysPath);
        const resp = await whisper.transcribe({ fname_inp: sysFile, model: 'models/ggml-base.en.bin' });
        sysResult = resp.transcription || resp.segments || [];
      }
    }
    return { ok: true, mic: micResult, sys: sysResult };
  } catch (err) {
    console.error('Transcription error:', err);
    return { ok: false, error: String(err) };
  }
});

async function getSystemAudioDevice() {
  return new Promise((resolve, reject) => {
    exec('pactl get-default-sink', (error, stdout, stderr) => {
      if (error) {
        return reject(`Failed to get default sink: ${stderr}`);
      }
      const defaultSink = stdout.trim();

      exec('pactl list sources', (error, stdout, stderr) => {
        if (error) {
          return reject(`Failed to list sources: ${stderr}`);
        }

        let currentSource = {};
        const sources = [];

        stdout.split('\n').forEach(line => {
          if (line.startsWith('Source #')) {
            if (Object.keys(currentSource).length > 0) {
              sources.push(currentSource);
            }
            currentSource = {};
          } else {
            const [key, ...value] = line.split(':');
            if (key && value.length > 0) {
              currentSource[key.trim()] = value.join(':').trim();
            }
          }
        });
        if (Object.keys(currentSource).length > 0) {
          sources.push(currentSource);
        }

        for (const source of sources) {
          if (source['Monitor of Sink'] === defaultSink) {
            return resolve(source['Name']);
          }
        }

        reject('Could not find a monitor source for the default sink.');
      });
    });
  });
}

ipcMain.handle('start-sys-audio', async (event, { filename }) => {
  console.log('IPC_MAIN: start-sys-audio received');
  try {
    const recordingsDir = path.join(app.getPath('documents'), 'notula-ai-recordings');
    if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });
    const outPath = path.join(recordingsDir, filename);

    console.log('Detecting default system audio device...');
    const device = await getSystemAudioDevice();
    console.log(`Found device: ${device}. Starting ffmpeg, outputting to: ${outPath}`);

    sysAudioProcess = spawn('ffmpeg', [
        '-f', 'pulse',
        '-i', device,
        '-acodec', 'pcm_s16le',
        '-ar', '44100',
        '-ac', '1',
        outPath
    ]);

    sysAudioProcess.stdout.on('data', (data) => {
      console.log(`ffmpeg stdout: ${data}`);
    });

    sysAudioProcess.stderr.on('data', (data) => {
      console.error(`ffmpeg stderr: ${data}`);
    });

    sysAudioProcess.on('close', (code) => {
      console.log(`ffmpeg process exited with code ${code}`);
    });

    return { ok: true, path: outPath };
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
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});
