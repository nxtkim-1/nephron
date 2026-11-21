"use client";

import "@xyflow/react/dist/style.css";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  CheckCircle2,
  CloudRain,
  Droplets,
  Layers,
  RefreshCw,
  Smartphone,
  Sun,
  TestTube2,
  User,
} from "lucide-react";

import { simulateSeason } from "~/lib/simulator";

// Calm 52-second loop across April -> October.
const LOOP_DURATION_SEC = 52;
const MONTHS = ["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"] as const;

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function barColorClass(frac: number) {
  if (frac >= 0.8) return "bg-red-600";
  if (frac >= 0.55) return "bg-amber-500";
  return "bg-emerald-600";
}

// ---------- Custom React Flow Nodes ----------

type FarmerData = { message: string; isSwap: boolean };
function FarmerNode({ data }: NodeProps<Node<FarmerData>>) {
  return (
    <div className="flex w-52 items-center gap-3 rounded-lg border border-stone-300 bg-white px-3.5 py-3 shadow-xs">
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${
          data.isSwap
            ? "border-red-200 bg-red-50 text-red-700"
            : "border-stone-200 bg-stone-100 text-stone-700"
        }`}
      >
        <User className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-bold tracking-wide text-stone-500 uppercase">
          Farmer
        </div>
        <div className="text-xs font-semibold text-stone-900">
          {data.message}
        </div>
      </div>
      <Handle
        type="target"
        position={Position.Right}
        className="!h-2 !w-2 !bg-stone-500"
      />
    </div>
  );
}

type PhoneTwinData = {
  c1: number;
  c2: number;
  c3: number;
  statusText: string;
  statusStyle: string;
  isSwap: boolean;
};
function PhoneTwinNode({ data }: NodeProps<Node<PhoneTwinData>>) {
  return (
    <div
      className={`w-60 rounded-xl border-2 bg-white p-3.5 shadow-sm ${
        data.isSwap ? "border-red-500" : "border-purple-700"
      }`}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Smartphone className="h-4 w-4 text-purple-700" />
          <span className="text-xs font-extrabold tracking-wide text-purple-800 uppercase">
            Digital Twin
          </span>
        </div>
        <span
          className={`rounded px-2 py-0.5 text-[10px] font-bold ${data.statusStyle}`}
        >
          {data.statusText}
        </span>
      </div>

      {/* 3 live mini filter bars mirrored on the phone */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { label: "F1", val: data.c1 },
          { label: "F2", val: data.c2 },
          { label: "F3", val: data.c3 },
        ].map((b) => (
          <div key={b.label} className="flex flex-col items-center gap-1">
            <div className="flex h-11 w-full items-end overflow-hidden rounded bg-stone-100 p-0.5">
              <div
                className={`w-full rounded-xs transition-all duration-200 ${barColorClass(b.val)}`}
                style={{ height: `${Math.max(8, Math.round(b.val * 100))}%` }}
              />
            </div>
            <span className="font-mono text-[10px] font-semibold text-stone-600">
              {b.label}
            </span>
          </div>
        ))}
      </div>

      <Handle
        type="source"
        position={Position.Left}
        id="to-farmer"
        className="!h-2 !w-2 !bg-purple-700"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="from-sensors"
        className="!h-2 !w-2 !bg-purple-700"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="from-sample"
        className="!h-2 !w-2 !bg-amber-600"
      />
    </div>
  );
}

type SampleData = { active: boolean };
function WaterSampleNode({ data }: NodeProps<Node<SampleData>>) {
  return (
    <div
      className={`flex w-48 items-center gap-3 rounded-lg border px-3.5 py-3 shadow-xs transition-colors ${
        data.active
          ? "border-amber-500 bg-amber-50"
          : "border-stone-300 bg-white"
      }`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
          data.active
            ? "bg-amber-500 text-white"
            : "bg-stone-100 text-stone-600"
        }`}
      >
        <TestTube2 className="h-4 w-4" />
      </div>
      <div>
        <div className="text-xs font-bold text-stone-900">Water Sample</div>
        <div className="text-[11px] text-stone-600">
          {data.active ? "Twin updated" : "Checks twin weekly"}
        </div>
      </div>
      <Handle
        type="target"
        position={Position.Bottom}
        id="from-clean"
        className="!h-2 !w-2 !bg-amber-600"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="to-twin"
        className="!h-2 !w-2 !bg-amber-600"
      />
    </div>
  );
}

type RunoffData = { isStorm: boolean; isSprayHeavy: boolean; isTreat: boolean };
function RunoffNode({ data }: NodeProps<Node<RunoffData>>) {
  return (
    <div className="w-48 rounded-lg border border-stone-300 bg-white p-3.5 shadow-xs">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-wide text-stone-500 uppercase">
          1. Field Runoff
        </span>
        {data.isStorm ? (
          <CloudRain className="h-4 w-4 text-sky-600" />
        ) : (
          <Sun className="h-4 w-4 text-amber-500" />
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <Droplets className="h-5 w-5 text-purple-700" />
        <div>
          <div className="text-xs font-bold text-stone-900">Tile Drain</div>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-purple-700">
            <span className="inline-block h-2 w-2 rounded-full bg-purple-700" />
            {data.isSprayHeavy ? "High pesticide" : "Pesticide (Atrazine)"}
          </div>
        </div>
      </div>

      <div className="mt-2.5 border-t border-stone-100 pt-2 text-[10px] font-semibold text-stone-500">
        Gate:{" "}
        <span className={data.isTreat ? "text-emerald-700" : "text-amber-700"}>
          {data.isTreat ? "Cleaning ON" : "Off-Season Bypass"}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="treat-out"
        className="!h-2 !w-2 !bg-purple-700"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="bypass-out"
        className="!h-2 !w-2 !bg-amber-600"
      />
    </div>
  );
}

type WoodchipsData = { isTreat: boolean };
function WoodchipsNode({ data }: NodeProps<Node<WoodchipsData>>) {
  return (
    <div
      className={`w-44 rounded-lg border p-3.5 shadow-xs ${
        data.isTreat
          ? "border-amber-300 bg-amber-50/60"
          : "border-stone-200 bg-stone-50 opacity-60"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-wide text-amber-900 uppercase">
          2. Woodchips
        </span>
        <Layers className="h-4 w-4 text-amber-700" />
      </div>
      <div className="mt-2.5 text-xs font-bold text-stone-900">
        Woodchip Trench
      </div>
      <div className="mt-0.5 text-[11px] text-amber-900">
        Cuts 70% fertilizer
      </div>

      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !bg-purple-700"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !bg-purple-700"
      />
    </div>
  );
}

type CarbonData = {
  c1: number;
  c2: number;
  c3: number;
  c1R: number;
  c2R: number;
  c3R: number;
  isSwap: boolean;
  isTreat: boolean;
};
function CarbonFiltersNode({ data }: NodeProps<Node<CarbonData>>) {
  const filters = [
    { label: "Filter 1", est: data.c1, real: data.c1R },
    { label: "Filter 2", est: data.c2, real: data.c2R },
    { label: "Filter 3", est: data.c3, real: data.c3R },
  ];

  return (
    <div
      className={`w-72 rounded-xl border-2 bg-white p-4 shadow-sm ${
        !data.isTreat
          ? "border-stone-300 opacity-65"
          : data.isSwap
            ? "border-red-500"
            : "border-purple-700"
      }`}
    >
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[11px] font-bold tracking-wide text-purple-800 uppercase">
            3. Carbon Filters
          </div>
          <div className="text-[11px] text-stone-500">
            Traps pesticide underground
          </div>
        </div>
        {data.isSwap && (
          <span className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-800">
            <RefreshCw className="h-3 w-3" /> Swap
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2.5">
        {filters.map((f) => {
          const estPct = Math.round(f.est * 100);
          const realPct = Math.round(f.real * 100);
          return (
            <div key={f.label} className="flex flex-col items-center gap-1">
              <div className="relative flex h-20 w-full items-end overflow-hidden rounded-md border border-stone-300 bg-stone-100 p-0.5">
                <div
                  className={`w-full rounded-xs transition-all duration-200 ${barColorClass(f.est)}`}
                  style={{ height: `${Math.max(6, estPct)}%` }}
                />
                {/* Crisp dashed line = real hidden buried filter */}
                <div
                  title={`Real filter: ${realPct}%`}
                  className="pointer-events-none absolute right-0 left-0 border-t-2 border-dashed border-stone-900"
                  style={{ bottom: `${Math.max(4, Math.min(96, realPct))}%` }}
                />
              </div>
              <div className="font-mono text-[11px] font-bold text-stone-900">
                {estPct}%
              </div>
              <div className="text-[10px] text-stone-500">{f.label}</div>
            </div>
          );
        })}
      </div>

      <Handle
        type="target"
        position={Position.Left}
        className="!h-2 !w-2 !bg-purple-700"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="clean-out"
        className="!h-2 !w-2 !bg-sky-600"
      />
      <Handle
        type="source"
        position={Position.Top}
        id="sensors-out"
        className="!h-2 !w-2 !bg-purple-700"
      />
    </div>
  );
}

type CleanWaterData = { isTreat: boolean };
function CleanWaterNode({ data }: NodeProps<Node<CleanWaterData>>) {
  return (
    <div className="w-48 rounded-lg border border-sky-300 bg-sky-50/70 p-3.5 shadow-xs">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-wide text-sky-900 uppercase">
          4. Clean Water
        </span>
        <CheckCircle2 className="h-4 w-4 text-sky-700" />
      </div>
      <div className="mt-2.5 text-xs font-bold text-stone-900">
        Drainage Ditch
      </div>
      <div className="mt-0.5 text-[11px] font-semibold text-sky-800">
        {data.isTreat ? "Pesticide removed" : "Off-season bypass"}
      </div>

      <Handle
        type="target"
        position={Position.Left}
        id="clean-in"
        className="!h-2 !w-2 !bg-sky-600"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="bypass-in"
        className="!h-2 !w-2 !bg-amber-600"
      />
      <Handle
        type="source"
        position={Position.Top}
        id="sample-out"
        className="!h-2 !w-2 !bg-amber-600"
      />
    </div>
  );
}

// Registered once outside the component so React Flow keeps smooth state.
const NODE_TYPES = {
  farmer: FarmerNode,
  phoneTwin: PhoneTwinNode,
  waterSample: WaterSampleNode,
  runoff: RunoffNode,
  woodchips: WoodchipsNode,
  carbon: CarbonFiltersNode,
  cleanWater: CleanWaterNode,
};

// ---------- Main Page Component ----------

export function DashboardClient() {
  const sim = useMemo(() => {
    const twin = simulateSeason({ seed: 42, swapStrategy: "twin_guided" });
    const fixed = simulateSeason({ seed: 42, swapStrategy: "fixed_annual" });

    const stride = 24;
    const frames = [];
    for (let i = 0; i < twin.readings.length; i += stride) {
      const r = twin.readings[i]!;
      const tw = twin.twinStates[i]!;
      const tr = twin.truthStates[i]!;
      frames.push({
        monthIdx: r.ts.getUTCMonth() + 1,
        flow: r.flowLps,
        rain: r.rainForecastMm24h,
        twinC1: tw.estCapacityUsedC1,
        twinC2: tw.estCapacityUsedC2,
        twinP: tw.estCapacityUsedPolish,
        truthC1: tr.estCapacityUsedC1,
        truthC2: tr.estCapacityUsedC2,
        truthP: tr.estCapacityUsedPolish,
        waterCheck: i > 0 && i % 168 < stride,
      });
    }

    return {
      frames,
      twinPct: Math.round(twin.summary.percentAtrazineRemoved),
      fixedPct: Math.round(fixed.summary.percentAtrazineRemoved),
    };
  }, []);

  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0.2);
  const lastTsRef = useRef<number | null>(null);

  useEffect(() => {
    let rafId = 0;
    const tick = (now: number) => {
      if (lastTsRef.current !== null && !paused) {
        const dt = Math.min(0.1, (now - lastTsRef.current) / 1000);
        setProgress((p) => (p + dt / LOOP_DURATION_SEC) % 1);
      }
      lastTsRef.current = now;
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [paused]);

  const exactIdx = progress * (sim.frames.length - 1);
  const i0 = Math.floor(exactIdx);
  const i1 = Math.min(sim.frames.length - 1, i0 + 1);
  const t = exactIdx - i0;
  const f0 = sim.frames[i0]!;
  const f1 = sim.frames[i1]!;

  const flow = lerp(f0.flow, f1.flow, t);
  const rain = lerp(f0.rain, f1.rain, t);
  const c1 = clamp01(lerp(f0.twinC1, f1.twinC1, t));
  const c2 = clamp01(lerp(f0.twinC2, f1.twinC2, t));
  const c3 = clamp01(lerp(f0.twinP, f1.twinP, t));
  const c1R = clamp01(lerp(f0.truthC1, f1.truthC1, t));
  const c2R = clamp01(lerp(f0.truthC2, f1.truthC2, t));
  const c3R = clamp01(lerp(f0.truthP, f1.truthP, t));

  const isTreat = f0.monthIdx < 10;
  const isStorm = flow > 1.25 || rain > 12;
  const isSprayHeavy = f0.monthIdx >= 5 && f0.monthIdx <= 7;
  const isSwap = isTreat && c1 >= 0.78;
  const isWaterCheck = isTreat && f0.waterCheck;
  const activeMonth = Math.min(6, Math.max(0, f0.monthIdx - 4));

  const status = !isTreat
    ? { text: "Winter Rest", style: "bg-amber-100 text-amber-800" }
    : isSwap
      ? { text: "Swap Filter 1", style: "bg-red-100 text-red-800" }
      : isStorm
        ? { text: "Storm Flow", style: "bg-sky-100 text-sky-800" }
        : { text: "All Clean", style: "bg-emerald-100 text-emerald-800" };

  const farmerMessage = !isTreat
    ? "Filters resting for winter"
    : isSwap
      ? "Time to swap Filter 1"
      : "Water looks clean";

  const nodes: Node[] = useMemo(
    () => [
      // Top row: Above ground (Farmer <- Phone Digital Twin <- Water Sample)
      {
        id: "farmer",
        type: "farmer",
        position: { x: 140, y: 42 },
        data: { message: farmerMessage, isSwap },
      },
      {
        id: "phoneTwin",
        type: "phoneTwin",
        position: { x: 500, y: 12 },
        data: {
          c1,
          c2,
          c3,
          statusText: status.text,
          statusStyle: status.style,
          isSwap,
        },
      },
      {
        id: "waterSample",
        type: "waterSample",
        position: { x: 860, y: 42 },
        data: { active: isWaterCheck },
      },

      // Bottom row: Buried underground treatment train
      {
        id: "runoff",
        type: "runoff",
        position: { x: 20, y: 266 },
        data: { isStorm, isSprayHeavy, isTreat },
      },
      {
        id: "woodchips",
        type: "woodchips",
        position: { x: 264, y: 274 },
        data: { isTreat },
      },
      {
        id: "carbon",
        type: "carbon",
        position: { x: 476, y: 228 },
        data: { c1, c2, c3, c1R, c2R, c3R, isSwap, isTreat },
      },
      {
        id: "cleanWater",
        type: "cleanWater",
        position: { x: 860, y: 274 },
        data: { isTreat },
      },
    ],
    [
      farmerMessage,
      isSwap,
      c1,
      c2,
      c3,
      c1R,
      c2R,
      c3R,
      status.text,
      status.style,
      isWaterCheck,
      isStorm,
      isSprayHeavy,
      isTreat,
    ],
  );

  const edges: Edge[] = useMemo(
    () => [
      // Main underground pesticide -> clean water path
      {
        id: "e-runoff-woodchips",
        source: "runoff",
        sourceHandle: "treat-out",
        target: "woodchips",
        animated: isTreat,
        label: isTreat ? "Pesticide" : undefined,
        labelStyle: { fill: "#6d28d9", fontSize: 11, fontWeight: 700 },
        labelBgStyle: { fill: "#fafaf9", fillOpacity: 0.9 },
        style: {
          stroke: isTreat ? "#7e22ce" : "#d6d3d1",
          strokeWidth: isTreat ? (isSprayHeavy ? 3.2 : 2.4) : 1.5,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isTreat ? "#7e22ce" : "#d6d3d1",
        },
      },
      {
        id: "e-woodchips-carbon",
        source: "woodchips",
        target: "carbon",
        animated: isTreat,
        style: {
          stroke: isTreat ? "#7e22ce" : "#d6d3d1",
          strokeWidth: isTreat ? 2.4 : 1.5,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isTreat ? "#7e22ce" : "#d6d3d1",
        },
      },
      {
        id: "e-carbon-clean",
        source: "carbon",
        sourceHandle: "clean-out",
        target: "cleanWater",
        targetHandle: "clean-in",
        animated: isTreat,
        label: isTreat ? "Clean water" : undefined,
        labelStyle: { fill: "#0369a1", fontSize: 11, fontWeight: 700 },
        labelBgStyle: { fill: "#fafaf9", fillOpacity: 0.9 },
        style: {
          stroke: isTreat ? "#0284c7" : "#d6d3d1",
          strokeWidth: isTreat ? 2.6 : 1.5,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isTreat ? "#0284c7" : "#d6d3d1",
        },
      },

      // Off-season bypass path along the bottom
      {
        id: "e-bypass",
        type: "smoothstep",
        source: "runoff",
        sourceHandle: "bypass-out",
        target: "cleanWater",
        targetHandle: "bypass-in",
        animated: !isTreat,
        label: !isTreat ? "Off-season bypass (filters resting)" : undefined,
        labelStyle: { fill: "#b45309", fontSize: 11, fontWeight: 700 },
        labelBgStyle: { fill: "#fef3c7" },
        style: {
          stroke: !isTreat ? "#d97706" : "#d6d3d1",
          strokeWidth: !isTreat ? 3 : 1.2,
          strokeDasharray: isTreat ? "6 6" : undefined,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: !isTreat ? "#d97706" : "#d6d3d1",
        },
      },

      // Buried sensors -> Phone Digital Twin
      {
        id: "e-sensors-twin",
        source: "carbon",
        sourceHandle: "sensors-out",
        target: "phoneTwin",
        targetHandle: "from-sensors",
        animated: true,
        label: "Sensors",
        labelStyle: { fill: "#6d28d9", fontSize: 11, fontWeight: 700 },
        labelBgStyle: { fill: "#fafaf9", fillOpacity: 0.9 },
        style: { stroke: "#6d28d9", strokeWidth: 2 },
        markerEnd: { type: MarkerType.ArrowClosed, color: "#6d28d9" },
      },

      // Phone Digital Twin -> Farmer alert
      {
        id: "e-twin-farmer",
        source: "phoneTwin",
        sourceHandle: "to-farmer",
        target: "farmer",
        animated: isSwap,
        label: isSwap ? "Swap alert" : "Status",
        labelStyle: {
          fill: isSwap ? "#b91c1c" : "#57534e",
          fontSize: 11,
          fontWeight: 700,
        },
        labelBgStyle: { fill: "#fafaf9", fillOpacity: 0.9 },
        style: {
          stroke: isSwap ? "#dc2626" : "#78716c",
          strokeWidth: isSwap ? 2.4 : 1.6,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isSwap ? "#dc2626" : "#78716c",
        },
      },

      // Clean Water -> Weekly Water Sample -> Phone Digital Twin
      {
        id: "e-clean-sample",
        source: "cleanWater",
        sourceHandle: "sample-out",
        target: "waterSample",
        targetHandle: "from-clean",
        animated: isWaterCheck,
        style: {
          stroke: isWaterCheck ? "#d97706" : "#a8a29e",
          strokeWidth: isWaterCheck ? 2.4 : 1.3,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isWaterCheck ? "#d97706" : "#a8a29e",
        },
      },
      {
        id: "e-sample-twin",
        source: "waterSample",
        sourceHandle: "to-twin",
        target: "phoneTwin",
        targetHandle: "from-sample",
        animated: isWaterCheck,
        label: isWaterCheck ? "Synced!" : "Weekly check",
        labelStyle: {
          fill: isWaterCheck ? "#b45309" : "#78716c",
          fontSize: 11,
          fontWeight: 700,
        },
        labelBgStyle: { fill: "#fafaf9", fillOpacity: 0.9 },
        style: {
          stroke: isWaterCheck ? "#d97706" : "#a8a29e",
          strokeWidth: isWaterCheck ? 2.4 : 1.3,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isWaterCheck ? "#d97706" : "#a8a29e",
        },
      },
    ],
    [isTreat, isSprayHeavy, isSwap, isWaterCheck],
  );

  return (
    <div className="flex min-h-screen flex-col justify-between bg-[#f8f7f3] px-4 pt-5 pb-12 text-stone-900 sm:px-8 sm:pt-6 sm:pb-8">
      {/* Crisp Editorial Header */}
      <header className="mx-auto flex w-full max-w-6xl flex-wrap items-end justify-between gap-3 border-b border-stone-300 pb-3">
        <div>
          <div className="flex flex-wrap items-baseline gap-2.5">
            <span className="font-mono text-xs font-bold tracking-widest text-purple-800 uppercase">
              NEPHRON
            </span>
            <span className="text-stone-300">/</span>
            <h1 className="text-lg font-bold tracking-tight text-stone-900 sm:text-xl">
              A Seasonal Field Kidney for Atrazine in Tile Drainage
            </h1>
          </div>
          <p className="mt-0.5 text-xs text-stone-500">
            Nitrate-Eliminating Pesticide-Holding Reactor for On-farm Networks
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <span className="border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-medium text-stone-600">
            Synthetic data: demonstration only
          </span>
          <button
            onClick={() => setPaused((v) => !v)}
            className="border border-stone-900 bg-stone-900 px-3 py-1 text-xs font-semibold text-white transition hover:bg-stone-700"
          >
            {paused ? "Play" : "Pause"}
          </button>
        </div>
      </header>

      {/* REACT FLOW CANVAS */}
      <div className="mx-auto my-4 h-[64vh] min-h-[420px] w-full max-w-6xl overflow-hidden rounded-lg border border-stone-300 bg-[#fafaf9]">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.16 }}
          nodesConnectable={false}
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1.2}
            color="#d6d3d1"
          />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>

      {/* CLEAN BOTTOM TIMELINE & HEADLINE */}
      <footer className="mx-auto w-full max-w-6xl space-y-3">
        <div className="grid grid-cols-7 gap-1.5">
          {MONTHS.map((m, idx) => {
            const active = idx === activeMonth;
            return (
              <button
                key={m}
                onClick={() => setProgress(idx / (MONTHS.length - 1))}
                className={`border py-1.5 text-center font-mono text-xs font-bold transition ${
                  active
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-300 bg-white text-stone-600 hover:border-stone-500"
                }`}
              >
                {m}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border border-stone-300 bg-white px-4 py-2.5 text-xs text-stone-700">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              <strong className="font-mono text-sm text-purple-800">
                {sim.twinPct}%
              </strong>{" "}
              pesticide caught with Digital Twin
            </span>
            <span className="text-stone-400">vs.</span>
            <span>
              <strong className="font-mono text-sm text-stone-700">
                {sim.fixedPct}%
              </strong>{" "}
              swapping once a year
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[11px] text-stone-500">
            <span>
              Color bar = Phone Twin &middot; Dashed line = Real buried filter
            </span>
            <Link
              href="/charts"
              className="font-semibold text-stone-900 underline-offset-2 hover:underline"
            >
              Graphs
            </Link>
            <Link
              href="/whatif"
              className="font-semibold text-stone-900 underline-offset-2 hover:underline"
            >
              Compare
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
