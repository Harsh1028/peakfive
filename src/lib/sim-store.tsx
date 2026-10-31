import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  baselineSchedule,
  DEFAULT_CONFIG,
  DEMAND,
  PUMPS,
  evaluate,
  ILLUSTRATIVE_HOURLY,
  optimize,
  validate,
  type Combo,
  type Config,
  type Evaluation,
  type Validation,
} from "./engine";
import { fetchIesoDay } from "./ieso.functions";
import { extractDay } from "./ieso";
import {
  checkHealth,
  configuredApiUrl,
  DEFAULT_SYSTEM,
  demandWithEvents,
  optimizeRemote,
  scheduleToPlan,
  type System,
  type OptimizeResponse,
  type PeakfiveEvent,
} from "./peakfive-api";

export type DataSource = "IESO" | "UPLOAD" | "ILLUSTRATIVE";
export interface Dataset {
  date: string;
  hourly: number[];
  source: DataSource;
}
export interface Plan {
  combos: Combo[];
  eval: Evaluation;
  validation: Validation;
}
export interface OptState {
  feasible: boolean;
  plan?: Plan;
  reason?: string;
  ranAt: number;
}
export type Status =
  | "Baseline"
  | "Optimized"
  | "Infeasible"
  | "Awaiting Data"
  | "Awaiting Schedule"
  | "Feasible · not proven optimal"
  | "Feasibility unknown"
  | "Invalid input"
  | "Error";

const ILLUSTRATIVE: Dataset = {
  date: "2026-07-14",
  hourly: ILLUSTRATIVE_HOURLY,
  source: "ILLUSTRATIVE",
};
const LS_KEY = "peakfive.settings.v1";

interface Store {
  mode: "backend" | "demo";
  apiUrl: string;
  setApiUrl: (url: string) => void;
  connection: "Connected" | "Disconnected" | "Optimizing";
  connectionError: string | null;
  checkConnection: () => Promise<void>;
  system: System;
  setSystem: (system: System) => void;
  events: PeakfiveEvent[];
  setEvents: (events: PeakfiveEvent[]) => void;
  backendResult: OptimizeResponse | null;
  demand: number[];
  capacity: number;
  pumps: { id: string; name: string; flow: number; kw: number; available: boolean }[];
  hasSchedule: boolean;
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

export function SimProvider({
  children,
  initialMode = "backend",
}: {
  children: ReactNode;
  initialMode?: "backend" | "demo";
}) {
  const mode = initialMode;
  const [apiUrl, setApiUrlState] = useState(configuredApiUrl);
  const [connection, setConnection] = useState<Store["connection"]>("Disconnected");
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [system, setSystemState] = useState<System>(DEFAULT_SYSTEM);
  const [events, setEventsState] = useState<PeakfiveEvent[]>([]);
  const [backendResult, setBackendResult] = useState<OptimizeResponse | null>(null);
  const busy = useRef(false);
  const revision = useRef(0);
  const [date, setDate] = useState("2026-07-14");
  const [official, setOfficial] = useState<Dataset | null>(null);
  const [useOfficial, setUseOfficial] = useState(true);
  const [loading, setLoading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [draft, setDraftState] = useState<Config>(DEFAULT_CONFIG);
  const [demoConfig, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [peakWindow, setPeakWindow] = useState({ peakStart: 16, peakEnd: 20 });
  const config: Config =
    mode === "demo"
      ? demoConfig
      : {
          initial: system.tank.initial_m3,
          minReserve: system.tank.min_operating_m3 + system.tank.fire_reserve_m3,
          finalTarget: system.tank.initial_m3,
          ...peakWindow,
          pump1: system.pumps[0]?.available ?? false,
          pump2: system.pumps[1]?.available ?? false,
          freeze: false,
        };
  const [opt, setOpt] = useState<OptState | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [view, setView] = useState<"baseline" | "optimized">("baseline");
  const [step, setStepState] = useState(64);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);

  const dataset = useOfficial && official ? official : { ...ILLUSTRATIVE, date };
  const hourly = dataset.hourly;
  const baseline = useMemo(() => makeBaseline(demoConfig, hourly), [demoConfig, hourly]);

  // persist settings locally
  useEffect(() => {
    if (mode !== "demo") return;
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.config) {
          setDraftState({ ...DEFAULT_CONFIG, ...s.config });
          setConfig({ ...DEFAULT_CONFIG, ...s.config });
        }
        if (s.date) setDate(s.date);
      }
    } catch {
      /* ignore */
    }
  }, [mode]);
  useEffect(() => {
    if (mode !== "demo") return;
    localStorage.setItem(LS_KEY, JSON.stringify({ config, date }));
  }, [config, date]);

  const resetOpt = () => {
    revision.current++;
    setOpt(null);
    setBackendResult(null);
    setView("baseline");
    setPlaying(false);
  };
  const setApiUrl = (url: string) => {
    setApiUrlState(url);
    setConnection("Disconnected");
    setConnectionError(null);
    resetOpt();
  };
  const setSystem = (value: System) => {
    setSystemState(value);
    resetOpt();
  };
  const setEvents = (value: PeakfiveEvent[]) => {
    setEventsState(value);
    resetOpt();
  };
  const checkConnection = useCallback(async () => {
    try {
      await checkHealth(apiUrl);
      setConnection("Connected");
      setConnectionError(null);
    } catch (e) {
      setConnection("Disconnected");
      setConnectionError(e instanceof Error ? e.message : "Backend disconnected");
    }
  }, [apiUrl]);
  useEffect(() => {
    if (mode === "backend" && apiUrl) void checkConnection();
  }, [mode, apiUrl, checkConnection]);

  const loadIeso = useCallback(
    async (d?: string) => {
      const target = d ?? date;
      setLoading(true);
      setDataError(null);
      try {
        const r = await fetchIesoDay({ data: { date: target } });
        if (r.ok) {
          setOfficial({ date: target, hourly: r.hourly, source: "IESO" });
          setUseOfficial(true);
          resetOpt();
        } else setDataError(r.error);
      } catch (e) {
        setDataError(e instanceof Error ? e.message : "Request failed");
      } finally {
        setLoading(false);
      }
    },
    [date],
  );

  const uploadCsv = useCallback(async (file: File, d: string) => {
    setDataError(null);
    const r = extractDay(await file.text(), d);
    if (r.ok) {
      setOfficial({ date: d, hourly: r.hourly, source: "UPLOAD" });
      setUseOfficial(true);
      setDate(d);
      resetOpt();
    } else setDataError(`Upload rejected: ${r.error}`);
  }, []);

  const firstLoad = useRef(false);
  useEffect(() => {
    if (!firstLoad.current) {
      firstLoad.current = true;
      void loadIeso("2026-07-14");
    }
  }, [loadIeso]);

  const recalculate = useCallback(
    (cfg?: Config) => {
      if (mode === "backend") {
        if (cfg) {
          setPeakWindow({ peakStart: cfg.peakStart, peakEnd: cfg.peakEnd });
          setSystemState((s) => ({
            ...s,
            pumps: s.pumps.map((p, i) => ({ ...p, available: i === 0 ? cfg.pump1 : cfg.pump2 })),
          }));
        }
        resetOpt();
        return;
      }
      const c = cfg ?? draft;
      setDraftState(c);
      setConfig(c);
      resetOpt();
    },
    [draft],
  );

  const runOptimize = useCallback(
    async (cfg?: Config) => {
      if (mode === "backend") {
        if (busy.current)
          return {
            feasible: false,
            reason: "An optimization is already running.",
            ranAt: Date.now(),
          };
        busy.current = true;
        const requestedSystem = cfg
          ? {
              ...system,
              pumps: system.pumps.map((p, i) => ({
                ...p,
                available: i === 0 ? cfg.pump1 : cfg.pump2,
              })),
            }
          : system;
        const peak = cfg ? { peakStart: cfg.peakStart, peakEnd: cfg.peakEnd } : peakWindow;
        setSystemState(requestedSystem);
        setPeakWindow(peak);
        resetOpt();
        const ticket = revision.current;
        const request = {
          date,
          peak_window: { start_slot: peak.peakStart * 4, end_slot: peak.peakEnd * 4 },
          system: requestedSystem,
          events,
        };
        setOptimizing(true);
        setConnection("Optimizing");
        setConnectionError(null);
        let state: OptState;
        try {
          const result = await optimizeRemote(apiUrl, request);
          const feasible = result.status === "optimal" || result.status === "feasible_timeout";
          const plan = feasible ? scheduleToPlan(result, request) : undefined;
          state = { feasible, plan, reason: result.explanation, ranAt: Date.now() };
          if (ticket === revision.current) {
            setBackendResult(result);
            setOpt(state);
            setView(feasible ? "optimized" : "baseline");
          }
          setConnection("Connected");
        } catch (e) {
          const reason = e instanceof Error ? e.message : "Backend request failed";
          state = { feasible: false, reason, ranAt: Date.now() };
          if (ticket === revision.current) {
            setOpt(state);
            setBackendResult({
              status: "error",
              schedule: [],
              coincident_kw_before: null,
              coincident_kw_after: null,
              explanation: reason,
            });
          }
          setConnection("Disconnected");
          setConnectionError(reason);
        } finally {
          busy.current = false;
          setOptimizing(false);
        }
        return state;
      }
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
          : {
              feasible: false,
              plan,
              reason: "The proposed schedule failed independent validation.",
              ranAt: Date.now(),
            };
      } else state = { feasible: false, reason: r.reason, ranAt: Date.now() };
      setOpt(state);
      setView(state.feasible ? "optimized" : "baseline");
      setOptimizing(false);
      return state;
    },
    [draft, hourly, mode, system, peakWindow, date, events, apiUrl],
  );

  // dataset change invalidates any optimized plan
  const prevHourly = useRef(hourly);
  useEffect(() => {
    if (prevHourly.current !== hourly) {
      prevHourly.current = hourly;
      resetOpt();
    }
  }, [hourly]);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(
      () => setStepState((s) => (s >= 95 ? (setPlaying(false), 95) : s + 1)),
      1000 / speed,
    );
    return () => clearInterval(id);
  }, [playing, speed]);

  const status: Status =
    mode === "backend"
      ? backendResult
        ? (
            {
              optimal: "Optimized",
              feasible_timeout: "Feasible · not proven optimal",
              infeasible: "Infeasible",
              timeout_no_solution: "Feasibility unknown",
              invalid_input: "Invalid input",
              error: "Error",
            } as const
          )[backendResult.status]
        : "Awaiting Schedule"
      : !hourly?.length
        ? "Awaiting Data"
        : opt
          ? opt.feasible
            ? "Optimized"
            : "Infeasible"
          : baseline.validation.pass
            ? "Baseline"
            : "Infeasible";
  const empty: Plan = {
    combos: Array(96).fill(0),
    eval: {
      levels: Array(97).fill(system.tank.initial_m3),
      kw: Array(96).fill(0),
      pumped: Array(96).fill(0),
      dailyKwh: 0,
      peakKwh: 0,
      startups: 0,
      finalLevel: system.tank.initial_m3,
      objective: 0,
    },
    validation: { pass: true, checks: [] },
  };
  const active =
    mode === "backend"
      ? opt?.feasible && opt.plan
        ? opt.plan
        : empty
      : view === "optimized" && opt?.feasible && opt.plan
        ? opt.plan
        : baseline;
  const requestForDemand = {
    date,
    peak_window: { start_slot: config.peakStart * 4, end_slot: config.peakEnd * 4 },
    system,
    events,
  };
  const demand =
    mode === "backend"
      ? demandWithEvents(requestForDemand)
      : baseline.combos.map((_, t) => DEMAND[t]);

  const value: Store = {
    mode,
    apiUrl,
    setApiUrl,
    connection,
    connectionError,
    checkConnection,
    system,
    setSystem,
    events,
    setEvents,
    backendResult,
    demand,
    capacity: mode === "backend" ? system.tank.capacity_m3 : 420,
    pumps:
      mode === "backend"
        ? system.pumps.map((p) => ({
            id: p.id,
            name: p.id,
            flow: p.flow_m3h,
            kw: p.kw,
            available: p.available,
          }))
        : PUMPS.map((p, i) => ({
            ...p,
            id: String(p.id),
            available: i === 0 ? config.pump1 : config.pump2,
          })),
    hasSchedule: mode === "demo" || !!opt?.feasible,
    date,
    setDate: (d) => {
      setDate(d);
      resetOpt();
    },
    official,
    useOfficial,
    setUseOfficial,
    dataset,
    loading,
    dataError,
    loadIeso,
    uploadCsv,
    draft,
    setDraft: (u) => {
      if (mode === "backend") {
        if (u.peakStart !== undefined || u.peakEnd !== undefined) {
          setPeakWindow((p) => ({ ...p, ...u }));
          resetOpt();
        }
      } else setDraftState((d) => ({ ...d, ...u }));
    },
    config,
    baseline,
    opt,
    optimizing,
    recalculate,
    runOptimize,
    status,
    view,
    setView,
    active,
    step,
    setStep: (n) => setStepState(Math.max(0, Math.min(95, n))),
    playing,
    setPlaying,
    speed,
    setSpeed,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSim() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useSim outside SimProvider");
  return s;
}
