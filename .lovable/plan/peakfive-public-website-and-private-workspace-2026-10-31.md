# PEAKFIVE public website and private workspace

## 1. Preserve the working application
- Reuse the existing dashboard, charts, animations, digital twin, Hamilton evidence, IESO integration, FastAPI `/health`, `/optimize` and `/compare`, and Climatiq accounting.
- Keep the existing workspace’s navy, cyan and emerald styling and shared schedule state. Do not replace Python calculations or change API contracts.
- Separate public demonstration state from private saved account data; clear private caches and account-specific state on sign-out or account changes.

## 2. Public website
- Replace `/` with a professional homepage using the supplied headline and subtitle, sticky navigation, **Get Started Free** and **Try Live Demo**.
- Use a relevant water-infrastructure image with a restrained animated water/electricity treatment consistent with PEAKFIVE. Preserve the existing fonts and tokens.
- Add the challenge, four-step workflow, technology, sourced Hamilton context, engineering review and team sections.
- Create public `/how-it-works`, `/technology`, `/about`, `/contact`, `/privacy` and `/terms` pages; retain `/hamilton` and `/methodology` for case-study evidence and documentation. Every content page has its own metadata.
- Show three clearly labelled team placeholders, not invented names or biographies. Contact information remains explicitly unprovided; legal pages are clearly marked draft and not reviewed.
- Keep professional public branding without introducing hackathon/university affiliation claims.

## 3. Real accounts
- Use the existing Lovable Cloud authentication service and the confirmed user-profile requirement.
- Add `/signup`, `/login`, `/forgot-password` and `/reset-password`, plus a public callback and `/auth` entry compatible with the managed protected-route gate.
- Implement full name, email, password confirmation, password visibility, strength guidance, legal acknowledgement, loading and secure error states.
- Enable email/password authentication with verification required, provider-managed session persistence, secure current-password changes and supported password protections. Configure production and preview return URLs.
- Enable managed Google sign-in and Sign in with Lovable. Handle app acknowledgement after social authentication without pretending OAuth recorded consent before account creation.
- Show “check your email” after signup until verified; return signed-in users to `/dashboard` or a validated same-origin intended workspace page.
- Password recovery uses real expiring provider links, neutral email confirmations and an explicit new-password page. Never store passwords in browser storage.

## 4. Private workspace and account settings
- `/dashboard` preserves the current Overview Dashboard and adds “Welcome back, [First Name]”.
- Add a session-driven avatar menu with My Profile, My Scenarios, Account Settings and Log Out.
- `/settings` supports display-name edits, verified email changes, secure password changes, account creation/verification information and sign-out. Do not add notification preferences until notifications exist.
- Add a confirmed account-deletion **request**, with a secure confirmation step and private request status. Do not promise immediate automated deletion or an invented retention policy; legal review and operational handling remain prerequisites.
- Protect private workspace pages through the managed authenticated layout. Private server actions independently verify identity and use owner-scoped database access.
- Sign-out cancels pending private reads, clears cached data, ends the session and replaces navigation with the public sign-in page.

## 5. Saved scenarios
- `/scenarios` becomes **My Scenarios** for signed-in users, while preserving the existing simulator at `/simulator` and in the guest demonstration.
- Save, name, describe, list, reopen, duplicate and delete each user’s own configurations in Lovable Cloud.
- Persist complete current inputs: date, peak window, pumps, tank, essential load, 96 demand intervals, emergency events and selected supported settings. Do not save an arbitrary backend address.
- Reopening restores inputs and clears results; rerunning invokes the real backend. No solver output is manufactured.
- Initially save inputs only: the API currently does not return a model-version identifier, so do not claim reproducible versioned saved results. Existing live results remain available normally.
- Create owner-only profiles, scenarios and deletion-request storage with explicit grants, Row Level Security and independently tested ownership policies. No anonymous access to private records.

## 6. Public interactive demonstration
- `/demo` stays available without an account and displays **PEAKFIVE Interactive Demonstration** with the exact supplied simulation/source disclosure.
- Provide the existing live dashboard, guided Hamilton demonstration, twin, 96-slot schedules, comparison, constraint editing, pump-outage tests and Climatiq estimates.
- Preserve existing public engineering URLs where appropriate (`/grid`, `/twin`, `/optimizer`, `/financial`, `/carbon`, `/business`, `/methodology`, `/hamilton`), with guest-aware navigation. They contain no private account data; `/dashboard`, `/settings` and `/scenarios` remain private.
- Keep Render’s existing concurrent-solve limits, as selected. No custom proxy or app-side rate limit will be added. Login does not protect direct calls to the public Render service; stronger service-side limits remain a deployment prerequisite.

## Technical implementation
- Keep the TanStack router and existing bearer-token middleware; use the integration-managed authenticated layout and server-authenticated functions for private storage.
- Extract reusable existing overview and simulator views rather than duplicating their logic. Public marketing/auth pages do not render the engineering sidebar or initiate optimization/carbon requests.
- Scope profile/scenario queries by authenticated identity and clear them on identity transitions. Avoid loading private data in public page loaders.
- Create profile rows through a tested signup trigger; keep roles out of profiles and do not add an unnecessary role system.
- Validate saved inputs through the existing API validation module before saving and loading.

## Verification and release boundaries
- Run existing regressions plus concrete tests for password/input validation, private scenario ownership, restoration without fabricated results, redirects, sign-out cleanup and guest/private separation.
- Test actual account creation, verification, login/refresh/logout, recovery, profile/settings and scenario save/reopen/duplicate/delete wherever provider delivery and available sessions allow. Report every untested email-link step explicitly.
- Verify anonymous `/demo` with real Render optimization/comparison, outage infeasibility, playback, Hamilton/IESO sources and a genuine Climatiq response.
- Check desktop, tablet and phone layouts and keyboard-accessible navigation. Run available security checks; do not claim certification or a full security audit.
- Do not publish automatically. Published behavior and email return links require a separately authorized release and post-release checks. Team details, contact information, legal review, stronger Render abuse controls and deletion-request handling remain clearly identified external prerequisites.