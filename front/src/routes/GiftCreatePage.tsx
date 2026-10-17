import { Link } from 'react-router-dom';
import { localizedPath } from '../config/i18nRoutes';
import { GALLERY_PATH, HOME_PATH } from '../config/paths';
import { Seo } from '../components/seo/Seo';
import { Button } from '../components/ui/Button';
import { OtpCodeInput } from '../components/auth/OtpCodeInput';
import { LoadingModal } from '../components/ui/LoadingModal';
import { RequiredFieldsNote, RequiredMark } from '../components/ui/RequiredMark';
import { GiftShareCardPreview, GiftShareCardStylePicker } from '../components/gift/GiftShareCardPreview';
import { FilterSheet } from '../components/gallery/FilterSheet';
import { formatShareCardExpiryCaption, giftOfferExpiresAt } from '../components/gift/shareCardExpiry';
import { BudgetStepper } from '../components/gift/BudgetStepper';
import {
  budgetInt,
  GIFT_CREATE_COMMENT_MAX as COMMENT_MAX,
  useGiftCreateForm,
  withN,
} from '../hooks/useGiftCreateForm';
import { clampGiftComment } from '../utils/giftComment';
import { giftSetsEstimate } from '../utils/giftSetsEstimate';
import authFormStyles from '../components/auth/AuthForm.module.css';
import styles from './GiftCreatePage.module.css';
import { usePluginEnabled } from '../plugins/StorefrontBootstrap';
import { NotFoundPage } from './NotFoundPage';

function CardGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2" y="3.5" width="12" height="9" rx="1.2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M5 7h6M5 9.5h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function PinGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 2.2 9.1 5.4 12.5 6.2 9.8 8.5 10.3 12 8 10.4 5.7 12 6.2 8.5 3.5 6.2 6.9 5.4 Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function GiftCreatePage() {
  const giftOn = usePluginEnabled('commerce-gift');
  const form = useGiftCreateForm();
  const {
    t,
    lang,
    settings,
    isDesktopNav,
    signedIn,
    giverEmail,
    setGiverEmail,
    giverDisplayName,
    setGiverDisplayName,
    receiverName,
    setReceiverName,
    maxBudget,
    setMaxBudget,
    giverComment,
    setGiverComment,
    shareCardStyle,
    setShareCardStyle,
    allowAccessories,
    setAllowAccessories,
    maxAccessoryBudget,
    setMaxAccessoryBudget,
    hidePrices,
    setHidePrices,
    accessPin,
    setAccessPin,
    accessPinConfirm,
    setAccessPinConfirm,
    gdpr,
    setGdpr,
    errors,
    clearError,
    submitting,
    created,
    formError,
    budgetSheet,
    setBudgetSheet,
    onSubmit,
    budgetFloor,
    budgetCeiling,
    presets,
    accessoryPresets,
  } = form;

  // Printed under the budget field: euros mean nothing to a giver who has
  // never seen a set price, so the same budget is restated as a count.
  const setsEstimate = giftSetsEstimate(
    budgetInt(maxBudget),
    settings?.setPriceRange,
    settings?.maxSetsCeiling ?? 0,
  );
  const setsEstimateLabel =
    setsEstimate == null
      ? ''
      : setsEstimate <= 0
        ? t.gift.budgetSetsNone
        : setsEstimate === 1
          ? t.gift.budgetSetsOne
          : withN(t.gift.budgetSetsUpTo, setsEstimate);

  const cardPreview = (
    <GiftShareCardPreview
      style={created?.shareCardStyle ?? shareCardStyle}
      message={created?.giverComment ?? giverComment}
      giverDisplayName={created?.giverDisplayName ?? giverDisplayName}
      receiverName={created?.receiverName ?? receiverName}
      scanLabel={formatShareCardExpiryCaption(
        giftOfferExpiresAt(settings?.receiverTokenTtlDays ?? 30),
        lang,
        t.gift.shareCardUseBefore,
      )}
      qrAlt={t.gift.shareCardQrPreviewAlt}
      occasionLabel=""
    />
  );

  if (!giftOn) return <NotFoundPage />;

  return (
    <section className={styles.section}>
      <Seo title={t.gift.seoCreateTitle} description={t.gift.seoCreateDesc} path="/gift" />
      {created ? (
        <div
          className={styles.success}
          data-testid={created.guest ? 'gift-create-check-email' : 'gift-create-ready'}
        >
          <div className={styles.successHero}>
            <span className={styles.successMark} aria-hidden="true">
              ✓
            </span>
            <p className={styles.eyebrow}>{t.gift.createdEyebrow}</p>
            <h1 className={styles.title}>{t.gift.createdHeadline.replace('{name}', created.receiverName)}</h1>
            <div className={styles.lead}>
              {t.gift.createdMailNote.map((paragraph) => (
                <p key={paragraph}>{paragraph.replace('{email}', created.email)}</p>
              ))}
            </div>
          </div>
          <div className={styles.panel}>
            {cardPreview}
            <p className={styles.createdLegend}>{t.gift.createdCardLegend}</p>
          </div>
          <div className={`${styles.panel} ${styles.successCallout}`}>
            <h2 className={styles.calloutTitle}>{t.gift.pinShareTitle}</h2>
            <p className={styles.panelHint}>{t.gift.pinShareBody}</p>
            <div className={styles.pinReveal}>
              <span className={styles.pinDigits} data-testid="gift-created-pin">
                {created.pin}
              </span>
              <span className={styles.pinRevealHint}>{t.gift.pinShareHint}</span>
            </div>
          </div>
          <div className={styles.panel}>
            <h2 className={styles.panelTitle}>{t.gift.nextTitle}</h2>
            <ol className={styles.nextList}>
              {t.gift.nextSteps.map((step) => (
                <li key={step.n} className={styles.nextItem}>
                  <span className={styles.nextNum} aria-hidden="true">
                    {step.n}
                  </span>
                  <span className={styles.nextText}>{step.text}</span>
                </li>
              ))}
            </ol>
            <p className={styles.legalNote}>{t.gift.nextFoot}</p>
            <Button
              variant="ghost"
              className={styles.submit}
              to={localizedPath(isDesktopNav ? HOME_PATH : GALLERY_PATH, lang)}
            >
              {t.gift.createdUnderstood}
            </Button>
          </div>
        </div>
      ) : (
        <>
          <header className={styles.intro}>
            <p className={styles.eyebrow}>{t.gift.createEyebrow}</p>
            <h1 className={styles.title}>{t.gift.createHeadline}</h1>
            <div className={styles.lead}>
              {t.gift.createLead.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          </header>
          <section className={styles.how} aria-labelledby="gift-how-h">
            <h2 id="gift-how-h" className={styles.howTitle}>
              {t.gift.howTitle}
            </h2>
            <ol className={styles.steps}>
              {t.gift.howSteps.map((step) => (
                <li key={step.n} className={styles.step}>
                  <span className={styles.stepNum} aria-hidden="true">
                    {step.n}
                  </span>
                  <h3 className={styles.stepTitle}>{step.title}</h3>
                  <p className={styles.stepText}>{step.text}</p>
                </li>
              ))}
            </ol>
          </section>
          <section className={styles.callout} aria-labelledby="gift-handoff-h">
            <h2 id="gift-handoff-h" className={styles.calloutTitle}>
              {t.gift.handoffTitle}
            </h2>
            <p className={styles.calloutLead}>{t.gift.handoffLead}</p>
            <div className={styles.calloutGrid}>
              <div className={styles.calloutItem}>
                <span className={styles.calloutIcon}>
                  <CardGlyph />
                </span>
                <div>
                  <strong>{t.gift.handoffCardTitle}</strong>
                  <span>{t.gift.handoffCardText}</span>
                </div>
              </div>
              <div className={styles.calloutItem}>
                <span className={styles.calloutIcon}>
                  <PinGlyph />
                </span>
                <div>
                  <strong>{t.gift.handoffPinTitle}</strong>
                  <span>{t.gift.handoffPinText}</span>
                </div>
              </div>
            </div>
          </section>
          <form
            className={styles.grid}
            noValidate
            data-testid="gift-create-form"
            onSubmit={(event) => void onSubmit(event)}
          >
            <section className={`${styles.panel} ${styles.whoPanel}`}>
              <h2 className={styles.panelTitle}>{t.gift.whoTitle}</h2>
              <p className={styles.panelHint}>{t.gift.whoHint}</p>
              <RequiredFieldsNote />
              <div className={styles.fields}>
                {signedIn ? null : (
                  <div className={authFormStyles.field}>
                    <label className={authFormStyles.label} htmlFor="gift-giver-email">
                      {t.gift.giverEmailLabel}
                      <RequiredMark />
                    </label>
                    <input
                      id="gift-giver-email"
                      data-testid="gift-giver-email"
                      className={authFormStyles.input}
                      value={giverEmail}
                      autoComplete="email"
                      inputMode="email"
                      aria-required="true"
                      aria-invalid={errors.giverEmail != null}
                      aria-describedby={
                        errors.giverEmail ? 'gift-giver-email-error' : 'gift-giver-email-hint'
                      }
                      onChange={(event) => {
                        setGiverEmail(event.target.value);
                        clearError('giverEmail');
                      }}
                    />
                    {errors.giverEmail ? (
                      <p
                        id="gift-giver-email-error"
                        data-testid="gift-giver-email-error"
                        className={authFormStyles.fieldError}
                        role="alert"
                      >
                        {errors.giverEmail}
                      </p>
                    ) : (
                      <p id="gift-giver-email-hint" className={styles.hint}>
                        {t.gift.giverEmailHint}
                      </p>
                    )}
                  </div>
                )}
                <div className={styles.two}>
                  <div className={authFormStyles.field}>
                    <label className={authFormStyles.label} htmlFor="gift-giver-name">
                      {t.gift.giverNameLabel}
                      <RequiredMark />
                    </label>
                    <input
                      id="gift-giver-name"
                      data-testid="gift-giver-name"
                      className={authFormStyles.input}
                      value={giverDisplayName}
                      autoComplete="given-name"
                      aria-required="true"
                      aria-invalid={errors.giverDisplayName != null}
                      aria-describedby={errors.giverDisplayName ? 'gift-giver-name-error' : undefined}
                      onChange={(event) => {
                        setGiverDisplayName(event.target.value);
                        clearError('giverDisplayName');
                      }}
                    />
                    {errors.giverDisplayName ? (
                      <p
                        id="gift-giver-name-error"
                        data-testid="gift-giver-name-error"
                        className={authFormStyles.fieldError}
                        role="alert"
                      >
                        {errors.giverDisplayName}
                      </p>
                    ) : null}
                  </div>
                  <div className={authFormStyles.field}>
                    <label className={authFormStyles.label} htmlFor="gift-receiver-name">
                      {t.gift.receiverNameLabel}
                      <RequiredMark />
                    </label>
                    <input
                      id="gift-receiver-name"
                      data-testid="gift-receiver-name"
                      className={authFormStyles.input}
                      value={receiverName}
                      autoComplete="off"
                      aria-required="true"
                      aria-invalid={errors.receiverName != null}
                      aria-describedby={errors.receiverName ? 'gift-receiver-name-error' : undefined}
                      onChange={(event) => {
                        setReceiverName(event.target.value);
                        clearError('receiverName');
                      }}
                    />
                    {errors.receiverName ? (
                      <p
                        id="gift-receiver-name-error"
                        data-testid="gift-receiver-name-error"
                        className={authFormStyles.fieldError}
                        role="alert"
                      >
                        {errors.receiverName}
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className={authFormStyles.field}>
                  <label className={authFormStyles.label} htmlFor="gift-giver-comment">
                    {t.gift.giverCommentLabel}
                    <RequiredMark />
                  </label>
                  <textarea
                    id="gift-giver-comment"
                    data-testid="gift-giver-comment"
                    className={`${authFormStyles.input} ${styles.textarea}`}
                    value={giverComment}
                    maxLength={COMMENT_MAX}
                    aria-required="true"
                    aria-invalid={errors.giverComment != null}
                    aria-describedby={
                      errors.giverComment ? 'gift-giver-comment-error' : 'gift-giver-comment-hint'
                    }
                    onChange={(event) => {
                      setGiverComment(clampGiftComment(event.target.value));
                      clearError('giverComment');
                    }}
                  />
                  {errors.giverComment ? (
                    <p
                      id="gift-giver-comment-error"
                      data-testid="gift-giver-comment-error"
                      className={authFormStyles.fieldError}
                      role="alert"
                    >
                      {errors.giverComment}
                    </p>
                  ) : (
                    <span id="gift-giver-comment-hint" className={styles.charCount}>
                      <span>{t.gift.giverCommentHint}</span>
                      <span>
                        {giverComment.length}/{COMMENT_MAX}
                      </span>
                    </span>
                  )}
                </div>
              </div>
            </section>
            <section className={`${styles.panel} ${styles.budgetPanel}`}>
              <h2 className={styles.panelTitle}>{t.gift.budgetTitle}</h2>
              <p className={styles.panelHint}>{t.gift.budgetLead}</p>
              <div className={styles.fields}>
                <div>
                  <span className={authFormStyles.label} id="gift-max-budget-label">
                    {t.gift.maxBudgetLabel}
                    <RequiredMark />
                  </span>
                  {presets.length > 0 ? (
                    <>
                      {budgetSheet === 'sets' ? (
                        <FilterSheet
                          label={t.gift.maxBudgetLabel}
                          options={presets.map((value) => ({
                            value: String(value),
                            label: `${value} €`,
                          }))}
                          value={maxBudget.trim()}
                          onChange={(next) => {
                            setMaxBudget(next);
                            clearError('maxBudget');
                          }}
                          onClose={() => setBudgetSheet(null)}
                        />
                      ) : null}
                      <div className={styles.presets} role="group" aria-labelledby="gift-max-budget-label">
                        {presets.map((value) => {
                          const active = maxBudget.trim() === String(value);
                          return (
                            <button
                              key={value}
                              type="button"
                              className={`${styles.preset} ${active ? styles.presetActive : ''}`}
                              aria-pressed={active}
                              onClick={() => {
                                setMaxBudget(String(value));
                                clearError('maxBudget');
                              }}
                            >
                              {value} €
                            </button>
                          );
                        })}
                      </div>
                    </>
                  ) : null}
                  <BudgetStepper
                    id="gift-max-budget"
                    value={budgetInt(maxBudget)}
                    min={0}
                    snapMin={budgetFloor}
                    max={budgetCeiling > 0 ? budgetCeiling : 9999}
                    onChange={(next) => {
                      setMaxBudget(String(next));
                      clearError('maxBudget');
                    }}
                    labelledBy="gift-max-budget-label"
                    describedBy={[
                      errors.maxBudget ? 'gift-max-budget-error' : null,
                      setsEstimate != null ? 'gift-max-budget-sets' : null,
                      'gift-max-budget-hint',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    invalid={errors.maxBudget != null}
                    decreaseAria={t.gift.budgetDecreaseAria}
                    increaseAria={t.gift.budgetIncreaseAria}
                    {...(!isDesktopNav && presets.length > 0
                      ? {
                          onValueClick: () => setBudgetSheet('sets'),
                          valueExpanded: budgetSheet === 'sets',
                        }
                      : {})}
                  />
                  {errors.maxBudget ? (
                    <p
                      id="gift-max-budget-error"
                      data-testid="gift-max-budget-error"
                      className={authFormStyles.fieldError}
                      role="alert"
                    >
                      {errors.maxBudget}
                    </p>
                  ) : null}
                  {setsEstimate != null ? (
                    <p
                      id="gift-max-budget-sets"
                      data-testid="gift-max-budget-sets"
                      className={styles.budgetSets}
                      aria-live="polite"
                    >
                      {setsEstimateLabel}
                    </p>
                  ) : null}
                  <p id="gift-max-budget-hint" className={styles.budgetShippingHint}>
                    {t.gift.budgetShippingHint}
                  </p>
                </div>
                <div className={styles.divider}>
                  <label className={styles.checkBlock}>
                    <input
                      type="checkbox"
                      data-testid="gift-allow-accessories"
                      checked={allowAccessories}
                      onChange={(event) => {
                        const nextChecked = event.target.checked;
                        setAllowAccessories(nextChecked);
                        if (!nextChecked) {
                          setMaxAccessoryBudget('');
                          clearError('maxAccessoryBudget');
                          setBudgetSheet((current) => (current === 'accessories' ? null : current));
                        } else if (!maxAccessoryBudget.trim()) {
                          setMaxAccessoryBudget('0');
                        }
                      }}
                    />
                    <span className={styles.checkTitle}>
                      {t.gift.allowAccessoriesLabel}
                      <span className={styles.checkHint}>{t.gift.allowAccessoriesHint}</span>
                    </span>
                  </label>
                  {allowAccessories ? (
                    <div className={`${authFormStyles.field} ${styles.accessoryBudget}`}>
                      <span className={authFormStyles.label} id="gift-max-accessory-budget-label">
                        {t.gift.maxAccessoryBudgetLabel}
                        <RequiredMark />
                      </span>
                      {accessoryPresets.length > 0 ? (
                        <>
                          {budgetSheet === 'accessories' ? (
                            <FilterSheet
                              label={t.gift.maxAccessoryBudgetLabel}
                              options={accessoryPresets.map((value) => ({
                                value: String(value),
                                label: `${value} €`,
                              }))}
                              value={maxAccessoryBudget.trim()}
                              onChange={(next) => {
                                setMaxAccessoryBudget(next);
                                clearError('maxAccessoryBudget');
                              }}
                              onClose={() => setBudgetSheet(null)}
                            />
                          ) : null}
                          <div
                            className={styles.presets}
                            role="group"
                            aria-labelledby="gift-max-accessory-budget-label"
                          >
                            {accessoryPresets.map((value) => {
                              const active = maxAccessoryBudget.trim() === String(value);
                              return (
                                <button
                                  key={value}
                                  type="button"
                                  className={`${styles.preset} ${active ? styles.presetActive : ''}`}
                                  aria-pressed={active}
                                  onClick={() => {
                                    setMaxAccessoryBudget(String(value));
                                    clearError('maxAccessoryBudget');
                                  }}
                                >
                                  {value} €
                                </button>
                              );
                            })}
                          </div>
                        </>
                      ) : null}
                      <BudgetStepper
                        id="gift-max-accessory-budget"
                        value={budgetInt(maxAccessoryBudget)}
                        min={0}
                        max={
                          settings && settings.maxAccessoryBudgetCeiling > 0
                            ? settings.maxAccessoryBudgetCeiling
                            : 9999
                        }
                        onChange={(next) => {
                          setMaxAccessoryBudget(String(next));
                          clearError('maxAccessoryBudget');
                        }}
                        labelledBy="gift-max-accessory-budget-label"
                        describedBy={
                          errors.maxAccessoryBudget ? 'gift-max-accessory-budget-error' : undefined
                        }
                        invalid={errors.maxAccessoryBudget != null}
                        decreaseAria={t.gift.budgetDecreaseAria}
                        increaseAria={t.gift.budgetIncreaseAria}
                        {...(!isDesktopNav && accessoryPresets.length > 0
                          ? {
                              onValueClick: () => setBudgetSheet('accessories'),
                              valueExpanded: budgetSheet === 'accessories',
                            }
                          : {})}
                      />
                      {errors.maxAccessoryBudget ? (
                        <p
                          id="gift-max-accessory-budget-error"
                          data-testid="gift-max-accessory-budget-error"
                          className={authFormStyles.fieldError}
                          role="alert"
                        >
                          {errors.maxAccessoryBudget}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className={styles.divider}>
                  <label className={styles.checkBlock}>
                    <input
                      type="checkbox"
                      data-testid="gift-hide-prices"
                      checked={hidePrices}
                      onChange={(event) => setHidePrices(event.target.checked)}
                    />
                    <span className={styles.checkTitle}>
                      {t.gift.hidePricesLabel}
                      <span className={styles.checkHint}>{t.gift.hidePricesHint}</span>
                    </span>
                  </label>
                </div>
              </div>
            </section>
            <aside className={styles.cardPanel}>
              <div className={styles.panel}>
                <h2 className={styles.panelTitle}>{t.gift.cardPanelTitle}</h2>
                <p className={styles.panelHint}>{t.gift.cardPanelHint}</p>
                {cardPreview}
                <p className={styles.cardFoot}>{t.gift.cardPanelFoot}</p>
                <span className={styles.styleLabel} id="gift-share-card-style-label">
                  {t.gift.shareCardStyleLabel}
                  <RequiredMark />
                </span>
                <GiftShareCardStylePicker
                  value={shareCardStyle}
                  onChange={(value) => {
                    setShareCardStyle(value);
                    clearError('shareCardStyle');
                  }}
                  labels={t.gift.shareCardStyles}
                  title={t.gift.shareCardStyleLabel}
                />
              </div>
            </aside>
            <section className={`${styles.panel} ${styles.pinPanel}`}>
              <h2 className={styles.panelTitle}>{t.gift.pinTitle}</h2>
              <p className={styles.panelHint}>{t.gift.pinLead}</p>
              <div className={styles.pinBlock}>
                <div className={styles.pinPair}>
                  <div className={styles.pinField}>
                    <label className={authFormStyles.label} htmlFor="gift-access-pin">
                      {t.gift.pinLabel}
                      <RequiredMark />
                    </label>
                    <OtpCodeInput
                      id="gift-access-pin"
                      data-testid="gift-create-pin"
                      length={4}
                      compact
                      value={accessPin}
                      onChange={(value) => {
                        setAccessPin(value);
                        clearError('accessPin');
                        clearError('accessPinConfirm');
                      }}
                      invalid={errors.accessPin != null || errors.accessPinConfirm != null}
                      autoComplete="off"
                      aria-label={t.gift.pinLabel}
                      // The hint is replaced by the shared PIN error: point
                      // at whichever of the two is on screen.
                      aria-describedby={
                        errors.accessPin || errors.accessPinConfirm
                          ? 'gift-access-pin-confirm-error'
                          : 'gift-access-pin-hint'
                      }
                    />
                  </div>
                  <div className={styles.pinField}>
                    <label className={authFormStyles.label} htmlFor="gift-access-pin-confirm">
                      {t.gift.pinConfirmLabel}
                      <RequiredMark />
                    </label>
                    <OtpCodeInput
                      id="gift-access-pin-confirm"
                      data-testid="gift-create-pin-confirm"
                      length={4}
                      compact
                      value={accessPinConfirm}
                      onChange={(value) => {
                        setAccessPinConfirm(value);
                        clearError('accessPinConfirm');
                      }}
                      invalid={errors.accessPinConfirm != null}
                      autoComplete="off"
                      aria-label={t.gift.pinConfirmLabel}
                      {...(errors.accessPinConfirm
                        ? { 'aria-describedby': 'gift-access-pin-confirm-error' }
                        : { 'aria-describedby': 'gift-access-pin-hint' })}
                    />
                  </div>
                </div>
                {errors.accessPin || errors.accessPinConfirm ? (
                  <p
                    id="gift-access-pin-confirm-error"
                    data-testid="gift-create-pin-error"
                    className={authFormStyles.fieldError}
                    role="alert"
                  >
                    {errors.accessPinConfirm ?? errors.accessPin}
                  </p>
                ) : (
                  <p id="gift-access-pin-hint" className={styles.hint}>
                    {t.gift.pinRememberHint}
                  </p>
                )}
              </div>
            </section>
            <section className={`${styles.panel} ${styles.legalPanel}`}>
              <label className={authFormStyles.consentField} htmlFor="gift-gdpr">
                <input
                  id="gift-gdpr"
                  data-testid="gift-gdpr"
                  type="checkbox"
                  checked={gdpr}
                  aria-required="true"
                  aria-invalid={errors.gdpr != null}
                  aria-describedby={errors.gdpr ? 'gift-gdpr-error' : undefined}
                  onChange={(event) => {
                    setGdpr(event.target.checked);
                    clearError('gdpr');
                  }}
                />
                <span>
                  {t.auth.gdprConsentPrefix}{' '}
                  <Link to={localizedPath('/terms', lang)} state={{ returnTo: localizedPath('/gift', lang) }}>
                    {t.footer.termsLink}
                  </Link>{' '}
                  {t.auth.gdprConsentAnd}{' '}
                  <Link
                    to={localizedPath('/privacy', lang)}
                    state={{ returnTo: localizedPath('/gift', lang) }}
                  >
                    {t.footer.privacyLink}
                  </Link>
                  .
                  <RequiredMark />
                </span>
              </label>
              {errors.gdpr ? (
                <p
                  id="gift-gdpr-error"
                  data-testid="gift-gdpr-error"
                  className={authFormStyles.fieldError}
                  role="alert"
                >
                  {errors.gdpr}
                </p>
              ) : null}
              <p className={styles.legalNote}>
                {withN(t.gift.createLegalNote, settings?.stockHoldTtlDays ?? 7)}
              </p>
              {formError ? (
                <p
                  className={`${authFormStyles.fieldError} ${styles.formError}`}
                  role="alert"
                  data-testid="gift-create-form-error"
                >
                  {formError}
                </p>
              ) : null}
              <Button
                type="submit"
                className={styles.submit}
                data-testid="gift-create-submit"
                disabled={submitting || settings == null || status === 'loading'}
              >
                {submitting ? t.gift.creating : t.gift.submitCreate}
              </Button>
              <p className={styles.submitHint}>{t.gift.submitHint}</p>
            </section>
          </form>
        </>
      )}
      {submitting ? <LoadingModal message={t.gift.creating} /> : null}
    </section>
  );
}
