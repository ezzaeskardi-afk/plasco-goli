"use client";

import { useState, useEffect, useCallback } from "react";
import {
  crmGetSummary,
  crmGetCustomers,
  crmGetCustomer,
  crmAddNote,
  crmDeleteNote,
  crmAddTask,
  crmToggleTask,
  crmDeleteTask,
  crmCreateTag,
  crmDeleteTag,
  crmSetUserTags,
  crmGetAdvanced,
  crmGetSegments,
  crmGetRevenue,
  crmGetTopCustomers,
  crmRecalcAll,
} from "@/lib/api";
import { ApiError } from "@/lib/api";
import type {
  CrmSummary,
  CrmTag,
  CrmCustomer,
  CrmCustomerDetail,
  CrmAdvancedSummary,
  CrmSegmentStat,
  CrmRevenueMonth,
  CrmTopCustomer,
} from "@/lib/types";

function toFa(n: number): string {
  return new Intl.NumberFormat("fa-IR").format(n);
}
function toToman(n: number): string {
  return `${toFa(n)} تومان`;
}

const SEGMENT_LABELS: Record<string, string> = {
  vip: "VIP",
  at_risk: "پرخطر",
  returning: "بازگشتی",
  new_buyer: "خریدار جدید",
  casual: "معمولی",
  dormant: "خفته",
  lead: "سرنخ",
  new: "جدید",
};
const SEGMENT_COLORS: Record<string, string> = {
  vip: "var(--color-gold)",
  at_risk: "var(--color-coral)",
  returning: "var(--color-teal)",
  new_buyer: "var(--color-teal)",
  casual: "var(--color-ink-soft)",
  dormant: "var(--color-ink-dim)",
  lead: "var(--color-ink-dim)",
  new: "var(--color-ink-soft)",
};

// =================== دکمه شمسی (خیلی ساده) ===================
function shortDate(iso: string | null): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

// ==================== تب‌ها ====================
type Tab = "dashboard" | "customers" | "detail";

export function CrmContent() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [loading, setLoading] = useState(true);

  // ============ داشبورد ============
  const [summary, setSummary] = useState<CrmSummary | null>(null);
  const [tags, setTags] = useState<CrmTag[]>([]);
  const [advanced, setAdvanced] = useState<CrmAdvancedSummary | null>(null);
  const [segments, setSegments] = useState<CrmSegmentStat[]>([]);
  const [revenue, setRevenue] = useState<CrmRevenueMonth[]>([]);
  const [topCustomers, setTopCustomers] = useState<CrmTopCustomer[]>([]);

  // ============ مشتری‌ها ============
  const [customers, setCustomers] = useState<CrmCustomer[]>([]);
  const [custTotal, setCustTotal] = useState(0);
  const [custPage, setCustPage] = useState(0);
  const [custSearch, setCustSearch] = useState("");
  const [custSort, setCustSort] = useState("spent");
  const [custFilter, setCustFilter] = useState("all");
  const [custTag, setCustTag] = useState("");

  // ============ جزئیات ============
  const [detail, setDetail] = useState<CrmCustomerDetail | null>(null);
  const [noteText, setNoteText] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [newTagName, setNewTagName] = useState("");
  const [error, setError] = useState("");

  const PAGE_SIZE = 30;

  // ---- لود اولیه ----
  const loadDashboard = useCallback(async () => {
    try {
      const [s, ad, seg, rev, top] = await Promise.all([
        crmGetSummary(),
        crmGetAdvanced(),
        crmGetSegments(),
        crmGetRevenue(),
        crmGetTopCustomers(10),
      ]);
      setSummary(s.summary);
      setTags(s.tags);
      setAdvanced(ad.summary);
      setSegments(seg.segments);
      setRevenue(rev.months.slice(-12));
      setTopCustomers(top.customers);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCustomers = useCallback(async () => {
    try {
      const data = await crmGetCustomers({
        q: custSearch || undefined,
        sort: custSort,
        filter: custFilter,
        tag: custTag || undefined,
        limit: PAGE_SIZE,
        offset: custPage * PAGE_SIZE,
      });
      setCustomers(data.customers);
      setCustTotal(data.total);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا");
    }
  }, [custSearch, custSort, custFilter, custTag, custPage]);

  useEffect(() => {
    setLoading(true);
    setError("");
    if (tab === "dashboard") loadDashboard();
    else if (tab === "customers") loadCustomers();
    else if (tab === "detail" && detail) {
      // refresh detail
      crmGetCustomer(detail.id)
        .then((d) => setDetail(d.customer))
        .catch(() => {});
    }
  }, [tab, loadDashboard, loadCustomers]);

  useEffect(() => {
    if (tab === "customers") loadCustomers();
  }, [tab, loadCustomers]);

  const openDetail = async (id: number) => {
    try {
      setLoading(true);
      const d = await crmGetCustomer(id);
      setDetail(d.customer);
      setTab("detail");
    } catch (err) {
      setError("مشتری پیدا نشد");
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!detail || !noteText.trim()) return;
    try {
      await crmAddNote(detail.id, noteText.trim());
      setNoteText("");
      const d = await crmGetCustomer(detail.id);
      setDetail(d.customer);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا");
    }
  };

  const handleToggleTask = async (taskId: number, done: boolean) => {
    try {
      await crmToggleTask(taskId, !done);
      if (detail) {
        const d = await crmGetCustomer(detail.id);
        setDetail(d.customer);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا");
    }
  };

  const handleAddTask = async () => {
    if (!detail || !taskTitle.trim()) return;
    try {
      await crmAddTask(detail.id, taskTitle.trim());
      setTaskTitle("");
      const d = await crmGetCustomer(detail.id);
      setDetail(d.customer);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا");
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const res = await crmCreateTag(newTagName.trim());
      setTags((prev) => [...prev, res.tag]);
      setNewTagName("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا");
    }
  };

  const handleToggleTag = async (tagId: number) => {
    if (!detail) return;
    const has = detail.tags.some((t) => t.id === tagId);
    const newIds = has
      ? detail.tags.filter((t) => t.id !== tagId).map((t) => t.id)
      : [...detail.tags.map((t) => t.id), tagId];
    try {
      await crmSetUserTags(detail.id, newIds);
      const d = await crmGetCustomer(detail.id);
      setDetail(d.customer);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا");
    }
  };

  const handleRecalcAll = async () => {
    try {
      await crmRecalcAll();
      loadDashboard();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "خطا");
    }
  };

  // ==================== رندر ====================
  return (
    <div className="space-y-6">
      {/* تب‌ها */}
      <div className="flex gap-1 rounded-full p-1 w-fit" style={{ background: "var(--color-surface)" }}>
        {(["dashboard", "customers"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setDetail(null); }}
            className="rounded-full px-4 py-1.5 text-xs font-medium transition-colors"
            style={{
              background: tab === t ? "var(--color-teal)" : "transparent",
              color: tab === t ? "#04211B" : "var(--color-ink-soft)",
            }}
          >
            {t === "dashboard" ? "داشبورد" : "مشتری‌ها"}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl p-3 text-xs" style={{ background: "var(--color-coral-tint)", color: "var(--color-coral)" }}>
          {error}
          <button onClick={() => setError("")} className="mr-2 underline">بستن</button>
        </div>
      )}

      {loading && tab !== "detail" ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="rounded-2xl p-4 h-28 animate-pulse" style={{ background: "var(--color-surface)" }} />
          ))}
        </div>
      ) : null}

      {/* ============ داشبورد ============ */}
      {!loading && tab === "dashboard" && summary && (
        <div className="space-y-6">
          {/* KPI‌ها */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "کل مشتریان", value: toFa(summary.totalCustomers), color: "var(--color-teal)" },
              { label: "برچسب‌دار", value: toFa(summary.tagged), color: "var(--color-gold)" },
              { label: "پیگیری باز", value: toFa(summary.openTasks), color: "var(--color-coral)" },
              { label: "یادداشت‌ها", value: toFa(summary.totalNotes), color: "var(--color-ink-soft)" },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-2xl p-4" style={{ background: "var(--color-surface)" }}>
                <div className="text-2xl font-extrabold mb-0.5" style={{ color: kpi.color }}>
                  {kpi.value}
                </div>
                <div className="text-[11px] text-ink-dim">{kpi.label}</div>
              </div>
            ))}
          </div>

          {/* سگمنت‌ها + نمودار درآمد */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* سگمنت‌ها */}
            <div className="rounded-2xl p-4" style={{ background: "var(--color-surface)" }}>
              <h3 className="text-sm font-bold mb-3" style={{ color: "var(--color-ink)" }}>
                سگمنت مشتریان
              </h3>
              <div className="space-y-2">
                {segments.map((seg) => {
                  const pct = advanced ? (seg.count / advanced.totalCustomers) * 100 : 0;
                  return (
                    <div key={seg.segment} className="flex items-center gap-2 text-xs">
                      <span className="w-20 shrink-0" style={{ color: SEGMENT_COLORS[seg.segment] || "var(--color-ink-soft)" }}>
                        {SEGMENT_LABELS[seg.segment] || seg.segment}
                      </span>
                      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "var(--color-surface-2)" }}>
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.max(pct, 2)}%`,
                            background: SEGMENT_COLORS[seg.segment] || "var(--color-teal)",
                          }}
                        />
                      </div>
                      <span className="w-12 text-right text-ink-dim">{toFa(seg.count)}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* درآمد ماهانه */}
            <div className="rounded-2xl p-4" style={{ background: "var(--color-surface)" }}>
              <h3 className="text-sm font-bold mb-3" style={{ color: "var(--color-ink)" }}>
                درآمد ماهانه
              </h3>
              <div className="flex items-end gap-1 h-32">
                {revenue.map((m) => {
                  const maxRev = Math.max(...revenue.map((r) => r.revenue), 1);
                  const h = (m.revenue / maxRev) * 100;
                  return (
                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[9px] text-ink-dim">{toFa(m.revenue / 1000000)}M</span>
                      <div
                        className="w-full rounded-t-md transition-all min-h-[2px]"
                        style={{
                          height: `${Math.max(h, 2)}%`,
                          background: "var(--color-teal)",
                        }}
                      />
                      <span className="text-[9px] text-ink-dim rotate-45 origin-right">{m.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* مشتریان برتر */}
          <div className="rounded-2xl p-4" style={{ background: "var(--color-surface)" }}>
            <h3 className="text-sm font-bold mb-3" style={{ color: "var(--color-ink)" }}>
              مشتریان برتر
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-ink-dim border-b" style={{ borderColor: "var(--color-line)" }}>
                    <th className="text-right py-2 px-2">نام</th>
                    <th className="text-right py-2 px-2">سفارش</th>
                    <th className="text-right py-2 px-2">مبلغ</th>
                    <th className="text-right py-2 px-2">سلامت</th>
                    <th className="text-right py-2 px-2">سگمنت</th>
                  </tr>
                </thead>
                <tbody>
                  {topCustomers.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b cursor-pointer hover:bg-surface-2 transition-colors"
                      style={{ borderColor: "var(--color-line)" }}
                      onClick={() => openDetail(c.id)}
                    >
                      <td className="py-2 px-2 font-medium" style={{ color: "var(--color-ink)" }}>
                        {c.fullName || c.phone}
                      </td>
                      <td className="py-2 px-2 text-ink-soft">{toFa(c.orders)}</td>
                      <td className="py-2 px-2 text-teal font-bold">{toToman(c.spent)}</td>
                      <td className="py-2 px-2">
                        <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--color-surface-2)" }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${c.health}%`,
                              background: c.health >= 70 ? "var(--color-teal)" : c.health >= 40 ? "var(--color-gold)" : "var(--color-coral)",
                            }}
                          />
                        </div>
                      </td>
                      <td className="py-2 px-2">
                        <span className="rounded-full px-2 py-0.5 text-[10px]" style={{ background: `${SEGMENT_COLORS[c.segment] || "var(--color-line)"}20`, color: SEGMENT_COLORS[c.segment] }}>
                          {SEGMENT_LABELS[c.segment] || c.segment}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* دکمه‌ها */}
          <div className="flex gap-2">
            <button
              onClick={handleRecalcAll}
              className="rounded-full px-4 py-2 text-xs font-bold transition-colors"
              style={{ background: "var(--color-gold-tint)", color: "var(--color-gold)" }}
            >
              بازحساب RFM همه
            </button>
            <a
              href="/api/admin/crm/export"
              className="rounded-full px-4 py-2 text-xs font-bold transition-colors"
              style={{ background: "var(--color-teal-tint)", color: "var(--color-teal)" }}
            >
              خروجی CSV
            </a>
          </div>
        </div>
      )}

      {/* ============ لیست مشتری‌ها ============ */}
      {tab === "customers" && (
        <div className="space-y-4">
          {/* جستجو + فیلتر */}
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={custSearch}
              onChange={(e) => { setCustSearch(e.target.value); setCustPage(0); }}
              placeholder="جستجوی نام یا شماره..."
              className="rounded-full px-4 py-2 text-xs outline-none w-48"
              style={{ background: "var(--color-surface-2)", color: "var(--color-ink)", border: "1px solid var(--color-line-control)" }}
            />
            <select
              value={custSort}
              onChange={(e) => setCustSort(e.target.value)}
              className="rounded-full px-3 py-2 text-xs outline-none"
              style={{ background: "var(--color-surface-2)", color: "var(--color-ink)", border: "1px solid var(--color-line-control)" }}
            >
              <option value="spent">بیشترین خرید</option>
              <option value="orders">بیشترین سفارش</option>
              <option value="new">جدیدترین</option>
              <option value="activity">آخرین فعالیت</option>
              <option value="name">الفبایی</option>
            </select>
            <select
              value={custFilter}
              onChange={(e) => setCustFilter(e.target.value)}
              className="rounded-full px-3 py-2 text-xs outline-none"
              style={{ background: "var(--color-surface-2)", color: "var(--color-ink)", border: "1px solid var(--color-line-control)" }}
            >
              <option value="all">همه</option>
              <option value="buyers">خریدارها</option>
              <option value="idle">بدون خرید</option>
              <option value="followups">در حال پیگیری</option>
            </select>
          </div>

          {/* جدول */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--color-surface)" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-ink-dim border-b" style={{ borderColor: "var(--color-line)" }}>
                    <th className="text-right py-2 px-3">نام</th>
                    <th className="text-right py-2 px-3">شماره</th>
                    <th className="text-right py-2 px-3">سفارش</th>
                    <th className="text-right py-2 px-3">مبلغ</th>
                    <th className="text-right py-2 px-3">آخرین</th>
                    <th className="text-right py-2 px-3">برچسب</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((c) => (
                    <tr
                      key={c.id}
                      className="border-b cursor-pointer hover:bg-surface-2 transition-colors"
                      style={{ borderColor: "var(--color-line)" }}
                      onClick={() => openDetail(c.id)}
                    >
                      <td className="py-2 px-3 font-medium" style={{ color: "var(--color-ink)" }}>
                        {c.fullName || "—"}
                      </td>
                      <td className="py-2 px-3 text-ink-soft" dir="ltr">{c.phone}</td>
                      <td className="py-2 px-3 text-ink-soft">{toFa(c.paidOrders)}</td>
                      <td className="py-2 px-3 text-teal font-bold">{toToman(c.totalSpent)}</td>
                      <td className="py-2 px-3 text-ink-dim">{shortDate(c.lastOrderAt)}</td>
                      <td className="py-2 px-3">
                        <div className="flex gap-1 flex-wrap max-w-[150px]">
                          {c.tags.slice(0, 3).map((t) => (
                            <span key={t} className="rounded-full px-1.5 py-0.5 text-[9px]" style={{ background: "var(--color-teal-tint)", color: "var(--color-teal)" }}>
                              {t}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* صفحه‌بندی */}
          {custTotal > PAGE_SIZE && (
            <div className="flex gap-1 justify-center">
              {Array.from({ length: Math.ceil(custTotal / PAGE_SIZE) }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCustPage(i)}
                  className="w-7 h-7 rounded-full text-xs font-medium transition-colors"
                  style={{
                    background: i === custPage ? "var(--color-teal)" : "var(--color-surface)",
                    color: i === custPage ? "#04211B" : "var(--color-ink-soft)",
                  }}
                >
                  {toFa(i + 1)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============ جزئیات مشتری ============ */}
      {tab === "detail" && detail && (
        <div className="space-y-6">
          {/* دکمهٔ برگشت */}
          <button
            onClick={() => setTab("customers")}
            className="text-xs transition-colors"
            style={{ color: "var(--color-ink-dim)" }}
          >
            ← بازگشت به لیست
          </button>

          {/* هدر مشتری */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* پروفایل */}
            <div className="rounded-2xl p-4 md:col-span-2" style={{ background: "var(--color-surface)" }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold" style={{ background: "var(--color-teal-tint)", color: "var(--color-teal)" }}>
                  {detail.fullName ? detail.fullName[0] : "👤"}
                </div>
                <div>
                  <h2 className="text-sm font-bold" style={{ color: "var(--color-ink)" }}>
                    {detail.fullName || "بدون نام"}
                  </h2>
                  <p className="text-xs text-ink-dim" dir="ltr">{detail.phone}</p>
                </div>
                <div className="mr-auto">
                  <span className="rounded-full px-2.5 py-0.5 text-[10px] font-bold" style={{
                    background: `${SEGMENT_COLORS[detail.score?.segment] || "var(--color-line)"}20`,
                    color: SEGMENT_COLORS[detail.score?.segment] || "var(--color-ink-soft)",
                  }}>
                    {SEGMENT_LABELS[detail.score?.segment] || detail.score?.segment || "—"}
                  </span>
                </div>
              </div>

              {/* امتیاز RFM */}
              <div className="grid grid-cols-4 gap-2 mb-3">
                {[
                  { label: "R (آخرین خرید)", val: detail.score?.recency, max: 5 },
                  { label: "F (تعداد)", val: detail.score?.frequency, max: 5 },
                  { label: "M (مبلغ)", val: detail.score?.monetary, max: 5 },
                  { label: "سلامت", val: detail.score?.health + "%", max: 100, big: true },
                ].map((rfm) => (
                  <div key={rfm.label} className="text-center rounded-xl p-2" style={{ background: "var(--color-surface-2)" }}>
                    <div className="text-base font-extrabold" style={{ color: "var(--color-teal)" }}>
                      {rfm.val}
                    </div>
                    <div className="text-[9px] text-ink-dim">{rfm.label}</div>
                  </div>
                ))}
              </div>

              {/* برچسب‌ها */}
              <div className="flex flex-wrap gap-1 items-center">
                <span className="text-[11px] text-ink-dim ml-1">برچسب:</span>
                {tags.map((tag) => {
                  const active = detail.tags.some((t) => t.id === tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleToggleTag(tag.id)}
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors"
                      style={{
                        background: active ? tag.color + "30" : "var(--color-surface-2)",
                        color: active ? tag.color : "var(--color-ink-dim)",
                        border: `1px solid ${active ? tag.color : "var(--color-line)"}`,
                      }}
                    >
                      {tag.name}
                    </button>
                  );
                })}
                <div className="flex gap-1 mr-1">
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="برچسب جدید"
                    className="rounded-full px-2 py-0.5 text-[10px] outline-none w-20"
                    style={{ background: "var(--color-surface-2)", color: "var(--color-ink)", border: "1px solid var(--color-line-control)" }}
                    onKeyDown={(e) => e.key === "Enter" && handleCreateTag()}
                  />
                  <button
                    onClick={handleCreateTag}
                    className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                    style={{ background: "var(--color-teal-tint)", color: "var(--color-teal)" }}
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* سفارش‌های اخیر */}
            <div className="rounded-2xl p-4" style={{ background: "var(--color-surface)" }}>
              <h3 className="text-xs font-bold mb-3" style={{ color: "var(--color-ink)" }}>
                سفارش‌های اخیر
              </h3>
              {!detail.orders?.length ? (
                <p className="text-[11px] text-ink-dim">بدون سفارش</p>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {detail.orders.slice(0, 8).map((o) => (
                    <div key={o.id} className="text-[11px] flex justify-between">
                      <span className="text-ink-soft truncate max-w-[120px]">
                        {o.items?.[0]?.title || "سفارش"} ×{toFa(o.items?.length || 1)}
                      </span>
                      <span className="text-teal font-bold">{toToman(o.total)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* یادداشت + پیگیری */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* یادداشت */}
            <div className="rounded-2xl p-4" style={{ background: "var(--color-surface)" }}>
              <h3 className="text-xs font-bold mb-3" style={{ color: "var(--color-ink)" }}>
                یادداشت‌ها ({toFa(detail.notes?.length || 0)})
              </h3>
              <div className="space-y-2 max-h-60 overflow-y-auto mb-3">
                {detail.notes?.map((n) => (
                  <div key={n.id} className="rounded-xl p-2 text-[11px]" style={{ background: "var(--color-surface-2)" }}>
                    <p className="text-ink-soft mb-1">{n.body}</p>
                    <div className="flex justify-between text-ink-dim">
                      <span>{n.byName}</span>
                      <span>{shortDate(n.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="یادداشت جدید..."
                  className="flex-1 rounded-full px-3 py-1.5 text-[11px] outline-none"
                  style={{ background: "var(--color-surface-2)", color: "var(--color-ink)", border: "1px solid var(--color-line-control)" }}
                  onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
                />
                <button
                  onClick={handleAddNote}
                  className="rounded-full px-3 py-1.5 text-[11px] font-bold"
                  style={{ background: "var(--color-teal)", color: "#04211B" }}
                >
                  ثبت
                </button>
              </div>
            </div>

            {/* پیگیری */}
            <div className="rounded-2xl p-4" style={{ background: "var(--color-surface)" }}>
              <h3 className="text-xs font-bold mb-3" style={{ color: "var(--color-ink)" }}>
                پیگیری‌ها ({toFa(detail.tasks?.filter((t) => !t.done).length || 0)} باز)
              </h3>
              <div className="space-y-1.5 max-h-60 overflow-y-auto mb-3">
                {detail.tasks?.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-2 text-[11px] rounded-xl p-2 cursor-pointer"
                    style={{
                      background: t.done ? "var(--color-surface-2)" : "var(--color-gold-tint)",
                      opacity: t.done ? 0.6 : 1,
                    }}
                    onClick={() => handleToggleTask(t.id, t.done)}
                  >
                    <span
                      className="w-4 h-4 rounded border-2 flex items-center justify-center shrink-0"
                      style={{
                        borderColor: t.done ? "var(--color-teal)" : "var(--color-line-control)",
                        background: t.done ? "var(--color-teal)" : "transparent",
                      }}
                    >
                      {t.done && <span className="text-[8px] text-[#04211B]">✓</span>}
                    </span>
                    <span
                      className="flex-1"
                      style={{
                        color: t.done ? "var(--color-ink-dim)" : "var(--color-ink)",
                        textDecoration: t.done ? "line-through" : "none",
                      }}
                    >
                      {t.title}
                    </span>
                    {t.dueAt && (
                      <span className="text-ink-dim">{shortDate(t.dueAt)}</span>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="پیگیری جدید..."
                  className="flex-1 rounded-full px-3 py-1.5 text-[11px] outline-none"
                  style={{ background: "var(--color-surface-2)", color: "var(--color-ink)", border: "1px solid var(--color-line-control)" }}
                  onKeyDown={(e) => e.key === "Enter" && handleAddTask()}
                />
                <button
                  onClick={handleAddTask}
                  className="rounded-full px-3 py-1.5 text-[11px] font-bold"
                  style={{ background: "var(--color-gold)", color: "#04211B" }}
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* تایم‌لاین فعالیت */}
          <div className="rounded-2xl p-4" style={{ background: "var(--color-surface)" }}>
            <h3 className="text-xs font-bold mb-3" style={{ color: "var(--color-ink)" }}>
              تایم‌لاین فعالیت
            </h3>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {detail.activities?.slice(0, 30).map((a, i) => (
                <div key={a.id || i} className="flex gap-3 text-[11px]">
                  <div className="text-ink-dim shrink-0 w-20">{shortDate(a.createdAt)}</div>
                  <div
                    className="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0"
                    style={{ background: "var(--color-teal)" }}
                  />
                  <div>
                    <span className="text-ink-soft">{a.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}