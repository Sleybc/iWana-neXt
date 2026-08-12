/** Clave de persistencia del tema. No se renombra (DS-DARK-THEME / Firma 1.4). */
export const THEME_STORAGE_KEY = 'iwana-theme';

export type ThemeName = 'light' | 'dark';

/** Resuelve el tema a partir de `iwana-theme` o `prefers-color-scheme`. */
export function resolveThemeFromStorage(stored: string | null, prefersDark: boolean): ThemeName {
  if (stored === 'dark' || stored === 'light') {
    return stored;
  }
  return prefersDark ? 'dark' : 'light';
}

export function applyHtmlThemeClass(
  root: { classList: { add: (token: string) => void; remove: (token: string) => void } },
  theme: ThemeName,
): void {
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

/**
 * Script inline Firma 1.4: aplica `.dark` en `<html>` antes del primer paint.
 * Misma clave y misma regla que `resolveThemeFromStorage`.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var s=localStorage.getItem('${THEME_STORAGE_KEY}');if(s==='dark'||(s!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})();`;
