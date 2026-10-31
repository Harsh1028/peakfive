# Deploying the PEAKFIVE API on Render

This guide puts the FastAPI backend (`api/main.py`) on Render as a public web
service that the Lovable frontend can call from the browser. The service has no
database, no secrets and no API keys.

## What is already set up in the repo

| File | Purpose |
|---|---|
| `render.yaml` | Render Blueprint: Python web service, build/start commands, health check, env vars |
| `.python-version` | Pins Python **3.9.6**, the version the 149 tests were run on |
| `requirements.txt` | Exact dependency versions that passed the tests |
| `.env.example` | Lists every optional setting (none are secrets) |
| `.gitignore` | Keeps `.venv/`, caches, `.env*`, logs, solver dumps and `.DS_Store` out of git |

**Commands Render runs:**

- **Build:** `pip install -r requirements.txt`
- **Start:** `uvicorn api.main:app --host 0.0.0.0 --port $PORT`
  - Render sets `PORT` (default `10000`), and the service has to bind `0.0.0.0`.
  - Run a single process. Don't add `--workers`, because the limit of 2 concurrent solves applies per process.
- **Health check:** `GET /health` → `{"status":"ok"}`

### The solver on Linux

PuLP installs as a pure-Python wheel that already contains the CBC solver
binaries for Linux x86_64 and arm64, so nothing extra needs installing on Render.

- **Shared libraries:** the Linux binary needs only the standard glibc libraries (`libc`, `libm`, `libstdc++`, `libgcc_s`, `libpthread`, `libdl`, `librt`). Every Linux system Render runs has these.
- **Executable bit:** it is stored in the wheel. If it is ever lost, PuLP restores it with `chmod` before running the solver.
- **Wheel availability (checked):** every pinned package has a prebuilt `manylinux` x86_64 wheel for Python 3.9, so the build compiles nothing.
- **Not yet checked:** the solver has not run on a real Linux machine (Docker isn't available on the dev Mac). The first deploy's smoke test (step 4) is that check.

## Step 1: Push the repo to GitHub

From the project root:

```bash
git status --short --ignored   # .venv/, .pytest_cache/, .DS_Store must show as "!!" (ignored)
.venv/bin/python -m pytest -q  # expect: 149 passed
git add .
git commit -m "Prepare Render deployment"
git push origin main
```

Do not commit a `.env` file. The service doesn't need one, and `.gitignore` blocks it anyway.

## Step 2: Create the service on Render

### Option A: Blueprint (recommended, uses `render.yaml`)

1. Go to <https://dashboard.render.com> → **New** → **Blueprint**.
2. Connect the GitHub repo and pick the `main` branch. Render reads `render.yaml` and proposes a web service named `peakfive-api`.
3. Render asks for values for the variables marked `sync: false`:
   - **`PEAKFIVE_CORS_ORIGINS`:** the published Lovable URL, e.g. `https://your-project.lovable.app`. If you don't know it yet, use any placeholder `https://` origin and change it later.
   - **`PEAKFIVE_CORS_ORIGIN_REGEX`:** leave it empty unless you need Lovable preview URLs (see step 3).
4. Click **Apply**. The first build takes a few minutes.

### Option B: Manual web service

**New** → **Web Service** → connect the repo, then set:

| Setting | Value |
|---|---|
| Language | Python 3 |
| Branch | `main` |
| Root Directory | *(empty)* |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn api.main:app --host 0.0.0.0 --port $PORT` |
| Health Check Path | `/health` (under Advanced) |
| Environment | `PEAKFIVE_CORS_ORIGINS` = the Lovable URL (step 3) |

### Python version

Render reads `.python-version` (`3.9.6`). If the build log says that version
isn't available:

1. Change `.python-version` to a newer release Render offers, e.g. `3.11.9`.
2. Rebuild the local venv on that version and re-run `pytest` before pushing.

All pinned packages support Python 3.9 through 3.12, but only 3.9.6 has been tested.

## Step 3: Allow the Lovable site (CORS)

Browsers block calls from the Lovable site unless its exact origin is allowed.
An origin is the scheme plus host, e.g. `https://your-project.lovable.app`, with
no path and no trailing slash.

1. **Find the exact origin:** open the Lovable site, then DevTools → **Network**, trigger a call and read the `Origin` request header. Or copy the scheme and host from the address bar.
2. **Set it on Render:** service → **Environment** → `PEAKFIVE_CORS_ORIGINS`. Separate several origins with commas:

   ```
   https://your-project.lovable.app,https://www.your-custom-domain.com
   ```

   Setting this variable **replaces** the localhost defaults. Add `http://localhost:5173` too if you also want a local Vite dev server to reach the Render backend.
3. **Preview URLs that change per build** (Lovable's editor preview, e.g. `https://id-preview--<id>.lovable.app`) can't be listed one by one. Set `PEAKFIVE_CORS_ORIGIN_REGEX` instead. It must start with `^https://` and end with `$`; anything else stops the server at startup.
   - **Narrow (one project):** `^https://(id-preview--)?your-project-id\.lovable\.app$`
   - **Broad (any Lovable-hosted site):** `^https://(id-preview--)?[a-z0-9-]+\.(lovable\.app|lovableproject\.com)$`

   The API uses no cookies or credentials, so the broad pattern only lets other Lovable sites *call* the public optimizer. It exposes no data. Prefer the narrow one.
4. **Apply:** click **Save, rebuild, and deploy**. Settings are read at startup.

`*` is rejected on purpose. If no origins are configured at all, the server
logs `no CORS origins configured` and browsers can't call it.

## Step 4: Verify the deployment

Replace the URL with the one Render shows at the top of the service page:

```bash
API=https://peakfive-api.onrender.com

curl -s $API/health
# {"status":"ok"}

.venv/bin/python -c "import json; from optimizer.model import illustrative_request as r; print(json.dumps(r()))" > /tmp/peakfive_request.json
curl -s -X POST $API/optimize -H 'Content-Type: application/json' \
  --data-binary @/tmp/peakfive_request.json | jq -c '{status, rows: (.schedule|length), coincident_kw_after}'
# {"status":"optimal","rows":96,"coincident_kw_after":...}

# CORS preflight as the browser sends it; expect your origin echoed back
curl -s -D - -o /dev/null -X OPTIONS $API/optimize \
  -H 'Origin: https://your-project.lovable.app' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type' | grep -i access-control-allow-origin
```

If `/optimize` returns `"status":"error"` with a `solver failure:` explanation,
the CBC binary failed to run on Render. Check the service **Logs** and report
the message.

Interactive API docs are also at `$API/docs`.

## Step 5: Point the frontend at Render

In the Lovable app, set the API base URL to the Render URL, e.g.
`https://peakfive-api.onrender.com`, and call `POST /optimize` exactly as
described in `docs/frontend_handoff.md`. The request and response format don't
change.

## Operating notes

- **Free plan spin-down:** a free service sleeps after about 15 minutes without traffic, and the first request afterwards can take up to a minute. Before a demo, open `/health` to wake it, or switch `plan: free` to `starter` in `render.yaml` (or in the dashboard).
- **CPU:** the illustrative request solves in about 0.4 s on a laptop. The free plan has a fraction of one CPU, so expect several seconds. The solver stops at 30 s and returns `feasible_timeout` (a verified schedule that isn't proven optimal) instead of failing. Keep the frontend's request timeout at 45 s or more.
- **Busy responses:** with 2 solves already running, extra requests get `503` with `Retry-After: 5`.
- **Deploys:** `autoDeploy: false` means pushing to GitHub does **not** redeploy. Use **Manual Deploy → Deploy latest commit**, or set `autoDeploy: true` in `render.yaml`.
- **Optional settings** (`.env.example`): `PEAKFIVE_MAX_BODY_BYTES` (default 262144) and `PEAKFIVE_MAX_CONCURRENT_SOLVES` (default 2).
- **Data:** all parameters are still illustrative, not real utility data. See `docs/frontend_handoff.md` §11.
