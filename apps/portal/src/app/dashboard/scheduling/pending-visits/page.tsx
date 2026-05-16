import { PendingVisitRequestsView } from '@/components/scheduling/PendingVisitRequestsView';

export const metadata = {
  title: 'Visitas pendientes | Portal Empresarial',
  description: 'Bandeja operativa para priorizar y agendar solicitudes WFM del tenant autenticado.',
};

export default function PendingVisitsPage() {
  return <PendingVisitRequestsView />;
}
