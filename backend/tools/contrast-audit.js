#!/usr/bin/env node
/* ============================================================
   contrast-audit.js — بازرسِ کنتراست رنگ بر پایه‌ی WCAG 2.2 سطح AA
   ------------------------------------------------------------
   بدون هیچ پکیج بیرونی. چهار چیز را می‌سنجد:

     ۱) متن روی زمینه (معیار 1.4.3):
        نسبت ۴٫۵:۱ برای متن معمولی، و ۳:۱ برای «متن درشت»
        (۲۴px به بالا، یا ۱۸٫۶۶px به بالا اگر ضخیم باشد).

     ۲) اجزای رابط و مرزها (معیار 1.4.11):
        مرزِ اینپوت/دکمه‌ی خطی باید حداقل ۳:۱ با زمینه‌اش فرق کند،
        وگرنه کاربر نمی‌فهمد کادر کجاست.

     ۳) حلقه‌ی فوکوس (معیار 2.4.13 در 2.2 + 1.4.11):
        رنگِ outline باید حداقل ۳:۱ با زمینه فرق کند.

     ۴) شفافیت: هر رنگِ نیمه‌شفاف (rgba) و هر opacity روی متن،
        قبل از محاسبه روی زمینه‌ی واقعی‌اش ترکیب می‌شود — چون
        چشمِ کاربر همان رنگِ ترکیب‌شده را می‌بیند، نه مقدارِ خام.

   محدودیتِ صادقانه‌ی این ابزار: آبشار CSS را کامل شبیه‌سازی نمی‌کند
   (این کار بدون مرورگر ممکن نیست). به‌جایش یک جدولِ صریح از
   «کدام سلکتور روی کدام سطح می‌نشیند» دارد (CONTEXTS) و بقیه را روی
   زمینه‌ی صفحه می‌سنجد. اگر جایی سطحِ جدیدی اضافه شد، باید همان‌جا
   ثبت شود — این عمدی است تا گزارش دروغِ سبز ندهد.

   اجرا (از پوشه‌ی backend):  node tools/contrast-audit.js
   ============================================================ */

const fs = require('fs');
const path = require('path');

const CSS_FILE = path.join(__dirname, '..', '..', 'frontend', 'css', 'style.css');
const raw = fs.readFileSync(CSS_FILE, 'utf8');
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');

/* ---------- ۱) ریاضیاتِ رنگ ---------- */

function parseHex(h) {
  h = h.replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  if (h.length === 8) h = h.slice(0, 6);          // #RRGGBBAA → آلفا جدا حساب می‌شود
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
}

// هر رنگ به شکل [r,g,b,a] برگردانده می‌شود
function parseColor(value, vars, depth = 0) {
  if (!value || depth > 6) return null;
  let v = String(value).trim();

  // var(--x) و var(--x, fallback)
  const varM = v.match(/^var\(\s*(--[\w-]+)\s*(?:,\s*([\s\S]+))?\)$/);
  if (varM) {
    const own = vars[varM[1]];
    if (own !== undefined) return parseColor(own, vars, depth + 1);
    return varM[2] ? parseColor(varM[2], vars, depth + 1) : null;
  }

  if (v.startsWith('#')) return parseHex(v);

  const rgbM = v.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbM) {
    const parts = rgbM[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return null;
    const a = parts.length > 3 && !Number.isNaN(parts[3]) ? parts[3] : 1;
    return [parts[0], parts[1], parts[2], a];
  }

  const NAMED = {
    white: [255, 255, 255, 1], black: [0, 0, 0, 1], transparent: [0, 0, 0, 0],
    red: [255, 0, 0, 1], inherit: null, currentcolor: null
  };
  const key = v.toLowerCase();
  if (key in NAMED) return NAMED[key];
  return null;
}

// ترکیبِ رنگِ نیمه‌شفاف روی زمینه — همان کاری که مرورگر می‌کند
function over(fg, bg) {
  if (!fg) return null;
  const a = fg[3] === undefined ? 1 : fg[3];
  if (a >= 1) return [fg[0], fg[1], fg[2], 1];
  if (!bg) return null;
  return [
    Math.round(fg[0] * a + bg[0] * (1 - a)),
    Math.round(fg[1] * a + bg[1] * (1 - a)),
    Math.round(fg[2] * a + bg[2] * (1 - a)),
    1
  ];
}

function luminance([r, g, b]) {
  const f = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  if (!a || !b) return null;
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

const hexOf = (c) => c ? '#' + c.slice(0, 3).map(n => n.toString(16).padStart(2, '0')).join('').toUpperCase() : '—';

/* ---------- ۲) تجزیه‌ی CSS ---------- */

function parseBlocks(text) {
  const rules = [];
  let i = 0;
  while (i < text.length) {
    const at = text.indexOf('@media', i);
    if (at === -1) { collect(text.slice(i), null, rules); break; }
    collect(text.slice(i, at), null, rules);
    const braceStart = text.indexOf('{', at);
    const cond = text.slice(at + 6, braceStart).trim();
    let depth = 0, j = braceStart;
    for (; j < text.length; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') { depth--; if (depth === 0) break; }
    }
    collect(text.slice(braceStart + 1, j), cond, rules);
    i = j + 1;
  }
  return rules;
}

function collect(chunk, media, out) {
  const re = /([^{}@]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(chunk))) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    if (!selector || selector.startsWith('@')) continue;
    out.push({ media, selector, body: m[2].trim(), line: lineOf(m.index, chunk, media) });
  }
}

// شماره‌ی خط تقریبی برای اینکه گزارش قابل‌پیگیری باشد
function lineOf(idx, chunk) {
  const snippet = chunk.slice(Math.max(0, idx - 4), idx + 40).trim().split('\n')[0];
  const at = raw.indexOf(snippet.slice(0, 30));
  return at === -1 ? 0 : raw.slice(0, at).split('\n').length;
}

const RULES = parseBlocks(css);

// اعلان‌های یک بلاک را درست جدا می‌کند (به‌جای regex روی کل بدنه، که مقدارِ
// چندبخشی مثل box-shadow را نصفه می‌کند)
function decls(body) {
  const out = {};
  let depth = 0, buf = '';
  const parts = [];
  for (const ch of body) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ';' && depth === 0) { parts.push(buf); buf = ''; continue; }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf);
  for (const p of parts) {
    const c = p.indexOf(':');
    if (c === -1) continue;
    const prop = p.slice(0, c).trim().toLowerCase();
    const val = p.slice(c + 1).trim().replace(/\s*!important$/i, '');
    if (prop) out[prop] = val;
  }
  return out;
}

/* ---------- ۳) متغیرهای :root ---------- */

const VARS = {};
for (const r of RULES) {
  if (!/(^|,)\s*:root\s*(,|$)/.test(r.selector)) continue;
  const d = decls(r.body);
  for (const [k, v] of Object.entries(d)) if (k.startsWith('--')) VARS[k] = v;
}

const V = (name) => parseColor(`var(${name})`, VARS);
const PAGE_BG = V('--cream') || [11, 20, 17, 1];

/* ---------- ۴) جدولِ سطوح ----------
   کلید: پیش‌وندِ سلکتور. مقدار: متغیرِ رنگِ زمینه‌ای که آن عنصر روی آن می‌نشیند.
   ترتیب مهم است — اولین تطبیق برنده است، پس خاص‌ترها بالاتر می‌آیند. */
const CONTEXTS = [
  // برگه‌ی فاکتور روی کاغذِ سفید چاپ می‌شود، نه روی سطحِ تیره‌ی سایت
  ['.invoice-sheet', '#ffffff'],
  ['.inv-', '#ffffff'],
  // بنرِ تخفیف پرکننده‌ی گرم دارد؛ بچه‌هایش روی همان می‌نشینند نه روی زمینه‌ی صفحه.
  // میانه‌ی گرادیان را می‌گیریم چون بدترین حالتِ سه توقف است.
  ['.promo', '#C4381F'],
  ['.oa-primary', '--teal'],
  ['.btn-primary', '--teal'],
  ['.btn-danger', '--coral-dark'],
  ['.badge-off', '--coral'],
  ['.badge-new', '--teal'],
  ['input', '--surface-2'],
  ['select', '--surface-2'],
  ['textarea', '--surface-2'],
  ['.field', '--surface-2'],
  ['.qty', '--surface-2'],
  ['.suggest', '--surface'],
  ['.cat-menu', '--surface'],
  ['.product-card', '--surface'],
  ['.feature-card', '--surface'],
  ['.testi-card', '--surface'],
  ['.info-card', '--surface'],
  ['.map-box', '--surface'],
  ['.faq', '--surface'],
  ['.auth-card', '--surface'],
  ['.summary', '--surface'],
  ['.cart-row', '--surface'],
  ['.order-', '--surface'],
  ['.addr', '--surface'],
  ['.ad-', '--surface'],
  ['.rv-', '--surface'],
  ['.terms-card', '--surface'],
  ['.empty-state', '--surface'],
  ['.page-error', '--surface'],
  ['.toast', '--surface'],
  ['.modal', '--surface'],
  ['.qv-', '--surface'],
  ['.drawer', '--surface'],
  ['.pd-', '--surface'],
  ['header', '--surface'],
  ['footer', '--surface'],
  ['.logo', '--surface']
];

// رنگ‌های داخل یک gradient. متن روی گرادیان باید روی *بدترین* توقفِ رنگ هم
// خوانا باشد، نه فقط اولی — پس همه را برمی‌گردانیم و بعد کمترین نسبت را می‌گیریم.
function gradientStops(value, vars) {
  if (!/gradient\(/i.test(value)) return [];
  const inner = value.slice(value.indexOf('(') + 1, value.lastIndexOf(')'));
  const stops = [];
  for (const tok of inner.split(/,(?![^(]*\))/)) {
    const t = tok.trim().replace(/\s+-?[\d.]+%?$/, '').replace(/\s+[\d.]+px$/, '');
    const c = parseColor(t, vars);
    // توقفِ نیمه‌شفاف اول باید روی زمینه‌ی صفحه بنشیند، وگرنه رنگی که
    // می‌سنجیم اصلاً چیزی نیست که چشم می‌بیند (مثلاً نوارِ سبزِ کم‌رنگِ بالای صفحه
    // را «سبزِ پررنگ» فرض می‌کرد و اشتباهاً ایراد می‌گرفت).
    if (c && c[3] > 0) stops.push(c[3] < 1 ? over(c, PAGE_BG) : c);
  }
  return stops;
}

// همه‌ی زمینه‌های ممکن برای یک قاعده. بیش از یکی یعنی گرادیان.
function bgFor(rule) {
  const d = decls(rule.body);
  for (const prop of ['background-color', 'background', 'background-image']) {
    if (!d[prop]) continue;
    const stops = gradientStops(d[prop], VARS);
    if (stops.length) return { colors: stops, from: 'گرادیانِ خودِ قاعده' };
    const first = d[prop].split(/\s+(?![^(]*\))/)[0];
    const c = parseColor(first, VARS);
    if (c && c[3] === 1) return { colors: [c], from: 'خودِ قاعده' };
    if (c && c[3] > 0) {
      const merged = over(c, PAGE_BG);
      if (merged) return { colors: [merged], from: 'زمینه‌ی نیمه‌شفافِ خودِ قاعده' };
    }
  }
  const sel = rule.selector.split(',')[0].trim();
  for (const [prefix, varName] of CONTEXTS) {
    if (sel.includes(prefix)) {
      const c = varName.startsWith('--') ? V(varName) : parseColor(varName, VARS);
      if (c) return { colors: [c], from: varName };
    }
  }
  return { colors: [PAGE_BG], from: '--cream' };
}

/* ---------- ۵) آستانه‌ی WCAG ---------- */

function threshold(d) {
  const fs = parseFloat((d['font-size'] || '').replace('px', ''));
  const wRaw = (d['font-weight'] || '').trim();
  const w = wRaw === 'bold' ? 700 : parseInt(wRaw, 10) || 0;
  // «متن درشت» در WCAG: ۱۸pt = ۲۴px، یا ۱۴pt = ۱۸٫۶۶px اگر ضخیم باشد
  if (fs >= 24) return { need: 3, kind: 'درشت' };
  if (fs >= 18.66 && w >= 700) return { need: 3, kind: 'درشتِ ضخیم' };
  return { need: 4.5, kind: 'معمولی' };
}

/* عناصری که متن نیستند یا سنجش‌شان معنی ندارد */
const SKIP = [
  /::(before|after|placeholder|selection|marker|backdrop)/,
  /-webkit-/,
  /^:root$/,
  /^html$/,
  /\bsvg\b/,
  /\bicon\b/,
  /\bchev\b/,
  /\bstar/,
  /\bspinner/,
  /\bskeleton/,
  /\bab-float\b/,     // آیکون‌های تزئینیِ پس‌زمینه — متن نیستند
  /\baf-\d/,
  /\bdivider/,
  /\bsr-only/,
  /\bvisually-hidden/
];

let problems = 0;
const fails = [];
const warn = (msg) => { problems++; console.log('  ⚠  ' + msg); };

console.log('\n════════════════════════════════════════════');
console.log('  بازرسی کنتراست — WCAG 2.2 سطح AA');
console.log('════════════════════════════════════════════\n');

/* ---------- بخش ۱: پالت خام ---------- */
console.log('┌─ پالت: نسبتِ هر رنگِ متن روی هر سطح\n');
const FG_VARS = ['--ink', '--ink-soft', '--teal', '--teal-dark', '--coral', '--coral-dark', '--pink', '--gold'];
const BG_VARS = ['--cream', '--surface', '--surface-2'];
const head = 'رنگ'.padEnd(16) + BG_VARS.map(b => b.replace('--', '').padStart(11)).join('');
console.log('  ' + head);
console.log('  ' + '─'.repeat(head.length));
for (const f of FG_VARS) {
  const fc = V(f);
  const cells = BG_VARS.map(b => {
    const r = contrast(over(fc, V(b)), V(b));
    return (r ? r.toFixed(2) : '—').padStart(11);
  });
  console.log('  ' + f.replace('--', '').padEnd(16) + cells.join(''));
  for (const b of BG_VARS) {
    const r = contrast(over(fc, V(b)), V(b));
    if (r !== null && r < 4.5) fails.push(`پالت: ${f} روی ${b} = ${r.toFixed(2)} (کمتر از ۴٫۵)`);
  }
}

/* ---------- بخش ۲: متنِ هر قاعده روی زمینه‌ی واقعی‌اش ---------- */
console.log('\n┌─ متن روی زمینه (معیار 1.4.3)\n');
let checkedText = 0;
for (const r of RULES) {
  if (r.media && /print|forced-colors/.test(r.media)) continue;
  const sel = r.selector;
  if (SKIP.some(re => re.test(sel))) continue;
  const d = decls(r.body);
  if (!d.color) continue;
  // color:transparent یعنی متن با background-clip:text رنگ می‌گیرد؛ رنگِ دیده‌شده
  // همان گرادیانِ زمینه است، نه این مقدار. سنجشش اینجا بی‌معنی است.
  if (/^transparent$/i.test(d.color.trim())) continue;
  // همان حالت، ولی با -webkit-text-fill-color که روی color را می‌پوشاند
  if (/transparent/i.test(d['-webkit-text-fill-color'] || '')) continue;
  if (/text/i.test(d['background-clip'] || d['-webkit-background-clip'] || '')) continue;

  const bg = bgFor(r);
  const base = parseColor(d.color, VARS);
  if (!base) continue;                            // inherit / currentColor — از این قاعده چیزی نمی‌فهمیم

  // بدترین حالت را گزارش کن: اگر زمینه گرادیان است، کم‌کنتراست‌ترین توقفِ رنگ
  let worst = null, worstBg = null;
  for (const bgc of bg.colors) {
    let fg = over(base, bgc);
    if (!fg) continue;
    // opacity روی خودِ عنصر هم متن را محو می‌کند — همان‌طور که چشم می‌بیند بسنج
    const op = parseFloat(d.opacity);
    if (!Number.isNaN(op) && op > 0 && op < 1) fg = over([fg[0], fg[1], fg[2], op], bgc);
    const ratio = contrast(fg, bgc);
    if (ratio === null) continue;
    if (worst === null || ratio < worst.ratio) worst = { ratio, fg }, worstBg = bgc;
  }
  if (!worst) continue;
  checkedText++;
  const { need, kind } = threshold(d);
  if (worst.ratio < need) {
    fails.push(`«${sel.slice(0, 52)}»: ${hexOf(worst.fg)} روی ${hexOf(worstBg)} = ${worst.ratio.toFixed(2)} — برای متنِ ${kind} حداقل ${need} لازم است (زمینه از ${bg.from})`);
  }
}
console.log(`  ${checkedText} قاعده‌ی متنی سنجیده شد.`);

/* ---------- بخش ۳: مرزِ اجزای رابط (1.4.11) ---------- */
console.log('\n┌─ مرزِ اینپوت و دکمه‌ی خطی (معیار 1.4.11)\n');
const CONTROL_SEL = /(^|[\s,>])(input|select|textarea|\.field|\.btn-outline|\.qty|\.search-box)\b/;
const seen = new Set();
let checkedBorder = 0;
for (const r of RULES) {
  if (r.media && /print|forced-colors/.test(r.media)) continue;
  if (!CONTROL_SEL.test(r.selector)) continue;
  if (/:focus|:hover|:active|:disabled|::/.test(r.selector)) continue;
  const d = decls(r.body);
  const bRaw = d['border'] || d['border-color'];
  if (!bRaw) continue;
  const key = r.selector + '|' + bRaw;
  if (seen.has(key)) continue;
  seen.add(key);

  // از «1px solid var(--x)» فقط بخشِ رنگی را بیرون بکش
  const token = bRaw.split(/\s+(?![^(]*\))/).find(t => /^(#|rgba?\(|var\()/.test(t));
  if (!token) continue;
  const bg = bgFor(r);
  const bgc = bg.colors[0];
  const bc = over(parseColor(token, VARS), bgc);
  const ratio = contrast(bc, bgc);
  if (ratio === null) continue;
  checkedBorder++;
  if (ratio < 3) {
    fails.push(`مرز «${r.selector.slice(0, 46)}»: ${hexOf(bc)} روی ${hexOf(bgc)} = ${ratio.toFixed(2)} — حداقل ۳ لازم است`);
  }
}
console.log(`  ${checkedBorder} مرزِ کنترل سنجیده شد.`);

/* ---------- بخش ۴: حلقه‌ی فوکوس ---------- */
console.log('\n┌─ حلقه‌ی فوکوس (معیار 2.4.13 و 1.4.11)\n');
const focusRules = RULES.filter(r => /:focus-visible/.test(r.selector) && /outline/.test(r.body));
if (!focusRules.length) {
  warn('هیچ قاعده‌ی :focus-visible با outline پیدا نشد — کاربرِ کیبورد نمی‌فهمد کجاست');
} else {
  for (const r of focusRules) {
    const d = decls(r.body);
    const val = d['outline'] || d['outline-color'] || '';
    const token = val.split(/\s+(?![^(]*\))/).find(t => /^(#|rgba?\(|var\()/.test(t));
    if (!token) continue;
    const oc = over(parseColor(token, VARS), PAGE_BG);
    const ratio = contrast(oc, PAGE_BG);
    if (ratio === null) continue;
    console.log(`  «${r.selector.slice(0, 40)}» → ${hexOf(oc)} نسبت ${ratio.toFixed(2)}`);
    if (ratio < 3) fails.push(`حلقه‌ی فوکوس «${r.selector.slice(0, 40)}» نسبت ${ratio.toFixed(2)} دارد — حداقل ۳ لازم است`);
  }
}

/* ---------- بخش ۵: نتیجه ---------- */
console.log('\n┌─ ایرادها\n');
if (!fails.length) {
  console.log('  ✓ هیچ ایرادِ کنتراستی پیدا نشد');
} else {
  for (const f of fails) warn(f);
}

console.log('');
console.log('════════════════════════════════════════════');
if (!fails.length) {
  console.log('  ✓ کنتراست در سطح AA سالم است');
} else {
  console.log(`  ${fails.length} ایرادِ کنتراست`);
}
console.log(`  ${RULES.length} قاعده، ${Object.keys(VARS).length} متغیرِ :root`);
console.log('════════════════════════════════════════════\n');

process.exit(fails.length ? 1 : 0);
