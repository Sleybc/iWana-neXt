import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

export type TenantStatus =
  | 'ACTIVE'
  | 'PROVISIONING'
  | 'PROVISIONING_FAILED'
  | 'SUSPENDED'
  | 'INACTIVE'
  | 'MARKED_FOR_DELETION';

export type TenantStatusLabelForm = 'plural' | 'singular';

export type TenantStatusBadgeVariant = 'success' | 'warning' | 'error' | 'neutral';

const PLURAL_KEY = {
  ACTIVE: 'statusActive',
  PROVISIONING: 'statusProvisioning',
  PROVISIONING_FAILED: 'statusFailed',
  SUSPENDED: 'statusSuspended',
  INACTIVE: 'statusInactive',
  MARKED_FOR_DELETION: 'statusMarkedForDeletion',
} as const satisfies Record<TenantStatus, keyof typeof PLATFORM_UI_COPY.dashboard>;

function singularFromPlural(plural: string): string {
  if (plural.endsWith('as') || plural.endsWith('os')) {
    return plural.slice(0, -1);
  }

  return plural;
}

export function labelForTenantStatus(
  status: TenantStatus,
  options: { form: TenantStatusLabelForm },
): string {
  const plural = PLATFORM_UI_COPY.dashboard[PLURAL_KEY[status]];
  return options.form === 'singular' ? singularFromPlural(plural) : plural;
}

export function variantForTenantStatus(status: TenantStatus): TenantStatusBadgeVariant {
  switch (status) {
    case 'ACTIVE':
      return 'success';
    case 'PROVISIONING':
    case 'SUSPENDED':
      return 'warning';
    case 'PROVISIONING_FAILED':
    case 'MARKED_FOR_DELETION':
      return 'error';
    case 'INACTIVE':
      return 'neutral';
  }
}
