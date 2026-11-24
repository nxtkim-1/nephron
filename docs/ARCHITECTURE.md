# NEPHRON: architecture and decision record

The constraint: the twin never sees the truth; it may only believe what a noisy sensor or a late lab sample could have told it. All data is synthetic by design, and the README says so in its first line.

## System walk

A hidden simulator (src/lib/simulator.ts) plays the real treatment unit across a season: base flow plus Poisson storms, post-spray atrazine decay with a storm first flush, hydraulic routing with a 3.5 L/s treatment cap and a 300 m3 retention basin, woodchip nitrate removal, three carbon cartridges in series, and dissolved-organic-matter fouling tracked by UV254. The hidden plant fouls 30% faster than the twin initially expects and includes a random one-week woodchip failure and inlet clogging. The twin (src/lib/twin.ts) runs the same physical model (src/lib/model.ts) but sees only 5%-noisy continuous sensors and weekly 10%-noisy lab grab samples that arrive two days late. When an after_c2 grab sample lands, the twin finds the capacity shift that explains the measured concentration and moves its cartridge-capacity and fouling estimates halfway toward it (gain 0.5). Alerts, charts, the start-up checklist and the what-if comparison are all driven by the twin's estimates, persisted in Neon Postgres through Drizzle, exposed via tRPC routers.

## Decision records

### D1. Hidden truth, noisy sensors, late labs

- Problem: a digital twin demo is only convincing if the twin cannot cheat.
- Choice: the simulator and the twin are separate modules; the twin's only inputs are the sensor stream and the delayed grab samples. The demonstration's difficulty is deliberate: the hidden plant's fouling parameter drifts 30% away from the twin's starting belief.
- Evidence: src/lib/simulator.ts and src/lib/twin.ts are separate modules with the sample-time state passed explicitly into the correction function (TwinCalibrationInput carries the sample-time capacities and the concentration entering C1 from two days earlier).
- Limits: everything is synthetic; no live farm sensors are connected (README banner).

### D2. Correction by model inversion, halfway

- Problem: lab samples arrive two days late, and a twin that jumped fully to each new measurement would oscillate.
- Choice: bisection on the adsorption model finds the unique capacity shift df in [-1, 1] that makes the model's after_c2 prediction match the lab value, then the estimated capacities (C1, C2) and the fouling parameter k_dom move halfway (gain = 0.5) toward the explaining value (src/lib/twin.ts, correctTwinFromGrabSample).
- Alternative: full Kalman filtering; the proportional half-step is the documented simple version ("Simple Kalman-style proportional correction", module comment).
- Not yet measured: convergence behaviour across many seasons and sensor-failure mixes; the /charts page showing capacity convergence is the current evidence.

### D3. Physics first, alerts from estimates

- Choice: alerts (storm_hold, swap_soon at a 7-day breakthrough forecast above 0.1 ug/L, nitrate_breakthrough above 5 mg/L for 24 h, clogging above a 20% inlet level rise, ice below 0.5 C) are computed from the twin's estimates and forecasts, not from hidden state.
- Evidence: model mass-balance covered by Vitest physical-model tests (src/lib/model.test.ts; npm test).

### D4. Lead-lag cartridge operation as a first-class action

- Choice: three cartridges in series (Carbon 1, Carbon 2, Polish); when Carbon 1 nears exhaustion a lead-lag swap removes it, shifts Carbon 2 to 1 and Polish to 2, and adds a fresh Polish. The what-if page scores this twin-guided schedule against a fixed single annual swap on the same simulated season (src/server/api/routers/whatif.ts, /whatif page).
- Why: the swap policy is the agronomic payoff of the twin, so it is a page, not a footnote.

## Interview questions this doc should let the owner answer

- The lab sample is two days old when it arrives. What state does the correction compare against, and why?
- The hidden plant fouls 30% faster than the twin believes. What keeps the twin from noticing directly?
- Why move estimates halfway instead of all the way to what the sample implies?
