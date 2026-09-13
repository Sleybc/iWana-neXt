// apps/portal/src/components/operations/OperationsModuleTabs.tsx
// Pestañas de ruta del módulo Operaciones (spec 2026-09-13 §4.3): enlaces
// reales `<Link>`, no Tabs de Radix — cada pestaña es una ruta que debe poder
// abrirse en pestaña nueva, compartirse y prerenderizarse.
//
// D-A4 (directriz vinculante): composición shell (`portalModuleTabsShellClassName`)
// + track (`portalModuleTabsTrackClassName`) + trigger píldora
// (`portalModuleTabTriggerClassName`) con `data-state="active"` fijado
// manualmente en el enlace activo — con `<Link>` real no hay `data-state` de
// Radix. NO se mezcla `portalTabActiveClassName` (gramática de subrayado de
// tabs de recurso: duplicaría y contradiría la señal activa de la píldora).
//
// Una pestaña que el usuario no puede abrir no se pinta (no se pinta
// deshabilitada); la activa lleva `aria-current="page"`.
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AccessPermissionKey } from '@iwana/shared';
import { usePermissions } from '@/components/access-control/permissions-context';
import {
  portalModuleTabTriggerClassName,
  portalModuleTabsShellClassName,
  portalModuleTabsTrackClassName,
} from '@/components/shared/portal-ui';

interface OperationsModuleTab {
  href: string;
  label: string;
  permission: AccessPermissionKey;
}

// Etiquetas y orden ratificados por AI-PROD-UX (UX spec §4.2, D1).
const OPERATIONS_MODULE_TABS: readonly OperationsModuleTab[] = [
  {
    href: '/dashboard/operations/tasks',
    label: 'Tareas',
    permission: AccessPermissionKey.OPERATIONS_TASKS_READ,
  },
  {
    href: '/dashboard/operations/execution-orders',
    label: 'Órdenes de ejecución',
    permission: AccessPermissionKey.OPERATIONS_EXECUTION_ORDERS_READ,
  },
];

export function OperationsModuleTabs() {
  // Fuera del contexto de router `usePathname()` devuelve null; '' mantiene
  // inactiva la detección de pestaña activa sin romper el render.
  const pathname = usePathname() ?? '';
  const { status, hasPermission } = usePermissions();

  // Sin permisos resueltos no se pinta ninguna pestaña; el gate de cada
  // sub-ruta mantiene su propio skeleton de verificación (D-A8).
  if (status !== 'ready') {
    return null;
  }

  const permittedTabs = OPERATIONS_MODULE_TABS.filter((tab) => hasPermission(tab.permission));
  if (permittedTabs.length === 0) {
    return null;
  }

  return (
    <nav aria-label="Secciones de Operaciones" className={portalModuleTabsShellClassName}>
      <div className={portalModuleTabsTrackClassName}>
        {permittedTabs.map((tab) => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? 'page' : undefined}
              data-state={active ? 'active' : undefined}
              className={portalModuleTabTriggerClassName}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
