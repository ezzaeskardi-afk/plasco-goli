// ============================================================
// سناریو ۱ — ورود با کد پیامکی، از چشمِ مرورگرِ واقعی
// ============================================================
// این چیزی است که ۳۶۲ آزمونِ jsdom نمی‌توانستند ببینند: پرشِ فوکوس بین پنج
// باکسِ کد، فرستادنِ خودکار وقتی رقمِ پنجم می‌آید، و — مهم‌تر از همه — این‌که
// کوکیِ نشست واقعاً در مرورگر می‌نشیند و `/api/auth/me` همان کاربر را می‌دهد.
//
// دقیقاً همین زنجیره بود که یک باگِ واقعی را پنهان کرد: فرم نام را از سطحِ
// بالای پاسخ می‌خواند، هر دو `undefined` می‌شدند، و مرحلهٔ «نام» برای هر ورودِ
// موفق باز می‌ماند («هر بار دوباره نامم را می‌پرسد»).
import { test, expect } from "@playwright/test";
import {
  CUSTOMER_NAME,
  currentUser,
  fillOtp,
  freshPhone,
  logMark,
  loginWithOtp,
  readOtpFromLog,
  requestOtpCode,
} from "./helpers";

// همان فیروزه‌ایِ `--color-teal` — دو سنجشِ رنگ در همین فایل از همین یک ثابت می‌خوانند.
const OTP_TEAL = "rgb(37, 214, 176)";

test("ورودِ مشتریِ تازه: شماره → کد → نام → حساب", async ({ page }) => {
  const phone = freshPhone();

  const outcome = await loginWithOtp(page, phone, { redirect: "/account" });
  expect(outcome, "برای شمارهٔ تازه باید مرحلهٔ نام بیاید و در همان‌جا تمام شود").toBe("customer");

  // مسیرِ بازگشت (`?redirect=`) باید رعایت شده باشد، نه «خانه».
  await expect(page).toHaveURL(/\/account/);

  // سنجش از چشمِ خودِ مرورگر: کوکیِ نشست در همان context است و API همان
  // کاربر را برمی‌گرداند.
  const me = await currentUser(page);
  expect(me?.phone).toBe(phone);
  expect(me?.fullName).toBe(CUSTOMER_NAME);

  // و صفحهٔ حساب همان را نشان می‌دهد — نه یک صفحهٔ خالیِ بدونِ ورود.
  await expect(page.getByText(CUSTOMER_NAME).first()).toBeVisible();
});

// ============================================================
// سناریو ۱.۵ — درخواستِ دوباره پیش از مصرفِ کد (همان پاسخِ ۴۲۹)
// ============================================================
// چرا این یک آزمونِ جدا لازم داشت: سرور برای هر شماره یک مهلتِ ارسال مجدد
// دارد (۳۰ ثانیه) و در آن بازه **پیامکِ تازه نمی‌فرستد** — با ۴۲۹ جواب می‌دهد
// و دو عددِ متفاوت را هم می‌فرستد: `retryAfter` (مهلتِ ارسال مجدد، سی ثانیه)
// و `expiresIn` (عمرِ واقعیِ باقی‌ماندهٔ *خودِ کد*، تا دو دقیقه).
//
// این دو عدد تا چندی پیش یکی فرض می‌شدند و نتیجه‌اش یک دروغِ واقعی بود: سرِ
// ثانیه‌ی ۳۱، وقتی پنجرهٔ ارسال مجدد تمام می‌شد، به مشتری گفته می‌شد «کد
// منقضی شده» در حالی که کد نیمه‌ی عمرش را داشت — و مشتری کدِ سالم را دور
// می‌ریخت. حالا هر چهار ادعا این‌جا با مرورگرِ واقعی سنجیده می‌شوند:
//   ۱. ۴۲۹ با `codeValid: true` و `expiresIn` بسیار بزرگ‌تر از `retryAfter`؛
//   ۲. هیچ پیامکِ تازه‌ای (هیچ خطِ تازه‌ای در لاگِ بک‌اند) نمی‌آید؛
//   ۳. عددی که روی صفحه شمرده می‌شود همان `retryAfter`ِ سرور است؛
//   ۴. هشدارِ «منقضی» دیده نمی‌شود و کدِ اول هنوز *کار می‌کند*.
//
test("درخواستِ دوباره پیش از مصرفِ کد: کدِ اول معتبر می‌ماند و «منقضی» گفته نمی‌شود", async ({ page, browser }) => {
  const phone = freshPhone();

  // ---------- ۱) کد درخواست می‌شود ولی مصرف *نمی‌شود* ----------
  // (تا پنجرهٔ ارسال مجدد باز بماند — با یک ورودِ کامل، سرور ردیفِ کد را
  // پاک می‌کند و مهلتی هم نمی‌ماند؛ همان چیزی که سناریوی بعدی را سریع کرد.)
  await page.goto("/login");
  await page.getByPlaceholder("۰۹۱۲۳۴۵۶۷۸۹").fill(phone);
  const firstMark = logMark();
  await page.getByRole("button", { name: "دریافت کد ورود" }).click();
  const firstCode = await readOtpFromLog(phone, { afterByte: firstMark });
  expect(firstCode, "حالتِ آزمایشی باید کد را در لاگِ بک‌اند چاپ کند").toBeTruthy();

  // ---------- ۲) همان شماره از مرورگرِ تازه ----------
  // (تبِ بسته‌شده و بازشده، یا گوشیِ دوم — همان کاربر، بدونِ کوکی و حافظهٔ محلی.)
  const ctx = await browser.newContext();
  try {
    const second = await ctx.newPage();
    await second.goto("/login");
    await second.getByPlaceholder("۰۹۱۲۳۴۵۶۷۸۹").fill(phone);
    const secondMark = logMark();
    const replied = second.waitForResponse((r) => r.url().includes("/api/auth/otp/request"));
    await second.getByRole("button", { name: "دریافت کد ورود" }).click();
    const res = await replied;
    const body = (await res.json()) as {
      retryAfter?: number;
      expiresIn?: number;
      codeValid?: boolean;
    };

    // ۱) پاسخ همان ۴۲۹ است و دو عدد از هم جدا هستند.
    expect(res.status()).toBe(429);
    expect(body.codeValid, "کدِ قبلی باید هنوز معتبر باشد").toBe(true);
    const retryAfter = Number(body.retryAfter);
    const expiresIn = Number(body.expiresIn);
    expect(retryAfter).toBeGreaterThan(0);
    expect(expiresIn, "عمرِ کد نباید از مهلتِ ارسال مجدد ساخته شده باشد")
      .toBeGreaterThan(retryAfter);

    // ۲) عددِ روی صفحه همان عددِ سرور است، نه ۳۰ ثانیهٔ حدسی و نه صفر.
    //
    // و چرا *خواندنِ* عدد و نه تطبیقِ متنِ ثابت: این ثانیه‌شمار واقعاً کار
    // می‌کند. آزمونِ اولِ همین سنجش با `name: /… (30|29) ثانیه/` نوشته شده بود
    // و افتاد، چون عدد روی صفحه (به‌درستی) از ۳۰ به ۲۳ رسیده بود تا وقتی که
    // تطبیقِ متنِ Playwright تسلیم شد — یعنی همان چیزی که می‌خواستیم ثابت شود
    // (شمارش از عددِ سرور) باعثِ شکستِ سنجش شده بود. پس فاصله مجاز است.
    const resendButton = second.getByRole("button", { name: /ارسال مجدد کد/ });
    await expect(resendButton).toBeVisible();
    const shown = /\((\d+) ثانیه\)/.exec((await resendButton.textContent()) || "");
    const shownSeconds = Number(shown?.[1]);
    expect(Number.isFinite(shownSeconds), "دکمهٔ ارسال مجدد باید ثانیه‌شمار را نشان دهد").toBe(true);
    expect(shownSeconds, "عددِ روی صفحه نباید از عددِ سرور بیشتر باشد").toBeLessThanOrEqual(retryAfter);
    expect(retryAfter - shownSeconds, "عددِ روی صفحه از عددِ سرور عقب نباشد").toBeLessThanOrEqual(3);

    // ۳) هیچ پیامکِ تازه‌ای نرفته — این همان سدِ هزینه‌ی پنل پیامک است.
    expect(
      await readOtpFromLog(phone, { afterByte: secondMark, timeoutMs: 3000 }),
      "در مهلتِ ارسال مجدد نباید پیامکِ تازه فرستاده شود"
    ).toBeNull();

    // ۴) هشدارِ انقضای *کد* دیده نمی‌شود، در حالی که «کد قبلی معتبر است» گفته می‌شود.
    await expect(second.getByText("کد قبلی هنوز معتبر است؛ همان را وارد کنید")).toBeVisible();
    await expect(second.locator("#codeExpiry")).not.toContainText("منقضی");

    // ۵) و سنجشِ واقعیِ «دو عدد جدا هستند» — نه یک نگاهِ لحظه‌ای که بتواند
    //    از قلم بیفتد. خودِ هشدار سرِ ثانیه‌ی ۳۱ ظاهر می‌شود، پس در یک آزمونِ
    //    چندثانیه‌ای دیده‌ِ‌شدنش قابلِ سنجش نیست؛ ولی *چیزی که آن هشدار از آن
    //    ساخته می‌شود* همین‌جا در `localStorage` نشسته و سنجیده می‌شود:
    //    `until` باید از `retryAfter` بیاید و `codeUntil` از `expiresIn`.
    //    اگر کسی دوباره عمرِ کد را از مهلتِ ارسال مجدد بسازد (خودِ باگِ
    //    قدیمی)، همین دو خط قرمز می‌شود — بدونِ سی ثانیه انتظار.
    const stored = (await second.evaluate(() =>
      JSON.parse(localStorage.getItem("pg_otp_resend") || "null")
    )) as { phone?: string; until?: number; codeUntil?: number } | null;
    expect(stored?.phone, "مهلتِ ذخیره‌شده باید به همین شماره گره خورده باشد").toBe(phone);
    const untilLeft = Math.round(((stored?.until ?? 0) - Date.now()) / 1000);
    const codeLeft = Math.round(((stored?.codeUntil ?? 0) - Date.now()) / 1000);
    expect(untilLeft, "مهلتِ ارسال مجدد باید همان `retryAfter`ِ سرور باشد")
      .toBeLessThanOrEqual(retryAfter);
    expect(codeLeft, "عمرِ کد باید از `expiresIn` بیاید، نه از پنجرهٔ ارسال مجدد")
      .toBeGreaterThan(retryAfter);
    expect(codeLeft).toBeLessThanOrEqual(expiresIn);
  } finally {
    await ctx.close();
  }

  // ---------- ۳) و کدِ اول واقعاً کار می‌کند ----------
  // اگر سرور کدی را «معتبر» بخواند ولی بعد قبول نکند، آن پیامِ سرور دروغ بوده.
  await fillOtp(page, firstCode!);
  await page.getByPlaceholder("نام و نام خانوادگی").fill(CUSTOMER_NAME);
  await page.getByRole("button", { name: "ورود به فروشگاه" }).click();
  expect((await currentUser(page))?.phone).toBe(phone);
});

// ============================================================
// سناریو ۱.۷ — خودِ خانه‌های کد، از چشمِ مرورگر
// ============================================================
// تا امروز این مجموعه «کد را می‌ریخت و می‌دید آیا فرم جلو می‌رود یا نه»؛ ولی
// *وضعیتِ خودِ خانه‌ها* هیچ‌جا سنجیده نمی‌شد. سه چیز این‌جا فقط در مرورگرِ
// واقعی معنا دارند و هیچ آزمونِ jsdom نمی‌بیندشان:
//
//   ۱. هر رقم در **همان** خانه‌ای می‌نشیند که تایپ شده و فوکوس به خانهٔ بعد می‌پرد
//      (زنجیرهٔ واقعیِ تایپِ کد؛ در jsdom فوکوسِ مرورگر وجود ندارد)؛
//   ۲. رنگِ خانهٔ پرشده از خانهٔ خالی جدا می‌شود — و این رنگ از یک متغیرِ CSS
//      **حل‌شده** می‌آید، نه از یک کلاس در سورس؛ پس این سنجش فقط با یک
//      stylesheetِ واقعی معنا دارد؛
//   ۳. رقمِ پنجم فرم را **خودش** می‌فرستد (بدونِ هیچ کلیکی) و همان پنج رقمی را
//      می‌فرستد که در خانه‌ها نشسته — نه یک شمارندهٔ داخلی.
//
// سنجش از راهِ بدنه‌ی همان درخواستی است که مرورگر می‌فرستد: تنها جایی که
// «آن‌چه تایپ شد» به «آن‌چه سرور دید» وصل می‌شود.
test("مرحلهٔ کد: هر رقم در خانهٔ خودش، فوکوس جلو می‌پرد و پنجمی خودش می‌فرستد", async ({ page }) => {
  const phone = freshPhone();
  await page.goto("/login?redirect=%2Faccount");
  await page.getByPlaceholder("۰۹۱۲۳۴۵۶۷۸۹").fill(phone);
  const code = await requestOtpCode(page, phone);

  const boxes = page.locator('input[autocomplete="one-time-code"]');
  await expect(boxes).toHaveCount(5);
  await expect(boxes.nth(0)).toBeFocused();

  const borderOf = (i: number) =>
    boxes.nth(i).evaluate((el) => getComputedStyle(el).borderColor);
  const emptyBorder = await borderOf(4);

  for (let i = 0; i < 4; i++) {
    await page.keyboard.type(code[i]);
    await expect(boxes.nth(i), `خانهٔ ${i} باید رقمِ خودش را نگه دارد`).toHaveValue(code[i]);
    await expect(boxes.nth(i + 1), "فوکوس باید به خانهٔ بعد بپرد").toBeFocused();
  }

  // رنگِ خانه‌ها: دو نکته که هر دو خودش را در اجرای واقعی نشان داد.
  //
  // ۱) خانه‌ها `transition-colors` دارند، پس یک snapshotِ ساده وسطِ انیمیشن
  //    می‌نشیند: اولین اجرای همین سنجش، خانهٔ ۰ را در «۴۳,۲۱۵,۱۷۸ با شفافیتِ ۰٫۹۵»
  //    دید و خانهٔ ۲ را در «۵۱,۲۱۶,۱۸۰ با شفافیتِ ۰٫۸۹۸» — یعنی دو لحظهٔ متفاوت
  //    از یک انیمیشن، نه دو حالتِ متفاوت. پس تا **حالتِ آرام** صبر می‌کنیم:
  //    تا وقتی که چهار خانه در رنگِ یکی شوند.
  // ۲) stylesheet ممکن است چند میلی‌ثانیه دیرتر برسد؛ سنجشِ صبور هر دو را می‌پوشاند.
  await expect
    .poll(async () => new Set(await Promise.all([0, 1, 2, 3].map(borderOf))).size, {
      message: "خانه‌های پرشده باید در حالتِ آرام یک رنگ باشند",
    })
    .toBe(1);
  const filledBorder = await borderOf(0);
  expect(filledBorder, "رنگِ خانهٔ پرشده باید از خانهٔ خالی جدا باشد").not.toBe(emptyBorder);
  await expect(boxes.nth(4), "خانهٔ پنجم هنوز دست‌نخورده است").toHaveValue("");
  // خانهٔ پنجم حالا **خانهٔ فعال** است: با تایپِ رقمِ چهارم، فوکوس خودش اینجا
  // پریده و طبق قراردادِ تازهٔ فوکوس باید حاشیهٔ فیروزه‌ای بگیرد (حتی خالی).
  // تفکیکِ «خالی از پرشده» را همان بالا روی خانه‌های بی‌فوکوس سنجیدیم.
  await expect
    .poll(() => borderOf(4), {
      message: "خانهٔ فعال (حتی خالی) باید حاشیهٔ فیروزه‌ایِ فوکوس را بگیرد",
    })
    .toBe(OTP_TEAL);

  const verify = page.waitForResponse((r) => r.url().includes("/api/auth/otp/verify"));
  await page.keyboard.type(code[4]);
  const sent = JSON.parse((await verify).request().postData() || "{}") as { code?: string };
  expect(sent.code, "فرم باید همان پنج رقمی را بفرستد که در خانه‌ها نشسته").toBe(code);

  await page.getByPlaceholder("نام و نام خانوادگی").fill(CUSTOMER_NAME);
  await page.getByRole("button", { name: "ورود به فروشگاه" }).click();
  expect((await currentUser(page))?.phone).toBe(phone);
});

// ============================================================
// سناریو ۱.۸ — چسباندنِ کد از کلیپ‌بورد
// ============================================================
// مسیرِ «چسباندن» در `LoginForm` یک شاخهٔ جدا است: پنج رقمِ کلیپ‌بورد یک‌جا در
// خانه‌ها می‌نشینند و اگر پنجمی هم بیاید، فرم خودش می‌فرستد. تا امروز این شاخه
// هیچ‌جا آزموده نمی‌شد، در حالی که روی گوشی رایج‌ترین راهِ واردکردنِ کد است
// (پیامک را کپی می‌کنی و می‌چسبانی). کلیپ‌بورد و رویدادِ paste فقط در مرورگرِ
// واقعی وجود دارند — jsdom نه کلیپ‌بورد دارد و نه اجازه‌ی خواندنش.
test("مرحلهٔ کد: چسباندنِ کلیپ‌بورد چند خانه را یک‌جا پر می‌کند", async ({ page, context }) => {
  const origin = new URL(process.env.PG_E2E_WEB as string).origin;
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });

  const phone = freshPhone();
  await page.goto("/login?redirect=%2Faccount");
  await page.getByPlaceholder("۰۹۱۲۳۴۵۶۷۸۹").fill(phone);
  const code = await requestOtpCode(page, phone);

  const boxes = page.locator('input[autocomplete="one-time-code"]');
  await expect(boxes).toHaveCount(5);

  // چهار رقم از پنج رقم را کپی می‌کنیم تا نیمه‌کاره بماند: این‌طور هم «چند خانه
  // یک‌جا پر شد» سنجیده می‌شود و هم «نیمه‌کاره چیزی نفرستاد».
  await page.evaluate((text) => navigator.clipboard.writeText(text), code.slice(0, 4));
  await boxes.nth(0).focus();
  await page.keyboard.press("Control+v");

  for (let i = 0; i < 4; i++) {
    await expect(boxes.nth(i), `چسباندن باید خانهٔ ${i} را پر کند`).toHaveValue(code[i]);
  }
  await expect(page.getByPlaceholder("نام و نام خانوادگی"), "کدِ نیمه‌کاره نباید فرم را بفرستد")
    .toHaveCount(0);

  const verify = page.waitForResponse((r) => r.url().includes("/api/auth/otp/verify"));
  await boxes.nth(4).focus();
  await page.keyboard.type(code[4]);
  const sent = JSON.parse((await verify).request().postData() || "{}") as { code?: string };
  expect(sent.code, "کدِ چسبانده‌شده + رقمِ آخر باید همان کدی باشد که سرور فرستاده")
    .toBe(code);

  await page.getByPlaceholder("نام و نام خانوادگی").fill(CUSTOMER_NAME);
  await page.getByRole("button", { name: "ورود به فروشگاه" }).click();
  expect((await currentUser(page))?.phone).toBe(phone);
});

test("ورودِ دوم با همان شماره: نام دیگر پرسیده نمی‌شود", async ({ page }) => {
  const phone = freshPhone();

  await loginWithOtp(page, phone, { redirect: "/account" });
  expect((await currentUser(page))?.phone).toBe(phone);

  // همان کاربر دوباره وارد می‌شود؛ این بار مرحلهٔ نام نباید بیاید.
  await page.context().clearCookies();
  const again = await loginWithOtp(page, phone, { redirect: "/account" });
  expect(again, "مشتریِ قدیمی نباید دوباره نامش را بگوید").toBe("customer");

  const me = await currentUser(page);
  expect(me?.phone).toBe(phone);
  expect(me?.fullName).toBe(CUSTOMER_NAME);
});

// ============================================================
// سناریو ۶ — همان دکمه‌ای که کاربر گزارش کرد «کار نمی‌کند»
// ============================================================
// چرا با مرورگرِ واقعی: گزارشِ کاربر این بود که کلیک روی «ورود / ثبت‌نام»ِ
// هیرو هیچ‌کاری نمی‌کند. این دکمه یک لینکِ ساده است، ولی تا همین‌جا هیچ
// آزمونی همین یک کلیک را نمی‌سنجید — سناریوهای بالا همه مستقیم `/login`
// می‌رفتند. اگر روزی روی‌کارتی (دکورِ شناور، منوی باز، خطای hydration) دکمه
// را بپوشاند یا href عوض شود، همان لحظه این‌جا قرمز می‌شود.
test("دکمهٔ «ورود / ثبت‌نام»ِ هیرو از صفحهٔ اصلی به فرمِ ورود می‌رسد", async ({ page }) => {
  await page.goto("/");
  const heroCta = page.locator('#home a[href="/login"]').first();
  await expect(heroCta).toBeVisible();
  await heroCta.click();
  await expect(page).toHaveURL(/\/login(\?|$)/);
});

test("دکمهٔ «ورود»ِ نوارِ بالا هم به فرمِ ورود می‌رسد", async ({ page }) => {
  await page.goto("/");
  const headerCta = page.locator('header a[href="/login"]').first();
  await expect(headerCta).toBeVisible();
  await headerCta.click();
  await expect(page).toHaveURL(/\/login(\?|$)/);
});

// ============================================================
// سناریو ۷ — حلقهٔ فوکوسِ باکس‌های کد: فیروزه‌ای، نه زرد
// ============================================================
// قاعدهٔ سراسریِ `:focus-visible` یک حلقهٔ **طلایی** می‌گذارد؛ کاربر روی
// باکس‌های کد آن را «زردِ غلط» دید. حالا باکسِ فعال باید حاشیهٔ فیروزه‌ای
// بگیرد و هیچ حلقه‌ای نداشته باشد. این ادعا فقط با CSSِ واقعیِ مرورگر
// سنجیدنی است — jsdom استایلِ محاسبه‌شده ندارد — پس همین‌جا قفل می‌شود.
test("باکسِ کدِ فعال حاشیهٔ فیروزه‌ای دارد، نه حلقهٔ طلایی", async ({ page }) => {
  const phone = freshPhone();
  await page.goto("/login");
  await page.getByPlaceholder("۰۹۱۲۳۴۵۶۷۸۹").fill(phone);
  await requestOtpCode(page, phone);

  const box = page.locator('input[autocomplete="one-time-code"]').first();
  await box.focus();
  // حاشیه `transition-colors` دارد؛ تک‌خوانیِ لحظه‌ای وسطِ انیمیشن می‌افتد
  // (اجرای واقعی رنگِ میانِ راه را دید). پس تا «حالتِ آرام» صبر می‌کنیم.
  await expect
    .poll(async () => box.evaluate((el) => getComputedStyle(el).borderTopColor), {
      message: "حاشیهٔ باکسِ فعال باید فیروزه‌ای (teal) شود",
    })
    .toBe(OTP_TEAL);

  const style = await box.evaluate((el) => {
    const s = getComputedStyle(el);
    return { outline: s.outlineStyle, border: s.borderTopColor, shadow: s.boxShadow };
  });

  expect(style.outline, "حلقهٔ outlineِ طلایی باید خاموش باشد").toBe("none");
  expect(style.border, "حاشیهٔ باکسِ فعال باید فیروزه‌ای (teal) باشد").toBe(OTP_TEAL);
  expect(style.shadow, "هالهٔ فوکوس باید دیده شود").not.toBe("none");
});
