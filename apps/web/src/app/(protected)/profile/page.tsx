'use client';

import { useAuth } from '@/components/auth/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProfileForm } from '@/components/profile/ProfileForm';

export default function ProfilePage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      {/* Encabezado de página */}
      <PageHeader title="Mi Perfil" subtitle="Gestiona tu información personal y seguridad" />

      {/* Card con avatar + info del usuario */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 dark:border-gray-800 dark:bg-white/[0.03]">
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
            <p className="text-sm text-gray-500 dark:text-gray-400">{user?.subtitle ?? ''}</p>
          </div>
        </div>
      </div>

      {/* Formulario de perfil */}
      <ProfileForm />
    </div>
  );
}
