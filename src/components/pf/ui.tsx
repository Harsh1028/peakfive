import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

const btn = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-ring",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:brightness-110 glow",
        ghost: "bg-secondary text-foreground hover:bg-accent border border-border",
        success: "bg-success text-success-foreground hover:brightness-110",
        danger: "bg-destructive/15 text-destructive border border-destructive/40 hover:bg-destructive/25",
        warn: "bg-warning/15 text-warning border border-warning/40 hover:bg-warning/25",
        active: "bg-primary/15 text-primary border border-primary/50",
      },
      size: { sm: "h-8 px-3", md: "h-10 px-4", lg: "h-12 px-6 text-base", icon: "h-9 w-9" },
    },
    defaultVariants: { variant: "ghost", size: "md" },
  },
);

export function Btn({ className, variant, size, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof btn>) {
  return <button className={cn(btn({ variant, size }), className)} {...p} />;
}

export function Panel({ title, sub, right, children, className }: { title?: ReactNode; sub?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("panel p-5", className)}>
      {(title || right) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="text-base font-semibold">{title}</h2>}
            {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
          </div>
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

const tag = cva("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium", {
  variants: {
    tone: {
      ok: "border-success/40 bg-success/10 text-success",
      warn: "border-warning/40 bg-warning/10 text-warning",
      bad: "border-destructive/40 bg-destructive/10 text-destructive",
      info: "border-primary/40 bg-primary/10 text-primary",
      muted: "border-border bg-secondary text-muted-foreground",
    },
  },
  defaultVariants: { tone: "muted" },
});
export function Tag({ tone, children, className }: VariantProps<typeof tag> & { children: ReactNode; className?: string }) {
  return <span className={cn(tag({ tone }), className)}>{children}</span>;
}

export function PageHeader({ title, sub, right }: { title: string; sub: string; right?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold md:text-3xl">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{sub}</p>
      </div>
      {right}
    </div>
  );
}

export function NumField({ label, value, onChange, min, max, step = 1, unit }: { label: string; value: number; onChange: (n: number) => void; min?: number; max?: number; step?: number; unit?: string }) {
  return (
    <label className="block text-xs text-muted-foreground">
      {label}
      <div className="mt-1 flex items-center gap-2">
        <input type="number" className="field num w-full" value={value} min={min} max={max} step={step}
          onChange={(e) => onChange(Number(e.target.value))} />
        {unit && <span className="text-xs">{unit}</span>}
      </div>
    </label>
  );
}
