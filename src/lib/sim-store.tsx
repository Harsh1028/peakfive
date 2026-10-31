import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  baselineSchedule, DEFAULT_CONFIG, evaluate, ILLUSTRATIVE_HOURLY, optimize, validate,
  type Combo, type Config, type Evaluation, type Validation,
} from "./engine";
import { fetchIesoDay } from "./ieso.functions";
import { extractDay } from "./ieso";

export type DataSource = "IESO" | "UPLOAD" | "ILLUSTRATIVE";
export interface Dataset { date: string; hourly: number[]; source: DataSource }
export interface Plan { combos: Combo[]; eval: Evaluation; validation: Validation }
export interface OptState { feasible: boolean; plan?: Plan; reason?: string; ranAt: number }
export type Status = "Baseline" | "Optimized" | "Infeasible" | "Awaiting Data";

const ILLUSTRATIVE: Dataset = { date: "2026-07-14", hourly: ILLUSTRATIVE_HOURLY, source: "ILLUSTRATIVE" };
const LS_KEY = "peakfive.settings.v1";

interface Store {
  date: string;
  setDate: (d: string) => void;
  official: Dataset | null;
  useOfficial: boolean;
  setUseOfficial: (v: boolean) => void;
  dataset: Dataset;
  loading: boolean;
  dataError: string | null;
  loadIeso: (date?: string) => Promise<void>;
  uploadCsv: (file: File, date: string) => Promise<void>;
  draft: Config;
  setDraft: (u: Partial<Config>) => void;
  config: Config;
  baseline: Plan;
  opt: OptState | null;
  optimizing: boolean;
  recalculate: (cfg?: Config) => void;
  runOptimize: (cfg?: Config) => Promise<OptState>;
  status: Status;
  view: "baseline" | "optimized";
  setView: (v: "baseline" | "optimized") => void;
  active: Plan;
  step: number;
  setStep: (n: number) => void;
  playing: boolean;
  setPlaying: (p: boolean) => void;
  speed: number;
  setSpeed: (n: number) => void;
}

const Ctx = createContext<Store | null>(null);

function makeBaseline(cfg: Config, hourly: number[]): Plan {
  const combos = baselineSchedule(cfg);
  return { combos, eval: evaluate(combos, cfg, hourly), validation: validate(combos, cfg) };
}

export function SimProvider({ children }: { children: ReactNode }) {
  const [date, setDate] = useState("2026-07-14");
  const [official, setOfficial] = useState<Dataset | null>(null);
  const [useOfficial, setUseOfficial] = useState(true);
  const [loading, setLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [draft, setDraftState] = useState<Config>(DEFAULT_CONFIG);
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [opt, setOpt] = useState<OptState | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [view, setView] = useState<"baseline" | "optimized">("baseline");
  const [step, setStepState] = useState(64);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);

  const dataset = useOfficial && official ? official : { ...ILLUSTRATIVE, date };
  const hourly = dataset.hourly;
  const baseline = useMemo(() => makeBaseline(config, hourly), [config, hourly]);

  // persist settings locally
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.config) { setDraftState({ ...DEFAULT_CONFIG, ...s.config }); setConfig({ ...DEFAULT_CONFIG, ...s.config }); }
        if (s.date) setDate(s.date);
      }
    } catch { /* ignore */ }
  }, []);
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify({ config, date }));
  }, [config, date]);

  const resetOpt = () => { setOpt(null); setView("baseline"); };

  const loadIeso = useCallback(async (d?: string) => {
    const target = d ?? date;
    setLoading(true);
    setDataError(null);
    try {
      const r = await fetchIesoDay({ data: { date: target } });
      if (r.ok) { setOfficial({ date: target, hourly: r.hourly, source: "IESO" }); setUseOfficial(true); resetOpt(); }
      else setDataError(r.error);
    } catch (e) {
      setDataError(e instanceof Error ? e.message : "Request failed");
    } finally { setLoading(false); }
  }, [date]);

  const uploadCsv = useCallback(async (file: File, d: string) => {
    setDataError(null);
    const r = extractDay(await file.text(), d);
    if (r.ok) { setOfficial({ date: d, hourly: r.hourly, source: "UPLOAD" }); setUseOfficial(true); setDate(d); resetOpt(); }
    else setDataError(`Upload rejected: ${r.error}`);
  }, []);

  const firstLoad = useRef(false);
  useEffect(() => { if (!firstLoad.current) { firstLoad.current = true; void loadIeso("2026-07-14"); } }, [loadIeso]);

  const recalculate = useCallback((cfg?: Config) => {
    const c = cfg ?? draft;
    setDraftState(c);
    setConfig(c);
    resetOpt();
  }, [draft]);

  const runOptimize = useCallback(async (cfg?: Config) => {
    const c = cfg ?? draft;
    setDraftState(c);
    setConfig(c);
    setOptimizing(true);
    await new Promise((r) => setTimeout(r, 900)); // let the progress animation show
    const base = makeBaseline(c, hourly);
    const minFinal = base.validation.pass ? base.eval.finalLevel : undefined;
    const frozen = c.freeze ? base.combos : undefined;
    const r = optimize(c, hourly, { minFinal, frozen });
    let state: OptState;
    if (r.feasible && r.combos) {
      const validation = validate(r.combos, c, { minFinal, frozen });
      const plan = { combos: r.combos, eval: evaluate(r.combos, c, hourly), validation };
      state = validation.pass
        ? { feasible: true, plan, ranAt: Date.now() }
        : { feasible: false, plan, reason: "The proposed schedule failed independent validation.", ranAt: Date.now() };
    } else state = { feasible: false, reason: r.reason, ranAt: Date.now() };
    setOpt(state);
    setView(state.feasible ? "optimized" : "baseline");
    setOptimizing(false);
    return state;
  }, [draft, hourly]);

  // dataset change invalidates any optimized plan
  const prevHourly = useRef(hourly);
  useEffect(() => { if (prevHourly.current !== hourly) { prevHourly.current = hourly; resetOpt(); } }, [hourly]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setStepState((s) => (s >= 95 ? (setPlaying(false), 95) : s + 1)), 1000 / speed);
    return () => clearInterval(id);
  }, [playing, speed]);

  const status: Status = !hourly?.length ? "Awaiting Data" : opt ? (opt.feasible ? "Optimized" : "Infeasible") : baseline.validation.pass ? "Baseline" : "Infeasible";
  const active = view === "optimized" && opt?.feasible && opt.plan ? opt.plan : baseline;

  const value: Store = {
    date, setDate, official, useOfficial, setUseOfficial, dataset, loading, dataError, loadIeso, uploadCsv,
    draft, setDraft: (u) => setDraftState((d) => ({ ...d, ...u })), config, baseline, opt, optimizing,
    recalculate, runOptimize, status, view, setView, active,
    step, setStep: (n) => setStepState(Math.max(0, Math.min(95, n))), playing, setPlaying, speed, setSpeed,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSim() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSim outside SimProvider");
  return s;
}
