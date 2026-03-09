// popup.js — CamVlog recorder logic

const preview     = document.getElementById('preview');
const placeholder = document.getElementById('placeholder');
const btnRecord   = document.getElementById('btnRecord');
const btnStop     = document.getElementById('btnStop');
const recBadge    = document.getElementById('recBadge');
const logoDot     = document.getElementById('logoDot');
const timerEl     = document.getElementById('timer');
const downloadArea= document.getElementById('downloadArea');
const btnDownload = document.getElementById('btnDownload');
const downloadMeta= document.getElementById('downloadMeta');
const statusEl    = document.getElementById('status');

let mediaStream   = null;
let recorder      = null;
let chunks        = [];
let timerInterval = null;
let elapsedSeconds= 0;
let recordingBlob = null;

// ── Helpers ──────────────────────────────────────────────

function formatTime(seconds) {
  const m = String(Math.floor(seconds / 60)).padStart(2, '0');
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function formatBytes(bytes) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function setStatus(msg) {
  statusEl.textContent = msg;
}

function startTimer() {
  elapsedSeconds = 0;
  timerEl.textContent = formatTime(0);
  timerEl.classList.add('active');
  timerInterval = setInterval(() => {
    elapsedSeconds++;
    timerEl.textContent = formatTime(elapsedSeconds);
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  timerEl.classList.remove('active');
}

function setRecordingUI(isRecording) {
  btnRecord.disabled = isRecording;
  btnStop.disabled   = !isRecording;
  recBadge.classList.toggle('visible', isRecording);
  logoDot.classList.toggle('recording', isRecording);
}

// ── Camera init ──────────────────────────────────────────

async function initCamera() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
      audio: true,
    });

    preview.srcObject = mediaStream;
    placeholder.style.display = 'none';
    btnRecord.disabled = false;
    setStatus('Ready to record');

    // Notify background of camera readiness
    chrome.runtime.sendMessage({ type: 'SET_RECORDING_STATE', payload: { isRecording: false } });

  } catch (err) {
    if (err.name === 'NotAllowedError') {
      setStatus('Camera permission denied — check browser settings');
    } else if (err.name === 'NotFoundError') {
      setStatus('No camera found on this device');
    } else {
      setStatus(`Error: ${err.message}`);
    }
    console.error('CamVlog camera error:', err);
  }
}

// ── Recording ────────────────────────────────────────────

function startRecording() {
  if (!mediaStream) return;

  chunks = [];
  recordingBlob = null;
  downloadArea.classList.remove('visible');

  // Pick best supported format
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : 'video/webm';

  recorder = new MediaRecorder(mediaStream, { mimeType });

  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  recorder.onstop = () => {
    recordingBlob = new Blob(chunks, { type: 'video/webm' });
    const url = URL.createObjectURL(recordingBlob);
    const filename = `camvlog-${new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-')}.webm`;

    btnDownload.href = url;
    btnDownload.download = filename;
    downloadMeta.textContent = `${formatTime(elapsedSeconds)} · ${formatBytes(recordingBlob.size)} · .webm`;
    downloadArea.classList.add('visible');
    setStatus('Done! Save your recording below.');

    chrome.runtime.sendMessage({ type: 'SET_RECORDING_STATE', payload: { isRecording: false, startTime: null } });
  };

  recorder.start(1000); // collect data every 1s
  startTimer();
  setRecordingUI(true);
  setStatus('Recording…');

  chrome.runtime.sendMessage({
    type: 'SET_RECORDING_STATE',
    payload: { isRecording: true, startTime: Date.now() }
  });
}

function stopRecording() {
  if (recorder && recorder.state !== 'inactive') {
    recorder.stop();
  }
  stopTimer();
  setRecordingUI(false);
}

// ── Event listeners ──────────────────────────────────────

btnRecord.addEventListener('click', startRecording);
btnStop.addEventListener('click', stopRecording);

// Restore timer if popup was re-opened mid-recording
chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATE' }, (state) => {
  if (state && state.isRecording && state.startTime) {
    const alreadyElapsed = Math.floor((Date.now() - state.startTime) / 1000);
    elapsedSeconds = alreadyElapsed;
    timerEl.textContent = formatTime(alreadyElapsed);
    timerEl.classList.add('active');
    timerInterval = setInterval(() => {
      elapsedSeconds++;
      timerEl.textContent = formatTime(elapsedSeconds);
    }, 1000);
    setRecordingUI(true);
    setStatus('Recording in progress…');
  }
});

// ── Boot ─────────────────────────────────────────────────

initCamera();
