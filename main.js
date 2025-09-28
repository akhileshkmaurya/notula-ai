const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let whisper = null;
const USE_WHISPER = true;

if (USE_WHISPER) {
  try {
    whisper = require('@kutalia/whisper-node-addon');
    console.log('Whisper addon loaded');
  } catch (e) {
    console.error('Failed to load whisper addon:', e);
    whisper = null;
  }
}

function createWindow () {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
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

// Save transcript to file
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

// Transcribe WAV audio with Whisper
ipcMain.handle('start-transcription', async (event, { filename, data }) => {
  console.log('⚡ Received audio for transcription:', filename, data.length);

  try {
    const tempDir = app.getPath('temp');
    const wavPath = path.join(tempDir, filename);
    fs.writeFileSync(wavPath, Buffer.from(data));
    console.log('✅ Saved wav to', wavPath);

    if (USE_WHISPER && whisper) {
      const modelPath = path.join(__dirname, 'models/ggml-base.en.bin');
      console.log('🧠 Running Whisper on', wavPath);

      const resp = await whisper.transcribe({
        fname_inp: wavPath,
        model: modelPath,
        language: 'en',
        threads: 4
      });

      console.log('📜 Whisper response:', resp);

      // Normalize output to "segments"
      let segments = [];
      if (Array.isArray(resp.transcription)) {
        segments = resp.transcription.map(([start, end, text]) => ({
          start,
          end,
          text
        }));
      }

      return { ok: true, segments, raw: resp };
    } else {
      return { ok: false, error: 'Whisper not enabled.' };
    }
  } catch (err) {
    console.error('Transcription error:', err);
    return { ok: false, error: String(err) };
  }
});

