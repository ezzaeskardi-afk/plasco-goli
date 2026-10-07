#!/usr/bin/env node
/* ============================================================
   دروازهٔ پیش از کامیت — همهٔ سنجش‌های «عدد» را یک‌جا اجرا می‌کند.

   ---------- چرا این فایل وجود دارد ----------
   عددهای README ماشین‌خوان‌اند: `backend/tests/readme-counts.js` و
   `next-frontend/scripts/check-readme-counts.mjs` آن‌ها را با خودِ کد
   مقایسه می‌کنند. ولی خودِ نگهبان‌ها هم لنگر دارند: `guard-mutations.js`
   روی همان عددها جهش می‌کوبد و اگر عددی عوض شود و لنگر جا بماند،
   **خودِ نگهبان** می‌شکند، نه کد.

   یعنی دو شکستِ متفاوت که هر دو از یک جا می‌آیند:
     ۱. عددی در README بیات شود            → readme-counts قرمز می‌شود
     ۲. عددی عوض شود و لنگرِ جهش جا بماند  → guard-mutations قرمز می‌شود
   هر دو تا امروز فقط «موقعِ بازبینی» پیدا می‌شدند — یعنی بعد از کامیت.
   این فایل آن‌ها را سرِ کامیت می‌آورد.

   ---------- اجرا ----------
     node verify-before-commit.mjs              # همه‌ی scopeهای آفلاین
     node verify-before-commit.mjs --fast       # فقط عددها (چند ثانیه)
     node verify-before-commit.mjs --live       # + برابریِ زنده (هر دو سرور لازم است)
     node verify-before-commit.mjs --keep-going # بعد از شکست هم بقیه را اجرا کن
     node verify-before-commit.mjs --install-hook [--fast]
     node verify-before-commit.mjs --help

   ---------- کدِ خروج ----------
   صفر = همه سبز. در حالتِ پیش‌فرض (توقف سرِ اولین شکست) کدِ خروج همان
   شکست است تا کدِ ۲ («پیش‌شرط آماده نبود») از ۱ («سنجش رد شد») جدا بماند.
   با `--keep-going` هر شکستی کدِ ۱ می‌دهد، چون آن‌جا مجموع مهم است.
*/

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);

if (has('--help') || has('-h')) {
  const help = readFileSync(fileURLToPath(import.meta.url), 'utf8')
    .split('---------- اجرا ----------')[1]
    .split('---------- کدِ خروج ----------')[0]
    .replace(/^\s*\*\s?/gm, '')
    .trimEnd();
  console.log(help);
  process.exit(0);
}

const FAST = has('--fast');
const LIVE = has('--live');
const KEEP_GOING = has('--keep-going');

// ---------- فهرستِ کارها ----------
// ترتیب عمدی است: ارزان‌ترین و پرتکرارترین اول، تا گران‌ترین وقتِ کسی را
// که یک اشتباهِ ساده دارد نگیرد.
const STEPS = [
  {
    label: 'عددهای README — بک‌اند',
    why: 'خطِ وضعیت، جدول، کامنتِ دستور، درخت و متنِ امکانات',
    cwd: join(ROOT, 'backend'),
    args: ['tests/readme-counts.js'],
    fast: true,
  },
  {
    label: 'عددهای README — فرانت‌اند',
    why: 'عددها را از نتیجهٔ یک دور واقعیِ vitest می‌خواند',
    cwd: join(ROOT, 'next-frontend'),
    args: ['scripts/check-readme-counts.mjs'],
    fast: true,
    hint: 'اگر `next-frontend/node_modules` نیست: در همان پوشه `npm install` بزن.',
  },
  {
    label: 'جهش‌های نگهبان‌های بک‌اند',
    why: 'هفت نگهبان، از جمله هر دو جهشِ عددهای README',
    cwd: join(ROOT, 'backend'),
    args: ['tests/guard-mutations.js', '--scope=backend'],
  },
  {
    label: 'جهش‌های نگهبان‌های فرانت‌اند',
    why: 'هفده نگهبانِ Vitest و اسکریپت‌های Next',
    cwd: join(ROOT, 'backend'),
    args: ['tests/guard-mutations.js', '--scope=frontend'],
  },
  {
    label: 'جهش‌های برابریِ زنده',
    why: 'هر دو سرور لازم است (Express روی ۳۰۰۰ و Next روی ۳۰۰۱)',
    cwd: join(ROOT, 'backend'),
    args: ['tests/guard-mutations.js', '--scope=live'],
    live: true,
  },
];

// ---------- نصب به‌عنوان هوک ----------
if (has('--install-hook')) {
  const hooksDir = join(ROOT, '.git', 'hooks');
  const hookPath = join(hooksDir, 'pre-commit');
  if (!existsSync(hooksDir)) {
    console.error(`✖ پوشهٔ ${hooksDir} نیست — این مخزن گیت نیست؟`);
    process.exit(2);
  }
  // هوکِ موجود را بی‌صدا پاک نمی‌کنیم: یک‌بار که بود، دیگر مالِ ما نیست.
  if (existsSync(hookPath)) {
    console.error('✖ .git/hooks/pre-commit از قبل هست؛ دست به آن نمی‌زنم.');
    console.error('   اگر مالِ خودت نیست، اول ببین چه می‌کند بعد دستی ادغام کن.');
    process.exit(2);
  }
  const passArgs = FAST ? ' --fast' : '';
  writeFileSync(hookPath, `#!/bin/sh
# دروازهٔ پیش از کامیت — ساخته‌شده با: node verify-before-commit.mjs --install-hook${passArgs}
# راهِ دور زدن، وقتی عمداً می‌خواهی: git commit --no-verify
exec node "$(git rev-parse --show-toplevel)/verify-before-commit.mjs"${passArgs}
`, 'utf8');
  if (process.platform !== 'win32') chmodSync(hookPath, 0o755);
  console.log(`✔ نصب شد: ${hookPath}${passArgs ? `  (حالتِ${passArgs})` : ''}`);
  console.log('  برای برداشتنش: rm .git/hooks/pre-commit');
  process.exit(0);
}

// ---------- انتخابِ کارها ----------
const plan = STEPS.filter((s) => (s.live ? LIVE : !(FAST && !s.fast)));
if (FAST && LIVE) {
  console.error('✖ --fast و --live با هم بی‌معنی‌اند: حالتِ سریع عمداً هیچ سنجشِ زنده‌ای ندارد.');
  process.exit(2);
}

const now = () => Number(process.hrtime.bigint() / 1000000n);
const secs = (ms) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);
const lastMeaningful = (out) => {
  const lines = out.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.filter((l) => /SUCCESS|FAILURE|خلاصه|مجموع|✔/.test(l)).pop() || lines.pop() || '';
};

console.log('دروازهٔ پیش از کامیت — نگهبان‌های عدد و جهش');
console.log(`  ${plan.length} کار${FAST ? '  (حالتِ سریع: فقط عددها)' : ''}`);
console.log('');

const results = [];
for (const step of plan) {
  process.stdout.write(`▶ ${step.label} … `);
  const t0 = now();
  const r = spawnSync(process.execPath, step.args, {
    cwd: step.cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const took = now() - t0;
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const code = r.status === null ? 1 : r.status;
  const ok = code === 0;

  results.push({ step, code, ok, took });

  // سطرِ جاری را با نتیجه جایگزین کن تا خروجی یک خطِ تمیز بشود
  console.log(`${ok ? '✔' : '✖'}  ${secs(took)}`);
  if (ok) {
    const line = lastMeaningful(out);
    if (line) console.log(`    ${line}`);
  } else {
    console.log(`    کدِ خروج ${code} — ${step.args.join(' ')}  (در ${step.cwd.replace(ROOT, '.')})`);
    if (r.error) console.log(`    ${r.error.message}`);
    if (step.hint && /Cannot find module|MODULE_NOT_FOUND/.test(out)) console.log(`    ${step.hint}`);
    const tail = out.split('\n').slice(-24);
    console.log('    ── آخرِ خروجی ──');
    for (const line of tail) console.log(`    ${line}`);
    if (!KEEP_GOING) {
      console.log('');
      console.log('✖ متوقف شد. برای دیدنِ حالِ بقیه: --keep-going');
      process.exit(code);
    }
  }
}

const bad = results.filter((r) => !r.ok);
console.log('');
if (bad.length === 0) {
  console.log(`✔ همه‌ی ${results.length} کار سبز — ${secs(results.reduce((a, r) => a + r.took, 0))}`);
  process.exit(0);
}
console.log(`✖ ${bad.length} از ${results.length} کار قرمز:`);
for (const { step, code } of bad) console.log(`    ${step.label} → کدِ خروج ${code}`);
process.exit(KEEP_GOING ? 1 : bad[0].code);
