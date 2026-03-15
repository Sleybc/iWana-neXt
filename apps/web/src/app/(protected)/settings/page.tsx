import { PageHeader } from '@/components/layout/PageHeader';
import { SecuritySettings } from '@/components/settings/SecuritySettings';

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Configuración" subtitle="Seguridad y preferencias" />
      <SecuritySettings />
    </div>
  );
}
