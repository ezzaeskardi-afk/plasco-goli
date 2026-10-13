#!/usr/bin/env node
/* ============================================================
   اسکنِ راز با Gitleaks — «رازِ تازه نباید بی‌دیده رد شود»

   ---------- چرا این فایل، وقتی gitleaks و security.yml از قبل بودند ----------
   پیکربندی (`gitleaks.toml`)، فهرستِ استثناها (`.gitleaksignore`) و workflowِ
   CI هر سه بودند، ولی دو حفره مانده بود و هر دو از همین‌جا بسته می‌شود:

     ۱) **باینری روی PATH نیست.** نصب با winget انجام می‌شود و در
        `…\WinGet\Packages\Gitleaks.Gitleaks_*\gitleaks.exe` می‌نشیند؛ پوشهٔ
        `WinGet\Links` هم روی PATH این دستگاه نیست. پس هر کس «دستی» اجرا
        می‌کرد، به `command not found` می‌خورد و اسکن فقط در CI زنده می‌ماند —
        یعنی همان‌جا که دیگر دیر است. این فایل خودش باینری را پیدا می‌کند
        (`GITLEAKS_BIN` ← PATH ← جاهای شناخته‌شده) و اگر پیدا نکرد، با کدِ ۲
        می‌ایستد؛ **سبزِ خالی نمی‌دهد.**

     ۲) **دامنه قاطی بود.** دستورِ مستندِ قبلی (`gitleaks detect … --source .`)
        کلِ پوشه را اسکن می‌کند، و gitleaks در حالتِ پوشه `.gitignore` را
        احترام نمی‌گذارد (سنجیده شد: `backend/.env` و `next-frontend/.next/` هم
        اسکن می‌شوند). نتیجه‌اش دو چیزِ بی‌ربط با هم بود:

          • یافته‌های *واقعیِ محلی* — رازِ خودِ `.env` روی این دستگاه و کپی‌هایش
            در `backup/`. درست است، ولی ربطی به «مخزن پاک است؟» ندارد.
          • یافته‌های *کاذبِ خروجیِ ساخت* — نه رشتهٔ base64 در manifestهای
            `.next/` که هر `next build` از نو می‌سازد.

        پس یک «قرمزِ همیشگی» می‌شد که کسی نگاهش نمی‌کرد؛ و دروازه‌ای که همیشه
        قرمز باشد، عملاً خاموش است. دامنهٔ پیش‌فرضِ این فایل همان چیزی است که
        *می‌تواند واردِ مخزن شود*:

          • `git`  — کلِ تاریخچه (هر رازی که یک‌بار کامیت شده، برای همیشه).
          • `git --staged` — دقیقاً محتوایِ کامیتِ در راه. این همان چیزی است که
            هوکِ pre-commit باید جلو بگیرد و هیچ پوشه‌ی محلی در آن نیست.

        `--worktree` هم هست، ولی **عمداً جدا**: اسکنِ پوشه، رازِ محلیِ `.env` را
        هم می‌بیند و همین درست است. آن حالت برای *بازرسی* است، نه دروازه.

   ---------- رمز را چاپ نمی‌کند ----------
   همه‌ی اسکن‌ها با `--redact` اجرا می‌شوند و گزارشِ ساختاریافته در پوشهٔ موقتِ
   سیستم نوشته و همان‌جا پاک می‌شود — نه در مخزن. خروجی این ابزار فقط
   `قاعده | فایل:خط` است، نه مقدارِ راز. «اثرِ انگشت» (fingerprint) هم چاپ
   می‌شود، چون همان چیزی است که اگر یافته واقعاً بی‌خطر و بررسی‌شده بود، در
   `.gitleaksignore` می‌نشیند.

   ---------- اجرا ----------
     node tools/gitleaks.js              # دامنهٔ مخزن: تاریخچه + محتوای staged
     node tools/gitleaks.js --worktree   # + بازرسیِ پوشه (یافته‌های محلی هم می‌آید)
     node tools/gitleaks.js --worktree-only
     node tools/gitleaks.js --list       # فقط نشان بده چه اسکن‌هایی اجرا می‌شود
     node tools/gitleaks.js --help

   ---------- کدِ خروج ----------
   صفر = پاک. یک = یافته. دو = پیش‌شرط آماده نبود (باینری نیست، git نیست، یا
   خودِ اسکن خطا داد) — و این عمداً «سبز» نیست: نگهبانی که وقتی کار نمی‌کند
   ساکت بماند، از نبودنش بدتر است.
   ============================================================ */
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CONFIG = path.join(ROOT, 'gitleaks.toml');
const IGNORE = path.join(ROOT, '.gitleaksignore');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);

if (has('--help') || has('-h')) {
  const help = fs.readFileSync(__filename, 'utf8')
    .split('---------- اجرا ----------')[1]
    .split('---------- کدِ خروج ----------')[0]
    .replace(/^\s*\*\s?/gm, '')
    .trimEnd();
  console.log(help);
  process.exit(0);
}

const WORKTREE = has('--worktree') || has('--worktree-only');
const WORKTREE_ONLY = has('--worktree-only');
const LIST = has('--list');

/* ------------------------------------------------------------
   ۱) پیدا کردنِ باینری — سه لایه، به‌ترتیبِ اولویت
   ------------------------------------------------------------ */
const BIN_NAMES = process.platform === 'win32' ? ['gitleaks.exe', 'gitleaks'] : ['gitleaks'];

function onPath() {
  for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const name of BIN_NAMES) {
      const full = path.join(dir, name);
      try { if (fs.statSync(full).isFile()) return full; } catch { /* نه اینجا */ }
    }
  }
  return null;
}

function inKnownPlaces() {
  const home = os.homedir();
  const local = process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  const programData = process.env.ProgramData || 'C:\\ProgramData';
  const candidates = [];

  if (process.platform === 'win32') {
    candidates.push(path.join(local, 'Microsoft', 'WinGet', 'Links', 'gitleaks.exe'));
    // winget نصبِ نسخه‌دار را در پوشه‌ای با hash می‌گذارد؛ نامش را حدس نمی‌زنیم.
    const packages = path.join(local, 'Microsoft', 'WinGet', 'Packages');
    try {
      for (const dirent of fs.readdirSync(packages, { withFileTypes: true })) {
        if (dirent.isDirectory() && /^Gitleaks/i.test(dirent.name)) {
          candidates.push(path.join(packages, dirent.name, 'gitleaks.exe'));
        }
      }
    } catch { /* winget نصب نیست */ }
    candidates.push(path.join(programData, 'chocolatey', 'bin', 'gitleaks.exe'));
    candidates.push(path.join(home, 'scoop', 'shims', 'gitleaks.exe'));
  } else {
    candidates.push(
      path.join(home, 'go', 'bin', 'gitleaks'),
      path.join(home, '.local', 'bin', 'gitleaks'),
      '/usr/local/bin/gitleaks',
      '/usr/bin/gitleaks',
      '/opt/homebrew/bin/gitleaks',
    );
  }

  for (const candidate of candidates) {
    try { if (fs.statSync(candidate).isFile()) return candidate; } catch { /* ادامه */ }
  }
  return null;
}

function findBinary() {
  // لایهٔ صفر: صریح‌ترین حالت — اگر مسیری داده شده، همان معتبر است و اگر نبود
  // سراغِ جای دیگر نمی‌رویم (وگرنه یک غلطِ تایپی به‌جای خطا، بی‌صدا به یک
  // باینریِ دیگر می‌چسبید و سنجش با ابزارِ عوض‌شده سبز می‌شد).
  const explicit = process.env.GITLEAKS_BIN;
  if (explicit) {
    try { if (fs.statSync(explicit).isFile()) return explicit; } catch { /* می‌گوییم */ }
    return { error: explicit };
  }
  return onPath() || inKnownPlaces() || null;
}

/* ------------------------------------------------------------
   ۲) اسکن‌ها — هر کدام یک گزارشِ ساختاریافته، و هیچ رمزی در خروجی
   ------------------------------------------------------------ */
const gitOk = (args) => {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  return r.status === 0 ? (r.stdout || '').trim() : null;
};

const isRepo = () => gitOk(['rev-parse', '--git-dir']) !== null;
const stagedFiles = () => {
  const out = gitOk(['diff', '--cached', '--name-only']);
  return out === null ? [] : out.split('\n').map((l) => l.trim()).filter(Boolean);
};

function scan(binary, spec) {
  const report = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pg-gitleaks-')), 'report.json');
  const args = [
    ...spec.args,
    '--redact',              // حتی در گزارشِ verbose مقدارِ راز چاپ نمی‌شود
    '--no-banner',
    '--config', CONFIG,
    '--gitleaks-ignore-path', IGNORE,
    '--report-format', 'json',
    '--report-path', report,
    '-v',                    // تنها برای گرفتنِ خط‌های Fingerprint
  ];
  const t0 = Date.now();
  const r = spawnSync(binary, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const took = Date.now() - t0;
  const log = `${r.stdout || ''}\n${r.stderr || ''}`;

  let findings = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(report, 'utf8'));
    if (Array.isArray(parsed)) findings = parsed;
  } catch { /* فایلِ گزارش نبود = یافته‌ای نبود */ }
  try { fs.rmSync(path.dirname(report), { recursive: true, force: true }); } catch { /* بی‌اهمیت */ }

  // اثرِ انگشت از خودِ گزارش خوانده می‌شود، نه از پارسِ خطِ verbose: با JSONِ
  // ساختاریافته هر یافته اثرِ انگشتِ *خودش* را دارد و نمی‌تواند به یافته‌ی
  // دیگری بچسبد. (ردِ `--redact` فقط رمز را می‌پوشاند، نه اثرِ انگشت.)
  const fingerprints = findings.map((f) => f.Fingerprint).filter(Boolean);
  const commits = (log.match(/(\d+)\s+commits?\s+scanned/i) || [])[1];
  const bytes = (log.match(/scanned\s+~?[\d.]+\s*\S+\s*\(([^)]+)\)/i) || [])[1];
  // «تاریخچه» تعدادِ کامیت را می‌گوید و `--staged` حجم را؛ هر دو درست‌اند ولی
  // نمی‌شود یکی‌شان گرفت: «۱۶۵ کامیت» برای یک فایلِ stageشده گمراه‌کننده است.
  const scanned = spec.args[1] === '--staged'
    ? (bytes || '')
    : (commits ? `${commits} کامیت` : bytes || '');

  return {
    spec, findings, fingerprints, took, scanned,
    code: r.status === null ? 2 : r.status,
    log,
  };
}

/* ------------------------------------------------------------
   ۳) فهرستِ کارها — وابسته به همین مخزن، نه به حدس
   ------------------------------------------------------------ */
function plan() {
  const steps = [];

  if (!WORKTREE_ONLY) {
    if (!isRepo()) return { error: 'این پوشه یک مخزنِ گیت نیست، پس تاریخچه‌ای برای اسکن نیست.' };
    steps.push({ label: 'تاریخچهٔ گیت', args: ['git', '.'], note: 'هر رازی که یک‌بار کامیت شده' });

    const staged = stagedFiles();
    if (staged.length > 0) {
      steps.push({
        label: 'محتوایِ آمادهٔ کامیت',
        args: ['git', '--staged'],
        note: `${staged.length} فایلِ stage‌شده`,
      });
    } else {
      steps.push({ label: 'محتوایِ آمادهٔ کامیت', skipped: 'چیزی stage نشده' });
    }
  }

  if (WORKTREE) {
    steps.push({
      label: 'پوشهٔ کار (بازرسی)',
      args: ['dir', '.'],
      note: 'رازِ فایل‌های محلی/ساخته‌شده هم می‌آید — درست است، ولی دروازه نیست',
    });
  }

  return { steps };
}

/* ------------------------------------------------------------
   ۴) اجرا
   ------------------------------------------------------------ */
console.log('\n=== اسکنِ راز — Gitleaks ===');

const found = findBinary();
if (found && typeof found === 'object') {
  console.error(`✖ GITLEAKS_BIN روی «${found.error}» ست شده ولی چنین فایلی نیست.`);
  console.error('   یا مسیر را درست کن، یا این متغیر را بردار تا خودم بگردم.');
  process.exit(2);
}
if (!found) {
  console.error('✖ gitleaks پیدا نشد — اسکن انجام نشد (این «پاک» نیست، «نشد» است).');
  console.error('');
  console.error('  نصب، یکی را انتخاب کن:');
  console.error('    winget install --id Gitleaks.Gitleaks -e       (ویندوز)');
  console.error('    brew install gitleaks                          (مک)');
  console.error('    go install github.com/gitleaks/gitleaks/v8@latest');
  console.error('');
  console.error('  اگر جای دیگری نصب است: GITLEAKS_BIN=<مسیرِ کاملِ باینری>');
  process.exit(2);
}

const version = (spawnSync(found, ['version'], { encoding: 'utf8' }).stdout || '').trim();
console.log(`  باینری: ${found}${version ? `  (${version})` : ''}`);
console.log(`  پیکربندی: ${path.relative(ROOT, CONFIG)}   استثناها: ${path.relative(ROOT, IGNORE)}`);

const planned = plan();
if (planned.error) {
  console.error(`✖ ${planned.error}`);
  process.exit(2);
}
if (LIST) {
  console.log('\n  کارهایی که اجرا می‌شود:');
  for (const step of planned.steps) {
    console.log(`    • ${step.label}${step.skipped ? `  (رد می‌شود: ${step.skipped})` : ''}`);
  }
  process.exit(0);
}

let leaks = 0;
let failed = false;
// اثرِ انگشت به‌همراهِ دامنه‌اش نگه داشته می‌شود: راهِ برخورد با یافتهٔ
// «تاریخچه» و «پوشهٔ کار» یکی نیست، و پیشنهادِ اشتباه بدتر از سکوت است.
const collected = [];

for (const step of planned.steps) {
  if (step.skipped) {
    console.log(`\n▶ ${step.label} … ⏭ ${step.skipped}`);
    continue;
  }
  const result = scan(found, step);
  const secs = `${(result.took / 1000).toFixed(1)}s`;
  // سه دامنه، سه راهِ برخورد. «تاریخچه» و «stageشده» هر دو واردِ مخزن می‌شوند،
  // ولی یکی گذشته است و دیگری همین حالا جلوی چشم: جای دومی "لاگ نکن" است،
  // نه "ignore کن". یکی‌گرفتنشان بدترین کار است — پیشنهادِ غلط بدتر از سکوت.
  const scope = step.args[0] === 'dir' ? 'dir' : (step.args[1] === '--staged' ? 'staged' : 'history');
  collected.push(...result.fingerprints.map((fingerprint) => ({ fingerprint, scope })));

  if (result.findings.length === 0 && result.code !== 0 && result.code !== 1) {
    // خطِ غیرِصفر بدونِ هیچ یافته = خودِ اسکن خراب شد (ریپازیتوری بد، خطای I/O…)
    failed = true;
    console.error(`\n▶ ${step.label} … ✖ اسکن اجرا نشد (کدِ خروج ${result.code})`);
    for (const line of result.log.split('\n').slice(-12)) if (line.trim()) console.error(`    ${line}`);
    continue;
  }

  leaks += result.findings.length;
  const verdict = result.findings.length === 0 ? '✔ پاک' : `✖ ${result.findings.length} یافته`;
  console.log(`\n▶ ${step.label} … ${verdict}  (${secs}${result.scanned ? `، ${result.scanned}` : ''})`);
  if (step.note) console.log(`    ${step.note}`);
  for (const f of result.findings) {
    console.log(`    • ${f.RuleID} | ${f.File}:${f.StartLine}${f.Commit ? `  (کامیتِ ${String(f.Commit).slice(0, 8)})` : ''}`);
  }
}

if (failed) {
  console.error('\n✖ اسکن کامل نشد — تا وقتی اجرا نشود، «پاک» معنی ندارد.');
  process.exit(2);
}

if (leaks === 0) {
  console.log('\n✔ پاک — هیچ رازی در دامنهٔ اسکن‌شده نیست.');
  process.exit(0);
}

console.log('\n✖ راز پیدا شد. سه راه دارد و انتخاب بین‌شان مهم است:');
console.log('    ۱. رازِ واقعی است → **بچرخانش** (rotate). پاک‌کردنِ فایل کافی نیست:');
console.log('       تاریخچهٔ گیت نگهش می‌دارد و راهِ درست، بی‌اعتبارکردنِ خودِ راز است.');
console.log('    ۲. دادهٔ آزمون/جای‌نگهدارِ بررسی‌شده در کامیتی *قدیمی* است → همان اثرِ');
console.log('       انگشت را با یک خط توضیح در .gitleaksignore بگذار (خط‌به‌خط، بی‌الگوی عام).');
console.log('    ۳. هیچ‌کدام (رازِ محلیِ همین دستگاه) → فایل را از دامنه بیرون نگه دار؛');
console.log('       اثرِ انگشت روی یک .env واقعی یعنی خاموش‌کردنِ اسکنر برای همان فایل.');

const fps = (scope) => [...new Set(collected.filter((c) => c.scope === scope).map((c) => c.fingerprint))];
const stagedFps = fps('staged');
const historyFps = fps('history');
const dirFps = fps('dir');

if (stagedFps.length > 0) {
  console.log('\n  دامنهٔ «محتوایِ stageشده» — تازه است و همین‌جا برطرف می‌شود:');
  console.log('  فایل را از کامیت بردار، یا اگر جای‌نگهدارِ آزمون است خودِ رشته را عوض کن؛');
  console.log('  .gitleaksignore مالِ گذشته است، نه این:');
  for (const fp of stagedFps.slice(0, 10)) console.log(`        ${fp}`);
}
if (historyFps.length > 0) {
  console.log('\n  دامنهٔ «تاریخچه» — فقط اگر دادهٔ آزمون/جای‌نگهدارِ بررسی‌شده در کامیتی *قدیمی* بود،');
  console.log('  اثرِ انگشت را با یک خط توضیح در .gitleaksignore بگذار:');
  for (const fp of historyFps.slice(0, 10)) console.log(`        ${fp}`);
}
if (dirFps.length > 0) {
  console.log('\n  دامنهٔ «پوشهٔ کار» — این‌ها را در .gitleaksignore نگذار؛ از دامنه بیرون نگهشان دار:');
  for (const fp of dirFps.slice(0, 10)) console.log(`        ${fp}`);
}
process.exit(1);
