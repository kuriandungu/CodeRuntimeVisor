# CodeRuntimeVisor Playbook

> The AI-assisted runtime wiring playbook. Follow these phases to go from zero instrumentation to a complete WIRING.md in under an hour.

---

## Phase 1: Add Tracer (10 min)

**Goal:** A single debug-only function that writes structured log lines.

### Rules
- **Use an existing singleton.** Don't create a new class if your app already has an Application class, AppLifecycleTracker, or global module.
- **Gate behind debug flag.** The tracer must be a no-op in production.
- **Use the standard format:** `timestamp|EVENT_CODE|subject|details`

### Checklist
- [ ] Tracer function exists with debug guard
- [ ] Convenience methods: `dbRead`, `http`, `initStep`, `securityGate`
- [ ] Tag is filterable (`WIRING` for Android Logcat, `[WIRING]` for console)

See [GETTING_STARTED.md](GETTING_STARTED.md#step-1-add-a-tracer) for platform-specific code.

---

## Phase 2: Wire Integration Points (15-30 min)

**Goal:** Add trace calls at the boundaries where things happen.

### Wiring Priority Order

| Priority | What | Why | Time |
|----------|------|-----|------|
| **P1** | Screen lifecycle | Maps navigation flow | 5 min |
| **P2** | Database queries | Maps data per screen | 10 min |
| **P3** | HTTP/API calls | Maps external dependencies | 5 min |
| **P4** | Security gates | Maps auth decision points | 3 min |
| **P5** | Background workers | Maps async processes | 2 min |
| **P6** | Settings reads | Maps configuration-driven branches | 2 min |

### P1: Screen Lifecycle

**Android:**
```kotlin
// In Application class or MainActivity — captures ALL activities + fragments
registerActivityLifecycleCallbacks(object : ActivityLifecycleCallbacks {
    override fun onActivityCreated(a: Activity, b: Bundle?) =
        Tracer.wiring("ACT_CREATE", a.javaClass.simpleName, if (b == null) "FRESH" else "RELAUNCH")
    override fun onActivityResumed(a: Activity) =
        Tracer.wiring("ACT_RESUME", a.javaClass.simpleName)
    override fun onActivityPaused(a: Activity) =
        Tracer.wiring("ACT_PAUSE", a.javaClass.simpleName)
    // ... other callbacks as no-ops
})

supportFragmentManager.registerFragmentLifecycleCallbacks(object : FragmentLifecycleCallbacks() {
    override fun onFragmentResumed(fm: FragmentManager, f: Fragment) =
        Tracer.wiring("FRAG_RESUME", f.javaClass.simpleName, "host=${activity?.javaClass?.simpleName}")
    override fun onFragmentPaused(fm: FragmentManager, f: Fragment) =
        Tracer.wiring("FRAG_PAUSE", f.javaClass.simpleName, "host=${activity?.javaClass?.simpleName}")
}, true)
```

**Web (React Router):**
```javascript
function WiringRouteTracker() {
    const location = useLocation();
    useEffect(() => { Wiring.route('', location.pathname); }, [location]);
    return null;
}
// Add <WiringRouteTracker /> inside <Router>
```

### P2: Database Queries

This is the most valuable instrumentation. Wrap the **return point** of each query method. You need: table/query name, row count, duration.

```kotlin
fun getUsers(filter: String): List<User> {
    val start = System.currentTimeMillis()
    // ... existing query code ...
    Tracer.dbRead("getUsers", results.size, System.currentTimeMillis() - start)
    return results
}
```

**How many methods to instrument?** Start with the **main data query for each screen**. A typical app with 8 screens needs 8-15 traced methods. Then expand to shared queries, count queries, and write operations.

**Finding your methods:** Search for `rawQuery`, `@Query`, `db.query`, `prisma.`, `objects.filter`, etc.

**Key patterns to handle:**
- **Direct queries:** Trace after cursor/result parsing
- **ORM calls (Room, Prisma, Django):** Trace in the repository/service layer
- **Flow/Observable returns:** Trace inside the flow builder before `emit()`
- **Count queries:** Use the count itself as the row count

See [GETTING_STARTED.md § Priority 2](GETTING_STARTED.md#priority-2-database--api-calls-10-15-minutes) for complete examples across Android, Web, Node.js, and Python.

### P3: HTTP Calls

**Android (OkHttp interceptor):**
```kotlin
val wiringInterceptor = Interceptor { chain ->
    val request = chain.request()
    val start = System.currentTimeMillis()
    val response = chain.proceed(request)
    Tracer.http(request.method, request.url.encodedPath, response.code, System.currentTimeMillis() - start)
    response
}
client.addInterceptor(wiringInterceptor)
```

**Web (global fetch wrapper):** See [GETTING_STARTED.md](GETTING_STARTED.md#priority-2-database--api-calls-10-minutes).

### P4–P6: Security, Workers, Settings

Add one-line trace calls at decision points. See [GETTING_STARTED.md](GETTING_STARTED.md#priority-3-security-gates--settings-5-minutes) for examples.

---

## Phase 3: Build & Capture (10 min)

### Pre-Capture
1. Build debug variant
2. Install on device / start dev server
3. Clear old logs

### Capture
Start log capture, then walk through the app systematically:

```
1. Cold start → first screen
2. Each main navigation tab/page
3. Drill into sub-screens (detail views, settings sub-pages)
4. Search / filter operations
5. Auth flows (login, logout, re-auth)
6. Background → foreground (mobile)
7. Any CRUD operations
```

### Post-Capture
Save the log to a file. You now have a complete trace of your app's runtime behavior.

---

## Phase 4: Analyze & Produce WIRING.md (10 min)

### AI-Assisted Analysis

Paste the trace into your AI coding assistant:

```
Analyze this runtime trace and produce a WIRING.md with:
1. Screen inventory
2. Navigation flow (startup → default screen → transitions)
3. Data queries per screen (which DB/API calls each screen triggers)
4. Performance notes (durations, row counts)
5. Issues (duplicates, missing loads, unnecessary work)

[paste trace]
```

### What to Look For

| Pattern | What It Means | Action |
|---------|--------------|--------|
| Same `DB_READ` appears 2-3x in a row | Duplicate query on screen load | Check for overlapping observers/lifecycle calls |
| `DB_READ` with 0 rows | Query runs but returns nothing | Check if query is needed for this screen |
| `FRAG_RESUME` with no `DB_READ` after it | Screen loads but no data query fires | Missing instrumentation or caching |
| Multiple `DB_READ` after `ACT_RESUME` | Background resume re-queries everything | Consider visibility-aware observers |
| `HTTP` with `dur>3000ms` | Slow network call | Consider caching, loading indicator |
| Same `FRAG_RESUME` appears without `FRAG_PAUSE` | Fragment re-created without being destroyed | Fragment transaction issue |

### WIRING.md Template

Use [WIRING_TEMPLATE.md](WIRING_TEMPLATE.md) as a starting point.

---

## Phase 5: Fix Issues & Re-Trace (Optional)

If the trace revealed bugs (duplicate queries, missing loads), fix them and re-run the walkthrough to confirm:

1. The fix eliminated the duplicate/issue
2. No new issues were introduced
3. The screen still loads data correctly

This creates a feedback loop: **instrument → trace → analyze → fix → re-trace**.

---

## Tips for AI-Assisted Wiring

### Feeding WIRING.md to AI Assistants

Once you have WIRING.md, add it to your project repo. AI assistants can reference it to:

- **Understand data flow:** "Which query powers the Person screen?" → Check WIRING.md § Data Queries
- **Debug issues:** "Why is this screen slow?" → Check WIRING.md § Timing Profile
- **Plan changes safely:** "If I modify this query, what screens are affected?" → Check WIRING.md § Screen-Query Map

### Keeping WIRING.md Current

Re-run the trace walkthrough when you:
- Add a new screen
- Change navigation flow
- Add or modify database queries
- Change authentication logic

You don't need to re-trace for every commit — only for structural changes.

### Context Efficiency

WIRING.md is typically 5-15KB — small enough to include in AI context without significant token cost, but dense enough to provide real architectural understanding that would otherwise require reading thousands of lines of source code.
