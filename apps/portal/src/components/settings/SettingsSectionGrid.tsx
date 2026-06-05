'use client';

import Link from 'next/link';
import {
  Blocks,
  Building2,
  CalendarDays,
  CreditCard,
  Lock,
  Package,
  Palette,
  ShieldCheck,
  Wrench,
  Waypoints,
  Briefcase,
} from 'lucide-react';
import { cn } from '@iwana/ui';
import { AccessPermissionKey, SettingsSectionKey, SettingsSectionStatus } from '@iwana/shared';
import {
  PortalPanel,
  PortalSectionHeader,
  interactiveFocusClassName,
} from '@/components/shared/portal-ui';
import { type SettingsSection } from '@/lib/api-client';
import { SETTINGS_HUB_COPY, SETTINGS_HUB_SECTION_COPY } from './mod00-settings-labels';
import { SettingsUnavailableState } from './SettingsUnavailableState';

interface SettingsSectionGridProps {
  sections: SettingsSection[];
  effectivePermissions: AccessPermissionKey[];
}

interface SettingsSectionPresentation {
  section: SettingsSection;
  title: string;
  description: string;
  actionLabel: string;
  emphasis: 'primary' | 'secondary';
}

const iconMap: Partial<Record<SettingsSectionKey, typeof Building2>> = {
  [SettingsSectionKey.ORGANIZATION]: Building2,
  [SettingsSectionKey.ACCESS]: ShieldCheck,
  [SettingsSectionKey.BRANDING]: Palette,
  [SettingsSectionKey.FIELD_OPERATIONS]: Wrench,
  [SettingsSectionKey.CALENDAR]: CalendarDays,
  [SettingsSectionKey.COMMERCIAL]: Briefcase,
  [SettingsSectionKey.BILLING]: CreditCard,
  [SettingsSectionKey.INVENTORY]: Package,
  [SettingsSectionKey.INTEGRATIONS]: Waypoints,
};

const statusLabelMap = {
  [SettingsSectionStatus.AVAILABLE]: 'Disponible',
  [SettingsSectionStatus.COMING_SOON]: 'Próximamente',
  [SettingsSectionStatus.NOT_CONFIGURED]: 'No configurado',
} satisfies Record<SettingsSectionStatus, string>;

function hasAllRequiredPermissions(
  section: SettingsSection,
  effectivePermissions: AccessPermissionKey[],
): boolean {
  return section.requiredPermissions.every((permission) =>
    effectivePermissions.includes(permission),
  );
}

function resolveSectionPresentation(section: SettingsSection): SettingsSectionPresentation {
  const override = SETTINGS_HUB_SECTION_COPY[section.key];

  return {
    section,
    title: override?.title ?? section.label,
    description: override?.description ?? section.description,
    actionLabel: override?.actionLabel ?? SETTINGS_HUB_COPY.openSectionAction,
    emphasis: override?.emphasis ?? 'secondary',
  };
}

function sortSectionPresentations(sections: SettingsSectionPresentation[]) {
  const order: Record<SettingsSectionKey, number> = {
    [SettingsSectionKey.ORGANIZATION]: 0,
    [SettingsSectionKey.ACCESS]: 1,
    [SettingsSectionKey.CALENDAR]: 2,
    [SettingsSectionKey.BRANDING]: 3,
    [SettingsSectionKey.FIELD_OPERATIONS]: 4,
    [SettingsSectionKey.COMMERCIAL]: 5,
    [SettingsSectionKey.BILLING]: 6,
    [SettingsSectionKey.INVENTORY]: 7,
    [SettingsSectionKey.INTEGRATIONS]: 8,
  };

  return [...sections].sort((left, right) => order[left.section.key] - order[right.section.key]);
}

export function SettingsSectionGrid({ sections, effectivePermissions }: SettingsSectionGridProps) {
  const presentations = sortSectionPresentations(sections.map(resolveSectionPresentation));
  const mainSections = presentations.filter(
    ({ section }) => section.status === SettingsSectionStatus.AVAILABLE,
  );
  const futureSections = presentations.filter(
    ({ section }) => section.status !== SettingsSectionStatus.AVAILABLE || !section.route,
  );

  return (
    <PortalPanel
      eyebrow={SETTINGS_HUB_COPY.panelEyebrow}
      title={SETTINGS_HUB_COPY.panelTitle}
      description={SETTINGS_HUB_COPY.panelDescription}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:items-start">
        {mainSections.map((presentation) => {
          const { section, title, description, actionLabel, emphasis } = presentation;
          const Icon = iconMap[section.key] ?? Blocks;
          const isOperable = hasAllRequiredPermissions(section, effectivePermissions);

          if (section.status !== SettingsSectionStatus.AVAILABLE || !section.route) {
            return (
              <SettingsUnavailableState
                key={section.key}
                title={title}
                description={description}
                status={section.status}
              />
            );
          }

          if (!isOperable) {
            return (
              <div
                key={section.key}
                className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/80 p-5 dark:border-amber-900/60 dark:bg-amber-950/20"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                        Acceso restringido
                      </span>
                    </div>
                    <div>
                      <p className="text-base font-semibold text-gray-900 dark:text-white">
                        {title}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">
                        {description}
                      </p>
                    </div>
                    <p className="text-sm leading-6 text-amber-900 dark:text-amber-200">
                      {SETTINGS_HUB_COPY.restrictedMessage}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-white/80 p-3 text-amber-700 shadow-sm dark:bg-dark-surface-3 dark:text-amber-300">
                    <Lock className="h-5 w-5" aria-hidden={true} />
                  </div>
                </div>
              </div>
            );
          }

          return (
            <Link
              key={section.key}
              href={section.route}
              className={cn(
                interactiveFocusClassName,
                'group rounded-2xl border bg-white p-5 transition hover:border-iwana-primary/35 hover:bg-iwana-surface-soft dark:border-dark-border dark:bg-dark-surface-2 dark:hover:border-iwana-primary/30 dark:hover:bg-dark-surface-3',
                emphasis === 'primary' ? 'border-iwana-primary/15 shadow-sm' : 'border-gray-200',
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                      {statusLabelMap[section.status]}
                    </span>
                  </div>
                  <div>
                    <p className="text-base font-semibold text-gray-900 transition group-hover:text-iwana-primary dark:text-white">
                      {title}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                      {description}
                    </p>
                  </div>
                  <p className="text-sm font-medium text-iwana-primary">{actionLabel}</p>
                </div>
                <div className="rounded-2xl bg-iwana-surface-soft p-3 text-iwana-primary shadow-sm dark:bg-dark-surface-3">
                  <Icon className="h-5 w-5" aria-hidden={true} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {futureSections.length > 0 ? (
        <div className="mt-6 space-y-3 border-t border-gray-100 pt-6 dark:border-dark-border">
          <PortalSectionHeader
            eyebrow={SETTINGS_HUB_COPY.futureEyebrow}
            title={SETTINGS_HUB_COPY.futureTitle}
            description={SETTINGS_HUB_COPY.futureDescription}
          />
          <div className="grid gap-3 md:grid-cols-2">
            {futureSections.map(({ section, title, description }) => (
              <SettingsUnavailableState
                key={section.key}
                title={title}
                description={description}
                status={section.status}
              />
            ))}
          </div>
        </div>
      ) : null}

      {sections.length === 0 ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-dashed border-gray-200 bg-iwana-surface-soft px-4 py-4 text-sm text-gray-600 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-300">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-iwana-primary/8 text-iwana-primary dark:bg-iwana-primary-400/20 dark:text-iwana-primary-300">
            <Blocks className="h-5 w-5" aria-hidden={true} />
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-white">
              {SETTINGS_HUB_COPY.emptyTitle}
            </p>
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
              {SETTINGS_HUB_COPY.emptyDescription}
            </p>
          </div>
        </div>
      ) : null}
    </PortalPanel>
  );
}
