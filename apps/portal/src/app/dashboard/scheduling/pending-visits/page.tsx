import { PendingVisitRequestsView } from '@/components/scheduling/PendingVisitRequestsView';

export const metadata = {
  title: 'Pendiente por agendar | Portal Empresarial',
  description:
    'Bandeja para revisar solicitudes pendientes, completar datos y confirmar agenda de campo.',
};

export default function PendingVisitsPage() {
  return <PendingVisitRequestsView />;
}
