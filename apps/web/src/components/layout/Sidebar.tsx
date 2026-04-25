// apps/web/src/components/layout/Sidebar.tsx
'use client';
import { Suspense, useEffect, useRef, type ComponentType } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Building2, ClipboardList, LayoutDashboard, Settings, Users, X } from 'lucide-react';
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
  icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

const DESKTOP_STORAGE_KEY = 'iwana-web-sidebar-collapsed';

// Grupos de navegación con sus ítems
const navGroups: NavGroup[] = [
  {
    group: 'MENÚ',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { href: '/tenants', label: 'Empresas', icon: Building2 },
      { href: '/users', label: 'Usuarios', icon: Users },
    ],
  },
  {
    group: 'ADMINISTRACIÓN',
    items: [
      // Registros de auditoría — historial de operaciones CUD del sistema
      { href: '/audit-logs', label: 'Registros de Auditoría', icon: ClipboardList },
      { href: '/settings', label: 'Configuración', icon: Settings },
    ],
  },
];

interface NavItemsProps {
  desktopCollapsed: boolean;
}

const NavItems = ({ desktopCollapsed }: NavItemsProps) => {
  const pathname = usePathname();

  return (
    <>
      {navGroups.map((navGroup, groupIndex) => (
        <div key={navGroup.group} className="mb-2">
          <p
            className={cn(
              'uppercase text-xs font-semibold text-gray-600 dark:text-gray-300 tracking-wider px-4 mb-2 mt-6',
              groupIndex === 0 && 'mt-0',
              desktopCollapsed && 'lg:hidden',
            )}
          >
            {navGroup.group}
          </p>

          <ul className="flex flex-col gap-1 px-2">
            {navGroup.items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
              const Icon = item.icon;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    title={desktopCollapsed ? item.label : undefined}
                    className={cn(
                      'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150',
                      isActive
                        ? 'bg-iwana-primary-50 text-iwana-primary-700 dark:bg-iwana-primary-800/30 dark:text-iwana-primary-200 font-medium'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-white/5',
                      desktopCollapsed && 'lg:justify-center lg:px-2',
                    )}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <Icon
                      aria-hidden
                      className={cn(
                        'h-5 w-5 shrink-0',
                        isActive
                          ? 'text-iwana-primary-600 dark:text-iwana-primary-300'
                          : 'text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300',
                      )}
                    />

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
    </>
  );
};

export const Sidebar = ({
  desktopCollapsed,
  setDesktopCollapsed,
  mobileOpen,
  setMobileOpen,
}: SidebarProps) => {
  const sidebar = useRef<HTMLElement>(null);

  // Persistir estado desktop en localStorage
  useEffect(() => {
    const stored = localStorage.getItem(DESKTOP_STORAGE_KEY);
    if (stored === 'true') setDesktopCollapsed(true);
    else if (stored === 'false') setDesktopCollapsed(false);
  }, [setDesktopCollapsed]);

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
        'bg-white dark:bg-dark-surface-2 border-r border-transparent dark:border-transparent',
        // Transición suave de ancho
        'transition-all duration-200 ease-linear',
        // Desktop: estático, ancho variable según colapso
        'lg:static lg:translate-x-0',
        desktopCollapsed ? 'lg:w-[90px]' : 'lg:w-[290px]',
        // Mobile: drawer overlay con ancho fijo, translate
        mobileOpen ? 'translate-x-0 w-[290px]' : '-translate-x-full w-[290px] lg:translate-x-0',
      )}
    >
      {/* SIDEBAR HEADER — min-h-16 (64px) = TopHeader py-3 + h-10 para alinear borde y centros */}
      <div
        className={cn(
          'flex items-center gap-2 px-4 py-3 min-h-16 border-b border-transparent dark:border-transparent',
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
          <Suspense fallback={null}>
            <NavItems desktopCollapsed={desktopCollapsed} />
          </Suspense>
        </nav>
      </div>
      {/* /MENÚ DE NAVEGACIÓN */}
    </aside>
  );
};
