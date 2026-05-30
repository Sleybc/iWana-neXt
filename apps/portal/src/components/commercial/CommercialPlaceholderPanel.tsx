'use client';

import { Badge, Card, CardContent, CardHeader, CardTitle, cn } from '@iwana/ui';
import type { LucideIcon } from 'lucide-react';

interface CommercialPlaceholderSection {
  title: string;
  description: string;
  status: string;
}

interface CommercialPlaceholderPanelProps {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  sections: CommercialPlaceholderSection[];
}

export function CommercialPlaceholderPanel({
  eyebrow,
  title,
  description,
  icon: Icon,
  sections,
}: CommercialPlaceholderPanelProps) {
  return (
    <Card className="rounded-2xl border border-white/70 shadow-sm dark:border-dark-border dark:bg-dark-surface-2/95">
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-iwana-primary/8 text-iwana-primary dark:bg-iwana-primary-400/20 dark:text-iwana-primary-300">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
              {eyebrow}
            </p>
            <CardTitle className="mt-1 text-lg font-semibold">{title}</CardTitle>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600 dark:text-gray-400">
              {description}
            </p>
          </div>
        </div>
        <Badge variant="neutral" className="text-xs">
          Próxima iteración
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 lg:grid-cols-2">
          {sections.map((section) => (
            <div
              key={section.title}
              className={cn(
                'rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 shadow-sm',
                'dark:border-dark-border dark:bg-dark-surface-3',
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  {section.title}
                </h3>
                <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500 dark:border-dark-border-2 dark:bg-dark-surface-2 dark:text-gray-300">
                  {section.status}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-gray-600 dark:text-gray-400">
                {section.description}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
