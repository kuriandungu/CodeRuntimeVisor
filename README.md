# CodeRuntimeVisor - Show AI your Mental Model
*(formerly CodeWiringKit)*

You may find this useful.

/* I created this because I was frustrated with AI's inability to see my code the way I do in my mind. figured that if I could get it to see what happens in runtime, then I open the key or all pages in my app and do something , then it can 
see the data flow and next time I ask it to debug something it knows the connections.
So I tried it out and it seems to work, pretty well actually. In one of my android projects I have a page that is used for 3 different purposes, simply by hiding some feature and exposing others. each go through a different pipeline and all this is determined
by server settings that update on each sync.  After doing this wiring , Claude was able to now know that any changes to that page had to consider all the 3 scenarios and it stopped blindly changing code for just one path.

so basically all this is in Alpha or Pre alpha (hehe). Claude will do the wiring logs and then you run your app and open all the pages and do something within them. then you copy paste the logs and give them to Claude and it then creates 
a wiring diagram. Thereafter I include a summarized version of this in the my startup sequence so that claude is aware. for gritty bugs I tell it to read the wiring.md file then I go ahead and do the bug fixes

I'm hoping someone can extend all this to work for other platforms. web etc */

if you do find this useful and decide to buy a coffee do so here https://buymeacoffee.com/kuriandungu

Now back to the official stuff

**See your app's runtime wiring — then hand it to AI.**

CodeRuntimeVisor is a lightweight methodology for instrumenting any app (Android, web, backend) with structured debug-only traces, capturing a live walkthrough, and producing a **WIRING.md** document that maps every screen → query → API call → security gate in your codebase.

## Why?

AI coding assistants (Claude, ChatGPT, Copilot) are great at reading static code. But static code can't tell you:

- Which database query fires when a user opens the Settings page
- That your SMS log screen loads 9,000 rows **three times** due to overlapping observers
- The exact startup sequence: Application → Splash → PIN check → MainActivity → default fragment
- Which screens re-query when the app returns from background

**Runtime traces answer these questions in minutes.** Feed the resulting WIRING.md to your AI assistant, and it instantly understands how your app actually behaves — not just how it's written.

## What You Get

After a single walkthrough of your app:

1. **WIRING.md** — A structured document mapping screens, queries, API calls, workers, and security gates
2. **Trace logs** — Timestamped evidence of every lifecycle event, DB read, HTTP call
3. **Performance data** — Actual query durations and row counts per screen
4. **Bug discoveries** — Duplicate queries, missing data loads, unnecessary work

## Try It In 2 Minutes (No Install Into Your App)

Before adopting this into your own code, run the pre-wired demo:

```bash
git clone https://github.com/kuriandungu/CodeRuntimeVisor.git
cd CodeRuntimeVisor/examples/demo-node-app
npm install
npm start
```

Then in another terminal, hit a few endpoints:

```bash
curl localhost:3000/users
curl localhost:3000/users/1
curl -X POST localhost:3000/users -d '{"name":"Ada"}' -H 'Content-Type: application/json'
```

Watch traces fly in the server console. A pre-generated [`EXAMPLE_WIRING.md`](docs/EXAMPLE_WIRING.md) shows what the resulting document looks like for this demo app.

## Adopting Into Your Own App

👉 **[Getting Started Guide](docs/GETTING_STARTED.md)** — Full step-by-step for Android, Web, Node.js, and Python.

The flow is: add a tracer (one file, copy-paste from [`examples/`](examples/)) → wire lifecycle + DB + HTTP calls → capture a walkthrough → feed the trace to your AI assistant → get a WIRING.md. 30–60 minutes for a typical app.

**Uninstall is easy:** delete the tracer file and revert the call sites. Nothing installed globally, no package-manager entry.

## Platform Support

| Platform | Tracer | Capture |
|----------|--------|---------|
| **Android/Kotlin** | Logcat with `Log.d("WIRING", ...)` | `adb logcat -s WIRING:V` |
| **Web/JS** | `console.debug("[WIRING]", ...)` | Browser DevTools console filter |
| **Node.js** | `console.debug("[WIRING]", ...)` | `node app.js 2>&1 \| grep WIRING` |
| **iOS/Swift** | `os_log(.debug, "[WIRING] ...")` | Xcode console filter |
| **Python** | `logging.debug("[WIRING] ...")` | `python app.py 2>&1 \| grep WIRING` |

## Trace Format

All platforms use the same structured format:

```
timestamp|EVENT_CODE|subject|details
```

Example output:
```
12:23:22.159|INIT|Application.onCreate.start
12:23:22.661|INIT|DatabaseRoutines|dur=500ms
12:23:25.771|FRAG_RESUME|RecentsFragment|host=MainActivity
12:23:26.313|DB_READ|transactionstable|rows=216 dur=520ms
12:24:58.479|HTTP|GET /api/tariffs|code=200 dur=1432ms
12:25:38.352|DB_READ|MpesaTrans.count|rows=8997 dur=0ms
```

## Event Codes

| Code | What It Captures |
|------|-----------------|
| `INIT` | App/module initialization steps with duration |
| `ACT_CREATE` | Activity/page created (FRESH or RELAUNCH) |
| `ACT_RESUME` | Activity/page became visible |
| `ACT_PAUSE` | Activity/page went to background |
| `FRAG_RESUME` | Fragment/component became visible |
| `FRAG_PAUSE` | Fragment/component hidden |
| `DB_READ` | Database query: table, row count, duration |
| `DB_WRITE` | Database insert/update/delete |
| `HTTP` | Network call: method, endpoint, status, duration |
| `WORKER` | Background job: name, state (START/SUCCESS/FAIL) |
| `SEC_GATE` | Security checkpoint: gate name, result (PASS/FAIL) |
| `SETTING` | Config/preference read at a decision point |
| `BRANCH` | Routing decision: which path was taken |

## Real-World Results

From the MpesaJournal Android app (first use of CodeRuntimeVisor):

| Finding | Impact |
|---------|--------|
| SMS log screen queried 9,000 rows **3x** on load | Fixed: StateFlow observers lacked `isFirst` guards |
| Type and Time screens double-queried on entry | Fixed: `loadData()` called in both `onCreate()` and `onResume()` |
| Person screen query was invisible to traces | Fixed: missing instrumentation on `getTransacteeSummaries()` |
| Background resume re-queried all ViewModels | Identified as architecture-level issue for future fix |

## When Not To Use This

Being honest about fit:

- **Apps under ~500 LOC.** You can read the whole codebase in an hour. A runtime map adds ceremony without saving time.
- **Codebases already instrumented with OpenTelemetry, Datadog, or Sentry tracing.** You already have runtime visibility — producing a static `WIRING.md` is redundant. (That said, the *document* may still help AI assistants even when the *tracing* already exists.)
- **Greenfield projects you're still designing.** Wait until there's actual runtime behavior to map. Instrumenting speculative code wastes effort.
- **One-off scripts.** If it runs once and exits, there's no runtime flow worth documenting.
- **Codebases where you never use AI assistants.** A human who knows the code doesn't need `WIRING.md`. This is mostly a win when a second reader (future-you, a new dev, or an LLM) has to understand runtime behavior cold.

Where this pattern pays off: **production-ish apps with screens/routes + data access + background work, used by humans for months or years, where AI-assisted development is part of the loop.** If that's you, keep reading.

## Repository Structure

```
CodeRuntimeVisor/
├── README.md                       # This file
├── docs/
│   ├── GETTING_STARTED.md          # Step-by-step guide for any platform
│   ├── PLAYBOOK.md                 # The AI-assisted wiring playbook
│   ├── WIRING_TEMPLATE.md          # Blank WIRING.md template to fill in
│   └── EXAMPLE_WIRING.md           # Completed WIRING.md (from the demo-node-app)
├── examples/
│   ├── android/
│   │   └── AppLifecycleTracer.kt   # Drop-in Android tracer
│   ├── web/
│   │   └── wiring-tracer.js        # Drop-in web/Node.js tracer
│   ├── demo-node-app/              # Pre-wired Express app — clone & run to try
│   └── sample-trace.log            # Real trace captured from the demo app
├── scripts/
│   └── capture.sh                  # ADB capture script (Android)
└── LICENSE
```

## License

MIT — use it however you want.

---

*Created from real instrumentation work on the MpesaJournal Android app. If this saves you debugging time, that's the whole point.*
