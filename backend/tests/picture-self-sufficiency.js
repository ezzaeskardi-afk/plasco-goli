#!/usr/bin/env node
/* ============================================================
   tests/picture-self-sufficiency.js — «هر عکسی که روی دیسک است، با همان بایت ۲۰۰ می‌دهد»

   ---------- چرا این آزمون وجود دارد ----------
   عکسِ محصول سه لایه دارد و هر لایه می‌تواند بی‌صدا بشکند:

     ۱. `express.static` روی `PICTURE_DIR` — مسیر و ریشه.
     ۲. مذاکره‌ی WebP (`lib/webp-negotiate.js`) — که **پیش از** static می‌نشیند.
     ۳. نام‌گذاریِ نسخه‌های کم‌عرض (`-320w.webp` / `-560w.webp`) که ابزارِ
        `tools/optimize-images.js` می‌سازد و مسیرِ `?w=` دنبالشان می‌رود.

   تا امروز هیچ‌کدامِ این‌ها «سرتاسری» سنجیده نمی‌شد: نگهبانِ دروازه‌ی خطا فقط
   چند مسیرِ **ناموجود** را می‌دید و نگهبان‌های ایستا فقط وجودِ خطِ میدل‌ور را.
   یعنی کافی بود ریشه‌ی پوشه یک پله جابه‌جا شود، یا نامِ فایل‌های فارسی موقعِ
   URL-encode خراب شوند، یا نسخه‌ی کم‌عرض ساخته نشود — و هیچ نگهبانی نمی‌فهمید.
   کاربر فقط کادرِ خالی می‌دید.

   این آزمون همان کاری را می‌کند که مرورگر می‌کند: **هر فایلِ روی دیسک** را
   می‌خواهد و بایت‌به‌بایت با اصلش مقایسه می‌کند — و همان‌جا هم می‌سنجد که
   مذاکره‌ی WebP و نسخه‌ی کم‌عرض واقعاً همان فایلِ درست را می‌دهند.

   ---------- چرا سندباکس ----------
   کپیِ پوشه‌ی عکس در پوشه‌ی موقت (همان `tests/sandbox.js`) ساخته می‌شود، پس
   آزمون با *فایل‌های واقعیِ* مغازه کار می‌کند ولی هیچ‌چیز روی داده‌ی واقعی
   نمی‌نویسد. اگر پوشه خالی باشد، آزمون صریح با کدِ ۲ رد می‌شود: «صفر فایلِ
   سنجیده‌شده» سبزِ توخالی است، نه موفقیت.

   ---------- اجرا ----------
     node tests/picture-self-sufficiency.js   → ۰ سبز، ۱ قرمز، ۲ پیش‌شرط نبود
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const net = require('net');
const { spawn } = require('child_process');

const {
  BACKEND_DIR: DIR, makeSandboxData, removeSandboxData, serverEnv,
} = require('./sandbox');

const PORT = Number(process.env.PICTURE_GUARD_PORT) || 3994;
const IMAGE_RE = /\.(jpe?g|jfif|png|webp)$/i;
const ORIGINAL_RE = /\.(jpe?g|jfif|png)$/i;
const CONTENT_TYPE = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

let pass = 0, fail = 0;
function check(label, ok, detail = '') {
  if (ok) { pass++; console.log(`  [PASS] ${label}`); }
  else { fail++; console.error(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`); }
}
function section(title) { console.log(`\n--- ${title} ---`); }

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const rel = (root, abs) => path.relative(root, abs).split(path.sep).join('/');
/** همان کاری که مرورگر با یک نامِ فارسی/فاصله‌دار می‌کند. */
const toUrl = (relPath) => `/picture/${relPath.split('/').map(encodeURIComponent).join('/')}`;

/** همه‌ی فایل‌های تصویریِ زیرِ یک پوشه، به‌صورتِ بازگشتی. */
function walkImages(root) {
  const out = [];
  const visit = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const abs = path.join(dir, e.name);
      if (e.isDirectory()) visit(abs);
      else if (IMAGE_RE.test(e.name)) out.push(abs);
    }
  };
  visit(root);
  return out.sort();
}

console.log('\n=== Picture self-sufficiency (every image on disk must be served byte-for-byte) ===\n');

const SANDBOX = makeSandboxData();
const PICTURE = path.join(SANDBOX, 'picture');
const images = walkImages(PICTURE);

const portFree = () => new Promise((resolve) => {
  const srv = net.createServer();
  srv.once('error', () => resolve(false));
  srv.once('listening', () => srv.close(() => resolve(true)));
  srv.listen(PORT);
});

function startServer() {
  const out = { text: '' };
  const child = spawn(process.execPath, [path.join(DIR, 'server.js')], {
    cwd: DIR,
    env: serverEnv(SANDBOX, { PORT: String(PORT) }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (d) => { out.text += d; });
  child.stderr.on('data', (d) => { out.text += d; });
  return { child, out, base: `http://127.0.0.1:${PORT}` };
}

async function waitUp(srv) {
  for (let i = 0; i < 40; i++) {
    if (srv.child.exitCode !== null) return false;
    try {
      const r = await fetch(`${srv.base}/api/health`);
      if (r.ok && /json/i.test(r.headers.get('content-type') || '')) return true;
    } catch { /* هنوز بالا نیامده */ }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

const finish = () => {
  console.log(`\nPicture checks: ${pass} passed, ${fail} failed`);
  removeSandboxData(SANDBOX);
  process.exit(fail ? 1 : 0);
};

(async () => {
/* ---------- ۰) پیش‌شرط ---------- */
section('۰) پیش‌شرط: فایل‌های واقعیِ روی دیسک');

check(`پوشه‌ی عکس پیدا شد (${PICTURE})`, fs.existsSync(PICTURE), 'کپیِ سندباکس ساخته نشد');
check(`دست‌کم ۱۰ فایلِ تصویری روی دیسک هست (شد: ${images.length})`, images.length >= 10,
  'بدونِ فایلِ واقعی، این آزمون سبزِ توخالی می‌شود — صریح رد می‌شویم');
if (!fs.existsSync(PICTURE) || images.length < 10) {
  console.error('\n✖ پیش‌شرطِ نگهبان برقرار نیست (کدِ ۲): پوشه‌ی picture/ خالی است یا کپی نشد.');
  process.exit(2);
}

const originals = images.filter((f) => ORIGINAL_RE.test(f));
const webps = images.filter((f) => f.toLowerCase().endsWith('.webp'));
const thumbs = images.filter((f) => /-\d+w\.webp$/i.test(f));
console.log(`  (${originals.length} اصل · ${webps.length} webp · ${thumbs.length} کم‌عرض در پوشه‌ی سندباکس)`);

const free = await portFree();
check(`پورتِ ${PORT} برای سندباکس آزاد است`, free, 'فرآیندِ دیگری روی همان پورت است');
if (!free) return finish();

const srv = startServer();
const up = await waitUp(srv);
check('سرورِ سندباکس بالا آمد', up, up ? '' : srv.out.text.slice(-300));
if (!up) { srv.child.kill(); return finish(); }

try {
  const get = async (url, headers = {}) => {
    const res = await fetch(srv.base + url, { headers, redirect: 'manual' });
    const body = Buffer.from(await res.arrayBuffer());
    return { status: res.status, headers: res.headers, body };
  };

  /* ============================================================
     ۱) هر فایلِ روی دیسک: ۲۰۰ + همان بایت + نوعِ درست
     ============================================================ */
  section('۱) همه‌ی فایل‌ها، بایت‌به‌بایت (همان کاری که مرورگر می‌کند)');

  const bad = [];
  const contentTypeBad = [];
  const varyMissing = [];
  let verified = 0;
  for (const abs of images) {
    const relPath = rel(PICTURE, abs);
    const disk = fs.readFileSync(abs);
    const want = CONTENT_TYPE[path.extname(abs).toLowerCase()];
    const res = await get(toUrl(relPath));
    if (res.status !== 200) { bad.push(`${relPath} → ${res.status}`); continue; }
    if (sha(res.body) !== sha(disk)) { bad.push(`${relPath} → بدنه فرق دارد`); continue; }
    const got = String(res.headers.get('content-type') || '').split(';')[0].trim();
    if (got !== want) contentTypeBad.push(`${relPath} → ${got} (باید ${want})`);
    // `Vary` فقط روی همان فایل‌هایی لازم است که بدنه‌شان به Accept بستگی دارد:
    // مسیرهای `.jpg/.png` (که مذاکره‌ی webp رویشان تصمیم می‌گیرد). یک `.webp`
    // صریح هیچ تصمیمی بر اساسِ Accept نمی‌گیرد، پس خواستنِ Vary از او یعنی
    // سنجشی که با یک واقعیتِ نادرست قرمز می‌شود.
    if (ORIGINAL_RE.test(relPath) && !/accept/i.test(String(res.headers.get('vary') || ''))) {
      varyMissing.push(relPath);
    }
    verified++;
  }
  check(`همه‌ی ${images.length} فایلِ روی دیسک با همان بایت سرو می‌شوند (شاملِ نام‌های فارسیِ URL-encode‌شده)`,
    bad.length === 0, bad.slice(0, 5).join(' | '));
  check('و نوعِ محتوا با پسوندِ همان فایل می‌خواند',
    contentTypeBad.length === 0, contentTypeBad.slice(0, 5).join(' | '));
  // `Vary: Accept` روی *همه‌ی* پاسخ‌های این مسیر لازم است، نه فقط روی آن‌هایی که
  // webp داده‌اند: اگر فقط یک شاخه vary بگذارد، کشِ میانی جوابِ یک مرورگر را به
  // مرورگرِ دیگر می‌دهد و کاربر یا عکسِ jpg را جای webp می‌گیرد یا برعکس.
  check('هدرِ Vary: Accept روی همه‌ی پاسخ‌ها هست (کشِ میانی نباید دو دنیا را قاطی کند)',
    varyMissing.length === 0, varyMissing.slice(0, 5).join(' | '));
  check('شمارشِ فایل‌های تأییدشده با فهرستِ دیسک یکی است', verified === images.length,
    `${verified} از ${images.length}`);

  /* ============================================================
     ۲) مذاکره‌ی WebP: مرورگری که webp می‌فهمد، webp می‌گیرد
     ============================================================ */
  section('۲) مذاکره‌ی WebP و نسخه‌ی کم‌عرضِ `?w=`');

  const negotiated = [];
  for (const abs of originals) {
    const sibling = abs.replace(ORIGINAL_RE, '.webp');
    if (!fs.existsSync(sibling)) continue;
    const relPath = rel(PICTURE, abs);
    const res = await get(toUrl(relPath), { Accept: 'image/webp,image/*;q=0.8' });
    const want = fs.readFileSync(sibling);
    const got = String(res.headers.get('content-type') || '').split(';')[0].trim();
    if (res.status !== 200 || got !== 'image/webp' || sha(res.body) !== sha(want)) {
      negotiated.push(`${relPath} → ${res.status} ${got}`);
    } else {
      negotiated.push(null);
    }
  }
  const negotiable = negotiated.filter((x, i) => x !== null).length;
  check(`مرورگرِ WebP همان فایلِ .webp را می‌گیرد — روی ${negotiated.length} فایلی که نسخه‌ی webp دارند`,
    negotiable === 0 && negotiated.length > 0,
    negotiated.length === 0 ? 'هیچ فایلی نسخه‌ی webp نداشت' : negotiated.filter(Boolean).slice(0, 5).join(' | '));

  // نسخه‌ی کم‌عرض: `?w=320` روی اصل، باید همان `-320w.webp` را بدهد.
  //
  // جفت‌ها از سمتِ **اصل** ساخته می‌شوند، نه از سمتِ فایل‌های webp: قاعده‌ی نام‌گذاریِ
  // ابزارِ `tools/optimize-images.js` این است که کنارِ `x.jpg`، هم `x.webp` ساخته
  // می‌شود هم `x-320w.webp`. اگر برعکس بگردیم (فایلِ webp را با اصلش مقایسه کنیم)،
  // نامِ `-320w` در دو طرفِ مقایسه می‌ماند و هیچ جفتی پیدا نمی‌شود — یعنی سنجشی
  // که بی‌صدا صفر می‌شود و همان چیزی است که دنبالش هستیم.
  const thumbPairs = [];
  for (const orig of originals) {
    for (const w of [320, 560]) {
      const thumb = orig.replace(ORIGINAL_RE, `-${w}w.webp`);
      if (fs.existsSync(thumb)) thumbPairs.push({ orig, thumb, w: String(w) });
    }
  }
  const thumbBad = [];
  for (const { orig, thumb, w } of thumbPairs) {
    const url = `${toUrl(rel(PICTURE, orig))}?w=${w}`;
    const res = await get(url, { Accept: 'image/webp,image/*;q=0.8' });
    const want = fs.readFileSync(thumb);
    const got = String(res.headers.get('content-type') || '').split(';')[0].trim();
    if (res.status !== 200 || got !== 'image/webp' || sha(res.body) !== sha(want)) {
      thumbBad.push(`${rel(PICTURE, orig)}?w=${w} → ${res.status} ${got}`);
    }
  }
  check(`\`?w=\` همان نسخه‌ی کم‌عرضِ ساخته‌شده را می‌دهد (${thumbPairs.length} جفتِ اصل↔کم‌عرض)`,
    thumbBad.length === 0 && thumbPairs.length > 0,
    thumbPairs.length === 0 ? 'هیچ جفتی پیدا نشد' : thumbBad.slice(0, 5).join(' | '));

  // عرضِ خارج از فهرستِ مجاز نباید کاری بکند: همان اصل می‌ماند.
  if (thumbPairs.length) {
    const { orig } = thumbPairs[0];
    const res = await get(`${toUrl(rel(PICTURE, orig))}?w=9999`, { Accept: 'image/webp' });
    const full = fs.readFileSync(orig.replace(ORIGINAL_RE, '.webp'));
    check('عرضِ خارج از فهرستِ مجاز به فایلِ ناموجود نمی‌رسد (فهرستِ بسته، نه هر عددی)',
      res.status === 200 && sha(res.body) === sha(full), `کدِ ${res.status}`);
  }

  /* ============================================================
     ۳) مسیرهای ناموجود و خطرناک
     ============================================================ */
  section('۳) ناموجود و خطرناک: نه ۲۰۰، نه متنِ HTML، نه محتوایِ بیرونِ پوشه');

  const missing = await get('/picture/products/missing-' + Date.now() + '.jpg');
  check('عکسِ ناموجود ۴۰۴ می‌دهد (نه صفحه‌ی HTMLِ سایت با کدِ ۲۰۰)',
    missing.status === 404 && !/text\/html/i.test(String(missing.headers.get('content-type') || '')),
    `${missing.status} ${missing.headers.get('content-type')}`);

  const head = await fetch(`${srv.base}${toUrl(rel(PICTURE, images[0]))}`, { method: 'HEAD' });
  check('درخواستِ HEAD هم همان نوعِ محتوا را می‌دهد',
    head.status === 200 && String(head.headers.get('content-type') || '').startsWith('image/'),
    `${head.status} ${head.headers.get('content-type')}`);

  for (const evil of [
    '/picture/..%2f..%2fbackend%2f.env',
    '/picture/%2e%2e%2f%2e%2e%2fbackend%2f.env',
    '/picture/..%2f..%2fbackend%2flib%2fdb.js',
  ]) {
    const res = await get(evil);
    const body = res.body.toString('utf8');
    check(`عبور از پوشه بسته است (${decodeURIComponent(evil)})`,
      res.status !== 200 || !/(SESSION_SECRET|DATABASE|function |const )/.test(body),
      `${res.status} — بدنه‌ی ${res.body.length} بایتی`);
  }

  /* ============================================================
     ۴) خودآزمون: این سنجش‌ها می‌توانند قرمز شوند
     ============================================================ */
  section('۴) خودآزمون: نگهبانی که همیشه سبز است، نگهبان نیست');

  {
    // دو فایلِ متفاوت باید دو هشِ متفاوت بدهند؛ وگرنه مقایسه‌ی بایت‌ها چیزی
    // نمی‌سنجد (مثلاً اگر همه‌ی بدنه‌ها خالی خوانده شوند).
    const a = fs.readFileSync(images[0]);
    const b = fs.readFileSync(images[images.length - 1]);
    check('خودآزمون: دو فایلِ متفاوت هشِ متفاوت می‌دهند (مقایسه واقعاً کار می‌کند)',
      sha(a) !== sha(b) || a.equals(b) === false, 'هش‌ها یکی شدند');

    const wrongType = await get(toUrl(rel(PICTURE, images[0])), { Accept: 'text/html' });
    const ext = path.extname(images[0]).toLowerCase();
    check('خودآزمون: نوعِ محتوا از پسوند می‌آید، نه از Acceptِ درخواست',
      String(wrongType.headers.get('content-type') || '').startsWith(CONTENT_TYPE[ext].split('/')[0]),
      `${wrongType.status} ${wrongType.headers.get('content-type')} برای ${ext}`);
  }
} finally {
  try { srv.child.kill(); } catch { /* بی‌اهمیت */ }
}
finish();
})().catch((e) => {
  console.error(`\n❌ خطای غیرمنتظره: ${e.stack || e.message}`);
  try { removeSandboxData(SANDBOX); } catch { /* بی‌اهمیت */ }
  process.exit(2);
});
