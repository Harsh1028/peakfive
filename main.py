"""PEAKFIVE API. Run with: uvicorn api.main:app --reload

Environment configuration (read at startup):
  PEAKFIVE_MAX_BODY_BYTES        max request body in bytes (default 262144 = 256 KB);
                                 larger requests get HTTP 413
  PEAKFIVE_MAX_CONCURRENT_SOLVES max simultaneous optimizer solves (default 2);
                                 further /optimize requests get HTTP 503
  PEAKFIVE_CORS_ORIGINS          comma-separated browser origins allowed to call the
                                 API (default: local dev servers on ports 3000/5173).
                                 Add the deployed frontend origin here; "*" is rejected.
  PEAKFIVE_CORS_ORIGIN_REGEX     optional regex for origins that change per build, e.g.
                                 Lovable preview URLs. Must start with ^https:// and end
                                 with $. Unset by default.

On Render: uvicorn api.main:app --host 0.0.0.0 --port $PORT (see docs/deploy_render.md).
"""

import asyncio
import json
import logging
import os
import re
from typing import Any, Awaitable, Callable, Dict, List, Optional

from fastapi import Body, FastAPI
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from baseline.compare import comparison_error, comparison_response
from optimizer.model import EVENT_FORMAT, InvalidRequest, illustrative_request, optimize

logger = logging.getLogger("peakfive.api")

DEFAULT_MAX_BODY_BYTES = 256 * 1024
DEFAULT_MAX_CONCURRENT_SOLVES = 2
DEFAULT_CORS_ORIGINS = (
    "http://localhost:5173,http://127.0.0.1:5173,"
    "http://localhost:3000,http://127.0.0.1:3000"
)
BUSY_RETRY_AFTER_S = 5


def _positive_int_env(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        raise RuntimeError(f"{name} must be a positive integer, got {raw!r}")
    if value < 1:
        raise RuntimeError(f"{name} must be a positive integer, got {raw!r}")
    return value


def _cors_origins_env() -> List[str]:
    raw = os.environ.get("PEAKFIVE_CORS_ORIGINS", DEFAULT_CORS_ORIGINS)
    origins = [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]
    for origin in origins:
        if "*" in origin:
            raise RuntimeError("PEAKFIVE_CORS_ORIGINS must list explicit origins; wildcards are not allowed")
        if not origin.startswith(("http://", "https://")):
            raise RuntimeError(f"PEAKFIVE_CORS_ORIGINS entry {origin!r} must start with http:// or https://")
    return origins


def _cors_origin_regex_env() -> Optional[str]:
    raw = os.environ.get("PEAKFIVE_CORS_ORIGIN_REGEX", "").strip()
    if not raw:
        return None
    if not (raw.startswith("^https://") and raw.endswith("$")):
        raise RuntimeError("PEAKFIVE_CORS_ORIGIN_REGEX must start with ^https:// and end with $")
    try:
        re.compile(raw)
    except re.error as exc:
        raise RuntimeError(f"PEAKFIVE_CORS_ORIGIN_REGEX is not a valid regex: {exc}")
    return raw


MAX_BODY_BYTES = _positive_int_env("PEAKFIVE_MAX_BODY_BYTES", DEFAULT_MAX_BODY_BYTES)
MAX_CONCURRENT_SOLVES = _positive_int_env("PEAKFIVE_MAX_CONCURRENT_SOLVES", DEFAULT_MAX_CONCURRENT_SOLVES)
CORS_ORIGINS = _cors_origins_env()
CORS_ORIGIN_REGEX = _cors_origin_regex_env()
if not CORS_ORIGINS and CORS_ORIGIN_REGEX is None:
    logger.warning("no CORS origins configured; browsers on other origins cannot call this API")


def _contract_body(status: str, explanation: str) -> Dict[str, Any]:
    return {
        "status": status,
        "schedule": [],
        "coincident_kw_before": None,
        "coincident_kw_after": None,
        "explanation": explanation,
    }


class BodySizeLimitMiddleware:
    """Rejects request bodies over max_bytes with HTTP 413.

    Checks Content-Length up front, then buffers the body (at most max_bytes)
    and replays it to the app, so chunked uploads without Content-Length are
    bounded too. Buffering inside the middleware avoids FastAPI turning a
    mid-read exception into a 400.
    """

    def __init__(self, app: Callable[..., Awaitable[None]], max_bytes: int) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def _reject(self, send: Callable[..., Awaitable[None]]) -> None:
        payload = json.dumps(_contract_body(
            "invalid_input", f"request body exceeds the {self.max_bytes}-byte limit"
        )).encode()
        await send({"type": "http.response.start", "status": 413,
                    "headers": [(b"content-type", b"application/json"),
                                (b"content-length", str(len(payload)).encode()),
                                (b"connection", b"close")]})
        await send({"type": "http.response.body", "body": payload})

    async def __call__(self, scope: Dict[str, Any], receive: Callable[..., Awaitable[Dict[str, Any]]],
                       send: Callable[..., Awaitable[None]]) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        declared: Optional[bytes] = dict(scope.get("headers") or []).get(b"content-length")
        if declared is not None:
            try:
                too_big = int(declared) > self.max_bytes
            except ValueError:
                too_big = False  # malformed header; the byte count below still applies
            if too_big:
                await self._reject(send)
                return

        chunks: List[bytes] = []
        size = 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            size += len(chunk)
            if size > self.max_bytes:
                await self._reject(send)
                return
            chunks.append(chunk)
            if not message.get("more_body", False):
                break

        replayed = False

        async def replay() -> Dict[str, Any]:
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": b"".join(chunks), "more_body": False}
            return await receive()  # later calls wait for http.disconnect

        await self.app(scope, replay, send)


app = FastAPI(title="PEAKFIVE pump scheduling optimizer")
# add_middleware wraps outward, so CORS (added last) is outermost and also
# decorates 413 responses, letting the browser read them.
app.add_middleware(BodySizeLimitMiddleware, max_bytes=MAX_BODY_BYTES)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)

_solve_slots: Optional[asyncio.Semaphore] = None


def _get_solve_slots() -> asyncio.Semaphore:
    # Created lazily so it binds to the running event loop (Python 3.9
    # semaphores attach to the loop current at construction).
    global _solve_slots
    if _solve_slots is None:
        _solve_slots = asyncio.Semaphore(MAX_CONCURRENT_SOLVES)
    return _solve_slots


OPTIMIZE_DESCRIPTION = f"""\
Builds a 96-slot (15-minute) pump schedule for one day.

Response `status` is one of `optimal`, `feasible_timeout` (verified but not
proven optimal), `infeasible`, `timeout_no_solution`, `invalid_input` (HTTP 422,
or 413 for a body over {MAX_BODY_BYTES} bytes) or `error` (HTTP 500, or 503 with
Retry-After when {MAX_CONCURRENT_SOLVES} solves are already running).
`schedule` is non-empty only for `optimal` and `feasible_timeout`. Each row's
`tank_m3` is the volume at the START of that slot. `coincident_kw_before` is
always null (no baseline is defined).

The example uses ILLUSTRATIVE parameters, not real utility data.

Event format:

```
{EVENT_FORMAT}
```
"""


@app.get("/health")
def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/optimize", description=OPTIMIZE_DESCRIPTION)
async def optimize_endpoint(
    request: Dict[str, Any] = Body(
        ..., openapi_examples={"illustrative": {"value": illustrative_request()}}
    ),
) -> JSONResponse:
    slots = _get_solve_slots()
    # No await between the check and the acquire, so this cannot race on one loop.
    if slots.locked():
        return JSONResponse(
            status_code=503,
            headers={"Retry-After": str(BUSY_RETRY_AFTER_S)},
            content=_contract_body(
                "error",
                f"optimizer busy: {MAX_CONCURRENT_SOLVES} solves already running; "
                f"retry in {BUSY_RETRY_AFTER_S} s. No schedule certified.",
            ),
        )
    await slots.acquire()
    # CBC runs as a blocking subprocess; keep it off the event loop. The slot is
    # released when the worker thread finishes, not when this request ends, so a
    # client disconnect cannot let more than MAX_CONCURRENT_SOLVES solves run.
    solve = asyncio.ensure_future(run_in_threadpool(optimize, request))
    solve.add_done_callback(lambda _: slots.release())
    try:
        result = await asyncio.shield(solve)
    except Exception:
        logger.exception("optimize failed")
        result = _contract_body("error", "internal optimizer error; no schedule certified.")
    # Infeasible / timeout are valid answers (200); malformed input is a client error.
    status_code = {"invalid_input": 422, "error": 500}.get(result["status"], 200)
    return JSONResponse(status_code=status_code, content=result)


COMPARE_DESCRIPTION = f"""\
SIMULATED comparison of a conventional control policy (reservoir-level
hysteresis with end-of-day recovery, illustrative unvalidated settings) against
the optimizer, on the SAME request body as `/optimize`. Not actual Hamilton
utility operations; no financial savings.

Response `status`: `comparison_available` (both schedules passed the
independent checker; `peak_window` and `energy` are filled),
`comparison_unavailable` (HTTP 200; a schedule failed or the optimizer found
none; reduction figures are null), `invalid_input` (HTTP 422, or 413 for a body
over {MAX_BODY_BYTES} bytes) or `error` (HTTP 500, or 503 with Retry-After when
{MAX_CONCURRENT_SOLVES} solves are already running; `/compare` and `/optimize`
share this limit). Both 96-row schedules are included when available.
"""


@app.post("/compare", description=COMPARE_DESCRIPTION)
async def compare_endpoint(
    request: Dict[str, Any] = Body(
        ..., openapi_examples={"illustrative": {"value": illustrative_request()}}
    ),
) -> JSONResponse:
    # Same admission pattern and shared semaphore as /optimize: one compare
    # holds one solve slot for its single optimizer run.
    slots = _get_solve_slots()
    if slots.locked():
        return JSONResponse(
            status_code=503,
            headers={"Retry-After": str(BUSY_RETRY_AFTER_S)},
            content=comparison_error(
                "error",
                f"optimizer busy: {MAX_CONCURRENT_SOLVES} solves already running; "
                f"retry in {BUSY_RETRY_AFTER_S} s. No comparison reported.",
            ),
        )
    await slots.acquire()
    solve = asyncio.ensure_future(run_in_threadpool(comparison_response, request))
    solve.add_done_callback(lambda _: slots.release())
    try:
        result = await asyncio.shield(solve)
    except InvalidRequest as exc:
        result = comparison_error("invalid_input", str(exc))
    except Exception:
        logger.exception("compare failed")
        result = comparison_error("error", "internal comparison error; no comparison reported.")
    status_code = {"invalid_input": 422, "error": 500}.get(result["status"], 200)
    return JSONResponse(status_code=status_code, content=result)
