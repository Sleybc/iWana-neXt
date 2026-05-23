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
import { PortalPanel, interactiveFocusClassName } from '@/components/shared/portal-ui';
import { type SettingsSection } from '@/lib/api-client';
import { SettingsUnavailableState } from './SettingsUnavailableState';

interface SettingsSectionGridProps {
  sections: SettingsSection[];
  effectivePermissions: AccessPermissionKey[];
}

const iconMap = {
  [SettingsSectionKey.ORGANIZATION]: Building2,
  [SettingsSectionKey.ACCESS]: ShieldCheck,
  [SettingsSectionKey.SECURITY]: ShieldCheck,
  [SettingsSectionKey.BRANDING]: Palette,
  [SettingsSectionKey.FIELD_OPERATIONS]: Wrench,
  [SettingsSectionKey.CALENDAR]: CalendarDays,
  [SettingsSectionKey.COMMERCIAL]: Briefcase,
  [SettingsSectionKey.BILLING]: CreditCard,
  [SettingsSectionKey.INVENTORY]: Package,
  [SettingsSectionKey.INTEGRATIONS]: Waypoints,
} satisfies Record<SettingsSectionKey, typeof Building2>;

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

export function SettingsSectionGrid({ sections, effectivePermissions }: SettingsSectionGridProps) {
  return (
    <PortalPanel
      eyebrow="Shell federado"
      title="Secciones de configuración"
      description="MOD00 organiza la navegación y cada módulo owner conserva sus datos, endpoints y estados reales."
    >
      <div className="grid gap-4 xl:grid-cols-2">
        {sections.map((section) => {
          const Icon = iconMap[section.key];
          const isOperable = hasAllRequiredPermissions(section, effectivePermissions);

          if (section.status !== SettingsSectionStatus.AVAILABLE || !section.route) {
            return (
              <SettingsUnavailableState
                key={section.key}
                title={section.label}
                description={section.description}
                ownerModule={section.ownerModule}
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
                      <span className="rounded-full bg-white/80 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:bg-dark-surface-3 dark:text-slate-200">
                        {section.ownerModule}
                      </span>
                    </div>
                    <div>
                      <p className="text-base font-semibold text-gray-900 dark:text-white">
                        {section.label}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-gray-600 dark:text-gray-300">
                        {section.description}
                      </p>
                    </div>
                    <p className="text-sm leading-6 text-amber-900 dark:text-amber-200">
                      Tu sesión no tiene los permisos granulares requeridos para operar esta
                      sección.
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
                'group rounded-2xl border border-gray-200 bg-white p-5 transition hover:border-iwana-primary/35 hover:bg-[#f8faf5] dark:border-dark-border dark:bg-dark-surface-2 dark:hover:border-iwana-primary/30 dark:hover:bg-dark-surface-3',
              )}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">
                      {statusLabelMap[section.status]}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:bg-dark-surface-3 dark:text-slate-200">
                      {section.ownerModule}
                    </span>
                  </div>
                  <div>
                    <p className="text-base font-semibold text-gray-900 transition group-hover:text-iwana-primary dark:text-white">
                      {section.label}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
                      {section.description}
                    </p>
                  </div>
                  <p className="text-sm font-medium text-iwana-primary">Abrir sección</p>
                </div>
                <div className="rounded-2xl bg-[#f8faf5] p-3 text-iwana-primary shadow-sm dark:bg-dark-surface-3">
                  <Icon className="h-5 w-5" aria-hidden={true} />
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      {sections.length === 0 ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-dashed border-gray-200 bg-[#f8faf5] px-4 py-4 text-sm text-gray-600 dark:border-dark-border dark:bg-dark-surface-3 dark:text-gray-300">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-iwana-primary/8 text-iwana-primary dark:bg-iwana-primary-400/20 dark:text-iwana-primary-300">
            <Blocks className="h-5 w-5" aria-hidden={true} />
          </div>
          <div>
            <p className="font-medium text-gray-900 dark:text-white">Sin secciones registradas</p>
            <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
              El shell federado no recibió metadata de secciones visibles para este tenant.
            </p>
          </div>
        </div>
      ) : null}
    </PortalPanel>
  );
}
