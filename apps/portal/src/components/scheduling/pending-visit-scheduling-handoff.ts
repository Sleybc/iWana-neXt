export interface PendingVisitSchedulingHandoff {
  source: 'pending-visits';
  visitRequestId: string;
  focusDate?: string | null;
}

export function buildPendingVisitSchedulingHref({
  visitRequestId,
  focusDate,
}: PendingVisitSchedulingHandoff): string {
  const params = new URLSearchParams({
    source: 'pending-visits',
    visitRequestId,
  });

  if (focusDate) {
    params.set('focusDate', focusDate);
  }

  return `/dashboard/scheduling/agenda?${params.toString()}`;
}

export function buildPendingVisitInboxHref(selectedVisitRequestId?: string | null): string {
  if (!selectedVisitRequestId) {
    return '/dashboard/scheduling/pending-visits';
  }

  return `/dashboard/scheduling/pending-visits?selectedVisitRequestId=${encodeURIComponent(selectedVisitRequestId)}`;
}

export function readPendingVisitSchedulingHandoff(
  searchParams: URLSearchParams,
): PendingVisitSchedulingHandoff | null {
  const source = searchParams.get('source');
  const visitRequestId = searchParams.get('visitRequestId');

  if (source !== 'pending-visits' || !visitRequestId) {
    return null;
  }

  return {
    source,
    visitRequestId,
    focusDate: searchParams.get('focusDate'),
  };
}

export function clearPendingVisitSchedulingHandoff(searchParams: URLSearchParams): URLSearchParams {
  const nextParams = new URLSearchParams(searchParams.toString());
  nextParams.delete('source');
  nextParams.delete('visitRequestId');
  nextParams.delete('focusDate');
  return nextParams;
}
