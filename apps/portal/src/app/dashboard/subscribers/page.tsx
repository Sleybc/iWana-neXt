import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Redirección a suscriptores | Portal Empresarial',
  description: 'Ruta histórica consolidada en suscriptores',
};

export default function SubscribersPage() {
  // Esta ruta se conserva solo por compatibilidad de navegación histórica.
  redirect('/dashboard/crm/subscribers');
}
