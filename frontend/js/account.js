// راه‌اندازی داخل PG.boot: اگر درخواستِ اول بترکد، به‌جای صفحه‌ی نیمه‌کاره‌ی
// ساکت، پیام فارسی + دکمه‌ی تلاش دوباره نشان داده می‌شود.
document.addEventListener('DOMContentLoaded', () => PG.boot(async () => {
  const { user } = await PG.api('/auth/me');
  if (!user) {
    location.href = 'login.html?next=account.html';
    return;
  }
  document.getElementById('userPhone').textContent = user.fullName || user.phone;

  // لینک پنل مدیریت — فقط برای ادمین نمایش داده می‌شود
  if (user.isAdmin) {
    const nav = document.querySelector('.account-nav');
    const btnLogout = document.getElementById('btnLogout');
    const a = document.createElement('a');
    a.href = '/admin.html';
    a.innerHTML = '<svg><use href="#i-shield"/></svg> پنل مدیریت';
    nav.insertBefore(a, btnLogout);
  }

  // ---------- تب‌ها (سفارش‌ها / علاقه‌مندی‌ها / مشخصات) ----------
  const tabs = {
    orders: { nav: document.getElementById('navOrders'), panel: document.getElementById('panelOrders') },
    wishlist: { nav: document.getElementById('navWishlist'), panel: document.getElementById('panelWishlist') },
    profile: { nav: document.getElementById('navProfile'), panel: document.getElementById('panelProfile') }
  };

  function showTab(name) {
    Object.entries(tabs).forEach(([key, t]) => {
      const on = key === name;
      t.nav.classList.toggle('active', on);
      t.panel.classList.toggle('hidden', !on);
    });
    if (name === 'wishlist') loadWishlist();
  }
  Object.entries(tabs).forEach(([key, t]) => {
    t.nav.addEventListener('click', (e) => { e.preventDefault(); history.replaceState(null, '', `#${key}`); showTab(key); });
  });

  // ---------- سفارش‌ها ----------
  const emptyEl = document.getElementById('ordersEmpty');
  const listEl = document.getElementById('ordersList');

  // وضعیت‌هایی که پولش واقعاً پرداخت شده — فقط این‌ها فاکتور دارند.
  // سفارشِ pending_payment یا failed فاکتور ندارد چون سندِ پرداختی وجود ندارد؛
  // دادن کاغذی که بالایش نوشته «فاکتور» برای سفارشی که پول نداده، خودش دردسر است.
  const PAID_LIKE = ['paid', 'shipped', 'delivered', 'return_requested', 'returned'];

  function orderCard(order) {
    return `
      <div class="order-item">
        <div class="order-item-head">
          <div><b>سفارش #${PG.num(order.id)}</b><div class="muted">${new Date(order.createdAt).toLocaleDateString('fa-IR')}</div></div>
          <span class="status-badge status-${order.status}">${PG.statusLabel(order.status)}</span>
        </div>
        <div class="order-item-products">
          ${order.items.map(i => `<div>${PG.esc(i.title)} × ${PG.money(i.qty)}</div>`).join('')}
        </div>
        ${order.trackingCode ? `
        <div class="order-track">
          <svg><use href="#i-truck"/></svg>
          <span>کد رهگیری پستی: <bdo dir="ltr">${PG.esc(order.trackingCode)}</bdo></span>
        </div>` : ''}
        ${order.status === 'return_requested' && order.returnReason ? `<div class="order-note">دلیل مرجوعی شما: ${PG.esc(order.returnReason)}</div>` : ''}
        ${order.status === 'returned' ? `<div class="order-note">مرجوعی تأیید شد؛ بازگشت وجه با هماهنگی فروشگاه انجام می‌شود.</div>` : ''}
        ${order.status === 'canceled' && order.cancelReason ? `<div class="order-note">${PG.esc(order.cancelReason)}</div>` : ''}
        ${order.discount > 0 ? `<div class="order-item-ship"><span>تخفیف${order.couponCode ? ` (کد <bdo dir="ltr">${PG.esc(order.couponCode)}</bdo>)` : ''}</span><span class="sum-discount">−${PG.money(order.discount)} تومان</span></div>` : ''}
        ${order.shippingFee > 0 ? `<div class="order-item-ship"><span>شامل هزینه ارسال</span><span>${PG.money(order.shippingFee)} تومان</span></div>` : ''}
        <div class="order-item-total"><span>مبلغ کل</span><span>${PG.money(order.total)} تومان</span></div>
        ${order.status === 'paid' ? `
        <div class="order-actions">
          <button type="button" class="oa-btn" data-cancel="${order.id}">لغو سفارش</button>
          <span class="oa-hint">تا قبل از ارسال قابل لغو است</span>
        </div>` : ''}
        ${order.status === 'delivered' ? `
        <div class="order-actions">
          <button type="button" class="oa-btn oa-primary" data-reorder="${order.id}">خرید دوباره</button>
          <button type="button" class="oa-btn" data-return="${order.id}">درخواست مرجوعی</button>
          <span class="oa-hint">مرجوعی تا ۷ روز بعد از تحویل</span>
        </div>` : ''}
        ${['failed', 'canceled', 'returned', 'pending_payment'].includes(order.status) ? `
        <div class="order-actions">
          <button type="button" class="oa-btn oa-primary" data-reorder="${order.id}">دوباره سفارش بده</button>
          <span class="oa-hint">همین اقلام دوباره در سبد چیده می‌شوند</span>
        </div>` : ''}
        ${PAID_LIKE.includes(order.status) ? `
        <div class="order-actions">
          <button type="button" class="oa-btn" data-invoice="${order.id}">
            <svg><use href="#i-print"/></svg> چاپ فاکتور
          </button>
          <span class="oa-hint">برای پرینت یا ذخیره‌ی PDF</span>
        </div>` : ''}
      </div>`;
  }

  // سفارش‌ها نگه داشته می‌شوند چون فاکتور چاپی به کل شیء سفارش (نشانی، اقلام،
  // تخفیف) نیاز دارد و گرفتن دوباره‌ی همان داده از سرور فقط برای چاپ، بی‌دلیل است.
  let MY_ORDERS = [];

  async function loadOrders() {
    const { orders } = await PG.api('/orders/mine');
    MY_ORDERS = orders;
    if (!orders.length) {
      emptyEl.classList.remove('hidden');
      listEl.innerHTML = '';
      return;
    }
    emptyEl.classList.add('hidden');
    listEl.innerHTML = orders.map(orderCard).join('');
  }
  await loadOrders();

  // لغو و مرجوعی — تأیید و فرمِ دلیل همان‌جا داخل کارت باز می‌شود (نه دیالوگ خام مرورگر)
  listEl.addEventListener('click', async (e) => {
    const zone = e.target.closest('.order-actions');

    // خرید دوباره: سبد از روی همان سفارش چیده می‌شود (قیمت و موجودیِ امروز).
    // برای سفارش‌های تحویل‌شده کارِ «سفارش همیشگی» را راحت می‌کند و برای
    // سفارش‌های ناموفق تنها راهِ عملیِ تلاش دوباره است — سبد موقع رفتن به درگاه
    // خالی شده بود.
    const reBtn = e.target.closest('[data-reorder]');
    if (reBtn) {
      reBtn.disabled = true;
      const idle = reBtn.textContent;
      reBtn.textContent = 'در حال چیدن سبد…';
      try {
        const r = await PG.api(`/orders/${reBtn.dataset.reorder}/reorder`, { method: 'POST' });
        PG.refreshCartBadge();
        if (r.skipped && r.skipped.length) {
          PG.toast(`سبد چیده شد؛ ولی ${r.skipped.map(s => `«${s.title}» ${s.reason}`).join('، ')}`, 'info',
            { action: { href: 'cart.html', label: 'مشاهده سبد' } });
        } else {
          PG.toast('اقلام این سفارش دوباره در سبد چیده شد', 'success',
            { action: { href: 'cart.html', label: 'مشاهده سبد' } });
        }
      } catch (err) {
        PG.toast(err.message, 'error');
      } finally {
        reBtn.disabled = false;
        reBtn.textContent = idle;
      }
      return;
    }

    // چاپ فاکتور: برگه از داده‌ای که همین حالا در دست داریم ساخته می‌شود و
    // window.print() صدا زده می‌شود. هیچ درخواست جدیدی به سرور نمی‌رود.
    const invBtn = e.target.closest('[data-invoice]');
    if (invBtn) {
      const order = MY_ORDERS.find(o => o.id === Number(invBtn.dataset.invoice));
      if (!order) {
        // نظرِ محتمل: لیست کهنه شده (مثلاً وضعیت از پنل عوض شده). یک بار
        // تازه می‌کنیم و می‌گوییم دوباره بزند — بهتر از چاپِ فاکتورِ اشتباه.
        await loadOrders();
        PG.toast('این سفارش تازه شد؛ یک بار دیگر «چاپ فاکتور» را بزنید.', 'info');
        return;
      }
      printInvoice(order, user);
      return;
    }

    const cancelBtn = e.target.closest('[data-cancel]');
    if (cancelBtn && zone) {
      zone.innerHTML = `
        <span class="oa-hint">سفارش لغو شود؟ بازگشت وجه با هماهنگی فروشگاه انجام می‌شود.</span>
        <button type="button" class="oa-btn oa-danger" data-cancel-yes="${cancelBtn.dataset.cancel}">بله، لغو کن</button>
        <button type="button" class="oa-btn" data-abort>انصراف</button>`;
      return;
    }

    const yesBtn = e.target.closest('[data-cancel-yes]');
    if (yesBtn) {
      yesBtn.disabled = true;
      try {
        await PG.api(`/orders/${yesBtn.dataset.cancelYes}/cancel`, { method: 'POST' });
        PG.toast('سفارش لغو شد', 'info');
      } catch (err) {
        PG.toast(err.message || 'لغو ممکن نشد', 'error');
      }
      await loadOrders();
      return;
    }

    const returnBtn = e.target.closest('[data-return]');
    if (returnBtn && zone) {
      zone.innerHTML = `
        <div class="oa-form">
          <textarea class="oa-reason" rows="2" maxlength="300" placeholder="دلیل مرجوعی را بنویسید؛ مثلاً: ترک داشت، رنگش با عکس فرق داشت..."></textarea>
          <div class="oa-form-row">
            <button type="button" class="oa-btn oa-primary" data-return-submit="${returnBtn.dataset.return}">ثبت درخواست</button>
            <button type="button" class="oa-btn" data-abort>انصراف</button>
          </div>
        </div>`;
      zone.querySelector('.oa-reason').focus();
      return;
    }

    const submitBtn = e.target.closest('[data-return-submit]');
    if (submitBtn && zone) {
      const reason = zone.querySelector('.oa-reason')?.value.trim() || '';
      if (reason.length < 5) {
        PG.toast('لطفاً دلیل مرجوعی را بنویسید (حداقل ۵ حرف)', 'error');
        return;
      }
      submitBtn.disabled = true;
      try {
        await PG.api(`/orders/${submitBtn.dataset.returnSubmit}/return`, {
          method: 'POST', body: JSON.stringify({ reason })
        });
        PG.toast('درخواست مرجوعی ثبت شد؛ به‌زودی بررسی می‌شود', 'success');
        await loadOrders();
      } catch (err) {
        PG.toast(err.message || 'ثبت درخواست ممکن نشد', 'error');
        submitBtn.disabled = false;
      }
      return;
    }

    if (e.target.closest('[data-abort]')) await loadOrders();
  });

  // ---------- علاقه‌مندی‌ها ----------
  let wishLoaded = false;
  async function loadWishlist(force = false) {
    if (wishLoaded && !force) return;
    const grid = document.getElementById('wishGrid');
    const empty = document.getElementById('wishEmpty');
    try {
      const { products } = await PG.api('/wishlist');
      // پرچم فقط بعد از موفقیت بالا می‌رود. قبلاً قبل از درخواست ست می‌شد، پس یک
      // قطعیِ لحظه‌ای اینترنت تبِ علاقه‌مندی‌ها را تا رفرشِ کاملِ صفحه خالی نگه
      // می‌داشت — رفت‌وبرگشت بین تب‌ها هم دیگر تلاش دوباره نمی‌کرد.
      wishLoaded = true;
      if (!products.length) {
        empty.classList.remove('hidden');
        grid.innerHTML = '';
        return;
      }
      empty.classList.add('hidden');
      grid.innerHTML = products.map(renderWishCard).join('');
      PG.syncWishHearts();
    } catch (e) {
      empty.classList.add('hidden');
      grid.innerHTML = `
        <div class="grid-empty">
          <svg style="width:40px;height:40px;color:var(--coral)"><use href="#i-alert"/></svg>
          <p>${PG.esc(e.message)}</p>
          <button type="button" class="btn btn-outline" data-retry-wish>تلاش دوباره</button>
        </div>`;
    }
  }

  function renderWishCard(p) {
    const outOfStock = typeof p.stock === 'number' && p.stock <= 0;
    const title = PG.esc(p.title);
    const media = p.image
      ? `<img src="${PG.esc(PG.cardImg(p.image))}" alt="${title}" loading="lazy" decoding="async">`
      : `<svg role="img" aria-label="${title}"><use href="#${PG.esc(p.icon)}"/></svg>`;
    return `
      <article class="product-card" data-id="${p.id}">
        <a href="/product/${p.id}" class="product-media${p.image ? ' has-image' : ''}" style="display:flex" aria-label="${title}">
          ${p.badge ? `<span class="product-badge">${PG.esc(p.badge)}</span>` : ''}
          ${PG.wishBtnHtml(p.id)}
          ${media}
        </a>
        <div class="product-body">
          <span class="product-cat">${PG.esc(p.category)}</span>
          <h3 class="product-title"><a href="/product/${p.id}">${title}</a></h3>
          <div class="product-footer">
            <span class="price">${PG.money(p.price)} <small>تومان</small></span>
            <button class="buy-btn wish-buy" data-id="${p.id}" ${outOfStock ? 'disabled' : ''}>
              <svg><use href="#i-cart"/></svg> ${outOfStock ? 'ناموجود' : 'افزودن به سبد'}
            </button>
          </div>
        </div>
      </article>`;
  }

  document.getElementById('wishGrid').addEventListener('click', async (e) => {
    const retry = e.target.closest('[data-retry-wish]');
    if (retry) {
      retry.disabled = true;
      retry.textContent = 'در حال تلاش…';
      await loadWishlist(true);
      return;
    }

    const buy = e.target.closest('.wish-buy');
    if (buy && !buy.disabled) {
      buy.disabled = true;
      try { await PG.addToCart(Number(buy.dataset.id), 1); }
      catch (err) { PG.toast(err.message || 'خطا در افزودن به سبد', 'error'); }
      finally { buy.disabled = false; }
    }
  });

  // بعد از برداشتن قلب (هر جای صفحه)، لیست تازه شود
  document.addEventListener('pg:wishchange', () => loadWishlist(true));

  // ورود مستقیم با #wishlist یا #profile (مثلاً از نوار پایین موبایل)
  const initial = location.hash.replace('#', '');
  showTab(tabs[initial] ? initial : 'orders');
  window.addEventListener('hashchange', () => {
    const h = location.hash.replace('#', '');
    if (tabs[h]) showTab(h);
  });

  // ---------- مشخصات ----------
  const formProfile = document.getElementById('formProfile');
  const nameInput = document.getElementById('profileName');
  const alertProfile = document.getElementById('alertProfile');
  nameInput.value = user.fullName || '';
  document.getElementById('profilePhone').value = user.phone;

  formProfile.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertProfile.innerHTML = '';
    const btn = formProfile.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const { user: updated } = await PG.api('/auth/profile', {
        method: 'POST',
        body: JSON.stringify({ fullName: nameInput.value.trim() })
      });
      document.getElementById('userPhone').textContent = updated.fullName || updated.phone;
      PG.refreshAuthNav();
      PG.toast('مشخصات ذخیره شد', 'success');
    } catch (err) {
      alertProfile.innerHTML = `<div class="alert alert-error"><svg><use href="#i-alert"/></svg><span>${PG.esc(err.message)}</span></div>`;
    } finally {
      btn.disabled = false;
    }
  });

  // ---------- آدرس‌های من ----------
  const addrList = document.getElementById('addrList');
  const alertAddr = document.getElementById('alertAddr');
  const formAddress = document.getElementById('formAddress');

  // نسخه‌ی مشترک escape از common.js (نگه‌داشتن نام قدیمی برای خوانایی همین فایل)
  function escT(s) { return PG.esc(s); }

  let ADDRS = [];            // برای پرکردن فرم موقع ویرایش
  let editingAddr = null;    // شناسه‌ی آدرسِ در حال ویرایش
  const addrSubmitBtn = formAddress.querySelector('button[type="submit"]');
  const addrSubmitIdle = addrSubmitBtn.innerHTML;

  async function loadAddresses() {
    try {
      const { addresses } = await PG.api('/addresses');
      ADDRS = addresses;
      if (!addresses.length) {
        addrList.innerHTML = '<p class="muted-sub">هنوز آدرسی ثبت نکردید.</p>';
        return;
      }
      addrList.innerHTML = addresses.map(a => `
        <div style="display:flex;align-items:flex-start;gap:12px;padding:14px;border:1.5px solid var(--line);border-radius:12px;font-size:13.5px">
          <svg style="width:18px;height:18px;flex:none;color:var(--gold);margin-top:2px"><use href="#i-pin"/></svg>
          <div style="flex:1;min-width:0">
            <b>${escT(a.fullName)}</b> — <bdo dir="ltr">${escT(a.phone)}</bdo><br>
            <span style="color:var(--ink-soft)">${escT(a.province ? a.province + '، ' : '')}${escT(a.city)}، ${escT(a.addressLine)}</span>
            ${a.postalCode ? `<br><span style="color:var(--ink-soft)">کد پستی: <bdo dir="ltr">${escT(a.postalCode)}</bdo></span>` : ''}
          </div>
          <button type="button" class="icon-btn addr-edit-btn" data-edit="${a.id}" title="ویرایش آدرس" aria-label="ویرایش آدرس">
            <svg><use href="#i-edit"/></svg>
          </button>
          <button type="button" class="icon-btn addr-del" data-id="${a.id}" title="حذف آدرس" aria-label="حذف آدرس">
            <svg><use href="#i-close"/></svg>
          </button>
        </div>
      `).join('');
    } catch (e) {
      // بدون آدرس، دکمه‌ی پرداخت هم بی‌فایده است؛ پس اینجا حتماً باید راهِ تلاش
      // دوباره باشد، نه یک جمله‌ی بن‌بست.
      addrList.innerHTML = `
        <p class="muted-sub">${escT(e.message)}</p>
        <button type="button" class="btn btn-outline" data-retry-addr>تلاش دوباره</button>`;
    }
  }

  function exitAddrEditMode() {
    editingAddr = null;
    formAddress.reset();
    addrSubmitBtn.innerHTML = addrSubmitIdle;
  }

  addrList.addEventListener('click', async (e) => {
    const retryAddr = e.target.closest('[data-retry-addr]');
    if (retryAddr) {
      retryAddr.disabled = true;
      retryAddr.textContent = 'در حال تلاش…';
      await loadAddresses();
      return;
    }

    // ویرایش: فرم پایین با مقادیر فعلی پر می‌شود و دکمه «ذخیره‌ی تغییرات» می‌شود
    const eBtn = e.target.closest('.addr-edit-btn');
    if (eBtn) {
      const a = ADDRS.find(x => String(x.id) === String(eBtn.dataset.edit));
      if (!a) return;
      editingAddr = a.id;
      document.getElementById('adrName').value = a.fullName;
      document.getElementById('adrPhone').value = a.phone;
      document.getElementById('adrProvince').value = a.province || '';
      document.getElementById('adrCity').value = a.city;
      document.getElementById('adrLine').value = a.addressLine;
      document.getElementById('adrPostal').value = a.postalCode || '';
      addrSubmitBtn.innerHTML = '<svg><use href="#i-save"/></svg> ذخیره‌ی تغییرات آدرس';
      formAddress.scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.getElementById('adrName').focus();
      return;
    }

    const btn = e.target.closest('.addr-del');
    if (!btn || btn.disabled) return;
    if (!confirm('این آدرس حذف شود؟')) return;
    btn.disabled = true;
    try {
      await PG.api(`/addresses/${btn.dataset.id}`, { method: 'DELETE' });
      PG.toast('آدرس حذف شد', 'info');
      if (String(editingAddr) === String(btn.dataset.id)) exitAddrEditMode();
      loadAddresses();
    } catch (err) {
      PG.toast(err.message, 'error');
      btn.disabled = false;
    }
  });

  formAddress.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertAddr.innerHTML = '';
    addrSubmitBtn.disabled = true;
    try {
      const body = JSON.stringify({
        fullName: document.getElementById('adrName').value.trim(),
        phone: document.getElementById('adrPhone').value.trim(),
        province: document.getElementById('adrProvince').value.trim(),
        city: document.getElementById('adrCity').value.trim(),
        addressLine: document.getElementById('adrLine').value.trim(),
        postalCode: document.getElementById('adrPostal').value.trim()
      });
      if (editingAddr) await PG.api(`/addresses/${editingAddr}`, { method: 'PUT', body });
      else await PG.api('/addresses', { method: 'POST', body });
      PG.toast(editingAddr ? 'آدرس ویرایش شد ✅' : 'آدرس ذخیره شد ✅', 'success');
      exitAddrEditMode();
      loadAddresses();
    } catch (err) {
      alertAddr.innerHTML = `<div class="alert alert-error"><svg><use href="#i-alert"/></svg><span>${escT(err.message)}</span></div>`;
    } finally {
      addrSubmitBtn.disabled = false;
    }
  });

  loadAddresses();

  // ---------- رمز عبور ----------
  const formPassword = document.getElementById('formPassword');
  const alertPass = document.getElementById('alertPass');
  const btnRemovePass = document.getElementById('btnRemovePass');
  const passHint = document.getElementById('passHint');

  function syncPassUi(hasPassword) {
    btnRemovePass.classList.toggle('hidden', !hasPassword);
    passHint.textContent = hasPassword
      ? 'رمز عبور فعال است ✅ — موقع ورود می‌تونید «ورود با رمز عبور» رو انتخاب کنید.'
      : 'اگه رمز بذارید، دفعه‌های بعد می‌تونید بدون منتظر پیامک موندن وارد بشید.';
  }
  syncPassUi(Boolean(user.hasPassword));

  formPassword.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertPass.innerHTML = '';
    const btn = formPassword.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const r = await PG.api('/auth/password/set', {
        method: 'POST',
        body: JSON.stringify({ password: document.getElementById('newPass').value })
      });
      formPassword.reset();
      syncPassUi(true);
      // اگر نشستی کشته شد باید گفته شود، وگرنه کاربر روی گوشیِ دیگرش بیرون
      // انداخته می‌شود و فکر می‌کند سایت خراب است.
      PG.toast(r.revoked
        ? `رمز عبور ذخیره شد ✅ — ${PG.num(r.revoked)} دستگاه دیگر از حساب خارج شد`
        : 'رمز عبور ذخیره شد ✅', 'success');
      loadSessions();
    } catch (err) {
      alertPass.innerHTML = `<div class="alert alert-error"><svg><use href="#i-alert"/></svg><span>${escT(err.message)}</span></div>`;
    } finally {
      btn.disabled = false;
    }
  });

  btnRemovePass.addEventListener('click', async () => {
    if (!confirm('رمز حذف شود؟ (بعدش فقط با کد پیامکی می‌تونید وارد شید)')) return;
    try {
      await PG.api('/auth/password/remove', { method: 'POST' });
      syncPassUi(false);
      PG.toast('رمز حذف شد', 'info');
    } catch (err) {
      PG.toast(err.message, 'error');
    }
  });

  /* ---------- دستگاه‌های وارد‌شده ----------
     چرا این بخش هست: کوکیِ نشست ۳۰ روز اعتبار دارد و httpOnly است، پس
     جاوااسکریپتِ تزریقی نمی‌تواند بخواندش. ولی اگر به هر راهِ دیگری لو برود
     (گوشیِ گم‌شده، کامپیوترِ عمومی، بدافزار)، تا امروز هیچ راهی برای کشتنش
     نبود و کاربر باید ۳۰ روز صبر می‌کرد. */
  const sessHint = document.getElementById('sessHint');
  const alertSess = document.getElementById('alertSess');
  const btnLogoutOthers = document.getElementById('btnLogoutOthers');

  async function loadSessions() {
    try {
      const { count } = await PG.api('/auth/sessions');
      const others = Math.max(0, count - 1);
      sessHint.textContent = others
        ? `این حساب روی ${PG.num(count)} دستگاه باز است. اگر جایی را نمی‌شناسید، از همه خارج شوید.`
        : 'فقط همین دستگاه به حساب شما وارد است.';
      btnLogoutOthers.disabled = others === 0;
    } catch (err) {
      // شمارش نشستن نیامد؟ دکمه باید کار کند — کاربری که نگران است نباید
      // به‌خاطر یک شمارنده‌ی خراب بی‌ابزار بماند.
      sessHint.textContent = 'تعداد دستگاه‌ها خوانده نشد، ولی دکمه‌ی زیر کار می‌کند.';
      btnLogoutOthers.disabled = false;
    }
  }
  loadSessions();

  btnLogoutOthers.addEventListener('click', async () => {
    if (!confirm('همه‌ی دستگاه‌های دیگر از حساب شما خارج شوند؟ (این دستگاه باز می‌ماند)')) return;
    btnLogoutOthers.disabled = true;
    alertSess.innerHTML = '';
    try {
      const r = await PG.api('/auth/logout-others', { method: 'POST' });
      PG.toast(r.revoked
        ? `${PG.num(r.revoked)} دستگاه دیگر خارج شد ✅`
        : 'دستگاه دیگری وارد نبود', 'success');
      loadSessions();
    } catch (err) {
      alertSess.innerHTML = `<div class="alert alert-error"><svg><use href="#i-alert"/></svg><span>${escT(err.message)}</span></div>`;
      btnLogoutOthers.disabled = false;
    }
  });

  document.getElementById('btnLogout').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (btn.dataset.busy) return;
    btn.dataset.busy = '1';
    try {
      await PG.api('/auth/logout', { method: 'POST' });
      location.href = 'index.html';
    } catch (err) {
      // مهم است که سکوت نکنیم: اگر خروج انجام نشده و ما بی‌صدا به صفحه‌ی اول
      // ببریم، کاربر فکر می‌کند خارج شده در حالی که نشستش هنوز باز است — روی
      // کامپیوترِ مشترک یعنی نفر بعدی وارد حساب او می‌شود.
      delete btn.dataset.busy;
      PG.toast(`${err.message} خروج انجام نشد؛ دوباره بزن.`, 'error');
    }
  });
}));


// ---------- فاکتور چاپی ----------
// برگه در همان صفحه ساخته می‌شود و با @media print تنها چیزِ قابل‌چاپ می‌شود.
// چرا نه یک صفحه‌ی جدا یا window.open: صفحه‌ی جدا یک آدرس می‌سازد که اگر لو برود
// سفارش را نشان می‌دهد، و پنجره‌ی پاپ‌آپ را مرورگرهای موبایل می‌بندند.
function printInvoice(order, user) {
  const sheet = document.getElementById('invoiceSheet');
  if (!sheet) return;

  const shop = (window.PG && PG.SHOP) || {};
  const shopName = shop.shopName || 'پلاسکو گلی';
  const shopPhone = shop.shopPhone || '';
  const addr = order.address || {};

  // جمعِ اقلام را از خودِ اقلام حساب می‌کنیم، نه از total.
  // چرا: total مبلغِ نهاییِ پرداخت‌شده است (کالاها − تخفیف + ارسال). اگر همان را
  // بالای جدول بنویسیم، فاکتور با خودش نمی‌خواند و مشتری حق دارد فکر کند
  // اشتباه حساب کرده‌ایم.
  const itemsTotal = order.items.reduce((s, i) => s + Number(i.price) * Number(i.qty), 0);

  const dt = (v) => v ? new Date(v).toLocaleString('fa-IR', {
    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
  }) : '—';

  sheet.innerHTML = `
    <div class="inv-head">
      <div class="inv-brand">
        <b>${PG.esc(shopName)}</b>
        <span>ساری، بلوار کشاورز، قبل از مسجد صاحب‌الزمان</span>
        ${shopPhone ? `<span>تلفن: <bdo dir="ltr">${PG.esc(shopPhone)}</bdo></span>` : ''}
      </div>
      <div class="inv-id">
        <b>فاکتور فروش</b>
        <span>شماره سفارش: ${PG.num(order.id)}</span>
        <span>تاریخ ثبت: ${dt(order.createdAt)}</span>
        ${order.paidAt ? `<span>تاریخ پرداخت: ${dt(order.paidAt)}</span>` : ''}
      </div>
    </div>

    <div class="inv-parties">
      <div>
        <h4>خریدار</h4>
        <p>${PG.esc(addr.fullName || user.fullName || '—')}</p>
        <p><bdo dir="ltr">${PG.esc(addr.phone || user.phone || '')}</bdo></p>
      </div>
      <div>
        <h4>نشانی تحویل</h4>
        <p>${PG.esc([addr.province, addr.city].filter(Boolean).join('، '))}</p>
        <p>${PG.esc(addr.addressLine || '')}</p>
        ${addr.postalCode ? `<p>کدپستی: <bdo dir="ltr">${PG.esc(addr.postalCode)}</bdo></p>` : ''}
      </div>
    </div>

    <table class="inv-table">
      <thead>
        <tr><th>#</th><th>شرح کالا</th><th>تعداد</th><th>قیمت واحد</th><th>مبلغ</th></tr>
      </thead>
      <tbody>
        ${order.items.map((i, n) => `
          <tr>
            <td>${PG.num(n + 1)}</td>
            <td>${PG.esc(i.title)}</td>
            <td>${PG.num(i.qty)}</td>
            <td>${PG.money(i.price)}</td>
            <td>${PG.money(Number(i.price) * Number(i.qty))}</td>
          </tr>`).join('')}
      </tbody>
    </table>

    <div class="inv-sums">
      <div><span>جمع کالاها</span><span>${PG.money(itemsTotal)} تومان</span></div>
      ${order.discount > 0 ? `<div><span>تخفیف${order.couponCode ? ` (کد ${PG.esc(order.couponCode)})` : ''}</span><span>−${PG.money(order.discount)} تومان</span></div>` : ''}
      <div><span>هزینه ارسال</span><span>${order.shippingFee > 0 ? PG.money(order.shippingFee) + ' تومان' : 'رایگان'}</span></div>
      <div class="inv-grand"><span>مبلغ قابل پرداخت</span><span>${PG.money(order.total)} تومان</span></div>
    </div>

    <div class="inv-foot">
      <p>وضعیت سفارش در زمان چاپ: <b>${PG.statusLabel(order.status)}</b>${order.trackingCode ? ` — کد رهگیری پستی: <bdo dir="ltr">${PG.esc(order.trackingCode)}</bdo>` : ''}</p>
      <p>مهلت مرجوعی: تا ۷ روز پس از تحویل، طبق <span class="inv-url">قوانین فروشگاه</span>.</p>
      <p class="inv-thanks">از خریدتان سپاسگزاریم.</p>
    </div>`;

  // چرا هر دو مرحله لازم است:
  //  ۱) کلاس روی <html> تعیین می‌کند موقع چاپ چه چیزی دیده شود.
  //  ۲) عنوان صفحه اسمِ پیش‌فرضِ فایل PDF می‌شود؛ بدون این، فایل «حساب کاربری»
  //     نام می‌گیرد و مشتری بین ده فاکتور گم می‌شود.
  const prevTitle = document.title;
  document.title = `فاکتور سفارش ${PG.num(order.id)} — ${shopName}`;
  document.documentElement.classList.add('printing-invoice');

  const cleanup = () => {
    document.documentElement.classList.remove('printing-invoice');
    document.title = prevTitle;
  };
  // afterprint در بعضی مرورگرها (سافاری قدیم) شلیک نمی‌شود؛ تایمر شبکه‌ی ایمنی
  // است تا صفحه در حالت چاپ گیر نکند.
  window.addEventListener('afterprint', cleanup, { once: true });
  setTimeout(cleanup, 60000);

  window.print();
}
