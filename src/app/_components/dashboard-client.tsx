"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { api } from "~/trpc/react";

const SEASON_LABELS: Record<string, { label: string; badge: string }> = {
  startup: { label: "Start-up (April)", badge: "bg-sky-100 text-sky-900" },
  spray: { label: "Spray Season (May–Jul)", badge: "bg-purple-100 text-purple-900" },
  late_summer: {
    label: "Late Summer (Aug–Sep)",
    badge: "bg-amber-100 text-amber-900",
  },
  off_season: {
    label: "Off-Season (Bypass)",
    badge: "bg-slate-200 text-slate-800",
  },
};

const ALERT_BADGES: Record<string, string> = {
  storm_hold: "bg-purple-100 text-purple-900",
  swap_soon: "bg-amber-100 text-amber-900",
  nitrate_breakthrough: "bg-red-100 text-red-900",
  clogging: "bg-orange-100 text-orange-900",
  ice: "bg-sky-100 text-sky-900",
};

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function cartridgeBarColor(fraction: number) {
  if (fraction >= 0.85) return "bg-red-500";
  if (fraction >= 0.6) return "bg-amber-500";
  return "bg-emerald-500";
}

function CartridgeBar({
  label,
  twinFrac,
  truthFrac,
  showTruth,
}: {
  label: string;
  twinFrac: number;
  truthFrac: number;
  showTruth: boolean;
}) {
  const pct = Math.round(twinFrac * 100);
  const truthPct = Math.round(truthFrac * 100);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-slate-700">{label}</span>
        <span className="font-mono font-semibold text-slate-900">{pct}%</span>
      </div>
      <div className="relative h-3 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full transition-all duration-150 ${cartridgeBarColor(twinFrac)}`}
          style={{ width: `${Math.min(100, Math.max(2, pct))}%` }}
        />
        {showTruth && (
          <div
            title={`Hidden truth: ${truthPct}%`}
            className="absolute top-0 bottom-0 w-0.5 bg-slate-900"
            style={{ left: `${Math.min(99, Math.max(1, truthPct))}%` }}
          />
        )}
      </div>
      {showTruth && (
        <div className="flex justify-between text-[10px] text-slate-500">
          <span>Twin est.</span>
          <span>Truth: {truthPct}%</span>
        </div>
      )}
    </div>
  );
}

export function DashboardClient() {
  const utils = api.useUtils();
  const seriesQuery = api.twin.getSeries.useQuery({ stride: 1 });

  const [seed, setSeed] = useState(42);
  const [hourIndex, setHourIndex] = useState(1400); // Default mid-spray season (~May 29)
  const [isPlaying, setIsPlaying] = useState(false);
  const [showTruth, setShowTruth] = useState(true);
  const [showAllAlerts, setShowAllAlerts] = useState(false);

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

  const swapCartridge = api.site.swapCartridge.useMutation({
    onSuccess: async () => {
      await utils.twin.getSeries.invalidate();
    },
  });

  const points = useMemo(() => seriesQuery.data?.points ?? [], [seriesQuery.data?.points]);
  const maxIndex = Math.max(0, points.length - 1);

  // Keep slider index in bounds when data reloads.
  const safeIndex = Math.min(hourIndex, maxIndex);
  const current = points[safeIndex];

  // Smooth season replay timer (advances 6 hours per tick).
  useEffect(() => {
    if (!isPlaying || points.length === 0) return;
    const id = setInterval(() => {
      setHourIndex((prev) => {
        if (prev + 6 >= points.length - 1) {
          setIsPlaying(false);
          return points.length - 1;
        }
        return prev + 6;
      });
    }, 120);
    return () => clearInterval(id);
  }, [isPlaying, points.length]);

  const activeAlerts = useMemo(() => {
    const all = seriesQuery.data?.alerts ?? [];
    if (!current) return all;
    const currentMs = new Date(current.ts).getTime();
    return all.filter((a) => {
      if (a.resolved) return false;
      if (showAllAlerts) return true;
      return new Date(a.ts).getTime() <= currentMs;
    });
  }, [seriesQuery.data?.alerts, current, showAllAlerts]);

  const visibleEvents = useMemo(() => {
    const all = seriesQuery.data?.events ?? [];
    if (!current) return all.slice(0, 8);
    const currentMs = new Date(current.ts).getTime();
    return all.filter((e) => new Date(e.ts).getTime() <= currentMs).slice(0, 8);
  }, [seriesQuery.data?.events, current]);

  if (seriesQuery.isLoading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-600">
        Loading NEPHRON digital twin from Neon Postgres...
      </div>
    );
  }

  if (!seriesQuery.data?.site || points.length === 0 || !current) {
    return (
      <div className="rounded-xl border border-purple-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto inline-block rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-800">
          Synthetic data: demonstration only
        </div>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">
          Seed Your First NEPHRON Season
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">
          No simulation data is stored in Neon yet. Click below to simulate an
          entire April–October farming season (5,136 hourly steps) with noisy
          sensors, delayed weekly lab grab samples, and the learning digital
          twin.
        </p>
        <button
          onClick={() => runSeason.mutate({ seed })}
          disabled={runSeason.isPending}
          className="mt-6 rounded-lg bg-purple-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-800 disabled:opacity-50"
        >
          {runSeason.isPending
            ? "Simulating & writing to Neon..."
            : "Seed Season Data (Seed #42)"}
        </button>
      </div>
    );
  }

  const activeSite = seriesQuery.data.site;
  const isTreat = current.seasonMode !== "off_season";
  const seasonMeta =
    SEASON_LABELS[current.seasonMode] ?? SEASON_LABELS.spray!;

  return (
    <div className="space-y-6">
      {/* Purple Digital Twin Banner */}
      <section className="rounded-xl bg-purple-700 p-5 text-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-white/20 px-2 py-0.5 text-xs font-semibold tracking-wide uppercase">
                Digital Twin
              </span>
              <span className="text-xs text-purple-100">
                Synthetic data: demonstration only
              </span>
            </div>
            <h1 className="mt-1 text-xl font-bold sm:text-2xl">
              {activeSite.name} ({activeSite.areaHa} ha)
            </h1>
            <p className="mt-0.5 text-xs text-purple-100">
              Replay time: <strong className="text-white">{formatDateTime(current.ts)} UTC</strong>
              {" · "}
              Spray date:{" "}
              <strong className="text-white">
                {activeSite.sprayDate
                  ? new Date(activeSite.sprayDate).toISOString().slice(0, 10)
                  : "Not logged"}
              </strong>
              {" · "}
              Mode: <strong className="text-white">{seasonMeta.label}</strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 rounded-lg bg-white/15 px-3 py-1.5 text-xs">
              <input
                type="checkbox"
                checked={showTruth}
                onChange={(e) => setShowTruth(e.target.checked)}
                className="accent-white"
              />
              Show hidden truth
            </label>

            <div className="flex items-center gap-1 rounded-lg bg-white/15 px-2 py-1">
              <span className="text-xs text-purple-100">Seed</span>
              <input
                type="number"
                value={seed}
                onChange={(e) => setSeed(Math.max(1, Number(e.target.value) || 1))}
                className="w-16 rounded bg-white/90 px-1.5 py-0.5 text-xs font-mono text-slate-900"
              />
              <button
                onClick={() => runSeason.mutate({ siteId: activeSite.id, seed })}
                disabled={runSeason.isPending}
                className="rounded bg-white px-2.5 py-1 text-xs font-semibold text-purple-800 hover:bg-purple-50 disabled:opacity-60"
              >
                {runSeason.isPending ? "Seeding..." : "Reseed"}
              </button>
            </div>

            <button
              onClick={() =>
                swapCartridge.mutate({
                  siteId: activeSite.id,
                  ts: new Date(current.ts),
                })
              }
              disabled={swapCartridge.isPending}
              className="rounded-lg border border-white/40 bg-purple-800 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-900 disabled:opacity-60"
            >
              {swapCartridge.isPending ? "Logging..." : "Log Cartridge Swap"}
            </button>
          </div>
        </div>
      </section>

      {/* 6-Box Treatment Schematic */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              NEPHRON Process Flow Schematic
            </h2>
            <p className="text-xs text-slate-500">
              Tile drain &rarr; Inlet box &rarr; Woodchip trench &rarr; Carbon
              box (C1 &rarr; C2 &rarr; Polish) &rarr; Outlet box &rarr; Ditch
            </p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-xs font-semibold ${seasonMeta.badge}`}
          >
            Season Board: {isTreat ? "TREAT" : "BYPASS"}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-6">
          {/* Box 1: Tile Drain */}
          <div className="relative flex flex-col justify-between rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <div>
              <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                Inflow
              </div>
              <div className="text-sm font-bold text-slate-900">Tile Drain</div>
            </div>
            <div className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Flow</span>
                <span className="font-mono font-semibold">
                  {current.flowLps.toFixed(2)} L/s
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Inlet atrazine</span>
                <span className="font-mono font-semibold text-purple-700">
                  {current.inletAtrazineUgl.toFixed(2)} &mu;g/L
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">24h rain</span>
                <span className="font-mono">{current.rainForecastMm24h.toFixed(0)} mm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Water temp</span>
                <span className="font-mono">{current.tempC.toFixed(1)} &deg;C</span>
              </div>
            </div>
          </div>

          {/* Box 2: Inlet Box */}
          <div className="flex flex-col justify-between rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <div>
              <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                1. Control
              </div>
              <div className="text-sm font-bold text-slate-900">Inlet Box</div>
            </div>
            <div className="mt-3 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Season board</span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                    isTreat
                      ? "bg-emerald-100 text-emerald-800"
                      : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {isTreat ? "TREAT" : "BYPASS"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Inlet level</span>
                <span className="font-mono">{current.inletLevelM.toFixed(2)} m</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Hydraulic cap</span>
                <span className="font-mono">3.5 L/s</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Basin</span>
                <span className="font-mono">300 m&sup3;</span>
              </div>
            </div>
          </div>

          {/* Box 3: Woodchip Trench */}
          <div className="flex flex-col justify-between rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <div>
              <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                2. Denitrification
              </div>
              <div className="text-sm font-bold text-slate-900">
                Woodchip Trench
              </div>
            </div>
            <div className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Nitrate out</span>
                <span
                  className={`font-mono font-semibold ${
                    current.nitrateAfterChipsMgl > 5
                      ? "text-red-600"
                      : "text-emerald-700"
                  }`}
                >
                  {current.nitrateAfterChipsMgl.toFixed(1)} mg/L
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Atrazine cut</span>
                <span className="font-mono">25%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">UV254 (DOM)</span>
                <span className="font-mono">{current.uv254.toFixed(3)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Turbidity</span>
                <span className="font-mono">{current.turbidityNtu.toFixed(1)} NTU</span>
              </div>
            </div>
          </div>

          {/* Box 4: Carbon Box (3 cartridges with fill bars) */}
          <div className="flex flex-col justify-between rounded-lg border-2 border-purple-400 bg-purple-50/40 p-3.5">
            <div>
              <div className="text-[11px] font-semibold tracking-wide text-purple-700 uppercase">
                3. Adsorption
              </div>
              <div className="text-sm font-bold text-slate-900">Carbon Box</div>
            </div>
            <div className="mt-2.5 space-y-2">
              <CartridgeBar
                label="Carbon 1"
                twinFrac={current.twinC1}
                truthFrac={current.truthC1}
                showTruth={showTruth}
              />
              <CartridgeBar
                label="Carbon 2"
                twinFrac={current.twinC2}
                truthFrac={current.truthC2}
                showTruth={showTruth}
              />
              <CartridgeBar
                label="Polish"
                twinFrac={current.twinPolish}
                truthFrac={current.truthPolish}
                showTruth={showTruth}
              />
            </div>
            <div className="mt-2 flex justify-between border-t border-purple-200 pt-1.5 text-[11px]">
              <span className="text-slate-600">After C2</span>
              <span className="font-mono font-semibold text-purple-900">
                {current.twinAfterC2Ugl.toFixed(3)} &mu;g/L
              </span>
            </div>
          </div>

          {/* Box 5: Outlet Box */}
          <div className="flex flex-col justify-between rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <div>
              <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                4. Effluent
              </div>
              <div className="text-sm font-bold text-slate-900">Outlet Box</div>
            </div>
            <div className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Twin outlet</span>
                <span className="font-mono font-bold text-purple-700">
                  {current.twinOutletUgl.toFixed(3)} &mu;g/L
                </span>
              </div>
              {showTruth && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Truth outlet</span>
                  <span className="font-mono font-semibold text-emerald-700">
                    {current.truthOutletUgl.toFixed(3)} &mu;g/L
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Status</span>
                <span
                  className={`font-semibold ${
                    current.twinOutletUgl > 0.3
                      ? "text-amber-700"
                      : "text-emerald-700"
                  }`}
                >
                  {isTreat ? "Treating" : "Bypassed"}
                </span>
              </div>
            </div>
          </div>

          {/* Box 6: Ditch */}
          <div className="flex flex-col justify-between rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <div>
              <div className="text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                Receiving Water
              </div>
              <div className="text-sm font-bold text-slate-900">
                Drainage Ditch
              </div>
            </div>
            <div className="mt-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Removed (cum)</span>
                <span className="font-mono font-bold text-emerald-700">
                  {current.twinRemovedMg.toFixed(0)} mg
                </span>
              </div>
              {showTruth && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Truth removed</span>
                  <span className="font-mono text-slate-700">
                    {current.truthRemovedMg.toFixed(0)} mg
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Bypassed (cum)</span>
                <span className="font-mono font-semibold text-slate-800">
                  {current.twinBypassM3.toFixed(0)} m&sup3;
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Time Replay Slider */}
        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsPlaying((p) => !p)}
                className="rounded-md bg-purple-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-purple-800"
              >
                {isPlaying ? "Pause" : "Play Season"}
              </button>
              <span className="text-xs font-medium text-slate-700">
                Hour {safeIndex + 1} / {points.length} &mdash;{" "}
                <strong className="font-mono">{formatDateTime(current.ts)} UTC</strong>
              </span>
            </div>

            <div className="flex flex-wrap gap-1.5 text-xs">
              {[
                { label: "Start-up", idx: 72 },
                { label: "Spray Day", idx: 39 * 24 },
                { label: "First Flush", idx: 50 * 24 },
                { label: "Mid-Summer", idx: 105 * 24 },
                { label: "Late Summer", idx: 145 * 24 },
                { label: "Off-Season", idx: 195 * 24 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  onClick={() => {
                    setIsPlaying(false);
                    setHourIndex(Math.min(maxIndex, preset.idx));
                  }}
                  className="rounded border border-slate-300 bg-white px-2 py-1 text-slate-700 hover:border-purple-400 hover:text-purple-800"
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          <input
            type="range"
            min={0}
            max={maxIndex}
            value={safeIndex}
            onChange={(e) => {
              setIsPlaying(false);
              setHourIndex(Number(e.target.value));
            }}
            className="mt-3 w-full accent-purple-700"
          />
          <div className="flex justify-between text-[11px] text-slate-500">
            <span>Apr 1</span>
            <span>May 10 (Spray)</span>
            <span>Jul 1</span>
            <span>Sep 1</span>
            <span>Oct 31</span>
          </div>
        </div>
      </section>

      {/* Alerts & Events */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              Active Farmer Alerts ({activeAlerts.length})
            </h2>
            <label className="flex items-center gap-1.5 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={showAllAlerts}
                onChange={(e) => setShowAllAlerts(e.target.checked)}
                className="accent-purple-700"
              />
              Show full season
            </label>
          </div>

          {activeAlerts.length === 0 ? (
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
              No unresolved alerts up to this replay timestamp. Scrub forward to
              inspect storm holds, cartridge swap warnings, nitrate events, or
              clogging alerts.
            </p>
          ) : (
            <ul className="max-h-80 space-y-2.5 overflow-y-auto pr-1">
              {activeAlerts.map((a) => (
                <li
                  key={a.id}
                  className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                          ALERT_BADGES[a.type] ?? "bg-slate-100 text-slate-800"
                        }`}
                      >
                        {a.type.replace("_", " ")}
                      </span>
                      <span className="font-mono text-xs text-slate-500">
                        {formatDateTime(new Date(a.ts).toISOString())}
                      </span>
                    </div>
                    <p className="text-sm text-slate-800">{a.message}</p>
                  </div>
                  <button
                    onClick={() => resolveAlert.mutate({ alertId: a.id })}
                    disabled={resolveAlert.isPending}
                    className="shrink-0 rounded-md border border-purple-200 bg-purple-50 px-2.5 py-1 text-xs font-semibold text-purple-800 hover:bg-purple-100"
                  >
                    Resolve
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              Recent Operations Log
            </h2>
            <div className="flex gap-3 text-xs font-medium text-purple-700">
              <Link href="/charts" className="hover:underline">
                View Charts &rarr;
              </Link>
              <Link href="/whatif" className="hover:underline">
                What-If Demo &rarr;
              </Link>
            </div>
          </div>

          {visibleEvents.length === 0 ? (
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
              No logged events yet.
            </p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {visibleEvents.map((ev) => (
                <li
                  key={ev.id}
                  className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-purple-800 uppercase">
                      {ev.type.replace("_", " ")}
                    </span>
                    <span className="font-mono text-slate-500">
                      {formatDateTime(new Date(ev.ts).toISOString())}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-700">{ev.note}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
