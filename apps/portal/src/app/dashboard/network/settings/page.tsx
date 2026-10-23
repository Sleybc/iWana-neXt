import { NetworkSettingsClient } from '@/components/network/NetworkSettingsClient';

export const metadata = {
  title: 'Ajustes de red | Portal Empresarial',
  description: 'Configura perfiles por plan y requisitos de aprovisionamiento.',
};

export default function NetworkSettingsPage() {
  return <NetworkSettingsClient />;
}
