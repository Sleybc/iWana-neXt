import { PageHeader } from '@/components/layout/PageHeader';
import { ProfileForm } from '@/components/profile/ProfileForm';

export default function ProfilePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Mi perfil" subtitle="Administrador de plataforma" />
      <ProfileForm />
    </div>
  );
}
