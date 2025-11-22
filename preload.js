const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveTranscript: (data) => ipcRenderer.invoke('save-transcript', data),
  saveRecording: (data) => ipcRenderer.invoke('save-recording', data),
  transcribeBoth: (data) => ipcRenderer.invoke('transcribe-both', data),
  summarizeMeeting: (args) => ipcRenderer.invoke('summarize-meeting', args),
  saveSummaryPdf: (args) => ipcRenderer.invoke('save-summary-pdf', args),
  startSysAudio: (data) => ipcRenderer.invoke('start-sys-audio', data),
  stopSysAudio: () => ipcRenderer.invoke('stop-sys-audio'),
  getSources: () => ipcRenderer.invoke('get-sources'),
});