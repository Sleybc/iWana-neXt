// apps/web/src/components/layout/PlatformBrandMark.tsx
interface PlatformBrandMarkProps {
  logoUrl: string;
  density?: 'default' | 'compact';
  className?: string;
  alt?: string;
}

const densityContainerClassName = {
  default:
    'flex h-10 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-iwana-surface-soft dark:bg-dark-surface-3',
  compact:
    'flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-iwana-surface-soft dark:bg-dark-surface-3',
} as const;

const densityImageClassName = {
  default: 'h-7 w-7 object-contain',
  compact: 'h-6 w-6 object-contain',
} as const;

const joinClassName = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(' ');

/** Squircle canónico del isotipo (adenda deuda v1.1, contrato §4). Presentación sin estado. */
export const PlatformBrandMark = ({
  logoUrl,
  density = 'default',
  className,
  alt = '',
}: PlatformBrandMarkProps) => (
  <div className={joinClassName(densityContainerClassName[density], className)}>
    <img src={logoUrl} alt={alt} aria-hidden={!alt} className={densityImageClassName[density]} />
  </div>
);
