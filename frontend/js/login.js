// login.js — ورود با کد پیامکی یا رمز عبور
//
// دو نکته‌ی مهم که قبلاً باگ بودند و اینجا حل شده‌اند:
//
// ۱) پاک‌سازی ارقام: placeholder این صفحه با ارقام فارسی نوشته شده
//    (۰۹۱۲۳۴۵۶۷۸۹) ولی کد قبلی با /[^\d]/g تمیز می‌کرد و در جاوااسکریپت
//    \d فقط [0-9] است — یعنی ارقام فارسی *پاک* می‌شدند و رشته خالی می‌ماند.
//    نتیجه: هر کسی با کیبورد فارسی عدد می‌زد پیام «شماره معتبر نیست» می‌گرفت
//    و درخواست هیچ‌وقت به سرور نمی‌رسید. قاعده‌ها اینجا دقیقاً با
//    backend/lib/phone.js یکی است تا فرانت چیزی را رد نکند که سرور قبولش دارد.
//
// ۲) ثانیه‌شمار ارسال مجدد: مهلت به‌صورت «زمان پایان» در localStorage ذخیره
//    می‌شود، نه «چند ثانیه مانده». پس رفرش صفحه یا بستن و بازکردن تب هم
//    شمارش را از دست نمی‌دهد و عدد همیشه با سرور همگام است.

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  // بعد از ورود: برگرد به همان‌جایی که کاربر بود (next)؛ وگرنه صفحه‌ی اصلی فروشگاه.
  const next = params.get('next') || 'index.html';

  const stepPhone = document.getElementById('stepPhone');
  const stepCode = document.getElementById('stepCode');
  const stepProfile = document.getElementById('stepProfile');
  const formPhone = document.getElementById('formPhone');
  const formCode = document.getElementById('formCode');
  const formProfile = document.getElementById('formProfile');
  const alertPhone = document.getElementById('alertPhone');
  const alertCode = document.getElementById('alertCode');
  const alertProfile = document.getElementById('alertProfile');
  const phoneDisplay = document.getElementById('phoneDisplay');
  const btnResend = document.getElementById('btnResend');
  const resendWrap = document.getElementById('resendWrap');
  const codeInput = document.getElementById('code');

  let currentPhone = '';

  // ---------- ابزارهای کوچک ----------
  const FA = '۰۱۲۳۴۵۶۷۸۹';
  const AR = '٠١٢٣٤٥٦٧٨٩';

  // ارقام فارسی/عربی → لاتین، و حذف هر چیز غیر رقم
  function foldDigits(v) {
    return String(v ?? '')
      .replace(/[۰-۹]/g, d => String(FA.indexOf(d)))
      .replace(/[٠-٩]/g, d => String(AR.indexOf(d)))
      .replace(/\D/g, '');
  }

  // نمایش عدد با ارقام فارسی (فقط برای چشم کاربر، نه برای ارسال به سرور)
  function toFa(v) {
    return String(v).replace(/[0-9]/g, d => FA[+d]);
  }

  // همان قاعده‌ی backend/lib/phone.js — هر شکلی از شماره پذیرفته می‌شود
  function normalizePhone(v) {
    let s = foldDigits(v);
    if (s.startsWith('00')) s = s.slice(2);
    if (s.startsWith('98')) {
      const rest = s.slice(2);
      if (/^9\d{9}$/.test(rest) || /^09\d{9}$/.test(rest)) s = rest;
    }
    if (/^9\d{9}$/.test(s)) s = '0' + s;
    return s;
  }

  const isValidPhone = (s) => /^09\d{9}$/.test(s);

  function showAlert(host, message, kind = 'error') {
    host.innerHTML = `<div class="alert alert-${kind}"><svg><use href="#i-alert"/></svg><span>${PG.esc(message)}</span></div>`;
  }
  function clearAlert(host) { host.innerHTML = ''; }

  // ---------- نشانگر مرحله ----------
  // ترتیب مرحله‌ها برای اینکه قدم‌های گذشته «تیک‌خورده» نشان داده شوند
  const STEP_ORDER = ['phone', 'code', 'profile'];
  const stepsEl = document.getElementById('authSteps');

  function setStep(name) {
    if (!stepsEl) return;
    const idx = STEP_ORDER.indexOf(name);
    stepsEl.querySelectorAll('li').forEach(li => {
      const i = STEP_ORDER.indexOf(li.dataset.step);
      li.classList.toggle('is-active', i === idx);
      li.classList.toggle('is-done', idx > -1 && i < idx);
    });
    // ورود با رمز عبور مرحله‌ای نیست — نشانگر پنهان می‌شود تا گمراه نکند
    stepsEl.classList.toggle('hidden', name === 'pass');
  }

  // پیام فارسی بر اساس وضعیت HTTP — کاربر باید بفهمد چه کار کند، نه فقط چه شد
  function humanError(err) {
    // fetch وقتی اینترنت قطع است TypeError بدون status می‌دهد؛ PG.api همیشه
    // status را ست می‌کند، پس نبودنِ status یعنی درخواست حتی نرفته.
    if (!err || err.status === undefined) return 'اتصال به اینترنت برقرار نشد؛ اتصال را چک کنید و دوباره تلاش کنید';
    if (err.status === 429) return err.message || 'درخواست‌های زیاد؛ کمی بعد دوباره تلاش کنید';
    if (err.status === 502) return err.message || 'ارسال پیامک موقتاً ممکن نشد؛ چند لحظه بعد دوباره بزنید';
    if (err.status >= 500) return 'مشکلی در سرور پیش آمد؛ چند لحظه بعد دوباره تلاش کنید';
    return err.message || 'خطایی رخ داد';
  }

  // ---------- وضعیت ماندگار مرحله‌ی کد ----------
  // «زمان پایان» ذخیره می‌شود نه «ثانیه‌ی مانده» — پس رفرش شمارش را خراب نمی‌کند.
  const STATE_KEY = 'pg_otp_state';

  function saveState(st) {
    try { localStorage.setItem(STATE_KEY, JSON.stringify(st)); } catch (e) { /* حالت خصوصی مرورگر */ }
  }
  function loadState() {
    try {
      const st = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      if (!st || !isValidPhone(st.phone)) return null;
      return st;
    } catch (e) { return null; }
  }
  function clearState() {
    try { localStorage.removeItem(STATE_KEY); } catch (e) { /* بی‌خیال */ }
  }

  // ---------- ثانیه‌شمار زنده ----------
  let tickTimer = null;

  function stopTick() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  }

  function renderCountdown() {
    const st = loadState();
    if (!st) { stopTick(); setResendReady(); return; }

    const leftResend = Math.ceil((st.resendAt - Date.now()) / 1000);
    const leftCode = Math.ceil(((st.codeExpiresAt || 0) - Date.now()) / 1000);

    // عمر خود کد: وقتی تمام شد به کاربر بگو، نه اینکه بگذاریم کد اشتباه بزند
    const codeHint = document.getElementById('codeExpiry');
    if (codeHint) {
      if (leftCode > 0) {
        codeHint.textContent = `اعتبار کد: ${toFa(Math.floor(leftCode / 60))}:${toFa(String(leftCode % 60).padStart(2, '0'))}`;
        codeHint.classList.remove('expired');
      } else {
        codeHint.textContent = 'اعتبار کد تمام شد — دوباره ارسال کنید';
        codeHint.classList.add('expired');
      }
    }

    if (leftResend > 0) {
      btnResend.disabled = true;
      btnResend.textContent = `ارسال مجدد در ${toFa(leftResend)} ثانیه`;
      if (resendWrap) {
        resendWrap.classList.add('counting');
        // نوار پیشرفت: نسبت زمان سپری‌شده به کل مهلت
        const total = st.resendTotal || 90;
        const pct = Math.max(0, Math.min(100, ((total - leftResend) / total) * 100));
        resendWrap.style.setProperty('--resend-progress', pct.toFixed(1) + '%');
      }
    } else {
      stopTick();
      setResendReady();
    }
  }

  function setResendReady() {
    btnResend.disabled = false;
    btnResend.textContent = 'دوباره ارسال کن';
    if (resendWrap) {
      resendWrap.classList.remove('counting');
      resendWrap.style.setProperty('--resend-progress', '100%');
    }
  }

  // شمارش را از یک «زمان پایان» شروع می‌کند و هر ثانیه به‌روز می‌کند
  function startCountdown() {
    stopTick();
    renderCountdown();
    tickTimer = setInterval(renderCountdown, 1000);
  }

  // اگر تب مخفی بوده و تایمر مرورگر کند شده، برگشت که زد فوراً همگام کن
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !stepCode.classList.contains('hidden')) renderCountdown();
  });

  // ---------- رفت‌وآمد بین مراحل ----------
  function goToCodeStep(phone) {
    currentPhone = phone;
    phoneDisplay.textContent = toFa(phone);
    stepPhone.classList.add('hidden');
    document.getElementById('stepPass')?.classList.add('hidden');
    stepCode.classList.remove('hidden');
    setStep('code');
    startCountdown();
  }

  async function requestOtp(phone) {
    const { token } = await PG.api('/auth/otp/challenge');
    const res = await PG.api('/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phone, challenge: token })
    });
    const retry = Number(res.retryAfter) || 90;
    const ttl = Number(res.expiresIn) || 120;
    saveState({
      phone,
      resendAt: Date.now() + retry * 1000,
      resendTotal: retry,
      codeExpiresAt: Date.now() + ttl * 1000
    });
    goToCodeStep(phone);
    codeInput.value = '';
    codeInput.focus();
    return res;
  }

  // ---------- بازیابی بعد از رفرش ----------
  // اگر کاربر وسط مرحله‌ی کد صفحه را رفرش کرده، همان‌جا برمی‌گردد و ثانیه‌شمار
  // ادامه پیدا می‌کند — نه اینکه از اول شروع کند و باز پیامک بخواهد.
  (function restore() {
    const st = loadState();
    if (!st) return;
    const resendLeft = st.resendAt - Date.now();
    const codeLeft = (st.codeExpiresAt || 0) - Date.now();
    // اگر هم مهلت ارسال مجدد تمام شده و هم کد منقضی شده، دیگر چیزی برای ادامه نیست
    if (resendLeft <= 0 && codeLeft <= 0) { clearState(); return; }
    document.getElementById('phone').value = st.phone;
    goToCodeStep(st.phone);
    if (codeLeft <= 0) {
      showAlert(alertCode, 'کد قبلی منقضی شده؛ با دکمه‌ی پایین کد تازه بگیرید', 'warn');
    }
  })();

  // ---------- مرحله‌ی شماره ----------
  // همان‌طور که تایپ می‌کند ارقام فارسی به لاتین تبدیل می‌شوند تا چیزی که
  // می‌بیند همان چیزی باشد که فرستاده می‌شود.
  const phoneInput = document.getElementById('phone');
  phoneInput.addEventListener('input', () => {
    const folded = foldDigits(phoneInput.value);
    if (folded !== phoneInput.value) phoneInput.value = folded;
  });

  formPhone.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert(alertPhone);
    const phone = normalizePhone(phoneInput.value);
    if (!isValidPhone(phone)) {
      return showAlert(alertPhone, 'شماره موبایل معتبر نیست. مثال: ۰۹۱۲۳۴۵۶۷۸۹');
    }
    const btn = formPhone.querySelector('button[type="submit"]');
    if (btn.disabled) return;           // جلوی دو بار کلیک سریع
    btn.disabled = true;
    btn.classList.add('is-loading');
    try {
      await requestOtp(phone);
      PG.toast('کد ورود ارسال شد', 'success');
    } catch (err) {
      // اگر سرور گفت «کد قبلاً ارسال شده»، همان مهلت را زنده نشان می‌دهیم
      const wait = Number(err?.data?.retryAfter);
      if (err?.status === 429 && Number.isFinite(wait) && wait > 0) {
        saveState({
          phone,
          resendAt: Date.now() + wait * 1000,
          resendTotal: wait,
          codeExpiresAt: Date.now() + wait * 1000
        });
        goToCodeStep(phone);
        showAlert(alertCode, 'کد قبلی هنوز معتبر است؛ همان را وارد کنید', 'warn');
      } else {
        showAlert(alertPhone, humanError(err));
      }
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-loading');
    }
  });

  // ---------- مرحله‌ی کد ----------
  // چسباندن کل متن پیامک هم کار کند: از هر متنی فقط ۵ رقم اول برداشته می‌شود
  codeInput.addEventListener('input', () => {
    const folded = foldDigits(codeInput.value).slice(0, 5);
    if (folded !== codeInput.value) codeInput.value = folded;
  });

  codeInput.addEventListener('paste', (e) => {
    const text = (e.clipboardData || window.clipboardData)?.getData('text') || '';
    const digits = foldDigits(text);
    if (digits.length >= 5) {
      e.preventDefault();
      codeInput.value = digits.slice(0, 5);
      formCode.requestSubmit();
    }
  });

  let verifying = false;

  formCode.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (verifying) return;
    clearAlert(alertCode);
    const code = foldDigits(codeInput.value);
    if (code.length !== 5) {
      return showAlert(alertCode, 'کد ۵ رقمی را کامل وارد کنید');
    }
    const btn = formCode.querySelector('button[type="submit"]');
    verifying = true;
    btn.disabled = true;
    btn.classList.add('is-loading');
    try {
      const { user } = await PG.api('/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify({ phone: currentPhone, code })
      });
      // ورود موفق → وضعیت ماندگار دیگر لازم نیست
      clearState();
      stopTick();
      PG.toast('با موفقیت وارد شدید', 'success');
      if (!user.fullName) {
        stepCode.classList.add('hidden');
        stepProfile.classList.remove('hidden');
        setStep('profile');
        document.getElementById('fullName').focus();
      } else {
        location.href = next;
      }
    } catch (err) {
      showAlert(alertCode, humanError(err));
      codeInput.select();
    } finally {
      verifying = false;
      btn.disabled = false;
      btn.classList.remove('is-loading');
    }
  });

  btnResend.addEventListener('click', async () => {
    if (btnResend.disabled) return;
    clearAlert(alertCode);
    btnResend.disabled = true;
    try {
      await requestOtp(currentPhone);
      PG.toast('کد دوباره ارسال شد', 'info');
    } catch (err) {
      const wait = Number(err?.data?.retryAfter);
      if (err?.status === 429 && Number.isFinite(wait) && wait > 0) {
        const st = loadState() || {};
        saveState({ ...st, phone: currentPhone, resendAt: Date.now() + wait * 1000, resendTotal: wait });
        startCountdown();
      } else {
        setResendReady();
      }
      showAlert(alertCode, humanError(err));
    }
  });

  // «شماره را عوض می‌کنم» — برگشت به مرحله‌ی اول و پاک کردن وضعیت
  document.getElementById('btnChangePhone')?.addEventListener('click', () => {
    clearState();
    stopTick();
    clearAlert(alertCode);
    stepCode.classList.add('hidden');
    stepPhone.classList.remove('hidden');
    setStep('phone');
    phoneInput.focus();
    phoneInput.select();
  });

  // ---------- مرحله‌ی نام ----------
  formProfile.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert(alertProfile);
    const fullName = document.getElementById('fullName').value.trim();
    if (!fullName) return showAlert(alertProfile, 'نام را وارد کنید');
    const btn = formProfile.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.classList.add('is-loading');
    try {
      await PG.api('/auth/profile', { method: 'POST', body: JSON.stringify({ fullName }) });
      PG.toast(`خوش اومدی ${fullName} 🌟`, 'success');
      location.href = next;
    } catch (err) {
      showAlert(alertProfile, humanError(err));
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-loading');
    }
  });

  document.getElementById('btnSkipProfile').addEventListener('click', () => {
    location.href = next;
  });

  // ---------- ورود با رمز عبور ----------
  const stepPass = document.getElementById('stepPass');
  const formPass = document.getElementById('formPass');
  const alertPass = document.getElementById('alertPass');
  const passPhone = document.getElementById('passPhone');

  passPhone?.addEventListener('input', () => {
    const folded = foldDigits(passPhone.value);
    if (folded !== passPhone.value) passPhone.value = folded;
  });

  document.getElementById('btnGoPass')?.addEventListener('click', () => {
    stepPhone.classList.add('hidden');
    stepCode.classList.add('hidden');
    stepPass.classList.remove('hidden');
    setStep('pass');
    const typed = normalizePhone(phoneInput.value);
    if (typed) passPhone.value = typed;
    document.getElementById(typed ? 'passPassword' : 'passPhone').focus();
  });

  document.getElementById('btnGoOtp')?.addEventListener('click', () => {
    stepPass.classList.add('hidden');
    // اگر مرحله‌ی کد نیمه‌کاره مانده بود، به همان برگرد نه به اول
    const st = loadState();
    if (st && st.resendAt > Date.now()) goToCodeStep(st.phone);
    else { stepPhone.classList.remove('hidden'); setStep('phone'); phoneInput.focus(); }
  });

  formPass?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearAlert(alertPass);
    const phone = normalizePhone(passPhone.value);
    const password = document.getElementById('passPassword').value;
    if (!isValidPhone(phone)) {
      return showAlert(alertPass, 'شماره موبایل معتبر نیست. مثال: ۰۹۱۲۳۴۵۶۷۸۹');
    }
    if (!password) return showAlert(alertPass, 'رمز عبور را وارد کنید');
    const btn = formPass.querySelector('button[type="submit"]');
    if (btn.disabled) return;
    btn.disabled = true;
    btn.classList.add('is-loading');
    try {
      await PG.api('/auth/password/login', {
        method: 'POST',
        body: JSON.stringify({ phone, password })
      });
      clearState();
      PG.toast('با موفقیت وارد شدید', 'success');
      location.href = next;
    } catch (err) {
      showAlert(alertPass, humanError(err));
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-loading');
    }
  });
});
