/* تطبیقِ سفارش‌های رهاشده با درگاه پرداخت.
 *
 * ---------- مسئله ----------
 * تنها جایی که سایت می‌فهمد «این آدم پول داد» مسیرِ /payment-callback است، و آن
 * مسیر فقط وقتی صدا زده می‌شود که **مرورگرِ مشتری از زرین‌پال برگردد**.
 *
 * مرورگر همیشه برنمی‌گردد: اینترنت قطع می‌شود، مشتری تبِ بانک را می‌بندد، گوشی
 * زنگ می‌خورد و اپ می‌میرد، باتری تمام می‌شود. در همه‌ی این حالت‌ها پول از حساب
 * مشتری رفته و سایت خبر ندارد. نیم‌ساعت بعد (ORDER_TTL_MS) کارِ دوره‌ای سفارش را
 * `failed` می‌کرد و موجودی را آزاد می‌کرد — یعنی **پول را گرفتیم و سفارش را هم
 * دور انداختیم**، و مشتری روز بعد زنگ می‌زند و ما در پنل چیزی جز یک سفارشِ
 * ناموفق نمی‌بینیم. این بدترین حالتِ ممکن است: هم پولِ مشتری، هم اعتبارِ مغازه.
 *
 * ---------- راه‌حل ----------
 * قبل از باطل‌کردنِ هر سفارشِ منقضی که authority دارد، یک بار از خودِ درگاه
 * می‌پرسیم «تکلیفِ این تراکنش چه شد؟». سه جواب ممکن است:
 *
 *   paid    → همان کاری که کال‌بک می‌کرد: سفارش `paid` و پیامک‌ها فرستاده شود.
 *   unpaid  → درگاه گفت پولی گرفته نشده. حالا باطل‌کردن امن است.
 *   unknown → به درگاه نرسیدیم. **کاری نمی‌کنیم** و پنج دقیقه بعد دوباره می‌پرسیم.
 *
 * حالتِ سوم قلبِ ماجراست. یک قطعیِ گذرای شبکه نباید سفارشِ پرداخت‌شده را باطل
 * کند؛ پس پیش‌فرضِ ما در ندانستن «دست نزن» است، نه «باطل کن».
 *
 * ---------- چرا verify و نه یک endpointِ فقط-خواندنی ----------
 * در زرین‌پال، `verify` هم می‌پرسد و هم تسویه می‌کند. تراکنشی که پرداخت شده ولی
 * هرگز verify نشود، بعد از مدتی خودکار به حسابِ مشتری برمی‌گردد. پس این استعلام
 * صرفاً «باخبر شدن» نیست — همان کاری است که از اول باید انجام می‌شد و نشد.
 * کد ۱۰۱ («قبلاً تایید شده») هم موفق حساب می‌شود، پس تکرارش بی‌خطر است.
 *
 * ---------- مهلتِ تسلیم ----------
 * اگر درگاه GIVE_UP_AFTER_MS طولانی در دسترس نباشد، سفارش را `failed` می‌کنیم و
 * با هشدارِ صریح در لاگ ثبت می‌شود. دلیلش این است که موجودیِ رزروشده تا ابد
 * قفل نماند و کالایی که واقعاً در انبار هست «ناموجود» نشان داده نشود. عدد
 * سخاوتمندانه است (۲۴ ساعت) چون از دست دادنِ یک سفارشِ پرداخت‌شده خیلی گران‌تر
 * از قفل‌ماندنِ چند روزه‌ی موجودیِ یک قلم است. چنین سفارشی در لاگ با
 * RECONCILE-GIVEUP علامت می‌خورد تا دستی بررسی شود.
 */
const {
  getStaleOrdersToReconcile, bumpReconcileTries,
  markOrderPaid, markOrderFailedTx, getOrder, getUserPhone
} = require('./db');
const { inquirePayment } = require('./payment');
const { notifyAdminNewOrder, notifyCustomerOrderStatus } = require('./sms');
const log = require('./logger');

// بعد از این مدت از انقضای سفارش، اگر هنوز جوابِ قطعی نگرفته‌ایم تسلیم می‌شویم
const GIVE_UP_AFTER_MS = 24 * 60 * 60 * 1000;

// سقفِ هر اجرا. سرور تک‌نخی است و هر استعلام یک رفت‌وبرگشتِ شبکه دارد؛ بدون
// سقف، یک صفِ انباشته می‌توانست چند دقیقه درخواست‌های دیگر را عقب بیندازد.
// اینها پشتِ سر هم (نه موازی) پرسیده می‌شوند تا درگاه را هم سیل نکنیم.
const MAX_PER_RUN = 20;

async function reconcileStaleOrders() {
  const rows = getStaleOrdersToReconcile(MAX_PER_RUN);
  if (!rows.length) return { checked: 0, paid: 0, failed: 0, unknown: 0 };

  let paid = 0, failed = 0, unknown = 0;

  for (const row of rows) {
    bumpReconcileTries(row.id);

    let result;
    try {
      result = await inquirePayment({ authority: row.authority, amountToman: row.total });
    } catch (e) {
      // inquirePayment خودش خطاها را می‌گیرد؛ این فقط تورِ ایمنیِ آخر است
      result = { verdict: 'unknown', reason: e.message };
    }

    if (result.verdict === 'paid') {
      // markOrderPaid فقط روی pending_payment اثر می‌کند، پس اگر در همین فاصله
      // کال‌بکِ مشتری هم رسیده باشد، دوباره‌کاری نمی‌شود.
      if (markOrderPaid(row.id, result.refId)) {
        paid++;
        log.warn(`RECONCILE-PAID: order ${row.id} was paid at the gateway but the customer never returned; recovered (refId: ${result.refId})`);
        const order = getOrder(row.id);
        notifyAdminNewOrder(order).catch(e => log.error('Admin notification failed after reconcile', e));
        notifyCustomerOrderStatus(order, getUserPhone(order.userId))
          .catch(e => log.error('Customer notification failed after reconcile', e));
      }
      continue;
    }

    if (result.verdict === 'unpaid') {
      if (markOrderFailedTx(row.id)) failed++;
      continue;
    }

    // unknown — درگاه در دسترس نبود
    unknown++;
    const overdueMs = Date.now() - Number(row.expires_at || 0);
    if (overdueMs > GIVE_UP_AFTER_MS) {
      if (markOrderFailedTx(row.id)) {
        failed++;
        log.error(`RECONCILE-GIVEUP: order ${row.id} could not be verified with the gateway for over 24h (${row.reconcile_tries + 1} tries, last error: ${result.reason}). Marked failed and stock released — CHECK THIS ORDER MANUALLY in the Zarinpal panel.`);
      }
    }
  }

  if (paid || failed || unknown) {
    log.info(`Reconcile: ${rows.length} checked, ${paid} recovered as paid, ${failed} failed, ${unknown} still unknown`);
  }
  return { checked: rows.length, paid, failed, unknown };
}

module.exports = { reconcileStaleOrders, GIVE_UP_AFTER_MS };
