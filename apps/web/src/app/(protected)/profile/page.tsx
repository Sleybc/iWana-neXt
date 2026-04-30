'use client';

import { useAuth } from '@/components/auth/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { Card, CardContent, CardHeader, CardTitle } from '@iwana/ui';

export default function ProfilePage() {
  const { user } = useAuth();

  return (
    <div className="space-y-5">
      {/* Encabezado de página */}
      <PageHeader title="Mi Perfil" subtitle="Gestiona tu información personal y seguridad" />

      <Card className="overflow-hidden border border-gray-100/90 dark:border-dark-border">
        <CardHeader className="px-5 pb-4 pt-5">
          <CardTitle>Información de cuenta</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-0">
          <div className="max-w-[1180px] space-y-4">
            {/* Card con avatar + info del usuario */}
            <div className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.06)] dark:border-dark-border dark:bg-dark-surface-2 dark:shadow-none">
              <div className="flex items-center gap-4">
                {/* Avatar circular con inicial del nombre */}
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
                  {user?.subtitle && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">{user.subtitle}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Formulario de perfil */}
            <ProfileForm />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
