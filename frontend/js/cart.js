// آخرین سبدی که رسم شده؛ برای اینکه هر بار +/− زدن نیازی به گرفتن دوباره‌ی سبد از سرور نداشته باشد
let CART = null;
// آیا لیست تا حالا رسم شده؟ انیمیشن ورودِ ردیف‌ها فقط بار اول باید اجرا شود،
// وگرنه با هر +/− کل لیست پلک می‌زند.
let FIRST_PAINT = true;

// قلم‌هایی که همین حالا درخواستشان در راه است. بدون این، دو بار سریع زدن روی «+»
// دو درخواست همزمان می‌فرستد که ترتیب رسیدنشان تضمینی نیست و تعدادِ روی صفحه
// می‌تواند با تعدادِ سرور یکی نباشد.
const BUSY = new Set();

document.addEventListener('DOMContentLoaded', async () => {
  // فقط خودِ گرفتنِ سبد داخل boot است، نه کل راه‌اندازی: اگر شبکه قطع باشد
  // دکمه‌های +/− و حذف باید همچنان بسته شوند تا بعد از تلاش دوباره کار کنند.
  await PG.boot(renderCart);

  document.getElementById('cartList').addEventListener('click', (e) => {
    const incBtn = e.target.closest('[data-inc]');
    const decBtn = e.target.closest('[data-dec]');
    const removeBtn = e.target.closest('[data-remove]');

    if (incBtn) return changeQty(incBtn.dataset.inc, 1);
    if (decBtn) return changeQty(decBtn.dataset.dec, -1);
    if (removeBtn) return removeItem(removeBtn.dataset.remove);
  });

  // کد تخفیف
  async function applyCoupon() {
    const input = document.getElementById('couponInput');
    const code = input.value.trim();
    if (!code) { PG.toast('اول کد را وارد کنید', 'error'); return input.focus(); }
    const btn = document.getElementById('couponApply');
    btn.disabled = true;
    try {
      paintCart(await PG.api('/cart/coupon', { method: 'POST', body: JSON.stringify({ code }) }));
      PG.toast('کد تخفیف اعمال شد', 'success');
      input.value = '';
    } catch (err) {
      PG.toast(err.message || 'کد معتبر نیست', 'error');
      input.select();
    } finally {
      btn.disabled = false;
    }
  }
  document.getElementById('couponApply').addEventListener('click', applyCoupon);
  document.getElementById('couponInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); }
  });
  document.getElementById('couponRemove').addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    try {
      paintCart(await PG.api('/cart/coupon/remove', { method: 'POST' }));
      PG.toast('کد تخفیف برداشته شد', 'info');
    } catch (err) {
      PG.toast(err.message || 'خطا در برداشتن کد', 'error');
      await renderCart();
    }
  });
});

async function changeQty(productId, delta) {
  if (BUSY.has(String(productId))) return;
  // تعداد فعلی را از همان چیزی که روی صفحه است می‌خوانیم؛ سرور خودش clamp و اعتبارسنجی می‌کند
  const item = CART?.items.find(i => String(i.productId) === String(productId));
  if (!item) return renderCart();

  const newQty = item.qty + delta;
  // زدن «−» روی تعداد ۱ یعنی حذف؛ ولی بی‌خبر حذف نکنیم — همان مسیر حذف با
  // امکان بازگرداندن استفاده می‌شود.
  if (newQty < 1) return removeItem(productId);

  setRowBusy(productId, true);
  try {
    // پاسخ /cart/update خودش سبد کامل است؛ پس یک درخواست کافی است (قبلاً سه تا بود)
    const cart = await PG.api('/cart/update', { method: 'POST', body: JSON.stringify({ productId, qty: newQty }) });
    paintCart(cart);
    if (cart.notice) PG.toast(cart.notice, 'info');
  } catch (err) {
    PG.toast(err.message || 'خطا در به‌روزرسانی سبد', 'error');
    await renderCart();
  } finally {
    BUSY.delete(String(productId));
  }
}

async function removeItem(productId) {
  if (BUSY.has(String(productId))) return;
  const item = CART?.items.find(i => String(i.productId) === String(productId));
  const snapshot = item ? { productId: item.productId, qty: item.qty, title: item.title } : null;

  setRowBusy(productId, true);
  try {
    paintCart(await PG.api('/cart/remove', { method: 'POST', body: JSON.stringify({ productId }) }));
    // حذف اشتباهی روی موبایل زیاد پیش می‌آید؛ یک راه برگشت می‌گذاریم تا مشتری
    // مجبور نشود دوباره محصول را پیدا کند (و در این فاصله از خرید منصرف شود).
    PG.toast(snapshot ? `«${snapshot.title}» حذف شد` : 'از سبد حذف شد', 'info', {
      action: {
        label: 'بازگرداندن',
        onClick: () => undoRemove(snapshot)
      }
    });
  } catch (err) {
    PG.toast(err.message || 'خطا در حذف محصول', 'error');
    await renderCart();
  } finally {
    BUSY.delete(String(productId));
  }
}

async function undoRemove(snapshot) {
  if (!snapshot) return;
  try {
    paintCart(await PG.api('/cart/add', {
      method: 'POST',
      body: JSON.stringify({ productId: snapshot.productId, qty: snapshot.qty })
    }));
    PG.toast('به سبد برگشت', 'success');
  } catch (err) {
    PG.toast(err.message || 'برگرداندن ممکن نشد', 'error');
    await renderCart();
  }
}

// ردیف را تا رسیدن پاسخ سرور نیمه‌شفاف و غیرفعال می‌کند
function setRowBusy(productId, on) {
  if (on) BUSY.add(String(productId));
  const row = document.querySelector(`.cart-row[data-id="${productId}"]`);
  if (!row) return;
  row.classList.toggle('is-busy', on);
  row.querySelectorAll('button').forEach(b => { b.disabled = on; });
}

async function renderCart() {
  paintCart(await PG.api('/cart'));
}

function paintCart(cart) {
  CART = cart;
  const emptyEl = document.getElementById('cartEmpty');
  const loadedEl = document.getElementById('cartLoaded');
  PG.paintCartBadge(cart.count);

  if (!cart.items.length) {
    emptyEl.classList.remove('hidden');
    loadedEl.classList.add('hidden');
    paintStickyBar(cart);
    return;
  }
  emptyEl.classList.add('hidden');
  loadedEl.classList.remove('hidden');

  const low = PG.lowStockAt();
  const listEl = document.getElementById('cartList');
  listEl.classList.toggle('first-paint', FIRST_PAINT);
  FIRST_PAINT = false;
  listEl.innerHTML = cart.items.map(item => {
    const atMax = item.qty >= item.maxQty;
    // هشدار موجودی: فقط وقتی واقعاً کم است، وگرنه بی‌دلیل نگران‌کننده می‌شود
    const stockNote = item.stock <= low
      ? `<span class="cart-row-stock${atMax ? ' at-max' : ''}">تنها ${PG.money(item.stock)} عدد در انبار</span>`
      : '';
    return `
    <div class="cart-row" data-id="${item.productId}">
      <a class="cart-row-media" href="product.html?id=${item.productId}" aria-label="${PG.esc(item.title)}">${item.image
        ? `<img src="${PG.esc(PG.thumb(item.image))}" alt="${PG.esc(item.title)}" loading="lazy" decoding="async">`
        : `<svg><use href="#${PG.esc(item.icon)}"/></svg>`}</a>
      <div class="cart-row-body">
        <a class="cart-row-title" href="product.html?id=${item.productId}">${PG.esc(item.title)}</a>
        <div class="cart-row-price">
          ${item.wholesale && item.wholesale.applies
            ? `<s>${PG.money(item.price)}</s> <b class="ws-price">${PG.money(item.unitPrice)}</b> تومان`
            : `${item.oldPrice ? `<s>${PG.money(item.oldPrice)}</s> ` : ''}${PG.money(item.price)} تومان`}
          <span class="cart-row-x">× ${PG.money(item.qty)}</span>
        </div>
        ${item.wholesale && item.wholesale.applies
          ? `<span class="cart-row-ws"><svg aria-hidden="true"><use href="#i-box"/></svg> تخفیف عمده اعمال شد — ${PG.money(item.wholesale.discount)}٪ (از ${PG.money(item.wholesale.minQty)} عدد)</span>`
          : ''}
        ${stockNote}
      </div>
      <div class="cart-row-end">
        <div class="stepper">
          <button type="button" data-dec="${item.productId}" aria-label="کم کردن تعداد ${PG.esc(item.title)}">−</button>
          <span aria-live="polite">${PG.money(item.qty)}</span>
          <button type="button" data-inc="${item.productId}" aria-label="زیاد کردن تعداد ${PG.esc(item.title)}"
            ${atMax ? 'disabled title="بیشتر از این موجود نیست"' : ''}>+</button>
        </div>
        <div class="cart-row-subtotal">${PG.money(item.subtotal)} تومان</div>
        ${item.savings > 0 ? `<div class="cart-row-save">${PG.money(item.savings)} تومان سود</div>` : ''}
        <button type="button" class="remove-link" data-remove="${item.productId}">حذف</button>
      </div>
    </div>`;
  }).join('');

  document.getElementById('sumCount').textContent = PG.money(cart.count);
  document.getElementById('sumItems').textContent = `${PG.money(cart.total)} تومان`;

  // صرفه‌جویی از تخفیف محصولات (مستقل از کد تخفیف)
  const sRow = document.getElementById('sumSaveRow');
  if (sRow) {
    const has = Number(cart.savings) > 0;
    sRow.hidden = !has;
    if (has) document.getElementById('sumSave').textContent = `${PG.money(cart.savings)} تومان`;
  }

  // کد تخفیف
  const dRow = document.getElementById('sumDiscountRow');
  if (cart.coupon && cart.discount > 0) {
    dRow.hidden = false;
    document.getElementById('sumCouponCode').textContent = cart.coupon.code;
    document.getElementById('sumDiscount').textContent = `−${PG.money(cart.discount)} تومان`;
  } else {
    dRow.hidden = true;
  }
  document.getElementById('couponForm').classList.toggle('hidden', Boolean(cart.coupon));
  document.getElementById('couponApplied').classList.toggle('hidden', !cart.coupon);
  document.getElementById('couponRemove').disabled = false;
  if (cart.coupon) document.getElementById('couponAppliedCode').textContent = cart.coupon.code;
  if (cart.couponNotice) PG.toast(cart.couponNotice, 'info');
  const shipEl = document.getElementById('sumShip');
  shipEl.textContent = cart.shippingFee > 0 ? `${PG.money(cart.shippingFee)} تومان` : 'رایگان';
  shipEl.classList.toggle('ship-free', !(cart.shippingFee > 0));
  document.getElementById('sumTotal').textContent = `${PG.money(cart.payable ?? cart.total)} تومان`;

  // نوار تشویقی «X تومان تا ارسال رایگان» — فقط وقتی فروشگاه آستانه تعریف کرده باشد
  const nudge = document.getElementById('freeShipNudge');
  if (nudge) {
    const over = cart.freeShippingOver || 0;
    const configured = over > 0 && (cart.shippingCost || 0) > 0;
    if (configured && cart.freeShippingGap > 0) {
      nudge.classList.remove('hidden', 'done');
      document.getElementById('freeShipText').innerHTML =
        `فقط <b>${PG.money(cart.freeShippingGap)} تومان</b> دیگر تا ارسال رایگان!`;
      document.getElementById('freeShipFill').style.width =
        `${Math.min(100, Math.round((cart.total / over) * 100))}%`;
    } else if (configured && cart.count > 0 && cart.total >= over) {
      nudge.classList.remove('hidden');
      nudge.classList.add('done');
      document.getElementById('freeShipText').textContent = 'ارسال این سفارش رایگان شد!';
      document.getElementById('freeShipFill').style.width = '100%';
    } else {
      nudge.classList.add('hidden');
    }
  }

  paintStickyBar(cart);
}

// نوار پایینِ موبایل: روی گوشی دکمه‌ی «تکمیل خرید» ته صفحه است و کاربر باید از
// کل لیست رد شود تا ببیندش. این نوار مبلغ و دکمه را همیشه در دسترس نگه می‌دارد.
function paintStickyBar(cart) {
  const bar = document.getElementById('cartStickyBar');
  if (!bar) return;
  const show = cart.items.length > 0;
  bar.classList.toggle('show', show);
  document.body.classList.toggle('has-cart-bar', show);
  if (!show) return;
  document.getElementById('barTotal').textContent = `${PG.money(cart.payable ?? cart.total)} تومان`;
  document.getElementById('barCount').textContent = `${PG.money(cart.count)} کالا`;
}
