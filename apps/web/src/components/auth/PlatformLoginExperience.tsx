'use client';

import { LoginForm } from '@/components/auth/LoginForm';
import {
  PlatformAuthExperience,
  type PlatformAuthVisualVariant,
} from '@/components/auth/PlatformAuthExperience';
import { usePlatformBrandingAssets } from '@/components/branding/PlatformBrandingProvider';

export type PlatformLoginVisualVariant = PlatformAuthVisualVariant;

interface PlatformLoginExperienceProps {
  variant?: PlatformLoginVisualVariant;
}

export function PlatformLoginExperience({ variant = 'premium' }: PlatformLoginExperienceProps) {
  const { branding } = usePlatformBrandingAssets();

  return (
    <PlatformAuthExperience
      variant={variant}
      ariaLabel="Página de inicio de sesión"
      shellTestId="platform-login-shell"
      asideAccent="Centro operativo integrado"
      asideDescription="Ingresa con tu cuenta de plataforma para coordinar empresas, usuarios internos y trazabilidad desde un solo lugar."
      intro={
        <>
          <p className="portal-eyebrow mb-3">{branding.surfaceName}</p>
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
