// ============================================================
// تست بارِ ۲۰ مشتریِ هم‌زمان روی سایتِ زندهٔ dev
// ------------------------------------------------------------
// هر «مشتری» یک context مرورگرِ مستقل است (کوکی و نشستِ جدا) که کلِ قیفِ
// خرید را می‌رود: خانه → دسته → جست‌وجو → علاقه‌مندی → افزودن به سبد →
// صفحهٔ محصول → سبد → تسویه (آدرس) → درگاه (callback) → نتیجهٔ سفارش.
// بعد از قیف، خودش از /api/orders/mine چک می‌کند سفارش paid شده و سبد خالی
// مانده. سپس یک مرحلهٔ ادمین: پرداخت‌شده‌های همین تست از پنل «ارسال» می‌شوند.
//
// چه چیزی ثبت می‌شود: هر درخواستِ هم‌مبدأ با کدِ وضعیت و مدت (ms)، خطاهای
// کنسول/صفحه، درخواست‌های شکست‌خورده، و «اتفاقِ صفحهٔ سبز» (اسکلتونِ گیرکرده
// یا بدنهٔ خالی بعد از ناوبری). خروجی: گزارشِ لحظه‌ای روی stdout + فایل‌های
// progress.log و report.json و summary.txt در LT_OUT.
//
// اجرا (دو سرورِ dev باید بالا باشند — StartSite یا معادلش):
//   npm run loadtest
//   LT_USERS=6 LT_START=8 LT_SEED=42 npm run loadtest   ← یک تکه از یک جمعِ بزرگ‌تر
//
// نکته‌های سقفِ پیامک (چرا اجراها گاهی زودتر تمام می‌شوند): هر شماره سقفِ
// روزانهٔ پیامک دارد، هر IP در پنجرهٔ ۱۰ دقیقه‌ای فقط ۲۰ درخواستِ OTP می‌گیرد
// و سقفِ روزانهٔ IP پیش‌فرض ۳۰ است. برای بارِ سنگین‌تر، بک‌اند را با
// `MAX_SMS_PER_IP_PER_DAY=200` بالا بیاورید و بین دسته‌ها پنجره را باز بگذارید.
// متغیرها: LT_USERS (پیش‌فرض ۲۰)، LT_SEED، LT_OUT، LT_SITE، LT_START،
// LT_ADMIN=0 (خاموشیِ فازِ ادمین)، LT_ONLY_ADMIN=1 + LT_PHONES=a,b,…
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const SITE = process.env.LT_SITE || "http://localhost:3001";
const LOG = process.env.LT_BACKEND_LOG || "E:/claude/polasco-goli/backend/logs/local-start.log";
const OUT = process.env.LT_OUT || "C:/Users/Ezza/AppData/Local/Temp/opencode/loadtest";
const COUNT = Number(process.env.LT_USERS || 20);
const SEED = process.env.LT_SEED || "1";
const START = Number(process.env.LT_START || 0);
const ADMIN_PHONE = process.env.LT_ADMIN_PHONE || "09113567409";
const RUN_ADMIN = process.env.LT_ADMIN !== "0";
const ONLY_ADMIN = process.env.LT_ONLY_ADMIN === "1";

fs.mkdirSync(OUT, { recursive: true });
const progressPath = path.join(OUT, "progress.log");
fs.writeFileSync(progressPath, "");

const t0 = Date.now();
const el = () => ((Date.now() - t0) / 1000).toFixed(1).padStart(7);
const log = (line) => {
  const s = `[LT ${el()}s] ${line}`;
  console.log(s);
  fs.appendFileSync(progressPath, s + "\n");
};

// ---------- تلمتری ----------
const metrics = [];   // { u, m, s, d, at }
const incidents = []; // { at, user, kind, detail }
const consoleErrors = [];
const requests = { finished: 0, failed: 0 };

function normUrl(raw) {
  try {
    const u = new URL(raw);
    if (!raw.startsWith(SITE)) return null;
    return u.pathname
      .replace(/\/\d+(?=\/|$)/g, "/:id")
      .replace(/_rsc=[^&]*/g, "")
      .replace(/\/$/, "") || "/";
  } catch { return null; }
}

function instrument(page, userName) {
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push({ at: Date.now() - t0, user: userName, msg: m.text().slice(0, 300) });
  });
  page.on("pageerror", (e) => consoleErrors.push({ at: Date.now() - t0, user: userName, msg: `pageerror: ${String(e).slice(0, 300)}` }));
  page.on("requestfinished", async (req) => {
    try {
      const res = await req.response();
      const u = normUrl(req.url());
      if (!u) return;
      const timing = req.timing();
      const d = timing.responseEnd > 0 ? timing.responseEnd - timing.requestStart : -1;
      metrics.push({ u, m: req.method(), s: res ? res.status() : 0, d, at: Date.now() - t0 });
      requests.finished++;
    } catch { /* صفحة بسته شده */ }
  });
  page.on("requestfailed", (req) => {
    if (!req.url().startsWith(SITE)) return;
    const err = req.failure()?.errorText || "";
    if (err.includes("ERR_ABORTED")) return; // پیش‌واکشیِ قطع‌شده — نرمالِ Next
    requests.failed++;
    incidents.push({ at: Date.now() - t0, user: userName, kind: "requestfailed", detail: `${req.method()} ${req.url().slice(0, 160)} — ${err}` });
  });
}

/** ناوبری با دیده‌بانیِ «صفحهٔ سبز»: بعد از هر goto، بدنه و اسکلتون را چک کن. */
async function gotoWatched(page, userName, url, label) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  // پنجرهٔ ۲.۵ ثانیه‌ای: اگر بدنه خالی/اسکلتون بود، رخداد ثبت کن
  const start = Date.now();
  let lastState = null;
  while (Date.now() - start < 2500) {
    lastState = await page.evaluate(() => {
      const bodyLen = document.body.innerText.trim().length;
      const skeleton = Boolean(document.querySelector(".animate-pulse"));
      return { bodyLen, skeleton };
    }).catch(() => null);
    if (lastState && lastState.bodyLen > 1200 && !lastState.skeleton) break;
    await page.waitForTimeout(150);
  }
  if (lastState && (lastState.bodyLen < 800 || lastState.skeleton)) {
    incidents.push({
      at: Date.now() - t0, user: userName, kind: "blank-or-skeleton",
      detail: `${label} url=${url} bodyLen=${lastState.bodyLen} skeleton=${lastState.skeleton}`,
    });
    await page.screenshot({ path: path.join(OUT, `incident-${userName}-${label.replace(/[^\w-]/g, "_")}.png`) }).catch(() => {});
  }
  return lastState;
}

async function withTimeout(promise, ms, what) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`TIMEOUT(${ms}ms): ${what}`)), ms); }),
    ]);
  } finally { clearTimeout(timer); }
}

function readOtpFor(phone, afterByte, timeoutMs = 25_000) {
  const deadline = Date.now() + timeoutMs;
  const pattern = new RegExp(`${phone}: (\\d{5})`, "g");
  return new Promise((resolve) => {
    const tick = () => {
      try {
        const text = fs.readFileSync(LOG).subarray(afterByte).toString("utf8");
        const m = [...text.matchAll(pattern)];
        if (m.length) return resolve(m[m.length - 1][1]);
      } catch {}
      if (Date.now() > deadline) return resolve(null);
      setTimeout(tick, 200);
    };
    tick();
  });
}

function phoneFor(i) {
  // 0915 + 7 رقم؛ با SEED و START یکتا می‌شود (چند پروسهٔ موازی)
  const n = (Number(SEED) * 1000 + START + i) % 10_000_000;
  return `0915${String(n).padStart(7, "0")}`;
}

/** کلیک روی «دریافت کد ورود» با تحملِ ۴۲۹ (محدودیتِ نرخِ IP — رفتارِ درستِ سرور). */
async function requestOtpWithRetry(page, phone, tries = 3) {
  for (let a = 0; a < tries; a++) {
    const mark = fs.statSync(LOG).size;
    const replied = page.waitForResponse((r) => r.url().includes("/api/auth/otp/request"), { timeout: 30_000 });
    await page.getByRole("button", { name: "دریافت کد ورود" }).click();
    const res = await replied;
    if (res.status() === 429) {
      const body = await res.json().catch(() => ({}));
      const waitS = Math.min(Number(body.retryAfter) || Number(body.data?.retryAfter) || 35, 45);
      log(`OTP 429 برای ${phone} (${body.error || "بدون پیام"}) — صبر ${waitS}s، تلاش ${a + 1}/${tries}`);
      await wait(waitS * 1000 + 800);
      continue;
    }
    const code = await readOtpFor(phone, mark);
    if (code) return code;
    await wait(1500);
  }
  return null;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- هر مشتری ----------
async function customer(browser, i) {
  const userName = `u${START + i}`;
  const phone = phoneFor(i);
  const steps = {};
  const result = { user: userName, phone, ok: false, orderId: null };
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "fa-IR" });
  const page = await ctx.newPage();
  instrument(page, userName);
  const t = (k) => (steps[k] = Date.now());
  const since = (k) => Date.now() - steps[k];

  try {
    // ۱) ورود
    t("login");
    await page.goto(`${SITE}/login?redirect=${encodeURIComponent("/products")}`, { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("۰۹۱۲۳۴۵۶۷۸۹").fill(phone);
    const code = await requestOtpWithRetry(page, phone);
    if (!code) throw new Error("OTP نیامد (پس از تلاش‌های مکرر)");
    const boxes = page.locator('input[autocomplete="one-time-code"]');
    await boxes.first().waitFor({ timeout: 10_000 });
    for (let k = 0; k < 5; k++) await boxes.nth(k).fill(code[k]);
    // مرحلهٔ نام برای کاربرِ تازه
    const nameBox = page.getByPlaceholder("نام و نام خانوادگی");
    const deadline = Date.now() + 20_000;
    let sawName = false;
    while (Date.now() < deadline) {
      if (await nameBox.isVisible().catch(() => false)) { sawName = true; break; }
      if (!page.url().includes("/login")) break;
      await page.waitForTimeout(150);
    }
    if (sawName) {
      await nameBox.fill(`مشتری بار ${START + i + 1}`);
      await page.getByRole("button", { name: "ورود به فروشگاه" }).click();
    }
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25_000 });
    result.loginMs = since("login");

    // ۲) خانه — دیده‌بانیِ صفحهٔ سبز
    await gotoWatched(page, userName, `${SITE}/`, "home");
    await wait(400);
    // دسته، اگر روی صفحه بود (بهترین‌تلاش)
    const catLink = page.locator('a[href^="/category/"]').first();
    if (await catLink.count()) {
      await catLink.click().catch(() => {});
      await wait(900);
    }

    // ۳) محصولات + جست‌وجو (بهترین‌تلاش — قیف نباید به آن گره بخورد)
    await gotoWatched(page, userName, `${SITE}/products`, "products");
    try {
      const search = page.getByRole("searchbox", { name: "جستجو در محصولات" }).first();
      if (await search.count()) {
        await search.fill("ظرف", { timeout: 5000 });
        await search.press("Enter");
        await page.waitForTimeout(1400);
      }
    } catch (e) {
      result.searchIssue = String(e).slice(0, 160);
    }
    const addButtons = page.locator('button[aria-label*="به سبد خرید"]:not([disabled])');
    await addButtons.first().waitFor({ timeout: 20_000 });

    // ۴) علاقه‌مندی (اولین قلبِ خالی)
    const heart = page.locator('button[aria-label="افزودن به علاقه‌مندی‌ها"]').first();
    if (await heart.count()) {
      await heart.click().catch(() => {});
      await page.waitForTimeout(400);
    }

    // ۵) افزودن به سبد + صفحهٔ محصول
    await addButtons.first().click();
    await page.waitForTimeout(500);
    const productLink = page.locator('a[href^="/product/"]').first();
    if (await productLink.count()) {
      await productLink.click();
      await wait(1200);
      result.productUrl = page.url();
    }

    // ۶) سبد → تسویه
    await gotoWatched(page, userName, `${SITE}/cart`, "cart");
    await page.locator('a[href="/checkout"]').click({ timeout: 15_000 });
    await page.waitForURL(/\/checkout/, { timeout: 20_000 });
    await wait(600);

    // ۷) آدرس (کاربرِ تازه فرم باز است)
    await page.locator("#coFullName").fill(`مشتری بار ${START + i + 1}`);
    await page.locator("#coPhone").fill(phone);
    const sari = i % 2 === 1;
    await page.locator("#coProvince").fill(sari ? "مازندران" : "تهران");
    await page.locator("#coCity").fill(sari ? "ساری" : "تهران");
    await page.locator("#coAddressLine").fill(`خیابان بار، کوچهٔ ${START + i + 1}، پلاک ۱`);
    await page.getByRole("button", { name: "ثبت", exact: true }).click();

    // ۸) پرداخت → callback → نتیجه
    const pay = page.getByRole("button", { name: "پرداخت و ثبت سفارش" });
    await pay.waitFor({ timeout: 20_000 });
    await withTimeout((async () => {
      await pay.click();
      await page.waitForURL(/\/order-success\?orderId=\d+/, { timeout: 40_000 });
    })(), 60_000, "payment-roundtrip");
    result.orderId = Number(/orderId=(\d+)/.exec(page.url())?.[1]) || null;
    result.payMs = since("login");

    // ۹) مهرِ نهایی از API خودِ مرورگر
    const mine = await page.request.get(`${SITE}/api/orders/mine`);
    const body = await mine.json().catch(() => ({}));
    const placed = (body.orders || []).find((o) => o.id === result.orderId);
    result.orderStatus = placed?.status || null;
    result.total = placed?.total ?? null;
    const cart = await page.request.get(`${SITE}/api/cart`);
    const cartBody = await cart.json().catch(() => ({}));
    result.cartEmpty = (cartBody.items || []).length === 0;
    result.ok = result.orderStatus === "paid" && result.cartEmpty === true;
    if (!result.ok) {
      incidents.push({ at: Date.now() - t0, user: userName, kind: "order-not-paid", detail: JSON.stringify({ orderId: result.orderId, status: result.orderStatus, cartEmpty: result.cartEmpty }) });
    }
  } catch (e) {
    result.error = String(e).slice(0, 300);
    incidents.push({ at: Date.now() - t0, user: userName, kind: "customer-flow-error", detail: result.error });
    await page.screenshot({ path: path.join(OUT, `fail-${userName}.png`) }).catch(() => {});
  } finally {
    await ctx.close().catch(() => {});
  }
  return result;
}

// ---------- مرحلهٔ ادمین: ارسالِ سفارش‌های همین تست ----------
async function adminShip(browser, loadPhones, howMany) {
  const result = { shipped: [], errors: [] };
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: "fa-IR" });
  const page = await ctx.newPage();
  instrument(page, "admin");
  try {
    // ورود ادمین (بدون TOTP در dev)
    await page.goto(`${SITE}/login?redirect=${encodeURIComponent("/admin/orders")}`, { waitUntil: "domcontentloaded" });
    await page.getByPlaceholder("۰۹۱۲۳۴۵۶۷۸۹").fill(ADMIN_PHONE);
    const code = await requestOtpWithRetry(page, ADMIN_PHONE);
    if (!code) throw new Error("OTP ادمین نیامد (پس از تلاش‌های مکرر)");
    const boxes = page.locator('input[autocomplete="one-time-code"]');
    await boxes.first().waitFor({ timeout: 10_000 });
    for (let k = 0; k < 5; k++) await boxes.nth(k).fill(code[k]);
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 25_000 });
    await page.goto(`${SITE}/admin/orders`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);

    // تبِ «پرداخت‌شده»
    const tab = page.locator("button", { hasText: /پرداخت‌شده/ }).first();
    if (await tab.count()) { await tab.click(); await page.waitForTimeout(1800); }

    const rows = page.locator("ul.space-y-2 > li button");
    const n = await rows.count();
    for (let i = 0; i < n && result.shipped.length < howMany; i++) {
      const text = await rows.nth(i).evaluate((el2) => el2.innerText.replace(/\s+/g, " "));
      if (!loadPhones.some((p) => text.includes(p))) continue;
      await rows.nth(i).click();
      await page.waitForTimeout(900);
      const ship = page.locator("button", { hasText: /^ارسال شد$/ }).first();
      if (!(await ship.count())) { result.errors.push(`row ${i}: دکمهٔ ارسال شد نبود — ${text.slice(0, 90)}`); continue; }
      await ship.click();
      await page.waitForTimeout(1600);
      const state = await page.evaluate(() => ({
        toast: document.body.innerText.match(/وضعیت به «[^»]+» تغییر کرد/)?.[0] || null,
        pill: [...document.querySelectorAll("span")].map((s) => s.textContent?.trim()).find((tt) => ["ارسال‌شده", "تحویل‌شده", "پرداخت‌شده"].includes(tt || "")) || null,
      }));
      result.shipped.push({ row: i, rowText: text.slice(0, 100), ...state });
      await page.waitForTimeout(400);
    }
    if (!result.shipped.length) result.errors.push("هیچ سفارشِ تستی در تبِ پرداخت‌شده پیدا نشد");
    await page.screenshot({ path: path.join(OUT, "admin-shipped.png") });
  } catch (e) {
    result.errors.push(String(e).slice(0, 300));
    await page.screenshot({ path: path.join(OUT, "admin-ship-fail.png") }).catch(() => {});
  } finally {
    await ctx.close().catch(() => {});
  }
  return result;
}

// ---------- اجرا ----------
const browser = await chromium.launch();

// تیکِ پیشرفتِ لحظه‌ای
const progressTimer = setInterval(() => {
  const slow = metrics.filter((m) => m.d > 1500).length;
  const bad = metrics.filter((m) => m.s >= 400).length;
  log(`درجریان — درخواست:${requests.finished} کند(>1.5s):${slow} خطا:${bad + requests.failed} رخداد:${incidents.length}`);
}, 5000);

log(ONLY_ADMIN ? "شروع — فقط فازِ ادمین" : `شروع — ${COUNT} مشتری از ${SITE} (SEED=${SEED} START=${START})`);
let results = [];
if (!ONLY_ADMIN) {
  results = await Promise.all(
    Array.from({ length: COUNT }, (_, i) => (async () => { await wait(i * 300); return customer(browser, i); })()),
  );
  const okCount = results.filter((r) => r.ok).length;
  log(`قیفِ خرید تمام — موفق: ${okCount}/${COUNT}`);
}

const loadPhones = ONLY_ADMIN
  ? (process.env.LT_PHONES || "").split(",").map((s) => s.trim()).filter(Boolean)
  : results.map((r) => r.phone);
const adminResult = RUN_ADMIN && loadPhones.length ? await adminShip(browser, loadPhones, Number(process.env.LT_SHIP_COUNT || 3)) : null;
log(adminResult
  ? `مرحلهٔ ادمین — ارسال‌شده: ${adminResult.shipped.length}${adminResult.errors.length ? ` خطا: ${adminResult.errors.join(" | ")}` : ""}`
  : "مرحلهٔ ادمین — غیرفعال یا بدونِ شمارهٔ تست");

clearInterval(progressTimer);
await browser.close();

const okCount = results.filter((r) => r.ok).length;

// ---------- گزارش ----------
const byEndpoint = new Map();
for (const m of metrics) {
  const key = `${m.m} ${m.u}`;
  if (!byEndpoint.has(key)) byEndpoint.set(key, { count: 0, durs: [], bad: 0 });
  const e = byEndpoint.get(key);
  e.count++;
  e.durs.push(m.d);
  if (m.s >= 400) e.bad++;
}
const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const endpoints = [...byEndpoint.entries()].map(([k, e]) => ({
  endpoint: k, count: e.count, bad: e.bad,
  p50: pct(e.durs, 50), p95: pct(e.durs, 95), max: Math.max(...e.durs),
})).sort((a, b) => (b.p95 ?? 0) - (a.p95 ?? 0));

const slowest = [...metrics].filter((m) => m.d > 0).sort((a, b) => b.d - a.d).slice(0, 20);

const summary = {
  ranAt: new Date().toISOString(),
  site: SITE, users: COUNT, seed: SEED, start: START,
  durationSec: Number(((Date.now() - t0) / 1000).toFixed(1)),
  funnel: {
    ok: okCount, failed: COUNT - okCount,
    loginMs: results.map((r) => r.loginMs).filter(Boolean),
    payMs: results.map((r) => r.payMs).filter(Boolean),
    orders: results.filter((r) => r.orderId).map((r) => ({ user: r.user, orderId: r.orderId, status: r.orderStatus, total: r.total })),
  },
  requests: { finished: requests.finished, failed: requests.failed },
  httpErrors: metrics.filter((m) => m.s >= 400).reduce((acc, m) => {
    const k = `${m.s} ${m.m} ${m.u}`; acc[k] = (acc[k] || 0) + 1; return acc;
  }, {}),
  endpoints,
  slowest,
  incidents,
  consoleErrors: consoleErrors.slice(0, 100),
  adminShip: adminResult,
  results,
};

fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify(summary, null, 2));
const lines = [];
lines.push(`تست بار — ${COUNT} مشتری — ${summary.durationSec}s`);
lines.push(`قیف: ${okCount}/${COUNT} موفق`);
lines.push(`درخواست‌ها: ${requests.finished} (شکست‌خورده: ${requests.failed})`);
lines.push(`میانهٔ ورود: ${pct(summary.funnel.loginMs, 50) ?? "-"}ms | میانهٔ تا پرداخت: ${pct(summary.funnel.payMs, 50) ?? "-"}ms`);
lines.push("— کندترین endpointها (p95) —");
for (const e of endpoints.slice(0, 15)) lines.push(`  ${String(e.p95).padStart(6)}ms p95 | ${String(e.count).padStart(4)}x | خطا:${e.bad} | ${e.endpoint}`);
lines.push("— کندترین درخواست‌ها —");
for (const s of slowest.slice(0, 10)) lines.push(`  ${String(s.d).padStart(6)}ms | ${s.s} | ${s.m} ${s.u} @${(s.at / 1000).toFixed(1)}s`);
lines.push(`— خطاهای HTTP —`);
lines.push(Object.keys(summary.httpErrors).length ? Object.entries(summary.httpErrors).map(([k, v]) => `  ${v}x ${k}`).join("\n") : "  هیچ");
lines.push(`— رخدادها (${incidents.length}) —`);
for (const inc of incidents.slice(0, 20)) lines.push(`  [${(inc.at / 1000).toFixed(1)}s] ${inc.user} ${inc.kind}: ${inc.detail}`);
fs.writeFileSync(path.join(OUT, "summary.txt"), lines.join("\n"));
console.log("\n" + lines.join("\n"));
