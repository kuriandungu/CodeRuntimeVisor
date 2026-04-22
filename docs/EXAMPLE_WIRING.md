# WIRING.md — CodeRuntimeVisor Demo App

> Generated from live runtime trace on 2026-04-22.
> Source trace: [`examples/sample-trace.log`](../examples/sample-trace.log)
> Source code: [`examples/demo-node-app/`](../examples/demo-node-app/)
> Re-generate after structural changes: `npm start 2>&1 | grep WIRING | tee sample-trace.log`
>
> **Purpose of this document:** a worked example of what a completed WIRING.md looks like for a small real app, so you know what you're aiming at before instrumenting your own code. Every fact below comes directly from the captured trace — nothing is synthesized.

---

## 1. Screen Inventory

This is an HTTP API, so "screens" are endpoints.

### Endpoints

| Endpoint | Method | Handler | Purpose |
|----------|--------|---------|---------|
| `/health` | GET | `server.js:98` | Liveness probe, no data access |
| `/users` | GET | `server.js:104` | List all users |
| `/users/:id` | GET | `server.js:109` | Fetch one user; 404 if not found |
| `/users` | POST | `server.js:118` | Create user; validates input |
| `/orders` | GET | `server.js:129` | List orders joined with their owning user |

### Background Workers / Jobs

None in this demo.

---

## 2. Navigation Flow

### Startup Sequence

```
node server.js
  ├─ INIT | Express app              (t=0)
  └─ INIT | HTTP listener | dur=5ms  (t+5ms) — listening on :3000
```

Total cold-start: **5 ms** from process boot to accepting connections.

### Request Flow

This is a stateless HTTP API — each request is an independent flow rather than a navigation tree:

```
incoming request
  ├─ expressMiddleware  → emits HTTP event on response finish
  ├─ route handler      → may emit DB_READ / DB_WRITE / SEC_GATE
  └─ response sent      → middleware finalizes HTTP event
```

---

## 3. Data Queries Per Endpoint

| Endpoint | Query | Function | Typical Rows | Typical Duration |
|----------|-------|----------|--------------|------------------|
| `GET /health` | — | (none) | — | — |
| `GET /users` | `getAllUsers` | `server.js:47` | 3–4 | 5 ms |
| `GET /users/:id` | `getUserById` | `server.js:55` | 0 or 1 | 2 ms |
| `POST /users` (valid) | `createUser` (WRITE) + `refreshUserCache` (READ) | `server.js:63`, `server.js:77` | 1 write / all users read | 14 ms total |
| `POST /users` (invalid) | — | (none — validation fails first) | — | — |
| `GET /orders` | `getOrdersWithUsers` | `server.js:85` | 4 | **15 ms** |

### Observations from the trace

- `GET /health` correctly shows **zero** DB events — the control case confirms the tracer only emits when queries actually run.
- `GET /orders` is **3× slower** than `GET /users` (15 ms vs 5 ms) due to the simulated JOIN in `getOrdersWithUsers`. Worth watching if the dataset grows.
- `POST /users` fires **two** DB events per request (WRITE + READ) — see Issues §8.

### HTTP Surface Summary

| Path | Methods | Status Codes Observed |
|------|---------|----------------------|
| `/health` | GET | 200 |
| `/users` | GET, POST | 200, 201, 400 |
| `/users/:id` | GET | 200, 404 |
| `/orders` | GET | 200 |

---

## 4. Background Processes

None. This demo has no workers, cron jobs, or async queues. A real app would document WorkManager / cron / queue processors here.

---

## 5. Security Gates

| Gate | Where | Passes When | Fails When |
|------|-------|-------------|------------|
| `userExists` | `GET /users/:id` | User with that ID exists | User not found → `SEC_GATE | userExists | NOT_FOUND` + 404 response |
| `validateUserInput` | `POST /users` | `name` field present in body | Missing `name` → `SEC_GATE | validateUserInput | FAIL_MISSING_NAME` + 400 response |

The trace confirms both gates are reached by both paths (success and failure) during a typical walkthrough.

---

## 6. Settings / Configuration Map

| Setting | Where Checked | Effect |
|---------|---------------|--------|
| `process.env.NODE_ENV` | `wiring-tracer.js:21` | If `"production"`, the tracer becomes a no-op (zero overhead). All traces below were produced with `NODE_ENV` unset (dev mode). |
| `process.env.PORT` | `server.js:136` | Overrides the default port 3000. |

---

## 7. Timing Profile

From the captured trace:

| Event | Duration |
|-------|----------|
| Cold start (process boot → listening) | 5 ms |
| `GET /health` (data-free) | 3 ms |
| `GET /users/:id` (single-row lookup) | 2 ms |
| `GET /users` (all rows) | 5 ms |
| `POST /users` (valid — includes WRITE + full-table re-read) | 14 ms |
| `POST /users` (invalid — fails at gate) | 0 ms |
| `GET /orders` (JOIN-like) | **15–16 ms** (largest) |

Nothing in this demo exceeds the "look at me" thresholds (300 ms for DB, 1 s for HTTP). `GET /orders` is the closest, and is the first candidate for caching or query optimization if this surface scaled.

---

## 8. Issues Found

### Issue 1 — Full-table re-read on every POST /users

| Field | Value |
|-------|-------|
| **Severity** | Medium (scales poorly) |
| **Source of evidence** | `sample-trace.log` lines 33–34 |
| **Status** | Known / intentional (demo-only) |

Every successful `POST /users` produces this pair of events:

```
18:58:26.958|DB_WRITE|users|op=INSERT rows=1
18:58:26.964|DB_READ|refreshUserCache|rows=4 dur=6ms
```

Look at the code — `server.js:125` calls `refreshUserCache()` after the insert, which reads every user from the table. In a 3-user demo that's cheap. At 10 000 users it's a full-table scan on every write. The trace makes this obvious; static code reading easily overlooks it because `refreshUserCache()` sounds innocent.

**Fix in a real app:** scope the cache update to the single changed row, invalidate the cache lazily, or drop the cache entirely and let the read path handle it.

### Issue 2 — Duplicate `GET /users` pattern

| Field | Value |
|-------|-------|
| **Severity** | Informational (intentionally triggered here) |
| **Source of evidence** | `sample-trace.log` lines 40, 42, 44 |
| **Status** | Pattern-documentation (the "duplicate query" signature you'd look for in real apps) |

The trace shows three `getAllUsers` calls clustered near the end of the walkthrough:

```
18:58:28.054|DB_READ|getAllUsers|rows=4 dur=5ms
18:58:28.409|DB_READ|getAllUsers|rows=4 dur=5ms
18:58:28.416|DB_READ|getAllUsers|rows=4 dur=5ms
```

The first two are ~360 ms apart; the last two fire within 7 ms of each other. The walkthrough triggered these on purpose (one single call, then two parallel `curl` calls at the same instant) to show you what a duplicate-query pattern looks like in the trace. In a real app with a single user action that produces this shape, it's almost always an overlapping-observer or double-call bug (e.g. a handler running in both a parent and child lifecycle hook).

**How to recognize it:** same query name, same row count, near-identical duration, clustered within ~200 ms, with no intervening request or navigation event that would explain fresh work.

### Issue 3 — `GET /orders` is the slowest surface (by design)

| Field | Value |
|-------|-------|
| **Severity** | Low (within budget for this scale) |
| **Source of evidence** | `sample-trace.log` line 38 |
| **Status** | Acknowledged |

15 ms `getOrdersWithUsers` with 4 rows suggests the per-row overhead is the bottleneck (simulated JOIN cost). As the orders table grows, this will grow roughly linearly unless a real join or prefetch is introduced.

---

## Appendix — How this document was produced

1. Ran the demo: `cd examples/demo-node-app && npm install && npm start`
2. Captured: `npm start 2>&1 | grep WIRING | tee ../sample-trace.log`
3. Walked through every endpoint (see the header of `sample-trace.log` for the script).
4. Read the trace top-to-bottom using the heuristics in [GETTING_STARTED.md § Step 4](GETTING_STARTED.md#reading-a-trace-by-eye).
5. Filled in this template against the real events observed.

Nothing in this document was guessed. Every row count, duration, and event came from the captured trace. **That is the contract:** WIRING.md is a factual record of what the app actually did, not a narrative of what you think it does.
