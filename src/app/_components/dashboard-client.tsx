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

// Turn technical alert types into plain everyday language.
function simpleAlertText(type: string) {
  switch (type) {
    case "swap_soon":
      return {
        label: "Swap Filter Soon",
        text: "Filter 1 is almost full. Take out Filter 1, slide Filter 2 and Filter 3 forward, and drop a fresh filter at the end.",
      };
    case "storm_hold":
      return {
        label: "Big Rain Coming",
        text: "Heavy rain is forecast after spraying. Raise the inlet gate to hold water in the field so the filters don't get overwhelmed.",
      };
    case "nitrate_breakthrough":
      return {
        label: "Check Woodchips",
        text: "Too much fertilizer (nitrate) is getting past the woodchips. Time to inspect the trench.",
      };
    case "clogging":
      return {
        label: "Check for a Clog",
        text: "Water is backing up at the inlet higher than normal. Clear leaves or mud from the screen.",
      };
    case "ice":
      return {
        label: "Freezing Weather",
        text: "Water is near freezing — watch the inlet and outlet gates for ice.",
      };
    default:
      return { label: "Heads Up", text: "Check the underground filter unit." };
  }
}

export function DashboardClient() {
  const utils = api.useUtils();
  const seriesQuery = api.twin.getSeries.useQuery({ stride: 6 });
  const whatIfQuery = api.whatif.compare.useQuery({ seed: 42 });

  const [stepIndex, setStepIndex] = useState(235);
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
      twinOut: p.twinOutletUgl,
      truthOut: p.truthOutletUgl,
      labDot: grabByIdx.get(i) ?? null,
    }));
  }, [points, seriesQuery.data?.grabSamples]);

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
        Loading demo...
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
          Run one simulated farming season (April to October) to see how the
          digital twin tracks buried farm filters.
        </p>
        <button
          onClick={() => runSeason.mutate({ seed: 42 })}
          disabled={runSeason.isPending}
          className="mt-5 rounded-lg bg-purple-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-800 disabled:opacity-50"
        >
          {runSeason.isPending ? "Starting demo..." : "Start Demo Season"}
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
  const alertCopy = latestAlert ? simpleAlertText(latestAlert.type) : null;

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
            {isTreat
              ? "Cleaning farm runoff water"
              : "Off-season (filters resting)"}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying((p) => !p)}
            className="rounded-lg bg-white px-3.5 py-1.5 text-xs font-bold text-purple-800 hover:bg-purple-50"
          >
            {isPlaying ? "Pause" : "Play Year"}
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
            {runSeason.isPending ? "Refreshing..." : "New Weather"}
          </button>
        </div>
      </div>

      {/* Block 1: Simple Picture of Water Cleaning Underground */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-bold text-slate-900">
            How Water Gets Cleaned Underground
          </h2>
          <span className="text-xs font-medium text-slate-500">
            Water flow: <strong>{current.flowLps.toFixed(2)} L/s</strong>
          </span>
        </div>

        <svg
          viewBox="0 0 720 210"
          className="h-auto w-full"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            x="0"
            y="26"
            width="720"
            height="182"
            rx="12"
            fill="#f8fafc"
            stroke="#e2e8f0"
          />
          <line x1="0" y1="26" x2="720" y2="26" stroke="#22c55e" strokeWidth="3" />
          <text x="14" y="17" fill="#15803d" fontSize="11" fontWeight="700">
            FARM FIELD SURFACE (UNIT IS BURIED BELOW)
          </text>

          {/* 1. Dirty Farm Water */}
          <rect
            x="14"
            y="78"
            width="100"
            height="74"
            rx="10"
            fill="#ffffff"
            stroke="#cbd5e1"
            strokeWidth="1.5"
          />
          <text x="64" y="99" textAnchor="middle" fill="#64748b" fontSize="9.5" fontWeight="700">
            1. FARM RUNOFF
          </text>
          <text x="64" y="121" textAnchor="middle" fill="#7e22ce" fontSize="14" fontWeight="800">
            {current.inletAtrazineUgl.toFixed(1)} &mu;g/L
          </text>
          <text x="64" y="138" textAnchor="middle" fill="#64748b" fontSize="9.5">
            Weed-killer in
          </text>

          <line x1="114" y1="115" x2="140" y2="115" stroke="#9333ea" strokeWidth="4" />
          <polygon points="140,109 150,115 140,121" fill="#9333ea" />

          {/* 2. Season Gate */}
          <rect
            x="150"
            y="78"
            width="86"
            height="74"
            rx="10"
            fill="#ffffff"
            stroke="#cbd5e1"
            strokeWidth="1.5"
          />
          <text x="193" y="99" textAnchor="middle" fill="#64748b" fontSize="9.5" fontWeight="700">
            2. GATE
          </text>
          <rect
            x="163"
            y="108"
            width="60"
            height="22"
            rx="6"
            fill={isTreat ? "#dcfce7" : "#e2e8f0"}
          />
          <text
            x="193"
            y="123"
            textAnchor="middle"
            fill={isTreat ? "#166534" : "#334155"}
            fontSize="10.5"
            fontWeight="800"
          >
            {isTreat ? "CLEANING" : "BYPASS"}
          </text>
          <text x="193" y="143" textAnchor="middle" fill="#64748b" fontSize="9">
            Storm tank
          </text>

          <line
            x1="236"
            y1="115"
            x2="262"
            y2="115"
            stroke={isTreat ? "#9333ea" : "#cbd5e1"}
            strokeWidth="4"
          />
          <polygon
            points="262,109 272,115 262,121"
            fill={isTreat ? "#9333ea" : "#cbd5e1"}
          />

          {/* 3. Woodchips */}
          <rect
            x="272"
            y="78"
            width="104"
            height="74"
            rx="10"
            fill="#fffbeb"
            stroke="#fcd34d"
            strokeWidth="1.5"
          />
          <text x="324" y="99" textAnchor="middle" fill="#92400e" fontSize="9.5" fontWeight="700">
            3. WOODCHIPS
          </text>
          <text
            x="324"
            y="121"
            textAnchor="middle"
            fill={current.nitrateAfterChipsMgl > 5 ? "#dc2626" : "#15803d"}
            fontSize="13.5"
            fontWeight="800"
          >
            {current.nitrateAfterChipsMgl.toFixed(1)} mg/L
          </text>
          <text x="324" y="138" textAnchor="middle" fill="#92400e" fontSize="9.5">
            Fertilizer left
          </text>

          <line
            x1="376"
            y1="115"
            x2="402"
            y2="115"
            stroke={isTreat ? "#9333ea" : "#cbd5e1"}
            strokeWidth="4"
          />
          <polygon
            points="402,109 412,115 402,121"
            fill={isTreat ? "#9333ea" : "#cbd5e1"}
          />

          {/* 4. Carbon Filters */}
          <rect
            x="412"
            y="48"
            width="164"
            height="132"
            rx="12"
            fill="#faf5ff"
            stroke="#9333ea"
            strokeWidth="2"
          />
          <text x="494" y="66" textAnchor="middle" fill="#6b21a8" fontSize="10" fontWeight="800">
            4. CARBON FILTERS
          </text>

          <text x="444" y="82" textAnchor="middle" fill="#475569" fontSize="9" fontWeight="700">
            Filter 1
          </text>
          <rect x="426" y="87" width="36" height="66" rx="5" fill="#e2e8f0" />
          <rect x="428" y={151 - c1H} width="32" height={c1H} rx="3" fill={barColor(current.twinC1)} />
          <line x1="426" y1={151 - c1TH} x2="462" y2={151 - c1TH} stroke="#0f172a" strokeWidth="2" strokeDasharray="3 2" />
          <text x="444" y="168" textAnchor="middle" fill="#0f172a" fontSize="10" fontWeight="700">
            {Math.round(current.twinC1 * 100)}%
          </text>

          <text x="494" y="82" textAnchor="middle" fill="#475569" fontSize="9" fontWeight="700">
            Filter 2
          </text>
          <rect x="476" y="87" width="36" height="66" rx="5" fill="#e2e8f0" />
          <rect x="478" y={151 - c2H} width="32" height={c2H} rx="3" fill={barColor(current.twinC2)} />
          <line x1="476" y1={151 - c2TH} x2="512" y2={151 - c2TH} stroke="#0f172a" strokeWidth="2" strokeDasharray="3 2" />
          <text x="494" y="168" textAnchor="middle" fill="#0f172a" fontSize="10" fontWeight="700">
            {Math.round(current.twinC2 * 100)}%
          </text>

          <text x="544" y="82" textAnchor="middle" fill="#475569" fontSize="9" fontWeight="700">
            Backup
          </text>
          <rect x="526" y="87" width="36" height="66" rx="5" fill="#e2e8f0" />
          <rect x="528" y={151 - polH} width="32" height={polH} rx="3" fill={barColor(current.twinPolish)} />
          <line x1="526" y1={151 - polTH} x2="562" y2={151 - polTH} stroke="#0f172a" strokeWidth="2" strokeDasharray="3 2" />
          <text x="544" y="168" textAnchor="middle" fill="#0f172a" fontSize="10" fontWeight="700">
            {Math.round(current.twinPolish * 100)}%
          </text>

          <line x1="576" y1="115" x2="602" y2="115" stroke="#0ea5e9" strokeWidth="4" />
          <polygon points="602,109 612,115 602,121" fill="#0ea5e9" />

          {/* 5. Clean Water Out */}
          <rect
            x="612"
            y="78"
            width="94"
            height="74"
            rx="10"
            fill="#f0f9ff"
            stroke="#38bdf8"
            strokeWidth="1.5"
          />
          <text x="659" y="99" textAnchor="middle" fill="#0369a1" fontSize="9.5" fontWeight="700">
            5. CLEAN WATER
          </text>
          <text x="659" y="121" textAnchor="middle" fill="#0284c7" fontSize="14" fontWeight="800">
            {current.twinOutletUgl.toFixed(2)} &mu;g/L
          </text>
          <text x="659" y="138" textAnchor="middle" fill="#0369a1" fontSize="9.5">
            Real: {current.truthOutletUgl.toFixed(2)}
          </text>

          <text x="14" y="197" fill="#64748b" fontSize="9.5">
            Color bars = Twin&apos;s guess (green = fresh, yellow = half full, red = swap soon) &middot; Dashed line = Real buried filter
          </text>
        </svg>

        {/* Simple Date Slider */}
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
            <span>April (Start)</span>
            <span>May (Spraying)</span>
            <span>Summer (Swapping Filters)</span>
            <span>October (Off-Season)</span>
          </div>
        </div>
      </section>

      {/* Block 2: One Simple Graph */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              How the Twin Learns Over the Year
            </h2>
            <p className="text-xs text-slate-500">
              Our twin starts off guessing a little wrong. Each week, a real
              water test (orange dot) corrects it so it matches reality.
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
              <YAxis tick={{ fontSize: 11 }} width={48} />
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
                name="Twin's Guess (weed-killer out)"
                stroke="#7e22ce"
                strokeWidth={2.2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="truthOut"
                name="Real Water Out (hidden)"
                stroke="#10b981"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
              />
              <Scatter
                dataKey="labDot"
                name="Weekly Water Test"
                fill="#ea580c"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Block 3: Two Plain-English Cards */}
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold tracking-wide text-slate-500 uppercase">
            What the Farmer Should Do Now
          </h2>
          {latestAlert && alertCopy ? (
            <div className="mt-3 space-y-3">
              <div className="inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900">
                {alertCopy.label} &middot;{" "}
                {formatShortDate(new Date(latestAlert.ts).toISOString())}
              </div>
              <p className="text-sm font-medium text-slate-900">
                {alertCopy.text}
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
            <p className="mt-3 text-sm font-medium text-emerald-700">
              Everything looks good on {currentDateLabel} — nothing to do right
              now.
            </p>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-bold tracking-wide text-slate-500 uppercase">
            Why Using the Twin Helps
          </h2>
          {whatIfQuery.data ? (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-purple-50 p-3">
                <div className="text-xs font-medium text-purple-800">
                  With Digital Twin
                </div>
                <div className="mt-1 font-mono text-2xl font-bold text-purple-900">
                  {whatIfQuery.data.twinGuided.percentAtrazineRemoved.toFixed(0)}
                  %
                </div>
                <div className="text-[11px] text-purple-700">
                  of weed-killer caught
                </div>
              </div>
              <div className="rounded-lg bg-slate-100 p-3">
                <div className="text-xs font-medium text-slate-600">
                  Swapping Once a Year
                </div>
                <div className="mt-1 font-mono text-2xl font-bold text-slate-800">
                  {whatIfQuery.data.fixedAnnual.percentAtrazineRemoved.toFixed(
                    0,
                  )}
                  %
                </div>
                <div className="text-[11px] text-slate-600">
                  of weed-killer caught
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
