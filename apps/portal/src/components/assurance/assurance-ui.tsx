import type { ReactNode } from 'react';
import { cn } from '@iwana/ui';
import { PortalPanel } from '@/components/shared/portal-ui';

export const assuranceTextareaClassName =
  'min-h-[120px] w-full rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm transition-colors duration-200 placeholder:text-gray-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-iwana-primary dark:border-iwana-neutral-600 dark:bg-dark-surface-3 dark:text-white dark:placeholder:text-gray-400';

interface AssuranceSectionCardProps {
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

interface AssuranceKeyValueItemProps {
  label: string;
  value: ReactNode;
  className?: string;
}

export function AssuranceSectionCard({
  title,
  description,
  eyebrow,
  actions,
  className,
  children,
}: AssuranceSectionCardProps) {
  return (
    <PortalPanel
      eyebrow={eyebrow}
      title={title}
      description={description}
      actions={actions}
      className={className}
    >
      {children}
    </PortalPanel>
  );
}

export function AssuranceKeyValueItem({ label, value, className }: AssuranceKeyValueItemProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-gray-200 bg-[#fbfcf8] p-4 dark:border-dark-border dark:bg-dark-surface-3',
        className,
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <div className="mt-2 text-sm font-medium text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}
