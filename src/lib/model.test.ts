import { describe, expect, it } from "vitest";

import { NEPHRON_CONFIG } from "./config";
import {
  computeInletAtrazine,
  createInitialPlantState,
  stepPlantHour,
  swapCartridges,
} from "./model";
import { compareWhatIfSeasons, simulateSeason } from "./simulator";
import { correctTwinFromGrabSample } from "./twin";

describe("NEPHRON physical model & simulator", () => {
  it("closes atrazine mass balance within 1% over a storm pulse and drain-down", () => {
    let state = createInitialPlantState();

    // 12 hours of heavy storm exceeding 3.5 L/s limit, followed by 72 hours of base flow.
    for (let h = 0; h < 84; h++) {
      const flowLps = h < 12 ? 5.5 : 0.2;
      const step = stepPlantHour(state, {
        flowLps,
        inletAtrazineUgl: h < 12 ? 12.0 : 0.5,
        uv254: 0.14,
        seasonMode: "spray",
        kDom: NEPHRON_CONFIG.nominalKDom,
      });
      state = step.state;
    }

    const accounted =
      state.removedMgCum +
      state.outflowMassMgCum +
      state.bypassMassMgCum +
      state.basinMassMg;
    const relErrorPct =
      (Math.abs(state.inflowMassMgCum - accounted) / state.inflowMassMgCum) * 100;

    expect(state.inflowMassMgCum).toBeGreaterThan(0);
    expect(relErrorPct).toBeLessThan(1.0);
  });

  it("closes mass balance within 1% across a full Apr-Oct season", () => {
    const result = simulateSeason({ seed: 42 });
    expect(result.readings.length).toBe(NEPHRON_CONFIG.seasonDays * 24);
    expect(result.summary.massBalanceErrorPct).toBeLessThan(1.0);
    expect(result.summary.totalRemovedMg).toBeGreaterThan(0);
  });

  it("bypasses treatment completely in off_season mode", () => {
    const start = createInitialPlantState();
    const out = stepPlantHour(start, {
      flowLps: 1.0,
      inletAtrazineUgl: 2.0,
      uv254: 0.1,
      seasonMode: "off_season",
      kDom: NEPHRON_CONFIG.nominalKDom,
    });

    expect(out.capturedMg).toBe(0);
    expect(out.state.bypassedM3).toBeCloseTo(3.6, 5);
    expect(out.state.fC1).toBe(0);
    expect(out.outletAtrazineUgl).toBeCloseTo(2.0, 5);
  });

  it("shifts cartridges correctly on lead-lag swap", () => {
    const before = {
      ...createInitialPlantState(),
      fC1: 0.92,
      fC2: 0.45,
      fPolish: 0.18,
    };
    const after = swapCartridges(before);
    expect(after.fC1).toBe(0.45);
    expect(after.fC2).toBe(0.18);
    expect(after.fPolish).toBe(0);
  });

  it("applies spray decay and 1.5x first flush multiplier", () => {
    const sprayDate = new Date("2025-05-10T00:00:00Z");
    const tenDaysLater = new Date("2025-05-20T00:00:00Z");

    const baseFlowC = computeInletAtrazine(tenDaysLater, sprayDate, 0.2);
    const stormFlowC = computeInletAtrazine(tenDaysLater, sprayDate, 2.5);

    expect(baseFlowC).toBeCloseTo(0.1 + 5.0, 3);
    expect(stormFlowC).toBeCloseTo(baseFlowC * 1.5, 3);
  });

  it("nudges twin capacity and k_dom upward when grab sample exceeds prediction", () => {
    const currentState = {
      ...createInitialPlantState(),
      fC1: 0.4,
      fC2: 0.2,
    };
    const res = correctTwinFromGrabSample({
      currentState,
      currentKDom: NEPHRON_CONFIG.nominalKDom,
      sampleFC1: 0.4,
      sampleFC2: 0.2,
      sampleEnteringC1Ugl: 5.0,
      measuredAfterC2Ugl: 1.5, // Higher breakthrough than predicted
    });

    expect(res.state.fC1).toBeGreaterThan(currentState.fC1);
    expect(res.state.fC2).toBeGreaterThan(currentState.fC2);
    expect(res.kDom).toBeGreaterThan(NEPHRON_CONFIG.nominalKDom);
  });

  it("compares twin-guided vs fixed-annual swaps side by side", () => {
    const comparison = compareWhatIfSeasons(42);
    expect(comparison.twinGuided.percentAtrazineRemoved).toBeGreaterThan(0);
    expect(comparison.fixedAnnual.cartridgesUsed).toBe(4); // 3 initial + 1 fixed swap
  });
});
