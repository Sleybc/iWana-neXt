// apps/web/src/app/auth/login/page.tsx
import type { Metadata } from 'next';
import {
  PlatformLoginExperience,
  type PlatformLoginVisualVariant,
} from '@/components/auth/PlatformLoginExperience';

export const metadata: Metadata = {
  title: 'Iniciar sesión — iWana neXt',
  description: 'Acceso al portal de administración de plataforma iWana neXt',
};

interface LoginPageProps {
  searchParams?: Promise<{
    variant?: string | string[];
  }>;
}

function resolveVariant(rawVariant: string | string[] | undefined): PlatformLoginVisualVariant {
  const normalized = Array.isArray(rawVariant) ? rawVariant[0] : rawVariant;
  return normalized === 'sobria' ? 'sobria' : 'premium';
}

/**
 * Página de login del portal administrativo.
 * Shell visual central con variante "premium" por defecto.
 */
export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const variant = resolveVariant(resolvedSearchParams.variant);
  return <PlatformLoginExperience variant={variant} />;
}
