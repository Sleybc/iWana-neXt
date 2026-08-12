import { render, waitFor } from '@testing-library/react';
import {
  ThemeProvider,
  THEME_BOOTSTRAP_SCRIPT,
  THEME_STORAGE_KEY,
  resolveThemeFromStorage,
  useTheme,
} from '@iwana/ui';

function ThemeProbe() {
  const { theme } = useTheme();
  return <span data-testid="theme">{theme}</span>;
}

function themeWriteValues(spy: jest.SpyInstance): string[] {
  return spy.mock.calls
    .filter((call) => call[0] === THEME_STORAGE_KEY)
    .map((call) => String(call[1]));
}

describe('ThemeProvider (DS-DARK-THEME / CA-DARK-UX-02)', () => {
  let setItemSpy: jest.SpyInstance;

  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
    setItemSpy = jest.spyOn(Storage.prototype, 'setItem');
  });

  afterEach(() => {
    setItemSpy.mockRestore();
    window.localStorage.clear();
    document.documentElement.classList.remove('dark');
  });

  it('no escribe light pre-hydrate cuando la preferencia persistida es dark', async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    setItemSpy.mockClear();

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(themeWriteValues(setItemSpy)).toContain('dark');
    });
    expect(themeWriteValues(setItemSpy)).not.toContain('light');
  });

  it('tras hidratar dark persiste dark', async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    setItemSpy.mockClear();

    render(
      <ThemeProvider>
        <ThemeProbe />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(themeWriteValues(setItemSpy).at(-1)).toBe('dark');
    });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });
});

describe('theme-bootstrap (Firma 1.4)', () => {
  it('resuelve dark persistido sin consultar prefers-color-scheme', () => {
    expect(resolveThemeFromStorage('dark', false)).toBe('dark');
    expect(resolveThemeFromStorage('light', true)).toBe('light');
  });

  it('sin clave usa prefers-color-scheme', () => {
    expect(resolveThemeFromStorage(null, true)).toBe('dark');
    expect(resolveThemeFromStorage(null, false)).toBe('light');
  });

  it('el script inline lee iwana-theme y aplica .dark', () => {
    expect(THEME_BOOTSTRAP_SCRIPT).toContain(THEME_STORAGE_KEY);
    expect(THEME_BOOTSTRAP_SCRIPT).toContain("classList.add('dark')");
    expect(THEME_BOOTSTRAP_SCRIPT).toContain('prefers-color-scheme');
  });
});
