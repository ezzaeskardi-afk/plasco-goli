// ============================================================
// نگهبانِ هدرهای امنیتیِ مبدأِ Next — HSTS فقط روی HTTPS
// ============================================================
// چرا لازم شد: `next.config.ts` هدرِ Strict-Transport-Security را **بی‌قید**
// می‌فرستاد، در حالی که ماژولِ امنیتیِ Express (server.js:152) همان هدر را
// داخلِ `if (HTTPS_MODE)` می‌گذارد. یعنی دو مبدأِ همان سایت دو قراردادِ متفاوت
// داشتند و تستِ امنیتی (tests/security.js:121 «روی HTTP هدر HSTS فرستاده
// نمی‌شود») فقط سمتِ Express را می‌سنجید. روی اجرای HTTPِ لوکال، مبدأِ Next
// مرورگر را وادار می‌کرد همیشه https برود — همان کلاسی که تستِ امنیت برای
// Express رد می‌کند.
//
// سنجشِ منبعی است نه زنده، چون در CI هیچ‌کدام از دو سرور بالا نیست (همان
// دلیلی که seoParity/socialParity نوشته‌اند). پرچمِ مشترکِ هر دو طرف
// `COOKIE_SECURE` است؛ این آزمون مساوی‌بودنِ آن قرارداد را قفل می‌کند.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NEXT_DIR = path.resolve(HERE, "..", "..");
const ROOT = path.resolve(NEXT_DIR, "..");

const CONFIG_SRC = fs.readFileSync(path.join(NEXT_DIR, "next.config.ts"), "utf8");
const EXPRESS_SRC = fs.readFileSync(path.join(ROOT, "backend", "server.js"), "utf8");

describe("securityHeaders — HSTS", () => {
  it("در next.config.ts هدر HSTS داخل شرطِ HTTPS_MODE است، نه بی‌قید", () => {
    // الگوی گیت: ...(HTTPS_MODE ? [{ key: "Strict-Transport-Security", ... }] : [])
    expect(CONFIG_SRC).toMatch(
      /\.\.\.\(HTTPS_MODE\s*\?\s*\[\s*\{\s*key:\s*"Strict-Transport-Security"/,
    );
    // و دیگر هیچ نسخهٔ بی‌قیدی در آرایهٔ هدرها نباشد
    expect(
      /^\s*\{\s*key:\s*"Strict-Transport-Security",\s*value:/m.test(CONFIG_SRC),
      "هدر HSTS بی‌قید روی فهرست هدرها هست",
    ).toBe(false);
  });

  it("Express هم همان گیت را دارد (پریتی دو مبدأ)", () => {
    expect(EXPRESS_SRC).toMatch(/if \(HTTPS_MODE\) \{[\s\S]{0,400}?Strict-Transport-Security/);
  });

  it("پرچمِ مشترک همان HTTPS_MODE است که از COOKIE_SECURE می‌آید", () => {
    expect(CONFIG_SRC).toMatch(/COOKIE_SECURE/);
    expect(CONFIG_SRC).toMatch(/const HTTPS_MODE =/);
  });
});
