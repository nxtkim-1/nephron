"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "~/trpc/react";

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        <span className="rounded bg-purple-50 px-2 py-0.5 text-[11px] font-medium text-purple-800">
          Synthetic data: demonstration only
        </span>
      </div>
      <div className="h-72 w-full">{children}</div>
    </section>
  );
}

export function ChartsClient() {
  // Stride by 6 hours (~856 points) for crisp, responsive Recharts rendering.
  const seriesQuery = api.twin.getSeries.useQuery({ stride: 6 });

  const chartData = useMemo(() => {
    const pts = seriesQuery.data?.points ?? [];
    const grabs = seriesQuery.data?.grabSamples ?? [];

    // Map weekly outlet grab samples to the nearest chart point timestamp so dots overlay cleanly.
    const outletGrabByIdx = new Map<number, number>();
    const afterC2GrabByIdx = new Map<number, number>();

    for (const g of grabs) {
      const gMs = new Date(g.ts).getTime();
      let bestIdx = 0;
      let bestDiff = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const diff = Math.abs(new Date(pts[i]!.ts).getTime() - gMs);
        if (diff < bestDiff) {
          bestDiff = diff;
          bestIdx = i;
        }
      }
      if (g.location === "outlet") outletGrabByIdx.set(bestIdx, g.atrazineUgl);
      if (g.location === "after_c2") afterC2GrabByIdx.set(bestIdx, g.atrazineUgl);
    }

    return pts.map((p, idx) => ({
      label: shortDate(p.ts),
      flowLps: p.flowLps,
      rainForecastMm24h: p.rainForecastMm24h,
      inletAtrazineUgl: p.inletAtrazineUgl,
      twinOutletUgl: p.twinOutletUgl,
      truthOutletUgl: p.truthOutletUgl,
      grabOutletUgl: outletGrabByIdx.get(idx) ?? null,
      grabAfterC2Ugl: afterC2GrabByIdx.get(idx) ?? null,
      twinC1Pct: Number((p.twinC1 * 100).toFixed(1)),
      truthC1Pct: Number((p.truthC1 * 100).toFixed(1)),
      twinC2Pct: Number((p.twinC2 * 100).toFixed(1)),
      truthC2Pct: Number((p.truthC2 * 100).toFixed(1)),
      twinBypassM3: p.twinBypassM3,
      truthBypassM3: p.truthBypassM3,
    }));
  }, [seriesQuery.data]);

  if (seriesQuery.isLoading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-600">
        Loading season time series from Neon...
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
        <p className="text-sm text-slate-600">
          No simulation data in the database yet.
        </p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-lg bg-purple-700 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-800"
        >
          Go to Dashboard to Seed Season
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            NEPHRON Season Charts — Twin vs. Hidden Truth
          </h1>
          <p className="text-sm text-slate-600">
            The twin only sees noisy sensor readings and delayed weekly lab grab
            samples, yet converges on the hidden plant state.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 1. Flow & Rain */}
        <ChartCard
          title="Tile Flow & 24h Rain Forecast"
          subtitle="Base flow (0.2 L/s) plus Poisson storm pulses and 24-hour rain lookahead"
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={30} />
              <YAxis
                yAxisId="flow"
                tick={{ fontSize: 11 }}
                label={{
                  value: "L/s",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 11 },
                }}
              />
              <YAxis
                yAxisId="rain"
                orientation="right"
                tick={{ fontSize: 11 }}
                label={{
                  value: "mm",
                  angle: 90,
                  position: "insideRight",
                  style: { fontSize: 11 },
                }}
              />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar
                yAxisId="rain"
                dataKey="rainForecastMm24h"
                name="24h Rain Forecast (mm)"
                fill="#c4b5fd"
                opacity={0.7}
              />
              <Line
                yAxisId="flow"
                type="monotone"
                dataKey="flowLps"
                name="Tile Flow (L/s)"
                stroke="#6d28d9"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 2. Inlet vs Outlet Atrazine */}
        <ChartCard
          title="Inlet vs. Outlet Atrazine (&mu;g/L)"
          subtitle="Twin estimate (solid), hidden truth (dashed), and weekly lab grab samples (dots)"
        >
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={30} />
              <YAxis
                tick={{ fontSize: 11 }}
                label={{
                  value: "ug/L",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 11 },
                }}
              />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="inletAtrazineUgl"
                name="Inlet Atrazine"
                stroke="#94a3b8"
                strokeWidth={1.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="twinOutletUgl"
                name="Outlet (Twin)"
                stroke="#7e22ce"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="truthOutletUgl"
                name="Outlet (Truth)"
                stroke="#059669"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
              />
              <Scatter
                dataKey="grabOutletUgl"
                name="Lab Grab (Outlet)"
                fill="#ea580c"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 3. Cartridge Capacity Used (Twin vs Truth) */}
        <ChartCard
          title="Cartridge Capacity Used — Twin vs. Truth (%)"
          subtitle="Twin starts with nominal fouling (k_dom) and corrects toward +30% faster true fouling"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={30} />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 11 }}
                label={{
                  value: "% Used",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 11 },
                }}
              />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="twinC1Pct"
                name="Carbon 1 (Twin)"
                stroke="#7e22ce"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="truthC1Pct"
                name="Carbon 1 (Truth)"
                stroke="#7e22ce"
                strokeWidth={1.8}
                strokeDasharray="5 4"
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="twinC2Pct"
                name="Carbon 2 (Twin)"
                stroke="#0284c7"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="truthC2Pct"
                name="Carbon 2 (Truth)"
                stroke="#0284c7"
                strokeWidth={1.8}
                strokeDasharray="5 4"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* 4. Cumulative Bypass */}
        <ChartCard
          title="Cumulative Bypass Volume (m&sup3;)"
          subtitle="Storm overflow above 3.5 L/s (when 300 m3 basin fills) + October off-season bypass"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={30} />
              <YAxis
                tick={{ fontSize: 11 }}
                label={{
                  value: "m3",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 11 },
                }}
              />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                type="monotone"
                dataKey="twinBypassM3"
                name="Bypass (Twin)"
                stroke="#7e22ce"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="truthBypassM3"
                name="Bypass (Truth)"
                stroke="#475569"
                strokeWidth={2}
                strokeDasharray="5 4"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}
