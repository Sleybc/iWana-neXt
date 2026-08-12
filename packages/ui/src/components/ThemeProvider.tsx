'use client';
// ThemeProvider — Proveedor de tema claro/oscuro para iWana neXt.
// Implementa dark mode funcional con Tailwind 4 (clase 'dark' en <html>).
// Persiste preferencia en localStorage solo tras hidratar. Respeta prefers-color-scheme inicial.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  THEME_STORAGE_KEY,
  applyHtmlThemeClass,
  resolveThemeFromStorage,
  type ThemeName,
} from '../theme-bootstrap';

type Theme = ThemeName;

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  // Al montar: leer localStorage o usar preferencia del sistema operativo.
  // No persistir el default React 'light' antes de hidratar (CA-DARK-UX-02).
  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    const prefersDark =
      stored === 'dark' || stored === 'light'
        ? false
        : window.matchMedia('(prefers-color-scheme: dark)').matches;
    setThemeState(resolveThemeFromStorage(stored, prefersDark));
    setMounted(true);
  }, []);

  // Aplicar clase 'dark' y persistir solo cuando el tema ya se leyó de storage.
  useEffect(() => {
    if (!mounted) {
      return;
    }
    applyHtmlThemeClass(document.documentElement, theme);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme, mounted]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
  };

  const toggleTheme = () => {
    setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme debe usarse dentro de ThemeProvider');
  }
  return ctx;
}
