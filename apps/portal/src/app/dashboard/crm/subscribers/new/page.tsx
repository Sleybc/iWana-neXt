import { SubscriberDetailClient } from '@/components/crm/subscribers/SubscriberDetailClient';

export const metadata = {
  title: 'Nuevo suscriptor | Portal Empresarial',
  description: 'Alta de nuevo suscriptor CRM del tenant',
};

export default function NewSubscriberPage() {
  return <SubscriberDetailClient mode="create" />;
}
