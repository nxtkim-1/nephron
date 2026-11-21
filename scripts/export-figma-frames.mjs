import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Generates 4 identically-structured, cleanly named SVG frames (1200x675, 16:9)
// designed to drag straight onto a Figma canvas and link with Smart Animate.

const OUT_DIR = join(process.cwd(), "figma");
mkdirSync(OUT_DIR, { recursive: true });

const FRAMES = [
  {
    file: "01-april-startup.svg",
    month: "APRIL · START-UP",
    stepIdx: 0,
    isTreat: true,
    isStorm: false,
    isSwap: false,
    isLab: false,
    c1: 0.14,
    c1Real: 0.16,
    c2: 0.06,
    c2Real: 0.07,
    c3: 0.02,
    c3Real: 0.02,
    phoneText: "All Clean",
    phoneBg: "#dcfce7",
    phoneFg: "#15803d",
    personText: "System ready for spring",
    pesticideCount: 2,
    caption: "Gate set to Cleaning. Fresh carbon filters ready before spring spraying.",
  },
  {
    file: "02-may-spray-storm.svg",
    month: "MAY · SPRAY SEASON",
    stepIdx: 1,
    isTreat: true,
    isStorm: true,
    isSwap: false,
    isLab: true,
    c1: 0.64,
    c1Real: 0.68,
    c2: 0.28,
    c2Real: 0.31,
    c3: 0.1,
    c3Real: 0.11,
    phoneText: "Twin Synced",
    phoneBg: "#ffedd5",
    phoneFg: "#c2410c",
    personText: "Water sample synced twin",
    pesticideCount: 6,
    caption: "Rain washes purple pesticide into the drain. Carbon traps it; weekly sample keeps the phone twin accurate.",
  },
  {
    file: "03-june-swap-alert.svg",
    month: "JUNE · SWAP ALERT",
    stepIdx: 2,
    isTreat: true,
    isStorm: false,
    isSwap: true,
    isLab: false,
    c1: 0.88,
    c1Real: 0.9,
    c2: 0.52,
    c2Real: 0.54,
    c3: 0.18,
    c3Real: 0.19,
    phoneText: "Swap Filter 1",
    phoneBg: "#fee2e2",
    phoneFg: "#b91c1c",
    personText: "Time to swap Filter 1",
    pesticideCount: 4,
    caption: "Twin predicts Filter 1 is nearly full. Remove Filter 1, slide 2 → 1 and 3 → 2, add a fresh Filter 3.",
  },
  {
    file: "04-october-bypass.svg",
    month: "OCTOBER · OFF-SEASON",
    stepIdx: 3,
    isTreat: false,
    isStorm: false,
    isSwap: false,
    isLab: false,
    c1: 0.48,
    c1Real: 0.49,
    c2: 0.22,
    c2Real: 0.22,
    c3: 0.08,
    c3Real: 0.08,
    phoneText: "Winter Rest",
    phoneBg: "#fef3c7",
    phoneFg: "#b45309",
    personText: "Filters resting for winter",
    pesticideCount: 0,
    caption: "Gate pivots to Bypass for Oct–Mar so carbon cartridges stay fresh until next spring.",
  },
];

function barFill(frac) {
  if (frac >= 0.8) return "#dc2626";
  if (frac >= 0.55) return "#d97706";
  return "#16a34a";
}

function renderSvg(f) {
  const maxBarH = 104;
  const bars = [
    { name: "Filter1", x: 590, frac: f.c1, real: f.c1Real },
    { name: "Filter2", x: 676, frac: f.c2, real: f.c2Real },
    { name: "Filter3", x: 762, frac: f.c3, real: f.c3Real },
  ];

  const pesticidePositions = [
    { cx: 112, cy: 332 },
    { cx: 152, cy: 360 },
    { cx: 240, cy: 424 },
    { cx: 345, cy: 428 },
    { cx: 455, cy: 422 },
    { cx: 525, cy: 427 },
  ];

  const cleanPositions = [
    { cx: 882, cy: 425 },
    { cx: 922, cy: 425 },
    { cx: 960, cy: 425 },
  ];

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="1200" height="675" viewBox="0 0 1200 675" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g id="Frame_Background">
    <rect width="1200" height="675" fill="#F8F7F3"/>
  </g>

  <g id="Header">
    <text x="56" y="48" fill="#6D28D9" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="14" font-weight="800" letter-spacing="2">NEPHRON</text>
    <text x="150" y="48" fill="#1C1917" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="20" font-weight="700">A Seasonal Field Kidney for Atrazine in Tile Drainage</text>
    <text x="56" y="68" fill="#78716C" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="12" font-weight="500">Nitrate-Eliminating Pesticide-Holding Reactor for On-farm Networks</text>

    <rect x="896" y="28" width="248" height="28" rx="4" fill="#FFFFFF" stroke="#D6D3D1" stroke-width="1.2"/>
    <text x="1020" y="46" text-anchor="middle" fill="#57534E" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="11.5" font-weight="600">Synthetic data: demonstration only</text>
    <line x1="56" y1="84" x2="1144" y2="84" stroke="#D6D3D1" stroke-width="1.2"/>
  </g>

  <g id="Diagram_Canvas">
    <!-- Sky & Ground Cutaway -->
    <rect x="56" y="102" width="1088" height="466" rx="12" fill="#FFFFFF" stroke="#D6D3D1" stroke-width="1.5"/>
    <path d="M57 114C57 107.925 61.925 103 68 103H1132C1138.08 103 1143 107.925 1143 114V300H57V114Z" fill="${f.isStorm ? "#E6EEF5" : "#F1F6FA"}"/>
    <path d="M57 300H1143V556C1143 562.075 1138.08 567 1132 567H68C61.925 567 57 562.075 57 556V300Z" fill="#ECE3D5"/>
    <path d="M57 412Q380 400 720 414T1143 408V556C1143 562.075 1138.08 567 1132 567H68C61.925 567 57 562.075 57 556V412Z" fill="#E1D4C0"/>

    <!-- Turf Surface -->
    <rect x="57" y="294" width="1086" height="8" fill="${f.isTreat ? "#4D8B55" : "#A18A57"}"/>
    <line x1="57" y1="294" x2="1143" y2="294" stroke="#1C1917" stroke-width="1.2"/>

    <!-- Stage Badge (Top-Left of Canvas) -->
    <g id="Season_Badge">
      <rect x="80" y="122" width="184" height="28" rx="4" fill="#1C1917"/>
      <text x="172" y="140" text-anchor="middle" fill="#FFFFFF" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="11.5" font-weight="700" letter-spacing="1">${f.month}</text>
    </g>

    <!-- Weather Icon -->
    <g id="Weather_Icon" transform="translate(104, 166)">
      ${
        f.isStorm
          ? `<path d="M18 36a18 18 0 0 1 34-6a22 22 0 0 1 40 7a14 14 0 0 1 2 27H18a13 13 0 0 1 0-28Z" fill="#CBD5E1" stroke="#475569" stroke-width="1.8"/>
      <line x1="28" y1="72" x2="23" y2="86" stroke="#0284C7" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="50" y1="72" x2="45" y2="86" stroke="#0284C7" stroke-width="2.2" stroke-linecap="round"/>
      <line x1="72" y1="72" x2="67" y2="86" stroke="#0284C7" stroke-width="2.2" stroke-linecap="round"/>`
          : `<circle cx="48" cy="36" r="16" fill="#FDE68A" stroke="#B45309" stroke-width="1.8"/>
      <line x1="48" y1="8" x2="48" y2="15" stroke="#B45309" stroke-width="2" stroke-linecap="round"/>
      <line x1="48" y1="57" x2="48" y2="64" stroke="#B45309" stroke-width="2" stroke-linecap="round"/>
      <line x1="20" y1="36" x2="27" y2="36" stroke="#B45309" stroke-width="2" stroke-linecap="round"/>
      <line x1="69" y1="36" x2="76" y2="36" stroke="#B45309" stroke-width="2" stroke-linecap="round"/>
      <line x1="28" y1="16" x2="33" y2="21" stroke="#B45309" stroke-width="2" stroke-linecap="round"/>
      <line x1="63" y1="51" x2="68" y2="56" stroke="#B45309" stroke-width="2" stroke-linecap="round"/>
      <line x1="68" y1="16" x2="63" y2="21" stroke="#B45309" stroke-width="2" stroke-linecap="round"/>
      <line x1="33" y1="51" x2="28" y2="56" stroke="#B45309" stroke-width="2" stroke-linecap="round"/>`
      }
    </g>

    <!-- Field Crops -->
    <g id="Field_Crops" stroke="${f.isTreat ? "#2F7D4A" : "#A16207"}" stroke-width="2.2" stroke-linecap="round">
      ${[96, 130, 164, 198, 232]
        .map(
          (x) =>
            `<line x1="${x}" y1="294" x2="${x}" y2="262"/>
      <line x1="${x}" y1="278" x2="${x - 8}" y2="270"/>
      <line x1="${x}" y1="273" x2="${x + 8}" y2="265"/>`,
        )
        .join("\n      ")}
    </g>

    <!-- Pesticide Legend Pill -->
    <g id="Pesticide_Legend" transform="translate(80, 224)">
      <rect width="174" height="26" rx="4" fill="#FFFFFF" stroke="#D6D3D1" stroke-width="1.2"/>
      <circle cx="15" cy="13" r="5" fill="#7E22CE"/>
      <text x="27" y="17" fill="#1C1917" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="11.5" font-weight="700">Pesticide (Atrazine)</text>
    </g>

    <!-- Phone Digital Twin -->
    <g id="Phone_Digital_Twin" transform="translate(566, 118)">
      <rect width="122" height="162" rx="14" fill="#FFFFFF" stroke="#1C1917" stroke-width="2.2"/>
      <line x1="45" y1="9" x2="77" y2="9" stroke="#A8A29E" stroke-width="2.5" stroke-linecap="round"/>
      <text x="61" y="29" text-anchor="middle" fill="#6D28D9" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="10" font-weight="800" letter-spacing="0.8">DIGITAL TWIN</text>
      ${bars
        .map((b, idx) => {
          const ph = Math.max(5, Math.round(b.frac * 62));
          return `<g id="Phone_${b.name}" transform="translate(${20 + idx * 30}, 40)">
        <rect width="22" height="66" rx="3" fill="#F5F5F4" stroke="#D6D3D1" stroke-width="1"/>
        <rect x="2" y="${64 - ph}" width="18" height="${ph}" rx="2" fill="${barFill(b.frac)}"/>
      </g>`;
        })
        .join("\n      ")}
      <rect x="12" y="118" width="98" height="28" rx="5" fill="${f.phoneBg}"/>
      <text x="61" y="136" text-anchor="middle" fill="${f.phoneFg}" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="11.5" font-weight="800">${f.phoneText}</text>
    </g>

    <!-- Wi-Fi Waves from Buried Filters to Phone -->
    <g id="Sensor_Wifi" transform="translate(627, 286)" stroke="#6D28D9" stroke-width="2.2" fill="none" stroke-linecap="round">
      <path d="M-16 0A22 22 0 0 1 16 0"/>
      <path d="M-9 7A12 12 0 0 1 9 7"/>
      <circle cx="0" cy="14" r="2.6" fill="#6D28D9" stroke="none"/>
    </g>

    <!-- Neutral Modern Individual (No Stereotypes) -->
    <g id="Person_Operator" transform="translate(742, 134)">
      <path d="M72 8H246Q252 8 252 14V40Q252 46 246 46H82L68 55L74 46H72Q66 46 66 40V14Q66 8 72 8Z" fill="#FFFFFF" stroke="#1C1917" stroke-width="1.4"/>
      <text x="159" y="31" text-anchor="middle" fill="#1C1917" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="12.5" font-weight="700">${f.personText}</text>

      <circle cx="34" cy="54" r="20" fill="#FFFFFF" stroke="#1C1917" stroke-width="1.8"/>
      <circle cx="27" cy="51" r="2.2" fill="#1C1917"/>
      <circle cx="41" cy="51" r="2.2" fill="#1C1917"/>
      <path d="M26 60Q34 67 42 60" stroke="#1C1917" stroke-width="2" stroke-linecap="round"/>
      <path d="M8 134Q10 84 34 84Q58 84 60 134Z" fill="#E7E5E4" stroke="#1C1917" stroke-width="1.8"/>
      <path d="M24 85L34 100L44 85" stroke="#1C1917" stroke-width="1.5"/>
      <text x="34" y="152" text-anchor="middle" fill="#57534E" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="11.5" font-weight="700">Farmer</text>
    </g>

    <!-- Weekly Water Sample Tag -->
    <g id="Water_Sample" transform="translate(972, 232)" opacity="${f.isLab ? "1" : "0.6"}">
      <rect width="146" height="46" rx="6" fill="#FFFFFF" stroke="${f.isLab ? "#D97706" : "#A8A29E"}" stroke-width="${f.isLab ? "2" : "1.2"}"/>
      <g transform="translate(14, 10)" stroke="#44403C" stroke-width="1.7" stroke-linejoin="round">
        <rect x="4" y="0" width="8" height="4" rx="1"/>
        <path d="M4 4L1 10V23A2 2 0 0 0 3 25H13A2 2 0 0 0 15 23V10L12 4Z"/>
        <line x1="2" y1="16" x2="14" y2="16" stroke="#0284C7" stroke-width="2"/>
      </g>
      <text x="40" y="20" fill="#1C1917" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="11.5" font-weight="700">Water Sample</text>
      <text x="40" y="36" fill="${f.isLab ? "#B45309" : "#78716C"}" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="10.5" font-weight="600">${f.isLab ? "Twin updated" : "Checks twin"}</text>
    </g>

    <!-- Underground Pipes -->
    <g id="Pipes">
      <line x1="88" y1="425" x2="1112" y2="425" stroke="#57534E" stroke-width="26" stroke-linecap="round"/>
      <line x1="92" y1="425" x2="1108" y2="425" stroke="#E7E5E4" stroke-width="20" stroke-linecap="round"/>
      <line x1="94" y1="425" x2="554" y2="425" stroke="${f.isTreat ? "#DDD6FE" : "#E5E7EB"}" stroke-width="16"/>
      <line x1="868" y1="425" x2="1106" y2="425" stroke="${f.isTreat ? "#BAE6FD" : "#E5E7EB"}" stroke-width="16"/>

      <!-- Bypass Pipe -->
      <path d="M306 446V530Q306 540 318 540H898Q910 540 910 530V446" stroke="${f.isTreat ? "#A8A29E" : "#D97706"}" stroke-width="${f.isTreat ? "8" : "14"}" stroke-linecap="round" ${f.isTreat ? 'stroke-dasharray="6 6"' : ""} opacity="${f.isTreat ? "0.55" : "0.95"}"/>
      ${
        !f.isTreat
          ? `<text x="608" y="528" text-anchor="middle" fill="#92400E" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="12" font-weight="800" letter-spacing="0.8">OFF-SEASON BYPASS OPEN · FILTERS RESTING</text>`
          : ""
      }
    </g>

    <!-- Pesticide Dots (Trapped before Clean Water!) -->
    <g id="Pesticide_Dots">
      ${pesticidePositions
        .slice(0, f.pesticideCount)
        .map((pt, i) => `<circle id="Pesticide_${i + 1}" cx="${pt.cx}" cy="${pt.cy}" r="5.5" fill="#7E22CE"/>`)
        .join("\n      ")}
    </g>

    <!-- Clean Blue Water Dots -->
    <g id="Clean_Water_Dots">
      ${cleanPositions
        .map(
          (pt, i) =>
            `<circle id="CleanDot_${i + 1}" cx="${pt.cx}" cy="${pt.cy}" r="5" fill="${f.isTreat ? "#0284C7" : "#D97706"}"/>`,
        )
        .join("\n      ")}
    </g>

    <!-- Stage 1: Farm Runoff -->
    <g id="Stage_1_Runoff" transform="translate(90, 352)">
      <rect width="166" height="146" rx="10" fill="#FFFFFF" stroke="#1C1917" stroke-width="1.6"/>
      <path d="M83 22C83 22 62 50 62 66A21 21 0 0 0 104 66C104 50 83 22 83 22Z" fill="#E0E7FF" stroke="#4338CA" stroke-width="1.6"/>
      <circle cx="76" cy="63" r="4" fill="#7E22CE"/>
      <circle cx="90" cy="69" r="3.5" fill="#7E22CE"/>
      <circle cx="84" cy="51" r="3.5" fill="#7E22CE"/>
      <text x="83" y="114" text-anchor="middle" fill="#1C1917" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="14" font-weight="800">Farm Runoff</text>
      <text x="83" y="132" text-anchor="middle" fill="#7E22CE" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="11.5" font-weight="700">With Pesticide</text>
    </g>

    <!-- Seasonal Gate Valve -->
    <g id="Gate_Valve" transform="translate(306, 425)">
      <circle r="22" fill="#FFFFFF" stroke="#1C1917" stroke-width="1.8"/>
      <g transform="rotate(${f.isTreat ? 0 : 90})">
        <line x1="-11" y1="0" x2="10" y2="0" stroke="${f.isTreat ? "#15803D" : "#B45309"}" stroke-width="3.5" stroke-linecap="round"/>
        <polygon points="6,-6 14,0 6,6" fill="${f.isTreat ? "#15803D" : "#B45309"}"/>
      </g>
    </g>

    <!-- Stage 2: Woodchips -->
    <g id="Stage_2_Woodchips" transform="translate(356, 352)">
      <rect width="166" height="146" rx="10" fill="#FFFBEB" stroke="#1C1917" stroke-width="1.6"/>
      <g fill="#B45309" stroke="#78350F" stroke-width="0.9">
        <rect x="34" y="28" width="42" height="12" rx="4"/>
        <rect x="82" y="28" width="48" height="12" rx="4"/>
        <rect x="46" y="47" width="52" height="12" rx="4"/>
        <rect x="104" y="47" width="26" height="12" rx="4"/>
        <rect x="34" y="66" width="46" height="12" rx="4"/>
        <rect x="86" y="66" width="44" height="12" rx="4"/>
      </g>
      <text x="83" y="114" text-anchor="middle" fill="#1C1917" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="14" font-weight="800">Woodchips</text>
      <text x="83" y="132" text-anchor="middle" fill="#92400E" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="11.5" font-weight="600">Cuts Fertilizer</text>
    </g>

    <!-- Stage 3: Carbon Filters -->
    <g id="Stage_3_Carbon_Filters">
      <rect x="556" y="324" width="302" height="196" rx="12" fill="#FFFFFF" stroke="${f.isSwap ? "#DC2626" : "#6D28D9"}" stroke-width="2.4"/>
      <text x="707" y="350" text-anchor="middle" fill="#1C1917" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="14.5" font-weight="800">Carbon Filters (Traps Pesticide)</text>
      ${bars
        .map((b) => {
          const h = Math.max(6, Math.round(b.frac * maxBarH));
          const hr = Math.max(6, Math.round(b.real * maxBarH));
          return `<g id="Buried_${b.name}">
        <rect x="${b.x}" y="366" width="60" height="110" rx="6" fill="#F5F5F4" stroke="#A8A29E" stroke-width="1.4"/>
        <rect x="${b.x + 3}" y="${473 - h}" width="54" height="${h}" rx="4" fill="${barFill(b.frac)}"/>
        <line x1="${b.x - 3}" y1="${473 - hr}" x2="${b.x + 63}" y2="${473 - hr}" stroke="#1C1917" stroke-width="2.4" stroke-dasharray="4 3"/>
        <text x="${b.x + 30}" y="501" text-anchor="middle" fill="#1C1917" font-family="ui-monospace, SFMono-Regular, monospace" font-size="13" font-weight="700">${Math.round(b.frac * 100)}%</text>
      </g>`;
        })
        .join("\n      ")}
    </g>

    <!-- Stage 4: Clean Water -->
    <g id="Stage_4_Clean_Water" transform="translate(944, 352)">
      <rect width="166" height="146" rx="10" fill="#F0F9FF" stroke="#1C1917" stroke-width="1.6"/>
      <path d="M83 22C83 22 62 50 62 66A21 21 0 0 0 104 66C104 50 83 22 83 22Z" fill="#0284C7"/>
      <polyline points="73,66 80,73 93,59" stroke="#FFFFFF" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="83" y="114" text-anchor="middle" fill="#1C1917" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="14" font-weight="800">Clean Water</text>
      <text x="83" y="132" text-anchor="middle" fill="#0369A1" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="11.5" font-weight="700">Pesticide Removed</text>
    </g>
  </g>

  <!-- Footer Caption + Key -->
  <g id="Footer">
    <text x="56" y="600" fill="#1C1917" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="14" font-weight="600">${f.caption}</text>
    <text x="56" y="632" fill="#57534E" font-family="Inter, system-ui, -apple-system, sans-serif" font-size="12">Color bar = Phone Twin estimate  ·  Dashed line = Real buried filter  ·  49% pesticide caught with Twin vs. 34% swapping once a year</text>
    <g transform="translate(996, 616)">
      ${[0, 1, 2, 3]
        .map(
          (i) =>
            `<rect x="${i * 38}" y="0" width="30" height="8" rx="4" fill="${i === f.stepIdx ? "#6D28D9" : "#D6D3D1"}"/>`,
        )
        .join("\n      ")}
    </g>
  </g>
</svg>
`;
}

for (const frame of FRAMES) {
  const outPath = join(OUT_DIR, frame.file);
  writeFileSync(outPath, renderSvg(frame), "utf8");
  console.log("Wrote", outPath);
}
