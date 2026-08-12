'use client';

// apps/web/src/components/auth/PlatformAuthExperience.tsx
import type { ReactNode } from 'react';
import { AuthBrandHeader, AuthPremiumShell } from '@iwana/ui';
import { usePlatformBrandingAssets } from '@/components/branding/PlatformBrandingProvider';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

export type PlatformAuthVisualVariant = 'premium' | 'sobria';

interface PlatformAuthExperienceProps {
  variant?: PlatformAuthVisualVariant;
  ariaLabel: string;
  shellTestId?: string;
  /** Eyebrow del panel de marca (aside). */
  asideEyebrow?: string;
  /** Título principal del aside; por defecto el nombre del producto. */
  asideTitle?: string;
  /** Línea de acento lima bajo el título del aside. */
  asideAccent: string;
  /** Descripción del aside. */
  asideDescription: string;
  /** Pills informativas del aside. */
  highlights?: readonly string[];
  panelClassName?: string;
  intro: ReactNode;
  form: ReactNode;
}

const variantStyles: Record<
  PlatformAuthVisualVariant,
  {
    shell: string;
    aside: string;
    heading: string;
  }
> = {
  premium: {
    shell:
      'w-full max-w-[1160px] overflow-hidden rounded-[32px] border border-white/15 bg-iwana-primary-950/72 shadow-[0_28px_120px_rgba(0,0,0,0.62)] backdrop-blur-xl',
    aside:
      'hidden border-r border-white/10 p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-12',
    heading: 'text-5xl',
  },
  sobria: {
    shell:
      'w-full max-w-[1120px] overflow-hidden rounded-[26px] border border-white/12 bg-iwana-primary-950/80 shadow-[0_16px_70px_rgba(0,0,0,0.5)] backdrop-blur-md',
    aside:
      'hidden border-r border-white/8 p-8 text-white lg:flex lg:flex-col lg:justify-between xl:p-10',
    heading: 'text-[2.65rem]',
  },
};

const defaultHighlights = ['Acceso seguro', 'Operación interna', 'Historial centralizado'] as const;

/**
 * Shell canónico de autenticación de la consola de plataforma.
 *
 * Composición compartida sobre `AuthPremiumShell` (@iwana/ui): panel de marca
 * con branding dinámico, cabecera móvil y panel de formulario. Lo consumen el
 * login (`PlatformLoginExperience`) y las pantallas secundarias de auth
 * (change-password, forgot-password, mfa/verify).
 */
export function PlatformAuthExperience({
  variant = 'premium',
  ariaLabel,
  shellTestId,
  asideEyebrow = PLATFORM_UI_COPY.shell.workspace,
  asideTitle,
  asideAccent,
  asideDescription,
  highlights = defaultHighlights,
  panelClassName = 'max-w-[560px] lg:max-w-[520px]',
  intro,
  form,
}: PlatformAuthExperienceProps) {
  const { branding, logoUrl, loginBackgroundLightUrl, loginBackgroundDarkUrl } =
    usePlatformBrandingAssets();
  const backgroundUrl = loginBackgroundDarkUrl || loginBackgroundLightUrl;
  const currentVariant = variantStyles[variant];

  return (
    <AuthPremiumShell
      ariaLabel={ariaLabel}
      backgroundUrl={backgroundUrl}
      {...(shellTestId !== undefined ? { shellTestId } : {})}
      shellDataVariant={variant}
      shellClassName={currentVariant.shell}
      panelClassName={panelClassName}
      aside={
        <aside className={currentVariant.aside}>
          <AuthBrandHeader
            name={branding.productName}
            logoUrl={logoUrl ?? null}
            textClassName="text-2xl text-white"
          />

          <div className="my-auto">
            <p className="portal-eyebrow mb-3 text-iwana-secondary-300">{asideEyebrow}</p>
            <h1
              className={`${currentVariant.heading} max-w-xl font-bold leading-tight tracking-tight text-white`}
            >
              {asideTitle ?? branding.productName}
              <br />
              <span className="text-iwana-secondary-300">{asideAccent}</span>
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-slate-300">
              {asideDescription}
            </p>

            <div className="mt-8 flex flex-wrap gap-2">
              {highlights.map((highlight) => (
                <span
                  key={highlight}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200"
                >
                  {highlight}
                </span>
              ))}
            </div>
          </div>

          <p className="text-sm text-slate-400">
            © 2026 {branding.productName}. Todos los derechos reservados.
          </p>
        </aside>
      }
      mobileHeader={
        <AuthBrandHeader
          name={branding.productName}
          logoUrl={logoUrl ?? null}
          className="mb-6 lg:hidden"
          logoContainerClassName="h-8 w-8"
          textClassName="text-iwana-primary dark:text-white"
        />
      }
      intro={intro}
      form={form}
    />
  );
}
