/**
 * Original 129 BPM F-minor bed — the pocket of "karma is", not the master.
 * Short looping drop so the ha overlay has a song to sit on
 * until the real file is dropped in.
 */

const BPM = 129;
const BARS = 16;
const SR = 44100;

function envGain(
  param: AudioParam,
  t: number,
  peak: number,
  attack: number,
  hold: number,
  release: number,
) {
  const z = 0.0001;
  param.setValueAtTime(z, t);
  param.exponentialRampToValueAtTime(peak, t + attack);
  param.setValueAtTime(peak, t + attack + hold);
  param.exponentialRampToValueAtTime(z, t + attack + hold + release);
}

export function bedDuration(bpm = BPM) {
  return (BARS * 4 * 60) / bpm;
}

export async function renderBed(bpm = BPM): Promise<AudioBuffer> {
  const duration = bedDuration(bpm);
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * duration), SR);
  const beat = 60 / bpm;
  const bar = beat * 4;

  const master = ctx.createGain();
  master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 3;
  comp.attack.value = 0.003;
  comp.release.value = 0.16;
  master.connect(comp).connect(ctx.destination);

  const padFilter = ctx.createBiquadFilter();
  padFilter.type = "lowpass";
  padFilter.Q.value = 0.6;
  padFilter.frequency.setValueAtTime(900, 0);
  padFilter.frequency.linearRampToValueAtTime(2200, bar * 2);
  padFilter.connect(master);

  const padNotes = [174.61, 207.65, 261.63];
  for (let i = 0; i < padNotes.length; i++) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = padNotes[i]!;
    osc.detune.value = i === 1 ? 6 : -4;
    const g = ctx.createGain();
    g.gain.value = 0.11;
    const pan = ctx.createStereoPanner();
    pan.pan.value = (i - 1) * 0.28;
    osc.connect(g).connect(pan).connect(padFilter);
    osc.start(0);
    osc.stop(duration);
  }

  const sub = ctx.createOscillator();
  sub.type = "sine";
  sub.frequency.value = 43.65;
  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0.12, 0);
  subGain.gain.linearRampToValueAtTime(0.36, bar * 2);
  sub.connect(subGain).connect(master);
  sub.start(0);
  sub.stop(duration);

  const bassNotes = [87.31, 87.31, 82.41, 77.78];
  for (let b = 0; b < BARS; b++) {
    const note = bassNotes[b % 4]!;
    for (const eighth of [1, 3, 5, 7]) {
      const t = b * bar + eighth * (beat / 2);
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(note, t);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(480, t);
      const g = ctx.createGain();
      envGain(g.gain, t, 0.26, 0.01, 0.05, 0.14);
      osc.connect(lp).connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 0.26);
    }
  }

  const chords = [
    [349.23, 415.3, 523.25],
    [349.23, 415.3, 523.25],
    [277.18, 349.23, 415.3],
    [311.13, 392.0, 466.16],
  ];
  for (let b = 0; b < BARS; b++) {
    const t = b * bar;
    for (const freq of chords[b % 4]!) {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(1600, t);
      lp.frequency.exponentialRampToValueAtTime(500, t + 0.28);
      const g = ctx.createGain();
      envGain(g.gain, t, 0.08, 0.006, 0.03, 0.24);
      osc.connect(lp).connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 0.36);
    }
  }

  const hook = [
    { n: 0, f: 523.25 },
    { n: 1, f: 415.3 },
    { n: 2, f: 349.23 },
    { n: 4, f: 415.3 },
    { n: 5, f: 523.25 },
    { n: 6, f: 554.37 },
    { n: 7, f: 523.25 },
  ];
  for (let b = 2; b < BARS; b++) {
    if (b === 6 || b === 7) continue;
    for (const note of hook) {
      const t = b * bar + note.n * beat;
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(note.f, t);
      const g = ctx.createGain();
      envGain(g.gain, t, 0.13, 0.008, 0.07, 0.16);
      const pan = ctx.createStereoPanner();
      pan.pan.value = 0.2;
      osc.connect(g).connect(pan).connect(master);
      osc.start(t);
      osc.stop(t + 0.3);
    }
  }

  const noiseLen = Math.floor(SR * duration);
  const nbuf = ctx.createBuffer(1, noiseLen, SR);
  const nd = nbuf.getChannelData(0);
  for (let i = 0; i < noiseLen; i++) nd[i] = Math.random() * 2 - 1;
  const nsrc = ctx.createBufferSource();
  nsrc.buffer = nbuf;
  const nhp = ctx.createBiquadFilter();
  nhp.type = "highpass";
  nhp.frequency.value = 9000;
  const ng = ctx.createGain();
  ng.gain.value = 0.025;
  nsrc.connect(nhp).connect(ng).connect(master);
  nsrc.start(0);

  return ctx.startRendering();
}

export const BED_BPM = BPM;
export const BED_KEY = "F minor";
export const BED_TITLE = "karma is (ha remix)";
export const BED_ARTIST = "original bed · horsegiirL pocket";
