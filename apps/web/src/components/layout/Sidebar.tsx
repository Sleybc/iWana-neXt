// apps/web/src/components/layout/Sidebar.tsx
'use client';
import React, { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { X } from 'lucide-react';
import { cn } from '@iwana/ui';

interface SidebarProps {
  desktopCollapsed: boolean;
  setDesktopCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

const DESKTOP_STORAGE_KEY = 'iwana-web-sidebar-collapsed';

// Iconos SVG inline Heroicons — outline 24px
const IconHome = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="w-5 h-5 shrink-0"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"
    />
  </svg>
);

const IconBuilding = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="w-5 h-5 shrink-0"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
    />
  </svg>
);

const IconUsers = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="w-5 h-5 shrink-0"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z"
    />
  </svg>
);

const IconClipboard = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="w-5 h-5 shrink-0"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 0 0 2.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 0 0-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75 2.25 2.25 0 0 0-.1-.664m-5.8 0A2.251 2.251 0 0 1 13.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25ZM6.75 12h.008v.008H6.75V12Zm0 3h.008v.008H6.75V15Zm0 3h.008v.008H6.75V18Z"
    />
  </svg>
);

const IconCog = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="w-5 h-5 shrink-0"
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
    />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
  </svg>
);

// Grupos de navegación con sus ítems
const navGroups: NavGroup[] = [
  {
    group: 'MENÚ',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: <IconHome /> },
      { href: '/tenants', label: 'Empresas', icon: <IconBuilding /> },
      { href: '/users', label: 'Usuarios', icon: <IconUsers /> },
    ],
  },
  {
    group: 'ADMINISTRACIÓN',
    items: [
      // Registros de auditoría — historial de operaciones CUD del sistema
      { href: '/audit-logs', label: 'Registros de Auditoría', icon: <IconClipboard /> },
      { href: '/settings', label: 'Configuración', icon: <IconCog /> },
    ],
  },
];

export const Sidebar = ({
  desktopCollapsed,
  setDesktopCollapsed,
  mobileOpen,
  setMobileOpen,
}: SidebarProps) => {
  const pathname = usePathname();
  const sidebar = useRef<HTMLElement>(null);

  // Persistir estado desktop en localStorage
  useEffect(() => {
    const stored = localStorage.getItem(DESKTOP_STORAGE_KEY);
    if (stored === 'true') setDesktopCollapsed(true);
    else if (stored === 'false') setDesktopCollapsed(false);
    // Solo al montar — dependencias omitidas intencionalmente
  }, []);

  const handleDesktopToggle = () => {
    const next = !desktopCollapsed;
    setDesktopCollapsed(next);
    localStorage.setItem(DESKTOP_STORAGE_KEY, String(next));
  };

  // Cerrar drawer mobile con tecla Escape
  useEffect(() => {
    const keyHandler = ({ key }: KeyboardEvent) => {
      if (mobileOpen && key === 'Escape') setMobileOpen(false);
    };
    document.addEventListener('keydown', keyHandler);
    return () => document.removeEventListener('keydown', keyHandler);
  }, [mobileOpen, setMobileOpen]);

  return (
    <aside
      id="sidebar"
      ref={sidebar}
      aria-label="Navegación principal"
      className={cn(
        // Base: fondo blanco en modo claro, superficie elevada en dark
        'fixed left-0 top-0 z-[9999] flex h-screen flex-col overflow-y-hidden',
        'bg-white dark:bg-dark-surface-2 border-r border-gray-200 dark:border-dark-border',
        // Transición suave de ancho
        'transition-all duration-200 ease-linear',
        // Desktop: estático, ancho variable según colapso
        'lg:static lg:translate-x-0',
        desktopCollapsed ? 'lg:w-[90px]' : 'lg:w-[290px]',
        // Mobile: drawer overlay con ancho fijo, translate
        mobileOpen ? 'translate-x-0 w-[290px]' : '-translate-x-full w-[290px] lg:translate-x-0',
      )}
    >
      {/* SIDEBAR HEADER */}
      <div
        className={cn(
          'flex items-center gap-2 px-4 py-5 min-h-[4.5rem] border-b border-gray-200 dark:border-dark-border',
          desktopCollapsed ? 'lg:justify-center lg:px-2' : 'justify-between',
        )}
      >
        {/* Logo completo — visible cuando está expandido */}
        <Link
          href="/dashboard"
          className={cn('flex items-center gap-3 min-w-0', desktopCollapsed && 'lg:hidden')}
        >
          <div className="w-8 h-8 shrink-0 rounded-md bg-iwana-primary flex items-center justify-center">
            <span className="text-iwana-secondary font-bold text-base" aria-hidden="true">
              iW
            </span>
          </div>
          <span className="text-lg font-bold tracking-tight text-iwana-primary dark:text-white truncate">
            iWana neXt
          </span>
        </Link>

        {/* Icono solo — visible cuando está colapsado en desktop */}
        <Link
          href="/dashboard"
          className={cn('hidden items-center justify-center', desktopCollapsed && 'lg:flex')}
          aria-label="Ir al dashboard"
          title="iWana neXt — Dashboard"
        >
          <div className="w-8 h-8 rounded-md bg-iwana-primary flex items-center justify-center">
            <span className="text-iwana-secondary font-bold text-base" aria-hidden="true">
              iW
            </span>
          </div>
        </Link>

        {/* Botón cerrar — solo mobile */}
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          aria-label="Cerrar menú"
          className="lg:hidden text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-white shrink-0"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      {/* /SIDEBAR HEADER */}

      {/* MENÚ DE NAVEGACIÓN con grupos */}
      <div className="no-scrollbar flex flex-col overflow-y-auto flex-1 py-4">
        <nav aria-label="Menú principal">
          {navGroups.map((navGroup) => (
            <div key={navGroup.group} className="mb-2">
              {/* Etiqueta del grupo — oculta en modo colapsado */}
              <p
                className={cn(
                  'uppercase text-xs font-semibold text-gray-400 dark:text-gray-500 tracking-wider px-4 mb-2 mt-6',
                  // Primera sección no necesita margen top adicional
                  navGroup.group === 'MENÚ' && 'mt-0',
                  // Ocultar etiqueta cuando el sidebar está colapsado
                  desktopCollapsed && 'lg:hidden',
                )}
                aria-hidden={desktopCollapsed ? true : undefined}
              >
                {navGroup.group}
              </p>

              <ul className="flex flex-col gap-1 px-2">
                {navGroup.items.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        // Tooltip nativo del browser cuando está colapsado
                        title={desktopCollapsed ? item.label : undefined}
                        className={cn(
                          // Base del item
                          'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
                          // Estado activo: fondo primario muy claro + texto primario oscuro
                          isActive
                            ? 'bg-iwana-primary-50 text-iwana-primary-700 dark:bg-iwana-primary-800/30 dark:text-iwana-primary-200 font-medium'
                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5',
                          // Centrar icono cuando está colapsado
                          desktopCollapsed && 'lg:justify-center lg:px-2',
                        )}
                        aria-current={isActive ? 'page' : undefined}
                      >
                        {/* Icono del ítem de navegación */}
                        <span
                          className={cn(
                            'shrink-0',
                            isActive
                              ? 'text-iwana-primary-600 dark:text-iwana-primary-300'
                              : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300',
                          )}
                        >
                          {item.icon}
                        </span>

                        {/* Texto del ítem — oculto con overflow en modo colapsado */}
                        <span
                          className={cn(
                            'whitespace-nowrap overflow-hidden transition-all duration-200',
                            desktopCollapsed ? 'lg:w-0 lg:opacity-0' : 'w-auto opacity-100',
                          )}
                        >
                          {item.label}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      {/* /MENÚ DE NAVEGACIÓN */}
    </aside>
  );
};
