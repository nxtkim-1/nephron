import { and, asc, desc, eq, lte } from "drizzle-orm";
import { z } from "zod";

import { NEPHRON_CONFIG, seasonModeForDate } from "~/lib/config";
import { computeInletAtrazine } from "~/lib/model";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import {
  alert,
  event,
  grabSample,
  reading,
  site,
  truthState,
  twinState,
} from "~/server/db/schema";

export const twinRouter = createTRPCRouter({
  // Return a single snapshot (reading + twin + truth) at or before the requested timestamp.
  getState: publicProcedure
    .input(
      z.object({
        siteId: z.number().int().positive(),
        ts: z.coerce.date().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const readWhere = input.ts
        ? and(eq(reading.siteId, input.siteId), lte(reading.ts, input.ts))
        : eq(reading.siteId, input.siteId);
      const twinWhere = input.ts
        ? and(eq(twinState.siteId, input.siteId), lte(twinState.ts, input.ts))
        : eq(twinState.siteId, input.siteId);
      const truthWhere = input.ts
        ? and(eq(truthState.siteId, input.siteId), lte(truthState.ts, input.ts))
        : eq(truthState.siteId, input.siteId);

      const [[r], [tw], [tr]] = await Promise.all([
        ctx.db
          .select()
          .from(reading)
          .where(readWhere)
          .orderBy(desc(reading.ts))
          .limit(1),
        ctx.db
          .select()
          .from(twinState)
          .where(twinWhere)
          .orderBy(desc(twinState.ts))
          .limit(1),
        ctx.db
          .select()
          .from(truthState)
          .where(truthWhere)
          .orderBy(desc(truthState.ts))
          .limit(1),
      ]);

      return {
        reading: r ?? null,
        twin: tw ?? null,
        truth: tr ?? null,
      };
    }),

  // Return the full season time series (optionally strided for fast chart rendering).
  getSeries: publicProcedure
    .input(
      z
        .object({
          siteId: z.number().int().positive().optional(),
          stride: z.number().int().min(1).max(24).default(1),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const stride = input?.stride ?? 1;

      const activeSite = input?.siteId
        ? (
            await ctx.db
              .select()
              .from(site)
              .where(eq(site.id, input.siteId))
              .limit(1)
          )[0]
        : (
            await ctx.db
              .select()
              .from(site)
              .orderBy(desc(site.id))
              .limit(1)
          )[0];

      if (!activeSite) {
        return {
          site: null,
          points: [],
          grabSamples: [],
          alerts: [],
          events: [],
        };
      }

      const siteId = activeSite.id;
      const sprayDate =
        activeSite.sprayDate ?? new Date(NEPHRON_CONFIG.defaultSprayDateIso);

      const [readings, twins, truths, grabs, alerts, events] = await Promise.all([
        ctx.db
          .select()
          .from(reading)
          .where(eq(reading.siteId, siteId))
          .orderBy(asc(reading.ts)),
        ctx.db
          .select()
          .from(twinState)
          .where(eq(twinState.siteId, siteId))
          .orderBy(asc(twinState.ts)),
        ctx.db
          .select()
          .from(truthState)
          .where(eq(truthState.siteId, siteId))
          .orderBy(asc(truthState.ts)),
        ctx.db
          .select()
          .from(grabSample)
          .where(eq(grabSample.siteId, siteId))
          .orderBy(asc(grabSample.ts)),
        ctx.db
          .select()
          .from(alert)
          .where(eq(alert.siteId, siteId))
          .orderBy(desc(alert.ts)),
        ctx.db
          .select()
          .from(event)
          .where(eq(event.siteId, siteId))
          .orderBy(desc(event.ts)),
      ]);

      const count = Math.min(readings.length, twins.length, truths.length);
      const points = [];
      for (let i = 0; i < count; i += stride) {
        const r = readings[i]!;
        const tw = twins[i]!;
        const tr = truths[i]!;
        points.push({
          ts: r.ts.toISOString(),
          seasonMode: seasonModeForDate(r.ts),
          flowLps: Number(r.flowLps.toFixed(3)),
          tempC: Number(r.tempC.toFixed(2)),
          turbidityNtu: Number(r.turbidityNtu.toFixed(2)),
          uv254: Number(r.uv254.toFixed(4)),
          nitrateAfterChipsMgl: Number(r.nitrateAfterChipsMgl.toFixed(2)),
          inletLevelM: Number(r.inletLevelM.toFixed(3)),
          rainForecastMm24h: Number(r.rainForecastMm24h.toFixed(1)),
          inletAtrazineUgl: Number(
            computeInletAtrazine(r.ts, sprayDate, r.flowLps).toFixed(3),
          ),
          twinC1: Number(tw.estCapacityUsedC1.toFixed(4)),
          twinC2: Number(tw.estCapacityUsedC2.toFixed(4)),
          twinPolish: Number(tw.estCapacityUsedPolish.toFixed(4)),
          twinOutletUgl: Number(tw.estOutletAtrazineUgl.toFixed(3)),
          twinAfterC2Ugl: Number(tw.estAfterC2Ugl.toFixed(3)),
          twinBypassM3: Number(tw.bypassedM3.toFixed(2)),
          twinRemovedMg: Number(tw.removedMgCum.toFixed(1)),
          truthC1: Number(tr.estCapacityUsedC1.toFixed(4)),
          truthC2: Number(tr.estCapacityUsedC2.toFixed(4)),
          truthPolish: Number(tr.estCapacityUsedPolish.toFixed(4)),
          truthOutletUgl: Number(tr.estOutletAtrazineUgl.toFixed(3)),
          truthAfterC2Ugl: Number(tr.estAfterC2Ugl.toFixed(3)),
          truthBypassM3: Number(tr.bypassedM3.toFixed(2)),
          truthRemovedMg: Number(tr.removedMgCum.toFixed(1)),
        });
      }

      return {
        site: activeSite,
        points,
        grabSamples: grabs.map((g) => ({
          id: g.id,
          ts: g.ts.toISOString(),
          location: g.location,
          atrazineUgl: Number(g.atrazineUgl.toFixed(3)),
        })),
        alerts,
        events,
      };
    }),
});
