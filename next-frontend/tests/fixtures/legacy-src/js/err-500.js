// err-500.js — ثانیه‌شمار «تلاش دوباره» در صفحه‌ی خطای سرور
//
// چرا فایل جداست و درون‌خطی نیست: سیاست امنیت محتوا (CSP) سایت
// `script-src 'self'` است، یعنی هیچ اسکریپت درون‌خطی اجرا نمی‌شود. این کد قبلاً
// داخل خودِ 500.html بود و مرورگر بی‌صدا بلاکش می‌کرد — و چون هم غیرفعال‌کردن
// دکمه و هم شنونده‌ی کلیک در همان کد بود، دکمه‌ی «تلاش دوباره» عملاً مرده بود.
//
// حالا دکمه یک لینک با href خالی است: بدون جاوااسکریپت هم همان آدرس را دوباره
// بار می‌کند. این فایل تنها یک لایه‌ی اضافه است — چند ثانیه صبر تا به سروری که
// همین حالا به مشکل خورده فرصت نفس کشیدن بدهیم.
(function () {
  var link = document.getElementById('btnRetry');
  var label = document.getElementById('retryLabel');
  if (!link || !label) return;

  var FA = '۰۱۲۳۴۵۶۷۸۹';
  var fa = function (n) { return String(n).replace(/[0-9]/g, function (d) { return FA[+d]; }); };
  var left = 5;
  var locked = true;

  // تا پایان شمارش، کلیک و Enter هر دو بی‌اثرند. از aria-disabled استفاده می‌کنیم
  // نه صفت disabled، چون این المان لینک است نه دکمه و disabled روی لینک بی‌معناست.
  link.setAttribute('aria-disabled', 'true');
  link.addEventListener('click', function (e) {
    if (locked) e.preventDefault();
  });

  function tick() {
    if (left <= 0) {
      locked = false;
      link.removeAttribute('aria-disabled');
      label.textContent = 'تلاش دوباره';
      return;
    }
    label.textContent = 'تلاش دوباره در ' + fa(left) + ' ثانیه';
    left--;
    setTimeout(tick, 1000);
  }
  tick();
})();
