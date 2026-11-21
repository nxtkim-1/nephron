import {
  clamp,
  createRng,
  isTreatingMode,
  NEPHRON_CONFIG,
  seasonModeForDate,
  type EventType,
  type GrabLocation,
  type SeasonMode,
} from "./config";
import {
  computeInletAtrazine,
  createInitialPlantState,
  predictMaxAfterC2In7Days,
  stepPlantHour,
  swapCartridges,
  type PlantState,
} from "./model";
import {
  correctTwinFromGrabSample,
  evaluateHourlyAlerts,
  type GeneratedAlert,
} from "./twin";

export interface SimulatedReading {
  ts: Date;
  flowLps: number;
  tempC: number;
  turbidityNtu: number;
  uv254: number;
  nitrateAfterChipsMgl: number;
  inletLevelM: number;
  rainForecastMm24h: number;
}

export interface SimulatedGrabSample {
  ts: Date;
  location: GrabLocation;
  atrazineUgl: number;
}

export interface SimulatedStateRow {
  ts: Date;
  estCapacityUsedC1: number;
  estCapacityUsedC2: number;
  estCapacityUsedPolish: number;
  estOutletAtrazineUgl: number;
  estAfterC2Ugl: number;
  bypassedM3: number;
  removedMgCum: number;
}

export interface SimulatedEvent {
  ts: Date;
  type: EventType;
  note: string;
}

export interface SeasonSummary {
  totalInflowM3: number;
  totalInflowMassMg: number;
  totalRemovedMg: number;
  totalOutflowMassMg: number;
  totalBypassMassMg: number;
  endingBasinMassMg: number;
  massBalanceErrorPct: number;
  percentAtrazineRemoved: number;
  bypassedM3: number;
  cartridgesUsed: number; // Initial 3 + 1 fresh polish per swap
  swapsCount: number;
  meanOutletAtrazineUgl: number;
  peakOutletAtrazineUgl: number;
  finalTwinKDom: number;
  trueKDom: number;
}

export interface SeasonSimulationResult {
  seed: number;
  sprayDate: Date;
  readings: SimulatedReading[];
  grabSamples: SimulatedGrabSample[];
  twinStates: SimulatedStateRow[];
  truthStates: SimulatedStateRow[];
  alerts: GeneratedAlert[];
  events: SimulatedEvent[];
  summary: SeasonSummary;
}

export type SwapStrategy = "twin_guided" | "fixed_annual" | "none";

interface StormEvent {
  startHour: number;
  peakLps: number;
  rainMm: number;
}

/** Generate Poisson storm events across the April-October season. */
function generateStorms(totalHours: number, startDate: Date, rng: ReturnType<typeof createRng>): StormEvent[] {
  const storms: StormEvent[] = [];
  for (let h = 0; h < totalHours; h++) {
    const ts = new Date(startDate.getTime() + h * 3600 * 1000);
    const month = ts.getUTCMonth() + 1;
    const ratePerDay =
      month >= 4 && month <= 7
        ? NEPHRON_CONFIG.stormRateAprJulPerDay
        : NEPHRON_CONFIG.stormRateOtherPerDay;
    const pPerHour = ratePerDay / 24;
    if (rng.next() < pPerHour) {
      const peakLps =
        NEPHRON_CONFIG.stormPeakMinLps +
        rng.next() * (NEPHRON_CONFIG.stormPeakMaxLps - NEPHRON_CONFIG.stormPeakMinLps);
      storms.push({
        startHour: h,
        peakLps,
        rainMm: peakLps * NEPHRON_CONFIG.rainMmPerPeakLps,
      });
    }
  }
  return storms;
}

/** Nominal hydraulic rating curve: expected inlet water level (m) for a given flow. */
function normalInletLevelForFlow(flowLps: number): number {
  return 0.15 + 0.12 * Math.sqrt(Math.max(0, flowLps));
}

/**
 * Run a full-season (Apr 1 - Oct 31, hourly) simulation of NEPHRON.
 * Hidden truth uses true k_dom (+30%) and exact flows; twin only sees noisy sensors
 * and delayed weekly lab grab samples.
 */
export function simulateSeason(options: {
  seed: number;
  sprayDate?: Date;
  swapStrategy?: SwapStrategy;
}): SeasonSimulationResult {
  const rng = createRng(options.seed);
  const startDate = new Date(NEPHRON_CONFIG.seasonStartIso);
  const sprayDate = options.sprayDate ?? new Date(NEPHRON_CONFIG.defaultSprayDateIso);
  const swapStrategy: SwapStrategy = options.swapStrategy ?? "twin_guided";
  const totalHours = NEPHRON_CONFIG.seasonDays * 24;

  const storms = generateStorms(totalHours, startDate, rng);

  // Random 1-week hidden woodchip failure window (between day 35 and day 140).
  const failureStartHour = Math.floor((35 + rng.next() * 105) * 24);
  const failureEndHour = failureStartHour + NEPHRON_CONFIG.woodchipFailureHours;

  // Random 5-day gradual inlet clogging episode (between day 50 and day 150).
  const clogStartHour = Math.floor((50 + rng.next() * 100) * 24);
  const clogEndHour = clogStartHour + 24 * 5;

  // Fixed annual swap day for what-if baseline (July 15 = day 105).
  const fixedSwapHour = 105 * 24;

  const trueKDom = NEPHRON_CONFIG.nominalKDom * NEPHRON_CONFIG.trueKDomMultiplier;
  let twinKDom: number = NEPHRON_CONFIG.nominalKDom;

  let truthState: PlantState = createInitialPlantState();
  let twinState: PlantState = createInitialPlantState();

  const readings: SimulatedReading[] = [];
  const grabSamples: SimulatedGrabSample[] = [];
  const twinStates: SimulatedStateRow[] = [];
  const truthStates: SimulatedStateRow[] = [];
  const alerts: GeneratedAlert[] = [];
  const events: SimulatedEvent[] = [];

  // Pending lab grab samples waiting 48 hours for lab turnaround.
  const pendingLabResults: {
    arriveHour: number;
    measuredAfterC2Ugl: number;
    sampleFC1: number;
    sampleFC2: number;
    sampleEnteringC1Ugl: number;
  }[] = [];

  // Rolling history for clogging baseline and 7-day swap forecast.
  const recentLevelsNormalized: number[] = [];
  const recentFlows: number[] = [];
  const recentUv254: number[] = [];
  let nitrateExceedanceHours = 0;
  let lastSwapHour = -9999;
  let swapsCount = 0;
  let totalInflowM3 = 0;
  let outletSumUgl = 0;
  let peakOutletUgl = 0;
  let prevSeasonMode: SeasonMode | null = null;
  const lastAlertHourByType: Partial<Record<GeneratedAlert["type"], number>> = {};

  const addNoise = (val: number, relStd: number, minVal = 0) =>
    Math.max(minVal, val * (1 + rng.normal() * relStd));

  for (let h = 0; h < totalHours; h++) {
    const ts = new Date(startDate.getTime() + h * 3600 * 1000);
    const seasonMode = seasonModeForDate(ts);

    if (prevSeasonMode !== null && prevSeasonMode !== seasonMode) {
      events.push({
        ts,
        type: "season_change",
        note: `Season mode changed from ${prevSeasonMode} to ${seasonMode}.`,
      });
    }
    prevSeasonMode = seasonMode;

    // 1. Apply any lab grab samples arriving this hour (taken 48 h ago).
    while (pendingLabResults.length > 0 && pendingLabResults[0]!.arriveHour <= h) {
      const sample = pendingLabResults.shift()!;
      const corrected = correctTwinFromGrabSample({
        currentState: twinState,
        currentKDom: twinKDom,
        sampleFC1: sample.sampleFC1,
        sampleFC2: sample.sampleFC2,
        sampleEnteringC1Ugl: sample.sampleEnteringC1Ugl,
        measuredAfterC2Ugl: sample.measuredAfterC2Ugl,
      });
      twinState = corrected.state;
      twinKDom = corrected.kDom;
    }

    // 2. True hydrology: base flow + decaying storm pulses.
    let stormFlowLps = 0;
    let nextStormRainMm = 0;
    for (const s of storms) {
      const dt = h - s.startHour;
      if (dt >= 0 && dt < 120) {
        stormFlowLps += s.peakLps * Math.exp(-dt / NEPHRON_CONFIG.stormDecayTauHours);
      } else if (dt < 0 && dt >= -24) {
        nextStormRainMm = Math.max(nextStormRainMm, s.rainMm);
      }
    }
    const trueFlowLps = NEPHRON_CONFIG.baseFlowLps + stormFlowLps;
    totalInflowM3 += trueFlowLps * 3.6;

    // 3. True water quality & temperature.
    const dayOfSeason = h / 24;
    // Cool early April with brief cold snap (< 0.5 C) around day 3, peaking ~21 C in July.
    const coldSnap = dayOfSeason >= 2.5 && dayOfSeason <= 3.5 ? -3.5 : 0;
    const trueTempC =
      3.5 +
      17.5 * Math.sin((Math.PI * dayOfSeason) / NEPHRON_CONFIG.seasonDays) +
      1.2 * Math.sin((2 * Math.PI * h) / 24) +
      coldSnap;

    const trueUv254 =
      NEPHRON_CONFIG.uv254Base + NEPHRON_CONFIG.uv254StormSlope * stormFlowLps;
    const trueTurbidityNtu =
      NEPHRON_CONFIG.turbidityBaseNtu +
      NEPHRON_CONFIG.turbidityStormSlope * stormFlowLps;

    const trueNitrateIn =
      NEPHRON_CONFIG.nitrateInMinMgl +
      0.5 *
        (NEPHRON_CONFIG.nitrateInMaxMgl - NEPHRON_CONFIG.nitrateInMinMgl) *
        (1 + Math.sin(dayOfSeason / 11));
    const inWoodchipFailure = h >= failureStartHour && h < failureEndHour;
    const nitrateRemoval = inWoodchipFailure
      ? NEPHRON_CONFIG.woodchipNitrateRemovalFailure
      : NEPHRON_CONFIG.woodchipNitrateRemovalNormal;
    const trueNitrateAfterChips = trueNitrateIn * (1 - nitrateRemoval);

    const baseLevel = normalInletLevelForFlow(trueFlowLps);
    const clogFactor =
      h >= clogStartHour && h < clogEndHour
        ? 1 + 0.32 * ((h - clogStartHour) / (clogEndHour - clogStartHour))
        : 1;
    const trueInletLevelM = baseLevel * clogFactor;

    const trueInletAtrazine = computeInletAtrazine(ts, sprayDate, trueFlowLps);

    // 4. Step the HIDDEN TRUTH plant.
    const truthStep = stepPlantHour(truthState, {
      flowLps: trueFlowLps,
      inletAtrazineUgl: trueInletAtrazine,
      uv254: trueUv254,
      seasonMode,
      kDom: trueKDom,
    });
    truthState = truthStep.state;
    outletSumUgl += truthStep.outletAtrazineUgl;
    if (truthStep.outletAtrazineUgl > peakOutletUgl) {
      peakOutletUgl = truthStep.outletAtrazineUgl;
    }

    // 5. Generate noisy sensor readings (5% Gaussian noise) — this is all the twin sees!
    const sensorFlowLps = addNoise(trueFlowLps, NEPHRON_CONFIG.sensorNoiseRel, 0.01);
    const sensorTempC =
      trueTempC + rng.normal() * Math.max(0.2, Math.abs(trueTempC) * NEPHRON_CONFIG.sensorNoiseRel);
    const sensorTurbidity = addNoise(trueTurbidityNtu, NEPHRON_CONFIG.sensorNoiseRel, 0.1);
    const sensorUv254 = addNoise(trueUv254, NEPHRON_CONFIG.sensorNoiseRel, 0.01);
    const sensorNitrate = addNoise(trueNitrateAfterChips, NEPHRON_CONFIG.sensorNoiseRel, 0.1);
    const sensorInletLevel = addNoise(trueInletLevelM, NEPHRON_CONFIG.sensorNoiseRel, 0.05);
    const rainForecastMm =
      nextStormRainMm > 0
        ? addNoise(nextStormRainMm, NEPHRON_CONFIG.rainForecastNoiseRel, 0)
        : 0;

    readings.push({
      ts,
      flowLps: sensorFlowLps,
      tempC: sensorTempC,
      turbidityNtu: sensorTurbidity,
      uv254: sensorUv254,
      nitrateAfterChipsMgl: sensorNitrate,
      inletLevelM: sensorInletLevel,
      rainForecastMm24h: rainForecastMm,
    });

    // 6. Step the DIGITAL TWIN using ONLY noisy sensors & its learned k_dom.
    const twinInletAtrazine = computeInletAtrazine(ts, sprayDate, sensorFlowLps);
    const twinStep = stepPlantHour(twinState, {
      flowLps: sensorFlowLps,
      inletAtrazineUgl: twinInletAtrazine,
      uv254: sensorUv254,
      seasonMode,
      kDom: twinKDom,
    });
    twinState = twinStep.state;

    // 7. Weekly lab grab samples (10% noise, delivered 48 hours late).
    if (
      h > 0 &&
      h % NEPHRON_CONFIG.grabSampleIntervalHours === 0 &&
      isTreatingMode(seasonMode)
    ) {
      const measuredAfterC2 = addNoise(
        truthStep.afterC2Ugl,
        NEPHRON_CONFIG.grabSampleNoiseRel,
        0.001,
      );
      const measuredOutlet = addNoise(
        truthStep.outletAtrazineUgl,
        NEPHRON_CONFIG.grabSampleNoiseRel,
        0.001,
      );
      grabSamples.push(
        { ts, location: "after_c2", atrazineUgl: measuredAfterC2 },
        { ts, location: "outlet", atrazineUgl: measuredOutlet },
      );
      pendingLabResults.push({
        arriveHour: h + NEPHRON_CONFIG.grabSampleDelayHours,
        measuredAfterC2Ugl: measuredAfterC2,
        sampleFC1: twinState.fC1,
        sampleFC2: twinState.fC2,
        sampleEnteringC1Ugl: twinStep.afterWoodchipsUgl,
      });
    }

    // 8. Update rolling stats & evaluate alerts / swap triggers.
    recentFlows.push(sensorFlowLps);
    recentUv254.push(sensorUv254);
    if (recentFlows.length > 168) recentFlows.shift();
    if (recentUv254.length > 168) recentUv254.shift();

    const expectedLevel = normalInletLevelForFlow(sensorFlowLps);
    const levelRatio = sensorInletLevel / expectedLevel;
    const normalRatio =
      recentLevelsNormalized.length >= 24
        ? recentLevelsNormalized.reduce((a, b) => a + b, 0) /
          recentLevelsNormalized.length
        : 1.0;
    recentLevelsNormalized.push(levelRatio);
    if (recentLevelsNormalized.length > 168) recentLevelsNormalized.shift();

    if (sensorNitrate > NEPHRON_CONFIG.nitrateAlertThresholdMgl) {
      nitrateExceedanceHours++;
    } else {
      nitrateExceedanceHours = 0;
    }

    // Only run the 7-day forecast every 12 hours to keep the simulation snappy.
    let predictedMaxAfterC2In7d = twinStep.afterC2Ugl;
    if (h % 12 === 0 && isTreatingMode(seasonMode)) {
      const avgFlow =
        recentFlows.reduce((a, b) => a + b, 0) / Math.max(1, recentFlows.length);
      const avgUv =
        recentUv254.reduce((a, b) => a + b, 0) / Math.max(1, recentUv254.length);
      predictedMaxAfterC2In7d = predictMaxAfterC2In7Days({
        state: twinState,
        startTs: ts,
        sprayDate,
        seasonMode,
        avgFlowLps: avgFlow,
        avgUv254: avgUv,
        kDom: twinKDom,
      });
    }

    const hourlyAlerts = evaluateHourlyAlerts({
      ts,
      sprayDate,
      rainForecastMm24h: rainForecastMm,
      predictedMaxAfterC2In7d,
      nitrateExceedanceHours,
      inletLevelM: sensorInletLevel,
      normalInletLevelM: expectedLevel * normalRatio,
      tempC: sensorTempC,
      lastAlertHourByType,
      hourIndex: h,
    });
    alerts.push(...hourlyAlerts);

    // 9. Execute cartridge swap according to strategy.
    const twinRequestsSwap =
      swapStrategy === "twin_guided" &&
      isTreatingMode(seasonMode) &&
      predictedMaxAfterC2In7d > NEPHRON_CONFIG.swapSoonThresholdUgl &&
      h - lastSwapHour >= NEPHRON_CONFIG.swapCooldownHours;

    const fixedRequestsSwap = swapStrategy === "fixed_annual" && h === fixedSwapHour;

    if (twinRequestsSwap || fixedRequestsSwap) {
      truthState = swapCartridges(truthState);
      twinState = swapCartridges(twinState);
      lastSwapHour = h;
      swapsCount++;
      events.push({
        ts,
        type: "cartridge_swap",
        note: twinRequestsSwap
          ? `Twin-guided swap #${swapsCount}: C2 -> C1, Polish -> C2, fresh Polish installed (predicted 7d after_c2 = ${predictedMaxAfterC2In7d.toFixed(2)} ug/L).`
          : "Scheduled annual cartridge swap (July 15).",
      });
    }

    // 10. Record hourly twin and truth snapshots.
    twinStates.push({
      ts,
      estCapacityUsedC1: clamp(twinState.fC1, 0, 1),
      estCapacityUsedC2: clamp(twinState.fC2, 0, 1),
      estCapacityUsedPolish: clamp(twinState.fPolish, 0, 1),
      estOutletAtrazineUgl: twinStep.outletAtrazineUgl,
      estAfterC2Ugl: twinStep.afterC2Ugl,
      bypassedM3: twinState.bypassedM3,
      removedMgCum: twinState.removedMgCum,
    });

    truthStates.push({
      ts,
      estCapacityUsedC1: clamp(truthState.fC1, 0, 1),
      estCapacityUsedC2: clamp(truthState.fC2, 0, 1),
      estCapacityUsedPolish: clamp(truthState.fPolish, 0, 1),
      estOutletAtrazineUgl: truthStep.outletAtrazineUgl,
      estAfterC2Ugl: truthStep.afterC2Ugl,
      bypassedM3: truthState.bypassedM3,
      removedMgCum: truthState.removedMgCum,
    });
  }

  // Mass balance check on the true plant: inflow = removed + outflow + bypass + basin stored.
  const accountedMassMg =
    truthState.removedMgCum +
    truthState.outflowMassMgCum +
    truthState.bypassMassMgCum +
    truthState.basinMassMg;
  const massBalanceErrorPct =
    truthState.inflowMassMgCum > 0
      ? (Math.abs(truthState.inflowMassMgCum - accountedMassMg) /
          truthState.inflowMassMgCum) *
        100
      : 0;

  const percentAtrazineRemoved =
    truthState.inflowMassMgCum > 0
      ? (truthState.removedMgCum / truthState.inflowMassMgCum) * 100
      : 0;

  return {
    seed: options.seed,
    sprayDate,
    readings,
    grabSamples,
    twinStates,
    truthStates,
    alerts,
    events,
    summary: {
      totalInflowM3,
      totalInflowMassMg: truthState.inflowMassMgCum,
      totalRemovedMg: truthState.removedMgCum,
      totalOutflowMassMg: truthState.outflowMassMgCum,
      totalBypassMassMg: truthState.bypassMassMgCum,
      endingBasinMassMg: truthState.basinMassMg,
      massBalanceErrorPct,
      percentAtrazineRemoved,
      bypassedM3: truthState.bypassedM3,
      cartridgesUsed: 3 + swapsCount,
      swapsCount,
      meanOutletAtrazineUgl: outletSumUgl / totalHours,
      peakOutletAtrazineUgl: peakOutletUgl,
      finalTwinKDom: twinKDom,
      trueKDom,
    },
  };
}

/**
 * Run two full seasons side-by-side with identical weather/seed:
 * (a) Twin-guided swaps vs (b) Fixed one swap per year (July 15).
 */
export function compareWhatIfSeasons(seed: number) {
  const twinGuided = simulateSeason({ seed, swapStrategy: "twin_guided" });
  const fixedAnnual = simulateSeason({ seed, swapStrategy: "fixed_annual" });

  return {
    seed,
    twinGuided: twinGuided.summary,
    fixedAnnual: fixedAnnual.summary,
  };
}
