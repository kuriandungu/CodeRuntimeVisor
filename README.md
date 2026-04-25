# CodeRuntimeVisor

**Turn runtime traces into an AI-readable map of your app.**

AI coding agents are good at reading source code, but source code alone often misses the part that matters most: what actually happens at runtime.

CodeRuntimeVisor is a lightweight workflow for adding debug-only structured traces to an app, capturing a real walkthrough, and turning that trace into a `WIRING.md` document your AI assistant can use as durable context.

It helps answer questions like:

- Which screen calls which database query?
- Which API request fires after login?
- Which settings or feature flags changed the path?
- Which background worker runs after the user closes the app?
- Which query is firing twice because of lifecycle or observer overlap?

The goal is not to replace logging, OpenTelemetry, Sentry, Datadog, or any other observability stack. The goal is narrower and more practical:

**Give your AI assistant the runtime mental model that usually only lives in your head.**

## Quick Demo

Try the pre-wired Node demo in about two minutes:

```bash
git clone https://github.com/kuriandungu/CodeRuntimeVisor.git
cd CodeRuntimeVisor/examples/demo-node-app
npm install
npm start
```

In another terminal, hit a few endpoints:

```bash
curl http://localhost:3000/users
curl http://localhost:3000/users/1
curl http://localhost:3000/users/999
curl -X POST http://localhost:3000/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Ada","email":"ada@example.com"}'
curl http://localhost:3000/orders
```

> **Windows PowerShell:** swap the POST body for `-d "{\"name\":\"Ada\",\"email\":\"ada@example.com\"}"` — PowerShell mangles single-quoted JSON.

You will see trace lines like:

```txt
[WIRING] 13:07:27.962|DB_WRITE|users|op=INSERT rows=1
[WIRING] 13:07:27.968|DB_READ|refreshUserCache|rows=4 dur=6ms
[WIRING] 13:07:27.968|HTTP|POST /users|code=201 dur=15ms
```

That small trace already tells a story: every successful `POST /users` writes one row, then immediately re-reads the full user table. In a tiny demo that is harmless. In a real production app, that pattern can become a performance bug.

That is the point of CodeRuntimeVisor: make runtime behavior visible, structured, and easy to hand to an AI assistant.

See [`docs/EXAMPLE_WIRING.md`](docs/EXAMPLE_WIRING.md) for the `WIRING.md` generated from the demo trace.

## Why This Exists

AI assistants can inspect classes, functions, routes, and schemas. But static code does not reliably tell them:

- Which path a real user actually took through the app
- Which screen caused a database query to run
- Which API call followed a settings refresh
- Which lifecycle event caused a reload
- Which server-driven flag changed the visible UI
- Which worker continued after the app went into the background

That gap matters in older production apps, mobile apps, admin tools, offline-first systems, server-driven UI, and codebases where one screen has multiple runtime modes.

CodeRuntimeVisor closes that gap by producing a small, factual runtime map:

```txt
timestamp|EVENT_CODE|subject|details
```

Those trace lines become a `WIRING.md` file that your AI assistant can read before making changes.

## What You Get

After a walkthrough of your app, you get:

1. **A `WIRING.md` runtime map** showing screens, routes, queries, API calls, workers, settings, and security gates.
2. **Trace logs** with timestamped evidence of what actually happened.
3. **Performance clues** such as row counts, durations, duplicate calls, and heavy reads.
4. **Bug discoveries** such as duplicate queries, missing loads, unnecessary cache refreshes, or hidden background behavior.

This is most useful when your app is too large or too dynamic for static reading to explain the real behavior quickly.

## The Workflow

The workflow is intentionally simple:

1. Add a small debug-only tracer.
2. Add trace calls around lifecycle events, DB queries, API calls, workers, settings, and security gates.
3. Run the app and walk through the important flows.
4. Save the trace output.
5. Ask an AI assistant to turn the trace into `WIRING.md`.
6. Keep `WIRING.md` in your repo as runtime context for future debugging and coding sessions.

For full instructions, see [`docs/GETTING_STARTED.md`](docs/GETTING_STARTED.md).

## Trace Format

All platforms use the same basic format:

```txt
timestamp|EVENT_CODE|subject|details
```

Example:

```txt
12:23:22.159|INIT|Application.onCreate.start
12:23:22.661|INIT|DatabaseRoutines|dur=500ms
12:23:25.771|FRAG_RESUME|RecentsFragment|host=MainActivity
12:23:26.313|DB_READ|transactionstable|rows=216 dur=520ms
12:24:58.479|HTTP|GET /api/tariffs|code=200 dur=1432ms
12:25:38.352|DB_READ|MpesaTrans.count|rows=8997 dur=0ms
```

## Event Codes

| Code | What It Captures |
|------|------------------|
| `INIT` | App/module initialization steps with duration |
| `ACT_CREATE` | Activity/page created |
| `ACT_RESUME` | Activity/page became visible |
| `ACT_PAUSE` | Activity/page went to background |
| `FRAG_RESUME` | Fragment/component became visible |
| `FRAG_PAUSE` | Fragment/component hidden |
| `PAGE_LOAD` | Web page loaded |
| `ROUTE` | Web/app route transition |
| `DB_READ` | Database query with row count and duration |
| `DB_WRITE` | Database insert/update/delete |
| `HTTP` | Network call with method, endpoint, status, and duration |
| `WORKER` | Background job state |
| `SEC_GATE` | Security or validation checkpoint |
| `SETTING` | Config/preference read at a decision point |
| `BRANCH` | Runtime branch or routing decision |

## Platform Support

| Platform | Trace Output | Capture |
|----------|--------------|---------|
| Android/Kotlin | `Log.d("WIRING", "...")` | `adb logcat -s WIRING:V` |
| Web/JavaScript | `console.debug("[WIRING]", "...")` | Browser DevTools console filter |
| Node.js | `console.debug("[WIRING]", "...")` | `node app.js 2>&1 | grep WIRING` |
| iOS/Swift | `os_log(.debug, "[WIRING] ...")` | Xcode console filter |
| Python | `logging.debug("[WIRING] ...")` | `python app.py 2>&1 | grep WIRING` |

The repository currently includes drop-in examples for Android and JavaScript/Node. The format is simple enough to adapt to other platforms.

## Real-World Results

This approach came from real debugging work on production-ish Android apps.

In one app, runtime traces revealed:

| Finding | Impact |
|---------|--------|
| SMS log screen queried 9,000 rows three times on load | Fixed overlapping observer behavior |
| Type and Time screens double-queried on entry | Fixed duplicate lifecycle loading |
| Person screen query was invisible to traces | Added missing instrumentation |
| Background resume re-queried all ViewModels | Identified architecture-level reload behavior |

In another app, one Android screen served multiple roles. The visible controls, allowed actions, and data pipeline changed based on server settings fetched during sync. Static code review made AI assistants focus on one path at a time. After generating a runtime wiring document, the assistant understood that changes to that screen had to account for all runtime modes.

That is the use case CodeRuntimeVisor is built for.

## When To Use This

CodeRuntimeVisor is useful when:

- Your app has screens/routes plus data access.
- Runtime behavior changes based on settings, roles, flags, or server config.
- Background jobs, sync, or workers matter.
- You use AI assistants for debugging or development.
- The codebase is large enough that reading files alone is slow or misleading.

It is especially useful for older production apps where the real architecture is partly in lifecycle behavior, stored settings, database state, and background work.

## When Not To Use This

This is probably not worth it for:

- Apps under roughly 500 lines of code.
- One-off scripts.
- Greenfield projects whose runtime behavior does not exist yet.
- Teams that already have excellent tracing and do not need an AI-readable runtime document.
- Codebases where AI assistants are not part of the workflow.

Even if you already use OpenTelemetry, Sentry, Datadog, or another observability tool, the `WIRING.md` document may still be useful as compact AI context. But the tracing itself is not meant to compete with those systems.

## Repository Structure

```txt
CodeRuntimeVisor/
├── README.md
├── docs/
│   ├── GETTING_STARTED.md
│   ├── PLAYBOOK.md
│   ├── WIRING_TEMPLATE.md
│   └── EXAMPLE_WIRING.md
├── examples/
│   ├── android/
│   │   └── AppLifecycleTracer.kt
│   ├── web/
│   │   └── wiring-tracer.js
│   ├── demo-node-app/
│   └── sample-trace.log
├── scripts/
│   └── capture.sh
└── LICENSE
```

## Origin Story

I built this because I was frustrated with AI assistants missing the runtime shape of my code.

In my head, I knew how the app worked: which screens loaded which data, which server settings changed the path, which background jobs mattered, and which shared screens behaved differently depending on role. But the AI only saw static source files. It could read the code, but it did not have the same mental model.

So I started adding structured debug traces, walking through the app, and asking the AI to turn those traces into a wiring document. Once that document existed, the assistant stopped treating shared screens as single-purpose screens and started making safer suggestions.

This project is early, but the workflow has already helped me find duplicate queries, missing instrumentation, hidden reloads, and runtime paths that were not obvious from source code alone.

If you find it useful and want to support the work: https://buymeacoffee.com/kuriandungu

## License

MIT. Use it however you want.
