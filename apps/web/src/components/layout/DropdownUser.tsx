// apps/web/src/components/layout/DropdownUser.tsx
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

export function platformRoleToLabel(role: string): string {
  const labels: Record<string, string> = {
    system_admin: 'Administrador de plataforma',
    SYSTEM_ADMIN: 'Administrador de plataforma',
    iwana_support: 'Soporte iWana',
    IWANA_SUPPORT: 'Soporte iWana',
  };

  return labels[role] ?? role;
}

/** Avatar circular con la inicial del nombre del usuario */
export function UserAvatar({ displayName }: { displayName: string }) {
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

          <UserAvatar displayName={displayName} />

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
