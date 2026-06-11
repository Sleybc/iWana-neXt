import { SchedulingClient } from '@/components/scheduling/SchedulingClient';

export const metadata = {
  title: 'Agenda | Portal Empresarial',
  description:
    'Agenda operativa para consultar, crear y reajustar tareas de campo con contexto técnico.',
};

export default function SchedulingAgendaPage() {
  return <SchedulingClient surface="agenda" />;
}
