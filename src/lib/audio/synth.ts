function env(
  gain: AudioParam,
  t: number,
  peak: number,
  attack: number,
  decay: number,
) {
  const start = 0.0001;
  gain.cancelScheduledValues(t);
  gain.setValueAtTime(start, t);
  gain.exponentialRampToValueAtTime(Math.max(peak, start), t + attack);
  gain.exponentialRampToValueAtTime(start, t + attack + decay);
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(seconds * ctx.sampleRate));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function noiseBurst(
  ctx: BaseAudioContext,
  dest: AudioNode,
  t: number,
  duration: number,
  filterType: BiquadFilterType,
  freq: number,
  q: number,
  peak: number,
  attack: number,
  decay: number,
) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, duration);
  const filter = ctx.createBiquadFilter();
  filter.type = filterType;
  filter.frequency.setValueAtTime(freq, t);
  filter.Q.value = q;
  const gain = ctx.createGain();
  env(gain.gain, t, peak, attack, decay);
  src.connect(filter).connect(gain).connect(dest);
  src.start(t);
  src.stop(t + duration);
}

function shaperCurve(amount: number): Float32Array<ArrayBuffer> {
  const n = 256;
  const curve = new Float32Array(new ArrayBuffer(n * 4));
  const k = amount;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

async function renderMono(
  duration: number,
  build: (ctx: OfflineAudioContext, dest: GainNode) => void,
): Promise<AudioBuffer> {
  const sr = 44100;
  const ctx = new OfflineAudioContext(1, Math.ceil(sr * duration), sr);
  const dest = ctx.createGain();
  dest.gain.value = 1;
  dest.connect(ctx.destination);
  build(ctx, dest);
  return ctx.startRendering();
}

export type SampleId =
  | "kick"
  | "hatClosed"
  | "hatOpen"
  | "clap"
  | "crash"
  | "ha"
  | "ha2"
  | "ha3"
  | "ride"
  | "shaker"
  | "snap"
  | "stab"
  | "work"
  | "serve"
  | "cowbell";

export type SampleBank = Record<SampleId, AudioBuffer>;

function makeKick(ctx: OfflineAudioContext, dest: AudioNode) {
  const t = 0;
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(168, t);
  osc.frequency.exponentialRampToValueAtTime(42, t + 0.09);
  const gain = ctx.createGain();
  env(gain.gain, t, 1, 0.004, 0.42);
  osc.connect(gain).connect(dest);
  osc.start(t);
  osc.stop(t + 0.5);

  const click = ctx.createOscillator();
  click.type = "square";
  click.frequency.setValueAtTime(1900, t);
  const clickGain = ctx.createGain();
  env(clickGain.gain, t, 0.12, 0.001, 0.018);
  const clickFilter = ctx.createBiquadFilter();
  clickFilter.type = "highpass";
  clickFilter.frequency.value = 1200;
  click.connect(clickFilter).connect(clickGain).connect(dest);
  click.start(t);
  click.stop(t + 0.03);
}

function makeHat(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  decay: number,
  peak: number,
) {
  const t = 0;
  const dur = Math.max(0.2, decay + 0.05);
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, dur);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7200;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 10500;
  bp.Q.value = 0.7;
  const gain = ctx.createGain();
  env(gain.gain, t, peak, 0.002, decay);
  src.connect(hp).connect(bp).connect(gain).connect(dest);
  src.start(t);
  src.stop(t + dur);
}

function makeClap(ctx: OfflineAudioContext, dest: AudioNode) {
  const bursts = [0, 0.012, 0.024, 0.041];
  for (const offset of bursts) {
    const peak = offset === 0.041 ? 0.7 : 0.35;
    noiseBurst(
      ctx,
      dest,
      offset,
      0.18,
      "bandpass",
      1800,
      1.1,
      peak,
      0.001,
      0.09,
    );
  }
  noiseBurst(ctx, dest, 0.04, 0.25, "highpass", 2500, 0.7, 0.25, 0.002, 0.18);
}

function makeCrash(ctx: OfflineAudioContext, dest: AudioNode) {
  const t = 0;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 1.6);
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 1800;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 5200;
  bp.Q.value = 0.55;
  const gain = ctx.createGain();
  env(gain.gain, t, 0.85, 0.004, 1.35);
  src.connect(hp).connect(bp).connect(gain).connect(dest);
  src.start(t);
  src.stop(t + 1.6);

  const metals = [3400, 5100, 7800, 11200];
  for (const freq of metals) {
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, t);
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.frequency.value = freq;
    f.Q.value = 14;
    const g = ctx.createGain();
    env(g.gain, t, 0.08, 0.003, 0.9);
    osc.connect(f).connect(g).connect(dest);
    osc.start(t);
    osc.stop(t + 1.1);
  }
}

function formantVowel(
  ctx: OfflineAudioContext,
  dest: AudioNode,
  t: number,
  duration: number,
  pitch: number,
  formants: number[],
  peak: number,
) {
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(pitch, t);
  osc.frequency.exponentialRampToValueAtTime(pitch * 0.78, t + duration * 0.7);

  let node: AudioNode = osc;
  for (const freq of formants) {
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = 8;
    node.connect(bp);
    node = bp;
  }

  const shaper = ctx.createWaveShaper();
  shaper.curve = shaperCurve(2.4);
  const gain = ctx.createGain();
  env(gain.gain, t, peak, 0.012, duration);
  node.connect(shaper).connect(gain).connect(dest);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

function makeHa(ctx: OfflineAudioContext, dest: AudioNode, pitch: number) {
  // Aspirated H then open "ah"
  noiseBurst(ctx, dest, 0, 0.05, "highpass", 2800, 0.6, 0.35, 0.001, 0.04);
  formantVowel(ctx, dest, 0.018, 0.2, pitch, [730, 1090, 2440], 0.55);
}

function makeWork(ctx: OfflineAudioContext, dest: AudioNode) {
  noiseBurst(ctx, dest, 0, 0.04, "bandpass", 1400, 1, 0.2, 0.001, 0.03);
  formantVowel(ctx, dest, 0.02, 0.16, 175, [570, 840, 2410], 0.45);
  noiseBurst(ctx, dest, 0.16, 0.05, "highpass", 4200, 0.8, 0.28, 0.001, 0.04);
}

function makeServe(ctx: OfflineAudioContext, dest: AudioNode) {
  noiseBurst(ctx, dest, 0, 0.06, "highpass", 6200, 0.5, 0.32, 0.001, 0.05);
  formantVowel(ctx, dest, 0.04, 0.22, 190, [550, 1620, 2750], 0.42);
}

function makeRide(ctx: OfflineAudioContext, dest: AudioNode) {
  const t = 0;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 0.7);
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 7600;
  bp.Q.value = 1.4;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 5000;
  const gain = ctx.createGain();
  env(gain.gain, t, 0.32, 0.002, 0.55);
  src.connect(hp).connect(bp).connect(gain).connect(dest);
  src.start(t);
  src.stop(t + 0.7);

  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.value = 9200;
  const g = ctx.createGain();
  env(g.gain, t, 0.04, 0.001, 0.28);
  osc.connect(g).connect(dest);
  osc.start(t);
  osc.stop(t + 0.35);
}

function makeShaker(ctx: OfflineAudioContext, dest: AudioNode) {
  noiseBurst(ctx, dest, 0, 0.12, "highpass", 8000, 0.5, 0.28, 0.001, 0.07);
  noiseBurst(ctx, dest, 0.008, 0.08, "bandpass", 9600, 1.2, 0.18, 0.001, 0.05);
}

function makeSnap(ctx: OfflineAudioContext, dest: AudioNode) {
  noiseBurst(ctx, dest, 0, 0.06, "bandpass", 2200, 2.2, 0.7, 0.001, 0.035);
  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(1800, 0);
  osc.frequency.exponentialRampToValueAtTime(400, 0.03);
  const g = ctx.createGain();
  env(g.gain, 0, 0.25, 0.001, 0.03);
  osc.connect(g).connect(dest);
  osc.start(0);
  osc.stop(0.05);
}

function makeStab(ctx: OfflineAudioContext, dest: AudioNode) {
  // Fm triad
  const freqs = [174.61, 207.65, 261.63];
  for (const freq of freqs) {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(freq, 0);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(2400, 0);
    lp.frequency.exponentialRampToValueAtTime(600, 0.22);
    const g = ctx.createGain();
    env(g.gain, 0, 0.22, 0.006, 0.28);
    osc.connect(lp).connect(g).connect(dest);
    osc.start(0);
    osc.stop(0.4);
  }
}

function makeCowbell(ctx: OfflineAudioContext, dest: AudioNode) {
  const freqs = [587, 845];
  for (const freq of freqs) {
    const osc = ctx.createOscillator();
    osc.type = "square";
    osc.frequency.value = freq;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = freq;
    bp.Q.value = 6;
    const g = ctx.createGain();
    env(g.gain, 0, 0.18, 0.002, 0.22);
    osc.connect(bp).connect(g).connect(dest);
    osc.start(0);
    osc.stop(0.3);
  }
}

export async function renderSamples(): Promise<SampleBank> {
  const [
    kick,
    hatClosed,
    hatOpen,
    clap,
    crash,
    ha,
    ha2,
    ha3,
    ride,
    shaker,
    snap,
    stab,
    work,
    serve,
    cowbell,
  ] = await Promise.all([
    renderMono(0.5, makeKick),
    renderMono(0.18, (c, d) => makeHat(c, d, 0.055, 0.45)),
    renderMono(0.45, (c, d) => makeHat(c, d, 0.32, 0.38)),
    renderMono(0.3, makeClap),
    renderMono(1.6, makeCrash),
    renderMono(0.32, (c, d) => makeHa(c, d, 210)),
    renderMono(0.32, (c, d) => makeHa(c, d, 186)),
    renderMono(0.32, (c, d) => makeHa(c, d, 238)),
    renderMono(0.7, makeRide),
    renderMono(0.14, makeShaker),
    renderMono(0.12, makeSnap),
    renderMono(0.42, makeStab),
    renderMono(0.28, makeWork),
    renderMono(0.32, makeServe),
    renderMono(0.32, makeCowbell),
  ]);

  return {
    kick,
    hatClosed,
    hatOpen,
    clap,
    crash,
    ha,
    ha2,
    ha3,
    ride,
    shaker,
    snap,
    stab,
    work,
    serve,
    cowbell,
  };
}

export const HA_VARIANTS: SampleId[] = ["ha", "ha2", "ha3"];
