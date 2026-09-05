import { useId } from 'react';
import { Avatar, Badge } from '@iwana/ui';
import { formatFullName } from '@iwana/shared';
import type { UserProfile } from '@/lib/api-client';
import { getPortalUserStatusLabel, getPortalUserStatusVariant } from '@/lib/user-labels';

interface ProfileHeaderProps {
  profile: UserProfile;
  roleLabel: string;
}

/**
 * Encabezado visual del perfil del usuario autenticado.
 * Avatar de persona según contrato (iniciales canónicas o icono, nunca email).
 */
export function ProfileHeader({ profile, roleLabel }: ProfileHeaderProps) {
  const rawName = formatFullName(profile.firstName, profile.lastName);
  const fullName = rawName || 'Sin nombre configurado';
  const nameId = useId();

  return (
    <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-white p-5 dark:border-dark-border-2 dark:bg-dark-surface-2">
      <div className="relative shrink-0">
        <Avatar size="xl" name={rawName} labelledById={nameId} />
      </div>

      <div className="min-w-0 flex-1">
        <p id={nameId} className="truncate text-xl font-semibold text-gray-900 dark:text-white">
          {fullName}
        </p>
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
