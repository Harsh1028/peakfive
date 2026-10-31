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
- All simulation logic (baseline, DP optimizer, validator) lives in `src/lib/engine.ts` as pure functions with tests in `src/lib/engine.test.ts`; UI reads it only through the `SimProvider` store in `src/lib/sim-store.tsx` so every chart shares one state.
- IESO CSV parsing lives in `src/lib/ieso.ts` and is shared by the server fetch (`ieso.functions.ts`) and browser uploads, so both paths apply identical validation.
