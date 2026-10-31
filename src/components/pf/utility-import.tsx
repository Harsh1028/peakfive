import { useState } from "react";
import { Download, Trash2, Upload } from "lucide-react";
import { validateUtilityImport, METRIC_UNITS, type UtilityImport } from "@/lib/utility-import";
import { Btn, Tag } from "./ui";

export function UtilityDataImport() {
  const [data, setData] = useState<UtilityImport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [series, setSeries] = useState("");
  const keys = data
    ? [...new Set(data.records.map((r) => JSON.stringify([r.assetId, r.metric])))]
    : [];
  const selected = keys.includes(series) ? series : keys[0];
  const rows =
    data?.records.filter((r) => JSON.stringify([r.assetId, r.metric]) === selected) ?? [];
  const downloadSchema = () => {
    const example = {
      provenance: {
        source: "",
        sourceReference: "",
        providedBy: "",
        systemName: "",
        systemId: "",
        timezone: "America/Toronto",
      },
      intervalMinutes: 15,
      startTimestamp: "",
      endTimestamp: "",
      records: [{ timestamp: "", assetId: "", metric: "pump_power", unit: "kW", value: null }],
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(example, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "utility-operational-data-template.json";
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <section className="space-y-4 border-y border-border py-5">
      <div>
        <h2 className="text-lg font-semibold">Utility-provided operational data</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Optional documented measurements · read-only · session only. Imported data never changes
          the optimizer or represents an independently verified Hamilton dataset.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Btn size="sm" onClick={downloadSchema}>
          <Download className="h-4 w-4" />
          Download blank JSON template
        </Btn>
        <label className="inline-flex items-center gap-2 text-sm text-primary">
          <Upload className="h-4 w-4" />
          Import operational JSON
          <input
            aria-label="Import utility operational data"
            type="file"
            accept=".json,application/json"
            disabled={loading}
            className="max-w-full text-xs"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (!file) return;
              setLoading(true);
              setError(null);
              setData(null);
              try {
                if (file.size > 10 * 1024 * 1024) throw new Error("Maximum import size is 10 MB.");
                const validated = validateUtilityImport(JSON.parse(await file.text()));
                setData(validated);
                setSeries("");
              } catch (err) {
                setError(err instanceof Error ? err.message : "Import failed.");
              } finally {
                setLoading(false);
              }
            }}
          />
        </label>
        {data && (
          <Btn size="sm" onClick={() => setData(null)}>
            <Trash2 className="h-4 w-4" />
            Clear import
          </Btn>
        )}
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer text-primary">
          Required provenance and measurement units
        </summary>
        <p className="mt-2">
          Source, source reference, providing organization, system name and ID, IANA time zone,
          declared inclusive start/end timestamps and interval length are required. Each
          asset/measurement series must cover every declared interval, with explicit matching UTC
          offsets and no duplicates. Missing values are never estimated.
        </p>
        <ul className="mt-2 space-y-1">
          {Object.entries(METRIC_UNITS).map(([metric, units]) => (
            <li key={metric}>
              {metric}: {units.join(" or ")}
            </li>
          ))}
        </ul>
        <p className="mt-2">
          Document what reservoir levels are referenced to in the source reference. A validated file
          is not proof of authenticity or sufficient hydraulic/engineering inputs for real utility
          optimization.
        </p>
      </details>
      {loading && (
        <p className="text-sm text-muted-foreground">Validating documented measurements…</p>
      )}
      {error && (
        <p role="alert" className="whitespace-pre-wrap break-words text-sm text-destructive">
          {error}
        </p>
      )}
      {data && (
        <div className="space-y-3">
          <Tag tone="info">
            Documented utility import · validation passed · authenticity not independently verified
          </Tag>
          <dl className="grid gap-2 text-xs md:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">System</dt>
              <dd>
                {data.provenance.systemName} · {data.provenance.systemId}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Source / provider</dt>
              <dd>
                {data.provenance.source} · {data.provenance.providedBy}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Source reference</dt>
              <dd className="break-words">{data.provenance.sourceReference}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Period / time zone</dt>
              <dd>
                {data.startTimestamp} – {data.endTimestamp} · {data.provenance.timezone} ·{" "}
                {data.intervalMinutes} min
              </dd>
            </div>
          </dl>
          <label className="text-xs text-muted-foreground">
            Measurement series
            <select
              aria-label="Imported measurement series"
              className="field ml-2 max-w-full"
              value={selected}
              onChange={(e) => setSeries(e.target.value)}
            >
              {keys.map((k) => (
                <option key={k} value={k}>
                  {JSON.parse(k).join(" · ")}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-muted-foreground">
            {data.records.length.toLocaleString()} records across {keys.length} complete series.
            First 100 selected records shown, without interpolation.
          </p>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-2">Timestamp (source offset)</th>
                  <th className="p-2">Asset</th>
                  <th className="p-2">Value</th>
                  <th className="p-2">Unit</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((r) => (
                  <tr key={r.timestamp} className="border-b border-border">
                    <td className="num p-2">{r.timestamp}</td>
                    <td className="p-2">{r.assetId}</td>
                    <td className="num p-2">{r.value}</td>
                    <td className="p-2">{r.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
