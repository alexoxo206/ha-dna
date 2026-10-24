import { useCallback, useEffect, useRef, useState } from "react";
import {
  Pause,
  Play,
  Square,
  Circle,
  Upload,
  RotateCcw,
  Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn, formatTime } from "@/lib/utils";
import {
  floorEngine,
  PADS,
  type EngineSnapshot,
  type PadId,
} from "@/lib/audio/engine";
import {
  LAYER_LABELS,
  PATTERN_META,
  type LayerId,
  type PatternId,
} from "@/lib/audio/patterns";

const PATTERNS: PatternId[] = ["hats", "classic", "femDip", "allure"];
const LAYER_ORDER: LayerId[] = [
  "crashHa",
  "hatClosed",
  "hatOpen",
  "shaker",
  "clap",
  "kick",
  "ride",
];

export function HaFloor() {
  const [snap, setSnap] = useState<EngineSnapshot>(() => floorEngine.snapshot());
  const [warming, setWarming] = useState(false);
  const [drag, setDrag] = useState(false);
  const [recUrl, setRecUrl] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => floorEngine.subscribe(setSnap), []);

  useEffect(() => {
    if (!snap.playing && !snap.recording) return;
    let raf = 0;
    const loop = () => {
      setSnap(floorEngine.snapshot());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [snap.playing, snap.recording]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.code === "Space") {
        e.preventDefault();
        void handlePlay();
        return;
      }
      const key = e.key.toUpperCase();
      const pad = PADS.find((p) => p.key === key);
      if (pad) {
        e.preventDefault();
        void ensureReady().then(() => floorEngine.trigger(pad.id));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const ensureReady = useCallback(async () => {
    if (snap.ready) {
      await floorEngine.unlock();
      return;
    }
    setWarming(true);
    try {
      await floorEngine.unlock();
    } finally {
      setWarming(false);
    }
  }, [snap.ready]);

  async function handlePlay() {
    await ensureReady();
    floorEngine.toggle();
  }

  async function onFiles(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    await ensureReady();
    await floorEngine.loadFile(file);
  }

  async function onRecord() {
    await ensureReady();
    if (snap.recording) {
      const blob = await floorEngine.stopRecordAsync();
      if (blob) {
        if (recUrl) URL.revokeObjectURL(recUrl);
        setRecUrl(URL.createObjectURL(blob));
      }
    } else {
      await floorEngine.startRecord();
      if (!snap.playing) floorEngine.play();
    }
  }

  return (
    <div className="min-h-dvh bg-bg text-foreground">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 pb-10 sm:px-6 sm:py-8">
        <Header snap={snap} warming={warming} />

        <section className="stagger-in rounded-2xl border border-border bg-surface p-4 sm:p-5">
          <Transport
            snap={snap}
            warming={warming}
            recUrl={recUrl}
            onPlay={() => void handlePlay()}
            onStop={() => floorEngine.stop()}
            onRecord={() => void onRecord()}
            onSeek={(r) => floorEngine.seek(r)}
            onUpload={() => fileRef.current?.click()}
            onReset={() => floorEngine.useBed()}
          />
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac"
            className="hidden"
            onChange={(e) => void onFiles(e.target.files)}
          />
        </section>

        <div
          className={cn(
            "rounded-2xl border border-dashed px-4 py-6 text-center transition-colors duration-[var(--motion-quick)] sm:px-6",
            drag ? "border-primary bg-surface" : "border-border bg-transparent",
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            void onFiles(e.dataTransfer.files);
          }}
        >
          <p className="font-display text-xl italic text-foreground sm:text-2xl">
            Drop <span className="not-italic">karma is</span> to remix the master
          </p>
          <p className="mt-1 text-sm text-muted">
            horsegiirL · 129 BPM · F minor. Until then you are on an original bed
            in the same pocket, with Ha DNA already armed.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => fileRef.current?.click()}
          >
            <Upload />
            Load audio file
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <section>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-xs font-medium tracking-[0.18em] text-muted uppercase">
                  Soundboard
                </p>
                <h2 className="font-display text-2xl italic">Live pads</h2>
              </div>
              <p className="hidden text-xs text-subtle sm:block">
                Keys 1–4, QWER, ASDF · quantized to 16ths
              </p>
            </div>
            <PadGrid snap={snap} onPad={(id) => void ensureReady().then(() => floorEngine.trigger(id))} />
          </section>

          <aside className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-4 sm:p-5">
            <HaToggle snap={snap} />
            <PatternPicker snap={snap} />
            <LayerToggles snap={snap} />
            <MixSliders snap={snap} />
            <BpmControl snap={snap} />
          </aside>
        </div>

        <footer className="flex flex-col gap-1 border-t border-border pt-4 text-xs text-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>
            Ha DNA is the crash on 4 plus the HA — the dip cue from ballroom.
            Hats and shaker lock to the grid.
          </p>
          <p className="tabular-nums">
            {snap.usingBed ? "Original bed" : "Loaded master"} · {snap.bpm} BPM
          </p>
        </footer>
      </div>
    </div>
  );
}

function Header({ snap, warming }: { snap: EngineSnapshot; warming: boolean }) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="stagger-in">
        <p className="text-xs font-medium tracking-[0.22em] text-muted uppercase">
          Category is
        </p>
        <h1 className="font-display text-5xl leading-[0.9] tracking-[-0.03em] italic sm:text-6xl">
          HA DNA
        </h1>
        <p className="mt-2 max-w-md text-sm text-muted">
          Voguing overlay for any song. Crash, hats, HA — the floor on top of
          the record.
        </p>
      </div>
      <div className="stagger-in text-left sm:text-right" style={{ animationDelay: "80ms" }}>
        <p className="font-display text-2xl italic">{snap.trackName}</p>
        <p className="text-xs tracking-[0.14em] text-subtle uppercase">
          {warming ? "Warming the floor" : snap.usingBed ? "Tribute pocket" : "Your file"}
        </p>
      </div>
    </header>
  );
}

function Transport({
  snap,
  warming,
  recUrl,
  onPlay,
  onStop,
  onRecord,
  onSeek,
  onUpload,
  onReset,
}: {
  snap: EngineSnapshot;
  warming: boolean;
  recUrl: string | null;
  onPlay: () => void;
  onStop: () => void;
  onRecord: () => void;
  onSeek: (ratio: number) => void;
  onUpload: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Waveform
        playing={snap.playing}
        ratio={snap.duration ? snap.currentTime / snap.duration : 0}
        step={snap.step}
        onSeek={onSeek}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onPlay} disabled={warming} className="min-w-28">
          {snap.playing ? <Pause /> : <Play />}
          {warming ? "Loading" : snap.playing ? "Pause" : "Play"}
        </Button>
        <Button variant="secondary" size="icon" onClick={onStop} aria-label="Stop">
          <Square className="size-3.5 fill-current" />
        </Button>
        <Button
          variant={snap.recording ? "danger" : "secondary"}
          onClick={onRecord}
          className="min-w-28"
        >
          <Circle className={cn("size-3.5", snap.recording && "fill-current")} />
          {snap.recording ? "Stop rec" : "Record"}
        </Button>
        <Button variant="ghost" onClick={onUpload}>
          <Upload />
          Load song
        </Button>
        {!snap.usingBed && (
          <Button variant="ghost" onClick={onReset}>
            <RotateCcw />
            Use bed
          </Button>
        )}
        {recUrl && (
          <Button variant="outline" asChild>
            <a href={recUrl} download="karma-is-ha-remix.webm">
              <Download />
              Mix
            </a>
          </Button>
        )}
        <div className="ml-auto flex items-center gap-3 font-mono text-xs tabular-nums text-muted">
          <BeatLamp step={snap.step} playing={snap.playing} />
          <span>
            {formatTime(snap.currentTime)}
            <span className="text-subtle"> / {formatTime(snap.duration)}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function BeatLamp({ step, playing }: { step: number; playing: boolean }) {
  const beat = Math.floor(step / 4);
  const isFour = beat === 3;
  return (
    <div className="flex items-center gap-1.5" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            "size-1.5 rounded-full transition-opacity duration-[var(--motion-micro)]",
            playing && beat === i
              ? isFour && i === 3
                ? "bg-hit opacity-100"
                : "bg-primary opacity-100"
              : "bg-border-strong opacity-50",
          )}
        />
      ))}
    </div>
  );
}

function Waveform({
  playing,
  ratio,
  step,
  onSeek,
}: {
  playing: boolean;
  ratio: number;
  step: number;
  onSeek: (r: number) => void;
}) {
  const [peaks, setPeaks] = useState<number[]>(PLACEHOLDER_PEAKS);

  useEffect(() => {
    const id = window.setInterval(() => {
      const raw = floorEngine.getPeaks();
      if (!raw) return;
      const n = PLACEHOLDER_PEAKS.length;
      const next = new Array<number>(n);
      const stride = raw.length / n;
      for (let i = 0; i < n; i++) {
        let m = 0;
        const start = Math.floor(i * stride);
        const end = Math.floor((i + 1) * stride);
        for (let j = start; j < end; j++) m = Math.max(m, raw[j] ?? 0);
        next[i] = m;
      }
      setPeaks(next);
    }, 350);
    return () => window.clearInterval(id);
  }, []);

  return (
    <button
      type="button"
      className={cn(
        "relative h-20 w-full overflow-hidden rounded-lg bg-bg",
        playing && step === 12 && "bg-hit/10",
      )}
      aria-label="Seek"
      onClick={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        onSeek((e.clientX - rect.left) / rect.width);
      }}
    >
      <div className="flex h-full items-center gap-px px-2">
        {peaks.map((v, i) => (
          <span
            key={i}
            className="flex-1 rounded-full bg-foreground/25"
            style={{ height: `${Math.max(8, Math.round(v * 88))}%` }}
          />
        ))}
      </div>
      <span
        className="absolute top-0 bottom-0 w-0.5 bg-hit"
        style={{ left: `${Math.min(100, Math.max(0, ratio * 100))}%` }}
      />
    </button>
  );
}

const PLACEHOLDER_PEAKS = Array.from({ length: 96 }, (_, i) => {
  const t = i / 96;
  const env = 0.25 + 0.55 * Math.abs(Math.sin(t * Math.PI * 8));
  const drop = t > 0.33 ? 1 : 0.55;
  return Math.min(1, env * drop * (0.7 + 0.3 * Math.sin(t * 40)));
});


function PadGrid({
  snap,
  onPad,
}: {
  snap: EngineSnapshot;
  onPad: (id: PadId) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {PADS.map((pad) => {
        const hot = snap.lastPad === pad.id && performance.now() - snap.lastPadAt < 160;
        return (
          <button
            key={pad.id}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              onPad(pad.id);
            }}
            className={cn(
              "flex min-h-20 flex-col items-start justify-between rounded-lg border border-border bg-surface-2 p-3 text-left transition-[background-color,border-color,transform] duration-[var(--motion-quick)] ease-[var(--ease-smooth-out)] hover:border-border-strong active:scale-[0.96] sm:min-h-24",
              hot && "pad-hit",
              pad.id === "ha" || pad.id === "dip"
                ? "sm:col-span-1"
                : undefined,
            )}
          >
            <span className="font-mono text-[10px] tracking-widest text-subtle">
              {pad.key}
            </span>
            <span>
              <span className="block font-display text-xl leading-none italic">
                {pad.label}
              </span>
              <span className="text-xs text-muted">{pad.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function HaToggle({ snap }: { snap: EngineSnapshot }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-xs font-medium tracking-[0.18em] text-muted uppercase">
          Overlay
        </p>
        <p className="font-display text-xl italic">Ha DNA</p>
      </div>
      <Switch
        checked={snap.haOn}
        onCheckedChange={(v) => floorEngine.setHaOn(v)}
        aria-label="Ha DNA overlay"
      />
    </div>
  );
}

function PatternPicker({ snap }: { snap: EngineSnapshot }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium tracking-[0.18em] text-muted uppercase">
        Pattern
      </p>
      <div className="grid grid-cols-2 gap-2">
        {PATTERNS.map((id) => {
          const meta = PATTERN_META[id];
          const on = snap.pattern === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => floorEngine.setPattern(id)}
              className={cn(
                "rounded-md border px-3 py-2 text-left transition-colors duration-[var(--motion-quick)]",
                on
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface-2 text-foreground hover:border-border-strong",
              )}
            >
              <span className="block text-sm font-medium">{meta.label}</span>
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-subtle">{PATTERN_META[snap.pattern].blurb}</p>
    </div>
  );
}

function LayerToggles({ snap }: { snap: EngineSnapshot }) {
  return (
    <div>
      <p className="mb-2 text-xs font-medium tracking-[0.18em] text-muted uppercase">
        Elements
      </p>
      <ul className="flex flex-col gap-2">
        {LAYER_ORDER.map((id) => (
          <li key={id} className="flex items-center justify-between gap-3">
            <span className="text-sm">{LAYER_LABELS[id]}</span>
            <Switch
              checked={snap.layers[id]}
              onCheckedChange={(v) => floorEngine.setLayer(id, v)}
              aria-label={LAYER_LABELS[id]}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function MixSliders({ snap }: { snap: EngineSnapshot }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs font-medium tracking-[0.18em] text-muted uppercase">
        Mix
      </p>
      <MixRow
        label="Song"
        value={snap.songVol}
        onChange={(v) => floorEngine.setSongVol(v)}
      />
      <MixRow
        label="Ha"
        value={snap.overlayVol}
        onChange={(v) => floorEngine.setOverlayVol(v)}
      />
      <MixRow
        label="Master"
        value={snap.masterVol}
        onChange={(v) => floorEngine.setMasterVol(v)}
      />
    </div>
  );
}

function MixRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="flex justify-between text-sm">
        {label}
        <span className="font-mono text-xs tabular-nums text-muted">
          {Math.round(value * 100)}
        </span>
      </span>
      <Slider
        min={0}
        max={1}
        step={0.01}
        value={[value]}
        onValueChange={(v) => onChange(v[0] ?? 0)}
      />
    </label>
  );
}

function BpmControl({ snap }: { snap: EngineSnapshot }) {
  const lastTap = useRef<number[]>([]);
  function tap() {
    const now = performance.now();
    lastTap.current = [...lastTap.current.filter((t) => now - t < 3000), now];
    if (lastTap.current.length < 2) return;
    const spans: number[] = [];
    for (let i = 1; i < lastTap.current.length; i++) {
      spans.push(lastTap.current[i]! - lastTap.current[i - 1]!);
    }
    const avg = spans.reduce((a, b) => a + b, 0) / spans.length;
    floorEngine.setBpm(Math.round(60000 / avg));
  }
  return (
    <div>
      <p className="mb-2 text-xs font-medium tracking-[0.18em] text-muted uppercase">
        Tempo
      </p>
      <div className="flex items-center gap-3">
        <span className="font-mono text-2xl tabular-nums">{snap.bpm}</span>
        <span className="text-xs text-subtle">BPM</span>
        <Button variant="outline" size="sm" className="ml-auto" onClick={tap}>
          Tap
        </Button>
      </div>
      <Slider
        className="mt-3"
        min={100}
        max={150}
        step={1}
        value={[snap.bpm]}
        onValueChange={(v) => floorEngine.setBpm(v[0] ?? snap.bpm)}
      />
    </div>
  );
}
