import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import type { UIMessage } from "ai";
import type { AdvisorContext } from "./context";
const Advisor = createContext<{
  open: boolean; setOpen: (v: boolean) => void;
  context: React.RefObject<AdvisorContext>;
  prompt: { text: string; id: number } | null;
  explain: () => void;
  guestMessages: UIMessage[]; setGuestMessages: (v: UIMessage[]) => void;
} | null>(null);
export function AdvisorProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState<{ text: string; id: number } | null>(null);
  const context = useRef<AdvisorContext>({ page: "/" });
  const [guestMessages, setGuestMessages] = useState<UIMessage[]>([]);
  const explain = () => { setOpen(true); setPrompt({ text: "Explain my latest optimization: pump operating periods, reservoir storage, validated constraints, peak-window effects, and limitations. Distinguish model incentives from confirmed solver reasoning.", id: Date.now() }); };
  return <Advisor.Provider value={{ open, setOpen, context, prompt, explain, guestMessages, setGuestMessages }}>{children}</Advisor.Provider>;
}
export function useAdvisor() { const value = useContext(Advisor); if (!value) throw new Error("Advisor provider missing"); return value; }