'use client';

import { useCallback, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@iwana/ui';

export interface DailyTimelineHoverDetails {
  eyebrow: string;
  title: string;
  timeRange: string;
  referenceLabel?: string | null;
  hint?: string | null;
}

export function formatTimelineReferenceLabel(label: string | null | undefined): string | null {
  const normalized = label?.trim();
  if (!normalized || normalized === 'Sin referencia externa') {
    return null;
  }

  return normalized;
}

export function DailyTimelineHoverDetailsContent({
  eyebrow,
  title,
  timeRange,
  referenceLabel,
  hint,
}: DailyTimelineHoverDetails) {
  return (
    <div className="space-y-1.5 px-3.5 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
        {eyebrow}
      </p>
      <p className="text-sm font-semibold leading-snug text-gray-900 dark:text-white">{title}</p>
      <p className="text-xs tabular-nums text-gray-600 dark:text-gray-300">{timeRange}</p>
      {referenceLabel ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">{referenceLabel}</p>
      ) : null}
      {hint ? <p className="text-xs font-medium text-rose-600 dark:text-rose-300">{hint}</p> : null}
    </div>
  );
}

interface DailyTimelineHoverHintProps {
  details: DailyTimelineHoverDetails;
  children: ReactNode;
  className?: string | undefined;
  hidden?: boolean | undefined;
}

export function DailyTimelineHoverHint({
  details,
  children,
  className,
  hidden = false,
}: DailyTimelineHoverHintProps) {
  const anchorRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) {
      return;
    }

    const rect = anchor.getBoundingClientRect();
    const gap = 8;
    const maxWidth = 280;
    const viewportPadding = 12;
    const preferredLeft = rect.left;
    const left = Math.min(
      Math.max(preferredLeft, viewportPadding),
      Math.max(viewportPadding, window.innerWidth - maxWidth - viewportPadding),
    );

    setPosition({
      top: rect.bottom + gap,
      left,
    });
  }, []);

  const openHint = useCallback(() => {
    if (hidden) {
      return;
    }

    updatePosition();
    setIsOpen(true);
  }, [hidden, updatePosition]);

  const closeHint = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <>
      <div
        ref={anchorRef}
        className={cn('relative h-full w-full min-w-0', className)}
        onMouseEnter={openHint}
        onMouseLeave={closeHint}
        onFocus={openHint}
        onBlur={closeHint}
      >
        {children}
      </div>

      {isOpen && position && !hidden
        ? createPortal(
            <div
              role="tooltip"
              style={{
                position: 'fixed',
                top: position.top,
                left: position.left,
                zIndex: 'var(--z-popover)',
                width: 'min(280px, calc(100vw - 24px))',
              }}
              className="rounded-2xl border border-gray-200 bg-white/98 shadow-(--shadow-iwana-lg) ring-1 ring-black/5 backdrop-blur-md dark:border-dark-border dark:bg-dark-surface-2/98 dark:ring-white/10"
              onMouseEnter={openHint}
              onMouseLeave={closeHint}
            >
              <DailyTimelineHoverDetailsContent {...details} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
