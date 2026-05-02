'use client';

import { LoginForm } from '@/components/auth/LoginForm';
import { usePlatformBrandingAssets } from '@/components/branding/PlatformBrandingProvider';
import { AuthBrandHeader, AuthPremiumShell } from '@iwana/ui';

export type PlatformLoginVisualVariant = 'premium' | 'sobria';

interface PlatformLoginExperienceProps {
  variant?: PlatformLoginVisualVariant;
}

const shellClassByVariant: Record<PlatformLoginVisualVariant, string> = {
  premium:
    'w-full max-w-[1160px] overflow-hidden rounded-[32px] border border-white/15 bg-[#0B1124]/62 shadow-[0_28px_120px_rgba(0,0,0,0.62)] backdrop-blur-xl',
  sobria:
    'w-full max-w-[1120px] overflow-hidden rounded-[26px] border border-white/12 bg-[#0A1020]/74 shadow-[0_16px_70px_rgba(0,0,0,0.5)] backdrop-blur-md',
};

const asideClassByVariant: Record<PlatformLoginVisualVariant, string> = {
  premium:
    'hidden border-r border-white/10 p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-12',
  sobria:
    'hidden border-r border-white/8 p-8 text-white lg:flex lg:flex-col lg:justify-between xl:p-10',
};

export function PlatformLoginExperience({ variant = 'premium' }: PlatformLoginExperienceProps) {
  const { branding, logoUrl, loginBackgroundLightUrl, loginBackgroundDarkUrl } =
    usePlatformBrandingAssets();
  const backgroundUrl = loginBackgroundDarkUrl || loginBackgroundLightUrl;
  const shellClassName = shellClassByVariant[variant];
  const asideClassName = asideClassByVariant[variant];

  return (
    <AuthPremiumShell
      ariaLabel="Página de inicio de sesión"
      backgroundUrl={backgroundUrl}
      shellTestId="platform-login-shell"
      shellDataVariant={variant}
      shellClassName={shellClassName}
      panelClassName="max-w-[560px] lg:max-w-[520px]"
      aside={
        <aside className={asideClassName}>
          <AuthBrandHeader
            name={branding.productName}
            logoUrl={logoUrl ?? null}
            textClassName="text-2xl text-white"
          />

          <div className="my-auto">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#A5C330]">
              Gobierno de plataforma
            </p>
            <h1
              className={`${variant === 'premium' ? 'text-5xl' : 'text-[2.65rem]'} max-w-xl font-bold leading-tight tracking-tight text-white`}
            >
              {branding.productName}
              <br />
              <span className="text-[#A5C330]">Sistema integrado</span>
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-slate-300">
              Autenticación segura, trazabilidad activa y gobierno centralizado para la operación de
              plataforma.
            </p>

            <div className="mt-8 flex flex-wrap gap-2">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200">
                Acceso seguro
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200">
                Operación interna
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-200">
                Auditoría centralizada
              </span>
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
          textClassName="text-[#181818]"
        />
      }
      intro={
        <>
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
            {branding.surfaceName}
          </p>
          <h2 className="mb-2 text-3xl font-bold text-[#181818] dark:text-white">
            Bienvenido a {branding.productName}
          </h2>
          <p className="text-base text-slate-500 dark:text-gray-400">
            Ingresa tus credenciales para administrar empresas, usuarios y operación interna.
          </p>
        </>
      }
      form={<LoginForm />}
    />
  );
}
