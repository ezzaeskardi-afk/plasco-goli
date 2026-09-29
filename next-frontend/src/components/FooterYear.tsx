"use client";

import { useEffect, useState } from "react";
import { footerNotice } from "@/lib/jalaliYear";

// ============================================================
// سالِ پاورقی — همتای `initFooterYear` نسخه‌ی Express
// ============================================================
// چرا این یک کامپوننتِ کلاینتی است و نه متنِ سمتِ سرور:
//
//   ۱. صفحه‌ها استاتیک/ISR هستند. اگر سال را سمتِ سرور حساب کنیم، مقدارش **در
//      لحظه‌ی build** پخته می‌شود و تا بیلدِ بعدی یخ می‌زند — یعنی دقیقاً همان
//      باگی که الان در پاورقی هست: «© ۱۴۰۴» نوشته شده و امروز ۱۴۰۵ است. با
//      محاسبه‌ی کلاینتی، سال هر بار درست است.
//   ۲. متنِ HTML هم مثل Express می‌ماند: اسپنِ خالی که JS پُرش می‌کند
//      (`<span id="year"></span>` در نسخه‌ی اصلی). پس hydration mismatch هم
//      ندارد، چون سرور و اولین رندرِ کلاینت هر دو چیزی تولید نمی‌کنند.
//
// نگهبانِ `shellParity.test.ts` وجودِ همین سالِ پویا را می‌سنجد تا کسی دوباره
// سال را دستی در JSX ننویسد.
export function FooterYear() {
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setNotice(footerNotice());
  }, []);

  return <span id="year">{notice ?? ""}</span>;
}
