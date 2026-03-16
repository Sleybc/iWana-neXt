// apps/web/src/components/layout/DropdownUser.tsx
'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut, Settings, User as UserIcon, Headphones } from 'lucide-react';
import { cn } from '@iwana/ui';
import { useAuth } from '@/components/auth/AuthProvider';

/** Avatar circular con la inicial del nombre del usuario */
function UserAvatar({ displayName }: { displayName: string }) {
  const initial = displayName[0]?.toUpperCase() ?? 'U';
  return (
    <div
      className="h-8 w-8 rounded-full bg-iwana-primary-100 text-iwana-primary-700 flex items-center justify-center text-sm font-semibold shrink-0"
      aria-hidden="true"
    >
      {initial}
    </div>
  );
}

export const DropdownUser = () => {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dropdown = useRef<HTMLDivElement>(null);
  const menuId = 'web-user-menu';
  const triggerAriaProps = {
    'aria-controls': menuId,
    'aria-expanded': dropdownOpen,
    'aria-haspopup': 'menu',
    'aria-label': 'Menú de usuario',
  } as const;

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

  const displayName = user?.displayName ?? 'Usuario';
  const subtitle = user?.subtitle ?? 'Sesión no inicializada';

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

        <UserAvatar displayName={displayName} />

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

        <ul
          className="flex flex-col gap-1 p-2 border-b border-gray-100 dark:border-dark-border-2"
          role="none"
        >
          <li role="none">
            <Link
              href="/profile"
              role="menuitem"
              onClick={() => setDropdownOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-dark-surface-4 dark:hover:text-white"
            >
              <UserIcon className="w-4 h-4" aria-hidden="true" />
              Editar perfil
            </Link>
          </li>
          <li role="none">
            <Link
              href="/settings"
              role="menuitem"
              onClick={() => setDropdownOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-dark-surface-4 dark:hover:text-white"
            >
              <Settings className="w-4 h-4" aria-hidden="true" />
              Configuración
            </Link>
          </li>
          <li role="none">
            <Link
              href="/support"
              role="menuitem"
              onClick={() => setDropdownOpen(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-dark-surface-4 dark:hover:text-white"
            >
              <Headphones className="w-4 h-4" aria-hidden="true" />
              Soporte
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
