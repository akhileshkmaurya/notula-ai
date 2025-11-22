const { app, BrowserWindow, ipcMain, desktopCapturer, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
require('dotenv').config();

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

// Transcribe
ipcMain.handle('transcribe-both', async (event, { sysPath }) => {
  try {
    let result = [];
    if (USE_WHISPER && whisper && sysPath) {
      const sysFile = path.join(app.getPath('documents'), 'notula-ai-recordings', sysPath);

      // 1. Transcribe
      console.log('Starting transcription...');
      const resp = await whisper.transcribe({ fname_inp: sysFile, model: 'models/ggml-base.en.bin' });
      result = resp.transcription || resp.segments || [];
      console.log(`Transcription done. ${result.length} segments.`);

      // 2. Cleanup Audio File
      try {
        if (fs.existsSync(sysFile)) {
          fs.unlinkSync(sysFile);
          console.log(`Deleted audio file: ${sysFile}`);
        }
      } catch (e) {
        console.error(`Failed to delete audio file: ${sysFile}`, e);
      }
    }
    return { ok: true, result };
  } catch (err) {
    console.error('Transcription error:', err);
    return { ok: false, error: String(err) };
  }
});

// Summarize
const OpenAI = require('openai');

ipcMain.handle('summarize-meeting', async (event, { transcript }) => {
  try {
    console.log(`Summarizing meeting with Gemini...`);

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'YOUR_API_KEY_HERE') {
      return { ok: false, error: 'Missing GEMINI_API_KEY in .env file' };
    }

    const clientConfig = {
      apiKey: apiKey,
      baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/'
    };

    const openai = new OpenAI(clientConfig);

    const prompt = `
You are an expert minute-taker. 
Please analyze the following meeting transcript and provide a structured summary.
Use EXACTLY these section headers (Markdown H2):
## Executive Summary
## Action Items
## Decisions

For Action Items, use bullet points.
For Decisions, use bullet points.

Transcript:
${transcript}
    `.trim();

    const completion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'gemini-flash-latest',
    });

    const summary = completion.choices[0].message.content;
    return { ok: true, summary };
  } catch (err) {
    console.error('Summarization error:', err);
    return { ok: false, error: String(err) };
  }
});

// Export PDF
ipcMain.handle('save-summary-pdf', async (event, { htmlContent }) => {
  try {
    const { filePath } = await dialog.showSaveDialog({
      buttonLabel: 'Save PDF',
      defaultPath: `meeting-summary-${Date.now()}.pdf`,
      filters: [{ name: 'PDF Files', extensions: ['pdf'] }]
    });

    if (filePath) {
      const win = new BrowserWindow({ show: false });

      // Create a simple HTML template for the PDF
      const pdfHtml = `
        <html>
          <head>
            <style>
              body { font-family: Arial, sans-serif; padding: 40px; }
              h1 { color: #2563eb; border-bottom: 1px solid #ccc; padding-bottom: 10px; }
              h2 { color: #1e293b; margin-top: 20px; border-left: 4px solid #2563eb; padding-left: 10px; }
              ul { line-height: 1.6; }
              li { margin-bottom: 8px; }
            </style>
          </head>
          <body>
            <h1>Meeting Summary</h1>
            ${htmlContent}
          </body>
        </html>
      `;

      await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(pdfHtml));

      const pdfData = await win.webContents.printToPDF({});
      fs.writeFileSync(filePath, pdfData);
      win.close();

      return { ok: true, path: filePath };
    }
    return { ok: false, error: 'Cancelled' };
  } catch (err) {
    console.error('PDF Export error:', err);
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

async function getDefaultSource() {
  try {
    return await execPromise('pactl get-default-source');
  } catch (e) {
    console.error('Error getting default source:', e);
    return null;
  }
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

ipcMain.handle('start-sys-audio', async (event, { filename }) => {
  console.log(`IPC_MAIN: start-sys-audio received.`);
  try {
    const recordingsDir = path.join(app.getPath('documents'), 'notula-ai-recordings');
    if (!fs.existsSync(recordingsDir)) fs.mkdirSync(recordingsDir, { recursive: true });
    const outPath = path.join(recordingsDir, filename);

    // Global system recording (legacy/default/fallback)
    console.log('Detecting default system audio device...');
    const device = await getSystemAudioDevice();
    const micSource = await getDefaultSource();
    console.log(`Found device: ${device}, Mic: ${micSource}. Starting ffmpeg...`);

    const args = [
      '-f', 'pulse', '-i', device,
    ];

    if (micSource) {
      args.push('-f', 'pulse', '-i', micSource);
      // Stereo: Left=System, Right=Mic
      args.push('-filter_complex', '[1:a]volume=4.0[mic];[0:a][mic]join=inputs=2:channel_layout=stereo:map=0.0-FL|1.0-FR[a]');
      args.push('-map', '[a]');
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
