<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` are off: the simulation engine indexes fixed-length 96-step/24-hour arrays everywhere, and the checks added noise without catching real bugs.
- Frontend-only demo simulation stays in `src/lib/engine.ts`; actual FastAPI contracts, validation and schedule adaptation live in `src/lib/peakfive-api.ts`, with tests beside each module, so local simulation is never a backend fallback.
- All schedule-driven UI reads through `SimProvider`; the Hamilton guided demonstration uses the actual shared provider and existing backend controls so its schedules, challenges and carbon results remain synchronized with the dashboard. Legacy frontend-only simulations remain separately provided and never substitute for API results.
- The API client calls FastAPI directly from browser actions without credentials; Vite configuration supplies the production service address and the session-only address control can override it, so no Cloud proxy is required.
- IESO CSV parsing lives in `src/lib/ieso.ts` and is shared by the server fetch (`ieso.functions.ts`) and browser uploads, so both paths apply identical validation.
- Carbon accounting is isolated in carbon modules and a CarbonProvider within the actual SimProvider; Climatiq runs through a Cloud server function with validated schedule-derived energy and a bounded per-worker cache/budget, so secrets stay server-side and demo schedules never become actual carbon inputs.
- Presentation sustainability content reads the outer actual SimProvider through a provider-bound wrapper, so the nested frontend simulation cannot replace the reported carbon schedule.
- Shared Hamilton presentation components contain public context and transparency labels; synthetic system summaries read current SimProvider inputs rather than duplicating defaults, so scenario edits cannot leave stale engineering labels.
- Published Hamilton measurements live in a source-cited static data module; the /hamilton route is a read-only verified-data view, while existing routes retain engineering simulation and schedule state, preventing municipal totals from becoming optimizer inputs.
- Operational JSON imports are validated entirely in the browser and retained only for that view session; they are never fed to SimProvider, FastAPI or carbon accounting because file provenance alone does not establish sufficient real engineering inputs.
