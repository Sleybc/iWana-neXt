'use client';

import type { ReactNode } from 'react';
import { cn } from '@iwana/ui';

interface PurchaseCreateModeShellProps {
  header: ReactNode;
  children: ReactNode;
  className?: string;
}

export function PurchaseCreateModeShell({
  header,
  children,
  className,
}: PurchaseCreateModeShellProps) {
  return (
    <section
      className={cn(
        'rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-dark-border dark:bg-dark-surface-2',
        className,
      )}
    >
      {header}
      <div className="pt-5">{children}</div>
    </section>
  );
}
