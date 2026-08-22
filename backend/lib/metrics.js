// metrics.js — متریک سبکِ درون‌حافظه‌ای برای پنل «کارایی سرور»
//
// چرا این و نه Prometheus: برای یک فروشگاهِ تک‌پراسه، یک ابزارِ سنگینِ
// جمع‌آوری متریک بیش از خودِ سایت هزینه دارد. این ماژول فقط چند شمارنده و
// چند جمع در حافظه نگه می‌دارد — بدون شبکه، بدون دیسک، بدون وابستگی.
//
// چه چیزی می‌گوید:
//   - تعداد کل درخواست‌ها + تفکیک کد وضعیت
//   - میانگین/حداکثر تأخیر و درصد تأخیرهای کند (>۱ ثانیه)
//   - پرفروش‌ترین مسیرها (به‌تفکیک متد + الگوی مسیر)
//
// حریم خصوصی: مسیرها نرمال می‌شوند (اعداد → :id) پس هیچ داده‌ی شخصی نگه
// نمی‌داریم؛ فقط «الگوی مسیر چند بار صدا زده شده».

const ROUTE_KEY_MAX = 400;          // سقف الگوهای مسیر — از بادکردن حافظه با مسیرهای ساختگی جلوگیری می‌کند
const LATENCY_RING_MAX = 5000;      // آخرین ۵۰۰۰ تأخیر برای محاسبه‌ی صدک

const routes = new Map();           // "METHOD /path-pattern" → { count, totalMs, maxMs, slow, statuses: Map }
let recentMs = [];                  // حلقه‌ی آخرین تأخیرها (ms)
let ringIndex = 0;
let startedAt = Date.now();

function normalizePath(path) {
  // /product/123، /api/admin/users/45 و مانند آن به یک الگو تبدیل می‌شوند تا
  // هزاران شناسه‌ی یکتا، هزاران کلید جدا نسازند.
  return String(path || '/').replace(/\/\d+/g, '/:id');
}

function record(method, path, status, ms) {
  const key = `${method} ${normalizePath(path)}`;
  let r = routes.get(key);
  if (!r) {
    if (routes.size >= ROUTE_KEY_MAX) return; // مسیرهای جدید وقتی پر است ثبت نمی‌شوند؛ شمارنده‌ی کل دست‌نخورده نمی‌ماند
    r = { count: 0, totalMs: 0, maxMs: 0, slow: 0, statuses: new Map() };
    routes.set(key, r);
  }
  r.count += 1;
  r.totalMs += ms;
  if (ms > r.maxMs) r.maxMs = ms;
  if (ms >= 1000) r.slow += 1;
  const sc = String(status);
  r.statuses.set(sc, (r.statuses.get(sc) || 0) + 1);

  if (recentMs.length < LATENCY_RING_MAX) {
    recentMs.push(ms);
  } else {
    recentMs[ringIndex] = ms;
    ringIndex = (ringIndex + 1) % LATENCY_RING_MAX;
  }
}

// صدک از آرایه‌ی آخرین تأخیرها — تقریبی ولی برای دیدنِ «سنگین‌ترین‌ها» کافی
function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function snapshot() {
  let total = 0, totalMs = 0, slow = 0;
  const statuses = new Map();
  const top = [];
  for (const [key, r] of routes) {
    total += r.count;
    totalMs += r.totalMs;
    slow += r.slow;
    for (const [sc, n] of r.statuses) statuses.set(sc, (statuses.get(sc) || 0) + n);
    top.push({
      route: key,
      count: r.count,
      avgMs: Math.round((r.totalMs / r.count) * 10) / 10,
      maxMs: Math.round(r.maxMs * 10) / 10,
      slow: r.slow
    });
  }
  const sortedMs = recentMs.slice().sort((a, b) => a - b);
  top.sort((a, b) => b.count - a.count);
  return {
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    totalRequests: total,
    slowRequests: slow,
    avgMs: total ? Math.round((totalMs / total) * 10) / 10 : 0,
    p50Ms: Math.round(percentile(sortedMs, 50) * 10) / 10,
    p95Ms: Math.round(percentile(sortedMs, 95) * 10) / 10,
    p99Ms: Math.round(percentile(sortedMs, 99) * 10) / 10,
    statuses: Object.fromEntries(statuses),
    topRoutes: top.slice(0, 12),
    routeCount: routes.size
  };
}

// میدل‌ور: شروع درخواست را نشان می‌کند و در finish ثبتش می‌کند.
function metricsMiddleware(req, res, next) {
  const t0 = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    record(req.method, req.path, res.statusCode, ms);
  });
  next();
}

module.exports = { metricsMiddleware, snapshot };
