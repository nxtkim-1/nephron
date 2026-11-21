import { z } from "zod";

import { compareWhatIfSeasons } from "~/lib/simulator";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const whatifRouter = createTRPCRouter({
  compare: publicProcedure
    .input(
      z.object({
        seed: z.number().int().min(1).max(999999).default(42),
      }),
    )
    .query(({ input }) => {
      return compareWhatIfSeasons(input.seed);
    }),
});
