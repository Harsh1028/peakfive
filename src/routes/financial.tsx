import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { seo } from "@/lib/seo";
import { DT_H, inPeak } from "@/lib/engine";
import { useSim } from "@/lib/sim-store";
import { NumField, PageHeader, Panel, Tag } from "@/components/pf/ui";

export const Route = createFileRoute("/financial")({
  head: () =>
    seo(
      "Financial Analysis",
      "Hypothetical business case, tariff-based schedule cost comparison and an optional ICI allocation calculator.",
    ),
  component: Financial,
});

const cad = (n: number) =>
  n.toLocaleString("en-CA", { style: "currency", currency: "CAD", maximumFractionDigits: 0 });

function Financial() {
  const { baseline, opt, config, mode, backendResult } = useSim();
  const [spend, setSpend] = useState(500000);
  const [rate, setRate] = useState(8);
  const [sub, setSub] = useState(15000);
  const gross = (spend * rate) / 100,
    net = gross - sub;

  const [offPeak, setOffPeak] = useState<string>("");
  const [onPeak, setOnPeak] = useState<string>("");
  const o = opt?.feasible ? opt.plan : undefined;
  const tariffOk = offPeak !== "" && onPeak !== "" && Number(offPeak) >= 0 && Number(onPeak) >= 0;
  const cost = (kw: number[]) =>
    kw.reduce(
      (a, k, t) => a + k * DT_H * (inPeak(t, config) ? Number(onPeak) : Number(offPeak)),
      0,
    );

  const [peakDemandBase, setPDB] = useState(0);
  const [peakDemandOpt, setPDO] = useState(0);
  const [denom, setDenom] = useState(0);
  const [pool, setPool] = useState(0);
  const pdfB = denom > 0 ? peakDemandBase / denom : 0,
    pdfO = denom > 0 ? peakDemandOpt / denom : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Financial Analysis"
        sub="Financial modelling is kept separate from the physical scheduling results."
      />
      <Panel title="A · Illustrative business case" right={<Tag tone="warn">Hypothetical</Tag>}>
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4">
            <NumField
              label="Annual pumping electricity expenditure"
              unit="CAD"
              value={spend}
              min={0}
              step={10000}
              onChange={setSpend}
            />
            <label className="block text-xs text-muted-foreground">
              Assumed annual bill saving: <span className="num text-foreground">{rate}%</span>
              <input
                type="range"
                min={0}
                max={20}
                step={0.5}
                value={rate}
                onChange={(e) => setRate(Number(e.target.value))}
                className="mt-2 w-full"
              />
            </label>
            <NumField
              label="PEAKFIVE annual subscription"
              unit="CAD"
              value={sub}
              min={0}
              step={1000}
              onChange={setSub}
            />
            <div className="num grid grid-cols-3 gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Gross savings</div>
                <div className="text-xl text-success">{cad(gross)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Subscription</div>
                <div className="text-xl">{cad(sub)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Net benefit</div>
                <div className={`text-xl ${net >= 0 ? "text-primary" : "text-destructive"}`}>
                  {cad(net)}
                </div>
              </div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={[
                { n: "Gross savings", v: gross },
                { n: "Subscription", v: sub },
                { n: "Net benefit", v: net },
              ]}
            >
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="n" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis
                stroke="var(--muted-foreground)"
                fontSize={11}
                tickFormatter={(v) => `$${v / 1000}k`}
              />
              <Tooltip
                formatter={(v: number) => cad(v)}
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)" }}
              />
              <Bar dataKey="v" fill="var(--primary)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-xs text-warning">
          Hypothetical customer scenario. Not a measured PEAKFIVE saving or verified tariff
          forecast.
        </p>
      </Panel>

      {mode === "backend" ? (
        <Panel
          title="B · Backend peak demand"
          sub="No financial savings estimate: the backend provides no independent baseline or tariff."
        >
          <div className="num text-2xl">
            {backendResult?.coincident_kw_after?.toFixed(1) ?? "—"} kW
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Optimized maximum site demand inside the selected peak window.
          </p>
        </Panel>
      ) : (
        <>
          <Panel
            title="B · Scheduling analysis"
            sub="Bill difference from your entered tariff and the two pump-load profiles. Ontario MW demand is never used as a price."
          >
            <div className="grid gap-4 md:grid-cols-4">
              <label className="text-xs text-muted-foreground">
                Price outside window (CAD/kWh)
                <input
                  className="field num mt-1 w-full"
                  type="number"
                  step="0.001"
                  value={offPeak}
                  onChange={(e) => setOffPeak(e.target.value)}
                  placeholder="e.g. 0.10"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                Price inside window (CAD/kWh)
                <input
                  className="field num mt-1 w-full"
                  type="number"
                  step="0.001"
                  value={onPeak}
                  onChange={(e) => setOnPeak(e.target.value)}
                  placeholder="e.g. 0.20"
                />
              </label>
              <div className="num">
                <div className="text-xs text-muted-foreground">Baseline kWh/day</div>
                <div className="text-lg">{baseline.eval.dailyKwh.toFixed(1)}</div>
              </div>
              <div className="num">
                <div className="text-xs text-muted-foreground">Optimized kWh/day</div>
                <div className="text-lg">{o ? o.eval.dailyKwh.toFixed(1) : "—"}</div>
              </div>
            </div>
            <div className="mt-4">
              {!tariffOk ? (
                <p className="text-sm text-warning">
                  Financial estimate unavailable — enter an applicable tariff.
                </p>
              ) : !o ? (
                <p className="text-sm text-muted-foreground">
                  Baseline daily cost {cad(cost(baseline.eval.kw))}. Run the optimizer to compare.
                </p>
              ) : (
                (() => {
                  const b = cost(baseline.eval.kw),
                    c = cost(o.eval.kw);
                  return (
                    <div className="num grid grid-cols-3 gap-3">
                      <div>
                        <div className="text-xs text-muted-foreground">Baseline / day</div>
                        <div className="text-lg">${b.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Optimized / day</div>
                        <div className="text-lg">${c.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Difference / day</div>
                        <div
                          className={`text-lg ${b - c >= 0 ? "text-success" : "text-destructive"}`}
                        >
                          ${(b - c).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </Panel>
        </>
      )}

      <Panel
        title="C · ICI scenario (advanced, optional)"
        right={<Tag tone="muted">Enter validated parameters</Tag>}
      >
        <p className="mb-4 max-w-3xl text-sm text-muted-foreground">
          Class A Global Adjustment allocation depends on participation, eligibility and
          contribution during Ontario’s actual five coincident peak hours. PEAKFIVE does not assume
          a municipality qualifies, and the risk window above is not the five actual annual peaks.
        </p>
        <div className="grid gap-3 md:grid-cols-4">
          <NumField
            label="Avg customer demand in top-5 hours (baseline)"
            unit="MW"
            step={0.01}
            value={peakDemandBase}
            onChange={setPDB}
          />
          <NumField
            label="Avg customer demand in top-5 hours (with PEAKFIVE)"
            unit="MW"
            step={0.01}
            value={peakDemandOpt}
            onChange={setPDO}
          />
          <NumField
            label="Ontario system demand in top-5 hours"
            unit="MW"
            value={denom}
            onChange={setDenom}
          />
          <NumField
            label="Annual GA cost pool"
            unit="CAD"
            step={1000000}
            value={pool}
            onChange={setPool}
          />
        </div>
        {denom > 0 && pool > 0 ? (
          <div className="num mt-4 grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">Peak demand factor</div>
              <div>
                {pdfB.toExponential(3)} → {pdfO.toExponential(3)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">GA allocation</div>
              <div>
                {cad(pdfB * pool)} → {cad(pdfO * pool)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Illustrative change</div>
              <div className="text-success">{cad((pdfB - pdfO) * pool)}</div>
            </div>
          </div>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            Enter the system denominator and GA cost pool from IESO sources to calculate.
          </p>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Sources for inputs: IESO Peak Tracker and IESO Global Adjustment publications. All values
          are user-entered.
        </p>
      </Panel>
    </div>
  );
}
