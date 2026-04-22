// CodeWiringKit demo — a tiny Express app, pre-wired with WIRING traces.
// Run: npm install && npm start
// Then: curl http://localhost:3000/users
//
// The point of this demo is to let you SEE the trace output flow and produce a
// realistic WIRING.md without first instrumenting your own code. See the
// sibling file examples/sample-trace.log for a captured run, and
// docs/EXAMPLE_WIRING.md for the resulting WIRING.md written from that trace.

import express from 'express';
import { Wiring } from '../web/wiring-tracer.js';

const startupBegin = Date.now();
Wiring.init('Express app');

const app = express();
app.use(express.json());

// One-line install — traces every incoming request as an HTTP event.
app.use(Wiring.expressMiddleware());

// ---- "Database" (in-memory, intentionally simple) ----------------------------

const db = {
    users: new Map([
        [1, { id: 1, name: 'Alice',  email: 'alice@example.com'  }],
        [2, { id: 2, name: 'Bob',    email: 'bob@example.com'    }],
        [3, { id: 3, name: 'Carol',  email: 'carol@example.com'  }],
    ]),
    orders: new Map([
        [1, { id: 1, userId: 1, total:  42.00, status: 'paid'    }],
        [2, { id: 2, userId: 2, total:  17.50, status: 'pending' }],
        [3, { id: 3, userId: 1, total:  99.99, status: 'paid'    }],
        [4, { id: 4, userId: 3, total: 250.00, status: 'paid'    }],
    ]),
};

// Small busy-wait so durations aren't all 0ms in the trace. Real apps don't
// need this — their queries take real milliseconds already.
function simulatedDbDelay(ms) {
    const start = Date.now();
    while (Date.now() - start < ms) { /* intentional */ }
}

// ---- Data-access layer (where the traces live) ------------------------------

function getAllUsers() {
    const start = Date.now();
    simulatedDbDelay(5);
    const result = Array.from(db.users.values());
    Wiring.dbQuery('getAllUsers', result.length, Date.now() - start);
    return result;
}

function getUserById(id) {
    const start = Date.now();
    simulatedDbDelay(2);
    const user = db.users.get(Number(id));
    Wiring.dbQuery('getUserById', user ? 1 : 0, Date.now() - start);
    return user;
}

function createUser(data) {
    simulatedDbDelay(8);
    const id = db.users.size + 1;
    const user = { id, ...data };
    db.users.set(id, user);
    Wiring.dbWrite('users', 'INSERT', 1);
    return user;
}

// Deliberate inefficiency: re-reads ALL users after every write. This is a
// real-world smell that the trace makes obvious — you'll see a DB_WRITE
// followed by a full-table DB_READ for no user-visible reason. Fix in a real
// app by scoping the cache refresh to the one changed row, or dropping the
// refresh altogether.
function refreshUserCache() {
    const start = Date.now();
    simulatedDbDelay(6);
    const all = Array.from(db.users.values());
    Wiring.dbQuery('refreshUserCache', all.length, Date.now() - start);
    return all;
}

function getOrdersWithUsers() {
    const start = Date.now();
    simulatedDbDelay(15); // simulated JOIN is slower than a single-table read
    const joined = Array.from(db.orders.values()).map(o => ({
        ...o,
        user: db.users.get(o.userId),
    }));
    Wiring.dbQuery('getOrdersWithUsers', joined.length, Date.now() - start);
    return joined;
}

// ---- Routes -----------------------------------------------------------------

app.get('/health', (req, res) => {
    // No data access — confirms routes that don't touch the DB leave no
    // DB_READ trace behind. Useful as a control case.
    res.json({ ok: true });
});

app.get('/users', (req, res) => {
    const users = getAllUsers();
    res.json(users);
});

app.get('/users/:id', (req, res) => {
    const user = getUserById(req.params.id);
    if (!user) {
        Wiring.authGate('userExists', 'NOT_FOUND');
        return res.status(404).json({ error: 'user not found' });
    }
    res.json(user);
});

app.post('/users', (req, res) => {
    if (!req.body?.name) {
        Wiring.authGate('validateUserInput', 'FAIL_MISSING_NAME');
        return res.status(400).json({ error: 'name required' });
    }
    Wiring.authGate('validateUserInput', 'PASS');
    const user = createUser(req.body);
    refreshUserCache(); // see comment on the function — deliberate smell
    res.status(201).json(user);
});

app.get('/orders', (req, res) => {
    const orders = getOrdersWithUsers();
    res.json(orders);
});

// ---- Startup ----------------------------------------------------------------

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    Wiring.init('HTTP listener', Date.now() - startupBegin);
    console.log('');
    console.log(`CodeWiringKit demo listening on http://localhost:${PORT}`);
    console.log('');
    console.log('Try:');
    console.log(`  curl http://localhost:${PORT}/users`);
    console.log(`  curl http://localhost:${PORT}/users/1`);
    console.log(`  curl http://localhost:${PORT}/users/999`);
    console.log(`  curl -X POST http://localhost:${PORT}/users \\`);
    console.log(`       -H "Content-Type: application/json" \\`);
    console.log(`       -d '{"name":"Dan","email":"dan@example.com"}'`);
    console.log(`  curl http://localhost:${PORT}/orders`);
    console.log('');
    console.log('Every [WIRING] line below is the trace — pipe it to a file to');
    console.log('produce sample-trace.log, then feed that trace to your AI assistant.');
    console.log('');
});
