const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  googleLogin: () => ipcRenderer.invoke('google-login'),
  getSources: () => ipcRenderer.invoke('get-sources'),
  uploadAudioChunk: (chunk) => ipcRenderer.invoke('upload-audio-chunk', { chunk }),
  stopSysAudio: () => ipcRenderer.invoke('stop-sys-audio'),
  saveTranscript: (filename, content) => ipcRenderer.invoke('save-transcript', { filename, content }),
  summarizeMeeting: (transcript) => ipcRenderer.invoke('summarize-meeting', { transcript }),
  saveSummaryPdf: (htmlContent) => ipcRenderer.invoke('save-summary-pdf', { htmlContent }),
  onTranscriptUpdate: (callback) => ipcRenderer.on('transcript-update', (_event, value) => callback(value)),
  saveApiKey: (key) => ipcRenderer.invoke('save-api-key', { key }),
  getApiKey: () => ipcRenderer.invoke('get-api-key'),
  logout: () => ipcRenderer.invoke('logout'),
});