// All physical, seasonal, sensor, and twin parameters for NEPHRON in one place.

export type SeasonMode = "startup" | "spray" | "late_summer" | "off_season";
export type GrabLocation = "inlet" | "after_c2" | "outlet";
export type AlertType =
  | "storm_hold"
  | "swap_soon"
  | "nitrate_breakthrough"
  | "clogging"
  | "ice";
export type EventType = "season_change" | "cartridge_swap" | "reseed";

export const NEPHRON_CONFIG = {
  // Season window: April 1 through October 31 (214 days = 5,136 hourly steps).
  seasonYear: 2025,
  seasonStartIso: "2025-04-01T00:00:00.000Z",
  seasonDays: 214,
  defaultSprayDateIso: "2025-05-10T00:00:00.000Z",
  defaultAreaHa: 20,

  // Inflow hydrology
  baseFlowLps: 0.2,
  stormRateAprJulPerDay: 1 / 6, // Poisson mean: 1 storm per 6 days (Apr-Jul)
  stormRateOtherPerDay: 1 / 10, // Poisson mean: 1 storm per 10 days (Aug-Oct)
  stormPeakMinLps: 2.0,
  stormPeakMaxLps: 6.0,
  stormDecayTauHours: 24,
  rainMmPerPeakLps: 6.0, // Maps 2-6 L/s storm peak to ~12-36 mm rainfall
  rainForecastNoiseRel: 0.15,

  // Inlet water quality
  atrazineBaselineUgl: 0.1,
  atrazineSprayPeakUgl: 10.0,
  atrazineHalfLifeDays: 10.0,
  firstFlushMultiplier: 1.5, // Applied during storm flow
  stormFlowThresholdLps: 0.8,

  // Nitrate & woodchip trench
  nitrateInMinMgl: 8.0,
  nitrateInMaxMgl: 15.0,
  woodchipNitrateRemovalNormal: 0.7,
  woodchipNitrateRemovalFailure: 0.2, // Hidden 1-week woodchip failure
  woodchipFailureHours: 24 * 7,
  woodchipAtrazineRemoval: 0.25,

  // Hydraulics & retention basin
  hydraulicLimitLps: 3.5,
  basinCapacityM3: 300,

  // Carbon box cartridges (in series: C1 -> C2 -> Polish)
  cartridges: {
    c1: { capacityMg: 600, rMax: 0.8 },
    c2: { capacityMg: 600, rMax: 0.8 },
    polish: { capacityMg: 300, rMax: 0.5 },
  },

  // Organic matter (DOM) fouling: df = kDom * uv254 * flow_lps * 3600 / 1e6
  // True plant fouls 30% faster than the twin's initial nominal assumption.
  nominalKDom: 0.45,
  trueKDomMultiplier: 1.3,

  // Water quality background signals
  uv254Base: 0.08,
  uv254StormSlope: 0.03,
  turbidityBaseNtu: 3.0,
  turbidityStormSlope: 12.0,

  // Sensor & lab grab sample noise
  sensorNoiseRel: 0.05, // 5% Gaussian noise on continuous sensors
  grabSampleIntervalHours: 24 * 7, // Every 7 days
  grabSampleDelayHours: 48, // 2-day lab turnaround
  grabSampleNoiseRel: 0.1, // 10% Gaussian noise on lab samples

  // Twin Kalman-style proportional correction gain
  twinCorrectionGain: 0.5,

  // Decision / alert thresholds
  stormHoldWeeksMin: 0,
  stormHoldWeeksMax: 8, // 6-8 weeks after spray_date
  stormHoldRainMm: 15,
  swapSoonThresholdUgl: 0.1,
  swapSoonHorizonHours: 24 * 7,
  swapCooldownHours: 24 * 10, // Minimum days between automatic swaps
  nitrateAlertThresholdMgl: 5.0,
  nitrateAlertDurationHours: 24,
  cloggingRiseFraction: 0.2, // >20% above 7-day normal at same flow
  iceTempC: 0.5,
  alertCooldownHours: 72,
} as const;

/**
 * Determine the default operating mode for a given calendar timestamp.
 * April = startup, May-July = spray, Aug-Sep = late_summer, Oct-Mar = off_season.
 */
export function seasonModeForDate(ts: Date): SeasonMode {
  const month = ts.getUTCMonth() + 1; // 1 = Jan ... 12 = Dec
  if (month === 4) return "startup";
  if (month >= 5 && month <= 7) return "spray";
  if (month === 8 || month === 9) return "late_summer";
  return "off_season";
}

/** Returns true when the green season board routes water through treatment. */
export function isTreatingMode(mode: SeasonMode): boolean {
  return mode !== "off_season";
}

/** Simple deterministic Mulberry32 PRNG so every seed is reproducible. */
export function createRng(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // Standard normal N(0, 1) via Box-Muller transform.
  const normal = () => {
    const u1 = Math.max(next(), 1e-12);
    const u2 = next();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  return { next, normal };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
