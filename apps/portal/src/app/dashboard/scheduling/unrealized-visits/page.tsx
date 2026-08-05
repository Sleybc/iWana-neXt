import { UnrealizedVisitsView } from '@/components/scheduling/UnrealizedVisitsView';

export const metadata = {
  title: 'Visitas sin realizar | Portal Empresarial',
  description:
    'Revisa visitas agendadas que no se ejecutaron y decide si se reprograman o se cierran.',
};

export default function UnrealizedVisitsPage() {
  return <UnrealizedVisitsView />;
}
