import { count, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { NEPHRON_CONFIG } from "~/lib/config";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { event, site, truthState, twinState } from "~/server/db/schema";

const seasonModeSchema = z.enum([
  "startup",
  "spray",
  "late_summer",
  "off_season",
]);

export const siteRouter = createTRPCRouter({
  hello: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select({ total: count() }).from(site);
    return {
      greeting: "NEPHRON: A Seasonal Field Kidney for Atrazine in Tile Drainage",
      siteCount: rows[0]?.total ?? 0,
    };
  }),

  get: publicProcedure
    .input(z.object({ siteId: z.number().int().positive().optional() }).optional())
    .query(async ({ ctx, input }) => {
      if (input?.siteId) {
        const found = await ctx.db
          .select()
          .from(site)
          .where(eq(site.id, input.siteId))
          .limit(1);
        return found[0] ?? null;
      }
      const latest = await ctx.db
        .select()
        .from(site)
        .orderBy(desc(site.id))
        .limit(1);
      return latest[0] ?? null;
    }),

  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1).default("NEPHRON Field Site — Tile Outlet 1"),
        areaHa: z.number().positive().default(NEPHRON_CONFIG.defaultAreaHa),
        sprayDate: z.coerce
          .date()
          .default(() => new Date(NEPHRON_CONFIG.defaultSprayDateIso)),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(site)
        .values({
          name: input.name,
          areaHa: input.areaHa,
          sprayDate: input.sprayDate,
          seasonMode: "startup",
        })
        .returning();
      return created!;
    }),

  updateSeason: publicProcedure
    .input(
      z.object({
        siteId: z.number().int().positive(),
        seasonMode: seasonModeSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(site)
        .set({ seasonMode: input.seasonMode })
        .where(eq(site.id, input.siteId))
        .returning();

      await ctx.db.insert(event).values({
        siteId: input.siteId,
        ts: new Date(),
        type: "season_change",
        note: `Season mode updated to ${input.seasonMode}.`,
      });

      return updated ?? null;
    }),

  logSprayDate: publicProcedure
    .input(
      z.object({
        siteId: z.number().int().positive(),
        sprayDate: z.coerce.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(site)
        .set({ sprayDate: input.sprayDate })
        .where(eq(site.id, input.siteId))
        .returning();
      return updated ?? null;
    }),

  // Completes the 5-step spring start-up checklist: logs spray date and sets mode = 'spray'.
  completeStartup: publicProcedure
    .input(
      z.object({
        siteId: z.number().int().positive(),
        sprayDate: z.coerce.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(site)
        .set({
          sprayDate: input.sprayDate,
          seasonMode: "spray",
        })
        .where(eq(site.id, input.siteId))
        .returning();

      await ctx.db.insert(event).values({
        siteId: input.siteId,
        ts: new Date(),
        type: "season_change",
        note: `Spring start-up checklist completed; spray date logged (${input.sprayDate.toISOString().slice(0, 10)}); season_mode set to spray.`,
      });

      return updated ?? null;
    }),

  // Manual lead-lag cartridge swap: C2 -> C1, Polish -> C2, fresh Polish = 0.
  swapCartridge: publicProcedure
    .input(
      z.object({
        siteId: z.number().int().positive(),
        ts: z.coerce.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [latestTwin] = await ctx.db
        .select()
        .from(twinState)
        .where(eq(twinState.siteId, input.siteId))
        .orderBy(desc(twinState.ts))
        .limit(1);

      const [latestTruth] = await ctx.db
        .select()
        .from(truthState)
        .where(eq(truthState.siteId, input.siteId))
        .orderBy(desc(truthState.ts))
        .limit(1);

      if (latestTwin) {
        await ctx.db
          .update(twinState)
          .set({
            estCapacityUsedC1: latestTwin.estCapacityUsedC2,
            estCapacityUsedC2: latestTwin.estCapacityUsedPolish,
            estCapacityUsedPolish: 0,
          })
          .where(eq(twinState.id, latestTwin.id));
      }

      if (latestTruth) {
        await ctx.db
          .update(truthState)
          .set({
            estCapacityUsedC1: latestTruth.estCapacityUsedC2,
            estCapacityUsedC2: latestTruth.estCapacityUsedPolish,
            estCapacityUsedPolish: 0,
          })
          .where(eq(truthState.id, latestTruth.id));
      }

      const swapTs = input.ts ?? latestTwin?.ts ?? new Date();
      await ctx.db.insert(event).values({
        siteId: input.siteId,
        ts: swapTs,
        type: "cartridge_swap",
        note: "Manual lead-lag swap: removed Carbon 1, shifted Carbon 2 -> 1, Polish -> 2, installed fresh Polish.",
      });

      return { swappedAt: swapTs };
    }),
});
