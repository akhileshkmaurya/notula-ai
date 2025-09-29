const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const saveBtn = document.getElementById('saveBtn');
const statusEl = document.getElementById('status');
const transcriptEl = document.getElementById('transcript');

let micRecorder, sysRecorder;
let micChunks = [], sysChunks = [];

/* ---------- WAV Helpers ---------- */
function createWavHeader(sampleRate, numChannels, numFrames) {
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  function writeString(offset, str) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  let blockAlign = numChannels * 2;
  let byteRate = sampleRate * blockAlign;
  let dataSize = numFrames * blockAlign;

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  return buffer;
}

function encodeWav(samples, sampleRate) {
  const header = createWavHeader(sampleRate, 1, samples.length);
  const buffer = new ArrayBuffer(header.byteLength + samples.length * 2);
  const view = new DataView(buffer);

  new Uint8Array(buffer).set(new Uint8Array(header), 0);

  let offset = header.byteLength;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return new Uint8Array(buffer);
}

/* ---------- Recorder Factory ---------- */
async function recordStream(stream, chunksArr) {
  const ctx = new AudioContext();
  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);

  let samples = [];
  processor.onaudioprocess = (e) => {
    samples.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  };

  source.connect(processor);
  processor.connect(ctx.destination);

  return {
    stop: async () => {
      processor.disconnect();
      source.disconnect();
      await ctx.close();

      // Flatten samples
      const flat = new Float32Array(samples.reduce((a, b) => a + b.length, 0));
      let offset = 0;
      for (let arr of samples) {
        flat.set(arr, offset);
        offset += arr.length;
      }

      const wavData = encodeWav(flat, 44100);
      chunksArr.push(wavData);
    }
  };
}

/* ---------- Main Flow ---------- */
async function startRecording() {
  statusEl.textContent = 'Status: requesting media permissions...';
  micChunks = [];
  sysChunks = [];
  micRecorder = null;
  sysRecorder = null;

  try {
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micRecorder = await recordStream(micStream, micChunks);

    let sysStream = null;
    try {
      sysStream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: false });
      sysRecorder = await recordStream(sysStream, sysChunks);
    } catch (e) {
      console.warn('System audio capture denied/unavailable:', e);
    }

    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusEl.textContent = 'Status: recording (mic + system if available)...';
  } catch (err) {
    console.error(err);
    statusEl.textContent = 'Status: error obtaining audio: ' + err.message;
  }
}

async function stopRecording() {
  statusEl.textContent = 'Status: stopping recorders...';

  if (micRecorder) await micRecorder.stop();
  if (sysRecorder) await sysRecorder.stop();

  const micFile = micChunks.length > 0 ? new Blob(micChunks, { type: 'audio/wav' }) : null;
  const sysFile = sysChunks.length > 0 ? new Blob(sysChunks, { type: 'audio/wav' }) : null;

  const micPath = micFile ? `mic-${Date.now()}.wav` : null;
  const sysPath = sysFile ? `system-${Date.now()}.wav` : null;

  if (micFile) {
    const buf = new Uint8Array(await micFile.arrayBuffer());
    await window.electronAPI.saveRecording({ filename: micPath, data: buf });
  }
  if (sysFile) {
    const buf = new Uint8Array(await sysFile.arrayBuffer());
    await window.electronAPI.saveRecording({ filename: sysPath, data: buf });
  }

  transcriptEl.textContent = "Transcribing...";
  statusEl.textContent = 'Status: sending to Whisper...';

  const resp = await window.electronAPI.transcribeBoth({ micPath, sysPath });
  if (resp.ok) {
    let text = '';
    if (resp.mic && resp.mic.length > 0) {
      resp.mic.forEach(seg => {
        text += `[${seg[0]} - ${seg[1]}] You: ${seg[2]}\n`;
      });
    }
    if (resp.sys && resp.sys.length > 0) {
      resp.sys.forEach(seg => {
        text += `[${seg[0]} - ${seg[1]}] Other participant: ${seg[2]}\n`;
      });
    }
    transcriptEl.textContent = text || "No speech detected.";
  } else {
    transcriptEl.textContent = "Error: " + resp.error;
  }

  startBtn.disabled = false;
  stopBtn.disabled = true;
  saveBtn.disabled = false;
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

/* ---------- Event bindings ---------- */
startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
saveBtn.addEventListener('click', saveTranscript);
