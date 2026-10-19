// ============================================================
// سناریو ۵ — سئوی صفحهٔ محصول و صفحهٔ دسته، **زنده**
// ============================================================
// نگهبانِ آفلاینِ همین ادعاها `src/app/productSeo.test.ts` است و متنِ سورس را
// می‌سنجد. آن‌جا سه چیز را *نمی‌شود* سنجید، و همین سه چیز این‌جاست:
//
//   ۱. این‌که تگ‌ها واقعاً در HTMLِ **سروشده** هستند. یک `<meta>` می‌تواند
//      در سورس باشد و در بیلد/رندر نیفتد (مثلاً اگر React آن را به <head>
//      نبرد، یا اگر کامپوننت اشتباهاً کلاینتی شود).
//   ۲. این‌که canonicalِ نسبی با `metadataBase` **مطلق** و همان آدرسِ درست
//      می‌شود — نه با اسلشِ اضافه، نه با دامنهٔ اشتباه.
//   ۳. این‌که ردیفِ اعتماد **بدونِ جاوااسکریپت** هم دیده می‌شود: درخواستِ
//      HTMLِ خام (بدونِ مرورگر) هم باید همان پنج قلم را داشته باشد. مرورگرِ
//      واقعی فقط برای قلمِ مشروطِ «ارسال رایگان» لازم است، چون Express هم
//      آن را سمتِ کلاینت می‌کشت (`paintFreeShipPerk` در `js/product.js:48`).
//
// ---------- چرا درخواستِ خام و نه `page.content()` ----------
// `page.content()` بعد از hydration خوانده می‌شود؛ آن‌وقت «تگ در HTMLِ اولیه
// بود» و «بعداً با JS ساخته شد» یکی به نظر می‌رسند. خزنده و پیش‌نمایش‌گرِ
// پیام‌رسان‌ها هیچ‌کدام جاوااسکریپت اجرا نمی‌کنند، پس همان چیزی که
// `request.get` می‌بیند مرجع است.

import { test, expect, type APIRequestContext } from "@playwright/test";

/** چهار قلمِ ثابتِ ردیفِ اعتماد — نویسه‌به‌نویسه از `product.html:167-174`. */
const STATIC_PERKS = [
  "ارسال سریع؛ داخل شهر همان روز",
  "پرداخت امن زرین‌پال",
  "۷ روز مهلت مرجوعی",
  "ضمانت اصالت کالا",
];

/** شناسهٔ یک محصولِ واقعی از خودِ API — نه یک عددِ هاردکد که ممکن است برود. */
async function firstProductId(request: APIRequestContext): Promise<number> {
  const list = await request.get("/api/products?limit=1");
  expect(list.ok()).toBe(true);
  const first = ((await list.json()).products ?? [])[0];
  expect(first?.id, "برای سنجشِ صفحهٔ محصول، دست‌کم یک محصول لازم است").toBeTruthy();
  return Number(first.id);
}

/**
 * قلابِ `ul.pd-perks` — همان کلاسی که در نسخهٔ Express بود و `ProductDetail`
 * عمداً نگهش داشته. خواندن از همین قلاب یکی از فایده‌هایش این است که سنجشِ
 * زنده به شکلِ دقیقِ مارک‌آپ گره نمی‌خورد.
 */
function perksBlock(html: string): string {
  const open = /<ul[^>]*class="[^"]*\bpd-perks\b[^"]*"[^>]*>/.exec(html);
  if (!open) return "";
  const start = open.index + open[0].length;
  const end = html.indexOf("</ul>", start);
  return end < 0 ? "" : html.slice(start, end);
}

/** قلم‌های ردیف، از HTMLِ خام. */
function perksRows(html: string): string[] {
  return [...perksBlock(html).matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1]);
}

test("HTMLِ سروشدهٔ صفحهٔ محصول سه قلمِ سئو را دارد (بدونِ جاوااسکریپت)", async ({ request }) => {
  const id = await firstProductId(request);
  const res = await request.get(`/product/${id}`);
  expect(res.status(), "صفحهٔ محصولِ موجود باید ۲۰۰ بدهد").toBe(200);
  const html = await res.text();

  // ---------- ۱) canonical ----------
  const canonical = /<link rel="canonical" href="([^"]+)"/i.exec(html);
  expect(canonical, "صفحهٔ محصول هیچ canonical ندارد").toBeTruthy();
  const origin = new URL(process.env.PG_E2E_WEB!).origin;
  expect(canonical![1], "canonical به آدرسِ مرجعِ همین محصول اشاره نمی‌کند").toBe(
    `${origin}/product/${id}`,
  );

  // ---------- ۲) og:type=product، و دقیقاً یکی ----------
  // «یکی» بخشِ اصلیِ ادعاست: اگر یک `og:type=website` پیش از آن بیفتد،
  // واتساپ/تلگرام همان اولی را می‌خوانند و کارتِ محصول به کارتِ عمومی می‌شود.
  const ogTypes = [...html.matchAll(/<meta[^>]*property="og:type"[^>]*>/gi)].map((m) => m[0]);
  expect(ogTypes, "تعدادِ تگِ og:type در HTMLِ سروشده").toHaveLength(1);
  expect(ogTypes[0], "og:typeِ صفحهٔ محصول `product` نیست").toContain('content="product"');

  // ---------- ۳) ردیفِ اعتماد، با آیکونش ----------
  const block = perksBlock(html);
  expect(block, "ردیفِ اعتماد (`ul.pd-perks`) در HTMLِ سروشده نیست").not.toBe("");

  const rows = perksRows(html);
  // چهار قلمِ ثابت در HTMLِ اولیه؛ قلمِ مشروط بعد از hydration می‌آید
  // (Express هم دقیقاً همین کار را می‌کرد: `paintFreeShipPerk` سمتِ کلاینت).
  expect(rows, "شمارِ قلم‌های ردیفِ اعتماد در HTMLِ سروشده").toHaveLength(STATIC_PERKS.length);

  STATIC_PERKS.forEach((perk, i) => {
    const row = rows[i];
    expect(row, `قلمِ «${perk}» جای خودش در ردیف نیست`).toContain(perk);
    // آیکونِ هر قلم در اوراکل متفاوت بود (`i-truck`/`i-lock`/`i-check-circle`/
    // `i-shield`) و در Next یک SVGِ درون‌خطی است. اگر کسی دوباره همه را با
    // یک «✓» بنشاند، این‌جا گرفته می‌شود.
    expect(row, `قلمِ «${perk}» آیکون ندارد`).toContain("<svg");
  });

  // و سنجشِ منفی: قلمِ مشروط نباید بدونِ تنظیماتِ فروشگاه وعده بدهد.
  expect(block, "وعدهٔ ارسالِ رایگان در HTMLِ اولیه ساخته شده (Express نمی‌کرد)")
    .not.toContain("ارسال رایگان");
});

test("قلمِ مشروطِ «ارسال رایگان» دقیقاً وقتی می‌آید که Express می‌آورد", async ({
  page,
  request,
}) => {
  const id = await firstProductId(request);
  const shopRes = await request.get("/api/shop/info");
  expect(shopRes.ok()).toBe(true);
  const shop = (await shopRes.json()) as { freeShippingOver?: number; shippingCost?: number };
  const promised = Number(shop.freeShippingOver) > 0 && Number(shop.shippingCost) > 0;

  await page.goto(`/product/${id}`);
  await page.waitForLoadState("networkidle").catch(() => {});

  // پنجرهٔ صبر محدود است چون تنظیماتِ فروشگاه یک کوئریِ کلاینتی است.
  const note = page.getByText(/خرید بالای .* تومان، ارسال رایگان/);
  const rows = page.locator("ul.pd-perks > li");
  if (promised) {
    await expect(note, "تنظیماتِ ارسالِ رایگان هست ولی وعده روی صفحه نیامد").toBeVisible();
  } else {
    // آستانه یا هزینهٔ ارسال تعیین نشده: Express هم `li.hidden` می‌گذاشت.
    // «وعدهٔ توخالی» بدترین حالتِ این ردیف است، پس نبودنش صریح سنجیده می‌شود.
    await expect(note, "بدونِ تنظیماتِ ارسالِ رایگان، وعدهٔ توخالی نشان داده شده").toHaveCount(0);
  }
  console.log(
    `[سئوی محصول] آستانهٔ ارسالِ رایگان ${promised ? "تعیین شده" : "تعیین نشده"}`
    + ` — قلمِ مشروط ${promised ? "دیده شد" : "درست غایب است"}`,
  );

  // شمارِ قلم‌ها پس از hydration: چهار ثابت، و پنجمی فقط اگر وعده‌اش مجاز
  // باشد. «چهار همیشه» یعنی ردیف سالم است؛ «پنج همیشه» یعنی وعدهٔ توخالی.
  await expect(rows).toHaveCount(promised ? STATIC_PERKS.length + 1 : STATIC_PERKS.length);

  // و هر قلمِ ثابت باید آیکونِ خودش را داشته باشد — در DOMِ زنده، نه فقط در
  // سورس.
  const icons = await page.evaluate((perks) => {
    const list = document.querySelector("ul.pd-perks");
    return perks.map((text) => {
      const li = [...(list?.querySelectorAll("li") ?? [])].find((el) =>
        el.textContent?.includes(text),
      );
      return { text, svg: !!li?.querySelector("svg") };
    });
  }, STATIC_PERKS);
  for (const icon of icons) {
    expect(icon.svg, `آیکونِ قلمِ «${icon.text}» بعد از hydration ناپدید شد`).toBe(true);
  }
});

test("محصولِ ناموجود ۴۱۰ می‌دهد و هیچ سیگنالِ سئوی محصولی نمی‌فرستد", async ({ request }) => {
  // این سنجشِ منفی هم لازم است: اگر canonical و og:type را طوری بنویسیم که
  // روی *هر* پاسخِ مسیرِ محصول بیفتند (از جمله ۴۱۰)، آن‌وقت ۴۱۰ خودش را به
  // گوگل به‌عنوان یک صفحهٔ محصولِ معتبر معرفی می‌کند — بدتر از نبودنشان.
  const res = await request.get("/product/999999");
  expect(res.status(), "محصولِ ناموجود باید ۴۱۰ بماند، نه ۲۰۰ِ soft-404").toBe(410);

  const html = await res.text();
  expect(html, "صفحهٔ ۴۱۰ هیچ canonical نباید بدهد").not.toMatch(/rel="canonical"/i);
  expect(html, "صفحهٔ ۴۱۰ هیچ قیمتِ محصولی نباید اعلام کند").not.toContain("product:price");

  // و نوعِ کارت: نه «محصول»، بله «سایت». دقیق‌بودنِ همین تفکیک مهم است —
  // `og:type=website`ِ ریشه یک تصمیمِ سراسری است (هر صفحه‌ای که خودش
  // `openGraph` ندهد همان را می‌گیرد) و درست است؛ ولی اگر روزی تگِ
  // `product` به‌خاطرِ اشتراک‌گذاریِ کدِ صفحهٔ محصول روی این مسیر هم بیفتد،
  // ۴۱۰ خودش را به‌عنوان یک کالای معتبر به واتساپ/تلگرام معرفی می‌کند.
  const types = [...html.matchAll(/<meta[^>]*property="og:type"[^>]*/gi)].map((m) => m[0]);
  expect(types.filter((t) => t.includes('content="product"')), "صفحهٔ ۴۱۰ کارتِ محصول می‌دهد")
    .toHaveLength(0);
  for (const tag of types) expect(tag).toContain('content="website"');
});

test("صفحهٔ دسته سئوی یکتای خودش را دارد (متا، canonical، مسیرِ راه و CollectionPage)", async ({
  request,
}) => {
  // دسته از خودِ صفحهٔ خانه خوانده می‌شود، نه هاردکد — همان الگویی که
  // `firstProductId` از API می‌خواند. چیپ‌های صفحهٔ خانه دقیقاً به همین
  // آدرس‌ها لینک می‌دهند، پس این سناریو همان مسیرِ واقعیِ مشتری/خزنده است.
  const home = await request.get("/");
  expect(home.ok()).toBe(true);
  const href = /href="\/products\?category=([^"&]+)"/.exec(await home.text());
  expect(href, "روی صفحهٔ خانه هیچ لینکِ دسته‌ای نبود — سنجش بی‌معنا می‌شود").toBeTruthy();
  const category = decodeURIComponent(href![1]);

  const res = await request.get(`/products?category=${encodeURIComponent(category)}`);
  expect(res.status(), "صفحهٔ دسته باید ۲۰۰ بدهد").toBe(200);
  const html = await res.text();

  // ۱) توضیحِ متا نامِ همین دسته را دارد — نه متنِ عمومیِ فهرست.
  const desc = /<meta name="description" content="([^"]*)"/i.exec(html);
  expect(desc, "صفحهٔ دسته هیچ توضیحِ متایی ندارد").toBeTruthy();
  expect(desc![1], "توضیحِ متای صفحهٔ دسته نامِ دسته را ندارد").toContain(category);

  // ۲) canonical همان دسته را نگه می‌دارد (مقایسه با پارسِ URL، تا به شکلِ
  //    کدگذاری گره نخوریم).
  const canonical = /<link rel="canonical" href="([^"]+)"/i.exec(html);
  expect(canonical, "صفحهٔ دسته هیچ canonical ندارد").toBeTruthy();
  expect(new URL(canonical![1]).searchParams.get("category")).toBe(category);

  // ۳) مسیرِ راه سه‌پله است و پلهٔ سوم خودِ دسته با آدرسِ کانونیکال است.
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map((m) => JSON.parse(m[1]));
  const crumbs = blocks.find((b) => b["@type"] === "BreadcrumbList");
  expect(crumbs, "BreadcrumbList در HTMLِ سروشدهٔ صفحهٔ دسته نیست").toBeTruthy();
  expect(crumbs!.itemListElement, "پله‌های مسیرِ راهِ صفحهٔ دسته").toHaveLength(3);
  expect(crumbs!.itemListElement[2].name).toBe(category);
  expect(new URL(crumbs!.itemListElement[2].item).searchParams.get("category")).toBe(category);

  // ۴) و CollectionPage به همان آدرسِ کانونیکالِ فیلترشده اشاره می‌کند.
  const collection = blocks.find((b) => b["@type"] === "CollectionPage");
  expect(collection, "CollectionPage در HTMLِ سروشدهٔ صفحهٔ دسته نیست").toBeTruthy();
  expect(new URL(collection!.url).searchParams.get("category")).toBe(category);

  console.log(`[سئوی دسته] «${category}» — متا، canonical، مسیرِ راهِ سه‌پله و CollectionPage سنجیده شد`);
});
