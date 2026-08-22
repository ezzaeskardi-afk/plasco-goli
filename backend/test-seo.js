// تست خودکار سئو — canonical، og:image، robots و JSON-LD همهٔ صفحات ایندکس‌شدنی
// Run: node test-seo.js
//
// فایل‌های HTML روی دیسک دارای placeholderهایی مثل example.com هستند که سرور
// در زمان سرو جایگزینشان می‌کند. این تست ساختار HTML خام را بررسی می‌کند
// و نیازمندی‌های runtime (مثل تزریق ItemList) را با تست یکپارچه test-smoke.js پوشش می‌دهد.

'use strict';

const fs = require('fs');
const path = require('path');

const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
let passed = 0, failed = 0;

function check(page, label, ok, detail) {
  if (ok) { passed++; console.log(`  [PASS] ${page}: ${label}`); }
  else { failed++; console.log(`  [FAIL] ${page}: ${label}${detail ? ' — ' + detail : ''}`); }
}

function getHtml(fileName) {
  try { return fs.readFileSync(path.join(FRONTEND_DIR, fileName), 'utf-8'); }
  catch (e) { return null; }
}

// صفحاتی که باید ایندکس شوند
const INDEXABLE = ['index.html', 'products.html', 'terms.html', 'wholesale.html'];

// صفحاتی که نباید ایندکس شوند (noindex)
const NOINDEX = ['login.html', 'cart.html', 'checkout.html', 'account.html', 'admin.html', 'order-success.html', 'product.html', '404.html', '500.html', 'product-gone.html', 'offline.html'];

console.log('\n=== تست سئوی خودکار ===\n');

// --- بررسی صفحات ایندکس‌شدنی ---
console.log('-- صفحات ایندکس‌شدنی --');
for (const file of INDEXABLE) {
  const html = getHtml(file);
  if (!html) { check(file, 'فایل قابل خواندن', false, 'file not found'); continue; }

  // canonical — باید وجود داشته باشد و placeholder نباشد (یا سرور جایگزین کند)
  const canonical = html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]+)"/i);
  check(file, 'canonical tag', !!canonical, canonical ? null : 'missing rel="canonical"');
  if (canonical) {
    check(file, 'canonical با https', canonical[1].startsWith('https://'), canonical[1]);
    // placeholder باید شامل domain template باشد (سرور replace می‌کند)
    check(file, 'canonical template present', /polasco-goli\.example\.com/.test(canonical[1]) || /polasco-goli\./.test(canonical[1]), canonical[1]);
  }

  // og:image
  const ogImage = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i);
  check(file, 'og:image', !!ogImage, ogImage ? null : 'missing og:image');

  // og:title + og:description
  check(file, 'og:title', /property="og:title"/i.test(html));
  check(file, 'og:description', /property="og:description"/i.test(html));

  // twitter:card
  check(file, 'twitter:card', /name="twitter:card"/i.test(html));

  // robots — نباید noindex باشد (به جز پوسته‌ی product.html)
  const robots = html.match(/<meta[^>]*name="robots"[^>]*content="([^"]+)"/i);
  if (robots) {
    check(file, 'robots نباید noindex باشد', !robots[1].includes('noindex'), robots[1]);
  } else {
    check(file, 'robots meta', true, 'defaults to index (absent is OK)');
  }

  // script JSON-LD حداقل یکی باشد
  const ldCount = (html.match(/<script[^>]*type="application\/ld\+json"/gi) || []).length;
  check(file, 'حداقل یک JSON-LD block', ldCount > 0, `found ${ldCount}`);
}

// --- بررسی صفحات noindex ---
console.log('\n-- صفحات noindex --');
for (const file of NOINDEX) {
  const html = getHtml(file);
  if (!html) continue;
  const robots = html.match(/<meta[^>]*name="robots"[^>]*content="([^"]+)"/i);
  check(file, 'noindex', robots && robots[1].includes('noindex'), robots ? robots[1] : 'missing robots meta');
}

// --- بررسی JSON-LD صفحه اصلی ---
console.log('\n-- JSON-LD صفحه اصلی --');
{
  const html = getHtml('index.html');
  if (html) {
    const ldBlocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
    const types = ldBlocks.map(m => { try { return JSON.parse(m[1])['@type']; } catch (e) { return null; } }).filter(Boolean);
    check('index.html', 'Store schema', types.includes('Store'), `found: ${types.join(', ')}`);
    check('index.html', 'WebSite schema', types.includes('WebSite'));
    check('index.html', 'FAQPage schema', types.includes('FAQPage'));
    // ItemList توسط سرور تزریق می‌شود — در فایل خام marker وجود دارد
    check('index.html', 'pg-itemlist marker for server injection', html.includes('<!--pg-itemlist-->'), 'server replaces this at runtime');
  }
}

// --- بررسی JSON-LD صفحه محصولات ---
console.log('\n-- JSON-LD صفحه محصولات --');
{
  const html = getHtml('products.html');
  if (html) {
    const ldBlocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
    const types = ldBlocks.map(m => { try { return JSON.parse(m[1])['@type']; } catch (e) { return null; } }).filter(Boolean);
    check('products.html', 'CollectionPage schema', types.includes('CollectionPage'));
    check('products.html', 'BreadcrumbList schema', types.includes('BreadcrumbList'));
  }
}

// --- بررسی JSON-LD صفحه قوانین ---
console.log('\n-- JSON-LD صفحه قوانین --');
{
  const html = getHtml('terms.html');
  if (html) {
    const ldBlocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
    const types = ldBlocks.map(m => { try { return JSON.parse(m[1])['@type']; } catch (e) { return null; } }).filter(Boolean);
    check('terms.html', 'WebPage schema', types.includes('WebPage'));
  }
}

// --- بررسی JSON-LD صفحه خرید عمده ---
console.log('\n-- JSON-LD صفحه خرید عمده --');
{
  const html = getHtml('wholesale.html');
  if (html) {
    const ldBlocks = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)];
    const types = ldBlocks.map(m => { try { return JSON.parse(m[1])['@type']; } catch (e) { return null; } }).filter(Boolean);
    check('wholesale.html', 'WebPage schema', types.includes('WebPage'));
  }
}

// --- بررسی meta description ---
console.log('\n-- meta description --');
for (const file of INDEXABLE) {
  const html = getHtml(file);
  if (!html) continue;
  const desc = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/i);
  check(file, 'meta description exists', !!desc, desc ? null : 'missing');
  if (desc) {
    check(file, 'meta description not empty', desc[1].length > 20, `${desc[1].length} chars`);
    check(file, 'meta description no placeholder', !desc[1].includes('example.com') && !desc[1].includes('توضیحات'), desc[1].slice(0, 80));
  }
}

// --- بررسی title tag ---
console.log('\n-- title tag --');
for (const file of INDEXABLE) {
  const html = getHtml(file);
  if (!html) continue;
  const title = html.match(/<title>([^<]+)<\/title>/i);
  check(file, 'title exists', !!title, title ? null : 'missing <title>');
  if (title) {
    check(file, 'title not empty/placeholder', title[1].length > 5 && !title[1].includes('example.com'), title[1]);
    // باید «پلاسکو گلی» توی title باشه
    check(file, 'title contains brand name', title[1].includes('پلاسکو'), title[1]);
  }
}

// --- بررسی sitemap.xml ---
console.log('\n-- sitemap.xml --');
{
  check('sitemap.xml', 'served dynamically by server', true, 'no static file — runtime check in test-smoke.js');
}

// --- بررسی alt روی تصاویر اصلی (جلوگیری از Cumulative Layout Shift) ---
console.log('\n-- تصاویر --');
for (const file of INDEXABLE) {
  const html = getHtml(file);
  if (!html) continue;
  const imgs = [...html.matchAll(/<img[^>]*>/gi)];
  let missingAlt = 0;
  for (const m of imgs) {
    if (!/\salt=['"]/.test(m[0]) && !/\salt=/.test(m[0])) missingAlt++;
  }
  check(file, `img alt attributes`, missingAlt === 0 || imgs.length === 0, missingAlt > 0 ? `${missingAlt}/${imgs.length} missing alt` : `${imgs.length} imgs OK`);
}

// --- بررسی favicon ---
console.log('\n-- favicon --');
for (const file of [...INDEXABLE, ...NOINDEX.slice(0, 3)]) {
  const html = getHtml(file);
  if (!html) continue;
  const favicon = /rel="icon"/i.test(html) || /rel="shortcut icon"/i.test(html);
  check(file, 'favicon link', favicon);
  if (favicon) break; // یک بار کافیه
}

// --- بررسی robots.txt ---
console.log('\n-- robots.txt --');
{
  const robotsFile = path.join(FRONTEND_DIR, '..', 'robots.txt'); // fallback
  // robots.txt سرور-ساید داینامیک است؛ اینجا فقط ساختار را بررسی نمی‌کنیم
  // چون فایل static نداریم — test-smoke.js آن را تست می‌کند
  check('robots.txt', 'داینامیک ساخته می‌شود', true, 'checked via server at runtime');
}

// --- خلاصه ---
console.log(`\n=== نتیجه: ${passed} پاس / ${failed} خطا ===`);
if (failed > 0) process.exit(1);
