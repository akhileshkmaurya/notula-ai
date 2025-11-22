const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const saveBtn = document.getElementById('saveBtn');
const statusEl = document.getElementById('status');
const transcriptEl = document.getElementById('transcript');
const sourceSelect = document.getElementById('sourceSelect');
const refreshSourcesBtn = document.getElementById('refreshSourcesBtn');

let sysPath = null;

function groupSegmentsToSentences(segments) {
  if (!segments.length) return [];

  const sentences = [];
  let currentSentence = { ...segments[0], text: segments[0].text.trim() };

  for (let i = 1; i < segments.length; i++) {
    const currentSegment = segments[i];
    const trimmedText = currentSegment.text.trim();

    // Since we don't have speakers anymore, we just group by time or just append?
    // For now, let's keep the logic but assume speaker is always undefined or same.
    // Actually, Whisper might not return speaker labels in this mode easily without diarization.
    // So we just append text.

    currentSentence.text += ` ${trimmedText}`;
    currentSentence.endStr = currentSegment.endStr;

    if (trimmedText.match(/[.!?]$/)) {
      sentences.push(currentSentence);
      if (i + 1 < segments.length) {
        currentSentence = { ...segments[i + 1], text: segments[i + 1].text.trim() };
        i++;
      }
    }
  }
  sentences.push(currentSentence);

  return sentences;
}

function parseTimestampToMs(timestamp) {
  const parts = timestamp.split(':');
  const secondsParts = parts[2].split('.');
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  const seconds = parseInt(secondsParts[0], 10);
  const ms = parseInt(secondsParts[1], 10);
  return (hours * 3600 + minutes * 60 + seconds) * 1000 + ms;
}

/* ---------- Main Flow ---------- */

async function refreshSources() {
  const sources = await window.electronAPI.getSources();
  const currentSelection = sourceSelect.value;

  // Clear existing options except default
  sourceSelect.innerHTML = '<option value="default">System Audio (Default)</option>';

  sources.forEach(source => {
    const option = document.createElement('option');
    option.value = source.id;
    option.textContent = source.name;
    sourceSelect.appendChild(option);
  });

  // Restore selection if it still exists
  if (Array.from(sourceSelect.options).some(opt => opt.value === currentSelection)) {
    sourceSelect.value = currentSelection;
  }
}

async function startRecording() {
  statusEl.textContent = 'Status: starting recording...';
  sysPath = `recording-${Date.now()}.wav`;

  const sourceId = sourceSelect.value;

  try {
    // We no longer record mic in browser. Main process handles mixing.

    console.log(`Attempting to start audio recording (Source: ${sourceId})...`);
    const result = await window.electronAPI.startSysAudio({ filename: sysPath, sourceId });
    console.log('System audio result:', result);
    if (!result.ok) {
      throw new Error(result.error);
    }

    startBtn.disabled = true;
    stopBtn.disabled = false;
    refreshSourcesBtn.disabled = true;
    sourceSelect.disabled = true;
    statusEl.textContent = 'Status: recording (Mixed Audio)...';
  } catch (err) {
    console.error('Recording setup failed:', err);
    statusEl.textContent = 'Status: error starting recording: ' + err.message;
    sysPath = null;
  }
}

async function stopRecording() {
  statusEl.textContent = 'Status: stopping recorder...';

  await window.electronAPI.stopSysAudio();

  transcriptEl.textContent = "Transcribing...";
  statusEl.textContent = 'Status: sending to Whisper...';

  const resp = await window.electronAPI.transcribeBoth({ sysPath });
  if (resp.ok && resp.result) {
    const segments = resp.result.map(seg => ({
      startMs: parseTimestampToMs(seg[0]),
      startStr: seg[0],
      endStr: seg[1],
      text: seg[2]
    }));

    // segments.sort((a, b) => a.startMs - b.startMs); // Already sorted usually

    const sentences = groupSegmentsToSentences(segments);

    let text = sentences.map(seg => `[${seg.startStr} - ${seg.endStr}] ${seg.text}`).join('\n');
    transcriptEl.textContent = text || "No speech detected.";
  } else {
    transcriptEl.textContent = "Error: " + (resp.error || "No result");
  }

  startBtn.disabled = false;
  stopBtn.disabled = true;
  saveBtn.disabled = false;
  refreshSourcesBtn.disabled = false;
  sourceSelect.disabled = false;
  sysPath = null;
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
refreshSourcesBtn.addEventListener('click', refreshSources);

// Initial load
refreshSources();
