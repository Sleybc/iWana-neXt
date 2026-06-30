import { OperationsClient } from '@/components/operations/OperationsClient';

export const metadata = {
  title: 'Operaciones | Portal Empresarial',
  description: 'Ejecución operativa transversal con responsable y destinatario explícitos.',
};

export default function OperationsPage() {
  return <OperationsClient />;
}
