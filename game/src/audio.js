// Tiny synthesized sound: every effect is an oscillator shaped in code, so the game
// ships no audio files at all. Audio starts on the first user gesture (browsers
// demand it) and M toggles it off.

let ctx = null;
let muted = false;
let master = null;

function ensure() {
  if (ctx) return true;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.16;
    master.connect(ctx.destination);
    return true;
  } catch {
    return false;
  }
}

function tone(freq, dur, type, when, slideTo) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(1, t0 + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export const sound = {
  /** Call on the first key or click so later effects can play. */
  unlock() {
    if (ensure() && ctx.state === 'suspended') ctx.resume().catch(() => {});
  },
  toggleMute() {
    muted = !muted;
    return muted;
  },
  isMuted() {
    return muted;
  },
  pickup() {
    tone(880, 0.12, 'sine', 0);
    tone(1320, 0.18, 'sine', 0.07);
  },
  coin() {
    tone(1500, 0.09, 'triangle', 0);
    tone(1100, 0.12, 'triangle', 0.05);
  },
  spotted() {
    tone(320, 0.22, 'sawtooth', 0, 520);
  },
  caught() {
    tone(220, 0.35, 'sawtooth', 0, 110);
    tone(180, 0.4, 'square', 0.12, 90);
  },
  clear() {
    tone(523, 0.14, 'sine', 0);
    tone(659, 0.14, 'sine', 0.11);
    tone(784, 0.22, 'sine', 0.22);
  },
  win() {
    tone(523, 0.16, 'sine', 0);
    tone(659, 0.16, 'sine', 0.13);
    tone(784, 0.16, 'sine', 0.26);
    tone(1047, 0.3, 'sine', 0.39);
  },
};
