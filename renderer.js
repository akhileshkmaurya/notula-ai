const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const saveBtn = document.getElementById('saveBtn');
const statusEl = document.getElementById('status');
const transcriptEl = document.getElementById('transcript');

let sysPath = null;
let isRecording = false;

function updateUIState() {
  startBtn.disabled = isRecording;
  stopBtn.disabled = !isRecording;
  saveBtn.disabled = isRecording;
  summarizeBtn.disabled = isRecording;
  exportPdfBtn.disabled = isRecording;
}

function groupSegmentsToSentences(segments) {
  if (!segments.length) return [];

  const sentences = [];
  let currentSentence = { ...segments[0], text: segments[0].text.trim() };

  for (let i = 1; i < segments.length; i++) {
    const currentSegment = segments[i];
    const trimmedText = currentSegment.text.trim();

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

const summarizeBtn = document.getElementById('summarizeBtn');
const summaryEl = document.getElementById('summary');
const exportPdfBtn = document.getElementById('exportPdfBtn');

// API Key Dialog Elements
const apiKeyDialog = document.getElementById('apiKeyDialog');
const apiKeyInput = document.getElementById('apiKeyInput');
const saveApiKeyBtn = document.getElementById('saveApiKeyBtn');
const settingsBtn = document.getElementById('settingsBtn');

/* ---------- Main Flow ---------- */

// Real-time transcript updates
window.electronAPI.onTranscriptUpdate((text) => {
  // Append new text to the transcript
  const p = document.createElement('p');
  p.textContent = text;
  transcriptEl.appendChild(p);

  // Auto-scroll to bottom
  transcriptEl.scrollTop = transcriptEl.scrollHeight;
});

let audioContext = null;
let scriptProcessor = null;
let micStream = null;
let desktopStream = null;
let audioInput = null;
let desktopInput = null;
let audioBuffer = [];
const SAMPLE_RATE = 16000;
const BUFFER_SIZE = 4096;
const CHUNK_TIME_MS = 10000; // 10 seconds

async function startRecording() {
  try {
    isRecording = true;
    updateUIState();
    statusEl.textContent = 'Initializing audio...';
    transcriptEl.innerHTML = '';

    // 1. Get Desktop Source ID
    const sources = await window.electronAPI.getSources();
    const screenSource = sources.find(s => s.name === 'Entire Screen' || s.name === 'Screen 1') || sources[0];

    if (!screenSource) {
      throw new Error('No screen source found for system audio capture');
    }

    // 2. Capture Desktop Audio
    desktopStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: screenSource.id
        }
      },
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: screenSource.id
        }
      }
    });

    // 3. Capture Microphone
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false
    });

    // 4. Set up Audio Context & Mixing
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });

    // Create sources
    desktopInput = audioContext.createMediaStreamSource(desktopStream);
    audioInput = audioContext.createMediaStreamSource(micStream);

    // Create processor (Mono)
    scriptProcessor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

    // Connect inputs to processor
    // We connect both to the script processor to mix them
    desktopInput.connect(scriptProcessor);
    audioInput.connect(scriptProcessor);

    // Connect processor to destination (needed for it to run, even if we don't output to speakers)
    // BUT: If we connect to destination, user might hear themselves (feedback loop).
    // Solution: Connect to a GainNode with gain 0, then to destination.
    const muteNode = audioContext.createGain();
    muteNode.gain.value = 0;
    scriptProcessor.connect(muteNode);
    muteNode.connect(audioContext.destination);

    statusEl.textContent = 'Recording...';

    // 5. Process Audio
    let chunkBuffer = new Float32Array(0);
    const samplesPerChunk = (SAMPLE_RATE * CHUNK_TIME_MS) / 1000;

    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
      if (!isRecording) return;

      const inputBuffer = audioProcessingEvent.inputBuffer;
      const inputData = inputBuffer.getChannelData(0); // Mono

      // Accumulate buffer
      const newBuffer = new Float32Array(chunkBuffer.length + inputData.length);
      newBuffer.set(chunkBuffer);
      newBuffer.set(inputData, chunkBuffer.length);
      chunkBuffer = newBuffer;

      // Check if we have enough for a chunk
      if (chunkBuffer.length >= samplesPerChunk) {
        const chunkToSend = chunkBuffer.slice(0, samplesPerChunk);
        chunkBuffer = chunkBuffer.slice(samplesPerChunk);

        // Convert Float32 to Int16 PCM
        const pcmData = convertFloat32ToInt16(chunkToSend);

        // Send to Main
        window.electronAPI.uploadAudioChunk(pcmData.buffer);
      }
    };

  } catch (err) {
    console.error('Error starting recording:', err);
    statusEl.textContent = 'Error: ' + err.message;
    isRecording = false;
    updateUIState();
    stopRecording(); // Cleanup
  }
}

function convertFloat32ToInt16(float32Array) {
  const int16Array = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    let s = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }
  return int16Array;
}

async function stopRecording() {
  try {
    isRecording = false;
    updateUIState();
    statusEl.textContent = 'Stopping...';

    // Disconnect and close everything
    if (scriptProcessor) {
      scriptProcessor.disconnect();
      scriptProcessor.onaudioprocess = null;
      scriptProcessor = null;
    }

    if (audioInput) {
      audioInput.disconnect();
      audioInput = null;
    }

    if (desktopInput) {
      desktopInput.disconnect();
      desktopInput = null;
    }

    if (micStream) {
      micStream.getTracks().forEach(track => track.stop());
      micStream = null;
    }

    if (desktopStream) {
      desktopStream.getTracks().forEach(track => track.stop());
      desktopStream = null;
    }

    if (audioContext) {
      await audioContext.close();
      audioContext = null;
    }

    statusEl.textContent = 'Meeting Ended';

  } catch (err) {
    console.error('Error stopping recording:', err);
    statusEl.textContent = 'Error: ' + err.message;
  }
}

async function saveTranscript() {
  const content = transcriptEl.textContent;
  const filename = 'transcript-' + Date.now() + '.txt';
  const resp = await window.electronAPI.saveTranscript({ filename, content });
  if (resp.ok) {
    statusEl.textContent = 'Saved to ' + resp.path;
  } else {
    statusEl.textContent = 'Save failed: ' + resp.error;
  }
}

async function summarizeMeeting() {
  const transcript = transcriptEl.textContent;

  if (!transcript || transcript === "No speech detected.") {
    alert("No transcript to summarize!");
    return;
  }

  statusEl.textContent = 'Generating summary...';
  summaryEl.innerHTML = "<em>Generating summary...</em>"; // Use innerHTML for styling
  summarizeBtn.disabled = true;
  exportPdfBtn.disabled = true;

  const resp = await window.electronAPI.summarizeMeeting(transcript);

  if (resp.ok) {
    // Parse Markdown to HTML Details
    const formattedHtml = formatSummaryToHtml(resp.summary);
    summaryEl.innerHTML = formattedHtml;
    statusEl.textContent = 'Summary generated';
    exportPdfBtn.disabled = false;
  } else if (resp.error === 'MISSING_API_KEY') {
    statusEl.textContent = 'API Key required';
    apiKeyDialog.showModal();
  } else {
    summaryEl.textContent = "Error generating summary: " + resp.error;
    statusEl.textContent = 'Summary failed';
  }
  summarizeBtn.disabled = false;
}

// API Key Dialog Handler
apiKeyDialog.addEventListener('close', async () => {
  if (apiKeyDialog.returnValue === 'save') {
    const key = apiKeyInput.value.trim();
    if (key) {
      const result = await window.electronAPI.saveApiKey(key);
      if (result.ok) {
        // If triggered by missing key error, retry summarization
        if (statusEl.textContent === 'API Key required') {
          summarizeMeeting();
        } else {
          alert('API Key saved successfully!');
        }
      } else {
        alert('Failed to save API key: ' + result.error);
      }
    }
  }
});

// Settings Button Handler
settingsBtn.addEventListener('click', async () => {
  const result = await window.electronAPI.getApiKey();
  if (result.ok && result.key) {
    apiKeyInput.value = result.key;
  } else {
    apiKeyInput.value = '';
  }
  apiKeyDialog.showModal();
});

function formatSummaryToHtml(markdown) {
  // Simple parser for the specific structure we requested
  // We expect ## Headers

  const sections = markdown.split('## ').filter(s => s.trim());
  let html = '';

  sections.forEach(section => {
    const lines = section.split('\n');
    const title = lines[0].trim();
    const content = lines.slice(1).join('\n').trim();

    // Convert bullets
    const contentHtml = content
      .split('\n')
      .map(line => {
        if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
          return `<li>${line.trim().substring(2)}</li>`;
        }
        return line.trim() ? `<p>${line}</p>` : '';
      })
      .join('');

    // Determine class based on title
    let className = '';
    if (title.toLowerCase().includes('executive')) className = 'executive-summary';
    else if (title.toLowerCase().includes('action')) className = 'action-items';
    else if (title.toLowerCase().includes('decision')) className = 'decisions';

    html += `
      <details class="${className}" open>
        <summary>${title}</summary>
        <div class="content">
          ${contentHtml.includes('<li>') ? `<ul>${contentHtml}</ul>` : contentHtml}
        </div>
      </details>
    `;
  });

  return html || markdown; // Fallback if parsing fails
}

async function exportPdf() {
  const htmlContent = summaryEl.innerHTML;
  if (!htmlContent) return;

  statusEl.textContent = 'Exporting PDF...';
  const resp = await window.electronAPI.saveSummaryPdf({ htmlContent });

  if (resp.ok && resp.path) {
    statusEl.textContent = 'PDF saved to ' + resp.path;
  } else if (resp.error !== 'Cancelled') {
    statusEl.textContent = 'PDF export failed: ' + resp.error;
  } else {
    statusEl.textContent = 'PDF export cancelled';
  }
}

/* ---------- Event bindings ---------- */
startBtn.addEventListener('click', startRecording);
stopBtn.addEventListener('click', stopRecording);
saveBtn.addEventListener('click', saveTranscript);
summarizeBtn.addEventListener('click', summarizeMeeting);
exportPdfBtn.addEventListener('click', exportPdf);
document.getElementById('logoutBtn').addEventListener('click', () => {
  if (confirm('Are you sure you want to sign out?')) {
    window.electronAPI.logout();
  }
});
