import { SchedulingClient } from '@/components/scheduling/SchedulingClient';

export const metadata = {
  title: 'Programacion | Portal Empresarial',
  description: 'Agenda operativa, eventos técnicos y work orders del tenant autenticado.',
};

export default function SchedulingPage() {
  return <SchedulingClient />;
}
