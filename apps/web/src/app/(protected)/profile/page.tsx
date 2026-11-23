import { PageHeader } from '@/components/layout/PageHeader';
import { ProfileForm } from '@/components/profile/ProfileForm';

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader title="Mi cuenta" />
      <ProfileForm />
    </div>
  );
}
