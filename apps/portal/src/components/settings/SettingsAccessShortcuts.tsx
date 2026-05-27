'use client';

import Link from 'next/link';
import { Building2, ShieldCheck, Wrench } from 'lucide-react';
import { cn } from '@iwana/ui';
import { PortalPanel } from '@/components/shared/portal-ui';

interface SettingsAccessShortcutsProps {
  canEdit: boolean;
}

const cards = [
  {
    href: '/dashboard/settings/organization',
    title: 'Organización',
    description: 'Consulta sedes, capacidades y horario institucional de la empresa.',
    icon: Building2,
  },
  {
    href: '/dashboard/settings/access',
    title: 'Perfiles de acceso',
    description: 'Administra perfiles de acceso, plantillas iniciales y accesos por sección.',
    icon: ShieldCheck,
  },
  {
    href: '/dashboard/settings/field-operations',
    title: 'Operación de campo',
    description:
      'Abre la configuración operativa de WFM y consulta la referencia de despacho técnico sin salir del centro de settings.',
    icon: Wrench,
  },
];

export function SettingsAccessShortcuts({ canEdit }: SettingsAccessShortcutsProps) {
  return (
    <PortalPanel
      eyebrow="MOD00"
      title="Accesos de configuración"
      description="Usa estas rutas para entrar a Organización, Operación de campo y Perfiles de acceso sin salir del centro de configuración."
    >
      <div className="grid gap-4 xl:grid-cols-3">
        {cards.map((card) => {
          const Icon = card.icon;

          return (
            <Link
              key={card.href}
              href={card.href}
              className={cn(
                'group rounded-2xl border border-gray-200 bg-[#f8faf5] p-4 transition hover:border-iwana-secondary/50 hover:bg-white dark:border-dark-border dark:bg-dark-surface-3 dark:hover:border-iwana-secondary/40 dark:hover:bg-dark-surface-2',
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-iwana-primary/10 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-iwana-primary">
                      {canEdit ? 'Administración' : 'Consulta'}
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
