// راه‌اندازی داخل PG.boot: اگر درخواستِ اول بترکد، به‌جای صفحه‌ی نیمه‌کاره‌ی
// ساکت، پیام فارسی + دکمه‌ی تلاش دوباره نشان داده می‌شود.
document.addEventListener('DOMContentLoaded', () => PG.boot(async () => {
  const alertHost = document.getElementById('checkoutAlert');

  // خطا باید دیده شود: اگر کاربر پایین فرم باشد و پیام بالای صفحه ظاهر شود،
  // احساس می‌کند دکمه کار نکرده. پس هم اسکرول می‌کنیم هم یک توست می‌دهیم.
  function showError(message, { quiet = false } = {}) {
    alertHost.innerHTML = `<div class="alert alert-error" role="alert"><svg><use href="#i-alert"/></svg><span>${PG.esc(message)}</span></div>`;
    if (!quiet) {
      alertHost.scrollIntoView({ behavior: 'smooth', block: 'center' });
      PG.toast(message, 'error');
    }
  }

  // --- auth guard ---
  const { user } = await PG.api('/auth/me');
  if (!user) {
    location.href = 'login.html?next=checkout.html';
    return;
  }

  // --- تعطیلی موقت فروشگاه؟ سرور هم بلاک می‌کند؛ این فقط پیام محترمانه‌ی زودهنگام است ---
  try {
    const info = await PG.api('/shop/info');
    if (info.shopOpen === false) {
      showError(info.announcement || 'فروشگاه موقتاً تعطیل است و فعلاً سفارش نمی‌پذیرد؛ به‌زودی برمی‌گردیم.', { quiet: true });
      const pay = document.getElementById('payBtn');
      if (pay) pay.disabled = true;
    }
  } catch (e) { /* اختیاری */ }

  // --- cart summary ---
  const cart = await PG.api('/cart');
  if (!cart.items.length) {
    location.href = 'cart.html';
    return;
  }
  document.getElementById('orderItems').innerHTML = cart.items.map(item => `
    <div class="co-item">
      <span>${PG.esc(item.title)} <b>× ${PG.money(item.qty)}</b></span>
      <span>${PG.money(item.subtotal)} تومان</span>
    </div>
  `).join('');
  // یادآوری سود خرید، دقیقاً لحظه‌ی تصمیم پرداخت
  const saveRow = document.getElementById('coSaveRow');
  if (saveRow && Number(cart.savings) > 0) {
    saveRow.hidden = false;
    document.getElementById('coSave').textContent = `${PG.money(cart.savings)} تومان`;
  }
  if (cart.coupon && cart.discount > 0) {
    document.getElementById('coDiscountRow').hidden = false;
    document.getElementById('coCouponCode').textContent = cart.coupon.code;
    document.getElementById('coDiscount').textContent = `−${PG.money(cart.discount)} تومان`;
  }
  const shipRow = document.getElementById('orderShip');
  if (shipRow) shipRow.textContent = cart.shippingFee > 0 ? `${PG.money(cart.shippingFee)} تومان` : 'رایگان';
  document.getElementById('orderTotal').textContent = `${PG.money(cart.payable ?? cart.total)} تومان`;

  // --- saved addresses ---
  let selectedAddressId = null;
  const { addresses } = await PG.api('/addresses');
  const savedHost = document.getElementById('savedAddresses');
  const newFields = document.getElementById('newAddressFields');

  let editingAddressId = null; // اگر پر باشد، فرم در حالت «ویرایش آدرس موجود» است

  // نکته‌ی مهم: اینپوت‌های required وقتی مخفی‌اند باید disabled شوند،
  // وگرنه مرورگر submit را بی‌صدا بلاک می‌کند و «دکمه‌ی پرداخت کار نمی‌کند»!
  function setNewFieldsEnabled(on) {
    newFields.querySelectorAll('input, textarea').forEach(el => { el.disabled = !on; });
  }
  const FIELD_IDS = ['fullName', 'addrPhone', 'province', 'city', 'addressLine', 'postalCode'];
  function fillAddrFields(a) {
    document.getElementById('fullName').value = a?.fullName || '';
    document.getElementById('addrPhone').value = a?.phone || '';
    document.getElementById('province').value = a?.province || '';
    document.getElementById('city').value = a?.city || '';
    document.getElementById('addressLine').value = a?.addressLine || '';
    document.getElementById('postalCode').value = a?.postalCode || '';
  }

  function markSelected(id, tone = 'var(--teal)') {
    savedHost.querySelectorAll('.addr-option').forEach(el => {
      const on = String(el.dataset.id) === String(id);
      el.classList.toggle('on', on);
      el.style.borderColor = on ? tone : 'var(--line)';
      const radio = el.querySelector('input[type="radio"]');
      if (radio) radio.checked = on;
    });
  }

  function selectSaved(id) {
    selectedAddressId = id;
    editingAddressId = null;
    newFields.classList.add('hidden');
    setNewFieldsEnabled(false);
    markSelected(id);
  }
  function selectNew() {
    selectedAddressId = null;
    editingAddressId = null;
    fillAddrFields(null);
    newFields.classList.remove('hidden');
    setNewFieldsEnabled(true);
    markSelected('new');
    document.getElementById('fullName').focus();
  }
  // ویرایش آدرس موجود: همان فرم با مقادیر فعلی پر می‌شود و موقع پرداخت ذخیره می‌شود
  function startEdit(id) {
    const a = addresses.find(x => String(x.id) === String(id));
    if (!a) return;
    selectedAddressId = null;
    editingAddressId = a.id;
    fillAddrFields(a);
    newFields.classList.remove('hidden');
    setNewFieldsEnabled(true);
    markSelected(id, 'var(--gold)');
    document.getElementById('fullName').focus();
    PG.toast('آدرس را ویرایش کنید؛ موقع پرداخت ذخیره می‌شود', 'info');
  }

  if (addresses.length) {
    // رادیوی واقعی استفاده می‌شود نه لیبلِ کلیک‌شدنی: با کیبورد (Tab و فلش) کار
    // می‌کند، صفحه‌خوان «انتخاب‌شده» را می‌گوید و مرورگر خودش گروه را مدیریت می‌کند.
    savedHost.innerHTML = addresses.map((a, i) => `
      <label class="addr-option" data-id="${a.id}">
        <input type="radio" name="addrPick" value="${a.id}"${i === 0 ? ' checked' : ''}>
        <span class="addr-body">
          <span class="addr-head">
            <b>${PG.esc(a.fullName)} — ${PG.esc(a.city)}</b>
            <button type="button" class="addr-edit" data-edit="${a.id}">ویرایش</button>
          </span>
          <span class="addr-line">${PG.esc(a.addressLine)}</span>
          <span class="addr-line" dir="ltr">${PG.esc(a.phone || '')}</span>
        </span>
      </label>
      `).join('') + `
      <label class="addr-option" data-id="new">
        <input type="radio" name="addrPick" value="new">
        <span class="addr-body"><b>+ استفاده از آدرس جدید</b></span>
      </label>
    `;
    savedHost.querySelectorAll('input[name="addrPick"]').forEach(radio => {
      radio.addEventListener('change', () => {
        if (radio.value === 'new') selectNew();
        else selectSaved(radio.value);
      });
    });
    savedHost.querySelectorAll('.addr-edit').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startEdit(btn.dataset.edit);
      });
    });
    selectSaved(addresses[0].id);
  } else {
    newFields.classList.remove('hidden');
    setNewFieldsEnabled(true);
  }

  // --- submit ---
  const payBtn = document.getElementById('payBtn');
  const payLabel = payBtn.innerHTML;

  document.getElementById('checkoutForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    alertHost.innerHTML = '';
    // دکمه فقط disabled نشود: کاربر باید ببیند که کاری در جریان است، وگرنه
    // دوباره می‌زند و فکر می‌کند سایت گیر کرده.
    payBtn.disabled = true;
    payBtn.classList.add('is-loading');
    payBtn.innerHTML = '<svg><use href="#i-lock"/></svg> در حال انتقال به درگاه…';

    const restore = () => {
      payBtn.disabled = false;
      payBtn.classList.remove('is-loading');
      payBtn.innerHTML = payLabel;
    };

    try {
      let addressId = selectedAddressId;

      if (!addressId) {
        const val = (id) => document.getElementById(id).value.trim();
        const fullName = val('fullName');
        const phone = val('addrPhone');
        const province = val('province');
        const city = val('city');
        const addressLine = val('addressLine');
        const postalCode = val('postalCode');

        // اولین فیلد خالی را پیدا و فوکوس می‌کنیم تا کاربر نگردد
        const missing = [['fullName', fullName], ['addrPhone', phone], ['city', city], ['addressLine', addressLine]]
          .find(([, v]) => !v);
        if (missing) {
          document.getElementById(missing[0]).focus();
          throw new Error('لطفاً همه‌ی فیلدهای ضروری آدرس را پر کنید');
        }

        const body = JSON.stringify({ fullName, phone, province, city, addressLine, postalCode });
        // حالت ویرایش: همان آدرس به‌روزرسانی می‌شود؛ وگرنه آدرس تازه ساخته می‌شود
        const { address } = editingAddressId
          ? await PG.api(`/addresses/${editingAddressId}`, { method: 'PUT', body })
          : await PG.api('/addresses', { method: 'POST', body });
        addressId = address.id;
      }

      // کلید در برابر دوبارکلیک، retry شبکه و refresh امن است. تا وقتی همین
      // تلاش ادامه دارد ثابت می‌ماند؛ سرور هم سفارش تکراری نمی‌سازد.
      const idempotencyKey = (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`)
        .replace(/[^A-Za-z0-9._:-]/g, '').slice(0, 128).padEnd(16, '0');
      const order = await PG.api('/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: JSON.stringify({ addressId })
      });
      // دکمه را برنمی‌گردانیم؛ صفحه در حال رفتن به درگاه است
      location.href = order.paymentUrl;
    } catch (err) {
      showError(err.message || 'مشکلی در ثبت سفارش پیش آمد');
      restore();
    }
  });
}));
