import { Badge } from '@iwana/ui';
import type { UserProfile } from '@/lib/api-client';

interface ProfileHeaderProps {
  profile: UserProfile;
  roleLabel: string;
}

function statusVariant(status: string): 'success' | 'warning' | 'error' | 'neutral' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'SUSPENDED') return 'error';
  if (status === 'INACTIVE') return 'warning';
  return 'neutral';
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    ACTIVE: 'Activo',
    SUSPENDED: 'Suspendido',
    INACTIVE: 'Inactivo',
  };
  return labels[status] ?? status;
}

/**
 * Encabezado visual del perfil del usuario autenticado.
 * Usa iniciales del nombre como avatar (el email real no se expone en JWT por seguridad).
 */
export function ProfileHeader({ profile, roleLabel }: ProfileHeaderProps) {
  const fullName =
    [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Sin nombre configurado';

  const initials =
    [profile.firstName?.[0], profile.lastName?.[0]].filter(Boolean).join('').toUpperCase() || '?';

  return (
    <div className="flex items-center gap-6 rounded-xl border border-gray-200 bg-white p-6 dark:border-dark-border-2 dark:bg-dark-surface-2">
      <div className="relative shrink-0">
        <div
          className="w-24 h-24 rounded-full ring-4 ring-iwana-primary/20 bg-iwana-primary flex items-center justify-center"
          aria-label={`Avatar de ${fullName}`}
        >
          <span className="text-3xl font-bold text-white select-none">{initials}</span>
        </div>
        <span className="absolute bottom-1 right-1 h-4 w-4 rounded-full border-2 border-white bg-green-400 dark:border-dark-surface-2" />
      </div>

      <div className="min-w-0 flex-1">
        <h1 className="truncate text-2xl font-bold text-gray-900 dark:text-white">{fullName}</h1>
        {profile.jobTitle && (
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{profile.jobTitle}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="primary">{roleLabel}</Badge>
          <Badge variant={statusVariant(profile.status)}>{statusLabel(profile.status)}</Badge>
        </div>
      </div>
    </div>
  );
}
