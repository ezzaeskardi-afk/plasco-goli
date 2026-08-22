// ============================================================
// بنچمارک خواندن — «N نفر همزمان در حال جستجو و مشاهده لیست»
//
// Run:  cd backend  ->  node bench-read.js [N=400] [PORT=3999]
//
// این بنچمارک اثر کش statement و ایندکس‌ها را روی مسیرهای خواندنی
// (لیست محصولات، جستجو، صفحه محصول) اندازه می‌گیرد.
// ============================================================

const { spawn } = require('child_process');
const path = require('path');

const { makeSandboxData, removeSandboxData, sandboxPictureDir } = require('./tests/sandbox');
const SANDBOX_DATA = makeSandboxData();
process.env.PG_DATA_DIR = SANDBOX_DATA;
process.env.PG_PICTURE_DIR = sandboxPictureDir(SANDBOX_DATA);

const N = Math.max(1, parseInt(process.argv[2], 10) || 400);
const PORT = parseInt(process.argv[3], 10) || 3999;

const BASE = `http://127.0.0.1:${PORT}`;
require('dotenv').config();
const db = require('./lib/db');

function fakeIp(i) {
  return `10.20.${Math.floor(i / 250)}.${(i % 250) + 1}`;
}

// ---------- seed: محصولات тестی ----------
function seed() {
  const categories = ['تشت و لگن', 'صندلی و میز', 'ظروف نگهداری', 'سبد و جالباسی', 'لوازم آشپزخانه', 'لوازم نظافت'];
  const products = [];
  const titles = [
    'ست تشت و کاسه چهار عددی', 'دراور چهار کشو طرح حصیری', 'چوب لباسی سه عددی',
    'باکس نگهداری مواد غذایی', 'سبد لباس چرخ‌دار', 'میز عسلی پلاستیکی',
    'آبچکان ظرفشویی رو میزی', 'جاشامپویی آویز سه طبقه', 'سطل زباله پدال‌دار',
    'نردبان تاشو آلومینیومی', 'فرچه توالت', 'جارو و خاک‌انداز',
    'اسفنج ظرفشویی پنج عددی', 'کف‌شور دستی', 'دستمال میکروفایبر',
    'سینی چهارخانه', 'گلدان پلاستیکی رنگی', 'بادکنک تزئینی',
    'ظرف نان‌پزی', 'بشقاب میوه‌خوری', 'قابلمه تفلون', 'کتری استیل',
    'ماگ چاپی', 'لیوان شیشه‌ای', 'بطری آب ورزشی',
    'قیچی آشپزخانه', 'رنده دستی', 'آبمیوه‌گیری دستی',
    'گوشت‌کوب برقی', 'مخلوط‌کن', 'همزن دستی'
  ];

  for (let i = 0; i < 100; i++) {
    const title = titles[i % titles.length] + (i >= titles.length ? ` (${Math.floor(i / titles.length) + 1})` : '');
    const cat = categories[i % categories.length];
    const p = db.adminCreateProduct({
      title, category: cat, image: i % 3 === 0 ? '' : `/picture/products/test-${i}.jpg`,
      icon: 'i-package', description: `توضیحات محصول ${title}`, price: 50000 + i * 1000,
      old_price: i % 5 === 0 ? 60000 + i * 1000 : 0, badge: i % 10 === 0 ? '%۱۰ تخفیف' : '',
      stock: 10 + (i % 20)
    });
    if (p && p.id) products.push(p);
  }
  console.log(`   seeded ${products.length} products in ${categories.length} categories\n`);
  return { products, categories };
}

// ---------- اندازه‌گیری ----------
function percentile(sorted, p) {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)];
}

function summarize(name, latencies, statuses, errors) {
  const sorted = [...latencies].sort((a, b) => a - b);
  const ok = statuses.filter(s => s >= 200 && s < 300).length;
  const total = statuses.length;
  const byStatus = {};
  for (const s of statuses) byStatus[s] = (byStatus[s] || 0) + 1;
  console.log(`  ${name}`);
  console.log(`    total: ${total}  ok: ${ok}  fail: ${total - ok}  (${((ok / total) * 100).toFixed(1)}%)`);
  if (total > ok && errors.length) {
    const sample = errors[0];
    console.log(`    error sample: [${sample.status}] ${sample.body.slice(0, 100)}`);
  }
  console.log(`    p50:${percentile(sorted, 50)} p90:${percentile(sorted, 90)} p95:${percentile(sorted, 95)} p99:${percentile(sorted, 99)} max:${sorted[sorted.length - 1] || 0} ms`);
  return { ok, total };
}

// ---------- اجرا ----------
const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  cwd: __dirname,
  env: { ...process.env, PORT: String(PORT), WRITE_RATE_LIMIT: '100000', API_RATE_LIMIT: '100000', TRUST_PROXY: '1' },
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverOut = '';
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', d => { serverOut += d; });
child.stderr.on('data', d => { serverOut += d; });

function shutdown(code) {
  try { child.kill(); } catch (e) {}
  setTimeout(() => { removeSandboxData(SANDBOX_DATA); process.exit(code); }, 800);
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function runBatch(name, items) {
  const lat = [], statuses = [], errors = [];
  await Promise.all(items.map(async ({ url, ip }) => {
    const t0 = Date.now();
    try {
      const res = await fetch(url, { headers: { 'X-Forwarded-For': ip } });
      const body = await res.text();
      statuses.push(res.status);
      if (res.status >= 400) errors.push({ status: res.status, body });
    } catch (e) { statuses.push(0); errors.push({ status: 0, body: e.message }); }
    lat.push(Date.now() - t0);
  }));
  return summarize(name, lat, statuses, errors);
}

function items(n, urlFn) {
  return Array.from({ length: n }, (_, i) => ({ url: urlFn(i), ip: fakeIp(i) }));
}

async function main() {
  console.log(`\n>> bench-read: ${N} concurrent readers | port ${PORT}\n`);

  const { products, categories } = seed();

  let up = false;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`${BASE}/api/health`); if (r.status === 200) { up = true; break; } } catch (e) {}
    await sleep(500);
  }
  if (!up) { console.error('[FAIL] server did not come up:\n' + serverOut.slice(-2000)); return shutdown(1); }

  console.log('== warming up ==\n');
  for (let i = 0; i < 5; i++) {
    await fetch(`${BASE}/api/products?limit=20`);
    await fetch(`${BASE}/api/products?q=${encodeURIComponent('تشت')}`);
    await fetch(`${BASE}/api/products/facets`);
    await fetch(`${BASE}/api/shop/categories`);
    if (products[i]) await fetch(`${BASE}/api/products/${products[i].id}`);
  }

  console.log('== benchmarking ==\n');

  await runBatch('GET /api/products (listing, 20/page)',
    items(N, i => `${BASE}/api/products?limit=20&offset=${(i % 5) * 20}`));

  await runBatch('GET /api/products?category=... (filtered)',
    items(N, i => `${BASE}/api/products?category=${encodeURIComponent(categories[i % categories.length])}&limit=20`));

  const searchTerms = ['تشت', 'سبد', 'میز', 'آشپزخانه', 'نظافت', 'نگهداری', 'پلاستیک', 'سرویس'];
  await runBatch('GET /api/products?q=... (search)',
    items(N, i => `${BASE}/api/products?q=${encodeURIComponent(searchTerms[i % searchTerms.length])}&limit=20`));

  await runBatch('GET /api/products/facets',
    items(N, () => `${BASE}/api/products/facets`));

  await runBatch('GET /api/products/:id (detail)',
    items(N, i => `${BASE}/api/products/${products[i % products.length].id}`));

  await runBatch('GET /api/products/:id/related',
    items(N, i => `${BASE}/api/products/${products[i % products.length].id}/related`));

  await runBatch('GET /api/shop/categories',
    items(N, () => `${BASE}/api/shop/categories`));

  try {
    const h = await fetch(`${BASE}/api/health?full=1`).then(r => r.json());
    console.log(`\n== post-load health ==`);
    console.log(`   db.ok=${h.db?.ok}  dbMs=${h.db?.queryMs}  rss=${h.memoryMb?.rss}MB  heap=${h.memoryMb?.heapUsed}MB`);
  } catch (e) {}

  shutdown(0);
}

main().catch(e => { console.error('bench failed:', e); shutdown(1); });
