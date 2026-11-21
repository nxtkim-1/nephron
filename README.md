# NEPHRON: A Seasonal Field Kidney for Atrazine in Tile Drainage

**Nitrate-Eliminating Pesticide-Holding Reactor for On-farm Networks**

> **Synthetic data: demonstration only.** No live farm sensors are connected; a built-in simulator generates a hidden ground-truth plant and noisy sensor readings so the digital twin can demonstrate real-time tracking and calibration.

## What NEPHRON Does
NEPHRON is a buried treatment unit placed at a farm tile-drain outlet to remove the herbicide atrazine and nitrate before drainage reaches surface ditches:

1. **Inlet Box** — Stop logs and a green **season board** that sends water to **Treat** (April–September) or **Bypass** (October–March off-season). Excess storm flow above 3.5 L/s is stored in a 300 m³ retention basin before overflowing.
2. **Woodchip Trench** — Removes ~70% of nitrate (normally) and 25% of incoming atrazine.
3. **Carbon Box** — Three adsorption cartridges in series (**Carbon 1 → Carbon 2 → Polish**). When Carbon 1 nears exhaustion, a lead-lag swap removes Carbon 1, shifts Carbon 2 → 1 and Polish → 2, and adds a fresh Polish cartridge.
4. **Outlet Box → Ditch** — Discharges treated water to the drainage ditch.

## How the Digital Twin Works (Plain English)
- **Hourly Physical Model (`src/lib/model.ts`)**: Tracks base flow (0.2 L/s) plus Poisson storms, post-spray atrazine decay (10-day half-life with 1.5× storm first flush), hydraulic routing (3.5 L/s cap + 300 m³ basin), 25% woodchip removal, cartridge adsorption (`r = r_max * (1 - f^2)`), and dissolved organic matter (DOM) fouling via UV254.
- **Hidden Truth vs. Noisy Sensors (`src/lib/simulator.ts`)**: The hidden plant fouls 30% faster than the twin initially expects and includes a random 1-week woodchip failure and inlet clogging event. The twin only sees 5%-noisy continuous sensors and weekly 10%-noisy lab grab samples that arrive 2 days late.
- **Kalman-Style Calibration (`src/lib/twin.ts`)**: Whenever a lab grab sample from `after_c2` arrives, the twin compares the measurement against its prediction from 2 days earlier and nudges its estimated cartridge capacities (`C1`, `C2`) and fouling parameter (`k_dom`) halfway (`gain = 0.5`) toward the value that explains the lab result.
- **Farmer Alerts**: Raises actionable warnings for `storm_hold`, `swap_soon` (7-day breakthrough forecast > 0.1 μg/L), `nitrate_breakthrough` (> 5 mg/L for 24 h), `clogging` (> 20% inlet level rise), and `ice` (< 0.5 °C).

## Pages
- `/` — Interactive 6-box schematic, cartridge fill bars, season time slider, active alerts with Resolve buttons, and Reseed / Swap actions.
- `/charts` — Flow & rain, inlet vs. outlet atrazine (twin vs. truth + lab grab dots), cartridge capacity convergence, and cumulative bypass.
- `/startup` — 5-step spring start-up checklist that logs the spray date and activates `spray` mode.
- `/whatif` — Side-by-side comparison of twin-guided cartridge swaps vs. a fixed single annual swap.

## Stack & Commands
- **Stack:** Next.js App Router, TypeScript, tRPC, Tailwind CSS, Drizzle ORM, Neon Postgres (`@neondatabase/serverless`), Recharts, Vitest.
- **Setup:** Copy `.env.example` to `.env` and add your Neon `DATABASE_URL`.
- **Commands:**
  - `npm install` — install dependencies
  - `npm run db:push` — push Drizzle schema to Neon Postgres
  - `npm test` — run Vitest physical model & mass-balance tests
  - `npm run check` — run ESLint + TypeScript typecheck
  - `npm run dev` — start local dev server at `http://localhost:3000`
