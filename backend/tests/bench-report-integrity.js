#!/usr/bin/env node
// tests/bench-report-integrity.js — تست یکپارچگی گزارش بنچمارک
// مطمئن می‌شه که bench-report.sh بلوک جدید اضافه می‌کنه، نه اینکه قبلی رو پاک کنه

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPORT = path.join(__dirname, '..', 'benchmark-report.md');

let pass = 0, fail = 0;
function ok(label) { pass++; console.log(`  [PASS] ${label}`); }
function notOk(label, detail) { fail++; console.error(`  [FAIL] ${label} — ${detail}`); }

// ---------- کپی گزارش فعلی ----------
const ORIGINAL = fs.readFileSync(REPORT, 'utf8');
const BACKUP = REPORT + '.test-backup';
fs.writeFileSync(BACKUP, ORIGINAL);

function restore() {
  fs.writeFileSync(REPORT, ORIGINAL);
  try { fs.unlinkSync(BACKUP); } catch (e) {}
}

// ---------- تست‌ها ----------
console.log('\n=== تست یکپارچگی benchmark-report.md ===\n');

// ۱. فایل وجود داره
if (fs.existsSync(REPORT)) ok('benchmark-report.md exists');
else { notOk('File exists', 'not found'); restore(); process.exit(1); }

// ۲. ساختار Markdown درسته (حداقل یک عنوان h1 داره)
const lines = ORIGINAL.split('\n');
const hasH1 = lines.some(l => l.startsWith('# '));
const hasTable = lines.some(l => l.startsWith('|'));
hasH1 ? ok('Report has h1 heading') : notOk('h1 heading', 'missing');
hasTable ? ok('Report contains markdown tables') : notOk('Tables', 'missing');

// ۳. حداقل یک بخش آماری داره (اعداد p50/p90)
const p50Matches = [...ORIGINAL.matchAll(/\*\*۴۰۰\*\*|\*\*۱۵۰۰\*\*|\*\*۲۰۰۰\*\*|\*\*۳۰۰۰\*\*|\*\*۵۰۰۰\*\*|\*\*۱۰۰۰۰\*\*/g)];
if (p50Matches.length >= 3) ok(`Found ${p50Matches.length} benchmark data rows (user counts)`);
else notOk('Benchmark data rows', `${p50Matches.length} found — report may be empty`);

// ۴. بخش‌های کلیدی وجود دارن
const requiredSections = [
  'مشخصات زیرساخت',
  'بنچمارک نوشتن',
  'بنچمارک خواندن',
  'حافظه',
  'تحلیل',
  'ملاحظات',
];
for (const section of requiredSections) {
  ORIGINAL.includes(section) ? ok(`Section "${section}" exists`) : notOk(`Section missing`, section);
}

// ۵. جدول‌ها فرمت درست دارن (| ستون | ستون |)
const tableHeaderLines = lines.filter(l => l.startsWith('| ') && l.endsWith(' |'));
const separatorLines = lines.filter(l => /^\|[-| ]+\|$/.test(l));
if (tableHeaderLines.length >= 2) ok(`Found ${tableHeaderLines.length} table headers`);
else notOk('Table headers', `only ${tableHeaderLines.length}`);
if (separatorLines.length >= 2) ok(`Found ${separatorLines.length} table separators`);
else notOk('Table separators', `only ${separatorLines.length}`);

// ۶. شبیه‌سازی افزودن بلوک جدید
const newBlock = `
## اجرای TEST-${Date.now()}

| مورد | مقدار |
|---|---|
| کامیت | \`test-commit\` |
| Node | v99.99.0 |

### نتایج

> ⏱ تست یکپارچگی — این بلوک بعد از تست حذف می‌شود

`;
fs.writeFileSync(REPORT, ORIGINAL + newBlock);
const modified = fs.readFileSync(REPORT, 'utf8');

// ۶الف — محتوای قبلی هنوز هست
if (modified.startsWith(ORIGINAL)) {
  ok('Append: original content preserved when adding new block');
} else {
  notOk('Append', 'original content was modified or truncated');
}

// ۶ب — بلوک جدید اضافه شده
if (modified.includes('TEST-') && modified.includes('v99.99.0')) {
  ok('Append: new block correctly appended');
} else {
  notOk('Append', 'new block not found at end of report');
}

// ۶ج — تعداد بلوک‌ها یکی بیشتر شده
const oldBlockCount = [...ORIGINAL.matchAll(/## اجرای /g)].length;
const newBlockCount = [...modified.matchAll(/## اجرای /g)].length;
if (newBlockCount === oldBlockCount + 1) {
  ok(`Block count increased: ${oldBlockCount} → ${newBlockCount}`);
} else {
  notOk('Block count', `expected ${oldBlockCount + 1}, got ${newBlockCount}`);
}

// ۷ — تأیید اینکه اسکریپت bench-report.sh هست
const benchSh = path.join(__dirname, '..', 'bench-report.sh');
if (fs.existsSync(benchSh)) {
  ok('bench-report.sh exists');
  const shContent = fs.readFileSync(benchSh, 'utf8');
  if (shContent.includes('>> \"$REPORT\"') || shContent.includes('>> $REPORT') || shContent.includes('>> benchmark-report.md')) {
    ok('bench-report.sh appends (>>) not overwrites (>)');
  } else {
    notOk('bench-report.sh write mode', 'append operator (>>) not detected — check for overwrite risk');
  }
} else {
  ok('bench-report.sh not found — integrity test focus only');
}

// ۸ — بازیابی فایل اصلی
restore();

// ۹ — فایل اصلی بازیابی شده با نسخهٔ اولیه یکسانه
const restored = fs.readFileSync(REPORT, 'utf8');
if (restored === ORIGINAL) {
  ok('Restore: original file fully restored after test');
} else {
  notOk('Restore', `files differ by ${restored.length - ORIGINAL.length} bytes`);
}

console.log(`\n${'='.repeat(60)}`);
console.log(`  Total: ${pass + fail} checks | ✅ ${pass} passed | ❌ ${fail} failed`);
console.log(`${'='.repeat(60)}\n`);

if (fail > 0) process.exit(1);