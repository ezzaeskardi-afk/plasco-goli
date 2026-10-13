import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAddress, createOrder, getAddresses, updateAddress } from "@/lib/api";

// ============================================================
// نگهبانِ قراردادِ API بین دو فرانت — همان دو باگی که مشتری دید
// ============================================================
// دو شکایتِ واقعیِ کاربر، هر دو از یک جنس: «کد درست است ولی *قرارداد* شکسته
// بود» و هیچ typecheck و هیچ آزمونی آن را نمی‌گرفت.
//
//   ۱) «با شمارهٔ مدیریت وارد می‌شوم، روی پنل ادمین می‌زنم → ۴۰۴» →
//      این یکی در سرور حل شد (ریدایرکتِ /admin) و نگهبانش probeِ
//      `admin-gate` در `parityManifest` است.
//
//   ۲) «آدرس از قبل ست شده، اما روی ثبت سفارش می‌زند «آدرس معتبر انتخاب
//      نشده»» → ریشه‌اش دو طرف داشت:
//
//      الف) در Express، `PG.api` هدرها را ادغام نمی‌کرد؛ هر فراخوانی‌ای که
//           هدر خودش را می‌فرستاد (checkout.js برای `Idempotency-Key`)
//           `Content-Type: application/json` را کل دور می‌ریخت. مرورگر بدنه
//           را `text/plain` می‌فرستاد، `express.json()` آن را پارس نمی‌کرد،
//           `req.body` خالی می‌ماند و سرور همین خطا را می‌داد — برای *هر*
//           سفارش. آزمونِ زیر همین ادغام را قفل می‌کند.
//
//      ب) در Next، توابعِ آدرس پوششِ بک‌اند را باز نمی‌کردند: `GET
//           /api/addresses` جوابِ `{addresses:[…]}` می‌دهد و `POST/PUT`
//           `{address:{…}}`، ولی `api.ts` همان شیءِ پوشش را با تایپِ
//           `Address[]`/`Address` برمی‌گرداند. نتیجه در `/checkout` و
//           `/account`: `.map` روی شیء و کرشِ زمانِ اجرا. چهار آزمونِ زیر
//           رفتارِ واقعیِ همین چهار تابع را با `fetch`ِ قلابی می‌سنجند.
//
// قاعدهٔ ساختاریِ مشترکِ هر دو باگ: **شکلِ داده بین دو طرف یک قرارداد است، نه
// یک جزئیاتِ پیاده‌سازی** — و قرارداد باید آزمون داشته باشد، وگرنه دوباره
// می‌شکند و همان پیامِ گمراه‌کننده به مشتری می‌رسد.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NEXT_DIR = path.resolve(HERE, "..", "..");
// اوراکلِ منجمدِ فروشگاهِ Express (اگر روزی لازم شد) کنارِ همین تست‌هاست:
// `tests/fixtures/legacy-src/`. نگهبانِ زیر به کلاینتِ *زنده* اشاره می‌کند.

/** پاسخی به‌شکلِ Response که `fetcher` می‌خواند (ok/status/json). */
function jsonRes(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as unknown as Response;
}

type FetchArgs = [string, RequestInit];

function stubFetch(body: unknown) {
  const calls: FetchArgs[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return jsonRes(body);
    }),
  );
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const ADDRESS = {
  id: 3,
  userId: 1,
  fullName: "امیررضا کلی",
  phone: "09113567409",
  province: "مازندران",
  city: "ساری",
  addressLine: "بلوار کشاورز",
  postalCode: "4811111111",
};

describe("قراردادِ آدرس‌ها و سفارش بین سرور و فرانتِ Next", () => {
  it("getAddresses پوششِ {addresses} را باز می‌کند", async () => {
    // شکلِ واقعیِ `backend/routes/addresses.js:38`.
    stubFetch({ addresses: [ADDRESS] });
    const list = await getAddresses();
    expect(Array.isArray(list), "خروجی باید آرایه باشد، نه شیءِ پوشش").toBe(true);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(3);
  });

  it("getAddresses روی فهرستِ خالی آرایهٔ خالی می‌دهد (نه undefined)", async () => {
    stubFetch({ addresses: [] });
    await expect(getAddresses()).resolves.toEqual([]);
  });

  it("createAddress پوششِ {address} را باز می‌کند", async () => {
    // شکلِ واقعیِ `backend/routes/addresses.js:44`.
    stubFetch({ address: ADDRESS });
    const created = await createAddress({
      fullName: ADDRESS.fullName,
      phone: ADDRESS.phone,
      province: ADDRESS.province,
      city: ADDRESS.city,
      addressLine: ADDRESS.addressLine,
      postalCode: ADDRESS.postalCode,
    });
    // قبل از اصلاح، این‌جا شیءِ پوشش برمی‌گشت و `created.id` تهی می‌شد؛
    // همان چیزی که در `/checkout` باعث می‌شد آدرسِ تازه انتخاب نشود.
    expect(created.id).toBe(3);
    expect(created.city).toBe("ساری");
  });

  it("updateAddress پوششِ {address} را باز می‌کند", async () => {
    stubFetch({ address: { ...ADDRESS, city: "بابلسر" } });
    const updated = await updateAddress(3, {
      fullName: ADDRESS.fullName,
      phone: ADDRESS.phone,
      province: ADDRESS.province,
      city: "بابلسر",
      addressLine: ADDRESS.addressLine,
      postalCode: ADDRESS.postalCode,
    });
    expect(updated.id).toBe(3);
    expect(updated.city).toBe("بابلسر");
  });

  it("createOrder کلیدِ یکتا را در هدر می‌فرستد، نه در بدنه", async () => {
    // `backend/routes/orders.js:41` آن را با `req.get('Idempotency-Key')`
    // می‌خواند؛ داخلِ JSON بودنش یعنی «کلید یکتای سفارش معتبر نیست» و همان
    // ۴۰۰ی که کلِ ثبتِ سفارش در نسخهٔ Next را می‌بست.
    const calls = stubFetch({ orderId: 1, paymentUrl: null });
    // کلیدِ یکتا در زمانِ اجرا ساخته می‌شود، نه به‌شکلِ یک رشتهٔ ثابت. چرا:
    // یک رشتهٔ هگزمانندِ ثابت در سورس، اسکنرِ راز را بی‌جا قرمز می‌کند.
    // رفتار عوض نمی‌شود — برای این سنجش همین کافی است که یک مقدارِ یکتا،
    // دست‌نخورده، در هدر برود و در بدنه نیاید.
    const idempotencyKey = randomUUID();
    await createOrder({ addressId: 3, idempotencyKey });

    expect(calls).toHaveLength(1);
    const [url, init] = calls[0];
    expect(url).toContain("/api/orders");
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe(idempotencyKey);
    expect(String(init.body)).not.toContain(idempotencyKey);
    expect(JSON.parse(String(init.body))).toEqual({ addressId: 3 });
  });
});


// ============================================================
// قراردادِ ادغامِ هدرها — از کلاینتِ Express به کلاینتِ زنده منتقل شد
// ============================================================
// این نگهبان در عصرِ Express روی `frontend/js/common.js` نوشته شد: آن‌جا
// `...fetchOpts` *بعد* از `headers` می‌آمد و هر فراخوانی‌ای که هدرِ خودش را
// می‌فرستاد (checkout.js برای `Idempotency-Key`) `Content-Type` را کل دور
// می‌ریخت؛ مرورگر بدنه را `text/plain` می‌فرستاد، `express.json()` آن را
// پارس نمی‌کرد و هر سفارش با «آدرس معتبر انتخاب نشده» رد می‌شد.
//
// حالا همان قرارداد روی کلاینتِ زنده سنجیده می‌شود: `api.ts` باید هدرهای
// پیش‌فرض را با هدرهای فراخوان *ادغام* کند، نه جایگزین.
// ============================================================
// قراردادِ پاسخِ ورودِ پیامکی — نام زیرِ `user` می‌آید، نه در سطحِ بالا
// ============================================================
// سومین باگِ همان جنس، و این یکی هزینه‌اش را مشتری داد: «همیشه دوباره نامم را
// می‌پرسد». تایپِ `OtpVerifyResponse` دو فیلدِ سطحِ بالا اعلام می‌کرد که سرور
// هیچ‌وقت نمی‌فرستد (`fullName` و `isNew`) و فرمِ ورود هم همان‌ها را می‌خواند:
// هر دو `undefined`، پس شرط **همیشه** درست می‌شد و مرحلهٔ «نام» برای هر ورودِ
// موفق باز می‌ماند.
//
// چرا هیچ نگهبانی نمی‌گرفتش: آزمونِ کامپوننت هم همان شکلِ خیالی را تزریق
// می‌کرد، پس هر دو طرفِ سنجش یک چیزِ غلط را باور کرده بودند — همان «سبزِ
// بی‌معنی»ی که این پروژه چند بار خورده است. راهِ بستنش همین‌جاست: شکلِ سیم از
// **سورسِ سرور** خوانده می‌شود (نه از تایپِ خودمان) و با تایپ و با اوراکلِ
// Express مقایسه می‌شود. افزودن/برداشتنِ یک فیلد در هر سمت این آزمون را قرمز
// می‌کند، و اگر کسی دوباره در فرم نام را از سطحِ بالا بخواند، همان‌جا می‌افتد.
const ROOT_DIR = path.resolve(NEXT_DIR, "..");
const BACKEND_AUTH = path.join(ROOT_DIR, "backend", "routes", "auth.js");
const LEGACY_LOGIN = path.join(
  NEXT_DIR,
  "tests",
  "fixtures",
  "legacy-src",
  "js",
  "login.js",
);
const TYPES_SRC = path.join(NEXT_DIR, "src", "lib", "types.ts");
const LOGIN_FORM = path.join(NEXT_DIR, "src", "components", "LoginForm.tsx");

/**
 * کامنت‌ها را از سورس برمی‌دارد.
 *
 * اجباری است، نه سلیقه: همین تایپ یک کامنتِ توضیحی دارد که خودش می‌گوید
 * `fullName` و `isNew` فیلدهای سطحِ بالا بودند — اگر کامنت را بخوانیم، دقیقاً
 * همان دو کلیدی را «کشف» می‌کنیم که نگهبان دنبال نبودنشان است. (این مخزن
 * یک‌بار هم باورکردنِ یک نام از داخل کامنت را به‌عنوانِ شکستِ نگهبان ثبت کرده.)
 * `//` وقتی پیش از خودش `:` دارد (مثلِ `https://`) دست‌نخورده می‌ماند تا
 * رشته‌های حاوی نشانی، کدِ بعدِ خودشان را نبلعند.
 */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, "$1");
}

/** بدنهٔ آکولادیِ بعد از یک نشانه (تابع یا interface) را برمی‌گرداند. */
function blockAfter(src: string, marker: string): string {
  const at = src.indexOf(marker);
  if (at < 0) throw new Error(`«${marker}» در سورس پیدا نشد`);
  const open = src.indexOf("{", at);
  if (open < 0) throw new Error(`آکولادِ «${marker}» پیدا نشد`);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  throw new Error(`بدنهٔ «${marker}» بسته نشد`);
}

/** کلیدهای یک شیء/واجههٔ متنِ سورس، مرتب‌شده و یکتا. */
function fieldNames(body: string): string[] {
  const keys = [...body.matchAll(/([A-Za-z_$][\w$]*)\s*\??\s*:/g)].map((m) => m[1]);
  return [...new Set(keys)].sort();
}

const AUTH_SRC = codeOnly(fs.readFileSync(BACKEND_AUTH, "utf8"));
const TYPES_CODE = codeOnly(fs.readFileSync(TYPES_SRC, "utf8"));
const LOGIN_FORM_CODE = codeOnly(fs.readFileSync(LOGIN_FORM, "utf8"));
const LEGACY_CODE = codeOnly(fs.readFileSync(LEGACY_LOGIN, "utf8"));

/** همان چیزی که سرور در پاسخِ کاربرِ عمومی می‌فرستد (`publicUser`). */
const WIRE_USER_FIELDS = fieldNames(blockAfter(AUTH_SRC, "function publicUser(u)"));

/** فیلدهای سطحِ بالای پاسخِ `POST /auth/otp/verify`. */
const OTP_RESPONSE_FIELDS = fieldNames(
  blockAfter(TYPES_CODE, "interface OtpVerifyResponse"),
);

describe("قراردادِ پاسخِ `otp/verify`: نام زیرِ `user` است، نه در سطحِ بالا", () => {
  it("فیلدهای `User` در کلاینت با `publicUser` سرور یکی است (سورس در برابر سورس)", () => {
    const userFields = fieldNames(blockAfter(TYPES_CODE, "interface User "));
    // کفِ استخراج: اگر نگهبان روزی خالی شود، آزمون سبزِ بی‌معنی نشود.
    expect(WIRE_USER_FIELDS).toContain("fullName");
    expect(WIRE_USER_FIELDS).toContain("phone");
    expect(userFields).toEqual(WIRE_USER_FIELDS);
  });

  it("پاسخِ `otp/verify` هیچ فیلدِ نامی در سطحِ بالا ندارد (`ok`، `user`، `mfaRequired`)", () => {
    expect(OTP_RESPONSE_FIELDS).toEqual(["mfaRequired", "ok", "user"]);
    expect(OTP_RESPONSE_FIELDS).not.toContain("fullName");
    expect(OTP_RESPONSE_FIELDS).not.toContain("isNew");
    // و خودِ سرور هم واقعاً همین را می‌فرستد: نام داخلِ `publicUser` می‌نشیند.
    expect(AUTH_SRC).toMatch(
      /res\.json\(\{\s*ok:\s*true,\s*user:\s*publicUser\(user\),\s*mfaRequired\s*\}\)/,
    );
  });

  it("فرمِ ورودِ Next نام را از `user` می‌خواند — مثلِ اوراکلِ Express", () => {
    // سمتِ Next: تصمیمِ مرحلهٔ نام از همان‌جایی می‌آید که سرور نام می‌دهد.
    expect(LOGIN_FORM_CODE).toContain("if (!res.user?.fullName?.trim())");
    // و هیچ جای این کامپوننت فیلدِ سطحِ بالا خوانده نمی‌شود. اگر روزی کسی
    // باگ را برگرداند، همین دو خط می‌افتند.
    expect(LOGIN_FORM_CODE).not.toMatch(/res\.(?:isNew|fullName)\b/);
    // سمتِ Express (اوراکلِ منجمد): همان قاعده، تا پورت به آن طرف واگرا نشود.
    expect(LEGACY_CODE).toMatch(/if\s*\(\s*!user\.fullName\s*\)/);
  });
});

describe("قراردادِ ادغامِ هدرها در کلاینتِ Next (`src/lib/api.ts`)", () => {
  it("هدرهای فراخوان روی پیش‌فرض‌ها سوار می‌شوند (نه جایگزین)", () => {
    const src = fs.readFileSync(
      path.join(NEXT_DIR, "src", "lib", "api.ts"),
      "utf8",
    );
    expect(
      src,
      "`...init.headers` باید *بعد* از `Content-Type` بیاید تا آن را پاک نکند",
    ).toMatch(
      /headers:\s*\{\s*"Content-Type":\s*"application\/json",\s*\.\.\.init\.headers,?\s*\}/,
    );
  });
});