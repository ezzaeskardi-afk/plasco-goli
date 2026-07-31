// تست زنده‌ی «تخفیف» — قیمت قبلی، درصد، اعتبارسنجی و عملیات گروهی
const { spawn } = require('child_process');
const path = require('path');

const { BACKEND_DIR: DIR, makeSandboxData, removeSandboxData, serverEnv } = require('./sandbox');
const PORT = 3997;

// دیتابیسِ یک‌بارمصرف: این تست محصول می‌سازد، ویرایش گروهی می‌زند و آخر حذفش
// می‌کند. اگر وسط راه بترکد، روی دیتابیس واقعی یک محصول «کالای تست تخفیف» جا
// می‌ماند — و محصولی که در سفارشی آمده باشد دیگر پاک نمی‌شود.
const SANDBOX_DATA = makeSandboxData();
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN_PHONE = '09120000009';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  if (ok) { pass++; console.log(`  [OK]   ${name}`); }
  else { fail++; console.log(`  [FAIL] ${name}${extra ? ' — ' + extra : ''}`); }
};

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

async function api(method, url, body) {
  const res = await fetch(BASE + '/api' + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(cookies.size ? { Cookie: cookieHeader() } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  saveCookies(res);
  let data = null;
  try { data = await res.json(); } catch (e) { /* non-json */ }
  return { status: res.status, data };
}

async function loginAs(phone) {
  const ch = await api('GET', '/auth/otp/challenge');
  const rq = await api('POST', '/auth/otp/request', { phone, challenge: ch.data.token });
  if (rq.status === 429) throw new Error('otp rate limit');
  let code = null;
  for (let i = 0; i < 20 && !code; i++) {
    const m = [...out.matchAll(new RegExp(`${phone}: (\\d{5})`, 'g'))];
    if (m.length) code = m[m.length - 1][1];
    else await new Promise(r => setTimeout(r, 250));
  }
  if (!code) throw new Error('no otp code in server output');
  const v = await api('POST', '/auth/otp/verify', { phone, code });
  return v.data && v.data.user;
}

const child = spawn(process.execPath, [path.join(DIR, 'server.js')], {
  cwd: DIR,
  env: serverEnv(SANDBOX_DATA, { PORT: String(PORT), ADMIN_PHONE }),
  stdio: ['ignore', 'pipe', 'pipe']
});
let out = '';
child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
child.stdout.on('data', d => { out += d; });
child.stderr.on('data', d => { out += d; });

// پاک‌کردنِ پوشه‌ی موقت *بعد* از کشتن سرور: تا وقتی پروسه‌ی سرور باز است، فایل
// دیتابیس روی ویندوز قفل می‌ماند و rm بی‌صدا شکست می‌خورد.
const done = (code) => {
  try { child.kill(); } catch (e) {}
  setTimeout(() => { removeSandboxData(SANDBOX_DATA); process.exit(code); }, 500);
};

(async () => {
  let up = false;
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(BASE + '/api/health'); if (r.ok) { up = true; break; } } catch (e) {}
    await new Promise(r => setTimeout(r, 300));
  }
  if (!up) { console.error('server did not start\n' + out); return done(1); }

  console.log('\n--- تخفیف: مهاجرت و سریال‌سازی ---');
  const list = await api('GET', '/products');
  const sample = (list.data.products || [])[0];
  check('فیلد oldPrice در پاسخ محصولات هست', sample && 'oldPrice' in sample);
  check('فیلد discountPercent در پاسخ محصولات هست', sample && 'discountPercent' in sample);
  check('محصول بدون تخفیف، oldPrice=0 و درصد=0 دارد', sample.oldPrice === 0 && sample.discountPercent === 0,
    JSON.stringify({ o: sample.oldPrice, d: sample.discountPercent }));

  const admin = await loginAs(ADMIN_PHONE);
  check('ورود ادمین', admin && admin.isAdmin === true);

  console.log('\n--- ساخت محصول با قیمت قبلی ---');
  const mk = await api('POST', '/admin/products', {
    title: 'کالای تست تخفیف', category: 'تست', price: 80000, oldPrice: 100000, stock: 5, description: 'تست'
  });
  check('ساخت محصول با oldPrice معتبر', mk.status === 200, JSON.stringify(mk.data));
  const pid = mk.data && mk.data.product && mk.data.product.id;

  const got = await api('GET', '/products/' + pid);
  check('oldPrice ذخیره و برگردانده شد', got.data.product.oldPrice === 100000, String(got.data.product.oldPrice));
  check('درصد تخفیف را سرور درست حساب کرد (۲۰٪)', got.data.product.discountPercent === 20, String(got.data.product.discountPercent));

  console.log('\n--- اعتبارسنجی ---');
  const bad1 = await api('PUT', `/admin/products/${pid}`, { oldPrice: 70000 });
  check('قیمت قبلیِ کمتر از قیمت فعلی رد می‌شود (۴۰۰)', bad1.status === 400, JSON.stringify(bad1.data));
  check('پیام خطا راهنمای عمل می‌دهد', /خالی یا صفر/.test((bad1.data && bad1.data.error) || ''), (bad1.data || {}).error);

  const bad2 = await api('PUT', `/admin/products/${pid}`, { oldPrice: 80000 });
  check('قیمت قبلیِ مساوی هم رد می‌شود', bad2.status === 400);

  const bad3 = await api('PUT', `/admin/products/${pid}`, { oldPrice: -5 });
  check('قیمت قبلی منفی رد می‌شود', bad3.status === 400);

  const ok1 = await api('PUT', `/admin/products/${pid}`, { oldPrice: 0 });
  check('صفر یعنی حذف تخفیف و پذیرفته می‌شود', ok1.status === 200 && ok1.data.product.old_price === 0,
    JSON.stringify(ok1.data && ok1.data.product && ok1.data.product.old_price));

  const ok2 = await api('PUT', `/admin/products/${pid}`, { oldPrice: '' });
  check('رشته‌ی خالی هم یعنی بدون تخفیف (نه خطا)', ok2.status === 200);

  console.log('\n--- ذخیره‌ی سریع جدول (فقط قیمت و موجودی) ---');
  await api('PUT', `/admin/products/${pid}`, { oldPrice: 100000, price: 80000 });
  const quick = await api('PUT', `/admin/products/${pid}`, { price: 90000, stock: 5 });
  check('ذخیره‌ی سریع با تخفیفِ هنوز معتبر، خطا نمی‌دهد', quick.status === 200, JSON.stringify(quick.data));
  check('تخفیف حفظ شد', quick.data.product.old_price === 100000);

  const quick2 = await api('PUT', `/admin/products/${pid}`, { price: 120000, stock: 5 });
  check('اگر قیمت از قیمت قبلی رد شود، تخفیفِ بی‌معنا بی‌صدا پاک می‌شود', quick2.status === 200 && quick2.data.product.old_price === 0,
    JSON.stringify({ s: quick2.status, o: quick2.data && quick2.data.product && quick2.data.product.old_price }));

  console.log('\n--- تخفیف گروهی ---');
  await api('PUT', `/admin/products/${pid}`, { price: 100000, oldPrice: 0 });
  const b1 = await api('POST', '/admin/products/bulk', { ids: [pid], op: 'discount', value: 20 });
  check('اجرای تخفیف گروهی ۲۰٪', b1.status === 200, JSON.stringify(b1.data));
  let cur = (await api('GET', '/products/' + pid)).data.product;
  check('قیمت به ۸۰٬۰۰۰ رسید', cur.price === 80000, String(cur.price));
  check('قیمت قبلی ۱۰۰٬۰۰۰ ثبت شد', cur.oldPrice === 100000, String(cur.oldPrice));

  await api('POST', '/admin/products/bulk', { ids: [pid], op: 'discount', value: 20 });
  cur = (await api('GET', '/products/' + pid)).data.product;
  check('اجرای دوباره، قیمتِ قبلی را دستکاری نمی‌کند (درصد دروغ نمی‌شود)', cur.oldPrice === 100000, String(cur.oldPrice));
  check('قیمت روی ۶۴٬۰۰۰ و درصد ۳۶٪ شد', cur.price === 64000 && cur.discountPercent === 36,
    JSON.stringify({ p: cur.price, d: cur.discountPercent }));

  const bEnd = await api('POST', '/admin/products/bulk', { ids: [pid], op: 'discount_end' });
  check('پایان تخفیف گروهی', bEnd.status === 200);
  cur = (await api('GET', '/products/' + pid)).data.product;
  check('قیمت به ۱۰۰٬۰۰۰ برگشت', cur.price === 100000, String(cur.price));
  check('قیمت قبلی صفر شد', cur.oldPrice === 0 && cur.discountPercent === 0);

  const bBad = await api('POST', '/admin/products/bulk', { ids: [pid], op: 'discount', value: 0 });
  check('درصد صفر رد می‌شود', bBad.status === 400);
  const bBad2 = await api('POST', '/admin/products/bulk', { ids: [pid], op: 'discount', value: 95 });
  check('درصد بالای ۹۰ رد می‌شود', bBad2.status === 400);
  const bBad3 = await api('POST', '/admin/products/bulk', { ids: [pid], op: 'discount', value: 12.5 });
  check('درصد اعشاری رد می‌شود', bBad3.status === 400);

  console.log('\n--- تنظیمات عمومی فروشگاه ---');
  const info = await api('GET', '/shop/info');
  check('lowStockThreshold در /shop/info هست', typeof info.data.lowStockThreshold === 'number', JSON.stringify(info.data));
  check('freeShippingOver در /shop/info هست', typeof info.data.freeShippingOver === 'number');
  check('shippingCost در /shop/info هست', typeof info.data.shippingCost === 'number');

  console.log('\n--- داده‌ی ساختاریافته‌ی صفحه‌ی محصول ---');
  await api('PUT', `/admin/products/${pid}`, { price: 80000, oldPrice: 100000 });
  const page = await (await fetch(`${BASE}/product/${pid}`, { headers: { Cookie: cookieHeader() } })).text();
  check('صفحه یک تگ canonical دارد (نه بیشتر)', (page.match(/rel="canonical"/g) || []).length === 1);
  check('JSON-LD محصول با نشانه‌ی data-pg-ld تزریق شده', page.includes('data-pg-ld="product"'));
  check('BreadcrumbList هم نشانه دارد', page.includes('data-pg-ld="crumbs"'));
  check('قیمت ریالی درست است (۸۰۰٬۰۰۰ ریال = ۸۰٬۰۰۰ تومان)', page.includes('"price":800000'));
  check('متای product:price:amount هم ریالی است', page.includes('content="800000"'));
  check('قیمت قبلی به‌صورت متای استاندارد آمده', page.includes('og:price:standard_amount'));

  console.log('\n--- پاکسازی ---');
  const del = await api('DELETE', `/admin/products/${pid}`);
  check('محصول تستی حذف شد', del.status === 200 && del.data.deleted === true, JSON.stringify(del.data));

  console.log(`\n==== نتیجه: ${pass} پاس، ${fail} ناموفق ====\n`);
  done(fail ? 1 : 0);
})().catch(e => { console.error(e); console.error(out); done(1); });
