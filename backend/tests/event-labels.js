#!/usr/bin/env node
// tests/event-labels.js — نگهبانِ برچسب‌های دفترِ رویدادها
//
// ---------- چرا این آزمون وجود دارد ----------
// دفترِ رویدادها (`/admin/activity`) تنها جایی است که می‌گوید «کی چه کاری کرد».
// مقدارِ `action` هر ردیف یک کلیدِ ماشینی است (`product_bulk`، `login_failed`)
// که مدیر از دیدنش چیزی نمی‌فهمد؛ پس همه‌ی کلیدها باید در نقشه‌ی فارسیِ پنل
// (`ACTION_FA` در `ActivityContent.tsx`) ترجمه شده باشند.
//
// این نگاشت یک‌بار در نسخه‌ی Express **ناقص** بود: ۲۹ کلید ترجمه شده بود و ۱۳
// کلیدِ دیگر خام می‌ماند — همه‌ی رویدادهای CRM و دو رویدادِ عمده‌فروشی، یعنی
// پرکاربردترین بخش‌های تازه‌ی همان پنل. علتش این بود که هیچ‌چیز این دو فهرست را
// به هم گره نزده بود: اضافه‌کردنِ `note(req, 'x')` در بک‌اند هیچ‌جا قرمز نمی‌شد.
//
// ---------- چه چیزی سنجیده می‌شود ----------
// سمتِ تولیدکننده از **خودِ سورس** خوانده می‌شود، نه از فهرستِ دستی:
// فراخوانی‌های `note(req, '…')` در `routes/admin.js` و `logAdminAction(…, '…')`
// در `routes/auth.js`. اگر روزی کسی رویدادی اضافه کند و برچسبش را نه، همین‌جا
// قرمز می‌شود — پیش از اینکه کلیدِ خام به چشمِ مدیر برسد.
//
// جهتِ برعکسش هم سنجیده می‌شود: برچسبی که هیچ رویدادی تولیدش نمی‌کند «بی‌صاحب»
// است و معمولاً یعنی کلید در بک‌اند تغییر نام داده و این‌جا جا مانده — همان
// واگرایی، فقط از آن طرف.
//
// ---------- چرا اجرا و نه الگو ----------
// «عبارتِ `ACTION_FA` در فایل هست» چیزِ کمی را ثابت می‌کند. این‌جا متنِ دو طرف
// تجزیه می‌شود: آرگومانِ دومِ هر فراخوانی با یک اسکنرِ سطحِ بالا (کاماهای داخلِ
// آرگومان‌های بعدی و `${…}`ها را کاما نمی‌شمارد) بیرون کشیده می‌شود، و اگر
// آرگومان «فقط رشته‌ی ثابت» نباشد (مثلاً یک متغیر) صریحاً خطا می‌دهد — چون
// سکوت‌کردن در آن حالت یعنی یک رویدادِ نادیده‌مانده.
//
// اجرا: node tests/event-labels.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const ROUTES_DIR = path.join(ROOT, 'backend', 'routes');
const PANEL = path.join(ROOT, 'next-frontend', 'src', 'components', 'admin', 'ActivityContent.tsx');

let pass = 0, fail = 0;
function check(label, condition, detail = '') {
  if (condition) { pass++; console.log(`  [PASS] ${label}`); }
  else { fail++; console.log(`  [FAIL] ${label}${detail ? ` — ${detail}` : ''}`); }
}
const list = (arr, n = 8) => (arr.length > n ? `${arr.slice(0, n).join('، ')} … (+${arr.length - n})` : arr.join('، '));

// ---------- ابزارِ تجزیه ----------
// آرگومان‌های یک فراخوانی را از پرانتزِ بازش جدا می‌کند؛ رشته‌ها (از جمله
// تمپلیت) و پرانتز/آکولادِ تودرتو را نمی‌شکند، پس کامای داخلشان آرگومانِ تازه
// نمی‌سازد.
function splitArgs(src, parenIdx) {
  const args = [];
  let depth = 0, cur = '', quote = null;
  for (let i = parenIdx + 1; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === '\\') { cur += ch + (src[i + 1] ?? ''); i++; continue; }
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[' || ch === '{') { depth++; cur += ch; continue; }
    if (ch === ')' || ch === ']' || ch === '}') {
      if (ch === ')' && depth === 0) { args.push(cur); return args; }
      depth--; cur += ch; continue;
    }
    if (ch === ',' && depth === 0) { args.push(cur); cur = ''; continue; }
    cur += ch;
  }
  return args;
}

/** همه‌ی فراخوانی‌های `name(` در یک سورس، به‌جز تعریفِ خودِ تابع. */
function callsOf(src, name) {
  const out = [];
  const re = new RegExp(`\\b${name}\\(`, 'g');
  let m;
  while ((m = re.exec(src))) {
    const parenIdx = m.index + m[0].length - 1;
    const before = src.slice(0, m.index);
    // `function note(` تعریف است، نه یک رویداد.
    const isDef = /function\s+$/.test(before);
    out.push({ parenIdx, isDef, args: splitArgs(src, parenIdx), line: before.split('\n').length });
  }
  return out;
}

/**
 * بازه‌ی بدنه‌ی یک تابع (از آکولادِ باز تا بسته‌اش)، با احتسابِ رشته‌ها.
 * لازم است چون `note()` یک **پوسته** است: داخلش `logAdminAction(…, action)`
 * متغیر را جلو می‌دهد و آن `action` از فراخوانِ `note` می‌آید. اگر آن یکی را
 * هم «تولیدکننده» بشماریم، کدِ سالم قرمز می‌شود؛ در حالی که نادیده‌گرفتنِ کورِ
 * همه‌ی فراخوانی‌های غیرثابت، همان بدهیِ تاریخی است. پس فقط بدنهٔ همین پوسته
 * کنار گذاشته می‌شود و شمارشش هم در گزارش می‌آید.
 */
function functionBodyRange(src, headerRe) {
  const m = headerRe.exec(src);
  if (!m) return null;
  const open = src.indexOf('{', m.index);
  if (open === -1) return null;
  let depth = 0, quote = null;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') { depth--; if (depth === 0) return [open, i]; }
  }
  return null;
}

const skipWs = (s, i) => { while (i < s.length && /\s/.test(s[i])) i++; return i; };

/**
 * عبارتِ رویداد را می‌خواند: یا یک رشته‌ی ثابت است، یا زنجیره‌ای از
 * سه‌گانه‌هایی که *شاخه‌هایشان* ثابت‌اند (`on ? 'a' : 'b'`) — شرط مهم نیست،
 * چون هر دو شاخه یک رویدادِ ممکن است.
 *
 * عمداً تجزیه می‌شود و نه `replace`: با حذفِ سادهٔ رشته‌ها، شرطِ سه‌گانه
 * (`on`, `result.deleted`) هم «متغیر» شمرده می‌شد و کدِ سالم قرمز می‌شد؛
 * و برعکس، یک متغیرِ خالصِ ناشناخته باید *قرمز* شود، نه نادیده — وگرنه
 * رویدادِ تازه بی‌صدا از چشمِ نگهبان می‌افتد.
 */
function parseAction(expr) {
  const lits = [];
  const ok = (() => {
    const walk = (s) => {
      let i = skipWs(s, 0);
      if (s[i] === "'") {
        const end = s.indexOf("'", i + 1);
        if (end === -1) return false;
        lits.push(s.slice(i + 1, end));
        return skipWs(s, end + 1) >= s.length;
      }
      // شرط تا `?` سرِ سطح (پرانتز و رشته احتساب می‌شود)
      let depth = 0, quote = null, qAt = -1;
      for (; i < s.length; i++) {
        const ch = s[i];
        if (quote) { if (ch === quote) quote = null; continue; }
        if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
        if (ch === '(' || ch === '[') depth++;
        else if (ch === ')' || ch === ']') depth--;
        else if (ch === '?' && depth === 0) { qAt = i; break; }
      }
      if (qAt === -1) return false; // متغیرِ خالص → نگهبان این را نمی‌بیند
      let d2 = 0, q2 = null, cAt = -1;
      for (let j = qAt + 1; j < s.length; j++) {
        const ch = s[j];
        if (q2) { if (ch === q2) q2 = null; continue; }
        if (ch === "'" || ch === '"' || ch === '`') { q2 = ch; continue; }
        if (ch === '(' || ch === '[') d2++;
        else if (ch === ')' || ch === ']') d2--;
        else if (ch === ':' && d2 === 0) { cAt = j; break; }
      }
      if (cAt === -1) return false;
      return walk(s.slice(qAt + 1, cAt)) && walk(s.slice(cAt + 1));
    };
    return walk(expr);
  })();
  return { lits, onlyLiterals: ok && lits.length > 0 };
}

/** جفت‌های `key: "مقدار"` از یک نگاشتِ ساده‌ی TS. */
function parseMap(src, name) {
  const at = src.indexOf(`const ${name}`);
  if (at === -1) return null;
  const open = src.indexOf('{', at);
  const close = src.indexOf('\n};', open);
  if (open === -1 || close === -1) return null;
  const entries = [];
  for (const line of src.slice(open + 1, close).split('\n')) {
    const m = line.match(/^\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*"([^"]*)"\s*,?\s*$/);
    if (m) entries.push([m[1], m[2]]);
  }
  return entries;
}

// ---------- بارگذاریِ سورس ----------
console.log('\n=== دفترِ رویدادها: هر رویدادِ بک‌اند برچسبِ فارسی دارد ===\n');

for (const f of [ROOT, ROUTES_DIR]) {
  if (!fs.existsSync(f)) { console.log(`  [FAIL] مسیر پیدا نشد: ${f}`); process.exit(1); }
}
if (!fs.existsSync(PANEL)) {
  console.log(`  [FAIL] فایلِ پنل پیدا نشد: ${PANEL}`);
  process.exit(1);
}
const panelSrc = fs.readFileSync(PANEL, 'utf8');
const routeFiles = fs.readdirSync(ROUTES_DIR).filter((f) => f.endsWith('.js'));

// ---------- سمتِ تولیدکننده ----------
const kinds = new Map();      // kind → اولین جایی که دیده شد
const dynamic = [];           // فراخوانی‌هایی که آرگومانشان ثابت نیست
function addKind(kind, where) { if (!kinds.has(kind)) kinds.set(kind, where); }

let noteCalls = 0, logCalls = 0, forwarded = 0;
for (const file of routeFiles) {
  const src = fs.readFileSync(path.join(ROUTES_DIR, file), 'utf8');
  if (!/logAdminAction|\bnote\(/.test(src)) continue;
  const wrapper = functionBodyRange(src, /function\s+note\s*\(/);
  for (const c of callsOf(src, 'note')) {
    if (c.isDef) continue;
    noteCalls++;
    const expr = c.args[1] ?? '';
    const { lits, onlyLiterals } = parseAction(expr);
    if (!onlyLiterals) dynamic.push(`note() در ${file}:${c.line} → «${expr.trim()}»`);
    else for (const k of lits) addKind(k, `${file}:${c.line}`);
  }
  for (const c of callsOf(src, 'logAdminAction')) {
    if (c.isDef) continue;
    // فراخوانیِ درونِ پوستهٔ `note` خودش رویداد نیست؛ کلیدش از `note` آمده
    if (wrapper && c.parenIdx > wrapper[0] && c.parenIdx < wrapper[1]) { forwarded++; continue; }
    logCalls++;
    const expr = c.args[1] ?? '';
    const { lits, onlyLiterals } = parseAction(expr);
    if (!onlyLiterals) dynamic.push(`logAdminAction() در ${file}:${c.line} → «${expr.trim()}»`);
    else for (const k of lits) addKind(k, `${file}:${c.line}`);
  }
}

// ---------- سمتِ پنل ----------
const labelEntries = parseMap(panelSrc, 'ACTION_FA');
const toneEntries = parseMap(panelSrc, 'ACTION_TONE');
const labels = labelEntries ? new Map(labelEntries) : new Map();
const tones = toneEntries ? new Map(toneEntries) : new Map();

// ---------- خودآزمونِ اسکنر ----------
// اگر تجزیه‌کننده روزی خراب شود، «سبزِ خالی» نباید بگیریم: روی یک نمونه‌ی
// ساختگی که هم سه‌گانه (ternary) دارد و هم رویدادِ بی‌برچسب، همان منطق را
// می‌آزماییم.
{
  const sample = [
    "note(req, 'taze_event', `#${id}`, 'x');",
    "note(req, flag ? 'alfa_event' : 'beta_event');",
    "note(req, DYNAMIC_KIND, '#1');",
  ].join('\n');
  const found = [];
  const dyn = [];
  for (const c of callsOf(sample, 'note')) {
    const { lits, onlyLiterals } = parseAction(c.args[1] ?? '');
    if (onlyLiterals) found.push(...lits); else dyn.push(c.args[1]);
  }
  check('خودآزمون: اسکنر رویدادِ ساده را می‌گیرد', found.includes('taze_event'));
  check('خودآزمون: هر دو شاخه‌ی سه‌گانه را می‌گیرد (کاما داخلِ آرگومان‌ها را نمی‌شکند)',
    found.includes('alfa_event') && found.includes('beta_event'), found.join('، '));
  check('خودآزمون: آرگومانِ متغیرِ ناشناخته را «کور» اعلام می‌کند، نه نادیده',
    dyn.length === 1 && /DYNAMIC_KIND/.test(dyn[0]), JSON.stringify(dyn));
  const fakeMissing = found.filter((k) => !new Map([['taze_event', 'x']]).has(k));
  check('خودآزمون: همان جفت‌شدنِ دو فهرست، رویدادِ بی‌برچسب را پیدا می‌کند',
    fakeMissing.includes('alfa_event') && fakeMissing.includes('beta_event'),
    fakeMissing.join('، '));
}

// ---------- ۱) کفِ استخراج (ضدِ سبزِ خالی) ----------
check('استخراج: فراخوانی‌های دفترِ رویداد در routes پیدا شدند',
  noteCalls >= 30 && logCalls >= 3,
  `note=${noteCalls} · logAdminAction=${logCalls} · فورواردِ پوسته=${forwarded}`);
check('استخراج: پوستهٔ `note` شناسایی شد (فورواردِ درونی‌اش رویداد شمرده نشود)',
  forwarded === 1, `فوروارد=${forwarded}`);
check('استخراج: کلیدِ یکتای کافی بیرون آمد', kinds.size >= 30, `${kinds.size} کلید`);
check('استخراج: هیچ فراخوانی‌ای با آرگومانِ غیرثابت نمانده (اسکنر کور نیست)',
  dynamic.length === 0, list(dynamic, 3));
check('استخراج: رویدادهای هر دو فایل دیده می‌شوند (پنل + ورود)',
  kinds.has('product_bulk') && kinds.has('otp_code_burned'),
  `product_bulk=${kinds.has('product_bulk')} otp_code_burned=${kinds.has('otp_code_burned')}`);
check('نگاشتِ پنل پیدا و تجزیه شد', labelEntries !== null && labels.size >= 30,
  `${labels.size} برچسب`);

// ---------- ۲) خواسته‌ی اصلی: هر رویداد برچسبِ فارسی دارد ----------
const missingLabels = [...kinds.keys()].filter((k) => !labels.has(k));
check('هر رویدادِ بک‌اند برچسبِ فارسی دارد (رویدادِ تازه بدونِ برچسب نمی‌ماند)',
  missingLabels.length === 0,
  missingLabels.length ? `بدونِ برچسب: ${list(missingLabels, 10)}` : 'بی‌کمبود');

// ---------- ۳) جهتِ برعکس: برچسبِ بی‌صاحب ----------
const staleLabels = [...labels.keys()].filter((k) => !kinds.has(k));
check('هر برچسبِ پنل به یک رویدادِ واقعی وصل است (برچسبِ بی‌صاحب/غلطِ تایپی نماند)',
  staleLabels.length === 0,
  staleLabels.length ? `بی‌صاحب: ${list(staleLabels, 10)}` : 'بی‌اختلاف');

// ---------- ۴) جنسِ خودِ برچسب ----------
const FA = /[\u0600-\u06FF]/;
const notPersian = [...labels.entries()].filter(([, v]) =>
  !FA.test(v) || /[A-Za-z]/.test(v) || /[0-9]/.test(v) || v !== v.trim() || v.length < 3);
check('هر برچسب فارسی و خوانا است (نه خالی، نه لاتین، نه عدد، نه فاصله‌ی اضافه)',
  notPersian.length === 0, list(notPersian.map(([k, v]) => `${k}→«${v}»`), 4));

const byLabel = new Map();
for (const [k, v] of labels) byLabel.set(v, [...(byLabel.get(v) ?? []), k]);
const dupLabels = [...byLabel.entries()].filter(([, ks]) => ks.length > 1);
check('هیچ دو رویدادی یک برچسبِ یکسان ندارند (دفتر نامفهوم نشود)',
  dupLabels.length === 0, list(dupLabels.map(([v, ks]) => `«${v}» → ${ks.join('/')}`), 4));

// ---------- ۵) لحن (رنگ) هم فقط روی رویدادهای واقعی ----------
const orphanTones = [...tones.keys()].filter((k) => !kinds.has(k));
check('لحنِ هر رویداد روی یک رویدادِ واقعی نشسته است',
  toneEntries !== null && orphanTones.length === 0,
  toneEntries === null ? 'نگاشتِ لحن پیدا نشد' : list(orphanTones, 6));

// ---------- ۶) رویدادِ ناشناس پنهان نمی‌شود ----------
check('رویدادِ ناشناس با کلیدِ خام نشان داده می‌شود، نه پنهان',
  /ACTION_FA\[entry\.action\]\s*\?\?\s*entry\.action/.test(panelSrc),
  'پشتیبانِ کلیدِ خام از ردیفِ دفتر حذف شده — رویدادِ نادیده بی‌صدا ناپدید می‌شود');

// ---------- ۷) ضدِ رگرسیونِ تاریخی: CRM و عمده‌فروشی هم برچسب دارند ----------
const wasRawInExpress = ['crm_note_add', 'crm_task_delete', 'crm_recalc_all',
  'crm_activity_add', 'wholesale_status', 'wholesale_delete'];
const stillRaw = wasRawInExpress.filter((k) => !labels.has(k));
check('رویدادهایی که یک‌بار بدونِ برچسب مانده بودند، برچسب دارند',
  stillRaw.length === 0, stillRaw.join('، '));

console.log('\n------------------------------------------------------------');
console.log(`  ${kinds.size} رویداد در بک‌اند · ${labels.size} برچسبِ فارسی · ${tones.size} لحن`);
console.log(`  Total: ${pass + fail} checks | ✅ ${pass} passed | ❌ ${fail} failed`);
console.log('------------------------------------------------------------\n');
process.exit(fail === 0 ? 0 : 1);
