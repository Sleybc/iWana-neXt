import { cn, toneFillVariants } from '@iwana/ui';
import { formatPercent, type TrackerDay } from '@/lib/platform-health';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

const COPY = PLATFORM_UI_COPY.dashboard;

interface AvailabilityTrackerProps {
  days: readonly TrackerDay[];
  /** `sm` en la celda del pulso; `md` en el área Salud. */
  size?: 'sm' | 'md';
  className?: string;
}

/** Tracker de 30 días con tonos del DS; día sin dato en neutro, nunca verde (CA-PP3-01). */
export function AvailabilityTracker({ days, size = 'sm', className }: AvailabilityTrackerProps) {
  const ok = days.filter((d) => d.tone === 'success').length;
  const noData = days.filter((d) => d.availability === null).length;
  const issues = days.length - ok - noData;
  return (
    <span
      role="img"
      aria-label={COPY.trackerAriaLabel(ok, issues, noData)}
      className={cn('flex w-full gap-0.5', size === 'sm' ? 'h-4' : 'h-5', className)}
    >
      {days.map((day) => (
        <span
          key={day.date}
          data-tone={day.tone}
          title={
            day.availability === null
              ? COPY.trackerDayNoData(day.date)
              : COPY.trackerDay(day.date, formatPercent(day.availability))
          }
          className={cn(
            'flex-1 rounded-sm',
            toneFillVariants({ tone: day.tone }),
            day.availability === null && 'opacity-40',
          )}
        />
      ))}
    </span>
  );
}
