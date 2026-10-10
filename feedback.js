// feedback.js: the little buzz and tick when the time wheel passes a row.
// Vibration works in Chrome on Android (not on iPhone). The tick is made by the code itself (no sound files)
// and plays through the media volume of the phone. Both can be switched off in the settings.

import { prefs } from './prefs.js';

const MIN_GAP_MS = 30; // a fast scroll must not turn into one long buzz
let lastAt = 0;
let audio = null;

function audioCtx() {
  if (audio) return audio;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  try {
    audio = new AC();
  } catch {
    audio = null;
  }
  return audio;
}

// Call straight from a tap (a browser allows sound only after a touch): makes the sound engine ready.
export function prime() {
  if (!prefs.sound) return;
  const a = audioCtx();
  if (a && a.state === 'suspended') a.resume().catch(() => {});
}

function buzz(ms) {
  try {
    if (typeof navigator.vibrate === 'function') navigator.vibrate(ms);
  } catch {
    /* ignore */
  }
}

function tickSound() {
  const a = audioCtx();
  if (!a) return;
  if (a.state === 'suspended') a.resume().catch(() => {});
  try {
    const t = a.currentTime;
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1500, t);
    osc.frequency.exponentialRampToValueAtTime(700, t + 0.025);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    osc.connect(gain);
    gain.connect(a.destination);
    osc.start(t);
    osc.stop(t + 0.04);
  } catch {
    /* ignore */
  }
}

// the wheel moved to the next row
export function tick({ force = false } = {}) {
  if (!force && !prefs.vibrate && !prefs.sound) return;
  const now = Date.now();
  if (!force && now - lastAt < MIN_GAP_MS) return;
  lastAt = now;
  if (force || prefs.vibrate) buzz(10);
  if (force || prefs.sound) tickSound();
}

// a sample, for the moment the user switches the buzz or the tick on in the settings
export function sample(kind) {
  if (kind === 'vibrate') buzz(10);
  else if (kind === 'sound') {
    prime();
    tickSound();
  }
}
