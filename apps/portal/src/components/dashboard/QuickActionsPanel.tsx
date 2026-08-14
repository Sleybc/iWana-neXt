'use client';

import { UserRole } from '@iwana/shared';
import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import {
  PortalEmptyState,
  PortalNavListRow,
  PortalPanel,
  portalInlineTextLinkClassName,
} from '@/components/shared/portal-ui';
import Link from 'next/link';

interface QuickAccessDefinition {
  id: string;
  label: string;
  description: string;
  href: string;
  roles: readonly UserRole[];
}

/**
 * Accesos rápidos del inicio — mapa estático UX §4.14.
 * Filtrado por rol (techo de autorización), sin celdas deshabilitadas ni «Fase siguiente».
 */
const QUICK_ACCESSES: readonly QuickAccessDefinition[] = [
  {
    id: 'commercial',
    label: 'Comercial',
    description: 'Catálogo, precios vigentes y reglas comerciales',
    href: '/dashboard/commercial',
    roles: [UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT, UserRole.NOC, UserRole.ACCOUNTANT],
  },
  {
    id: 'scheduling',
    label: 'Programación',
    description: 'Agenda y solicitudes de operaciones de campo',
    href: '/dashboard/scheduling',
    roles: [
      UserRole.ADMIN,
      UserRole.NOC,
      UserRole.SUPPORT,
      UserRole.TECHNICIAN,
      UserRole.CONTRACTOR,
    ],
  },
  {
    id: 'assurance',
    label: 'Mesa de ayuda',
    description: 'Casos abiertos y seguimiento de servicio',
    href: '/dashboard/assurance',
    roles: [UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT],
  },
  {
    id: 'inventory',
    label: 'Inventario',
    description: 'Existencias y productos operativos',
    href: '/dashboard/inventory',
    roles: [UserRole.ADMIN, UserRole.NOC, UserRole.SUPPORT],
  },
  {
    id: 'opportunities',
    label: 'Oportunidades',
    description: 'Embudo comercial y seguimiento',
    href: '/dashboard/crm/expedientes',
    roles: [UserRole.ADMIN, UserRole.SALES, UserRole.SUPPORT],
  },
  {
    id: 'users',
    label: 'Usuarios y accesos',
    description: 'Cuentas del equipo y perfiles de acceso',
    href: '/dashboard/users',
    roles: [UserRole.ADMIN],
  },
  {
    id: 'settings',
    label: 'Configuración',
    description: 'Zona horaria, moneda y datos de la empresa',
    href: '/dashboard/settings',
    roles: [UserRole.ADMIN],
  },
  {
    id: 'profile',
    label: 'Mi perfil',
    description: 'Datos de tu cuenta y verificación en dos pasos',
    href: '/dashboard/profile',
    roles: [
      UserRole.ADMIN,
      UserRole.NOC,
      UserRole.SUPPORT,
      UserRole.SALES,
      UserRole.ACCOUNTANT,
      UserRole.TECHNICIAN,
      UserRole.CONTRACTOR,
      UserRole.AUDITOR,
      UserRole.HR,
      UserRole.SUBSCRIBER,
      UserRole.PARTNER,
      UserRole.INVESTOR,
    ],
  },
];

const QUICK_ACCESS_VISIBLE_CAP = 5;

interface QuickActionsPanelProps {
  role: UserRole;
}

export function QuickActionsPanel({ role }: QuickActionsPanelProps) {
  const items = QUICK_ACCESSES.filter((access) => access.roles.includes(role));
  const [expanded, setExpanded] = useState(false);
  const hasOverflow = items.length > QUICK_ACCESS_VISIBLE_CAP;
  const visibleItems = expanded || !hasOverflow ? items : items.slice(0, QUICK_ACCESS_VISIBLE_CAP);
  const hiddenCount = items.length - QUICK_ACCESS_VISIBLE_CAP;

  return (
    <PortalPanel compact title="Accesos rápidos">
      {items.length === 0 ? (
        <PortalEmptyState
          embedded
          title="Sin destinos disponibles"
          description="Tu perfil no tiene accesos rápidos en el inicio. Revisa tu perfil para continuar."
          action={
            <Link href="/dashboard/profile" className={portalInlineTextLinkClassName}>
              Ir a mi perfil
            </Link>
          }
        />
      ) : (
        <div className="space-y-2">
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2" aria-label="Accesos rápidos">
            {visibleItems.map((access) => (
              <li key={access.id}>
                <PortalNavListRow
                  href={access.href}
                  title={access.label}
                  meta={<span className="sr-only">{access.description}</span>}
                  trailing={<ArrowRight className="h-4 w-4" aria-hidden={true} />}
                  aria-label={access.label}
                />
              </li>
            ))}
          </ul>
          {hasOverflow ? (
            <button
              type="button"
              onClick={() => setExpanded((open) => !open)}
              className={portalInlineTextLinkClassName}
              aria-expanded={expanded}
            >
              {expanded
                ? 'Mostrar menos'
                : `Ver más · ${hiddenCount} ${hiddenCount === 1 ? 'acceso' : 'accesos'}`}
            </button>
          ) : null}
        </div>
      )}
    </PortalPanel>
  );
}

/** Exportado para pruebas: mapa §4.14 sin destinos deshabilitados. */
export function __listQuickAccessLabelsForRole(role: UserRole): string[] {
  return QUICK_ACCESSES.filter((access) => access.roles.includes(role)).map(
    (access) => access.label,
  );
}
