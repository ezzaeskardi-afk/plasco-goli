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
const REPO_DIR = path.resolve(NEXT_DIR, "..");
const COMMON_JS = path.join(REPO_DIR, "frontend", "js", "common.js");
const HAS_EXPRESS = fs.existsSync(COMMON_JS);

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
    await createOrder({ addressId: 3, idempotencyKey: "abcdef1234567890" });

    expect(calls).toHaveLength(1);
    const [url, init] = calls[0];
    expect(url).toContain("/api/orders");
    const headers = init.headers as Record<string, string>;
    expect(headers["Idempotency-Key"]).toBe("abcdef1234567890");
    expect(String(init.body)).not.toContain("abcdef1234567890");
    expect(JSON.parse(String(init.body))).toEqual({ addressId: 3 });
  });
});

describe("قراردادِ هدرها در کلاینتِ Express (`frontend/js/common.js`)", () => {
  it.skipIf(!HAS_EXPRESS)(
    "PG.api هدرِ Content-Type را با هدرهای فراخوان ادغام می‌کند",
    () => {
      const src = fs.readFileSync(COMMON_JS, "utf8");

      // هدرهای فراخوان باید از `options` بیرون کشیده شوند؛ در غیر این صورت هر
      // `...fetchOpts`ی که بعد از `headers` بیاید، کلِ هدرهای پیش‌فرض را
      // جایگزین می‌کند — همان باگی که رخ داد.
      expect(
        src,
        "هدرهای فراخوان باید از options جدا شوند تا گسترشِ بقیهٔ گزینه‌ها آن‌ها را پاک نکند",
      ).toMatch(/const\s*\{\s*timeout\s*,\s*headers\s*,\s*\.\.\.fetchOpts\s*\}\s*=\s*options/);

      // و ادغام باید واقعاً انجام شود (نه جایگزینی).
      expect(
        src,
        "Content-Type باید با هدرهای فراخوان ادغام شود",
      ).toMatch(/headers:\s*\{\s*'Content-Type':\s*'application\/json'\s*,\s*\.\.\.\(headers\s*\|\|\s*\{\}\)\s*\}/);
    },
  );
});
