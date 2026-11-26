import type { Ref } from 'react';
import Link from 'next/link';
import {
  cn,
  ErrorState,
  interactiveFocusClassName,
  PulseStrip,
  type PulseCellData,
} from '@iwana/ui';
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
  /** Destino del foco al terminar un reintento, con o sin éxito. */
  focusRef?: Ref<HTMLDivElement>;
}

export function TenantDirectoryPulse({
  cells,
  isLoading,
  hasError,
  onRetry,
  focusRef,
}: TenantDirectoryPulseProps) {
  const label = PLATFORM_UI_COPY.tenants.pulseLabel;
  return (
    <div
      ref={focusRef}
      tabIndex={-1}
      role="group"
      aria-label={label}
      className={cn('rounded-2xl', interactiveFocusClassName)}
    >
      {hasError && !isLoading ? (
        <section aria-label={label}>
          <ErrorState
            message={PLATFORM_UI_COPY.tenants.parkSummaryError}
            onRetry={onRetry}
            retryLabel={LABELS.retry}
          />
        </section>
      ) : (
        <PulseStrip
          cells={cells}
          loading={isLoading}
          ariaLabel={label}
          labels={LABELS}
          linkComponent={Link}
          className="sm:grid-cols-3 max-sm:[&>*]:min-h-0 max-sm:[&>*]:py-3 max-sm:[&>*>.portal-eyebrow-muted]:min-h-0"
        />
      )}
    </div>
  );
}
