// ============================================================
// بنچمارک بار — «N نفر همزمان در حال خرید»
//
// Run:  cd backend  ->  node bench-load.js [N=400] [PORT=3998] [BYPASS_LIMITS=1]
//
// BYPASS_LIMITS=0 یعنی سرور با سقف‌های نرخِ واقعی بالا می‌آید تا ببینیم
// «کاربر واقعی پشت CGNAT» چه می‌بیند. BYPASS_LIMITS=1 (پیش‌فرض) سقف‌ها را باز
// می‌کند تا رفتارِ خامِ دیتابیس/روت را بسنجیم، نه رفتارِ سقف را.
// ============================================================

const { spawn } = require('child_process');
const path = require('path');

const { makeSandboxData, removeSandboxData, sandboxPictureDir } = require('./tests/sandbox');
const SANDBOX_DATA = makeSandboxData();
process.env.PG_DATA_DIR = SANDBOX_DATA;
process.env.PG_PICTURE_DIR = sandboxPictureDir(SANDBOX_DATA);

const N = Math.max(1, parseInt(process.argv[2], 10) || 400);
const PORT = parseInt(process.argv[3], 10) || 3998;
const BYPASS = process.argv[4] !== '0'; // پیش‌فرض: باز
// هر کاربر یک IP مجزا بگیرد (شبیه ۴۰۰ مشتری واقعی) یا همه از یک IP (شبیه CGNAT)؟
const DISTINCT_IPS = process.argv[5] !== '0'; // پیش‌فرض: IP مجزا

const BASE = `http://127.0.0.1:${PORT}`;
require('dotenv').config();
const crypto = require('crypto');
const db = require('./lib/db');

// کوکی سشنِ express-session امضاشده است: s:sid.signature
// امضا = HMAC-SHA256(sid, secret) به base64 بدون padding (همان cookie-signature).
const SECRET = process.env.SESSION_SECRET || 'pg-dev-secret';
function signedCookie(sid) {
  const sig = crypto.createHmac('sha256', SECRET).update(sid).digest('base64').replace(/=+$/, '');
  return `s:${sid}.${sig}`;
}

// ---------- seed: کالای تستی + N کاربر + آدرس + سشن آماده ----------
function seed() {
  const product = db.adminCreateProduct({
    title: 'BENCH LOAD (auto-cleanup)', category: 'Test', image: '', icon: 'i-package',
    description: 'کالای موقت بنچمارک', price: 100000, old_price: 0, badge: '', stock: N * 10
  });
  if (!product || !product.id) throw new Error('could not create bench product');

  const expires = Date.now() + 30 * 24 * 3600 * 1000;
  const ins = db.db.prepare('INSERT INTO sessions (sid, data, expires_at) VALUES (?, ?, ?)');
  const users = [];
  for (let i = 0; i < N; i++) {
    const phone = '0915' + String(1000000 + i);
    const user = db.findOrCreateUser(phone);
    const addr = db.createAddress(user.id, {
      fullName: 'Buyer ' + i, phone, city: 'Sari', addressLine: 'Bench Street ' + i, postalCode: ''
    });
    // سشن آماده با سبدِ یک‌قلمی — مثل کاربری که تازه وارد شده و کالا را در سبد دارد
    const sid = 'bench-' + i + '-' + Math.random().toString(36).slice(2, 10);
    // sidِ داخل دیتابیس باید همان چیزی باشد که از کوکیِ امضاشده بیرون می‌آید؛
    // express-session بعد از unsign فقط قسمتِ sid را به store می‌دهد.
    ins.run(sid, JSON.stringify({
      cookie: {
        originalMaxAge: 30 * 24 * 3600 * 1000,
        expires: new Date(expires).toISOString(),
        secure: false, httpOnly: true, path: '/', sameSite: 'lax'
      },
      userId: user.id,
      isAdmin: 0,
      cart: [{ productId: product.id, qty: 1 }]
    }), expires);
    // IP ساختگیِ مجزا برای هر کاربر (وقتی TRUST_PROXY روشن است) — در غیر این
    // صورت همه از 127.0.0.1 می‌آیند و سقفِ IP مشترک می‌شود.
    const fakeIp = DISTINCT_IPS ? `10.20.${Math.floor(i / 250)}.${(i % 250) + 1}` : null;
    users.push({ id: user.id, addrId: addr.id, sid, fakeIp });
  }
  return { product, users };
}

// ---------- اندازه‌گیری ----------
function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}
function summarize(name, latencies, statuses) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const ok = statuses.filter(s => s >= 200 && s < 300).length;
  const total = statuses.length;
  const byStatus = {};
  for (const s of statuses) byStatus[s] = (byStatus[s] || 0) + 1;
  console.log(`\n== ${name} ==`);
  console.log(`  total: ${total}  ok: ${ok}  fail: ${total - ok}  (${((ok / total) * 100).toFixed(1)}% success)`);
  console.log(`  latency ms -> p50:${percentile(sorted, 50)} p90:${percentile(sorted, 90)} p95:${percentile(sorted, 95)} p99:${percentile(sorted, 99)} max:${sorted[sorted.length - 1] || 0}`);
  console.log(`  by status: ${JSON.stringify(byStatus)}`);
  return { ok, total };
}

// ---------- اجرا ----------
const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  cwd: __dirname,
  env: {
    ...process.env,
    PORT: String(PORT),
    // trust proxy روشن تا X-Forwarded-Forِ ساختگی، IP هر کاربر را مجزا کند.
    // (فقط داخل بنچمارک؛ در واقعیت TRUST_PROXY فقط پشت nginx/Cloudflare روشن است.)
    ...(BYPASS ? { WRITE_RATE_LIMIT: '100000', API_RATE_LIMIT: '100000', TRUST_PROXY: '1' } : {})
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverOut = '';
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', d => { serverOut += d; });
child.stderr.on('data', d => { serverOut += d; });

function shutdown(code) {
  try { child.kill(); } catch (e) { /* ignore */ }
  setTimeout(() => { removeSandboxData(SANDBOX_DATA); process.exit(code); }, 800);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  console.log(`\n>> bench-load: ${N} concurrent buyers | port ${PORT} | ${BYPASS ? 'limits OPEN (raw perf)' : 'limits REAL (CGNAT view)'}\n`);

  const { product, users } = seed();
  console.log(`   seeded ${users.length} users + product (stock ${product.stock})\n`);

  let up = false;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.status === 200) { up = true; break; } } catch (e) {}
    await sleep(500);
  }
  if (!up) { console.error('[FAIL] server did not come up:\n' + serverOut.slice(-2000)); return shutdown(1); }

  const hdrs = (u) => ({ Cookie: `polasco.sid=${signedCookie(u.sid)}`, ...(u.fakeIp ? { 'X-Forwarded-For': u.fakeIp } : {}) });

  // ---------- خواندنِ همزمان (سبد/محصولات) ----------
  {
    const lat = [], statuses = [];
    await Promise.all(users.slice(0, N).map(async (u) => {
      const t0 = Date.now();
      try {
        const res = await fetch(`${BASE}/api/cart`, { headers: hdrs(u) });
        await res.text();
        statuses.push(res.status);
      } catch (e) { statuses.push(0); }
      lat.push(Date.now() - t0);
    }));
    summarize('concurrent GET /api/cart', lat, statuses);
  }

  // ---------- ثبت سفارش همزمان ----------
  const lat = [], statuses = [], errors = [];
  const tStart = Date.now();
  await Promise.all(users.map(async (u) => {
    const t0 = Date.now();
    try {
      const res = await fetch(`${BASE}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': `bench-${u.id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
          ...hdrs(u)
        },
        body: JSON.stringify({ addressId: u.addrId })
      });
      const text = await res.text();
      statuses.push(res.status);
      if (res.status < 200 || res.status >= 300) errors.push({ status: res.status, body: text.slice(0, 200) });
    } catch (e) { statuses.push(0); errors.push({ status: 0, body: e.message }); }
    lat.push(Date.now() - t0);
  }));
  const wall = Date.now() - tStart;
  const orderResult = summarize('concurrent POST /api/orders', lat, statuses);
  console.log(`   wall time: ${wall} ms  (throughput: ${((N / wall) * 1000).toFixed(1)} req/s)`);

  // رگرسیون‌چک: در سناریوی «همه از یک IP» (CGNAT) هم باید همه‌ی سفارش‌ها ثبت شوند.
  // اگر کمتر از ۱۰۰٪ بود یعنی دوباره سقفی با کلیدِ IP کاربرهای واقعی را می‌گیرد.
  if (orderResult.ok !== orderResult.total) {
    console.error(`\n[FAIL] order success ${orderResult.ok}/${orderResult.total} — CGNAT users are being rate-limited`);
    return shutdown(1);
  }
  console.log('\n[PASS] all concurrent buyers succeeded (no shared-IP rate-limit starvation)');
  if (errors.length) {
    const sample = {};
    for (const e of errors) { const k = `${e.status}:${e.body.slice(0, 80)}`; sample[k] = (sample[k] || 0) + 1; }
    console.log('   error samples:');
    for (const [k, n] of Object.entries(sample).slice(0, 12)) console.log(`     [${n}x] ${k}`);
    if (errors.length > 12) console.log(`     ...and ${errors.length - 12} more`);
  }

  // سلامت پس از بار
  try {
    const h = await fetch(`${BASE}/api/health?full=1`).then(r => r.json());
    console.log(`\n   post-load health: db.ok=${h.db?.ok} dbMs=${h.db?.queryMs} rss=${h.memoryMb?.rss}MB heap=${h.memoryMb?.heapUsed}MB`);
  } catch (e) {}

  shutdown(0);
}

main().catch(e => { console.error('bench failed:', e); shutdown(1); });
