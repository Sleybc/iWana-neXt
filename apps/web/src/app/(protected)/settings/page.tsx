'use client';

import { useState } from 'react';
import { cn } from '@iwana/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { SecuritySettings } from '@/components/settings/SecuritySettings';

// Identificadores de tabs disponibles en la página de configuración
type TabId = 'general' | 'seguridad';

const TABS: { id: TabId; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'seguridad', label: 'Seguridad' },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('general');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configuración"
        subtitle="Gestiona la configuración de tu cuenta y preferencias"
      />

      {/* Navegación por tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex gap-6" aria-label="Pestañas de configuración">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'border-b-2 py-4 text-sm font-medium transition-colors',
                activeTab === tab.id
                  ? 'border-iwana-primary text-iwana-primary dark:border-iwana-primary-400 dark:text-iwana-primary-400'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Contenido del tab activo */}
      {activeTab === 'general' && <ProfileForm />}

      {activeTab === 'seguridad' && <SecuritySettings />}
    </div>
  );
}
