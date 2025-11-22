const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const saveBtn = document.getElementById('saveBtn');
const statusEl = document.getElementById('status');
const transcriptEl = document.getElementById('transcript');

let micRecorder;
let micChunks = [];
let sysPath = null;

function groupSegmentsToSentences(segments) {
  if (!segments.length) return [];

  const sentences = [];
  let currentSentence = { ...segments[0], text: segments[0].text.trim() };

  for (let i = 1; i < segments.length; i++) {
    const currentSegment = segments[i];
    const trimmedText = currentSegment.text.trim();

    if (currentSentence.speaker !== currentSegment.speaker) {
      sentences.push(currentSentence);
      currentSentence = { ...currentSegment, text: trimmedText };
      continue;
    }

    currentSentence.text += ` ${trimmedText}`;
    currentSentence.endStr = currentSegment.endStr;

    if (trimmedText.match(/[.!?]$/)) {
      sentences.push(currentSentence);
      if (i + 1 < segments.length) {
        currentSentence = { ...segments[i + 1], text: segments[i + 1].text.trim() };
        i++; // Skip the next segment as it's the start of a new sentence
      }
    }
  }
  sentences.push(currentSentence);

  return sentences;
}

/* ---------- WAV Helpers ---------- */
function parseTimestampToMs(timestamp) {
  const parts = timestamp.split(':');
  const secondsParts = parts[2].split('.');
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parseInt(secondsParts[0], 10);
  const ms = parseInt(secondsParts[1], 10);
  return (hours * 3600 + minutes * 60 + seconds) * 1000 + ms;
}

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
  micRecorder = null;
  sysPath = `system-${Date.now()}.wav`; // Set the path here

  try {
    // microphone
    const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    micRecorder = await recordStream(micStream, micChunks);

    // Add a small delay to allow the audio system to stabilize after mic activation
    await new Promise(resolve => setTimeout(resolve, 500));

    // system audio
    console.log('Attempting to start system audio recording...');
    const result = await window.electronAPI.startSysAudio({ filename: sysPath });
    console.log('System audio result:', result);
    if (!result.ok) {
      throw new Error(result.error);
    }

    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusEl.textContent = 'Status: recording (mic + system)...';
  } catch (err) {
    console.error('Recording setup failed:', err);
    statusEl.textContent = 'Status: error obtaining audio: ' + err.message;
    sysPath = null; // Reset path on error
  }
}

async function stopRecording() {
  statusEl.textContent = 'Status: stopping recorders...';

  if (micRecorder) await micRecorder.stop();
  await window.electronAPI.stopSysAudio();

  const micFile = micChunks.length > 0 ? new Blob(micChunks, { type: 'audio/wav' }) : null;
  const micPath = micFile ? `mic-${Date.now()}.wav` : null;

  if (micFile) {
    const buf = new Uint8Array(await micFile.arrayBuffer());
    await window.electronAPI.saveRecording({ filename: micPath, data: buf });
  }

  transcriptEl.textContent = "Transcribing...";
  statusEl.textContent = 'Status: sending to Whisper...';

  // Use the sysPath that was set when the recording started
  const resp = await window.electronAPI.transcribeBoth({ micPath, sysPath });
  if (resp.ok) {
    const combined = [];
    if (resp.mic && resp.mic.length > 0) {
      resp.mic.forEach(seg => {
        combined.push({ 
          startMs: parseTimestampToMs(seg[0]),
          startStr: seg[0],
          endStr: seg[1],
          text: seg[2], 
          speaker: 'You' 
        });
      });
    }
    if (resp.sys && resp.sys.length > 0) {
      resp.sys.forEach(seg => {
        combined.push({ 
          startMs: parseTimestampToMs(seg[0]),
          startStr: seg[0],
          endStr: seg[1],
          text: seg[2], 
          speaker: 'Other' 
        });
      });
    }

    combined.sort((a, b) => a.startMs - b.startMs);

    const sentences = groupSegmentsToSentences(combined);

    let text = sentences.map(seg => `[${seg.startStr} - ${seg.endStr}] ${seg.speaker}: ${seg.text}`).join('\n');
    transcriptEl.textContent = text || "No speech detected.";
  } else {
    transcriptEl.textContent = "Error: " + resp.error;
  }

  startBtn.disabled = false;
  stopBtn.disabled = true;
  saveBtn.disabled = false;
  sysPath = null; // Reset for next recording
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
