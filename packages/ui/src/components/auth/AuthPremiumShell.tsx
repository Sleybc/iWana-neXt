import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { AUTH_FORM_PANEL_PREMIUM_CLASS } from './auth-form-styles';

interface AuthPremiumShellProps {
  ariaLabel?: string;
  backgroundUrl?: string | null;
  shellTestId?: string;
  shellDataVariant?: string;
  shellClassName?: string;
  gridClassName?: string;
  panelWrapperClassName?: string;
  panelClassName?: string;
  aside: ReactNode;
  intro: ReactNode;
  form: ReactNode;
  mobileHeader?: ReactNode;
}

export function AuthPremiumShell({
  ariaLabel = 'Página de inicio de sesión',
  backgroundUrl,
  shellTestId,
  shellDataVariant,
  shellClassName,
  gridClassName,
  panelWrapperClassName,
  panelClassName,
  aside,
  intro,
  form,
  mobileHeader,
}: AuthPremiumShellProps) {
  return (
    <main
      className="relative min-h-screen overflow-hidden bg-[#181818]"
      aria-label={ariaLabel}
      style={
        backgroundUrl
          ? {
              backgroundImage: `linear-gradient(120deg, rgba(7,10,21,0.9), rgba(7,10,21,0.74) 45%, rgba(7,10,21,0.88)), url(${backgroundUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }
          : undefined
      }
    >
      <div className="absolute inset-0 opacity-[0.06] bg-[radial-gradient(#A5C330_1px,transparent_1px)] bg-[length:34px_34px]" />

      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-6 sm:px-6 lg:px-10 lg:py-10">
        <section
          data-testid={shellTestId}
          data-variant={shellDataVariant}
          className={cn(
            'w-full max-w-[1160px] overflow-hidden rounded-[32px] border border-white/15 bg-[#0B1124]/62 shadow-[0_28px_120px_rgba(0,0,0,0.62)] backdrop-blur-xl',
            shellClassName,
          )}
        >
          <div
            className={cn(
              'grid min-h-[650px] grid-cols-1 lg:grid-cols-[0.95fr_1.05fr]',
              gridClassName,
            )}
          >
            {aside}

            <div
              className={cn(
                'relative flex items-center justify-center p-4 sm:p-6 lg:p-10',
                panelWrapperClassName,
              )}
            >
              <div className={cn(AUTH_FORM_PANEL_PREMIUM_CLASS, 'relative w-full', panelClassName)}>
                <div className="mb-10">
                  {mobileHeader}
                  {intro}
                </div>

                {form}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
