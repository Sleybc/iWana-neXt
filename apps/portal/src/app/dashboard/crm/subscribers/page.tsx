import { SubscribersListClient } from '@/components/crm/subscribers/SubscribersListClient';

export const metadata = {
  title: 'Suscriptores | Portal Empresarial',
  description: 'Gestión de suscriptores CRM del tenant',
};

export default function CrmSubscribersPage() {
  return <SubscribersListClient />;
}
