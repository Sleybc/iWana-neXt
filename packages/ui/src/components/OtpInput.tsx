// packages/ui/src/components/OtpInput.tsx
'use client';

import * as React from 'react';
import { cn } from '../lib/utils';

/**
 * Componente OTP de 6 dígitos para flujo MFA.
 * - Auto-avance al siguiente campo al ingresar dígito
 * - Backspace regresa al campo anterior
 * - Paste distribuye automáticamente los 6 dígitos
 */
interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  disabled?: boolean;
  className?: string;
}

export function OtpInput({
  length = 6,
  value,
  onChange,
  error,
  disabled,
  className,
}: OtpInputProps) {
  const inputRefs = React.useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(length, '').split('').slice(0, length);

  const handleChange = (index: number, char: string) => {
    if (!/^\d*$/.test(char)) return;
    const newDigits = [...digits];
    newDigits[index] = char.slice(-1);
    const newValue = newDigits.join('');
    onChange(newValue);
    if (char && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace') {
      if (!digits[index] && index > 0) {
        const newDigits = [...digits];
        newDigits[index - 1] = '';
        onChange(newDigits.join(''));
        inputRefs.current[index - 1]?.focus();
      } else {
        const newDigits = [...digits];
        newDigits[index] = '';
        onChange(newDigits.join(''));
      }
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    onChange(pasted.padEnd(length, ''));
    const nextIndex = Math.min(pasted.length, length - 1);
    inputRefs.current[nextIndex]?.focus();
  };

  return (
    <div className={cn('flex gap-3', className)} role="group" aria-label="Código OTP">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            inputRefs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={1}
          value={digits[i] || ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          disabled={disabled}
          aria-label={`Dígito ${i + 1} de ${length}`}
          className={cn(
            'w-12 h-12 text-center text-lg font-semibold rounded-xl border-2 transition-all duration-200',
            'focus:outline-none focus:ring-2 focus:ring-offset-1',
            'disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-gray-200 disabled:bg-gray-50 disabled:text-gray-500 dark:disabled:border-dark-border dark:disabled:bg-dark-surface-3 dark:disabled:text-gray-400',
            error
              ? 'border-iwana-error text-iwana-error-700 focus:ring-iwana-error dark:border-iwana-error dark:text-red-300'
              : 'border-gray-300 text-iwana-primary focus:border-iwana-primary focus:ring-iwana-primary dark:border-dark-border-2 dark:bg-dark-surface-3 dark:text-white dark:focus:border-iwana-primary-300 dark:focus:ring-iwana-primary-300',
            digits[i] &&
              !error &&
              'border-iwana-primary bg-iwana-primary-50 dark:border-iwana-primary-300 dark:bg-iwana-primary-900/20',
          )}
        />
      ))}
    </div>
  );
}
