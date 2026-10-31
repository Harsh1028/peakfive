import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useSim } from "./sim-store";
import { calculateCarbon } from "./carbon.functions";
import {
  DEFAULT_CARBON_OPTIONS,
  scheduleEnergy,
  type CarbonOptions,
  type CarbonReply,
} from "./carbon";

function useCarbonState() {
  const s = useSim();
  const call = useServerFn(calculateCarbon);
  const [options, setOptions] = useState<CarbonOptions>(DEFAULT_CARBON_OPTIONS);
  const [state, setState] = useState<{ key: string; reply: CarbonReply } | null>(null);
  const [retry, setRetry] = useState(0);
  const input = useMemo(() => {
    if (s.mode !== "backend" || !s.hasSchedule || !s.opt?.plan?.validation.pass || !s.backendResult)
      return null;
    return {
      result: s.backendResult,
      request: {
        date: s.date,
        system: s.system,
        events: s.events,
        peak_window: { start_slot: s.config.peakStart * 4, end_slot: s.config.peakEnd * 4 },
      },
      options,
    };
  }, [
    s.mode,
    s.hasSchedule,
    s.opt,
    s.backendResult,
    s.date,
    s.system,
    s.events,
    s.config.peakStart,
    s.config.peakEnd,
    options,
  ]);
  const key = input ? JSON.stringify(input) : "";
  useEffect(() => {
    if (!input) return;
    let stale = false;
    const timer = setTimeout(() => {
      call({ data: input })
        .then((reply) => {
          if (!stale) setState({ key, reply });
        })
        .catch(() => {
          if (!stale)
            setState({
              key,
              reply: {
                ok: false,
                error: "Carbon calculation unavailable. Pump scheduling remains functional.",
              },
            });
        });
    }, 400);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [key, retry]);
  const reply = state?.key === key ? state.reply : null;
  const energy = input ? scheduleEnergy(input.result, input.request, options) : null;
  return {
    options,
    setOptions,
    reply,
    energy,
    loading: !!input && !reply,
    hasSchedule: !!input,
    refresh: () => {
      setState(null);
      setRetry((n) => n + 1);
    },
  };
}
const CarbonContext = createContext<ReturnType<typeof useCarbonState> | null>(null);
export function CarbonProvider({ children }: { children: ReactNode }) {
  const value = useCarbonState();
  return <CarbonContext.Provider value={value}>{children}</CarbonContext.Provider>;
}
export function useCarbon() {
  const value = useContext(CarbonContext);
  if (!value) throw new Error("CarbonProvider missing");
  return value;
}
