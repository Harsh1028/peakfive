import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { Save, Copy, Trash2, FolderOpen, Loader2 } from "lucide-react";
import { listScenarios, saveScenario, deleteScenario } from "@/lib/account.functions";
import { useSim } from "@/lib/sim-store";
import { useAuth } from "@/lib/auth-store";
import { validateRequest, type OptimizeRequest } from "@/lib/peakfive-api";
import { Btn, PageHeader } from "@/components/pf/ui";
import { AccountAcknowledgement } from "@/components/site/account-acknowledgement";
import { seo } from "@/lib/seo";
export const Route = createFileRoute("/_authenticated/scenarios")({
  head: () => seo("My Scenarios", "Private saved PEAKFIVE engineering configurations."),
  component: Page,
});
function Page() {
  const s = useSim();
  const auth = useAuth();
  const navigate = useNavigate();
  const query = useQueryClient();
  const list = useServerFn(listScenarios);
  const save = useServerFn(saveScenario);
  const remove = useServerFn(deleteScenario);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const {
    data,
    isPending,
    error: readError,
  } = useQuery({ queryKey: ["scenarios", auth.user?.id], queryFn: () => list() });
  const perform = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      await query.invalidateQueries({ queryKey: ["scenarios"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scenario action failed");
    } finally {
      setBusy(false);
    }
  };
  const snapshot = (): OptimizeRequest =>
    validateRequest({
      date: s.date,
      system: s.system,
      events: s.events,
      peak_window: { start_slot: s.config.peakStart * 4, end_slot: s.config.peakEnd * 4 },
    });
  return (
    <div className="space-y-6">
      <PageHeader
        title="My Scenarios"
        sub="Private configurations. Reopening restores inputs—not manufactured solver results."
        right={<Btn onClick={() => navigate({ to: "/simulator" })}>Open Simulator</Btn>}
      />
      <AccountAcknowledgement />
      <form
        className="grid gap-4 border-y border-border py-6 md:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          void perform(() => save({ data: { name, description, inputs: snapshot() } }));
        }}
      >
        <label className="text-sm">
          Scenario name
          <input
            required
            maxLength={120}
            className="field mt-2 w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Description (optional)
          <input
            maxLength={2000}
            className="field mt-2 w-full"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <Btn className="self-end" variant="primary" disabled={busy}>
          <Save className="h-4 w-4" />
          Save Current Configuration
        </Btn>
      </form>
      <p className="text-xs text-muted-foreground">
        Inputs only. The service does not supply a model-version identifier, so results are not
        stored as versioned historical runs.
      </p>
      {(error || readError) && (
        <p role="alert" className="text-destructive">
          {error || "Saved scenarios could not be loaded."}
        </p>
      )}
      {isPending ? (
        <Loader2 className="animate-spin text-primary" />
      ) : !data?.length ? (
        <p className="py-10 text-muted-foreground">No saved scenarios yet.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.map((row) => (
            <article key={row.id} className="rounded-lg border border-border bg-card p-5">
              <h2 className="text-lg font-semibold">{row.name}</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {row.description || "No description"}
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                Saved {new Date(row.created_at).toLocaleString()}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Btn
                  disabled={busy}
                  onClick={() => {
                    try {
                      const input = validateRequest(row.inputs as unknown as OptimizeRequest);
                      s.restoreRequest(input);
                      void navigate({ to: "/simulator" });
                    } catch {
                      setError("This saved configuration is invalid and was not loaded.");
                    }
                  }}
                >
                  <FolderOpen className="h-4 w-4" />
                  Open
                </Btn>
                <Btn
                  size="icon"
                  title="Duplicate scenario"
                  aria-label={`Duplicate ${row.name}`}
                  disabled={busy}
                  onClick={() =>
                    void perform(() =>
                      save({
                        data: {
                          name: `${row.name.slice(0, 110)} (copy)`,
                          description: row.description,
                          inputs: validateRequest(row.inputs as unknown as OptimizeRequest),
                        },
                      }),
                    )
                  }
                >
                  <Copy className="h-4 w-4" />
                </Btn>
                <Btn
                  size="icon"
                  title="Delete scenario"
                  aria-label={`Delete ${row.name}`}
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Delete “${row.name}”?`))
                      void perform(() => remove({ data: { id: row.id } }));
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Btn>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
