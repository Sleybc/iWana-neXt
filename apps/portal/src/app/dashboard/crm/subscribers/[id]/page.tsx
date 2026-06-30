import { SubscriberDetailClient } from '@/components/crm/subscribers/SubscriberDetailClient';

export const metadata = {
  title: 'Detalle de suscriptor | Portal Empresarial',
  description: 'Ficha 360 y gestión operativa del suscriptor',
};

export default function SubscriberDetailPage() {
  return <SubscriberDetailClient mode="detail" />;
}
