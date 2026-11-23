'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@iwana/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { PlatformBrandingSettings } from '@/components/settings/PlatformBrandingSettings';
import { SecuritySettings } from '@/components/settings/SecuritySettings';
import { TeamVisibilitySettings } from '@/components/settings/TeamVisibilitySettings';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

const copy = PLATFORM_UI_COPY.settings;

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title={PLATFORM_UI_COPY.navigation.settings}
        subtitle={`${copy.subtitle} ${copy.tenantsBoundary}`}
      />

      <Tabs defaultValue="identidad">
        <div className="overflow-x-auto">
          <TabsList aria-label={copy.tabsAriaLabel} className="inline-flex min-w-full sm:min-w-0">
            <TabsTrigger value="identidad" className="min-h-11 flex-1 sm:flex-none">
              {copy.tabIdentity}
            </TabsTrigger>
            <TabsTrigger value="seguridad" className="min-h-11 flex-1 sm:flex-none">
              {copy.tabSecurity}
            </TabsTrigger>
            <TabsTrigger value="equipo" className="min-h-11 flex-1 sm:flex-none">
              {copy.tabTeam}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="identidad">
          <PlatformBrandingSettings />
        </TabsContent>

        <TabsContent value="seguridad">
          <SecuritySettings />
        </TabsContent>

        <TabsContent value="equipo">
          <TeamVisibilitySettings />
        </TabsContent>
      </Tabs>
    </div>
  );
}
