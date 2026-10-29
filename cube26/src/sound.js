const FACE_PITCH = { U: 392, R: 330, F: 294, D: 247, L: 262, B: 349 };
const LEVEL = 0.5;

export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noise = null;
    this.muted = false;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    try {
      this.ctx = new AudioCtx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : LEVEL;
      this.master.connect(this.ctx.destination);
      const length = Math.floor(this.ctx.sampleRate * 0.09);
      const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.4);
      }
      this.noise = buffer;
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : LEVEL, this.ctx.currentTime, 0.02);
    }
  }

  move(token, { soft = false } = {}) {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx;
    const now = ctx.currentTime + 0.001;
    const pitch = FACE_PITCH[token[0]] || 330;
    const half = token.includes('2');
    const gain = soft ? 0.032 : 0.055;

    const noise = ctx.createBufferSource();
    noise.buffer = this.noise;
    const band = ctx.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1500 + Math.random() * 900;
    band.Q.value = 0.9;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(soft ? 0.04 : 0.065, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
    noise.connect(band).connect(noiseGain).connect(this.master);
    noise.start(now);
    noise.stop(now + 0.07);

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    const base = pitch * (half ? 0.82 : 1);
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.exponentialRampToValueAtTime(base * 0.7, now + 0.07);
    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.0001, now);
    oscGain.gain.exponentialRampToValueAtTime(gain, now + 0.006);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    osc.connect(oscGain).connect(this.master);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  chime() {
    if (!this.ctx || this.muted) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((frequency, index) => {
      const at = this.ctx.currentTime + 0.02 + index * 0.09;
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.055, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.55);
      osc.connect(gain).connect(this.master);
      osc.start(at);
      osc.stop(at + 0.6);
    });
  }
}
