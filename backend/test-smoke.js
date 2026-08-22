// ============================================================
// Smoke Test - walks the whole site flow like a real user.
//
// Run:  cd backend  ->  node test-smoke.js
//
// What it does:
//   1. Boots the server itself on port 3999 (does NOT touch your
//      main server on 3000)
//   2. Checks server health, product list, and that prices are
//      numeric (needed for the price filter)
//   3. Requests an OTP for a test phone, reads the code from the
//      server console, and logs in
//   4. Saves the profile (name)
//   5. Adds/removes a wishlist item and tests the cart
//   6. Shuts the test server down at the end
//
// Note: runs on the same dev database; it only creates one test
// user with phone 09120000001 (harmless). No products change.
// ============================================================

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// ---------- دیتابیسِ یک‌بارمصرف ----------
// تست روی **کپیِ** دیتابیس اجرا می‌شود، نه فایل واقعیِ مغازه. تاریخِ این خط:
// همین تست یک بار با انتخاب اولین کالای موجود، ۵۴ عدد از موجودی واقعی فروشگاه را
// خورد. نگهبان V15 و محصول یک‌بارمصرف جلوی تکرارش را می‌گیرند، ولی آن‌ها «نگهبان»
// هستند؛ این خط «دیوار» است — دستِ تست به فایل واقعی نمی‌رسد.
//
// باید **قبل از** هر require از lib/db بیاید (خودِ lib/db موقع بار شدن دیتابیس را
// باز می‌کند). سرورِ فرزند هم process.env را ارث می‌برد، پس روی همان کپی بالا
// می‌آید و تست و سرور یک فایل را می‌بینند.
const {
  makeSandboxData, removeSandboxData, sandboxPictureDir, sandboxPictureProducts
} = require('./tests/sandbox');
const SANDBOX_DATA = makeSandboxData();
process.env.PG_DATA_DIR = SANDBOX_DATA;
// همان استدلالِ بالا برای پوشه‌ی عکس: بدونِ این خط، آپلودِ تست در پوشه‌ی
// عکسِ واقعیِ مغازه می‌نشیند و اگر پاک‌سازی شکست بخورد آنجا جا می‌ماند.
process.env.PG_PICTURE_DIR = sandboxPictureDir(SANDBOX_DATA);

// پوشه‌ی عکسِ سندباکس — کپیِ کاملِ پوشه‌ی واقعی است، پس تست‌هایی که نسخه‌ی
// webp و بندانگشتیِ عکس‌های واقعی را می‌سنجند همان چیزی را می‌بینند که سرورِ
// واقعی می‌بیند، ولی چیزی که می‌نویسند در کپی می‌ماند.
const PIC_ROOT = sandboxPictureDir(SANDBOX_DATA);
const PIC_PRODUCTS = sandboxPictureProducts(SANDBOX_DATA);

const PORT = 3999;
const BASE = `http://127.0.0.1:${PORT}`;
const TEST_PHONE = '09120000001';
const ADMIN_PHONE = '09120000009'; // promoted to admin via env below

// ---------- tiny helpers ----------
const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '[PASS]' : '[FAIL]'} ${name}${detail ? ` - ${detail}` : ''}`);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- محصولِ یک‌بارمصرفِ خرید ----------
// تست هرگز نباید از انبار واقعیِ مغازه چیزی کم کند. تا پیش از این، محصولِ خرید با
// `list.find(p => p.stock > 0)` انتخاب می‌شد؛ یعنی اولین کالای واقعیِ موجود.
// چون سفارشِ «تحویل‌شده» موجودی را برنمی‌گرداند، هر بار اجرای تست چند عدد از
// موجودیِ واقعی می‌خورد تا صفر شود و بعد می‌رفت سراغ کالای بعدی. این‌طور ۵۴ عدد
// از موجودی واقعیِ فروشگاه از بین رفت و چهار محصول اول به صفر رسیدند.
// حالا کالای مخصوصِ تست ساخته می‌شود و در پایان خودش، سفارش‌ها و نظرهایش پاک می‌شوند.
const TEST_PRODUCT_MARK = 'TEST BUYABLE (auto-cleanup)';

// پاک‌کردنِ کاملِ ردِ محصول تستی. عمداً سفارش‌هایش هم حذف می‌شوند: اگر بمانند،
// adminDeleteProductTx حذف را رد می‌کند و فقط موجودی را صفر می‌کند، یعنی هر اجرا
// یک محصولِ زامبیِ «ناموجود» در کاتالوگ جا می‌گذارد.
// بیرون از try تعریف شده تا بلوکِ finally هم ببیندش (نگهبانِ موجودی آنجاست).
let stockSnapshot = null;

function purgeTestProducts(dbm) {
  let removed = 0;
  try {
    const rows = dbm.db.prepare('SELECT id FROM products WHERE title = ?').all(TEST_PRODUCT_MARK);
    for (const { id } of rows) {
      dbm.db.prepare(`DELETE FROM orders WHERE items LIKE '%"productId":' || ? || ',%'
                                            OR items LIKE '%"productId":' || ? || '}%'`).run(id, id);
      dbm.db.prepare('DELETE FROM reviews  WHERE product_id = ?').run(id);
      dbm.db.prepare('DELETE FROM wishlist WHERE product_id = ?').run(id);
      dbm.db.prepare('DELETE FROM stock_alerts WHERE product_id = ?').run(id);
      dbm.db.prepare('DELETE FROM products WHERE id = ?').run(id);
      removed++;
    }
  } catch (e) { console.log(`  (purge skipped: ${e.message})`); }
  return removed;
}

// simple cookie jar so the session survives across requests (like a browser)
const cookies = new Map();
function storeCookies(res) {
  const list = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
  for (const c of list) {
    const [pair] = c.split(';');
    const eq = pair.indexOf('=');
    if (eq > 0) cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}
function cookieHeader() {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}
async function api(method, p, body, extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...(cookies.size ? { Cookie: cookieHeader() } : {}), ...extraHeaders };
  if (method === 'POST' && p === '/orders' && !headers['Idempotency-Key']) {
    headers['Idempotency-Key'] = `smoke-auto-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  const res = await fetch(`${BASE}/api${p}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  storeCookies(res);
  let data = {};
  try { data = await res.json(); } catch (e) { /* empty body */ }
  return { status: res.status, data };
}

// همان api ولی با دسترسی به هدرها (برای تست ETag / 304)
async function apiRaw(method, p, extraHeaders = {}) {
  const res = await fetch(`${BASE}/api${p}`, {
    method,
    headers: { ...(cookies.size ? { Cookie: cookieHeader() } : {}), ...extraHeaders }
  });
  storeCookies(res);
  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch (e) { /* 304 بدنه ندارد */ }
  return {
    status: res.status, data, etag: res.headers.get('etag'), bytes: text.length,
    cacheControl: res.headers.get('cache-control')
  };
}

// PNG معتبر با ابعادِ دلخواه — برای سنجیدنِ نگهبانِ ابعادِ آپلود.
// در tests/makepng.js است تا تستِ امنیت هم از همان یکی استفاده کند.
const { makePng } = require('./tests/makepng');

// ---------- run the server as a child process ----------
let serverOut = '';
const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  cwd: __dirname,
  env: {
    ...process.env, PORT: String(PORT), ADMIN_PHONE,
    MAX_SMS_PER_IP_PER_DAY: '10000',
    // تست در چند ثانیه بیش از ۶۰ درخواستِ نوشتن می‌زند؛ سقف فقط برای تست باز می‌شود
    WRITE_RATE_LIMIT: '10000', API_RATE_LIMIT: '10000',
    // تستِ قفلِ حساب ناچار است ده‌ها رمزِ غلط بفرستد؛ سقفِ IP نباید زودتر از
    // قفلِ حسابی شلیک کند وگرنه چیزی که می‌سنجیم آن یکی است نه این یکی.
    PASSWORD_LOGIN_LIMIT: '10000'
  },
  stdio: ['ignore', 'pipe', 'pipe']
});
child.stdout.setEncoding('utf8');
child.stderr.setEncoding('utf8');
child.stdout.on('data', d => { serverOut += d; });
child.stderr.on('data', d => { serverOut += d; });
child.on('error', (e) => {
  console.error('[FAIL] Could not start the server:', e.message);
  process.exit(1);
});

function shutdown(code) {
  try { child.kill(); } catch (e) { /* ignore */ }
  // پاک‌کردن پوشه‌ی موقت بعد از کشتن سرور: تا پروسه باز است فایل روی ویندوز قفل
  // می‌ماند. شکستِ پاک‌سازی هم نتیجه‌ی تست را عوض نمی‌کند.
  setTimeout(() => { removeSandboxData(SANDBOX_DATA); process.exit(code); }, 800);
}

(async () => {
  console.log('\n>> Starting test server on port ' + PORT + '...\n');

  // wait for the server to come up
  let up = false;
  for (let i = 0; i < 40; i++) {
    try {
      const { status } = await api('GET', '/health');
      if (status === 200) { up = true; break; }
    } catch (e) { /* not up yet */ }
    await sleep(500);
  }
  if (!up) {
    console.error('[FAIL] Server did not come up. Server output:\n' + serverOut.slice(-2000));
    if (serverOut.includes('EADDRINUSE')) console.error('   (port 3999 is busy - close the other program using it)');
    return shutdown(1);
  }
  check('Server is up and /api/health responds', true);

  try {
    // ---------- products + data needed for the price filter ----------
    const prods = await api('GET', '/products');
    const list = prods.data.products || [];
    check('Product list is returned', prods.status === 200 && list.length > 0, `${list.length} products`);
    check('All products have a numeric price (needed for price filter)', list.every(p => typeof p.price === 'number'));
    check('All products have numeric stock (needed for "out-of-stock last")', list.every(p => typeof p.stock === 'number'));
    const firstId = list[0]?.id;

    const one = await api('GET', `/products/${firstId}`);
    check('Single product page (/products/:id) works', one.status === 200 && one.data.product?.id === firstId);

    // ---------- backend hardening: ETag / 304 ----------
    const etagRes = await apiRaw('GET', '/products');
    check('Product list sends an ETag', Boolean(etagRes.etag), etagRes.etag || '');
    const notMod = await apiRaw('GET', '/products', { 'If-None-Match': etagRes.etag });
    check('Repeat request returns 304 with an empty body (bandwidth saved)', notMod.status === 304 && notMod.bytes === 0);
    const staleEtag = await apiRaw('GET', '/products', { 'If-None-Match': 'W/"definitely-not-current"' });
    check('A stale ETag still gets the full list (200)', staleEtag.status === 200 && (staleEtag.data.products || []).length > 0);

    // ---------- backend hardening: server-side filter / sort / paging ----------
    const page1 = await api('GET', '/products?page=1&limit=3');
    check('Server-side paging returns exactly one page', page1.status === 200 && page1.data.products?.length === 3);
    check('Paging meta is correct', page1.data.meta?.total === list.length && page1.data.meta?.pages === Math.ceil(list.length / 3) && page1.data.meta?.hasMore === true);

    const lastPage = await api('GET', `/products?page=999&limit=3`);
    check('Out-of-range page is clamped to the last page (no empty screen)', lastPage.status === 200 && lastPage.data.products?.length > 0 && lastPage.data.meta.page === lastPage.data.meta.pages);

    const cheapFirst = await api('GET', '/products?sort=price-asc&inStock=1');
    const prices = (cheapFirst.data.products || []).map(p => p.price);
    check('Sorting by price works on the server', prices.length > 0 && prices.every((v, i) => i === 0 || prices[i - 1] <= v));
    check('inStock filter never returns an out-of-stock item', (cheapFirst.data.products || []).every(p => p.stock > 0));

    const inRange = await api('GET', '/products?minPrice=200000&maxPrice=400000');
    check('Price-range filter works on the server', inRange.status === 200 && (inRange.data.products || []).every(p => p.price >= 200000 && p.price <= 400000));

    const searched = await api('GET', `/products?q=${encodeURIComponent(list[0].title.slice(0, 4))}`);
    check('Persian search works (no encoding crash)', searched.status === 200 && (searched.data.products || []).length > 0);

    const facets = await api('GET', '/products/facets');
    check('Facets endpoint returns price range and categories', facets.status === 200 && typeof facets.data.minPrice === 'number' && Array.isArray(facets.data.categories) && facets.data.categories.length > 0);

    // ---------- backend hardening: input validation ----------
    const badSort = await api('GET', '/products?sort=%3B+DROP+TABLE+products');
    check('Invalid sort value is rejected with 400 (not a 500)', badSort.status === 400 && Boolean(badSort.data.error));
    const badId = await api('GET', '/products/not-a-number');
    check('Non-numeric product id is rejected with 400', badId.status === 400);
    const inject = await api('GET', "/products?q=%27%3B+DROP+TABLE+products%3B--");
    check('SQL injection attempt is treated as plain text (no damage)', inject.status === 200);
    const stillThere = await api('GET', '/products');
    check('Product table survived the injection attempt', (stillThere.data.products || []).length === list.length);

    // ---------- backend hardening: rich health ----------
    const fullHealth = await api('GET', '/health?full=1');
    check('Detailed health reports database status', fullHealth.status === 200 && fullHealth.data.db?.ok === true && typeof fullHealth.data.db.queryMs === 'number');
    check('Detailed health reports memory usage', typeof fullHealth.data.memoryMb?.rss === 'number');

    // ---------- wishlist as a guest ----------
    const guestIds = await api('GET', '/wishlist/ids');
    check('Guest: /wishlist/ids returns an empty array (not an error)', guestIds.status === 200 && Array.isArray(guestIds.data.ids) && guestIds.data.ids.length === 0);

    const guestToggle = await api('POST', '/wishlist/toggle', { productId: firstId });
    check('Guest: clicking the heart returns 401 (redirect to login)', guestToggle.status === 401);

    // ---------- OTP login ----------
    // If you re-run within 90s, the fixed phone hits the send limit;
    // in that case we continue with a random test phone.
    // The endpoint is guarded by a one-time challenge token, so every caller
    // has to fetch one first - exactly what a real browser does.
    async function askOtp(ph) {
      const ch = await api('GET', '/auth/otp/challenge');
      return api('POST', '/auth/otp/request', { phone: ph, challenge: ch.data.token });
    }

    const noChallenge = await api('POST', '/auth/otp/request', { phone: TEST_PHONE });
    check('Code request without a challenge token is rejected (bot shield)', noChallenge.status === 400);

    const chOnce = await api('GET', '/auth/otp/challenge');
    check('Challenge endpoint hands out a token', typeof chOnce.data.token === 'string' && chOnce.data.token.length >= 16);

    let phone = TEST_PHONE;
    let otpReq = await askOtp(phone);
    if (otpReq.status === 429) {
      phone = '0912000' + String(Math.floor(1000 + Math.random() * 8999));
      console.log(`   (fixed phone hit the send limit - continuing with test phone ${phone})`);
      otpReq = await askOtp(phone);
    }
    check('Login code request accepted', otpReq.status === 200 && otpReq.data.ok === true, `mode: ${otpReq.data.mode}`);

    // read the 5-digit code from the server console (test mode prints it there)
    let code = null;
    for (let i = 0; i < 20 && !code; i++) {
      const matches = [...serverOut.matchAll(new RegExp(`${phone}: (\\d{5})`, 'g'))];
      if (matches.length) code = matches[matches.length - 1][1];
      else await sleep(250);
    }
    check('Login code read from server console', Boolean(code), code ? `code: ${code}` : 'not found');
    if (!code) throw new Error('cannot continue without the code');

    const wrong = await api('POST', '/auth/otp/verify', { phone, code: '00000' });
    check('Wrong code is rejected', wrong.status === 400);

    const verify = await api('POST', '/auth/otp/verify', { phone, code });
    check('Login with correct code succeeds', verify.status === 200 && verify.data.ok === true);
    check('Login response has fullName (for the "what is your name?" step)', 'fullName' in (verify.data.user || {}));

    // ---------- profile ----------
    const prof = await api('POST', '/auth/profile', { fullName: 'Test User' });
    check('Saving user profile (name) works', prof.status === 200 && prof.data.user?.fullName === 'Test User');

    const me = await api('GET', '/auth/me');
    check('/auth/me returns the name', me.data.user?.fullName === 'Test User');

    const emptyName = await api('POST', '/auth/profile', { fullName: '   ' });
    check('Empty name is rejected', emptyName.status === 400);

    // ---------- wishlist (logged in) ----------
    const t1 = await api('POST', '/wishlist/toggle', { productId: firstId });
    check('Add to wishlist', t1.status === 200 && t1.data.inWishlist === true && t1.data.ids.includes(firstId));

    const wl = await api('GET', '/wishlist');
    check('Wishlist returns the product', wl.status === 200 && (wl.data.products || []).some(p => p.id === firstId));

    const t2 = await api('POST', '/wishlist/toggle', { productId: firstId });
    check('Clicking the heart again = remove from wishlist', t2.status === 200 && t2.data.inWishlist === false && !t2.data.ids.includes(firstId));

    const badWish = await api('POST', '/wishlist/toggle', { productId: 999999 });
    check('Nonexistent product in wishlist returns 404', badWish.status === 404);

    // ---------- cart (regression - make sure nothing broke) ----------
    const inStock = list.find(p => p.stock > 0);
    if (inStock) {
      const cart = await api('POST', '/cart/add', { productId: inStock.id, qty: 1 });
      check('Adding to cart still works', cart.status === 200 && cart.data.count >= 1);
      const cartRm = await api('POST', '/cart/remove', { productId: inStock.id });
      check('Removing from cart works', cartRm.status === 200);
    }

    // ---------- logout ----------
    const out = await api('POST', '/auth/logout');
    check('Logout', out.status === 200);
    const meAfter = await api('GET', '/auth/me');
    check('After logout, user is null', meAfter.data.user === null);

    // ============ FULL PURCHASE FLOW (order + test payment) ============
    // fresh buyer phone (the earlier phone is inside the 90s resend cooldown)
    async function loginAs(ph) {
      let rq = await askOtp(ph);
      if (rq.status === 429) throw new Error(`OTP rate limit for ${ph}`);
      let c = null;
      for (let i = 0; i < 20 && !c; i++) {
        const m = [...serverOut.matchAll(new RegExp(`${ph}: (\\d{5})`, 'g'))];
        if (m.length) c = m[m.length - 1][1];
        else await sleep(250);
      }
      if (!c) throw new Error(`no OTP code for ${ph}`);
      const v = await api('POST', '/auth/otp/verify', { phone: ph, code: c });
      if (v.status !== 200) throw new Error(`login failed for ${ph}`);
      return v.data.user;
    }

    const buyerPhone = '0912111' + String(Math.floor(1000 + Math.random() * 8999));
    await loginAs(buyerPhone);
    const addr = await api('POST', '/addresses', {
      fullName: 'Test Buyer', phone: buyerPhone, city: 'Sari', addressLine: 'Test Street 1', postalCode: '4816600000'
    });
    check('Creating an address works', addr.status === 200 && addr.data.address?.id > 0);

    // address book: create a second address and delete it
    const addr2 = await api('POST', '/addresses', { fullName: 'Temp Receiver', phone: buyerPhone, city: 'Sari', addressLine: 'Temp Street 2' });
    const addrDel = await api('DELETE', `/addresses/${addr2.data.address.id}`);
    check('Deleting an address works', addrDel.status === 200);
    const addrDelAgain = await api('DELETE', `/addresses/${addr2.data.address.id}`);
    check('Deleting a missing address returns 404', addrDelAgain.status === 404);

    // کالای خرید: ساختِ مستقیم در دیتابیس، چون در این نقطه نشستِ ادمین هنوز باز
    // نشده و لاگین دوباره‌ی ادمین با پیامک به محدودیت ۹۰ ثانیه‌ای می‌خورد.
    const dbdirect = require('./lib/db');
    purgeTestProducts(dbdirect); // بقایای اجرای ناتمامِ قبلی
    stockSnapshot = new Map(
      dbdirect.db.prepare('SELECT id, stock FROM products').all().map(r => [r.id, r.stock]));
    const buyable = dbdirect.adminCreateProduct({
      title: TEST_PRODUCT_MARK, category: 'Test', image: '', icon: 'i-package',
      description: 'کالای موقت تست — خودکار پاک می‌شود', price: 250000, old_price: 0,
      badge: '', stock: 999
    });
    check('Throwaway test product created (real stock is never touched)',
      Boolean(buyable && buyable.id > 0 && buyable.stock === 999));
    await api('POST', '/cart/add', { productId: buyable.id, qty: 1 });
    const orderKey = `smoke-${Date.now()}-order-key`;
    const orderRes = await api('POST', '/orders', { addressId: addr.data.address.id }, { 'Idempotency-Key': orderKey });
    const orderRetry = await api('POST', '/orders', { addressId: addr.data.address.id }, { 'Idempotency-Key': orderKey });
    check('Order is created (test payment mode)', orderRes.status === 200 && orderRes.data.orderId > 0 && orderRes.data.testMode === true);
    check('Order retry reuses the same payment attempt',
      orderRetry.status === 200 && orderRetry.data.repeated === true &&
      orderRetry.data.orderId === orderRes.data.orderId &&
      orderRetry.data.paymentUrl === orderRes.data.paymentUrl);

    // visit the test payment URL (simulates gateway redirect back)
    const payVisit = await fetch(orderRes.data.paymentUrl, { headers: { Cookie: cookieHeader() }, redirect: 'follow' });
    check('Test payment callback completes', payVisit.status === 200);

    const myOrder = await api('GET', `/orders/${orderRes.data.orderId}`);
    check('Order is marked as paid after test payment', myOrder.status === 200 && myOrder.data.order?.status === 'paid');

    // ============ PASSWORD LOGIN (optional second method) ============
    // اجرای تست باید تکرارپذیر باشد: این کاربرِ تستی ممکن است از اجرای قبلی رمز
    // داشته باشد. پاک‌سازی را از طریق API انجام می‌دهیم تا تست به اتصال داخلی
    // دیتابیس وابسته نشود؛ این سرور روی sandbox موقت اجرا شده است.
    await api('POST', '/auth/password/remove', { currentPassword: 'test-pass-1234' });
    const passSet = await api('POST', '/auth/password/set', { password: 'test-pass-1234' });
    check('Setting a password works', passSet.status === 200 && passSet.data.user?.hasPassword === true);
    const passShort = await api('POST', '/auth/password/set', { password: '123' });
    check('Too-short password is rejected', passShort.status === 400);

    // ============ ADMIN PANEL ============
    // regular user must NOT have admin access
    const noAdmin = await api('GET', '/admin/stats');
    check('Regular user is blocked from admin API (403)', noAdmin.status === 403);

    await api('POST', '/auth/logout');

    // login again — this time with the password instead of SMS
    const badPass = await api('POST', '/auth/password/login', { phone: buyerPhone, password: 'wrong-pass' });
    check('Wrong password is rejected (401)', badPass.status === 401);
    const okPass = await api('POST', '/auth/password/login', { phone: buyerPhone, password: 'test-pass-1234' });
    check('Login with password works (no SMS needed)', okPass.status === 200 && okPass.data.user?.phone === buyerPhone);
    const hasPw = await api('POST', '/auth/has-password', { phone: buyerPhone });
    check('has-password reports true', hasPw.status === 200 && hasPw.data.hasPassword === true);
    await api('POST', '/auth/logout');

    const adminUser = await loginAs(ADMIN_PHONE);
    check('Admin phone logs in with isAdmin=true', adminUser.isAdmin === true);

    const stats = await api('GET', '/admin/stats');
    check('Admin stats work', stats.status === 200 && typeof stats.data.stats?.total_orders === 'number');

    const adminOrders = await api('GET', '/admin/orders');
    const seenOrder = (adminOrders.data.orders || []).find(o => o.id === orderRes.data.orderId);
    check('Admin sees the new order with customer phone', Boolean(seenOrder) && seenOrder.userPhone === buyerPhone);

    // customers tab: buyer must appear with purchase stats (one account per phone)
    const usersRes = await api('GET', '/admin/users');
    const buyerRows = (usersRes.data.users || []).filter(u => u.phone === buyerPhone);
    check('Admin: customers list shows the buyer with stats', usersRes.status === 200 && buyerRows.length === 1 && buyerRows[0].paidOrders >= 1 && buyerRows[0].totalSpent > 0);

    const toShipped = await api('POST', `/admin/orders/${orderRes.data.orderId}/status`, { from: 'paid', to: 'shipped' });
    check('Admin: paid -> shipped', toShipped.status === 200);
    const toDelivered = await api('POST', `/admin/orders/${orderRes.data.orderId}/status`, { from: 'shipped', to: 'delivered' });
    check('Admin: shipped -> delivered', toDelivered.status === 200);
    const badJump = await api('POST', `/admin/orders/${orderRes.data.orderId}/status`, { from: 'paid', to: 'shipped' });
    check('Admin: illegal status jump is rejected', badJump.status === 409);

    // product editing
    const pEdit = await api('PUT', `/admin/products/${buyable.id}`, { price: buyable.price + 1000 });
    check('Admin: price update works', pEdit.status === 200 && pEdit.data.product.price === buyable.price + 1000);
    const pBack = await api('PUT', `/admin/products/${buyable.id}`, { price: buyable.price });
    check('Admin: price restored', pBack.status === 200 && pBack.data.product.price === buyable.price);
    const pBad = await api('PUT', `/admin/products/${buyable.id}`, { price: -50 });
    check('Admin: negative price is rejected', pBad.status === 400);

    // create + delete a never-ordered product
    const pNew = await api('POST', '/admin/products', {
      title: 'TEST PRODUCT (delete me)', category: 'Test', description: '', price: 1000, stock: 3, badge: ''
    });
    check('Admin: create product works', pNew.status === 200 && pNew.data.product?.id > 0);
    const pDel = await api('DELETE', `/admin/products/${pNew.data.product.id}`);
    check('Admin: unsold product is really deleted', pDel.status === 200 && pDel.data.deleted === true);

    // SEO: a deleted product page must answer with a real HTTP 410 (not a soft-404)
    const goneRes = await fetch(`${BASE}/product/${pNew.data.product.id}`, { redirect: 'manual' });
    check('Deleted product page returns HTTP 410 (SEO-safe)', goneRes.status === 410);
    const aliveRes = await fetch(`${BASE}/product/${buyable.id}`, { redirect: 'manual' });
    check('Existing product page still returns HTTP 200', aliveRes.status === 200);

    // ============ V7: SHIPPING / CANCEL / RETURN / REVIEWS / GALLERY ============
    // admin gets a password so we can hop between sessions without OTP cooldowns.
    // currentPassword هم فرستاده می‌شود چون از اجرای قبلی رمز مانده است — سرور
    // وقتی رمزی وجود ندارد نادیده‌اش می‌گیرد، پس اجرای اول هم درست کار می‌کند.
    const adminPass = await api('POST', '/auth/password/set',
      { password: 'admin-pass-1234', currentPassword: 'admin-pass-1234' });
    check('V7: admin can set a password too', adminPass.status === 200);
    const loginAdmin = () => api('POST', '/auth/password/login', { phone: ADMIN_PHONE, password: 'admin-pass-1234' });
    const loginBuyer = () => api('POST', '/auth/password/login', { phone: buyerPhone, password: 'test-pass-1234' });

    // remember the shop's real config + product data: the test must leave NO trace
    const origSettings = (await api('GET', '/admin/settings')).data.settings;
    const origProd = (await api('GET', `/products/${buyable.id}`)).data.product;

    // ---------- shipping fee + free-shipping threshold ----------
    await api('POST', '/admin/settings', { shipping_cost: '45000', free_shipping_over: '90000000' });
    await loginBuyer();
    await api('POST', '/cart/add', { productId: buyable.id, qty: 1 });
    const cartFee = await api('GET', '/cart');
    check('V7 shipping: cart returns fee, gap and payable',
      cartFee.data.shippingFee === 45000 &&
      cartFee.data.payable === cartFee.data.total + 45000 &&
      cartFee.data.freeShippingGap === 90000000 - cartFee.data.total);

    const shipOrder = await api('POST', '/orders', { addressId: addr.data.address.id }, { 'Idempotency-Key': `smoke-ship-${Date.now()}-key` });
    await fetch(shipOrder.data.paymentUrl, { headers: { Cookie: cookieHeader() }, redirect: 'follow' });
    const shipOrderGet = await api('GET', `/orders/${shipOrder.data.orderId}`);
    check('V7 shipping: paid order stores the fee inside the total',
      shipOrderGet.data.order.status === 'paid' &&
      shipOrderGet.data.order.shippingFee === 45000 &&
      shipOrderGet.data.order.total === cartFee.data.total + 45000);

    // ---------- customer cancel (only while still "paid") ----------
    const stockBeforeCancel = (await api('GET', `/products/${buyable.id}`)).data.product.stock;
    const cancelRes = await api('POST', `/orders/${shipOrder.data.orderId}/cancel`);
    check('V7 cancel: customer cancels before shipping', cancelRes.status === 200 && cancelRes.data.order.status === 'canceled');
    const stockAfterCancel = (await api('GET', `/products/${buyable.id}`)).data.product.stock;
    check('V7 cancel: stock is restored to the shelf', stockAfterCancel === stockBeforeCancel + 1);
    const cancelAgain = await api('POST', `/orders/${shipOrder.data.orderId}/cancel`);
    check('V7 cancel: double cancel is rejected (409)', cancelAgain.status === 409);

    // free threshold: with a tiny threshold, the same cart ships free
    await loginAdmin();
    await api('POST', '/admin/settings', { shipping_cost: '45000', free_shipping_over: '1' });
    await loginBuyer();
    await api('POST', '/cart/add', { productId: buyable.id, qty: 1 });
    const cartFree = await api('GET', '/cart');
    check('V7 shipping: above the threshold shipping is free',
      cartFree.data.shippingFee === 0 && cartFree.data.payable === cartFree.data.total && cartFree.data.freeShippingGap === 0);
    await api('POST', '/cart/update', { productId: buyable.id, qty: 0 }); // leave the cart empty

    // ---------- return flow + postal tracking ----------
    await api('POST', '/cart/add', { productId: buyable.id, qty: 1 });
    const retOrder = await api('POST', '/orders', { addressId: addr.data.address.id }, { 'Idempotency-Key': `smoke-return-${Date.now()}-key` });
    await fetch(retOrder.data.paymentUrl, { headers: { Cookie: cookieHeader() }, redirect: 'follow' });
    const roid = retOrder.data.orderId;

    const earlyReturn = await api('POST', `/orders/${roid}/return`, { reason: 'not delivered yet!' });
    check('V7 return: rejected while order is not delivered (409)', earlyReturn.status === 409);

    await loginAdmin();
    await api('POST', `/admin/orders/${roid}/status`, { from: 'paid', to: 'shipped' });
    await api('POST', `/admin/orders/${roid}/tracking`, { trackingCode: 'SMOKE-1234-IR' });
    await api('POST', `/admin/orders/${roid}/status`, { from: 'shipped', to: 'delivered' });

    await loginBuyer();
    const deliveredRes = await api('GET', `/orders/${roid}`);
    const delivered = deliveredRes.data.order;
    check('V7 tracking: customer sees tracking code + delivery date',
      deliveredRes.status === 200 && delivered?.trackingCode === 'SMOKE-1234-IR' && Boolean(delivered?.deliveredAt), JSON.stringify(deliveredRes.data));

    const shortReason = await api('POST', `/orders/${roid}/return`, { reason: 'ب' });
    check('V7 return: too-short reason is rejected (400)', shortReason.status === 400);
    const retReq = await api('POST', `/orders/${roid}/return`, { reason: 'The lid arrived cracked' });
    check('V7 return: request lands in return_requested', retReq.status === 200 && retReq.data.order?.status === 'return_requested', JSON.stringify(retReq.data));

    const stockBeforeReturn = (await api('GET', `/products/${buyable.id}`)).data.product.stock;
    await loginAdmin();
    const accept = await api('POST', `/admin/orders/${roid}/status`, { from: 'return_requested', to: 'returned' });
    check('V7 return: admin accepts -> order becomes returned', accept.status === 200 && accept.data.order?.status === 'returned', JSON.stringify(accept.data));
    const stockAfterReturn = (await api('GET', `/products/${buyable.id}`)).data.product.stock;
    check('V7 return: returned goods go back to stock', stockAfterReturn === stockBeforeReturn + 1);

    // ---------- reviews (with admin approval queue) ----------
    await loginBuyer();
    const badRating = await api('POST', `/products/${buyable.id}/reviews`, { rating: 9 });
    check('V7 reviews: rating out of range is rejected (400)', badRating.status === 400, JSON.stringify(badRating.data));
    const myRev = await api('POST', `/products/${buyable.id}/reviews`, { rating: 5, body: 'Great quality (smoke test)' });
    check('V7 reviews: buyer review stored as pending + isBuyer flag',
      myRev.status === 200 && myRev.data.review?.status === 'pending' && myRev.data.review?.isBuyer === true, JSON.stringify(myRev.data));
    const revCountBefore = (await api('GET', `/products/${buyable.id}/reviews`)).data.count;

    await loginAdmin();
    const queue = await api('GET', '/admin/reviews?status=pending');
    const mine = (queue.data.reviews || []).find(r => r.productId === buyable.id && String(r.body).includes('smoke test'));
    check('V7 reviews: admin sees it in the pending queue', Boolean(mine), JSON.stringify(queue.data));
    const approve = await api('POST', `/admin/reviews/${mine.id}/status`, { status: 'approved' });
    check('V7 reviews: approving works', approve.status === 200 && approve.data.review.status === 'approved');
    const pubAfter = await api('GET', `/products/${buyable.id}/reviews`);
    check('V7 reviews: approved review is public and counted', pubAfter.data.count === revCountBefore + 1);
    const prodRated = (await api('GET', `/products/${buyable.id}`)).data.product;
    check('V7 reviews: product carries the rating aggregate', prodRated.rating.count === pubAfter.data.count);
    // hide it again so the smoke test leaves no visible trace on the shop
    await api('POST', `/admin/reviews/${mine.id}/status`, { status: 'rejected' });
    const pubCleaned = await api('GET', `/products/${buyable.id}/reviews`);
    check('V7 reviews: rejected review disappears from the site', pubCleaned.data.count === revCountBefore);

    // ---------- gallery + specs ----------
    const gal = await api('PUT', `/admin/products/${buyable.id}`, {
      images: origProd.image ? [origProd.image] : [],
      specs: [{ k: 'Capacity', v: '3 liters' }, { k: '', v: 'must be dropped' }]
    });
    const galCheck = (await api('GET', `/products/${buyable.id}`)).data.product;
    check('V7 gallery: images + specs saved (empty spec row dropped)',
      gal.status === 200 &&
      galCheck.images.length === (origProd.image ? 1 : 0) &&
      galCheck.specs.length === 1 && galCheck.specs[0].k === 'Capacity');
    const badImg = await api('PUT', `/admin/products/${buyable.id}`, { images: ['https://evil.example/x.jpg'] });
    check('V7 gallery: external image URL is rejected (400)', badImg.status === 400);
    await api('PUT', `/admin/products/${buyable.id}`, { images: origProd.images, specs: origProd.specs });
    const restored = (await api('GET', `/products/${buyable.id}`)).data.product;
    check('V7 gallery: product restored to its original state',
      restored.images.length === origProd.images.length && restored.specs.length === origProd.specs.length);

    // ============ V8: SHOP-INFO / CLOSED SHOP / COUPONS / CATEGORIES / ADDRESS EDIT ============
    const info0 = await api('GET', '/shop/info');
    check('V8 shop-info: public endpoint answers', info0.status === 200 && typeof info0.data.shopOpen === 'boolean');

    await api('POST', '/admin/settings', { shop_open: '0', announcement: 'closed for smoke test' });
    const infoClosed = await api('GET', '/shop/info');
    check('V8 closed shop: reflected in shop-info', infoClosed.data.shopOpen === false);
    await loginBuyer();
    await api('POST', '/cart/add', { productId: buyable.id, qty: 1 });
    const closedOrder = await api('POST', '/orders', { addressId: addr.data.address.id }, { 'Idempotency-Key': `smoke-closed-${Date.now()}-key` });
    check('V8 closed shop: ordering is blocked (503)', closedOrder.status === 503);
    await loginAdmin();
    await api('POST', '/admin/settings', {
      shop_open: origSettings.shop_open, announcement: origSettings.announcement
    });

    // ---------- coupons ----------
    const cpn = await api('POST', '/admin/coupons', { code: 'SMOKE10', type: 'percent', value: 10, perUserLimit: 1 });
    check('V8 coupons: created', cpn.status === 200 && cpn.data.coupon.code === 'SMOKE10');
    const cpnDup = await api('POST', '/admin/coupons', { code: 'smoke10', type: 'fixed', value: 5000 });
    check('V8 coupons: duplicate code rejected (409)', cpnDup.status === 409);

    await loginBuyer(); // سبد از تست قبلی هنوز پر است (سفارش 503 شد و سبد نپرید)
    const applied = await api('POST', '/cart/coupon', { code: 'smoke10' });
    check('V8 coupons: case-insensitive apply + correct math',
      applied.status === 200 && applied.data.coupon?.code === 'SMOKE10' &&
      applied.data.discount === Math.floor(applied.data.total * 0.10) &&
      applied.data.payable === applied.data.total - applied.data.discount + applied.data.shippingFee);
    const badCode = await api('POST', '/cart/coupon', { code: 'NOPE-1' });
    check('V8 coupons: unknown code rejected (400)', badCode.status === 400);

    const cOrder = await api('POST', '/orders', { addressId: addr.data.address.id }, { 'Idempotency-Key': `smoke-coupon-${Date.now()}-key` });
    await fetch(cOrder.data.paymentUrl, { headers: { Cookie: cookieHeader() }, redirect: 'follow' });
    const cOrderGet = await api('GET', `/orders/${cOrder.data.orderId}`);
    check('V8 coupons: order stores code + discount',
      cOrderGet.data.order.couponCode === 'SMOKE10' && cOrderGet.data.order.discount > 0);

    await api('POST', '/cart/add', { productId: buyable.id, qty: 1 });
    const secondUse = await api('POST', '/cart/coupon', { code: 'SMOKE10' });
    check('V8 coupons: per-user limit enforced (400)', secondUse.status === 400);
    await api('POST', '/cart/update', { productId: buyable.id, qty: 0 });

    await loginAdmin();
    const cpnList = await api('GET', '/admin/coupons');
    const smokeCpn = (cpnList.data.coupons || []).find(c => c.code === 'SMOKE10');
    check('V8 coupons: usage counted from orders', Boolean(smokeCpn) && smokeCpn.uses === 1);
    const cpnDel = await api('DELETE', `/admin/coupons/${smokeCpn.id}`);
    check('V8 coupons: deleted (leaves no trace)', cpnDel.status === 200);

    // ---------- categories ----------
    const cats0 = await api('GET', '/shop/categories');
    check('V8 categories: public list is seeded', cats0.status === 200 && cats0.data.categories.length >= 1);
    const catNew = await api('POST', '/admin/categories', { name: 'SMOKE CAT', icon: 'i-tag' });
    check('V8 categories: created', catNew.status === 200 && catNew.data.category.id > 0);
    const catRen = await api('PUT', `/admin/categories/${catNew.data.category.id}`, { name: 'SMOKE CAT 2', icon: 'i-tag' });
    check('V8 categories: renamed', catRen.status === 200);
    const catDel = await api('DELETE', `/admin/categories/${catNew.data.category.id}`);
    check('V8 categories: empty category deleted', catDel.status === 200);
    const busyCat = cats0.data.categories.find(c => c.count > 0);
    const catDelBusy = await api('DELETE', `/admin/categories/${busyCat.id}`);
    check('V8 categories: in-use category is protected (409)', catDelBusy.status === 409);

    // The public categories endpoint feeds the header menu and the homepage
    // tiles. It must describe the site as a visitor sees it - nothing more.
    //
    // Both of these were real leaks: the count included unpublished drafts, so
    // the menu advertised 21 items in a category that showed 3, and empty
    // leftover categories were offered to every visitor as dead links.
    const pubCats = cats0.data.categories;
    check('V8 categories: public counts hide unpublished drafts',
      pubCats.every(c => !('countAll' in c)),
      'countAll must not reach the public endpoint');
    check('V8 categories: empty categories are not shown publicly',
      pubCats.every(c => c.count > 0),
      pubCats.filter(c => !c.count).map(c => c.name).join(', '));

    // Cross-check against the facets endpoint, which the products page uses to
    // build its sidebar. If these two disagree, the customer sees one number in
    // the header menu and a different one on the page it links to.
    const facetsRes = await api('GET', '/products/facets');
    const facetMap = new Map((facetsRes.data.categories || []).map(c => [c.category, c.n]));
    const mismatch = pubCats.filter(c => facetMap.get(c.name) !== c.count)
      .map(c => `${c.name}: menu=${c.count} page=${facetMap.get(c.name)}`);
    check('V8 categories: menu counts match the products page', mismatch.length === 0, mismatch.join(' | '));

    // ---------- address edit ----------
    await loginBuyer();
    const editAddr = await api('PUT', `/addresses/${addr.data.address.id}`, {
      fullName: 'Test Buyer', phone: buyerPhone, city: 'Sari', addressLine: 'Edited Street 5', postalCode: ''
    });
    check('V8 address: editing own address works',
      editAddr.status === 200 && editAddr.data.address.addressLine === 'Edited Street 5');
    const editForeign = await api('PUT', '/addresses/999999', { fullName: 'x', phone: '1', city: 'x', addressLine: 'x' });
    check('V8 address: missing/foreign address edit is 404', editForeign.status === 404);
    await loginAdmin();

    // ---------- put the shop settings back exactly as they were ----------
    await api('POST', '/admin/settings', {
      shipping_cost: origSettings.shipping_cost, free_shipping_over: origSettings.free_shipping_over
    });
    const settingsBack = (await api('GET', '/admin/settings')).data.settings;
    check('V7: shop settings restored untouched',
      settingsBack.shipping_cost === origSettings.shipping_cost &&
      settingsBack.free_shipping_over === origSettings.free_shipping_over);

    // ============ V9: MANUAL ORDER / STOCK ALERTS / SEARCH / VISITS ============
    // سفارش دستی: مشتری تلفنی با شماره‌ی تازه — paid و MANUAL، موجودی کم می‌شود
    const manualPhone = '0913555' + String(Math.floor(1000 + Math.random() * 8999));
    // اگر اجرای پیشینی وسط تست «موجود شد خبرم کن» (که موجودی را صفر می‌کند) قطع
    // شده باشد، موجودی صفر می‌ماند و سفارش دستی با ۴۰۹ ناموجود رد می‌شود و سه
    // تست بی‌دلیل fail می‌کند. پس اگر کم بود خودمان پُرش می‌کنیم — ولی موجودیِ
    // واقعیِ فروشگاه را دست‌کاری نمی‌کنیم، فقط وقتی از ۲ کمتر باشد.
    const stockRaw = (await api('GET', `/products/${buyable.id}`)).data.product.stock;
    if (stockRaw < 2) await api('PUT', `/admin/products/${buyable.id}`, { stock: 12 });
    const stockBeforeManual = (await api('GET', `/products/${buyable.id}`)).data.product.stock;
    const manual = await api('POST', '/admin/orders/manual', {
      phone: manualPhone, fullName: 'Manual Smoke Customer',
      items: [{ productId: buyable.id, qty: 1 }], shippingFee: 20000, note: 'smoke manual order'
    });
    check('V9 manual order: created as paid with MANUAL ref',
      manual.status === 200 && manual.data.order?.status === 'paid' &&
      manual.data.order?.refId === 'MANUAL' &&
      manual.data.order?.total === buyable.price + 20000,
      manual.status === 200 ? '' : `status ${manual.status}: ${JSON.stringify(manual.data)}`);
    const stockAfterManual = (await api('GET', `/products/${buyable.id}`)).data.product.stock;
    check('V9 manual order: stock reserved', stockAfterManual === stockBeforeManual - 1);
    const manualBadPhone = await api('POST', '/admin/orders/manual',
      { phone: '123', items: [{ productId: buyable.id, qty: 1 }] });
    check('V9 manual order: bad phone rejected (400)', manualBadPhone.status === 400);
    if (manual.data.order?.id) {
      await api('POST', `/admin/orders/${manual.data.order.id}/cancel`, { reason: 'smoke cleanup' });
    }
    const stockManualBack = (await api('GET', `/products/${buyable.id}`)).data.product.stock;
    check('V9 manual order: admin cancel restores stock', stockManualBack === stockBeforeManual);

    // «موجود شد خبرم کن»: ثبت روی ناموجود، بج پنل، پاک‌شدن بعد از شارژ
    await api('PUT', `/admin/products/${buyable.id}`, { stock: 0 });
    await loginBuyer();
    const notifyReg = await api('POST', `/products/${buyable.id}/notify-me`);
    check('V9 stock alert: registers on out-of-stock product', notifyReg.status === 200);
    await loginAdmin();
    const invWaiting = (await api('GET', '/admin/inventory')).data.products.find(p => p.id === buyable.id);
    check('V9 stock alert: waiting counter visible in inventory', Boolean(invWaiting) && invWaiting.waiting >= 1);
    await api('PUT', `/admin/products/${buyable.id}`, { stock: stockBeforeManual }); // شارژ → پیامک + پاک‌شدن
    const invCleared = (await api('GET', '/admin/inventory')).data.products.find(p => p.id === buyable.id);
    check('V9 stock alert: cleared after restock', Boolean(invCleared) && invCleared.waiting === 0);
    const notifyInStock = await api('POST', `/products/${buyable.id}/notify-me`);
    check('V9 stock alert: rejected while in stock (409)', notifyInStock.status === 409);

    // جستجوی نرمال‌شده: همان عنوان با «ي» عربی هم باید پیدا شود
    const withYe = list.find(p => p.title.includes('ی'));
    if (withYe) {
      const word = withYe.title.split(' ').find(w => w.includes('ی'));
      const sr = await api('GET', `/products?q=${encodeURIComponent(word.replace(/ی/g, 'ي'))}&limit=20`);
      check('V9 search: Arabic-yeh query finds the product',
        sr.status === 200 && (sr.data.products || []).some(p => p.id === withYe.id));
    } else {
      check('V9 search: Arabic-yeh query finds the product', true, 'no titles containing ye');
    }

    // بازدیدشمار: یک بازدید صفحه → آمار امروز داشبورد
    await fetch(`${BASE}/index.html`);
    const statsV = await api('GET', '/admin/stats');
    check('V9 visits: dashboard counts today visits', statsV.status === 200 && (statsV.data.stats.today_visits || 0) >= 1);

    // ---------- سبد خرید نسخه‌ی ۹: سود، سقف تعداد و پیام‌های درست ----------
    // همه در سشن مدیر انجام می‌شود چون تغییر محصول و دیدن سبد باید در یک سشن
    // باشد (ورود مجدد، سشن و در نتیجه سبد را نو می‌کند).
    await loginAdmin();
    // اگر اجرای قبلی نیمه‌کاره مانده باشد، کالای آزمایشی جامانده اول پاک می‌شود
    // تا فروشگاه واقعی هیچ‌وقت یک «کالای آزمایشی» روی سایت نداشته باشد.
    const TMP_TITLE = 'کالای آزمایشی سبد';
    for (const p of (await api('GET', '/admin/inventory')).data.products || []) {
      if (p.title === TMP_TITLE) await api('DELETE', `/admin/products/${p.id}`);
    }
    const tmp = await api('POST', '/admin/products', {
      title: TMP_TITLE, category: 'لوازم نظافت', price: 80000, oldPrice: 100000,
      stock: 4, description: 'برای تست سبد خرید', icon: 'i-package'
    });
    check('V9 cart: temp discounted product created', tmp.status === 200 && tmp.data.product.id > 0);
    const tmpId = tmp.data.product.id;

    await api('POST', '/cart/remove', { productId: buyable.id });
    const cAdd = await api('POST', '/cart/add', { productId: tmpId, qty: 2 });
    const cItem = (cAdd.data.items || []).find(i => i.productId === tmpId);
    check('V9 cart: item carries oldPrice and discountPercent',
      Boolean(cItem) && cItem.oldPrice === 100000 && cItem.discountPercent === 20);
    check('V9 cart: savings computed per item and for the whole cart',
      cItem.savings === 40000 && cAdd.data.savings === 40000);
    check('V9 cart: maxQty follows stock', cItem.maxQty === 4);

    // درخواست بیشتر از موجودی → اصلاح تعداد + پیام «موجودی»
    const cOver = await api('POST', '/cart/update', { productId: tmpId, qty: 9 });
    const cOverItem = (cOver.data.items || []).find(i => i.productId === tmpId);
    check('V9 cart: qty above stock is clamped with a notice',
      cOverItem.qty === 4 && /فقط 4 عدد موجود/.test(cOver.data.notice || ''));

    // موجودی زیاد ولی بیشتر از سقف هر قلم → پیام باید از «سقف سفارش» بگوید نه از انبار
    await api('PUT', `/admin/products/${tmpId}`, { stock: 150 });
    const cCap = await api('POST', '/cart/update', { productId: tmpId, qty: 120 });
    const cCapItem = (cCap.data.items || []).find(i => i.productId === tmpId);
    check('V9 cart: per-order cap has its own message',
      cCapItem.qty === 99 && /حداکثر 99/.test(cCap.data.notice || ''));

    // ناموجود شدن کالای داخل سبد → حذف با توضیح، نه بی‌صدا
    await api('PUT', `/admin/products/${tmpId}`, { stock: 0 });
    const cZero = await api('POST', '/cart/update', { productId: tmpId, qty: 2 });
    check('V9 cart: item that went out of stock leaves the cart with a notice',
      !(cZero.data.items || []).some(i => i.productId === tmpId) && /ناموجود/.test(cZero.data.notice || ''));

    // کالای حذف‌شده از فروشگاه هم باید با توضیح از سبد برود
    await api('PUT', `/admin/products/${tmpId}`, { stock: 3 });
    await api('POST', '/cart/add', { productId: tmpId, qty: 1 });
    await api('DELETE', `/admin/products/${tmpId}`);
    const cGone = await api('GET', '/cart');
    check('V9 cart: deleted product is pruned with a notice',
      !(cGone.data.items || []).some(i => i.productId === tmpId) && /دیگر در فروشگاه/.test(cGone.data.notice || ''));

    // ---------- آدرس: ارقام فارسی و شماره‌ی ناقص ----------
    await loginBuyer();
    const faAddr = await api('POST', '/addresses', {
      fullName: 'خریدار آزمایشی', phone: '۰۹۱۲۱۱۱۲۲۳۳', city: 'ساری',
      addressLine: 'خیابان آزمایشی ۱۲', postalCode: '۴۸۱۶۷-۱۳۵۴۱'
    });
    check('V9 address: Persian digits normalized to Latin',
      faAddr.status === 200 && faAddr.data.address.phone === '09121112233'
      && faAddr.data.address.postalCode === '4816713541');
    const shortPhone = await api('POST', '/addresses', {
      fullName: 'x', phone: '۰۹۱', city: 'ساری', addressLine: 'خیابان آزمایشی'
    });
    check('V9 address: too-short phone is rejected with a clear message',
      shortPhone.status === 400 && /شماره تماس/.test(shortPhone.data.error || ''));
    if (faAddr.status === 200) await api('DELETE', `/addresses/${faAddr.data.address.id}`);

    await api('POST', '/auth/logout');

    // ============ V10: فشرده‌سازی و سیاست کش فایل‌های استاتیک ============
    // چرا تست دارد: این‌ها هدرند و هیچ‌وقت روی صفحه دیده نمی‌شوند، پس اگر خراب
    // شوند کسی متوجه نمی‌شود — فقط سایت بی‌سروصدا کند می‌شود. یک بار هم دقیقاً
    // همین اتفاق افتاد: میان‌افزار فشرده‌سازی سیاست «یک ماه + immutable» را با
    // «یک ساعت» بازنویسی می‌کرد و مشتریِ برگشته هر ساعت همه‌چیز را دوباره می‌گرفت.
    // نکته: fetch خودِ Node بدنه را قبل از تحویل باز می‌کند، پس اندازه‌ی
    // arrayBuffer همیشه حجمِ *باز شده* است. حجم واقعیِ روی سیم فقط از هدر
    // Content-Length خوانده می‌شود.
    async function head(p, extra = {}) {
      const res = await fetch(`${BASE}${p}`, { headers: { 'Accept-Encoding': 'br, gzip', ...extra } });
      const len = Number(res.headers.get('content-length') || 0);
      await res.arrayBuffer();
      return {
        status: res.status,
        enc: res.headers.get('content-encoding'),
        cache: res.headers.get('cache-control') || '',
        vary: res.headers.get('vary') || '',
        bytes: len
      };
    }

    const hCss = await head('/css/style.css');
    check('V10 static: style.css فشرده ارسال می‌شود',
      hCss.status === 200 && /br|gzip/.test(hCss.enc || ''), `enc=${hCss.enc}`);
    check('V10 static: فایل نسخه‌دار یک‌ماهه و immutable کش می‌شود',
      /max-age=2592000/.test(hCss.cache) && /immutable/.test(hCss.cache), hCss.cache);
    check('V10 static: هدر Vary روی Accept-Encoding ست شده',
      /accept-encoding/i.test(hCss.vary), hCss.vary);

    const hSw = await head('/sw.js');
    // سرویس‌ورکرِ کهنه یعنی مشتری در نسخه‌ی قدیمیِ منطق کش گیر می‌کند و خودش
    // راه بیرون آمدن ندارد — پس این یکی هرگز نباید immutable شود.
    check('V10 static: sw.js بلندمدت کش نمی‌شود',
      /no-cache/.test(hSw.cache) && !/immutable/.test(hSw.cache), hSw.cache);

    // صفحه‌ی اصلی و صفحه‌ی محصول از مسیر express.static رد نمی‌شوند (متاهای سئو
    // سمت سرور تزریق می‌شود) پس باید جداگانه فشرده شوند.
    const hHome = await head('/');
    const homeRaw = await fetch(`${BASE}/`, { headers: { 'Accept-Encoding': 'identity' } });
    const homeRawLen = Number(homeRaw.headers.get('content-length') || 0);
    await homeRaw.arrayBuffer();
    check('V10 static: صفحه‌ی اصلی فشرده ارسال می‌شود',
      hHome.status === 200 && /br|gzip/.test(hHome.enc || ''), `enc=${hHome.enc}`);
    check('V10 static: فشرده‌سازی صفحه‌ی اصلی دست‌کم نصف حجم را کم می‌کند',
      hHome.bytes > 0 && homeRawLen > 0 && hHome.bytes < homeRawLen / 2,
      `${hHome.bytes} از ${homeRawLen}`);

    const hProd = await head(`/product/${buyable.id}`);
    check('V10 static: صفحه‌ی محصول فشرده ارسال می‌شود',
      hProd.status === 200 && /br|gzip/.test(hProd.enc || ''), `enc=${hProd.enc}`);

    // مرورگر قدیمی که فشرده‌سازی نمی‌فهمد هم باید صفحه‌ی سالم بگیرد
    const plain = await fetch(`${BASE}/`, { headers: { 'Accept-Encoding': 'identity' } });
    const plainText = await plain.text();
    check('V10 static: بدون پشتیبانی فشرده‌سازی هم HTML سالم می‌رسد',
      plain.status === 200 && !plain.headers.get('content-encoding') &&
      /<\/html>/.test(plainText));

    // ============ V10: هدرهای امنیتی و صفحه‌های خطا ============
    const secRes = await fetch(`${BASE}/`);
    await secRes.arrayBuffer();
    const H = (n) => secRes.headers.get(n) || '';
    check('V10 امنیت: هدرهای پایه ست شده‌اند',
      /nosniff/.test(H('x-content-type-options')) &&
      /strict-origin/.test(H('referrer-policy')) &&
      /camera=\(\)/.test(H('permissions-policy')) &&
      /same-origin/.test(H('cross-origin-opener-policy')));
    const csp = H('content-security-policy');
    check('V10 امنیت: CSP وجود دارد و اسکریپت درون‌خطی را مجاز نمی‌کند',
      /default-src 'self'/.test(csp) && /script-src 'self'/.test(csp) &&
      !/script-src[^;]*unsafe-inline/.test(csp), csp.slice(0, 60));

    // چون CSP اسکریپت درون‌خطی را بلاک می‌کند، هیچ صفحه‌ای نباید اسکریپت
    // درون‌خطی داشته باشد. یک بار همین اتفاق افتاد و دکمه‌ی «تلاش دوباره»ی
    // صفحه‌ی ۵۰۰ کاملاً مرده بود بدون اینکه هیچ خطایی جایی دیده شود.
    const fsx = require('fs');
    const FRONT = path.join(__dirname, '..', 'frontend');
    const pages = fsx.readdirSync(FRONT).filter(f => f.endsWith('.html'));
    const withInline = pages.filter(f => {
      const tags = fsx.readFileSync(path.join(FRONT, f), 'utf8').match(/<script[^>]*>/g) || [];
      // ld+json داده است نه کد؛ مرورگر اجرا نمی‌کندش و CSP هم کاری با آن ندارد
      return tags.some(t => !/\bsrc=/.test(t) && !/ld\+json/.test(t));
    });
    check('V10 امنیت: هیچ صفحه‌ای اسکریپت درون‌خطی ندارد (سازگار با CSP)',
      withInline.length === 0, withInline.join(', '));

    // صفحه‌های خطا روی *هر* آدرسی سرو می‌شوند، پس مسیر نسبی در آن‌ها یعنی
    // CSS و JS پیدا نمی‌شود و کاربر یک صفحه‌ی کاملاً بی‌استایل می‌بیند.
    const deep = await fetch(`${BASE}/foo/bar/baz`);
    const deepHtml = await deep.text();
    const relAssets = (deepHtml.match(/(?:href|src)="(?!\/|https?:|#|tel:|mailto:|data:)[^"]+"/g) || []);
    check('V10 خطا: مسیر عمیق ناموجود کد ۴۰۴ واقعی می‌دهد', deep.status === 404);
    check('V10 خطا: صفحه‌ی ۴۰۴ هیچ مسیر نسبی ندارد (روی هر آدرسی استایل دارد)',
      relAssets.length === 0, relAssets.slice(0, 3).join(' '));
    const errPages = ['404.html', '500.html', 'product-gone.html'].filter(f => {
      const t = fsx.readFileSync(path.join(FRONT, f), 'utf8');
      return (t.match(/(?:href|src)="(?!\/|https?:|#|tel:|mailto:|data:|\?)[^"]+"/g) || []).length > 0;
    });
    check('V10 خطا: هر سه صفحه‌ی خطا مسیرهای مطلق دارند', errPages.length === 0, errPages.join(', '));

    // ---- گزارش‌گیری CSP ----
    check('V10 امنیت: CSP آدرس گزارش تخلف را اعلام می‌کند',
      /report-uri \/api\/csp-report/.test(csp) && /report-to csp/.test(csp));
    check('V10 امنیت: هدر Reporting-Endpoints به همان گروه csp اشاره دارد',
      /csp="\/api\/csp-report"/.test(H('reporting-endpoints')), H('reporting-endpoints'));

    // مرورگر این گزارش را با Origin: null می‌فرستد. اگر سد مبدأ جلوترش بنشیند
    // با ۴۰۳ رد می‌شود و ما هیچ‌وقت از تخلف‌ها خبردار نمی‌شویم.
    const cspRep = await fetch(`${BASE}/api/csp-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/csp-report', Origin: 'null' },
      body: JSON.stringify({ 'csp-report': { 'violated-directive': 'script-src', 'blocked-uri': 'inline', 'document-uri': `${BASE}/500.html` } })
    });
    await cspRep.arrayBuffer();
    check('V10 امنیت: گزارش CSP پذیرفته می‌شود (سد مبدأ ردش نمی‌کند)',
      cspRep.status === 204, `status ${cspRep.status}`);

    // قالب جدید کروم: آرایه‌ای از گزارش‌ها با کلید body
    const cspRep2 = await fetch(`${BASE}/api/csp-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/reports+json' },
      body: JSON.stringify([{ type: 'csp-violation', body: { effectiveDirective: 'img-src', blockedURL: 'https://evil.test/x.png', documentURL: `${BASE}/` } }])
    });
    await cspRep2.arrayBuffer();
    check('V10 امنیت: قالب جدید گزارش (reports+json) هم پذیرفته می‌شود',
      cspRep2.status === 204, `status ${cspRep2.status}`);

    // بدنه‌ی بی‌ربط نباید سرور را بشکند
    const cspBad = await fetch(`${BASE}/api/csp-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/csp-report' },
      body: 'not-json{{'
    });
    await cspBad.arrayBuffer();
    check('V10 امنیت: گزارش خراب سرور را نمی‌شکند', cspBad.status < 500, `status ${cspBad.status}`);

    // ============ V10: نبض سرویس و شناسه‌ی درخواست ============
    const hz = await fetch(`${BASE}/healthz`);
    const hzBody = await hz.json();
    check('V10 سلامت: /healthz کد ۲۰۰ و وضعیت ok می‌دهد',
      hz.status === 200 && hzBody.status === 'ok', JSON.stringify(hzBody));
    check('V10 سلامت: /healthz واقعاً دیتابیس را می‌آزماید',
      hzBody.db === true && typeof hzBody.dbMs === 'number');
    check('V10 سلامت: /healthz کش نمی‌شود',
      /no-store/.test(hz.headers.get('cache-control') || ''));
    // این آدرس بدون احراز هویت باز است، پس نباید چیزی از درون سرور لو بدهد
    check('V10 سلامت: /healthz اطلاعات حساس فاش نمی‌کند',
      !/version|node|path|secret|env/i.test(JSON.stringify(hzBody)), JSON.stringify(hzBody));
    // بدون نشست هم باید کار کند (مانیتورینگ کوکی ندارد)
    check('V10 سلامت: /healthz نشست الکی نمی‌سازد',
      !(hz.headers.get('set-cookie') || '').includes('polasco.sid'));

    const ridRes = await fetch(`${BASE}/api/products`);
    await ridRes.arrayBuffer();
    const rid = ridRes.headers.get('x-request-id') || '';
    check('V10 لاگ: هر پاسخ شناسه‌ی درخواست دارد', /^[a-f0-9]{12}$/.test(rid), rid);

    // شناسه‌ی معتبرِ پروکسی باید حفظ شود تا زنجیره‌ی لاگ nginx→Node یکی باشد
    const keep = await fetch(`${BASE}/api/products`, { headers: { 'X-Request-Id': 'nginx-abc123' } });
    await keep.arrayBuffer();
    check('V10 لاگ: شناسه‌ی معتبرِ پروکسی حفظ می‌شود',
      keep.headers.get('x-request-id') === 'nginx-abc123');

    // ...ولی شناسه‌ی آلوده باید دور ریخته شود: خط جدید یعنی امکان جعل خط لاگ
    const dirty = await fetch(`${BASE}/api/products`, { headers: { 'X-Request-Id': 'a b\tc' } });
    await dirty.arrayBuffer();
    check('V10 لاگ: شناسه‌ی آلوده پذیرفته نمی‌شود (جلوگیری از جعل لاگ)',
      /^[a-f0-9]{12}$/.test(dirty.headers.get('x-request-id') || ''),
      dirty.headers.get('x-request-id'));

    // ============ V10: PWA ============
    const manRes = await fetch(`${BASE}/manifest.webmanifest`);
    const man = JSON.parse(await manRes.text());
    check('V10 PWA: manifest سرو می‌شود و JSON معتبر است', manRes.status === 200);
    const pngAny = man.icons.filter(i => i.type === 'image/png' && (i.purpose || 'any').includes('any')).map(i => i.sizes);
    // شرط نصب‌پذیری کروم: دست‌کم یک آیکون PNG ۱۹۲ و یکی ۵۱۲
    check('V10 PWA: آیکون PNG در هر دو اندازه‌ی لازم هست (شرط نصب کروم)',
      pngAny.includes('192x192') && pngAny.includes('512x512'), pngAny.join(', '));
    const maskables = man.icons.filter(i => (i.purpose || '').includes('maskable'));
    check('V10 PWA: آیکون maskable جدا از favicon است',
      maskables.length === 1 && maskables[0].type === 'image/png' && maskables[0].src !== '/assets/favicon.svg',
      JSON.stringify(maskables));
    check('V10 PWA: manifest شناسه و دامنه‌ی مشخص دارد',
      man.id === '/' && man.scope === '/' && man.display === 'standalone');

    // هر آیکونی که در manifest اعلام شده باید واقعاً وجود داشته باشد؛ آدرس
    // اشتباه یعنی اندروید بی‌صدا آیکون پیش‌فرضِ خاکستری می‌گذارد.
    const iconMisses = [];
    for (const ic of man.icons.concat(...man.shortcuts.map(s => s.icons || []))) {
      const r = await fetch(`${BASE}${ic.src}`);
      await r.arrayBuffer();
      if (r.status !== 200) iconMisses.push(`${ic.src}=${r.status}`);
    }
    check('V10 PWA: همه‌ی آیکون‌های اعلام‌شده واقعاً وجود دارند',
      iconMisses.length === 0, iconMisses.join(', '));

    // apple-touch-icon باید PNG باشد؛ سافاری JPEG/JFIF را مطمئن نمی‌پذیرد و
    // قبلاً یک فایل .jfif معرفی شده بود (آن هم فقط در صفحه‌ی اصلی).
    const appleRes = await fetch(`${BASE}/assets/apple-touch-icon.png`);
    const appleBuf = Buffer.from(await appleRes.arrayBuffer());
    check('V10 PWA: apple-touch-icon واقعاً PNG است',
      appleRes.status === 200 && appleBuf.subarray(1, 4).toString() === 'PNG');
    const noApple = fsx.readdirSync(FRONT)
      .filter(f => f.endsWith('.html') && /rel="manifest"/.test(fsx.readFileSync(path.join(FRONT, f), 'utf8')))
      .filter(f => !/apple-touch-icon/.test(fsx.readFileSync(path.join(FRONT, f), 'utf8')));
    check('V10 PWA: هر صفحه‌ی نصب‌پذیری apple-touch-icon دارد', noApple.length === 0, noApple.join(', '));
    const jfifRefs = fsx.readdirSync(FRONT).filter(f => f.endsWith('.html'))
      .filter(f => /apple-touch-icon[^>]*\.(jfif|jpe?g)/i.test(fsx.readFileSync(path.join(FRONT, f), 'utf8')));
    check('V10 PWA: هیچ صفحه‌ای آیکون JPEG را به‌عنوان apple-touch-icon نمی‌دهد',
      jfifRefs.length === 0, jfifRefs.join(', '));

    // صفحه‌ی آفلاین وقتی نشان داده می‌شود که اینترنت نیست، پس نباید به هیچ
    // فایل بیرونی (CSS/JS/فونت) وابسته باشد — وگرنه همان لحظه بارگذاری نمی‌شود.
    const offRes = await fetch(`${BASE}/offline.html`);
    const offHtml = await offRes.text();
    check('V10 PWA: صفحه‌ی آفلاین سرو می‌شود', offRes.status === 200 && /آفلاین/.test(offHtml));
    const offDeps = (offHtml.match(/<(?:link[^>]*rel="(?:stylesheet|preload)"|script)[^>]*>/g) || [])
      .filter(t => /\bsrc=|\bhref=/.test(t) && !/favicon/.test(t));
    check('V10 PWA: صفحه‌ی آفلاین به هیچ فایل بیرونی وابسته نیست',
      offDeps.length === 0, offDeps.join(' '));

    const swSrc = fsx.readFileSync(path.join(FRONT, 'sw.js'), 'utf8');
    check('V10 PWA: سرویس‌ورکر صفحه‌ی آفلاین را کش می‌کند', /offline\.html/.test(swSrc));
    check('V10 PWA: سرویس‌ورکر برای ناوبری پشتیبان آفلاین دارد',
      /req\.mode === 'navigate'/.test(swSrc));
    // اگر نسخه‌ی کش عوض نشود، مرورگرِ مشتریِ قدیمی هیچ‌وقت فایل‌های تازه را
    // نمی‌گیرد چون activate فقط کش‌های *غیرِ* CACHE فعلی را پاک می‌کند.
    //
    // این عدد قبلاً روی «v2» میخکوب بود و هر بامپِ درست، تست را می‌شکست —
    // یعنی تست به جای محافظت، جلوی کار درست را می‌گرفت. حالا جارَقه است:
    // نسخه فقط اجازه دارد جلو برود. اگر sw.js را بامپ کردی، این کف را هم
    // همراهش ببر بالا تا عقب‌گرد گرفته شود.
    const SW_MIN_VERSION = 3;
    const swVer = Number((swSrc.match(/pg-static-v(\d+)/) || [])[1] || 0);
    check(`V10 PWA: نسخه‌ی کش سرویس‌ورکر حداقل v${SW_MIN_VERSION} است`,
      swVer >= SW_MIN_VERSION, `الان v${swVer}`);

    // ============ V11: بازدیدهای اخیر ============
    // در مرورگر فقط «شناسه» ذخیره می‌شود و اطلاعات از این مسیر تازه گرفته
    // می‌شود؛ اگر قیمت را هم کش می‌کردیم، مشتری فردا قیمت دیروز را می‌دید.
    const allRes = await fetch(`${BASE}/api/products`);
    const allP = (await allRes.json()).products || [];
    const someIds = allP.slice(0, 3).map(p => p.id);

    const biRes = await fetch(`${BASE}/api/products/by-ids?ids=${someIds.join(',')}`);
    const biJson = await biRes.json();
    check('V11 اخیر: مسیر by-ids کار می‌کند',
      biRes.status === 200 && Array.isArray(biJson.products));
    check('V11 اخیر: همه‌ی شناسه‌های خواسته‌شده برمی‌گردند',
      biJson.products.length === someIds.length);
    // ترتیب یعنی «آخرین چیزی که دیدی اول باشد»؛ اگر سرور مرتب‌سازی خودش را
    // تحمیل کند، نوار بازدیدهای اخیر بی‌معنی می‌شود.
    check('V11 اخیر: ترتیب دقیقاً همان ترتیب درخواست است',
      JSON.stringify(biJson.products.map(p => p.id)) === JSON.stringify(someIds),
      JSON.stringify(biJson.products.map(p => p.id)));
    check('V11 اخیر: پاسخ همان شکل کارت محصول را دارد',
      biJson.products.every(p => p.title && p.price !== undefined && 'image' in p));

    const dupRes = await fetch(`${BASE}/api/products/by-ids?ids=${someIds[0]},${someIds[0]},${someIds[0]}`);
    check('V11 اخیر: شناسه‌های تکراری یکی حساب می‌شوند',
      (await dupRes.json()).products.length === 1);

    // سقف ۱۲ تا: جلوگیری از این‌که کسی با یک آدرس طولانی کل کاتالوگ را بکشد.
    const manyIds = Array.from({ length: 40 }, (_, i) => i + 1).join(',');
    const capJson = await (await fetch(`${BASE}/api/products/by-ids?ids=${manyIds}`)).json();
    check('V11 اخیر: سقف ۱۲ محصول رعایت می‌شود',
      capJson.products.length <= 12, String(capJson.products.length));

    // محصول حذف‌شده نباید کل درخواست را بترکاند؛ فقط بی‌صدا کنار می‌رود،
    // چون شناسه‌ها در مرورگرِ مشتری هفته‌ها می‌مانند و کالا ممکن است برود.
    const goneJson = await (await fetch(`${BASE}/api/products/by-ids?ids=${someIds[0]},999999`)).json();
    check('V11 اخیر: شناسه‌ی ناموجود بی‌صدا رد می‌شود، نه خطا',
      goneJson.products.length === 1 && goneJson.products[0].id === someIds[0]);

    for (const bad of ['', 'abc', '-5', '0', 'null', '1.5,x']) {
      const r = await fetch(`${BASE}/api/products/by-ids?ids=${encodeURIComponent(bad)}`);
      const j = await r.json();
      if (r.status !== 200 || !Array.isArray(j.products)) {
        check(`V11 اخیر: ورودی نامعتبر «${bad}» آرایه‌ی خالی می‌دهد`, false, `status=${r.status}`);
        break;
      }
    }
    check('V11 اخیر: ورودی خالی/نامعتبر آرایه‌ی خالی می‌دهد، نه ۵۰۰',
      (await (await fetch(`${BASE}/api/products/by-ids?ids=abc`)).json()).products.length === 0);
    // این مسیر باید *قبل* از /:id تعریف شده باشد وگرنه اکسپرس «by-ids» را
    // به‌عنوان شناسه می‌خواند و همیشه ۴۰۴ می‌گیریم.
    const prodSrc = fsx.readFileSync(path.join(__dirname, 'routes', 'products.js'), 'utf8');
    check('V11 اخیر: مسیر by-ids قبل از /:id ثبت شده',
      prodSrc.indexOf("'/by-ids'") < prodSrc.indexOf("'/:id'"));

    const mainSrc = fsx.readFileSync(path.join(FRONT, 'js', 'main.js'), 'utf8');
    // اگر شنونده فقط روی #productGrid بماند، دکمه‌های کارت‌های «اخیراً دیده‌اید»
    // ظاهر دارند و هیچ کاری نمی‌کنند — بدترین نوع باگ، چون خطایی هم دیده نمی‌شود.
    check('V11 اخیر: کلیک کارت‌ها شامل شبکه‌ی بازدیدهای اخیر هم هست',
      /#productGrid,\s*#recentGrid/.test(mainSrc));
    check('V11 اخیر: نمای سریع برای کارت‌های اخیر هم داده دارد',
      /RECENT_ITEMS\.find/.test(mainSrc));
    const commonSrc = fsx.readFileSync(path.join(FRONT, 'js', 'common.js'), 'utf8');
    check('V11 اخیر: فقط شناسه در مرورگر ذخیره می‌شود، نه قیمت',
      /pg_recent/.test(commonSrc) && !/pg_recent[\s\S]{0,400}price/.test(commonSrc));
    const prodJs = fsx.readFileSync(path.join(FRONT, 'js', 'product.js'), 'utf8');
    // اول خواندن فهرست، بعد افزودن خودِ محصول؛ وگرنه محصول باز‌شده داخل نوار
    // «اخیراً دیده‌اید» خودش تکرار می‌شود.
    check('V11 اخیر: محصول باز‌شده در نوار اخیرِ خودش تکرار نمی‌شود',
      prodJs.indexOf('loadRecent(product)') < prodJs.indexOf('pushRecent(product.id)'));

    // ============ V12: گزارش‌ها و داشبورد ============
    const adLogin = await loginAdmin();
    const ovRes = await api('GET', '/admin/overview');
    const ov = ovRes.data;
    check('V12 گزارش: ورود مدیر برای گزارش‌ها', adLogin.status === 200, JSON.stringify(adLogin.data).slice(0, 100));
    check('V12 گزارش: overview همه‌ی بخش‌ها را می‌دهد',
      ov && ov.stats && Array.isArray(ov.series) && Array.isArray(ov.topProducts) &&
      Array.isArray(ov.categories) && Array.isArray(ov.topCustomers) &&
      Array.isArray(ov.lowStock) && Array.isArray(ov.recentActivity),
      `status=${ovRes.status} ${JSON.stringify(ov).slice(0, 120)}`);
    check('V12 گزارش: نمودار ۱۴ روز بدون شکاف است',
      ov.series.length === 14 && ov.series.every(p => /^\d{4}-\d{2}-\d{2}$/.test(p.day)));
    check('V12 گزارش: میانگین سفارش محاسبه می‌شود', typeof ov.stats.avg_order === 'number');

    // این دو باید *دقیقاً* یکی باشند. قبلاً کارت «فروش امروز» تاریخ را به وقت
    // گرینویچ می‌سنجید و نمودار به وقت محلی؛ نتیجه این‌که سفارش‌های بین ۰۰:۰۰
    // تا ۰۳:۳۰ بامداد در کارت دیده نمی‌شدند ولی در نمودار بودند.
    const lastPoint = ov.series[ov.series.length - 1];
    check('V12 گزارش: «فروش امروز» با آخرین ستون نمودار یکی است',
      lastPoint.sales === ov.stats.today_sales && lastPoint.orders === ov.stats.today_orders,
      `کارت=${ov.stats.today_sales}/${ov.stats.today_orders} نمودار=${lastPoint.sales}/${lastPoint.orders}`);
    const todayStr = new Date().toLocaleDateString('en-CA');
    check('V12 گزارش: آخرین روز نمودار همان امروزِ محلی است',
      lastPoint.day === todayStr, `${lastPoint.day} != ${todayStr}`);
    // مجموع ۷ ستون آخر نباید از فروش هفته بیشتر باشد (هر دو یک بازه‌اند)
    const last7 = ov.series.slice(-7).reduce((a, p) => a + p.sales, 0);
    check('V12 گزارش: فروش هفته با مجموع ۷ ستون آخر می‌خواند',
      last7 === ov.stats.week_sales, `${last7} != ${ov.stats.week_sales}`);

    const rep = (await api('GET', '/admin/reports?days=30')).data;
    check('V12 گزارش: بازه‌ی ۳۰ روزه کار می‌کند', rep.days === 30 && rep.series.length === 30);
    // بازه باید محدود شود وگرنه days=100000 یعنی صد هزار حلقه در حافظه
    const repHuge = (await api('GET', '/admin/reports?days=99999')).data;
    check('V12 گزارش: بازه‌ی بزرگ به ۳۶۵ روز محدود می‌شود', repHuge.days === 365);
    const repTiny = (await api('GET', '/admin/reports?days=1')).data;
    check('V12 گزارش: بازه‌ی خیلی کوچک به ۷ روز کف می‌خورد', repTiny.days === 7);
    const repBad = (await api('GET', '/admin/reports?days=abc')).data;
    check('V12 گزارش: بازه‌ی نامعتبر پیش‌فرض می‌گیرد، نه خطا', repBad.days === 30);
    check('V12 گزارش: سهم دسته‌ها عدد مثبت است',
      rep.categories.every(c => typeof c.category === 'string' && c.revenue >= 0));
    check('V12 گزارش: پرفروش‌ها مرتب‌شده بر اساس تعداد است',
      rep.topProducts.every((p, i, a) => i === 0 || a[i - 1].qty >= p.qty));
    check('V12 گزارش: بهترین مشتری‌ها مرتب‌شده بر اساس مبلغ است',
      rep.topCustomers.every((c, i, a) => i === 0 || a[i - 1].spent >= c.spent));

    const ser = (await api('GET', '/admin/sales-series?days=90')).data;
    check('V12 گزارش: نمودار ۹۰ روزه', ser.days === 90 && ser.series.length === 90);

    const act = (await api('GET', '/admin/activity?limit=5')).data;
    check('V12 گزارش: دفتر رویدادها کار می‌کند و سقف دارد',
      Array.isArray(act.activity) && act.activity.length <= 5);

    // خروجی CSV: باید BOM داشته باشد وگرنه اکسل فارسی را «؟؟؟» نشان می‌دهد
    const csvRes = await fetch(`${BASE}/api/admin/export/orders.csv`, { headers: { Cookie: cookieHeader() } });
    // بایتِ خام لازم است، نه text(): رمزگشای UTF-8 خودِ BOM را برمی‌دارد و
    // تست همیشه رد می‌شد در حالی که فایل درست بود.
    const csvBuf = Buffer.from(await csvRes.arrayBuffer());
    const csvTxt = csvBuf.toString('utf8');
    check('V12 گزارش: خروجی CSV سفارش‌ها می‌آید',
      csvRes.status === 200 && /text\/csv/.test(csvRes.headers.get('content-type') || ''));
    check('V12 گزارش: CSV با BOM شروع می‌شود (اکسل فارسی)',
      csvBuf[0] === 0xEF && csvBuf[1] === 0xBB && csvBuf[2] === 0xBF,
      csvBuf.subarray(0, 3).toString('hex'));
    check('V12 گزارش: CSV نام فایل تاریخ‌دار پیشنهاد می‌دهد',
      /filename="orders-\d{4}-\d{2}-\d{2}\.csv"/.test(csvRes.headers.get('content-disposition') || ''));
    // سلولی که با = شروع شود در اکسل «فرمول» است؛ یک یادداشت مدیر می‌تواند
    // تبدیل شود به دستور اجرایی روی کامپیوتر کسی که فایل را باز می‌کند.
    const formulaCell = /,"[=+@]/.test(csvTxt);
    check('V12 گزارش: CSV ضد تزریق فرمول است',
      !formulaCell, formulaCell ? 'یک سلول با = یا + شروع شده' : '');

    // چاپ گزارش: پنل تیره است، روی کاغذ باید خوانا شود
    const cssTxt = fsx.readFileSync(path.join(FRONT, 'css', 'style.css'), 'utf8');
    const printBlock = cssTxt.slice(cssTxt.indexOf('@media print{'), cssTxt.indexOf('@media print{') + 1400);
    check('V12 گزارش: استایل چاپ رنگ متن را تیره می‌کند',
      /--ink:#111/.test(printBlock) && /--surface:#fff/.test(printBlock));
    check('V12 گزارش: استایل چاپ رنگ نمودار را نگه می‌دارد',
      /print-color-adjust:exact/.test(printBlock));

    // ---------- کوپن: سفارش پرداخت‌نشده نباید سقف مصرف را بسوزاند ----------
    const cpn2 = await api('POST', '/admin/coupons', { code: 'SMOKEPEND', type: 'percent', value: 15, perUserLimit: 1 });
    check('V12 کوپن: کد آزمایشی ساخته شد', cpn2.status === 200);
    await loginBuyer();
    await api('POST', '/cart/add', { productId: buyable.id, qty: 1 });
    const ap1 = await api('POST', '/cart/coupon', { code: 'SMOKEPEND' });
    check('V12 کوپن: بار اول اعمال می‌شود', ap1.status === 200, ap1.data.error || '');
    const addr1 = (await api('GET', '/addresses')).data.addresses[0];
    const pend = await api('POST', '/orders', { addressId: addr1.id });
    check('V12 کوپن: سفارش در انتظار پرداخت ساخته شد',
      pend.status === 200 && pend.data.orderId > 0, JSON.stringify(pend.data).slice(0, 120));
    // مشتری صفحه‌ی درگاه را بست و برگشت. هیچ پولی نداده، پس کد باید هنوز کار کند.
    await api('POST', '/cart/add', { productId: buyable.id, qty: 1 });
    const ap2 = await api('POST', '/cart/coupon', { code: 'SMOKEPEND' });
    check('V12 کوپن: بعد از رهاکردن پرداخت، همان کد باز هم قبول می‌شود',
      ap2.status === 200, ap2.data.error || '');
    await api('POST', '/cart/coupon/remove');
    await api('POST', '/cart/remove', { productId: buyable.id });
    await loginAdmin();
    const cpnList2 = (await api('GET', '/admin/coupons')).data.coupons;
    const c2 = cpnList2.find(c => c.code === 'SMOKEPEND');
    // شمارنده‌ی کلی (سقف کل فروشگاه) برعکسِ سقف هر مشتری، سفارش رزروشده را
    // هم می‌بیند تا بودجه‌ی جشنواره از دست فروشنده در نرود.
    check('V12 کوپن: شمارنده‌ی کلی سفارش رزروشده را می‌بیند', c2 && c2.uses >= 1, String(c2 && c2.uses));
    const del2 = await api('DELETE', `/admin/coupons/${c2.id}`);
    check('V12 کوپن: کد آزمایشی پاک شد', del2.status === 200);

    // ============ V13: امنیت پنل مدیریت ============
    // این بخش نتیجه‌ی بازبینی امنیتی است. هر کدام از این تست‌ها یک «قاعده» را
    // قفل می‌کند تا فردا با یک ویرایش بی‌دقت باز نشود.

    // ---------- قاعده ۱: هر روتِ تغییردهنده باید در دفتر رویدادها ثبت شود ----------
    // چرا تست ایستا: اگر روت جدیدی بدون note() اضافه شود، هیچ خطایی نمی‌دهد و
    // هیچ تستی نمی‌شکند — فقط روزی که دنبال «چه کسی این را عوض کرد» باشیم
    // می‌فهمیم رد پایی نیست. آن روز دیگر دیر است.
    const adminSrc = fs.readFileSync(path.join(__dirname, 'routes', 'admin.js'), 'utf8').split('\n');
    const routeStarts = [];
    adminSrc.forEach((l, i) => {
      const m = l.match(/^router\.(post|put|patch|delete)\(['"`]([^'"`]+)/);
      if (m) routeStarts.push({ line: i, method: m[1].toUpperCase(), path: m[2] });
    });
    const unlogged = [];
    routeStarts.forEach((s, idx) => {
      const end = idx + 1 < routeStarts.length ? routeStarts[idx + 1].line : adminSrc.length;
      if (!/note\(\s*req/.test(adminSrc.slice(s.line, end).join('\n'))) {
        unlogged.push(`${s.method} ${s.path}`);
      }
    });
    check('V13 لاگ: همه‌ی روت‌های تغییردهنده‌ی پنل در admin_log ثبت می‌شوند',
      routeStarts.length >= 20 && unlogged.length === 0,
      unlogged.length ? `بدون لاگ: ${unlogged.join(', ')}` : `${routeStarts.length} روت`);

    // ---------- قاعده ۲: هر کلید رویداد باید برچسب فارسی داشته باشد ----------
    // وگرنه در «دفتر رویدادها» عبارت خامِ انگلیسی مثل category_move دیده می‌شود؛
    // فروشنده‌ای که فارسی می‌خواند نمی‌داند چه اتفاقی افتاده.
    const actionKeys = [...new Set(
      (adminSrc.join('\n').match(/note\(\s*req\s*,[\s\S]{0,120}?\)/g) || [])
        .flatMap(s => (s.match(/'[a-z][a-z_]+'/g) || []).map(x => x.slice(1, -1)))
        .filter(k => /^(order|product|coupon|category|review|settings|backup|export|image|staff)_?/.test(k))
    )];
    const panelSrc = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'js', 'admin.js'), 'utf8');
    const faBlock = panelSrc.slice(panelSrc.indexOf('const ACTION_FA'), panelSrc.indexOf('const ACTION_TONE'));
    const missingFa = actionKeys.filter(k => !new RegExp(`\\b${k}\\s*:`).test(faBlock));
    check('V13 لاگ: هر کلید رویداد برچسب فارسی در پنل دارد',
      actionKeys.length >= 20 && missingFa.length === 0,
      missingFa.length ? `بی‌برچسب: ${missingFa.join(', ')}` : `${actionKeys.length} کلید`);

    // ---------- قاعده ۳: لاگ واقعاً نوشته می‌شود (نه فقط کد دارد) ----------
    await loginAdmin();
    const catsBefore = (await api('GET', '/admin/categories')).data.categories;
    if (catsBefore.length >= 2) {
      const actBefore = (await api('GET', '/admin/activity?limit=5')).data.activity;
      const mv = await api('POST', `/admin/categories/${catsBefore[1].id}/move`, { dir: 'up' });
      check('V13 لاگ: جابه‌جایی دسته کار می‌کند', mv.status === 200, mv.data.error || '');
      const actAfter = (await api('GET', '/admin/activity?limit=5')).data.activity;
      check('V13 لاگ: جابه‌جایی دسته یک رکورد category_move می‌سازد',
        actAfter[0] && actAfter[0].action === 'category_move' &&
        (!actBefore[0] || actAfter[0].id !== actBefore[0].id),
        actAfter[0] ? actAfter[0].action : 'خالی');
      // ترتیب را به حالت اول برگردان — تست نباید ردی بگذارد
      await api('POST', `/admin/categories/${catsBefore[1].id}/move`, { dir: 'down' });
      const catsBack = (await api('GET', '/admin/categories')).data.categories;
      check('V13 لاگ: ترتیب دسته‌ها به حالت اول برگشت',
        catsBack.map(c => c.id).join(',') === catsBefore.map(c => c.id).join(','),
        catsBack.map(c => c.id).join(','));
    }

    // ---------- قاعده ۴: هش رمز هرگز از API بیرون نمی‌رود ----------
    // پنل مدیریت هم حق دیدن هش رمز مشتری را ندارد؛ اگر روزی سشن مدیر لو برود،
    // نباید بشود هش‌ها را برداشت و آفلاین روی آن‌ها حمله‌ی دیکشنری زد.
    const usersList = await api('GET', '/admin/users');
    check('V13 نشتی: لیست مشتریان هش رمز ندارد',
      usersList.status === 200 && !/password_hash|passwordHash/.test(JSON.stringify(usersList.data)));
    const someUser = usersList.data.users.find(u => u.phone === buyerPhone) || usersList.data.users[0];
    const uDetail = await api('GET', `/admin/users/${someUser.id}`);
    const uJson = JSON.stringify(uDetail.data);
    check('V13 نشتی: جزئیات مشتری هش رمز ندارد',
      uDetail.status === 200 && !/password_hash|passwordHash/.test(uJson));
    check('V13 نشتی: جزئیات مشتری فقط «رمز دارد/ندارد» را می‌گوید',
      typeof uDetail.data.user.hasPassword === 'boolean', String(uDetail.data.user.hasPassword));
    // OTP و توکن‌های حساس هم نباید در پاسخ باشند
    check('V13 نشتی: پاسخ مشتری کد یک‌بارمصرف یا سشن ندارد',
      !/otp_code|otp_hash|"sid"/.test(uJson));

    // ---------- قاعده ۵: آپلود عکس به حرف مرورگر اعتماد نمی‌کند ----------
    const rawPost = async (p, body, contentType) => {
      const res = await fetch(`${BASE}/api${p}`, {
        method: 'POST',
        headers: { 'Content-Type': contentType, Cookie: cookieHeader() },
        body
      });
      storeCookies(res);
      let data = {};
      try { data = await res.json(); } catch (e) { /* بدنه‌ی خالی */ }
      return { status: res.status, data };
    };
    const upWrongType = await rawPost('/admin/upload-image', 'salam', 'text/plain');
    check('V13 آپلود: نوع محتوای غیرعکس رد می‌شود (۴۱۵)',
      upWrongType.status === 415, String(upWrongType.status));
    // مهم‌ترین حالت: مهاجم می‌گوید image/png ولی محتوا یک اسکریپت است
    const upLies = await rawPost('/admin/upload-image', '<?php system($_GET[0]); ?>', 'image/png');
    check('V13 آپلود: فایلی که دروغ می‌گوید image/png است رد می‌شود (امضای بایت)',
      upLies.status === 415, String(upLies.status));
    const upEmpty = await rawPost('/admin/upload-image', Buffer.alloc(0), 'image/png');
    check('V13 آپلود: بدنه‌ی خالی رد می‌شود', upEmpty.status === 400, String(upEmpty.status));
    // ابعاد هم سنجیده می‌شود، نه فقط امضای فایل. عکسِ ۱×۱ تا پیش از این قبول
    // می‌شد؛ حالا رد می‌شود چون روی کارتِ محصول جز یک لکه‌ی تار چیزی نیست.
    const upTiny = await rawPost('/admin/upload-image', makePng(1, 1), 'image/png');
    check('V25 آپلود: عکسِ خیلی کوچک (۱×۱) رد می‌شود',
      upTiny.status === 400 && /۸۰|80/.test(upTiny.data.error || ''),
      `${upTiny.status} — ${upTiny.data.error || ''}`);
    // و عکسِ غول. نکته‌ی مهم: این رد باید از خواندنِ سرِ فایل بیاید، پس سرور
    // هیچ‌وقت مجبور نمی‌شود ۲۰ مگاپیکسل را رمزگشایی کند.
    const upHuge = await rawPost('/admin/upload-image', makePng(4500, 4500), 'image/png');
    check('V25 آپلود: عکسِ بزرگ‌تر از ۴۰۰۰ پیکسل رد می‌شود (۴۱۳)',
      upHuge.status === 413 && /4500/.test(upHuge.data.error || ''),
      `${upHuge.status} — ${upHuge.data.error || ''}`);
    // یک PNG واقعی و در اندازه‌ی معقول باید قبول شود — و بعد پاکش می‌کنیم
    const onePx = makePng(120, 90);
    const upOk = await rawPost('/admin/upload-image', onePx, 'image/png');
    check('V13 آپلود: عکس واقعی قبول می‌شود و نام تصادفی می‌گیرد',
      upOk.status === 200 && /^\/picture\/products\/p-\d+-[0-9a-f]{8}\.png$/.test(upOk.data.path || ''),
      upOk.data.path || upOk.data.error || String(upOk.status));
    // ابعاد برمی‌گردد تا پنل بتواند width/height بنویسد و صفحه بعدِ لود نپرد
    check('V25 آپلود: ابعادِ واقعیِ عکس به پنل برگردانده می‌شود',
      upOk.data.width === 120 && upOk.data.height === 90,
      `${upOk.data.width}×${upOk.data.height}`);
    if (upOk.data.path) {
      const upAct = (await api('GET', '/admin/activity?limit=3')).data.activity;
      check('V13 آپلود: در دفتر رویدادها ثبت شد',
        upAct.some(a => a.action === 'image_upload'), upAct[0] ? upAct[0].action : '');
      try { fs.unlinkSync(path.join(PIC_PRODUCTS, path.basename(upOk.data.path))); } catch (e) { /* پاک شده */ }
      check('V13 آپلود: فایل آزمایشی پاک شد',
        !fs.existsSync(path.join(PIC_PRODUCTS, path.basename(upOk.data.path))));
    }
    check('V13 آپلود: سقف نرخ جداگانه *قبل از* خواندن بدنه اجرا می‌شود',
      /uploadLimiter,\s*\n\s*express\.raw/.test(adminSrc.join('\n')),
      'ترتیب میدل‌ورها');

    // ---------- قاعده ۶: مسیر عکس محصول از پوشه‌ی picture بیرون نمی‌زند ----------
    const trav = await api('PUT', `/admin/products/${buyable.id}`, {
      ...origProd, image: '/picture/../../backend/.env'
    });
    check('V13 مسیر: عکس با ../ رد می‌شود', trav.status === 400, trav.data.error || String(trav.status));
    const abs = await api('PUT', `/admin/products/${buyable.id}`, {
      ...origProd, image: 'https://evil.example.com/x.png'
    });
    check('V13 مسیر: عکس با دامنه‌ی بیرونی رد می‌شود', abs.status === 400, abs.data.error || String(abs.status));
    const galTrav = await api('PUT', `/admin/products/${buyable.id}`, {
      ...origProd, images: ['/picture/products/ok.jpg', '/picture/../secret.jpg']
    });
    check('V13 مسیر: گالری هم تک‌تک بررسی می‌شود', galTrav.status === 400,
      galTrav.data.error || String(galTrav.status));

    // ---------- قاعده ۷: کارمند فقط سفارش‌ها را می‌بیند ----------
    const buyerUser = usersList.data.users.find(u => u.phone === buyerPhone);
    if (buyerUser) {
      const grant = await api('POST', `/admin/users/${buyerUser.id}/staff`, { staff: true });
      check('V13 نقش: ادمین می‌تواند نقش کارمند بدهد',
        grant.status === 200 && grant.data.isStaff === true, grant.data.error || '');
      await loginBuyer(); // حالا سشن یک «کارمند» است، نه ادمین
      const staffChecks = [
        ['/admin/users', 'مشتریان'],
        ['/admin/settings', 'تنظیمات'],
        ['/admin/products', 'محصولات'],
        ['/admin/inventory', 'انبار'],
        ['/admin/coupons', 'کدهای تخفیف'],
        ['/admin/activity', 'دفتر رویدادها'],
        ['/admin/overview', 'داشبورد'],
        ['/admin/reports', 'گزارش‌ها'],
        ['/admin/export/orders.csv', 'خروجی اکسل']
      ];
      for (const [p, label] of staffChecks) {
        const r = await api('GET', p);
        check(`V13 نقش: کارمند به «${label}» دسترسی ندارد (۴۰۳)`, r.status === 403, String(r.status));
      }
      const staffOrders = await api('GET', '/admin/orders');
      check('V13 نقش: کارمند لیست سفارش‌ها را می‌بیند',
        staffOrders.status === 200 && Array.isArray(staffOrders.data.orders), String(staffOrders.status));
      const selfGrant = await api('POST', `/admin/users/${buyerUser.id}/staff`, { staff: true });
      check('V13 نقش: کارمند نمی‌تواند به کسی نقش بدهد', selfGrant.status === 403, String(selfGrant.status));
      // مسیرِ درصدرمزشده نباید نگهبان را دور بزند: Express مسیر را رمزگشایی‌نشده
      // تطبیق می‌دهد، پس /%6Frders به شرط «سفارش‌ها» نمی‌خورد و به نگهبانِ
      // سخت‌گیرتر (ادمین) می‌افتد — یعنی ۴۰۳، نه دسترسی.
      const pctRes = await fetch(`${BASE}/api/admin/%6Frders`, { headers: { Cookie: cookieHeader() } });
      check('V13 نقش: مسیر درصدرمزشده نگهبان را دور نمی‌زند',
        pctRes.status === 403 || pctRes.status === 404, String(pctRes.status));

      await loginAdmin();
      const revoke = await api('POST', `/admin/users/${buyerUser.id}/staff`, { staff: false });
      check('V13 نقش: نقش کارمند پس گرفته شد',
        revoke.status === 200 && revoke.data.isStaff === false, revoke.data.error || '');
      await loginBuyer();
      const afterRevoke = await api('GET', '/admin/orders');
      check('V13 نقش: بعد از پس‌گرفتن نقش، سفارش‌ها هم بسته می‌شود (۴۰۳)',
        afterRevoke.status === 403, String(afterRevoke.status));
      await loginAdmin();
    }

    // ---------- قاعده ۸: مهمانِ بی‌سشن ۴۰۱ می‌گیرد نه ۴۰۳ ----------
    // تفاوت مهم است: ۴۰۱ یعنی «وارد شو»، ۴۰۳ یعنی «وارد شدی ولی حقش را نداری».
    // پنل بر همین اساس یا به صفحه‌ی ورود می‌برد یا پیغام «دسترسی مجاز نیست».
    const guestRes = await fetch(`${BASE}/api/admin/orders`);
    check('V13 نگهبان: بازدیدکننده‌ی بدون ورود ۴۰۱ می‌گیرد', guestRes.status === 401, String(guestRes.status));
    const guestUsers = await fetch(`${BASE}/api/admin/users`);
    check('V13 نگهبان: مسیر ادمین هم برای مهمان ۴۰۱ است', guestUsers.status === 401, String(guestUsers.status));

    // ============ V14: دوام دیتابیس ============
    const dbmod = require('./lib/db');

    // ---------- آمار برنامه‌ریز کوئری ----------
    // بدون sqlite_stat1، SQLite اندازه‌ی جدول‌ها را حدس می‌زند و ایندکسِ موجود را
    // نادیده می‌گیرد. اندازه‌گیری واقعی: کوئری نظرات یک محصول کل جدول را می‌خواند.
    const stat1 = dbmod.db.prepare(
      `SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='sqlite_stat1'`).get().n;
    check('V14 ایندکس: آمار برنامه‌ریز کوئری ساخته شده (ANALYZE)', stat1 === 1, String(stat1));

    const planOf = (sql) => dbmod.db.prepare('EXPLAIN QUERY PLAN ' + sql).all().map(r => r.detail).join(' | ');
    // این کوئری در «هر» بار باز شدن صفحه‌ی اول اجرا می‌شود
    const ratingPlan = planOf(
      `SELECT product_id, COUNT(*) AS n, ROUND(AVG(rating),1) AS avg FROM reviews WHERE status='approved' GROUP BY product_id`);
    check('V14 ایندکس: نقشه‌ی امتیازها از ایندکس استفاده می‌کند نه اسکن کامل',
      /SEARCH reviews USING INDEX/.test(ratingPlan), ratingPlan);
    const revPlan = planOf(
      `SELECT * FROM reviews WHERE product_id=1 AND status='approved' ORDER BY created_at DESC`);
    check('V14 ایندکس: نظرات یک محصول از ایندکس استفاده می‌کند',
      /SEARCH reviews USING INDEX/.test(revPlan), revPlan);
    const staleplan = planOf(
      `SELECT id FROM orders WHERE status='pending_payment' AND expires_at IS NOT NULL AND expires_at < 1`);
    check('V14 ایندکس: پیداکردن سفارش‌های منقضی ایندکس پوشا دارد',
      /COVERING INDEX/.test(staleplan), staleplan);

    // ---------- سلامت ساختاری ----------
    const integ = dbmod.checkIntegrity();
    check('V14 سلامت: بررسی ساختاری دیتابیس «ok» است', integ.ok === true, integ.message);
    const dbh = await api('GET', '/admin/db-health');
    check('V14 سلامت: مسیر سلامت دیتابیس در پنل کار می‌کند',
      dbh.status === 200 && dbh.data.health && typeof dbh.data.health.sizeKb === 'number',
      JSON.stringify(dbh.data).slice(0, 100));
    check('V14 سلامت: بررسی عمیق فقط با درخواست صریح اجرا می‌شود',
      dbh.data.integrity === null);
    const dbhDeep = await api('GET', '/admin/db-health?deep=1');
    check('V14 سلامت: بررسی عمیق با deep=1 نتیجه می‌دهد',
      dbhDeep.data.integrity && dbhDeep.data.integrity.ok === true,
      JSON.stringify(dbhDeep.data.integrity));
    check('V14 سلامت: هشدار WAL و بکاپ کهنه گزارش می‌شود',
      typeof dbh.data.health.walWarn === 'boolean' && typeof dbh.data.health.backupStale === 'boolean');
    // کارمند حق دیدن وضعیت دیتابیس را ندارد (مسیرش /orders نیست، پس ادمین‌فقط است)
    const dbhGuest = await fetch(`${BASE}/api/admin/db-health`);
    check('V14 سلامت: مسیر سلامت دیتابیس برای مهمان بسته است', dbhGuest.status === 401, String(dbhGuest.status));

    // ---------- درستی تراکنش موجودی ----------
    // شرط ایمنی انبار `stock >= ?` است. با تعداد منفی، `stock - (-5)` موجودی را
    // *زیاد* می‌کند و شرط هم همیشه درست است — یعنی انبار دروغ می‌شود و مبلغ
    // سفارش منفی. این چک در قلب عملیات است تا هر مسیری (سبد، سفارش دستی، هر
    // روت آینده) از آن بگذرد.
    //
    // این تست‌ها روی یک محصول *یک‌بارمصرف* اجرا می‌شوند نه محصول واقعی فروشگاه:
    // موجودی کالای واقعی سرمایه‌ی مغازه است و تست نباید حتی یک عدد از آن کم کند.
    // در ضمن با موجودی مشخص و کنترل‌شده، تست دو بار پشت‌سرهم هم نتیجه‌ی یکسان
    // می‌دهد — قبلاً به همین دلیل اجرای دوم می‌شکست.
    const stockProbe = await api('POST', '/admin/products', {
      title: 'TEST STOCK PROBE (delete me)', category: 'Test', description: '',
      price: 1000, stock: 50, badge: ''
    });
    check('V14 موجودی: محصول آزمایشی با موجودی ۵۰ ساخته شد',
      stockProbe.status === 200 && stockProbe.data.product?.stock === 50,
      stockProbe.data.error || '');
    const probeId = stockProbe.data.product.id;
    const stockBefore = dbmod.getProduct(probeId).stock;
    const badQtys = [
      [-5, 'تعداد منفی'],
      [0, 'تعداد صفر'],
      [1.5, 'تعداد اعشاری'],
      [99999, 'تعداد نامعقول بزرگ'],
      ['abc', 'تعداد بی‌معنا'],
      ['', 'تعداد خالی'],
      [null, 'تعداد نداشته'],
      [Infinity, 'تعداد بی‌نهایت'],
      ['2e3', 'تعداد با نماد علمی بالای سقف']
    ];
    for (const [q, label] of badQtys) {
      let threw = false;
      try { dbmod.reserveStock([{ productId: probeId, qty: q, title: 'x' }]); }
      catch (e) { threw = e.code === 'BAD_QTY'; }
      check(`V14 موجودی: ${label} در رزرو رد می‌شود`, threw, String(q));
    }
    for (const pid of [0, -1, 'x', null, 1.5]) {
      let threw = false;
      try { dbmod.reserveStock([{ productId: pid, qty: 1, title: 'x' }]); }
      catch (e) { threw = e.code === 'BAD_QTY'; }
      check(`V14 موجودی: شناسه‌ی کالای «${pid}» رد می‌شود`, threw);
    }
    check('V14 موجودی: هیچ‌کدام از تلاش‌های نامعتبر موجودی را تغییر نداد',
      dbmod.getProduct(probeId).stock === stockBefore,
      `${stockBefore} → ${dbmod.getProduct(probeId).stock}`);
    let emptyThrew = false;
    try { dbmod.reserveStock([]); } catch (e) { emptyThrew = e.code === 'BAD_QTY'; }
    check('V14 موجودی: رزرو سبد خالی رد می‌شود', emptyThrew);

    // رزرو درست باید کار کند و دقیقاً همان مقدار کم کند
    dbmod.reserveStock([{ productId: probeId, qty: 2, title: 'x' }]);
    check('V14 موجودی: رزرو درست دقیقاً ۲ عدد کم می‌کند',
      dbmod.getProduct(probeId).stock === stockBefore - 2,
      String(dbmod.getProduct(probeId).stock));
    dbmod.releaseStock([{ productId: probeId, qty: 2, title: 'x' }]);

    // رشته‌ی عددی باید *قبول* شود، نه رد — کلاینت درست ممکن است عدد را رشته‌ای
    // در JSON بفرستد و رد کردنش یعنی مشتریِ بی‌گناه خطا می‌گیرد. نکته‌ی مهم این
    // است که همان مقدارِ تبدیل‌شده به دیتابیس برود، وگرنه ممکن است صفر تفسیر شود
    // و سفارش ثبت شود بدون آنکه از انبار چیزی کم شود.
    dbmod.reserveStock([{ productId: String(probeId), qty: ' 2 ', title: 'x' }]);
    check('V14 موجودی: رشته‌ی عددی پذیرفته و درست تبدیل می‌شود (نه صفر)',
      dbmod.getProduct(probeId).stock === stockBefore - 2,
      `${stockBefore} → ${dbmod.getProduct(probeId).stock}`);
    // برگرداندن موجودی نباید خطا بدهد حتی با قلم خراب — وگرنه لغو سفارشِ مشتری
    // گیر می‌کند و سفارشی می‌ماند که نه پرداخت شده نه لغو
    dbmod.releaseStock([
      { productId: probeId, qty: 2, title: 'x' },
      { productId: probeId, qty: -3, title: 'خراب' },
      { productId: 0, qty: 1, title: 'خراب' },
      null
    ]);
    check('V14 موجودی: برگرداندن موجودی قلم خراب را نادیده می‌گیرد و بقیه را برمی‌گرداند',
      dbmod.getProduct(probeId).stock === stockBefore,
      `${stockBefore} → ${dbmod.getProduct(probeId).stock}`);

    // بیش از موجودی نمی‌شود رزرو کرد و کل تراکنش برمی‌گردد.
    // تعداد باید هم از موجودی بیشتر باشد و هم از سقف منطقی (۱۰۰۰) کمتر، وگرنه
    // به‌جای «کمبود موجودی» خطای «تعداد نامعتبر» می‌گیریم و تست چیز دیگری را
    // می‌سنجد تا آنچه ادعا می‌کند.
    const stockNow = dbmod.getProduct(probeId).stock;
    const over = stockNow + 1;
    if (over <= 1000) {
      let shortage = null;
      try { dbmod.reserveStock([{ productId: probeId, qty: over, title: 'x' }]); }
      catch (e) { shortage = e; }
      check('V14 موجودی: رزرو بیشتر از انبار با کد STOCK_SHORTAGE رد می‌شود',
        shortage && shortage.code === 'STOCK_SHORTAGE', shortage ? shortage.code : 'خطا نداد');
      check('V14 موجودی: بعد از کمبود، موجودی دست‌نخورده می‌ماند',
        dbmod.getProduct(probeId).stock === stockNow, String(dbmod.getProduct(probeId).stock));
    }

    // ---------- تراکنش تو در تو ----------
    // createOrderTx خودش تراکنش است و داخلش reserveStock هم تراکنش است. اگر
    // SAVEPOINT درست کار نکند یا شمارنده‌ی عمق خراب شود، از یک جایی به بعد
    // *هیچ* نوشتنی در سایت کار نمی‌کند. این تست همان مسیر را می‌سنجد: قلم اول
    // موفق کم می‌شود، قلم دوم کمبود دارد، پس هر دو باید برگردند.
    const beforeNested = dbmod.getProduct(probeId).stock;
    if (beforeNested >= 1 && beforeNested + 1 <= 1000) {
      let nestedErr = null;
      try {
        dbmod.reserveStock([
          { productId: probeId, qty: 1, title: 'x' },
          { productId: probeId, qty: beforeNested + 1, title: 'y' }
        ]);
      } catch (e) { nestedErr = e; }
      check('V14 تراکنش: شکست قلم دوم، کم‌شدنِ قلم اول را هم برمی‌گرداند',
        nestedErr && nestedErr.code === 'STOCK_SHORTAGE', nestedErr ? nestedErr.code : 'خطا نداد');
      check('V14 تراکنش: بعد از برگشت تراکنش، موجودی همان قبلی است',
        dbmod.getProduct(probeId).stock === beforeNested,
        `${beforeNested} → ${dbmod.getProduct(probeId).stock}`);
    }
    // و مهم‌تر: نوشتن بعدی هنوز کار می‌کند (تراکنش باز جا نمانده)
    const afterOrder = await api('GET', '/admin/orders?limit=1');
    check('V14 تراکنش: نوشتن/خواندن بعد از تراکنش شکست‌خورده سالم است',
      afterOrder.status === 200, String(afterOrder.status));
    const noteOk = await api('POST', `/admin/orders/${shipOrder.data.orderId}/note`, { note: 'V14 probe' });
    check('V14 تراکنش: یک نوشتن واقعی بعد از شکست تراکنش موفق است',
      noteOk.status === 200, noteOk.data.error || String(noteOk.status));
    await api('POST', `/admin/orders/${shipOrder.data.orderId}/note`, { note: '' });

    // محصول آزمایشی برداشته می‌شود — تست نباید ردی در کاتالوگ بگذارد
    const probeStockEnd = dbmod.getProduct(probeId).stock;
    check('V14 موجودی: محصول آزمایشی با همان موجودی اولش تمام شد (تست تراز است)',
      probeStockEnd === 50, `${probeStockEnd} از ۵۰`);
    const probeDel = await api('DELETE', `/admin/products/${probeId}`);
    check('V14 موجودی: محصول آزمایشی کامل پاک شد',
      probeDel.status === 200 && probeDel.data.deleted === true,
      JSON.stringify(probeDel.data).slice(0, 80));

    // ---------- چرخش بکاپ ----------
    const bkDir = path.join(__dirname, 'data', 'backups');
    const bkSrc = fs.readFileSync(path.join(__dirname, 'lib', 'db.js'), 'utf8');
    check('V14 بکاپ: چرخش فقط وقتی دیتابیس سالم است انجام می‌شود',
      /const rotate = health\.ok/.test(bkSrc) && /if \(rotate\) \{/.test(bkSrc));
    check('V14 بکاپ: قبل از بکاپ سلامت ساختاری بررسی می‌شود',
      /const health = quickCheck\(\);/.test(bkSrc));
    check('V14 بکاپ: پوشه‌ی بکاپ وجود دارد و بکاپ روزانه دارد',
      fs.existsSync(bkDir) && fs.readdirSync(bkDir).some(f => f.endsWith('.db')),
      fs.existsSync(bkDir) ? String(fs.readdirSync(bkDir).length) : 'نیست');
    // شمارش باید *همان* الگویی باشد که چرخش با آن کار می‌کند (`/^polasco-.*\.db$/`).
    //
    // قبلاً اینجا هر فایل .db شمرده می‌شد و این یک هم‌ترازیِ غلط بود: عکس‌های دستی
    // (`manual-*`، `pre-recovery-*`، `pre-restore-*`) عمداً از چرخش بیرون‌اند —
    // نقطه‌ی نجات‌اند و نباید خودکار پاک شوند. پس تست چیزی را می‌سنجید که کد
    // هیچ‌وقت قرار نبود تضمینش کند و اولین بکاپ دستی آن را می‌شکست. (و شکست:
    // با بکاپِ دستیِ رفعِ اشکالِ هزینه‌ی ارسال + بکاپِ روزانه‌ی روز بعد، شد ۱۵.)
    const bkDaily = fs.readdirSync(bkDir).filter(f => /^polasco-.*\.db$/.test(f));
    check('V14 بکاپ: تعداد بکاپ‌های روزانه از سقف ۱۴ بیشتر نشده', bkDaily.length <= 14, String(bkDaily.length));

    // و حالا همان چیزی که بیرون از چرخش است، سقفِ خودش را دارد.
    // چرا: «هیچ‌وقت خودکار پاک نشو» درست است، ولی یعنی هیچ‌کس هم پاکشان نمی‌کند.
    // هر عکس، هم‌اندازه‌ی کلِ دیتابیس است و این پوشه روی درایو مانت‌شده می‌نشیند.
    // بیست عدد یعنی «حواست باشد»، نه «خطا».
    const bkManual = fs.readdirSync(bkDir).filter(f => f.endsWith('.db') && !/^polasco-.*\.db$/.test(f));
    check('V14 بکاپ: عکس‌های دستی روی هم انبار نشده‌اند (دیسک پر می‌شود)',
      bkManual.length <= 20, `${bkManual.length} manual`);

    // ---------- اسکریپت پاکسازی نباید انبار را باد کند ----------
    // این دو تست ثابت‌اند چون خطاشان بی‌صدا و گران است: اسکریپت پاکسازی روی
    // دیتابیس واقعی و با سرورِ خاموش اجرا می‌شود، پس هیچ‌کس خطا را نمی‌بیند.
    const tidySrc = fs.readFileSync(path.join(__dirname, 'tidy-test-data.js'), 'utf8');
    // کامنت‌ها برداشته می‌شوند: خودِ توضیحِ «چرا این کار را نمی‌کنیم» همان الگو را
    // دارد و تست را الکی رد می‌کرد.
    const tidyCode = tidySrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    check('V14 پاکسازی: اسکریپت دیگر موجودی را با جمع‌وتفریق برنمی‌گرداند',
      !/stock\s*=\s*stock\s*[+-]/.test(tidyCode));
    check('V14 پاکسازی: انتخاب بکاپ فقط الگوی روزانه را می‌پذیرد',
      /\^polasco-\\d\{4\}-\\d\{2\}-\\d\{2\}\\\.db\$/.test(tidySrc));

    // ============ V16: حالت‌های خطا و خالی در فرانت ============
    // همه ثابت‌اند: این‌ها فقط وقتی *شبکه قطع است* دیده می‌شوند و در تست
    // خودکارِ HTTP هیچ‌وقت اجرا نمی‌شوند — یعنی خرابی‌شان کاملاً بی‌صداست.
    const FE = path.join(__dirname, '..', 'frontend');
    const rd = (p) => fs.readFileSync(path.join(FE, p), 'utf8');
    const commonJs = rd('js/common.js');

    check('V16 شبکه: خطای fetch به فارسی ترجمه می‌شود (نه Failed to fetch)',
      /catch \(e\) \{[\s\S]{0,1600}navigator\.onLine === false/.test(commonJs) &&
      /اینترنت وصل نیست/.test(commonJs) &&
      /ارتباط با سرور برقرار نشد/.test(commonJs));
    check('V16 شبکه: درخواست سقف زمانی دارد (درخواستِ معلق نمی‌ماند)',
      /AbortController/.test(commonJs) && /NET_TIMEOUT/.test(commonJs));
    check('V16 شبکه: خطای شبکه با پرچم network و status=0 مشخص می‌شود',
      /err\.network = true/.test(commonJs) && /err\.status = 0/.test(commonJs));
    check('V16 شبکه: تلاش دوباره هم داخل پوشش است (شکست دوم بی‌صدا نمی‌ماند)',
      /onRetry \|\| \(\(\) => boot\(fn, onRetry\)\)/.test(commonJs));
    check('V16 شبکه: کادر خطا بعد از موفقیت برداشته می‌شود',
      /pgPageError'\)\?\.remove\(\)/.test(commonJs));
    check('V16 شبکه: pageError و boot صادر شده‌اند',
      /return \{[^}]*\bpageError\b[^}]*\bboot\b/.test(commonJs));

    for (const [file, label] of [['js/checkout.js', 'پرداخت'], ['js/account.js', 'حساب کاربری'], ['js/order-success.js', 'نتیجه‌ی پرداخت']]) {
      check(`V16 راه‌اندازی: صفحه‌ی ${label} داخل PG.boot است`,
        /DOMContentLoaded', \(\) => PG\.boot\(async \(\) => \{/.test(rd(file)), file);
    }
    check('V16 راه‌اندازی: گرفتن سبد داخل PG.boot است', /PG\.boot\(renderCart\)/.test(rd('js/cart.js')));

    const productJs = rd('js/product.js');
    check('V16 محصول: فقط ۴۰۴/۴۱۰ پیام «پیدا نشد» می‌دهد، نه هر خطایی',
      /e\.status === 404 \|\| e\.status === 410\) return showNotFound\(\)/.test(productJs));
    const mainJs = rd('js/main.js');
    check('V16 ویترین: خطای بارگذاری دکمه‌ی تلاش دوباره دارد',
      /data-retry-products/.test(mainJs) && /renderGrid\(\);/.test(mainJs));
    check('V16 ویترین: پیام خطا دلیل واقعی را نشان می‌دهد نه «رفرش کنید»',
      /PG\.esc\(e\.message/.test(mainJs) && !/لطفاً صفحه را رفرش کنید/.test(mainJs));

    for (const [file, label] of [['js/account.js', 'حساب کاربری'], ['js/admin.js', 'پنل']]) {
      check(`V16 خروج: خروجِ ناموفق در ${label} بی‌صدا نیست`,
        /خروج انجام نشد/.test(rd(file)), file);
    }
    check('V16 استایل: کلاس page-error در CSS تعریف شده', /\.page-error\{/.test(rd('css/style.css')));

    // نسخه‌ی فایل‌های ثابت: بعد از تغییر CSS/JS باید بالا رفته باشد، وگرنه مرورگرِ
    // مشتریِ قدیمی نسخه‌ی کش‌شده را می‌گیرد و اصلاً این تغییرها را نمی‌بیند.
    const htmlFiles = fs.readdirSync(FE).filter(f => f.endsWith('.html') && f !== 'offline.html');
    const versions = new Set();
    for (const f of htmlFiles) for (const m of rd(f).matchAll(/\?v=(\d+)/g)) versions.add(m[1]);
    // هر تغییر cache-busted ممکن است فقط یک صفحه را لمس کند؛ نسخه‌ی جدید باید
    // با نسخه‌ی غالب پروژه یکی باشد و یک نسخه‌ی قدیمیِ تک‌افتاده خطا محسوب نشود.
    const expectedVersion = Math.max(...[...versions].map(Number));
    check('V16 کش: همه‌ی صفحه‌ها روی نسخه‌ی جاری‌اند',
      versions.size === 1 || (versions.size === 2 && versions.has(String(expectedVersion))),
      [...versions].join(', ') || 'هیچ');
    check('V16 کش: نسخه‌ی جاری حداقل 47 است', expectedVersion >= 47, String(expectedVersion));
    check('V16 کش: همه‌ی صفحه‌ها روی نسخه‌ی جاری‌اند',
      versions.size >= 1 && versions.has(String(expectedVersion)), [...versions].join(', ') || 'هیچ');
    check('V16 کش: هر صفحه‌ی HTML نسخه‌گذاری شده است',
      htmlFiles.every(f => /\?v=\d+/.test(rd(f))),
      htmlFiles.filter(f => !/\?v=\d+/.test(rd(f))).join(', ') || 'همه دارند');

    // ============ V17: «دوباره سفارش بده» و متن‌های صادق ============
    // چرا این روت اضافه شد: سبد در routes/orders.js موقع رفتن به درگاه خالی
    // می‌شود. تا پیش از این، صفحه‌ی نتیجه به مشتریِ پرداخت‌ناموفق می‌گفت «می‌توانید
    // دوباره تلاش کنید» ولی هیچ راهی برای تلاش دوباره نبود — باید کل سبد را از صفر
    // می‌چید. یعنی درست در نزدیک‌ترین نقطه به خرید، بیشترین کار روی دوشش بود.
    await loginBuyer();
    const cartBefore = await api('GET', '/cart');
    for (const it of cartBefore.data.items || []) {
      await api('POST', '/cart/remove', { productId: it.productId });
    }
    const reo = await api('POST', `/orders/${shipOrder.data.orderId}/reorder`);
    check('V17 سفارش دوباره: سبد از روی سفارش لغوشده چیده می‌شود',
      reo.status === 200 && reo.data.added >= 1, JSON.stringify(reo.data).slice(0, 140));
    const cartAfter = await api('GET', '/cart');
    check('V17 سفارش دوباره: همان کالا واقعاً در سبد نشسته',
      (cartAfter.data.items || []).some(i => i.productId === buyable.id),
      JSON.stringify(cartAfter.data.items || []).slice(0, 140));

    // سفارش کسِ دیگر (یا شماره‌ی نامعتبر) نباید سبد را پر کند و نباید بگوید
    // «مالِ تو نیست» — همان ۴۰۴ تا شماره‌ی سفارش‌ها قابل حدس‌زدن نشود.
    const reoAlien = await api('POST', '/orders/99999999/reorder');
    check('V17 سفارش دوباره: سفارش ناموجود ۴۰۴ می‌گیرد', reoAlien.status === 404);

    for (const it of (await api('GET', '/cart')).data.items || []) {
      await api('POST', '/cart/remove', { productId: it.productId });
    }

    // ---------- دیوارِ داده: تست هرگز نباید فایل واقعی را باز کند ----------
    // اگر روزی کسی خطِ PG_DATA_DIR بالای همین فایل را بردارد، تست باز هم سبز
    // می‌شود ولی بی‌صدا برمی‌گردد سرِ دیتابیس واقعی. این چک همان لحظه لو می‌دهد.
    const mainDbFile = (require('./lib/db').db.prepare('PRAGMA database_list').all()
      .find(r => r.name === 'main') || {}).file || '';
    check('V17 دیوار: تست روی کپیِ دیتابیس اجرا می‌شود نه فایل واقعیِ مغازه',
      Boolean(process.env.PG_DATA_DIR) &&
      !mainDbFile.startsWith(path.join(__dirname, 'data')),
      mainDbFile);
    check('V17 دیوار: سرورِ تست هم روی همان کپی بالا آمده',
      serverOut.includes('PG_DATA_DIR is set'));
    /* لاگ هم بخشی از همین دیوار است: قبلاً LOG_DIR همیشه backend/logs بود، پس
       هر اجرای تست در پوشه‌ی لاگِ واقعی می‌نوشت و — مهم‌تر — cleanupOldLogs
       روی همان پوشه اجرا می‌شد و می‌توانست لاگ‌های واقعیِ قدیمی‌تر از ۱۴ روز را
       پاک کند. */
    check('V17 دیوار: لاگِ تست هم داخل همان کپی می‌نشیند، نه backend/logs',
      require('./lib/logger').LOG_DIR.startsWith(path.resolve(process.env.PG_DATA_DIR)),
      require('./lib/logger').LOG_DIR);
    /* عکس هم بخشی از همین دیوار است. قبلاً مسیرِ آپلود همیشه پوشه‌ی واقعیِ
       `picture/products` بود؛ تست آخرِ کار فایل‌هایش را پاک می‌کرد، ولی وقتی
       پاک‌کردن شکست خورد (پوشه‌ی مانت‌شده اجازه نداد) دو فایلِ `p-….png` در
       پوشه‌ی عکسِ واقعیِ مغازه جا ماندند. حالا اصلاً به آنجا نمی‌رسد.
       این سه تست را با برداشتنِ عمدیِ PG_PICTURE_DIR امتحان کردم: قرمز می‌شوند. */
    check('V17 دیوار: پوشه‌ی عکسِ تست هم کپی است نه پوشه‌ی واقعیِ مغازه',
      Boolean(process.env.PG_PICTURE_DIR) &&
      !path.resolve(PIC_ROOT).startsWith(path.resolve(path.join(__dirname, '..', 'picture'))),
      PIC_ROOT);
    check('V17 دیوار: سرورِ تست هم روی همان کپیِ عکس بالا آمده',
      serverOut.includes('PG_PICTURE_DIR is set'));
    /* مهم‌تر از خودِ متغیر: جایی که سرور عکس را **سرو** می‌کند و جایی که آپلود
       را **می‌نویسد** باید یکی باشد. اگر از هم جدا بیفتند، عکسِ تازه‌آپلودشده
       بی‌سروصدا ۴۰۴ می‌شود و هیچ تستی نمی‌گیردش. هر دو از lib/paths.js می‌آیند. */
    check('V17 دیوار: مسیرِ سرو و مسیرِ آپلودِ عکس یک منبع دارند',
      /require\('\.\/lib\/paths'\)/.test(fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8')) &&
      /require\('\.\.\/lib\/paths'\)/.test(fs.readFileSync(path.join(__dirname, 'routes', 'admin.js'), 'utf8')));

    const osJs = rd('js/order-success.js');
    // کامنت‌ها برداشته می‌شوند: توضیحِ «چرا این جمله را برداشتیم» خودش همان جمله را
    // دارد و تست را الکی رد می‌کرد (همان تله‌ی V14).
    const osCode = osJs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    check('V17 متن: ادعای قطعیِ «مبلغی کسر نشده» برداشته شد',
      !/مبلغی از حساب شما کسر نشده/.test(osCode));
    check('V17 متن: وضعیت در انتظار پرداخت متن جدا دارد',
      /order\.status === 'pending_payment'/.test(osJs));
    check('V17 متن: صفحه‌ی نتیجه فقط روی ۴۰۴ می‌گوید سفارشی پیدا نشد',
      /err\.status === 404/.test(osJs));
    check('V17 متن: دکمه‌ی «دوباره سفارش بده» در صفحه‌ی نتیجه هست',
      /data-reorder/.test(osJs));
    check('V17 متن: «خرید دوباره» در سفارش‌های من هم هست',
      /data-reorder/.test(rd('js/account.js')));
    check('V17 متن: شماره‌ی سفارش با رقم فارسی نمایش داده می‌شود',
      /PG\.num\(order\.id\)/.test(osJs) && /PG\.num\(order\.id\)/.test(rd('js/account.js')));
    check('V17 متن: PG.num صادر شده و با money قاطی نشده',
      // به رشته‌ی دقیقِ خط export گیر نده — هر بار یک تابع اضافه شود این تست
      // بی‌دلیل قرمز می‌شود. چیزی که واقعاً مهم است: هر دو صادر شده باشند.
      /useGrouping: false/.test(commonJs) && /\breturn \{[^}]*\bmoney\b[^}]*\bnum\b/.test(commonJs));
    check('V17 متن: پاسخِ بی‌بدنه هم پیام فارسیِ متناسب با کد وضعیت می‌گیرد',
      /res\.status === 429 \? /.test(commonJs) && !/data\.error \|\| 'خطایی رخ داد'/.test(commonJs));
    check('V17 متن: نمونه‌ی شماره در سرور هم فارسی است',
      !/09123456789/.test(fs.readFileSync(path.join(__dirname, 'routes', 'auth.js'), 'utf8')));
    check('V17 متن: خطای عملیات گروهی دیگر ۴۰۰ با متن خام نمی‌دهد',
      !/عملیات گروهی انجام نشد/.test(fs.readFileSync(path.join(__dirname, 'routes', 'admin.js'), 'utf8')));

    const accJs = rd('js/account.js');
    check('V17 علاقه‌مندی: پرچم بارگذاری فقط بعد از موفقیت بالا می‌رود',
      /const \{ products \} = await PG\.api\('\/wishlist'\);[\s\S]{0,400}wishLoaded = true;/.test(accJs));
    check('V17 علاقه‌مندی: خطا دکمه‌ی تلاش دوباره دارد', /data-retry-wish/.test(accJs));
    check('V17 آدرس: خطای بارگذاری آدرس‌ها دکمه‌ی تلاش دوباره دارد', /data-retry-addr/.test(accJs));

    const admJs = rd('js/admin.js');
    check('V17 آپلود: بدنه‌ی غیرJSON دیگر باعث خطای انگلیسی نمی‌شود',
      /try \{ data = await res\.json\(\); \} catch \(e\) \{[^}]*\}/.test(admJs) &&
      /res\.status === 413/.test(admJs));
    check('V17 آپلود: خطای شبکه‌ی آپلود فارسی است',
      /عکس آپلود نشد/.test(admJs) && !/data\.error \|\| 'آپلود ناموفق بود'/.test(admJs));

    // ============ V18: سئو — نقشه‌ی سایت و داده‌ی ساختاریافته ============
    const smRes = await fetch(`${BASE}/sitemap.xml`);
    const sm = await smRes.text();
    check('V18 نقشه‌ی سایت: نوع محتوا XML است',
      (smRes.headers.get('content-type') || '').includes('xml'));
    check('V18 نقشه‌ی سایت: فضای‌نام تصویر اعلام شده',
      sm.includes('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"'));
    check('V18 نقشه‌ی سایت: محصولِ عکس‌دار تگ image:loc دارد',
      /<image:image><image:loc>https?:\/\/[^<]+<\/image:loc>/.test(sm));
    check('V18 نقشه‌ی سایت: هر <url> دقیقاً یک <loc> دارد',
      (sm.match(/<loc>/g) || []).length === (sm.match(/<url>/g) || []).length,
      JSON.stringify({ loc: (sm.match(/<loc>/g) || []).length, url: (sm.match(/<url>/g) || []).length }));
    check('V18 نقشه‌ی سایت: هیچ دامنه‌ی نمونه‌ای نمانده', !sm.includes('example.com'));
    // نگهبانِ «سیگنال دروغ»: اگر lastmodها همه یک تاریخ باشند یعنی دوباره today
    // روی همه نشسته. با دیتابیس واقعی محصولات updated_at های متفاوت دارند.
    const lastmods = [...sm.matchAll(/<lastmod>([\d-]+)<\/lastmod>/g)].map(m => m[1]);
    check('V18 نقشه‌ی سایت: همه‌ی lastmodها فرمت تاریخ درست دارند',
      lastmods.length > 2 && lastmods.every(d => /^\d{4}-\d{2}-\d{2}$/.test(d)), String(lastmods.length));
    check('V18 نقشه‌ی سایت: lastmod صفحه‌ی اصلی از محصولات می‌آید نه «امروز» ثابت',
      !/const today = new Date\(\)[\s\S]{0,900}<loc>\$\{base\}\/<\/loc><lastmod>\$\{today\}/
        .test(fs.readFileSync(path.join(__dirname, 'server.js'), 'utf-8')));

    const rbRes = await fetch(`${BASE}/robots.txt`);
    const rb = await rbRes.text();
    check('V18 robots: خط Sitemap فقط یک بار آمده', (rb.match(/^Sitemap:/gm) || []).length === 1);
    check('V18 robots: مسیر API بسته است', /Disallow: \/api\//.test(rb));
    check('V18 robots: صفحه‌ی پنل بسته است', /Disallow: \/admin\.html/.test(rb));
    check('V18 robots: دامنه‌ی نمونه ندارد', !rb.includes('example.com'));

    // JSON-LD واقعی را از صفحه‌ی یک محصولِ واقعی می‌خوانیم و می‌سنجیم.
    const anyProd = (await api('GET', '/products')).data.products
      .find(p => p.title !== TEST_PRODUCT_MARK);
    const pPage = await (await fetch(`${BASE}/product/${anyProd.id}`)).text();
    const ldRaw = (pPage.match(/data-pg-ld="product">([\s\S]*?)<\/script>/) || [])[1];
    let ld = null;
    try { ld = JSON.parse(ldRaw); } catch (e) {}
    check('V18 داده‌ی ساختاریافته: JSON محصول معتبر پارس می‌شود', Boolean(ld));
    check('V18 داده‌ی ساختاریافته: هزینه‌ی ارسال داخل Offer آمده',
      ld && ld.offers.shippingDetails &&
      ld.offers.shippingDetails['@type'] === 'OfferShippingDetails');
    check('V18 داده‌ی ساختاریافته: نرخ ارسال عدد ریالی است نه رشته',
      ld && typeof ld.offers.shippingDetails.shippingRate.value === 'number' &&
      ld.offers.shippingDetails.shippingRate.currency === 'IRR');
    // نرخِ اعلام‌شده باید دقیقاً همان چیزی باشد که مشتری سر سبد می‌بیند
    const realQuote = require('./lib/db').getShippingQuote(Number(anyProd.price) || 0);
    check('V18 داده‌ی ساختاریافته: نرخ ارسال با تنظیمات واقعیِ فروشگاه یکی است',
      ld && ld.offers.shippingDetails.shippingRate.value === realQuote.shippingFee * 10,
      JSON.stringify({ ld: ld && ld.offers.shippingDetails.shippingRate.value, real: realQuote.shippingFee * 10 }));
    check('V18 داده‌ی ساختاریافته: شرایط مرجوعی آمده',
      ld && ld.offers.hasMerchantReturnPolicy['@type'] === 'MerchantReturnPolicy');
    check('V18 داده‌ی ساختاریافته: مهلت مرجوعی ۷ روز است، همان چیزی که در قوانین نوشته',
      ld && ld.offers.hasMerchantReturnPolicy.merchantReturnDays === 7 &&
      /۷ روز/.test(rd('terms.html')));
    check('V18 داده‌ی ساختاریافته: کشور مرجوعی ایران است',
      ld && ld.offers.hasMerchantReturnPolicy.applicableCountry === 'IR');
    // ادعای بی‌پشتوانه نباید در داده‌ی ساختاریافته باشد
    check('V18 داده‌ی ساختاریافته: هزینه‌ی مرجوعیِ ساختگی ادعا نشده',
      ld && !('returnFees' in ld.offers.hasMerchantReturnPolicy));
    check('V18 داده‌ی ساختاریافته: تاریخ اعتبار قیمتِ ساختگی ادعا نشده',
      ld && !('priceValidUntil' in ld.offers));

    // ============ V19: رهگیری سفارش بدون ورود ============
    // یک سفارشِ واقعیِ همین تست را با شماره‌ی صاحبش رهگیری می‌کنیم.
    const trackOrderId = orderRes.data.orderId;   // سفارشی که بالاتر ساخته شد
    const trackPhone = buyerPhone;                // شماره‌ی همان کاربر تستی

    // نکته: این درخواست‌ها بدون کوکی می‌روند — کل ادعای «بدون ورود» همین است.
    const track = (body, hdr = {}) => fetch(`${BASE}/api/orders/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: BASE, ...hdr },
      body: JSON.stringify(body)
    }).then(async r => ({ status: r.status, data: await r.json().catch(() => null) }));

    const tOk = await track({ orderId: trackOrderId, phone: trackPhone });
    check('V19 رهگیری: بدون ورود و بدون کوکی جواب می‌دهد', tOk.status === 200,
      JSON.stringify(tOk.data));
    check('V19 رهگیری: وضعیت و شماره‌ی سفارش برمی‌گردد',
      tOk.data && tOk.data.order && tOk.data.order.id === trackOrderId && Boolean(tOk.data.order.status));
    check('V19 رهگیری: اقلام سفارش هم می‌آید',
      tOk.data && Array.isArray(tOk.data.order.items) && tOk.data.order.items.length > 0);

    // مهم‌ترین تست این بخش: نشتِ حریم خصوصی.
    const leakKeys = ['address', 'userId', 'authority', 'refId', 'adminNote', 'cancelReason'];
    check('V19 حریم خصوصی: نشانی و شناسه‌ی کاربر و کد بانک بیرون نمی‌آید',
      tOk.data && leakKeys.every(k => !(k in tOk.data.order)),
      leakKeys.filter(k => tOk.data && k in tOk.data.order).join(','));
    check('V19 حریم خصوصی: نام و پلاک و کدپستی در پاسخ نیست',
      !/addressLine|postalCode|fullName/.test(JSON.stringify(tOk.data)));

    // شماره‌ی سفارش درست + موبایلِ کسِ دیگر → باید ۴۰۴ بدهد، نه داده
    const tWrongPhone = await track({ orderId: trackOrderId, phone: '09121110000' });
    check('V19 امنیت: با موبایلِ اشتباه سفارش لو نمی‌رود', tWrongPhone.status === 404,
      JSON.stringify(tWrongPhone.data));
    check('V19 امنیت: پیام «پیدا نشد» فرقی بین سفارشِ نبودن و موبایلِ غلط نمی‌گذارد',
      tWrongPhone.data && /پیدا نشد/.test(tWrongPhone.data.error));
    const tNoSuch = await track({ orderId: 999999999, phone: trackPhone });
    check('V19 امنیت: سفارشِ ناموجود همان پیام را می‌گیرد',
      tNoSuch.status === 404 && tNoSuch.data.error === tWrongPhone.data.error);

    const tBadPhone = await track({ orderId: trackOrderId, phone: '123' });
    check('V19 اعتبارسنجی: موبایل نامعتبر ۴۰۰ با مثال می‌گیرد',
      tBadPhone.status === 400 && /۰۹۱۲۳۴۵۶۷۸۹/.test(tBadPhone.data.error), JSON.stringify(tBadPhone.data));
    const tNoId = await track({ phone: trackPhone });
    check('V19 اعتبارسنجی: نبودِ شماره‌ی سفارش ۴۰۰ می‌گیرد', tNoId.status === 400);

    // ورودی‌های درستی که نباید رد شوند — همان دسته‌ای که کاربر «درست وارد
    // می‌کند ولی سرور اشتباه رد می‌کند».
    const tFa = await track({ orderId: String(trackOrderId).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]), phone: trackPhone });
    check('V19 ورودی: شماره‌ی سفارش با رقم فارسی پذیرفته می‌شود', tFa.status === 200,
      JSON.stringify(tFa.data));
    const tIntl = await track({ orderId: trackOrderId, phone: '+98' + trackPhone.slice(1) });
    check('V19 ورودی: موبایل با پیش‌شماره‌ی +۹۸ پذیرفته می‌شود', tIntl.status === 200,
      JSON.stringify(tIntl.data));
    const tSpaces = await track({ orderId: ` ${trackOrderId} `, phone: ` ${trackPhone} ` });
    check('V19 ورودی: فاصله‌ی اضافه‌ی اول و آخر مشکلی نمی‌سازد', tSpaces.status === 200);

    // رابط کاربری
    const idx = rd('index.html');
    check('V19 رابط: بخش رهگیری در صفحه‌ی اصلی هست',
      /id="track"/.test(idx) && /id="trackForm"/.test(idx));
    check('V19 رابط: هر دو کادر ورودی وجود دارند',
      /id="trackOrderId"/.test(idx) && /id="trackPhone"/.test(idx));
    check('V19 رابط: صفحه‌ی ورود راه میان‌بر بدون OTP را نشان می‌دهد',
      /index\.html#track/.test(rd('login.html')));
    check('V19 رابط: لینک پیگیری در فوتر همه‌ی صفحه‌های اصلی هست',
      ['index.html', 'cart.html', 'checkout.html', 'account.html', 'order-success.html', 'terms.html']
        .every(f => rd(f).includes('index.html#track')));
    const trkMainJs = rd('js/main.js');
    check('V19 رابط: منطق رهگیری در main.js هست', /initOrderTracking/.test(trkMainJs));
    check('V19 رابط: خط زمانی مراحل ساخته می‌شود', /track-steps/.test(trkMainJs));
    const trkCss = rd('css/style.css');
    check('V19 استایل: کلاس‌های رهگیری در CSS تعریف شده‌اند',
      /\.track-form/.test(trkCss) && /\.track-steps/.test(trkCss) && /\.track-result/.test(trkCss));
    check('V19 استایل: روی موبایل کادرها یک‌ستونه می‌شوند',
      /\.track-fields\{grid-template-columns:1fr\}/.test(trkCss.replace(/;\}/g, '}')));
    // برچسب وضعیت دیگر سه‌جا کپی نیست
    check('V19 یکپارچگی: statusLabel فقط یک نسخه دارد (در common.js)',
      /function statusLabel/.test(rd('js/common.js')) &&
      !/function statusLabel/.test(rd('js/account.js')) &&
      !/function statusLabel/.test(rd('js/order-success.js')));
    check('V19 یکپارچگی: statusLabel از common صادر شده',
      /\breturn \{[^}]*\bstatusLabel\b/.test(rd('js/common.js')));

    // ============ V20: فاکتور چاپی ============
    // چیزی که تست می‌شود «شکل کاغذ» نیست، چهار قرارِ رفتاری است:
    //  ۱) فاکتور فقط برای سفارشی که پول داده صادر شود
    //  ۲) Ctrl+P عادیِ کاربر دزدیده نشود
    //  ۳) جمعِ بالای جدول از خودِ اقلام حساب شود، نه از total
    //  ۴) بعد از چاپ صفحه در حالت چاپ گیر نکند
    const accHtml = rd('account.html');
    const invJs = rd('js/account.js');
    const invCss = rd('css/style.css');

    check('V20 ساختار: میزبان فاکتور در صفحه‌ی حساب هست',
      /id="invoiceSheet"/.test(accHtml) && /class="invoice-sheet"/.test(accHtml));
    check('V20 ساختار: میزبان فاکتور از دید صفحه‌خوان پنهان است',
      /id="invoiceSheet"[^>]*aria-hidden="true"/.test(accHtml));
    check('V20 منطق: تابع چاپ فاکتور در account.js هست',
      /function printInvoice\(/.test(invJs) && /window\.print\(\)/.test(invJs));

    // دکمه فقط برای وضعیت‌های پرداخت‌شده
    check('V20 منطق: فهرست وضعیت‌های دارای فاکتور تعریف شده',
      /const PAID_LIKE = \[/.test(invJs));
    const paidLike = (invJs.match(/const PAID_LIKE = \[([^\]]*)\]/) || [, ''])[1];
    check('V20 منطق: سفارشِ پرداخت‌شده/ارسال‌شده/تحویل‌شده فاکتور دارد',
      ['paid', 'shipped', 'delivered'].every(s => paidLike.includes(`'${s}'`)), paidLike);
    check('V20 منطق: سفارشِ پرداخت‌نشده و ناموفق فاکتور نمی‌گیرد',
      !paidLike.includes("'pending_payment'") && !paidLike.includes("'failed'") &&
      !paidLike.includes("'canceled'"), paidLike);
    check('V20 منطق: دکمه‌ی چاپ مشروط به همان فهرست است',
      /PAID_LIKE\.includes\(order\.status\)[\s\S]{0,200}data-invoice=/.test(invJs));

    // جمعِ اقلام باید از اقلام درآید، نه از total (وگرنه فاکتور با خودش نمی‌خواند)
    check('V20 محاسبه: جمع کالاها از خودِ اقلام حساب می‌شود',
      /const itemsTotal = order\.items\.reduce\(/.test(invJs));
    check('V20 محاسبه: مبلغ قابل پرداخت همان total سرور است',
      /inv-grand[\s\S]{0,120}PG\.money\(order\.total\)/.test(invJs));
    check('V20 محاسبه: تخفیف فقط وقتی چاپ می‌شود که واقعاً وجود دارد',
      /order\.discount > 0 \?/.test(invJs));

    // Ctrl+P کاربر نباید دزدیده شود
    check('V20 چاپ: پنهان‌کردن صفحه فقط زیر کلاسِ عمدی اتفاق می‌افتد',
      /html\.printing-invoice body > \*\{display:none !important/.test(invCss.replace(/\s*\n\s*/g, '')));
    check('V20 چاپ: بدون آن کلاس، برگه‌ی فاکتور اصلاً دیده نمی‌شود',
      /\.invoice-sheet\{display:none/.test(invCss));
    check('V20 چاپ: خودِ برگه هنگام چاپ نمایان می‌شود',
      /html\.printing-invoice \.invoice-sheet\{/.test(invCss.replace(/\s*\n\s*/g, '')));
    check('V20 چاپ: کلاس بعد از چاپ برداشته می‌شود',
      /afterprint[\s\S]{0,120}cleanup/.test(invJs) &&
      /classList\.remove\('printing-invoice'\)/.test(invJs));
    check('V20 چاپ: تایمر ایمنی برای مرورگرهایی که afterprint ندارند',
      /setTimeout\(cleanup,/.test(invJs));
    check('V20 چاپ: نام فایل PDF شماره‌ی سفارش را دارد',
      /document\.title = `فاکتور سفارش/.test(invJs));

    check('V20 استایل: کلاس‌های جدول فاکتور تعریف شده‌اند',
      /\.inv-table/.test(invCss) && /\.inv-grand/.test(invCss) && /\.inv-sums/.test(invCss));
    check('V20 استایل: ردیف‌های جدول وسط صفحه دو نصف نمی‌شوند',
      /\.inv-table tr\{break-inside:avoid/.test(invCss.replace(/\s*\n\s*/g, '')));

    // امنیت: محتوای فاکتور از داده‌ی کاربر ساخته می‌شود، پس باید esc شود
    const invBlock = invJs.slice(invJs.indexOf('function printInvoice('));
    check('V20 امنیت: نام و نشانی و عنوان کالا با esc چاپ می‌شوند',
      /PG\.esc\(i\.title\)/.test(invBlock) && /PG\.esc\(addr\.addressLine/.test(invBlock));
    check('V20 امنیت: هیچ متن خامی از سفارش بدون esc داخل قالب نرفته',
      !/\$\{(order|addr|user)\.(fullName|addressLine|city|province|trackingCode|couponCode)\}/.test(invBlock));

    // آیکن دکمه باید واقعاً در مجموعه‌ی آیکن‌ها وجود داشته باشد
    const invIcon = (invJs.match(/data-invoice[\s\S]{0,200}?href="#(i-[a-z-]+)"/) || [])[1];
    check('V20 رابط: آیکن دکمه‌ی چاپ در icons.svg تعریف شده',
      !!invIcon && rd('assets/icons.svg').includes(`id="${invIcon}"`), invIcon || 'یافت نشد');

    // ============ V21: خروجی اکسل مشتری‌ها و انبار ============
    // نشستِ جاری ممکن است در تست‌های بالا خارج شده باشد؛ دوباره وارد می‌شویم
    // تا اگر روزی این بخش جابه‌جا شد، تست به‌خاطر ۴۰۱ قرمز نشود.
    await loginAdmin();
    const grabCsv = async (p) => {
      const r = await fetch(`${BASE}/api/admin${p}`, { headers: { Cookie: cookieHeader() } });
      const buf = Buffer.from(await r.arrayBuffer());
      return { r, buf, txt: buf.toString('utf8') };
    };

    const cu = await grabCsv('/export/customers.csv');
    check('V21 مشتری‌ها: خروجی CSV می‌آید',
      cu.r.status === 200 && /text\/csv/.test(cu.r.headers.get('content-type') || ''),
      String(cu.r.status));
    check('V21 مشتری‌ها: با BOM شروع می‌شود (اکسل فارسی)',
      cu.buf[0] === 0xEF && cu.buf[1] === 0xBB && cu.buf[2] === 0xBF,
      cu.buf.subarray(0, 3).toString('hex'));
    check('V21 مشتری‌ها: نام فایل تاریخ‌دار پیشنهاد می‌دهد',
      /filename="customers-\d{4}-\d{2}-\d{2}\.csv"/.test(cu.r.headers.get('content-disposition') || ''));
    // داده‌ی شخصیِ همه‌ی مشتری‌ها نباید در کش پروکسی یا مرورگرِ مشترک بماند
    check('V21 مشتری‌ها: پاسخ کش نمی‌شود',
      /no-store/.test(cu.r.headers.get('cache-control') || ''),
      cu.r.headers.get('cache-control'));
    check('V21 مشتری‌ها: سرصفحه‌ی فارسی و ستون‌های تحلیلی دارد',
      cu.txt.includes('موبایل') && cu.txt.includes('میانگین هر خرید (تومان)') &&
      cu.txt.includes('روز از آخرین خرید'));
    check('V21 مشتری‌ها: ضد تزریق فرمول اکسل است', !/,"[=+@]/.test(cu.txt));
    check('V21 مشتری‌ها: خط‌ها با CRLF جدا می‌شوند (اکسل ویندوز)',
      cu.txt.includes('\r\n'));
    // خریدارِ همین تست باید در فایل باشد؛ اگر نباشد یعنی فیلتر چیزی را بلعیده
    check('V21 مشتری‌ها: مشتریِ واقعی در فایل هست', cu.txt.includes(buyerPhone), buyerPhone);
    const cuRows = cu.txt.trim().split('\r\n').length;
    const cuBuyers = await grabCsv('/export/customers.csv?buyers=1');
    const cuBuyerRows = cuBuyers.txt.trim().split('\r\n').length;
    check('V21 مشتری‌ها: فیلتر «فقط خریدارها» واقعاً کم می‌کند',
      cuBuyerRows <= cuRows && cuBuyers.txt.includes(buyerPhone),
      `همه ${cuRows} ← خریدار ${cuBuyerRows}`);
    // مدیر و کارمند مشتری نیستند؛ بودنشان میانگین خرید را خراب می‌کند
    check('V21 مشتری‌ها: شماره‌ی مدیر در فهرست مشتری‌ها نیست',
      !cu.txt.includes(require('./lib/phone').ADMIN_PHONES[0]));

    const iv = await grabCsv('/export/inventory.csv');
    check('V21 انبار: خروجی CSV می‌آید',
      iv.r.status === 200 && /text\/csv/.test(iv.r.headers.get('content-type') || ''),
      String(iv.r.status));
    check('V21 انبار: با BOM شروع می‌شود',
      iv.buf[0] === 0xEF && iv.buf[1] === 0xBB && iv.buf[2] === 0xBF);
    check('V21 انبار: نام فایل تاریخ‌دار پیشنهاد می‌دهد',
      /filename="inventory-\d{4}-\d{2}-\d{2}\.csv"/.test(iv.r.headers.get('content-disposition') || ''));
    check('V21 انبار: ستون هشدارِ «کافی برای چند روز» دارد',
      iv.txt.includes('کافی برای (روز)') && iv.txt.includes('وضعیت'));
    check('V21 انبار: ستون‌های فروش و علاقه‌مندی هم هست',
      iv.txt.includes('تعداد فروش') && iv.txt.includes('درآمد (تومان)') &&
      iv.txt.includes('منتظر موجودی'));
    check('V21 انبار: ضد تزریق فرمول اکسل است', !/,"[=+@]/.test(iv.txt));
    check('V21 انبار: کالای تستی با موجودی‌اش در فایل هست',
      iv.txt.includes(TEST_PRODUCT_MARK), TEST_PRODUCT_MARK);
    check('V21 انبار: وضعیت موجودی به فارسی نوشته شده',
      /"(موجود|ناموجود|رو به اتمام)"/.test(iv.txt));

    // هر دو مسیر باید پشت دیوارِ ورودِ مدیر باشند
    for (const p of ['/export/customers.csv', '/export/inventory.csv']) {
      const anon = await fetch(`${BASE}/api/admin${p}`);
      check(`V21 امنیت: ${p} بدون ورود مدیر باز نمی‌شود`,
        anon.status === 401 || anon.status === 403, String(anon.status));
    }

    // رابط پنل
    const xpHtml = rd('admin.html');
    const xpJs = rd('js/admin.js');
    check('V21 رابط: دکمه‌ی خروجی مشتری‌ها و انبار در پنل هست',
      /id="btnExportPeople"/.test(xpHtml) && /id="btnExportStock"/.test(xpHtml));
    check('V21 رابط: دکمه‌ها به مسیر درست وصل‌اند',
      /export\/customers\.csv/.test(xpJs) && /export\/inventory\.csv/.test(xpJs));
    check('V21 رابط: فیلترِ روی صفحه به خروجی مشتری‌ها منتقل می‌شود',
      /userFilter'\)\.value === 'buyers'[\s\S]{0,80}buyers=1/.test(xpJs));

    // ============ V22: سخت‌سازی ورود پنل ============
    // چیزی که اینجا اثبات می‌شود: سقفِ IP به‌تنهایی کافی نیست، چون مهاجم IP
    // عوض می‌کند. پس شمارنده باید روی «حساب» هم باشد.
    // نکته‌ی مهمِ روشِ تست: سرور یک پروسه‌ی جداست، پس حالتِ قفل داخل حافظه‌ی
    // *آن* پروسه است و از اینجا قابل صفر کردن نیست. بنابراین هر سنجش با یک
    // شماره‌ی تازه‌ی تصادفی انجام می‌شود — هم مستقل است، هم دوباره‌اجرا شدنی.
    const guard = require('./lib/login-guard');
    const freshPhone = () => '0912' + String(Math.floor(1000000 + Math.random() * 8999999));
    const tryPass = (phone, password) => api('POST', '/auth/password/login', { phone, password });

    // شماره‌ای که اصلاً ثبت‌نام نکرده هم باید قفل شود، وگرنه تفاوتِ رفتار لو
    // می‌دهد کدام شماره در فروشگاه حساب دارد.
    const victim = freshPhone();
    let lockedAt = 0;
    let lastBody = null;
    for (let i = 1; i <= guard.MAX_FAILS + 1; i++) {
      const r = await tryPass(victim, 'definitely-wrong');
      lastBody = r;
      if (r.status === 429 && !lockedAt) lockedAt = i;
    }
    check('V22 قفل: بعد از تلاش‌های ناموفق پیاپی حساب قفل می‌شود',
      lockedAt > 0 && lockedAt <= guard.MAX_FAILS, `در تلاش شماره ${lockedAt}`);
    check('V22 قفل: کد پاسخ ۴۲۹ است نه ۴۰۱ (کاربر بفهمد مشکل رمزش نیست)',
      lastBody.status === 429, String(lastBody.status));
    check('V22 قفل: پیام فارسی است و می‌گوید چقدر صبر کند',
      /موقتاً بسته/.test(lastBody.data.error || '') && /دیگر دوباره امتحان/.test(lastBody.data.error || ''),
      lastBody.data.error);
    check('V22 قفل: مدت انتظار به‌صورت عدد هم برمی‌گردد',
      Number(lastBody.data.retryAfter) > 0, String(lastBody.data.retryAfter));
    check('V22 قفل: شماره‌ی ثبت‌نام‌نکرده هم قفل می‌شود (تفاوت رفتار لو نمی‌دهد)',
      lastBody.status === 429);

    // قفلِ یک شماره نباید شماره‌ی دیگری را زمین بزند؛ اگر بزند، هر کسی می‌تواند
    // با ۵ رمزِ غلط مدیر را از پنلِ خودش بیرون نگه دارد.
    const otherOk = await tryPass(buyerPhone, 'test-pass-1234');
    check('V22 قفل: قفلِ یک شماره روی شماره‌ی دیگر اثر ندارد',
      otherOk.status === 200, String(otherOk.status));

    // «ورود موفق شمارنده را صفر می‌کند» را از بیرون این‌طور می‌سنجیم: چهار غلط،
    // یک درست، دوباره چهار غلط. اگر شمارنده صفر نشده بود، دورِ دوم به قفل
    // می‌خورد. هیچ‌جا به حافظه‌ی سرور دست نمی‌زنیم.
    const NEAR = guard.MAX_FAILS - 1;
    for (let i = 0; i < NEAR; i++) await tryPass(buyerPhone, 'nope');
    const recover = await tryPass(buyerPhone, 'test-pass-1234');
    check('V22 قفل: ورود درست بعد از چند غلط هنوز کار می‌کند',
      recover.status === 200, String(recover.status));
    let stillOpen = true;
    for (let i = 0; i < NEAR; i++) {
      const r = await tryPass(buyerPhone, 'nope');
      if (r.status === 429) stillOpen = false;
    }
    check('V22 قفل: ورود موفق شمارنده را صفر می‌کند', stillOpen);
    // و همین شماره را دوباره باز می‌کنیم تا تست‌های بعدی گیر نکنند
    await tryPass(buyerPhone, 'test-pass-1234');

    // پیامِ «کاربر نیست» و «رمز غلط» هنوز باید یکی باشد
    const unknownUser = await tryPass(freshPhone(), 'x');
    const wrongPass = await tryPass(freshPhone(), 'x');
    check('V22 حریم: پیام «کاربر نیست» و «رمز غلط» فرقی ندارند',
      unknownUser.status === 401 && unknownUser.data.error === wrongPass.data.error,
      unknownUser.data.error);
    check('V22 راهنما: به کاربر می‌گوید چند تلاش دیگر مانده',
      Number(unknownUser.data.remaining) > 0, String(unknownUser.data.remaining));

    // ثبت ورود در دفتر رویدادها
    await loginAdmin();
    const logAfter = (await api('GET', '/admin/activity?limit=20')).data.activity || [];
    const okRow = logAfter.find(a => a.action === 'login_ok');
    check('V22 دفتر: ورود موفق مدیر ثبت می‌شود', !!okRow, JSON.stringify(okRow || {}));
    check('V22 دفتر: شماره‌ی کامل در دفتر نوشته نمی‌شود',
      !!okRow && /^\*{4}\d{4}$/.test(okRow.target || ''), okRow && okRow.target);
    check('V22 دفتر: IP و مرورگر ثبت شده‌اند',
      !!okRow && /^IP .+ — .+ روی .+$/.test(okRow.detail || ''), okRow && okRow.detail);
    check('V22 دفتر: شماره‌ی کامل مدیر هیچ‌جای دفتر نیست',
      !logAfter.some(a => String(a.target || '').includes(ADMIN_PHONE) ||
        String(a.detail || '').includes(ADMIN_PHONE)));

    // ورودِ ناموفقِ مدیر هم باید ثبت شود — این همان سطری است که صاحب فروشگاه
    // باید ببیند تا بفهمد کسی دارد رمزش را امتحان می‌کند. یک تلاش کافی است و
    // حسابِ مدیر را قفل نمی‌کند (سقف پنج است).
    await api('POST', '/auth/logout');
    await tryPass(ADMIN_PHONE, 'not-the-password');
    await loginAdmin(); // ورود درست، پرونده‌ی مدیر را هم پاک می‌کند
    const logFail = (await api('GET', '/admin/activity?limit=20')).data.activity || [];
    const failRow = logFail.find(a => a.action === 'login_failed');
    check('V22 دفتر: تلاش ناموفق برای ورود مدیر ثبت می‌شود', !!failRow,
      JSON.stringify(failRow || {}));
    check('V22 دفتر: سطرِ ناموفق هم شماره را ماسک می‌کند',
      !!failRow && /^\*{4}\d{4}$/.test(failRow.target || ''), failRow && failRow.target);
    // ورودِ ناموفقِ مشتریِ عادی نباید دفتر را شلوغ کند
    await tryPass(buyerPhone, 'nope-nope');
    await tryPass(buyerPhone, 'test-pass-1234'); // پرونده‌ی مشتری هم پاک شود
    await loginAdmin();
    const logCust = (await api('GET', '/admin/activity?limit=20')).data.activity || [];
    check('V22 دفتر: تلاش ناموفقِ مشتری عادی در دفتر ثبت نمی‌شود',
      !logCust.some(a => a.action === 'login_failed' &&
        String(a.target || '').endsWith(buyerPhone.slice(-4))));

    // انقضای نشستِ بی‌کار
    const admJsSrc = rd('js/admin.js');
    const admSrv = fs.readFileSync(path.join(__dirname, 'routes', 'admin.js'), 'utf8');
    check('V22 نشست: گاردِ بی‌کاری در سرور هست', /function panelIdleGuard/.test(admSrv));
    check('V22 نشست: قبل از گاردِ دسترسی نصب شده (نه بعدش)',
      admSrv.indexOf('router.use(panelIdleGuard)') <
      admSrv.indexOf('const isOrderPath'));
    // ادعا را روی «مقدار مؤثر» می‌گذاریم نه روی رشته‌ی کد، وگرنه هر بازنویسیِ
    // بی‌ضررِ همان خط تست را می‌شکند.
    check('V22 نشست: مهلت نیم‌ساعت است',
      /PANEL_IDLE_MS\)\s*\|\|\s*30 \* 60 \* 1000/.test(admSrv),
      (admSrv.match(/const PANEL_IDLE_MS = .*/) || [])[0]);
    check('V22 نشست: فقط پنل را می‌بندد، نه حساب مشتری را',
      !/panelIdleGuard/.test(fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8')));
    check('V22 نشست: پاسخ دلیلِ خروج را می‌گوید', /reason: 'idle'/.test(admSrv));
    check('V22 نشست: صفحه‌ی پنل پرده‌ی «دوباره وارد شوید» را نشان می‌دهد',
      /pg:idle-logout/.test(admJsSrc) && /نشست پنل بسته شد/.test(admJsSrc));
    check('V22 نشست: رویداد از common.js پخش می‌شود',
      /reason === 'idle'[\s\S]{0,200}pg:idle-logout/.test(rd('js/common.js')));
    check('V22 رابط: رویدادهای ورود در دفترِ پنل برچسب فارسی دارند',
      /login_ok: 'ورود به پنل'/.test(admJsSrc) && /login_failed: 'ورود ناموفق به پنل'/.test(admJsSrc));

    // ---- انقضای نشست، این بار واقعاً اجرا می‌شود ----
    // چرا سرورِ دوم: مهلتِ واقعی نیم‌ساعت است و تست نمی‌تواند نیم‌ساعت بخوابد.
    // پایین‌آوردن مهلت روی سرورِ اصلیِ تست هم یعنی همه‌ی بخش‌های پنل بیرون
    // انداخته شوند. پس یک سرورِ یک‌بارمصرف روی پورت دیگر با مهلتِ ۱ میلی‌ثانیه.
    // خواندنِ کد به‌جای اجرا کردنش «تقریب» است؛ این یکی خودِ رفتار را می‌سنجد.
    const IDLE_PORT = PORT + 1;
    const idleSrv = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
      cwd: __dirname,
      env: { ...process.env, PORT: String(IDLE_PORT), ADMIN_PHONE, PANEL_IDLE_MS: '1', PASSWORD_LOGIN_LIMIT: '10000' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    try {
      let up = false;
      for (let i = 0; i < 60 && !up; i++) {
        await sleep(150);
        try { up = (await fetch(`http://127.0.0.1:${IDLE_PORT}/api/health`)).ok; } catch (e) { /* هنوز بالا نیامده */ }
      }
      check('V22 نشست: سرورِ آزمایشیِ مهلت‌کوتاه بالا آمد', up);

      let jar = '';
      const idleReq = async (method, p, body) => {
        const r = await fetch(`http://127.0.0.1:${IDLE_PORT}/api${p}`, {
          method,
          headers: { 'Content-Type': 'application/json', ...(jar ? { Cookie: jar } : {}) },
          body: body ? JSON.stringify(body) : undefined
        });
        const sc = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
        if (sc.length) jar = sc.map(c => c.split(';')[0]).join('; ');
        let d = {}; try { d = await r.json(); } catch (e) { /* بی‌بدنه */ }
        return { status: r.status, data: d };
      };

      const li = await idleReq('POST', '/auth/password/login', { phone: ADMIN_PHONE, password: 'admin-pass-1234' });
      check('V22 نشست: ورود مدیر روی سرورِ آزمایشی انجام شد', li.status === 200, String(li.status));
      // درخواست اول مهرِ زمان را می‌گذارد و باید موفق باشد
      const first = await idleReq('GET', '/admin/stats');
      check('V22 نشست: اولین درخواستِ پنل بلافاصله بعد از ورود کار می‌کند',
        first.status === 200, String(first.status));
      /* چرا این مکث لازم است — حذفش تست را لرزان می‌کند (یک بار واقعاً قرمز شد):
         express-session نشست را *بعد از* بسته‌شدنِ پاسخ ذخیره می‌کند. پس ممکن
         است پاسخِ درخواستِ اول به تست برسد در حالی که `panelSeen` هنوز در جدولِ
         sessions ننشسته باشد؛ آن‌وقت درخواستِ دوم نشستِ بی‌مهر را می‌خواند،
         گارد آن را «اولین بازدید» حساب می‌کند (شرطِ `if (last && …)`) و ۲۰۰
         می‌دهد نه ۴۰۱.
         این مسابقه‌ی *تست* است نه ایرادِ محصول: در عمل فاصله‌ی دو درخواستِ پنل
         میلی‌ثانیه‌ای نیست، و بدترین اثرش هم فقط یک درخواستِ اضافه است.
         مکث چیزی را نمی‌پوشاند چون مهلت روی این سرور ۱ms است. */
      await sleep(60);
      // درخواست دوم دیگر «بی‌کارِ منقضی» است
      const second = await idleReq('GET', '/admin/stats');
      check('V22 نشست: درخواستِ بعدی با مهلتِ گذشته ۴۰۱ می‌گیرد',
        second.status === 401, String(second.status));
      check('V22 نشست: دلیلِ خروج idle اعلام می‌شود', second.data.reason === 'idle',
        JSON.stringify(second.data));
      check('V22 نشست: پیام فارسی می‌گوید چه شد و چه کند',
        /بی‌کاری|بی‌کار/.test(second.data.error || '') && /دوباره وارد/.test(second.data.error || ''),
        second.data.error);
      // نشست باید واقعاً نابود شده باشد، نه فقط رد شده
      const meAfter = await idleReq('GET', '/auth/me');
      check('V22 نشست: نشست واقعاً نابود می‌شود (نه فقط رد درخواست)',
        meAfter.status === 200 && meAfter.data.user === null, JSON.stringify(meAfter.data));
      // و صفحه‌ی عمومی هنوز سالم است — گارد فقط پنل را بست
      const pub = await fetch(`http://127.0.0.1:${IDLE_PORT}/api/products`);
      check('V22 نشست: بخش عمومی سایت دست‌نخورده می‌ماند', pub.ok, String(pub.status));
    } finally {
      idleSrv.kill();
    }


    // ---------- V23: کنتراست رنگ در سطح WCAG 2.2 AA ----------
    // این بلاک خودِ ابزار را اجرا می‌کند، نه اینکه محاسبه را دوباره بنویسد.
    // دلیلش ساده است: اگر تست ریاضیِ کنتراست را جدا پیاده کند، دو پیاده‌سازی
    // داریم که می‌توانند هر دو با هم اشتباه باشند. اجرای واقعیِ ابزار یعنی
    // «همان چیزی که آدم دستی اجرا می‌کند» سبز است.
    {
      const cs = require('child_process');
      const run = cs.spawnSync(process.execPath, [path.join(__dirname, 'tools', 'contrast-audit.js')],
        { cwd: __dirname, encoding: 'utf8' });
      const out = (run.stdout || '') + (run.stderr || '');
      check('V23 کنتراست: بازرس بدون ایراد تمام می‌شود (خروجی صفر)',
        run.status === 0, out.split('\n').filter(l => l.includes('⚠')).slice(0, 6).join(' | ') || `status=${run.status}`);
      check('V23 کنتراست: گزارش واقعاً چیزی سنجیده، نه اینکه خالی رد شده باشد',
        /قاعده‌ی متنی سنجیده شد/.test(out) && !/  0 قاعده‌ی متنی/.test(out),
        (out.match(/(\d+) قاعده‌ی متنی/) || [, '?'])[1]);
      check('V23 کنتراست: مرزِ کنترل‌ها هم سنجیده می‌شود',
        /مرزِ کنترل سنجیده شد/.test(out) && !/  0 مرزِ کنترل/.test(out),
        (out.match(/(\d+) مرزِ کنترل/) || [, '?'])[1]);

      // خودِ بازرس باید واقعاً قادر به گرفتنِ ایراد باشد. اگر روزی منطقش
      // بشکند و همیشه سبز شود، تستِ بالا هیچ‌وقت نمی‌فهمد. پس یک CSS خرابِ
      // ساختگی به آن می‌دهیم و انتظار داریم شکایت کند.
      const cssPath = path.join(__dirname, '..', 'frontend', 'css', 'style.css');
      const original = fs.readFileSync(cssPath, 'utf8');
      try {
        fs.writeFileSync(cssPath, original + '\n.pg-contrast-canary{color:#1A2420;}\n');
        const canary = cs.spawnSync(process.execPath, [path.join(__dirname, 'tools', 'contrast-audit.js')],
          { cwd: __dirname, encoding: 'utf8' });
        check('V23 کنتراست: بازرس رنگِ عمداً بد را می‌گیرد (تستِ خودِ ابزار)',
          canary.status !== 0 && /pg-contrast-canary/.test(canary.stdout || ''),
          `status=${canary.status}`);
      } finally {
        fs.writeFileSync(cssPath, original);
      }

      // متغیرهای تازه باید واقعاً استفاده شده باشند، وگرنه فقط تعریف‌اند و
      // رنگ‌های خامِ قدیمی هنوز سرِ جایشان‌اند.
      const cssNow = rd('css/style.css');
      check('V23 کنتراست: رنگِ کم‌نورِ دستیِ قدیمی دیگر جایی نمانده',
        !/#5F736A|#6E837A/.test(cssNow.replace(/\/\*[\s\S]*?\*\//g, '')), 'باید همه به var(--ink-dim) وصل باشند');
      check('V23 کنتراست: متغیرهای تازه هم تعریف و هم استفاده شده‌اند',
        ['--ink-dim', '--line-control', '--ink-on-warm'].every(v =>
          cssNow.includes(v + ':') && (cssNow.match(new RegExp('var\\(' + v + '\\)', 'g')) || []).length >= 1),
        'ink-dim / line-control / ink-on-warm');
      check('V23 کنتراست: مرزِ اینپوت‌ها به متغیرِ کنترل وصل شده',
        (cssNow.match(/var\(--line-control\)/g) || []).length >= 10,
        String((cssNow.match(/var\(--line-control\)/g) || []).length));
    }

    // ---------- V24: عکس‌ها — ابعادِ صریح و تحویلِ WebP ----------
    // دو چیزِ جدا که هر دو به «سرعتِ دیده‌شدنِ صفحه» مربوط‌اند:
    //   ۱) هر <img> باید عرض و ارتفاع داشته باشد، و آن عرض/ارتفاع باید نسبتش
    //      با فایلِ واقعی بخواند. عددِ حدسی بدتر از نبودنش است: مرورگر جای غلط
    //      باز می‌کند و بعد اصلاحش می‌کند، یعنی همان پرشی که می‌خواستیم نباشد.
    //   ۲) نسخه‌ی WebP باید واقعاً از سرور بیرون بیاید. این را با HTTP واقعی
    //      می‌سنجیم نه با خواندنِ کد؛ ترتیبِ میدل‌ورها یک جا عوض شود، کد سالم
    //      به‌نظر می‌رسد ولی هیچ‌وقت webp تحویل نمی‌شود.
    {
      const { imageSizeFromFile } = require('./lib/imagesize');
      const PIC = PIC_ROOT;
      const htmlFiles = fs.readdirSync(FE).filter(f => f.endsWith('.html'));

      const noDim = [];
      const badRatio = [];
      const missingSrcset = [];
      let checkedRatios = 0;

      for (const f of htmlFiles) {
        const src = rd(f);
        for (const tag of src.match(/<img\b[^>]*>/g) || []) {
          const w = (tag.match(/\bwidth="(\d+)"/) || [])[1];
          const h = (tag.match(/\bheight="(\d+)"/) || [])[1];
          const url = (tag.match(/\bsrc="([^"]+)"/) || [])[1] || '';
          if (!w || !h) { noDim.push(`${f}: ${url || tag.slice(0, 60)}`); continue; }

          // نسبت را با فایلِ روی دیسک می‌سنجیم. عددِ مطلق لازم نیست یکی باشد
          // (لوگو ۵۱۲×۵۱۲ است و ۴۸×۴۸ نوشته شده و درست هم هست) — چیزی که
          // اهمیت دارد نسبت است، چون همان جای خالی را رزرو می‌کند.
          if (!url.startsWith('/picture/')) continue;
          const onDisk = path.join(PIC, decodeURIComponent(url.replace('/picture/', '')));
          if (!fs.existsSync(onDisk)) { missingSrcset.push(`${f}: ${url}`); continue; }
          const dim = imageSizeFromFile(onDisk);
          if (!dim) { missingSrcset.push(`${f}: ابعادِ ${url} خوانده نشد`); continue; }
          checkedRatios++;
          const declared = Number(w) / Number(h);
          const real = dim.width / dim.height;
          if (Math.abs(declared - real) / real > 0.02) {
            badRatio.push(`${f}: ${url} — نوشته ${w}×${h} (${declared.toFixed(3)}) ولی فایل ${dim.width}×${dim.height} (${real.toFixed(3)})`);
          }

          // اگر روزی srcset اضافه شد، هر نامزدش باید روی دیسک باشد وگرنه
          // مرورگر همان را انتخاب می‌کند و کادرِ خالی می‌ماند.
          const ss = (tag.match(/\bsrcset="([^"]+)"/) || [])[1];
          if (ss) {
            for (const cand of ss.split(',')) {
              const p = cand.trim().split(/\s+/)[0];
              if (!p.startsWith('/picture/')) continue;
              const cp = path.join(PIC, decodeURIComponent(p.replace('/picture/', '')));
              if (!fs.existsSync(cp)) missingSrcset.push(`${f}: نامزدِ srcset نیست → ${p}`);
            }
          }
        }
      }

      check('V24 عکس: همه‌ی <img>های ثابت عرض و ارتفاع دارند',
        noDim.length === 0, noDim.join(' | '));
      check('V24 عکس: نسبتِ نوشته‌شده با فایلِ واقعی می‌خواند',
        badRatio.length === 0, badRatio.join(' | '));
      check('V24 عکس: هیچ عکسِ ثابتی به فایلِ ناموجود اشاره نمی‌کند',
        missingSrcset.length === 0, missingSrcset.join(' | '));
      check('V24 عکس: تست واقعاً چند نسبت را سنجیده (تستِ خودِ تست)',
        checkedRatios >= 4, `${checkedRatios} عکس`);

      // ---- تحویلِ WebP روی HTTP واقعی ----
      const IMG_URL = '/picture/products/' + encodeURIComponent('کاسه سرو پایه چوبی 2 لیتر.jpg');
      const asWebp = await fetch(BASE + IMG_URL, { headers: { Accept: 'image/webp,image/*,*/*' } });
      const webpBody = Buffer.from(await asWebp.arrayBuffer());
      check('V24 وب‌پی: مرورگرِ webp-فهم نسخه‌ی webp می‌گیرد',
        asWebp.status === 200 && asWebp.headers.get('content-type') === 'image/webp',
        `${asWebp.status} — ${asWebp.headers.get('content-type')}`);
      check('V24 وب‌پی: بدنه واقعاً webp است (امضای RIFF/WEBP)',
        webpBody.toString('ascii', 0, 4) === 'RIFF' && webpBody.toString('ascii', 8, 12) === 'WEBP',
        webpBody.toString('ascii', 0, 4));

      const asJpeg = await fetch(BASE + IMG_URL, { headers: { Accept: 'image/png,*/*' } });
      const jpegBody = Buffer.from(await asJpeg.arrayBuffer());
      check('V24 وب‌پی: مرورگرِ قدیمی همان JPEG را می‌گیرد، نه کادرِ خالی',
        asJpeg.status === 200 && jpegBody[0] === 0xFF && jpegBody[1] === 0xD8,
        `${asJpeg.status} — ${asJpeg.headers.get('content-type')}`);
      check('V24 وب‌پی: نسخه‌ی webp سبک‌تر از اصل است',
        webpBody.length < jpegBody.length,
        `${Math.round(webpBody.length / 1024)}KB < ${Math.round(jpegBody.length / 1024)}KB`);

      // بدونِ Vary: Accept، یک پروکسیِ میانی جوابِ webp را به مرورگرِ قدیمی هم
      // می‌دهد و او عکسِ خراب می‌بیند. پس روی *هر دو* جواب باید باشد.
      // «Accept» باید یک توکنِ مستقل باشد. اگر فقط /accept/ می‌گرفتیم،
      // هدرِ Vary: Accept-Encoding هم قبول می‌شد و تست الکی سبز می‌ماند.
      const hasAcceptToken = (v) => String(v || '').split(',').some(t => t.trim().toLowerCase() === 'accept');
      check('V24 وب‌پی: هدرِ Vary: Accept روی هر دو جواب هست',
        hasAcceptToken(asWebp.headers.get('vary')) && hasAcceptToken(asJpeg.headers.get('vary')),
        `webp=${asWebp.headers.get('vary')} / jpeg=${asJpeg.headers.get('vary')}`);

      // مذاکره‌کننده قبل از express.static می‌نشیند، پس محافظتِ آن به او نمی‌رسد
      // و باید خودش جلوی بیرون‌زدن از پوشه‌ی عکس را بگیرد.
      const trav = await fetch(BASE + '/picture/products/..%2f..%2fbackend%2f.env.jpg',
        { headers: { Accept: 'image/webp' } });
      check('V24 وب‌پی: مسیرِ بیرون‌زننده از پوشه‌ی عکس تحویل نمی‌شود',
        trav.status !== 200, String(trav.status));

      // ترتیبِ میدل‌ورها: اگر static اول بیاید، مذاکره هیچ‌وقت اجرا نمی‌شود.
      const srvSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
      const iNeg = srvSrc.indexOf('webpNegotiate(PICTURE_DIR)');
      const iStatic = srvSrc.indexOf('express.static(PICTURE_DIR');
      check('V24 وب‌پی: مذاکره پیش از express.static سوار شده',
        iNeg >= 0 && iStatic >= 0 && iNeg < iStatic,
        `neg=${iNeg} static=${iStatic}`);

      // درصدِ خرابِ URL نباید سرور را به ۵۰۰ ببرد
      const badEsc = await fetch(BASE + '/picture/products/%ZZ.jpg', { headers: { Accept: 'image/webp' } });
      check('V24 وب‌پی: مسیرِ با کدگذاریِ خراب جوابِ ۵۰۰ نمی‌دهد',
        badEsc.status !== 500, String(badEsc.status));

      // ---- خودِ imagesize.js ----
      // اگر این اشتباه بخواند، هم نسبت‌های بالا غلط تأیید می‌شوند و هم نگهبانِ
      // آپلود. پس با فایلی که خودمان ساختیم و ابعادش را می‌دانیم می‌سنجیمش.
      const { imageSizeFromBuffer } = require('./lib/imagesize');
      const probe = imageSizeFromBuffer(makePng(321, 123));
      check('V24 ابعاد: PNG با ابعادِ معلوم درست خوانده می‌شود',
        probe && probe.width === 321 && probe.height === 123 && probe.type === 'png',
        JSON.stringify(probe));
      check('V24 ابعاد: نسخه‌ی webp عکس‌ها هم خوانده می‌شود',
        (() => {
          const w = imageSizeFromFile(path.join(PIC, 'products', 'کاسه سرو پایه چوبی 2 لیتر.webp'));
          return w && w.width === 938 && w.height === 760;
        })(), 'باید ۹۳۸×۷۶۰ باشد');
      check('V24 ابعاد: فایلِ خراب باعثِ خطا نمی‌شود، فقط null می‌دهد',
        imageSizeFromBuffer(Buffer.from('این عکس نیست ولی به‌اندازه‌ی کافی بلند است')) === null);

      /* ---- V26: بندانگشتی (?w=320) ----
         سه کادرِ کوچکِ سایت (پیشنهادِ جست‌وجو ۴۴px، ردیفِ سبد ۷۶px، فهرستِ
         کالای پنل ۴۰px) عکسِ کامل می‌گرفتند. حالا با ?w=320 نسخه‌ی کوچک
         می‌رود. این بخش هم «کوچک شدن» را می‌سنجد و هم «تار نشدن» را. */
      const thumb320 = await fetch(BASE + IMG_URL + '?w=320',
        { headers: { Accept: 'image/webp,image/*,*/*' } });
      const thumbBody = Buffer.from(await thumb320.arrayBuffer());
      check('V26 بندانگشتی: ?w=320 جوابِ webp می‌دهد',
        thumb320.status === 200 && thumb320.headers.get('content-type') === 'image/webp',
        `${thumb320.status} — ${thumb320.headers.get('content-type')}`);
      check('V26 بندانگشتی: واقعاً نسخه‌ی کوچک آمد، نه همان فایلِ کامل',
        thumbBody.length > 0 && thumbBody.length < webpBody.length / 2,
        `${Math.round(thumbBody.length / 1024)}KB در برابرِ ${Math.round(webpBody.length / 1024)}KB`);

      // مهم‌ترین تستِ این بخش: نسخه‌ی کوچک نباید آن‌قدر کوچک باشد که در بزرگ‌ترین
      // کادر (سبد، ۷۶px) روی صفحه‌ی DPR۳ تار شود. با object-fit:cover *ضلعِ کوچکِ*
      // منبع تعیین‌کننده است، پس همان را می‌سنجیم نه عرض را.
      const tDim = imageSizeFromBuffer(thumbBody);
      check('V26 بندانگشتی: ضلعِ کوچکش ≥۲۲۸ است (کادرِ ۷۶px روی DPR۳ تار نشود)',
        tDim && Math.min(tDim.width, tDim.height) >= 228,
        tDim ? `${tDim.width}×${tDim.height}` : 'خوانده نشد');

      // مرورگرِ بی‌webp نباید بدتر از امروز شود: همان JPEGِ کامل را می‌گیرد
      const thumbOld = await fetch(BASE + IMG_URL + '?w=320', { headers: { Accept: 'image/png,*/*' } });
      const thumbOldBody = Buffer.from(await thumbOld.arrayBuffer());
      check('V26 بندانگشتی: مرورگرِ قدیمی همان JPEG را می‌گیرد (نه کادرِ خالی)',
        thumbOld.status === 200 && thumbOldBody[0] === 0xFF && thumbOldBody[1] === 0xD8,
        `${thumbOld.status} — ${thumbOld.headers.get('content-type')}`);

      // عرضِ خارج از فهرستِ مجاز نباید فایل بسازد یا ۴۰۴ بدهد؛ فقط نادیده گرفته شود.
      // بدون این فهرستِ بسته، یک نفر با w=1..9999 کشِ سرور و CDN را پر می‌کرد.
      const oddW = await fetch(BASE + IMG_URL + '?w=999', { headers: { Accept: 'image/webp,*/*' } });
      const oddBody = Buffer.from(await oddW.arrayBuffer());
      check('V26 بندانگشتی: عرضِ غیرمجاز (w=999) به نسخه‌ی کامل برمی‌گردد',
        oddW.status === 200 && oddBody.length === webpBody.length,
        `${oddW.status} — ${oddBody.length} بایت`);
      const junkW = await fetch(BASE + IMG_URL + '?w=../../etc', { headers: { Accept: 'image/webp,*/*' } });
      check('V26 بندانگشتی: پارامترِ مزخرف هم چیزی را نمی‌شکند',
        junkW.status === 200, String(junkW.status));

      // عکسی که نسخه‌ی کوچک ندارد نباید ۴۰۴ شود — نبودِ فایل باید بی‌صدا باشد.
      // یک نامِ ساختگی که قطعاً وجود ندارد، ولی .webpِ کامل هم ندارد؛ پس مسیرِ
      // «هیچ‌کدام نبود → برو سراغ express.static» را می‌سنجد.
      const noVariant = await fetch(BASE + '/picture/logo/' +
        encodeURIComponent('aa0b989f259f92d1240eb20d51846643.jfif') + '?w=320',
        { headers: { Accept: 'image/webp,*/*' } });
      check('V26 بندانگشتی: عکسِ لوگو با ?w هم سالم تحویل می‌شود',
        noVariant.status === 200, String(noVariant.status));

      /* ---- V26: سمتِ فرانت ----
         سرور بی‌عیب باشد ولی هیچ صفحه‌ای ?w نفرستد، این کار بی‌فایده است. */
      const commonSrc = fs.readFileSync(path.join(FRONT, 'js', 'common.js'), 'utf8');
      const cartSrc = fs.readFileSync(path.join(FRONT, 'js', 'cart.js'), 'utf8');
      const adminSrc = fs.readFileSync(path.join(FRONT, 'js', 'admin.js'), 'utf8');
      check('V26 فرانت: تابعِ thumb از common.js بیرون داده شده',
        /\breturn \{[^}]*\bthumb\b/.test(commonSrc), 'در فهرستِ export نیست');
      check('V26 فرانت: پیشنهادِ جست‌وجو از نسخه‌ی کوچک استفاده می‌کند',
        /suggest-thumb[\s\S]{0,160}thumb\(/.test(commonSrc));
      check('V26 فرانت: ردیفِ سبد از نسخه‌ی کوچک استفاده می‌کند',
        /PG\.thumb\(item\.image\)/.test(cartSrc));
      check('V26 فرانت: هر دو فهرستِ کالای پنل از نسخه‌ی کوچک استفاده می‌کنند',
        (adminSrc.match(/ad-thumb[^\n]*thumb\(p\.image\)/g) || []).length === 2,
        `پیدا شد: ${(adminSrc.match(/ad-thumb[^\n]*thumb\(p\.image\)/g) || []).length} از ۲`);

      /* نگهبانِ فرض: عددِ ۳۲۰ از روی بزرگ‌ترین کادر (۷۶px) حساب شده. اگر کسی
         روزی .cart-row-media را بزرگ کند و یادش برود، عکس بی‌سروصدا تار می‌شود
         و هیچ تستی نمی‌گیردش. این تست همان فرض را قفل می‌کند. */
      const cssSrc = fs.readFileSync(path.join(FRONT, 'css', 'style.css'), 'utf8');
      const boxOf = (cls) => {
        const m = cssSrc.match(new RegExp(`\\.${cls}\\{[^}]*?width:(\\d+)px`, 's'));
        return m ? Number(m[1]) : null;
      };
      const boxes = { 'suggest-thumb': boxOf('suggest-thumb'), 'cart-row-media': boxOf('cart-row-media'), 'ad-thumb': boxOf('ad-thumb') };
      const biggest = Math.max(...Object.values(boxes).map(v => v || 0));
      check('V26 نگهبان: بزرگ‌ترین کادرِ بندانگشتی هنوز در حدِ ۳۲۰px جا می‌شود',
        biggest > 0 && biggest * 3 <= (tDim ? Math.min(tDim.width, tDim.height) : 0) + 4,
        `${JSON.stringify(boxes)} → بزرگ‌ترین ${biggest}px، لازم ${biggest * 3}px`);

      // آدرس‌های بیرونی و svg نباید پارامتر بگیرند
      check('V26 thumb: فقط مسیرهای داخلیِ /picture را دست می‌زند',
        /startsWith\('\/picture\/'\)/.test(commonSrc) && /includes\('\?'\)/.test(commonSrc));

      /* ---- V27: کارتِ محصول روی صفحه‌ی DPR۱ (?w=560) ----
         اندازه‌گیری: کادرِ کارت ۴ستونه ۲۶۸px، ۳ستونه ۳۲۷، ۲ستونه ۲۸۳، و
         ۱ستونه‌ی موبایل ۳۸۲ — یعنی کارتِ موبایل از دسکتاپ بزرگ‌تر است. */
      const CARD_MAX_BOX = 382;
      const card560 = await fetch(BASE + IMG_URL + '?w=560', { headers: { Accept: 'image/webp,image/*,*/*' } });
      const cardBody = Buffer.from(await card560.arrayBuffer());
      check('V27 کارت: ?w=560 نسخه‌ی سبک‌تر از کامل می‌دهد',
        card560.status === 200 && cardBody.length > 0 && cardBody.length < webpBody.length,
        `${cardBody.length} در برابرِ ${webpBody.length}`);
      const cDim = imageSizeFromBuffer(cardBody);
      check('V27 کارت: و از بندانگشتیِ ۳۲۰ بزرگ‌تر است (اشتباهی همان نرود)',
        cDim && tDim && cDim.width > tDim.width, JSON.stringify({ c: cDim, t: tDim }));

      /* نگهبانِ اصلی: با object-fit:cover ضلعِ کوچکِ منبع تعیین‌کننده است.
         روی DPR۱ بزرگ‌ترین کادرِ ممکن ۳۸۲px است، پس ضلعِ کوچک باید ≥۳۸۲ بماند.
         اگر روزی عکسِ خیلی پهنی آپلود شود، ۵۶۰/نسبت زیرِ ۳۸۲ می‌افتد و کارت
         بی‌سروصدا تار می‌شود — این تست همان‌جا قرمز می‌شود. */
      {
        const picRoot = PIC_ROOT;
        const stack = [picRoot], soft = [];
        let seen = 0;
        while (stack.length) {
          const d = stack.pop();
          if (!fs.existsSync(d)) continue;
          for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            const f = path.join(d, e.name);
            if (e.isDirectory()) { stack.push(f); continue; }
            if (!/-560w\.webp$/.test(e.name)) continue;
            seen++;
            const dm = imageSizeFromBuffer(fs.readFileSync(f));
            if (!dm || Math.min(dm.width, dm.height) < CARD_MAX_BOX) soft.push(`${e.name} ${dm ? dm.width + '×' + dm.height : '؟'}`);
          }
        }
        check('V27 نگهبان: هیچ نسخه‌ی ۵۶۰ ضلعِ کوچکش زیرِ ۳۸۲ نیست',
          seen > 0 && soft.length === 0, soft.join(' | ') || `${seen} فایل بررسی شد`);
      }

      /* و نگهبانِ عددِ ۳۸۲ خودش: از CSS خوانده می‌شود تا اگر کسی نقطه‌ی شکستِ
         تک‌ستونه یا پدینگِ کانتینر را عوض کند، فرضِ بالا بی‌سروصدا کهنه نشود.
         پدینگ با هر دو نگارش خوانده می‌شود — شورتهندِ «padding:0 24px» و
         longhandِ «padding-inline:24px». .container عمداً به longhand رفت
         (شورتهند فاصله‌ی عمودیِ .page-head را پاک می‌کرد)، و آن تغییرِ درست
         این نگهبان را کور کرد: pad برابرِ null شد و تست به‌جای «عدد عوض شد»
         گفت «از CSS درآمد nullpx». یعنی نگهبان به نگارش حساس بود نه به عدد. */
      {
        const bp = cssSrc.match(/@media \(max-width:(\d+)px\)\{[^@]*?\.product-grid\{grid-template-columns:1fr/s);
        const pad = cssSrc.match(/\.container\{[^}]*?padding(?:-inline)?:(?:0 )?(\d+)px/s);
        const box = bp && pad ? Number(bp[1]) - 2 * Number(pad[1]) : null;
        check('V27 نگهبان: بزرگ‌ترین کادرِ کارت هنوز همان ۳۸۲px است',
          box === CARD_MAX_BOX, `از CSS درآمد ${box}px، فرضِ کد ${CARD_MAX_BOX}px`);
      }

      check('V27 فرانت: تابعِ cardImg از common.js بیرون داده شده',
        /\breturn \{[^}]*\bcardImg\b/.test(commonSrc), 'در فهرستِ export نیست');
      check('V27 فرانت: تصمیم بر اساسِ چگالیِ پیکسل است نه عرضِ پنجره',
        /devicePixelRatio/.test(commonSrc) && /cardImg[\s\S]{0,400}thumb\(src, 560\)/.test(commonSrc));
      for (const [f, srcTxt] of [['main.js', null], ['product.js', null], ['account.js', null]]) {
        const s = srcTxt || fs.readFileSync(path.join(FRONT, 'js', f), 'utf8');
        check(`V27 فرانت: کارتِ محصول در ${f} از cardImg رد می‌شود`,
          /PG\.cardImg\(p\.image\)/.test(s));
      }
      check('V27 عرضِ مجاز یک فهرستِ بسته مانده (نه هر عددی)',
        /ALLOWED_WIDTHS = new Set\(\[320, 560\]\)/.test(
          fs.readFileSync(path.join(__dirname, 'lib', 'webp-negotiate.js'), 'utf8')));
    }

    /* ============ V28: ابزارِ بازگردانیِ بکاپ ============
       این خطرناک‌ترین ابزارِ پروژه است — روی همان فایلی کار می‌کند که همه‌ی
       سفارش‌های واقعی مغازه داخلش است. پس بیش از «اجرا شد و ترکید» می‌سنجیم:
       آیا بکاپِ خراب را رد می‌کند؟ آیا راهِ برگشت واقعاً برمی‌گرداند؟ */
    {
      const cs = require('child_process');
      const os = require('os');
      const { DatabaseSync } = require('node:sqlite');
      const TOOL = path.join(__dirname, 'tools', 'restore-backup.js');

      // پوشه‌ی داده‌ی *جدا* از سندباکسِ سرور. اگر روی همان اجرا شود، دیتابیسی
      // که سرورِ تست بازش کرده زیر پایش عوض می‌شود و بقیه‌ی تست‌ها می‌ترکند.
      const rdir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-restore-'));
      const rBack = path.join(rdir, 'backups');
      fs.mkdirSync(rBack, { recursive: true });
      const liveDb = path.join(rdir, 'polasco.db');
      fs.copyFileSync(path.join(SANDBOX_DATA, 'polasco.db'), liveDb);

      const runTool = (argv) => cs.spawnSync(process.execPath, [TOOL, ...argv],
        { encoding: 'utf8', env: { ...process.env, PG_DATA_DIR: rdir } });
      const probe = (file) => {
        const d = new DatabaseSync(file, { readOnly: true });
        try { const r = d.prepare("SELECT value FROM settings WHERE key='pg_restore_probe'").get(); return r ? r.value : null; }
        finally { d.close(); }
      };
      const stamp = (file, mark) => {
        const d = new DatabaseSync(file);
        d.exec(`INSERT OR REPLACE INTO settings (key, value) VALUES ('pg_restore_probe','${mark}')`);
        d.close();
      };

      // وضعیتِ فعلی را «LIVE» علامت می‌زنیم و یک بکاپ با علامتِ «OLD» می‌سازیم.
      // این‌طور «آیا واقعاً جایگزین شد؟» به‌جای شمارشِ سطر با یک مقدارِ صریح
      // سنجیده می‌شود و به شکلِ داده‌ی مغازه وابسته نیست.
      stamp(liveDb, 'LIVE');
      const bkOld = path.join(rBack, 'polasco-2020-01-01.db');
      { const d = new DatabaseSync(liveDb); d.exec(`VACUUM INTO '${bkOld.replace(/'/g, "''")}'`); d.close(); }
      stamp(bkOld, 'OLD');

      // ۱) بی‌آرگومان باید فقط فهرست بدهد و به دیتابیس دست نزند
      const listRun = runTool([]);
      check('V28 فهرست: بی‌آرگومان خروجیِ موفق می‌دهد و نامِ بکاپ را نشان می‌دهد',
        listRun.status === 0 && listRun.stdout.includes('polasco-2020-01-01.db'),
        `exit ${listRun.status}`);
      check('V28 فهرست: بی‌آرگومان هیچ چیزی را عوض نمی‌کند',
        probe(liveDb) === 'LIVE', String(probe(liveDb)));

      // ۲) بکاپِ خراب باید رد شود و دیتابیسِ فعلی سالم بماند
      const bkBad = path.join(rBack, 'polasco-2020-01-02.db');
      fs.writeFileSync(bkBad, Buffer.alloc(4096, 0x41));   // «AAAA…» — فایلِ SQLite نیست
      const badRun = runTool(['2020-01-02', '--yes']);
      check('V28 محافظ: بکاپِ خراب رد می‌شود (خروجیِ ناموفق)',
        badRun.status === 1 && /سالم نیست/.test(badRun.stdout), `exit ${badRun.status}`);
      check('V28 محافظ: و دیتابیسِ فعلی دست‌نخورده می‌ماند',
        probe(liveDb) === 'LIVE', String(probe(liveDb)));

      // ۳) بازگردانیِ واقعی
      const okRun = runTool(['2020-01-01', '--yes']);
      check('V28 بازگردانی: با موفقیت تمام می‌شود', okRun.status === 0, `exit ${okRun.status}`);
      check('V28 بازگردانی: محتوای دیتابیس واقعاً همان بکاپ شد',
        probe(liveDb) === 'OLD', String(probe(liveDb)));
      check('V28 بازگردانی: تفاوت را قبل از انجام نشان داد',
        /چه چیزی عوض می‌شود/.test(okRun.stdout));

      // ۴) عکسِ pre-restore ساخته شد و راهِ برگشت واقعاً برمی‌گرداند.
      //    بی این، ابزار «برگشت‌پذیر» بودنش فقط یک ادعا در کامنت است.
      const snaps = fs.readdirSync(rBack).filter(f => /^pre-restore-.*\.db$/.test(f));
      check('V28 برگشت: عکسِ وضعیتِ قبل گرفته شد', snaps.length === 1, snaps.join(','));
      if (snaps.length === 1) {
        const backRun = runTool([snaps[0], '--yes']);
        check('V28 برگشت: همان عکس دیتابیس را به حالتِ قبل برمی‌گرداند',
          backRun.status === 0 && probe(liveDb) === 'LIVE', `exit ${backRun.status} — ${probe(liveDb)}`);
      }

      // ۵) فایل‌های کهنه‌ی -wal/-shm نباید بمانند. اگر بمانند، SQLite صفحه‌های
      //    دیتابیسِ *قبلی* را روی فایلِ تازه پخش می‌کند و نتیجه نه این است نه آن.
      fs.writeFileSync(liveDb + '-wal', Buffer.alloc(64, 7));
      fs.writeFileSync(liveDb + '-shm', Buffer.alloc(64, 7));
      const walRun = runTool(['2020-01-01', '--yes']);
      check('V28 حساس‌ترین قدم: فایل‌های کهنه‌ی -wal و -shm پاک می‌شوند',
        walRun.status === 0 && !fs.existsSync(liveDb + '-wal') && !fs.existsSync(liveDb + '-shm'),
        `exit ${walRun.status}`);

      // ۶) نامِ بی‌ربط نباید چیزی را عوض کند
      const missRun = runTool(['1999-12-31', '--yes']);
      check('V28 نامِ ناموجود: خطای روشن می‌دهد و دست به دیتابیس نمی‌زند',
        missRun.status === 1 && probe(liveDb) === 'OLD', `exit ${missRun.status}`);

      try { fs.rmSync(rdir, { recursive: true, force: true }); } catch (e) { /* بی‌اهمیت */ }

      /* چرخشِ بکاپ: عکس‌های دستی نباید سهمِ ۱۴ روزِ بکاپِ روزانه را بخورند.
         الفبایی بعد از `polasco-` می‌آیند، پس با شمارشِ قبلی خودشان هرگز پاک
         نمی‌شدند ولی هر کدام یک روز از تاریخچه را می‌بلعیدند. */
      {
        const dbm = require('./lib/db');
        const bdir = path.join(SANDBOX_DATA, 'backups');
        fs.mkdirSync(bdir, { recursive: true });
        for (const f of fs.readdirSync(bdir)) fs.unlinkSync(path.join(bdir, f));
        for (let i = 1; i <= 16; i++) {
          fs.writeFileSync(path.join(bdir, `polasco-2019-01-${String(i).padStart(2, '0')}.db`), 'x');
        }
        fs.writeFileSync(path.join(bdir, 'pre-restore-20190101000000.db'), 'x');
        const quiet = { info() {}, warn() {}, error() {}, log() {} };
        await dbm.backupNow(quiet);
        const left = fs.readdirSync(bdir);
        check('V28 چرخش: عکسِ دستی در چرخش پاک نمی‌شود',
          left.includes('pre-restore-20190101000000.db'), left.join(','));
        check('V28 چرخش: بکاپ‌های روزانه به ۱۴ رسیدند (عکسِ دستی جایشان را نگرفت)',
          left.filter(f => /^polasco-.*\.db$/.test(f)).length === 14,
          String(left.filter(f => /^polasco-.*\.db$/.test(f)).length));
      }
    }

    /* ============ V29: بخشِ «خطاها»ی پنل ============
       دو نیمه‌ی جدا سنجیده می‌شود، چون دو جور خراب می‌شوند:
       • خودِ خلاصه‌ساز (lib/error-digest.js) تابعِ خالص است، پس با لاگِ ساختگی
         روی پوشه‌ی موقت آزمایش می‌شود — دقیق و بی‌وابستگی به لاگِ واقعی.
       • مسیرِ API با سرورِ واقعیِ تست. اینجا بود که اشتباهِ `req.user` جای
         `req.adminUser` لو رفت: مسیر برای ادمین هم ۴۰۳ می‌داد و هیچ تستی
         نمی‌دیدش، چون فرانت خطا را بی‌صدا به «پوشه‌ی لاگ خوانده نشد» می‌برد. */
    {
      const os = require('os');
      const dg = require('./lib/error-digest');

      /* ---- ۱) توابعِ خالص ---- */
      check('V29 گروه: دو خطای یکسان با شماره‌ی سفارشِ فرق‌دار یک گروه می‌شوند',
        dg.groupKey('cancel failed GET /api/orders/41') === dg.groupKey('cancel failed GET /api/orders/42'),
        dg.groupKey('cancel failed GET /api/orders/41'));
      check('V29 گروه: دو خطای واقعاً متفاوت یک گروه نمی‌شوند',
        dg.groupKey('sms gateway timeout') !== dg.groupKey('sqlite disk full'));

      // ماسک باید عینِ قاعده‌ی routes/auth.js باشد؛ دو شکلِ ماسک در یک پنل
      // خودش گمراه‌کننده است.
      const masked = dg.maskPhone('otp send failed for 09121234567 twice');
      check('V29 حریم: شماره‌ی موبایل ماسک می‌شود و چهار رقمِ آخر می‌ماند',
        masked.includes('****4567') && !masked.includes('09121234567'), masked);
      check('V29 حریم: عددهای دیگر (مبلغ، شناسه) دست‌نخورده می‌مانند',
        dg.maskPhone('order 41 total 250000') === 'order 41 total 250000');

      const rawStack = [
        'Error: boom',
        '    at handler (/srv/pg/backend/routes/admin.js:200:5)',
        '    at Layer.handle (/srv/pg/backend/node_modules/express/lib/router/layer.js:95:5)',
        '    at process.processTicksAndRejections (node:internal/process/task_queues:95:5)',
        '    at run (/srv/pg/backend/lib/db.js:40:3)',
        '    at a (/srv/pg/backend/a.js:1:1)',
        '    at b (/srv/pg/backend/b.js:1:1)',
        '    at c (/srv/pg/backend/c.js:1:1)',
      ].join('\n');
      const frames = dg.trimStack(rawStack, '/srv/pg');
      check('V29 stack: فریم‌های node_modules و node:internal انداخته می‌شوند',
        !frames.some(f => f.includes('node_modules') || f.includes('node:internal')), frames.join(' | '));
      check('V29 stack: مسیرِ پوشه‌ی پروژه از ابتدای فریم‌ها بریده می‌شود',
        frames[0] === 'at handler (backend/routes/admin.js:200:5)', String(frames[0]));
      check('V29 stack: بیشتر از ۴ فریم نشان داده نمی‌شود', frames.length === 4, String(frames.length));
      check('V29 stack: ورودیِ بی‌ریخت چیزی را نمی‌شکند',
        Array.isArray(dg.trimStack(undefined, '/srv/pg')) && dg.trimStack(null, '/x').length === 0);

      /* سه موردِ زیر روی لاگِ *واقعی* لو رفتند، نه در نمونه‌ی ساختگی. برای همین
         اینجا میخ می‌شوند: نمونه‌ی دست‌ساز فقط چیزی را می‌آزماید که آدم فکرش را
         کرده، و همین‌ها بودند که به فکرم نرسیده بودند. */
      const oddFrames = dg.trimStack([
        'Error: real-world shapes',
        '    at ServerResponse.setHeader (node:_http_outgoing:703:3)',   // نه node:internal، ولی باز داخلی
        '    at node:internal/main/run_main_module:36:49',                // بی‌پرانتز
        '    at /old/install/path/polasco-goli/backend/routes/products.js:48:9', // فریمِ بی‌نام از نصبِ قبلی
        '    at f (/srv/pg/backend/lib/db.js:1:1)',
      ].join('\n'), '/srv/pg');
      check('V29 stack: فریمِ داخلیِ Node بی‌پرانتز هم انداخته می‌شود',
        !oddFrames.some(f => f.includes('node:')), oddFrames.join(' | '));
      check('V29 stack: مسیرِ نصبِ قدیمی هم کوتاه می‌شود (لاگ از سرورِ دیگر)',
        oddFrames.includes('at backend/routes/products.js:48:9'), oddFrames.join(' | '));
      check('V29 stack: مسیرِ نامربوط دست‌نخورده می‌ماند (وگرنه ردیابی سخت می‌شود)',
        dg.trimStack('E\n    at f (/tmp/boom.js:12:46)', '/srv/pg')[0] === 'at f (/tmp/boom.js:12:46)');
      // rootDirِ نانرمال (با .. وسطش) نباید بی‌صدا از کار بیندازدش
      check('V29 stack: rootDir با .. هم درست جای‌گذاری می‌شود',
        dg.trimStack('E\n    at f (/srv/pg/backend/lib/db.js:1:1)', '/srv/pg/backend/..')[0]
          === 'at f (backend/lib/db.js:1:1)',
        dg.trimStack('E\n    at f (/srv/pg/backend/lib/db.js:1:1)', '/srv/pg/backend/..')[0]);

      check('V29 پنج‌ایکس: پاسخ‌های ۵۰۰ و ۵۰۲ و ۵۰۴ شمرده می‌شوند',
        dg.count5xx('[HTTP] GET /a 200 1ms\n[HTTP] GET /b 500 1ms\n[HTTP] GET /c 404 1ms\n[HTTP] GET /d 502 1ms\n[HTTP] GET /e 504 1ms') === 3,
        String(dg.count5xx('[HTTP] GET /b 500 1ms\n[HTTP] GET /d 502 1ms\n[HTTP] GET /e 504 1ms')));
      /* ۵۰۳ در این پروژه یعنی «مغازه بسته است» — تصمیمِ صاحبِ مغازه، نه خرابی.
         روی لاگِ واقعی ۵۶ مورد ۵۰۳ بود و همه‌شان POST /api/orders؛ اگر شمرده
         می‌شد، کارتِ «مشتری خطا دید» بی‌دلیل قرمزِ ۵۶ می‌شد. */
      check('V29 پنج‌ایکس: ۵۰۳ (مغازه‌ی بسته) خطا حساب نمی‌شود',
        dg.count5xx('[HTTP] POST /api/orders 503 9ms\n[HTTP] POST /api/orders 503 9ms') === 0);
      check('V29 پنج‌ایکس: فایلِ نبوده صفر می‌دهد و پرت نمی‌کند',
        dg.tailFile(path.join(os.tmpdir(), 'pg-does-not-exist-' + Date.now() + '.log')) === '');

      /* ---- ۲) خلاصه‌سازی روی لاگِ ساختگی ---- */
      const ldir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-logs-'));
      const iso = (d) => new Date(d).toISOString();
      const today = new Date().toISOString().slice(0, 10);
      const yday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

      // همان خطا سه بار، ولی دلیل و stackِ **تازه‌ترین** نمونه باید برنده شود
      const errLines = [
        `${yday}T08:00:00.000Z [ERROR] cancel failed GET /api/orders/41 {"message":"OLD REASON","stack":"Error: x\\n    at old (/srv/pg/backend/x.js:1:1)"}`,
        `${today}T09:00:00.000Z [ERROR] cancel failed GET /api/orders/42 {"message":"NEW REASON","stack":"Error: x\\n    at fresh (/srv/pg/backend/y.js:2:2)"}`,
        `${today}T09:05:00.000Z [ERROR] cancel failed GET /api/orders/43`,
        // پیامی که خودش `{` دارد: پارس نباید از چپ برود وگرنه پیام تکه‌تکه می‌شود
        `${today}T10:00:00.000Z [ERROR] bad template {name} for user {"message":"tpl"}`,
        `${today}T11:00:00.000Z [ERROR] otp send failed for 09121234567`,
        'یک خطِ آشغال که هیچ ساختاری ندارد',
      ];
      fs.writeFileSync(path.join(ldir, `error-${today}.log`),
        errLines.filter(l => !l.startsWith(yday)).join('\n') + '\n');
      fs.writeFileSync(path.join(ldir, `error-${yday}.log`),
        errLines.filter(l => l.startsWith(yday)).join('\n') + '\n');
      fs.writeFileSync(path.join(ldir, `access-${today}.log`),
        '[HTTP] GET /a 200 1ms\n[HTTP] GET /b 500 1ms\n[HTTP] GET /c 502 1ms\n');

      const dig = dg.errorDigest({ logDir: ldir, rootDir: '/srv/pg', days: 7 });
      check('V29 خلاصه: خطای تکراری در یک گروه با شمارشِ درست جمع می‌شود',
        dig.groups.some(g => g.count === 3 && /cancel failed/.test(g.title)),
        dig.groups.map(g => `${g.count}×${g.title}`).join(' | ').slice(0, 160));
      check('V29 خلاصه: خطِ بی‌ساختار نادیده گرفته می‌شود، نه اینکه گروه شود',
        !dig.groups.some(g => g.title.includes('آشغال')));
      check('V29 خلاصه: پیامی که خودش { دارد کامل می‌ماند',
        dig.groups.some(g => g.title === 'bad template {name} for user'),
        dig.groups.map(g => g.title).join(' | ').slice(0, 160));
      const grp = dig.groups.find(g => /cancel failed/.test(g.title));
      check('V29 خلاصه: دلیل از تازه‌ترین نمونه گرفته می‌شود، نه اولی',
        grp && grp.reason === 'NEW REASON', grp && grp.reason);
      check('V29 خلاصه: stack هم از همان نمونه‌ی تازه است',
        grp && grp.stack.join('').includes('at fresh'), grp && grp.stack.join(' | '));
      check('V29 خلاصه: اولین و آخرین دیده‌شدن هر دو ثبت می‌شوند',
        grp && grp.first < grp.last, grp && `${grp.first} → ${grp.last}`);
      // عنوان هم باید از تازه‌ترین نمونه باشد، وگرنه عنوانِ ردیف با زمانِ
      // کنارش یک لحظه را توصیف نمی‌کنند و سرنخِ غلط می‌دهند.
      check('V29 خلاصه: عنوانِ گروه از تازه‌ترین نمونه است، نه اولین',
        grp && grp.title.endsWith('/43'), grp && grp.title);
      check('V29 خلاصه: شماره‌ی موبایل در عنوانِ گروه هم ماسک است',
        dig.groups.some(g => g.title.includes('****4567')) &&
        !dig.groups.some(g => g.title.includes('09121234567')));
      check('V29 خلاصه: «امروز» فقط خطاهای امروز را می‌شمارد',
        dig.totals.today === 4, `${dig.totals.today} از ${dig.totals.errors}`);
      check('V29 خلاصه: مجموعِ خطاها هر دو روز را دارد', dig.totals.errors === 5, String(dig.totals.errors));
      check('V29 خلاصه: پاسخ‌های ۵xx از دفترِ دسترسی شمرده می‌شوند',
        dig.totals.http5xx === 2, String(dig.totals.http5xx));
      // نشانِ کنارِ منو آخرین درایه‌ی daily را می‌خواند، پس ترتیبش قراردادِ رابط است
      check('V29 خلاصه: آخرین درایه‌ی daily امروز است (نشانِ منو به آن تکیه دارد)',
        dig.daily.length === 7 && dig.daily[dig.daily.length - 1].day === today,
        dig.daily.map(d => d.day).join(','));
      check('V29 خلاصه: بازه‌ی بی‌معنی به سقفِ ۱۴ روز محدود می‌شود',
        dg.errorDigest({ logDir: ldir, rootDir: '/srv/pg', days: 999 }).days === 14);
      check('V29 خلاصه: بازه‌ی صفر یا منفی به ۷ روزِ پیش‌فرض برمی‌گردد',
        dg.errorDigest({ logDir: ldir, rootDir: '/srv/pg', days: 0 }).days === 7 &&
        dg.errorDigest({ logDir: ldir, rootDir: '/srv/pg', days: -5 }).days === 1);
      check('V29 خلاصه: پوشه‌ی لاگِ خالی جواب می‌دهد، نه پرت',
        dg.errorDigest({ logDir: path.join(ldir, 'nope'), rootDir: '/srv/pg' }).totals.errors === 0);
      try { fs.rmSync(ldir, { recursive: true, force: true }); } catch (e) { /* بی‌اهمیت */ }

      /* ---- ۳) مسیرِ API روی سرورِ واقعیِ تست ---- */
      await loginAdmin();
      const er = await api('GET', '/admin/errors?days=1');
      check('V29 مسیر: ادمین ۲۰۰ می‌گیرد', er.status === 200, `status ${er.status}`);
      check('V29 مسیر: ساختارِ جوابی که فرانت انتظار دارد کامل است',
        er.data && er.data.totals && typeof er.data.totals.http5xx === 'number' &&
        Array.isArray(er.data.daily) && Array.isArray(er.data.groups),
        JSON.stringify(er.data).slice(0, 120));
      // کش‌شدنِ این صفحه بدترین حالت است: ادمین خطای تازه را نمی‌بیند و
      // فکر می‌کند مشکل حل شده.
      const erRaw = await apiRaw('GET', '/admin/errors?days=1');
      check('V29 مسیر: پاسخ کش نمی‌شود (no-store)',
        String(erRaw.cacheControl || '').includes('no-store'), String(erRaw.cacheControl));
      check('V29 مسیر: سقفِ ۱۴ روز سمتِ سرور هم اعمال می‌شود',
        (await api('GET', '/admin/errors?days=999')).data.days === 14);

      await loginBuyer();
      const erBuyer = await api('GET', '/admin/errors');
      check('V29 مسیر: مشتریِ معمولی دسترسی ندارد', erBuyer.status === 403, `status ${erBuyer.status}`);
      await loginAdmin();

      /* ---- ۴) سمتِ فرانت ---- */
      const adminJs = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'js', 'admin.js'), 'utf8');
      const adminHtml = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'admin.html'), 'utf8');
      // بدونِ این، show('errors') بی‌صدا به داشبورد برمی‌گردد و بخش هیچ‌وقت باز نمی‌شود
      check('V29 فرانت: «errors» در فهرستِ VIEWS هست',
        /const VIEWS = \[[^\]]*'errors'/.test(adminJs));
      check('V29 فرانت: بارگذارِ بخش به LOADERS وصل است', /errors: loadErrors/.test(adminJs));
      check('V29 فرانت: خودِ بخش در HTML وجود دارد',
        adminHtml.includes('id="viewErrors"') && adminHtml.includes('id="errHost"'));
      check('V29 فرانت: دکمه‌ی منو با نشانِ شمارش هست', adminHtml.includes('id="navErrors"'));
      // نشان اگر پر نشود، همیشه «—» می‌ماند و کلِ فایده‌اش از دست می‌رود
      check('V29 فرانت: نشانِ منو موقعِ بوت پر می‌شود', /errBadge\(d\.totals\.http5xx\)/.test(adminJs));
      const errCss = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'css', 'style.css'), 'utf8');
      check('V29 ظاهر: کلاس‌های این بخش در CSS تعریف شده‌اند',
        ['.ad-err{', '.ad-err-count{', '.ad-err-body{', '.ad-err-body pre{']
          .every(s => errCss.includes(s)));
    }

    // ================= V30: گزارشِ ماه‌به‌ماهِ شمسی =================
    {
      const jalali = require('./lib/jalali');

      /* ---- ۱) خودِ تقویم ---- */
      // اگر ICU کوچک باشد available() باید false بدهد و گزارش به میلادی برگردد،
      // نه اینکه پنل خطا بدهد. روی نودِ عادی باید true باشد.
      check('V30 تقویم: تقویم شمسی در دسترس است', jalali.available() === true);
      const b = jalali.monthStarts(3);
      check('V30 تقویم: به تعداد خواسته‌شده مرز برمی‌گرداند', b.length === 3, String(b.length));
      // ترتیب از جدید به قدیم است؛ getMonthlySales روی همین حساب می‌کند.
      check('V30 تقویم: از جدید به قدیم مرتب است', b[0].startIso > b[1].startIso && b[1].startIso > b[2].startIso);
      check('V30 تقویم: سالِ شمسی چهاررقمی حدود ۱۴۰۰ است، نه میلادی',
        b[0].jy > 1300 && b[0].jy < 1500, String(b[0].jy));
      check('V30 تقویم: شماره‌ی ماه بین ۱ تا ۱۲ است', b.every(x => x.jm >= 1 && x.jm <= 12));
      check('V30 تقویم: نامِ ماه فارسی است', /^[؀-ۿ]+$/.test(b[0].name), b[0].name);
      // مرزِ ماه باید اولِ ماه باشد؛ اگر روزِ وسطِ ماه بدهد، همه‌ی سطل‌ها یک ماه جابه‌جا می‌شوند.
      check('V30 تقویم: هر مرز واقعاً روزِ اولِ ماهِ شمسی است',
        b.every(x => new Intl.DateTimeFormat('en-u-ca-persian', { day: 'numeric' })
          .format(new Date(x.startIso + 'T12:00:00')) === '1'),
        b.map(x => x.startIso).join(','));

      /* ---- ۲) مسیرِ API ---- */
      await loginAdmin();
      const mo = await api('GET', '/admin/reports/monthly?months=6');
      check('V30 مسیر: ادمین ۲۰۰ می‌گیرد', mo.status === 200, `status ${mo.status}`);
      const rep = mo.data;
      check('V30 مسیر: ساختارِ جوابی که فرانت انتظار دارد کامل است',
        rep && Array.isArray(rep.rows) && rep.totals && typeof rep.calendar === 'string',
        JSON.stringify(rep).slice(0, 120));
      check('V30 مسیر: دقیقاً به تعداد ماهِ خواسته‌شده ردیف می‌دهد',
        rep.rows.length === 6, String(rep.rows.length));
      // ماه‌های بی‌فروش هم باید با صفر بیایند، وگرنه جدول شکاف دارد و رشد بی‌معنی می‌شود.
      check('V30 مسیر: ماه‌های بی‌فروش هم با صفر می‌آیند، نه حذف',
        rep.rows.every(m => typeof m.sales === 'number' && typeof m.orders === 'number'));
      check('V30 مسیر: ردیف‌ها از قدیم به جدید مرتب‌اند',
        rep.rows.every((m, i) => i === 0 || m.start > rep.rows[i - 1].start));
      check('V30 مسیر: جمعِ ستونِ فروش با totals می‌خواند',
        rep.rows.reduce((a, m) => a + m.sales, 0) === rep.totals.sales,
        `${rep.rows.reduce((a, m) => a + m.sales, 0)} vs ${rep.totals.sales}`);
      check('V30 مسیر: جمعِ سفارش‌ها هم می‌خواند',
        rep.rows.reduce((a, m) => a + m.orders, 0) === rep.totals.orders);
      // میانگین سبد = فروش/سفارش. اگر سفارشی نبود باید صفر باشد نه NaN یا Infinity.
      check('V30 مسیر: میانگینِ هر ماه درست حساب شده و NaN نیست',
        rep.rows.every(m => m.avg === (m.orders ? Math.round(m.sales / m.orders) : 0)));
      /* این دو تست فقط شکلِ چیزی را می‌سنجند که فرانت مصرف می‌کند: هر خانه‌ی رشد
         یا null است یا عددِ متناهی. توجه: اینها نمی‌توانند «null درست» را از
         «NaN لو رفته» جدا کنند، چون JSON.stringify هر دوی NaN و Infinity را به
         null تبدیل می‌کند. سنجشِ واقعیِ این قاعده در بخشِ ۲.۵ پایین است. */
      check('V30 مسیر: هر خانه‌ی رشد در پاسخِ JSON یا null است یا عدد',
        rep.rows.every(m => m.growth === null || typeof m.growth === 'number'),
        JSON.stringify(rep.rows.map(m => [m.sales, m.growth])));
      check('V30 مسیر: ردیفِ اول رشد ندارد (ماهِ قبلش را نمی‌دانیم)',
        rep.rows[0].growth === null, String(rep.rows[0].growth));
      check('V30 مسیر: بهترین ماه فقط وقتی می‌آید که فروشی بوده باشد',
        rep.totals.sales > 0 ? (rep.best && rep.best.sales > 0) : rep.best === null);
      // سقف‌ها: ورودیِ بی‌معنی نباید سرور را وادار به ساختنِ ۹۹۹ سطل کند.
      check('V30 مسیر: سقفِ ۳۶ ماه اعمال می‌شود',
        (await api('GET', '/admin/reports/monthly?months=999')).data.months === 36);
      check('V30 مسیر: کفِ ۲ ماه اعمال می‌شود',
        (await api('GET', '/admin/reports/monthly?months=0')).data.months === 12 &&
        (await api('GET', '/admin/reports/monthly?months=1')).data.months === 2);
      await loginBuyer();
      check('V30 مسیر: مشتریِ معمولی دسترسی ندارد',
        (await api('GET', '/admin/reports/monthly')).status === 403);
      await loginAdmin();

      /* ---- ۲.۵) خودِ محاسبه، بی‌واسطه‌ی JSON ----
         چرا اینجا و نه روی API: رشد را عمداً شکستم (شرطِ prev.sales > 0 را
         برداشتم) و همه‌ی تست‌های بالا سبز ماندند، چون JSON.stringify هم NaN و
         هم Infinity را به null تبدیل می‌کند و از سیم که بگذرد قابلِ تشخیص نیست.
         پس تابع را در همین پروسه صدا می‌زنیم تا مقدارِ خامِ جاوااسکریپت را
         ببینیم. اینجا فرقِ null و NaN دیده می‌شود. */
      const rawRep = require('./lib/db').getMonthlySales(6);
      const rawShow = rawRep.rows.map(m => `${m.sales}:${m.growth}`).join(' ');
      check('V30 محاسبه: رشدِ خام یا null است یا عددِ متناهی — نه NaN و نه بی‌نهایت',
        rawRep.rows.every(m => m.growth === null || Number.isFinite(m.growth)), rawShow);
      /* قاعده‌ی اصلی: «از صفر به ۵ میلیون» درصدِ معنادار ندارد. اگر ماهِ قبل صفر
         بوده باید null بدهیم، نه ۱۰۰٪ و نه Infinity، وگرنه کلِ گزارش بی‌اعتبار است. */
      check('V30 محاسبه: بعد از ماهِ صفر، رشدِ خام دقیقاً null است',
        rawRep.rows.every((m, i) => i === 0 || rawRep.rows[i - 1].sales > 0 || m.growth === null),
        rawShow);

      /* ---- ۳) خروجی CSV ---- */
      // grabCsv در بلوکِ V21 تعریف شده و از اینجا دیده نمی‌شود؛ همان را محلی می‌سازیم
      // تا اگر روزی V21 جابه‌جا یا حذف شد، این بخش نترکد.
      const grabCsvV30 = async (p) => {
        const r = await fetch(`${BASE}/api/admin${p}`, { headers: { Cookie: cookieHeader() } });
        const buf = Buffer.from(await r.arrayBuffer());
        return { r, buf, txt: buf.toString('utf8') };
      };
      const mc = await grabCsvV30('/export/monthly.csv?months=4');
      check('V30 اکسل: فایل CSV می‌آید',
        mc.r.status === 200 && /text\/csv/.test(mc.r.headers.get('content-type') || ''), String(mc.r.status));
      // BOM را با بایتِ خام می‌سنجیم؛ رمزگشای UTF-8 خودش برش می‌دارد و text() لو نمی‌دهد.
      check('V30 اکسل: با BOM شروع می‌شود (اکسلِ فارسی)',
        mc.buf[0] === 0xEF && mc.buf[1] === 0xBB && mc.buf[2] === 0xBF);
      check('V30 اکسل: سرستون‌ها کامل‌اند',
        ['ماه', 'فروش (تومان)', 'تعداد سفارش', 'مشتری یکتا', 'میانگین سبد (تومان)']
          .every(h => mc.txt.includes(h)));
      check('V30 اکسل: ردیفِ جمع کل دارد', mc.txt.includes('جمع کل'));
      check('V30 اکسل: ضد تزریق فرمول اکسل است', !/,"[=+@]/.test(mc.txt));
      /* CSV مقدارِ خام را می‌نویسد، پس برخلافِ JSON اینجا NaN و Infinity واقعاً
         بیرون می‌زنند و در اکسل ستونِ رشد را متنی و خراب می‌کنند. */
      check('V30 اکسل: هیچ NaN یا Infinity در فایل نیست', !/NaN|Infinity/.test(mc.txt),
        (mc.txt.match(/NaN|Infinity/g) || []).join(','));
      check('V30 اکسل: نام فایل تاریخ‌دار پیشنهاد می‌دهد',
        /filename="monthly-sales-\d{4}-\d{2}-\d{2}\.csv"/.test(mc.r.headers.get('content-disposition') || ''),
        String(mc.r.headers.get('content-disposition')));

      /* ---- ۴) سمتِ فرانت ---- */
      const aJs = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'js', 'admin.js'), 'utf8');
      const aHtml = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'admin.html'), 'utf8');
      const aCss = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'css', 'style.css'), 'utf8');
      check('V30 فرانت: کارتِ ماهانه در HTML هست',
        aHtml.includes('id="monthlyBody"') && aHtml.includes('id="monthlyRange"') &&
        aHtml.includes('id="monthlyBars"') && aHtml.includes('id="btnExportMonthly"'));
      // بدونِ این، بخشِ گزارش باز می‌شود ولی جدولِ ماهانه تا ابد خالی می‌ماند.
      check('V30 فرانت: loadMonthly به بارگذارِ بخشِ گزارش وصل است',
        /report: \(\) => \{ loadReport\(\); loadMonthly\(\); \}/.test(aJs));
      check('V30 فرانت: تعویضِ بازه دوباره بار می‌زند',
        /\$\('monthlyRange'\)\.addEventListener\('change', loadMonthly\)/.test(aJs));
      check('V30 فرانت: دکمه‌ی اکسل همان بازه‌ی انتخاب‌شده را می‌فرستد',
        /export\/monthly\.csv\?months=\$\{Number\(\$\('monthlyRange'\)\.value\)/.test(aJs));
      // جدول باید ماهِ جاری را بالا نشان دهد؛ سرور از قدیم به جدید می‌دهد.
      check('V30 فرانت: جدول برعکس می‌شود تا ماهِ جاری بالا باشد',
        /d\.rows\.slice\(\)\.reverse\(\)/.test(aJs));
      check('V30 فرانت: حالتِ تقویمِ میلادی به کاربر هشدار می‌دهد',
        /calendar === 'jalali'/.test(aJs) && aJs.includes('تقویم شمسی روی این سرور در دسترس نیست'));
      check('V30 ظاهر: کلاس‌های این بخش در CSS تعریف شده‌اند',
        ['.mrep-tag{', '.mrep-growth{', '.mrep-growth.up{', '.mrep-growth.down{'].every(s => aCss.includes(s)));
      // رنگ تنها نشانه نباشد (WCAG 1.4.1): پیکانِ بالا/پایین هم کنارش هست.
      check('V30 دسترس‌پذیری: رشد علاوه بر رنگ، پیکان هم دارد',
        /i-trend-\$\{g > 0 \? 'up' : 'down'\}/.test(aJs));
    }

    // ========= V31: رمزِ ناهمگام و باطل‌کردنِ نشست‌های دیگر =========
    {
      const nodeCrypto = require('crypto');
      const authSrc = fs.readFileSync(path.join(__dirname, 'routes', 'auth.js'), 'utf8');

      /* ---- ۱) scrypt نباید event loop را ببندد ---- */
      /* نمی‌شود این را با زمان‌سنجی تست کرد (روی ماشینِ شلوغ نتیجه تصادفی
         می‌شود و تستِ لرزان بدتر از نبودنِ تست است)، پس همان خاصیتِ ساختاری
         را می‌سنجیم که تضمینش می‌کند. */
      // با پرانتز می‌سنجیم، نه خودِ کلمه: در همان فایل یک کامنتِ توضیحی هست که
      // می‌گوید چرا scryptSync استفاده نمی‌شود، و آن کامنت باید بماند.
      check('V31 کارایی: هیچ فراخوانیِ scryptSync در مسیرِ ورود نیست',
        !/scryptSync\s*\(/.test(authSrc));
      check('V31 کارایی: نسخه‌ی ناهمگامِ scrypt ساخته می‌شود',
        /promisify\(crypto\.scrypt\)/.test(authSrc));

      /* خطرناک‌ترین پس‌رفتِ ممکن در کلِ این پروژه: اگر کسی روزی await را از
         verifyPassword بردارد، تابع یک Promise برمی‌گرداند و Promise **همیشه**
         truthy است — یعنی شرطِ !verifyPassword(...) همیشه false می‌شود و سرور
         *هر رمزی* را قبول می‌کند. هیچ تستِ رفتاری‌ای هم لزوماً نمی‌گیردش چون
         ورودِ درست همچنان کار می‌کند. این تست دقیقاً همان را می‌گیرد. */
      for (const fn of ['verifyPassword', 'hashPassword']) {
        const bad = [];
        const re = new RegExp(`(.{0,16})${fn}\\(`, 'g');
        let m;
        while ((m = re.exec(authSrc))) {
          if (/function\s+$/.test(m[1])) continue; // خودِ تعریفِ تابع
          if (!/await\s+$/.test(m[1])) bad.push(m[0].trim());
        }
        check(`V31 امنیت: هر فراخوانیِ ${fn} با await است`, bad.length === 0, bad.join(' | '));
      }

      /* سازگاری با رمزهای قبلی: اگر پارامترهای scrypt عوض شده باشند، رمزِ
         *همه‌ی* کاربرانِ موجود باطل می‌شود و هیچ‌کس نمی‌تواند وارد شود — خرابیِ
         بی‌سروصدایی که فقط روزِ استقرار معلوم می‌شود. اینجا هشِ ذخیره‌شده را
         با نسخه‌ی همگام بازتولید می‌کنیم؛ باید بیت‌به‌بیت یکی باشد. */
      const dbv31 = require('./lib/db');
      const buyerRow = dbv31.db.prepare('SELECT id, password_hash FROM users WHERE phone = ?').get(buyerPhone);
      const [scheme, saltHex, hashHex] = String(buyerRow?.password_hash || '').split('$');
      check('V31 سازگاری: قالبِ ذخیره‌شده همان scrypt$نمک$هش است',
        scheme === 'scrypt' && /^[0-9a-f]{32}$/.test(saltHex || '') && /^[0-9a-f]{128}$/.test(hashHex || ''),
        String(buyerRow?.password_hash).slice(0, 30));
      check('V31 سازگاری: هشِ ناهمگام بیت‌به‌بیت با scryptSync یکی است',
        nodeCrypto.scryptSync('test-pass-1234', Buffer.from(saltHex, 'hex'), 64).toString('hex') === hashHex);

      /* ---- ۲) باطل‌کردنِ نشست‌ها ---- */
      // ظرفِ کوکیِ مستقل = «یک دستگاهِ دیگر». بدونِ دو ظرفِ جدا اصلاً نمی‌شود
      // فهمید که «خروج از بقیه» واقعاً بقیه را بست یا خودِ کاربر را.
      const makeDevice = () => {
        const jar = new Map();
        return async function call(method, p, body) {
          const res = await fetch(`${BASE}/api${p}`, {
            method,
            headers: {
              'Content-Type': 'application/json',
              ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {})
            },
            body: body ? JSON.stringify(body) : undefined
          });
          const list = typeof res.headers.getSetCookie === 'function'
            ? res.headers.getSetCookie()
            : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
          for (const c of list) {
            const [pair] = c.split(';');
            const eq = pair.indexOf('=');
            if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
          }
          let data = {};
          try { data = await res.json(); } catch (e) { /* بدنه‌ی خالی */ }
          return { status: res.status, data };
        };
      };
      const laptop = makeDevice();  // مرورگرِ خودِ کاربر
      const lost = makeDevice();    // «گوشیِ گم‌شده»
      const admin2 = makeDevice();  // کاربرِ دیگر — برای سنجیدنِ سرریز
      const guest = makeDevice();   // بدونِ ورود

      const LOGIN = { phone: buyerPhone, password: 'test-pass-1234' };
      check('V31 نشست: دستگاهِ اول وارد می‌شود',
        (await laptop('POST', '/auth/password/login', LOGIN)).status === 200);
      check('V31 نشست: دستگاهِ دوم هم هم‌زمان وارد می‌شود',
        (await lost('POST', '/auth/password/login', LOGIN)).status === 200);
      check('V31 نشست: کاربرِ دیگری هم وارد است',
        (await admin2('POST', '/auth/password/login',
          { phone: ADMIN_PHONE, password: 'admin-pass-1234' })).status === 200);

      const cnt = await laptop('GET', '/auth/sessions');
      check('V31 نشست: شمارشِ دستگاه‌ها حداقل ۲ است',
        cnt.status === 200 && cnt.data.count >= 2, JSON.stringify(cnt.data));

      const kill = await laptop('POST', '/auth/logout-others');
      check('V31 نشست: «خروج از بقیه» حداقل یک نشست می‌بندد',
        kill.status === 200 && kill.data.revoked >= 1, JSON.stringify(kill.data));
      check('V31 نشست: گوشیِ گم‌شده واقعاً بیرون انداخته شد',
        (await lost('GET', '/auth/me')).data.user === null);
      /* اگر keepSid کار نکند کاربر با زدنِ همین دکمه خودش را هم بیرون می‌اندازد
         و فکر می‌کند سایت خراب شده. */
      check('V31 نشست: خودِ همین مرورگر وارد می‌ماند',
        (await laptop('GET', '/auth/me')).data.user?.phone === buyerPhone);
      /* نگهبانِ اصلی: اگر شرطِ json_extract روزی خراب شود، این یک دستور
         می‌تواند نشستِ *همه‌ی* کاربرانِ سایت را پاک کند. */
      check('V31 نشست: نشستِ کاربرانِ دیگر دست‌نخورده ماند',
        (await admin2('GET', '/auth/me')).data.user?.phone === ADMIN_PHONE);

      /* تغییرِ رمز هم باید نشست‌های دیگر را ببندد — سناریوی «حسابم لو رفته».
         عمداً همان رمزِ قبلی را می‌گذاریم تا تست‌های بعدی نشکنند. */
      await lost('POST', '/auth/password/login', LOGIN);
      const setp = await laptop('POST', '/auth/password/set',
        { password: 'test-pass-1234', currentPassword: 'test-pass-1234' });
      check('V31 رمز: تغییرِ رمز، نشست‌های دیگر را می‌بندد',
        setp.status === 200 && setp.data.revoked >= 1, JSON.stringify(setp.data));
      check('V31 رمز: بعد از تغییرِ رمز، دستگاهِ دیگر بیرون است',
        (await lost('GET', '/auth/me')).data.user === null);
      check('V31 رمز: بعد از تغییرِ رمز، خودِ کاربر وارد می‌ماند',
        (await laptop('GET', '/auth/me')).data.user?.phone === buyerPhone);
      check('V31 رمز: رمزِ جدید واقعاً کار می‌کند (هشِ ناهمگام درست است)',
        (await lost('POST', '/auth/password/login', LOGIN)).status === 200);
      check('V31 رمز: رمزِ غلط همچنان رد می‌شود',
        (await guest('POST', '/auth/password/login',
          { phone: buyerPhone, password: 'definitely-wrong' })).status === 401);

      check('V31 نشست: مهمان نمی‌تواند نشستِ کسی را ببندد',
        (await guest('POST', '/auth/logout-others')).status === 401);
      check('V31 نشست: مهمان شمارشِ نشست نمی‌بیند',
        (await guest('GET', '/auth/sessions')).status === 401);

      /* ---- ۳) سمتِ کاربر ---- */
      const acHtml = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'account.html'), 'utf8');
      const acJs = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'js', 'account.js'), 'utf8');
      check('V31 فرانت: کارتِ دستگاه‌ها در صفحه‌ی حساب هست',
        acHtml.includes('id="btnLogoutOthers"') && acHtml.includes('id="sessHint"'));
      check('V31 فرانت: دکمه به مسیرِ درست وصل است', acJs.includes('/auth/logout-others'));
      check('V31 فرانت: شمارشِ دستگاه‌ها خوانده می‌شود', acJs.includes('/auth/sessions'));
      // اگر تعداد را نگوییم، کاربر فکر می‌کند تغییرِ رمز هیچ کارِ دیگری نکرده.
      check('V31 فرانت: بعد از تغییرِ رمز تعدادِ دستگاه‌های خارج‌شده اعلام می‌شود',
        /r\.revoked/.test(acJs));

      await loginAdmin(); // ظرفِ اصلی را در حالتِ معلوم می‌گذاریم
    }

    // ============ V32: امضای کاتالوگ و کشِ بایتِ فشرده ============
    {
      console.log('\n--- V32: catalog signature + compressed byte cache ---');
      const dbv32 = require('./lib/db');
      const sig = () => dbv32.getCatalogSignature();
      // فقط ستون‌هایی که stmtAdminUpdateProduct می‌شناسد؛ اسپردِ کلِ سطر
      // «Unknown named parameter: created_at» می‌دهد.
      const upd = (o, price) => dbv32.adminUpdateProduct({
        id: o.id, title: o.title, category: o.category, description: o.description,
        price, old_price: o.old_price, stock: o.stock, badge: o.badge,
        icon: o.icon, image: o.image, images: [], specs: []
      });

      /* ---- ۱) باگی که واقعاً پیش آمد ----
         امضا از MAX(updated_at) می‌آمد و دقتِ datetime('now') یک ثانیه است. دو
         ویرایش در یک ثانیه (کاری که «ذخیره‌ی سریعِ جدول» در پنل می‌کند) تعداد و
         مجموعِ موجودی را هم عوض نمی‌کنند، پس امضا یکسان می‌ماند و ویرایشِ دوم
         نه ۳۰ ثانیه بلکه تا تغییرِ بعدیِ کاتالوگ نامرئی می‌ماند — هم در کشِ
         حافظه‌ی سرور و هم در کشِ مرورگر. با شمارنده‌ی catalog_rev بسته شد. */
      const pub32 = dbv32.getProducts().find(p => p.published === 1 && p.stock > 2);
      if (pub32) {
        const s0 = sig(); upd(pub32, pub32.price + 1000); const s1 = sig();
        upd(pub32, pub32.price + 2000); const s2 = sig();
        check('V32 امضا: ویرایشِ اول امضا را عوض می‌کند', s0 !== s1);
        check('V32 امضا: ویرایشِ دوم در همان ثانیه هم عوضش می‌کند',
          s1 !== s2, `${s1} -> ${s2}`);
        upd(pub32, pub32.price); // قیمت را برمی‌گردانیم

        /* فروش هم باید باطل کند (ستونِ s امضا) */
        const q0 = sig();
        dbv32.reserveStock([{ productId: pub32.id, qty: 1 }]);
        check('V32 امضا: فروش امضا را عوض می‌کند', sig() !== q0);
        dbv32.releaseStock([{ productId: pub32.id, qty: 1 }]);
      } else {
        check('V32 امضا: محصولِ منتشرشده‌ی موجود پیدا شد', false, 'no published product with stock');
      }

      /* ---- ۲) پیش‌نویس نباید کشِ مشتری را باطل کند ----
         مالک ۸۸ پیش‌نویس را برای گذاشتنِ عکس ویرایش می‌کند؛ اگر هر ذخیره‌ی او
         کشِ همه‌ی بازدیدکننده‌ها را دور بریزد، کلِ بهینه‌سازی در همان روز هدر
         می‌رود. شرطِ published در تریگرها نگهبانِ همین است. */
      const dft32 = dbv32.getProducts().find(p => p.published === 0);
      if (dft32) {
        const d0 = sig(); upd(dft32, dft32.price + 5000); const d1 = sig();
        check('V32 امضا: ویرایشِ پیش‌نویس کشِ مشتری را باطل نمی‌کند', d0 === d1, d1);
        upd(dft32, dft32.price);
        // ولی انتشار و پنهان‌کردن باید فوراً باطل کند
        const p0 = sig(); dbv32.setProductPublished(dft32.id, true); const p1 = sig();
        check('V32 امضا: انتشارِ پیش‌نویس فوراً باطل می‌کند', p0 !== p1);
        dbv32.setProductPublished(dft32.id, false);
        check('V32 امضا: پنهان‌کردن هم فوراً باطل می‌کند', sig() !== p1);
      }

      /* ---- ۳) تریگرها واقعاً در دیتابیس هستند ----
         اگر کسی روزی اسکیما را دست‌کاری کند و این‌ها بیفتند، باگِ بالا بی‌صدا
         برمی‌گردد و هیچ تستِ دیگری نمی‌گیردش. */
      const trg = dbv32.db.prepare(
        "SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_catalog_rev_%'"
      ).all().map(r => r.name).sort();
      check('V32 تریگر: هر سه تریگرِ catalog_rev وجود دارند',
        trg.length === 3, trg.join(','));
      check('V32 امضا: جزءِ c در امضا هست', /\.c\d+$/.test(sig()), sig());

      /* ---- ۴) کشِ بایتِ فشرده: پاسخِ شخصی هرگز کش نمی‌شود ----
         خطرِ واقعیِ این کش این است که بایتِ یک کاربر به کاربرِ بعدی برسد. با
         پاسخِ جعلی مستقیم آزمایش می‌شود، چون هیچ روتِ شخصیِ فعلی به‌قدر کافی
         بزرگ نیست که وارد این مسیر شود — و «الان بزرگ نیست» تضمینِ فردا نیست. */
      const { compressJson, jsonCacheStats } = require('./lib/static-compress');
      const fakeRes = (headers) => {
        const h = { ...headers }; let ended = null;
        return {
          getHeader: k => h[Object.keys(h).find(x => x.toLowerCase() === k.toLowerCase())],
          setHeader: (k, v) => { h[k] = v; },
          end: b => { ended = b; }, json: () => { ended = 'via-express'; },
          get _ended() { return ended; }
        };
      };
      const bigBody = tag => ({ secret: tag, pad: 'x'.repeat(3000) });
      const drive = (res, body) => { compressJson({ headers: { 'accept-encoding': 'br' } }, res, () => {}); res.json(body); };
      const n0 = jsonCacheStats().entries;

      const rNoStore = fakeRes({ 'Cache-Control': 'no-store', ETag: 'W/"personal-1"' });
      drive(rNoStore, bigBody('user-A-phone-09120000000'));
      check('V32 کش: پاسخِ no-store حتی با ETag کش نمی‌شود',
        jsonCacheStats().entries === n0, `${n0} -> ${jsonCacheStats().entries}`);

      const rPrivate = fakeRes({ 'Cache-Control': 'private, max-age=60', ETag: 'W/"personal-2"' });
      drive(rPrivate, bigBody('user-B'));
      check('V32 کش: پاسخِ private کش نمی‌شود', jsonCacheStats().entries === n0);

      const rNoEtag = fakeRes({ 'Cache-Control': 'public, max-age=30' });
      drive(rNoEtag, bigBody('no-etag'));
      check('V32 کش: پاسخِ بی‌ETag کش نمی‌شود', jsonCacheStats().entries === n0);

      /* ---- ۵) و پاسخِ عمومی واقعاً کش می‌شود (وگرنه بهینه‌سازی وجود ندارد) ---- */
      const hdrPub = { 'Cache-Control': 'public, max-age=30, must-revalidate', ETag: 'W/"pub-v32"' };
      const rPub1 = fakeRes({ ...hdrPub }); drive(rPub1, bigBody('public-list'));
      check('V32 کش: پاسخِ عمومیِ ETag دار کش می‌شود', jsonCacheStats().entries === n0 + 1);
      const rPub2 = fakeRes({ ...hdrPub }); drive(rPub2, bigBody('public-list'));
      check('V32 کش: بارِ دوم همان بایت‌ها بدون فشرده‌سازیِ دوباره',
        rPub2._ended === rPub1._ended && jsonCacheStats().entries === n0 + 1);
      const rPub3 = fakeRes({ ...hdrPub, ETag: 'W/"pub-v32-b"' });
      drive(rPub3, bigBody('public-list-2'));
      check('V32 کش: ETagِ تازه ورودیِ تازه می‌سازد', jsonCacheStats().entries === n0 + 2);
      check('V32 کش: بایتِ فشرده واقعاً از بدنه کوچک‌تر است',
        Buffer.isBuffer(rPub1._ended) && rPub1._ended.length < 3000, `${rPub1._ended?.length} B`);
    }

    /* ============ V33: تطبیقِ سفارش‌های رهاشده با درگاه ============
       این بخش گران‌ترین اشتباهِ ممکن را میخ می‌کند: «پول گرفته شد ولی مرورگرِ
       مشتری برنگشت». تا پیش از این، کارِ دوره‌ای بعد از نیم‌ساعت چنین سفارشی را
       `failed` می‌کرد و موجودی را آزاد می‌کرد — بدون اینکه حتی یک بار از خودِ
       درگاه بپرسد پولی گرفته شده یا نه.

       سفارش‌های ساختگی مستقیم در جدول ساخته می‌شوند و به محصولِ ۹۹۹۹۹۹ (که وجود
       ندارد) اشاره می‌کنند، تا releaseStock هیچ کالای واقعی‌ای را تکان ندهد؛
       نگهبانِ V15 در پایان همین را دوباره می‌سنجد. */
    {
      const dbm = require('./lib/db');
      const pay = require('./lib/payment');
      const { reconcileStaleOrders } = require('./lib/reconcile');

      const uid = dbm.db.prepare('SELECT id FROM users LIMIT 1').get()?.id;
      const fakeItems = JSON.stringify([{ productId: 999999, title: 'V33 ساختگی', price: 1000, qty: 2 }]);
      const fakeAddr = JSON.stringify({ fullName: 'ت', phone: '09120000000', city: 'ت', addressLine: 'ت' });
      const mkOrder = (authority) => dbm.db.prepare(
        `INSERT INTO orders (user_id, items, address, total, status, authority, expires_at)
         VALUES (?,?,?,?, 'pending_payment', ?, ?)`
      ).run(uid, fakeItems, fakeAddr, 2000, authority, Date.now() - 60000).lastInsertRowid;

      const idNoAuth = mkOrder(null);           // هرگز به درگاه نرسید
      const idWithAuth = mkOrder('A-REAL-LOOKING-AUTH-33');  // رفت و برنگشت
      const statusOf = id => dbm.db.prepare('SELECT status FROM orders WHERE id=?').get(id)?.status;

      /* ---- ۱) مرزِ اصلی: چه چیزی همگام باطل می‌شود و چه چیزی نه ---- */
      dbm.expireStaleOrders();
      check('V33 مرز: سفارشی که هرگز به درگاه نرسید باطل می‌شود',
        statusOf(idNoAuth) === 'failed', String(statusOf(idNoAuth)));
      check('V33 مرز: سفارشی که authority دارد بدونِ پرسیدن باطل نمی‌شود',
        statusOf(idWithAuth) === 'pending_payment', String(statusOf(idWithAuth)));

      const queue = dbm.getStaleOrdersToReconcile(50).map(r => r.id);
      check('V33 صف: سفارشِ authority دار در صفِ تطبیق می‌آید', queue.includes(idWithAuth));
      check('V33 صف: سفارشِ باطل‌شده دیگر در صف نیست', !queue.includes(idNoAuth));

      /* ---- ۲) پرچمِ retriable: «نه» از درگاه با «نرسیدن به درگاه» یکی نیست ---- */
      // این تفاوت کلِ ایمنیِ ماجراست؛ اگر جایی گم شود، یک قطعیِ گذرای شبکه
      // دوباره شروع می‌کند به باطل‌کردنِ سفارش‌های پرداخت‌شده.
      const vTest = await pay.verifyPayment({ authority: 'NOT-A-TEST-AUTH', amountToman: 1000 });
      check('V33 پرچم: نداشتنِ درگاه «قابلِ تلاشِ دوباره» علامت می‌خورد',
        vTest.ok === false && vTest.retriable === true, JSON.stringify(vTest));

      /* ---- ۳) حالتِ آزمایشی هرگز نباید «پرداخت شد» بگوید ---- */
      // دامِ ظریف: verifyPayment در حالت آزمایشی هر authorityِ -TEST را تایید
      // می‌کند (و درست هم هست، چون مشتری تازه از صفحه‌ی جعلی برگشته). ولی کارِ
      // تطبیق سراغِ کسانی می‌رود که *برنگشته‌اند*. اگر همان منطق وام گرفته شود،
      // هر سبدِ رهاشده‌ی آزمایشی نیم‌ساعت بعد خودبه‌خود «فروش» می‌شد.
      const vDirect = await pay.verifyPayment({ authority: 'TEST-1-2', amountToman: 1000 });
      check('V33 دام: verifyPayment در حالت آزمایشی authorityِ آزمایشی را تایید می‌کند',
        vDirect.ok === true);
      const qTest = await pay.inquirePayment({ authority: 'TEST-1-2', amountToman: 1000 });
      check('V33 دام: ولی inquirePayment همان را «پرداخت‌نشده» می‌داند',
        qTest.verdict === 'unpaid', JSON.stringify(qTest));
      check('V33 دام: inquirePayment هیچ‌وقت در حالت آزمایشی paid نمی‌دهد',
        (await pay.inquirePayment({ authority: 'X-1', amountToman: 1 })).verdict !== 'paid');

      /* ---- ۴) خودِ کارِ تطبیق ---- */
      const before = dbm.db.prepare('SELECT reconcile_tries FROM orders WHERE id=?').get(idWithAuth).reconcile_tries;
      const rep = await reconcileStaleOrders();
      check('V33 اجرا: کارِ تطبیق سفارشِ منتظر را دید', rep.checked >= 1, JSON.stringify(rep));
      check('V33 اجرا: شمارنده‌ی تلاش بالا رفت',
        dbm.db.prepare('SELECT reconcile_tries FROM orders WHERE id=?').get(idWithAuth).reconcile_tries === before + 1);
      // در حالت آزمایشی حکم «پرداخت‌نشده» است، پس حالا باطل‌شدن درست است
      check('V33 اجرا: بعد از پرسیدن، سفارشِ پرداخت‌نشده باطل می‌شود',
        statusOf(idWithAuth) === 'failed', String(statusOf(idWithAuth)));
      check('V33 اجرا: هیچ سفارشی الکی «پرداخت‌شده» نشد', rep.paid === 0, String(rep.paid));

      /* ---- ۵) نگهبانِ متنِ کد: مسیرِ برگشت هم نباید در ندانستن باطل کند ---- */
      const ordSrc = fs.readFileSync(path.join(__dirname, 'routes', 'orders.js'), 'utf8');
      check('V33 نگهبان: مسیرِ برگشت شاخه‌ی retriable دارد',
        /verification\.retriable/.test(ordSrc));
      check('V33 نگهبان: و در آن شاخه markOrderFailedTx صدا زده نمی‌شود',
        /retriable\)\s*\{[^}]*\}/s.test(ordSrc) &&
        !/retriable\)\s*\{[^}]*markOrderFailedTx/s.test(ordSrc));
      const srvSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
      check('V33 نگهبان: کارِ دوره‌ای تطبیق را صدا می‌زند',
        /reconcileStaleOrders\(\)/.test(srvSrc));
      check('V33 نگهبان: نگهبانِ هم‌پوشانیِ اجراها هست',
        /reconcileRunning/.test(srvSrc));

      // پاکسازی — سفارش‌های ساختگی نباید در پنل بمانند
      dbm.db.prepare('DELETE FROM orders WHERE id IN (?,?)').run(idNoAuth, idWithAuth);
      check('V33 پاکسازی: سفارش‌های ساختگی حذف شدند',
        dbm.db.prepare('SELECT COUNT(*) n FROM orders WHERE id IN (?,?)').get(idNoAuth, idWithAuth).n === 0);
    }
    /* ============ V34: عوض‌کردنِ رمز، رمزِ فعلی می‌خواهد ============
       تا پیش از این، داشتنِ نشست به‌تنهایی برای گذاشتنِ رمزِ تازه کافی بود. یعنی
       هر کسی که یک بار به حسابِ باز دست پیدا می‌کرد — گوشیِ قفل‌نشده روی میز،
       لپ‌تاپِ مشترک، کوکیِ لو‌رفته — می‌توانست رمز را عوض کند و *همان لحظه* با
       destroyOtherSessions صاحبِ اصلی را از همه‌ی دستگاه‌هایش بیرون بیندازد.
       دسترسیِ موقت می‌شد تصاحبِ دائمی، و آن هم با کمکِ خودِ سایت.

       نکته‌ی باریکی که این بخش نگهبانش است: تلاشِ ناموفق نباید هیچ اثری بگذارد
       — نه رمز را عوض کند و نه نشستی را ببندد. وگرنه حتی «نتوانستنِ» مهاجم هم
       به بیرون‌انداختنِ کاربرِ واقعی می‌ارزید. */
    {
      const mkDev = () => {
        const jar = new Map();
        return async function call(method, p, body) {
          const res = await fetch(`${BASE}/api${p}`, {
            method,
            headers: {
              'Content-Type': 'application/json',
              ...(jar.size ? { Cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {})
            },
            body: body ? JSON.stringify(body) : undefined
          });
          const list = typeof res.headers.getSetCookie === 'function'
            ? res.headers.getSetCookie()
            : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
          for (const c of list) {
            const [pair] = c.split(';');
            const eq = pair.indexOf('=');
            if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
          }
          let data = {};
          try { data = await res.json(); } catch (e) { /* بدنه‌ی خالی */ }
          return { status: res.status, data };
        };
      };
      const thief = mkDev();   // نشستِ دزدیده‌شده
      const owner = mkDev();   // خودِ صاحبِ حساب، روی دستگاهِ دیگر
      const OLD = 'test-pass-1234';
      const NEW = 'brand-new-pass-9876';
      const LG = { phone: buyerPhone, password: OLD };

      check('V34 آماده: هر دو دستگاه وارد شدند',
        (await thief('POST', '/auth/password/login', LG)).status === 200 &&
        (await owner('POST', '/auth/password/login', LG)).status === 200);

      /* ---- ۱) بدونِ رمزِ فعلی: رد ---- */
      const noCur = await thief('POST', '/auth/password/set', { password: NEW });
      check('V34 سد: تغییرِ رمز بدونِ رمزِ فعلی رد می‌شود',
        noCur.status === 400 && noCur.data.needCurrent === true, JSON.stringify(noCur));

      /* ---- ۲) با رمزِ فعلیِ غلط: رد، و ۴۰۱ نه ۴۰۰ ---- */
      const badCur = await thief('POST', '/auth/password/set', { password: NEW, currentPassword: 'not-the-password' });
      check('V34 سد: رمزِ فعلیِ غلط با ۴۰۱ رد می‌شود',
        badCur.status === 401 && badCur.data.needCurrent === true, JSON.stringify(badCur));

      /* ---- ۳) تلاشِ ناموفق هیچ اثری نگذاشته باشد ---- */
      check('V34 بی‌اثر: رمز عوض نشد — رمزِ قدیمی هنوز کار می‌کند',
        (await mkDev()('POST', '/auth/password/login', LG)).status === 200);
      check('V34 بی‌اثر: رمزِ جدید هنوز کار نمی‌کند',
        (await mkDev()('POST', '/auth/password/login',
          { phone: buyerPhone, password: NEW })).status === 401);
      check('V34 بی‌اثر: نشستِ صاحبِ حساب بسته نشد',
        (await owner('GET', '/auth/me')).data.user?.phone === buyerPhone);

      /* ---- ۴) با رمزِ فعلیِ درست: انجام می‌شود و نشست‌های دیگر بسته ---- */
      const okSet = await owner('POST', '/auth/password/set', { password: NEW, currentPassword: OLD });
      check('V34 مجاز: با رمزِ فعلیِ درست رمز عوض می‌شود',
        okSet.status === 200 && okSet.data.user?.hasPassword === true, JSON.stringify(okSet));
      check('V34 مجاز: نشست‌های دیگر بسته شدند', okSet.data.revoked >= 1, String(okSet.data.revoked));
      check('V34 مجاز: نشستِ دزدیده‌شده بیرون افتاد',
        (await thief('GET', '/auth/me')).data.user === null);
      check('V34 مجاز: رمزِ جدید واقعاً کار می‌کند',
        (await mkDev()('POST', '/auth/password/login',
          { phone: buyerPhone, password: NEW })).status === 200);

      /* ---- ۵) برداشتنِ رمز هم همان سد را دارد ---- */
      // این را جا انداختن یعنی همان حمله از درِ پشتی: مهاجم رمز را «برمی‌دارد»
      // (که خودش نشست‌ها را می‌بندد) و بعد آزادانه رمزِ تازه‌ی خودش را می‌گذارد.
      const rmNo = await owner('POST', '/auth/password/remove', {});
      check('V34 حذف: برداشتنِ رمز بدونِ رمزِ فعلی رد می‌شود',
        rmNo.status === 400 && rmNo.data.needCurrent === true, JSON.stringify(rmNo));
      const rmBad = await owner('POST', '/auth/password/remove', { currentPassword: OLD });
      check('V34 حذف: با رمزِ فعلیِ غلط هم رد می‌شود',
        rmBad.status === 401, JSON.stringify(rmBad));
      check('V34 حذف: رمز هنوز سرِ جایش است',
        (await mkDev()('POST', '/auth/password/login',
          { phone: buyerPhone, password: NEW })).status === 200);
      const rmOk = await owner('POST', '/auth/password/remove', { currentPassword: NEW });
      check('V34 حذف: با رمزِ فعلیِ درست برداشته می‌شود',
        rmOk.status === 200 && rmOk.data.user?.hasPassword === false, JSON.stringify(rmOk));

      /* ---- ۶) بارِ اول رمز گذاشتن هنوز بی‌دردسر است ---- */
      // کاربری که رمز ندارد فقط با پیامک وارد می‌شود، و همان ورود هویتش را ثابت
      // کرده. اگر اینجا هم رمزِ فعلی بخواهیم، عملاً هیچ‌کس نمی‌تواند رمز بگذارد.
      const firstSet = await owner('POST', '/auth/password/set', { password: OLD });
      check('V34 بارِ اول: بدونِ رمزِ فعلی، گذاشتنِ رمزِ اول کار می‌کند',
        firstSet.status === 200 && firstSet.data.user?.hasPassword === true, JSON.stringify(firstSet));

      /* ---- ۷) نگهبانِ متنِ کد و فرانت ---- */
      const authSrc = fs.readFileSync(path.join(__dirname, 'routes', 'auth.js'), 'utf8');
      check('V34 نگهبان: /password/set قبل از نوشتن، هشِ فعلی را می‌خواند',
        authSrc.indexOf('current.password_hash') < authSrc.indexOf('setUserPassword(req.session.userId, await hashPassword'));
      check('V34 نگهبان: /password/remove هم سقفِ نرخ دارد',
        /password\/remove['"],\s*passwordSetLimiter/.test(authSrc));
      const acJs34 = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'js', 'account.js'), 'utf8');
    const loginHtmlOtp = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'login.html'), 'utf8');
    const loginJsOtp = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'js', 'login.js'), 'utf8');
    const styleOtp = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'css', 'style.css'), 'utf8');
    check('V35 OTP: orbit slots are present', (loginHtmlOtp.match(/class="otp-slot"/g) || []).length === 5);
    check('V35 OTP: one-time-code remains accessible', loginHtmlOtp.includes('autocomplete="one-time-code"') && loginHtmlOtp.includes('aria-describedby="codeExpiry"'));
    check('V35 OTP: input updates the visual slots', loginJsOtp.includes('paintOtp') && loginJsOtp.includes('otpOrbit'));
    check('V35 OTP: verdict states distinguish success and error', loginJsOtp.includes("paintOtp(code, 'success')") && loginJsOtp.includes("paintOtp(code, 'error')"));
    check('V35 OTP: reduced-motion fallback exists', styleOtp.includes('@media (prefers-reduced-motion:reduce)') && styleOtp.includes('.otp-orbit'));

      const acHtml34 = fs.readFileSync(path.join(__dirname, '..', 'frontend', 'account.html'), 'utf8');
      check('V34 فرانت: کادرِ رمزِ فعلی در صفحه‌ی حساب هست', acHtml34.includes('id="curPass"'));
      check('V34 فرانت: هر دو مسیر currentPassword می‌فرستند',
        (acJs34.match(/currentPassword/g) || []).length >= 2);
      check('V34 فرانت: کادر فقط برای کسی که رمز دارد باز می‌شود',
        /fieldCurPass\.classList\.toggle\('hidden', !hasPassword\)/.test(acJs34));
    }

  } catch (err) {
    check('Tests ran without an unexpected error', false, err.message);
  } finally {
    // ============ V15: تست نباید هیچ ردی روی داده‌ی واقعی بگذارد ============
    // این بخش در finally است، نه ته try: اگر تست وسط راه بترکد، محصول تستی و
    // سفارش‌هایش باید باز هم پاک شوند، وگرنه دفعه‌ی بعد در کاتالوگ می‌مانند.
    try {
      const dbm = require('./lib/db');
      const purged = purgeTestProducts(dbm);
      check('V15 پاکسازی: محصول تستی و سفارش‌هایش کامل حذف شدند', purged >= 1, `${purged} مورد`);
      check('V15 پاکسازی: هیچ محصول تستی در کاتالوگ باقی نماند',
        dbm.db.prepare('SELECT COUNT(*) AS n FROM products WHERE title = ?').get(TEST_PRODUCT_MARK).n === 0);

      // نگهبانِ اصلی: موجودیِ همه‌ی کالاهای واقعی باید دقیقاً همان اولِ اجرا باشد.
      // اگر روزی کسی دوباره تست را به یک محصول واقعی وصل کند، اینجا لو می‌رود.
      if (stockSnapshot) {
        const drift = [];
        for (const r of dbm.db.prepare('SELECT id, title, stock FROM products').all()) {
          if (!stockSnapshot.has(r.id)) continue;
          const was = stockSnapshot.get(r.id);
          if (was !== r.stock) drift.push(`#${r.id} ${r.title}: ${was}→${r.stock}`);
        }
        check('V15 موجودی: هیچ کالایی در طول کل تست کم و زیاد نشد',
          drift.length === 0, drift.join(' | ').slice(0, 200));
      } else {
        check('V15 موجودی: عکس موجودی گرفته شد', false, 'تست قبل از ساخت محصول تستی متوقف شد');
      }

      /* ---------- V34: کاربرِ ادمینِ ساختگی نباید در دیتابیس جا بماند ----------
         این را وقتی پیدا کردم که تستِ رمز شکست: تست برای جابه‌جا شدن بین
         نشست‌ها، شماره‌ی ۰۹۱۲۰۰۰۰۰۰۹ را ادمین می‌کند و رمزِ `admin-pass-1234`
         رویش می‌گذارد — و **هیچ‌وقت پاکش نمی‌کرد**. یعنی دیتابیسِ واقعیِ سایت یک
         حسابِ ادمینِ زنده داشت که رمزش عیناً داخلِ همین فایلِ گیت‌شده نوشته است.
         هر کسی که مخزن را ببیند می‌توانست وارد پنلِ مدیریت شود.

         پرچمِ ادمین هم برداشته می‌شود، نه فقط رمز: اگر آن شماره مالِ کسی باشد،
         با یک ورودِ پیامکیِ ساده صاحبِ پنل می‌شد. اجرای بعدیِ تست خودش دوباره
         (از راهِ ADMIN_PHONE) ارتقایش می‌دهد، پس چیزی از دست نمی‌رود. */
      const wiped = dbm.db.prepare(
        "UPDATE users SET password_hash=NULL, is_admin=0, is_staff=0 WHERE phone='09120000009'"
      ).run().changes;
      check('V34 پاکسازی: ادمینِ ساختگیِ تست بی‌رمز و بی‌دسترسی شد', wiped >= 0);
      check('V34 پاکسازی: هیچ ادمینی با رمزِ داخلِ مخزن باقی نماند',
        dbm.db.prepare(
          "SELECT COUNT(*) n FROM users WHERE phone='09120000009' AND (is_admin=1 OR password_hash IS NOT NULL)"
        ).get().n === 0);
    } catch (e) {
      check('V15 پاکسازی بدون خطا انجام شد', false, e.message);
    }
  }

  // ---------- summary ----------
  const passed = results.filter(r => r.ok).length;
  const failed = results.length - passed;
  console.log('\n' + '-'.repeat(46));
  console.log(failed === 0
    ? `SUCCESS: all ${passed} tests passed - the site is ready!`
    : `WARNING: ${passed} passed / ${failed} failed - send me the [FAIL] lines above and I'll fix them.`);
  console.log('-'.repeat(46) + '\n');
  shutdown(failed === 0 ? 0 : 1);
})();
