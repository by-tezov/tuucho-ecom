import { lazy, Suspense, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLang } from '@kernel/front/assets/i18n';
import { localizedPath } from '@kernel/front/config/i18nRoutes';
import { ApiError } from '@kernel/front/api/errors';
import { submitAnonymousContactMessage } from '@kernel/front/api/contact';
import { isBackendUnavailableError } from '@kernel/front/api/http';
import { shopConfig } from '@kernel/front/config/env';
import { Seo } from '@kernel/front/components/seo/Seo';
import { LegalPageBackLink } from '@kernel/front/components/layout/LegalPageBackLink';
import { Button } from '@kernel/front/components/ui/Button';
import { RequiredFieldsNote, RequiredMark } from '@kernel/front/components/ui/RequiredMark';
import { ImageAttachField } from '@kernel/front/components/contact/ImageAttachField';
import { useAuthSession, useAuthPrompt } from '@kernel/front/state/AuthContext';
import { useIsDesktopNav } from '@kernel/front/hooks/useIsDesktopNav';
import { FIELD_CONTACT_IDENTITY_MAX, FIELD_CONTACT_MESSAGE_MAX, FIELD_EMAIL_MAX } from '@kernel/front/utils/fieldLimits';
import authFormStyles from '@kernel/front/components/auth/AuthForm.module.css';
import styles from './ContactPage.module.css';

/** Chat UI is authenticated-only and heavy (WS + attachments). Keep it off the
 * prerender entry chunk used to hydrate the anonymous contact form. */
const AccountContactChat = lazy(() =>
  import('./AccountContactChat').then((m) => ({ default: m.AccountContactChat })),
);

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ContactFieldErrors = {
  email?: string;
  identity?: string;
  message?: string;
};

export function ContactPage() {
  const { t, lang } = useLang();
  const { status } = useAuthSession();
  const { promptAuth } = useAuthPrompt();
  const isDesktopNav = useIsDesktopNav();
  const navigate = useNavigate();
  const isAuthenticated = status === 'authenticated';

  // Same modal-on-desktop, dedicated-page-on-mobile split as
  // useAccountEntry.ts's Header/MobileNav account entry — the mobile bottom
  // tab bar's own "Se connecter" tab goes to /login too, not a modal.
  // returnTo brings the visitor back here (not /home) once signed in,
  // since the contact page's chat was the whole reason they logged in.
  function openGuestLogin() {
    if (isDesktopNav) promptAuth('login');
    else navigate(localizedPath('/login', lang), { state: { returnTo: '/contact' } });
  }
  const [email, setEmail] = useState('');
  const [identity, setIdentity] = useState('');
  const [message, setMessage] = useState('');
  const [images, setImages] = useState<File[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ContactFieldErrors>({});
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentReplyEmail, setSentReplyEmail] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const formCardRef = useRef<HTMLDivElement>(null);
  const collapseFromHeightRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (!sent) return;
    const fromHeight = collapseFromHeightRef.current;
    collapseFromHeightRef.current = null;
    if (fromHeight == null) return;
    animateCardHeight(fromHeight);
  }, [sent]);

  function clearFieldError(field: keyof ContactFieldErrors) {
    setFieldErrors((current) => {
      if (current[field] == null) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
  }

  function validateGuestForm(): boolean {
    const next: ContactFieldErrors = {};
    const trimmedEmail = email.trim();
    if (!trimmedEmail) next.email = t.contact.emailRequiredError;
    else if (!EMAIL_PATTERN.test(trimmedEmail)) next.email = t.contact.emailInvalidError;
    if (!identity.trim()) next.identity = t.contact.identityRequiredError;
    if (!message.trim()) next.message = t.contact.messageRequiredError;
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  function errorMessage(error: unknown): string {
    if (!(error instanceof ApiError)) return t.contact.errorGeneric;
    if (error.code === 'contact_unavailable') return t.contact.errorUnavailable;
    if (error.code === 'too_large') return t.contact.errorImageTooLarge;
    if (error.code === 'too_many') return t.contact.errorImageTooMany;
    if (error.code === 'invalid_type' || error.code === 'processing_failed') {
      return t.contact.errorImageInvalidType;
    }
    if (error.status === 429) return t.contact.errorRateLimited;
    return t.contact.errorGeneric;
  }

  function animateCardHeight(fromHeight: number) {
    const card = formCardRef.current;
    if (!card) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      card.style.height = '';
      card.style.overflow = '';
      card.style.transition = '';
      return;
    }
    const toHeight = card.scrollHeight;
    card.style.height = `${fromHeight}px`;
    card.style.overflow = 'hidden';
    // Force layout so the browser registers the starting height before transitioning.
    void card.offsetHeight;
    card.style.transition = 'height 0.4s ease';
    card.style.height = `${toHeight}px`;
    const finish = (event: TransitionEvent) => {
      if (event.propertyName !== 'height') return;
      card.style.height = '';
      card.style.overflow = '';
      card.style.transition = '';
      card.removeEventListener('transitionend', finish);
    };
    card.addEventListener('transitionend', finish);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback(null);
    setAttachError(null);
    if (!validateGuestForm()) return;
    setSubmitting(true);
    setUploadProgress(images.length > 0 ? 0 : null);
    const fromHeight = formCardRef.current?.offsetHeight ?? 0;
    const onProgress = images.length > 0 ? (ratio: number) => setUploadProgress(ratio) : undefined;
    try {
      await submitAnonymousContactMessage({ email, identity, message, images }, onProgress);
      const replyEmail = email.trim();
      setMessage('');
      setEmail('');
      setIdentity('');
      setImages([]);
      setAttachError(null);
      setFieldErrors({});
      setSentReplyEmail(replyEmail || null);
      setFeedback({ tone: 'success', text: t.contact.success });
      collapseFromHeightRef.current = fromHeight;
      setSent(true);
    } catch (error) {
      if (isBackendUnavailableError(error)) return;
      // Keep message + images so the visitor can retry after a failed upload.
      setFeedback({ tone: 'error', text: errorMessage(error) });
    } finally {
      setUploadProgress(null);
      setSubmitting(false);
    }
  }

  return (
    <section
      aria-labelledby="contact-h"
      className={isAuthenticated ? `${styles.section} ${styles.sectionChat}` : styles.section}
    >
      <Seo title={t.seo.contactTitle} description={t.seo.contactDesc} path="/contact" />
      <div>
        <div className={styles.topRow}>
          <LegalPageBackLink placement="top" />
          <p className={styles.eyebrow}>{t.contact.eyebrow}</p>
        </div>
        <h1 id="contact-h" className={styles.title}>
          {t.contact.title}
        </h1>
        {!isAuthenticated ? (
          <p className={styles.intro}>
            <button type="button" className={styles.chatLink} onClick={openGuestLogin}>
              {t.contact.guestLoginHint}
            </button>
          </p>
        ) : null}

        {!isAuthenticated ? (
          <div ref={formCardRef} className={styles.form} data-testid="contact-form-card">
            {sent ? (
              <div className={styles.sentMessage} role="status" data-testid="contact-success">
                <p className={authFormStyles.success}>{feedback?.text ?? t.contact.success}</p>
                {sentReplyEmail ? (
                  <p className={styles.sentReplyTo}>
                    {t.contact.successReplyTo.replace('{email}', sentReplyEmail)}
                  </p>
                ) : null}
              </div>
            ) : (
              <form data-testid="contact-form" onSubmit={handleSubmit} noValidate>
                <h2 className={styles.formTitle}>{t.contact.formTitle}</h2>
                {feedback?.tone === 'error' ? (
                  <p className={authFormStyles.error} role="alert">
                    {feedback.text}
                  </p>
                ) : null}
                <RequiredFieldsNote />

                {!isAuthenticated && (
                  <>
                    <label className={authFormStyles.field}>
                      <span className={authFormStyles.label}>
                        {t.contact.emailLabel}
                        <RequiredMark />
                      </span>
                      <input
                        type="email"
                        autoComplete="email"
                        maxLength={FIELD_EMAIL_MAX}
                        className={authFormStyles.input}
                        data-testid="contact-email"
                        value={email}
                        aria-required="true"
                        aria-invalid={fieldErrors.email != null}
                        aria-describedby={fieldErrors.email ? 'contact-email-error' : undefined}
                        onChange={(event) => {
                          setEmail(event.target.value);
                          clearFieldError('email');
                        }}
                      />
                      {fieldErrors.email ? (
                        <p id="contact-email-error" className={authFormStyles.fieldError} role="alert">
                          {fieldErrors.email}
                        </p>
                      ) : null}
                    </label>
                    <label className={authFormStyles.field}>
                      <span className={authFormStyles.label}>
                        {t.contact.identityLabel}
                        <RequiredMark />
                      </span>
                      <input
                        type="text"
                        maxLength={FIELD_CONTACT_IDENTITY_MAX}
                        autoComplete="name"
                        className={authFormStyles.input}
                        data-testid="contact-identity"
                        value={identity}
                        aria-required="true"
                        aria-invalid={fieldErrors.identity != null}
                        aria-describedby={fieldErrors.identity ? 'contact-identity-error' : undefined}
                        onChange={(event) => {
                          setIdentity(event.target.value);
                          clearFieldError('identity');
                        }}
                      />
                      {fieldErrors.identity ? (
                        <p id="contact-identity-error" className={authFormStyles.fieldError} role="alert">
                          {fieldErrors.identity}
                        </p>
                      ) : null}
                    </label>
                  </>
                )}

                <label className={authFormStyles.field}>
                  <span className={authFormStyles.label}>
                    {t.contact.messageLabel}
                    <RequiredMark />
                  </span>
                  <textarea
                    maxLength={FIELD_CONTACT_MESSAGE_MAX}
                    rows={7}
                    name="message"
                    autoComplete="off"
                    className={styles.message}
                    data-testid="contact-message"
                    placeholder={t.contact.messagePlaceholder}
                    value={message}
                    aria-required="true"
                    aria-invalid={fieldErrors.message != null}
                    aria-describedby={fieldErrors.message ? 'contact-message-error' : undefined}
                    onChange={(event) => {
                      setMessage(event.target.value);
                      clearFieldError('message');
                    }}
                  />
                  {fieldErrors.message ? (
                    <p id="contact-message-error" className={authFormStyles.fieldError} role="alert">
                      {fieldErrors.message}
                    </p>
                  ) : null}
                </label>
                <ImageAttachField
                  label={t.contact.attachImagesLabel}
                  hint={t.contact.attachImagesHint}
                  removeAria={t.contact.attachRemoveAria}
                  files={images}
                  onChange={setImages}
                  disabled={submitting}
                  error={attachError}
                  onError={setAttachError}
                  errorTooMany={t.contact.errorImageTooMany}
                  errorInvalidType={t.contact.errorImageInvalidType}
                  errorTooLarge={t.contact.errorImageTooLarge}
                />
                {uploadProgress != null ? (
                  <div
                    className={styles.progress}
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(uploadProgress * 100)}
                  >
                    <div
                      className={styles.progressFill}
                      style={{ width: `${Math.round(uploadProgress * 100)}%` }}
                    />
                    <span className={styles.progressLabel}>
                      {t.contact.uploadProgress.replace(
                        '{percent}',
                        String(Math.round(uploadProgress * 100)),
                      )}
                    </span>
                  </div>
                ) : null}
                <Button type="submit" disabled={submitting} data-testid="contact-submit">
                  {submitting ? t.contact.submitting : t.contact.submit}
                </Button>
              </form>
            )}
          </div>
        ) : (
          <Suspense fallback={null}>
            <AccountContactChat />
          </Suspense>
        )}
      </div>

      <div className={styles.emailCard}>
        <p>
          {t.contact.emailCta} <a href={`mailto:${shopConfig.contactEmail}`}>{shopConfig.contactEmail}</a>
        </p>
      </div>
      <LegalPageBackLink placement="bottom" />
    </section>
  );
}
