import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface AuthBrandHeaderProps {
  name: string;
  logoUrl?: string | null;
  className?: string;
  logoContainerClassName?: string;
  textClassName?: string;
  fallbackMark?: ReactNode;
}

function DefaultMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2L2 7l10 5 10-5-10-5z" fill="currentColor" />
      <path
        d="M2 17l10 5 10-5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AuthBrandHeader({
  name,
  logoUrl,
  className,
  logoContainerClassName,
  textClassName,
  fallbackMark,
}: AuthBrandHeaderProps) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className={cn(
          'flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg bg-[#A5C330] text-[#181818]',
          logoContainerClassName,
        )}
      >
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-7 w-7 object-contain" aria-hidden="true" />
        ) : (
          (fallbackMark ?? <DefaultMark />)
        )}
      </div>

      <span className={cn('font-bold tracking-tight', textClassName)}>{name}</span>
    </div>
  );
}
