// راه‌اندازی داخل PG.boot: اگر درخواستِ اول بترکد، به‌جای صفحه‌ی نیمه‌کاره‌ی
// ساکت، پیام فارسی + دکمه‌ی تلاش دوباره نشان داده می‌شود.
document.addEventListener('DOMContentLoaded', () => PG.boot(async () => {
  const params = new URLSearchParams(location.search);
  const orderId = params.get('orderId');

  const titleEl = document.getElementById('resultTitle');
  const descEl = document.getElementById('resultDesc');
  const actionsEl = document.getElementById('resultActions');
  const iconEl = document.querySelector('#resultCard svg use');
  const detailsEl = document.getElementById('orderDetails');

  if (!orderId) {
    titleEl.textContent = 'سفارشی پیدا نشد';
    descEl.textContent = 'لینک نامعتبر است.';
    actionsEl.innerHTML = `<a href="index.html" class="btn btn-primary">بازگشت به فروشگاه</a>`;
    return;
  }

  const { user } = await PG.api('/auth/me');
  if (!user) {
    location.href = `login.html?next=${encodeURIComponent(`order-success.html?orderId=${orderId}`)}`;
    return;
  }

  try {
    const { order } = await PG.api(`/orders/${orderId}`);
    PG.refreshCartBadge();

    // متنِ هر وضعیت جداگانه نوشته می‌شود. قبلاً هر چیزی جز paid یک پیام می‌گرفت:
    // «مبلغی از حساب شما کسر نشده» — و این درباره‌ی پول ادعای قطعی‌ای بود که از
    // دست ما درنمی‌آید. در حالت pending_payment یعنی اصلاً تأییدیه‌ای از درگاه
    // نگرفته‌ایم؛ کاملاً ممکن است بانک پول را گرفته باشد. دروغ گفتن درباره‌ی پول
    // بدترین چیزی است که می‌شود اشتباه گفت.
    const paidLike = ['paid', 'shipped', 'delivered', 'return_requested', 'returned'].includes(order.status);
    const canReorder = ['failed', 'canceled', 'pending_payment'].includes(order.status);

    if (paidLike) {
      iconEl.setAttribute('href', '#i-check-circle');
      document.querySelector('#resultCard svg').style.color = 'var(--teal)';
      titleEl.textContent = 'پرداخت با موفقیت انجام شد';
      descEl.textContent = `شماره سفارش شما: ${PG.num(order.id)} — رسیدش را در «سفارش‌های من» می‌بینید.`;
    } else if (order.status === 'pending_payment') {
      iconEl.setAttribute('href', '#i-alert');
      document.querySelector('#resultCard svg').style.color = 'var(--gold)';
      titleEl.textContent = 'نتیجه‌ی پرداخت هنوز مشخص نیست';
      descEl.textContent = 'تأییدیه‌ای از درگاه به ما نرسیده. چند دقیقه صبر کنید و همین صفحه را یک بار تازه کنید. '
        + 'اگر باز هم همین را دید و مبلغی از حسابتان کم شده، بانک آن را حداکثر تا ۷۲ ساعت خودکار برمی‌گرداند.';
    } else if (order.status === 'canceled') {
      iconEl.setAttribute('href', '#i-alert');
      document.querySelector('#resultCard svg').style.color = 'var(--coral)';
      titleEl.textContent = 'این سفارش لغو شده';
      descEl.textContent = order.cancelReason || 'اگر هنوز کالا را می‌خواهید، با یک دکمه دوباره سفارش بدهید.';
    } else {
      iconEl.setAttribute('href', '#i-alert');
      document.querySelector('#resultCard svg').style.color = 'var(--coral)';
      titleEl.textContent = 'پرداخت انجام نشد';
      descEl.textContent = 'سفارش ثبت نشد و کالاها به انبار برگشتند. اگر مبلغی از حسابتان کم شده باشد، '
        + 'بانک آن را حداکثر تا ۷۲ ساعت خودکار برمی‌گرداند.';
    }

    // «دوباره تلاش کنید» بدون دکمه، حرفِ توخالی بود: سبد موقع رفتن به درگاه خالی
    // می‌شود، پس تلاش دوباره یعنی چیدن کل سبد از صفر. حالا یک دکمه همان اقلام را
    // برمی‌گرداند و مشتری مستقیم می‌رود سبد.
    actionsEl.innerHTML = `
      ${canReorder ? `<button type="button" class="btn btn-primary" data-reorder="${order.id}">
        <svg><use href="#i-cart"/></svg> دوباره سفارش بده
      </button>` : ''}
      <a href="account.html" class="btn btn-outline" style="margin-inline-start:10px">سفارش‌های من</a>
      <a href="index.html#products" class="btn ${canReorder ? 'btn-outline' : 'btn-primary'}" style="margin-inline-start:10px">ادامه‌ی خرید</a>
    `;

    const reorderBtn = actionsEl.querySelector('[data-reorder]');
    if (reorderBtn) {
      reorderBtn.addEventListener('click', async () => {
        reorderBtn.disabled = true;
        const idle = reorderBtn.innerHTML;
        reorderBtn.textContent = 'در حال چیدن سبد…';
        try {
          const r = await PG.api(`/orders/${reorderBtn.dataset.reorder}/reorder`, { method: 'POST' });
          // کالاهای جاافتاده باید *گفته* شوند، وگرنه مشتری سبدِ کمتر از انتظارش را
          // می‌بیند و فکر می‌کند سایت خراب است.
          if (r.skipped && r.skipped.length) {
            PG.toast(`سبد چیده شد؛ ولی ${r.skipped.map(s => `«${s.title}» ${s.reason}`).join('، ')}`, 'info');
            setTimeout(() => { location.href = 'cart.html'; }, 2200);
          } else {
            location.href = 'cart.html';
          }
        } catch (err) {
          reorderBtn.disabled = false;
          reorderBtn.innerHTML = idle;
          PG.toast(err.message, 'error');
        }
      });
    }

    detailsEl.classList.remove('hidden');
    detailsEl.innerHTML = `
      <div class="order-item-head">
        <div><b>سفارش #${PG.num(order.id)}</b><div class="muted">${new Date(order.createdAt).toLocaleDateString('fa-IR')}</div></div>
        <span class="status-badge status-${order.status}">${PG.statusLabel(order.status)}</span>
      </div>
      <div class="order-item-products">
        ${order.items.map(i => `<div>${PG.esc(i.title)} × ${PG.money(i.qty)}</div>`).join('')}
      </div>
      <div class="order-item-total"><span>مبلغ کل</span><span>${PG.money(order.total)} تومان</span></div>
    `;
  } catch (err) {
    // همان اشتباهِ صفحه‌ی محصول اینجا هم بود: *هر* خطا — از جمله قطعیِ لحظه‌ایِ
    // اینترنت — به کسی که همین حالا پول داده می‌گفت «سفارشی پیدا نشد». برای مشتری
    // یعنی «پولم رفت و سفارشی هم نیست». فقط ۴۰۴ حق دارد این را بگوید.
    if (err.status === 404) {
      titleEl.textContent = 'سفارشی پیدا نشد';
      descEl.textContent = 'این شماره سفارش برای حساب شما نیست. اگر پرداخت کرده‌اید، سفارش‌های من را ببینید.';
      actionsEl.innerHTML = `
        <a href="account.html" class="btn btn-primary">سفارش‌های من</a>
        <a href="index.html" class="btn btn-outline" style="margin-inline-start:10px">بازگشت به فروشگاه</a>`;
      return;
    }
    titleEl.textContent = 'وضعیت سفارش را نتوانستیم بگیریم';
    descEl.textContent = `${err.message} سفارش شما سر جایش است؛ فقط این صفحه نتوانست وضعیتش را بخواند.`;
    actionsEl.innerHTML = `
      <button type="button" class="btn btn-primary" onclick="location.reload()">تلاش دوباره</button>
      <a href="account.html" class="btn btn-outline" style="margin-inline-start:10px">سفارش‌های من</a>`;
  }
}));

