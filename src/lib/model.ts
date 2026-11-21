import { clamp, isTreatingMode, NEPHRON_CONFIG, type SeasonMode } from "./config";

export interface PlantState {
  fC1: number; // Used capacity fraction 0..1
  fC2: number;
  fPolish: number;
  basinVolumeM3: number;
  basinMassMg: number;
  bypassedM3: number;
  removedMgCum: number;
  inflowMassMgCum: number;
  outflowMassMgCum: number;
  bypassMassMgCum: number;
}

export interface StepInput {
  flowLps: number;
  inletAtrazineUgl: number;
  uv254: number;
  seasonMode: SeasonMode;
  kDom: number;
}

export interface StepOutput {
  state: PlantState;
  afterWoodchipsUgl: number;
  afterC2Ugl: number;
  outletAtrazineUgl: number;
  treatedFlowLps: number;
  bypassFlowLps: number;
  capturedMg: number;
}

/** Create a fresh plant state with new cartridges and an empty basin. */
export function createInitialPlantState(): PlantState {
  return {
    fC1: 0,
    fC2: 0,
    fPolish: 0,
    basinVolumeM3: 0,
    basinMassMg: 0,
    bypassedM3: 0,
    removedMgCum: 0,
    inflowMassMgCum: 0,
    outflowMassMgCum: 0,
    bypassMassMgCum: 0,
  };
}

/**
 * Compute inlet atrazine concentration (ug/L) from spray date and storm flow.
 * Baseline 0.1 ug/L; after spray_date adds 10 ug/L decaying with 10-day half-life;
 * multiplied by 1.5 during storm flow (first flush).
 */
export function computeInletAtrazine(
  ts: Date,
  sprayDate: Date,
  flowLps: number,
): number {
  const daysSinceSpray = (ts.getTime() - sprayDate.getTime()) / (1000 * 3600 * 24);
  let cIn = NEPHRON_CONFIG.atrazineBaselineUgl;
  if (daysSinceSpray >= 0) {
    const decay = Math.pow(0.5, daysSinceSpray / NEPHRON_CONFIG.atrazineHalfLifeDays);
    cIn += NEPHRON_CONFIG.atrazineSprayPeakUgl * decay;
  }
  if (flowLps >= NEPHRON_CONFIG.stormFlowThresholdLps) {
    cIn *= NEPHRON_CONFIG.firstFlushMultiplier;
  }
  return cIn;
}

/** Removal efficiency for one cartridge given its used fraction f in [0, 1]. */
export function cartridgeRemoval(f: number, rMax: number): number {
  const clamped = clamp(f, 0, 1);
  return rMax * (1 - clamped * clamped);
}

/**
 * Advance the NEPHRON treatment unit by 1 hour.
 * Unit identity: 1 L/s for 1 h = 3.6 m3 = 3,600 L; 1 ug/L * 1 m3 = 1 mg.
 */
export function stepPlantHour(prev: PlantState, input: StepInput): StepOutput {
  const flowLps = Math.max(0, input.flowLps);
  const cIn = Math.max(0, input.inletAtrazineUgl);
  const inflowVolM3 = flowLps * 3.6;
  const inflowMassMg = inflowVolM3 * cIn; // Exact: flowLps * 3600 * cIn / 1000

  // Off-season: season board routes water straight to bypass, skipping treatment.
  if (!isTreatingMode(input.seasonMode)) {
    const nextState: PlantState = {
      ...prev,
      bypassedM3: prev.bypassedM3 + inflowVolM3,
      inflowMassMgCum: prev.inflowMassMgCum + inflowMassMg,
      bypassMassMgCum: prev.bypassMassMgCum + inflowMassMg,
    };
    return {
      state: nextState,
      afterWoodchipsUgl: cIn,
      afterC2Ugl: cIn,
      outletAtrazineUgl: cIn,
      treatedFlowLps: 0,
      bypassFlowLps: flowLps,
      capturedMg: 0,
    };
  }

  // Treat mode: apply 3.5 L/s hydraulic limit + 300 m3 detention basin.
  const maxTreatVolM3 = NEPHRON_CONFIG.hydraulicLimitLps * 3.6;
  let basinVol = prev.basinVolumeM3;
  let basinMass = prev.basinMassMg;
  let treatedVolM3 = 0;
  let treatedMassInMg = 0;
  let bypassVolM3 = 0;
  let bypassMassMg = 0;

  if (inflowVolM3 > maxTreatVolM3) {
    // Direct inflow fills treatment capacity; excess goes to basin, then bypass.
    treatedVolM3 = maxTreatVolM3;
    treatedMassInMg = treatedVolM3 * cIn;
    const excessVolM3 = inflowVolM3 - maxTreatVolM3;
    const freeBasinM3 = Math.max(0, NEPHRON_CONFIG.basinCapacityM3 - basinVol);
    const storedVolM3 = Math.min(excessVolM3, freeBasinM3);
    basinVol += storedVolM3;
    basinMass += storedVolM3 * cIn;
    bypassVolM3 = excessVolM3 - storedVolM3;
    bypassMassMg = bypassVolM3 * cIn;
  } else {
    // All inflow is treated, plus drain stored basin water up to hydraulic limit.
    treatedVolM3 = inflowVolM3;
    treatedMassInMg = inflowMassMg;
    const spareVolM3 = maxTreatVolM3 - inflowVolM3;
    if (basinVol > 0 && spareVolM3 > 0) {
      const drainedVolM3 = Math.min(basinVol, spareVolM3);
      const cBasin = basinMass / basinVol;
      treatedVolM3 += drainedVolM3;
      treatedMassInMg += drainedVolM3 * cBasin;
      basinVol -= drainedVolM3;
      basinMass = Math.max(0, basinMass - drainedVolM3 * cBasin);
    }
  }

  const treatedFlowLps = treatedVolM3 / 3.6;
  const cEnteringChips = treatedVolM3 > 0 ? treatedMassInMg / treatedVolM3 : cIn;

  // Stage 2: Woodchip trench removes 25% of atrazine.
  const woodchipRemovedMg =
    treatedMassInMg * NEPHRON_CONFIG.woodchipAtrazineRemoval;
  const cAfterChips =
    cEnteringChips * (1 - NEPHRON_CONFIG.woodchipAtrazineRemoval);

  // Stage 3: Carbon cartridges in series (C1 -> C2 -> Polish).
  const { c1, c2, polish } = NEPHRON_CONFIG.cartridges;
  const domIncrement =
    (input.kDom * Math.max(0, input.uv254) * treatedFlowLps * 3600) / 1e6;

  const r1 = cartridgeRemoval(prev.fC1, c1.rMax);
  const cap1Mg = (treatedFlowLps * 3600 * cAfterChips * r1) / 1000;
  const cAfterC1 = cAfterChips * (1 - r1);
  const nextFC1 = clamp(prev.fC1 + cap1Mg / c1.capacityMg + domIncrement, 0, 1);

  const r2 = cartridgeRemoval(prev.fC2, c2.rMax);
  const cap2Mg = (treatedFlowLps * 3600 * cAfterC1 * r2) / 1000;
  const cAfterC2 = cAfterC1 * (1 - r2);
  const nextFC2 = clamp(prev.fC2 + cap2Mg / c2.capacityMg + domIncrement, 0, 1);

  const rP = cartridgeRemoval(prev.fPolish, polish.rMax);
  const capPMg = (treatedFlowLps * 3600 * cAfterC2 * rP) / 1000;
  const cAfterPolish = cAfterC2 * (1 - rP);
  const nextFPolish = clamp(
    prev.fPolish + capPMg / polish.capacityMg + domIncrement,
    0,
    1,
  );

  const capturedMg = woodchipRemovedMg + cap1Mg + cap2Mg + capPMg;
  const outflowMassMg = treatedVolM3 * cAfterPolish;

  const nextState: PlantState = {
    fC1: nextFC1,
    fC2: nextFC2,
    fPolish: nextFPolish,
    basinVolumeM3: basinVol,
    basinMassMg: basinMass,
    bypassedM3: prev.bypassedM3 + bypassVolM3,
    removedMgCum: prev.removedMgCum + capturedMg,
    inflowMassMgCum: prev.inflowMassMgCum + inflowMassMg,
    outflowMassMgCum: prev.outflowMassMgCum + outflowMassMg,
    bypassMassMgCum: prev.bypassMassMgCum + bypassMassMg,
  };

  return {
    state: nextState,
    afterWoodchipsUgl: cAfterChips,
    afterC2Ugl: cAfterC2,
    outletAtrazineUgl: cAfterPolish,
    treatedFlowLps,
    bypassFlowLps: bypassVolM3 / 3.6,
    capturedMg,
  };
}

/**
 * Lead-lag cartridge swap: remove C1, shift C2 -> C1, shift Polish -> C2, install fresh Polish.
 */
export function swapCartridges(state: PlantState): PlantState {
  return {
    ...state,
    fC1: state.fC2,
    fC2: state.fPolish,
    fPolish: 0,
  };
}

/**
 * Project the twin forward 7 days using recent average flow/uv254 to check if
 * after_c2 atrazine is predicted to exceed 0.1 ug/L within 7 days.
 */
export function predictMaxAfterC2In7Days(params: {
  state: PlantState;
  startTs: Date;
  sprayDate: Date;
  seasonMode: SeasonMode;
  avgFlowLps: number;
  avgUv254: number;
  kDom: number;
}): number {
  if (!isTreatingMode(params.seasonMode)) return 0;

  let simState = { ...params.state };
  let maxAfterC2 = 0;

  for (let h = 1; h <= NEPHRON_CONFIG.swapSoonHorizonHours; h++) {
    const ts = new Date(params.startTs.getTime() + h * 3600 * 1000);
    const cIn = computeInletAtrazine(ts, params.sprayDate, params.avgFlowLps);
    const out = stepPlantHour(simState, {
      flowLps: params.avgFlowLps,
      inletAtrazineUgl: cIn,
      uv254: params.avgUv254,
      seasonMode: params.seasonMode,
      kDom: params.kDom,
    });
    simState = out.state;
    if (out.afterC2Ugl > maxAfterC2) {
      maxAfterC2 = out.afterC2Ugl;
    }
  }

  return maxAfterC2;
}
