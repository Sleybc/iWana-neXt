import { CutoffAgendaClient } from '@/components/crm/subscribers/CutoffAgendaClient';

export const metadata = {
  title: 'Agenda de corte | Suscriptores',
  description: 'Consulta los servicios con fecha de corte programada.',
};

export default function CutoffAgendaPage() {
  return <CutoffAgendaClient />;
}
