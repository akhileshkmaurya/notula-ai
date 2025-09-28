// Renderer: captures microphone audio and records to WAV PCM using Web Audio API.
// Sends the WAV data to the main process for Whisper transcription.

const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const saveBtn = document.getElementById('saveBtn');
const statusEl = document.getElementById('status');
const transcriptEl = document.getElementById('transcript');

let audioCtx;
let processor;
let micStream;
let recordedSamples = [];
let recordingSampleRate = 16000; // Whisper prefers 16kHz

function encodeWAV(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  const length = samples.length * 2;

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // PCM
  view.setUint16(20, 1, true);  // Linear quantization
  view.setUint16(22, 1, true);  // Mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true);  // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(view, 36, 'data');
  view.setUint32(40, length, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

async function startRecording() {
  statusEl.textContent = 'Status: requesting media permissions...';
  recordedSamples = [];

  try {
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioCtx = new AudioContext({ sampleRate: recordingSampleRate });

    const source = audioCtx.createMediaStreamSource(micStream);

    // ScriptProcessorNode is deprecated but works in Electron
    processor = audioCtx.createScriptProcessor(4096, 1, 1);
    source.connect(processor);
    processor.connect(audioCtx.destination);

    processor.onaudioprocess = (e) => {
      const channelData = e.inputBuffer.getChannelData(0);
      recordedSamples.push(new Float32Array(channelData));
    };

    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusEl.textContent = 'Status: recording...';
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Status: error obtaining audio: ' + err.message;
  }
}

async function stopRecording() {
  if (processor) {
    processor.disconnect();
    processor.onaudioprocess = null;
  }
  if (audioCtx) {
    await audioCtx.close();
  }
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
  }

  // Merge recorded chunks into one Float32Array
  let length = recordedSamples.reduce((acc, cur) => acc + cur.length, 0);
  let merged = new Float32Array(length);
  let offset = 0;
  for (const chunk of recordedSamples) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  // Encode to WAV
  const wavBlob = encodeWAV(merged, recordingSampleRate);
  const arrayBuffer = await wavBlob.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  const filename = `recording-${Date.now()}.wav`;

  // Send to main process for Whisper transcription
  const resp = await window.electronAPI.startTranscription({ filename, data: buffer });
if (resp.ok) {
  transcriptEl.textContent = resp.segments
    .map(seg => `[${seg.start} - ${seg.end}] ${seg.text}`)
    .join('\n');
  saveBtn.disabled = false;
  statusEl.textContent = 'Status: transcription complete';
} else {
  transcriptEl.textContent = 'Transcription error: ' + resp.error;
  statusEl.textContent = 'Status: failed transcription';
}
  startBtn.disabled = false;
  stopBtn.disabled = true;
}

async function saveTranscript() {
  const content = transcriptEl.textContent;
  const filename = 'transcript-' + Date.now() + '.txt';
  const resp = await window.electronAPI.saveTranscript({ filename, content });
  if (resp.ok) {
    statusEl.textContent = 'Status: transcript saved to ' + resp.path;
  } else {
    statusEl.textContent = 'Status: failed to save transcript: ' + resp.error;
  }
}

startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
saveBtn.addEventListener('click', saveTranscript);
