import { notFound } from "next/navigation";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { SignInForm } from "@/components/sign-in-form";
import { isAppLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

export default async function SignInPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const dictionary = await getDictionary(locale);
  const { auth, common } = dictionary;
  return (
    <main className="auth-page">
      <section aria-labelledby="sign-in-title" className="auth-panel">
        <div className="auth-toolbar">
          <a
            aria-label={common.homeLabel}
            className="wordmark"
            href={`/${locale}`}
          >
            <span>{common.wordmark}</span>
            <small>{common.wordmarkLatin}</small>
          </a>
          <LocaleSwitcher
            arabicLabel={common.arabic}
            englishLabel={common.english}
            label={common.language}
            locale={locale}
          />
        </div>
        <div className="auth-form-wrap">
          <div className="auth-heading">
            <p className="eyebrow">{auth.eyebrow}</p>
            <h1 id="sign-in-title">{auth.title}</h1>
            <p>{auth.intro}</p>
          </div>
          <SignInForm copy={auth} locale={locale} />
        </div>
        <p className="auth-privacy">{auth.privacy}</p>
      </section>
      <aside aria-label={auth.artLabel} className="auth-art">
        <div className="auth-art__content">
          <span className="auth-art__mark">{common.wordmark}</span>
          <blockquote>{auth.artQuote}</blockquote>
          <div className="auth-art__facts">
            <span>
              <strong>{auth.fact1Value}</strong> {auth.fact1Label}
            </span>
            <span>
              <strong>{auth.fact2Value}</strong> {auth.fact2Label}
            </span>
            <span>
              <strong>{auth.fact3Value}</strong> {auth.fact3Label}
            </span>
          </div>
        </div>
      </aside>
    </main>
  );
}
