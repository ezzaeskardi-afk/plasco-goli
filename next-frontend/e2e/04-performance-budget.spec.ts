// ============================================================
// سناریو ۴ — بودجهٔ کارایی (نگهبانِ «سایت کند شد»)
// ============================================================
// چرا این یک آزمون است و نه یک بنچمارکِ دستی: بنچمارکِ دستی فقط همان روز
// خوانده می‌شود که کسی یادش باشد. کندیِ سایت با هیچ نگهبانِ دیگری گرفته
// نمی‌شود — نه typecheck، نه lint، نه ۳۶۲ آزمونِ jsdom (که در آن‌ها هیچ
// بایتی از شبکه رد نمی‌شود). سه چیز این‌جا می‌سنجد و هر سه با *اندازه‌گیریِ
// واقعیِ همین درخت* به‌دست آمده‌اند (نه حدس):
//
//   • TTFBِ HTML — اگر صفحه‌ای از پیش‌رندر/کش بیرون بیفتد و سرِ هر درخواست
//     سفرِ کاملِ API بخورد، همین‌جا دیده می‌شود.
//   • وزنِ کلِ صفحه — اگر کامپوننتِ سنگینی جا بیفتد یا فایلِ بی‌ربطی import شود.
//   • وزنِ *عکس‌ها* — مهم‌ترین lever روی موبایل. با `next/image` عکسِ ۶۴۰pxِ
//     یک کارت ۷-۱۷KB است؛ همان عکس بدونِ بهینه‌سازی ۱۲۰-۱۹۰KB می‌شود. یعنی
//     این عدد تفاوتِ «سایتِ سریع» و «سایتِ کند» است و با یک importِ اشتباه
//     (`<img>` به‌جای `next/image`) بی‌صدا برمی‌گردد.
//
// اعداد فعلیِ اندازه‌گیری‌شده روی همین ماشین (production build، کشِ مرورگر
// خاموش): TTFB ۳-۱۴ms · وزنِ صفحه ۲۰-۱۳۰KB · عکس‌های لیست ۵۶KB در ۹ درخواست.
// بودجه‌ها عمداً چند برابرِ این‌اند تا روی runnerِ کند هم لرزان نباشند، ولی
// از رگرسیونِ واقعی (چند صد کیلوبایت عکسِ بهینه‌نشده) کوچک‌ترند.
import { test, expect, type BrowserContext } from "@playwright/test";

/** بودجه‌ها، به بایت/میلی‌ثانیه. */
const BUDGET = {
  ttfbMs: 1500,          // سرِ هر درخواست، سقفِ انتظار تا اولین بایتِ HTML
  pageBytes: 1200 * 1024, // وزنِ کلِ یک صفحه (منابعِ اجرایی)
  imageBytes: 700 * 1024, // سقفِ عکس‌های یک صفحهٔ لیست
  imageRequest: 150 * 1024, // هیچ عکسِ تکی نباید از این بزرگ‌تر باشد
};

type Measured = {
  ttfbMs: number;
  totalBytes: number;
  imageBytes: number;
  biggestImage: number;
  requests: number;
};

/** کش را خاموش می‌کند تا هر بار واقعاً از شبکه بیاید (وگرنه همه‌چیز ۰ بایت است). */
async function measure(context: BrowserContext, url: string): Promise<Measured> {
  const page = await context.newPage();
  try {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

    // یک بار گرم‌کردن (اولین درخواستِ هر مسیر روی سرورِ تازه، سرد است و
    // اندازه‌گیریِ «کندیِ همیشگی» را با «کندیِ یک‌بارِ اول» قاطی می‌کند).
    await page.goto(url, { waitUntil: "load" }).catch(() => {});
    await page.evaluate(() => performance.clearResourceTimings());

    await page.goto(url, { waitUntil: "load" });
    await page.waitForLoadState("networkidle").catch(() => {});

    return await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
      const rs = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
      const images = rs.filter(
        (r) => r.initiatorType === "img" || /\.(jpe?g|png|webp|avif)(\?|$)/i.test(r.name),
      );
      return {
        ttfbMs: Math.round(nav.responseStart),
        totalBytes: rs.reduce((a, r) => a + (r.transferSize || 0), 0),
        imageBytes: images.reduce((a, r) => a + (r.transferSize || 0), 0),
        biggestImage: images.reduce((a, r) => Math.max(a, r.transferSize || 0), 0),
        requests: rs.length,
      };
    });
  } finally {
    await page.close();
  }
}

/** سه رقم را چاپ می‌کند تا در لاگِ CI دیده شوند — نه فقط «سبز/قرمز». */
function report(label: string, m: Measured) {
  const kb = (b: number) => `${Math.round(b / 1024)}KB`;
  console.log(
    `[بودجهٔ کارایی] ${label}: TTFB ${m.ttfbMs}ms · کل ${kb(m.totalBytes)} · عکس ${kb(m.imageBytes)}`
    + ` (بزرگ‌ترین ${kb(m.biggestImage)}) · ${m.requests} درخواست`
  );
}

test("صفحه‌های اصلی از بودجهٔ کارایی بیرون نمی‌زنند", async ({ browser }) => {
  const baseURL = process.env.PG_E2E_WEB!;
  const context = await browser.newContext();

  try {
    // شناسهٔ محصولِ نمونه از خودِ API — وگرنه به دادهٔ درخت گره می‌خوردیم.
    const list = await context.request.get("/api/products?limit=1");
    expect(list.ok()).toBe(true);
    const first = ((await list.json()).products ?? [])[0];
    expect(first?.id, "برای سنجشِ صفحهٔ محصول، دست‌کم یک محصول لازم است").toBeTruthy();

    const pages: Array<[string, Measured]> = [];
    for (const path of ["/", "/products", `/product/${first.id}`, "/cart"]) {
      pages.push([path, await measure(context, baseURL + path)]);
    }

    for (const [path, m] of pages) {
      report(path, m);
      expect(m.ttfbMs, `TTFBِ ${path} از بودجه بیرون زده`).toBeLessThan(BUDGET.ttfbMs);
      expect(m.totalBytes, `وزنِ ${path} از بودجه بیرون زده`).toBeLessThan(BUDGET.pageBytes);
      expect(m.imageBytes, `عکس‌های ${path} از بودجه بیرون زده`).toBeLessThan(BUDGET.imageBytes);
      expect(m.biggestImage, `یک عکسِ ${path} بسیار سنگین است`).toBeLessThan(BUDGET.imageRequest);
    }

    // صفحهٔ لیست باید واقعاً عکس هم نشان بدهد — وگرنه «سبزیِ خالی» است:
    // اگر روزی عکس‌ها کلاً نیایند، بودجه‌ها خودبه‌خود رعایت می‌شوند.
    const listing = pages.find(([p]) => p === "/products")![1];
    expect(listing.imageBytes, "صفحهٔ محصولات هیچ عکسی بار نکرده — سنجش بی‌معناست")
      .toBeGreaterThan(0);
  } finally {
    await context.close();
  }
});
