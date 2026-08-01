// تست زنده‌ی لایه‌ی امنیت — هدرها، CSRF، جعل IP، کش و آپلود
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const {
  BACKEND_DIR: DIR, REAL_PICTURE_PRODUCTS,
  sandboxPictureProducts, makeSandboxData, removeSandboxData, serverEnv
} = require('./sandbox');
const ADMIN_PHONE = '09120000009';

// دیتابیسِ یک‌بارمصرف. این تست عکس آپلود می‌کند و کاربر می‌سازد؛ هیچ‌کدام نباید
// روی فایل واقعیِ مغازه بنشیند.
const SANDBOX_DATA = makeSandboxData();

// پوشه‌ی عکسِ سندباکس. عمداً `REAL_PICTURE_PRODUCTS` نیست: آپلودِ این تست باید
// در کپی بنشیند تا اگر پاک‌سازیِ آخرِ کار شکست خورد، آشغال در پوشه‌ی واقعیِ
// مغازه جا نماند.
const PICS = sandboxPictureProducts(SANDBOX_DATA);

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass++; console.log(`  [OK]   ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${extra ? ' — ' + extra : ''}`); }
};

// ---------- راه‌اندازی سرور تست ----------
// دو فاز داریم: فاز اصلی با سقف نرخ باز، و یک فاز کوتاه با سقف نوشتنِ پایین
// مخصوص تست «جعل X-Forwarded-For». اگر همه در یک سرور بود، خودِ تست‌ها سقف را
// تمام می‌کردند و باید یک دقیقه بی‌کار می‌نشستیم.
function startServer(port, extraEnv) {
  const state = { out: '', child: null, port, base: `http://127.0.0.1:${port}` };
  state.child = spawn(process.execPath, [path.join(DIR, 'server.js')], {
    cwd: DIR,
    env: serverEnv(SANDBOX_DATA, { PORT: String(port), ADMIN_PHONE, ...extraEnv }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  state.child.stdout.setEncoding('utf8'); state.child.stderr.setEncoding('utf8');
  state.child.stdout.on('data', d => { state.out += d; });
  state.child.stderr.on('data', d => { state.out += d; });
  return state;
}

async function waitUp(srv) {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(srv.base + '/api/health'); if (r.ok) return true; } catch (e) {}
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

const cookies = new Map();
function saveCookies(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie()
    : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
  for (const c of raw) {
    const pair = c.split(';')[0];
    const eq = pair.indexOf('=');
    if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}
const cookieHeader = () => [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');

function apiOn(srv) {
  return async function api(method, url, body, extraHeaders = {}) {
    const res = await fetch(srv.base + '/api' + url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(cookies.size ? { Cookie: cookieHeader() } : {}),
        ...extraHeaders
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    saveCookies(res);
    let data = null;
    try { data = await res.json(); } catch (e) { /* non-json */ }
    return { status: res.status, data, headers: res.headers };
  };
}

async function loginAs(srv, api, phone) {
  const ch = await api('GET', '/auth/otp/challenge');
  await api('POST', '/auth/otp/request', { phone, challenge: ch.data.token });
  let code = null;
  for (let i = 0; i < 20 && !code; i++) {
    const m = [...srv.out.matchAll(new RegExp(`${phone}: (\\d{5})`, 'g'))];
    if (m.length) code = m[m.length - 1][1];
    else await new Promise(r => setTimeout(r, 250));
  }
  if (!code) throw new Error('no otp code in server output');
  const v = await api('POST', '/auth/otp/verify', { phone, code });
  return v.data && v.data.user;
}

const kill = (srv) => { try { srv.child.kill(); } catch (e) {} };

(async () => {
  const main = startServer(3996);
  if (!await waitUp(main)) { console.error('server did not start\n' + main.out); kill(main); return process.exit(1); }
  const api = apiOn(main);
  const BASE = main.base;

  console.log('\n--- هدرهای امنیتی ---');
  const home = await fetch(BASE + '/');
  const h = (k) => home.headers.get(k) || '';
  check('X-Content-Type-Options: nosniff', h('x-content-type-options') === 'nosniff');
  check('X-Frame-Options ست شده', h('x-frame-options') === 'SAMEORIGIN');
  check('Referrer-Policy ست شده', h('referrer-policy') === 'strict-origin-when-cross-origin');
  check('Permissions-Policy ست شده', /camera=\(\)/.test(h('permissions-policy')));
  check('Cross-Origin-Opener-Policy: same-origin', h('cross-origin-opener-policy') === 'same-origin');
  check('هدر x-powered-by حذف شده', !home.headers.get('x-powered-by'));

  const csp = h('content-security-policy');
  check('CSP وجود دارد', !!csp, csp);
  for (const part of ["default-src 'self'", "script-src 'self'", "object-src 'none'",
    "base-uri 'self'", "frame-src 'none'", "worker-src 'self'", "manifest-src 'self'"]) {
    check(`CSP شامل ${part}`, csp.includes(part));
  }
  check('CSP اسکریپت درون‌خطی را مجاز نکرده', !/script-src[^;]*unsafe-inline/.test(csp));
  check('روی HTTP هدر HSTS فرستاده نمی‌شود', !home.headers.get('strict-transport-security'));

  console.log('\n--- کش نشدن پاسخ‌های شخصی ---');
  const me = await api('GET', '/auth/me');
  check('/auth/me با no-store', me.headers.get('cache-control') === 'no-store', me.headers.get('cache-control'));
  const prods = await api('GET', '/products');
  check('لیست محصولات هنوز کش عمومی دارد', /max-age=/.test(prods.headers.get('cache-control') || ''),
    prods.headers.get('cache-control'));
  check('لیست محصولات ETag دارد', !!prods.headers.get('etag'));
  const info = await api('GET', '/shop/info');
  check('تنظیمات فروشگاه هم کش‌شدنی مانده', /max-age=/.test(info.headers.get('cache-control') || ''));

  console.log('\n--- سد دوم CSRF (بررسی مبدأ) ---');
  const evil = await api('POST', '/cart/add', { productId: 1, qty: 1 }, { Origin: 'https://evil.example' });
  check('POST با Origin بیگانه رد می‌شود (۴۰۳)', evil.status === 403, JSON.stringify(evil.data));
  check('پیام خطا فارسی و روشن است', /مبدأ/.test((evil.data && evil.data.error) || ''));

  const evilRef = await api('POST', '/cart/add', { productId: 1, qty: 1 }, { Referer: 'https://evil.example/p' });
  check('اگر Origin نبود، Referer بیگانه هم رد می‌شود', evilRef.status === 403);

  const good = await api('POST', '/cart/add', { productId: 1, qty: 1 }, { Origin: BASE });
  check('POST با Origin خودی رد نمی‌شود', good.status !== 403, JSON.stringify({ s: good.status, d: good.data }));

  const noOrigin = await api('GET', '/products');
  check('خواندن بدون Origin مشکلی ندارد', noOrigin.status === 200);

  console.log('\n--- سقف حجم بدنه ---');
  const big = await fetch(BASE + '/api/cart/add', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE },
    body: JSON.stringify({ productId: 1, note: 'x'.repeat(200 * 1024) })
  });
  check('بدنه‌ی بزرگ‌تر از ۶۴ کیلوبایت رد می‌شود', big.status === 413 || big.status === 400, String(big.status));

  console.log('\n--- دسترسی به مسیرهای ادمین بدون ورود ---');
  const noAuth = await api('GET', '/admin/stats');
  check('مسیر ادمین بدون ورود ۴۰۱ می‌دهد', noAuth.status === 401, String(noAuth.status));
  const noAuthWrite = await api('POST', '/admin/products', { title: 'x' }, { Origin: BASE });
  check('نوشتن در مسیر ادمین بدون ورود رد می‌شود', noAuthWrite.status === 401 || noAuthWrite.status === 403);

  console.log('\n--- آپلود عکس ---');
  const admin = await loginAs(main, api, ADMIN_PHONE);
  check('ورود ادمین', admin && admin.isAdmin === true);

  const before = new Set(fs.existsSync(PICS) ? fs.readdirSync(PICS) : []);
  // پیش‌تر اینجا یک PNG ثابتِ ۱×۱ بود. مسیرِ آپلود حالا ابعاد را هم می‌سنجد و
  // ۱×۱ رد می‌شود، پس عکسی در اندازه‌ی قابل‌قبول می‌سازیم؛ وگرنه این تست به‌جای
  // «تشخیصِ نوعِ فایل از بایت‌ها» داشت نگهبانِ ابعاد را می‌سنجید.
  const { makePng, makePngWithMetadata } = require('./makepng');
  const pngBytes = makePng(120, 90);
  const upload = (type, body) => fetch(BASE + '/api/admin/upload-image', {
    method: 'POST',
    headers: { 'Content-Type': type, Cookie: cookieHeader(), Origin: BASE },
    body
  });

  const upWrong = await upload('image/webp', pngBytes);
  const upWrongJson = await upWrong.json().catch(() => ({}));
  check('محتوای واقعی PNG با ادعای webp، با پسوند .png ذخیره می‌شود',
    upWrong.status === 200 && /\.png$/.test(upWrongJson.path || ''), JSON.stringify(upWrongJson));

  const upFake = await upload('image/png', Buffer.from('<?php echo 1; ?>'));
  check('فایلی که عکس نیست رد می‌شود (۴۱۵)', upFake.status === 415, String(upFake.status));

  const upBadType = await upload('application/x-msdownload', pngBytes);
  check('Content-Type غیرمجاز رد می‌شود', upBadType.status === 415, String(upBadType.status));

  const upBig = await upload('image/png', Buffer.alloc(3 * 1024 * 1024, 1));
  check('عکس بزرگ‌تر از ۲ مگابایت رد می‌شود', upBig.status === 413 || upBig.status === 415, String(upBig.status));

  const uploadNoOrigin = await fetch(BASE + '/api/admin/upload-image', {
    method: 'POST',
    headers: { 'Content-Type': 'image/png', Cookie: cookieHeader(), Origin: 'https://evil.example' },
    body: pngBytes
  });
  check('آپلود از مبدأ بیگانه هم رد می‌شود', uploadNoOrigin.status === 403, String(uploadNoOrigin.status));

  // ---------- فرادادهٔ پنهانِ عکس ----------
  // عکسی که با گوشی از کالا گرفته می‌شود مختصات GPS محلِ عکس‌برداری را داخل
  // خودش دارد؛ یعنی از دلِ عکسِ یک سطلِ پلاستیکی می‌شود آدرسِ مغازه را درآورد.
  // بعضی نرم‌افزارها هم مسیرِ کاملِ فایل روی کامپیوتر را داخل عکس می‌نویسند.
  // این تست فایلِ *روی دیسک* را می‌خواند، نه پاسخ سرور را: تنها چیزی که
  // اهمیت دارد این است که آنچه ذخیره شده تمیز باشد.
  const meta = makePngWithMetadata(200, 150);
  const upMeta = await upload('image/png', meta.bytes);
  const upMetaJson = await upMeta.json().catch(() => ({}));
  check('عکسِ دارای فراداده پذیرفته می‌شود', upMeta.status === 200, String(upMeta.status));
  if (upMeta.status === 200) {
    const saved = fs.readFileSync(path.join(PICS, path.basename(upMetaJson.path)));
    const leaked = meta.secrets.filter(s => saved.includes(Buffer.from(s, 'latin1')));
    check('فرادادهٔ پنهانِ عکس قبل از ذخیره پاک می‌شود', leaked.length === 0, leaked.join(' | '));
    check('عکس بعد از پاکسازی هنوز سالم است',
      saved.length > 8 && saved.subarray(1, 4).toString('ascii') === 'PNG'
      && saved.includes(Buffer.from('IEND', 'ascii')));
    // ابعادِ اعلام‌شده باید همان بماند؛ اگر پاکسازی IHDR را خراب کند، فرانت
    // width/height غلط می‌نویسد و صفحه موقعِ لودِ عکس می‌پرد.
    check('ابعادِ عکس بعد از پاکسازی عوض نشده',
      upMetaJson.width === 200 && upMetaJson.height === 150,
      `${upMetaJson.width}×${upMetaJson.height}`);
  }

  let removed = 0;
  for (const f of (fs.existsSync(PICS) ? fs.readdirSync(PICS) : [])) {
    if (!before.has(f)) { fs.unlinkSync(path.join(PICS, f)); removed++; }
  }
  check('عکس‌های تستی پاک شدند', removed >= 1, String(removed));
  kill(main);

  // ---------- فاز دوم: جعل IP ----------
  console.log('\n--- جعل IP و محدودیت نرخ ---');
  const tiny = startServer(3995, { WRITE_RATE_LIMIT: '5' });
  if (!await waitUp(tiny)) { console.error('phase-2 server did not start\n' + tiny.out); kill(tiny); return process.exit(1); }
  const api2 = apiOn(tiny);
  cookies.clear();

  // سقف نوشتن ۵ در دقیقه است و با هر درخواست یک X-Forwarded-For تازه می‌فرستیم.
  // اگر سرور به این هدر اعتماد کند، هر بار «کاربر جدید» دیده می‌شود و هیچ‌وقت ۴۲۹ نمی‌گیریم.
  let blockedAt = 0;
  for (let i = 1; i <= 9; i++) {
    const r = await api2('POST', '/cart/add', { productId: 1, qty: 1 },
      { Origin: tiny.base, 'X-Forwarded-For': `10.0.0.${i}` });
    if (r.status === 429) { blockedAt = i; break; }
  }
  check('X-Forwarded-For جعلی سقف نرخ را دور نمی‌زند', blockedAt > 0, `blockedAt=${blockedAt}`);
  const again = await api2('POST', '/cart/add', { productId: 1, qty: 1 }, { Origin: tiny.base });
  check('پاسخ ۴۲۹ هدر Retry-After دارد', again.status === 429 && again.headers.get('retry-after') !== null);
  kill(tiny);

  console.log(`\n==== نتیجه: ${pass} پاس، ${fail} ناموفق ====\n`);
  removeSandboxData(SANDBOX_DATA);
  setTimeout(() => process.exit(fail ? 1 : 0), 400);
})().catch(e => { console.error(e); removeSandboxData(SANDBOX_DATA); process.exit(1); });
