import Link from 'next/link';
import {
  Alert,
  AlertDescription,
  Button,
  cn,
  interactiveFocusClassName,
  SkeletonBlock,
} from '@iwana/ui';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

const ACCENT_CLASS = {
  primary:
    'border-iwana-primary/20 bg-iwana-primary-50/70 dark:border-iwana-primary-400/30 dark:bg-iwana-primary-900/15',
  warning: 'border-amber-200 bg-amber-50/80 dark:border-amber-500/20 dark:bg-amber-950/20',
  danger: 'border-rose-200 bg-rose-50/80 dark:border-rose-500/20 dark:bg-rose-950/20',
  neutral: 'border-gray-200 bg-iwana-surface-soft dark:border-dark-border dark:bg-dark-surface-3',
} as const;

export type SignalChipAccent = keyof typeof ACCENT_CLASS;

export interface SignalChipModel {
  id: string;
  label: string;
  count: number;
  accent: SignalChipAccent;
  href?: string;
  ariaLabel?: string;
  onActivate?: () => void;
}

interface SignalChipsProps {
  chips: SignalChipModel[];
  isLoading: boolean;
  error?: string | null;
  onRetry?: () => void;
  eyebrow?: string;
  ariaLabel?: string;
  skeletonCount?: number;
}

const chipShellClassName =
  'flex h-full min-h-11 flex-col rounded-3xl border px-4 py-4 shadow-iwana-soft';

export function SignalChips({
  chips,
  isLoading,
  error,
  onRetry,
  eyebrow,
  ariaLabel,
  skeletonCount = 4,
}: SignalChipsProps) {
  const visibleEyebrow = eyebrow ?? PLATFORM_UI_COPY.dashboard.summaryEyebrow;
  const sectionLabel = ariaLabel ?? visibleEyebrow;
  const useThreeColumns = chips.length === 3 || (isLoading && skeletonCount === 3);
  const gridClassName = cn(
    'mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2',
    useThreeColumns ? 'xl:grid-cols-3' : 'xl:grid-cols-4',
  );

  return (
    <section aria-label={sectionLabel} aria-busy={isLoading}>
      <p className="portal-eyebrow">{visibleEyebrow}</p>
      {isLoading ? (
        <div className={gridClassName}>
          {Array.from({ length: skeletonCount }).map((_, index) => (
            <SkeletonBlock
              key={`signal-chip-skeleton-${index}`}
              className="h-[88px] w-full rounded-3xl"
            />
          ))}
        </div>
      ) : error ? (
        <div className="mt-4">
          <Alert variant="error">
            <AlertDescription>{error}</AlertDescription>
            {onRetry ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-3"
                onClick={onRetry}
              >
                {PLATFORM_UI_COPY.dashboard.retry}
              </Button>
            ) : null}
          </Alert>
        </div>
      ) : (
        <div className={gridClassName}>
          {chips.map((chip) => (
            <SignalChip key={chip.id} chip={chip} />
          ))}
        </div>
      )}
    </section>
  );
}

function SignalChip({ chip }: { chip: SignalChipModel }) {
  const inner = (
    <>
      <span className="text-sm font-medium text-gray-900 dark:text-white">{chip.label}</span>
      <span className="mt-2 font-mono text-2xl font-semibold tabular-nums tracking-tight text-gray-900 dark:text-white">
        {chip.count}
      </span>
    </>
  );

  const className = cn(chipShellClassName, ACCENT_CLASS[chip.accent]);

  if (chip.count > 0 && chip.onActivate) {
    return (
      <button
        type="button"
        aria-label={chip.ariaLabel}
        onClick={chip.onActivate}
        className={cn(
          className,
          'text-left transition-shadow hover:shadow-iwana-active',
          interactiveFocusClassName,
        )}
      >
        {inner}
      </button>
    );
  }

  if (chip.count > 0 && chip.href) {
    return (
      <Link
        href={chip.href}
        aria-label={chip.ariaLabel}
        className={cn(
          className,
          'transition-shadow hover:shadow-iwana-active',
          interactiveFocusClassName,
        )}
      >
        {inner}
      </Link>
    );
  }

  return <div className={className}>{inner}</div>;
}
