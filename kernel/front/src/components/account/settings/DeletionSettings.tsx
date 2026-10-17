import { useState, type FormEvent } from 'react';
import * as authApi from '../../../api/account';
import { ApiError } from '../../../api/errors';
import { isBackendUnavailableError } from '../../../api/http';
import { useSectionUnlock } from '../../../hooks/useSectionUnlock';
import { Button } from '../../ui/Button';
import { SectionUnlockButton, SectionUnlockPrompt } from '../SectionUnlockControl';
import authFormStyles from '../../auth/AuthForm.module.css';
import styles from './AccountSettings.module.css';
import type { AccountUserSectionProps } from './accountSettingsTypes';

export function DeletionSettings({
  t,
  lang,
  user,
  setUser,
  authedRequest,
}: AccountUserSectionProps & { lang: string }) {
  const [phraseConfirming, setPhraseConfirming] = useState(false);
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [cancelSuccess, setCancelSuccess] = useState(false);
  const unlock = useSectionUnlock('deletion', authedRequest, user.hasPassword !== false);
  const phraseMatches = confirmPhrase === t.account.deleteAccountConfirmPhrase;

  if (user.status === 'pending_deletion') {
    return (
      <div className={styles.block}>
        <h2 className={styles.blockTitle}>{t.account.deleteAccountTitle}</h2>
        {cancelSuccess ? (
          <p className={authFormStyles.success}>{t.account.reactivatedWelcomeBack}</p>
        ) : (
          <>
            <p className={styles.pendingDeletionNotice}>
              {t.account.deletionScheduledPrefix}{' '}
              {user.deletionScheduledFor ? new Date(user.deletionScheduledFor).toLocaleDateString(lang) : ''}
            </p>
            <Button
              type="button"
              onClick={async () => {
                const result = await authedRequest((token) => authApi.cancelAccountDeletion(token));
                if (result.reactivated) {
                  setUser({ ...user, status: 'active', deletionScheduledFor: null });
                  setCancelSuccess(true);
                }
              }}
            >
              {t.account.cancelDeletionButton}
            </Button>
          </>
        )}
      </div>
    );
  }

  async function handleDelete(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await authedRequest((token) => authApi.requestAccountDeletion(token, unlock.token!));
      setUser({ ...user, status: 'pending_deletion', deletionScheduledFor: result.deletionScheduledFor });
      unlock.consume();
    } catch (err) {
      if (isBackendUnavailableError(err)) return;
      setError(
        err instanceof ApiError && err.code === 'unlock_invalid'
          ? t.auth.errorUnlockInvalid
          : t.auth.errorGeneric,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.block}>
      <div className={styles.blockHeader}>
        <h2 className={styles.blockTitle}>{t.account.deleteAccountTitle}</h2>
        <SectionUnlockButton unlock={unlock} />
      </div>
      {unlock.confirming && <SectionUnlockPrompt unlock={unlock} />}
      <p className={styles.dangerText}>{t.account.deleteAccountWarning}</p>
      {error && (
        <p className={authFormStyles.error} role="alert">
          {error}
        </p>
      )}
      {unlock.unlocked && !phraseConfirming && (
        <Button variant="ghost" type="button" onClick={() => setPhraseConfirming(true)}>
          {t.account.deleteAccountConfirmButton}
        </Button>
      )}
      {unlock.unlocked && phraseConfirming && (
        <form className={authFormStyles.form} onSubmit={handleDelete} noValidate>
          <label className={authFormStyles.field}>
            <span className={authFormStyles.label}>
              {t.account.deleteAccountConfirmPhraseHint.replace(
                '{phrase}',
                t.account.deleteAccountConfirmPhrase,
              )}
            </span>
            <input
              className={authFormStyles.input}
              value={confirmPhrase}
              onChange={(e) => setConfirmPhrase(e.target.value)}
            />
          </label>
          <div className={styles.buttonRow}>
            <Button type="submit" disabled={!phraseMatches || submitting}>
              {t.account.deleteAccountConfirmButton}
            </Button>
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setPhraseConfirming(false);
                setConfirmPhrase('');
              }}
            >
              {t.account.deleteAccountCancelButton}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
