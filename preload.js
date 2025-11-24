const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  googleLogin: () => ipcRenderer.invoke('google-login'),
  startSysAudio: (filename) => ipcRenderer.invoke('start-sys-audio', { filename }),
  stopSysAudio: () => ipcRenderer.invoke('stop-sys-audio'),
  saveTranscript: (filename, content) => ipcRenderer.invoke('save-transcript', { filename, content }),
  summarizeMeeting: (transcript) => ipcRenderer.invoke('summarize-meeting', { transcript }),
  saveSummaryPdf: (htmlContent) => ipcRenderer.invoke('save-summary-pdf', { htmlContent }),
  getSources: () => ipcRenderer.invoke('get-sources'),
  onTranscriptUpdate: (callback) => ipcRenderer.on('transcript-update', (_event, value) => callback(value)),
});