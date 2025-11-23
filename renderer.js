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

async function startRecording() {
  try {
    isRecording = true;
    updateUIState();
    statusEl.textContent = 'Recording...';
    transcriptEl.innerHTML = ''; // Clear previous transcript

    // Start System Audio Recording (streams to server)
    const sysFilename = `sys_audio_${Date.now()}.wav`;
    const sysResult = await window.electronAPI.startSysAudio(sysFilename);

    if (!sysResult.ok) {
      throw new Error('Failed to start system audio recording: ' + sysResult.error);
    }

  } catch (err) {
    console.error('Error starting recording:', err);
    statusEl.textContent = 'Error: ' + err.message;
    isRecording = false;
    updateUIState();
  }
}

async function stopRecording() {
  try {
    isRecording = false;
    updateUIState();
    statusEl.textContent = 'Stopping...';

    // Stop System Audio (stops ffmpeg and streaming)
    await window.electronAPI.stopSysAudio();

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
