// wholesale.js — فرم درخواست قیمت عمده (B2B)
//
// شماره موبایل همان قاعده‌ی ورود را دارد (ارقام فارسی/عربی → لاتین)، تا
// چیزی که مشتری می‌بیند همان چیزی باشد که سرور قبول می‌کند. اگر صفحه با
// ?product=<id> باز شده باشد، عنوان کالا را از سرور می‌گیریم و از قبل پر می‌کنیم.

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('wsForm');
  if (!form) return;

  const alertHost = document.getElementById('wsAlert');
  const nameInput = document.getElementById('wsName');
  const phoneInput = document.getElementById('wsPhone');
  const productInput = document.getElementById('wsProduct');
  const productIdInput = document.getElementById('wsProductId');
  const qtyInput = document.getElementById('wsQty');
  const noteInput = document.getElementById('wsNote');

  const FA = '۰۱۲۳۴۵۶۷۸۹';
  const AR = '٠١٢٣٤٥٦٧٨٩';
  function foldDigits(v) {
    return String(v ?? '')
      .replace(/[۰-۹]/g, d => String(FA.indexOf(d)))
      .replace(/[٠-٩]/g, d => String(AR.indexOf(d)))
      .replace(/\D/g, '');
  }

  function showAlert(msg, kind = 'error') {
    alertHost.innerHTML = `<div class="alert alert-${kind}"><svg><use href="#i-alert"/></svg><span>${PG.esc(msg)}</span></div>`;
  }
  function clearAlert() { alertHost.innerHTML = ''; }

  // تلفن فقط رقم لاتین بماند
  phoneInput.addEventListener('input', () => {
    const folded = foldDigits(phoneInput.value).slice(0, 11);
    if (folded !== phoneInput.value) phoneInput.value = folded;
  });

  // اگر از صفحه‌ی محصول آمدیم، عنوان همان کالا را از قبل بگذاریم
  const productId = Number(new URLSearchParams(location.search).get('product'));
  if (Number.isInteger(productId) && productId > 0) {
    productIdInput.value = String(productId);
    PG.api(`/products/${productId}`)
      .then(p => { if (p && p.title) productInput.value = p.title; })
      .catch(() => { /* پرنشدن عنوان، فرم را نمی‌خواباند */ });
  }

  let submitting = false;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submitting) return;
    clearAlert();

    const name = nameInput.value.trim();
    const phone = foldDigits(phoneInput.value);
    if (name.length < 2) return showAlert('نام و نام خانوادگی را وارد کنید');
    if (!/^09\d{9}$/.test(phone)) return showAlert('شماره موبایل معتبر نیست؛ مثال: ۰۹۱۲۳۴۵۶۷۸۹');

    const qty = qtyInput.value ? Number(qtyInput.value) : 1;
    if (!Number.isInteger(qty) || qty < 1) return showAlert('تعداد باید یک عدد درست باشد');

    const btn = form.querySelector('button[type="submit"]');
    const btnHtml = btn.innerHTML;
    submitting = true;
    btn.disabled = true;
    btn.classList.add('is-loading');
    btn.querySelector('span').textContent = 'در حال ثبت…';
    try {
      const res = await PG.api('/wholesale/request', {
        method: 'POST',
        body: JSON.stringify({
          name,
          phone,
          productId: productIdInput.value ? Number(productIdInput.value) : null,
          productTitle: productInput.value.trim(),
          quantity: qty,
          note: noteInput.value.trim()
        })
      });
      showAlert(res.message || 'درخواست شما ثبت شد؛ به‌زودی با شما تماس می‌گیریم', 'success');
      form.reset();
      productIdInput.value = '';
      PG.toast('درخواست عمده ثبت شد', 'success');
    } catch (err) {
      showAlert(err.message || 'ثبت نشد؛ چند لحظه بعد دوباره تلاش کنید');
    } finally {
      submitting = false;
      btn.disabled = false;
      btn.classList.remove('is-loading');
      btn.innerHTML = btnHtml;
    }
  });
});
