const path = require('path');

// ---------------------------------------------------------------------------
// Live search view
// Every LDAP search from a phone is recorded here, printed as one tidy line in
// the terminal, and pushed to any open /live page over Server-Sent Events.
// ---------------------------------------------------------------------------
const MAX_EVENTS = 100;
const MERGE_WINDOW_MS = 15 * 1000; // same number from several phones = one call
const HEARTBEAT_MS = 25 * 1000;

const events = []; // oldest first
const clients = new Set();
let nextId = 1;

// Optional friendly names for phones: PHONE_LABELS="192.168.0.101=Reception,192.168.0.103=Office"
const phoneLabels = new Map(
    (process.env.PHONE_LABELS || '')
        .split(',')
        .map((pair) => pair.split('=').map((s) => s.trim()))
        .filter(([ip, label]) => ip && label)
);

function labelFor(ip) {
    const clean = String(ip || '').replace(/^::ffff:/, '');
    return phoneLabels.get(clean) || clean;
}

// 0430139124 → "0430 139 124", 0291234567 → "02 9123 4567"
function formatNumber(digits) {
    if (/^04\d{8}$/.test(digits)) return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
    if (/^0[2378]\d{8}$/.test(digits)) return `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`;
    return digits;
}

function broadcast(event) {
    const payload = `event: search\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of clients) client.write(payload);
}

const RESET = '\x1b[0m';
const COLORS = { call: '\x1b[32m', unknown: '\x1b[33m', find: '\x1b[36m', dim: '\x1b[90m' };

function logLine(event, ms) {
    const time = new Date(event.time).toTimeString().slice(0, 8);
    const names = event.results.map((r) => r.name);
    const sources = `${COLORS.dim}[${event.sources.join(', ')} · ${ms}ms]${RESET}`;

    if (event.kind === 'call') {
        const color = names.length ? COLORS.call : COLORS.unknown;
        const who = names.length ? names.join(', ') : '(not in contacts)';
        console.log(`${time}  ${color}CALL${RESET}  ${event.display.padEnd(13)}  ${who}  ${sources}`);
    } else {
        const shown = names.slice(0, 3).join(', ') + (names.length > 3 ? ` +${names.length - 3}` : '');
        const result = names.length ? `${names.length} found: ${shown}` : 'no match';
        console.log(`${time}  ${COLORS.find}FIND${RESET}  "${event.display}"  ${result}  ${sources}`);
    }
}

// kind: 'call' (search by phone number) or 'find' (search by name)
// results: [{ name, number }]
function publishSearch({ kind, query, source, results, ms }) {
    const now = Date.now();
    const sourceLabel = labelFor(source);

    if (kind === 'call') {
        const existing = events.find((e) => e.kind === 'call' && e.query === query && now - e.time < MERGE_WINDOW_MS);
        if (existing) {
            // Another phone asked about the same call: merge instead of listing it twice
            const hadSource = existing.sources.includes(sourceLabel);
            if (!hadSource) existing.sources.push(sourceLabel);

            let gotNewResult = false;
            for (const r of results) {
                if (!existing.results.some((x) => x.name === r.name && x.number === r.number)) {
                    existing.results.push(r);
                    gotNewResult = true;
                }
            }
            if (!hadSource || gotNewResult) broadcast(existing);
            if (gotNewResult) logLine(existing, ms);
            return;
        }
    }

    const event = {
        id: nextId++,
        kind,
        time: now,
        query,
        display: kind === 'call' ? formatNumber(query) : query,
        results,
        sources: [sourceLabel],
    };
    events.push(event);
    if (events.length > MAX_EVENTS) events.shift();

    logLine(event, ms);
    broadcast(event);
}

// The page shows caller names, so keep it on the server PC unless told otherwise
function localOnly(req, res, next) {
    if (process.env.LIVE_ALLOW_LAN === '1') return next();
    const ip = String(req.socket.remoteAddress || '').replace(/^::ffff:/, '');
    if (ip === '127.0.0.1' || ip === '::1') return next();
    res.status(403).send('The live view is only available on the server PC. Set LIVE_ALLOW_LAN=1 to open it to the LAN.');
}

function mountLive(app) {
    app.use('/live', localOnly);

    app.get('/live', (req, res) => {
        res.sendFile(path.join(__dirname, 'live.html'));
    });

    app.get('/live/events', (req, res) => {
        res.set({
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
        });
        res.flushHeaders();
        res.write('retry: 3000\n');
        res.write(`event: init\ndata: ${JSON.stringify(events)}\n\n`);

        clients.add(res);
        req.on('close', () => clients.delete(res));
    });

    setInterval(() => {
        for (const client of clients) client.write(': ping\n\n');
    }, HEARTBEAT_MS).unref();
}

module.exports = { mountLive, publishSearch };
