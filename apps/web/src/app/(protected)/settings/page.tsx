'use client';

import { Suspense, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { mergeUrlSearchParams, withSearchParams } from '@/lib/merge-url-search-params';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@iwana/ui';
import { PageHeader } from '@/components/layout/PageHeader';
import { PlatformBrandingSettings } from '@/components/settings/PlatformBrandingSettings';
import { SecuritySettings } from '@/components/settings/SecuritySettings';
import { TeamVisibilitySettings } from '@/components/settings/TeamVisibilitySettings';
import { PLATFORM_UI_COPY } from '@/lib/platform-ui-copy';

const copy = PLATFORM_UI_COPY.settings;

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsSections />
    </Suspense>
  );
}

function SettingsSections() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const section = params.get('seccion');
  const active = section === 'seguridad' || section === 'equipo' ? section : 'identidad';
  const [identityDirty, setIdentityDirty] = useState(false);

  return (
    <div className="space-y-6">
      <PageHeader
        title={PLATFORM_UI_COPY.navigation.settings}
        subtitle={`${copy.subtitle} ${copy.tenantsBoundary}`}
      />

      <Tabs
        value={active}
        onValueChange={(value) => {
          if (value !== active) {
            router.replace(
              withSearchParams(pathname, mergeUrlSearchParams(params, { seccion: value })),
              { scroll: false },
            );
          }
        }}
      >
        <div className="overflow-x-auto">
          <TabsList aria-label={copy.tabsAriaLabel} className="inline-flex min-w-full sm:min-w-0">
            <TabsTrigger value="identidad" className="min-h-11 flex-1 px-2 sm:flex-none sm:px-4">
              {copy.tabIdentity}
              {identityDirty ? (
                <>
                  <span
                    aria-hidden="true"
                    className="ml-1.5 inline-block h-2 w-2 rounded-full bg-warning-600 dark:bg-warning-400"
                  />
                  <span className="sr-only">{copy.tabPending}</span>
                </>
              ) : null}
            </TabsTrigger>
            <TabsTrigger value="seguridad" className="min-h-11 flex-1 px-2 sm:flex-none sm:px-4">
              {copy.tabSecurity}
            </TabsTrigger>
            <TabsTrigger value="equipo" className="min-h-11 flex-1 px-2 sm:flex-none sm:px-4">
              {copy.tabTeam}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="identidad" forceMount>
          <PlatformBrandingSettings onDirtyChange={setIdentityDirty} />
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
