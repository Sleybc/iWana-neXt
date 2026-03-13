// apps/portal/src/components/layout/DropdownUser.tsx
'use client';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { ChevronDown, LogOut, Settings, User as UserIcon, Headphones } from 'lucide-react';
import { cn } from '@iwana/ui';

export const DropdownUser = () => {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dropdown = useRef<HTMLDivElement>(null);
  const menuId = 'portal-user-menu';
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
            Suscriptor
          </span>
          <span className="block text-xs text-gray-500 dark:text-gray-400">Plan activo</span>
        </span>

        <span className="h-10 w-10 overflow-hidden rounded-full flex items-center justify-center bg-gray-200 dark:bg-gray-700 shrink-0">
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
          'absolute right-0 mt-3 w-64 flex flex-col rounded-xl border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800',
          dropdownOpen ? 'block' : 'hidden',
        )}
      >
        <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
          <span className="block text-sm font-medium text-gray-800 dark:text-white">Suscriptor iWana</span>
          <span className="block text-xs text-gray-500 dark:text-gray-400">suscriptor@iwana.com</span>
        </div>

        <ul className="flex flex-col gap-1 p-2 border-b border-gray-100 dark:border-gray-700" role="none">
          <li role="none">
            <Link
              href="/profile"
              role="menuitem"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
            >
              <UserIcon className="w-4 h-4" aria-hidden="true" />
              Mi perfil
            </Link>
          </li>
          <li role="none">
            <Link
              href="/settings"
              role="menuitem"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
            >
              <Settings className="w-4 h-4" aria-hidden="true" />
              Configuración
            </Link>
          </li>
          <li role="none">
            <Link
              href="/support"
              role="menuitem"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
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
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white"
          >
            <LogOut className="w-4 h-4" aria-hidden="true" />
            Cerrar sesión
          </button>
        </div>
      </div>
    </div>
  );
};
