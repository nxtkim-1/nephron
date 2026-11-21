import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

// Allowed operating modes across the farming year.
export const seasonModeEnum = pgEnum("season_mode", [
  "startup",
  "spray",
  "late_summer",
  "off_season",
]);

// Sampling points for lab grab samples.
export const grabLocationEnum = pgEnum("grab_location", [
  "inlet",
  "after_c2",
  "outlet",
]);

// Farmer decision / warning alert types.
export const alertTypeEnum = pgEnum("alert_type", [
  "storm_hold",
  "swap_soon",
  "nitrate_breakthrough",
  "clogging",
  "ice",
]);

// Operational and simulation audit events.
export const eventTypeEnum = pgEnum("event_type", [
  "season_change",
  "cartridge_swap",
  "reseed",
]);

// 1. Farm tile-drain site metadata and current season mode.
export const site = pgTable("site", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  areaHa: doublePrecision("area_ha").notNull().default(20),
  sprayDate: timestamp("spray_date", { withTimezone: true }),
  seasonMode: seasonModeEnum("season_mode").notNull().default("startup"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

// 2. Hourly noisy sensor readings that the digital twin is allowed to see.
export const reading = pgTable(
  "reading",
  {
    id: serial("id").primaryKey(),
    siteId: integer("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    flowLps: doublePrecision("flow_lps").notNull(),
    tempC: doublePrecision("temp_c").notNull(),
    turbidityNtu: doublePrecision("turbidity_ntu").notNull(),
    uv254: doublePrecision("uv254").notNull(),
    nitrateAfterChipsMgl: doublePrecision("nitrate_after_chips_mgl").notNull(),
    inletLevelM: doublePrecision("inlet_level_m").notNull(),
    rainForecastMm24h: doublePrecision("rain_forecast_mm_24h").notNull(),
  },
  (t) => [index("reading_site_ts_idx").on(t.siteId, t.ts)],
);

// 3. Weekly lab grab samples used to calibrate the twin.
export const grabSample = pgTable(
  "grab_sample",
  {
    id: serial("id").primaryKey(),
    siteId: integer("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    location: grabLocationEnum("location").notNull(),
    atrazineUgl: doublePrecision("atrazine_ugl").notNull(),
  },
  (t) => [index("grab_sample_site_ts_idx").on(t.siteId, t.ts)],
);

// 4. Hourly digital twin estimates (what the operator sees).
export const twinState = pgTable(
  "twin_state",
  {
    id: serial("id").primaryKey(),
    siteId: integer("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    estCapacityUsedC1: doublePrecision("est_capacity_used_c1").notNull(),
    estCapacityUsedC2: doublePrecision("est_capacity_used_c2").notNull(),
    estCapacityUsedPolish: doublePrecision("est_capacity_used_polish").notNull(),
    estOutletAtrazineUgl: doublePrecision("est_outlet_atrazine_ugl").notNull(),
    estAfterC2Ugl: doublePrecision("est_after_c2_ugl").notNull(),
    bypassedM3: doublePrecision("bypassed_m3").notNull(),
    removedMgCum: doublePrecision("removed_mg_cum").notNull(),
  },
  (t) => [index("twin_state_site_ts_idx").on(t.siteId, t.ts)],
);

// 5. Hidden simulated plant truth (same columns as twin_state, for demo comparison only).
export const truthState = pgTable(
  "truth_state",
  {
    id: serial("id").primaryKey(),
    siteId: integer("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    estCapacityUsedC1: doublePrecision("est_capacity_used_c1").notNull(),
    estCapacityUsedC2: doublePrecision("est_capacity_used_c2").notNull(),
    estCapacityUsedPolish: doublePrecision("est_capacity_used_polish").notNull(),
    estOutletAtrazineUgl: doublePrecision("est_outlet_atrazine_ugl").notNull(),
    estAfterC2Ugl: doublePrecision("est_after_c2_ugl").notNull(),
    bypassedM3: doublePrecision("bypassed_m3").notNull(),
    removedMgCum: doublePrecision("removed_mg_cum").notNull(),
  },
  (t) => [index("truth_state_site_ts_idx").on(t.siteId, t.ts)],
);

// 6. Active and resolved farmer alerts.
export const alert = pgTable(
  "alert",
  {
    id: serial("id").primaryKey(),
    siteId: integer("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    type: alertTypeEnum("type").notNull(),
    message: text("message").notNull(),
    resolved: boolean("resolved").notNull().default(false),
  },
  (t) => [index("alert_site_ts_idx").on(t.siteId, t.ts)],
);

// 7. Log of season changes, cartridge swaps, and reseeds.
export const event = pgTable(
  "event",
  {
    id: serial("id").primaryKey(),
    siteId: integer("site_id")
      .notNull()
      .references(() => site.id, { onDelete: "cascade" }),
    ts: timestamp("ts", { withTimezone: true }).notNull(),
    type: eventTypeEnum("type").notNull(),
    note: text("note").notNull().default(""),
  },
  (t) => [index("event_site_ts_idx").on(t.siteId, t.ts)],
);
