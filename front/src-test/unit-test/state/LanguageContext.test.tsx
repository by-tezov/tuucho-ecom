import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Lang, Strings } from '../../../src/assets/i18n/types';
import { LanguageProvider, useLang } from '../../../src/state/LanguageContext';

const testState = vi.hoisted(() => ({
  preference: 'fr' as Lang,
  loadDictionary: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/account', search: '', hash: '', state: null, key: 'test' }),
  useNavigate: () => vi.fn(),
}));
vi.mock('../../../src/config/i18nRoutes', () => ({
  isLocalizablePath: () => false,
  localizedPath: (path: string) => path,
  stripLangPrefix: (path: string) => ({ lang: null, rest: path }),
}));
vi.mock('../../../src/state/PrerenderPayload', () => ({ usePrerenderedLanguage: () => null }));
vi.mock('../../../src/assets/i18n/languagePreference', () => ({
  preferredLanguage: () => testState.preference,
  savePreferredLanguage: (lang: Lang) => {
    testState.preference = lang;
  },
}));
vi.mock('../../../src/assets/i18n/dictionaryCache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/assets/i18n/dictionaryCache')>();
  return {
    ...actual,
    defaultLang: 'fr',
    getCachedDictionary: () => undefined,
    loadDictionary: testState.loadDictionary,
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function Probe() {
  const { lang, setLang } = useLang();
  return (
    <div>
      <output data-testid="language">{lang}</output>
      <button type="button" onClick={() => setLang('en')}>
        English
      </button>
      <button type="button" onClick={() => setLang('es')}>
        Spanish
      </button>
    </div>
  );
}

afterEach(() => {
  testState.preference = 'fr';
  testState.loadDictionary.mockReset();
});

describe('LanguageProvider request ownership', () => {
  it('ignores a slower dictionary response after a newer language selection', async () => {
    const english = deferred<Strings>();
    const spanish = deferred<Strings>();
    testState.loadDictionary.mockImplementation((lang: Lang) =>
      lang === 'en' ? english.promise : spanish.promise,
    );

    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    fireEvent.click(screen.getByRole('button', { name: 'Spanish' }));

    await act(async () => spanish.resolve({} as Strings));
    expect(screen.getByTestId('language')).toHaveTextContent('es');

    await act(async () => english.resolve({} as Strings));
    expect(screen.getByTestId('language')).toHaveTextContent('es');
    expect(document.documentElement.lang).toBe('es');
  });
});
