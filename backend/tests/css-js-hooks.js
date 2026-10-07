#!/usr/bin/env node
/* ============================================================
   نگهبانِ «وصلِ JS ↔ CSS ↔ markup» — هر کلاسی که JS می‌گذارد باید در CSS
   مصرف شود، و هر قاعده‌ای در CSS باید به چیزی تکیه کند که واقعاً وجود دارد.

   ---------- چرا این فایل وجود دارد ----------
   در این پروژه حالت‌های ظاهری با کلاس جابه‌جا می‌شوند: JS کلاس می‌گذارد
   (`classList.add('is-open')`) و CSS همان کلاس را می‌آراید. این وصل یک
   قراردادِ بین‌فایلی است و هیچ‌کدام از نگهبان‌های موجود آن را نمی‌سنجد:

     • یک کلاسِ وضعیت که در JS گذاشته می‌شود ولی هیچ قاعده‌ای در CSS ندارد
       یعنی «کاری می‌کنیم که هیچ اثری ندارد» — باگِ ظاهریِ خاموش.
     • یک قاعده در CSS که به کلاس/شناسه/صفتی تکیه دارد که هیچ‌جا در markup
       یا JS نیست یعنی «CSSِ مرده» — وزن و بارِ ذهنیِ بی‌مصرف.
     • یک `querySelector('.x')` در JS که markup آن را نمی‌سازد یعنی
       «نگهبانِ خالی» — همان درسی که نگهبانِ پنلِ بازنشسته داد.

   ---------- چطور کار می‌کند ----------
   هیچ‌چیز اجرا نمی‌شود؛ همه‌چیز ایستا از سورس خوانده می‌شود:
     ۱. از CSS، هر سلکتوری که پیش از `{` می‌آید استخراج و به توکن‌های
        `.class` / `#id` / `[attr]` شکسته می‌شود.
     ۲. از هر HTML، کلاس/شناسه/نامِ همهٔ صفت‌ها.
     ۳. از هر JS، کلاس‌هایی که با `classList`/`className`/`class="…"` گذاشته
        می‌شوند و مقصدهایی که با `querySelector`/`closest`/`getElementById`
        پرسیده می‌شوند.
   سپس سه فهرستِ «وصلِ ناتمام» ساخته و (در حالتِ `--check`) اگر چیزی
   اعلام‌نشده باشد ناموفق می‌شود. مقادیرِ پویا (مثلِ `classList.add('pc-' + x)`)
   کنار گذاشته می‌شوند، چون تحلیلِ ایستا نمی‌تواند تصمیم بگیرد.

   اجرا:
     node tests/css-js-hooks.js            # فقط گزارش
     node tests/css-js-hooks.js --check    # با کدِ خروجِ خطا اگر وصلِ ناتمامی بود
*/

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const FRONTEND = path.join(ROOT, 'frontend');
const args = process.argv.slice(2);
const CHECK = args.includes('--check');

const read = (p) => fs.readFileSync(p, 'utf8');
const list = (dir, re) =>
  fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => re.test(f)).sort()
    : [];

// ------------------------------------------------------------
// چیزهایی که عمداً در فهرست نیستند — «وصلِ آگاهانه‌ی اعلام‌شده».
// هر ردیف باید دلیل داشته باشد، وگرنه «استثنا» به «فراموشی» تبدیل می‌شود.
// ------------------------------------------------------------
const IGNORED_CLASSES = new Set([
  // کلاس‌هایی که JS فقط به‌عنوان «پرچمِ منطق» می‌گذارد (نه وضعیتِ ظاهری) و
  // هیچ‌جای CSS لازم نیست؛ مصرف‌کننده‌هایشان خودِ JS هستند.
]);
const IGNORED_SELECTORS = new Set([
  // شناسه/کلاس‌هایی که از بیرون تزریق می‌شوند (مثلاً توسط خودِ مرورگر یا
  // ابزارِ تحلیلی) و در سورسِ ما نیستند.
]);
// صفت‌های استانداردِ HTML که مرورگر خودش می‌گذارد/می‌دارد (بولین) و در
// markup نوشته نمی‌شوند. `[open]` روی `<details class="faq-item">` نمونه‌اش
// است: مرورگر با باز شدنِ آکاردئون `open` را ست می‌کند و CSS همین را می‌آراید.
// بدونِ این فهرست، هر قاعدهٔ `[open]`/`[checked]`/… به‌غلط «مرده» می‌شد.
const NATIVE_ATTRS = new Set([
  'open', 'checked', 'selected', 'disabled', 'hidden', 'required',
  'readonly', 'multiple', 'autofocus', 'controls', 'loop', 'muted',
  'novalidate', 'draggable', 'contenteditable',
]);

// ------------------------------------------------------------
// ۱) CSS → توکن‌های سلکتور
// ------------------------------------------------------------
function cssTokens(cssText) {
  const classes = new Set();
  const ids = new Set();
  const attrs = new Set();
  const stripped = cssText.replace(/\/\*[\s\S]*?\*\//g, ' ');
  let buf = '';
  for (const ch of stripped) {
    if (ch === '{') {
      const sel = buf.trim();
      buf = '';
      if (!sel || sel.startsWith('@')) continue; // preludeِ at-rule یا دمِ keyframe
      for (const m of sel.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) classes.add(m[1]);
      for (const m of sel.matchAll(/#(-?[A-Za-z_][\w-]*)/g)) ids.add(m[1]);
      for (const m of sel.matchAll(/\[([A-Za-z-][\w-]*)/g)) attrs.add(m[1]);
      continue;
    }
    if (ch === '}') {
      buf = '';
      continue;
    }
    buf += ch;
  }
  return { classes, ids, attrs };
}

// ------------------------------------------------------------
// ۲) markup → کلاس/شناسه/صفت
// ------------------------------------------------------------
function markupTokens(html) {
  const classes = new Set();
  const ids = new Set();
  const attrs = new Set();
  for (const m of html.matchAll(/class\s*=\s*"([^"]*)"/g))
    m[1].split(/\s+/).filter(Boolean).forEach((c) => classes.add(c));
  for (const m of html.matchAll(/\bid\s*=\s*"([^"]*)"/g))
    if (m[1].trim()) ids.add(m[1].trim());
  // نامِ صفت‌ها، چه مقدادار (`class="x"`) و چه بی‌مقدار (`data-reveal`،
  // `disabled`، `open`). بدون این، قاعده‌های `[data-reveal]`/`[disabled]`
  // بی‌جهت «مرده» حساب می‌شدند.
  for (const tag of html.matchAll(/<[a-zA-Z][^>]*>/g))
    for (const m of tag[0].matchAll(/\s([a-zA-Z-][\w:-]*)(?=\s|=|\/?>)/g))
      attrs.add(m[1]);
  return { classes, ids, attrs };
}

// ------------------------------------------------------------
// ۳) JS → کلاس‌هایی که می‌گذارد + مقاصدی که می‌پرسد
// ------------------------------------------------------------
const CLASS_LIST_CALL =
  /classList\.(add|remove|toggle|contains)\(([^)]*)\)/g;

/**
 * مقدارِ `class="…"` را با احتسابِ `${…}`هایی که خودشان کوتیشن دارند
 * بیرون می‌کشد. یک regex ساده این‌جا می‌شکند: در
 * `class="pd-thumb${i === 0 ? ' on' : ''}"` اولین آپاستروفِ داخلِ `${}`
 * رشته را زودتر تمام می‌کند و کلاس از دست می‌رود.
 */
function classAttrTokens(js) {
  const tokens = [];
  const prefixes = [];
  const open = /\bclass\s*=\s*(["'`])/g;
  let m;
  while ((m = open.exec(js))) {
    const quote = m[1];
    let i = open.lastIndex;
    let buf = '';
    while (i < js.length) {
      if (js.startsWith('${', i)) {
        // داخلِ interpolation غالباً شرط است، ولی رشته‌های لفظیِ داخلش هم
        // کلاس‌اند (`' has-image'`، `' on'`، `' active'`) و باید دیده شوند.
        // پیشوندِ پویا: اگر انتهای بافر یک توکنِ «…‌-» باشد، مقدارِ درونِ
        // `${}` ادامه‌ی همان نام است (`status-badge status-${order.status}`).
        // مقادیرِ ممکن از سورسِ JS آمدنی نیست، پس نباید قاعده‌های `status-*`
        // را «مرده» شمرد.
        const tail = buf.match(/(?:^|\s)([A-Za-z][\w-]*)-\s*$/);
        if (tail) prefixes.push(tail[1]);
        i += 2;
        let depth = 1;
        let inner = '';
        while (i < js.length && depth > 0) {
          const ch = js[i];
          if (ch === '{') depth++;
          else if (ch === '}') {
            depth--;
            if (depth === 0) {
              i++;
              break;
            }
          }
          inner += ch;
          i++;
        }
        // فقط شاخه‌های سه‌گانه کلاس‌اند (`? ' on' : ''`). رشته‌های دیگرِ
        // داخل شرط، *داده*اند نه کلاس: در `cls(is(['product']))` «product»
        // نامِ صفحه است، نه نامِ کلاسِ CSS.
        for (const q of inner.matchAll(/[?:]\s*(['"`])([^'"`]*)\1/g))
          buf += ' ' + q[2];
        continue;
      }
      const ch = js[i];
      if (ch === quote) {
        i++;
        break;
      }
      if (ch === '\n') break; // رشتهٔ تمام‌نشده — ولش کن
      buf += ch;
      i++;
    }
    buf.split(/\s+/).filter(isRealClass).forEach((t) => tokens.push(t));
    open.lastIndex = i;
  }
  return { tokens, prefixes };
}

/** جداکردنِ آرگومان‌ها در سطحِ بالا (کوتیشن و پرانتز را نمی‌شکند). */
function splitArgs(inner) {
  const out = [];
  let buf = '';
  let depth = 0;
  let quote = null;
  for (const ch of inner) {
    if (quote) {
      buf += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      quote = ch;
      buf += ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      out.push(buf);
      buf = '';
      continue;
    }
    buf += ch;
  }
  out.push(buf);
  return out.map((s) => s.trim()).filter(Boolean);
}

// `${...}`های درون رشته را حذف می‌کند. بی این، `class="bn-item${cls(x)}"
// به یک توکنِ بی‌معنی می‌شکند و کلاسِ واقعی را از دست می‌دهیم.
const stripInterp = (s) => s.replace(/\$\{[^}]*\}/g, ' ');

// فقط توکنی که واقعاً شکلِ نامِ کلاس دارد؛ بافه‌های شکسته در این قالب جا نمی‌شوند.
const isRealClass = (c) =>
  /^-?[A-Za-z_][\w-]*[A-Za-z0-9_]$/.test(c) || /^-?[A-Za-z_]$/.test(c);

function jsTokens(js) {
  const setClasses = new Set();
  const queryClasses = new Set();
  const queryIds = new Set();
  const queryAttrs = new Set();
  const setAttrs = new Set();
  const markupIds = new Set();
  const dynamicPrefixes = new Set();
  const dynamic = [];

  const addTokens = (raw, into) =>
    stripInterp(raw)
      .split(/\s+/)
      .filter((c) => c && isRealClass(c))
      .forEach((c) => into.add(c));

  for (const m of js.matchAll(CLASS_LIST_CALL)) {
    const method = m[1];
    // `contains` فقط *می‌خواند*؛ باگِ ظاهری نمی‌سازد و باید مقصد حساب شود نه
    // «گذاشتن»، وگرنه `no-scroll` که هیچ‌جا ست نمی‌شود به‌غلط «کلاسِ بی‌قاعده»
    // گزارش می‌شد.
    const isRead = method === 'contains';
    // در `toggle`/`contains` آرگومانِ دوم *شرطِ* بولین است
    // (`toggle('hidden', name === 'pass')`) و گرفتنش یعنی «pass» به‌عنوانِ
    // کلاسِ مرده گزارش شود.
    const parts = splitArgs(m[2]);
    const relevant =
      method === 'toggle' || method === 'contains' ? parts.slice(0, 1) : parts;
    for (const part of relevant) {
      const lit = part.match(/^(['"`])([^'"`]+)\1$/);
      if (lit && !lit[2].includes('${')) {
        addTokens(lit[2], isRead ? queryClasses : setClasses);
      } else if (part) {
        // `classList.add('pc-' + x)` → پیشوندِ پویا
        const pfx = part.match(/^(['"`])([A-Za-z][\w-]*?)-\1\s*\+/);
        if (pfx) dynamicPrefixes.add(pfx[2]);
        dynamic.push(`classList.${method}(${part})`);
      }
    }
  }
  const ca = classAttrTokens(js);
  ca.tokens.forEach((t) => setClasses.add(t));
  ca.prefixes.forEach((p) => dynamicPrefixes.add(p));
  // `x.className = 'a' + (cond ? ' b' : '')` — هم رشتهٔ چسبیده و هم شاخه‌های سه‌گانه
  for (const m of js.matchAll(/\.className\s*=\s*([^;\n]*)/g)) {
    const rhs = m[1];
    const leading = rhs.match(/^\s*(['"`])([^'"`]*)\1/);
    if (leading) addTokens(leading[2], setClasses);
    // `out.className = 'prefix-' + x`
    const pfx = rhs.match(/^\s*(['"`])([A-Za-z][\w-]*?)-\1\s*\+/);
    if (pfx) dynamicPrefixes.add(pfx[2]);
    for (const q of rhs.matchAll(/[?:]\s*(['"`])([^'"`]*)\1/g))
      addTokens(q[2], setClasses);
  }

  const QUERY =
    /(?:querySelector(?:All)?|closest|matches|getElementsByClassName)\(\s*(['"`])([^'"`]+)\1/g;
  for (const m of js.matchAll(QUERY)) {
    const sel = stripInterp(m[2]);
    for (const c of sel.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) queryClasses.add(c[1]);
    for (const c of sel.matchAll(/#(-?[A-Za-z_][\w-]*)/g)) queryIds.add(c[1]);
    for (const c of sel.matchAll(/\[([A-Za-z-][\w-]*)/g)) queryAttrs.add(c[1]);
  }
  for (const m of js.matchAll(/getElementById\(\s*(['"`])([^'"`]+)\1/g))
    queryIds.add(m[2]);
  for (const m of js.matchAll(/setAttribute\(\s*(['"`])([^'"`]+)\1/g))
    setAttrs.add(m[2]);
  // `el.dataset.foo` ≡ `data-foo`
  for (const m of js.matchAll(/\.dataset\.([A-Za-z_][\w]*)/g))
    setAttrs.add('data-' + m[1].replace(/([A-Z])/g, '-$1').toLowerCase());
  // شناسه‌هایی که خودِ JS در markupِ ساختهٔ خودش می‌گذارد (مثل `id="plRetry"`)
  for (const m of js.matchAll(/\bid\s*=\s*(["'`])([^"'`]+)\1/g)) {
    const v = stripInterp(m[2]).trim();
    if (v && !v.includes('${')) markupIds.add(v);
  }

  return {
    setClasses,
    queryClasses,
    queryIds,
    queryAttrs,
    setAttrs,
    markupIds,
    dynamicPrefixes,
    dynamic,
  };
}

// ------------------------------------------------------------
// اجرا
// ------------------------------------------------------------
const cssFiles = list(path.join(FRONTEND, 'css'), /\.css$/);
const htmlFiles = list(FRONTEND, /\.html$/);
const jsFiles = list(path.join(FRONTEND, 'js'), /\.js$/);

const css = { classes: new Set(), ids: new Set(), attrs: new Set() };
for (const f of cssFiles) {
  const t = cssTokens(read(path.join(FRONTEND, 'css', f)));
  t.classes.forEach((c) => css.classes.add(c));
  t.ids.forEach((c) => css.ids.add(c));
  t.attrs.forEach((c) => css.attrs.add(c));
}

const html = { classes: new Set(), ids: new Set(), attrs: new Set() };
for (const f of htmlFiles) {
  const t = markupTokens(read(path.join(FRONTEND, f)));
  t.classes.forEach((c) => html.classes.add(c));
  t.ids.forEach((c) => html.ids.add(c));
  t.attrs.forEach((c) => html.attrs.add(c));
}

const js = {
  setClasses: new Set(),
  queryClasses: new Set(),
  queryIds: new Set(),
  queryAttrs: new Set(),
  setAttrs: new Set(),
  markupIds: new Set(),
  dynamicPrefixes: new Set(),
  dynamic: [],
};
for (const f of jsFiles) {
  const t = jsTokens(read(path.join(FRONTEND, 'js', f)));
  t.setClasses.forEach((c) => js.setClasses.add(c));
  t.queryClasses.forEach((c) => js.queryClasses.add(c));
  t.queryIds.forEach((c) => js.queryIds.add(c));
  t.queryAttrs.forEach((c) => js.queryAttrs.add(c));
  t.setAttrs.forEach((c) => js.setAttrs.add(c));
  t.markupIds.forEach((c) => js.markupIds.add(c));
  t.dynamicPrefixes.forEach((p) => js.dynamicPrefixes.add(p));
  t.dynamic.forEach((d) => js.dynamic.push(`${f}: ${d}`));
}

// JS markup (class="…" داخل رشته‌های JS) هم بخشی از markup است
const knownClasses = new Set([...html.classes, ...js.setClasses]);
const knownIds = new Set([...html.ids, ...js.markupIds]);

const only = (set, minus) => [...set].filter((x) => !minus.has(x)).sort();

// الف) کلاسی که JS می‌گذارد ولی CSS مصرفش نمی‌کند
const deadHooks = only(js.setClasses, css.classes).filter(
  (c) => !IGNORED_CLASSES.has(c),
);
// پیشوندهای پویا: CSS‌هایی که JS با `prefix-${value}` می‌سازد مصرف‌شده‌اند،
// حتی اگر مقدارِ دقیق از تحلیلِ ایستا درنیاید (`status-${order.status}`).
// این‌ها «مرده» نیستند ولی «تأییدشده» هم نیستند — جدا گزارش می‌شوند.
const dynPrefixes = [...js.dynamicPrefixes].sort();
const matchesDynamic = (c) => dynPrefixes.some((p) => c.startsWith(p + '-'));
const untracked = only(css.classes, knownClasses);
// ب) قاعده‌ای که به کلاسِ ناموجود تکیه دارد (بدونِ پویاها)
const deadClassRules = untracked.filter(
  (c) => !IGNORED_CLASSES.has(c) && !matchesDynamic(c),
);
const dynamicClassRules = untracked.filter(matchesDynamic);
// ج) قاعده‌ای که به شناسهٔ ناموجود تکیه دارد
const deadIdRules = only(css.ids, knownIds).filter(
  (c) => !IGNORED_SELECTORS.has(c),
);
// د) قاعده‌ای که به صفتِ ناموجود تکیه دارد (صفت‌های بومیِ مرورگر مستثنا)
const deadAttrRules = only(
  css.attrs,
  new Set([...html.attrs, ...js.setAttrs, ...NATIVE_ATTRS]),
);
// ه) JS چیزی را می‌پرسد که markup نمی‌سازد
const orphanQueries = only(js.queryClasses, knownClasses).filter(
  (c) => !IGNORED_CLASSES.has(c),
);
const orphanQueryIds = only(js.queryIds, knownIds);

const groups = [
  ['کلاسِ JS بدونِ قاعدهٔ CSS (وصلِ ناتمام)', deadHooks],
  ['قاعدهٔ CSS برای کلاسی که هیچ‌جا نیست', deadClassRules],
  ['قاعدهٔ CSS برای شناسه‌ای که هیچ‌جا نیست', deadIdRules],
  ['قاعدهٔ CSS برای صفتی که هیچ‌جا نیست', deadAttrRules],
  ['JS کلاسی را می‌پرسد که markup ندارد', orphanQueries],
  ['JS شناسه‌ای را می‌پرسد که markup ندارد', orphanQueryIds],
];

console.log('وصلِ JS ↔ CSS ↔ markup — گزارشِ ایستا\n');
console.log(
  `سورس: ${cssFiles.length} فایلِ CSS، ${htmlFiles.length} فایلِ HTML، ${jsFiles.length} فایلِ JS\n`,
);
let total = 0;
for (const [label, items] of groups) {
  total += items.length;
  console.log(`── ${label}: ${items.length}`);
  for (const it of items) console.log(`   • ${it}`);
  console.log('');
}
// پویاها در «مجموع» شمرده نمی‌شوند: قاعده‌های `status-*`/`alert-*` مصرفِ
// پویا دارند و «مرده» نیستند؛ ولی چون مقدارها ایستا اثبات‌شدنی نیستند،
// جدا و برای بازبینیِ انسانی آورده می‌شوند.
if (dynamicClassRules.length) {
  console.log(`── مصرفِ پویا (قاعده‌های ${dynPrefixes.join('/')}): ${dynamicClassRules.length}`);
  for (const c of dynamicClassRules) console.log(`   ~ ${c}`);
  console.log('');
}
if (js.dynamic.length) {
  console.log(`── پویا (تحلیل‌ناپذیر): ${js.dynamic.length}`);
  for (const d of js.dynamic) console.log(`   ? ${d}`);
  console.log('');
}

if (!total) console.log('✔ هیچ وصلِ ناتمامی پیدا نشد.\n');
else console.log(`مجموع: ${total} موردِ نیازمندِ بررسی.\n`);

if (CHECK && total) process.exitCode = 1;
