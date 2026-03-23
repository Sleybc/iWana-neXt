import { CrmOverviewClient } from '@/components/crm/CrmOverviewClient';

export const metadata = {
  title: 'CRM operativo | Portal Empresarial',
  description: 'Oportunidades comerciales para gestión comercial y operativa del tenant',
};

export default function CrmPage() {
  return <CrmOverviewClient />;
}
