const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveTranscript: (data) => ipcRenderer.invoke('save-transcript', data),
  saveRecording: (data) => ipcRenderer.invoke('save-recording', data),
  transcribeBoth: (data) => ipcRenderer.invoke('transcribe-both', data)
});