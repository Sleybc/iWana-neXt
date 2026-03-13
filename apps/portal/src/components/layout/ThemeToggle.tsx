// apps/portal/src/components/layout/ThemeToggle.tsx
'use client';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@iwana/ui';

/**
 * Botón de alternancia de tema claro/oscuro.
 * Usa el ThemeProvider de @iwana/ui para cambiar el tema globalmente.
 */
export const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-white"
    >
      {theme === 'dark' ? (
        <Sun className="w-5 h-5" />
      ) : (
        <Moon className="w-5 h-5" />
      )}
    </button>
  );
};
