import { Suspense } from 'react';
import { PortalSkeletonBlock } from '@/components/shared/portal-ui';
import { PrivacyWorkspace } from '@/components/privacy/PrivacyWorkspace';

export const metadata = {
  title: 'Privacidad | Portal Empresarial',
  description: 'Solicitudes de datos personales y administración de privacidad',
};

export default function PrivacyPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <PortalSkeletonBlock className="h-20" />
          <PortalSkeletonBlock className="h-72" />
        </div>
      }
    >
      <PrivacyWorkspace />
    </Suspense>
  );
}
