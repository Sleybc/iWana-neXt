import { AssuranceClient } from '@/components/assurance/AssuranceClient';

export const metadata = {
  title: 'Mesa de ayuda | Portal Empresarial',
  description: 'Operación diaria de tickets, SLA y trazabilidad de service assurance.',
};

export default function AssurancePage() {
  return <AssuranceClient />;
}
