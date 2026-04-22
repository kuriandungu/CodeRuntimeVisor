# Getting Started with CodeWiringKit

This guide walks you through instrumenting your app, capturing a live trace, and producing a WIRING.md — regardless of platform. The whole process takes 30–60 minutes for a typical app.

---

## Overview

```
Step 1: Add a tracer         (10 min)
Step 2: Wire integration points  (15-30 min)
Step 3: Capture a walkthrough    (5-10 min)
Step 4: Read traces → WIRING.md  (10 min, AI-assisted)
```

---

## Step 1: Add a Tracer

The tracer is a single function (or small module) that writes structured log lines. It must:
- Be **debug-only** (zero overhead in production)
- Use a consistent **log format**: `timestamp|EVENT_CODE|subject|details`
- Use a **filterable tag** so you can isolate wiring logs from normal output

> **Naming convention used throughout these docs:** we refer to the tracer as `Tracer.X()` (e.g. `Tracer.dbRead(...)`). That's a placeholder — in your own code, name it whatever fits: `AppLifecycleTracker`, `Wiring`, `Log`, or drop the namespace entirely and call the bare functions. The contract is the log format, not the class name.

### Android/Kotlin

Add to an existing singleton or Application class:

```kotlin
companion object {
    private const val TAG = "WIRING"
    private val tsFormat = SimpleDateFormat("HH:mm:ss.SSS", Locale.US)

    fun wiring(eventCode: String, subject: String, details: String = "") {
        if (!BuildConfig.DEBUG) return
        val ts = tsFormat.format(Date())
        val msg = if (details.isEmpty()) "$ts|$eventCode|$subject"
                  else "$ts|$eventCode|$subject|$details"
        Log.d(TAG, msg)
    }

    // Convenience methods
    fun dbRead(table: String, rows: Int, durationMs: Long) =
        wiring("DB_READ", table, "rows=$rows dur=${durationMs}ms")
    fun dbWrite(table: String, operation: String, rows: Int) =
        wiring("DB_WRITE", table, "op=$operation rows=$rows")
    fun http(method: String, endpoint: String, code: Int, durationMs: Long) =
        wiring("HTTP", "$method $endpoint", "code=$code dur=${durationMs}ms")
    fun initStep(component: String, durationMs: Long = 0) =
        wiring("INIT", component, if (durationMs > 0) "dur=${durationMs}ms" else "")
    fun securityGate(gate: String, result: String) =
        wiring("SEC_GATE", gate, result)
}
```

> **Tip:** Don't create a new singleton if your app already has one (Application class, AppLifecycleTracker, etc.). Just add these methods there.

### Web/JavaScript

```javascript
// wiring-tracer.js
const WIRING_ENABLED = process.env.NODE_ENV !== 'production'; // or location.hostname === 'localhost'

function wiring(eventCode, subject, details = '') {
    if (!WIRING_ENABLED) return;
    const ts = new Date().toISOString().split('T')[1].slice(0, 12);
    const msg = details ? `${ts}|${eventCode}|${subject}|${details}` : `${ts}|${eventCode}|${subject}`;
    console.debug(`[WIRING] ${msg}`);
}

// Convenience
const Wiring = {
    pageLoad: (page, durationMs) => wiring('PAGE_LOAD', page, `dur=${durationMs}ms`),
    apiCall: (method, url, status, durationMs) => wiring('HTTP', `${method} ${url}`, `code=${status} dur=${durationMs}ms`),
    dbQuery: (query, rows, durationMs) => wiring('DB_READ', query, `rows=${rows} dur=${durationMs}ms`),
    authGate: (gate, result) => wiring('SEC_GATE', gate, result),
    init: (component, durationMs) => wiring('INIT', component, durationMs ? `dur=${durationMs}ms` : ''),
    route: (from, to) => wiring('ROUTE', `${from} → ${to}`),
    stateChange: (store, action) => wiring('STATE', store, action),
};

export { wiring, Wiring };
```

### Python/Flask/Django

```python
import logging
import time
from datetime import datetime

logger = logging.getLogger('WIRING')
logger.setLevel(logging.DEBUG)

def wiring(event_code, subject, details=''):
    ts = datetime.now().strftime('%H:%M:%S.%f')[:-3]
    msg = f'{ts}|{event_code}|{subject}|{details}' if details else f'{ts}|{event_code}|{subject}'
    logger.debug(msg)

def db_read(query, rows, duration_ms):
    wiring('DB_READ', query, f'rows={rows} dur={duration_ms}ms')

def http_call(method, endpoint, status, duration_ms):
    wiring('HTTP', f'{method} {endpoint}', f'code={status} dur={duration_ms}ms')
```

---

## Step 2: Wire Integration Points

Add trace calls at these locations in your codebase. You don't need to instrument everything — focus on the **decision points** and **data boundaries**.

### Priority 1: Lifecycle (5 minutes)

These tell you which screens load and in what order.

| Platform | Where | What to Log |
|----------|-------|-------------|
| Android | Activity `onCreate/onResume/onPause` | `ACT_CREATE`, `ACT_RESUME`, `ACT_PAUSE` |
| Android | Fragment `onResume/onPause` | `FRAG_RESUME`, `FRAG_PAUSE` |
| Web (SPA) | Router `beforeEach/afterEach` | `ROUTE` with from/to |
| Web (MPA) | Page load event | `PAGE_LOAD` with URL |
| Backend | Request middleware | `HTTP` with method/path |

**Android shortcut:** If your app uses `registerActivityLifecycleCallbacks()` or `registerFragmentLifecycleCallbacks()`, add traces there once and you capture ALL activities/fragments automatically.

**Web shortcut:** If you use React Router, Vue Router, or Next.js, add a single route guard:

```javascript
// React Router example
useEffect(() => {
    Wiring.route('', location.pathname);
}, [location]);

// Vue Router example
router.beforeEach((to, from) => {
    Wiring.route(from.path, to.path);
});
```

### Priority 2: Database / API Calls (10-15 minutes)

This is the **highest-value instrumentation**. It tells you exactly what data each screen needs, how many rows it fetches, how long each query takes, and — most importantly — whether queries are firing more times than they should.

#### What to Capture

For every database call, log three things:
1. **Query name** — the method/function name (e.g., `getUsers`, `getTransactions`)
2. **Row count** — how many results came back
3. **Duration** — how long the query took in milliseconds

#### Android — SQLite / Room / Raw Queries

Add a trace line **after** each query completes, just before the return:

```kotlin
// Pattern 1: Direct cursor query
fun getUsers(filter: String): List<User> {
    val start = System.currentTimeMillis()
    val users = mutableListOf<User>()
    db.rawQuery("SELECT * FROM users WHERE ...", arrayOf(filter)).use { cursor ->
        while (cursor.moveToNext()) {
            users.add(User(cursor.getString(0), cursor.getString(1)))
        }
    }
    Tracer.dbRead("getUsers", users.size, System.currentTimeMillis() - start)
    return users
}

// Pattern 2: Room DAO (add to repository layer)
fun getOrders(): List<Order> {
    val start = System.currentTimeMillis()
    val orders = orderDao.getAllOrders()  // Room query
    Tracer.dbRead("getAllOrders", orders.size, System.currentTimeMillis() - start)
    return orders
}

// Pattern 3: Kotlin Flow (trace inside the flow builder)
fun getTransactions(): Flow<List<Transaction>> = flow {
    val start = System.currentTimeMillis()
    val items = db.rawQuery("SELECT ...", null).use { /* parse */ }
    Tracer.dbRead("getTransactions", items.size, System.currentTimeMillis() - start)
    emit(items)
}

// Pattern 4: Count queries
fun getRecordCount(): Int {
    val count = db.rawQuery("SELECT COUNT(*) FROM ...", null).use { c ->
        c.moveToFirst(); c.getInt(0)
    }
    Tracer.dbRead("recordCount", count, 0)
    return count
}
```

#### Which Methods to Instrument

Start with the **main data query for each screen**. In a typical app with 8 screens, that's 8-12 methods. Then add:

- Any query that appears in multiple places (shared data loading)
- Count/summary queries used in headers or badges
- Write operations if you want to track mutations

**Real example:** In the MpesaJournal app, we instrumented 25+ database methods across a single `DatabaseRoutines` class. The traces immediately revealed that one screen was calling its query 3 times on load due to overlapping StateFlow observers.

#### How to Find Your Query Methods

Search your codebase for database access patterns:

```bash
# Android/Kotlin — find rawQuery, Room DAO calls
grep -rn "rawQuery\|@Query\|@Insert\|@Update\|@Delete" app/src/

# Web/Node — find database calls
grep -rn "db\.query\|prisma\.\|mongoose\.\|knex\.\|sequelize\." src/

# Python/Django — find ORM calls
grep -rn "objects\.filter\|objects\.get\|execute\|cursor\." app/
```

#### Web — API Calls (Fetch/Axios Interceptor)

For web apps, database calls usually happen server-side. On the frontend, instrument **API calls** instead — they serve the same purpose (mapping screen → data):

```javascript
// Global fetch interceptor — instrument once, captures everything
const originalFetch = window.fetch;
window.fetch = async (url, options = {}) => {
    const method = options.method || 'GET';
    const start = performance.now();
    const response = await originalFetch(url, options);
    Wiring.apiCall(method, url, response.status, Math.round(performance.now() - start));
    return response;
};
```

```javascript
// Axios interceptor
axios.interceptors.response.use(response => {
    Wiring.apiCall(
        response.config.method.toUpperCase(),
        response.config.url,
        response.status,
        response.duration || 0
    );
    return response;
});
```

#### Express/Node Backend — Database + HTTP

```javascript
// Middleware: traces all incoming requests
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        Wiring.apiCall(req.method, req.path, res.statusCode, Date.now() - start);
    });
    next();
});

// Wrap individual database calls
async function getUsers(filter) {
    const start = Date.now();
    const users = await db.query('SELECT * FROM users WHERE ...', [filter]);
    Wiring.dbQuery('getUsers', users.length, Date.now() - start);
    return users;
}
```

#### Python/Django/Flask

```python
# Django: Add a database query logger middleware or wrap key views
def get_orders(request):
    start = time.time()
    orders = Order.objects.filter(user=request.user).all()
    db_read('getOrders', len(orders), int((time.time() - start) * 1000))
    return JsonResponse({'orders': serialize(orders)})

# SQLAlchemy
def get_products(category):
    start = time.time()
    products = session.query(Product).filter_by(category=category).all()
    db_read('getProducts', len(products), int((time.time() - start) * 1000))
    return products
```

#### What the Traces Will Reveal

Once you have DB traces for every screen, a single walkthrough will show you:

| Trace Pattern | What It Means |
|---------------|--------------|
| `DB_READ\|getUsers\|rows=50 dur=12ms` | Normal query, fast |
| Same `DB_READ` appears 2-3x in sequence | **Bug:** duplicate query from overlapping observers or lifecycle calls |
| `DB_READ\|getUsers\|rows=0 dur=5ms` | Query runs but returns nothing — is it needed? |
| `FRAG_RESUME\|SettingsScreen` with no `DB_READ` after it | Screen uses no database — or missing trace |
| `DB_READ\|getAll\|rows=9000 dur=800ms` | Heavy query — consider pagination or caching |

### Priority 3: Security Gates & Settings (5 minutes)

Log at decision points where the app routes differently based on state:

```kotlin
// Android example
val isLoggedIn = authManager.isLoggedIn()
Tracer.setting("isLoggedIn", isLoggedIn.toString())
if (isLoggedIn) {
    Tracer.securityGate("appLaunch", "PASS")
    navigateToHome()
} else {
    Tracer.securityGate("appLaunch", "REDIRECT_LOGIN")
    navigateToLogin()
}
```

### Priority 4: Background Workers (2 minutes)

```kotlin
// Android WorkManager
override fun doWork(): Result {
    Tracer.worker("SyncWorker", "START")
    try {
        // ... do work
        Tracer.worker("SyncWorker", "SUCCESS")
        return Result.success()
    } catch (e: Exception) {
        Tracer.worker("SyncWorker", "FAIL|${e.message}")
        return Result.failure()
    }
}
```

---

## Step 3: Capture a Walkthrough

Build and run your app, then capture traces while you walk through every screen.

### Android

```bash
# Terminal 1: Start capture
adb logcat -c                          # Clear old logs
adb logcat -s WIRING:V *:S | tee trace.log   # Stream + save

# Terminal 2 (or just use the device): Walk through the app
# 1. Cold start
# 2. Every tab / screen
# 3. Key flows (login, search, settings)
# 4. Background + resume
# 5. Any edge cases

# When done: Ctrl+C in Terminal 1
```

Or use the provided capture script:
```bash
./scripts/capture.sh live              # Streams to wiring-kit/traces/
./scripts/capture.sh snapshot 500      # Grabs last 500 lines
```

### Web (Browser)

1. Open DevTools → Console
2. Filter by `[WIRING]`
3. Navigate through your entire app
4. Right-click console → "Save as..." to export

### Web (Node.js)

```bash
NODE_ENV=development node server.js 2>&1 | grep WIRING | tee trace.log
# Then hit every endpoint with curl or your frontend
```

### Walkthrough Checklist

Use this checklist to ensure you cover everything:

- [ ] **Cold start** — app/server launch from scratch
- [ ] **Every main screen/page** — navigate to each one
- [ ] **Authentication flow** — login, logout, session expiry
- [ ] **Search/filter** — try a search query, change filters
- [ ] **CRUD operations** — create, read, update, delete something
- [ ] **Background → foreground** (mobile) — switch away and come back
- [ ] **Error states** — try an invalid action, trigger an error
- [ ] **Settings/preferences** — change a setting, see what reloads

---

## Step 4: Read Traces → Produce WIRING.md

Before handing the trace to an AI assistant, take 2 minutes to **read it yourself** — it builds the intuition that lets you catch when the AI summary is wrong.

### Reading a trace by eye

Open `trace.log` in any editor. Each line is `timestamp|EVENT_CODE|subject|details`. A useful first pass:

1. **Start at the top and follow the story chronologically.** The first 10-20 lines are usually the cold-start sequence: `INIT` steps, the first activity/route loading, the default screen's data queries. Make a mental model — this is your app's startup.

2. **Look for repetition within a 200ms window.** Same `DB_READ|getUsers|...` appearing 3× in quick succession is a duplicate-query smell, usually caused by overlapping observers or a query running in both `onCreate()` *and* `onResume()`.

3. **Count queries per screen.** Find each `FRAG_RESUME` / `ROUTE` / `PAGE_LOAD` event and look at the `DB_READ`/`HTTP` events that follow it before the next navigation. That set IS that screen's data footprint. Now you know what each screen actually fetches.

4. **Check the `dur=` values.** Anything over ~300ms on a `DB_READ` or over 1000ms on an `HTTP` is worth flagging. Add to Issues.

5. **Look for screens with no data.** A `FRAG_RESUME` followed by the next navigation with nothing in between = either a genuinely data-free screen (fine) or missing instrumentation (add traces).

6. **Look for orphan `DB_READ` — queries that fire without an obvious screen triggering them.** Usually a worker, timer, or background observer. Not always a bug, but worth naming in WIRING.md.

A single 150-line trace, read this way, gives you ~80% of what you need for WIRING.md. See [`examples/sample-trace.log`](../examples/sample-trace.log) and the matching [`docs/EXAMPLE_WIRING.md`](EXAMPLE_WIRING.md) to see the pattern worked through end-to-end.

Once you've done one pass by hand, the AI step below is easier to sanity-check — you already know roughly what you're looking at.

### Option A: AI-Assisted (Recommended)

Paste your trace log into Claude, ChatGPT, or any AI assistant with this prompt:

```
Here is a runtime trace from my [Android/web/Node.js] app. Each line follows
the format: timestamp|EVENT_CODE|subject|details

Please analyze this trace and produce a WIRING.md document with:
1. Screen/page inventory — every screen that appeared
2. Navigation flow — the startup sequence and screen transitions
3. Data queries per screen — which DB queries or API calls each screen triggers
4. Performance observations — slow queries, duplicate calls, unnecessary work
5. Security gates — any authentication/authorization checkpoints
6. Issues found — duplicate queries, missing data loads, etc.

Here is the trace:
[paste your trace.log contents]
```

The AI will produce a structured WIRING.md that maps your entire app's runtime behavior.

### Option B: Manual

Use the [WIRING_TEMPLATE.md](WIRING_TEMPLATE.md) and fill it in by reading through your trace log:

1. List every unique `FRAG_RESUME` / `PAGE_LOAD` / `ROUTE` → that's your screen inventory
2. Follow the timestamp order → that's your navigation flow
3. Group `DB_READ` / `HTTP` events by the screen that was active → that's queries per screen
4. Look for duplicates → those are bugs to fix

---

## Step 5: Use Your WIRING.md

### Feed it to AI for future coding sessions

Add WIRING.md to your repo. When you start a coding session with an AI assistant, it can read WIRING.md to understand:
- What query powers each screen
- The startup initialization order
- Which screens share data
- Where security checks happen

This is dramatically more useful than the AI reading static code alone.

### Track regressions

After making changes, re-run the walkthrough. Compare trace output to catch:
- New duplicate queries
- Slower load times
- Missing data loads
- Changed navigation flows

### Onboard new developers

WIRING.md is a living architecture document that shows how the app actually works at runtime, not just how it's structured in files.

---

## Tips

1. **Don't instrument everything at once.** Start with lifecycle + DB queries. Add more as needed.
2. **Use your existing singletons.** Don't create new abstractions — add trace methods to what you already have.
3. **The walkthrough matters more than the code.** A 5-minute walkthrough reveals more than hours of code reading.
4. **Keep traces debug-only.** Use `BuildConfig.DEBUG`, `process.env.NODE_ENV`, or equivalent guards.
5. **Re-run after fixes.** The trace will confirm your fix worked and didn't introduce new issues.
6. **Duration = 0ms is fine.** Cached queries and in-memory operations often show 0ms. The row count still matters.

---

## FAQ

**Q: Does this slow down my app?**
A: No. All trace methods are gated behind debug checks. In release/production builds, they're no-ops with zero overhead.

**Q: How is this different from logging?**
A: Normal logging is scattered and unstructured. Wiring traces use a consistent format with event codes, making them filterable and parseable. The goal isn't debugging a specific bug — it's mapping the entire runtime flow.

**Q: Do I need to keep the traces in my codebase?**
A: The trace *calls* (instrumentation) are worth keeping — they cost nothing in production and are useful for future diagnostics. The trace *output* (log files) are temporary and can be deleted after producing WIRING.md.

**Q: What if my app has 100+ screens?**
A: Start with the 10 most important screens. You can always add more later. The traces are additive — each walkthrough adds to your understanding.

**Q: Can I use this with microservices?**
A: Yes. Each service gets its own tracer. Use a shared request ID in the `details` field to correlate traces across services.
