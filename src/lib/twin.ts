import { clamp, NEPHRON_CONFIG, type AlertType } from "./config";
import { cartridgeRemoval, type PlantState } from "./model";

export interface TwinCalibrationInput {
  currentState: PlantState;
  currentKDom: number;
  // Twin's state & entering concentration recorded when the grab sample was taken (2 days earlier)
  sampleFC1: number;
  sampleFC2: number;
  sampleEnteringC1Ugl: number;
  measuredAfterC2Ugl: number;
}

export interface TwinCalibrationResult {
  state: PlantState;
  kDom: number;
  deltaF: number;
}

/**
 * Simple Kalman-style proportional correction when a lab grab sample arrives (2 days late).
 * Finds the capacity shift (df) that explains the measured after_c2 concentration, then
 * nudges est_capacity_used_c1, est_capacity_used_c2, and k_dom halfway (gain = 0.5).
 */
export function correctTwinFromGrabSample(
  input: TwinCalibrationInput,
): TwinCalibrationResult {
  const { c1, c2 } = NEPHRON_CONFIG.cartridges;
  const gain = NEPHRON_CONFIG.twinCorrectionGain;
  const cEnter = Math.max(input.sampleEnteringC1Ugl, 1e-4);

  // Predict after_c2 for a candidate shift df applied to both sample-time capacities.
  const modelAfterC2 = (df: number) => {
    const r1 = cartridgeRemoval(clamp(input.sampleFC1 + df, 0, 1), c1.rMax);
    const r2 = cartridgeRemoval(clamp(input.sampleFC2 + df, 0, 1), c2.rMax);
    return cEnter * (1 - r1) * (1 - r2);
  };

  // Bisection finds the unique shift df in [-1, 1] matching the lab measurement.
  let lo = -1;
  let hi = 1;
  for (let i = 0; i < 14; i++) {
    const mid = 0.5 * (lo + hi);
    if (modelAfterC2(mid) < input.measuredAfterC2Ugl) lo = mid;
    else hi = mid;
  }
  const df = 0.5 * (lo + hi);

  const nextState: PlantState = {
    ...input.currentState,
    fC1: clamp(input.currentState.fC1 + gain * df, 0, 1),
    fC2: clamp(input.currentState.fC2 + gain * df, 0, 1),
  };

  // Nudge k_dom in the same direction so the twin learns faster/slower organic fouling.
  const nextKDom = clamp(
    input.currentKDom * (1 + gain * df),
    NEPHRON_CONFIG.nominalKDom * 0.25,
    NEPHRON_CONFIG.nominalKDom * 3.0,
  );

  return { state: nextState, kDom: nextKDom, deltaF: df };
}

export interface GeneratedAlert {
  ts: Date;
  type: AlertType;
  message: string;
}

export interface AlertCheckContext {
  ts: Date;
  sprayDate: Date;
  rainForecastMm24h: number;
  predictedMaxAfterC2In7d: number;
  nitrateExceedanceHours: number;
  inletLevelM: number;
  normalInletLevelM: number;
  tempC: number;
  lastAlertHourByType: Partial<Record<AlertType, number>>;
  hourIndex: number;
}

/** Evaluate all 5 NEPHRON alert rules for the current hour (with cooldown debouncing). */
export function evaluateHourlyAlerts(ctx: AlertCheckContext): GeneratedAlert[] {
  const alerts: GeneratedAlert[] = [];
  const cooldown = NEPHRON_CONFIG.alertCooldownHours;

  const canEmit = (type: AlertType) => {
    const prev = ctx.lastAlertHourByType[type];
    return prev === undefined || ctx.hourIndex - prev >= cooldown;
  };

  const emit = (type: AlertType, message: string) => {
    ctx.lastAlertHourByType[type] = ctx.hourIndex;
    alerts.push({ ts: ctx.ts, type, message });
  };

  // 1. Storm hold: within 8 weeks after spray_date and 24h rain forecast > 15 mm
  const daysSinceSpray =
    (ctx.ts.getTime() - ctx.sprayDate.getTime()) / (1000 * 3600 * 24);
  if (
    daysSinceSpray >= 0 &&
    daysSinceSpray <= NEPHRON_CONFIG.stormHoldWeeksMax * 7 &&
    ctx.rainForecastMm24h > NEPHRON_CONFIG.stormHoldRainMm &&
    canEmit("storm_hold")
  ) {
    emit(
      "storm_hold",
      `Raise inlet stop logs to hold water in the field (${ctx.rainForecastMm24h.toFixed(0)} mm rain forecast within 24 h).`,
    );
  }

  // 2. Swap soon: twin predicts after_c2 > 0.1 ug/L within 7 days
  if (
    ctx.predictedMaxAfterC2In7d > NEPHRON_CONFIG.swapSoonThresholdUgl &&
    canEmit("swap_soon")
  ) {
    emit(
      "swap_soon",
      "Swap lead cartridge: remove carbon 1, shift carbon 2 -> 1, polish -> 2, add fresh polish.",
    );
  }

  // 3. Nitrate breakthrough: nitrate_after_chips > 5 mg/L for 24 consecutive hours
  if (
    ctx.nitrateExceedanceHours >= NEPHRON_CONFIG.nitrateAlertDurationHours &&
    canEmit("nitrate_breakthrough")
  ) {
    emit(
      "nitrate_breakthrough",
      "Nitrate after woodchips exceeded 5 mg/L for 24 h — inspect woodchip trench media.",
    );
  }

  // 4. Clogging: inlet level >20% above 7-day normal at the same flow
  if (
    ctx.normalInletLevelM > 0 &&
    ctx.inletLevelM > ctx.normalInletLevelM * (1 + NEPHRON_CONFIG.cloggingRiseFraction) &&
    canEmit("clogging")
  ) {
    emit(
      "clogging",
      "Inlet water level rose >20% above its 7-day normal at this flow — check inlet screen for clogging.",
    );
  }

  // 5. Ice risk: water temperature < 0.5 C
  if (ctx.tempC < NEPHRON_CONFIG.iceTempC && canEmit("ice")) {
    emit(
      "ice",
      `Water temperature dropped to ${ctx.tempC.toFixed(1)} °C (< 0.5 °C) — ice risk in inlet/outlet boxes.`,
    );
  }

  return alerts;
}
