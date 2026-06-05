import { SchedulingClient } from '@/components/scheduling/SchedulingClient';

export const metadata = {
  title: 'Centro de agendamiento | Portal Empresarial',
  description:
    'Centro de agendamiento para revisar pendientes, confirmar agenda y hacer seguimiento de tareas de campo.',
};

export default function SchedulingPage() {
  return <SchedulingClient />;
}
