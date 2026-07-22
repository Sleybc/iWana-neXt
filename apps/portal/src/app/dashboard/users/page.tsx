// apps/portal/src/app/dashboard/users/page.tsx
import { UsersClient } from '@/components/users/UsersClient';

export const metadata = {
  title: 'Usuarios | Portal Empresarial',
  description: 'Gestión de usuarios internos de la empresa',
};

/**
 * FE-12 (Ola C / post H-05): no precarga en Server Component.
 *
 * Tras H-05 la búsqueda SQL ya escala, pero el token de sesión del portal sigue
 * en `localStorage` (`iwana.portal.access-token`). El Server Component no puede
 * autenticar `usersApi.list` sin canal server-side (cookie httpOnly). Forzar
 * precarga RSC hoy rompería el contrato de auth. Las props `initialUsers` /
 * `initialMeta` permanecen retiradas hasta auth RSC.
 */
export default function UsersPage() {
  return <UsersClient />;
}
