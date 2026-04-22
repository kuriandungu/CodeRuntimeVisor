/**
 * Drop-in WIRING tracer for web apps (browser + Node.js).
 *
 * Usage:
 *   import { Wiring } from './wiring-tracer.js';
 *   Wiring.pageLoad('/dashboard', 142);
 *   Wiring.apiCall('GET', '/api/users', 200, 89);
 *   Wiring.dbQuery('getUsers', 50, 12);
 *
 * All methods are no-ops when WIRING_ENABLED is false (zero production overhead).
 *
 * Created by CodeRuntimeVisor — https://github.com/kuriandungu/CodeRuntimeVisor
 */

// ---- Configuration ----

// Browser: enabled on localhost only. Node: enabled when NODE_ENV !== 'production'.
const WIRING_ENABLED =
    typeof window !== 'undefined'
        ? window.location?.hostname === 'localhost' || window.location?.hostname === '127.0.0.1'
        : process.env.NODE_ENV !== 'production';

// ---- Core trace function ----

function wiring(eventCode, subject, details = '') {
    if (!WIRING_ENABLED) return;
    const now = new Date();
    const ts = now.toTimeString().slice(0, 8) + '.' + String(now.getMilliseconds()).padStart(3, '0');
    const msg = details
        ? `${ts}|${eventCode}|${subject}|${details}`
        : `${ts}|${eventCode}|${subject}`;
    console.debug(`[WIRING] ${msg}`);
}

// ---- Convenience methods ----

const Wiring = {
    /** Page/route navigation */
    route: (from, to) => wiring('ROUTE', from ? `${from} → ${to}` : to),
    pageLoad: (page, durationMs) => wiring('PAGE_LOAD', page, `dur=${durationMs}ms`),

    /** Component mount/unmount (React, Vue, Svelte) */
    mount: (component, parent = '') =>
        wiring('COMP_MOUNT', component, parent ? `parent=${parent}` : ''),
    unmount: (component) => wiring('COMP_UNMOUNT', component),

    /** API / HTTP calls */
    apiCall: (method, url, status, durationMs) =>
        wiring('HTTP', `${method} ${url}`, `code=${status} dur=${durationMs}ms`),

    /** Database queries (for backends or IndexedDB/SQLite in browser) */
    dbQuery: (queryName, rows, durationMs) =>
        wiring('DB_READ', queryName, `rows=${rows} dur=${durationMs}ms`),
    dbWrite: (queryName, operation, rows = 1) =>
        wiring('DB_WRITE', queryName, `op=${operation} rows=${rows}`),

    /** State management (Redux, Vuex, Zustand, etc.) */
    stateChange: (store, action) => wiring('STATE', store, action),

    /** Auth / security gates */
    authGate: (gate, result) => wiring('SEC_GATE', gate, result),

    /** App initialization steps */
    init: (component, durationMs) =>
        wiring('INIT', component, durationMs ? `dur=${durationMs}ms` : ''),

    /** Background jobs (service workers, cron, queue processors) */
    worker: (name, state) => wiring('WORKER', name, state),

    /** WebSocket events */
    ws: (event, details = '') => wiring('WS', event, details),

    /** Raw trace (for anything not covered above) */
    raw: wiring,
};

// ---- Auto-wiring helpers ----

/**
 * Wraps window.fetch to automatically trace all HTTP calls.
 * Call once at app startup: Wiring.installFetchInterceptor()
 */
Wiring.installFetchInterceptor = function () {
    if (!WIRING_ENABLED || typeof window === 'undefined') return;
    const originalFetch = window.fetch;
    window.fetch = async function (input, init = {}) {
        const url = typeof input === 'string' ? input : input.url;
        const method = init.method || 'GET';
        const start = performance.now();
        try {
            const response = await originalFetch.call(window, input, init);
            Wiring.apiCall(method, url, response.status, Math.round(performance.now() - start));
            return response;
        } catch (err) {
            Wiring.apiCall(method, url, 0, Math.round(performance.now() - start));
            throw err;
        }
    };
};

/**
 * Express/Koa middleware for automatic HTTP tracing.
 * Usage: app.use(Wiring.expressMiddleware())
 */
Wiring.expressMiddleware = function () {
    return (req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            Wiring.apiCall(req.method, req.path, res.statusCode, Date.now() - start);
        });
        next();
    };
};

/**
 * React Router wiring hook.
 * Usage: function App() { useWiringRouter(); return <Routes>...</Routes>; }
 */
// Uncomment if using React Router:
// import { useLocation } from 'react-router-dom';
// function useWiringRouter() {
//     const location = useLocation();
//     React.useEffect(() => { Wiring.route('', location.pathname); }, [location]);
// }

export { wiring, Wiring, WIRING_ENABLED };
