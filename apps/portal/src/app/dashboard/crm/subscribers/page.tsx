import { SubscribersListClient } from '@/components/crm/subscribers/SubscribersListClient';

export const metadata = {
  title: 'Suscriptores | Portal Empresarial',
  description: 'Gestión de suscriptores CRM de la empresa',
};

export default function CrmSubscribersPage() {
  return <SubscribersListClient />;
}
