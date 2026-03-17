// apps/portal/src/components/layout/DropdownUser.tsx
'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut, Settings, User as UserIcon } from 'lucide-react';
import { cn } from '@iwana/ui';
import { useAuth } from '@/components/auth/AuthProvider';

/**
 * Mapea el rol interno del tenant a texto legible para el panel empresarial.
 * Alineado con UserRole enum del backend (valores en UPPER_CASE).
 */
function roleToLabel(role: string): string {
  const labels: Record<string, string> = {
    ADMIN: 'Administrador',
    NOC: 'Operador NOC',
    ACCOUNTANT: 'Contabilidad',
    SUPPORT: 'Soporte',
    SALES: 'Ventas',
    TECHNICIAN: 'Técnico',
    HR: 'Recursos Humanos',
    AUDITOR: 'Auditor',
    SUBSCRIBER: 'Suscriptor',
  };
  return labels[role] ?? role;
}

export const DropdownUser = () => {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dropdown = useRef<HTMLDivElement>(null);
  const menuId = 'portal-user-menu';
  const triggerAriaProps = {
    'aria-controls': menuId,
    'aria-expanded': dropdownOpen,
    'aria-haspopup': 'menu' as const,
    'aria-label': 'Menú de usuario',
  };

  // Cerrar al hacer click fuera del dropdown
  useEffect(() => {
    const clickHandler = ({ target }: MouseEvent) => {
      if (!dropdown.current) return;
      if (
        !dropdownOpen ||
        dropdown.current.contains(target as Node) ||
        trigger.current?.contains(target as Node)
      ) {
        return;
      }
      setDropdownOpen(false);
    };
    document.addEventListener('click', clickHandler);
    return () => document.removeEventListener('click', clickHandler);
  });

  // Cerrar con tecla Escape
  useEffect(() => {
    const keyHandler = ({ key }: KeyboardEvent) => {
      if (!dropdownOpen || key !== 'Escape') return;
      setDropdownOpen(false);
    };
    document.addEventListener('keydown', keyHandler);
    return () => document.removeEventListener('keydown', keyHandler);
  });

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await logout();
      setDropdownOpen(false);
      router.push('/auth/login');
    } finally {
      setIsLoggingOut(false);
    }
  };

  // displayName: nombre real del usuario si está disponible, si no el rol
  const displayName = user?.displayName ?? 'Usuario';
  const subtitle = user?.subtitle ?? '';

  return (
    <div className="relative">
      <button
        type="button"
        ref={trigger}
        onClick={() => setDropdownOpen(!dropdownOpen)}
        {...triggerAriaProps}
        className="flex items-center gap-2"
      >
        <span className="hidden text-right lg:block">
          <span className="block text-sm font-medium text-gray-800 dark:text-white">
            {displayName}
          </span>
          <span className="block text-xs text-gray-500 dark:text-gray-400">{subtitle}</span>
        </span>

        <span className="h-10 w-10 overflow-hidden rounded-full flex items-center justify-center bg-gray-200 dark:bg-dark-surface-4 shrink-0">
          <UserIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </span>

        <ChevronDown
          className={cn(
            'hidden w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform sm:block',
            dropdownOpen && 'rotate-180',
          )}
        />
      </button>

      {/* Dropdown Menu */}
      <div
        id={menuId}
        ref={dropdown}
        role="menu"
        className={cn(
          'absolute right-0 mt-3 w-64 flex flex-col rounded-xl border border-gray-200 bg-white shadow-lg dark:border-dark-border-2 dark:bg-dark-surface-2',
          dropdownOpen ? 'block' : 'hidden',
        )}
      >
        <div className="px-4 py-3 border-b border-gray-100 dark:border-dark-border-2">
          <span className="block text-sm font-medium text-gray-800 dark:text-white">
            {displayName}
          </span>
          <span className="block text-xs text-gray-500 dark:text-gray-400">{subtitle}</span>
        </div>

        {/* Opciones de navegación — solo rutas implementadas */}
        <ul
          className="flex flex-col gap-1 p-2 border-b border-gray-100 dark:border-dark-border-2"
          role="none"
        >
          <li role="none">
            <Link
              href="/dashboard/profile"
              role="menuitem"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-dark-surface-4 dark:hover:text-white"
            >
              <UserIcon className="w-4 h-4" aria-hidden="true" />
              Mi perfil
            </Link>
          </li>
          <li role="none">
            <Link
              href="/dashboard/settings"
              role="menuitem"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-dark-surface-4 dark:hover:text-white"
            >
              <Settings className="w-4 h-4" aria-hidden="true" />
              Configuración de empresa
            </Link>
          </li>
        </ul>

        <div className="p-2">
          <button
            type="button"
            role="menuitem"
            disabled={isLoggingOut}
            onClick={handleLogout}
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-dark-surface-4 dark:hover:text-white"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            {isLoggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
          </button>
        </div>
      </div>
    </div>
  );
};
