"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSystemStatus, getDbHealth, runBackup } from "@/lib/adminApi";
import { ApiError } from "@/lib/api";
import { useToast } from "@/components/Toast";
import {
  Panel,
  Pill,
  Spinner,
  ErrorBox,
  ForbiddenBox,
  Btn,
  faAgo,
  faDate,
  faDateTime,
  faNum,
} from "@/components/admin/AdminBits";
import type {
  AdminBackupFile,
  AdminDbHealth,
  AdminErrorGroup,
  AdminIntegrity,
  AdminSystemStatus,
} from "@/lib/adminTypes";

// ============================================================
// وضعیت سیستم
// ============================================================
// این نما با بقیه فرق دارد: بقیه درباره‌ی کارِ فروشگاه‌اند (سفارش، کالا، پول) و
// این یکی درباره‌ی خودِ سرور. کسی که به آن سر می‌زند معمولاً یک سؤال دارد:
// **«مشکلی هست یا نه؟»** — و بعد اگر بود، «کدامش؟».
//
// پس چیدمان از پاسخ شروع می‌شود و به عدد می‌رسد، نه برعکس: بالای صفحه یک
// جمله‌ی داوری هست («همه‌چیز مرتب است» یا فهرستِ چیزهایی که باید نگاه کنی) و
// بعد لایه‌های جزئیات. آدمِ عجله‌دار فقط همان بند اول را می‌خواند و می‌رود.
//
// ============================================================
// سه چیز درباره‌ی «بکاپ» که کلِ این نما به آن‌ها وابسته است
// ============================================================
//  ۱. بکاپ **خودکار** است: سرور روی هر بوت (server.js:991) و بعد هر ۶ ساعت
//     یک‌بار چک می‌کند، و backupNow روزی یک فایل می‌سازد
//     (`polasco-YYYY-MM-DD.db`). یعنی «بکاپِ امروز» یک چیزِ معمولی است و
//     دکمه‌ی دستی برای وقتی است که آن زنجیره شکسته باشد.
//  ۲. به همین دلیل اگر بکاپِ امروز از قبل باشد، فشردنِ دکمه **فایل تازه
//     نمی‌سازد** — سرور همان فایل را برمی‌گرداند. رابط نباید در آن حالت
//     بگوید «بکاپ گرفته شد»؛ پایین‌تر می‌بینید که چطور تشخیصش می‌دهیم.
//  ۳. فقط ۱۴ بکاپِ روزانه نگه داشته می‌شود؛ عکس‌های دستی (`manual-*`،
//     `pre-restore-*`) بیرون از شمارش‌اند و پاک نمی‌شوند.
//
// ============================================================
// و یک باگِ واقعی که همین نما پیدا کرد
// ============================================================
// فهرستِ بکاپ‌ها در routes/admin.js از یک مسیرِ دستی خوانده می‌شد
// (`backend/data/backups`) و نه از پوشه‌ای که خودِ سرور در آن می‌نویسد. روی
// سروری با `PG_DATA_DIR` نتیجه این بود: بلافاصله بعد از یک بکاپِ دستیِ موفق،
// همین صفحه می‌گفت «هیچ بکاپی نیست» در حالی که `db-health` همان بکاپ را
// «۰ ساعت پیش» نشان می‌داد. حالا هر دو از `listBackups()` در lib/db.js
// می‌خوانند — یک تعریف، دو مصرف‌کننده.

type Verdict = { level: "ok" | "warn" | "bad"; issues: string[] };

/**
 * «مشکلی هست یا نه؟» — تنها محاسبه‌ی این نما.
 *
 * هر شرطش از یک عددِ خودِ سرور می‌آید، نه از سلیقه: `ok` و `backupStale` و
 * `walWarn` را خودِ lib/db.js حساب می‌کند (و همان‌ها در داشبوردِ Express هم
 * به کار می‌رفتند). `errors.today` هم شمارشِ خطاهای امروز است.
 */
function verdictOf(s: AdminSystemStatus): Verdict {
  const issues: string[] = [];

  if (!s.health.ok) issues.push("دیتابیس به SELECT پاسخ نداد — همین حالا نگاه کن.");
  if (s.errors.unavailable) {
    // «۰ خطا» و «نتوانستم لاگ را بخوانم» دو چیزِ کاملاً متفاوت‌اند.
    issues.push(`لاگ خطاها خوانده نشد (${s.errors.unavailable}) — پس صفرِ خطا یعنی «نمیدانم»، نه «خبری نیست».`);
  }
  if (s.health.backupStale) {
    const age = s.health.lastBackup ? `${faNum(s.health.lastBackup.ageHours)} ساعت` : null;
    issues.push(
      age
        ? `آخرین بکاپ ${age} پیش است (بیش از ۴۸ ساعت). بکاپِ روزانه خودکار است، پس یا سرور مدتی خاموش بوده یا بکاپ‌گیری خطا می‌دهد.`
        : "هیچ بکاپی وجود ندارد. دکمه‌ی «بکاپ فوری» را بزن و نتیجه را ببین.",
    );
  }
  if (s.health.walWarn) {
    issues.push(
      `فایل WAL حدود ${faNum(s.health.walKb)} کیلوبایت است. بزرگ‌شدنش یعنی فشرده‌سازی (checkpoint) انجام نمی‌شود — روی پوشه‌های همگام‌شونده پیش می‌آید.`,
    );
  }
  if ((s.errors.totals.today ?? 0) > 0) {
    issues.push(`${faNum(s.errors.totals.today ?? 0)} خطا امروز در لاگ ثبت شده.`);
  }
  if (s.health.sizeKb > 0 && s.health.queryMs > 100) {
    issues.push(`یک SELECT ساده ${faNum(s.health.queryMs)} میلی‌ثانیه طول کشید — دیسک کند است.`);
  }

  const bad = !s.health.ok || Boolean(s.errors.unavailable) || s.health.backupStale;
  return { level: issues.length === 0 ? "ok" : bad ? "bad" : "warn", issues };
}

/** ثانیه → «۳ روز و ۴ ساعت» — چون «۲۶۴٬۰۰۰ ثانیه» به هیچ‌کس چیزی نمی‌گوید */
function fmtUptime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${faNum(d)} روز و ${faNum(h)} ساعت`;
  if (h > 0) return `${faNum(h)} ساعت و ${faNum(m)} دقیقه`;
  return `${faNum(m)} دقیقه`;
}

export function SystemContent() {
  const queryClient = useQueryClient();
  const toast = useToast();

  // نتیجه‌ی بررسیِ عمیق عمداً در stateِ محلی است و نه در کشِ react-query:
  // `PRAGMA quick_check` کلِ فایل را می‌خواند و باید *فقط* با کلیکِ مدیر اجرا
  // شود، نه با هر بازدیدِ صفحه یا هر تازه‌سازیِ خودکار.
  const [integrity, setIntegrity] = useState<AdminIntegrity | null>(null);

  const statusQuery = useQuery({
    queryKey: ["adminSystemStatus"],
    queryFn: () => getSystemStatus(),
    retry: false,
    // نمای سلامت نباید عددِ کهنه نشان بدهد. هر دقیقه خودش تازه می‌شود
    // (و متنِ پایین هم همین را به مدیر می‌گوید تا غافلگیر نشود).
    refetchInterval: 60_000,
  });

  const deepCheck = useMutation({
    mutationFn: () => getDbHealth(true),
    onSuccess: (res) => {
      setIntegrity(res.integrity);
      if (res.integrity?.ok) toast("بررسی ساختاری: دیتابیس سالم است", { tone: "success" });
      else toast(res.integrity?.message || "بررسی ساختاری مشکل پیدا کرد", { tone: "error" });
    },
    onError: (err) =>
      toast(err instanceof ApiError ? err.message : "بررسی ساختاری ممکن نشد", { tone: "error" }),
  });

  const backupMutation = useMutation({
    mutationFn: () => runBackup(),
    onSuccess: (res) => {
      // ⚠️ سرور روزی یک بکاپ می‌سازد و اگر فایلِ امروز باشد همان را برمی‌گرداند
      // بدونِ اینکه چیزی بنویسد. اگر هر دو حالت را «بکاپ گرفته شد» بگوییم،
      // مدیر فکر می‌کند فایل تازه‌ای ساخته شده. پس مقایسه می‌کنیم.
      const existed = statusQuery.data?.backups.some((b) => b.name === res.file);
      toast(
        existed
          ? `بکاپ امروز از قبل بود — همان فایل برگردانده شد (${res.file}). سرور روزی یک بکاپ می‌سازد.`
          : `بکاپ ساخته شد: ${res.file}`,
        { tone: "success" },
      );
      queryClient.invalidateQueries({ queryKey: ["adminSystemStatus"] });
      queryClient.invalidateQueries({ queryKey: ["adminOverview"] });
    },
    onError: (err) =>
      toast(err instanceof ApiError ? err.message : "بکاپ گرفتن ممکن نشد", { tone: "error" }),
  });

  if (statusQuery.error instanceof ApiError && [401, 403].includes(statusQuery.error.status)) {
    return <ForbiddenBox />;
  }
  if (statusQuery.isPending) return <Spinner label="در حال خواندن وضعیت سرور…" />;
  if (statusQuery.error) {
    return (
      <ErrorBox
        message={
          statusQuery.error instanceof ApiError
            ? statusQuery.error.message
            : "خطا در خواندن وضعیت سرور"
        }
        onRetry={() => statusQuery.refetch()}
      />
    );
  }

  const s = statusQuery.data;
  if (!s) return null;

  const v = verdictOf(s);
  const backups = s.backups;
  const newest = backups[0];

  return (
    <div className="space-y-5">
      <Verdict banner={v} onRefresh={() => statusQuery.refetch()} busy={statusQuery.isFetching} />

      {/* ---------- نگاهِ اول: چهار عدد ---------- */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label="بالا بودن سرور" value={fmtUptime(s.metrics.uptimeSeconds)} />
        <Kpi label="درخواست‌ها (از بوت)" value={faNum(s.metrics.totalRequests)} />
        <Kpi
          label="کندی (p95)"
          value={`${faNum(Math.round(s.metrics.p95Ms))} میلی‌ثانیه`}
          tone={s.metrics.p95Ms > 1000 ? "coral" : s.metrics.p95Ms > 300 ? "gold" : "teal"}
          hint={`${faNum(s.metrics.slowRequests)} درخواستِ کند`}
        />
        <Kpi
          label="خطای امروز"
          value={faNum(s.errors.totals.today ?? 0)}
          tone={(s.errors.totals.today ?? 0) > 0 ? "coral" : "teal"}
          hint={`۵xx در ۷ روز: ${faNum(s.errors.totals.http5xx ?? 0)}`}
        />
      </div>

      {/* ---------- دیتابیس ---------- */}
      <Panel
        title="دیتابیس"
        action={
          <Btn
            tone="dim"
            disabled={deepCheck.isPending}
            onClick={() => deepCheck.mutate()}
            title="کل فایل دیتابیس خوانده می‌شود؛ چند لحظه طول می‌کشد"
          >
            {deepCheck.isPending ? "در حال بررسی…" : "بررسی ساختاری عمیق"}
          </Btn>
        }
      >
        <DbHealthTable health={s.health} />

        <p className="mt-3 text-[10px] leading-relaxed" style={{ color: "var(--color-ink-dim)" }}>
          «بررسی ساختاری عمیق» کلِ فایل را می‌خواند، پس عمداً خودکار اجرا نمی‌شود
          — اگر روی هر بازدید اجرا می‌شد، خودش می‌توانست سرور را کند کند.
        </p>

        {integrity && (
          <p
            className="mt-2 rounded-[14px] px-3 py-2 text-[11px] leading-relaxed"
            style={
              integrity.ok
                ? { background: "var(--color-teal-tint)", color: "var(--color-teal)" }
                : { background: "var(--color-coral-tint)", color: "var(--color-coral)" }
            }
          >
            {integrity.ok
              ? "نتیجه‌ی بررسی: سالم (quick_check چیزی پیدا نکرد)."
              : `نتیجه‌ی بررسی: ${integrity.message}`}
          </p>
        )}
      </Panel>

      {/* ---------- بکاپ‌ها ---------- */}
      <Panel
        title="بکاپ‌ها"
        action={
          <Btn
            tone="teal"
            disabled={backupMutation.isPending}
            onClick={() => backupMutation.mutate()}
          >
            {backupMutation.isPending ? "در حال بکاپ…" : "بکاپ فوری"}
          </Btn>
        }
      >
        <p className="text-[11px] leading-relaxed mb-3" style={{ color: "var(--color-ink-soft)" }}>
          بکاپ <strong>خودکار</strong> است: سرور روی هر روشن‌شدن و بعد هر ۶ ساعت
          چک می‌کند و روزی یک فایل می‌سازد. پس اگر بکاپِ امروز وجود داشته باشد،
          دکمه‌ی بالا فایلِ تازه نمی‌سازد — همان را نشان می‌دهد. فقط ۱۴ بکاپِ
          روزانه نگه داشته می‌شود.
        </p>

        {backups.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--color-gold)" }}>
            هنوز هیچ فایل بکاپی نیست. اگر همین حالا دکمه‌ی «بکاپ فوری» را بزنی و
            باز هم اینجا خالی بماند، یعنی نوشتن روی دیسک شکست می‌خورد — لاگ سرور
            را نگاه کن.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {backups.map((b) => (
              <BackupRow key={b.name} file={b} newest={b.name === newest?.name} />
            ))}
          </ul>
        )}
      </Panel>

      {/* ---------- خطاها ---------- */}
      <ErrorsPanel errors={s.errors} />

      {/* ---------- سرور ---------- */}
      <Panel title="سرور">
        <dl className="space-y-1.5 text-[11px]">
          <Row label="Node" value={s.server.nodeVersion} ltr />
          <Row label="سیستم" value={s.server.platform} ltr />
          <Row label="PID" value={String(s.server.pid)} ltr />
          <Row label="بالا بودن" value={fmtUptime(s.server.uptime)} />
        </dl>

        <div className="mt-3 space-y-2">
          <MemoryBar label="حافظه‌ی مصرفی (RSS)" value={s.server.memory.rssMb} />
          <MemoryBar
            label="Heap استفاده‌شده"
            value={s.server.memory.heapUsedMb}
            total={s.server.memory.heapTotalMb}
          />
        </div>

        <p className="mt-3 text-[10px] leading-relaxed" style={{ color: "var(--color-ink-dim)" }}>
          متریک‌ها درون‌حافظه‌ای‌اند و با هر ری‌استارتِ سرور از صفر شروع می‌شوند؛
          پس «درخواست‌ها» یعنی «از آخرین روشن‌شدن»، نه «کل تاریخ».
        </p>
      </Panel>

      {/* ---------- سرعتِ مسیرها ---------- */}
      {s.metrics.topRoutes?.length > 0 && (
        <Panel title="کندترین مسیرها">
          <ul className="space-y-1.5">
            {[...s.metrics.topRoutes]
              .sort((a, b) => b.avgMs - a.avgMs)
              .slice(0, 8)
              .map((r) => (
                <li key={r.route} className="flex items-center gap-2 text-[11px]">
                  <span className="min-w-0 flex-1 truncate" dir="ltr" style={{ color: "var(--color-ink-soft)" }}>
                    {r.route}
                  </span>
                  <span className="shrink-0" style={{ color: "var(--color-ink-dim)" }}>
                    {faNum(r.count)} بار
                  </span>
                  <span
                    className="shrink-0 w-[74px] text-left font-bold"
                    style={{ color: r.avgMs > 500 ? "var(--color-coral)" : "var(--color-ink-soft)" }}
                  >
                    {faNum(Math.round(r.avgMs))} ms
                  </span>
                </li>
              ))}
          </ul>
        </Panel>
      )}

      {/* ---------- رویدادهای پنل ---------- */}
      <Panel title="کارهای اخیر پنل">
        {s.adminLog.length === 0 ? (
          <p className="text-xs" style={{ color: "var(--color-ink-dim)" }}>
            رویدادی ثبت نشده.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {s.adminLog.slice(0, 20).map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-[11px]">
                <span className="min-w-0 flex-1 truncate" style={{ color: "var(--color-ink-soft)" }}>
                  {e.action}
                  {e.target ? ` · ${e.target}` : ""}
                </span>
                <span className="shrink-0" style={{ color: "var(--color-ink-dim)" }}>
                  {e.by || "—"}
                </span>
                <span className="shrink-0" style={{ color: "var(--color-ink-dim)" }}>
                  {faAgo(e.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="text-[10px] leading-relaxed px-1" style={{ color: "var(--color-ink-dim)" }}>
        این صفحه هر دقیقه خودش تازه می‌شود. آخرین خواندن:{" "}
        {statusQuery.dataUpdatedAt ? faDateTime(new Date(statusQuery.dataUpdatedAt).toISOString()) : "—"}
      </p>
    </div>
  );
}

// ============================================================
// قطعه‌ها
// ============================================================

/**
 * بندِ داوری — تنها چیزی که یک آدمِ عجله‌دار می‌خواند.
 * سه حالت دارد و رنگش هم از همان می‌آید: سبز / زرد / قرمز.
 */
function Verdict({
  banner,
  onRefresh,
  busy,
}: {
  banner: Verdict;
  onRefresh: () => void;
  busy: boolean;
}) {
  const tone =
    banner.level === "ok"
      ? { bg: "var(--color-teal-tint)", fg: "var(--color-teal)", title: "همه‌چیز مرتب است" }
      : banner.level === "warn"
        ? { bg: "var(--color-gold-tint)", fg: "var(--color-gold)", title: "چند نکته هست" }
        : {
            bg: "var(--color-coral-tint)",
            fg: "var(--color-coral)",
            title: "به این‌ها نگاه کن",
          };

  return (
    <div
      className="rounded-[18px] p-4"
      style={{ background: tone.bg, border: "1px solid transparent" }}
      role="status"
    >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold mb-1" style={{ color: tone.fg }}>
            {tone.title}
          </p>
          {banner.issues.length === 0 ? (
            <p className="text-[11px] leading-relaxed" style={{ color: tone.fg }}>
              دیتابیس پاسخ می‌دهد، بکاپ تازه است و امروز خطایی ثبت نشده.
            </p>
          ) : (
            <ul className="space-y-1 text-[11px] leading-relaxed" style={{ color: tone.fg }}>
              {banner.issues.map((i) => (
                <li key={i}>• {i}</li>
              ))}
            </ul>
          )}
        </div>
        <Btn tone="dim" disabled={busy} onClick={onRefresh}>
          {busy ? "…" : "تازه‌سازی"}
        </Btn>
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone = "teal",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "teal" | "gold" | "coral";
}) {
  const color =
    tone === "teal"
      ? "var(--color-teal)"
      : tone === "gold"
        ? "var(--color-gold)"
        : "var(--color-coral)";
  return (
    <div
      className="rounded-[18px] p-4"
      style={{ background: "var(--color-surface)", border: "1px solid var(--color-line)" }}
    >
      <div className="text-[11px] mb-1.5" style={{ color: "var(--color-ink-dim)" }}>
        {label}
      </div>
      <div className="text-lg font-extrabold leading-tight" style={{ color }}>
        {value}
      </div>
      {hint && (
        <div className="text-[10px] mt-1" style={{ color: "var(--color-ink-dim)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

function DbHealthTable({ health }: { health: AdminDbHealth }) {
  const sizeMb = health.sizeKb / 1024;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Pill
          label={health.ok ? "پاسخ می‌دهد" : "پاسخ نمی‌دهد"}
          tone={health.ok ? "teal" : "coral"}
        />
        {health.backupStale ? (
          <Pill label="بکاپ قدیمی است" tone="gold" />
        ) : (
          <Pill label="بکاپ تازه" tone="teal" />
        )}
        {health.walWarn && <Pill label="WAL بزرگ" tone="gold" />}
      </div>

      <dl className="space-y-1.5 text-[11px]">
        <Row label="کالاهای خوانده‌شده در تست" value={faNum(health.products)} />
        <Row label="زمان یک پرس‌وجوی ساده" value={`${faNum(health.queryMs)} میلی‌ثانیه`} />
        <Row
          label="حجم دیتابیس"
          value={
            sizeMb >= 1
              ? `${faNum(Math.round(sizeMb * 10) / 10)} مگابایت`
              : `${faNum(health.sizeKb)} کیلوبایت`
          }
        />
        <Row
          label="فایل WAL"
          value={`${faNum(health.walKb)} کیلوبایت${health.walWarn ? " — بزرگ‌تر از حدِ معمول" : ""}`}
        />
        <Row
          label="آخرین بکاپ"
          value={
            health.lastBackup
              ? `${health.lastBackup.file} (${faNum(health.lastBackup.ageHours)} ساعت پیش)`
              : "هیچ بکاپی نیست"
          }
          strong={!health.lastBackup || health.backupStale}
        />
      </dl>
    </>
  );
}

function BackupRow({ file, newest }: { file: AdminBackupFile; newest: boolean }) {
  return (
    <li
      className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[14px] px-3 py-2 text-[11px]"
      style={{
        background: "var(--color-surface-2)",
        border: `1px solid ${newest ? "var(--color-teal)" : "transparent"}`,
      }}
    >
      <span className="min-w-0 flex-1 truncate" dir="ltr" style={{ color: "var(--color-ink-soft)" }}>
        {file.name}
      </span>
      {newest && <Pill label="تازه‌ترین" tone="teal" />}
      <span className="shrink-0" style={{ color: "var(--color-ink-dim)" }}>
        {faNum(file.sizeKb)} کیلوبایت
      </span>
      {/* تاریخِ فایل با mtime می‌آید و ISO است؛ faAgo آن را به «۲ روز پیش» تبدیل
          می‌کند که برای «آیا بکاپ تازه است؟» خیلی گویاتر از تاریخِ کامل است. */}
      <span className="shrink-0 w-full sm:w-auto" style={{ color: "var(--color-ink-dim)" }}>
        {faAgo(file.createdAt)} — {faDateTime(file.createdAt)}
      </span>
    </li>
  );
}

function ErrorsPanel({ errors }: { errors: AdminSystemStatus["errors"] }) {
  if (errors.unavailable) {
    return (
      <Panel title="خطاهای ۷ روزِ اخیر">
        <p
          className="rounded-[14px] px-3 py-2 text-[11px] leading-relaxed"
          style={{ background: "var(--color-gold-tint)", color: "var(--color-gold)" }}
        >
          لاگ خطاها خوانده نشد: {errors.unavailable}
          <br />
          این یعنی «صفر خطا» را نمی‌شود باور کرد — فایل‌های لاگ در دسترس نیستند.
        </p>
      </Panel>
    );
  }

  const daily = errors.daily ?? [];
  const peak = Math.max(1, ...daily.map((d) => d.errors));
  const groups = errors.groups ?? [];

  return (
    <Panel title="خطاهای ۷ روزِ اخیر">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Pill
          label={`${faNum(errors.totals.errors)} خطا`}
          tone={errors.totals.errors > 0 ? "coral" : "teal"}
        />
        <Pill label={`${faNum(errors.totals.http5xx ?? 0)} پاسخ ۵xx`} tone={(errors.totals.http5xx ?? 0) > 0 ? "gold" : "dim"} />
        <Pill label={`${faNum(errors.totals.groups ?? 0)} نوع`} tone="dim" />
        {errors.since && (
          <span className="text-[10px]" style={{ color: "var(--color-ink-dim)" }}>
            {/* تاریخِ خامِ سرور ISO است («2026-09-19»)؛ همه‌ی جای دیگرِ این نما
                تاریخِ شمسی نشان می‌دهد، پس این یکی هم باید همان‌طور باشد. */}
            از {faDate(errors.since)}
          </span>
        )}
      </div>

      {daily.length > 0 && (
        <div className="flex items-end gap-1 h-16 mb-4" aria-hidden="true">
          {daily.map((d) => (
            <span
              key={d.day}
              title={`${d.day}: ${d.errors} خطا`}
              className="flex-1 rounded-t-[3px] min-h-[2px]"
              style={{
                height: `${Math.max(3, (d.errors / peak) * 100)}%`,
                background: d.errors > 0 ? "var(--color-coral)" : "var(--color-surface-2)",
              }}
            />
          ))}
        </div>
      )}

      {groups.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--color-ink-dim)" }}>
          خطای ثبت‌شده‌ای نیست.
        </p>
      ) : (
        <ul className="space-y-2">
          {groups.slice(0, 12).map((g) => (
            <ErrorGroupRow key={g.key} group={g} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function ErrorGroupRow({ group }: { group: AdminErrorGroup }) {
  return (
    <li
      className="rounded-[14px] px-3 py-2"
      style={{ background: "var(--color-surface-2)" }}
    >
      <div className="flex items-start gap-2">
        <span className="min-w-0 flex-1 text-[11px] leading-relaxed" style={{ color: "var(--color-ink-soft)" }}>
          {group.title}
        </span>
        <Pill label={`${faNum(group.count)}×`} tone="coral" />
      </div>
      <div className="text-[10px] mt-1" style={{ color: "var(--color-ink-dim)" }}>
        آخرین بار: {faAgo(group.last)}
      </div>
      {group.reason && (
        <p className="text-[10px] mt-1 leading-relaxed" dir="auto" style={{ color: "var(--color-ink-dim)" }}>
          {group.reason}
        </p>
      )}
      {group.stack.length > 0 && (
        <details className="mt-1">
          <summary className="text-[10px] cursor-pointer" style={{ color: "var(--color-teal)" }}>
            ردِ فراخوانی
          </summary>
          <pre
            className="mt-1 overflow-x-auto rounded-lg p-2 text-[10px] leading-relaxed"
            style={{ background: "var(--color-surface)", color: "var(--color-ink-dim)" }}
            dir="ltr"
          >
            {group.stack.join("\n")}
          </pre>
        </details>
      )}
    </li>
  );
}

function MemoryBar({ label, value, total }: { label: string; value: number; total?: number }) {
  const pct = total && total > 0 ? Math.min(100, Math.round((value / total) * 100)) : null;
  return (
    <div>
      <div className="flex items-center justify-between text-[10px] mb-1" style={{ color: "var(--color-ink-dim)" }}>
        <span>{label}</span>
        <span dir="ltr">
          {faNum(value)}
          {total ? ` / ${faNum(total)}` : ""} MB
          {pct != null ? ` (${faNum(pct)}٪)` : ""}
        </span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: "var(--color-surface-2)" }}
      >
        <span
          className="block h-full rounded-full"
          style={{
            width: `${pct ?? Math.min(100, Math.round((value / 512) * 100))}%`,
            background: "var(--color-teal)",
          }}
        />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  ltr,
}: {
  label: string;
  value: string;
  strong?: boolean;
  ltr?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0" style={{ color: "var(--color-ink-dim)" }}>
        {label}
      </dt>
      <dd
        className={`text-left min-w-0 ${strong ? "font-extrabold" : ""}`}
        dir={ltr ? "ltr" : undefined}
        style={{ color: strong ? "var(--color-coral)" : "var(--color-ink-soft)" }}
      >
        {value}
      </dd>
    </div>
  );
}
