"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

import { simulateSeason } from "~/lib/simulator";

// Calm 52-second loop across April -> October.
const LOOP_DURATION_SEC = 52;
const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"] as const;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function barColor(frac: number) {
  if (frac >= 0.8) return "#dc2626"; // clean editorial red
  if (frac >= 0.55) return "#d97706"; // warm ochre/amber
  return "#16a34a"; // natural green
}

export function DashboardClient() {
  // Backed by our real hourly NEPHRON model & twin simulator.
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
  const c1 = clamp01(lerp(f0.twinC1, f1.twinC1, t));
  const c2 = clamp01(lerp(f0.twinC2, f1.twinC2, t));
  const p = clamp01(lerp(f0.twinP, f1.twinP, t));
  const c1R = clamp01(lerp(f0.truthC1, f1.truthC1, t));
  const c2R = clamp01(lerp(f0.truthC2, f1.truthC2, t));
  const pR = clamp01(lerp(f0.truthP, f1.truthP, t));

  const isTreat = f0.monthIdx < 10;
  const isStorm = flow > 1.25 || rain > 12;
  const isSprayHeavy = f0.monthIdx >= 5 && f0.monthIdx <= 7;
  const isSwap = isTreat && c1 >= 0.78;
  const isWaterCheck = isTreat && f0.waterCheck;
  const activeMonth = Math.min(6, Math.max(0, f0.monthIdx - 4));

  // Calm motion phases
  const flowSpeed = isStorm ? 0.19 : 0.11;
  const pesticideDots = [0, 0.16, 0.32, 0.48, 0.64, 0.8].map(
    (o) => (clock * flowSpeed + o) % 1,
  );
  const cleanDrops = [0, 0.25, 0.5, 0.75].map(
    (o) => (clock * flowSpeed + o) % 1,
  );
  const soilSeepDots = [0, 0.33, 0.66].map((o) => (clock * 0.24 + o) % 1);
  const wifiPulse = (clock * 0.38) % 1;
  const sway = Math.sin(clock * 1.1) * 1.8;

  const cropScale = 0.7 + 0.4 * Math.sin(Math.min(1, progress * 1.15) * Math.PI * 0.65);
  const cropColor = !isTreat ? "#a16207" : "#2f7d4a";

  const maxH = 82;
  const bars = [
    { id: "1", x: 468, h: Math.max(6, c1 * maxH), hr: Math.max(6, c1R * maxH), frac: c1 },
    { id: "2", x: 544, h: Math.max(6, c2 * maxH), hr: Math.max(6, c2R * maxH), frac: c2 },
    { id: "3", x: 620, h: Math.max(6, p * maxH), hr: Math.max(6, pR * maxH), frac: p },
  ];

  const phoneStatus = !isTreat
    ? { text: "Winter Rest", fg: "#b45309", bg: "#fef3c7" }
    : isSwap
      ? { text: "Swap Filter 1", fg: "#b91c1c", bg: "#fee2e2" }
      : isStorm
        ? { text: "Storm Flow", fg: "#1d4ed8", bg: "#dbeafe" }
        : { text: "All Clean", fg: "#15803d", bg: "#dcfce7" };

  return (
    <div className="flex min-h-screen flex-col justify-between bg-[#f8f7f3] px-4 pt-5 pb-12 text-stone-900 sm:px-8 sm:pt-6 sm:pb-8">
      {/* Crisp Editorial Header */}
      <header className="mx-auto flex w-full max-w-5xl flex-wrap items-end justify-between gap-3 border-b border-stone-300 pb-3">
        <div>
          <div className="flex flex-wrap items-baseline gap-2.5">
            <span className="font-mono text-xs font-bold tracking-widest text-purple-800 uppercase">
              NEPHRON
            </span>
            <span className="text-stone-300">/</span>
            <h1 className="text-lg font-bold tracking-tight text-stone-900 sm:text-xl">
              A Seasonal Field Kidney for Atrazine in Tile Drainage
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-stone-500">
            Nitrate-Eliminating Pesticide-Holding Reactor for On-farm Networks
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-600">
            Synthetic data: demonstration only
          </span>
          <button
            onClick={() => setPaused((v) => !v)}
            className="border border-stone-900 bg-stone-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-stone-700"
          >
            {paused ? "Play" : "Pause"}
          </button>
        </div>
      </header>

      {/* CENTERPIECE: DAYLIGHT EDITORIAL ARCHITECTURAL CUTAWAY */}
      <div className="mx-auto my-4 flex w-full max-w-5xl flex-1 items-center justify-center">
        <svg
          viewBox="0 0 960 470"
          className="h-auto max-h-[70vh] w-full border border-stone-300 bg-white"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="soilDots" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="5" cy="7" r="1" fill="#8c775c" opacity="0.28" />
              <circle cx="17" cy="18" r="1.2" fill="#8c775c" opacity="0.22" />
              <circle cx="19" cy="6" r="0.8" fill="#8c775c" opacity="0.2" />
            </pattern>
          </defs>

          {/* Daylight Sky */}
          <rect x="0" y="0" width="960" height="196" fill={isStorm ? "#e5ecf2" : "#f1f6fa"} />

          {/* Natural Topsoil & Subsoil Layers */}
          <rect x="0" y="196" width="960" height="274" fill="#ebe2d3" />
          <path d="M 0 296 Q 260 286 510 298 T 960 292 V 470 H 0 Z" fill="#dfd2be" />
          <rect x="0" y="196" width="960" height="274" fill="url(#soilDots)" />

          {/* Grass Turf Line */}
          <rect x="0" y="192" width="960" height="8" fill={isTreat ? "#4d8b55" : "#a18a57"} />
          <line x1="0" y1="192" x2="960" y2="192" stroke="#1c1917" strokeWidth="1.2" />

          {/* ========== SIMPLE WEATHER ICON (Line-art Sun or Rain Cloud) ========== */}
          {isStorm ? (
            <g transform="translate(56, 26)">
              <path
                d="M 20 40 a 18 18 0 0 1 34 -6 a 22 22 0 0 1 40 7 a 14 14 0 0 1 2 27 h -76 a 13 13 0 0 1 0 -28 z"
                fill="#cbd5e1"
                stroke="#475569"
                strokeWidth="1.6"
              />
              {[28, 48, 68, 88].map((rx, idx) => {
                const dy = (clock * 44 + idx * 14) % 44;
                return (
                  <line
                    key={rx}
                    x1={rx}
                    y1={74 + dy}
                    x2={rx - 4}
                    y2={85 + dy}
                    stroke="#0284c7"
                    strokeWidth="2"
                    strokeLinecap="round"
                    opacity={1 - dy / 46}
                  />
                );
              })}
            </g>
          ) : (
            <g transform="translate(104, 62)">
              <circle cx="0" cy="0" r="16" fill="#fde68a" stroke="#b45309" strokeWidth="1.6" />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
                const rad = (deg * Math.PI) / 180;
                return (
                  <line
                    key={deg}
                    x1={Math.cos(rad) * 22}
                    y1={Math.sin(rad) * 22}
                    x2={Math.cos(rad) * 29}
                    y2={Math.sin(rad) * 29}
                    stroke="#b45309"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                );
              })}
            </g>
          )}

          {/* ========== MINIMALIST FIELD CROPS + PESTICIDE SEEPING DOWN ========== */}
          {[42, 76, 110, 144, 178].map((cx, i) => {
            const h = (26 + (i % 2) * 8) * cropScale;
            const s = sway * (0.7 + (i % 3) * 0.2);
            return (
              <g key={cx} stroke={cropColor} strokeWidth="2.2" strokeLinecap="round" fill="none">
                <path d={`M ${cx} 192 Q ${cx + s * 0.5} ${192 - h * 0.55} ${cx + s} ${192 - h}`} />
                <path d={`M ${cx + s * 0.45} ${192 - h * 0.45} Q ${cx - 7} ${192 - h * 0.6} ${cx - 11} ${192 - h * 0.74}`} />
                <path d={`M ${cx + s * 0.6} ${192 - h * 0.58} Q ${cx + 8} ${192 - h * 0.74} ${cx + 11} ${192 - h * 0.88}`} />
              </g>
            );
          })}

          {/* Purple Pesticide (Atrazine) dots moving from field down into tile runoff */}
          {isTreat &&
            soilSeepDots.map((d, idx) => (
              <circle
                key={idx}
                cx={72 + idx * 34}
                cy={196 + d * 52}
                r={isSprayHeavy ? 4.6 : 3.2}
                fill="#7e22ce"
                opacity={0.95 - d * 0.35}
              />
            ))}

          {/* Simple Pesticide Legend Tag */}
          <g transform="translate(26, 128)">
            <rect x="0" y="0" width="160" height="24" rx="4" fill="#ffffff" stroke="#d6d3d1" strokeWidth="1.2" />
            <circle cx="14" cy="12" r="4.5" fill="#7e22ce" />
            <text x="25" y="16" fill="#1c1917" fontSize="11" fontWeight="700">
              Pesticide (Atrazine)
            </text>
          </g>

          {/* ========== SMARTPHONE (DIGITAL TWIN) + EDITORIAL LINE-ART FARMER ========== */}
          <g transform="translate(454, 18)">
            {/* Phone Frame */}
            <rect x="0" y="0" width="108" height="148" rx="14" fill="#ffffff" stroke="#1c1917" strokeWidth="2.2" />
            <line x1="40" y1="8" x2="68" y2="8" stroke="#a8a29e" strokeWidth="2.5" strokeLinecap="round" />

            <text x="54" y="26" textAnchor="middle" fill="#6d28d9" fontSize="9.5" fontWeight="800" letterSpacing="0.06em">
              DIGITAL TWIN
            </text>

            {/* 3 Clean Mirror Filter Bars on Phone Screen */}
            {bars.map((b, idx) => (
              <g key={b.id} transform={`translate(${18 + idx * 26}, 36)`}>
                <rect x="0" y="0" width="20" height="58" rx="3" fill="#f5f5f4" stroke="#d6d3d1" strokeWidth="1" />
                <rect
                  x="2"
                  y={56 - Math.max(4, b.frac * 54)}
                  width="16"
                  height={Math.max(4, b.frac * 54)}
                  rx="2"
                  fill={barColor(b.frac)}
                />
              </g>
            ))}

            {/* Phone Status Strip */}
            <rect x="11" y="106" width="86" height="24" rx="5" fill={phoneStatus.bg} />
            <text x="54" y="122" textAnchor="middle" fill={phoneStatus.fg} fontSize="10.5" fontWeight="800">
              {phoneStatus.text}
            </text>
          </g>

          {/* Clean Minimal Individual Icon (Operator / Farmer) */}
          <g transform="translate(604, 34)">
            {/* Clean Speech Callout */}
            <path
              d="M 68 8 H 208 Q 214 8 214 14 V 36 Q 214 42 208 42 H 78 L 66 50 L 70 42 H 68 Q 62 42 62 36 V 14 Q 62 8 68 8 Z"
              fill="#ffffff"
              stroke="#1c1917"
              strokeWidth="1.4"
            />
            <text x="138" y="29" textAnchor="middle" fill="#1c1917" fontSize="11.5" fontWeight="700">
              {isSwap ? "Time to swap Filter 1" : !isTreat ? "Filters resting" : "Water looks clean"}
            </text>

            {/* Simple Modern Person Icon (Head + Friendly Smile + Shoulders) */}
            <circle cx="34" cy="52" r="19" fill="#ffffff" stroke="#1c1917" strokeWidth="1.8" />
            <circle cx="28" cy="49" r="2" fill="#1c1917" />
            <circle cx="40" cy="49" r="2" fill="#1c1917" />
            <path d="M 27 57 Q 34 64 41 57" fill="none" stroke="#1c1917" strokeWidth="2" strokeLinecap="round" />

            <path
              d="M 8 126 Q 10 80 34 80 Q 58 80 60 126 Z"
              fill="#e7e5e4"
              stroke="#1c1917"
              strokeWidth="1.8"
            />
            <path d="M 24 81 L 34 95 L 44 81" fill="none" stroke="#1c1917" strokeWidth="1.5" />

            <text x="34" y="145" textAnchor="middle" fill="#44403c" fontSize="11" fontWeight="700">
              Farmer
            </text>
          </g>

          {/* Crisp Wi-Fi Arcs from Buried Filters to Phone */}
          <g transform="translate(508, 184)" stroke="#6d28d9" strokeWidth="2" fill="none" strokeLinecap="round">
            <path d="M -14 -2 A 19 19 0 0 1 14 -2" opacity={0.25 + 0.75 * Math.sin(wifiPulse * Math.PI)} />
            <path d="M -8 5 A 11 11 0 0 1 8 5" opacity={0.5 + 0.5 * Math.sin(wifiPulse * Math.PI)} />
            <circle cx="0" cy="11" r="2.5" fill="#6d28d9" stroke="none" />
          </g>

          {/* Simple Weekly Water Sample Bottle Tag */}
          <g transform="translate(812, 132)" opacity={isWaterCheck ? 1 : 0.6}>
            <rect
              x="0"
              y="0"
              width="124"
              height="42"
              rx="6"
              fill="#ffffff"
              stroke={isWaterCheck ? "#d97706" : "#a8a29e"}
              strokeWidth={isWaterCheck ? "2" : "1.2"}
            />
            <g transform="translate(12, 8)" stroke="#44403c" strokeWidth="1.7" fill="none" strokeLinejoin="round">
              <rect x="4" y="0" width="8" height="4" rx="1" />
              <path d="M 4 4 L 1 10 V 23 A 2 2 0 0 0 3 25 H 13 A 2 2 0 0 0 15 23 V 10 L 12 4 Z" />
              <line x1="2" y1="16" x2="14" y2="16" stroke="#0284c7" strokeWidth="2" />
            </g>
            <text x="36" y="18" fill="#1c1917" fontSize="10.5" fontWeight="700">
              Water Sample
            </text>
            <text x="36" y="32" fill={isWaterCheck ? "#b45309" : "#78716c"} fontSize="9.5" fontWeight="600">
              {isWaterCheck ? "Twin updated" : "Checks twin"}
            </text>
          </g>

          {/* ========== UNDERGROUND PIPING (Architectural Cutaway) ========== */}
          {/* Main pipe wall + inner water */}
          <line x1="24" y1="316" x2="936" y2="316" stroke="#57534e" strokeWidth="26" strokeLinecap="round" />
          <line x1="28" y1="316" x2="932" y2="316" stroke="#e7e5e4" strokeWidth="20" strokeLinecap="round" />

          {/* Left dirty water tint -> Right clean river blue */}
          <line
            x1="30"
            y1="316"
            x2="444"
            y2="316"
            stroke={isTreat ? "#ddd6fe" : "#e5e7eb"}
            strokeWidth="16"
          />
          <line
            x1="704"
            y1="316"
            x2="930"
            y2="316"
            stroke={isTreat ? "#bae6fd" : "#e5e7eb"}
            strokeWidth="16"
          />

          {/* Seasonal Bypass Pipe underneath */}
          <path
            d="M 218 338 V 426 Q 218 436 230 436 H 736 Q 748 436 748 426 V 338"
            fill="none"
            stroke={isTreat ? "#a8a29e" : "#d97706"}
            strokeWidth={isTreat ? "8" : "13"}
            strokeLinecap="round"
            strokeDasharray={isTreat ? "6 6" : "none"}
            opacity={isTreat ? 0.55 : 0.9}
          />
          {!isTreat && (
            <text x="484" y="422" textAnchor="middle" fill="#92400e" fontSize="11.5" fontWeight="800" letterSpacing="0.04em">
              OFF-SEASON BYPASS OPEN &middot; FILTERS RESTING
            </text>
          )}

          {/* Purple Pesticide Particles (Trapped inside Carbon Filters!) */}
          {isTreat &&
            pesticideDots.map((d, idx) => {
              const px = 45 + d * 475;
              const py = 316 + Math.sin(d * Math.PI * 6 + idx * 1.3) * 3.5;
              const fadeOut = px > 450 ? Math.max(0, 1 - (px - 450) / 70) : 1;
              return (
                <circle
                  key={`pest-${idx}`}
                  cx={px}
                  cy={py}
                  r={isSprayHeavy ? 5.2 : 3.8}
                  fill="#7e22ce"
                  opacity={fadeOut}
                />
              );
            })}

          {/* Clean Blue Water Drops exiting Carbon Filters */}
          {cleanDrops.map((d, idx) => {
            if (!isTreat) {
              return (
                <circle key={`byp-${idx}`} cx={234 + d * 500} cy={436} r="4.8" fill="#fef3c7" stroke="#b45309" strokeWidth="1.2" />
              );
            }
            return (
              <circle
                key={`clean-${idx}`}
                cx={708 + d * 212}
                cy={316 + Math.sin(d * Math.PI * 4 + idx) * 2}
                r="4.6"
                fill="#0284c7"
              />
            );
          })}

          {/* ========== STAGE 1: FARM RUNOFF ========== */}
          <rect x="34" y="248" width="144" height="136" rx="10" fill="#ffffff" stroke="#1c1917" strokeWidth="1.6" />
          <path
            d="M 106 268 C 106 268 86 294 86 309 A 20 20 0 0 0 126 309 C 126 294 106 268 106 268 Z"
            fill="#e0e7ff"
            stroke="#4338ca"
            strokeWidth="1.6"
          />
          <circle cx="99" cy="306" r="3.8" fill="#7e22ce" />
          <circle cx="113" cy="312" r="3.4" fill="#7e22ce" />
          <circle cx="107" cy="295" r="3.2" fill="#7e22ce" />
          <text x="106" y="356" textAnchor="middle" fill="#1c1917" fontSize="13" fontWeight="800">
            Farm Runoff
          </text>
          <text x="106" y="372" textAnchor="middle" fill="#7e22ce" fontSize="10.5" fontWeight="700">
            With Pesticide
          </text>

          {/* ========== SEASONAL GATE VALVE ========== */}
          <g transform="translate(218, 316)">
            <circle cx="0" cy="0" r="20" fill="#ffffff" stroke="#1c1917" strokeWidth="1.8" />
            <g transform={`rotate(${isTreat ? 0 : 90})`} style={{ transition: "transform 700ms ease" }}>
              <line x1="-10" y1="0" x2="9" y2="0" stroke={isTreat ? "#15803d" : "#b45309"} strokeWidth="3.2" strokeLinecap="round" />
              <polygon points="5,-5.5 13,0 5,5.5" fill={isTreat ? "#15803d" : "#b45309"} />
            </g>
          </g>

          {/* ========== STAGE 2: WOODCHIPS ========== */}
          <rect x="260" y="248" width="144" height="136" rx="10" fill="#fffbeb" stroke="#1c1917" strokeWidth="1.6" />
          <g fill="#b45309" stroke="#78350f" strokeWidth="0.9">
            <rect x="287" y="274" width="38" height="11" rx="4" />
            <rect x="331" y="274" width="44" height="11" rx="4" />
            <rect x="298" y="291" width="48" height="11" rx="4" />
            <rect x="352" y="291" width="24" height="11" rx="4" />
            <rect x="286" y="308" width="42" height="11" rx="4" />
            <rect x="334" y="308" width="40" height="11" rx="4" />
          </g>
          <text x="332" y="356" textAnchor="middle" fill="#1c1917" fontSize="13" fontWeight="800">
            Woodchips
          </text>
          <text x="332" y="372" textAnchor="middle" fill="#92400e" fontSize="10.5" fontWeight="600">
            Cuts Fertilizer
          </text>

          {/* ========== STAGE 3: CARBON FILTERS ========== */}
          <rect
            x="438"
            y="222"
            width="266"
            height="178"
            rx="12"
            fill="#ffffff"
            stroke="#6d28d9"
            strokeWidth="2.2"
          />
          <text x="571" y="246" textAnchor="middle" fill="#1c1917" fontSize="13.5" fontWeight="800">
            Carbon Filters (Traps Pesticide)
          </text>

          {bars.map((b) => (
            <g key={b.id}>
              <rect x={b.x} y={260} width="54" height="90" rx="6" fill="#f5f5f4" stroke="#a8a29e" strokeWidth="1.4" />
              <rect x={b.x + 3} y={347 - b.h} width="48" height={b.h} rx="4" fill={barColor(b.frac)} />
              {/* Real buried filter level (crisp black dashed line) */}
              <line x1={b.x - 3} y1={347 - b.hr} x2={b.x + 57} y2={347 - b.hr} stroke="#1c1917" strokeWidth="2.2" strokeDasharray="4 3" />
              <text x={b.x + 27} y={374} textAnchor="middle" fill="#1c1917" fontSize="12" fontWeight="700" fontFamily="monospace">
                {Math.round(b.frac * 100)}%
              </text>
            </g>
          ))}

          {/* ========== STAGE 4: CLEAN WATER ========== */}
          <rect x="776" y="248" width="150" height="136" rx="10" fill="#f0f9ff" stroke="#1c1917" strokeWidth="1.6" />
          <path
            d="M 851 268 C 851 268 830 294 830 309 A 21 21 0 0 0 872 309 C 872 294 851 268 851 268 Z"
            fill="#0284c7"
          />
          <polyline points="842,309 849,316 861,302" fill="none" stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
          <text x="851" y="356" textAnchor="middle" fill="#1c1917" fontSize="13" fontWeight="800">
            Clean Water
          </text>
          <text x="851" y="372" textAnchor="middle" fill="#0369a1" fontSize="10.5" fontWeight="700">
            Pesticide Removed
          </text>
        </svg>
      </div>

      {/* CRISP EDITORIAL BOTTOM TIMELINE & HEADLINE */}
      <footer className="mx-auto w-full max-w-5xl space-y-3">
        <div className="grid grid-cols-7 gap-1.5">
          {MONTHS.map((m, idx) => {
            const active = idx === activeMonth;
            return (
              <button
                key={m}
                onClick={() => setProgress(idx / (MONTHS.length - 1))}
                className={`border py-1.5 text-center font-mono text-xs font-bold transition ${
                  active
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-300 bg-white text-stone-600 hover:border-stone-500"
                }`}
              >
                {m}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border border-stone-300 bg-white px-4 py-2.5 text-xs text-stone-700">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              <strong className="font-mono text-sm text-purple-800">
                {sim.twinPct}%
              </strong>{" "}
              pesticide caught with Digital Twin
            </span>
            <span className="text-stone-400">vs.</span>
            <span>
              <strong className="font-mono text-sm text-stone-700">
                {sim.fixedPct}%
              </strong>{" "}
              swapping once a year
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[11px] text-stone-500">
            <span>Color bar = Phone Twin &middot; Dashed line = Real buried filter</span>
            <Link href="/charts" className="font-semibold text-stone-900 underline-offset-2 hover:underline">
              Graphs
            </Link>
            <Link href="/whatif" className="font-semibold text-stone-900 underline-offset-2 hover:underline">
              Compare
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
