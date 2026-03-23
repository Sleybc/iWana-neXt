import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Redirección CRM | Portal Empresarial',
  description: 'Ruta histórica consolidada en el CRM operativo',
};

export default function LeadsPage() {
  // Esta ruta se conserva solo por compatibilidad de navegación histórica.
  redirect('/dashboard/crm');
}
