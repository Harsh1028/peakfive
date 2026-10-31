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
- All schedule-driven UI reads through `SimProvider`; the guided frontend demo uses a separate provider instance so demo changes never replace actual API results.
- The API client calls the externally configured FastAPI service directly from browser actions without credentials; its base URL comes from Vite configuration or the session-only address control, so no Cloud proxy or hardcoded production endpoint is required.
- IESO CSV parsing lives in `src/lib/ieso.ts` and is shared by the server fetch (`ieso.functions.ts`) and browser uploads, so both paths apply identical validation.
- Carbon accounting is isolated in carbon modules and a CarbonProvider within the actual SimProvider; Climatiq runs through a Cloud server function with validated schedule-derived energy and a bounded per-worker cache/budget, so secrets stay server-side and demo schedules never become actual carbon inputs.
- Presentation sustainability content reads the outer actual SimProvider through a provider-bound wrapper, so the nested frontend simulation cannot replace the reported carbon schedule.
