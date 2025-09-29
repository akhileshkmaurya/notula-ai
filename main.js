const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

let whisper = null;
const USE_WHISPER = true;

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

