"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { api } from "~/trpc/react";

function MiniBarCard({
  title,
  unit,
  twinValue,
  fixedValue,
  decimals = 1,
}: {
  title: string;
  unit: string;
  twinValue: number;
  fixedValue: number;
  decimals?: number;
}) {
  const data = [
    {
      strategy: "Twin-Guided",
      value: Number(twinValue.toFixed(decimals)),
      color: "#7e22ce",
    },
    {
      strategy: "Fixed 1/yr",
      value: Number(fixedValue.toFixed(decimals)),
      color: "#94a3b8",
    },
  ];

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500">Units: {unit}</p>
        </div>
        <span className="rounded bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-800">
          Synthetic data: demonstration only
        </span>
      </div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="strategy" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.strategy} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function WhatIfClient() {
  const [seedInput, setSeedInput] = useState(42);
  const [activeSeed, setActiveSeed] = useState(42);

  const compareQuery = api.whatif.compare.useQuery({ seed: activeSeed });

  const data = compareQuery.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            What-If Comparison: Twin-Guided vs. Fixed Annual Swap
          </h1>
          <p className="text-sm text-slate-600">
            Same synthetic weather, storms, and spray season (Apr 1 – Oct 31),
            run side by side under two operating strategies.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-slate-600">
            Weather Seed:
          </label>
          <input
            type="number"
            value={seedInput}
            onChange={(e) => setSeedInput(Math.max(1, Number(e.target.value) || 1))}
            className="w-20 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm"
          />
          <button
            onClick={() => setActiveSeed(seedInput)}
            className="rounded-md bg-purple-700 px-4 py-1.5 text-sm font-semibold text-white hover:bg-purple-800"
          >
            Compare
          </button>
          <button
            onClick={() => {
              const next = Math.floor(1 + Math.random() * 9000);
              setSeedInput(next);
              setActiveSeed(next);
            }}
            className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Random Seed
          </button>
        </div>
      </div>

      {compareQuery.isLoading || !data ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center text-slate-600">
          Running side-by-side season simulations...
        </div>
      ) : (
        <>
          {/* Headline delta banner */}
          <section className="rounded-xl bg-purple-700 p-5 text-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-xs font-semibold tracking-wide text-purple-200 uppercase">
                  Headline Demo Result (Seed #{data.seed}) &middot; Synthetic
                  data: demonstration only
                </div>
                <div className="mt-1 text-xl font-bold sm:text-2xl">
                  Twin-guided swaps captured{" "}
                  {(
                    data.twinGuided.percentAtrazineRemoved -
                    data.fixedAnnual.percentAtrazineRemoved
                  ) >= 0
                    ? `+${(
                        data.twinGuided.percentAtrazineRemoved -
                        data.fixedAnnual.percentAtrazineRemoved
                      ).toFixed(1)}%`
                    : `${(
                        data.twinGuided.percentAtrazineRemoved -
                        data.fixedAnnual.percentAtrazineRemoved
                      ).toFixed(1)}%`}{" "}
                  more atrazine ({data.twinGuided.percentAtrazineRemoved.toFixed(1)}%
                  vs. {data.fixedAnnual.percentAtrazineRemoved.toFixed(1)}%)
                </div>
              </div>
              <div className="rounded-lg bg-white/15 px-4 py-2 text-right text-xs">
                <div>Mass balance error</div>
                <div className="font-mono text-base font-bold">
                  {data.twinGuided.massBalanceErrorPct.toFixed(4)}%
                </div>
              </div>
            </div>
          </section>

          {/* 3 Side-by-Side Bar Charts */}
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <MiniBarCard
              title="% Atrazine Removed"
              unit="% of total inflow mass"
              twinValue={data.twinGuided.percentAtrazineRemoved}
              fixedValue={data.fixedAnnual.percentAtrazineRemoved}
              decimals={1}
            />
            <MiniBarCard
              title="Cartridges Used"
              unit="3 initial + lead-lag swaps"
              twinValue={data.twinGuided.cartridgesUsed}
              fixedValue={data.fixedAnnual.cartridgesUsed}
              decimals={0}
            />
            <MiniBarCard
              title="Bypassed Volume"
              unit="m3 (storms + off-season)"
              twinValue={data.twinGuided.bypassedM3}
              fixedValue={data.fixedAnnual.bypassedM3}
              decimals={0}
            />
          </div>

          {/* Detailed Comparison Table */}
          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3.5">
              <h2 className="text-base font-semibold text-slate-900">
                Full Season Metrics Table
              </h2>
              <span className="text-xs text-purple-800">
                Synthetic data: demonstration only
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-600 uppercase">
                  <tr>
                    <th className="px-5 py-3">Metric</th>
                    <th className="px-5 py-3 text-purple-800">
                      (a) Twin-Guided Swaps
                    </th>
                    <th className="px-5 py-3">(b) Fixed 1 Swap / Year</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="px-5 py-3 font-medium text-slate-800">
                      Atrazine removed (%)
                    </td>
                    <td className="px-5 py-3 font-mono font-bold text-purple-800">
                      {data.twinGuided.percentAtrazineRemoved.toFixed(1)}%
                    </td>
                    <td className="px-5 py-3 font-mono text-slate-700">
                      {data.fixedAnnual.percentAtrazineRemoved.toFixed(1)}%
                    </td>
                  </tr>
                  <tr>
                    <td className="px-5 py-3 font-medium text-slate-800">
                      Atrazine mass removed (mg)
                    </td>
                    <td className="px-5 py-3 font-mono">
                      {data.twinGuided.totalRemovedMg.toFixed(0)} mg
                    </td>
                    <td className="px-5 py-3 font-mono">
                      {data.fixedAnnual.totalRemovedMg.toFixed(0)} mg
                    </td>
                  </tr>
                  <tr>
                    <td className="px-5 py-3 font-medium text-slate-800">
                      Cartridges used (3 initial + swaps)
                    </td>
                    <td className="px-5 py-3 font-mono font-semibold">
                      {data.twinGuided.cartridgesUsed} ({data.twinGuided.swapsCount}{" "}
                      swaps)
                    </td>
                    <td className="px-5 py-3 font-mono">
                      {data.fixedAnnual.cartridgesUsed} (
                      {data.fixedAnnual.swapsCount} swap on Jul 15)
                    </td>
                  </tr>
                  <tr>
                    <td className="px-5 py-3 font-medium text-slate-800">
                      Bypassed volume (m&sup3;)
                    </td>
                    <td className="px-5 py-3 font-mono">
                      {data.twinGuided.bypassedM3.toFixed(1)} m&sup3;
                    </td>
                    <td className="px-5 py-3 font-mono">
                      {data.fixedAnnual.bypassedM3.toFixed(1)} m&sup3;
                    </td>
                  </tr>
                  <tr>
                    <td className="px-5 py-3 font-medium text-slate-800">
                      Mean outlet atrazine (&mu;g/L)
                    </td>
                    <td className="px-5 py-3 font-mono">
                      {data.twinGuided.meanOutletAtrazineUgl.toFixed(3)} &mu;g/L
                    </td>
                    <td className="px-5 py-3 font-mono">
                      {data.fixedAnnual.meanOutletAtrazineUgl.toFixed(3)} &mu;g/L
                    </td>
                  </tr>
                  <tr>
                    <td className="px-5 py-3 font-medium text-slate-800">
                      Peak outlet atrazine (&mu;g/L)
                    </td>
                    <td className="px-5 py-3 font-mono">
                      {data.twinGuided.peakOutletAtrazineUgl.toFixed(3)} &mu;g/L
                    </td>
                    <td className="px-5 py-3 font-mono">
                      {data.fixedAnnual.peakOutletAtrazineUgl.toFixed(3)} &mu;g/L
                    </td>
                  </tr>
                  <tr>
                    <td className="px-5 py-3 font-medium text-slate-800">
                      Twin learned fouling rate (k_dom)
                    </td>
                    <td className="px-5 py-3 font-mono">
                      {data.twinGuided.finalTwinKDom.toFixed(3)} (true:{" "}
                      {data.twinGuided.trueKDom.toFixed(3)})
                    </td>
                    <td className="px-5 py-3 font-mono">
                      {data.fixedAnnual.finalTwinKDom.toFixed(3)} (true:{" "}
                      {data.fixedAnnual.trueKDom.toFixed(3)})
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
