const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const saveBtn = document.getElementById('saveBtn');
const statusEl = document.getElementById('status');
const transcriptEl = document.getElementById('transcript');
const systemDeviceSelect = document.getElementById('systemDeviceSelect');
const micDeviceSelect = document.getElementById('micDeviceSelect');
const refreshDevicesBtn = document.getElementById('refreshDevicesBtn');

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
let selectedSystemDeviceId = null;
let selectedMicDeviceId = null;

async function enumerateAudioDevices() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(d => d.kind === 'audioinput');

    // Preserve previous selection if possible
    const prevSystem = selectedSystemDeviceId;
    const prevMic = selectedMicDeviceId;

    systemDeviceSelect.innerHTML = '<option value="">(None / Use display capture)</option>';
    micDeviceSelect.innerHTML = '';

    audioInputs.forEach(d => {
      const opt1 = document.createElement('option');
      opt1.value = d.deviceId;
      opt1.textContent = d.label || 'Audio In';
      systemDeviceSelect.appendChild(opt1);

      const opt2 = document.createElement('option');
      opt2.value = d.deviceId;
      opt2.textContent = d.label || 'Audio In';
      micDeviceSelect.appendChild(opt2);
    });

    // Restore selections if still present
    if (prevSystem) systemDeviceSelect.value = prevSystem;
    if (prevMic) micDeviceSelect.value = prevMic;

    // Default selection
    if (!micDeviceSelect.value && micDeviceSelect.options.length) {
      micDeviceSelect.selectedIndex = 0;
    }
    selectedSystemDeviceId = systemDeviceSelect.value || null;
    selectedMicDeviceId = micDeviceSelect.value || null;
  } catch (e) {
    console.warn('Failed to enumerate audio devices:', e);
  }
}

systemDeviceSelect.addEventListener('change', () => {
  selectedSystemDeviceId = systemDeviceSelect.value || null;
});
micDeviceSelect.addEventListener('change', () => {
  selectedMicDeviceId = micDeviceSelect.value || null;
});
refreshDevicesBtn.addEventListener('click', enumerateAudioDevices);

async function startRecording() {
  try {
    isRecording = true;
    updateUIState();
    statusEl.textContent = 'Initializing audio...';
    transcriptEl.innerHTML = '';
    const platform = window.electronAPI.getPlatform();
    let systemAudioSupported = true;

    // Desktop/system audio capture strategy differs per platform.
    if (platform === 'darwin') {
      // Prefer explicit loopback device selection if provided.
      if (selectedSystemDeviceId) {
        try {
          desktopStream = await navigator.mediaDevices.getUserMedia({
            audio: { deviceId: { exact: selectedSystemDeviceId } },
            video: false
          });
        } catch (e) {
          console.warn('Failed to use selected system device, attempting display capture:', e);
        }
      }
      if (!desktopStream) {
        try {
          desktopStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
          const hasAudioTrack = desktopStream.getAudioTracks().length > 0;
          if (!hasAudioTrack) systemAudioSupported = false;
        } catch (e) {
          console.warn('macOS display media audio failed; system audio unavailable:', e);
          desktopStream = null;
          systemAudioSupported = false;
        }
      }
    } else {
      // Linux/Windows original approach using chromeMediaSource via desktopCapturer.
      const sources = await window.electronAPI.getSources();
      const screenSource = sources.find(s => s.name === 'Entire Screen' || s.name === 'Screen 1') || sources[0];
      if (!screenSource) throw new Error('No screen source found for system audio capture');
      try {
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
      } catch (e) {
        console.warn('Desktop audio capture failed, continuing with mic only:', e);
        desktopStream = null;
        systemAudioSupported = false;
      }
    }

    // Microphone capture (always attempted / selected device if available)
    if (selectedMicDeviceId) {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: { exact: selectedMicDeviceId } }, video: false });
    } else {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    }

    // Set up Audio Context & Mixing
    audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });

    // Create processor (Mono output)
    scriptProcessor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1);

    // Build mixing graph: connect available sources with gain reduction to avoid clipping.
    const muteNode = audioContext.createGain();
    muteNode.gain.value = 0; // Prevent feedback to speakers.
    scriptProcessor.connect(muteNode);
    muteNode.connect(audioContext.destination);

    const mixGainMic = audioContext.createGain();
    mixGainMic.gain.value = 0.7;
    audioInput = audioContext.createMediaStreamSource(micStream);
    audioInput.connect(mixGainMic);
    mixGainMic.connect(scriptProcessor);

    if (desktopStream) {
      const mixGainDesktop = audioContext.createGain();
      mixGainDesktop.gain.value = 0.7;
      desktopInput = audioContext.createMediaStreamSource(desktopStream);
      desktopInput.connect(mixGainDesktop);
      mixGainDesktop.connect(scriptProcessor);
    }

    statusEl.textContent = systemAudioSupported ? 'Recording...' : 'Recording (system audio unavailable on this setup)';
    if (!systemAudioSupported && platform === 'darwin') {
      const notice = document.createElement('div');
      notice.style.fontSize = '12px';
      notice.style.color = '#b45309';
      notice.textContent = 'Tip: For system audio on macOS install a loopback device (e.g. BlackHole) and set it as output.';
      statusEl.appendChild(notice);
    }

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
  } else {
    summaryEl.textContent = "Error generating summary: " + resp.error;
    statusEl.textContent = 'Summary failed';
  }
  summarizeBtn.disabled = false;
}

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

// Initial device population
enumerateAudioDevices();
// Some browsers require an initial getUserMedia call to unlock labels; do a silent mic probe.
navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(() => {
  enumerateAudioDevices();
}).catch(() => {});
