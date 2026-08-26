import { FlatCompat } from "@eslint/eslintrc";

// اسکریپتِ قبلی «next lint» بود ولی هیچ کانفیگی وجود نداشت: اولین اجرا
// تعاملی می‌شد («آیا ESLint نصب شود؟») و در CI می‌شکست. ضمناً next lint
// از Next 15.5 منسوخ شده است؛ مستقیم ESLint اجرا می‌کنیم.
const compat = new FlatCompat();

const eslintConfig = [
  {
    ignores: [".next/**", "node_modules/**", "out/**", "next-env.d.ts"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];

export default eslintConfig;
