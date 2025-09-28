const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveTranscript: (args) => ipcRenderer.invoke('save-transcript', args),
  startTranscription: (args) => ipcRenderer.invoke('start-transcription', args)
});