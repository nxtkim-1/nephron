import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { alert } from "~/server/db/schema";

export const alertRouter = createTRPCRouter({
  list: publicProcedure
    .input(z.object({ siteId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(alert)
        .where(eq(alert.siteId, input.siteId))
        .orderBy(desc(alert.ts));
    }),

  resolve: publicProcedure
    .input(z.object({ alertId: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(alert)
        .set({ resolved: true })
        .where(eq(alert.id, input.alertId))
        .returning();
      return updated ?? null;
    }),
});
