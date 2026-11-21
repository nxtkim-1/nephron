"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { simulateSeason } from "~/lib/simulator";

// Duration of one complete Apr -> Oct looping showcase (in seconds).
const LOOP_DURATION_SEC = 26;

interface StoryMoment {
  month: string;
  phase: string;
  headline: string;
  tone: "purple" | "amber" | "red" | "emerald" | "slate";
}

function getStoryMoment(progress: number, isStorm: boolean, isTreat: boolean, c1: number): StoryMoment {
  if (!isTreat) {
    return {
      month: "OCTOBER",
      phase: "Off-Season",
      headline: "Gate switched to Bypass — filters rest for winter",
      tone: "slate",
    };
  }
  if (progress < 0.14) {
    return {
      month: "APRIL",
      phase: "Spring Start-up",
      headline: "Gate opens to Cleaning — Twin starts tracking buried filters",
      tone: "purple",
    };
  }
  if (c1 >= 0.8) {
    return {
      month: progress < 0.45 ? "MAY" : progress < 0.7 ? "JULY" : "AUGUST",
      phase: "Filter Swap",
      headline: "Twin predicts Filter 1 full — Swap Filter 1, slide 2 & 3 forward",
      tone: "red",
    };
  }
  if (isStorm && progress < 0.45) {
    return {
      month: "MAY",
      phase: "Spring Storm",
      headline: "Big rain after spraying — Storm tank catches extra runoff",
      tone: "amber",
    };
  }
  if (progress < 0.42) {
    return {
      month: "MAY",
      phase: "Spray Season",
      headline: "Weekly water test arrives — Twin corrects itself toward reality",
      tone: "purple",
    };
  }
  return {
    month: progress < 0.65 ? "JUNE–JULY" : "AUGUST–SEPT",
    phase: "Summer Cleaning",
    headline: "Twin locked onto real filters — keeping ditch water clean",
    tone: "emerald",
  };
}

function filterColor(frac: number) {
  if (frac >= 0.82) return "#f43f5e"; // bright red
  if (frac >= 0.55) return "#f59e0b"; // amber
  return "#10b981"; // emerald green
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function DashboardClient() {
  // Run the real deterministic physical simulation once on mount so the loop is instant & authentic.
  const sim = useMemo(() => {
    const twin = simulateSeason({ seed: 42, swapStrategy: "twin_guided" });
    const fixed = simulateSeason({ seed: 42, swapStrategy: "fixed_annual" });

    // Downsample to ~428 smooth frames (every 12 hours) for silky 60fps interpolation.
    const stride = 12;
    const frames = [];
    for (let i = 0; i < twin.readings.length; i += stride) {
      const r = twin.readings[i]!;
      const tw = twin.twinStates[i]!;
      const tr = twin.truthStates[i]!;
      frames.push({
        ts: r.ts,
        flow: r.flowLps,
        rain: r.rainForecastMm24h,
        nitrate: r.nitrateAfterChipsMgl,
        twinC1: tw.estCapacityUsedC1,
        twinC2: tw.estCapacityUsedC2,
        twinP: tw.estCapacityUsedPolish,
        truthC1: tr.estCapacityUsedC1,
        truthC2: tr.estCapacityUsedC2,
        truthP: tr.estCapacityUsedPolish,
        twinOut: tw.estOutletAtrazineUgl,
        truthOut: tr.estOutletAtrazineUgl,
        removedMg: tr.removedMgCum,
        monthIdx: r.ts.getUTCMonth() + 1,
        // Flag when a weekly lab sample arrives (every ~168h)
        isLabSync: i > 0 && i % 168 < stride,
      });
    }

    return {
      frames,
      twinPct: Math.round(twin.summary.percentAtrazineRemoved),
      fixedPct: Math.round(fixed.summary.percentAtrazineRemoved),
    };
  }, []);

  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0.24); // Starts right in May action
  const [clock, setClock] = useState(0);
  const lastTsRef = useRef<number | null>(null);

  useEffect(() => {
    let rafId = 0;
    const tick = (now: number) => {
      if (lastTsRef.current !== null) {
        const dt = Math.min(0.1, (now - lastTsRef.current) / 1000);
        setClock((c) => c + dt);
        if (!paused) {
          setProgress((p) => (p + dt / LOOP_DURATION_SEC) % 1);
        }
      }
      lastTsRef.current = now;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [paused]);

  // Smoothly interpolate between consecutive simulation frames.
  const exactIdx = progress * (sim.frames.length - 1);
  const i0 = Math.floor(exactIdx);
  const i1 = Math.min(sim.frames.length - 1, i0 + 1);
  const frac = exactIdx - i0;
  const f0 = sim.frames[i0]!;
  const f1 = sim.frames[i1]!;

  const flow = lerp(f0.flow, f1.flow, frac);
  const rain = lerp(f0.rain, f1.rain, frac);
  const nitrate = lerp(f0.nitrate, f1.nitrate, frac);
  const twinC1 = lerp(f0.twinC1, f1.twinC1, frac);
  const twinC2 = lerp(f0.twinC2, f1.twinC2, frac);
  const twinP = lerp(f0.twinP, f1.twinP, frac);
  const truthC1 = lerp(f0.truthC1, f1.truthC1, frac);
  const truthC2 = lerp(f0.truthC2, f1.truthC2, frac);
  const truthP = lerp(f0.truthP, f1.truthP, frac);
  const twinOut = lerp(f0.twinOut, f1.twinOut, frac);
  const truthOut = lerp(f0.truthOut, f1.truthOut, frac);

  const isTreat = f0.monthIdx < 10;
  const isStorm = flow > 1.35 || rain > 10;
  const isLabPulse = f0.isLabSync && isTreat;
  const basinFill = Math.min(1, Math.max(0.08, (flow - 0.2) / 4.0));

  const dateLabel = f0.ts.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  const story = getStoryMoment(progress, isStorm, isTreat, twinC1);

  // Flowing particle positions (0..1) driven smoothly by `clock`.
  const speed = isStorm ? 0.55 : 0.28;
  const waterDots = [0, 0.2, 0.4, 0.6, 0.8].map((o) => (clock * speed + o) % 1);
  const sensorDots = [0, 0.5].map((o) => (clock * 0.45 + o) % 1);

  // Cartridge heights (max 86px inside 92px glass tubes).
  const maxBar = 84;
  const c1H = Math.max(5, twinC1 * maxBar);
  const c2H = Math.max(5, twinC2 * maxBar);
  const pH = Math.max(5, twinP * maxBar);
  const c1TH = Math.max(5, truthC1 * maxBar);
  const c2TH = Math.max(5, truthC2 * maxBar);
  const pTH = Math.max(5, truthP * maxBar);

  // Crops grow taller from April -> July and turn golden in October.
  const cropHeight = 14 + 16 * Math.sin(Math.min(1, progress * 1.15) * Math.PI * 0.65);
  const cropColor = isTreat ? "#22c55e" : "#ca8a04";

  const toneStyles: Record<StoryMoment["tone"], string> = {
    purple: "border-purple-500/40 bg-purple-500/15 text-purple-200",
    amber: "border-amber-400/50 bg-amber-500/15 text-amber-200",
    red: "border-rose-500/50 bg-rose-500/20 text-rose-200",
    emerald: "border-emerald-400/40 bg-emerald-500/15 text-emerald-200",
    slate: "border-slate-500/40 bg-slate-500/20 text-slate-200",
  };

  return (
    <div className="relative flex min-h-screen flex-col justify-between overflow-hidden bg-[#080910] px-4 py-4 text-slate-100 sm:px-8 sm:py-5">
      {/* Ambient purple glow */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[780px] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(168,85,247,0.75) 0%, rgba(14,165,233,0.18) 55%, transparent 75%)",
        }}
      />

      {/* Minimal Keynote Header */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="rounded-md bg-purple-600 px-2.5 py-0.5 text-xs font-black tracking-widest text-white shadow-lg shadow-purple-700/40">
              NEPHRON
            </span>
            <h1 className="text-base font-bold tracking-tight text-white sm:text-xl">
              A Seasonal Field Kidney for Atrazine in Tile Drainage
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-slate-400">
            Nitrate-Eliminating Pesticide-Holding Reactor for On-farm Networks
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-[11px] font-medium text-purple-300">
            Synthetic data: demonstration only
          </span>
          <button
            onClick={() => setPaused((p) => !p)}
            className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200 transition hover:bg-white/15"
          >
            {paused ? "Play" : "Pause"}
          </button>
        </div>
      </header>

      {/* Live Story Callout Pill */}
      <div className="relative z-10 mx-auto mt-3 flex w-full max-w-6xl items-center justify-center">
        <div
          className={`flex flex-wrap items-center gap-2.5 rounded-full border px-4 py-1.5 text-xs font-semibold transition-all duration-300 sm:text-sm ${toneStyles[story.tone]}`}
        >
          <span className="font-mono text-xs font-bold tracking-wider uppercase opacity-80">
            {dateLabel} &middot; {story.phase}
          </span>
          <span className="opacity-40">|</span>
          <span>{story.headline}</span>
        </div>
      </div>

      {/* CENTERPIECE: FULL-SCREEN CONTINUOUS ANIMATED VISUAL */}
      <div className="relative z-10 mx-auto my-2 flex w-full max-w-6xl flex-1 items-center justify-center">
        <svg
          viewBox="0 0 1000 470"
          className="h-auto max-h-[68vh] w-full drop-shadow-2xl"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="skyBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#13162b" />
              <stop offset="100%" stopColor="#0c1020" />
            </linearGradient>
            <linearGradient id="earthBg" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#261c15" />
              <stop offset="100%" stopColor="#120e0b" />
            </linearGradient>
            <linearGradient id="twinBox" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#7e22ce" stopOpacity="0.42" />
              <stop offset="100%" stopColor="#3b0764" stopOpacity="0.55" />
            </linearGradient>
            <filter id="glowPurple" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glowCyan" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Outer Glass Frame */}
          <rect
            x="2"
            y="2"
            width="996"
            height="466"
            rx="20"
            fill="url(#skyBg)"
            stroke="rgba(255,255,255,0.10)"
            strokeWidth="1.5"
          />

          {/* Earth Layer */}
          <path
            d="M 2 185 H 998 V 448 Q 998 468 978 468 H 22 Q 2 468 2 448 Z"
            fill="url(#earthBg)"
          />

          {/* Grass / Soil Surface Line */}
          <line x1="2" y1="185" x2="998" y2="185" stroke="#22c55e" strokeWidth="3.5" />

          {/* Growing Corn Crops on Left Surface */}
          {[42, 76, 110, 144, 178].map((x) => (
            <g key={x} stroke={cropColor} strokeWidth="2.6" strokeLinecap="round">
              <line x1={x} y1={185} x2={x} y2={185 - cropHeight} />
              <line x1={x} y1={185 - cropHeight * 0.45} x2={x - 9} y2={185 - cropHeight * 0.72} />
              <line x1={x} y1={185 - cropHeight * 0.55} x2={x + 9} y2={185 - cropHeight * 0.85} />
            </g>
          ))}
          <text x="110" y="138" textAnchor="middle" fill="#86efac" fontSize="12" fontWeight="700" letterSpacing="0.06em">
            FARM FIELD
          </text>

          {/* Animated Storm Cloud & Raindrops when stormy */}
          <g opacity={isStorm ? 0.95 : 0.14} style={{ transition: "opacity 400ms" }}>
            <path
              d="M 68 62 a 18 18 0 0 1 34 -6 a 22 22 0 0 1 40 7 a 15 15 0 0 1 2 28 h -76 a 14 14 0 0 1 0 -29 z"
              fill="#64748b"
            />
            {isStorm &&
              [78, 98, 118, 138].map((rx, idx) => {
                const dy = ((clock * 85 + idx * 14) % 44);
                return (
                  <line
                    key={rx}
                    x1={rx}
                    y1={96 + dy}
                    x2={rx - 4}
                    y2={106 + dy}
                    stroke="#60a5fa"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    opacity={1 - dy / 48}
                  />
                );
              })}
          </g>

          {/* ================= TOP: DIGITAL TWIN BRAIN ================= */}
          <g filter="url(#glowPurple)">
            <rect
              x="265"
              y="22"
              width="470"
              height="104"
              rx="16"
              fill="url(#twinBox)"
              stroke={isLabPulse ? "#fb923c" : "#a855f7"}
              strokeWidth={isLabPulse ? "3" : "2"}
            />
          </g>
          <text
            x="500"
            y="50"
            textAnchor="middle"
            fill="#f5d0fe"
            fontSize="15"
            fontWeight="900"
            letterSpacing="0.1em"
          >
            DIGITAL TWIN BRAIN
          </text>
          <text x="500" y="72" textAnchor="middle" fill="#e9d5ff" fontSize="12.5">
            Watches sensors &bull; Learns from weekly water tests &bull; Tells farmer when to swap
          </text>

          {/* Twin live mini-readout inside Brain */}
          <rect x="295" y="86" width="192" height="28" rx="8" fill="rgba(9,9,18,0.6)" stroke="rgba(168,85,247,0.4)" />
          <text x="391" y="104" textAnchor="middle" fill="#c084fc" fontSize="11.5" fontWeight="700" fontFamily="monospace">
            Twin Out: {twinOut.toFixed(2)} &mu;g/L
          </text>

          <rect x="513" y="86" width="192" height="28" rx="8" fill="rgba(9,9,18,0.6)" stroke="rgba(16,185,129,0.45)" />
          <text x="609" y="104" textAnchor="middle" fill="#34d399" fontSize="11.5" fontWeight="700" fontFamily="monospace">
            Real Out: {truthOut.toFixed(2)} &mu;g/L
          </text>

          {/* Lab Sync Ripple Badge */}
          <g opacity={isLabPulse ? 1 : 0.35}>
            <rect
              x="768"
              y="44"
              width="196"
              height="58"
              rx="12"
              fill="rgba(251,146,60,0.14)"
              stroke="#fb923c"
              strokeWidth={isLabPulse ? "2.2" : "1.2"}
            />
            <text x="866" y="69" textAnchor="middle" fill="#fed7aa" fontSize="12" fontWeight="800">
              WEEKLY WATER TEST
            </text>
            <text x="866" y="88" textAnchor="middle" fill="#fb923c" fontSize="11" fontWeight="600">
              {isLabPulse ? "Syncing twin now!" : "Checks & corrects twin"}
            </text>
          </g>

          {/* Animated Sensor Signals Rising to Digital Twin */}
          {[242, 412, 608].map((sx, idx) => (
            <g key={sx}>
              <line
                x1={sx}
                y1={224}
                x2={sx}
                y2={126}
                stroke="#a855f7"
                strokeWidth="1.5"
                strokeDasharray="4 6"
                opacity="0.45"
              />
              {sensorDots.map((t, j) => {
                const cy = 224 - ((t + idx * 0.27) % 1) * 96;
                return (
                  <circle
                    key={j}
                    cx={sx}
                    cy={cy}
                    r="3.8"
                    fill="#d8b4fe"
                    filter="url(#glowPurple)"
                  />
                );
              })}
            </g>
          ))}

          {/* Lab Test Particle Travelling from Outlet -> Weekly Test -> Twin Brain */}
          <path
            d="M 806 232 V 102"
            fill="none"
            stroke="#fb923c"
            strokeWidth="1.5"
            strokeDasharray="4 6"
            opacity="0.5"
          />
          <line
            x1="768"
            y1="73"
            x2="735"
            y2="73"
            stroke="#fb923c"
            strokeWidth="2"
            strokeDasharray="4 4"
            opacity={isLabPulse ? 1 : 0.45}
          />
          <circle
            cx={806}
            cy={232 - ((clock * 0.4) % 1) * 126}
            r={isLabPulse ? 5.5 : 3.5}
            fill="#fb923c"
          />

          {/* ================= UNDERGROUND PIPES + ANIMATED WATER PARTICLES ================= */}
          {/* Main Treatment Pipe */}
          <line x1="20" y1="295" x2="965" y2="295" stroke="#1e293b" strokeWidth="22" strokeLinecap="round" />

          {/* Bypass Pipe (Lights up in October Off-Season) */}
          <path
            d="M 242 332 V 426 H 806 V 326"
            fill="none"
            stroke={isTreat ? "#1e293b" : "#f59e0b"}
            strokeWidth={isTreat ? "10" : "12"}
            strokeLinecap="round"
            opacity={isTreat ? 0.55 : 0.9}
          />
          <text
            x="524"
            y="449"
            textAnchor="middle"
            fill={isTreat ? "#64748b" : "#fcd34d"}
            fontSize="11.5"
            fontWeight="700"
            letterSpacing="0.05em"
          >
            {isTreat
              ? "OFF-SEASON BYPASS PIPE (CLOSED WHILE CLEANING)"
              : "OFF-SEASON BYPASS ACTIVE — WATER SKIPS FILTERS"}
          </text>

          {/* Animated Water Droplets Moving Left -> Right */}
          {waterDots.map((t, idx) => {
            if (!isTreat) {
              // Route dots through bypass path
              const xIn = 26 + t * 180;
              const xByp = 250 + t * 548;
              return (
                <g key={idx}>
                  <circle cx={xIn} cy={295} r="5.5" fill="#94a3b8" />
                  <circle cx={xByp} cy={426} r="5.5" fill="#fbbf24" />
                </g>
              );
            }
            const px = 26 + t * 920;
            // Color smoothly transitions purple (dirty) -> indigo -> bright cyan (clean!)
            const dotColor =
              px < 360
                ? "#c084fc"
                : px < 530
                  ? "#818cf8"
                  : px < 720
                    ? "#38bdf8"
                    : "#22d3ee";
            return (
              <circle
                key={idx}
                cx={px}
                cy={295}
                r={isStorm ? 6.8 : 5.2}
                fill={dotColor}
                filter={px > 700 ? "url(#glowCyan)" : "url(#glowPurple)"}
              />
            );
          })}

          {/* ================= STAGE 1: FARM RUNOFF PIPE ================= */}
          <rect
            x="24"
            y="236"
            width="122"
            height="118"
            rx="14"
            fill="#131629"
            stroke="#a855f7"
            strokeWidth="1.8"
          />
          <text x="85" y="261" textAnchor="middle" fill="#e9d5ff" fontSize="12" fontWeight="800">
            1. RUNOFF
          </text>
          <text x="85" y="297" textAnchor="middle" fill="#c084fc" fontSize="20" fontWeight="900" fontFamily="monospace">
            {flow.toFixed(1)}
          </text>
          <text x="85" y="316" textAnchor="middle" fill="#94a3b8" fontSize="11">
            L/sec flow
          </text>
          <text x="85" y="338" textAnchor="middle" fill="#d8b4fe" fontSize="10.5" fontWeight="700">
            Weed-killer in
          </text>

          {/* ================= STAGE 2: INLET GATE & STORM TANK ================= */}
          <rect
            x="180"
            y="224"
            width="124"
            height="126"
            rx="14"
            fill="#131629"
            stroke="#64748b"
            strokeWidth="1.8"
          />
          <text x="242" y="248" textAnchor="middle" fill="#f1f5f9" fontSize="12" fontWeight="800">
            2. GATE
          </text>
          {/* Green / Gray Season Gate Pill */}
          <rect
            x="200"
            y="266"
            width="84"
            height="30"
            rx="8"
            fill={isTreat ? "rgba(34,197,94,0.22)" : "rgba(245,158,11,0.22)"}
            stroke={isTreat ? "#22c55e" : "#f59e0b"}
            strokeWidth="1.8"
          />
          <text
            x="242"
            y="286"
            textAnchor="middle"
            fill={isTreat ? "#4ade80" : "#fcd34d"}
            fontSize="12"
            fontWeight="900"
          >
            {isTreat ? "CLEANING" : "BYPASS"}
          </text>

          {/* Mini Storm Tank bar inside Gate box */}
          <rect x="200" y="308" width="84" height="28" rx="6" fill="#090c16" stroke="#334155" />
          <rect
            x="202"
            y={334 - basinFill * 24}
            width="80"
            height={basinFill * 24}
            rx="4"
            fill="#3b82f6"
            opacity="0.75"
          />
          <text x="242" y="326" textAnchor="middle" fill="#e0f2fe" fontSize="10" fontWeight="700">
            Storm Tank
          </text>

          {/* ================= STAGE 3: WOODCHIPS ================= */}
          <rect
            x="342"
            y="224"
            width="140"
            height="126"
            rx="14"
            fill="#211810"
            stroke="#ca8a04"
            strokeWidth="1.8"
          />
          <text x="412" y="248" textAnchor="middle" fill="#fef08a" fontSize="12" fontWeight="800">
            3. WOODCHIPS
          </text>
          {/* Stylized woodchip pieces */}
          <g fill="#78350f" opacity="0.85">
            <rect x="360" y="262" width="30" height="9" rx="4" />
            <rect x="398" y="264" width="34" height="9" rx="4" />
            <rect x="440" y="261" width="24" height="9" rx="4" />
            <rect x="366" y="278" width="36" height="9" rx="4" />
            <rect x="410" y="279" width="26" height="9" rx="4" />
            <rect x="442" y="277" width="24" height="9" rx="4" />
          </g>
          <text
            x="412"
            y="314"
            textAnchor="middle"
            fill={nitrate > 5 ? "#f87171" : "#4ade80"}
            fontSize="15"
            fontWeight="900"
            fontFamily="monospace"
          >
            {nitrate.toFixed(1)} mg/L
          </text>
          <text x="412" y="333" textAnchor="middle" fill="#fde68a" fontSize="10.5">
            Cuts 70% fertilizer
          </text>

          {/* ================= STAGE 4: CARBON FILTERS (HERO) ================= */}
          <rect
            x="516"
            y="206"
            width="234"
            height="172"
            rx="16"
            fill="#16112b"
            stroke="#a855f7"
            strokeWidth="2.5"
            filter="url(#glowPurple)"
          />
          <text x="633" y="230" textAnchor="middle" fill="#f3e8ff" fontSize="13" fontWeight="900" letterSpacing="0.05em">
            4. CARBON FILTERS
          </text>

          {/* Cartridge 1 */}
          <text x="562" y="250" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="700">Filter 1</text>
          <rect x="536" y="258" width="52" height="90" rx="8" fill="#090b14" stroke="#475569" strokeWidth="1.5" />
          <rect x="539" y={345 - c1H} width="46" height={c1H} rx="5" fill={filterColor(twinC1)} />
          <line x1="536" y1={345 - c1TH} x2="588" y2={345 - c1TH} stroke="#ffffff" strokeWidth="2.4" strokeDasharray="4 3" />
          <text x="562" y="366" textAnchor="middle" fill="#f8fafc" fontSize="11.5" fontWeight="800" fontFamily="monospace">
            {Math.round(twinC1 * 100)}%
          </text>

          {/* Cartridge 2 */}
          <text x="633" y="250" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="700">Filter 2</text>
          <rect x="607" y="258" width="52" height="90" rx="8" fill="#090b14" stroke="#475569" strokeWidth="1.5" />
          <rect x="610" y={345 - c2H} width="46" height={c2H} rx="5" fill={filterColor(twinC2)} />
          <line x1="607" y1={345 - c2TH} x2="659" y2={345 - c2TH} stroke="#ffffff" strokeWidth="2.4" strokeDasharray="4 3" />
          <text x="633" y="366" textAnchor="middle" fill="#f8fafc" fontSize="11.5" fontWeight="800" fontFamily="monospace">
            {Math.round(twinC2 * 100)}%
          </text>

          {/* Cartridge 3 (Backup) */}
          <text x="704" y="250" textAnchor="middle" fill="#cbd5e1" fontSize="11" fontWeight="700">Backup</text>
          <rect x="678" y="258" width="52" height="90" rx="8" fill="#090b14" stroke="#475569" strokeWidth="1.5" />
          <rect x="681" y={345 - pH} width="46" height={pH} rx="5" fill={filterColor(twinP)} />
          <line x1="678" y1={345 - pTH} x2="730" y2={345 - pTH} stroke="#ffffff" strokeWidth="2.4" strokeDasharray="4 3" />
          <text x="704" y="366" textAnchor="middle" fill="#f8fafc" fontSize="11.5" fontWeight="800" fontFamily="monospace">
            {Math.round(twinP * 100)}%
          </text>

          {/* ================= STAGE 5: CLEAN WATER DITCH ================= */}
          <rect
            x="788"
            y="224"
            width="186"
            height="126"
            rx="14"
            fill="#092136"
            stroke="#22d3ee"
            strokeWidth="2"
            filter="url(#glowCyan)"
          />
          <text x="881" y="248" textAnchor="middle" fill="#bae6fd" fontSize="12" fontWeight="800">
            5. CLEAN WATER OUT
          </text>
          <text x="881" y="294" textAnchor="middle" fill="#22d3ee" fontSize="26" fontWeight="900" fontFamily="monospace">
            {twinOut.toFixed(2)}
          </text>
          <text x="881" y="315" textAnchor="middle" fill="#7dd3fc" fontSize="11.5" fontWeight="600">
            &mu;g/L weed-killer left
          </text>
          <text x="881" y="336" textAnchor="middle" fill="#a5f3fc" fontSize="10.5">
            {isTreat ? "Safe for stream & ditch" : "Bypassing for winter"}
          </text>

          {/* Subtle bottom key */}
          <text x="24" y="405" fill="#94a3b8" fontSize="11">
            Color bars = Twin&apos;s live guess (green fresh &rarr; red swap soon) &nbsp;&bull;&nbsp; White dashed line = Real hidden filter
          </text>
        </svg>
      </div>

      {/* SLEEK BOTTOM PROGRESS BAR + HEADLINE IMPACT */}
      <footer className="relative z-10 mx-auto w-full max-w-6xl space-y-2.5">
        {/* Clickable season progress bar */}
        <div
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const next = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setProgress(next);
          }}
          title="Click anywhere to jump in the year"
          className="h-2 w-full cursor-pointer overflow-hidden rounded-full bg-white/10"
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-purple-500 via-fuchsia-400 to-cyan-400"
            style={{ width: `${Math.max(2, progress * 100)}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex flex-wrap items-center gap-4">
            <span>
              <strong className="font-mono text-sm text-purple-300">{sim.twinPct}%</strong>{" "}
              weed-killer caught <span className="text-slate-500">(with Digital Twin)</span>
            </span>
            <span className="text-slate-600">vs.</span>
            <span>
              <strong className="font-mono text-sm text-slate-300">{sim.fixedPct}%</strong>{" "}
              <span className="text-slate-500">(swapping once a year)</span>
            </span>
          </div>

          <div className="flex items-center gap-3 text-[11px]">
            <Link href="/charts" className="text-slate-400 hover:text-purple-300">
              Graphs
            </Link>
            <Link href="/startup" className="text-slate-400 hover:text-purple-300">
              Spring Setup
            </Link>
            <Link href="/whatif" className="text-slate-400 hover:text-purple-300">
              Compare
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
