import { Badge } from '@iwana/ui';
import type { UserProfile } from '@/lib/api-client';
import { getPortalUserStatusLabel, getPortalUserStatusVariant } from '@/lib/user-labels';

interface ProfileHeaderProps {
  profile: UserProfile;
  roleLabel: string;
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
    <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 dark:border-dark-border-2 dark:bg-dark-surface-2">
      <div className="relative shrink-0">
        <div
          role="img"
          className="flex h-20 w-20 items-center justify-center rounded-full bg-iwana-primary ring-4 ring-iwana-primary/15"
          aria-label={`Avatar de ${fullName}`}
        >
          <span className="select-none text-2xl font-bold text-white">{initials}</span>
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xl font-semibold text-gray-900 dark:text-white">{fullName}</p>
        {profile.jobTitle && (
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">{profile.jobTitle}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Badge variant="primary">{roleLabel}</Badge>
          <Badge variant={getPortalUserStatusVariant(profile.status)}>
            {getPortalUserStatusLabel(profile.status)}
          </Badge>
        </div>
      </div>
    </div>
  );
}
