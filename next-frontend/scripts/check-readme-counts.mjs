#!/usr/bin/env node
/* ============================================================
   راستیِ عددهای فرانت‌اند در README

   خواهرِ کوچکِ `backend/tests/readme-counts.js` برای طرفِ Next. آن یکی عددهای
   بک‌اند را از سورس می‌شمارد؛ این یکی عددِ آزمون‌های Vitest را از **خودِ نتیجه‌ی
   اجرا** می‌خواند، چون تنها منبعِ حقیقتِ این عدد همان چیزی است که واقعاً اجرا
   شد — نه شمارشِ `it(` در فایل، که با `it.each` و `describe` اشتباه می‌شود.

   چرا لازم شد: عددِ فرانت‌اند در README یکی از آن اعدادی است که تاریخ نشان داد
   بی‌صدا عقب می‌ماند (یک‌بار یک جا ۱۶ نوشته شده بود و جای دیگر ۹۸). حالا هم
   عددِ کل و هم عددِ «۲۰ آزمونِ صفحه‌ی نتیجه‌ی سفارش» با نتیجه‌ی اجرا مقایسه
   می‌شوند، به‌علاوه‌ی اینکه هر فایلِ آزمونِ موجود باید در README نام برده شده
   باشد — وگرنه یک سوئیتِ تازه بی‌سروصدا اضافه می‌شود و هیچ‌کس نمی‌فهمد.

   اجرا:  node scripts/check-readme-counts.mjs [گزارشِ-json]
          اگر گزارش داده نشود، خودش vitest را با reporter=json اجرا می‌کند.

   نکته‌ی پیاده‌سازی (همان درسی که نگهبانِ بک‌اند داد): متنِ README پیش از تطبیق
   یکسان‌سازی می‌شود (ZWNJ، «ی/ك» عربی، ارقامِ عربی) و کلمه‌ها با کدِ نویسه
   ساخته می‌شوند؛ وگرنه یک اِعراب یا ZWNJِ ناخواسته الگو را بی‌صدا از کار
   می‌اندازد و نگهبانی می‌ماند که هیچ نمی‌گیرد.
   ============================================================ */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const NEXT_DIR = path.join(HERE, '..');
const README = path.join(NEXT_DIR, '..', 'README.md');

// ---------- کمکی‌ها ----------
const w = (...cs) => String.fromCodePoint(...cs);
const ZWNJ = w(0x200c);
const FA0 = w(0x6f0);
const FA9 = w(0x6f9);
const NUM = `[${FA0}-${FA9}][${FA0}-${FA9},]*`;
// فاصله‌ی «هر چیزی جز حرف و رقم»: کسره، ZWNJ، نیم‌فاصله و فاصله را هم می‌گیرد.
const GAP = '[^\\p{L}\\p{N}]*';
const asciiDigits = (s) => [...String(s)]
  .map((c) => (c >= FA0 && c <= FA9 ? String(c.codePointAt(0) - 0x6f0) : c)).join('');
const toNum = (s) => Number(asciiDigits(s).replace(/[^0-9]/g, ''));
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

// کلمه‌ها با کدِ نویسه (تا هیچ ZWNJ/اعرابِ ناخواسته‌ای داخلشان نرود)
const FRONTEND = w(0x641, 0x631, 0x627, 0x646, 0x62a, 0x627, 0x646, 0x62f); // فرانت‌اند
const EXAM = w(0x622, 0x632, 0x645, 0x648, 0x646);                            // آزمون
const TAYASH = w(0x62a, 0x627, 0x6cc, 0x634);                                 // تایش
const MIYAN = w(0x645, 0x6cc, 0x627, 0x646);                                  // میان
const IN = w(0x627, 0x6cc, 0x646);                                            // این

// ---------- خواندنِ نتیجه‌ی واقعیِ اجرا ----------
// اگر مسیری صریح داده شود از همان استفاده می‌کنیم (حالتِ CI)، وگرنه *همیشه*
// تازه اجرا می‌کنیم. یک‌بار گزارشِ قبلی در پوشه‌ی موقت کش شد و همین باعث شد یک
// جهش (فایلِ آزمونِ تازه) سبز بماند — یعنی نگهبانی که گزارشِ کهنه را تأیید
// می‌کند، بدتر از نبودنش است.
const argPath = process.argv.find((a) => a.endsWith('.json'));
const report = argPath || path.join(os.tmpdir(), 'pg-vitest-report.json');
if (!argPath) {
  console.log(`(vitest را تازه اجرا می‌کنم و گزارش را در ${report} می‌ریزم)`);
  // مستقیم با خودِ Node و باینریِ محلیِ vitest: `npx.cmd` روی ویندوز با
  // spawnSync خطای EINVAL می‌دهد و پیامش هم گمراه‌کننده است.
  const local = path.join(NEXT_DIR, 'node_modules', 'vitest', 'vitest.mjs');
  const args = ['run', '--reporter=json', `--outputFile=${report}`];
  try {
    fs.rmSync(report, { force: true });
    if (fs.existsSync(local)) execFileSync(process.execPath, [local, ...args], { cwd: NEXT_DIR, stdio: 'inherit' });
    else execFileSync('npx', args, { cwd: NEXT_DIR, stdio: 'inherit', shell: process.platform === 'win32' });
  } catch (e) {
    console.log(`[FAIL] اجرای vitest شکست خورد — ${e.message}`);
    process.exit(1);
  }
}
let res;
try {
  res = JSON.parse(fs.readFileSync(report, 'utf8'));
} catch (e) {
  console.log(`[FAIL] گزارشِ vitest خوانده نشد (${e.message})`);
  process.exit(1);
}
const total = res.numTotalTests;
const perFile = new Map((res.testResults || []).map((t) => [path.basename(t.name), t.assertionResults.length]));
const files = [...perFile.keys()];

// فایل‌های آزمونِ واقعی روی دیسک — تا گزارشِ کهنه یا نصفه خودش را لو بدهد
function testFilesOnDisk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) testFilesOnDisk(abs, out);
    else if (/\.test\.(ts|tsx)$/.test(e.name)) out.push(e.name);
  }
  return out;
}
const onDisk = testFilesOnDisk(path.join(NEXT_DIR, 'src')).sort();

const lines = norm(fs.readFileSync(README, 'utf8').replace(/\r?\n/g, '\n')).split('\n');

// ---------- آزمونِ خودِ استخراج‌کننده ----------
(function selfTest() {
  const D = (n) => asciiDigits(String(n)).split('').map((d) => String.fromCodePoint(0x6f0 + Number(d))).join('');
  const re1 = new RegExp(`(${NUM})${GAP}${EXAM}${GAP}${FRONTEND}`, 'gu');
  check('خودآزمون: «N آزمونِ فرانت‌اند» خوانده می‌شود',
    re1.exec(`${D(98)} ${EXAM}${ZWNJ}\u0650 ${FRONTEND}`)?.[1] === D(98));
  const re2 = new RegExp(`${FRONTEND}${GAP}\\(Vitest\\)${GAP}\\*\\*(${NUM})\\*\\*`, 'gu');
  check('خودآزمون: «فرانت‌اند (Vitest) **N**» خوانده می‌شود',
    re2.exec(`${FRONTEND} (Vitest) **${D(98)}**`)?.[1] === D(98));
  const re3 = new RegExp(`${MIYAN}${GAP}${IN}${GAP}(${NUM})${GAP}${EXAM}`, 'gu');
  check('خودآزمون: «میانِ این N آزمون» خوانده می‌شود',
    re3.exec(`${MIYAN}${ZWNJ}\u0650 ${IN} ${D(98)} ${EXAM}`)?.[1] === D(98));
})();

// ---------- کفِ گزارش ----------
check('گزارشِ vitest دستِ‌کم ۵ فایلِ آزمون دارد', files.length >= 5, `${files.length} فایل`);
check('گزارشِ vitest دستِ‌کم ۵۰ آزمون دارد', total >= 50, `${total} آزمون`);
{
  const inReport = [...files].sort();
  const missing = onDisk.filter((f) => !inReport.includes(f));
  const extra = inReport.filter((f) => !onDisk.includes(f));
  check('گزارش همان فایل‌های آزمونی است که روی دیسک هستند',
    missing.length === 0 && extra.length === 0,
    [missing.length ? `گزارش جا انداخته: ${missing.join(',')}` : '',
      extra.length ? `اضافی در گزارش: ${extra.join(',')}` : ''].filter(Boolean).join(' | ') || `${onDisk.length} فایل`);
}

// ---------- عددِ کل ----------
{
  const collect = (re) => lines.flatMap((l) => [...l.matchAll(re)].map((m) => toNum(m[1])));
  const a = collect(new RegExp(`(${NUM})${GAP}${EXAM}${GAP}${FRONTEND}`, 'gu'));
  const b = collect(new RegExp(`${FRONTEND}${GAP}\\(Vitest\\)${GAP}\\*\\*(${NUM})\\*\\*`, 'gu'));
  const c = collect(new RegExp(`${MIYAN}${GAP}${IN}${GAP}(${NUM})${GAP}${EXAM}`, 'gu'));
  const all = [...a, ...b, ...c];
  check('README عددِ آزمون‌های فرانت‌اند را در سه شکل گفته',
    a.length >= 1 && b.length >= 1 && c.length >= 1,
    `آزمونِ فرانت‌اند=${a.length} جدول=${b.length} متن=${c.length}`);
  check(`همه‌ی ${all.length} اشاره به عددِ فرانت‌اند برابرِ نتیجه‌ی اجرا (${total}) است`,
    all.length >= 4 && all.every((n) => n === total), all.join(','));
}

// ---------- عددِ یک فایلِ خاص ----------
{
  const actual = perFile.get('OrderSuccessContent.test.tsx');
  check('فایلِ آزمونِ صفحه‌ی نتیجه‌ی سفارش در گزارش هست', actual !== undefined, `${actual} آزمون`);
  // در متنِ README این عدد با اصطلاحِ «N تایش» می‌آید (کامنتِ دستورِ npm test)
  const prose = lines
    .flatMap((l) => [...l.matchAll(new RegExp(`(${NUM})${GAP}${TAYASH}`, 'gu'))])
    .map((m) => toNum(m[1]));
  check(`ادعای «N تایش» با عددِ صفحه‌ی نتیجه‌ی سفارش یکی است (${actual})`,
    prose.length >= 1 && prose.every((n) => n === actual), prose.join(','));
}

// ---------- عددِ هر فایل، و نام‌بردنِ هر فایل ----------
// الگو: نامِ فایل، بعد عدد، بعد کلمه‌ی «آزمون» — پیوستگیِ عدد به فایل، نه به خط.
// این‌طور چند فایل در یک خط هم قاطی نمی‌شوند.
{
  const missingName = [];
  const missingClaim = [];
  for (const [file, count] of perFile) {
    const esc = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!fs.readFileSync(README, 'utf8').includes(file)) { missingName.push(file); continue; }
    const re = new RegExp(`${esc}${GAP}\\(?(${NUM})${GAP}${EXAM}`, 'gu');
    const hits = lines.flatMap((l) => [...l.matchAll(re)].map((m) => toNum(m[1])));
    if (!hits.length) { missingClaim.push(file); continue; }
    check(`عددِ «${file}» با اجرا یکی است`, hits.every((n) => n === count), `${hits.join(',')} در برابر ${count}`);
  }
  check('هر فایلِ آزمونِ فرانت‌اند در README نام برده شده', missingName.length === 0,
    missingName.join(',') || `${perFile.size} فایل`);
  check('عددِ هر فایلِ آزمون در README نوشته شده', missingClaim.length === 0,
    missingClaim.join(',') || `${perFile.size} فایل`);
}

// ---------- نتیجه ----------
console.log(`\n${failures.length === 0 ? 'SUCCESS' : 'FAILURE'}: ${pass} بررسی گذشت، ${failures.length} ناموفق`);
if (failures.length) {
  for (const f of failures) console.log(`  ✗ ${f}`);
  process.exit(1);
}
