// apps/web/src/app/auth/login/page.tsx
import type { Metadata } from 'next';
import { Suspense } from 'react';
import {
  PlatformLoginExperience,
  type PlatformLoginVisualVariant,
} from '@/components/auth/PlatformLoginExperience';

export const metadata: Metadata = {
  title: 'Iniciar sesión — iWana neXt',
  description: 'Acceso al portal de administración de plataforma iWana neXt',
};

/**
 * Unica ruta publica con shell estatico: se marca como instantanea para que la
 * validacion de navegacion inmediata siga activa aqui aunque el arbol
 * protegido opte por `manual-warning`.
 */
export const instant = true;

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
 * Resuelve la variante solicitada por query. La lectura de `searchParams` es
 * runtime data: vive dentro del boundary de la pagina para no contaminar el
 * shell prerenderizado.
 */
async function LoginExperience({ searchParams }: { searchParams: LoginPageProps['searchParams'] }) {
  const resolvedSearchParams = (await searchParams) ?? {};
  const variant = resolveVariant(resolvedSearchParams.variant);
  return <PlatformLoginExperience variant={variant} />;
}

/**
 * Página de login del portal administrativo.
 * El fallback es la experiencia real (variante premium por defecto) para que el
 * HTML inicial contenga el shell completo mientras resuelve la variante.
 */
export default function LoginPage({ searchParams }: LoginPageProps) {
  return (
    <Suspense fallback={<PlatformLoginExperience />}>
      <LoginExperience searchParams={searchParams} />
    </Suspense>
  );
}
