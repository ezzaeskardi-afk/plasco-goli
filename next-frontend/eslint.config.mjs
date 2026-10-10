import { FlatCompat } from "@eslint/eslintrc";

// اسکریپتِ قبلی «next lint» بود ولی هیچ کانفیگی وجود نداشت: اولین اجرا
// تعاملی می‌شد («آیا ESLint نصب شود؟») و در CI می‌شکست. ضمناً next lint
// از Next 15.5 منسوخ شده است؛ مستقیم ESLint اجرا می‌کنیم.
const compat = new FlatCompat();

const eslintConfig = [
  {
    // `tests/fixtures/**` عمداً در فهرست است: آن‌ها **متنِ تاریخیِ فروشگاهِ Express**
    // هستند (کپیِ بایت‌به‌بایتِ پیش از حذفِ `frontend/`) که نگهبان‌های برابری به‌عنوانِ
    // مرجع می‌خوانند. سورسِ ما نیستند، ویرایش هم نمی‌شوند — لینت‌کردنشان فقط ۳۲
    // هشدارِ بی‌ربط تولید می‌کند و دردِ «۰ هشدار» را بی‌اعتبار می‌کند.
    ignores: [".next/**", "node_modules/**", "out/**", "next-env.d.ts", "tests/fixtures/**"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
