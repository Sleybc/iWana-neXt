// apps/web/src/components/layout/DropdownUser.tsx
'use client';
import { useId, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut, Settings, User as UserIcon } from 'lucide-react';
import {
  Avatar,
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

export function platformRoleToLabel(role: string): string {
  const labels: Record<string, string> = {
    system_admin: 'Administrador de plataforma',
    SYSTEM_ADMIN: 'Administrador de plataforma',
    iwana_support: 'Soporte iWana',
    IWANA_SUPPORT: 'Soporte iWana',
  };

  return labels[role] ?? role;
}

export const DropdownUser = () => {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const menuId = 'web-user-menu';

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

  const displayName = user?.displayName ?? 'Usuario';
  const subtitle = user?.role ? platformRoleToLabel(user.role) : 'Sesión no inicializada';
  const nameId = useId();

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
            <span id={nameId} className="block text-sm font-medium text-gray-800 dark:text-white">
              {displayName}
            </span>
            <span className="block text-xs text-gray-500 dark:text-gray-400">{subtitle}</span>
          </span>

          <Avatar size="md" variant="soft" name={displayName} labelledById={nameId} />

          <ChevronDown
            className={cn(
              'hidden w-4 h-4 text-gray-500 dark:text-gray-400 transition-transform sm:block',
              open && 'rotate-180',
            )}
          />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent id={menuId} width="w-64" align="end" sideOffset={12}>
        <DropdownMenuHeader title={displayName} subtitle={subtitle} />

        <DropdownMenuItem
          asChild
          className={cn('gap-3 rounded-lg px-3 py-2', interactiveFocusClassName)}
        >
          <Link href="/profile">
            <UserIcon className="w-4 h-4" aria-hidden="true" />
            Editar perfil
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem
          asChild
          className={cn('gap-3 rounded-lg px-3 py-2', interactiveFocusClassName)}
        >
          <Link href="/settings">
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
