import { Link, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Briefcase,
  Cpu,
  Database,
  FlaskConical,
  LayoutDashboard,
  Leaf,
  Menu,
  Radio,
  Waves,
  Wallet,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { useSim } from "@/lib/sim-store";
import { cn } from "@/lib/utils";
import { SourceBadge } from "./panels";
import { Tag } from "./ui";
import { BackendConnection } from "./backend-controls";
import { useAuth } from "@/lib/auth-store";
import { AccountMenu } from "@/components/site/account-menu";

const NAV = [
  { to: "/demo", label: "Interactive Demonstration", icon: LayoutDashboard },
  { to: "/hamilton", label: "Verified Hamilton Water Data", icon: Database },
  { to: "/grid", label: "Grid Intelligence", icon: Radio },
  { to: "/twin", label: "Water System Digital Twin", icon: Waves },
  { to: "/optimizer", label: "Schedule Optimizer", icon: Cpu },
  { to: "/financial", label: "Financial Analysis", icon: Wallet },
  { to: "/carbon", label: "Carbon Intelligence", icon: Leaf },
  { to: "/simulator", label: "Scenario Simulator", icon: FlaskConical },
  { to: "/business", label: "Business Model", icon: Briefcase },
  { to: "/methodology", label: "Data Sources & Methodology", icon: Database },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);
  const { dataset } = useSim();
  const auth = useAuth();
  const verifiedView = path === "/hamilton";
  return (
    <div className="flex min-h-screen">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 border-r border-sidebar-border bg-sidebar p-4 transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="mb-8 flex items-center justify-between px-2 pt-2">
          <div>
            <div className="flex items-center gap-2 font-display text-xl font-bold tracking-tight">
              <BarChart3 className="h-5 w-5 text-primary" />
              PEAK<span className="text-primary">FIVE</span>
            </div>
            <div className="mt-0.5 text-[11px] italic text-muted-foreground">
              Intelligent Infrastructure Optimization
            </div>
          </div>
          <button className="lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="space-y-1">
          <Link to="/" className="block px-3 py-2 text-sm text-muted-foreground">← Public website</Link>
          {auth.user && <><Link to="/dashboard" className="block px-3 py-2 text-sm text-primary">My Dashboard</Link><Link to="/scenarios" className="block px-3 py-2 text-sm text-muted-foreground">My Scenarios</Link></>}
          {NAV.map((n) => {
            const on = path === n.to;
            return (
              <Link
                key={n.to}
                to={n.to}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                  on
                    ? "bg-sidebar-accent text-primary"
                    : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
                )}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <p className="absolute bottom-4 left-4 right-4 text-[10px] leading-relaxed text-muted-foreground">
          Decision support only. Never connected to SCADA, PLCs or real pump hardware.
        </p>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-border bg-background/80 px-4 py-3 backdrop-blur md:px-8">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <AccountMenu />
            {verifiedView ? (
              <>
                <Tag tone="ok">Verified Public Data</Tag>
                <Tag tone="muted">Woodward · reporting year 2025</Tag>
              </>
            ) : (
              <>
                <Tag tone="muted">
                  <span className="num">{dataset.date}</span>
                </Tag>
                <SourceBadge />
                <Tag tone="info">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot" />
                  Engineering Simulation
                </Tag>
                <BackendConnection />
              </>
            )}
          </div>
        </header>
        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
