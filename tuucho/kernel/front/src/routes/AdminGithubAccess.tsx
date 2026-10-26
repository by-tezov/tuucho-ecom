import { useEffect, useState, type FormEvent } from 'react';
import {
  deleteGithubAccess,
  listGithubAccess,
  saveGithubAccess,
  type GithubAccessEntry,
} from '../api/admin/diskConfig';
import { ApiError } from '../api/errors';
import { useAdminStrings } from '../assets/i18n/admin';
import { Button } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { Field } from '../components/ui/Field';
import { TextField } from '../components/ui/TextField';
import { canAccess, useAdminAccess } from '../state/AdminAccessContext';
import { useAuthSession } from '../state/AuthContext';
import styles from './AdminPlugins.module.css';

export function AdminGithubAccess() {
  const c = useAdminStrings().core;
  const access = useAdminAccess();
  const canImport = canAccess(access, 'plugin_config_import');
  const { authedRequest } = useAuthSession();
  const [entries, setEntries] = useState<GithubAccessEntry[]>([]);
  const [repository, setRepository] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [repositoryError, setRepositoryError] = useState('');
  const [tokenError, setTokenError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void authedRequest((sessionToken) => listGithubAccess(sessionToken))
      .then((result) => setEntries(result.entries))
      .catch(() => setLoadError(c.githubLoadError));
  }, [authedRequest, c.githubLoadError]);

  function remember(entry: GithubAccessEntry) {
    setEntries((current) => {
      const next = current.filter((row) => row.repository !== entry.repository);
      next.push(entry);
      next.sort((a, b) => a.repository.localeCompare(b.repository));
      return next;
    });
  }

  async function onSave(event: FormEvent) {
    event.preventDefault();
    const repo = repository.trim();
    const secret = token.trim();
    setSaved(false);
    setFormError('');
    setRepositoryError(repo ? '' : c.githubInvalidRepository);
    setTokenError(secret ? '' : c.githubInvalidToken);
    if (!repo || !secret) return;
    setBusy(true);
    try {
      const result = await authedRequest((sessionToken) => saveGithubAccess(sessionToken, repo, secret));
      remember(result.entry);
      setRepository('');
      setToken('');
      setSaved(true);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'invalid_repository') {
        setRepositoryError(c.githubInvalidRepository);
      } else if (error instanceof ApiError && error.code === 'invalid_token') {
        setTokenError(c.githubInvalidToken);
      } else if (error instanceof ApiError && error.code === 'too_many') {
        setFormError(c.githubTooMany);
      } else {
        setFormError(c.githubSaveError);
      }
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(repositoryUrl: string) {
    setBusy(true);
    setSaved(false);
    setFormError('');
    try {
      await authedRequest((sessionToken) => deleteGithubAccess(sessionToken, repositoryUrl));
      setEntries((current) => current.filter((row) => row.repository !== repositoryUrl));
    } catch {
      setFormError(c.githubRemoveError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="github-access-title">
      <h2 id="github-access-title" className={styles.sectionTitle}>
        {c.githubTitle}
      </h2>
      <p className={styles.hint}>{c.githubHint}</p>
      {loadError ? <p className={styles.error}>{loadError}</p> : null}
      {entries.length === 0 && !loadError ? <p className={styles.hint}>{c.githubEmpty}</p> : null}
      {entries.length > 0 ? (
        <ul className={styles.accessList}>
          {entries.map((entry) => (
            <li key={entry.repository} className={styles.accessRow}>
              <span className={styles.accessRepo}>{entry.repository}</span>
              <span className={styles.accessActions}>
                <Chip>{c.githubTokenSet}</Chip>
                {canImport ? (
                  <Button
                    type="button"
                    variant="ghostDanger"
                    disabled={busy}
                    aria-label={`${c.githubRemove} ${entry.repository}`}
                    onClick={() => void onRemove(entry.repository)}
                  >
                    {c.githubRemove}
                  </Button>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
      {formError ? <p className={styles.error}>{formError}</p> : null}
      {canImport ? (
        <form className={styles.formGrid} noValidate onSubmit={(event) => void onSave(event)}>
          <Field
            label={c.githubRepositoryLabel}
            description={c.githubRepositoryHint}
            htmlFor="github-repository"
            error={repositoryError}
          >
            <TextField
              id="github-repository"
              type="url"
              value={repository}
              onChange={setRepository}
              autoComplete="off"
              spellCheck={false}
              placeholder="https://github.com/owner/name"
            />
          </Field>
          <Field
            label={c.githubTokenLabel}
            description={c.githubTokenHint}
            htmlFor="github-token"
            error={tokenError}
          >
            <TextField
              id="github-token"
              type="password"
              value={token}
              onChange={setToken}
              autoComplete="new-password"
              spellCheck={false}
              placeholder="github_pat_"
            />
          </Field>
          <div className={styles.toolbar}>
            <Button type="submit" disabled={busy}>
              {c.githubSave}
            </Button>
          </div>
          {saved ? <p className={styles.notice}>{c.githubSaved}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
