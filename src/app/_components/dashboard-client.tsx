"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "~/trpc/react";

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function barColor(fraction: number) {
  if (fraction >= 0.85) return "#ef4444"; // red
  if (fraction >= 0.6) return "#f59e0b"; // amber
  return "#22c55e"; // green
}

export function DashboardClient() {
  const utils = api.useUtils();
  // Load every 6 hours (~856 points) so the slider and chart are instant and lightweight.
  const seriesQuery = api.twin.getSeries.useQuery({ stride: 6 });
  const whatIfQuery = api.whatif.compare.useQuery({ seed: 42 });

  const [stepIndex, setStepIndex] = useState(235); // ~May 29
  const [isPlaying, setIsPlaying] = useState(false);

  const runSeason = api.sim.runSeason.useMutation({
    onSuccess: async () => {
      await utils.twin.getSeries.invalidate();
    },
  });

  const resolveAlert = api.alert.resolve.useMutation({
    onSuccess: async () => {
      await utils.twin.getSeries.invalidate();
    },
  });

  const points = useMemo(
    () => seriesQuery.data?.points ?? [],
    [seriesQuery.data?.points],
  );
  const maxIndex = Math.max(0, points.length - 1);
  const safeIndex = Math.min(stepIndex, maxIndex);
  const current = points[safeIndex];

  // Auto-play smoothly across the season.
  useEffect(() => {
    if (!isPlaying || points.length === 0) return;
    const id = setInterval(() => {
      setStepIndex((prev) => {
        if (prev + 4 >= points.length - 1) {
          setIsPlaying(false);
          return points.length - 1;
        }
        return prev + 4;
      });
    }, 140);
    return () => clearInterval(id);
  }, [isPlaying, points.length]);

  // Build one simple chart: Twin vs. Hidden Reality + Weekly Lab Grabs.
  const chartData = useMemo(() => {
    const grabs = seriesQuery.data?.grabSamples ?? [];
    const grabByIdx = new Map<number, number>();
    for (const g of grabs) {
      if (g.location !== "outlet") continue;
      const gMs = new Date(g.ts).getTime();
      let best = 0;
      let diff = Infinity;
      for (let i = 0; i < points.length; i++) {
        const d = Math.abs(new Date(points[i]!.ts).getTime() - gMs);
        if (d < diff) {
          diff = d;
          best = i;
        }
      }
      grabByIdx.set(best, g.atrazineUgl);
    }

    return points.map((p, i) => ({
      date: formatShortDate(p.ts),
      twinC1: Math.round(p.twinC1 * 100),
      truthC1: Math.round(p.truthC1 * 100),
      twinOut: p.twinOutletUgl,
      truthOut: p.truthOutletUgl,
      labDot: grabByIdx.get(i) ?? null,
    }));
  }, [points, seriesQuery.data?.grabSamples]);

  // Latest unresolved alert at or before the current slider time.
  const latestAlert = useMemo(() => {
    const all = seriesQuery.data?.alerts ?? [];
    if (!current) return null;
    const nowMs = new Date(current.ts).getTime();
    return (
      all.find((a) => !a.resolved && new Date(a.ts).getTime() <= nowMs) ?? null
    );
  }, [seriesQuery.data?.alerts, current]);

  if (seriesQuery.isLoading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-600">
        Loading NEPHRON digital twin...
      </div>
    );
  }

  if (!seriesQuery.data?.site || !current) {
    return (
      <div className="rounded-xl border border-purple-200 bg-white p-10 text-center shadow-sm">
        <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-800">
          Synthetic data: demonstration only
        </span>
        <h1 className="mt-4 text-xl font-bold text-slate-900">
          Start the NEPHRON Demo
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600">
          Generate one farming season (April–October) to watch the digital twin
          track hidden underground carbon filters.
        </p>
        <button
          onClick={() => runSeason.mutate({ seed: 42 })}
          disabled={runSeason.isPending}
          className="mt-5 rounded-lg bg-purple-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-800 disabled:opacity-50"
        >
          {runSeason.isPending ? "Generating season..." : "Generate Demo Season"}
        </button>
      </div>
    );
  }

  const isTreat = current.seasonMode !== "off_season";
  const currentDateLabel = formatShortDate(current.ts);
  const c1H = Math.max(4, Math.round(current.twinC1 * 62));
  const c2H = Math.max(4, Math.round(current.twinC2 * 62));
  const polH = Math.max(4, Math.round(current.twinPolish * 62));
  const c1TH = Math.max(4, Math.round(current.truthC1 * 62));
  const c2TH = Math.max(4, Math.round(current.truthC2 * 62));
  const polTH = Math.max(4, Math.round(current.truthPolish * 62));

  return (
    <div className="space-y-6">
      {/* Purple Digital Twin Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-purple-700 px-5 py-3.5 text-white">
        <div>
          <div className="text-xs font-semibold tracking-wide text-purple-200 uppercase">
            Digital Twin &middot; Synthetic data: demonstration only
          </div>
          <div className="mt-0.5 text-base font-bold sm:text-lg">
            {currentDateLabel} &mdash;{" "}
            {isTreat ? "Treating tile drainage" : "Off-season (bypassing filters)"}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying((p) => !p)}
            className="rounded-lg bg-white px-3.5 py-1.5 text-xs font-bold text-purple-800 hover:bg-purple-50"
          >
            {isPlaying ? "Pause" : "Play Season"}
          </button>
          <button
            onClick={() => {
              const activeSite = seriesQuery.data?.site;
              if (!activeSite) return;
              runSeason.mutate({
                siteId: activeSite.id,
                seed: Math.floor(1 + Math.random() * 9000),
              });
            }}
            disabled={runSeason.isPending}
            className="rounded-lg border border-white/40 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-800 disabled:opacity-50"
          >
            {runSeason.isPending ? "Seeding..." : "New Weather"}
          </button>
        </div>
      </div>

      {/* Block 1: Simple Visual Flow Graphic + Season Slider */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <svg
          viewBox="0 0 720 215"
          className="h-auto w-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Background soil band */}
          <rect x="0" y="34" width="720" height="178" rx="12" fill="#f8fafc" stroke="#e2e8f0" />
          <line x1="0" y1="34" x2="720" y2="34" stroke="#22c55e" strokeWidth="3" />
          <text x="14" y="23" fill="#15803d" fontSize="11" fontWeight="700">
            UNDERGROUND TREATMENT UNIT
          </text>
          <text x="706" y="23" textAnchor="end" fill="#6b21a8" fontSize="11" fontWeight="700">
            Flow: {current.flowLps.toFixed(2)} L/s &middot; Mode: {isTreat ? "TREAT" : "BYPASS"}
          </text>

          {/* 1. Tile Drain */}
          <rect x="14" y="84" width="96" height="72" rx="10" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.5" />
          <text x="62" y="106" textAnchor="middle" fill="#64748b" fontSize="9.5" fontWeight="700">
            TILE DRAIN
          </text>
          <text x="62" y="127" textAnchor="middle" fill="#7e22ce" fontSize="14" fontWeight="800">
            {current.inletAtrazineUgl.toFixed(1)} &mu;g/L
          </text>
          <text x="62" y="143" textAnchor="middle" fill="#64748b" fontSize="9.5">
            Atrazine in
          </text>

          {/* Arrow 1 -> 2 */}
          <line x1="110" y1="120" x2="138" y2="120" stroke="#9333ea" strokeWidth="4" />
          <polygon points="138,114 148,120 138,126" fill="#9333ea" />

          {/* 2. Inlet Gate */}
          <rect x="148" y="84" width="88" height="72" rx="10" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1.5" />
          <text x="192" y="105" textAnchor="middle" fill="#64748b" fontSize="9.5" fontWeight="700">
            INLET BOX
          </text>
          <rect
            x="164"
            y="113"
            width="56"
            height="22"
            rx="6"
            fill={isTreat ? "#dcfce7" : "#e2e8f0"}
          />
          <text
            x="192"
            y="128"
            textAnchor="middle"
            fill={isTreat ? "#166534" : "#334155"}
            fontSize="10.5"
            fontWeight="800"
          >
            {isTreat ? "TREAT" : "BYPASS"}
          </text>
          <text x="192" y="148" textAnchor="middle" fill="#64748b" fontSize="9">
            300 m&sup3; basin
          </text>

          {/* Arrow 2 -> 3 */}
          <line
            x1="236"
            y1="120"
            x2="262"
            y2="120"
            stroke={isTreat ? "#9333ea" : "#cbd5e1"}
            strokeWidth="4"
          />
          <polygon
            points="262,114 272,120 262,126"
            fill={isTreat ? "#9333ea" : "#cbd5e1"}
          />

          {/* 3. Woodchips */}
          <rect x="272" y="84" width="104" height="72" rx="10" fill="#fffbeb" stroke="#fcd34d" strokeWidth="1.5" />
          <text x="324" y="105" textAnchor="middle" fill="#92400e" fontSize="9.5" fontWeight="700">
            WOODCHIPS
          </text>
          <text
            x="324"
            y="127"
            textAnchor="middle"
            fill={current.nitrateAfterChipsMgl > 5 ? "#dc2626" : "#15803d"}
            fontSize="13.5"
            fontWeight="800"
          >
            {current.nitrateAfterChipsMgl.toFixed(1)} mg/L
          </text>
          <text x="324" y="143" textAnchor="middle" fill="#92400e" fontSize="9.5">
            Nitrate out
          </text>

          {/* Arrow 3 -> 4 */}
          <line
            x1="376"
            y1="120"
            x2="402"
            y2="120"
            stroke={isTreat ? "#9333ea" : "#cbd5e1"}
            strokeWidth="4"
          />
          <polygon
            points="402,114 412,120 402,126"
            fill={isTreat ? "#9333ea" : "#cbd5e1"}
          />

          {/* 4. Carbon Box (3 cartridges) */}
          <rect x="412" y="54" width="164" height="132" rx="12" fill="#faf5ff" stroke="#9333ea" strokeWidth="2" />
          <text x="494" y="72" textAnchor="middle" fill="#6b21a8" fontSize="10" fontWeight="800">
            CARBON FILTERS
          </text>

          {/* C1 */}
          <text x="444" y="88" textAnchor="middle" fill="#475569" fontSize="9" fontWeight="700">C1</text>
          <rect x="426" y="93" width="36" height="66" rx="5" fill="#e2e8f0" />
          <rect x="428" y={157 - c1H} width="32" height={c1H} rx="3" fill={barColor(current.twinC1)} />
          <line x1="426" y1={157 - c1TH} x2="462" y2={157 - c1TH} stroke="#0f172a" strokeWidth="2" strokeDasharray="3 2" />
          <text x="444" y="174" textAnchor="middle" fill="#0f172a" fontSize="10" fontWeight="700">
            {Math.round(current.twinC1 * 100)}%
          </text>

          {/* C2 */}
          <text x="494" y="88" textAnchor="middle" fill="#475569" fontSize="9" fontWeight="700">C2</text>
          <rect x="476" y="93" width="36" height="66" rx="5" fill="#e2e8f0" />
          <rect x="478" y={157 - c2H} width="32" height={c2H} rx="3" fill={barColor(current.twinC2)} />
          <line x1="476" y1={157 - c2TH} x2="512" y2={157 - c2TH} stroke="#0f172a" strokeWidth="2" strokeDasharray="3 2" />
          <text x="494" y="174" textAnchor="middle" fill="#0f172a" fontSize="10" fontWeight="700">
            {Math.round(current.twinC2 * 100)}%
          </text>

          {/* Polish */}
          <text x="544" y="88" textAnchor="middle" fill="#475569" fontSize="9" fontWeight="700">POL</text>
          <rect x="526" y="93" width="36" height="66" rx="5" fill="#e2e8f0" />
          <rect x="528" y={157 - polH} width="32" height={polH} rx="3" fill={barColor(current.twinPolish)} />
          <line x1="526" y1={157 - polTH} x2="562" y2={157 - polTH} stroke="#0f172a" strokeWidth="2" strokeDasharray="3 2" />
          <text x="544" y="174" textAnchor="middle" fill="#0f172a" fontSize="10" fontWeight="700">
            {Math.round(current.twinPolish * 100)}%
          </text>

          {/* Arrow 4 -> 5 */}
          <line x1="576" y1="120" x2="602" y2="120" stroke="#0ea5e9" strokeWidth="4" />
          <polygon points="602,114 612,120 602,126" fill="#0ea5e9" />

          {/* 5. Outlet / Ditch */}
          <rect x="612" y="84" width="94" height="72" rx="10" fill="#f0f9ff" stroke="#38bdf8" strokeWidth="1.5" />
          <text x="659" y="105" textAnchor="middle" fill="#0369a1" fontSize="9.5" fontWeight="700">
            CLEAN DITCH
          </text>
          <text x="659" y="127" textAnchor="middle" fill="#0284c7" fontSize="14" fontWeight="800">
            {current.twinOutletUgl.toFixed(2)} &mu;g/L
          </text>
          <text x="659" y="143" textAnchor="middle" fill="#0369a1" fontSize="9.5">
            Truth: {current.truthOutletUgl.toFixed(2)}
          </text>

          {/* Simple legend */}
          <text x="14" y="202" fill="#64748b" fontSize="9.5">
            Colored bars = Digital Twin estimate (green &lt;60%, amber 60–85%, red &gt;85%) &middot; Dashed line = hidden real filter
          </text>
        </svg>

        {/* Simple Season Slider */}
        <div className="mt-4 flex flex-col gap-1.5">
          <input
            type="range"
            min={0}
            max={maxIndex}
            value={safeIndex}
            onChange={(e) => {
              setIsPlaying(false);
              setStepIndex(Number(e.target.value));
            }}
            className="w-full accent-purple-700"
          />
          <div className="flex justify-between text-xs text-slate-500">
            <span>Apr 1 (Start-up)</span>
            <span>May 10 (Spray Day)</span>
            <span>Jul–Sep (Swaps)</span>
            <span>Oct 31 (Off-Season)</span>
          </div>
        </div>
      </section>

      {/* Block 2: One Simple Chart — Twin Estimate vs. Hidden Reality */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              How the Twin Learns: Outlet Atrazine (&mu;g/L)
            </h2>
            <p className="text-xs text-slate-500">
              The twin starts off guessing 30% too slow, then weekly lab samples
              (orange dots) pull its estimate onto the hidden truth.
            </p>
          </div>
          <span className="rounded bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-800">
            Synthetic data: demonstration only
          </span>
        </div>

        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={35} />
              <YAxis tick={{ fontSize: 11 }} unit=" ug/L" width={62} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine
                x={currentDateLabel}
                stroke="#9333ea"
                strokeDasharray="3 3"
              />
              <Line
                type="monotone"
                dataKey="twinOut"
                name="Digital Twin Estimate"
                stroke="#7e22ce"
                strokeWidth={2.2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="truthOut"
                name="Hidden Real Plant"
                stroke="#10b981"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
              />
              <Scatter
                dataKey="labDot"
                name="Weekly Lab Sample"
                fill="#ea580c"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Block 3: Two Simple Cards — Farmer Action + Why It Matters */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold tracking-wide text-slate-500 uppercase">
            What the Farmer Should Do
          </h2>
          {latestAlert ? (
            <div className="mt-3 space-y-3">
              <div className="inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900 uppercase">
                {latestAlert.type.replace("_", " ")} &middot;{" "}
                {formatShortDate(new Date(latestAlert.ts).toISOString())}
              </div>
              <p className="text-sm font-medium text-slate-900">
                {latestAlert.message}
              </p>
              <button
                onClick={() => resolveAlert.mutate({ alertId: latestAlert.id })}
                disabled={resolveAlert.isPending}
                className="rounded-md bg-purple-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-800"
              >
                Mark Done
              </button>
            </div>
          ) : (
            <p className="mt-3 text-sm text-emerald-700 font-medium">
              All clear on {currentDateLabel} — no farmer action needed right now.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold tracking-wide text-slate-500 uppercase">
            Why the Digital Twin Matters
          </h2>
          {whatIfQuery.data ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-purple-50 p-3">
                <div className="text-xs text-purple-800">Twin-Guided Swaps</div>
                <div className="mt-1 font-mono text-2xl font-bold text-purple-900">
                  {whatIfQuery.data.twinGuided.percentAtrazineRemoved.toFixed(0)}%
                </div>
                <div className="text-[11px] text-purple-700">
                  atrazine caught
                </div>
              </div>
              <div className="rounded-lg bg-slate-100 p-3">
                <div className="text-xs text-slate-600">Fixed 1 Swap / Yr</div>
                <div className="mt-1 font-mono text-2xl font-bold text-slate-800">
                  {whatIfQuery.data.fixedAnnual.percentAtrazineRemoved.toFixed(0)}%
                </div>
                <div className="text-[11px] text-slate-600">
                  atrazine caught
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">Loading comparison...</p>
          )}
        </section>
      </div>
    </div>
  );
}
