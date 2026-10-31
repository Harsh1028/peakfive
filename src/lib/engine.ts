// PEAKFIVE scheduling engine: synthetic water system, rule-based baseline,
// exact discrete dynamic-programming optimizer and an independent validator.

export const STEPS = 96;
export const DT_H = 0.25;
export const CAPACITY = 420;
export const STARTUP_PENALTY = 0.8;
export const PEAK_PENALTY = 6.5;
export const GRID_WEIGHT = 0.35;

export const PUMPS = [
  { id: 1, name: "High-Lift Pump 01", flow: 60, kw: 54, perStep: 15 },
  { id: 2, name: "High-Lift Pump 02", flow: 40, kw: 36, perStep: 10 },
] as const;

export type Combo = 0 | 1 | 2 | 3; // bit0 = pump 1, bit1 = pump 2
export const COMBOS: Combo[] = [0, 1, 2, 3];

export interface Config {
  initial: number;
  minReserve: number;
  finalTarget: number;
  peakStart: number; // hour, inclusive
  peakEnd: number; // hour, exclusive
  pump1: boolean;
  pump2: boolean;
  freeze: boolean; // no flexibility: optimizer must keep baseline pump states
}

export const DEFAULT_CONFIG: Config = {
  initial: 245,
  minReserve: 95,
  finalTarget: 220,
  peakStart: 15,
  peakEnd: 19,
  pump1: true,
  pump2: true,
  freeze: false,
};

export const ILLUSTRATIVE_HOURLY = [
  13650, 13320, 13160, 13230, 13640, 14300, 15290, 16550, 17450, 18400, 19720, 20750, 22230, 23200,
  24270, 24790, 25200, 24720, 23590, 22120, 20660, 19020, 17230, 15500,
];

export const comboFlow = (c: number) => (c & 1 ? 15 : 0) + (c & 2 ? 10 : 0);
export const comboKw = (c: number) => (c & 1 ? 54 : 0) + (c & 2 ? 36 : 0);
const startups = (prev: number, c: number) => ((c & 1) && !(prev & 1) ? 1 : 0) + ((c & 2) && !(prev & 2) ? 1 : 0);

export function waterDemand(): number[] {
  const out: number[] = [];
  for (let i = 0; i < STEPS; i++) {
    const h = i / 4;
    let d = h < 5 ? 7 : h < 7 ? 10 : h < 10 ? 14 : h < 15 ? 11 : h < 20 ? 15 : h < 22 ? 12 : 8;
    if (i % 7 === 0) d += 1;
    out.push(d);
  }
  return out;
}
export const DEMAND = waterDemand();

export const inPeak = (step: number, cfg: Pick<Config, "peakStart" | "peakEnd">) => {
  const h = step / 4;
  return h >= cfg.peakStart && h < cfg.peakEnd;
};

export function gridFactors(hourly: number[]): number[] {
  const min = Math.min(...hourly);
  const max = Math.max(...hourly);
  return hourly.map((v) => (max === min ? 0 : (v - min) / (max - min)));
}

export function stepWeights(hourly: number[], cfg: Config): number[] {
  const gf = gridFactors(hourly);
  return Array.from({ length: STEPS }, (_, t) => 1 + GRID_WEIGHT * gf[Math.floor(t / 4)] + (inPeak(t, cfg) ? PEAK_PENALTY : 0));
}

const allowedCombos = (cfg: Config): Combo[] =>
  COMBOS.filter((c) => (cfg.pump1 || !(c & 1)) && (cfg.pump2 || !(c & 2)));

export interface Evaluation {
  levels: number[]; // 97 values, level at the start of each step + end of day
  kw: number[];
  pumped: number[];
  dailyKwh: number;
  peakKwh: number;
  startups: number;
  finalLevel: number;
  objective: number;
}

export function evaluate(combos: Combo[], cfg: Config, hourly: number[]): Evaluation {
  const w = stepWeights(hourly, cfg);
  const levels = [cfg.initial];
  const kw: number[] = [];
  const pumped: number[] = [];
  let dailyKwh = 0, peakKwh = 0, st = 0, objective = 0, prev = 0;
  combos.forEach((c, t) => {
    const k = comboKw(c);
    kw.push(k);
    pumped.push(comboFlow(c));
    levels.push(levels[t] + comboFlow(c) - DEMAND[t]);
    const e = k * DT_H;
    dailyKwh += e;
    if (inPeak(t, cfg)) peakKwh += e;
    const s = startups(prev, c);
    st += s;
    objective += e * w[t] + STARTUP_PENALTY * s;
    prev = c;
  });
  return { levels, kw, pumped, dailyKwh, peakKwh, startups: st, finalLevel: levels[STEPS], objective };
}

export interface Check { name: string; pass: boolean; detail: string }
export interface Validation { pass: boolean; checks: Check[] }

const fmtT = (t: number) => `${String(Math.floor(t / 4)).padStart(2, "0")}:${String((t % 4) * 15).padStart(2, "0")}`;
export const stepLabel = fmtT;

/** Independent checker: recomputes the reservoir trajectory from scratch. */
export function validate(combos: Combo[], cfg: Config, opts: { frozen?: Combo[]; minFinal?: number } = {}): Validation {
  const checks: Check[] = [];
  const demand = waterDemand();
  let s = cfg.initial, lowest = s, highest = s, lowAt = -1, highAt = -1, pumpedTotal = 0;
  let badPump = -1, badFrozen = -1;
  if (combos.length !== STEPS) checks.push({ name: "Schedule length", pass: false, detail: `${combos.length} of ${STEPS} steps` });
  for (let t = 0; t < combos.length; t++) {
    const c = combos[t];
    const f = (c & 1 ? PUMPS[0].perStep : 0) + (c & 2 ? PUMPS[1].perStep : 0);
    pumpedTotal += f;
    s = s + f - demand[t];
    if (s < lowest) { lowest = s; lowAt = t; }
    if (s > highest) { highest = s; highAt = t; }
    if (badPump < 0 && ((c & 1 && !cfg.pump1) || (c & 2 && !cfg.pump2))) badPump = t;
    if (badFrozen < 0 && opts.frozen && opts.frozen[t] !== c) badFrozen = t;
  }
  const demandTotal = demand.reduce((a, b) => a + b, 0);
  const finalReq = Math.max(cfg.finalTarget, opts.minFinal ?? 0);
  checks.push({ name: "Water demand served", pass: lowest >= 0, detail: `${demandTotal} m³ delivered across 96 intervals` });
  checks.push({ name: "Minimum reserve", pass: lowest >= cfg.minReserve, detail: `lowest ${lowest} m³${lowAt >= 0 ? ` at ${fmtT(lowAt + 1)}` : ""} (limit ${cfg.minReserve} m³)` });
  checks.push({ name: "Tank capacity", pass: highest <= CAPACITY, detail: `highest ${highest} m³${highAt >= 0 ? ` at ${fmtT(highAt + 1)}` : ""} (limit ${CAPACITY} m³)` });
  checks.push({ name: "End-of-day storage", pass: s >= finalReq, detail: `${s} m³ (required ≥ ${finalReq} m³)` });
  checks.push({ name: "Pump availability", pass: badPump < 0, detail: badPump < 0 ? "no unavailable pump operated" : `unavailable pump runs at ${fmtT(badPump)}` });
  checks.push({ name: "Mass balance", pass: cfg.initial + pumpedTotal - demandTotal === s, detail: `${cfg.initial} + ${pumpedTotal} − ${demandTotal} = ${s} m³` });
  if (opts.frozen) checks.push({ name: "Frozen pump states", pass: badFrozen < 0, detail: badFrozen < 0 ? "matches frozen baseline" : `differs at ${fmtT(badFrozen)}` });
  return { pass: checks.every((c) => c.pass), checks };
}

/** Rule-based controller with storage bands and pump hysteresis. */
export function baselineSchedule(cfg: Config): Combo[] {
  const out: Combo[] = [];
  let s = cfg.initial;
  let p1 = false, p2 = false;
  for (let t = 0; t < STEPS; t++) {
    if (s <= 240) p1 = true;
    if (s >= 350) p1 = false;
    if (s <= 180) p2 = true;
    if (s >= 290) p2 = false;
    if (t >= 80 && s < cfg.finalTarget + 40) p1 = true; // evening top-up
    if (!cfg.pump1) p1 = false;
    if (!cfg.pump2) p2 = false;
    let c = ((p1 ? 1 : 0) | (p2 ? 2 : 0)) as Combo;
    if (s + comboFlow(c) - DEMAND[t] > CAPACITY && c & 2) { p2 = false; c = (c & 1) as Combo; }
    if (s + comboFlow(c) - DEMAND[t] > CAPACITY && c & 1) { p1 = false; c = (c & 2) as Combo; }
    out.push(c);
    s = s + comboFlow(c) - DEMAND[t];
  }
  return out;
}

export interface OptResult {
  feasible: boolean;
  combos?: Combo[];
  reason?: string;
  requiredFinal: number;
}

/** Explains why no feasible schedule exists, using the max-pumping trajectory. */
export function diagnose(cfg: Config, requiredFinal: number): string {
  const allowed = allowedCombos(cfg);
  const maxFlow = Math.max(...allowed.map(comboFlow));
  const names = [!cfg.pump1 && "Pump 1", !cfg.pump2 && "Pump 2"].filter(Boolean).join(" and ");
  const ctx = names ? ` with ${names} unavailable` : "";
  if (cfg.initial < cfg.minReserve) return `Initial storage (${cfg.initial} m³) is already below the minimum reserve (${cfg.minReserve} m³).`;
  if (cfg.initial > CAPACITY) return `Initial storage exceeds tank capacity (${CAPACITY} m³).`;
  if (requiredFinal > CAPACITY) return `End-of-day target (${requiredFinal} m³) exceeds tank capacity.`;
  const demandTotal = DEMAND.reduce((a, b) => a + b, 0);
  const need = demandTotal + requiredFinal - cfg.initial;
  if (maxFlow * STEPS < need)
    return `No feasible pumping schedule can satisfy the required daily water demand (${demandTotal} m³) and end-of-day reservoir target (${requiredFinal} m³)${ctx}: available pumps can deliver at most ${maxFlow * STEPS} m³, but ${need} m³ is needed.`;
  let s = cfg.initial;
  for (let t = 0; t < STEPS; t++) {
    let best = -Infinity;
    for (const c of allowed) { const n = s + comboFlow(c) - DEMAND[t]; if (n <= CAPACITY && n > best) best = n; }
    if (best === -Infinity) return `Reservoir would overflow at ${fmtT(t)} even with all pumps off.`;
    s = best;
    if (s < cfg.minReserve) return `Even with every available pump running${ctx}, the reservoir falls below the ${cfg.minReserve} m³ reserve at ${fmtT(t + 1)}.`;
  }
  if (cfg.freeze) return "The frozen baseline schedule does not satisfy the current constraints, and the optimizer is not allowed to change any pump state.";
  return `No pump sequence keeps storage between ${cfg.minReserve} and ${CAPACITY} m³ while ending at ≥ ${requiredFinal} m³${ctx}.`;
}

/** Exact DP over (integer storage, previous pump combo) for 96 steps. */
export function optimize(cfg: Config, hourly: number[], opts: { frozen?: Combo[]; minFinal?: number } = {}): OptResult {
  const requiredFinal = Math.max(cfg.finalTarget, opts.minFinal ?? 0);
  if (cfg.initial < cfg.minReserve || cfg.initial > CAPACITY || requiredFinal > CAPACITY)
    return { feasible: false, reason: diagnose(cfg, requiredFinal), requiredFinal };
  const w = stepWeights(hourly, cfg);
  const allowed = allowedCombos(cfg);
  const S = CAPACITY + 1;
  const INF = Number.POSITIVE_INFINITY;
  let cur = new Float64Array(S * 4).fill(INF);
  cur[cfg.initial * 4] = 0;
  const parents: Int32Array[] = [];
  for (let t = 0; t < STEPS; t++) {
    const next = new Float64Array(S * 4).fill(INF);
    const par = new Int32Array(S * 4).fill(-1);
    const options = opts.frozen ? allowed.filter((c) => c === opts.frozen![t]) : allowed;
    for (let s = 0; s < S; s++) {
      for (let pc = 0; pc < 4; pc++) {
        const v = cur[s * 4 + pc];
        if (v === INF) continue;
        for (const c of options) {
          const ns = s + comboFlow(c) - DEMAND[t];
          if (ns < cfg.minReserve || ns > CAPACITY) continue;
          const cost = v + comboKw(c) * DT_H * w[t] + STARTUP_PENALTY * startups(pc, c);
          const idx = ns * 4 + c;
          if (cost < next[idx] - 1e-9) { next[idx] = cost; par[idx] = s * 4 + pc; }
        }
      }
    }
    parents.push(par);
    cur = next;
  }
  let best = -1, bestCost = INF;
  for (let s = requiredFinal; s < S; s++)
    for (let c = 0; c < 4; c++) if (cur[s * 4 + c] < bestCost - 1e-9) { bestCost = cur[s * 4 + c]; best = s * 4 + c; }
  if (best < 0) return { feasible: false, reason: diagnose(cfg, requiredFinal), requiredFinal };
  const combos: Combo[] = new Array(STEPS);
  let idx = best;
  for (let t = STEPS - 1; t >= 0; t--) { combos[t] = (idx % 4) as Combo; idx = parents[t][idx]; }
  return { feasible: true, combos, requiredFinal };
}

/** Builds a plain-language explanation from actual hourly energy differences. */
export function explainDifferences(base: Evaluation, opt: Evaluation, cfg: Config): string[] {
  const hourly = (e: Evaluation) => Array.from({ length: 24 }, (_, h) => e.kw.slice(h * 4, h * 4 + 4).reduce((a, b) => a + b, 0) * DT_H);
  const b = hourly(base), o = hourly(opt);
  const ranges = (pred: (h: number) => boolean) => {
    const out: [number, number][] = [];
    for (let h = 0; h < 24; h++) if (pred(h)) { if (out.length && out[out.length - 1][1] === h) out[out.length - 1][1] = h + 1; else out.push([h, h + 1]); }
    return out.map(([a, z]) => `${String(a).padStart(2, "0")}:00–${String(z).padStart(2, "0")}:00`);
  };
  const lines: string[] = [];
  const pw = `${String(cfg.peakStart).padStart(2, "0")}:00–${String(cfg.peakEnd).padStart(2, "0")}:00`;
  if (opt.peakKwh < base.peakKwh) lines.push(`Pumping inside the risk window (${pw}) was cut from ${base.peakKwh.toFixed(1)} kWh to ${opt.peakKwh.toFixed(1)} kWh.`);
  else if (opt.peakKwh === base.peakKwh) lines.push(`Risk-window pumping is unchanged at ${opt.peakKwh.toFixed(1)} kWh — the constraints leave no room to shift it.`);
  else lines.push(`Risk-window pumping rose from ${base.peakKwh.toFixed(1)} to ${opt.peakKwh.toFixed(1)} kWh.`);
  const added = ranges((h) => o[h] > b[h]);
  const removed = ranges((h) => o[h] < b[h] && !(h >= cfg.peakStart && h < cfg.peakEnd));
  if (added.length) lines.push(`Extra pumping was scheduled during ${added.join(", ")}.`);
  if (removed.length) lines.push(`Pumping was reduced during ${removed.join(", ")}.`);
  const pre = opt.levels[cfg.peakStart * 4], preB = base.levels[cfg.peakStart * 4];
  if (pre !== preB) lines.push(`The reservoir enters the window at ${pre} m³ (baseline ${preB} m³), so stored water covers demand while pumps rest.`);
  lines.push(`Daily energy: ${base.dailyKwh.toFixed(1)} → ${opt.dailyKwh.toFixed(1)} kWh. Pump startups: ${base.startups} → ${opt.startups}.`);
  return lines;
}
