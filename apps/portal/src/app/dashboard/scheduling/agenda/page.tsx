import { SchedulingClient } from '@/components/scheduling/SchedulingClient';

export const metadata = {
  title: 'Agenda | Portal Empresarial',
  description:
    'Agenda operativa para consultar, crear y reajustar tareas con contexto de ejecución.',
};

export default function SchedulingAgendaPage() {
  return <SchedulingClient surface="agenda" />;
}
