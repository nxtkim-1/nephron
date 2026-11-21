"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { simulateSeason } from "~/lib/simulator";

// Calm 52-second full-season loop (Apr -> Oct).
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
  // Backed by our real NEPHRON hourly simulation & self-correcting twin.
  const sim = useMemo(() => {
    const twin = simulateSeason({ seed: 42, swapStrategy: "twin_guided" });
    const fixed = simulateSeason({ seed: 42, swapStrategy: "fixed_annual" });

    const stride = 24;
    const frames = [];
    for (let i = 0; i < twin.readings.length; i += stride) {
      const r = twin.readings[i]!;
      const tw = twin.twinStates[i]!;
      const tr = twin.truthStates[i]!;
      frames.push({
        monthIdx: r.ts.getUTCMonth() + 1,
        flow: r.flowLps,
        rain: r.rainForecastMm24h,
        twinC1: tw.estCapacityUsedC1,
        twinC2: tw.estCapacityUsedC2,
        twinP: tw.estCapacityUsedPolish,
        truthC1: tr.estCapacityUsedC1,
        truthC2: tr.estCapacityUsedC2,
        truthP: tr.estCapacityUsedPolish,
        // Weekly water sample check (every 7 days)
        waterCheck: i > 0 && i % 168 < stride,
      });
    }

    return {
      frames,
      twinPct: Math.round(twin.summary.percentAtrazineRemoved),
      fixedPct: Math.round(fixed.summary.percentAtrazineRemoved),
    };
  }, []);

  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0.2); // Start in May spray season
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
  const isSprayHeavy = f0.monthIdx >= 5 && f0.monthIdx <= 7; // May–Jul peak pesticide
  const isSwap = isTreat && c1 >= 0.78;
  const isWaterCheck = isTreat && f0.waterCheck;
  const activeMonth = Math.min(6, Math.max(0, f0.monthIdx - 4));

  // Calm motion phases
  const flowSpeed = isStorm ? 0.2 : 0.12;
  const pesticideDots = [0, 0.16, 0.32, 0.48, 0.64, 0.8].map(
    (o) => (clock * flowSpeed + o) % 1,
  );
  const cleanDrops = [0, 0.25, 0.5, 0.75].map(
    (o) => (clock * flowSpeed + o) % 1,
  );
  const soilSeepDots = [0, 0.33, 0.66].map((o) => (clock * 0.28 + o) % 1);
  const wifiPulse = (clock * 0.42) % 1;
  const sway = Math.sin(clock * 1.3) * 2.2;

  const cropScale = 0.68 + 0.42 * Math.sin(Math.min(1, progress * 1.15) * Math.PI * 0.65);
  const cropColor = !isTreat ? "#d97706" : progress > 0.72 ? "#84cc16" : "#22c55e";

  const maxH = 84;
  const bars = [
    { id: "1", x: 468, h: Math.max(8, c1 * maxH), hr: Math.max(8, c1R * maxH), frac: c1 },
    { id: "2", x: 544, h: Math.max(8, c2 * maxH), hr: Math.max(8, c2R * maxH), frac: c2 },
    { id: "3", x: 620, h: Math.max(8, p * maxH), hr: Math.max(8, pR * maxH), frac: p },
  ];

  // Friendly short message on the farmer's phone screen.
  const phoneMsg = !isTreat
    ? { text: "Winter Rest", color: "#fbbf24" }
    : isSwap
      ? { text: "Swap Filter 1!", color: "#fb7185" }
      : isStorm
        ? { text: "Storm Active", color: "#60a5fa" }
        : { text: "All Clean ✓", color: "#34d399" };

  return (
    <div className="relative flex min-h-screen flex-col justify-between overflow-hidden bg-[#06070d] px-4 pt-5 pb-12 text-slate-100 sm:px-8 sm:pt-6 sm:pb-8">
      {/* Subtle purple ambient glow */}
      <div
        className="pointer-events-none absolute -top-44 left-1/2 h-[400px] w-[820px] -translate-x-1/2 rounded-full opacity-22 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(168,85,247,0.75) 0%, rgba(34,211,238,0.16) 55%, transparent 78%)",
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
            className="rounded-full border border-white/15 bg-white/5 px-3.5 py-1 text-xs font-semibold text-slate-200 transition hover:bg-white/15"
          >
            {paused ? "Play" : "Pause"}
          </button>
        </div>
      </header>

      {/* CENTERPIECE: SIMPLE, ICON-DRIVEN VISUAL LOOP */}
      <div className="relative z-10 mx-auto my-3 flex w-full max-w-5xl flex-1 items-center justify-center">
        <svg
          viewBox="0 0 960 470"
          className="h-auto max-h-[70vh] w-full drop-shadow-[0_24px_60px_rgba(0,0,0,0.65)]"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="skyAtmos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isStorm ? "#131a30" : !isTreat ? "#1a1529" : "#0e1730"} />
              <stop offset="100%" stopColor="#090d1a" />
            </linearGradient>
            <linearGradient id="soilTop" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#2a1e15" />
              <stop offset="45%" stopColor="#1c140e" />
              <stop offset="100%" stopColor="#100b08" />
            </linearGradient>
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
            <radialGradient id="sunAura" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#fde047" stopOpacity="0.55" />
              <stop offset="55%" stopColor="#f59e0b" stopOpacity="0.14" />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
            </radialGradient>
            <filter id="glowSoft" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <clipPath id="frameClip">
              <rect x="2" y="2" width="956" height="466" rx="24" />
            </clipPath>
          </defs>

          <g clipPath="url(#frameClip)">
            {/* Sky & Organic Soil Layers */}
            <rect x="2" y="2" width="956" height="198" fill="url(#skyAtmos)" />
            <rect x="2" y="196" width="956" height="272" fill="url(#soilTop)" />
            <path d="M 2 292 Q 260 278 500 294 T 958 286 V 468 H 2 Z" fill="#150f0b" opacity="0.7" />
            <path d="M 0 198 Q 220 191 480 198 T 960 196 L 960 206 L 0 206 Z" fill={isTreat ? "#15803d" : "#854d0e"} opacity="0.75" />
            <path d="M 0 197 Q 220 190 480 197 T 960 195" fill="none" stroke={isTreat ? "#22c55e" : "#ca8a04"} strokeWidth="3.2" />

            {/* ========== WEATHER (Sun or Storm Cloud) ========== */}
            {isStorm ? (
              <g transform="translate(52, 24)">
                <path
                  d="M 22 44 a 20 20 0 0 1 38 -7 a 24 24 0 0 1 44 8 a 16 16 0 0 1 2 30 h -84 a 15 15 0 0 1 0 -31 z"
                  fill="#475569"
                  stroke="#94a3b8"
                  strokeOpacity="0.35"
                />
                {[28, 48, 68, 88, 104].map((rx, idx) => {
                  const dy = (clock * 48 + idx * 17) % 52;
                  return (
                    <line
                      key={rx}
                      x1={rx}
                      y1={80 + dy}
                      x2={rx - 5}
                      y2={93 + dy}
                      stroke="#60a5fa"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      opacity={0.9 * (1 - dy / 54)}
                    />
                  );
                })}
              </g>
            ) : (
              <g transform="translate(106, 66)">
                <circle cx="0" cy="0" r="52" fill="url(#sunAura)" />
                <circle cx="0" cy="0" r="18" fill="#fde047" />
                {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
                  const rad = ((deg + clock * 7) * Math.PI) / 180;
                  return (
                    <line
                      key={deg}
                      x1={Math.cos(rad) * 25}
                      y1={Math.sin(rad) * 25}
                      x2={Math.cos(rad) * 33}
                      y2={Math.sin(rad) * 33}
                      stroke="#fde047"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      opacity="0.7"
                    />
                  );
                })}
              </g>
            )}

            {/* ========== FARM CROPS + PESTICIDE WASHING INTO SOIL ========== */}
            {[42, 76, 110, 144, 178].map((cx, i) => {
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

            {/* Glowing Magenta/Purple Pesticide (Atrazine) dots seeping from field -> underground runoff */}
            {isTreat &&
              soilSeepDots.map((d, idx) => {
                const sx = 72 + idx * 34;
                const sy = 196 + d * 56;
                return (
                  <circle
                    key={idx}
                    cx={sx}
                    cy={sy}
                    r={isSprayHeavy ? 5.2 : 3.4}
                    fill="#e879f9"
                    filter="url(#glowSoft)"
                    opacity={1 - d * 0.4}
                  />
                );
              })}

            {/* Clean Pesticide Legend Pill right above the field */}
            <g transform="translate(26, 134)">
              <rect x="0" y="0" width="166" height="24" rx="12" fill="rgba(232,121,249,0.14)" stroke="rgba(232,121,249,0.45)" />
              <circle cx="15" cy="12" r="5" fill="#e879f9" filter="url(#glowSoft)" />
              <text x="27" y="16" fill="#f5d0fe" fontSize="11" fontWeight="700">
                Pesticide (Atrazine)
              </text>
            </g>

            {/* ========== TOP CENTER-RIGHT: PHONE (DIGITAL TWIN) + HAPPY FARMER ========== */}
            <g transform="translate(456, 20)">
              {/* Phone Body (Digital Twin) */}
              <rect
                x="0"
                y="0"
                width="106"
                height="148"
                rx="18"
                fill="#0b0f1e"
                stroke={isSwap ? "#fb7185" : "#a855f7"}
                strokeWidth="2.8"
                filter="url(#glowSoft)"
              />
              {/* Phone Speaker Notch */}
              <rect x="36" y="8" width="34" height="4" rx="2" fill="#334155" />

              {/* Phone Screen Content */}
              <text x="53" y="27" textAnchor="middle" fill="#d8b4fe" fontSize="9.5" fontWeight="900" letterSpacing="0.06em">
                DIGITAL TWIN
              </text>

              {/* 3 Live Mini Filter Bars on the Phone Screen */}
              {bars.map((b, idx) => (
                <g key={b.id} transform={`translate(${18 + idx * 25}, 38)`}>
                  <rect x="0" y="0" width="20" height="58" rx="5" fill="#1e293b" />
                  <rect
                    x="2"
                    y={56 - Math.max(5, b.frac * 54)}
                    width="16"
                    height={Math.max(5, b.frac * 54)}
                    rx="3"
                    fill={barGradientId(b.frac)}
                  />
                </g>
              ))}

              {/* Simple Status Badge on Phone Screen */}
              <rect
                x="11"
                y="108"
                width="84"
                height="24"
                rx="12"
                fill="rgba(255,255,255,0.07)"
                stroke={phoneMsg.color}
                strokeWidth="1.4"
              />
              <text
                x="53"
                y="124"
                textAnchor="middle"
                fill={phoneMsg.color}
                fontSize="10.5"
                fontWeight="800"
              >
                {phoneMsg.text}
              </text>
            </g>

            {/* ========== HAPPY FARMER NEXT TO THE PHONE ========== */}
            <g transform="translate(612, 34)">
              {/* Friendly Speech Bubble */}
              <rect
                x="62"
                y="2"
                width="148"
                height="34"
                rx="14"
                fill="rgba(255,255,255,0.08)"
                stroke="rgba(255,255,255,0.2)"
              />
              <text x="136" y="23" textAnchor="middle" fill="#f8fafc" fontSize="11.5" fontWeight="700">
                {isSwap ? "Time to swap Filter 1!" : !isTreat ? "Filters resting!" : "Water looks great!"}
              </text>

              {/* Straw Farmer Hat */}
              <ellipse cx="36" cy="40" rx="34" ry="7" fill="#eab308" />
              <path d="M 16 38 Q 18 16 36 16 Q 54 16 56 38 Z" fill="#facc15" />
              <rect x="17" y="33" width="38" height="4" rx="2" fill="#9333ea" />

              {/* Happy Face */}
              <circle cx="36" cy="59" r="20" fill="#fde68a" />
              {/* Eyes */}
              <circle cx="29" cy="56" r="2.4" fill="#1e293b" />
              <circle cx="43" cy="56" r="2.4" fill="#1e293b" />
              {/* Warm Big Smile */}
              <path
                d="M 27 65 Q 36 74 45 65"
                fill="none"
                stroke="#1e293b"
                strokeWidth="2.8"
                strokeLinecap="round"
              />
              {/* Rosy cheeks */}
              <circle cx="23" cy="63" r="3" fill="#fb7185" opacity="0.45" />
              <circle cx="49" cy="63" r="3" fill="#fb7185" opacity="0.45" />

              {/* Overalls / Shoulders */}
              <path
                d="M 8 134 Q 10 86 36 86 Q 62 86 64 134 Z"
                fill="#2563eb"
              />
              {/* Green plaid shirt collar */}
              <path d="M 23 88 L 36 104 L 49 88 Z" fill="#22c55e" />
              {/* Overall straps & buttons */}
              <rect x="21" y="92" width="6" height="42" fill="#1d4ed8" />
              <rect x="45" y="92" width="6" height="42" fill="#1d4ed8" />
              <circle cx="24" cy="108" r="2.5" fill="#fde047" />
              <circle cx="48" cy="108" r="2.5" fill="#fde047" />

              {/* Label underneath farmer */}
              <text x="36" y="152" textAnchor="middle" fill="#cbd5e1" fontSize="11.5" fontWeight="700">
                Happy Farmer
              </text>
            </g>

            {/* ========== WI-FI SIGNAL FROM BURIED FILTERS UP TO PHONE ========== */}
            <g transform="translate(509, 186)" stroke="#c084fc" strokeWidth="2.4" fill="none" strokeLinecap="round">
              <path d="M -16 -2 A 22 22 0 0 1 16 -2" opacity={0.25 + 0.75 * Math.sin(wifiPulse * Math.PI)} />
              <path d="M -10 5 A 13 13 0 0 1 10 5" opacity={0.5 + 0.5 * Math.sin(wifiPulse * Math.PI)} />
              <circle cx="0" cy="12" r="3" fill="#e9d5ff" stroke="none" />
            </g>

            {/* ========== SIMPLE WEEKLY WATER SAMPLE CHECK (Only glows briefly when synced) ========== */}
            <g transform="translate(812, 134)" opacity={isWaterCheck ? 1 : 0.4}>
              <rect
                x="0"
                y="0"
                width="124"
                height="44"
                rx="12"
                fill="rgba(251,146,60,0.14)"
                stroke="#fb923c"
                strokeWidth={isWaterCheck ? "2" : "1.2"}
              />
              {/* Water Sample Bottle Icon */}
              <g transform="translate(13, 9)" stroke="#fb923c" strokeWidth="2" fill="none" strokeLinejoin="round">
                <rect x="4" y="0" width="8" height="4" rx="1" />
                <path d="M 4 4 L 1 10 V 23 A 2 2 0 0 0 3 25 H 13 A 2 2 0 0 0 15 23 V 10 L 12 4 Z" />
                <line x1="2" y1="16" x2="14" y2="16" stroke="#38bdf8" />
              </g>
              <text x="38" y="19" fill="#fed7aa" fontSize="10.5" fontWeight="800">
                Water Sample
              </text>
              <text x="38" y="33" fill="#fb923c" fontSize="9.5" fontWeight="600">
                {isWaterCheck ? "Twin updated!" : "Checks twin"}
              </text>
            </g>

            {/* ========== UNDERGROUND PIPES ========== */}
            <line x1="28" y1="316" x2="932" y2="316" stroke="#141926" strokeWidth="28" strokeLinecap="round" />

            {/* Clean water base tint in pipe (purple-tinted left -> crystal cyan right) */}
            <line
              x1="34"
              y1="316"
              x2="450"
              y2="316"
              stroke={isTreat ? "#6366f1" : "#334155"}
              strokeWidth="12"
              strokeLinecap="round"
              opacity={isTreat ? 0.38 : 0.3}
            />
            <line
              x1="704"
              y1="316"
              x2="926"
              y2="316"
              stroke={isTreat ? "#22d3ee" : "#334155"}
              strokeWidth="12"
              strokeLinecap="round"
              opacity={isTreat ? 0.55 : 0.3}
            />

            {/* Bypass Pipe (lights up amber only in October Off-Season) */}
            <path
              d="M 218 340 V 426 Q 218 438 232 438 H 736 Q 750 438 750 426 V 340"
              fill="none"
              stroke={isTreat ? "#181d2b" : "#f59e0b"}
              strokeWidth={isTreat ? "9" : "14"}
              strokeLinecap="round"
              opacity={isTreat ? 0.55 : 0.9}
            />
            {!isTreat && (
              <text x="484" y="424" textAnchor="middle" fill="#fde68a" fontSize="12" fontWeight="800">
                BYPASS OPEN &middot; FILTERS RESTING
              </text>
            )}

            {/* ========== ANIMATED PESTICIDE PARTICLES (TRAPPED BY CARBON FILTERS!) ========== */}
            {isTreat &&
              pesticideDots.map((d, idx) => {
                // Pesticide dots travel from Runoff (x=45) -> Woodchips -> INTO Carbon Filters (x=540), where they get trapped and disappear!
                const px = 45 + d * 480;
                const py = 316 + Math.sin(d * Math.PI * 6 + idx * 1.3) * 4;
                const fadeOut = px > 455 ? Math.max(0, 1 - (px - 455) / 70) : 1;
                return (
                  <circle
                    key={`pest-${idx}`}
                    cx={px}
                    cy={py}
                    r={isSprayHeavy ? 5.6 : 4.2}
                    fill="#e879f9"
                    filter="url(#glowSoft)"
                    opacity={fadeOut}
                  />
                );
              })}

            {/* ========== CLEAN CYAN WATER DROPS LEAVING CARBON FILTERS ========== */}
            {cleanDrops.map((d, idx) => {
              if (!isTreat) {
                return (
                  <circle
                    key={`byp-${idx}`}
                    cx={234 + d * 500}
                    cy={438}
                    r="5.5"
                    fill="#fde047"
                  />
                );
              }
              const cx = 708 + d * 212;
              return (
                <circle
                  key={`clean-${idx}`}
                  cx={cx}
                  cy={316 + Math.sin(d * Math.PI * 4 + idx) * 2.5}
                  r="5"
                  fill="#67e8f9"
                  filter="url(#glowSoft)"
                />
              );
            })}

            {/* ========== STAGE 1: FARM RUNOFF (With Pesticide Dots Inside!) ========== */}
            <rect x="36" y="246" width="144" height="136" rx="20" fill="#121428" stroke="#e879f9" strokeWidth="2" />
            {/* Water drop + purple pesticide dots */}
            <path
              d="M 108 266 C 108 266 87 294 87 309 A 21 21 0 0 0 129 309 C 129 294 108 266 108 266 Z"
              fill="#6366f1"
              opacity="0.85"
            />
            <circle cx="101" cy="306" r="4" fill="#f0abfc" />
            <circle cx="115" cy="312" r="3.5" fill="#f0abfc" />
            <circle cx="109" cy="295" r="3.5" fill="#f0abfc" />
            <text x="108" y="356" textAnchor="middle" fill="#f5d0fe" fontSize="13.5" fontWeight="800">
              Farm Runoff
            </text>
            <text x="108" y="372" textAnchor="middle" fill="#e879f9" fontSize="10.5" fontWeight="700">
              With Pesticide
            </text>

            {/* ========== SEASONAL GATE VALVE ========== */}
            <g transform="translate(218, 316)">
              <circle cx="0" cy="0" r="22" fill="#0b0e19" stroke={isTreat ? "#22c55e" : "#f59e0b"} strokeWidth="2.8" />
              <g transform={`rotate(${isTreat ? 0 : 90})`} style={{ transition: "transform 700ms ease" }}>
                <line x1="-11" y1="0" x2="10" y2="0" stroke={isTreat ? "#4ade80" : "#fbbf24"} strokeWidth="3.5" strokeLinecap="round" />
                <polygon points="6,-6 14,0 6,6" fill={isTreat ? "#4ade80" : "#fbbf24"} />
              </g>
            </g>

            {/* ========== STAGE 2: WOODCHIPS ========== */}
            <rect x="262" y="246" width="144" height="136" rx="20" fill="#1f160f" stroke="#ca8a04" strokeWidth="2" />
            <g fill="#b45309">
              <rect x="289" y="274" width="38" height="12" rx="6" />
              <rect x="333" y="274" width="44" height="12" rx="6" />
              <rect x="300" y="292" width="48" height="12" rx="6" />
              <rect x="354" y="292" width="24" height="12" rx="6" />
              <rect x="288" y="310" width="42" height="12" rx="6" />
              <rect x="336" y="310" width="40" height="12" rx="6" />
            </g>
            <text x="334" y="356" textAnchor="middle" fill="#fef08a" fontSize="13.5" fontWeight="800">
              Woodchips
            </text>
            <text x="334" y="372" textAnchor="middle" fill="#fcd34d" fontSize="10.5">
              Cuts Fertilizer
            </text>

            {/* ========== STAGE 3: CARBON FILTERS (TRAPS PESTICIDE!) ========== */}
            <rect
              x="438"
              y="222"
              width="266"
              height="178"
              rx="22"
              fill="#151029"
              stroke={isSwap ? "#fb7185" : "#a855f7"}
              strokeWidth="2.6"
              filter="url(#glowSoft)"
            />
            <text x="571" y="246" textAnchor="middle" fill="#f5d0fe" fontSize="14" fontWeight="900">
              Carbon Filters (Traps Pesticide)
            </text>

            {bars.map((b, idx) => {
              const wave = Math.sin(clock * 2.4 + idx * 1.4) * 1.5;
              return (
                <g key={b.id}>
                  <rect x={b.x} y={260} width="54" height="92" rx="11" fill="#080a14" stroke="rgba(255,255,255,0.20)" strokeWidth="1.5" />
                  <rect x={b.x + 3} y={349 - b.h + wave} width="48" height={Math.max(4, b.h - wave)} rx="8" fill={barGradientId(b.frac)} />
                  <rect x={b.x + 3} y={262} width="18" height="88" rx="7" fill="url(#glassShine)" />
                  {/* Real hidden filter dashed line */}
                  <line x1={b.x - 2} y1={349 - b.hr} x2={b.x + 56} y2={349 - b.hr} stroke="#ffffff" strokeWidth="2.5" strokeDasharray="4 3" />
                  <text x={b.x + 27} y={376} textAnchor="middle" fill="#e2e8f0" fontSize="12.5" fontWeight="800" fontFamily="monospace">
                    {Math.round(b.frac * 100)}%
                  </text>
                </g>
              );
            })}

            {/* ========== STAGE 4: CLEAN WATER ========== */}
            <rect x="776" y="246" width="148" height="136" rx="20" fill="#072036" stroke="#22d3ee" strokeWidth="2.2" filter="url(#glowSoft)" />
            <path
              d="M 850 266 C 850 266 828 294 828 310 A 22 22 0 0 0 872 310 C 872 294 850 266 850 266 Z"
              fill="#22d3ee"
              filter="url(#glowSoft)"
            />
            <polyline points="841,310 848,317 860,303" fill="none" stroke="#083344" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
            <text x="850" y="356" textAnchor="middle" fill="#e0f2fe" fontSize="13.5" fontWeight="800">
              Clean Water
            </text>
            <text x="850" y="372" textAnchor="middle" fill="#67e8f9" fontSize="10.5" fontWeight="700">
              Pesticide Removed
            </text>
          </g>

          {/* Outer Glass Frame Border */}
          <rect x="2" y="2" width="956" height="466" rx="24" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="1.5" />
        </svg>
      </div>

      {/* CLEAN BOTTOM TIMELINE + HEADLINE IMPACT */}
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
              pesticide caught with Digital Twin
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
            <span>Color bar = Phone Twin &middot; Dashed line = Real buried filter</span>
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
