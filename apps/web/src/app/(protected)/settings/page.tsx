'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@iwana/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { PlatformBrandingSettings } from '@/components/settings/PlatformBrandingSettings';
import { SecuritySettings } from '@/components/settings/SecuritySettings';

export default function SettingsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Plataforma"
        subtitle="Administra branding, seguridad global y parámetros compartidos de la consola interna."
      />

      <Card className="overflow-hidden border border-gray-100/90 dark:border-dark-border">
        <CardHeader className="px-5 pb-4 pt-5">
          <CardTitle>Gobierno y configuración global</CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-0">
          <Tabs defaultValue="general">
            <div className="overflow-x-auto pb-4">
              <TabsList>
                <TabsTrigger value="general">General</TabsTrigger>
                <TabsTrigger value="branding">Branding</TabsTrigger>
                <TabsTrigger value="seguridad">Seguridad</TabsTrigger>
              </TabsList>
            </div>

            <div className="max-w-[1180px]">
              <TabsContent value="general">
                <div className="space-y-3 rounded-2xl border border-gray-100 bg-iwana-surface-soft/70 px-4 py-4 text-sm text-gray-600 dark:border-dark-border dark:bg-dark-surface-3/70 dark:text-gray-300">
                  <p className="font-semibold text-iwana-primary dark:text-white">
                    Esta sección concentra decisiones globales de plataforma.
                  </p>
                  <p>
                    El branding, la seguridad y los parámetros compartidos viven aquí porque afectan
                    a toda la consola interna.
                  </p>
                  <p>
                    La configuración operativa y los datos base de cada empresa se administran desde
                    <strong> Empresas</strong>, dentro del detalle individual de cada organización.
                  </p>
                </div>
              </TabsContent>

              <TabsContent value="seguridad">
                <SecuritySettings />
              </TabsContent>

              <TabsContent value="branding">
                <PlatformBrandingSettings />
              </TabsContent>
            </div>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
