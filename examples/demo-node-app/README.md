# CodeRuntimeVisor Demo — Pre-Wired Express App

A tiny Node/Express app already instrumented with the WIRING tracer. Clone, run, hit a few endpoints, see traces flow. No Android setup, no Android Studio, nothing to install globally.

## Run it

```bash
npm install
npm start
```

Then in another terminal:

```bash
curl http://localhost:3000/users
curl http://localhost:3000/users/1
curl http://localhost:3000/users/999
curl -X POST http://localhost:3000/users \
     -H "Content-Type: application/json" \
     -d '{"name":"Dan","email":"dan@example.com"}'
curl http://localhost:3000/orders
```

Watch `[WIRING]` lines in the server console.

## Capture a trace

```bash
npm start 2>&1 | tee ../sample-trace.log
```

…then hit the endpoints above. Ctrl+C when done. The captured trace is what you'd feed to an AI assistant (see [GETTING_STARTED.md § Step 4](../../docs/GETTING_STARTED.md#step-4-read-traces--produce-wiringmd)).

## What to notice

- **Every request** produces an `HTTP` event with method, path, status code, duration.
- **Every DB call** produces a `DB_READ` or `DB_WRITE` event with query name, row count, duration.
- **Input validation** produces `SEC_GATE` events — `PASS` or `FAIL_*`.
- **Startup** produces two `INIT` events with timing.

### The deliberate smell

Try `POST /users` and look at the trace. You'll see:

```
... DB_WRITE | users | op=INSERT rows=1
... DB_READ  | refreshUserCache | rows=N dur=...ms
```

A write followed by a full-table read, for every POST. That's a cache-refresh pattern that in a real app would hammer the DB as rows grow. **You didn't know to look for that bug by reading the code — the trace made it obvious.** That's the point of the whole methodology.

See [`docs/EXAMPLE_WIRING.md`](../../docs/EXAMPLE_WIRING.md) to see how that discovery ends up written up in the final document.

## Uninstall

```bash
rm -rf node_modules
```

Nothing installed outside this folder.

## Structure

```
demo-node-app/
├── server.js       # ~120 lines — the whole app
├── package.json    # express only
├── README.md       # this file
└── .gitignore
```

The tracer itself is imported from [`../web/wiring-tracer.js`](../web/wiring-tracer.js) — you can see the exact code that's emitting these traces, and copy it into your own app.
