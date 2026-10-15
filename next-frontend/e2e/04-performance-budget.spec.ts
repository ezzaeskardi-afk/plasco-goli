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
// ---------- دورِ دوم: بودجه‌ها از «ایمن» به «واقعی» تنگ شدند ----------
// دورِ اول بودجه‌ها را عمداً گشاد گذاشته بود (TTFB < ۱٫۵s، صفحه < ۱٫۲MB) تا
// روی runnerِ کند لرزان نباشد. ولی یک اشکال داشت که فقط با اندازه‌گیری معلوم
// شد: **اندازه‌گیریِ بایت به کندیِ runner حساس نیست.** وزنِ صفحه روی هر ماشینی
// همان است؛ فقط زمان لرزان است. پس گشاد بودنِ بودجه‌ی بایتی هیچ لرزشی را
// نمی‌خرید و فقط دو رگرسیونِ واقعی را بی‌صدا رد می‌کرد:
//
//   ۱. `/products` بدونِ آن‌که کسی بفهمد ۱۰ رندرِ سمتِ سرورِ صفحهٔ محصول را
//      پیش‌واکشی می‌کرد (۷۴٫۴KB = ۲۱٪ وزنِ صفحه).
//   ۲. عکسِ تزئینیِ صفحهٔ خانه به‌شکلِ کاملِ ۹۲۱px می‌آمد: ۵۳٫۷KB در برابر
//      ۱۶٫۵KB پس از عبور از `next/image`.
//
// اعدادِ فعلیِ **اندازه‌گیری‌شده** (production build، کشِ مرورگر خاموش، پس از
// یک دور گرم‌کردنِ هر مسیر) روی چهار مسیرِ پرترافیک:
//
//   TTFB ۳-۱۸ms · وزن ۲۳۴-۳۴۲KB · عکس ۱۵-۵۹KB · بزرگ‌ترین عکس ۱۶٫۵KB
//   · پیش‌واکشیِ صفحهٔ محصول روی فهرست: ۰
//
// ---- چرا سقفِ وزن ۴۲۰KB است و نه ۳۳۰KB: یک نوسانِ اندازه‌گیریِ واقعی ----
// در اجراهای پشتِ‌سرِهمِ همین هارنس، `/` یک بار ۲۷۰KB و یک بار ۳۴۲KB خوانده شد —
// با همان ۴۶ درخواست و همان ۵۹KB عکس. تفاضل ۷۲KB دقیقاً سه فایلِ فونتِ وزیر
// (۲۴٫۴ + ۲۳٫۹ + ۲۰٫۶ = ۶۸٫۹KB) است: وقتی از حافظهٔ مرورگر می‌آیند،
// `transferSize`شان صفر می‌شود و از جمع بیرون می‌مانند. این همان درسی است که
// ثبتش ارزش دارد: **سقفِ بایتی نباید از خودِ نوسانِ ابزار تنگ‌تر باشد**، وگرنه
// به شیر یا خط تبدیل می‌شود. پس سقف روی بدترین حالتِ دیده‌شده نشست (۳۴۲KB + ۲۳٪)
// و تیزیِ نگهبانی به سه ادعای زیر سپرده شد که قطعی‌اند: شمارِ پیش‌واکشی
// (از خودِ درخواست‌های شبکه)، بزرگ‌ترین عکس، و وزنِ عکس‌ها.
import { test, expect, type BrowserContext } from "@playwright/test";

/** بودجه‌ها، به بایت/میلی‌ثانیه. */
const BUDGET = {
  ttfbMs: 1500,             // سرِ هر درخواست، سقفِ انتظار تا اولین بایتِ HTML
  pageBytes: 420 * 1024,    // وزنِ کلِ یک صفحه — اندازه‌گیری‌شده: ۲۳۴-۳۴۲KB (نوسانِ فونت)
  imageBytes: 120 * 1024,   // عکس‌های یک صفحه — اندازه‌گیری‌شده: ۱۵-۵۹KB
  imageRequest: 40 * 1024,  // هیچ عکسِ تکی بزرگ‌تر از این — اندازه‌گیری‌شده: ۱۶٫۵KB
  // پیش‌واکشیِ صفحهٔ محصول روی **فهرست** باید صفر بماند.
  //
  // چرا صفر و نه «کم»: `next/link` پیش‌فرض هر لینکِ دیده‌شده را پیش‌واکشی
  // می‌کند و هر پیش‌واکشی یک رندرِ کاملِ سمتِ سرور است. روی یک فهرست، این عدد
  // با تعدادِ کارت‌های روی صفحه بالا می‌رود — یعنی دقیقاً مکانیزمی که در جهتِ
  // اشتباه رشد می‌کند. `prefetch={false}` فقط پیش‌واکشیِ «دیدن» را می‌بندد؛
  // هاور و لمس همچنان پیش‌واکشی می‌کنند، پس ناوبریِ کاربر سریع می‌ماند.
  productPrefetch: 0,
};

type Measured = {
  ttfbMs: number;
  totalBytes: number;
  imageBytes: number;
  biggestImage: number;
  fontBytes: number;
  requests: number;
  productPrefetch: number;
  productPrefetchBytes: number;
  optimizerErrors: string[];
};

/** کش را خاموش می‌کند تا هر بار واقعاً از شبکه بیاید (وگرنه همه‌چیز ۰ بایت است). */
async function measure(context: BrowserContext, url: string): Promise<Measured> {
  const page = await context.newPage();
  try {
    // شمارِ پیش‌واکشیِ صفحهٔ محصول از روی **خودِ درخواست‌ها**.
    // چرا فقط از روی resource timing کافی نیست: هر `?_rsc=` یک رندرِ کاملِ
    // سمتِ سرور است و هزینه‌ی اصلی‌اش (بارِ سرور + سه فراخوانیِ API) در
    // `transferSize` دیده نمی‌شود. شمارشِ درخواست‌ها هر دو را می‌گیرد و بایتش
    // از همان `rs` خوانده می‌شود تا دو منبعِ اندازه‌گیری قاطی نشوند.
    let productPrefetch = 0;
    page.on("request", (r) => {
      if (/\/product\/\d+\?_rsc=/.test(r.url())) productPrefetch++;
    });

    // بهینه‌سازِ عکسِ Next اگر مسیرِ مبدأ را نپذیرد با ۴xx/۵xx جواب می‌دهد و
    // تصویرِ شکسته می‌نشیند — کاری که هیچ ادعای بایتی نمی‌گیرد (بدنهٔ خطا هم
    // چند بایت است). این نگهبان دقیقاً همان را می‌گیرد و مستقیم به مهاجرتِ
    // `/` به `next/image` گره خورده است.
    const optimizerErrors: string[] = [];
    page.on("response", (r) => {
      if (r.url().includes("/_next/image") && r.status() >= 400) {
        optimizerErrors.push(`${r.status()} ${r.url()}`);
      }
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

    // یک بار گرم‌کردن (اولین درخواستِ هر مسیر روی سرورِ تازه، سرد است و
    // اندازه‌گیریِ «کندیِ همیشگی» را با «کندیِ یک‌بارِ اول» قاطی می‌کند).
    await page.goto(url, { waitUntil: "load" }).catch(() => {});
    await page.evaluate(() => performance.clearResourceTimings());

    await page.goto(url, { waitUntil: "load" });
    await page.waitForLoadState("networkidle").catch(() => {});

    // شمارنده در Node زندگی می‌کند و داخل صفحه دیده نمی‌شود؛ پس صریح پاس می‌شود.
    const measured = await page.evaluate((prefetchCount) => {
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
        fontBytes: rs.filter((r) => /\.woff2(\?|$)/i.test(r.name))
          .reduce((a, r) => a + (r.transferSize || 0), 0),
        requests: rs.length,
        productPrefetch: prefetchCount,
        productPrefetchBytes: rs
          .filter((r) => /\/product\/\d+\?_rsc=/.test(r.name))
          .reduce((a, r) => a + (r.transferSize || 0), 0),
      };
    }, productPrefetch);

    return { ...measured, optimizerErrors };
  } finally {
    await page.close();
  }
}

/** هر رقم را چاپ می‌کند تا در لاگِ CI دیده شوند — نه فقط «سبز/قرمز». */
function report(label: string, m: Measured) {
  const kb = (b: number) => `${Math.round(b / 1024)}KB`;
  console.log(
    `[بودجهٔ کارایی] ${label}: TTFB ${m.ttfbMs}ms · کل ${kb(m.totalBytes)} · عکس ${kb(m.imageBytes)}`
    + ` (بزرگ‌ترین ${kb(m.biggestImage)}) · فونت ${kb(m.fontBytes)} · ${m.requests} درخواست`
    + ` · پیش‌واکشیِ محصول ${m.productPrefetch}`
    + (m.productPrefetch ? ` (${kb(m.productPrefetchBytes)})` : "")
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

      // ---------- پیش‌واکشیِ صفحهٔ محصول — **پیش از** بودجه‌های عمومی ----------
      // ترتیب این‌جا تصادفی نیست: دامنهٔ جهش نشان داد که با برگرداندنِ
      // `prefetch={false}` وزنِ `/products` به ۳۴۸KB می‌رسد و ادعای عمومیِ وزن
      // **پیش از** این ادعا می‌افتد. نتیجه‌اش این بود که پیامِ دقیق («هر کارت
      // پیش‌واکشی می‌شود») هیچ‌وقت چاپ نمی‌شد و لنگر «گرفته نشد» ثبت می‌کرد —
      // یعنی نگهبانی که کارِ درست را می‌کند ولی گزارشِ بی‌دردسر نمی‌دهد.
      // پس تشخیصِ خاص اول می‌آید. خانه و فهرست هر دو صفر می‌مانند؛ صفحهٔ محصول
      // و سبد لینکِ محصولِ پرشمار ندارند و این‌جا سنجیده نمی‌شوند.
      if (path === "/" || path === "/products") {
        expect(
          m.productPrefetch,
          `پیش‌واکشیِ صفحهٔ محصول در ${path} — هر پیش‌واکشی یک رندرِ کاملِ سمتِ سرور است`,
        ).toBe(BUDGET.productPrefetch);
      }

      expect(m.ttfbMs, `TTFBِ ${path} از بودجه بیرون زده`).toBeLessThan(BUDGET.ttfbMs);
      expect(m.totalBytes, `وزنِ ${path} از بودجه بیرون زده`).toBeLessThan(BUDGET.pageBytes);
      expect(m.imageBytes, `عکس‌های ${path} از بودجه بیرون زده`).toBeLessThan(BUDGET.imageBytes);
      expect(m.biggestImage, `یک عکسِ ${path} بسیار سنگین است`).toBeLessThan(BUDGET.imageRequest);
      // و تصویر باید واقعاً **سالم** برگردد، نه فقط سبک. یک URLِ خرابِ
      // بهینه‌ساز بایتِ کم می‌فرستد (بدنهٔ خطا) و از بودجه‌ی بایتی رد نمی‌شود.
      expect(m.optimizerErrors, `بهینه‌سازِ عکسِ Next در ${path} خطا داد`).toEqual([]);
    }

    const listing = pages.find(([p]) => p === "/products")![1];

    // صفحهٔ لیست باید واقعاً عکس هم نشان بدهد — وگرنه «سبزیِ خالی» است:
    // اگر روزی عکس‌ها کلاً نیایند، بودجه‌ها خودبه‌خود رعایت می‌شوند.
    expect(listing.imageBytes, "صفحهٔ محصولات هیچ عکسی بار نکرده — سنجش بی‌معناست")
      .toBeGreaterThan(0);
  } finally {
    await context.close();
  }
});
