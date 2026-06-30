'use client';

import Link from 'next/link';
import { Building2, ShieldCheck, Wrench } from 'lucide-react';
import { cn } from '@iwana/ui';
import { PortalPanel } from '@/components/shared/portal-ui';
import { SETTINGS_ACCESS_SHORTCUTS_COPY } from './mod00-settings-labels';

interface SettingsAccessShortcutsProps {
  canEdit: boolean;
}

const cards = [
  {
    href: '/dashboard/settings/organization',
    title: SETTINGS_ACCESS_SHORTCUTS_COPY.cards.organization.title,
    description: SETTINGS_ACCESS_SHORTCUTS_COPY.cards.organization.description,
    icon: Building2,
  },
  {
    href: '/dashboard/settings/access',
    title: SETTINGS_ACCESS_SHORTCUTS_COPY.cards.access.title,
    description: SETTINGS_ACCESS_SHORTCUTS_COPY.cards.access.description,
    icon: ShieldCheck,
  },
  {
    href: '/dashboard/settings/field-operations',
    title: SETTINGS_ACCESS_SHORTCUTS_COPY.cards.fieldOperations.title,
    description: SETTINGS_ACCESS_SHORTCUTS_COPY.cards.fieldOperations.description,
    icon: Wrench,
  },
];

export function SettingsAccessShortcuts({ canEdit }: SettingsAccessShortcutsProps) {
  return (
    <PortalPanel
      eyebrow={SETTINGS_ACCESS_SHORTCUTS_COPY.eyebrow}
      title={SETTINGS_ACCESS_SHORTCUTS_COPY.title}
      description={SETTINGS_ACCESS_SHORTCUTS_COPY.description}
    >
      <div className="grid gap-4 xl:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;

          return (
            <Link
              key={card.href}
              href={card.href}
              className={cn(
                'group rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 transition hover:border-iwana-secondary/50 hover:bg-white dark:border-dark-border dark:bg-dark-surface-3 dark:hover:border-iwana-secondary/40 dark:hover:bg-dark-surface-2',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-iwana-primary/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-iwana-primary">
                      {canEdit
                        ? SETTINGS_ACCESS_SHORTCUTS_COPY.administrationBadge
                        : SETTINGS_ACCESS_SHORTCUTS_COPY.readOnlyBadge}
                    </span>
                  </div>
                  <div>
                    <p className="text-base font-semibold text-gray-900 transition group-hover:text-iwana-primary dark:text-white">
                      {card.title}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                      {card.description}
                    </p>
                  </div>
                </div>
                <div className="rounded-2xl bg-white p-3 text-iwana-primary shadow-sm dark:bg-dark-surface-2">
                  <Icon className="h-5 w-5" aria-hidden={true} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </PortalPanel>
  );
}
