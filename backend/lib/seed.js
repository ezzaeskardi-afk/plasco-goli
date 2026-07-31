// این لیست اول‌بار که سرور اجرا می‌شه توی data/products.json ذخیره می‌شه.
// برای عوض کردن قیمت‌ها یا اضافه‌کردن محصول، همون فایل data/products.json رو
// می‌شه مستقیم ویرایش کرد (سرور رو یک بار ری‌استارت کنید تا تغییرات لود بشه).
//
// فیلد image اختیاریه: اگه باشه عکس واقعی نشون داده می‌شه، اگه نباشه آیکون (icon).
// عکس‌ها از پوشه‌ی picture/products سرو می‌شن.

module.exports = [
  { id: 1, category: 'ظروف نگهداری', icon: 'i-bucket', image: encodeURI('/picture/products/سطل شیاردار درب چوبی 3 لیتر.jpg'), title: 'سطل شیاردار درب چوبی ۳ لیتر', description: 'بدنه‌ی شیاردار شیک با درب چوبی، مناسب نگهداری حبوبات و خشکبار.', price: 248000, badge: 'جدید', stock: 25 },
  { id: 2, category: 'لوازم آشپزخانه', icon: 'i-dishrack', image: encodeURI('/picture/products/کاسه سرو پایه چوبی 2 لیتر.jpg'), title: 'کاسه سرو پایه چوبی ۲ لیتر', description: 'کاسه‌ی سرو با پایه‌ی چوبی زیبا، مناسب پذیرایی و سالاد.', price: 315000, badge: 'پرفروش', stock: 18 },
  { id: 3, category: 'لوازم آشپزخانه', icon: 'i-box', image: encodeURI('/picture/products/ست ادویه گردان 8 عددی چوبی.jpg'), title: 'ست ادویه گردان ۸ عددی چوبی', description: 'ست کامل ادویه با پایه‌ی گردان چوبی؛ دسترسی سریع، آشپزخانه‌ی مرتب.', price: 689000, badge: '', stock: 12 },
  { id: 4, category: 'ظروف نگهداری', icon: 'i-box', image: encodeURI('/picture/products/جعبه چوبی فانتزی.jpg'), title: 'جعبه چوبی فانتزی', description: 'جعبه‌ی فانتزی با طرح چوب، مناسب نظم‌دهی و دکور خانه.', price: 198000, badge: 'تخفیف', stock: 30 },
  { id: 5, category: 'تشت و لگن', icon: 'i-tub', title: 'تشت پلاستیکی بزرگ ۵۰ لیتری', description: 'جنس ضخیم و مقاوم، مناسب شست‌وشو و نگهداری، در چند رنگ.', price: 185000, badge: '', stock: 24 },
  { id: 6, category: 'صندلی و میز', icon: 'i-chair', title: 'صندلی پلاستیکی تاشو', description: 'سبک، محکم و قابل جمع‌شدن؛ مناسب حیاط، آشپزخانه و مهمانی.', price: 240000, badge: '', stock: 18 },
  { id: 7, category: 'لوازم نظافت', icon: 'i-bucket', title: 'سطل زباله پدالی بزرگ', description: 'درب اتوماتیک، بدون لمس دست، مناسب آشپزخانه و حمام.', price: 165000, badge: 'تخفیف', stock: 30 },
  { id: 8, category: 'ظروف نگهداری', icon: 'i-box', title: 'باکس نگهداری مواد غذایی (۵ عددی)', description: 'درب‌دار و آب‌بندی شده، مناسب یخچال و فریزر.', price: 210000, badge: '', stock: 40 },
  { id: 9, category: 'سبد و جالباسی', icon: 'i-basket', title: 'سبد لباس چرخ‌دار', description: 'جادار، سبک و قابل جابه‌جایی؛ مناسب رخت‌شویی خانه.', price: 195000, badge: '', stock: 15 },
  { id: 10, category: 'سبد و جالباسی', icon: 'i-hanger', title: 'جالباسی دیواری پلاستیکی', description: 'نصب آسان، فضای کم‌اشغال، مناسب راهرو و اتاق بچه.', price: 98000, badge: '', stock: 50 },
  { id: 11, category: 'لوازم آشپزخانه', icon: 'i-dishrack', title: 'آبچکان ظرف‌شویی رومیزی', description: 'طراحی جادار با سینی جمع‌کننده‌ی آب، تمیز و مرتب.', price: 140000, badge: '', stock: 22 },
  { id: 12, category: 'صندلی و میز', icon: 'i-table', title: 'میز عسلی پلاستیکی', description: 'سبک و مقاوم در برابر آب، مناسب حیاط و بالکن.', price: 275000, badge: '', stock: 10 }
];
