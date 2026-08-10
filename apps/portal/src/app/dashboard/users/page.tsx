// apps/portal/src/app/dashboard/users/page.tsx
import { UsersClient } from '@/components/users/UsersClient';

export const metadata = {
  title: 'Usuarios | Portal Empresarial',
  description: 'Gestión de usuarios internos de la empresa',
};

/**
 * FE-12 (Ola C / post H-05): no precarga en Server Component.
 *
 * Tras H-05 la búsqueda SQL ya escala, y el token de sesión del portal vive en
 * cookie httpOnly (`portalAccessToken`, ADR-081) — no en `localStorage`. El
 * Server Component aún no implementa el canal server-side de auth (leer y
 * verificar la cookie y autenticar `usersApi.list` con contexto), por lo que
 * forzar precarga RSC hoy rompería el contrato de auth. Las props
 * `initialUsers` / `initialMeta` permanecen retiradas hasta auth RSC.
 */
export default function UsersPage() {
  return <UsersClient />;
}
