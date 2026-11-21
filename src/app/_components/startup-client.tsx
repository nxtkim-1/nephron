"use client";

import { useState } from "react";
import Link from "next/link";

import { api } from "~/trpc/react";

const CHECKLIST_STEPS = [
  {
    id: "start_season",
    title: "1. Start season",
    detail:
      "Inspect the buried NEPHRON vault, verify sensors are reporting, and clear winter debris from the inlet screen.",
  },
  {
    id: "cartridges_installed",
    title: "2. Cartridges installed",
    detail:
      "Confirm Carbon 1, Carbon 2, and Polish cartridges are properly seated in series inside the carbon box.",
  },
  {
    id: "green_board_treat",
    title: "3. Green season board set to Treat",
    detail:
      "Move the green season board in the inlet box from Bypass to Treat so drainage routes through woodchips and carbon.",
  },
  {
    id: "drain_boards_lowered",
    title: "4. Drain boards lowered",
    detail:
      "Lower inlet stop-log boards to normal spring drainage height (ready to raise on storm_hold alerts).",
  },
] as const;

export function StartupClient() {
  const utils = api.useUtils();
  const siteQuery = api.site.get.useQuery();

  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [sprayDate, setSprayDate] = useState("2025-05-10");
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const createSite = api.site.create.useMutation({
    onSuccess: async () => {
      await utils.site.get.invalidate();
    },
  });

  const completeStartup = api.site.completeStartup.useMutation({
    onSuccess: async () => {
      await utils.site.get.invalidate();
      await utils.twin.getSeries.invalidate();
      setStatusMsg(
        "Spring start-up complete! Season mode is now set to 'spray' and your spray date is saved.",
      );
    },
  });

  const runSeason = api.sim.runSeason.useMutation({
    onSuccess: async () => {
      await utils.twin.getSeries.invalidate();
      setStatusMsg("Season re-simulated with your new spray date!");
    },
  });

  const checkedCount =
    CHECKLIST_STEPS.filter((s) => checked[s.id]).length + (sprayDate ? 1 : 0);
  const allReady = checkedCount === 5;

  const handleComplete = async () => {
    setStatusMsg(null);
    let siteId = siteQuery.data?.id;
    if (!siteId) {
      const created = await createSite.mutateAsync({
        sprayDate: new Date(`${sprayDate}T00:00:00Z`),
      });
      siteId = created.id;
    }
    await completeStartup.mutateAsync({
      siteId,
      sprayDate: new Date(`${sprayDate}T00:00:00Z`),
    });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Spring Start-up Checklist
          </h1>
          <p className="text-sm text-slate-600">
            Complete all five field checks before herbicide application to move
            NEPHRON into active <strong>spray</strong> mode.
          </p>
        </div>
        {siteQuery.data && (
          <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-purple-900">
            Current mode: {siteQuery.data.seasonMode}
          </span>
        )}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {/* Progress bar */}
        <div className="mb-5">
          <div className="flex justify-between text-xs font-medium text-slate-600">
            <span>Checklist progress</span>
            <span>{checkedCount} / 5 complete</span>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full bg-purple-700 transition-all duration-200"
              style={{ width: `${(checkedCount / 5) * 100}%` }}
            />
          </div>
        </div>

        <div className="space-y-3">
          {CHECKLIST_STEPS.map((step) => (
            <label
              key={step.id}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${
                checked[step.id]
                  ? "border-purple-300 bg-purple-50/50"
                  : "border-slate-200 hover:bg-slate-50"
              }`}
            >
              <input
                type="checkbox"
                checked={Boolean(checked[step.id])}
                onChange={(e) =>
                  setChecked((prev) => ({
                    ...prev,
                    [step.id]: e.target.checked,
                  }))
                }
                className="mt-1 h-4 w-4 accent-purple-700"
              />
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  {step.title}
                </div>
                <p className="mt-0.5 text-xs text-slate-600">{step.detail}</p>
              </div>
            </label>
          ))}

          {/* Step 5: Log spray date */}
          <div
            className={`rounded-lg border p-4 ${
              sprayDate
                ? "border-purple-300 bg-purple-50/50"
                : "border-slate-200"
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">
                  5. Spray date logged
                </div>
                <p className="mt-0.5 text-xs text-slate-600">
                  Used by the twin to schedule storm-hold warnings (6–8 weeks
                  post-spray) and model first-flush atrazine decay.
                </p>
              </div>
              <input
                type="date"
                value={sprayDate}
                onChange={(e) => setSprayDate(e.target.value)}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 focus:border-purple-600 focus:outline-none"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            onClick={handleComplete}
            disabled={!allReady || completeStartup.isPending}
            className="rounded-lg bg-purple-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {completeStartup.isPending
              ? "Saving..."
              : "Complete Start-up (Set Mode = Spray)"}
          </button>

          {siteQuery.data && (
            <button
              onClick={() =>
                runSeason.mutate({ siteId: siteQuery.data!.id, seed: 42 })
              }
              disabled={runSeason.isPending}
              className="rounded-lg border border-purple-300 bg-white px-4 py-2.5 text-sm font-semibold text-purple-800 hover:bg-purple-50 disabled:opacity-50"
            >
              {runSeason.isPending
                ? "Re-simulating..."
                : "Re-run Season with Spray Date"}
            </button>
          )}
        </div>

        {statusMsg && (
          <div className="mt-4 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <span>{statusMsg}</span>
            <Link href="/" className="font-semibold underline">
              Back to Dashboard
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
