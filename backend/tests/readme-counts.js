#!/usr/bin/env node
/* ============================================================
   نگهبانِ عددهای README — «عددی که در مستندات نوشته شده، باید راست باشد»

   چرا لازم شد: عددهای README دو بار بی‌صدا از واقعیت جدا شدند.

     • شمارشِ آزمونِ فرانت‌اند یک‌جا **۱۶** بود و جای دیگر **۹۸** — کسی هم
       نفهمید، چون هیچ‌کس عددها را با خودِ کد مقایسه نمی‌کرد.
     • سئو در سه جا **۸۵** بود و در بولتِ امکانات **۸۶** مانده بود (از وقتی یک
       تست کم شد). همان یک عددِ جامانده دروغِ کوچکی است که به‌مرور عادت می‌شود.

   این نگهبان دو کار می‌کند و هیچ‌کدام «الگو در برابر همان الگو» نیست:

     ۱) عددهایی که *از خودِ مخزن قابلِ شمردن‌اند* را می‌شمارد (خط و تابعِ
        `db.js`، فایل‌های lib/routes/tools/js، نمای پنل، اجزای Next) و با
        ادعای README مقایسه می‌کند.
     ۲) عددهایی که کدِ قابلِ شمردن نیستند (خروجیِ مجموعه‌های تست) را در همه‌ی
        جاهای README با هم مقایسه می‌کند: خطِ وضعیت، جدولِ تفکیک، کامنتِ
        دستورها، درختِ پوشه‌ها و متنِ امکانات. اگر یک جا جا بماند، قرمز می‌شود
        — که همان باگِ ۸۶ در برابر ۸۵ بود.

   نکتِه‌ی پیاده‌سازی که یک‌بار خودش باگ داد: کلمه‌های فارسی در همین فایل با
   کدِ نویسه ساخته می‌شوند (`w(...)`) و متنِ README قبل از تطبیق یکسان‌سازی
   می‌شود. چرا: یک ZWNJِ ناخواسته یا «ی» عربیِ قرض‌گرفته در متن، الگو را
   بی‌صدا از کار می‌انداخت؛ نگهبانِ خرابی که هیچ نمی‌گیرد، از نبودنش بدتر است.
   برای همین خودآزمونِ پایین هم یک نمونه‌ی ZWNJ‌دار را می‌سنجد.

   عددِ جدید در README اضافه می‌کنی؟ جایش را در همین فایل هم بگذار، وگرنه
   نگهبان روی خطِ ناشناخته ساکت می‌ماند (کفِ شمارش‌ها برای همین است).
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const README_PATH = path.join(ROOT, 'README.md');

// ---------- کمکی‌ها ----------
const w = (...points) => String.fromCodePoint(...points);
const ZWNJ = w(0x200c);
const FA0 = w(0x6f0);
const FA9 = w(0x6f9);
const SEP = `[\\s${ZWNJ}]*`;
const NUM = `[${FA0}-${FA9}][${FA0}-${FA9},]*`;
// «تست/آزمون/بررسی» — کلمه باشند، نه شروعِ کلمه‌ی دیگر (`تایش`، `آزمون‌ها`).
//
// اینجا یک باگِ واقعی خورد و باگ همین جاست: اول نوشته بودم `(?![ا-ی])`
// به‌گمانِ «حرفِ فارسی»، ولی بازه‌ی U+0627–U+06CC همه‌ی اِعراب‌ها (کسره U+0650،
// فتحه، تشدید) را هم دربر می‌گیرد. README می‌نویسد «۳۵ بررسیِ ثانیه‌شمارِ …» و
// آن کسره، الگو را رد می‌کرد؛ پس عددِ همین دو مجموعه خوانده نمی‌شد. حالا با
// `\p{L}` فقط حرفِ چسبیده رد می‌شود و کسره/ZWNJ آزادند.
const NOUN = `(?:${w(0x62a, 0x633, 0x62a)}`
  + `|${w(0x622, 0x632, 0x645, 0x648, 0x646)}`
  + `|${w(0x628, 0x631, 0x631, 0x633, 0x6cc)})`
  + `(?!\\p{L})`;

const asciiDigits = (s) => [...String(s)]
  .map((c) => (c >= FA0 && c <= FA9 ? String(c.codePointAt(0) - 0x6f0) : c))
  .join('');
const toNum = (s) => Number(asciiDigits(s).replace(/[^0-9]/g, ''));

// یکسان‌سازی: ZWNJ برداشته می‌شود (تا «فرانت‌اند» و «فرانتاند» یکی شوند)،
// «ی/ك» عربی به فارسی، و ارقامِ عربی به فارسی. بدونِ این، تطبیقِ متنی شکننده است.
const norm = (s) => String(s)
  .split(ZWNJ).join('')
  .replace(/[\u064a\u0649]/g, '\u06cc')
  .replace(/\u0643/g, '\u06a9')
  .replace(/[\u0660-\u0669]/g, (c) => String.fromCodePoint(c.codePointAt(0) + 0x90));

let pass = 0;
const failures = [];
function check(name, ok, detail = '') {
  if (ok) { pass++; console.log(`[PASS] ${name}${detail ? ` - ${detail}` : ''}`); }
  else { failures.push(name); console.log(`[FAIL] ${name}${detail ? ` - ${detail}` : ''}`); }
}

if (!fs.existsSync(README_PATH)) {
  console.log('[FAIL] README.md پیدا نشد');
  process.exit(1);
}
const lines = norm(fs.readFileSync(README_PATH, 'utf8').replace(/\r?\n/g, '\n')).split('\n');
const readme = lines.join('\n');

// ---------- ۱) عددهایی که از مخزن شمرده می‌شوند ----------
const jsFiles = (dir) => {
  const abs = path.join(ROOT, dir);
  return fs.existsSync(abs) ? fs.readdirSync(abs).filter((f) => f.endsWith('.js')) : [];
};
const dbSrc = fs.readFileSync(path.join(ROOT, 'backend', 'lib', 'db.js'), 'utf8');
const derived = {
  dbLines: (dbSrc.match(/\n/g) || []).length,
  dbFns: (dbSrc.match(/^(?:async )?function /gm) || []).length,
  libFiles: jsFiles('backend/lib').length,
  routeFiles: jsFiles('backend/routes').length,
  toolFiles: jsFiles('backend/tools').length,
  suites: jsFiles('backend/tests'),
  views: 0,
  comp: { plain: 0, tests: 0, home: 0, panel: 0 }
};

// ---------- نام‌های عصرِ Express: از جدولِ ریدایرکت، نه از پوشه‌ای که نیست ----------
// تا دیروز این‌جا `fs.readdirSync('frontend')` بود و هر صفحه‌ی آن را در README
// می‌جست. آن پوشه حذف شد؛ اگر شمارشِ فایل‌های یک پوشه‌ی نبوده را نگه می‌داشتیم،
// آزمون «سبزِ خالی» می‌شد (صفر صفحه، صفر ایراد). منبعِ حقیقتِ آن نام‌ها امروز
// جدولِ ریدایرکتِ Next است، پس همان جدول خوانده می‌شود.
const legacyUrlsSrc = fs.readFileSync(
  path.join(ROOT, 'next-frontend', 'src', 'lib', 'legacyUrls.ts'), 'utf8');
const legacySection = (name) => {
  const at = legacyUrlsSrc.indexOf(`export const ${name}`);
  if (at === -1) return [];
  const chunk = legacyUrlsSrc.slice(at, legacyUrlsSrc.indexOf('};', at));
  return [...chunk.matchAll(/["'](\/?[a-z0-9-]+\.html)["']/g)].map((m) => m[1].replace(/^\//, ''));
};
// پلِ زنده: هر کدام باید در README نام برده شده باشد (مستندِ بازنشستگی)
derived.legacyPages = legacySection('LEGACY_PAGE_ALIASES');
// عمداً بی‌ریدایرکت — همین تصمیم هم باید مستند باشد، پس نامشان هم در README می‌آید.
derived.legacyNoAlias = legacySection('LEGACY_NO_ALIAS');
derived.legacyProduct = /pathname === \"\/product\.html\"/.test(legacyUrlsSrc);

// نماهای پنل از تنها منبعِ حقیقت (`adminSections.ts`) شمرده می‌شوند
//
// ⚠️ پایانِ آرایه در آن فایل `] as const satisfies readonly AdminSection[];`
// است، نه `];`. الگوی قبلی به `\n];` گره خورده بود و با اضافه‌شدنِ آن تأییدِ
// نوعی، **بی‌صدا** هیچ چیزی پیدا نمی‌کرد: عددِ ۱۳ به ۰ تبدیل می‌شد و نگهبان
// «۱۳ نما» را با «۰» می‌سنجید. حالا بعد از `]` هر چیزی تا اولین `;` همان خط
// پذیرفته می‌شود — هم شکلِ امروز، هم `];` فردا.
const sectionsSrc = fs.readFileSync(path.join(ROOT, 'next-frontend', 'src', 'lib', 'adminSections.ts'), 'utf8');
const arr = sectionsSrc.match(/ADMIN_SECTIONS[^=]*=\s*\[([\s\S]*?)\n\][^\n]*;/);
derived.views = arr ? (arr[1].match(/key:\s*"[a-z-]+"/g) || []).length : 0;

const compDir = path.join(ROOT, 'next-frontend', 'src', 'components');
for (const f of fs.readdirSync(compDir)) {
  if (!f.endsWith('.tsx')) continue;
  if (f.includes('.test.')) derived.comp.tests++;
  else derived.comp.plain++;
}
derived.comp.home = fs.readdirSync(path.join(compDir, 'home')).filter((f) => f.endsWith('.tsx')).length;
// «اجزای مشترک» در برابر «محتوای نماها». `PageHead` هم مثل `AdminBits` هیچ
// محتوایی ندارد — یک قالبِ سرصفحه است که هر ۱۳ نما استفاده‌اش می‌کنند — پس
// جزو همان ۱۳ نمی‌شود، وگرنه عددِ «۱۳ فایلِ محتوای پنل» با «۱۳ نمای پنل»
// یکی نمی‌ماند و هر خواننده‌ی README فکر می‌کند نمای چهاردهمی اضافه شده.
const SHARED_PANEL = new Set(['AdminBits.tsx', 'NoAccess.tsx', 'PageHead.tsx']);
derived.comp.panel = fs.readdirSync(path.join(compDir, 'admin'))
  .filter((f) => f.endsWith('.tsx') && !f.includes('.test.') && !SHARED_PANEL.has(f)).length;

// ---------- ۲) خواندنِ ادعاهای README ----------
// «عدد + اسمِ جمع»ها با جای هر کدام در خط
function countTokens(line) {
  const re = new RegExp(`(${NUM})${SEP}${NOUN}`, 'gu');
  const out = [];
  let m;
  while ((m = re.exec(line))) out.push({ num: toNum(m[1]), at: m.index, end: re.lastIndex });
  return out;
}
function allNumbers(line) {
  const out = [];
  const re = new RegExp(NUM, 'g');
  let m;
  while ((m = re.exec(line))) out.push({ raw: m[0], num: toNum(m[0]), at: m.index, end: re.lastIndex });
  return out;
}

// ---------- کدام مجموعه‌ها در خطِ وضعیتِ README می‌آیند ----------
// مجموعهی سئوی بک‌اند از این فهرست رفت: `test-seo.js` روی HTMLِ `frontend/`
// کار می‌کرد و با حذفِ آن پوشه بی‌مرجع شد. معادلِ زنده‌اش امروز در خانه‌ی
// تازه است (`next-frontend/src/app/seoParity.test.ts` + `structuredData.test.ts`
// برای داده‌ی ساختاریافته) و عددهای فرانت‌اند را نگهبانِ خودشان می‌سنجد.
const SUITES = [
  { key: 'smoke', file: 'test-smoke.js', word: w(0x62f, 0x648, 0x62f) },                       // دود
  { key: 'owasp', file: 'owasp-scan.js', word: 'OWASP' },
  { key: 'security', file: 'security.js', word: w(0x627, 0x645, 0x646, 0x6cc, 0x62a) },        // امنیت
  { key: 'discount', file: 'discount.js', word: w(0x62a, 0x62e, 0x641, 0x6cc, 0x641) },        // تخفیف
  { key: 'bench', file: 'bench-report-integrity.js', word: w(0x628, 0x646, 0x686, 0x645, 0x627, 0x631, 0x6a9) },
  { key: 'window', file: 'order-window-integrity.js', word: w(0x647, 0x645, 0x62a, 0x631, 0x627, 0x632, 0x6cc) },
  { key: 'resend', file: 'otp-resend-window.js', word: w(0x627, 0x631, 0x633, 0x627, 0x644) + ' ' + w(0x645, 0x62c, 0x62f, 0x62f) },
  { key: 'sw', file: 'service-worker-strategy.js', word: w(0x633, 0x631, 0x648, 0x6cc, 0x633, 0x648, 0x631, 0x6a9, 0x631) }, // سرویس‌ورکر
  { key: 'compress', file: 'static-compress-cache.js', word: w(0x641, 0x634, 0x631, 0x62f, 0x647, 0x633, 0x627, 0x632, 0x6cc) }, // فشرده‌سازی
  { key: 'events', file: 'event-labels.js', word: w(0x62f, 0x641, 0x62a, 0x631) + ' ' + w(0x631, 0x648, 0x6cc, 0x62f, 0x627, 0x62f, 0x647, 0x627) }, // دفتر رویدادها
  { key: 'panel', file: 'panel-retired.js', word: w(0x628, 0x627, 0x632, 0x646, 0x634, 0x633, 0x62a, 0x647) },
  { key: 'readme', file: 'readme-counts.js', word: 'README' },
  { key: 'frontend', file: null, word: w(0x641, 0x631, 0x627, 0x646, 0x62a, 0x627, 0x646, 0x62f) }
];

// خودآزمون‌ها به **کلید** اشاره می‌کنند، نه به جایگاهِ آرایه.
//
// این خودش یک باگِ واقعی بود: خودآزمونِ جدول `SUITES[10]` را «فرانت‌اند» فرض کرده
// بود، و با اضافه‌شدنِ یک مجموعه در وسطِ فهرست (سرویس‌ورکر) بی‌صدا به README
// اشاره می‌کرد و خودآزمون قرمز شد — یعنی آزمون به‌جای گرفتنِ خطای واقعی، از
// جابه‌جاییِ داخلیِ خودش شکست.
const S = (key) => {
  const hit = SUITES.find((s) => s.key === key);
  if (!hit) throw new Error(`مجموعه‌ی «${key}» در فهرست نیست`);
  return hit;
};

// خطِ وضعیت: «… — ۷۳۷ دود + ۸۵ سئو + …» — عدد به کلیدواژه‌ی *بعد از خودش* می‌چسبد.
function parseStatus(line) {
  const res = { suites: {}, total: null };
  for (const seg of line.split('+')) {
    const nums = allNumbers(seg);
    for (let i = 0; i < nums.length; i++) {
      const after = seg.slice(nums[i].end, i + 1 < nums.length ? nums[i + 1].at : seg.length);
      const hit = SUITES.filter((s) => after.includes(s.word));
      if (hit.length === 1) res.suites[hit[0].key] = nums[i].num;
      else if (hit.length === 0 && res.total === null) res.total = nums[i].num;
    }
  }
  return res;
}

// جدولِ تفکیک: «| دود **۷۳۷** | سئو **۸۵** | … = **۱۱۲۰**» — عدد به کلیدواژه‌ی *قبلش* می‌چسبد.
function parseBreakdown(line) {
  const res = { suites: {}, total: null };
  for (const seg of line.split('|')) {
    const eq = seg.indexOf('=');
    const head = eq === -1 ? seg : seg.slice(0, eq);
    const nums = allNumbers(head);
    if (nums.length) {
      const before = head.slice(0, nums[0].at);
      const hit = SUITES.filter((s) => before.includes(s.word));
      if (hit.length) res.suites[hit[hit.length - 1].key] = nums[0].num;
    }
    if (eq !== -1) {
      const tail = allNumbers(seg.slice(eq));
      if (tail.length) res.total = tail[tail.length - 1].num;
    }
  }
  return res;
}

// کامنتِ فهرستِ دستورها: «npm test # ۷۳۷ تست دود (test-smoke.js)»
function parseCommands() {
  const res = {};
  for (const s of SUITES) {
    if (!s.file) continue;
    const line = lines.find((l) => /^\s*(npm |node )/.test(l) && l.includes(s.file) && l.includes('#'));
    if (!line) continue;
    const tok = countTokens(line.slice(line.indexOf('#')))[0];
    if (tok) res[s.key] = tok.num;
  }
  return res;
}

// درختِ پوشه‌ها: «│ ├── test-smoke.js  ← … (۷۳۷ تست)»
function parseTree() {
  const res = {};
  for (const s of SUITES) {
    if (!s.file) continue;
    const line = lines.find((l) => l.includes(w(0x2190)) && l.includes(s.file));
    if (!line) continue;
    const toks = countTokens(line);
    if (toks.length) res[s.key] = toks[toks.length - 1].num;
  }
  return res;
}

const sumAll = (sources) => Object.values(sources).reduce((a, b) => a + b, 0);

// متنِ امکانات: هر «N تست/بررسی» به نزدیک‌ترین کلیدواژه‌ی همان خط می‌چسبد —
// که همان جایی است که ۸۶ به‌جای ۸۵ جا مانده بود.
// خطی که نامِ یک فایلِ آزمونِ فرانت‌اند را دارد، عددش تعدادِ آزمونِ *همان فایل*
// است، نه شمارشِ یک سوئیتِ بک‌اند؛ آن‌ها را نگهبانِ فرانت‌اند می‌سنجد
// (`next-frontend/scripts/check-readme-counts.mjs`) تا هر عدد یک صاحب داشته باشد.
const FRONTEND_TEST_FILE = /\.test\.(ts|tsx)/;

function proseMismatches(structural, sources, totals) {
  const bad = [];
  lines.forEach((line, idx) => {
    if (structural.has(idx)) return;
    if (FRONTEND_TEST_FILE.test(line)) return;
    for (const tok of countTokens(line)) {
      const near = SUITES
        .map((s) => ({ s, at: line.indexOf(s.word) }))
        .filter((x) => x.at !== -1)
        .sort((a, b) => Math.abs(a.at - tok.at) - Math.abs(b.at - tok.at))[0];
      if (totals.has(tok.num)) continue; // جمعِ کل، نه شمارشِ یک مجموعه
      if (near && sources[near.s.key] !== undefined && tok.num !== sources[near.s.key]) {
        bad.push(`خط ${idx + 1}: «${tok.num}» کنارِ ${JSON.stringify(near.s.key)} ولی بقیه ${sources[near.s.key]} می‌گویند`);
      }
    }
  });
  return bad;
}

// ---------- ۳) آزمونِ خودِ استخراج‌کننده ----------
// اگر روزی شکلِ خطوط عوض شود و استخراج هیچ برنگرداند، «سبزِ خالی» نباید بگیریم.
(function selfTest() {
  const DIGIT = (n) => asciiDigits(String(n)).split('')
    .map((d) => String.fromCodePoint(0x6f0 + Number(d))).join('');
  const fakeStatus = `> وضعیت: **${DIGIT(10)} تست خودکار، همه سبز** — ${DIGIT(7)} `
    + `${S('smoke').word} + ${DIGIT(3)} ${S('discount').word} + ${DIGIT(5)} ${S('owasp').word}`;
  const st = parseStatus(fakeStatus);
  check('خودآزمون: خطِ وضعیت درست خوانده می‌شود',
    st.total === 10 && st.suites.smoke === 7 && st.suites.discount === 3 && st.suites.owasp === 5,
    JSON.stringify(st));

  const fakeTable = `- تست: ${S('smoke').word} **${DIGIT(7)}** | ${S('discount').word} **${DIGIT(3)}**`
    + ` | ${S('frontend').word} (Vitest) **${DIGIT(4)}** = **${DIGIT(14)}**`;
  const tb = parseBreakdown(fakeTable);
  check('خودآزمون: جدولِ تفکیک درست خوانده می‌شود',
    tb.suites.smoke === 7 && tb.suites.discount === 3 && tb.suites.frontend === 4 && tb.total === 14,
    JSON.stringify(tb));

  const comment = `# ${DIGIT(18)} ${w(0x628, 0x631, 0x631, 0x633, 0x6cc)} ${DIGIT(0)}`;
  check('خودآزمون: کامنتِ دستور درست خوانده می‌شود', countTokens(comment)[0]?.num === 18,
    JSON.stringify(countTokens(comment)));

  check('خودآزمون: «۲۰ تایش» یک شمارشِ تست حساب نمی‌شود',
    countTokens(`دارای ${DIGIT(20)} تایش رفتارِ صفحه`).length === 0);
  check('خودآزمون: «۸۶ تست» با فاصله هم گرفته می‌شود',
    countTokens(`(${DIGIT(86)} تست) سئو`)[0]?.num === 86);
  check('خودآزمون: ZWNJ بین عدد و کلمه هم مانع نیست',
    countTokens(`${DIGIT(35)}${ZWNJ}${w(0x628, 0x631, 0x631, 0x633, 0x6cc)}`)[0]?.num === 35);
  // همان باگی که یک‌بار خورد: کسره بعد از «بررسی» نباید کلمه را رد کند
  check('خودآزمون: اِعرابِ چسبیده به کلمه مانع نمی‌شود',
    countTokens(`${DIGIT(35)} ${w(0x628, 0x631, 0x631, 0x633, 0x6cc, 0x650)}`)[0]?.num === 35);
  check('خودآزمون: شکلِ جمعِ کلمه («تست‌ها») یک شمارشِ تست حساب نمی‌شود',
    countTokens(`${DIGIT(20)} ${w(0x62a, 0x633, 0x62a, 0x647, 0x627)}`).length === 0);
  check('خودآزمون: کلیدواژه با ZWNJ هم پیدا می‌شود',
    norm(w(0x641, 0x631, 0x627, 0x646, 0x62a, 0x200c, 0x627, 0x646, 0x62f)).includes(S('frontend').word));
})();

// ---------- ۴) عددهای شمرده‌شدنی ----------
{
  // db.js: خط و تابع — هر دو ادعا در دو جای README
  const dbLinesTxt = lines.filter((l) => l.includes('db.js'));
  const claim = (noun) => dbLinesTxt.flatMap((l) => [...l.matchAll(new RegExp(`(${NUM})${SEP}${noun}`, 'g'))].map((m) => toNum(m[1])));
  const lineClaims = claim(w(0x62e, 0x637));   // خط
  const fnClaims = claim(w(0x62a, 0x627, 0x628, 0x639)); // تابع
  check('README عددی برای خط‌های db.js دارد', lineClaims.length >= 2, `${lineClaims.length} جا`);
  check('README عددی برای تابع‌های db.js دارد', fnClaims.length >= 2, `${fnClaims.length} جا`);
  check(`خط‌های db.js روی همه‌ی ادعاها ${derived.dbLines} است`,
    lineClaims.length > 0 && lineClaims.every((n) => n === derived.dbLines), lineClaims.join(','));
  check(`تابع‌های db.js روی همه‌ی ادعاها ${derived.dbFns} است`,
    fnClaims.length > 0 && fnClaims.every((n) => n === derived.dbFns), fnClaims.join(','));
}

// شمارشِ فایل‌ها — هر ادعا با یک عبارتِ صریح لنگر شده است
function claimOf(re, label, expected, min = 1, scope = lines) {
  const hits = scope.flatMap((l) => [...l.matchAll(re)].map((m) => toNum(m[1])));
  check(`README «${label}» را گفته`, hits.length >= min, `${hits.length} جا`);
  check(`«${label}» روی همه‌ی ادعاها ${expected} است`,
    hits.length >= min && hits.every((n) => n === expected), hits.join(','));
}
const CLI = {
  file: w(0x641, 0x627, 0x6cc, 0x644),                       // فایل
  library: w(0x6a9, 0x62a, 0x627, 0x628, 0x62e, 0x627, 0x646, 0x647), // کتابخانه
  route: w(0x645, 0x633, 0x6cc, 0x631),                      // مسیر
  tool: w(0x627, 0x628, 0x632, 0x627, 0x631),                // ابزار
  adminish: w(0x645, 0x62f, 0x6cc, 0x631, 0x6cc, 0x62a, 0x6cc), // مدیریتی
  view: w(0x646, 0x645, 0x627),                              // نما
  component: w(0x6a9, 0x627, 0x645, 0x67e, 0x648, 0x646, 0x646, 0x62a) // کامپوننت
};
claimOf(new RegExp(`(${NUM})${SEP}${CLI.file}${SEP}${CLI.library}`, 'g'), 'فایل‌های کتابخانه', derived.libFiles);
claimOf(new RegExp(`(${NUM})${SEP}${CLI.route}${SEP}API`, 'g'), 'مسیرهای API', derived.routeFiles);
claimOf(new RegExp(`(${NUM})${SEP}${CLI.tool}${SEP}${CLI.adminish}`, 'g'), 'ابزارهای مدیریتی', derived.toolFiles);
claimOf(new RegExp(`(${NUM})${SEP}${CLI.view}`, 'g'), 'نماهای پنل', derived.views, 3);

// اجزای Next: «۲۳ کامپوننت + ۳ آزمون + ۳ کامپوننتِ صفحه اصلی + ۱۳ فایلِ محتوای پنل»
{
  const line = lines.find((l) => l.includes(CLI.component));
  const nums = line ? allNumbers(line).map((n) => n.num) : [];
  const want = [derived.comp.plain, derived.comp.tests, derived.comp.home, derived.comp.panel];
  check('اجزای Next در README تفکیک شده‌اند', nums.length === 4, line ? nums.join(',') : 'خطی پیدا نشد');
  check(`تفکیکِ اجزای Next درست است (${want.join(' + ')})`,
    nums.length === 4 && nums.every((n, i) => n === want[i]), nums.join(' + '));
}

// ---------- ۵) هم‌خوانیِ عددهای مجموعه‌ها ----------
const statusLineAt = lines.findIndex((l) => l.startsWith('> ') && l.includes(w(0x648, 0x636, 0x639, 0x6cc, 0x62a))); // وضعیت
const breakdownLineAt = lines.findIndex((l) => new RegExp(`^-\\s*${w(0x62a, 0x633, 0x62a)}:`).test(l));

if (statusLineAt === -1 || breakdownLineAt === -1) {
  check('لنگرهای خطِ وضعیت و جدولِ تفکیک پیدا شدند', false,
    `وضعیت=${statusLineAt} جدول=${breakdownLineAt}`);
} else {
  const status = parseStatus(lines[statusLineAt]);
  const table = parseBreakdown(lines[breakdownLineAt]);
  const cmds = parseCommands();
  const tree = parseTree();
  // خط‌های ساختاری (وضعیت/جدول/دستور/درخت) الگوی خودشان را دارند؛ متنِ امکانات
  // نباید دوباره آن‌ها را بسنجد، وگرنه مثلاً درختِ یک مجموعه با کلیدواژه‌ی
  // مجموعه‌ی دیگر قاطی می‌شود.
  const structural = new Set([statusLineAt, breakdownLineAt]);
  for (const s of SUITES) {
    if (!s.file) continue;
    const ci = lines.findIndex((l) => /^\s*(npm |node )/.test(l) && l.includes(s.file) && l.includes('#'));
    if (ci !== -1) structural.add(ci);
    const ti = lines.findIndex((l) => l.includes(w(0x2190)) && l.includes(s.file));
    if (ti !== -1) structural.add(ti);
  }

  // عیب‌یابی: `READMECOUNTS_DUMP=1 node tests/readme-counts.js` چهار منبع را
  // خام چاپ می‌کند تا وقتی عددی خوانده نمی‌شود معلوم باشد کدام منبع است.
  if (process.env.READMECOUNTS_DUMP) {
    console.log('\n--- dump ---');
    for (const s of SUITES) {
      console.log(`  ${s.key.padEnd(9)} وضعیت=${status.suites[s.key]} جدول=${table.suites[s.key]} دستور=${cmds[s.key]} درخت=${tree[s.key]}`);
    }
    console.log(`  کل: وضعیت=${status.total} جدول=${table.total}`);
    for (const s of SUITES) {
      if (!s.file) continue;
      const cmd = lines.findIndex((l) => /^\s*(npm |node )/.test(l) && l.includes(s.file) && l.includes('#'));
      const tok = cmd === -1 ? [] : countTokens(lines[cmd].slice(lines[cmd].indexOf('#')));
      console.log(`  cmd[${s.key}] خط=${cmd + 1} توکن‌ها=${JSON.stringify(tok)}`);
    }
  }

  // عددِ هر مجموعه از چهار منبع باید یکی باشد
  let agreed = 0;
  for (const s of SUITES) {
    const sources = [status.suites[s.key], table.suites[s.key], cmds[s.key], tree[s.key]];
    const known = sources.filter((v) => v !== undefined);
    // فرانت‌اند خطِ دستور و خطِ درختِ جدا ندارد (فایلش داخلِ next-frontend است)،
    // پس فقط دو منبعِ خطِ وضعیت و جدول برایش انتظار می‌رود — و نه کمتر.
    const need = s.file ? 4 : 2;
    if (known.length < need) {
      check(`عددِ «${s.key}» از هر ${need} منبع خوانده شد`, false, `${known.length} منبع: ${known.join(',')}`);
      continue;
    }
    check(`عددِ «${s.key}» در همه‌ی منابع یکی است`, known.every((v) => v === known[0]), known.join(','));
    agreed++;
  }
  check('هم‌خوانیِ کاملِ عددهای مجموعه‌ها', agreed === SUITES.length, `${agreed}/${SUITES.length}`);

  // متنِ امکانات هم باید همان عددها را بگوید — این همان جای ۸۶ در برابر ۸۵ بود
  const sources = { ...cmds };
  for (const s of SUITES) if (status.suites[s.key] !== undefined) sources[s.key] = status.suites[s.key];
  // جمع‌ها را هم نباید با شمارشِ یک مجموعه اشتباه بگیریم: تکلِ کل و تکلِ
  // `test:full` (جمعِ مجموعه‌های بک‌اند) هر دو در README می‌آیند و کلیدواژه‌ی
  // کنارشان می‌تواند گمراه‌کننده باشد («— ۱۰۶۴ تست، بی بنچمارک»).
  const backendSum = SUITES.filter((s) => s.file).reduce((a, s) => a + (status.suites[s.key] || 0), 0);
  const totals = new Set([status.total, table.total, backendSum, sumAll(sources)]);
  const bad = proseMismatches(structural, sources, totals);
  check('عددهای متنِ امکانات با بقیه‌ی README یکی است', bad.length === 0, bad.join(' | ') || 'بی‌اختلاف');

  // جمعِ تفکیک باید همان کلِ اعلام‌شده باشد
  const parts = SUITES.map((s) => status.suites[s.key]);
  const sum = parts.reduce((a, b) => a + (b || 0), 0);
  check('همه‌ی مجموعه‌ها در خطِ وضعیت آمده‌اند', parts.every((v) => v !== undefined),
    parts.map((v) => (v === undefined ? '؟' : v)).join(','));
  check(`جمعِ خطِ وضعیت = کلِ اعلام‌شده (${sum})`,
    sum === status.total && sum === table.total,
    `جمع ${sum} | کلِ خط ${status.total} | کلِ جدول ${table.total}`);
}

// ---------- ۶) کامل بودنِ مستندات ----------
{
  // پوشه‌ی بازنشسته نباید برگردد، وگرنه شمارش‌های این پرونده دوباره دو منبعی
  // می‌شوند (یکی پوشه‌ی مرده، یکی Next).
  check('پوشه‌ی بازنشسته‌ی frontend/ روی دیسک نیست',
    !fs.existsSync(path.join(ROOT, 'frontend')));

  // مستندِ پلِ بازنشستگی: هر نامِ قدیمی باید جایی در README بیاید — چه آن‌هایی
  // که ۳۰۱ می‌شوند، چه آن‌هایی که عمداً ۴۰۴ می‌مانند. یک نامِ جامانده یعنی
  // خواننده‌ی README نمی‌داند آن آدرس چه سرنوشتی دارد.
  const legacyNames = [...new Set([...derived.legacyPages, ...derived.legacyNoAlias, 'product.html'])];
  check('جدولِ ریدایرکت واقعاً خوانده شد (کفِ ۱۰ نام)', legacyNames.length >= 10,
    `${legacyNames.length} نام`);
  const missingLegacy = legacyNames.filter((p) => !readme.includes(p));
  check('هر نامِ عصرِ Express در README نام برده شده', missingLegacy.length === 0,
    missingLegacy.join(',') || `${legacyNames.length} نام`);
  check('نامِ پارامتریِ product.html در جدولِ ریدایرکت هست', derived.legacyProduct);

  const missingSuites = derived.suites.filter((f) => !readme.includes(f));
  check('هر فایلِ backend/tests در README نام برده شده', missingSuites.length === 0,
    missingSuites.join(',') || `${derived.suites.length} فایل`);
}

// ---------- نتیجه ----------
console.log(`\n${failures.length === 0 ? 'SUCCESS' : 'FAILURE'}: ${pass} بررسی گذشت، ${failures.length} ناموفق`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
