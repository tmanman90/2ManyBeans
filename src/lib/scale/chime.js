// Short chimes for "pour target reached". Web Audio, so no sound files. The
// context is unlocked from a tap (Tare or Start timer now), as WKWebView
// requires a user gesture before audio plays.

let context = null;

export function unlockChime() {
  try {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContext) return;
    context ||= new AudioContext();
    if (context.state === 'suspended') context.resume().catch(() => {});
  } catch { /* No sound; the haptic still fires. */ }
}

function tone(frequency, startAt, duration) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(0.35, startAt + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

// One note for a pour target, a rising pair for the last one.
export function playChime(final = false) {
  if (!context || context.state !== 'running') return;
  try {
    const now = context.currentTime;
    tone(880, now, 0.35);
    if (final) tone(1318.5, now + 0.16, 0.5);
  } catch { /* No sound; the haptic still fires. */ }
}
