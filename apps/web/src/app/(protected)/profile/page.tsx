'use client';

import { useAuth } from '@/components/auth/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { Card, CardContent, CardHeader, CardTitle } from '@iwana/ui';

export default function ProfilePage() {
  const { user } = useAuth();
  const accountSubtitle = 'Administra tus datos, idioma y credenciales personales de plataforma.';

  return (
    <div className="space-y-5">
      <PageHeader title="Mi cuenta" subtitle={accountSubtitle} />

      <Card className="overflow-hidden border border-gray-100/90 dark:border-dark-border">
        <CardHeader className="px-5 pb-4 pt-5">
          <CardTitle>Cuenta de plataforma</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-0">
          <div className="max-w-[1180px] space-y-4">
            <div className="rounded-2xl border border-gray-100 bg-iwana-surface-soft/70 p-5 shadow-sm dark:border-dark-border dark:bg-dark-surface-3/70">
              <div className="flex items-center gap-4">
                <div
                  className="flex h-16 w-16 shrink-0 select-none items-center justify-center rounded-full bg-iwana-primary-100 text-2xl font-bold text-iwana-primary-700"
                  aria-hidden="true"
                >
                  {user?.displayName?.[0]?.toUpperCase() ?? 'U'}
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {user?.displayName ?? 'Usuario'}
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {user?.subtitle ?? accountSubtitle}
                  </p>
                </div>
              </div>
            </div>

            <ProfileForm />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
