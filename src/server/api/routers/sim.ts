import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { NEPHRON_CONFIG } from "~/lib/config";
import { simulateSeason } from "~/lib/simulator";
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

const BATCH_SIZE = 500;

/** Insert rows in fixed-size chunks so Neon HTTP requests stay small and fast. */
async function insertInChunks<T>(
  rows: T[],
  insertBatch: (batch: T[]) => Promise<unknown>,
) {
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const chunk = rows.slice(i, i + BATCH_SIZE);
    if (chunk.length > 0) {
      await insertBatch(chunk);
    }
  }
}

export const simRouter = createTRPCRouter({
  runSeason: publicProcedure
    .input(
      z
        .object({
          siteId: z.number().int().positive().optional(),
          seed: z.number().int().min(1).max(999999).default(42),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input }) => {
      const seed = input?.seed ?? 42;

      // Resolve existing site or create the default NEPHRON demonstration site.
      let activeSite = input?.siteId
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
        const [created] = await ctx.db
          .insert(site)
          .values({
            name: "NEPHRON Field Site — Tile Outlet 1",
            areaHa: NEPHRON_CONFIG.defaultAreaHa,
            sprayDate: new Date(NEPHRON_CONFIG.defaultSprayDateIso),
            seasonMode: "spray",
          })
          .returning();
        activeSite = created!;
      }

      const siteId = activeSite.id;
      const sprayDate =
        activeSite.sprayDate ?? new Date(NEPHRON_CONFIG.defaultSprayDateIso);

      // Clear previous simulated data for this site.
      await Promise.all([
        ctx.db.delete(reading).where(eq(reading.siteId, siteId)),
        ctx.db.delete(grabSample).where(eq(grabSample.siteId, siteId)),
        ctx.db.delete(twinState).where(eq(twinState.siteId, siteId)),
        ctx.db.delete(truthState).where(eq(truthState.siteId, siteId)),
        ctx.db.delete(alert).where(eq(alert.siteId, siteId)),
        ctx.db.delete(event).where(eq(event.siteId, siteId)),
      ]);

      // Run full-season simulation in plain TypeScript.
      const sim = simulateSeason({
        seed,
        sprayDate,
        swapStrategy: "twin_guided",
      });

      const readingRows = sim.readings.map((r) => ({ siteId, ...r }));
      const twinRows = sim.twinStates.map((s) => ({ siteId, ...s }));
      const truthRows = sim.truthStates.map((s) => ({ siteId, ...s }));
      const grabRows = sim.grabSamples.map((g) => ({ siteId, ...g }));
      const alertRows = sim.alerts.map((a) => ({
        siteId,
        ts: a.ts,
        type: a.type,
        message: a.message,
        resolved: false,
      }));
      const eventRows = [
        {
          siteId,
          ts: new Date(NEPHRON_CONFIG.seasonStartIso),
          type: "reseed" as const,
          note: `Season simulated (Apr 1 - Oct 31) with seed #${seed}.`,
        },
        ...sim.events.map((e) => ({ siteId, ...e })),
      ];

      // Batched inserts into Neon Postgres.
      await Promise.all([
        insertInChunks(readingRows, (batch) =>
          ctx.db.insert(reading).values(batch),
        ),
        insertInChunks(twinRows, (batch) =>
          ctx.db.insert(twinState).values(batch),
        ),
        insertInChunks(truthRows, (batch) =>
          ctx.db.insert(truthState).values(batch),
        ),
        insertInChunks(grabRows, (batch) =>
          ctx.db.insert(grabSample).values(batch),
        ),
        insertInChunks(alertRows, (batch) =>
          ctx.db.insert(alert).values(batch),
        ),
        insertInChunks(eventRows, (batch) =>
          ctx.db.insert(event).values(batch),
        ),
      ]);

      return {
        siteId,
        seed,
        summary: sim.summary,
        counts: {
          readings: readingRows.length,
          grabSamples: grabRows.length,
          twinStates: twinRows.length,
          truthStates: truthRows.length,
          alerts: alertRows.length,
          events: eventRows.length,
        },
      };
    }),

  reset: publicProcedure
    .input(z.object({ siteId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      await Promise.all([
        ctx.db.delete(reading).where(eq(reading.siteId, input.siteId)),
        ctx.db.delete(grabSample).where(eq(grabSample.siteId, input.siteId)),
        ctx.db.delete(twinState).where(eq(twinState.siteId, input.siteId)),
        ctx.db.delete(truthState).where(eq(truthState.siteId, input.siteId)),
        ctx.db.delete(alert).where(eq(alert.siteId, input.siteId)),
        ctx.db.delete(event).where(eq(event.siteId, input.siteId)),
      ]);
      return { cleared: true };
    }),
});
