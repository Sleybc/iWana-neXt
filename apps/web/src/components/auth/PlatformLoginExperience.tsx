'use client';

import { LoginForm } from '@/components/auth/LoginForm';
import { usePlatformBrandingAssets } from '@/components/branding/PlatformBrandingProvider';
import { AuthBrandHeader, AuthPremiumShell } from '@iwana/ui';

export type PlatformLoginVisualVariant = 'premium' | 'sobria';

interface PlatformLoginExperienceProps {
  variant?: PlatformLoginVisualVariant;
}

const variantStyles: Record<
  PlatformLoginVisualVariant,
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

const platformHighlights = ['Acceso seguro', 'Operación interna', 'Historial centralizado'] as const;

export function PlatformLoginExperience({ variant = 'premium' }: PlatformLoginExperienceProps) {
  const { branding, logoUrl, loginBackgroundLightUrl, loginBackgroundDarkUrl } =
    usePlatformBrandingAssets();
  const backgroundUrl = loginBackgroundDarkUrl || loginBackgroundLightUrl;
  const currentVariant = variantStyles[variant];

  return (
    <AuthPremiumShell
      ariaLabel="Página de inicio de sesión"
      backgroundUrl={backgroundUrl}
      shellTestId="platform-login-shell"
      shellDataVariant={variant}
      shellClassName={currentVariant.shell}
      panelClassName="max-w-[560px] lg:max-w-[520px]"
      aside={
        <aside className={currentVariant.aside}>
          <AuthBrandHeader
            name={branding.productName}
            logoUrl={logoUrl ?? null}
            textClassName="text-2xl text-white"
          />

          <div className="my-auto">
            <p className="portal-eyebrow mb-3 text-iwana-secondary-300">
              Gobierno de plataforma
            </p>
            <h1
              className={`${currentVariant.heading} max-w-xl font-bold leading-tight tracking-tight text-white`}
            >
              {branding.productName}
              <br />
              <span className="text-iwana-secondary-300">Centro operativo integrado</span>
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-slate-300">
              Ingresa con tu cuenta de plataforma para coordinar empresas, usuarios internos y
              trazabilidad desde un solo lugar.
            </p>

            <div className="mt-8 flex flex-wrap gap-2">
              {platformHighlights.map((highlight) => (
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
      intro={
        <>
          <p className="portal-eyebrow mb-3">
            {branding.surfaceName}
          </p>
          <h2 className="mb-2 text-3xl font-bold text-iwana-primary dark:text-white">
            Bienvenido a {branding.productName}
          </h2>
          <p className="text-base text-slate-500 dark:text-gray-400">
            Ingresa con tu cuenta de plataforma para administrar empresas, usuarios internos y
            actividad operativa.
          </p>
        </>
      }
      form={<LoginForm />}
    />
  );
}
