import { alertRouter } from "~/server/api/routers/alert";
import { simRouter } from "~/server/api/routers/sim";
import { siteRouter } from "~/server/api/routers/site";
import { twinRouter } from "~/server/api/routers/twin";
import { whatifRouter } from "~/server/api/routers/whatif";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";

/**
 * Primary tRPC router for NEPHRON.
 */
export const appRouter = createTRPCRouter({
  site: siteRouter,
  sim: simRouter,
  twin: twinRouter,
  alert: alertRouter,
  whatif: whatifRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
