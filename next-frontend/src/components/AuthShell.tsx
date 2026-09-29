import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, SpriteIcon } from "@/components/Icon";

// ============================================================
// پوسته‌ی صفحه‌ی ورود — همتای `frontend/login.html` + `.auth-page` در style.css
// ============================================================
// چرا این فایل وجود دارد: صفحه‌ی ورود در Express یک صفحه‌ی **تمام‌صفحه و
// بی‌هدر** بود (کلاسِ `auth-page` روی body، بدون هدر و پاورقی) با سه چیز که
// در Next هیچ‌کدام نبود:
//
//   ۱. پس‌زمینه‌ی زنده — سه هاله‌ی رنگی + شش آیکونِ وسیله‌ی خانه که آرام شناورند.
//   ۲. ستونِ معرفی (فقط دسکتاپ) — «چرا اینجا خرید کنم» در همان لحظه‌ای که
//      مشتری فرمِ ورود را می‌بیند؛ روی موبایل کامل حذف می‌شود تا فرم بالا بماند.
//   ۳. ردیفِ اعتماد + دو خطِ حقوقی زیر کارت، و دکمه‌ی «بازگشت به فروشگاه» که
//      جای هدرِ حذف‌شده را می‌گیرد.
//
// بدون ۱ و ۳، `/login` در Next فقط یک کارتِ لخت وسطِ صفحه بود: همان صفحه‌ای که
// Express سال‌ها با آن مشتری را به ثبت‌نام می‌برد، به یک فرمِ خالی تقلیل
// می‌یافت. (`shellParity.test.ts` نبودِ دوباره‌ی این‌ها را می‌گیرد.)
//
// آیکون‌های شناور از اسپرایتِ تزریق‌شده می‌آیند (`SpriteIcon`)، چون تصویرسازیِ
// دسته‌بندی‌ها ۴۸×۴۸ و رنگی است و در قالبِ ۲۴×۲۴ این پروژه جا نمی‌شود.

const FLOATING_ICONS = ["i-tub", "i-basket", "i-bucket", "i-chair", "i-dishrack", "i-hanger"];

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-page">
      {/*
        پس‌زمینه تزئینی است و برای screen reader معنايی ندارد؛ `aria-hidden`
        می‌گذارد کاربرِ کیبورد شش `<use>` بی‌مقدار را تب نکند.
        `pointer-events:none` هم در CSS هست تا روی دکمه‌ی بازگشت نیفتد.
      */}
      <div className="auth-bg" aria-hidden="true">
        <div className="ab-blob ab-1" />
        <div className="ab-blob ab-2" />
        <div className="ab-blob ab-3" />
        {FLOATING_ICONS.map((id, i) => (
          <SpriteIcon key={id} id={id} size={44} className={`ab-float af-${i + 1}`} />
        ))}
      </div>

      {/* با حذفِ هدر، این تنها راهِ برگشت به فروشگاه است. */}
      <Link href="/" className="auth-back">
        <Icon name="arrowRight" />
        بازگشت به فروشگاه
      </Link>

      <div className="auth-shell">
        <div className="auth-layout">
          <aside className="auth-aside">
            <p className="aa-kicker">فروشگاه پلاسکو گلی</p>
            <h2 className="aa-title">
              هر چیزی که خانه لازم دارد،
              <br />
              <span>یک‌جا و با قیمت درست</span>
            </h2>
            <p className="aa-lead">
              با یک شماره موبایل وارد شوید. نه فرم طولانی، نه رمز اجباری — کد
              می‌آید، وارد می‌کنید، تمام.
            </p>

            <ul className="aa-points">
              <li>
                <span className="aap-ic">
                  <Icon name="truck" />
                </span>
                <span>
                  <b>ارسال به سراسر کشور</b>
                  <em>سفارش‌های بالای حد مشخص، ارسال رایگان</em>
                </span>
              </li>
              <li>
                <span className="aap-ic">
                  <Icon name="shield" />
                </span>
                <span>
                  <b>پرداخت امن زرین‌پال</b>
                  <em>اطلاعات کارت شما هرگز به فروشگاه نمی‌رسد</em>
                </span>
              </li>
              <li>
                <span className="aap-ic">
                  <Icon name="refresh" />
                </span>
                <span>
                  <b>۷ روز مهلت مرجوعی</b>
                  <em>کالا را پسندیدید نگه دارید، نپسندیدید برگردانید</em>
                </span>
              </li>
              <li>
                <span className="aap-ic">
                  <Icon name="checkCircle" />
                </span>
                <span>
                  <b>پیگیری لحظه‌ای سفارش</b>
                  <em>هر تغییر وضعیت، با پیامک به شما خبر داده می‌شود</em>
                </span>
              </li>
            </ul>

            <div className="aa-note">
              <Icon name="lock" />
              <span>
                شماره‌ی شما فقط برای ورود و اطلاع‌رسانی سفارش استفاده می‌شود.
              </span>
            </div>
          </aside>

          {/* ستونِ فرم — ترتیبِ بصری از طریق order در CSS تعیین می‌شود (فرم چپ، معرفی راست) */}
          <div className="auth-col">
            {children}

            <div className="auth-trust">
              <span>
                <Icon name="shield" /> پرداخت امن زرین‌پال
              </span>
              <span>
                <Icon name="truck" /> ارسال به سراسر کشور
              </span>
              <span>
                <Icon name="checkCircle" /> ضمانت جنس اصل
              </span>
            </div>

            {/*
              دقیقاً همان لحظه‌ای که کسی فقط برای دیدنِ وضعیت سفارش پیامک
              می‌گیرد: یک پیامکِ پولی کمتر برای ما، سه مرحله کار کمتر برای مشتری.
              (لنگرِ #track روی صفحه‌ی اصلی وجود دارد — `shellParity.test.ts`
              هر دو سرِ این لینک را چک می‌کند.)
            */}
            <p className="auth-legal">
              فقط می‌خواهید ببینید سفارشتان کجاست؟{" "}
              <Link href="/#track">بدون ورود پیگیری کنید</Link>
            </p>

            <p className="auth-legal">
              با ورود، <Link href="/terms">قوانین و مقررات</Link> فروشگاه را
              می‌پذیرید.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
