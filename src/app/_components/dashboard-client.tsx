"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { simulateSeason } from "~/lib/simulator";

// Slow, calm loop: 48 seconds for a full Apr -> Oct year so viewers can follow easily.
const LOOP_DURATION_SEC = 48;

const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"] as const;

function barColor(frac: number) {
  if (frac >= 0.8) return "#f43f5e"; // red = swap soon
  if (frac >= 0.55) return "#f59e0b"; // amber = filling
  return "#10b981"; // green = fresh
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export function DashboardClient() {
  // Backed by the real physical model & simulator (deterministic seed #42).
  const sim = useMemo(() => {
    const twin = simulateSeason({ seed: 42, swapStrategy: "twin_guided" });
    const fixed = simulateSeason({ seed: 42, swapStrategy: "fixed_annual" });

    // 1 frame per day (214 frames) so transitions glide calmly without jitter.
    const stride = 24;
    const frames = [];
    for (let i = 0; i < twin.readings.length; i += stride) {
      const r = twin.readings[i]!;
      const tw = twin.twinStates[i]!;
      const tr = twin.truthStates[i]!;
      frames.push({
        monthIdx: r.ts.getUTCMonth() + 1, // 4..10
        flow: r.flowLps,
        rain: r.rainForecastMm24h,
        twinC1: tw.estCapacityUsedC1,
        twinC2: tw.estCapacityUsedC2,
        twinP: tw.estCapacityUsedPolish,
        truthC1: tr.estCapacityUsedC1,
        truthC2: tr.estCapacityUsedC2,
        truthP: tr.estCapacityUsedPolish,
        // Weekly lab sync window (every 7 days)
        labSync: i > 0 && i % 168 < stride,
      });
    }

    return {
      frames,
      twinPct: Math.round(twin.summary.percentAtrazineRemoved),
      fixedPct: Math.round(fixed.summary.percentAtrazineRemoved),
    };
  }, []);

  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0.2); // Start smoothly in May
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
  const c1 = lerp(f0.twinC1, f1.twinC1, t);
  const c2 = lerp(f0.twinC2, f1.twinC2, t);
  const p = lerp(f0.twinP, f1.twinP, t);
  const c1Real = lerp(f0.truthC1, f1.truthC1, t);
  const c2Real = lerp(f0.truthC2, f1.truthC2, t);
  const pReal = lerp(f0.truthP, f1.truthP, t);

  const isTreat = f0.monthIdx < 10;
  const isStorm = flow > 1.3 || rain > 12;
  const isSwap = isTreat && c1 >= 0.78;
  const isLab = isTreat && f0.labSync;
  const activeMonth = Math.min(6, Math.max(0, f0.monthIdx - 4));

  // Gentle, slow droplet motion.
  const dropSpeed = isStorm ? 0.22 : 0.13;
  const drops = [0, 0.25, 0.5, 0.75].map((o) => (clock * dropSpeed + o) % 1);
  const pulsePhase = (clock * 0.35) % 1;

  // Bar heights inside 88px containers.
  const maxH = 82;
  const h1 = Math.max(6, c1 * maxH);
  const h2 = Math.max(6, c2 * maxH);
  const hp = Math.max(6, p * maxH);
  const hr1 = Math.max(6, c1Real * maxH);
  const hr2 = Math.max(6, c2Real * maxH);
  const hrp = Math.max(6, pReal * maxH);

  // Simple universal status label (3-5 words max).
  const status = !isTreat
    ? { label: "Winter Rest · Bypass", color: "#f59e0b" }
    : isSwap
      ? { label: "Swap Filter 1 Soon", color: "#f43f5e" }
      : isLab
        ? { label: "Lab Test Synced", color: "#fb923c" }
        : isStorm
          ? { label: "Storm · Cleaning Active", color: "#60a5fa" }
          : { label: "Cleaning · All Good", color: "#10b981" };

  return (
    <div className="relative flex min-h-screen flex-col justify-between overflow-hidden bg-[#090a12] px-5 py-5 text-slate-100 sm:px-10 sm:py-6">
      {/* Soft ambient glow */}
      <div
        className="pointer-events-none absolute -top-36 left-1/2 h-[380px] w-[720px] -translate-x-1/2 rounded-full opacity-20 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, rgba(168,85,247,0.8) 0%, rgba(34,211,238,0.15) 60%, transparent 80%)",
        }}
      />

      {/* Clean Minimal Title */}
      <header className="relative z-10 mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="rounded-md bg-purple-600 px-2.5 py-0.5 text-xs font-black tracking-widest text-white">
              NEPHRON
            </span>
            <h1 className="text-base font-bold text-white sm:text-xl">
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
            className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-slate-200 hover:bg-white/15"
          >
            {paused ? "Play" : "Pause"}
          </button>
        </div>
      </header>

      {/* CENTERPIECE: ICON-FIRST, SLOW, CALM VISUAL */}
      <div className="relative z-10 mx-auto my-3 flex w-full max-w-5xl flex-1 items-center justify-center">
        <svg
          viewBox="0 0 960 440"
          className="h-auto max-h-[68vh] w-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="bgSky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#121528" />
              <stop offset="100%" stopColor="#0d101f" />
            </linearGradient>
            <linearGradient id="bgSoil" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#221912" />
              <stop offset="100%" stopColor="#120e0b" />
            </linearGradient>
            <filter id="softGlow" x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Outer Frame */}
          <rect
            x="2"
            y="2"
            width="956"
            height="436"
            rx="22"
            fill="url(#bgSky)"
            stroke="rgba(255,255,255,0.09)"
            strokeWidth="1.5"
          />

          {/* Soil Half */}
          <path
            d="M 2 186 H 958 V 416 Q 958 438 936 438 H 24 Q 2 438 2 416 Z"
            fill="url(#bgSoil)"
          />
          <line x1="2" y1="186" x2="958" y2="186" stroke="#22c55e" strokeWidth="3.5" />

          {/* ========== UNIVERSAL WEATHER SYMBOL (Sun or Rain Cloud) ========== */}
          {isStorm ? (
            <g transform="translate(62, 48)">
              <path
                d="M 16 32 a 18 18 0 0 1 34 -6 a 22 22 0 0 1 40 7 a 15 15 0 0 1 2 28 h -76 a 14 14 0 0 1 0 -29 z"
                fill="#64748b"
              />
              {[24, 46, 68].map((rx, idx) => {
                const dy = (clock * 46 + idx * 14) % 34;
                return (
                  <line
                    key={rx}
                    x1={rx}
                    y1={68 + dy}
                    x2={rx - 4}
                    y2={78 + dy}
                    stroke="#60a5fa"
                    strokeWidth="2.8"
                    strokeLinecap="round"
                    opacity={1 - dy / 36}
                  />
                );
              })}
            </g>
          ) : (
            <g transform="translate(106, 76)">
              <circle cx="0" cy="0" r="18" fill="#fbbf24" opacity="0.9" />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                <line
                  key={deg}
                  x1={Math.cos((deg * Math.PI) / 180) * 24}
                  y1={Math.sin((deg * Math.PI) / 180) * 24}
                  x2={Math.cos((deg * Math.PI) / 180) * 31}
                  y2={Math.sin((deg * Math.PI) / 180) * 31}
                  stroke="#fbbf24"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  opacity="0.7"
                />
              ))}
            </g>
          )}

          {/* Simple Green Sprouts on Left */}
          {[56, 94, 132].map((sx) => (
            <g key={sx} stroke={isTreat ? "#22c55e" : "#ca8a04"} strokeWidth="2.8" strokeLinecap="round">
              <line x1={sx} y1="186" x2={sx} y2="158" />
              <line x1={sx} y1="173" x2={sx - 9} y2="164" />
              <line x1={sx} y1="168" x2={sx + 9} y2="159" />
            </g>
          ))}

          {/* ========== TOP CENTER: DIGITAL TWIN (UNIVERSAL SYMBOLS) ========== */}
          <rect
            x="295"
            y="26"
            width="370"
            height="100"
            rx="18"
            fill="rgba(126, 34, 206, 0.24)"
            stroke={isLab ? "#fb923c" : "#a855f7"}
            strokeWidth="2.2"
            filter="url(#softGlow)"
          />

          {/* Universal Digital Twin Icon: Interlocking Mirrored Cubes / Layers */}
          <g transform="translate(324, 52)" stroke="#e9d5ff" strokeWidth="2.2" fill="none" strokeLinejoin="round">
            <rect x="0" y="6" width="24" height="24" rx="5" fill="rgba(168,85,247,0.35)" />
            <rect x="12" y="16" width="24" height="24" rx="5" fill="rgba(56,189,248,0.22)" stroke="#38bdf8" />
          </g>

          <text x="378" y="68" fill="#ffffff" fontSize="18" fontWeight="900" letterSpacing="0.06em">
            DIGITAL TWIN
          </text>

          {/* Status Indicator Dot + 3-word Plain Status */}
          <circle cx="385" cy="94" r="6" fill={status.color} />
          <text x="399" y="99" fill="#e2e8f0" fontSize="14" fontWeight="700">
            {status.label}
          </text>

          {/* Universal Alert Icon on right inside Twin Box */}
          {isSwap && (
            <g transform="translate(612, 58)" stroke="#f43f5e" strokeWidth="2.8" fill="none" strokeLinecap="round">
              <path d="M 18 4 A 14 14 0 1 1 6 12" />
              <polyline points="12,4 18,4 18,10" />
            </g>
          )}
          {!isSwap && isLab && (
            <g transform="translate(614, 56)" stroke="#fb923c" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M 8 2 H 18 M 10 2 V 12 L 4 24 A 3 3 0 0 0 7 28 H 19 A 3 3 0 0 0 22 24 L 16 12 V 2" />
              <line x1="7" y1="21" x2="19" y2="21" stroke="#fb923c" />
            </g>
          )}
          {!isSwap && !isLab && isTreat && (
            <g transform="translate(614, 62)" stroke="#10b981" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="2,14 10,22 24,6" />
            </g>
          )}

          {/* ========== UNIVERSAL WI-FI SENSOR WAVES (Rising from Unit to Twin) ========== */}
          <g transform="translate(390, 148)" stroke="#c084fc" strokeWidth="2.2" fill="none" strokeLinecap="round">
            <path d="M -16 8 A 22 22 0 0 1 16 8" opacity={0.35 + 0.65 * Math.sin(pulsePhase * Math.PI)} />
            <path d="M -10 15 A 13 13 0 0 1 10 15" opacity={0.55 + 0.45 * Math.sin(pulsePhase * Math.PI)} />
            <circle cx="0" cy="22" r="3" fill="#c084fc" stroke="none" />
          </g>
          <text x="390" y="142" textAnchor="middle" fill="#c084fc" fontSize="11" fontWeight="700">
            Sensors
          </text>

          {/* ========== UNIVERSAL LAB FLASK ICON (Right side, pulsing on weekly sync) ========== */}
          <g transform="translate(568, 134)" opacity={isLab ? 1 : 0.45}>
            <g transform="translate(-12, 6)" stroke="#fb923c" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <path d="M 7 2 H 17 M 9 2 V 10 L 3 22 A 2.5 2.5 0 0 0 5.5 25.5 H 18.5 A 2.5 2.5 0 0 0 21 22 L 15 10 V 2" />
              <line x1="6" y1="19" x2="18" y2="19" />
            </g>
            <text x="20" y="23" fill="#fdba74" fontSize="11" fontWeight="700">
              Lab Test
            </text>
          </g>

          {/* ========== MAIN PIPE + BYPASS PIPE ========== */}
          <line x1="36" y1="296" x2="924" y2="296" stroke="#1e293b" strokeWidth="24" strokeLinecap="round" />

          {/* Simple Bypass Pipe (lights up amber only in October Off-Season) */}
          <path
            d="M 218 336 V 404 H 782 V 336"
            fill="none"
            stroke={isTreat ? "#1f2937" : "#f59e0b"}
            strokeWidth={isTreat ? "8" : "12"}
            strokeLinecap="round"
            opacity={isTreat ? 0.45 : 0.9}
          />
          {!isTreat && (
            <text x="500" y="395" textAnchor="middle" fill="#fcd34d" fontSize="12" fontWeight="800">
              BYPASS ON (FILTERS RESTING)
            </text>
          )}

          {/* Calm Flowing Water Droplets */}
          {drops.map((d, idx) => {
            if (!isTreat) {
              return (
                <circle key={idx} cx={230 + d * 540} cy={404} r="6" fill="#fbbf24" />
              );
            }
            const x = 44 + d * 870;
            const col = x < 340 ? "#c084fc" : x < 540 ? "#818cf8" : "#22d3ee";
            return (
              <circle
                key={idx}
                cx={x}
                cy={296}
                r={isStorm ? 7 : 5.5}
                fill={col}
                filter="url(#softGlow)"
              />
            );
          })}

          {/* ========== 4 BIG, SIMPLE UNDERGROUND BOXES ========== */}

          {/* 1. FARM RUNOFF (Dirty Purple Drop Icon) */}
          <rect x="44" y="226" width="150" height="136" rx="18" fill="#13162a" stroke="#a855f7" strokeWidth="2" />
          {/* Drop Icon */}
          <path
            d="M 119 252 C 119 252 99 278 99 292 A 20 20 0 0 0 139 292 C 139 278 119 252 119 252 Z"
            fill="#a855f7"
            opacity="0.85"
          />
          <text x="119" y="344" textAnchor="middle" fill="#f3e8ff" fontSize="14" fontWeight="800">
            Farm Runoff
          </text>

          {/* 2. WOODCHIPS (Stacked Logs Icon) */}
          <rect x="242" y="226" width="158" height="136" rx="18" fill="#211810" stroke="#ca8a04" strokeWidth="2" />
          <g fill="#b45309">
            <rect x="278" y="260" width="38" height="12" rx="6" />
            <rect x="322" y="260" width="42" height="12" rx="6" />
            <rect x="288" y="278" width="46" height="12" rx="6" />
            <rect x="340" y="278" width="26" height="12" rx="6" />
            <rect x="276" y="296" width="42" height="12" rx="6" />
            <rect x="324" y="296" width="38" height="12" rx="6" />
          </g>
          <text x="321" y="344" textAnchor="middle" fill="#fef08a" fontSize="14" fontWeight="800">
            Woodchips
          </text>

          {/* 3. CARBON FILTERS (3 Big Universal Fill Bars + White Truth Line) */}
          <rect
            x="448"
            y="208"
            width="266"
            height="170"
            rx="20"
            fill="#17122e"
            stroke="#a855f7"
            strokeWidth="2.6"
            filter="url(#softGlow)"
          />
          <text x="581" y="234" textAnchor="middle" fill="#f5d0fe" fontSize="14" fontWeight="900">
            Carbon Filters
          </text>

          {[
            { label: "1", x: 482, h: h1, hr: hr1, frac: c1 },
            { label: "2", x: 556, h: h2, hr: hr2, frac: c2 },
            { label: "3", x: 630, h: hp, hr: hrp, frac: p },
          ].map((b) => (
            <g key={b.label}>
              <rect
                x={b.x}
                y={250}
                width="50"
                height="88"
                rx="10"
                fill="#090b14"
                stroke="rgba(255,255,255,0.18)"
                strokeWidth="1.5"
              />
              <rect
                x={b.x + 3}
                y={335 - b.h}
                width="44"
                height={b.h}
                rx="7"
                fill={barColor(b.frac)}
              />
              {/* Real hidden filter line */}
              <line
                x1={b.x}
                y1={335 - b.hr}
                x2={b.x + 50}
                y2={335 - b.hr}
                stroke="#ffffff"
                strokeWidth="2.5"
                strokeDasharray="4 3"
              />
              <text
                x={b.x + 25}
                y={360}
                textAnchor="middle"
                fill="#cbd5e1"
                fontSize="12"
                fontWeight="800"
              >
                {Math.round(b.frac * 100)}%
              </text>
            </g>
          ))}

          {/* 4. CLEAN WATER (Sparkling Cyan Drop + Checkmark Icon) */}
          <rect
            x="764"
            y="226"
            width="152"
            height="136"
            rx="18"
            fill="#092136"
            stroke="#22d3ee"
            strokeWidth="2.2"
            filter="url(#softGlow)"
          />
          <path
            d="M 840 250 C 840 250 818 278 818 293 A 22 22 0 0 0 862 293 C 862 278 840 250 840 250 Z"
            fill="#22d3ee"
            opacity="0.9"
          />
          <polyline
            points="831,293 838,300 850,286"
            fill="none"
            stroke="#083344"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <text x="840" y="344" textAnchor="middle" fill="#e0f2fe" fontSize="14" fontWeight="800">
            Clean Water
          </text>
        </svg>
      </div>

      {/* CLEAN BOTTOM TIMELINE + ONE HEADLINE COMPARISON */}
      <footer className="relative z-10 mx-auto w-full max-w-5xl space-y-3">
        {/* Month Progress Dots */}
        <div className="flex items-center justify-between gap-2">
          {MONTHS.map((m, idx) => {
            const active = idx === activeMonth;
            return (
              <button
                key={m}
                onClick={() => setProgress(idx / (MONTHS.length - 1))}
                className={`flex-1 rounded-full py-1 text-center text-xs font-bold transition ${
                  active
                    ? "bg-purple-600 text-white shadow-md shadow-purple-700/40"
                    : "bg-white/5 text-slate-400 hover:bg-white/10"
                }`}
              >
                {m}
              </button>
            );
          })}
        </div>

        {/* Simple Takeaway Strip */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              <strong className="font-mono text-sm text-purple-300">
                {sim.twinPct}%
              </strong>{" "}
              caught with Digital Twin
            </span>
            <span className="text-slate-600">vs.</span>
            <span>
              <strong className="font-mono text-sm text-slate-300">
                {sim.fixedPct}%
              </strong>{" "}
              swapping once a year
            </span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <span className="text-slate-500">
              Color bar = Twin &middot; Dashed line = Real filter
            </span>
            <Link href="/charts" className="text-slate-400 hover:text-purple-300">
              Graphs
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
