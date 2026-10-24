import {
  HA_VARIANTS,
  renderSamples,
  type SampleBank,
  type SampleId,
} from "./synth";
import { BED_BPM, BED_TITLE, renderBed } from "./bed";
import {
  PATTERNS,
  type LayerId,
  type PatternId,
} from "./patterns";

export type PadId =
  | "ha"
  | "crash"
  | "hatClosed"
  | "hatOpen"
  | "dip"
  | "clap"
  | "kick"
  | "snap"
  | "ride"
  | "stab"
  | "work"
  | "serve";

export const PADS: {
  id: PadId;
  label: string;
  hint: string;
  key: string;
  sample: SampleId | "dip";
}[] = [
  { id: "ha", label: "HA", hint: "The DNA", key: "1", sample: "ha" },
  { id: "crash", label: "Crash", hint: "Dip cue", key: "2", sample: "crash" },
  { id: "hatClosed", label: "Hat", hint: "Closed", key: "3", sample: "hatClosed" },
  { id: "hatOpen", label: "Open", hint: "Open hat", key: "4", sample: "hatOpen" },
  { id: "dip", label: "Dip", hint: "Crash + HA", key: "Q", sample: "dip" },
  { id: "clap", label: "Clap", hint: "2 and 4", key: "W", sample: "clap" },
  { id: "kick", label: "Kick", hint: "Floor", key: "E", sample: "kick" },
  { id: "snap", label: "Snap", hint: "Tight", key: "R", sample: "snap" },
  { id: "ride", label: "Ride", hint: "Sparkle", key: "A", sample: "ride" },
  { id: "stab", label: "Stab", hint: "Fm hit", key: "S", sample: "stab" },
  { id: "work", label: "Work", hint: "Call", key: "D", sample: "work" },
  { id: "serve", label: "Serve", hint: "Call", key: "F", sample: "serve" },
];

export type EngineSnapshot = {
  ready: boolean;
  playing: boolean;
  bpm: number;
  currentTime: number;
  duration: number;
  haOn: boolean;
  pattern: PatternId;
  layers: Record<LayerId, boolean>;
  songVol: number;
  overlayVol: number;
  masterVol: number;
  trackName: string;
  usingBed: boolean;
  recording: boolean;
  beat: number;
  bar: number;
  step: number;
  lastPad: PadId | null;
  lastPadAt: number;
};

const DEFAULT_LAYERS: Record<LayerId, boolean> = {
  kick: true,
  hatClosed: true,
  hatOpen: true,
  clap: true,
  crashHa: true,
  ride: false,
  shaker: true,
};

type Listener = (s: EngineSnapshot) => void;

function curve(v: number) {
  return v * v;
}

class FloorEngine {
  private ctx: AudioContext | null = null;
  private samples: SampleBank | null = null;
  private bed: AudioBuffer | null = null;
  private song: AudioBuffer | null = null;
  private songName = BED_TITLE;
  private usingBed = true;

  private master: GainNode | null = null;
  private songGain: GainNode | null = null;
  private duckGain: GainNode | null = null;
  private overlayGain: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private recDest: MediaStreamAudioDestinationNode | null = null;
  private recorder: MediaRecorder | null = null;
  private recChunks: Blob[] = [];

  private playing = false;
  private ready = false;
  private haOn = true;
  private pattern: PatternId = "classic";
  private layers: Record<LayerId, boolean> = { ...DEFAULT_LAYERS };
  private bpm = BED_BPM;
  private songVol = 0.72;
  private overlayVol = 0.82;
  private masterVol = 0.9;
  private loop = true;
  private quantize = true;

  private songSource: AudioBufferSourceNode | null = null;
  private origin = 0;
  private pausedAt = 0;
  private timer: number | null = null;
  private nextStep = 0;
  private nextStepTime = 0;
  private haIndex = 0;
  private lastPad: PadId | null = null;
  private lastPadAt = 0;
  private recording = false;

  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => this.listeners.delete(fn);
  }

  private emit() {
    const snap = this.snapshot();
    for (const fn of this.listeners) fn(snap);
  }

  snapshot(): EngineSnapshot {
    const duration = this.activeBuffer()?.duration ?? 0;
    const currentTime = this.nowPos();
    const spb = 60 / this.bpm;
    const totalBeats = currentTime / spb;
    return {
      ready: this.ready,
      playing: this.playing,
      bpm: this.bpm,
      currentTime,
      duration,
      haOn: this.haOn,
      pattern: this.pattern,
      layers: { ...this.layers },
      songVol: this.songVol,
      overlayVol: this.overlayVol,
      masterVol: this.masterVol,
      trackName: this.songName,
      usingBed: this.usingBed,
      recording: this.recording,
      beat: Math.floor(totalBeats) % 4,
      bar: Math.floor(totalBeats / 4),
      step: Math.floor(totalBeats * 4) % 16,
      lastPad: this.lastPad,
      lastPadAt: this.lastPadAt,
    };
  }

  getAnalyser() {
    return this.analyser;
  }

  getPeaks(): Float32Array | null {
    const buf = this.activeBuffer();
    if (!buf) return null;
    const ch = buf.getChannelData(0);
    const buckets = 600;
    const size = Math.floor(ch.length / buckets);
    const peaks = new Float32Array(buckets);
    for (let i = 0; i < buckets; i++) {
      let m = 0;
      const start = i * size;
      for (let j = 0; j < size; j++) {
        const v = Math.abs(ch[start + j] ?? 0);
        if (v > m) m = v;
      }
      peaks[i] = m;
    }
    return peaks;
  }

  private activeBuffer() {
    return this.usingBed ? this.bed : this.song;
  }

  private nowPos() {
    if (!this.ctx) return this.pausedAt;
    if (!this.playing) return this.pausedAt;
    const dur = this.activeBuffer()?.duration ?? 0;
    let t = this.ctx.currentTime - this.origin;
    if (this.loop && dur > 0) t = t % dur;
    return Math.max(0, t);
  }

  async unlock() {
    if (this.ready) {
      if (this.ctx?.state === "suspended") await this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: "interactive" });
    if (this.ctx.state === "suspended") await this.ctx.resume();

    this.master = this.ctx.createGain();
    this.master.gain.value = curve(this.masterVol);
    this.songGain = this.ctx.createGain();
    this.songGain.gain.value = curve(this.songVol);
    this.duckGain = this.ctx.createGain();
    this.duckGain.gain.value = 1;
    this.overlayGain = this.ctx.createGain();
    this.overlayGain.gain.value = curve(this.overlayVol);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.recDest = this.ctx.createMediaStreamDestination();

    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.12;

    this.songGain.connect(this.duckGain).connect(this.master);
    this.overlayGain.connect(this.master);
    this.master.connect(comp);
    comp.connect(this.analyser);
    this.analyser.connect(this.ctx.destination);
    this.analyser.connect(this.recDest);

    this.samples = await renderSamples();
    this.bed = await renderBed(this.bpm);
    this.ready = true;
    this.emit();
  }

  play() {
    if (!this.ctx || !this.ready) return;
    if (this.ctx.state === "suspended") void this.ctx.resume();
    if (this.playing) return;
    const buf = this.activeBuffer();
    if (!buf) return;

    this.songSource = this.ctx.createBufferSource();
    this.songSource.buffer = buf;
    this.songSource.loop = this.loop;
    this.songSource.connect(this.songGain!);
    const offset = Math.min(this.pausedAt, Math.max(0, buf.duration - 0.01));
    this.origin = this.ctx.currentTime - offset;
    this.songSource.start(0, offset);
    this.songSource.onended = () => {
      if (!this.loop && this.playing) {
        this.stop();
      }
    };

    this.playing = true;
    this.armScheduler(offset);
    this.emit();
  }

  pause() {
    if (!this.playing) return;
    this.pausedAt = this.nowPos();
    this.killSource();
    this.playing = false;
    this.clearTimer();
    this.emit();
  }

  stop() {
    this.killSource();
    this.playing = false;
    this.pausedAt = 0;
    this.nextStep = 0;
    this.clearTimer();
    this.emit();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(ratio: number) {
    const dur = this.activeBuffer()?.duration ?? 0;
    const was = this.playing;
    this.pause();
    this.pausedAt = Math.max(0, Math.min(dur, ratio * dur));
    if (was) this.play();
    else this.emit();
  }

  setBpm(bpm: number) {
    this.bpm = Math.max(80, Math.min(180, bpm));
    if (this.playing) this.armScheduler(this.nowPos());
    this.emit();
  }

  setHaOn(on: boolean) {
    this.haOn = on;
    this.emit();
  }

  setPattern(id: PatternId) {
    this.pattern = id;
    if (id === "hats") {
      this.layers.kick = false;
      this.layers.clap = false;
    }
    this.emit();
  }

  setLayer(id: LayerId, on: boolean) {
    this.layers[id] = on;
    this.emit();
  }

  setSongVol(v: number) {
    this.songVol = v;
    this.songGain?.gain.setTargetAtTime(curve(v), this.ctx?.currentTime ?? 0, 0.03);
    this.emit();
  }

  setOverlayVol(v: number) {
    this.overlayVol = v;
    this.overlayGain?.gain.setTargetAtTime(curve(v), this.ctx?.currentTime ?? 0, 0.03);
    this.emit();
  }

  setMasterVol(v: number) {
    this.masterVol = v;
    this.master?.gain.setTargetAtTime(curve(v), this.ctx?.currentTime ?? 0, 0.03);
    this.emit();
  }

  setLoop(on: boolean) {
    this.loop = on;
    if (this.songSource) this.songSource.loop = on;
    this.emit();
  }

  isLoop() {
    return this.loop;
  }

  async loadFile(file: File) {
    if (!this.ctx) await this.unlock();
    const arr = await file.arrayBuffer();
    const buf = await this.ctx!.decodeAudioData(arr.slice(0));
    const was = this.playing;
    this.stop();
    this.song = buf;
    this.usingBed = false;
    this.songName = file.name.replace(/\.[^.]+$/, "");
    this.pattern = "hats";
    this.layers = {
      ...DEFAULT_LAYERS,
      kick: false,
      clap: false,
      ride: false,
    };
    this.loop = true;
    this.pausedAt = 0;
    this.emit();
    if (was) this.play();
  }

  useBed() {
    const was = this.playing;
    this.stop();
    this.usingBed = true;
    this.songName = BED_TITLE;
    this.pattern = "classic";
    this.layers = { ...DEFAULT_LAYERS };
    this.bpm = BED_BPM;
    this.loop = true;
    this.pausedAt = 0;
    this.emit();
    if (was) this.play();
  }

  trigger(pad: PadId, when?: number) {
    if (!this.ctx || !this.samples || !this.overlayGain) return;
    const t = when ?? this.ctx.currentTime;
    const playAt = this.quantize && this.playing ? this.nextQuantized(t) : t;
    if (pad === "dip") {
      this.fire("crash", playAt, 1);
      this.fireHa(playAt, 1);
    } else if (pad === "ha") {
      this.fireHa(playAt, 1);
    } else {
      const meta = PADS.find((p) => p.id === pad);
      if (!meta || meta.sample === "dip") return;
      this.fire(meta.sample, playAt, 1);
    }
    this.lastPad = pad;
    this.lastPadAt = performance.now();
    this.emit();
  }

  private nextQuantized(t: number) {
    const step = 60 / this.bpm / 4;
    const elapsed = t - this.origin;
    const n = Math.ceil(elapsed / step + 0.0001);
    return this.origin + n * step;
  }

  private fireHa(when: number, vel: number) {
    const id = HA_VARIANTS[this.haIndex % HA_VARIANTS.length]!;
    this.haIndex++;
    this.fire(id, when, vel);
  }

  private fire(id: SampleId, when: number, vel: number, dest?: AudioNode) {
    if (!this.ctx || !this.samples) return;
    const buf = this.samples[id];
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vel, when);
    src.connect(g).connect(dest ?? this.overlayGain!);
    src.start(when);
    src.onended = () => {
      src.disconnect();
      g.disconnect();
    };
  }

  private armScheduler(offset: number) {
    if (!this.ctx) return;
    const stepLen = 60 / this.bpm / 4;
    const elapsedSteps = Math.floor(offset / stepLen);
    this.nextStep = elapsedSteps;
    this.nextStepTime = this.origin + elapsedSteps * stepLen;
    this.clearTimer();
    this.tick();
    this.timer = window.setInterval(() => this.tick(), 25);
  }

  private tick() {
    if (!this.ctx || !this.playing) return;
    const horizon = this.ctx.currentTime + 0.18;
    const stepLen = 60 / this.bpm / 4;
    const pattern = PATTERNS[this.pattern];
    while (this.nextStepTime < horizon) {
      const step = ((this.nextStep % 16) + 16) % 16;
      const t = this.nextStepTime;
      if (this.haOn && t >= this.ctx.currentTime - 0.02) {
        this.scheduleStep(pattern, step, t);
      }
      this.nextStep += 1;
      this.nextStepTime += stepLen;
    }
  }

  private scheduleStep(
    pattern: (typeof PATTERNS)[PatternId],
    step: number,
    t: number,
  ) {
    const jitter = (amp: number) => 1 - amp / 2 + Math.random() * amp;
    if (this.layers.kick && pattern.kick[step]) {
      this.fire("kick", t, jitter(0.04));
      this.duck(t);
    }
    if (this.layers.hatClosed && pattern.hatClosed[step]) {
      this.fire("hatClosed", t, 0.7 * jitter(0.1));
    }
    if (this.layers.hatOpen && pattern.hatOpen[step]) {
      this.fire("hatOpen", t, 0.75);
    }
    if (this.layers.clap && pattern.clap[step]) {
      this.fire("clap", t, 0.85);
    }
    if (this.layers.ride && pattern.ride[step]) {
      this.fire("ride", t, 0.55);
    }
    if (this.layers.shaker && pattern.shaker[step]) {
      this.fire("shaker", t, 0.45 * jitter(0.12));
    }
    if (this.layers.crashHa && pattern.crashHa[step]) {
      this.fire("crash", t, 0.95);
      this.fireHa(t, 0.95);
      this.duck(t, 0.55, 0.04);
    }
  }

  private duck(t: number, depth = 0.42, hold = 0.07) {
    if (!this.duckGain || !this.ctx) return;
    const g = this.duckGain.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(depth, t + 0.02);
    g.linearRampToValueAtTime(1, t + 0.02 + hold + 0.14);
  }

  async startRecord() {
    if (!this.recDest) return;
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "";
    this.recChunks = [];
    this.recorder = new MediaRecorder(
      this.recDest.stream,
      mime ? { mimeType: mime } : undefined,
    );
    this.recorder.ondataavailable = (e) => {
      if (e.data.size) this.recChunks.push(e.data);
    };
    this.recorder.start();
    this.recording = true;
    this.emit();
  }

  async stopRecordAsync(): Promise<Blob | null> {
    const rec = this.recorder;
    if (!rec || rec.state === "inactive") {
      this.recording = false;
      this.emit();
      return null;
    }
    return new Promise((resolve) => {
      rec.onstop = () => {
        const type = rec.mimeType || "audio/webm";
        const blob = new Blob(this.recChunks, { type });
        this.recording = false;
        this.recorder = null;
        this.emit();
        resolve(blob);
      };
      rec.stop();
    });
  }

  private killSource() {
    if (this.songSource) {
      try {
        this.songSource.onended = null;
        this.songSource.stop();
      } catch {
        /* already stopped */
      }
      try {
        this.songSource.disconnect();
      } catch {
        /* noop */
      }
      this.songSource = null;
    }
  }

  private clearTimer() {
    if (this.timer != null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }
}

export const floorEngine = new FloorEngine();
