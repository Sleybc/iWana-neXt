// apps/portal/src/app/dashboard/users/page.tsx
import { UsersClient } from '@/components/users/UsersClient';

export const metadata = {
  title: 'Usuarios | Portal Empresarial',
  description: 'Gestión de usuarios internos de la empresa',
};

export default function UsersPage() {
  return <UsersClient />;
}
