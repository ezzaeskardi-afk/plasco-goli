// ============================================================
// هشدارِ پایدارِ «پنل یک‌عاملی است»
// ============================================================
// نگهبانِ ساختاریِ بک‌اند (`backend/tests/second-factor-visible.js`) وجودِ شرط و
// متنِ هشدار را در **سورس** می‌شمارد؛ این آزمون آن چیزی را می‌سنجد که با خواندنِ
// سورس معلوم نمی‌شود: **آنچه واقعاً رندر می‌شود**. سه چیز اینجا قفل می‌شود:
//
//   ۱) مدیرِ بی‌کلید → هشدارِ قرمز *دیده* می‌شود، راهِ رفعش هم همراهِ آن است،
//      و بندِ داوریِ بالای صفحه هم قرمز می‌گوید «به این‌ها نگاه کن» — نه
//      «همه‌چیز مرتب است». اگر کارت رندر شود ولی بندِ داوری همچنان سبز بماند،
//      آدمِ عجله‌دار (که همین بند را می‌خواند) دروغِ آرام می‌شنود.
//   ۲) مدیرِ کلیددار → همان کارت خالی از هشدار است و شمارش را می‌گوید؛ یعنی
//      هشدار *همیشه‌روشن* نیست. یک هشدارِ همیشه‌روشن با یک هشدارِ درست
//      فرقش این است که کسی جدی‌اش نمی‌گیرد.
//   ۳) سرورِ Expressِ قدیمی‌تر (فیلد نیامده) → صفحه سفید نمی‌ماند و بی‌صدا هم
//      نمی‌گوید «خوب است»؛ صریح می‌گوید «نمی‌دانم». دو پروسه‌ی جدا در این
//      پروژه واقعاً می‌توانند چند دقیقه نسخه‌شان فرق کند.
//
// و یک نکته‌ی سیاستی که در همین آزمون قفل می‌شود: پوششِ **ناقص** هشدار نیست
// (تصمیمِ مستندش در `lib/mfa.js → coverage`). پس در آن حالت کارت فقط عدد را
// می‌گوید — و به همین دلیل بندِ داوری در آن حالت سنجیده نمی‌شود، وگرنه
// «همه‌چیز مرتب است» با «۱ از ۲» کنارِ هم به یک انتظارِ تازه تبدیل می‌شد.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { SystemContent } from "@/components/admin/SystemContent";
import { ToastProvider } from "@/components/Toast";
import { getSystemStatus } from "@/lib/adminApi";
import type { AdminSystemStatus } from "@/lib/adminTypes";

// React بدونِ این پرچم روی هر رندر هشدار می‌دهد که «act» دورِ خودت لازم است.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// سرور اینجا جعل می‌شود (فقط لایه‌ی API): این آزمون رفتارِ خودِ نما را
// می‌سنجد، نه Express. `getDbHealth` و `runBackup` لازم‌اند چون کامپوننت
// importشان می‌کند، ولی در این سناریوها صدا زده نمی‌شوند.
vi.mock("@/lib/adminApi", () => ({
  getSystemStatus: vi.fn(),
  getDbHealth: vi.fn(),
  runBackup: vi.fn(),
}));

const mockedStatus = vi.mocked(getSystemStatus);

/** یک پاسخِ کاملِ سلامت — تا هر تغییری در شکلِ درختِ داده اینجا لو برود. */
function statusWith(secondFactor: unknown, present = true): AdminSystemStatus {
  const base = {
    server: {
      uptime: 120,
      nodeVersion: "v22.5.0",
      platform: "win32 x64",
      pid: 1234,
      memory: { rssMb: 80, heapUsedMb: 40, heapTotalMb: 60, externalMb: 5 },
    },
    metrics: {
      uptimeSeconds: 120,
      totalRequests: 10,
      slowRequests: 0,
      avgMs: 5,
      p50Ms: 4,
      p95Ms: 9,
      p99Ms: 12,
      statuses: { "200": 10 },
      topRoutes: [],
      routeCount: 1,
    },
    health: {
      ok: true,
      products: 3,
      queryMs: 2,
      sizeKb: 900,
      walKb: 10,
      walWarn: false,
      lastBackup: { file: "polasco-2026-10-13.db", ageHours: 1 },
      backupStale: false,
    },
    errors: { totals: { errors: 0, http5xx: 0, today: 0 }, daily: [], groups: [] },
    backups: [],
    adminLog: [],
  } as unknown as AdminSystemStatus;
  if (present) base.security = { secondFactor } as AdminSystemStatus["security"];
  return base;
}

let container: HTMLDivElement;
let root: Root;
let mounted = false;

async function renderStatus(status: AdminSystemStatus) {
  mockedStatus.mockResolvedValue(status);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  root = createRoot(container);
  mounted = true;
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <SystemContent />
        </ToastProvider>
      </QueryClientProvider>,
    );
  });
  // خواندنِ پرس‌وجو در یک میکروتسک تمام می‌شود؛ بدونِ این، متنِ هنوز نیامده
  // سنجیده می‌شود و آزمون به‌جای رفتار، زمان‌بندی را می‌سنجد.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const text = () => container.textContent ?? "";

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  mockedStatus.mockReset();
});

afterEach(async () => {
  if (mounted) await act(async () => { root.unmount(); });
  mounted = false;
  container.remove();
});

describe("هشدارِ یک‌عاملی بودنِ ورودِ پنل", () => {
  it("با مدیرِ بی‌کلید: هشدار، راهِ رفع، و بندِ داوریِ قرمز همه دیده می‌شوند", async () => {
    await renderStatus(statusWith({ admins: 1, covered: 0, noneCovered: true, invalidEntries: 0 }));

    expect(text()).toContain("هیچ مدیری کلیدِ عاملِ دوم ندارد");
    // راهِ رفع داخلِ خودِ هشدار: دستور و جایی که خطِ کلید می‌نشیند.
    expect(text()).toContain("node tools/admin-totp.js");
    expect(text()).toContain("ADMIN_TOTP_SECRETS");
    // بندِ داوری هم باید قرمز باشد، نه سبز: آدمِ عجله‌دار فقط همین را می‌خواند.
    expect(text()).toContain("به این‌ها نگاه کن");
    expect(text()).not.toContain("همه‌چیز مرتب است");
  });

  it("با مدیرِ کلیددار: هیچ هشدارِ قرمزی نیست و شمارش گفته می‌شود", async () => {
    await renderStatus(statusWith({ admins: 1, covered: 1, noneCovered: false, invalidEntries: 0 }));

    expect(text()).not.toContain("هیچ مدیری کلیدِ عاملِ دوم ندارد");
    expect(text()).toContain("۱ از ۱");
    expect(text()).toContain("همه‌چیز مرتب است");
  });

  it("با پوششِ ناقص: هشدار نمی‌دهد، فقط عدد را می‌گوید (سیاستِ مستند)", async () => {
    await renderStatus(statusWith({ admins: 2, covered: 1, noneCovered: false, invalidEntries: 0 }));

    expect(text()).not.toContain("هیچ مدیری کلیدِ عاملِ دوم ندارد");
    expect(text()).toContain("۱ از ۲");
    expect(text()).toContain("بقیه با یک کد");
  });

  it("با سرورِ قدیمی‌تر (فیلد نیامده): صفحه می‌آید و صریح می‌گوید نمی‌دانم", async () => {
    await renderStatus(statusWith(null, false));

    expect(text()).toContain("سرور این بخش را برنگرداند");
    // و مهم‌تر: بی‌صدا ادعای خوب بودن نمی‌کند.
    expect(text()).not.toContain("هیچ مدیری کلیدِ عاملِ دوم ندارد");
  });

  it("ورودیِ ناخوانا در ADMIN_TOTP_SECRETS هم به مدیر گفته می‌شود", async () => {
    await renderStatus(statusWith({ admins: 1, covered: 1, noneCovered: false, invalidEntries: 2 }));

    expect(text()).toContain("۲ ورودیِ ناخوانا در ADMIN_TOTP_SECRETS است");
  });

  /* ---------- کدِ پشتیبان ----------
     نگهبانِ ساختاریِ بک‌اند (`backend/tests/recovery-codes.js`) وجودِ شرط و
     متنِ هشدار را در **سورس** می‌شمارد؛ این‌جا همان چیزی سنجیده می‌شود که با
     خواندنِ سورس معلوم نمی‌شود: **آنچه واقعاً رندر می‌شود**. و یک شرطِ بدقلق
     دارد: `recovery` ممکن است در پاسخِ سرورِ قدیمی‌تر نباشد و آن‌وقت نباید
     چیزی دربارهٔ آن ادعا شود. */
  it("مدیرِ کلیددارِ بی‌کدِ پشتیبان: هشدارِ قفل‌شدن، دستورِ ساخت، و بندِ داوریِ قرمز", async () => {
    await renderStatus(statusWith({
      admins: 1, covered: 1, noneCovered: false, invalidEntries: 0,
      recovery: { keyed: 1, covered: 0, missing: 1, invalidEntries: 0, mine: null },
    }));

    expect(text()).toContain("با گم‌شدنِ گوشی، این مدیر از پنل بیرون می‌ماند");
    // هشدارِ بی‌راه‌حل یعنی اضطرابِ بی‌فایده: دستور و مقصدِ خط باید همراهِ آن باشد.
    expect(text()).toContain("node tools/admin-recovery.js 09121234567");
    expect(text()).toContain("ADMIN_RECOVERY_CODES");
    // و بندِ داوریِ بالا هم باید همین را بگوید، وگرنه آدمِ عجله‌دار دروغِ آرام می‌شنود.
    expect(text()).toContain("به این‌ها نگاه کن");
    expect(text()).not.toContain("همه‌چیز مرتب است");
  });

  it("پوششِ کامل: هشدار نیست، ولی کدهای باقی‌ماندهٔ خودِ مدیر گفته می‌شود", async () => {
    await renderStatus(statusWith({
      admins: 1, covered: 1, noneCovered: false, invalidEntries: 0,
      recovery: { keyed: 1, covered: 1, missing: 0, invalidEntries: 0, mine: { configured: 8, used: 3, remaining: 5 } },
    }));

    expect(text()).not.toContain("با گم‌شدنِ گوشی، این مدیر از پنل بیرون می‌ماند");
    expect(text()).toContain("۵ از ۸");
    // زیاد بودنِ کد یعنی هشدارِ بی‌مورد: یک هشدارِ همیشه‌روشن را کسی جدی نمی‌گیرد.
    expect(text()).not.toContain("کاغذتان تقریباً ته کشیده");
  });

  it("کاغذِ نزدیکِ ته‌کشیدن و ورودیِ ناخوانا (خطِ کدها جای خطِ هش‌ها) هر دو گفته می‌شوند", async () => {
    await renderStatus(statusWith({
      admins: 1, covered: 1, noneCovered: false, invalidEntries: 0,
      recovery: { keyed: 1, covered: 1, missing: 0, invalidEntries: 1, mine: { configured: 8, used: 7, remaining: 1 } },
    }));

    expect(text()).toContain("کاغذتان تقریباً ته کشیده");
    expect(text()).toContain("۱ ورودیِ ناخوانا در ADMIN_RECOVERY_CODES است");
  });
});
