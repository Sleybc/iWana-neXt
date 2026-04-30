'use client';

import { AlertTriangle, CheckCircle2, Clock, Loader2 } from 'lucide-react';
import { FormPanel, FormSectionTitle } from '@iwana/ui';

export interface SectionCompleteness {
  label: string;
  completed: number;
  total: number;
  required: boolean;
}

export type ProvisioningStatus = 'idle' | 'PROVISIONING' | 'ACTIVE' | 'PROVISIONING_FAILED';

interface TenantCreateSummaryProps {
  name: string;
  slug: string;
  contactEmail: string;
  sections: SectionCompleteness[];
  provisioningStatus: ProvisioningStatus;
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'iW';
  if (words.length === 1) return (words[0]?.slice(0, 2) ?? 'iW').toUpperCase();
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase();
}

const PROV_CONFIG = {
  idle: {
    label: 'En espera',
    detail: 'El schema de la empresa se creará al confirmar.',
    Icon: Clock,
    colorClass: 'text-gray-500 dark:text-gray-400',
    borderClass: 'border-gray-100 dark:border-dark-border',
    bgClass: 'bg-white dark:bg-dark-surface-2',
    spin: false,
  },
  PROVISIONING: {
    label: 'Provisionando...',
    detail: 'Creando schema y configuración inicial.',
    Icon: Loader2,
    colorClass: 'text-blue-600 dark:text-blue-400',
    borderClass: 'border-blue-200 dark:border-blue-800',
    bgClass: 'bg-blue-50 dark:bg-blue-900/20',
    spin: true,
  },
  ACTIVE: {
    label: 'Activo',
    detail: 'Schema creado y listo para operar.',
    Icon: CheckCircle2,
    colorClass: 'text-emerald-600 dark:text-emerald-400',
    borderClass: 'border-emerald-200 dark:border-emerald-800',
    bgClass: 'bg-emerald-50 dark:bg-emerald-900/20',
    spin: false,
  },
  PROVISIONING_FAILED: {
    label: 'Error de provisioning',
    detail: 'Revisa los logs del worker para más detalles.',
    Icon: AlertTriangle,
    colorClass: 'text-red-600 dark:text-red-400',
    borderClass: 'border-red-200 dark:border-red-800',
    bgClass: 'bg-red-50 dark:bg-red-900/20',
    spin: false,
  },
} as const;

export function TenantCreateSummary({
  name,
  slug,
  contactEmail,
  sections,
  provisioningStatus,
}: TenantCreateSummaryProps) {
  const hasName = name.trim().length > 0;
  const initials = getInitials(name);
  const prov = PROV_CONFIG[provisioningStatus];
  const { label, detail, Icon, colorClass, borderClass, bgClass, spin } = prov;

  return (
    <aside className="space-y-4 lg:sticky lg:top-6">
      {/* Vista previa de la empresa */}
      <FormPanel>
        <FormSectionTitle className="mb-4">Vista previa</FormSectionTitle>
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-iwana-primary text-base font-bold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p
              className={`truncate font-semibold ${
                hasName
                  ? 'text-gray-900 dark:text-white'
                  : 'italic text-gray-300 dark:text-gray-600'
              }`}
            >
              {hasName ? name : 'Nombre de la empresa'}
            </p>
            <p
              className={`mt-0.5 truncate font-mono text-xs ${
                slug
                  ? 'text-iwana-secondary-700 dark:text-iwana-secondary-400'
                  : 'text-gray-300 dark:text-gray-600'
              }`}
            >
              {slug || 'slug-empresa'}
            </p>
            <p
              className={`mt-0.5 truncate text-xs ${
                contactEmail
                  ? 'text-gray-500 dark:text-gray-400'
                  : 'text-gray-300 dark:text-gray-600'
              }`}
            >
              {contactEmail || 'email@empresa.com'}
            </p>
          </div>
        </div>
      </FormPanel>

      {/* Completitud por sección */}
      <FormPanel>
        <FormSectionTitle className="mb-4">Completitud</FormSectionTitle>
        <div className="space-y-3.5">
          {sections.map((section) => {
            const pct = section.total > 0 ? (section.completed / section.total) * 100 : 0;
            const isComplete = section.completed >= section.total;
            return (
              <div key={section.label}>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    {isComplete ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    ) : (
                      <div
                        className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${
                          section.required
                            ? 'border-red-300 dark:border-red-700'
                            : 'border-gray-200 dark:border-gray-700'
                        }`}
                      />
                    )}
                    <span className="truncate text-sm text-gray-700 dark:text-gray-200">
                      {section.label}
                    </span>
                    {section.required && !isComplete && (
                      <span className="shrink-0 text-xs font-semibold text-red-500">*</span>
                    )}
                  </div>
                  <span className="shrink-0 tabular-nums text-xs text-gray-400 dark:text-gray-500">
                    {section.completed}/{section.total}
                  </span>
                </div>
                {/* Barra de progreso */}
                <div className="h-1 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-dark-surface-3">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isComplete
                        ? 'bg-emerald-500'
                        : section.required
                          ? 'bg-red-400'
                          : 'bg-iwana-secondary'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </FormPanel>

      {/* Estado de provisioning */}
      <FormPanel className={`${borderClass} ${bgClass}`}>
        <FormSectionTitle className="mb-3">Provisioning</FormSectionTitle>
        <div className={`flex items-center gap-2 ${colorClass}`}>
          <Icon className={`h-4 w-4 ${spin ? 'animate-spin' : ''}`} />
          <span className="text-sm font-semibold">{label}</span>
        </div>
        <p className={`mt-1.5 text-xs opacity-80 ${colorClass}`}>{detail}</p>
      </FormPanel>
    </aside>
  );
}
