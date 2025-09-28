# Notula-AI — Starter Electron App (Microphone + System Audio Capture)

This repository is a starter Electron application that captures microphone and system audio,
provides a UI to start/stop recording, saves a WAV file, and includes a placeholder for integrating
local Whisper (whisper.cpp) via `@kutalia/whisper-node-addon` or another Node binding.

IMPORTANT: This starter **does not** include whisper models or prebuilt native binaries.
You must follow the integration steps below to enable local transcription.

## What's included
- Minimal Electron app (main.js, preload.js, renderer.js, index.html)
- Start/Stop recording UI
- System audio capture using `electron-audio-loopback`
- Saves recorded mixed audio to `recordings/recording.wav`
- IPC hooks where you can add whisper-node-addon integration in `main.js`

## Requirements
- Node.js 18+ (LTS recommended)
- npm or yarn
- Electron 31+ (installed via npm in this project)
- On macOS: app signing & permissions for microphone/system audio when distributing
- On Linux: PulseAudio or PipeWire configured for loopback capture
- For best transcription performance: a machine with GPU support (optional) and at least 8GB RAM.

## Quick run (development)
1. Unzip the project and `cd` into it.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start the app:
   ```bash
   npm start
   ```
   On first run, grant microphone access if prompted.

## Enabling Whisper (local transcription)
To enable real transcription using whisper.cpp you'll need to:
1. Install `@kutalia/whisper-node-addon` (or another Node binding to whisper.cpp) and its native binaries:
   ```bash
   npm install @kutalia/whisper-node-addon
   ```
   If binaries are not prebuilt for your platform, you may need to build from source (see the addon's docs).
2. Download a whisper.cpp model (e.g., `ggml-small.bin` or `ggml-base.en.bin`) from:
   - https://huggingface.co/ggerganov/whisper.cpp
   Place the model file under `models/` inside the project directory.
3. Modify the `startTranscription` function in `main.js` where `USE_WHISPER` is checked.
   The code contains comments showing where to call the transcription API and how to receive results.
4. Optionally run `npm run rebuild` to trigger `electron-rebuild` if native modules need rebuilding for Electron.

## Files of interest
- `main.js` — Electron main process, system audio integration, IPC handlers, file saving, transcription placeholder.
- `preload.js` — Exposes safe IPC to renderer.
- `renderer.js` — UI: start/stop recording, display live waveform (basic), transcript area.
- `index.html` — Simple UI layout.
- `recordings/` — Saved WAV files will be stored here after recording.

## Limitations and notes
- This starter focuses on capturing audio and saving a WAV. Real-time Whisper integration is **not** auto-configured because
  whisper models are large and platform-native binaries vary by OS and architecture.
- Speaker diarization is **not** included. You can add pyannote or similar tools for diarization and then merge outputs with Whisper timestamps.
- Packaging for distribution (Windows .exe, macOS .app, Linux .deb/.AppImage) requires additional steps (`electron-builder` recommended).

## Support
If you want, I can:
- Help integrate `@kutalia/whisper-node-addon` calls into this starter (I will provide the code to paste into `main.js` and explain how to download models).
- Add a simple diarization flow using a best-effort JavaScript approach.
- Create an automated packaging script (note: building native binaries for whisper.cpp per-platform cannot be done here).
