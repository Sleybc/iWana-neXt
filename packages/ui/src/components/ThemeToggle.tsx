// packages/ui/src/components/ThemeToggle.tsx
'use client';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { cn } from '../lib/utils';
import { headerIconControlClassName, interactiveFocusClassName } from '../focus';

/**
 * Botón de alternancia de tema claro/oscuro.
 * Componente compartido — usa el ThemeProvider de @iwana/ui.
 * Se importa como `import { ThemeToggle } from '@iwana/ui'` en las apps.
 */
export const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      className={cn(headerIconControlClassName, interactiveFocusClassName)}
    >
      {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
};
