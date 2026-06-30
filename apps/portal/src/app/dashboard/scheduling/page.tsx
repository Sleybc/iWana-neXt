import { SchedulingClient } from '@/components/scheduling/SchedulingClient';

export const metadata = {
  title: 'Programación | Portal Empresarial',
  description:
    'Resumen operativo para priorizar pendientes, revisar riesgos y coordinar la jornada de campo.',
};

export default function SchedulingPage() {
  return <SchedulingClient surface="dashboard" />;
}
