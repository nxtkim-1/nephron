"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { simulateSeason } from "~/lib/simulator";

// Calm, deliberate 52-second full-season loop (Apr -> Oct).
const LOOP_DURATION_SEC = 52;
const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"] as const;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function barGradientId(frac: number) {
  if (frac >= 0.8) return "url(#fillRed)";
  if (frac >= 0.55) return "url(#fillAmber)";
  return "url(#fillGreen)";
}

export function DashboardClient() {
  // Backed by our real hourly NEPHRON physics & Kalman-calibrated twin.
  const sim = useMemo(() => {
    const twin = simulateSeason({ seed: 42, swapStrategy: "twin_guided" });
    const fixed = simulateSeason({ seed: 42, swapStrategy: "fixed_annual" });

    // Record exact day indices where the twin triggers a lead-lag cartridge swap.
    const swapDays = new Set<number>();
    const startMs = twin.readings[0]!.ts.getTime();
    for (const ev of twin.events) {
      if (ev.type === "cartridge_swap") {
        const day = Math.round((ev.ts.getTime() - startMs) / (1000 * 3600 * 24));
        swapDays.add(day);
      }
    }

    // 1 smooth frame per day (214 frames) with gentle smoothing between days.
    const stride = 24;
    const frames = [];
    for (let i = 0; i < twin.readings.length; i += stride) {
      const dayIdx = Math.floor(i / 24);
      const r = twin.readings[i]!;
      const tw = twin.twinStates[i]!;
      const tr = twin.truthStates[i]!;
      frames.push({
        dayIdx,
        monthIdx: r.ts.getUTCMonth() + 1,
        flow: r.flowLps,
        rain: r.rainForecastMm24h,
        twinC1: tw.estCapacityUsedC1,
        twinC2: tw.estCapacityUsedC2,
        twinP: tw.estCapacityUsedPolish,
        truthC1: tr.estCapacityUsedC1,
        truthC2: tr.estCapacityUsedC2,
        truthP: tr.estCapacityUsedPolish,
        twinOut: tw.estOutletAtrazineUgl,
        truthOut: tr.estOutletAtrazineUgl,
        labSync: i > 0 && i % 168 < stride,
        isSwapWindow:
          swapDays.has(dayIdx) ||
          swapDays.has(dayIdx - 1) ||
          swapDays.has(dayIdx - 2),
      });
    }

    // Build compact sparkline points for the Twin holographic display (Outlet convergence).
    const maxOut = Math.max(
      1,
      ...frames.map((f) => Math.max(f.twinOut, f.truthOut)),
    );
    const sparkTwin = frames
      .map((f, idx) => {
        const x = (idx / (frames.length - 1)) * 110;
        const y = 26 - Math.min(1, f.twinOut / (maxOut * 0.45)) * 22;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");
    const sparkTruth = frames
      .map((f, idx) => {
        const x = (idx / (frames.length - 1)) * 110;
        const y = 26 - Math.min(1, f.truthOut / (maxOut * 0.45)) * 22;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

    return {
      frames,
      sparkTwin,
      sparkTruth,
      twinPct: Math.round(twin.summary.percentAtrazineRemoved),
      fixedPct: Math.round(fixed.summary.percentAtrazineRemoved),
    };
  }, []);

  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0.22); // Start in active May spray season
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

  const exactIdx = progress * (sim.frames.length - 1);
  const i0 = Math.floor(exactIdx);
  const i1 = Math.min(sim.frames.length - 1, i0 + 1);
  const t = exactIdx - i0;
  const f0 = sim.frames[i0]!;
  const f1 = sim.frames[i1]!;

  const flow = lerp(f0.flow, f1.flow, t);
  const rain = lerp(f0.rain, f1.rain, t);
  const c1 = clamp01(lerp(f0.twinC1, f1.twinC1, t));
  const c2 = clamp01(lerp(f0.twinC2, f1.twinC2, t));
  const p = clamp01(lerp(f0.twinP, f1.twinP, t));
  const c1R = clamp01(lerp(f0.truthC1, f1.truthC1, t));
  const c2R = clamp01(lerp(f0.truthC2, f1.truthC2, t));
  const pR = clamp01(lerp(f0.truthP, f1.truthP, t));

  const isTreat = f0.monthIdx < 10;
  const isStorm = flow > 1.25 || rain > 12;
  const isSwap = isTreat && (f0.isSwapWindow || c1 >= 0.8);
  const isLab = isTreat && f0.labSync;
  const activeMonth = Math.min(6, Math.max(0, f0.monthIdx - 4));

  // Silky animated stream phase & organic sway.
  const streamSpeed = isStorm ? 0.24 : 0.14;
  const waterBubbles = [0, 0.14, 0.28, 0.42, 0.56, 0.7, 0.84].map(
    (o) => (clock * streamSpeed + o) % 1,
  );
  const wifiWave = (clock * 0.45) % 1;
  const sway = Math.sin(clock * 1.4) * 2.5;
  const cropScale = 0.65 + 0.45 * Math.sin(Math.min(1, progress * 1.15) * Math.PI * 0.65);
  const cropColor = !isTreat ? "#d97706" : progress > 0.72 ? "#84cc16" : "#22c55e";

  // Glass cylinder fill heights (inside 92px tubes).
  const maxH = 86;
  const bars = [
    { id: "1", x: 472, h: Math.max(8, c1 * maxH), hr: Math.max(8, c1R * maxH), frac: c1 },
    { id: "2", x: 548, h: Math.max(8, c2 * maxH), hr: Math.max(8, c2R * maxH), frac: c2 },
    { id: "3", x: 624, h: Math.max(8, p * maxH), hr: Math.max(8, pR * maxH), frac: p },
  ];

  // Gate valve rotation: 0 deg = straight through (Treat), 90 deg = down to bypass (Off-season).
  const gateAngle = isTreat ? 0 : 90;

  // Clean 3-word universal status.
  const status = !isTreat
    ? { text: "Winter Bypass", accent: "#f59e0b" }
    : isSwap
      ? { text: "Swap Filter 1", accent: "#f43f5e" }
      : isLab
        ? { text: "Lab Synced", accent: "#fb923c" }
        : isStorm
          ? { text: "Storm Surge", accent: "#60a5fa" }
          : { text: "Cleaning Water", accent: "#10b981" };

  // Sparkline playhead X (0..110).
  const sparkX = progress * 110;

  return (
    <div className="relative flex min-h-screen flex-col justify-between overflow-hidden bg-[#06070d] px-4 pt-5 pb-12 text-slate-100 sm:px-8 sm:pt-6 sm:pb-8">
      {/* Subtle atmospheric spotlights */}
      <div
        className="pointer-events-none absolute -top-44 left-1/2 h-[420px] w-[860px] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(168,85,247,0.72) 0%, rgba(56,189,248,0.18) 52%, transparent 76%)",
        }}
      />

      {/* Minimal Header */}
      <header className="relative z-10 mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="rounded-md bg-gradient-to-r from-purple-600 to-fuchsia-600 px-2.5 py-0.5 text-xs font-black tracking-widest text-white shadow-lg shadow-purple-700/40">
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

        <div className="flex items-center gap-2">
          <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-3 py-1 text-[11px] font-medium text-purple-300">
            Synthetic data: demonstration only
          </span>
          <button
            onClick={() => setPaused((v) => !v)}
            className="rounded-full border border-white/15 bg-white/5 px-3.5 py-1 text-xs font-semibold text-slate-200 backdrop-blur transition hover:bg-white/15"
          >
            {paused ? "Play" : "Pause"}
          </button>
        </div>
      </header>

      {/* CENTERPIECE: MUSEUM-GRADE ANIMATED CUTAWAY */}
      <div className="relative z-10 mx-auto my-3 flex w-full max-w-5xl flex-1 items-center justify-center">
        <svg
          viewBox="0 0 960 470"
          className="h-auto max-h-[70vh] w-full drop-shadow-[0_24px_60px_rgba(0,0,0,0.65)]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Sky & Soil Atmosphere */}
            <linearGradient id="skyAtmos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isStorm ? "#13192e" : !isTreat ? "#1a1528" : "#0e1730"} />
              <stop offset="100%" stopColor="#090d1a" />
            </linearGradient>
            <linearGradient id="soilTop" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2a1e15" />
              <stop offset="42%" stopColor="#1c140e" />
              <stop offset="100%" stopColor="#100b08" />
            </linearGradient>
            <linearGradient id="soilDeep" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#17110d" stopOpacity="0.85" />
              <stop offset="100%" stopColor="#0c0907" />
            </linearGradient>

            {/* Purifying Water Stream Gradient (Left Violet -> Right Crystal Cyan) */}
            <linearGradient id="streamPurify" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#a855f7" />
              <stop offset="38%" stopColor="#818cf8" />
              <stop offset="68%" stopColor="#38bdf8" />
              <stop offset="100%" stopColor="#22d3ee" />
            </linearGradient>

            {/* Holographic Digital Twin Glass */}
            <linearGradient id="twinGlass" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#9333ea" stopOpacity="0.30" />
              <stop offset="55%" stopColor="#4f46e5" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.14" />
            </linearGradient>

            {/* Cartridge Liquid Gradients */}
            <linearGradient id="fillGreen" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
            <linearGradient id="fillAmber" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fbbf24" />
              <stop offset="100%" stopColor="#d97706" />
            </linearGradient>
            <linearGradient id="fillRed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fb7185" />
              <stop offset="100%" stopColor="#e11d48" />
            </linearGradient>
            <linearGradient id="glassShine" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.22" />
              <stop offset="35%" stopColor="#ffffff" stopOpacity="0.03" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>

            {/* Radial Sun Glow */}
            <radialGradient id="sunAura" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fde047" stopOpacity="0.55" />
              <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.16" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
            </radialGradient>

            {/* Soft Glow Filters */}
            <filter id="glowSoft" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glowStrong" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="8" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            <clipPath id="frameClip">
              <rect x="2" y="2" width="956" height="466" rx="24" />
            </clipPath>
          </defs>

          {/* Clipped Scene */}
          <g clipPath="url(#frameClip)">
            {/* Sky Backdrop */}
            <rect x="2" y="2" width="956" height="200" fill="url(#skyAtmos)" />

            {/* Organic Soil Strata */}
            <rect x="2" y="196" width="956" height="272" fill="url(#soilTop)" />
            <path
              d="M 2 285 Q 240 272 480 288 T 958 278 V 468 H 2 Z"
              fill="url(#soilDeep)"
            />
            <path
              d="M 2 380 Q 300 368 620 386 T 958 375 V 468 H 2 Z"
              fill="#0b0806"
              opacity="0.7"
            />

            {/* Rolling Lush Field Surface */}
            <path
              d="M 0 198 Q 220 191 480 198 T 960 196 L 960 206 L 0 206 Z"
              fill={isTreat ? "#15803d" : "#854d0e"}
              opacity="0.75"
            />
            <path
              d="M 0 197 Q 220 190 480 197 T 960 195"
              fill="none"
              stroke={isTreat ? "#22c55e" : "#ca8a04"}
              strokeWidth="3.2"
            />

            {/* ========== WEATHER (Radiant Sun OR Storm Cloud + Rain) ========== */}
            {isStorm ? (
              <g transform="translate(54, 34)">
                <ellipse cx="64" cy="48" rx="64" ry="30" fill="#38bdf8" opacity="0.12" />
                <path
                  d="M 22 44 a 20 20 0 0 1 38 -7 a 24 24 0 0 1 44 8 a 16 16 0 0 1 2 30 h -84 a 15 15 0 0 1 0 -31 z"
                  fill="#475569"
                  stroke="#94a3b8"
                  strokeOpacity="0.35"
                />
                {[28, 48, 68, 88, 104].map((rx, idx) => {
                  const dy = (clock * 54 + idx * 17) % 54;
                  return (
                    <line
                      key={rx}
                      x1={rx}
                      y1={80 + dy}
                      x2={rx - 6}
                      y2={94 + dy}
                      stroke="#60a5fa"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      opacity={0.9 * (1 - dy / 56)}
                    />
                  );
                })}
              </g>
            ) : (
              <g transform="translate(108, 72)">
                <circle cx="0" cy="0" r="56" fill="url(#sunAura)" />
                <circle cx="0" cy="0" r="19" fill="#fde047" />
                {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
                  const rad = ((deg + clock * 8) * Math.PI) / 180;
                  return (
                    <line
                      key={deg}
                      x1={Math.cos(rad) * 26}
                      y1={Math.sin(rad) * 26}
                      x2={Math.cos(rad) * 35}
                      y2={Math.sin(rad) * 35}
                      stroke="#fde047"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      opacity="0.7"
                    />
                  );
                })}
              </g>
            )}

            {/* Swaying Field Crops */}
            {[42, 74, 106, 138, 170].map((cx, i) => {
              const h = (28 + (i % 2) * 8) * cropScale;
              const s = sway * (0.7 + (i % 3) * 0.2);
              return (
                <g key={cx} stroke={cropColor} strokeWidth="2.6" strokeLinecap="round" fill="none">
                  <path d={`M ${cx} 196 Q ${cx + s * 0.5} ${196 - h * 0.55} ${cx + s} ${196 - h}`} />
                  <path d={`M ${cx + s * 0.45} ${196 - h * 0.45} Q ${cx - 8} ${196 - h * 0.62} ${cx - 12} ${196 - h * 0.76}`} />
                  <path d={`M ${cx + s * 0.6} ${196 - h * 0.6} Q ${cx + 9} ${196 - h * 0.76} ${cx + 12} ${196 - h * 0.9}`} />
                </g>
              );
            })}

            {/* ========== HOLOGRAPHIC FLOATING DIGITAL TWIN ========== */}
            {/* Hologram projection beam rising softly from Carbon Filters */}
            <polygon
              points="460,214 700,214 680,136 280,136"
              fill="url(#twinGlass)"
              opacity="0.22"
            />

            <g filter="url(#glowSoft)">
              <rect
                x="252"
                y="24"
                width="456"
                height="112"
                rx="20"
                fill="url(#twinGlass)"
                stroke={isLab ? "#fb923c" : isSwap ? "#f43f5e" : "#a855f7"}
                strokeWidth="2.2"
              />
            </g>

            {/* Expanding Lab Sync Ripple Ring */}
            {isLab && (
              <rect
                x={252 - wifiWave * 10}
                y={24 - wifiWave * 6}
                width={456 + wifiWave * 20}
                height={112 + wifiWave * 12}
                rx="24"
                fill="none"
                stroke="#fb923c"
                strokeWidth="2"
                opacity={0.7 * (1 - wifiWave)}
              />
            )}

            {/* Left inside Twin: Universal Twin Mirror Icon + Label + Status */}
            <g transform="translate(278, 48)" strokeWidth="2.2" fill="none" strokeLinejoin="round">
              <rect x="0" y="4" width="26" height="26" rx="6" fill="rgba(168,85,247,0.35)" stroke="#e9d5ff" />
              <rect x="13" y="16" width="26" height="26" rx="6" fill="rgba(34,211,238,0.22)" stroke="#38bdf8" />
            </g>

            <text x="334" y="68" fill="#ffffff" fontSize="18" fontWeight="900" letterSpacing="0.06em">
              DIGITAL TWIN
            </text>

            {/* Clean status pill */}
            <rect
              x="334"
              y="81"
              width="156"
              height="30"
              rx="15"
              fill="rgba(9,11,20,0.65)"
              stroke={status.accent}
              strokeWidth="1.5"
            />
            <circle cx="352" cy="96" r="5.5" fill={status.accent} />
            <text x="366" y="100.5" fill="#f1f5f9" fontSize="12.5" fontWeight="700">
              {status.text}
            </text>

            {/* Right inside Twin: Live Mini-Mirror Sparkline (Twin vs Truth!) */}
            <g transform="translate(520, 42)">
              <rect
                x="0"
                y="0"
                width="164"
                height="76"
                rx="12"
                fill="rgba(7,9,18,0.62)"
                stroke="rgba(255,255,255,0.10)"
              />
              {/* 3 tiny mirror bars on left of mini-card */}
              {bars.map((b, idx) => (
                <g key={b.id} transform={`translate(${12 + idx * 12}, 14)`}>
                  <rect x="0" y="0" width="8" height="44" rx="3" fill="#1e293b" />
                  <rect
                    x="0"
                    y={44 - Math.max(4, b.frac * 44)}
                    width="8"
                    height={Math.max(4, b.frac * 44)}
                    rx="3"
                    fill={barGradientId(b.frac)}
                  />
                </g>
              ))}
              {/* Tiny convergence sparkline on right */}
              <g transform="translate(52, 22)">
                <polyline
                  points={sim.sparkTruth}
                  fill="none"
                  stroke="#34d399"
                  strokeWidth="1.6"
                  strokeDasharray="3 2"
                  opacity="0.8"
                />
                <polyline
                  points={sim.sparkTwin}
                  fill="none"
                  stroke="#c084fc"
                  strokeWidth="2"
                />
                <line
                  x1={sparkX}
                  y1="0"
                  x2={sparkX}
                  y2="28"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                  opacity="0.85"
                />
                <circle cx={sparkX} cy="14" r="3" fill="#e9d5ff" />
              </g>
              <text x="82" y="69" textAnchor="middle" fill="#94a3b8" fontSize="9.5" fontWeight="600">
                Twin mirrors buried unit
              </text>
            </g>

            {/* ========== UNIVERSAL SENSORS (Wi-Fi waves) + LAB TEST FLASK ========== */}
            {/* Wi-Fi Sensor Waves */}
            <g transform="translate(362, 166)" stroke="#c084fc" strokeWidth="2.4" fill="none" strokeLinecap="round">
              <path d="M -18 4 A 24 24 0 0 1 18 4" opacity={0.25 + 0.75 * Math.sin(wifiWave * Math.PI)} />
              <path d="M -11 12 A 14 14 0 0 1 11 12" opacity={0.45 + 0.55 * Math.sin(wifiWave * Math.PI)} />
              <circle cx="0" cy="20" r="3.5" fill="#e9d5ff" stroke="none" />
            </g>
            <text x="362" y="156" textAnchor="middle" fill="#d8b4fe" fontSize="11" fontWeight="700">
              Sensors
            </text>

            {/* Lab Flask Icon (glows & launches amber droplet upward on weekly sync) */}
            <g transform="translate(598, 152)" opacity={isLab ? 1 : 0.5}>
              <g
                transform="translate(-14, 0)"
                stroke="#fb923c"
                strokeWidth="2.3"
                fill={isLab ? "rgba(251,146,60,0.25)" : "none"}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M 8 2 H 20 M 10 2 V 12 L 3 26 A 3 3 0 0 0 6 30 H 22 A 3 3 0 0 0 25 26 L 18 12 V 2" />
                <line x1="6" y1="22" x2="22" y2="22" />
              </g>
              <text x="20" y="21" fill="#fdba74" fontSize="11" fontWeight="700">
                Lab Check
              </text>
            </g>

            {/* ========== CONTINUOUS GLOWING UNDERGROUND WATER PIPES ========== */}
            {/* Pipe Casing */}
            <line
              x1="28"
              y1="316"
              x2="932"
              y2="316"
              stroke="#141926"
              strokeWidth="28"
              strokeLinecap="round"
            />
            {/* Glowing Fluid Stream inside main pipe */}
            <line
              x1="34"
              y1="316"
              x2="926"
              y2="316"
              stroke={isTreat ? "url(#streamPurify)" : "#334155"}
              strokeWidth={isTreat ? (isStorm ? "16" : "12") : "6"}
              strokeLinecap="round"
              opacity={isTreat ? 0.55 : 0.35}
            />

            {/* Bypass Pipe (curves neatly underneath) */}
            <path
              d="M 218 340 V 426 Q 218 438 232 438 H 736 Q 750 438 750 426 V 340"
              fill="none"
              stroke={isTreat ? "#181d2b" : "#f59e0b"}
              strokeWidth={isTreat ? "10" : "14"}
              strokeLinecap="round"
              opacity={isTreat ? 0.6 : 0.85}
            />
            {!isTreat && (
              <text
                x="484"
                y="424"
                textAnchor="middle"
                fill="#fde68a"
                fontSize="12"
                fontWeight="800"
                letterSpacing="0.06em"
              >
                BYPASS OPEN &middot; FILTERS RESTING
              </text>
            )}

            {/* Shimmering Flowing Water Bubbles */}
            {waterBubbles.map((b, idx) => {
              if (!isTreat) {
                const bx = 232 + b * 504;
                return (
                  <circle
                    key={idx}
                    cx={bx}
                    cy={438}
                    r="5.5"
                    fill="#fef08a"
                    filter="url(#glowSoft)"
                  />
                );
              }
              const px = 38 + b * 884;
              const py = 316 + Math.sin(b * Math.PI * 8 + idx) * 2.5;
              const col =
                px < 260
                  ? "#e879f9"
                  : px < 440
                    ? "#a5b4fc"
                    : px < 720
                      ? "#7dd3fc"
                      : "#67e8f9";
              return (
                <circle
                  key={idx}
                  cx={px}
                  cy={py}
                  r={isStorm ? 5.5 : 4.2}
                  fill={col}
                  filter="url(#glowSoft)"
                />
              );
            })}

            {/* ========== STAGE 1: FARM RUNOFF ========== */}
            <rect
              x="36"
              y="246"
              width="144"
              height="136"
              rx="20"
              fill="#121428"
              stroke="#a855f7"
              strokeWidth="2"
            />
            <path
              d="M 108 268 C 108 268 87 296 87 311 A 21 21 0 0 0 129 311 C 129 296 108 268 108 268 Z"
              fill="#a855f7"
              filter="url(#glowSoft)"
            />
            <text x="108" y="362" textAnchor="middle" fill="#f3e8ff" fontSize="14" fontWeight="800">
              Farm Runoff
            </text>

            {/* ========== SEASONAL GATE VALVE (Pivots cleanly in October!) ========== */}
            <g transform="translate(218, 316)">
              <circle
                cx="0"
                cy="0"
                r="22"
                fill="#0b0e19"
                stroke={isTreat ? "#22c55e" : "#f59e0b"}
                strokeWidth="2.8"
              />
              <g
                transform={`rotate(${gateAngle})`}
                style={{ transition: "transform 700ms ease" }}
              >
                <line
                  x1="-12"
                  y1="0"
                  x2="10"
                  y2="0"
                  stroke={isTreat ? "#4ade80" : "#fbbf24"}
                  strokeWidth="3.5"
                  strokeLinecap="round"
                />
                <polygon
                  points="6,-6 14,0 6,6"
                  fill={isTreat ? "#4ade80" : "#fbbf24"}
                />
              </g>
            </g>

            {/* ========== STAGE 2: WOODCHIPS ========== */}
            <rect
              x="262"
              y="246"
              width="148"
              height="136"
              rx="20"
              fill="#1f160f"
              stroke="#ca8a04"
              strokeWidth="2"
            />
            <g fill="#b45309">
              <rect x="291" y="276" width="38" height="12" rx="6" />
              <rect x="335" y="276" width="44" height="12" rx="6" />
              <rect x="302" y="294" width="48" height="12" rx="6" />
              <rect x="356" y="294" width="24" height="12" rx="6" />
              <rect x="290" y="312" width="42" height="12" rx="6" />
              <rect x="338" y="312" width="40" height="12" rx="6" />
            </g>
            <text x="336" y="362" textAnchor="middle" fill="#fef08a" fontSize="14" fontWeight="800">
              Woodchips
            </text>

            {/* ========== STAGE 3: CARBON FILTERS (HERO GLASS CHAMBERS) ========== */}
            <rect
              x="442"
              y="218"
              width="266"
              height="182"
              rx="22"
              fill="#151029"
              stroke={isSwap ? "#f43f5e" : "#a855f7"}
              strokeWidth="2.6"
              filter="url(#glowSoft)"
            />

            <text
              x="575"
              y="244"
              textAnchor="middle"
              fill="#f5d0fe"
              fontSize="14.5"
              fontWeight="900"
              letterSpacing="0.03em"
            >
              Carbon Filters
            </text>

            {/* Animated Swap Icon above filters when swapping */}
            {isSwap && (
              <g transform="translate(668, 225)" stroke="#fb7185" strokeWidth="2.5" fill="none" strokeLinecap="round">
                <g transform={`rotate(${(clock * 140) % 360} 10 10)`}>
                  <path d="M 16 4 A 8 8 0 1 1 4 10" />
                  <polyline points="12,4 16,4 16,8" />
                </g>
              </g>
            )}

            {/* 3 Glass Filter Cylinders with Liquid Gradient + Specular Shine + Truth Line */}
            {bars.map((b, idx) => {
              const wave = Math.sin(clock * 2.5 + idx * 1.4) * 1.6;
              return (
                <g key={b.id}>
                  {/* Glass Tube */}
                  <rect
                    x={b.x}
                    y={258}
                    width="54"
                    height="94"
                    rx="11"
                    fill="#080a14"
                    stroke="rgba(255,255,255,0.20)"
                    strokeWidth="1.5"
                  />
                  {/* Liquid Fill */}
                  <rect
                    x={b.x + 3}
                    y={349 - b.h + wave}
                    width="48"
                    height={Math.max(4, b.h - wave)}
                    rx="8"
                    fill={barGradientId(b.frac)}
                  />
                  {/* Glass Specular Highlight */}
                  <rect
                    x={b.x + 3}
                    y={260}
                    width="18"
                    height="90"
                    rx="7"
                    fill="url(#glassShine)"
                  />
                  {/* Real Hidden Filter Dashed Line */}
                  <line
                    x1={b.x - 2}
                    y1={349 - b.hr}
                    x2={b.x + 56}
                    y2={349 - b.hr}
                    stroke="#ffffff"
                    strokeWidth="2.5"
                    strokeDasharray="4 3"
                  />
                  {/* Clean Percentage */}
                  <text
                    x={b.x + 27}
                    y={376}
                    textAnchor="middle"
                    fill="#e2e8f0"
                    fontSize="12.5"
                    fontWeight="800"
                    fontFamily="monospace"
                  >
                    {Math.round(b.frac * 100)}%
                  </text>
                </g>
              );
            })}

            {/* ========== STAGE 4: CLEAN WATER ========== */}
            <rect
              x="778"
              y="246"
              width="146"
              height="136"
              rx="20"
              fill="#072036"
              stroke="#22d3ee"
              strokeWidth="2.2"
              filter="url(#glowSoft)"
            />
            <path
              d="M 851 268 C 851 268 829 296 829 312 A 22 22 0 0 0 873 312 C 873 296 851 268 851 268 Z"
              fill="#22d3ee"
              filter="url(#glowStrong)"
            />
            <polyline
              points="842,312 849,319 861,305"
              fill="none"
              stroke="#083344"
              strokeWidth="3.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <text x="851" y="362" textAnchor="middle" fill="#e0f2fe" fontSize="14" fontWeight="800">
              Clean Water
            </text>
          </g>

          {/* Outer Glass Border */}
          <rect
            x="2"
            y="2"
            width="956"
            height="466"
            rx="24"
            fill="none"
            stroke="rgba(255,255,255,0.12)"
            strokeWidth="1.5"
          />
        </svg>
      </div>

      {/* CLEAN BOTTOM TIMELINE + SINGLE HEADLINE IMPACT */}
      <footer className="relative z-10 mx-auto w-full max-w-5xl space-y-3">
        <div className="flex items-center justify-between gap-1.5 sm:gap-2">
          {MONTHS.map((m, idx) => {
            const active = idx === activeMonth;
            return (
              <button
                key={m}
                onClick={() => setProgress(idx / (MONTHS.length - 1))}
                className={`flex-1 rounded-full py-1.5 text-center text-xs font-bold transition ${
                  active
                    ? "bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white shadow-lg shadow-purple-700/40"
                    : "bg-white/5 text-slate-400 hover:bg-white/10"
                }`}
              >
                {m}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-xs text-slate-300">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              <strong className="font-mono text-sm text-purple-300">
                {sim.twinPct}%
              </strong>{" "}
              caught with Digital Twin
            </span>
            <span className="text-slate-600">vs.</span>
            <span>
              <strong className="font-mono text-sm text-slate-400">
                {sim.fixedPct}%
              </strong>{" "}
              swapping once a year
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-400">
            <span>Color bar = Twin &middot; Dashed line = Real filter</span>
            <Link href="/charts" className="text-purple-300 hover:underline">
              Graphs
            </Link>
            <Link href="/whatif" className="text-purple-300 hover:underline">
              Compare
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
