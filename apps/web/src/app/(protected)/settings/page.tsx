'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, cn } from '@iwana/ui';
import { PageHeader } from '@/components/layout/PageHeader';
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
    <div className="space-y-5">
      <PageHeader
        title="Configuración"
        subtitle="Gestiona la configuración de tu cuenta y preferencias"
      />

      <Card className="overflow-hidden border border-gray-100/90 dark:border-dark-border">
        <CardHeader className="px-5 pb-4 pt-5">
          <CardTitle>Parámetros de cuenta</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-0">
          {/* Navegación por tabs */}
          <div className="overflow-x-auto pb-4">
            <div className="inline-flex min-w-full gap-1 rounded-xl bg-gray-100/80 p-1 dark:bg-dark-surface-3 md:min-w-0">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-all md:min-w-[160px] md:flex-none',
                    activeTab === tab.id
                      ? 'bg-white text-gray-900 shadow-sm dark:bg-dark-surface-2 dark:text-white'
                      : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="max-w-[1180px]">
            {/* Contenido del tab activo */}
            {activeTab === 'general' && (
              <div className="rounded-[24px] border border-gray-100 bg-white p-5 shadow-[0_4px_24px_rgba(0,0,0,0.06)] dark:border-dark-border dark:bg-dark-surface-2 dark:shadow-none">
                <h2 className="mb-4 text-lg font-semibold text-iwana-primary dark:text-white">
                  Preferencias generales
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  La configuración operativa y los datos de empresa se gestionan desde el detalle de
                  cada empresa en la sección <strong>Empresas</strong>.
                </p>
              </div>
            )}

            {activeTab === 'seguridad' && <SecuritySettings />}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
