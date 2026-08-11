// apps/portal/src/components/layout/DropdownUser.tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut, Settings, User as UserIcon } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuHeader,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
  interactiveFocusClassName,
} from '@iwana/ui';
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
  const [open, setOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const menuId = 'portal-user-menu';

  const handleLogout = async () => {
    try {
      setIsLoggingOut(true);
      await logout();
      setOpen(false);
      router.push('/auth/login');
    } finally {
      setIsLoggingOut(false);
    }
  };

  // displayName: nombre real del usuario si está disponible, si no el rol
  const displayName = user?.displayName ?? 'Usuario';
  const subtitle = user?.subtitle ?? '';

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        asChild
        aria-label="Menú de usuario"
        aria-controls={menuId}
        className={cn('flex min-h-11 items-center gap-2 rounded-xl', interactiveFocusClassName)}
      >
        <button type="button">
          <span className="hidden text-right lg:block">
            <span className="block text-sm font-medium text-gray-800 dark:text-white">
              {displayName}
            </span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">{subtitle}</span>
          </span>

          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 dark:bg-dark-surface-4">
            <UserIcon className="h-5 w-5 text-gray-600 dark:text-gray-300" />
          </span>

          <ChevronDown
            className={cn(
              'hidden w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform sm:block',
              open && 'rotate-180',
            )}
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent id={menuId} width="w-72" align="end" sideOffset={12}>
        <DropdownMenuHeader title={displayName} subtitle={subtitle} />

        <DropdownMenuItem
          asChild
          className={cn('gap-3 rounded-lg px-3 py-2', interactiveFocusClassName)}
        >
          <Link href="/dashboard/profile">
            <UserIcon className="w-4 h-4" aria-hidden="true" />
            Mi perfil
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem
          asChild
          className={cn('gap-3 rounded-lg px-3 py-2', interactiveFocusClassName)}
        >
          <Link href="/dashboard/settings">
            <Settings className="w-4 h-4" aria-hidden="true" />
            Configuración
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuItem
          disabled={isLoggingOut}
          onClick={(event) => {
            event.preventDefault();
            void handleLogout();
          }}
          className={cn('gap-3 rounded-lg px-3 py-2', interactiveFocusClassName)}
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
          {isLoggingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
