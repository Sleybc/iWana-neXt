import Link from 'next/link';
import { ErrorState, PulseStrip, type PulseCellData } from '@iwana/ui';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

const COPY = PLATFORM_UI_COPY.dashboard;
const LABELS = {
  unavailable: COPY.pulseUnavailable,
  noData: COPY.pulseNoData,
  retry: COPY.retry,
  updating: COPY.pulseUpdating,
};

interface TenantDirectoryPulseProps {
  cells: readonly PulseCellData[];
  isLoading: boolean;
  hasError: boolean;
  onRetry: () => void;
}

export function TenantDirectoryPulse({
  cells,
  isLoading,
  hasError,
  onRetry,
}: TenantDirectoryPulseProps) {
  const label = PLATFORM_UI_COPY.tenants.pulseLabel;
  if (hasError && !isLoading) {
    return (
      <section aria-label={label}>
        <ErrorState
          message={PLATFORM_UI_COPY.tenants.parkSummaryError}
          onRetry={onRetry}
          retryLabel={LABELS.retry}
        />
      </section>
    );
  }

  return (
    <PulseStrip
      cells={cells}
      loading={isLoading}
      ariaLabel={label}
      labels={LABELS}
      linkComponent={Link}
      className="sm:grid-cols-3 max-sm:[&>*]:min-h-0 max-sm:[&>*]:py-3 max-sm:[&>*>.portal-eyebrow-muted]:min-h-0"
    />
  );
}
