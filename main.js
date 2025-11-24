const { app, BrowserWindow, ipcMain, desktopCapturer, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
require('dotenv').config();
const googleAuth = require('./auth');

// Server Configuration
const SERVER_URL = 'http://35.205.52.222:8000';
let sysAudioProcess = null;
let mainWindow = null;
let loginWindow = null;

function createLoginWindow() {
  loginWindow = new BrowserWindow({
    width: 500,
    height: 650,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    resizable: false,
    frame: true,
  });

  loginWindow.loadFile('login.html');
  // loginWindow.webContents.openDevTools();

  loginWindow.on('closed', () => {
    loginWindow = null;
  });
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
  mainWindow = win;
}

// Disable GPU Acceleration to fix Linux VSync errors
app.disableHardwareAcceleration();

app.whenReady().then(() => {
  // Try to load existing session
  const hasSession = googleAuth.loadSession();

  if (hasSession && googleAuth.isAuthenticated()) {
    console.log('Restored session for user:', googleAuth.getUserInfo().email);
    createWindow();
  } else {
    console.log('No valid session found, showing login window');
    createLoginWindow();
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (googleAuth.isAuthenticated()) {
        createWindow();
      } else {
        createLoginWindow();
      }
    }
  });
});

ipcMain.handle('logout', async () => {
  googleAuth.logout();
  if (mainWindow) {
    mainWindow.close();
    mainWindow = null;
  }
  createLoginWindow();
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

// Google Login Handler
ipcMain.handle('google-login', async (event) => {
  try {
    console.log('Starting Google OAuth login...');
    const result = await googleAuth.login();

    if (result.success) {
      console.log('Login successful for user:', result.userInfo.email);

      // Close login window and open main window
      if (loginWindow) {
        loginWindow.close();
      }
      createWindow();

      return { success: true, user: result.userInfo };
    } else {
      return { success: false, error: 'Authentication failed' };
    }
  } catch (err) {
    console.error('Google login error:', err);
    return { success: false, error: err.message };
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
    console.log(`Loaded API Key: ${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}`);

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

// --- Audio Device Helpers ---

let ffmpegPath;
if (process.platform === 'linux') {
  // On Linux, use system ffmpeg because ffmpeg-static lacks PulseAudio support
  ffmpegPath = 'ffmpeg';
} else {
  // On Windows/Mac, use the bundled static binary
  ffmpegPath = require('ffmpeg-static').replace(
    'app.asar',
    'app.asar.unpacked'
  );
}

function execPromise(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) reject({ error, stderr });
      else resolve(stdout.trim());
    });
  });
}

async function getLinuxAudioDevice() {
  try {
    const defaultSink = await execPromise('pactl get-default-sink');
    const stdout = await execPromise('pactl list sources');

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
      if (source['Monitor of Sink'] === defaultSink) return source['Name'];
    }
    throw new Error('Could not find monitor source');
  } catch (e) {
    console.error('Linux audio detection failed:', e);
    return null;
  }
}

async function getWindowsAudioDevices() {
  return new Promise((resolve) => {
    // ffmpeg -list_devices true -f dshow -i dummy
    const ffmpeg = spawn(ffmpegPath, ['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy']);
    let stderr = '';

    ffmpeg.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', () => {
      const devices = [];
      let isAudio = false;

      stderr.split('\n').forEach(line => {
        if (line.includes('DirectShow audio devices')) {
          isAudio = true;
        } else if (line.includes('DirectShow video devices')) {
          isAudio = false;
        } else if (isAudio && line.includes(']  "')) {
          const match = line.match(/"([^"]+)"/);
          if (match) devices.push(match[1]);
        }
      });
      resolve(devices);
    });
  });
}

// --- IPC Handlers ---

// --- WAV Header Helper ---
function writeWavHeader(samples, sampleRate = 16000, numChannels = 1, bitDepth = 16) {
  const buffer = Buffer.alloc(44);
  const byteRate = (sampleRate * numChannels * bitDepth) / 8;
  const blockAlign = (numChannels * bitDepth) / 8;
  const dataSize = samples.length;
  const chunkSize = 36 + dataSize;

  // RIFF chunk descriptor
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(chunkSize, 4);
  buffer.write('WAVE', 8);

  // fmt sub-chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  buffer.writeUInt16LE(1, 20);  // AudioFormat (1 for PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitDepth, 34);

  // data sub-chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  return buffer;
}

ipcMain.handle('upload-audio-chunk', async (event, { chunk }) => {
  try {
    // chunk is an ArrayBuffer from renderer
    const buffer = Buffer.from(chunk);

    console.log(`Processing chunk of size ${buffer.length} bytes...`);

    // Add WAV header
    // Note: chunk is raw PCM (16kHz, 16-bit, mono)
    const header = writeWavHeader(buffer);
    const wavData = Buffer.concat([header, buffer]);

    const blob = new Blob([wavData], { type: 'audio/wav' });
    const formData = new FormData();
    formData.append('file', blob, 'chunk.wav');

    // Get the ID token for authentication
    const idToken = googleAuth.getIdToken();
    const headers = {};
    if (idToken) {
      headers['Authorization'] = `Bearer ${idToken}`;
    }

    const response = await fetch(`${SERVER_URL}/transcribe`, {
      method: 'POST',
      headers: headers,
      body: formData
    });

    if (response.ok) {
      const result = await response.json();
      if (result.text && mainWindow) {
        console.log(`Transcript: ${result.text}`);
        mainWindow.webContents.send('transcript-update', result.text);
      }
      return { ok: true };
    } else {
      console.error('Server error:', response.statusText);
      return { ok: false, error: response.statusText };
    }
  } catch (e) {
    console.error('Upload failed:', e);
    return { ok: false, error: String(e) };
  }
});

ipcMain.handle('get-sources', async () => {
  const sources = await desktopCapturer.getSources({ types: ['screen'] });
  return sources.map(source => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL()
  }));
});

ipcMain.handle('stop-sys-audio', async (event) => {
  // Legacy handler kept for compatibility, but now logic is in renderer
  return { ok: true };
});
