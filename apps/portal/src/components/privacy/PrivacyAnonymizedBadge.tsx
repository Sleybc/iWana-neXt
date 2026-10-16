'use client';

import Link from 'next/link';
import { Badge } from '@iwana/ui';
import { interactiveFocusClassName } from '@/components/shared/portal-ui';
import { formatPrivacyDate } from './privacy-display';

interface PrivacyAnonymizedBadgeProps {
  anonymizedAt: string | null | undefined;
  anonymizedRequestId?: string | null | undefined;
  canReadPrivacy: boolean;
}

export function PrivacyAnonymizedBadge({
  anonymizedAt,
  anonymizedRequestId,
  canReadPrivacy,
}: PrivacyAnonymizedBadgeProps) {
  if (!anonymizedAt) {
    return null;
  }

  const label = `Titular anonimizado · ${formatPrivacyDate(anonymizedAt)}`;
  const badge = (
    <Badge variant="neutral" className="rounded-full px-3 py-1 text-xs font-semibold">
      {label}
    </Badge>
  );

  if (!canReadPrivacy || !anonymizedRequestId) {
    return badge;
  }

  return (
    <Link
      href={`/dashboard/privacy?requestId=${encodeURIComponent(anonymizedRequestId)}`}
      className={`inline-flex rounded-full ${interactiveFocusClassName}`}
      aria-label={`Ver solicitud de privacidad: ${label}`}
    >
      {badge}
    </Link>
  );
}
