export type SoundName = 'place' | 'win' | 'alert' | 'replay';

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  if (!audioContext) audioContext = new AudioContextCtor();
  return audioContext;
}

function tone(ctx: AudioContext, start: number, frequency: number, duration: number, gainValue: number, type: OscillatorType) {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(gainValue, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

export function playSound(name: SoundName, enabled: boolean) {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();

  const now = ctx.currentTime;
  if (name === 'place') {
    tone(ctx, now, 220, 0.08, 0.08, 'sine');
    tone(ctx, now + 0.015, 138, 0.06, 0.05, 'triangle');
  } else if (name === 'replay') {
    tone(ctx, now, 260, 0.055, 0.045, 'sine');
  } else if (name === 'alert') {
    tone(ctx, now, 560, 0.11, 0.055, 'triangle');
    tone(ctx, now + 0.14, 560, 0.11, 0.045, 'triangle');
  } else {
    tone(ctx, now, 392, 0.12, 0.065, 'sine');
    tone(ctx, now + 0.11, 523.25, 0.16, 0.06, 'sine');
    tone(ctx, now + 0.25, 659.25, 0.2, 0.055, 'triangle');
  }
}
