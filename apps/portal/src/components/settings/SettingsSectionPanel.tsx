import { type ReactNode } from 'react';

interface SettingsSectionPanelProps {
  title: string;
  description?: string;
  toolbar?: ReactNode;
  children: ReactNode;
}

export function SettingsSectionPanel({
  title,
  description,
  toolbar,
  children,
}: SettingsSectionPanelProps) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm dark:border-dark-border dark:bg-dark-surface-2 sm:p-6">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 dark:border-dark-border/80 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-slate-950 dark:text-white">{title}</h3>
          {description ? (
            <p className="text-sm text-slate-500 dark:text-gray-400">{description}</p>
          ) : null}
        </div>
        {toolbar ? <div className="flex flex-wrap gap-2">{toolbar}</div> : null}
      </div>
      <div className="pt-5">{children}</div>
    </section>
  );
}
