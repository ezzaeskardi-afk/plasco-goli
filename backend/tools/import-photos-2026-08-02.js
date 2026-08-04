#!/usr/bin/env node
/* ============================================================
   import-photos-2026-08-02.js — واردکردنِ عکس‌های تحویلیِ ۱۲ مرداد ۱۴۰۵
   ------------------------------------------------------------
   مالک ۱۷ فایل در picture/products/raw-upload-2026-08-02 گذاشت. سه‌تایش
   تکراریِ بیت‌به‌بیت بود (دسته‌ی 23-19-00 کپیِ 23-18-50 است)، پس ۱۴ عکسِ
   یکتا داریم که روی هم ۸ کالای واقعی را نشان می‌دهند: شش عکسِ اول شش
   *رنگِ* یک ست آبکش‌اند نه شش کالا، و دو عکسِ دراور دو رنگ‌بندیِ یک دراور.

   چه می‌کند:
     ۱) هر عکس را از فراداده پاک می‌کند (lib/image-clean) و با نامِ فارسیِ
        بامعنا داخل picture/products می‌گذارد — همان قراردادی که چهار عکسِ
        فعلیِ سایت دارند.
     ۲) نسخه‌ی webp و دو عرضِ کوچک (۳۲۰w و ۵۶۰w) را با همان انکودر و همان
        کیفیتِ ۷۸ِ مسیرِ آپلود می‌سازد (lib/image-encode) تا خروجی با
        عکس‌های موجود یکسان باشد.
     ۳) هشت محصول را با published = 0 می‌سازد، همه در دسته‌ی
        photos-2026-08-02، پس با یک دستور کامل برمی‌گردند.

   قیمت‌ها: در نوبتِ اول همه صفر وارد شدند چون قیمتِ واقعی را فقط مالک
   می‌داند. بعد خودش گفت خودم بگذارم، پس گذاشتم — ولی نه با عددِ تصادفی.
   هر قیمت از روی *همان کاتالوگ* لنگر گرفته: کالای مشابهِ موجود در همان
   دسته پیدا شد و این یکی نسبت به آن قیمت خورد (استدلالِ تک‌تکشان کنارِ
   خودشان نوشته شده). عددِ واقعاً تصادفی، مثلاً ۴۹۰٬۰۰۰ برای یک جامایع،
   جوری غلط است که مشتری می‌بیند و می‌رود؛ عددِ لنگرخورده اگر هم دقیق
   نباشد، لااقل باورپذیر است و مالک با یک نگاه اصلاحش می‌کند.

   ⚠ این‌ها هنوز «قیمتِ مالک» نیستند، تخمینِ من‌اند. قبل از انتشار یک بار
   مرورشان کن. نگهبانِ انتشار (routes/admin.js) فقط جلوی قیمتِ *صفر* را
   می‌گیرد، نه قیمتِ اشتباه.

   old_price (قیمتِ قبلِ تخفیف) عمداً صفر ماند: عددِ ساختگی در آن خانه یعنی
   ادعای تخفیفی که هیچ‌وقت وجود نداشته، و این یک ادعای دروغ به مشتری است
   نه یک تخمین. تخفیف را باید مالک واقعاً بگذارد.

   ⚠ نکته‌ی حقوقی که مالک باید بداند: عکس‌های دسته‌های 23-18-45 و 23-18-50
   واترمارکِ www.iranplastic.net و برچسبِ برندِ Bazen دارند — یعنی عکسِ
   کاتالوگِ تأمین‌کننده‌اند، نه عکسِ خودِ مغازه. تا وقتی اجازه‌اش گرفته
   نشده نباید منتشر شوند؛ به همین دلیل هم همه پیش‌نویس وارد می‌شوند.

   دستورها:
     node tools/import-photos-2026-08-02.js --dry-run
     node tools/import-photos-2026-08-02.js
     node tools/import-photos-2026-08-02.js --set-prices   (قیمت/موجودیِ سطرهای موجود)
     node tools/import-photos-2026-08-02.js --rollback   (محصولات + فایل‌ها)

   پیام‌ها انگلیسی است چون CMD ویندوز فارسی را به‌هم می‌ریزد.
   ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const { stripImageMetadata } = require('../lib/image-clean');
const IMGENC = require('../lib/image-encode');
const { imageSizeFromFile } = require('../lib/imagesize');

const BATCH = 'photos-2026-08-02';
const RAW_DIR = path.join(__dirname, '..', '..', 'picture', 'products', 'raw-upload-2026-08-02');
const OUT_DIR = path.join(__dirname, '..', '..', 'picture', 'products');
const URL_BASE = '/picture/products/';

// مشخصاتِ مشترک، هم‌شکلِ همان چیزی که seed-catalog گذاشته تا جدولِ
// مشخصات در صفحه‌ی محصول بینِ کالاها یک‌دست بماند.
const MADE_IN = { k: 'ساخت', v: 'ایران' };

/* ------------------------------------------------------------
   نقشه‌ی عکس → کالا
   هر ورودی: عنوان، دسته، آیکونِ جانشین، توضیح، مشخصات، و لیستِ عکس‌ها.
   عکسِ اول کاور است؛ بقیه در گالریِ صفحه‌ی محصول می‌آیند.
   `from` نامِ فایلِ خام است و `as` نامِ فارسیِ مقصد (بدون پسوند).

   price/stock: تخمینِ لنگرخورده به کاتالوگ. کنارِ هر کدام نوشته‌ام از روی
   کدام کالای موجود لنگر گرفته، تا اگر کسی بعداً پرسید «این عدد از کجا
   آمد؟» جواب در خودِ فایل باشد نه در حافظه‌ی کسی.
   ------------------------------------------------------------ */
const ITEMS = [
  {
    title: 'ست آبکش سه عددی',
    category: 'لوازم آشپزخانه',
    icon: 'i-dishrack',
    badge: 'جدید',
    // لنگر: «آبکش بزرگ» تکی ۷۶٬۰۰۰ و «آبکش پایه‌دار مستطیل» ۱۱۲٬۰۰۰.
    // ست سه‌تاییِ تودرتو باید از یک آبکشِ تکی گران‌تر باشد ولی نه سه برابر
    // (ستِ تودرتو همیشه ارزان‌تر از جمعِ اجزاست) → ۱۴۵٬۰۰۰.
    price: 145000,
    stock: 40,
    description: 'سه آبکشِ تودرتو در سه اندازه؛ لبه‌ی دسته‌دار برای برداشتنِ راحت و بدنه‌ی مشبکِ ریز که برنج و حبوبات از آن رد نمی‌شود. تودرتو جا می‌گیرد، پس فضای کابینت را سه برابر نمی‌خواهد.',
    specs: [
      { k: 'تعداد', v: '۳ عدد (کوچک، متوسط، بزرگ)' },
      { k: 'رنگ‌بندی', v: 'سفید، سبز، طوسی، کرم، صورتی، آبی' },
      { k: 'جنس', v: 'پلی‌پروپیلن بهداشتی' },
      { k: 'قابل شست‌وشو', v: 'بله' },
      MADE_IN
    ],
    photos: [
      { from: 'photo_1_2026-08-02_23-18-37.jpg', as: 'ست آبکش سه عددی' },
      { from: 'photo_2_2026-08-02_23-18-37.jpg', as: 'ست آبکش سه عددی - سبز' },
      { from: 'photo_3_2026-08-02_23-18-37.jpg', as: 'ست آبکش سه عددی - طوسی' },
      { from: 'photo_4_2026-08-02_23-18-37.jpg', as: 'ست آبکش سه عددی - کرم' },
      { from: 'photo_5_2026-08-02_23-18-37.jpg', as: 'ست آبکش سه عددی - صورتی' },
      { from: 'photo_6_2026-08-02_23-18-37.jpg', as: 'ست آبکش سه عددی - آبی' }
    ]
  },
  {
    title: 'جاشامپویی آویز دو طبقه آینه‌دار',
    category: 'سبد و جالباسی',
    icon: 'i-basket',
    badge: '',
    // لنگر: «سبد توری دیواری آشپزخانه» ۹۶٬۰۰۰. این یکی قلابِ فلزی، دو
    // بادکش و آینه دارد، پس یک پله بالاتر → ۱۳۸٬۰۰۰.
    price: 138000,
    stock: 36,
    description: 'دو طبقه‌ی جادار با آینه‌ی کوچکِ ثابت روی طبقه‌ی بالا؛ با قلابِ فلزی از رگالِ دوش آویزان می‌شود و دو بادکشِ پشتی جلوی تاب‌خوردنش را می‌گیرد. کفِ طبقه‌ها آبِ شامپو را نگه نمی‌دارد.',
    specs: [
      { k: 'طبقه', v: '۲' },
      { k: 'آینه', v: 'دارد' },
      { k: 'نصب', v: 'آویز روی رگال + ۲ بادکش' },
      { k: 'جنس', v: 'پلی‌پروپیلن مقاوم با پایه‌ی فلزی' },
      MADE_IN
    ],
    photos: [{ from: 'photo_1_2026-08-02_23-18-45.jpg', as: 'جاشامپویی آویز دو طبقه آینه‌دار' }]
  },
  {
    title: 'جاشامپویی آویز سه طبقه آینه‌دار',
    category: 'سبد و جالباسی',
    icon: 'i-basket',
    badge: '',
    // همان کالا با یک طبقه‌ی بیشتر. اختلافِ قیمتش با مدلِ دو طبقه باید
    // کوچک و منطقی باشد، چون کنارِ هم در یک صفحه دیده می‌شوند → ۱۶۵٬۰۰۰.
    price: 165000,
    stock: 32,
    description: 'همان جاشامپوییِ آویز با یک طبقه‌ی بیشتر؛ برای حمامی که شامپو و صابون و لوازمِ اصلاحِ چند نفر را با هم جا می‌دهد. آینه‌ی طبقه‌ی بالا ثابت است و بخار روی آن کمتر می‌نشیند.',
    specs: [
      { k: 'طبقه', v: '۳' },
      { k: 'آینه', v: 'دارد' },
      { k: 'نصب', v: 'آویز روی رگال + ۲ بادکش' },
      { k: 'جنس', v: 'پلی‌پروپیلن مقاوم با پایه‌ی فلزی' },
      MADE_IN
    ],
    photos: [{ from: 'photo_2_2026-08-02_23-18-45.jpg', as: 'جاشامپویی آویز سه طبقه آینه‌دار' }]
  },
  {
    title: 'آبچکان ظرف رومیزی با سینی آبگیر',
    category: 'لوازم آشپزخانه',
    icon: 'i-dishrack',
    badge: '',
    // نزدیک‌ترین لنگرِ کاتالوگ: id ۱۱ «آبچکان ظرف‌شویی رومیزی» ۱۴۰٬۰۰۰
    // (منتشرشده) و id ۳۱ «آبچکان دو طبقه استیل‌نما» ۳۴۰٬۰۰۰. این یکی
    // تک‌طبقه است ولی سینیِ آبگیر دارد، پس کمی بالای id ۱۱ → ۱۵۸٬۰۰۰.
    price: 158000,
    stock: 28,
    description: 'شیارهای جداگانه برای بشقاب، جای ایستاده‌ی قاشق و چنگال، و سینیِ زیرین که آب را جمع می‌کند و از گوشه‌اش داخل سینک می‌ریزد — پس کانتر خیس نمی‌ماند.',
    specs: [
      { k: 'سینی آبگیر', v: 'دارد' },
      { k: 'جای قاشق و چنگال', v: 'دارد' },
      { k: 'جنس', v: 'پلی‌پروپیلن بهداشتی' },
      { k: 'قابل شست‌وشو', v: 'بله' },
      MADE_IN
    ],
    photos: [{ from: 'photo_3_2026-08-02_23-18-45.jpg', as: 'آبچکان ظرف رومیزی با سینی آبگیر' }]
  },
  {
    title: 'جامایع دستشویی پمپی طرح شیاردار',
    category: 'لوازم نظافت',
    icon: 'i-bucket',
    badge: '',
    // کوچک‌ترین کالای این نوبت. لنگر: «ست اسپری‌پاش و سبد شوینده»
    // ۷۶٬۰۰۰ که چند تکه است؛ یک جامایعِ تکی باید زیرِ آن بنشیند → ۶۵٬۰۰۰.
    price: 65000,
    stock: 70,
    description: 'پمپِ فلزی‌رنگ با یک فشار مایع را بیرون می‌دهد و قطره‌چکان ندارد؛ بدنه‌ی شیاردار حتی با دستِ خیس هم لیز نمی‌خورد. اندازه‌اش برای گوشه‌ی روشوییِ خانگی است.',
    specs: [
      { k: 'نوع', v: 'پمپی' },
      { k: 'جنس بدنه', v: 'پلی‌پروپیلن' },
      { k: 'قابل شست‌وشو', v: 'بله' },
      MADE_IN
    ],
    photos: [{ from: 'photo_4_2026-08-02_23-18-45.jpg', as: 'جامایع دستشویی پمپی طرح شیاردار' }]
  },
  {
    title: 'چوب‌لباسی ست سه عددی',
    category: 'سبد و جالباسی',
    icon: 'i-hanger',
    badge: '',
    // لنگر: «چوب‌لباسی ست ۱۰ عددی» ۹۲٬۰۰۰ (دانه‌ای ۹٬۲۰۰، یعنی مدلِ ساده)
    // و «مخمل‌نما ست ۶ عددی» ۱۲۸٬۰۰۰ (دانه‌ای ۲۱٬۳۰۰). این یکی میله‌ی
    // شلوار و دو قلاب دارد، پس دانه‌ای گران‌تر از هر دو → ۳ × ۲۸٬۰۰۰.
    price: 84000,
    stock: 55,
    description: 'شانه‌ی پهن که جای شانه‌ی لباس را گود نمی‌کند، میله‌ی پایین برای شلوار، و دو قلابِ کناری برای بندِ تاپ و کیف. سه‌تایی عرضه می‌شود.',
    specs: [
      { k: 'تعداد', v: '۳ عدد' },
      { k: 'میله‌ی شلوار', v: 'دارد' },
      { k: 'قلاب کناری', v: '۲ عدد در هر چوب‌لباسی' },
      { k: 'جنس', v: 'پلی‌پروپیلن مقاوم' },
      MADE_IN
    ],
    photos: [{ from: 'photo_5_2026-08-02_23-18-45.jpg', as: 'چوب لباسی ست سه عددی' }]
  },
  {
    title: 'دراور چهار کشو طرح حصیری',
    category: 'ظروف نگهداری',
    icon: 'i-box',
    badge: '',
    // بزرگ‌ترین و گران‌ترین کالای این نوبت. لنگر: «باکس درب‌دار ۵۰ لیتری»
    // ۳۸۵٬۰۰۰ و «ظرف برنج ۲۰ کیلویی چرخ‌دار» ۴۹۵٬۰۰۰ (سقفِ دسته). یک
    // دراورِ چهار کشوی کامل از هر دو بزرگ‌تر است ولی نباید از سقفِ دسته
    // خیلی بزند بیرون → ۵۸۰٬۰۰۰. موجودیِ کم چون کالای حجیمی است.
    price: 580000,
    stock: 12,
    description: 'چهار کشوی کاملاً بیرون‌کشیدنی با رویه‌ی طرحِ حصیر؛ برای اتاقِ خواب و اتاقِ کودک که کمدِ چوبی جا نمی‌شود. بدون پیچ و مهره سوار می‌شود و در دو رنگ‌بندی موجود است.',
    specs: [
      { k: 'تعداد کشو', v: '۴' },
      { k: 'رنگ‌بندی', v: 'بدنه قهوه‌ای با کشوی کرم، یا بدنه کرم با کشوی قهوه‌ای' },
      { k: 'مونتاژ', v: 'بدون ابزار' },
      { k: 'جنس', v: 'پلی‌پروپیلن تقویت‌شده' },
      MADE_IN
    ],
    photos: [
      { from: 'photo_1_2026-08-02_23-18-50.jpg', as: 'دراور چهار کشو طرح حصیری' },
      { from: 'photo_2_2026-08-02_23-18-50.jpg', as: 'دراور چهار کشو طرح حصیری - کرم' }
    ]
  },
  {
    title: 'ست تشت و کاسه چهار عددی',
    category: 'تشت و لگن',
    icon: 'i-tub',
    badge: '',
    // نزدیک‌ترین لنگر: id ۸۸ «ست کاسه و لگن ۴ عددی» ۱۱۲٬۰۰۰ — تقریباً
    // همین کالاست. «ست سطل و تشت ۳ عددی» هم ۱۷۸٬۰۰۰. بینِ این دو، کمی
    // بالای id ۸۸ چون دستگیره‌دار و شیاردار است → ۱۳۵٬۰۰۰.
    price: 135000,
    stock: 34,
    description: 'چهار ظرف در چهار اندازه با بدنه‌ی شیاردار و دو دستگیره‌ی کناری؛ از شستنِ سبزی و میوه تا خیساندنِ حبوبات. تودرتو جا می‌گیرد.',
    specs: [
      { k: 'تعداد', v: '۴ عدد' },
      { k: 'دستگیره', v: '۲ عدد در هر ظرف' },
      { k: 'جنس', v: 'پلی‌اتیلن ضخیم' },
      MADE_IN
    ],
    photos: [{ from: 'photo_3_2026-08-02_23-18-50.jpg', as: 'ست تشت و کاسه چهار عددی' }]
  }
];

/* ---------- ساختنِ فایل‌ها ---------- */

// انکودرِ همگام: اینجا ابزارِ خطِ فرمان است و کسی منتظرِ پاسخِ HTTP نیست،
// پس spawnSync مجاز است (همان استدلالِ tools/optimize-images.js).
function makeVariants(absJpg, enc) {
  const made = [];
  if (!enc) return made;
  const run = (dst, w) =>
    cp.spawnSync(enc.cmd, enc.args(absJpg, dst, w), { stdio: 'ignore' }).status === 0
    && fs.existsSync(dst) && fs.statSync(dst).size > 0;

  const dim = imageSizeFromFile(absJpg);
  const srcSize = fs.statSync(absJpg).size;

  // عرضِ هدف فقط وقتی داده می‌شود که عکس از MAX_EDGE بزرگ‌تر باشد —
  // وگرنه cwebp عکسِ کوچک را *بزرگ* می‌کند. دلیلِ کامل در image-encode.js.
  const clamp = (dim && dim.width > IMGENC.MAX_EDGE) ? IMGENC.MAX_EDGE : 0;
  const full = IMGENC.webpPathFor(absJpg);
  if (run(full, clamp)) {
    if (fs.statSync(full).size < srcSize) made.push(path.basename(full));
    else fs.unlinkSync(full);           // webp سنگین‌تر از اصل، به دردی نمی‌خورد
  }
  for (const s of IMGENC.SMALL_SIZES) {
    if (dim && dim.width < s.minSource) continue;
    const out = IMGENC.smallPathFor(absJpg, s.w);
    if (run(out, s.w)) made.push(path.basename(out));
  }
  return made;
}

// همه‌ی فایل‌هایی که این ابزار می‌سازد — برای rollback و برای dry-run
function outputsFor(item) {
  const list = [];
  for (const ph of item.photos) {
    list.push(`${ph.as}.jpg`, `${ph.as}.webp`, `${ph.as}-320w.webp`, `${ph.as}-560w.webp`);
  }
  return list;
}

/* ------------------------------------------------------------
   --set-prices : قیمت و موجودیِ ITEMS را روی سطرهای *قبلاً واردشده*
   می‌نشاند. لازم شد چون نوبتِ اول با قیمتِ صفر وارد شد و بعد قرار شد
   پر شود؛ بدونِ این باید یا دستی در پنل هشت‌بار تکرار می‌شد یا کلِ
   دسته rollback و دوباره وارد می‌شد (که فایل‌ها را بی‌دلیل بازمی‌سازد).

   از adminUpdateProduct استفاده می‌کند نه UPDATEِ خام، تا title_norm و
   title_fold و updated_at همان‌طور تازه شوند که مسیرِ پنل تازه می‌کند —
   updated_at بخشی از امضای کاتالوگ است و اگر عقب بماند مرورگرها قیمتِ
   قدیم را از کش نشان می‌دهند.

   images و specs از دیتابیس رشته‌ی JSON برمی‌گردند ولی adminUpdateProduct
   خودش stringify می‌کند، پس باید اول parse شوند وگرنه دوبار انکود می‌شوند
   و گالری و جدولِ مشخصات خالی می‌شود. (همان کاری که routes/admin.js با
   parseArr می‌کند.)
   ------------------------------------------------------------ */
function setPrices(db, dry) {
  const parseArr = (s) => {
    if (Array.isArray(s)) return s;
    try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
  };
  const rows = db.getProducts().filter(p => p.import_batch === BATCH);
  const byTitle = new Map(rows.map(p => [p.title, p]));

  let done = 0;
  const missing = [];
  for (const it of ITEMS) {
    const row = byTitle.get(it.title);
    if (!row) { missing.push(it.title); continue; }
    console.log(
      `  ${String(row.id).padStart(3)}  price ${String(row.price).padStart(7)} -> ${String(it.price).padStart(7)}` +
      `   stock ${String(row.stock).padStart(3)} -> ${String(it.stock).padStart(3)}   ${it.title}`
    );
    if (dry) continue;
    const ok = db.adminUpdateProduct({
      id: row.id,
      title: row.title, category: row.category, description: row.description,
      icon: row.icon, badge: row.badge, image: row.image,
      images: parseArr(row.images), specs: parseArr(row.specs),
      price: it.price, stock: it.stock,
      // old_price دست‌نخورده می‌ماند (صفر است) — تخفیفِ ساختگی نمی‌سازیم.
      old_price: Number(row.old_price) || 0
    });
    if (ok) done++; else console.log(`  FAILED to update id ${row.id}`);
  }

  if (missing.length) {
    console.log('\nWARNING: no row found for these titles (batch out of sync with this file):');
    for (const m of missing) console.log('  ' + m);
  }
  if (dry) { console.log('\nDry run: nothing was written.'); return; }
  console.log(`\nUpdated ${done}/${ITEMS.length} product(s).`);
  console.log('These prices are MY estimates anchored to the existing catalog, not the owner\'s.');
  console.log('Review them before publishing - the publish guard only blocks zero, not wrong.');
}

function main() {
  const args = process.argv.slice(2);
  const dry = args.includes('--dry-run');
  const rollback = args.includes('--rollback');
  const force = args.includes('--force');
  const prices = args.includes('--set-prices');

  const db = require('../lib/db');
  const existing = db.getDraftSummary().batches.find(b => b.batch === BATCH);
  const have = existing ? existing.n : 0;

  if (prices) {
    if (!have) { console.log(`Batch "${BATCH}" is not in the database. Import it first.`); process.exitCode = 1; return; }
    console.log(`Setting price and stock on batch "${BATCH}":`);
    setPrices(db, dry);
    return;
  }

  if (rollback) {
    if (!have) { console.log(`Nothing to roll back: batch "${BATCH}" is not in the database.`); return; }
    const sold = db.batchHasOrders(BATCH);
    if (sold) {
      console.log(`REFUSED: ${sold} product(s) in batch "${BATCH}" already appear in orders.`);
      console.log('Deleting them would break order history. Unpublish them instead.');
      process.exitCode = 1; return;
    }
    const n = db.deleteBatch(BATCH);
    let files = 0;
    for (const it of ITEMS) for (const f of outputsFor(it)) {
      const p = path.join(OUT_DIR, f);
      if (fs.existsSync(p)) { fs.unlinkSync(p); files++; }
    }
    console.log(`Rolled back: ${n} product(s) and ${files} image file(s) removed.`);
    console.log('The originals in raw-upload-2026-08-02 were not touched.');
    return;
  }

  if (have && !force) {
    console.log(`Batch "${BATCH}" already exists with ${have} product(s). Nothing to do.`);
    console.log('Use --rollback to remove it first.');
    return;
  }

  // هیچ‌چیز ننویس تا مطمئن شوی همه‌ی ورودی‌ها سرِ جایشان هستند: واردکردنِ
  // نصفه بدترین حالت است چون نه کامل است نه برگشت‌پذیرِ تمیز.
  const missing = [];
  for (const it of ITEMS) for (const ph of it.photos) {
    if (!fs.existsSync(path.join(RAW_DIR, ph.from))) missing.push(ph.from);
  }
  if (missing.length) {
    console.log('ABORTED: these source files are missing:');
    for (const m of missing) console.log('  ' + m);
    process.exitCode = 1; return;
  }

  const enc = IMGENC.pickEncoder();
  const nPhotos = ITEMS.reduce((n, it) => n + it.photos.length, 0);
  console.log(`Plan: ${ITEMS.length} DRAFT products (published = 0), batch "${BATCH}".`);
  console.log(`      ${nPhotos} photo(s) -> ${OUT_DIR}`);
  console.log(`      encoder: ${enc ? enc.name : 'NONE (webp variants will be skipped)'}`);
  for (const it of ITEMS) {
    console.log(`  ${String(it.photos.length).padStart(2)} img  ${it.category.padEnd(16)}  ${it.title}`);
  }
  if (dry) { console.log('\nDry run: nothing was written.'); return; }

  let ok = 0, variants = 0, stripped = 0;
  for (const it of ITEMS) {
    const urls = [];
    for (const ph of it.photos) {
      const src = path.join(RAW_DIR, ph.from);
      const dst = path.join(OUT_DIR, `${ph.as}.jpg`);
      // فراداده (GPS، مدلِ دوربین، تاریخ) قبل از رفتن روی وب پاک می‌شود.
      const clean = stripImageMetadata(fs.readFileSync(src), '.jpg');
      fs.writeFileSync(dst, clean.buf);
      stripped += clean.removed;
      variants += makeVariants(dst, enc).length;
      urls.push(URL_BASE + encodeURIComponent(`${ph.as}.jpg`));
    }
    try {
      db.adminCreateProduct({
        category: it.category, title: it.title, description: it.description,
        icon: it.icon, badge: it.badge,
        // قیمت تخمینِ لنگرخورده است (توضیحش بالای فایل)، old_price عمداً صفر.
        price: it.price, old_price: 0, stock: it.stock,
        image: urls[0], images: urls.slice(1),
        specs: it.specs, published: 0, import_batch: BATCH
      });
      ok++;
    } catch (e) {
      console.log(`  FAILED "${it.title}": ${e.message}`);
    }
  }

  console.log(`\nDone: ${ok}/${ITEMS.length} drafts inserted, ${variants} webp variant(s) built.`);
  console.log(`Metadata stripped: ${stripped} byte(s).`);
  console.log(`Catalog total: ${db.getProducts().length}  |  visible on site: ${db.getPublicProducts().length}`);
  console.log('\nNext, in the admin panel: REVIEW the estimated price of each, then publish.');
  console.log('Prices are anchored guesses, not the owner\'s numbers. The publish guard in');
  console.log('routes/admin.js only blocks a ZERO price, not a wrong one.');
  console.log('NOTE: photos from batches 23-18-45 and 23-18-50 carry a www.iranplastic.net');
  console.log('      watermark and Bazen branding. Get permission before publishing them.');
}

main();
