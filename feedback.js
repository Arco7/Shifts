// feedback.js: the little buzz and tick when the time wheel passes a row, and the short buzz of the buttons.
// Vibration works in Chrome on Android (not on iPhone). The tick is made by the code itself (no sound files)
// and plays through the media volume of the phone. Each of them can be switched off in the settings.

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

// ---- the tick: a dry, short click (three quickly fading high tones), drawn once as a sound buffer ----
// [frequency Hz, strength, fade time in seconds]
export const TICK_PARTS = [
  [4050, 1.0, 0.0015],
  [8100, 0.9, 0.0011],
  [11000, 0.8, 0.0009],
];
const TICK_MS = 35;
const TICK_GAIN = 0.18; // how loud the tick is (1 = full scale); the one number to change if it is too quiet or too loud

// the samples of one tick for a given sample rate; the loudest sample is exactly 1
export function makeTickSamples(rate) {
  const n = Math.round((TICK_MS / 1000) * rate);
  const y = new Float32Array(n);
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    let v = 0;
    for (const [f, a, tau] of TICK_PARTS) v += a * Math.exp(-t / tau) * Math.sin(2 * Math.PI * f * t);
    v *= 1 - Math.exp(-t / 0.00015); // a very short attack, so that there is no pop
    y[i] = v;
  }
  const fade = Math.round(0.006 * rate); // the last 6 ms fade to zero
  for (let i = 0; i < fade; i++) y[n - fade + i] *= 1 - i / (fade - 1);
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(y[i]));
  if (peak > 0) for (let i = 0; i < n; i++) y[i] /= peak;
  return y;
}

let tickBuf = null;
function tickBuffer(a) {
  if (tickBuf && tickBuf.sampleRate === a.sampleRate) return tickBuf;
  const samples = makeTickSamples(a.sampleRate);
  tickBuf = a.createBuffer(1, samples.length, a.sampleRate);
  tickBuf.copyToChannel(samples, 0);
  return tickBuf;
}

function tickSound() {
  const a = audioCtx();
  if (!a) return;
  if (a.state === 'suspended') a.resume().catch(() => {});
  try {
    const src = a.createBufferSource();
    const gain = a.createGain();
    src.buffer = tickBuffer(a);
    src.playbackRate.value = 1 + (Math.random() * 2 - 1) * 0.03; // every tick a little different: pitch +-3%
    gain.gain.value = TICK_GAIN * (1 + (Math.random() * 2 - 1) * 0.1); // and loudness +-10%
    src.connect(gain);
    gain.connect(a.destination);
    src.start();
  } catch {
    /* ignore */
  }
}

// a short buzz on a button press (the round "+" and the switches in the settings), if the setting is on
export function press() {
  if (prefs.pressBuzz) buzz(12);
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
