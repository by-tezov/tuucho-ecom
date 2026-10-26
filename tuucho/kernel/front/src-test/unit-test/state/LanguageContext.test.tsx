import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Lang, Strings } from '@/assets/i18n/types';
import { LanguageProvider, useLang } from '@/state/LanguageContext';

const testState = vi.hoisted(() => ({
  preference: 'en' as Lang,
  loadDictionary: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useLocation: () => ({ pathname: '/account', search: '', hash: '', state: null, key: 'test' }),
  useNavigate: () => vi.fn(),
}));
vi.mock('@/config/i18nRoutes', () => ({
  isLocalizablePath: () => false,
  localizedPath: (path: string) => path,
  stripLangPrefix: (path: string) => ({ lang: null, rest: path }),
}));
vi.mock('@/state/PrerenderPayload', () => ({ usePrerenderedLanguage: () => null }));
vi.mock('@/plugins/StorefrontBootstrap', () => ({
  useStorefrontBootstrap: () => ({ plugins: [
    { id: 'tuucho-kernel-locale-en', enabled: true },
    { id: 'tuucho-kernel-locale-fr', enabled: true },
  ] }),
}));
vi.mock('@/assets/i18n/languagePreference', () => ({
  preferredLanguage: () => testState.preference,
  savePreferredLanguage: (lang: Lang) => {
    testState.preference = lang;
  },
}));
vi.mock('@/assets/i18n/dictionaryCache', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/assets/i18n/dictionaryCache')>();
  return {
    ...actual,
    defaultLang: () => 'en',
    getCachedDictionary: () => undefined,
    // Unit tests do not load locale catalog chunks; treat any shell as ready
    // so LanguageProvider mounts children under test.
    isRuntimeDictionary: () => true,
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
      <button type="button" onClick={() => setLang('fr')}>
        French
      </button>
    </div>
  );
}

afterEach(() => {
  testState.preference = 'en';
  testState.loadDictionary.mockReset();
});

describe('LanguageProvider locale enablement', () => {
  it('settles instead of looping when localeEnablement is a new Set each render', () => {
    let renders = 0;
    function Count() {
      renders += 1;
      const { lang } = useLang();
      return <output data-testid="language">{lang}</output>;
    }

    render(
      <LanguageProvider>
        <Count />
      </LanguageProvider>,
    );

    expect(screen.getByTestId('language')).toHaveTextContent('en');
    expect(renders).toBeLessThan(20);
  });
});

describe('LanguageProvider request ownership', () => {
  it('ignores a slower dictionary response after a newer language selection', async () => {
    const english = deferred<Strings>();
    const french = deferred<Strings>();
    testState.loadDictionary.mockImplementation((lang: Lang) =>
      lang === 'en' ? english.promise : french.promise,
    );

    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    fireEvent.click(screen.getByRole('button', { name: 'French' }));

    await act(async () => french.resolve({} as Strings));
    expect(screen.getByTestId('language')).toHaveTextContent('fr');

    await act(async () => english.resolve({} as Strings));
    expect(screen.getByTestId('language')).toHaveTextContent('fr');
    expect(document.documentElement.lang).toBe('fr');
  });
});
