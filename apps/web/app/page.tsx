import { SignInForm } from "@/components/sign-in-form";

export default function SignInPage() {
  return (
    <main className="auth-page">
      <section className="auth-panel" aria-labelledby="sign-in-title">
        <a className="wordmark" href="/" aria-label="دعوة، الصفحة الرئيسية">
          <span>دعوة</span>
          <small>DAWAH</small>
        </a>
        <div className="auth-form-wrap">
          <div className="auth-heading">
            <p className="eyebrow">لوحة إدارة المناسبات</p>
            <h1 id="sign-in-title">تسجيل الدخول</h1>
            <p>استخدم رقم الجوال المرتبط بحسابك. سيصلك رمز تحقق لمرة واحدة.</p>
          </div>
          <SignInForm />
        </div>
        <p className="auth-privacy">
          بتسجيل الدخول، أنت توافق على شروط الاستخدام وإشعار الخصوصية.
        </p>
      </section>
      <aside className="auth-art" aria-label="عن منصة دعوة">
        <div className="auth-art__content">
          <span className="auth-art__mark">دعوة</span>
          <blockquote>
            من قائمة الدعوات إلى تأكيد الحضور، كل شيء في مكان واحد.
          </blockquote>
          <div className="auth-art__facts">
            <span>
              <strong>١</strong> مجموعة دعوات لكل رقم واتساب
            </span>
            <span>
              <strong>٢</strong> حالة مستقلة للرد والتوصيل
            </span>
            <span>
              <strong>٣</strong> عدّ دقيق للأشخاص المتوقعين
            </span>
          </div>
        </div>
      </aside>
    </main>
  );
}
