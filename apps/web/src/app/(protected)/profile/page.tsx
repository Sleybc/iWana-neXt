import { Button } from '@iwana/ui';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProfileForm } from '@/components/profile/ProfileForm';

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <PageHeader
        title={PLATFORM_UI_COPY.navigation.profile}
        subtitle={PLATFORM_UI_COPY.profileNavigation.subtitle}
        actions={
          <Button asChild variant="outline" className="min-h-11 lg:hidden">
            <a href="#profile-security-heading">{PLATFORM_UI_COPY.profileNavigation.jump}</a>
          </Button>
        }
      />
      <ProfileForm />
    </div>
  );
}
