import { ContractDetailPageClient } from '@/components/crm/subscribers/ContractDetailPageClient';

export const metadata = {
  title: 'Detalle del servicio | Portal Empresarial',
  description: 'Estado, plan, cobro, ubicación y aprovisionamiento del servicio contratado',
};

export default function SubscriberContractDetailPage() {
  return <ContractDetailPageClient />;
}
