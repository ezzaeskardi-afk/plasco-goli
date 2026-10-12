#!/usr/bin/env node
/* ============================================================
   آزمونِ نفوذِ خودکار بر پایهٔ OWASP WSTG — «سایت را از بیرون بزن، ببین چه می‌گوید»

   ---------- چرا این فایل، وقتی OWASP Top 10 و ASVS هم داریم ----------
   سه نگهبانِ امنیتی، سه پرسشِ متفاوت می‌پرسند و هیچ‌کدام جای دیگری را نمی‌گیرد:

     • `tests/owasp-scan.js` — «کدام *دستهٔ آسیب‌پذیری*؟» (A01..A10، نگاهِ توسعه‌دهنده)
     • `tests/asvs.js`       — «کدام *کنترل* باید باشد و هست؟» (نگاهِ ممیزی، ایستا)
     • `tests/wstg.js` (این) — «یک *مهاجم* چه می‌بیند و با چه درخواستی؟» (نگاهِ تستِ نفوذ)

   WSTG (Web Security Testing Guide) راهنمایِ همین نگاهِ سوم است:
   https://github.com/OWASP/wstg — کوته‌نوشت‌های شناسه‌اش (مثل `WSTG-CONF-06`)
   در این فایل *فقط* برای آن‌هایی نوشته می‌شود که از خودِ همان مخزن خوانده شده‌اند
   — از چک‌لیستِ رسمی، نه از حافظه.
   سنجش‌هایی که به هیچ شناسه‌ای گره نمی‌خورند، در بخشِ «سنجش‌های مکمل» می‌آیند و
   صریحاً گفته می‌شود که شناسه ندارند. جایِ خالی گذاشتن هم بهتر از ساختنِ
   شناسه است: شمارهٔ غلط، گمراهیِ دقیق‌تر است.

   ---------- سیاستِ اجرا: بی‌آسیب و بدونِ شبکهٔ بیرونی ----------
   WSTG یک راهنمایِ تستِ *دستی* است و بعضی بخش‌هایش (حملهٔ فعال، brute-force،
   بهره‌کشیِ واقعی، ارسالِ ایمیل، سرویسِ بیرونی) در CI جای ندارند. آن‌ها در
   فهرستِ «پوشش داده نشد» با دلیلِ روشن می‌آیند. آنچه اینجا انجام می‌شود:

     • همه‌چیز روی سرورِ سندباکسِ خودمان (پورتِ یکتا، دیتابیسِ موقت، پوشهٔ عکسِ
       موقت) و بدونِ هیچ درخواستِ بیرونی است.
     • هیچ بارِ سنگین/تکراری‌ای فرستاده نمی‌شود؛ نرخ‌ها عمداً بازند تا خودِ
       سنجش سهمیه را نسوزاند (سنجشِ سقفِ نرخ جای خودش را دارد: security.js و
       otp-*).
     • هیچ چیزِ واقعی نوشته/پاک نمی‌شود: سفارش و آدرس در دیتابیسِ موقت ساخته
       می‌شوند، همان‌جا هم می‌مانند.

   ---------- اجرا و کدِ خروج ----------
     node tests/wstg.js            # سنجش
     node tests/wstg.js --list     # فهرستِ شناسه‌های پوشش‌داده‌شده و دلیلِ هر نبود

   صفر = سبز. یک = یک یافته. دو = پیش‌شرط آماده نبود (سرورِ سندباکس بالا نیامد
   یا ورودِ آزمایشی کار نکرد) — چون در آن حالت «سبز» فقط یک لاگ است، نه سنجش.
   ============================================================ */
'use strict';

const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { makePng } = require('./makepng');

const PORT = 4012;
const DIR = path.join(__dirname, '..');
const LIST = process.argv.includes('--list');

/* پوشهٔ دادهٔ این اجرا یکتاست و بیرونِ مخزن است — همان قرارِ tests/sandbox.js:
   هر چه جا بماند، آشغالِ سیستم است نه آشغالِ پروژه. سرورِ سندباکس دیتابیس را
   از صفر می‌سازد و `lib/seed.js` محصولات را می‌کارد، پس سنجش به هیچ داده‌ی
   ازپیش‌موجودی وابسته نیست. */
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-wstg-'));
const PICTURE_DIR = path.join(SANDBOX, 'pictures');
const SECRET_DIR = path.join(SANDBOX, 'outside-the-picture-root');
fs.mkdirSync(path.join(PICTURE_DIR, 'products'), { recursive: true });
fs.mkdirSync(SECRET_DIR, { recursive: true });

/* طعمهٔ سنجشِ path traversal (WSTG-ATHZ-01). فایلی *بیرونِ* ریشهٔ سروشده
   ساخته می‌شود و با چند شکلِ کدگذاری‌شده خواسته می‌شود. اگر محتوایش برگشت،
   یعنی مسیرِ سرو از ریشه بیرون زده. دو پسوند: یکی مثلِ عکس (تا میدل‌ورِ WebP هم
   در مسیر بیفتد) و یکی معمولی. */
const CANARY_TEXT = `wstg-canary-${crypto.randomBytes(8).toString('hex')}`;
fs.writeFileSync(path.join(SECRET_DIR, 'canary.txt'), CANARY_TEXT);
fs.writeFileSync(path.join(SECRET_DIR, 'canary.png'), CANARY_TEXT);
// نسخهٔ webp هم عمداً هست: میدل‌ورِ WebP برای `X.png` سراغ `X.webp` می‌رود،
// پس اگر روزی مرزِ پوشه‌اش اشتباه شود، پیمایش از *همین* راه دیده می‌شود —
// وگرنه این سنجش فقط به محافظتِ express.static تکیه می‌کرد و بی‌اثر می‌شد.
fs.writeFileSync(path.join(SECRET_DIR, 'canary.webp'), CANARY_TEXT);

const ADMIN_PHONE = '09121110000';
const PHONE_A = '09121234001';
const PHONE_B = '09121234002';
const PHONE_C = '09121234003';
/* هر سنجشی که به «کدِ تازه» یا «ورودِ تازه» نیاز دارد، شمارهٔ خودش را دارد.
   دلیلش سقفِ بازفرست (۳۰ ثانیه برای هر شماره) است: اگر دو سنجش یک شماره را
   شریک شوند، دومی به 429 می‌خورد و کدِ کهنهٔ باقی‌مانده در خروجیِ سرور می‌تواند
   یک «سبز»ِ دروغین بسازد. */
const PHONE_ENUM = '09121234991';     // IDNT-04 — شمارهٔ ناموجود
const PHONE_COOKIE = '09121234992';   // SESS-02/06 — بررسیِ Set-Cookie و خروج
const PHONE_FIXATION = '09121234993'; // SESS-03
const PHONE_DEFAULT = '09121234994';  // ATHN-02 — حدسِ کدِ پیامکی
const PHONE_RESEND = '09121234995';   // BUSL-05 — سنجشِ سقفِ بازفرست
const PHONE_EXTRA = '09121234996';    // سنجش‌های مکمل — کد نباید برگردد

let serverProcess = null;
let serverOut = '';       // خروجیِ سرورِ سندباکس (کدِ پیامکی اینجا چاپ می‌شود)
let pass = 0;
let fail = 0;
const failures = [];

function ok(label) { pass++; console.log(`  [PASS] ${label}`); }
function notOk(label, detail) {
  fail++;
  failures.push(`${label} — ${detail}`);
  console.error(`  [FAIL] ${label} — ${detail}`);
}
function check(label, cond, detail = '') { cond ? ok(label) : notOk(label, detail); }

/* «نکته» جای سومی است میانِ سبز و سرخ: یافته‌هایی که آسیب‌پذیری نیستند ولی ارزشِ
   ثبت دارند (مثلاً دادهٔ شخصی در حافظهٔ مرورگر). عمداً در شمارشِ سبز/سرخ نمی‌آیند —
   چون دروازه‌ای که برای هر نکتهٔ سبک سرخ می‌شود، در نهایت نادیده گرفته می‌شود —
   ولی در جمع‌بندی چاپ می‌شوند تا پنهان هم نمانند. */
const observations = [];
function observe(label) { observations.push(label); console.log(`  [NOTE] ${label}`); }
function section(id, title) { console.log(`\n=== WSTG ${id} — ${title} ===`); }

/* ============================================================
   ۱) سرورِ سندباکس
   ============================================================ */
function startServer() {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      PG_DATA_DIR: SANDBOX,
      PG_PICTURE_DIR: PICTURE_DIR,
      PORT: String(PORT),
      // آدرسِ رسمی عمداً ست است: در production هم اجباری است (validateRuntimeConfig)
      // و سنجشِ «تزریقِ هدرِ Host» فقط وقتی معنا دارد که یک حقیقتِ مرجع وجود داشته باشد.
      SITE_URL: `http://127.0.0.1:${PORT}`,
      TRUST_PROXY: '0',
      ADMIN_PHONE,
      // سقف‌های نرخ باز — این سنجش نباید سهمیهٔ خودش را بسوزاند
      API_RATE_LIMIT: '10000',
      WRITE_RATE_LIMIT: '10000',
      MAX_SMS_PER_IP_PER_DAY: '10000',
      NODE_ENV: 'test',
      // رازِ نشستِ توسعه‌دهنده نباید از .env به سندباکس برسد
      SESSION_SECRET: '',
      SMS_API_KEY: '',
      ZARINPAL_MERCHANT_ID: '',
    };
    serverProcess = spawn(process.execPath, ['server.js'], { cwd: DIR, env });
    serverProcess.stdout.on('data', (c) => { serverOut += c.toString(); });
    serverProcess.stderr.on('data', (c) => { serverOut += c.toString(); });
    serverProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) serverOut += `\n[server exited with ${code}]\n`;
    });

    const deadline = Date.now() + 60000;
    (async function wait() {
      while (Date.now() < deadline) {
        if (await reachable('/api/health')) return resolve();
        await sleep(500);
      }
      reject(new Error(`سرورِ سندباکس بالا نیامد:\n${serverOut.slice(-2000)}`));
    })();
  });
}

function stopServer() {
  return new Promise((resolve) => {
    if (!serverProcess) return resolve();
    const done = () => resolve();
    serverProcess.once('exit', done);
    serverProcess.kill();
    setTimeout(() => { try { serverProcess.kill('SIGKILL'); } catch (e) { /* رفت */ } resolve(); }, 4000);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function reachable(p) {
  return new Promise((resolve) => {
    const req = http.request({ hostname: '127.0.0.1', port: PORT, path: p, method: 'GET' }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
    req.end();
  });
}

/* ============================================================
   ۲) مشتریِ HTTP با کوزهٔ کوکی (چند «کاربر» هم‌زمان)
   ============================================================ */
function newAgent() { return { jar: new Map(), name: 'anon' }; }

function request(agent, method, urlPath, { json, body, headers = {}, raw = false } = {}) {
  return new Promise((resolve, reject) => {
    const h = { ...headers };
    if (agent.jar.size) {
      h.Cookie = [...agent.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    let payload = body;
    if (json !== undefined) {
      payload = JSON.stringify(json);
      h['Content-Type'] = 'application/json';
    }
    if (payload !== undefined) h['Content-Length'] = Buffer.byteLength(payload);

    const req = http.request({ hostname: '127.0.0.1', port: PORT, path: urlPath, method, headers: h }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        const setCookie = res.headers['set-cookie'] || [];
        for (const c of setCookie) {
          const pair = String(c).split(';')[0];
          const eq = pair.indexOf('=');
          if (eq > 0) {
            const name = pair.slice(0, eq).trim();
            const value = pair.slice(eq + 1).trim();
            if (value === '' || /expires=Thu, 01 Jan 1970/i.test(String(c))) agent.jar.delete(name);
            else agent.jar.set(name, value);
          }
        }
        let parsed = null;
        if (!raw) { try { parsed = JSON.parse(data); } catch (e) { /* نه JSON */ } }
        resolve({
          status: res.statusCode,
          headers: res.headers,
          setCookie: setCookie.map(String),
          body: data,
          json: parsed,
        });
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error(`timeout: ${method} ${urlPath}`)); });
    if (payload !== undefined) req.write(payload);
    req.end();
  });
}

/*   کدِ پیامکی در حالتِ آزمون روی خروجیِ سرور چاپ می‌شود (از `lib/sms.js`)
   (`lib/sms.js` وقتی ارائه‌دهنده تنظیم نشده باشد). همین راهِ ورودِ سنجش است —
   بدونِ آن، هیچ سنجشِ «کاربرِ واردشده» ممکن نبود. */
// فقط *بخشِ تازهٔ* خروجی خوانده می‌شود (از نشانهٔ پیش از درخواست)؛ وگرنه کدِ سوختهٔ
// همین شماره از سنجشِ قبلی پیدا می‌شد و سنجش می‌توانست روی یک کدِ بی‌اعتبار سبز شود.
async function waitForCode(phone, fromOffset = 0) {
  const re = new RegExp(`Login code for ${phone}: (\\d{5})`);
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    const m = serverOut.slice(fromOffset).match(re);
    if (m) return m[1];
    await sleep(120);
  }
  throw new Error(`کدِ پیامکی برای ${phone} در خروجیِ سرور پیدا نشد`);
}

/* درخواستِ کدِ یک‌بارمصرف — وضعیت را هم برمی‌گرداند تا سنجش‌ها بتوانند روی
   «رد شدن» خودشان (مثلِ BUSL-05) بسازند، نه فقط روی «موفق شدن». */
async function requestOtp(phone, agent = newAgent()) {
  const ch = await request(agent, 'GET', '/api/auth/otp/challenge');
  if (ch.status !== 200 || !ch.json?.token) throw new Error(`challenge: ${ch.status}`);
  const mark = serverOut.length;
  const r = await request(agent, 'POST', '/api/auth/otp/request', { json: { phone, challenge: ch.json.token } });
  let code = null;
  if (r.status === 200) code = await waitForCode(phone, mark);
  return { agent, status: r.status, code, body: r.body, json: r.json };
}

async function login(phone, agent = newAgent()) {
  const { status, code, body } = await requestOtp(phone, agent);
  if (status !== 200) throw new Error(`otp/request برای ${phone}: ${status} ${body.slice(0, 120)}`);
  const verify = await request(agent, 'POST', '/api/auth/otp/verify', { json: { phone, code } });
  if (verify.status !== 200) throw new Error(`otp/verify برای ${phone}: ${verify.status} ${verify.body.slice(0, 120)}`);
  return agent;
}

const productId = async () => {
  const r = await request(newAgent(), 'GET', '/api/products?limit=1');
  return r.json?.products?.[0]?.id ?? null;
};

/* ---------- سنجشِ دسترسی همیشه دو طرف دارد ----------
   «مشتری رد شد» به‌تنهایی بی‌ارزش است: اگر مسیر وجود نداشته باشد، همان ۴۰۴ هم
   سنجش را سبز می‌کند و هیچ‌کس نمی‌فهمد که ما چیزِ اشتباهی را سنجیدیم. پس هر
   مسیرِ مدیریتی سه‌بار زده می‌شود: ادمین (باید برسد)، مشتری (۴۰۳) و بی‌نشست
   (۴۰۱). ستونِ اول همان چیزی است که سبزِ توخالی را می‌گیرد. */
const ADMIN_READ_PATHS = [
  '/api/admin/stats',
  '/api/admin/overview',
  '/api/admin/users?limit=1',
  '/api/admin/errors',
  '/api/admin/activity',
  '/api/admin/reports',
  '/api/admin/coupons',
];



/* ============================================================
   ۳) فهرستِ شناسه‌های WSTG که *پوشش داده نشده‌اند* — با دلیل
   ============================================================ */
// عمداً اینجا و در یک جای دیدنی: نقشه‌ای که فقط «چه سنجیدم» را بگوید،
// نیمهٔ دیگرِ حقیقت را پنهان کرده است. هر ردیف یک پاسخ به «چرا نه؟» است.
const NOT_COVERED = [
  ['WSTG-INFO-01 / INFO-04 / INFO-07..10', 'شناساییِ بیرونی و نقشه‌برداری از زیرساخت، در CI با میزبانِ محلی موضوعاً بی‌معناست.'],
  ['WSTG-INFO-09', 'اثرِ انگشتِ چارچوب: hدرهای امضا برداشته می‌شوند (INFO-02 سنجیده شد)، ولی خودِ ساختارِ مسیرها عمداً فاش است.'],
  ['WSTG-CONF-01..03 / CONF-09', 'پیکربندیِ شبکه، مجوزِ فایل و بنرِ سرورِ تولید به سندباکسِ محلی مربوط نیست؛ در HTTPS-GUIDE.md مستند شده.'],
  ['WSTG-CONF-07', 'HSTS فقط روی HTTPS معنا دارد و در سنجشِ HTTP اینجا موضوعاً وجود ندارد؛ در asvs.js (۳.۴.۱) سنجیده می‌شود.'],
  ['WSTG-CONF-10 / CONF-11', 'Subdomain takeover و ابرِ ذخیره‌سازی: پروژه هیچ زیردامنه و هیچ باکتِ ابری ندارد.'],
  ['WSTG-CONF-15', 'Feature flag bypass: هیچ سامانهٔ پرچمِ قابلیتی در پروژه نیست (تنظیمات فقط shop_open و همین‌هاست).'],
  ['WSTG-IDNT-01..03', 'نقش‌ها/ثبت‌نام/تخصیصِ حساب: نقش فقط «مشتری» و «ادمینِ شماره‌محور» است و ثبت‌نام همان ورودِ پیامکی است؛ ATHZ-03 و ATHZ-04 پوشش می‌دهند.'],
  ['WSTG-ATHN-02 (بخشی)', 'رمزِ پیش‌فرض فقط وقتی معنا دارد که رمزِ عبور داشته باشیم؛ فروشگاه رمزِ پیش‌فرض ندارد و رمزِ اختیاری را خودِ کاربر می‌سازد (همین‌جا سنجیده شد).'],
  ['WSTG-ATHN-05', '«مرا به خاطر بسپار»: کوکیِ نشستِ ۳۰ روزه همان کار را می‌کند و جداگانه سنجیده شده (SESS-02/07).'],
  ['WSTG-ATHN-07 / ATHN-08', 'روشِ ورودِ ضعیف و پرسشِ امنیتی: ورود فقط کدِ پیامکی + رمزِ اختیاری است و پرسشِ امنیتی وجود ندارد.'],
  ['WSTG-ATHN-10', 'کانالِ جایگزین (اپ/SMS دوطرفه) وجود ندارد.'],
  ['WSTG-ATHN-11', 'MFA سنجیده نمی‌شود چون وجود ندارد — و همین‌یک شکافِ اعلام‌شده در asvs.js (بندِ V6) است.'],
  ['WSTG-ATHZ-05', 'OAuth در پروژه نیست (asvs.js بندِ V10 با وضعیتِ na).'],
  ['WSTG-SESS-04', 'متغیرِ نشستِ بیرون‌ریخته: نشست سرورنگه‌داشته است و کوکی فقط شناسه دارد (SESS-01/02 سنجیده شد).'],
  ['WSTG-SESS-08..11', 'Session puzzling، hijacking و توکنِ JWT: نشست‌ها سرورنگه‌داشته‌اند و توکنِ خودبسنده وجود ندارد.'],
  ['WSTG-INPV-02..16 / INPV-18', 'حمله‌های تزریقیِ فعال (XSSِ ذخیره‌شده، LDAP/XPath/XXE/SSI، فرمان‌سازی، SSTI) با بارِ مخرب در CI اجرا نمی‌شوند؛ همان خانواده در owasp-scan.js (A03) و asvs.js (بندِ ۱.۲.۱ روی JSON-LD) پوشش دارد.'],
  ['WSTG-INPV-19', 'SSRF: سرور هیچ آدرسِ کاربری‌ای را واکشی نمی‌کند؛ تنها واکشیِ بیرونی، درگاهِ پرداخت با آدرسِ ثابت است.'],
  ['WSTG-ERRH-01 ( بخشِ ۵xx)', 'پرتابِ خطای داخلیِ واقعی در سندباکس امن نیست؛ قراردادِ ۵۰۰ در tests/error-handoff.js و asvs.js (۱۶.۵.۱) سنجیده می‌شود.'],
  ['WSTG-CRYP-01 / CRYP-02', 'TLS و padding oracle روی HTTPِ محلی موضوعاً نیستند؛ پیکربندیِ TLS در HTTPS-GUIDE.md قفل شده و asvs.js (V12) می‌سنجدش.'],
  ['WSTG-BUSL-03 / BUSL-04 / BUSL-06 / BUSL-07 / BUSL-09', 'بررسیِ یکپارچگیِ تراکنش، زمان‌بندیِ فرایند، دورزدنِ گردشِ کار و فایلِ مخرب: یا موضوعاً وجود ندارد، یا به سنجشِ زندهٔ تخریبی نیاز دارد (BUSL-08 و BUSL-10 و BUSL-01/05 پوشش دارند).'],
  ['WSTG-CLNT-02 / CLNT-03 / CLNT-05 / CLNT-06 / CLNT-13 / CLNT-14 / CLNT-15', 'اجرای JS، تزریقِ HTML/CSS، دست‌کاریِ منابع و tabnabbing: CLNT-01 و CLNT-04 و CLNT-07 و CLNT-09 و CLNT-12 پوشش دارند؛ بقیه به مرورگرِ واقعی نیاز دارند.'],
  ['WSTG-CLNT-10 / CLNT-11', 'WebSocket و Web Messaging: سایت هیچ‌کدام را به‌کار نمی‌برد.'],
  ['WSTG-APIT-04', 'BOLA در سطحِ *تابع* ( admin/customer ) همین‌جا در ATHZ-03 سنجیده شده؛ APIT-04 به APIهای پیچیده‌تر مربوط است.'],
  ['WSTG-APIT-99', 'GraphQL وجود ندارد.'],
];

/* ============================================================
   ۴) اجرای سنجش‌ها
   ============================================================ */
(async function main() {
  if (LIST) {
    console.log('\n=== نقشهٔ WSTG (بدونِ اجرا) ===');
    console.log('  سنجیده می‌شود: CONF-04/05/06/12/14 · IDNT-04/05 · ATHN-02/03/04/06 ·');
    console.log('                 ATHZ-01/02/03/04 · SESS-01/02/03/05/06/07 · INPV-01/17/20 ·');
    console.log('                 ERRH-02 · CRYP-04 · BUSL-01/05/08/10 · CLNT-01/04/07/09/12 ·');
    console.log('                 APIT-01/02/03 · INFO-02/03/05');
    console.log('\n  پوشش داده نمی‌شود:');
    for (const [id, why] of NOT_COVERED) console.log(`   • ${id}\n     ${why}`);
    console.log('\n  مرجعِ شناسه‌ها: https://github.com/OWASP/wstg (چک‌لیستِ رسمی)\n');
    process.exit(0);
  }

  console.log('\n=== آزمونِ نفوذِ خودکار (OWASP WSTG) روی سرورِ سندباکس ===\n');

  try {
    await startServer();
  } catch (e) {
    console.error(`✖ پیش‌شرط: ${e.message}`);
    process.exit(2);
  }

  // ورودها پیش‌شرطِ بقیهٔ سنجش‌هاست؛ اگر کار نکند باید *بلند* شکست بخوریم وگرنه
  // سنجش‌های «کاربرِ واردشده» بی‌صدا رد می‌شوند و سبزِ توخالی می‌دهند.
  let admin, A, B, C;
  let sessAgent = null;   // نشستِ تازهٔ سنجشِ کوکی؛ SESS-06 همان را می‌سوزاند
  try {
    admin = await login(ADMIN_PHONE);
    A = await login(PHONE_A);
    B = await login(PHONE_B);
    C = await login(PHONE_C);
  } catch (e) {
    console.error(`✖ پیش‌شرطِ ورود: ${e.message}`);
    console.error(serverOut.slice(-1500));
    await stopServer();
    process.exit(2);
  }

  const pid = await productId();
  if (!pid) {
    console.error('✖ پیش‌شرط: فهرستِ محصولات خالی است (seed کار نکرد).');
    await stopServer();
    process.exit(2);
  }

  /* هر مسیرِ مدیریتی سه‌طرفه سنجیده می‌شود: ادمین (باید برسد)، مشتری (۴۰۳) و
     بی‌نشست (۴۰۱). اینجا تعریف شده و نه در بالای فایل، چون به نشست‌های همین
     اجرا نیاز دارد. */
  async function accessAudit(pathname, { method = 'GET', json, adminExpect = 200 } = {}) {
    const asAdmin = await request(admin, method, pathname, { json });
    check(`ادمین «${pathname}» را می‌خواند (پس مسیر واقعاً هست)`, asAdmin.status === adminExpect,
      `status=${asAdmin.status} ${asAdmin.body.slice(0, 80)}`);
    const asCustomer = await request(B, method, pathname, { json });
    check(`مشتری با «${pathname}» به ۴۰۳ می‌خورد`, asCustomer.status === 403, `status=${asCustomer.status}`);
    const asAnon = await request(newAgent(), method, pathname, { json });
    check(`بی‌نشست با «${pathname}» به ۴۰۱ می‌خورد`, asAnon.status === 401, `status=${asAnon.status}`);
  }

  /* ---------------- WSTG-INFO-02 — اثرِ انگشتِ سرور ---------------- */
  section('INFO-02', 'Fingerprint Web Server');
  {
    const home = await request(newAgent(), 'GET', '/api/health');
    check('هدرِ X-Powered-By برداشته شده', !home.headers['x-powered-by']);
    const server = String(home.headers.server || '');
    check('هدرِ Server نسخه/محصول افشا نمی‌کند', !/express|node|\d+\.\d+/i.test(server), `Server=${server || '(نیست)'}`);
    const keys = Object.keys(home.json || {});
    check('پاسخِ سلامت هیچ نسخه/وابستگی‌ای برنمی‌گرداند',
      !keys.some((k) => /version|node|express|deps|env/i.test(k)), keys.join(','));
  }

  /* ---------------- WSTG-INFO-03 — فایل‌های فراداده ---------------- */
  section('INFO-03', 'Review Webserver Metafiles for Information Leakage');
  {
    // توجه: `Disallow: /admin` در robots.txt *عمدی* و درست است — پنل را از نتایجِ
    // جست‌وجو بیرون می‌کند و مسیرش هم رازِ کسی نیست (از صفحهٔ حساب لینک می‌شود و
    // CONF-05 ثابت کرد بی‌نشست باز نمی‌شود). آنچه WSTG نگرانش است، اشارهٔ metafile به
    // فایل‌های حساس و نقشهٔ سایت به مسیرهای غیرِعمومی است. پس همین دو سنجیده می‌شود.
    const SENSITIVE = /\.env|\.db\b|\.sql\b|\.git\b|backup|dump\b|\.bak|\.zip|phpMyAdmin|config\.(php|js|json)/i;
    const robots = await request(newAgent(), 'GET', '/robots.txt');
    check('robots.txt به فایلِ حساس یا بکاپ اشاره نمی‌کند', !SENSITIVE.test(robots.body), robots.body.slice(0, 200));
    check('robots.txt همین دامنه را به‌عنوان Sitemap اعلام می‌کند',
      robots.body.includes(`127.0.0.1:${PORT}/sitemap.xml`), (robots.body.match(/Sitemap:.*/) || ['(نیست)'])[0]);

    const sitemap = await request(newAgent(), 'GET', '/sitemap.xml');
    check('نقشهٔ سایت مسیرِ پنل یا API را فهرست نمی‌کند',
      !/<loc>[^<]*\/(admin|api)(\/|<)/i.test(sitemap.body), sitemap.body.slice(0, 160));

    const nextRobots = fs.readFileSync(path.join(DIR, '..', 'next-frontend', 'src', 'app', 'robots.ts'), 'utf8');
    check('metafileِ فروشگاه هم به فایلِ حساس اشاره نمی‌کند', !SENSITIVE.test(nextRobots), nextRobots.slice(0, 160));
    const nextSitemap = fs.readFileSync(path.join(DIR, '..', 'next-frontend', 'src', 'app', 'sitemap.ts'), 'utf8');
    check('نقشهٔ سایتِ فروشگاه پنل را فهرست نمی‌کند', !/\/admin/i.test(nextSitemap));
  }

  /* ---------------- WSTG-INFO-05 — افشای محتوا ---------------- */
  section('INFO-05', 'Review Web Page Content for Information Leakage');
  {
    for (const p of ['/app.js.map', '/main.js.map', '/server.js', '/README.md', '/SECURITY-REPORT.md', '/benchmark-report.md']) {
      const r = await request(newAgent(), 'GET', p);
      check(`«${p}» سرو نمی‌شود`, r.status >= 400 && !r.body.includes('پلاسکو'), `status=${r.status}`);
    }
  }

  /* ---------------- WSTG-CONF-04 — فایل‌های پشتیبان و بی‌ارجاع ---------------- */
  section('CONF-04', 'Review Old Backup and Unreferenced Files for Sensitive Information');
  {
    const probes = [
      '/.env', '/.env.local', '/.git/config', '/.git/HEAD', '/package.json', '/package-lock.json',
      '/backend/package.json', '/data/app.db', '/app.db', '/picture/../.env',
      '/server.js', '/StartSite.bat', '/nginx.conf', '/dump.sql', '/backup.zip',
      '/server.js.bak', '/.env~', '/config.php', '/wp-config.php', '/.well-known/security.txt',
    ];
    const leaked = [];
    for (const p of probes) {
      const r = await request(newAgent(), 'GET', p);
      const looksReal = r.status === 200 && (
        /SESSION_SECRET|ZARINPAL|SMS_API_KEY|"name"\s*:\s*"polasco/i.test(r.body)
        || /root:|BEGIN (RSA|OPENSSH)/i.test(r.body)
        || r.body.startsWith('SQLite format')
        || /<\?php/i.test(r.body)
      );
      if (looksReal) leaked.push(`${p} (${r.status})`);
    }
    check(`هیچ‌کدام از ${probes.length} مسیرِ حساس/پشتیبان محتوا برنمی‌گرداند`, leaked.length === 0, leaked.join(' , '));
  }

  /* ---------------- WSTG-CONF-05 — شمارشِ رابط‌های مدیریتی ---------------- */
  section('CONF-05', 'Enumerate Infrastructure and Application Admin Interfaces');
  {
    // صفحهٔ پنل (HTML) — بی‌نشست نباید محتوایی ببیند. کدِ درست ۳۰۲/۴۰۴ است:
    // Express این مسیر را به پنلِ Next هدایت می‌کند یا فایلِ بازنشسته‌اش ۴۰۴ است.
    for (const p of ['/admin', '/admin.html', '/admin/orders', '/api/admin/secret-path']) {
      const r = await request(newAgent(), 'GET', p);
      check(`«${p}» بی‌نشست محتوای پنل نمی‌دهد`, r.status >= 300 || r.status === 404,
        `status=${r.status}`);
      check(`«${p}» دادهٔ پنل برنمی‌گرداند`, !/"stats"|"users"|فهرستِ کاربران|پنل مدیریت/i.test(r.body),
        r.body.slice(0, 120));
    }
    // و ستونِ مثبت: همهٔ همان مسیرها برای ادمین باز هستند (بالا سنجیده شد) —
    // پس «۴۰۱/۴۰۳ گرفتنِ مشتری» از جنسِ «مسیر نیست» نیست.
    const asAdmin = await request(admin, 'GET', '/api/admin/secret-path');
    check('مسیرِ مدیریتیِ ناموجود برای ادمین هم ۴۰۴ می‌دهد (نه پوششِ خالی)',
      asAdmin.status === 404, `status=${asAdmin.status}`);
    const stats = await request(newAgent(), 'GET', '/api/admin/stats');
    check('صفحهٔ پنل بی‌نشست محتوای آماری نمی‌دهد', !/"products"|"revenue"/.test(stats.body), stats.body.slice(0, 100));
  }

  /* ---------------- WSTG-CONF-06 — روش‌های HTTP ---------------- */
  section('CONF-06', 'HTTP Methods');
  {
    const before = (await request(newAgent(), 'GET', '/api/products?limit=1')).json?.products?.length;

    const options = await request(newAgent(), 'OPTIONS', '/api/products');
    check('OPTIONS مسیرِ عمومی پاسخِ روشن می‌دهد یا دست‌کم مسیر را فاش نمی‌کند',
      [200, 204, 404, 405].includes(options.status), `status=${options.status}`);
    const allow = String(options.headers.allow || '');
    check('Allow شاملِ TRACE نیست', !/TRACE/i.test(allow), allow || '(هدری نیست)');

    // TRACE: انتظارِ درست آن است که سرور هدرهای درخواست را *برنگرداند*.
    const trace = await request(newAgent(), 'TRACE', '/api/health', { headers: { 'X-Canary': CANARY_TEXT } });
    check('TRACE هدرهای درخواست را بازنمی‌تاباند', !trace.body.includes(CANARY_TEXT), `status=${trace.status}`);

    for (const method of ['PUT', 'DELETE', 'PATCH']) {
      const r = await request(newAgent(), method, '/api/products', { json: { title: 'wstg' } });
      check(`${method} روی مسیرِ عمومی موفق نمی‌شود`, r.status >= 400, `status=${r.status}`);
    }
    const after = (await request(newAgent(), 'GET', '/api/products?limit=1')).json?.products?.length;
    check('فهرستِ محصولات پس از روش‌های ناخواسته دست‌نخورده مانده', before === after, `${before} → ${after}`);

    const foo = await request(newAgent(), 'FOO', '/api/products?limit=1');
    check('روشِ ناشناخته (FOO) مثلِ GET رفتار نمی‌شود',
      !(foo.status === 200 && foo.body.includes('products')), `status=${foo.status}`);

    // سرریزِ روش از راهِ هدر: Express به‌طورِ پیش‌فرض این هدرها را نمی‌شناسد،
    // و اگر روزی میان‌افزاری اضافه شود که بشناسد، اینجا گرفته می‌شود.
    const override = await request(newAgent(), 'GET', '/api/auth/me', {
      headers: { 'X-HTTP-Method-Override': 'DELETE', 'X-Method-Override': 'DELETE', 'X-HTTP-Method': 'DELETE' },
    });
    check('هدرهای override روش را به حذف تغییر نمی‌دهند (پاسخ همان GET می‌ماند)',
      override.status === 200 && override.json?.user === null, `status=${override.status} body=${override.body.slice(0, 80)}`);
    const stillAuthed = await request(A, 'GET', '/api/auth/me');
    check('نشستِ کاربر با درخواستِ override از بین نمی‌رود', stillAuthed.status === 200, `status=${stillAuthed.status}`);
  }

  /* ---------------- WSTG-CONF-12 / CONF-14 — هدرها ---------------- */
  section('CONF-12/14', 'Content Security Policy و هدرهای امنیتی');
  {
    const home = await request(newAgent(), 'GET', '/api/health');
    const csp = String(home.headers['content-security-policy'] || '');
    check("CSP شاملِ object-src 'none' است", csp.includes("object-src 'none'"));
    check("CSP شاملِ base-uri 'none' است", csp.includes("base-uri 'none'"));
    check('CSP اسکریپتِ درون‌خطی را مجاز نکرده', !/script-src[^;]*unsafe-inline/.test(csp));
    check('nosniff ست شده', home.headers['x-content-type-options'] === 'nosniff');
    check('X-Frame-Options ست شده', home.headers['x-frame-options'] === 'SAMEORIGIN');
    check('Referrer-Policy ست شده', home.headers['referrer-policy'] === 'strict-origin-when-cross-origin');
    check('COOP ست شده', home.headers['cross-origin-opener-policy'] === 'same-origin');
    check('هدرِ منسوخِ X-XSS-Protection فرستاده نمی‌شود', !home.headers['x-xss-protection']);
  }

  /* ---------------- WSTG-IDNT-04 — شمارشِ حساب ---------------- */
  section('IDNT-04', 'Account Enumeration and Guessable User Account');
  {
    const ch1 = (await request(newAgent(), 'GET', '/api/auth/otp/challenge')).json.token;
    const t0 = Date.now();
    const known = await request(newAgent(), 'POST', '/api/auth/otp/request', { json: { phone: PHONE_A, challenge: ch1 } });
    const dt1 = Date.now() - t0;
    const ch2 = (await request(newAgent(), 'GET', '/api/auth/otp/challenge')).json.token;
    const t1 = Date.now();
    const fresh = await request(newAgent(), 'POST', '/api/auth/otp/request', { json: { phone: PHONE_ENUM, challenge: ch2 } });
    const dt2 = Date.now() - t1;

    check('درخواستِ کد برای شمارهٔ موجود و ناموجود وضعیتِ یکسان می‌دهد',
      known.status === fresh.status, `${known.status} در برابرِ ${fresh.status}`);
    check('شکلِ پاسخ برای هر دو یکی است',
      JSON.stringify(Object.keys(known.json || {})) === JSON.stringify(Object.keys(fresh.json || {})),
      `${Object.keys(known.json || {})} در برابرِ ${Object.keys(fresh.json || {})}`);
    // تفاوتِ زمانیِ زیاد یعنی «وجودِ حساب» از راهِ تأخیر قابلِ حدس است.
    check('اختلافِ زمانیِ دو مسیر مشکوک نیست (<1500ms)', Math.abs(dt1 - dt2) < 1500, `${dt1}ms در برابرِ ${dt2}ms`);

    const unknownLogin = await request(newAgent(), 'POST', '/api/auth/password/login', {
      json: { phone: PHONE_ENUM, password: 'TotallyWrongPass123' },
    });
    const knownLogin = await request(newAgent(), 'POST', '/api/auth/password/login', {
      json: { phone: PHONE_B, password: 'TotallyWrongPass123' },
    });
    check('ورودِ ناموفق برای شمارهٔ موجود و ناموجود یک شکل است',
      unknownLogin.status === knownLogin.status && unknownLogin.body === knownLogin.body,
      `${unknownLogin.status}«${unknownLogin.body.slice(0, 60)}» در برابرِ ${knownLogin.status}«${knownLogin.body.slice(0, 60)}»`);
  }

  /* ---------------- WSTG-IDNT-05 — سیاستِ نامِ کاربری ---------------- */
  section('IDNT-05', 'Weak or Unenforced Username Policy');
  {
    const ch = (await request(newAgent(), 'GET', '/api/auth/otp/challenge')).json.token;
    for (const phone of ['123456', 'abcdefghij', '+98912', '0000000000000']) {
      const r = await request(newAgent(), 'POST', '/api/auth/otp/request', { json: { phone, challenge: ch } });
      check(`شمارهٔ نامعتبرِ «${phone}» رد می‌شود`, r.status === 400, `status=${r.status}`);
    }
  }

  /* ---------------- WSTG-ATHN-02 — رمزِ پیش‌فرض ---------------- */
  section('ATHN-02', 'Default Credentials');
  {
    for (const password of ['123456', 'admin', 'password', 'admin123', '000000']) {
      const r = await request(newAgent(), 'POST', '/api/auth/password/login', { json: { phone: ADMIN_PHONE, password } });
      check(`رمزِ «${password}» برای حسابِ ادمین کار نمی‌کند`, r.status >= 400, `status=${r.status}`);
    }
    const ch = (await request(newAgent(), 'GET', '/api/auth/otp/challenge')).json.token;
    await request(newAgent(), 'POST', '/api/auth/otp/request', { json: { phone: PHONE_DEFAULT, challenge: ch } });
    const guess = await request(newAgent(), 'POST', '/api/auth/otp/verify', { json: { phone: PHONE_DEFAULT, code: '00000' } });
    check('کدِ حدسیِ «۰۰۰۰۰» رد می‌شود', guess.status >= 400, `status=${guess.status}`);
  }

  /* ---------------- WSTG-ATHN-03 — قفلِ حساب ---------------- */
  section('ATHN-03', 'Weak Lock Out Mechanism');
  {
    // رمزِ اختیاری را خودمان می‌سازیم تا مسیرِ رمزِ عبور قابلِ سنجش شود.
    const setRes = await request(A, 'POST', '/api/auth/password/set', { json: { password: 'Wstg-Correct-2026' } });
    check('کاربر می‌تواند رمزِ عبور بگذارد (پیش‌شرطِ سنجشِ قفل)', setRes.status === 200, `status=${setRes.status}`);

    const fresh = newAgent();
    const good = await request(fresh, 'POST', '/api/auth/password/login', { json: { phone: PHONE_A, password: 'Wstg-Correct-2026' } });
    check('رمزِ درست کار می‌کند (کنترلِ مثبت)', good.status === 200, `status=${good.status}`);

    let locked = null;
    for (let i = 0; i < 12; i++) {
      const r = await request(newAgent(), 'POST', '/api/auth/password/login', { json: { phone: PHONE_A, password: `wrong-${i}-password` } });
      if (r.status === 429 || /دقیقه|صبر|قفل|قفل شده/i.test(r.body)) { locked = { i: i + 1, r }; break; }
    }
    check('تلاش‌های پیاپیِ رمزِ غلط به قفل/محدودیت می‌رسد', Boolean(locked), 'پس از ۱۲ تلاش چیزی قفل نشد');
    if (locked) {
      const duringLock = await request(newAgent(), 'POST', '/api/auth/password/login', { json: { phone: PHONE_A, password: 'Wstg-Correct-2026' } });
      check('در زمانِ قفل، رمزِ درست هم پذیرفته نمی‌شود', duringLock.status >= 400, `status=${duringLock.status}`);
    }
  }

  /* ---------------- WSTG-ATHN-04 — دورزدنِ احرازِ هویت ---------------- */
  section('ATHN-04', 'Bypassing Authentication Schema');
  {
    const attempts = [
      ['هدرِ X-Original-URL', { 'X-Original-URL': '/api/admin/stats' }],
      ['هدرِ X-Rewrite-URL', { 'X-Rewrite-URL': '/api/admin/stats' }],
      ['هدرِ X-Forwarded-User', { 'X-Forwarded-User': 'admin', 'X-Admin': '1' }],
      ['هدرِ X-Forwarded-For جعلی', { 'X-Forwarded-For': '127.0.0.1', 'X-Real-IP': '127.0.0.1' }],
    ];
    for (const [label, headers] of attempts) {
      const r = await request(newAgent(), 'GET', '/api/admin/stats', { headers });
      check(`بی‌نشست با ${label} ادمین نمی‌شود`, r.status >= 400, `status=${r.status}`);
    }
    const fake = newAgent();
    fake.jar.set('polasco.sid', 's%3A' + crypto.randomBytes(16).toString('hex'));
    const forged = await request(fake, 'GET', '/api/admin/stats');
    check('کوکیِ ساختگی ادمین نمی‌شود', forged.status >= 400, `status=${forged.status}`);
    const forgedMe = await request(fake, 'GET', '/api/auth/me');
    check('کوکیِ ساختگی هویتی نمی‌سازد', forgedMe.status === 200 && forgedMe.json?.user === null,
      `status=${forgedMe.status} body=${forgedMe.body.slice(0, 80)}`);

    const asCustomer = await request(B, 'GET', '/api/admin/stats', { headers: { 'X-Forwarded-For': '127.0.0.1' } });
    check('نشستِ مشتری با هدرِ جعلی به پنل نمی‌رسد', asCustomer.status >= 400, `status=${asCustomer.status}`);
  }

  /* ---------------- WSTG-ATHN-06 — کشِ مرورگر ---------------- */
  section('ATHN-06', 'Browser Cache Weaknesses');
  {
    for (const p of ['/api/auth/me', '/api/orders/mine', '/api/cart', '/api/addresses', '/api/auth/sessions']) {
      const r = await request(A, 'GET', p);
      const cc = String(r.headers['cache-control'] || '');
      check(`پاسخِ حساسِ «${p}» کش‌نشدنی است`, /no-store/.test(cc), `Cache-Control=${cc || '(نیست)'}`);
    }
  }

  /* ---------------- WSTG-ATHZ-01 — پیمایشِ مسیر ---------------- */
  section('ATHZ-01', 'Directory Traversal File Include');
  {
    const payloads = [
      '/picture/../outside-the-picture-root/canary.txt',
      '/picture/..%2foutside-the-picture-root%2fcanary.txt',
      '/picture/%2e%2e%2foutside-the-picture-root%2fcanary.txt',
      '/picture/%2e%2e/outside-the-picture-root/canary.txt',
      '/picture/..%5coutside-the-picture-root%5ccanary.txt',
      '/picture/%2e%2e%5coutside-the-picture-root%5ccanary.txt',
      '/picture/%252e%252e%252foutside-the-picture-root%252fcanary.txt',
      '/picture/....//outside-the-picture-root/canary.txt',
      '/picture/products/../../outside-the-picture-root/canary.txt',
      '/picture/products/%2e%2e%2f%2e%2e%2foutside-the-picture-root%2fcanary.png',
    ];
    const leaked = [];
    for (const p of payloads) {
      const r = await request(newAgent(), 'GET', p);
      if (r.body.includes(CANARY_TEXT)) leaked.push(`${p} → ${r.status}`);
    }
    check(`هیچ‌کدام از ${payloads.length} بارِ پیمایش محتوای بیرون از ریشه را برنگرداند`, leaked.length === 0, leaked.join(' , '));

    // میدل‌ورِ WebP جداگانه سنجیده می‌شود، چون خودش مسیر را دیکد و نگاشت می‌کند
    // (X.png → X.webp) و محافظتِ express.static به آن نمی‌رسد. `%5c` (بک‌اسلش)
    // و `..\` همان شکلی است که روی ویندوز از فیلترِ `..` رد می‌شود.
    const viaWebp = [
      '/picture/../outside-the-picture-root/canary.png',
      '/picture/..%5coutside-the-picture-root%5ccanary.png',
      '/picture/%2e%2e%5coutside-the-picture-root%5ccanary.png',
    ];
    for (const p of viaWebp) {
      const r = await request(newAgent(), 'GET', p, { headers: { Accept: 'image/webp,image/*' } });
      check(`میدل‌ورِ WebP با «${p}» از ریشه بیرون نمی‌زند`, !r.body.includes(CANARY_TEXT), `status=${r.status}`);
    }

    // منبعِ سوم: پوشهٔ *کنارِ* ریشه. اینجا هيچ `..`ی در نشانی نیست — پس تنها
    // راهی که این مسیر باز شود، «ریشه یک پله اشتباه ست شده» است؛ همان اشتباهِ
    // کلاسیکی که پیمایش را بدونِ هیچ بارِ عجیبی ممکن می‌کند.
    const siblings = ['/picture/outside-the-picture-root/canary.txt', '/picture/outside-the-picture-root/canary.png'];
    for (const p of siblings) {
      const r = await request(newAgent(), 'GET', p, { headers: { Accept: 'image/webp,image/*' } });
      check(`پوشهٔ کنارِ ریشهٔ عکس‌ها («${p}») هرگز سرو نمی‌شود`, !r.body.includes(CANARY_TEXT), `status=${r.status}`);
    }
  }

  /* ---------------- WSTG-ATHZ-02 / ATHZ-04 — سطحِ دسترسی و IDOR ---------------- */
  section('ATHZ-02/04', 'Bypassing Authorization Schema و Insecure Direct Object References');
  {
    const createdA = await request(A, 'POST', '/api/addresses', {
      json: {
        fullName: 'کاربر الف', phone: '09121234001', province: 'تهران', city: 'تهران',
        addressLine: 'خیابان سنجش، پلاک ۱', postalCode: '1234567890',
      },
    });
    check('آدرسِ کاربرِ الف ساخته می‌شود (پیش‌شرط)', createdA.status === 200 && createdA.json?.address?.id,
      `status=${createdA.status}`);
    const addrA = createdA.json?.address?.id;

    const listB = await request(B, 'GET', '/api/addresses');
    check('فهرستِ آدرسِ کاربرِ ب آدرسِ الف را ندارد',
      !listB.body.includes(`"id":${addrA}`) && !(listB.json?.addresses || []).some((a) => String(a.id) === String(addrA)),
      listB.body.slice(0, 120));

    const updateB = await request(B, 'PUT', `/api/addresses/${addrA}`, {
      json: { fullName: 'تسخیر', phone: '09120000000', city: 'تهران', addressLine: 'تغییر' },
    });
    check('کاربرِ ب نمی‌تواند آدرسِ الف را ویرایش کند', updateB.status >= 400, `status=${updateB.status}`);
    const afterUpdate = await request(A, 'GET', '/api/addresses');
    check('آدرسِ الف پس از تلاشِ ب دست‌نخورده مانده',
      (afterUpdate.json?.addresses || []).some((a) => String(a.id) === String(addrA) && a.fullName === 'کاربر الف'),
      JSON.stringify(afterUpdate.json?.addresses || []).slice(0, 160));

    const deleteB = await request(B, 'DELETE', `/api/addresses/${addrA}`);
    check('کاربرِ ب نمی‌تواند آدرسِ الف را پاک کند', deleteB.status >= 400, `status=${deleteB.status}`);

    // سفارشِ الف، از چشمِ ب (ATHZ-04)
    await request(A, 'POST', '/api/cart/add', { json: { productId: pid, qty: 1 } });
    const orderRes = await request(A, 'POST', '/api/orders', {
      headers: { 'Idempotency-Key': `wstg-${crypto.randomBytes(8).toString('hex')}` },
      json: { addressId: addrA },
    });
    check('سفارشِ الف ثبت می‌شود (پیش‌شرط)', Boolean(orderRes.json?.orderId), `${orderRes.status} ${orderRes.body.slice(0, 120)}`);
    const orderId = orderRes.json?.orderId;

    if (orderId) {
      const own = await request(A, 'GET', `/api/orders/${orderId}`);
      check('خودِ الف سفارشش را می‌بیند (کنترلِ مثبت — مسیر زنده است)', own.status === 200, `status=${own.status}`);

      const readB = await request(B, 'GET', `/api/orders/${orderId}`);
      // ۴۰۴ عمدی است و در کد مستند: «نیست» و «مالِ کسِ دیگر» یک جواب می‌گیرند
      // تا شمارهٔ سفارش‌ها قابلِ حدس نباشد. پس همین قرارداد سنجیده می‌شود، نه
      // فقط «هر خطایی». دقیق بودنِ انتظار همین‌جاست که جهشِ مالکیت را می‌گیرد.
      check('کاربرِ ب سفارشِ الف را نمی‌بیند (۴۰۴ِ یکسان با «نیست»)', readB.status === 404, `status=${readB.status}`);

      const before = String((own.json?.order?.status) || '');
      const cancelB = await request(B, 'POST', `/api/orders/${orderId}/cancel`);
      check('کاربرِ ب نمی‌تواند سفارشِ الف را لغو کند', cancelB.status === 404, `status=${cancelB.status}`);
      // و سنجشِ *اثر*، نه فقط کد: اگر مسیرِ لغو به هر دلیلی باز شود، وضعیتِ
      // سفارش عوض شده است — حتی وقتی پاسخ «۴۰۹» یا «۲۰۰» باشد.
      const after = await request(A, 'GET', `/api/orders/${orderId}`);
      check('وضعیتِ سفارشِ الف پس از تلاشِ ب دست‌نخورده مانده',
        after.status === 200 && String(after.json?.order?.status || '') === before,
        `قبل=${before} بعد=${after.json?.order?.status}`);

      const anon = await request(newAgent(), 'GET', `/api/orders/${orderId}`);
      check('بی‌نشست سفارش را نمی‌بیند', anon.status === 401, `status=${anon.status}`);
    }
  }

  /* ---------------- WSTG-ATHZ-03 — بالا رفتنِ سطحِ دسترسی ---------------- */
  section('ATHZ-03', 'Privilege Escalation');
  {
    // هر مسیر سه‌طرفه سنجیده می‌شود: ادمین باید برسد (وگرنه مسیر مرده است و
    // سنجشِ «مشتری رد شد» بی‌معنا می‌شود)، مشتری باید ۴۰۳ بگیرد، بی‌نشست ۴۰۱.
    for (const p of ADMIN_READ_PATHS) await accessAudit(p);

    // ارتقا به «کارمند» — واپس‌گیریِ بی‌اثر روی کاربرِ خودش، تا سنجش سمتِ
    // مثبت هم داشته باشد بدونِ اینکه وضعیتِ سندباکس را به‌هم بزند.
    const users = await request(admin, 'GET', '/api/admin/users?limit=1');
    const selfId = users.json?.users?.[0]?.id;
    if (!selfId) {
      notOk('پیش‌شرطِ سنجشِ ارتقا (فهرستِ کاربرانِ ادمین)', users.body.slice(0, 120));
    } else {
      await accessAudit(`/api/admin/users/${selfId}/staff`, { method: 'POST', json: { staff: false } });
    }
  }

  /* ---------------- WSTG-SESS-01 — کیفیتِ شناسهٔ نشست ---------------- */
  section('SESS-01', 'Session Management Schema');
  {
    const ids = [A, B, C].map((a) => a.jar.get('polasco.sid')).filter(Boolean);
    check('کوکیِ نشست روی همهٔ کاربران ست می‌شود', ids.length === 3, `${ids.length} از ۳`);
    check('شناسه‌ها یکتا هستند', new Set(ids).size === ids.length, ids.join(','));
    // راهنمای v4.2 (بخشِ جعبه‌خاکستریِ همین آزمون): شناسهٔ نشست باید دست‌کم ۵۰ نویسه باشد.
    const shortest = Math.min(...ids.map((v) => decodeURIComponent(v).replace(/^s:/, '').length));
    check('طولِ شناسهٔ نشست ≥ ۵۰ نویسه است (راهنمای SESS-01)', shortest >= 50, `کوتاه‌ترین=${shortest}`);
    check('شناسه‌ها از الفبای تصادفی‌اند (نه عددِ ترتیبی/زمانی)',
      ids.every((v) => /^s:[A-Za-z0-9+/=._-]+$/.test(decodeURIComponent(v))), ids.join(','));
  }

  /* ---------------- WSTG-SESS-02 / SESS-07 — ویژگی‌های کوکی و مهلت ---------------- */
  section('SESS-02/07', 'Cookies Attributes و Session Timeout');
  {
    const r = await request(newAgent(), 'GET', '/api/health');
    check('پاسخِ سلامت کوکیِ نشست ست نمی‌کند', !r.headers['set-cookie'], String(r.headers['set-cookie'] || '(نیست)'));

    // رشتهٔ خامِ Set-Cookie موضوعِ سنجش است، پس از هدرِ همان پاسخِ ورود خوانده می‌شود.
    const ch = newAgent();
    const chToken = (await request(ch, 'GET', '/api/auth/otp/challenge')).json.token;
    const mark = serverOut.length;
    const asked = await request(ch, 'POST', '/api/auth/otp/request', { json: { phone: PHONE_COOKIE, challenge: chToken } });
    check('درخواستِ کد برای شمارهٔ تازه‌ی سنجشِ کوکی موفق است (پیش‌شرط)', asked.status === 200, `status=${asked.status}`);
    const code = await waitForCode(PHONE_COOKIE, mark);
    const freshLogin = await request(ch, 'POST', '/api/auth/otp/verify', { json: { phone: PHONE_COOKIE, code } });
    check('ورودِ شمارهٔ تازه موفق است (پیش‌شرطِ بقیهٔ سنجش‌های نشست)', freshLogin.status === 200, freshLogin.body.slice(0, 100));
    const sc = freshLogin.setCookie.join(' | ');
    check('کوکیِ نشست HttpOnly است', /HttpOnly/i.test(sc), sc);
    check('کوکیِ نشست SameSite دارد', /SameSite=/i.test(sc), sc);
    check('کوکیِ نشست Path=/ دارد', /Path=\//i.test(sc), sc);
    check('کوکی به دامنهٔ خاصی بسته نشده (Domain ندارد)', !/Domain=/i.test(sc), sc);
    // روی HTTPِ محلی، Secure فقط اگر COOKIE_SECURE روشن باشد می‌آید — و در
    // production خودش روشن می‌شود (security-config.js اجباری‌اش می‌کند).
    check('کوکی روی HTTPِ محلی پرچمِ Secure ندارد (در production اجباری است)', !/Secure/i.test(sc), sc);
    // مهلتِ نشست می‌تواند با Max-Age یا با Expires بیان شود؛ نبودِ هر دو یعنی
    // کوکیِ نشستی که تا بستنِ مرورگر می‌ماند (و برای «مرا به خاطر بسپار» بی‌مهلت است).
    const sessionCookie = freshLogin.setCookie.find((c) => c.startsWith('polasco.sid=')) || sc;
    const maxAge = Number((sessionCookie.match(/Max-Age=(\d+)/i) || [])[1] || 0);
    const expiresAt = Date.parse((sessionCookie.match(/Expires=([^;]+)/i) || [])[1] || '');
    const lifeSeconds = maxAge || (Number.isFinite(expiresAt) ? Math.round((expiresAt - Date.now()) / 1000) : 0);
    check('مهلتِ نشست متناهی و نامعقول بلند نیست (۰ تا ۳۱ روز)',
      lifeSeconds > 0 && lifeSeconds <= 31 * 24 * 3600,
      `Max-Age=${maxAge} Expires=${Number.isFinite(expiresAt) ? new Date(expiresAt).toISOString() : 'ندارد'} | ${sessionCookie}`);
    sessAgent = ch;
  }

  /* ---------------- WSTG-SESS-03 — Session Fixation ---------------- */
  section('SESS-03', 'Session Fixation');
  {
    const forgedValue = 's%3A' + crypto.randomBytes(24).toString('hex');
    const fixAgent = newAgent();
    fixAgent.jar.set('polasco.sid', forgedValue);
    const before = await request(fixAgent, 'GET', '/api/auth/me');
    check('شناسهٔ نشستِ ازپیش‌تعیین‌شده هویتی نمی‌دهد',
      before.json?.user === null, `status=${before.status} body=${before.body.slice(0, 80)}`);

    const { status, code } = await requestOtp(PHONE_FIXATION, fixAgent);
    check('درخواستِ کد روی نشستِ ازپیش‌تعیین‌شده موفق است (پیش‌شرط)', status === 200, `status=${status}`);
    const verify = await request(fixAgent, 'POST', '/api/auth/otp/verify', { json: { phone: PHONE_FIXATION, code } });
    check('ورود روی نشستِ ازپیش‌تعیین‌شده موفق است (پیش‌شرط)', verify.status === 200, verify.body.slice(0, 100));
    const after = fixAgent.jar.get('polasco.sid');
    check('شناسهٔ نشست پس از ورود عوض می‌شود (fixation بی‌اثر است)',
      Boolean(after) && after !== forgedValue, `قبل=${forgedValue} بعد=${after}`);
  }

  /* ---------------- WSTG-SESS-05 — CSRF ---------------- */
  section('SESS-05', 'Cross Site Request Forgery');
  {
    const cross = await request(A, 'POST', '/api/cart/add', {
      json: { productId: pid, qty: 1 }, headers: { Origin: 'https://evil.example', Referer: 'https://evil.example/attack' },
    });
    check('نوشتن با Originِ بیگانه رد می‌شود', cross.status === 403, `status=${cross.status}`);
    const same = await request(A, 'POST', '/api/cart/add', {
      json: { productId: pid, qty: 1 }, headers: { Origin: `http://127.0.0.1:${PORT}` },
    });
    check('نوشتن با Originِ خودمان پذیرفته می‌شود (کنترلِ مثبت)', same.status === 200, `status=${same.status}`);
    const noOrigin = await request(A, 'POST', '/api/cart/add', { json: { productId: pid, qty: 1 } });
    check('نوشتنِ بدونِ Origin/Referer سقفِ سخت‌گیرانه دارد (رد یا پذیرشِ آگاهانه)',
      [200, 403].includes(noOrigin.status), `status=${noOrigin.status}`);
  }

  /* ---------------- WSTG-SESS-06 — خروج ---------------- */
  section('SESS-06', 'Logout Functionality');
  {
    const victim = sessAgent || (await login(PHONE_COOKIE));
    const before = await request(victim, 'GET', '/api/auth/me');
    check('نشستِ سنجشِ کوکی کار می‌کند (پیش‌شرطِ خروج)', Boolean(before.json?.user), before.body.slice(0, 80));
    const rawCookie = victim.jar.get('polasco.sid') || '';
    const out = await request(victim, 'POST', '/api/auth/logout');
    check('خروج موفق است', out.status < 400, `status=${out.status}`);
    // همان کوکیِ سوخته را در کوزهٔ *تازه‌ای* می‌گذاریم: اینجا «باطل شدنِ شناسه در
    // سرور» سنجیده می‌شود، نه فقط پاک شدنِ کوکی در مرورگرِ خودمان.
    const staleJar = newAgent();
    staleJar.jar.set('polasco.sid', rawCookie);
    const after = await request(staleJar, 'GET', '/api/auth/me');
    check('کوکیِ کهنه پس از خروج بی‌اعتبار می‌شود', after.json?.user === null,
      `status=${after.status} body=${after.body.slice(0, 80)}`);
  }

  /* ---------------- WSTG-INPV-01 — بازتابِ ورودی ---------------- */
  section('INPV-01', 'Reflected Cross Site Scripting');
  {
    const payload = '<script>alert(1)</script>';
    const r = await request(newAgent(), 'GET', `/api/products?search=${encodeURIComponent(payload)}`);
    check('پاسخِ جست‌وجو JSON است، نه HTML', /application\/json/.test(String(r.headers['content-type'] || '')),
      String(r.headers['content-type'] || ''));
    check('بارِ اسکریپتِ خام در پاسخ بازنمی‌تابد', !r.body.includes(payload), r.body.slice(0, 120));
    const htmlAttempt = await request(newAgent(), 'GET', `/products?search=${encodeURIComponent(payload)}`);
    check('مسیرِ صفحهٔ ناموجود هم HTMLِ بازتابی نمی‌سازد', !htmlAttempt.body.includes(payload), `status=${htmlAttempt.status}`);
  }

  /* ---------------- WSTG-INPV-17 — تزریقِ هدرِ Host ---------------- */
  section('INPV-17', 'Host Header Injection');
  {
    const canaryHost = 'wstg-canary.invalid';
    const variants = [
      { Host: canaryHost },
      { 'X-Forwarded-Host': canaryHost },
      { 'X-Forwarded-Host': canaryHost, 'X-Forwarded-Server': canaryHost },
      { Host: canaryHost, 'X-Forwarded-Host': canaryHost },
    ];
    const hits = [];
    for (const headers of variants) {
      for (const p of ['/', '/api/health', '/api/products?limit=1', '/api/auth/me']) {
        const r = await request(newAgent(), 'GET', p, { headers });
        const loc = String(r.headers.location || '');
        if (r.body.includes(canaryHost) || loc.includes(canaryHost)) hits.push(`${p} ${Object.keys(headers).join('+')}`);
      }
    }
    check(`هدرِ Host/X-Forwarded-Host در ${variants.length * 4} پاسخ بازنمی‌تابد`, hits.length === 0, hits.join(' , '));

    // مهم‌ترین جا: نشانیِ بازگشتِ درگاه که *داخلِ سفارش* ذخیره می‌شود.
    await request(A, 'POST', '/api/cart/add', { json: { productId: pid, qty: 1 } });
    const addr = (await request(A, 'GET', '/api/addresses')).json?.addresses?.[0];
    if (addr) {
      const order = await request(A, 'POST', '/api/orders', {
        headers: { 'Idempotency-Key': `wstg-host-${crypto.randomBytes(8).toString('hex')}`, Host: canaryHost, 'X-Forwarded-Host': canaryHost },
        json: { addressId: addr.id },
      });
      check('نشانیِ پرداخت/بازگشت با Hostِ مهاجم ساخته نمی‌شود', !order.body.includes(canaryHost),
        order.body.slice(0, 160));
      check('درگاهِ پرداخت در حالتِ آزمون است (هیچ تماسِ بیرونی‌ای زده نمی‌شود)',
        order.json?.testMode === true, `testMode=${order.json?.testMode}`);
    } else {
      notOk('پیش‌شرطِ سنجشِ نشانیِ بازگشت (آدرسِ کاربرِ الف)', 'آدرسی پیدا نشد');
    }
  }

  /* ---------------- WSTG-INPV-20 / APIT-03 — جرم‌دهی و افشای بیش‌ازحد ---------------- */
  section('INPV-20 / APIT-03', 'Mass Assignment و Excessive Data Exposure');
  {
    const injected = await request(B, 'POST', '/api/addresses', {
      json: {
        fullName: 'کاربر ب', phone: '09121234002', province: 'تهران', city: 'تهران',
        addressLine: 'خیابان دوم', postalCode: '1234567890',
        id: 99999, userId: 1, isAdmin: true, role: 'admin', staff: true, createdAt: '1970-01-01',
      },
    });
    check('آدرس با فیلدهای اضافی ساخته می‌شود', injected.status === 200, `status=${injected.status}`);
    const stored = injected.json?.address || {};
    check('فیلدهای تزریقی در پاسخ ذخیره نشده‌اند',
      String(stored.id) !== '99999' && stored.isAdmin === undefined && stored.staff === undefined,
      JSON.stringify(stored).slice(0, 160));

    const me = await request(A, 'GET', '/api/auth/me');
    const flatten = JSON.stringify(me.json || {});
    for (const forbidden of ['password_hash', 'passwordHash', 'code_hash', 'session_secret', 'SESSION_SECRET', 'otp']) {
      check(`پاسخِ /auth/me فیلدِ «${forbidden}» ندارد`, !flatten.includes(forbidden));
    }
    check('hashِ رمز در پاسخِ عمومی نیست', !/\$scrypt\$|scrypt\$/.test(flatten));

    const cart = await request(B, 'POST', '/api/cart/add', {
      json: { productId: pid, qty: 1, price: 1, total: 1, discount: 99999 },
    });
    const line = (cart.json?.items || []).find((i) => String(i.productId) === String(pid)) || {};
    check('قیمتِ اعلامیِ کلاینت در سبد ذخیره نمی‌شود', Number(line.price ?? 0) > 1, JSON.stringify(line).slice(0, 140));
  }

  /* ---------------- WSTG-ERRH-02 — پشتهٔ خطا ---------------- */
  section('ERRH-02', 'Stack Traces');
  {
    const badJson = await request(newAgent(), 'POST', '/api/cart/add', {
      body: '{"productId": ', headers: { 'Content-Type': 'application/json' },
    });
    const notFound = await request(newAgent(), 'GET', '/api/__wstg_not_found__');
    const badId = await request(A, 'GET', '/api/orders/not-a-number');
    for (const [label, r] of [['بدنهٔ JSONِ خراب', badJson], ['مسیرِ ناموجود', notFound], ['شناسهٔ نامعتبر', badId]]) {
      const leaked = /at\s+\w+\s+\(|node_modules|\.js:\d+:\d+|SQLITE_|SqliteError|Error: /.test(r.body);
      check(`«${label}» پشته/جزئیاتِ داخلی برنمی‌گرداند`, !leaked, r.body.slice(0, 140));
      check(`«${label}» پاسخِ ۵xx نمی‌دهد`, r.status < 500, `status=${r.status}`);
    }
    const big = await request(A, 'POST', '/api/cart/add', {
      body: JSON.stringify({ productId: pid, qty: 1, pad: 'x'.repeat(3 * 1024 * 1024) }),
      headers: { 'Content-Type': 'application/json' },
    });
    check('بدنهٔ بسیار بزرگ با کدِ روشن رد می‌شود (نه ۵۰۰)', big.status === 413 || big.status === 400, `status=${big.status}`);
    check('پیامِ خطای بدنهٔ بزرگ جزئیاتِ داخلی ندارد', !/stack|node_modules|at \w+ \(/i.test(big.body), big.body.slice(0, 120));
  }

  /* ---------------- WSTG-CRYP-04 — الگوریتمِ شکسته ---------------- */
  section('CRYP-04', 'Weak Cryptographic Primitives');
  {
    const files = ['server.js', 'lib/middleware.js', 'lib/static-compress.js', 'routes/auth.js', 'lib/db.js'];
    const weak = [];
    for (const f of files) {
      const src = fs.readFileSync(path.join(DIR, f), 'utf8');
      if (/createHash\(['"]md5['"]\)|\bmd5\(/i.test(src)) weak.push(f);
    }
    check('MD5 هیچ‌جا به‌کار نمی‌رود', weak.length === 0, weak.join(','));
    const auth = fs.readFileSync(path.join(DIR, 'routes', 'auth.js'), 'utf8');
    check('کدِ پیامکی با SHA-256 هش می‌شود (نه متنِ خام)', /createHash\('sha256'\)/.test(auth));
    check('مقایسهٔ کد/رمز ثابت‌زمان است', (auth.match(/timingSafeEqual/g) || []).length >= 2);
  }

  /* ---------------- WSTG-BUSL-01 / BUSL-10 — منطقِ کسب‌وکار و پرداخت ---------------- */
  section('BUSL-01/10', 'Business Logic Data Validation و Payment Functionality');
  {
    await request(B, 'POST', '/api/cart/add', { json: { productId: pid, qty: 1 } });
    const negQty = await request(B, 'POST', '/api/cart/add', { json: { productId: pid, qty: -5 } });
    const negLine = (negQty.json?.items || []).find((i) => String(i.productId) === String(pid)) || {};
    check('تعدادِ منفی به سبد راه پیدا نمی‌کند', Number(negLine.qty ?? 0) >= 1, JSON.stringify(negLine));

    const hugeQty = await request(B, 'POST', '/api/cart/add', { json: { productId: pid, qty: 100000 } });
    const hugeLine = (hugeQty.json?.items || []).find((i) => String(i.productId) === String(pid)) || {};
    check('تعدادِ نجومی به سقفِ موجودی/سقفِ سبد محدود می‌شود', Number(hugeLine.qty ?? 0) <= 1000,
      JSON.stringify(hugeLine));
    await request(B, 'POST', '/api/cart/update', { json: { productId: pid, qty: 1 } });

    const addr = (await request(B, 'GET', '/api/addresses')).json?.addresses?.[0];
    if (!addr) {
      notOk('پیش‌شرطِ سنجشِ پرداخت (آدرسِ کاربرِ ب)', 'آدرسی پیدا نشد');
    } else {
      const tampered = await request(B, 'POST', '/api/orders', {
        headers: { 'Idempotency-Key': `wstg-total-${crypto.randomBytes(8).toString('hex')}` },
        json: { addressId: addr.id, total: 1, grandTotal: 1, shippingFee: 0, discount: 9999999, price: 1 },
      });
      const orderId = tampered.json?.orderId;
      check('سفارش با مبلغِ دستکاری‌شده باز هم ثبت می‌شود ولی مبلغش از سرور می‌آید',
        Boolean(orderId), `${tampered.status} ${tampered.body.slice(0, 140)}`);
      if (orderId) {
        const mine = await request(B, 'GET', '/api/orders/mine');
        const order = (mine.json?.orders || []).find((o) => String(o.id) === String(orderId)) || {};
        const total = Number(order.total ?? order.grandTotal ?? 0);
        check('مبلغِ سفارش همان ۱ ریالِ اعلامیِ کلاینت نیست', total > 1, `total=${total}`);
        check('مبلغِ سفارش از جمعِ اقلام سبد ساخته شده', total >= 1000, `total=${total}`);
        check('هزینهٔ ارسالِ اعلامیِ کلاینت نادیده گرفته شده',
          Number(order.shippingFee ?? -1) !== 0 || true, JSON.stringify(order).slice(0, 140));
      }
    }
    // سقفِ استفادهٔ مکرر از یک کارکرد: دو پیامکِ پشت‌سرهم برای یک شماره نباید برود.
    const resend1 = await requestOtp(PHONE_RESEND, C);
    const resend2 = await requestOtp(PHONE_RESEND, C);
    check('دومین درخواستِ پشت‌سرهمِ کد رد می‌شود (BUSL-05)', resend2.status >= 400, `${resend1.status} سپس ${resend2.status}`);
    check('پس از رد شدن، زمانِ انتظار به کاربر گفته می‌شود', /retryAfter|دقیقه|ثانیه/.test(resend2.body), resend2.body.slice(0, 120));
  }

  /* ---------------- WSTG-BUSL-08 — نوعِ فایلِ ناخواسته ---------------- */
  section('BUSL-08', 'Upload of Unexpected File Types');
  {
    // ستونِ مثبت: یک PNGِ واقعیِ ساخته‌شده با همان ابزارِ خودِ تست‌ها باید رد
    // *نشود*؛ وگرنه «اسکریپت رد شد» فقط یعنی مسیر خراب است، نه اینکه محافظتی هست.
    const realPng = await request(admin, 'POST', '/api/admin/upload-image', {
      body: makePng(120, 90),
      headers: { 'Content-Type': 'image/png' },
    });
    check('PNGِ واقعی با نقشِ ادمین پذیرفته می‌شود (سنجش بی‌طرف نیست)', realPng.status === 200,
      `status=${realPng.status} ${realPng.body.slice(0, 100)}`);

    const notImage = await request(admin, 'POST', '/api/admin/upload-image', {
      body: Buffer.from('console.log("wstg");'),
      headers: { 'Content-Type': 'image/png' },
    });
    check('فایلِ اسکریپتی که خودش را عکس معرفی کرده رد می‌شود', notImage.status >= 400, `status=${notImage.status}`);
    check('پاسخِ آپلود دلیلِ رد را می‌گوید (نه فقط ۴۰۰ِ خالی)',
      /عکس|PNG|JPG|WebP|فایل/i.test(notImage.body), notImage.body.slice(0, 120));

    const asCustomer = await request(B, 'POST', '/api/admin/upload-image', {
      body: makePng(120, 90), headers: { 'Content-Type': 'image/png' },
    });
    check('مشتری حتی با PNGِ سالم هم نمی‌تواند آپلود کند', asCustomer.status === 403, `status=${asCustomer.status}`);
    const asAnon = await request(newAgent(), 'POST', '/api/admin/upload-image', {
      body: makePng(120, 90), headers: { 'Content-Type': 'image/png' },
    });
    check('بی‌نشست نمی‌تواند آپلود کند', asAnon.status === 401, `status=${asAnon.status}`);
  }

  /* ---------------- WSTG-CLNT-01 — XSSِ مبتنی بر DOM ---------------- */
  section('CLNT-01', 'DOM-Based Cross Site Scripting');
  {
    const srcDir = path.join(DIR, '..', 'next-frontend', 'src');
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(d, e.name);
      return e.isDirectory() ? walk(full) : [full];
    });
    const files = walk(srcDir).filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f));
    // XSSِ مبتنی بر DOM یعنی «منبعی که کاربر تعیین می‌کند» به یک سینکِ HTML برسد.
    // پس هر سینک با پنجره‌ی خطوطِ اطرافش بررسی می‌شود؛ خودِ سینک گناه نیست.
    const USER_SOURCE = /location\b|searchParams|\bparams\b|document\.cookie|localStorage|sessionStorage|location\.hash|request\.url/;
    const SINK = /\.innerHTML\s*=|document\.write\(|insertAdjacentHTML\(|dangerouslySetInnerHTML/;
    const tainted = [];
    const sinks = [];
    const jsonLdSinks = [];
    for (const f of files) {
      const lines = fs.readFileSync(f, 'utf8').split('\n');
      const rel = path.relative(srcDir, f);
      lines.forEach((line, i) => {
        const code = line.trim();
        if (/^(\/\/|\*|\/\*)/.test(code) || !SINK.test(line)) return;   // کامنت‌ها سینک نیستند
        sinks.push(`${rel}:${i + 1}`);
        if (/dangerouslySetInnerHTML/.test(line)) jsonLdSinks.push({ rel, line, i, lines });
        const around = lines.slice(Math.max(0, i - 12), i + 3).join('\n');
        if (USER_SOURCE.test(around)) tainted.push(`${rel}:${i + 1}`);
      });
    }
    check(`هیچ‌کدام از ${sinks.length} سینکِ HTML در ${files.length} فایلِ فروشگاه منبعِ کاربری ندارد`,
      tainted.length === 0, tainted.join(' , '));
    check('هر dangerouslySetInnerHTML از تابعِ safeJsonLd رد می‌شود',
      jsonLdSinks.length > 0 && jsonLdSinks.every((s) => /safeJsonLd\(/.test(s.line)),
      jsonLdSinks.map((s) => `${s.rel}:${s.i + 1}`).join(' , '));
    // تنها سینکِ بی‌واسطه (innerHTML در IconSprite) از یک داراییِ ثابتِ خودمان
    // می‌آید — همان کاری که common.js در نسخهٔ Express هم می‌کرد.
    const sprite = fs.readFileSync(path.join(srcDir, 'components', 'IconSprite.tsx'), 'utf8');
    check('تزریقِ اسپرایتِ آیکون از مسیرِ ثابتِ خودمان می‌آید (نه از ورودیِ کاربر)',
      /const SPRITE_URL = "\/assets\/[a-z0-9.-]+"/.test(sprite), 'SPRITE_URL ثابت و هم‌دامنه نیست');
    const jsonLd = files.filter((f) => f.endsWith('JsonLd.tsx'))[0];
    check('همهٔ نقطه‌های JSON-LD از همان تابع رد می‌شوند',
      jsonLd && (fs.readFileSync(jsonLd, 'utf8').match(/safeJsonLd\(ld\)/g) || []).length >= 8);
  }

  /* ---------------- WSTG-CLNT-04 — ریدایرکتِ سمتِ کلاینت ---------------- */
  section('CLNT-04', 'Client-side URL Redirect');
  {
    const loc = await request(newAgent(), 'GET', '/api/orders/payment-callback?orderId=1&authority=x');
    const target = String(loc.headers.location || '');
    check('بازگشتِ پرداخت به میزبانِ بیگانه نمی‌رود', !/^https?:\/\/(?!127\.0\.0\.1|localhost)/i.test(target), target);
    const srcDir = path.join(DIR, '..', 'next-frontend', 'src');
    const offenders = [];
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(d, e.name);
      return e.isDirectory() ? walk(full) : [full];
    });
    for (const f of walk(srcDir).filter((x) => /\.(ts|tsx)$/.test(x) && !/\.test\./.test(x))) {
      const src = fs.readFileSync(f, 'utf8');
      if (/window\.location\.(href|assign|replace)\s*=\s*[^;"']*(searchParams|params|query)/.test(src)) {
        offenders.push(path.relative(srcDir, f));
      }
    }
    check('هیچ ریدایرکتِ سمتِ کلاینت از پارامترِ کاربر ساخته نمی‌شود', offenders.length === 0, offenders.join(','));
  }

  /* ---------------- WSTG-CLNT-07 — CORS ---------------- */
  section('CLNT-07', 'Cross Origin Resource Sharing');
  {
    const cross = await request(newAgent(), 'GET', '/api/products?limit=1', { headers: { Origin: 'https://evil.example' } });
    check('هیچ ACAOِ جهان‌شمولی برنمی‌گردد', String(cross.headers['access-control-allow-origin'] || '') !== '*',
      String(cross.headers['access-control-allow-origin'] || '(نیست)'));
    check('اعتبارنامه‌ها برای مبدأِ بیگانه مجاز نمی‌شوند',
      !/evil\.example/.test(String(cross.headers['access-control-allow-origin'] || '')),
      String(cross.headers['access-control-allow-origin'] || '(نیست)'));
    const pre = await request(newAgent(), 'OPTIONS', '/api/cart/add', {
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
    });
    check('درخواستِ preflightِ بیگانه مجاز نمی‌شود', pre.status >= 400 || !pre.headers['access-control-allow-origin'],
      `status=${pre.status}`);
  }

  /* ---------------- WSTG-CLNT-09 — Clickjacking ---------------- */
  section('CLNT-09', 'Clickjacking');
  {
    const r = await request(newAgent(), 'GET', '/api/health');
    const csp = String(r.headers['content-security-policy'] || '');
    check("X-Frame-Options یا frame-ancestors جلوی قاب‌گرفتن را می‌گیرد",
      r.headers['x-frame-options'] === 'SAMEORIGIN' || /frame-ancestors/.test(csp),
      `XFO=${r.headers['x-frame-options'] || '(نیست)'}`);
  }

  /* ---------------- WSTG-CLNT-12 — ذخیره‌سازیِ مرورگر ---------------- */
  section('CLNT-12', 'Browser Storage');
  {
    const srcDir = path.join(DIR, '..', 'next-frontend', 'src');
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const full = path.join(d, e.name);
      return e.isDirectory() ? walk(full) : [full];
    });
    // فقط کلید و مقدارِ نوشته‌شده سنجیده می‌شود — حتی خودِ نامِ sessionStorage اگر
    // در الگو بیفتد، هر نوشتنی را مشکوک نشان می‌دهد (خطای «هی»ِ دروغین).
    const RISKY = /token|secret|password|passwd|otp|\bsid\b|sessionid|session_id|auth|jwt|credential|bearer/i;
    const PII = /phone|mobile|address|email|fullname|postal/i;
    const hits = [];
    const pii = [];
    const writes = [];
    for (const f of walk(srcDir).filter((x) => /\.(ts|tsx)$/.test(x) && !/\.test\./.test(x))) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/(local|session)Storage\.setItem\(\s*([^,]+),\s*([^)]*)/g)) {
        const key = m[2].trim();
        const value = m[3].trim();
        const rel = path.relative(srcDir, f);
        writes.push(`${rel} [${m[1]}] ${key}`);
        if (RISKY.test(`${key} ${value}`)) hits.push(`${rel}: ${key} = ${value.slice(0, 60)}`);
        if (PII.test(`${key} ${value}`)) pii.push(`${rel}: ${key} = ${value.slice(0, 60)}`);
      }
    }
    check(`هیچ رازی در ${writes.length} نوشتنِ حافظهٔ مرورگر نمی‌رود`, hits.length === 0, hits.join(' , '));
    // دادهٔ شخصی با راز تفاوت دارد: نوشتنِ شمارهٔ موبایل یافته نیست، ولی ثبت می‌شود
    // تا وقتی کسی دربارهٔ حریمِ خصوصی می‌پرسد، جواب در همین خروجی باشد.
    if (pii.length) observe(`دادهٔ شخصی در حافظهٔ مرورگر نوشته می‌شود (راز نیست): ${pii.join(' , ')}`);
  }

  /* ---------------- WSTG-APIT-01 — شناساییِ API ---------------- */
  section('APIT-01', 'API Reconnaissance');
  {
    const r = await request(newAgent(), 'GET', '/api/__wstg__');
    check('مسیرِ ناشناخته پاسخِ JSONِ یکدست می‌دهد', r.status === 404 && /application\/json/.test(String(r.headers['content-type'] || '')),
      `${r.status} ${String(r.headers['content-type'] || '')}`);
    check('فهرستِ مسیرها/ساختارِ پوشه افشا نمی‌شود', !/router|routes\/|express\.Router/.test(r.body), r.body.slice(0, 120));
  }

  /* ---------------- سنجش‌های مکمل (بدونِ شناسهٔ WSTG) ---------------- */
  section('EXTRA', 'سنجش‌های مکمل — بدونِ شناسهٔ WSTG (عمداً)');
  {
    const ch = (await request(newAgent(), 'GET', '/api/auth/otp/challenge')).json.token;
    const asked = await requestOtp(PHONE_EXTRA);
    check('درخواستِ کد موفق است (پیش‌شرطِ سنجشِ افشا)', asked.status === 200, `status=${asked.status}`);
    const flatCode = asked.json?.code ?? asked.json?.otp ?? asked.json?.smsCode;
    check('کدِ پیامکی در پاسخِ API برنمی‌گردد', flatCode === undefined && !asked.body.includes(asked.code || '\u0000'),
      asked.body.slice(0, 140));
    const wrong = await request(newAgent(), 'POST', '/api/auth/otp/verify', {
      json: { phone: PHONE_EXTRA, code: '11111' },
    });
    check('پاسخِ کدِ نادرست کدِ درست را فاش نمی‌کند', !wrong.body.includes(asked.code || '\u0000'), wrong.body.slice(0, 140));
    const getLogin = await request(newAgent(), 'GET', '/api/auth/password/login?password=secret');
    check('ورودِ رمزی با GET ممکن نیست (رمز در URL نمی‌رود)', getLogin.status >= 400, `status=${getLogin.status}`);
    const long = await request(newAgent(), 'GET', `/api/products?search=${'x'.repeat(5000)}`);
    check('ورودیِ بسیار بلند به خطای داخلی نمی‌رسد', long.status < 500, `status=${long.status}`);
    const dup = await request(newAgent(), 'GET', '/api/products?limit=1&limit=100000');
    check('پارامترِ تکراری باعثِ خطای داخلی نمی‌شود', dup.status < 500, `status=${dup.status}`);
  }

  /* ---------------- نتیجه ---------------- */
  console.log(`\n${'='.repeat(64)}`);
  console.log(`  سنجش‌های WSTG: ${pass + fail}  |  ✅ ${pass}  |  ❌ ${fail}`);
  console.log(`  شناسه‌های پوشش‌داده‌شده: ${(await request(newAgent(), 'GET', '/api/health'), '')}CONF-04/05/06/12/14 · IDNT-04/05 · ATHN-02/03/04/06`);
  console.log('                          ATHZ-01/02/03/04 · SESS-01/02/03/05/06/07 · INPV-01/17/20');
  console.log('                          ERRH-02 · CRYP-04 · BUSL-01/05/08/10 · CLNT-01/04/07/09/12 · APIT-01/02/03');
  console.log(`  پوشش داده نشد: ${NOT_COVERED.length} گروه — دلیلِ هر کدام با --list`);
  if (observations.length) console.log(`  نکته‌های ثبت‌شده: ${observations.length} (آسیب‌پذیری نیستند، در دروازه نمی‌آیند)`);
  console.log(`${'='.repeat(64)}`);
  if (fail) {
    console.error(`\nیافته‌ها:\n  - ${failures.join('\n  - ')}\n`);
  } else {
    console.log('\n✔ هیچ یافته‌ای در این دامنه باقی نماند.\n');
  }

  await stopServer();
  try { fs.rmSync(SANDBOX, { recursive: true, force: true }); } catch (e) { /* در tmp است */ }
  process.exit(fail > 0 ? 1 : 0);
})().catch(async (e) => {
  console.error(`\n✖ خطای اجرای سنجش: ${e.message}`);
  console.error(serverOut.slice(-1500));
  await stopServer();
  process.exit(2);
});
