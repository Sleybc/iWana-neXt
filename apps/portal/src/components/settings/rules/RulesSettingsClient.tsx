'use client';

import dynamic from 'next/dynamic';
import { useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { UserRole } from '@iwana/shared';
import { useAuth } from '@/components/auth/AuthProvider';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  PortalAlert,
  PortalModuleSubnav,
  PortalSkeletonBlock,
} from '@/components/shared/portal-ui';
import { RULES_SETTINGS_COPY } from '@/components/settings/mod00-settings-labels';
import { RULES_SETTINGS_NAV_GROUPS, isRulesSettingsNavId } from './rules-settings-nav';
import { buildRulesSettingsHref, parseRulesSettingsTab } from './rules-settings-params';

function TabPanelFallback() {
  return (
    <div className="space-y-2" aria-busy="true" data-testid="rules-tab-loading">
      <PortalSkeletonBlock className="h-10 rounded-xl" />
      <PortalSkeletonBlock className="h-32 rounded-xl" />
    </div>
  );
}

const CompatibilityRulesManager = dynamic(
  () =>
    import('@/components/commercial/CompatibilityRulesManager').then(
      (m) => m.CompatibilityRulesManager,
    ),
  { loading: () => <TabPanelFallback /> },
);
const TaxCatalogManager = dynamic(
  () => import('@/components/commercial/TaxCatalogManager').then((m) => m.TaxCatalogManager),
  { loading: () => <TabPanelFallback /> },
);
const TaxApplicationRulesManager = dynamic(
  () =>
    import('@/components/commercial/TaxApplicationRulesManager').then(
      (m) => m.TaxApplicationRulesManager,
    ),
  { loading: () => <TabPanelFallback /> },
);
const TaxSimulatorPanel = dynamic(
  () => import('@/components/commercial/TaxSimulatorPanel').then((m) => m.TaxSimulatorPanel),
  { loading: () => <TabPanelFallback /> },
);

const readableRoles = new Set<UserRole>([UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.SALES]);

export function RulesSettingsClient() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = parseRulesSettingsTab(searchParams.get('tab'));

  const canEditTax = user?.role === UserRole.ADMIN || user?.role === UserRole.ACCOUNTANT;
  const canEditCompat = user?.role === UserRole.ADMIN;

  const handleNavChange = useCallback(
    (id: string) => {
      if (!isRulesSettingsNavId(id)) {
        return;
      }

      router.replace(buildRulesSettingsHref(id), { scroll: false });
    },
    [router],
  );

  if (authLoading) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={RULES_SETTINGS_COPY.pageTitle}
          subtitle={RULES_SETTINGS_COPY.loadingSubtitle}
        />
        <TabPanelFallback />
      </div>
    );
  }

  if (!user || !readableRoles.has(user.role as UserRole)) {
    return (
      <div className="space-y-6">
        <PageHeader
          title={RULES_SETTINGS_COPY.pageTitle}
          subtitle={RULES_SETTINGS_COPY.restrictedTitle}
        />
        <PortalAlert
          variant="warning"
          title={RULES_SETTINGS_COPY.restrictedTitle}
          description={RULES_SETTINGS_COPY.restrictedDescription}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={RULES_SETTINGS_COPY.pageTitle}
        subtitle={RULES_SETTINGS_COPY.pageSubtitle}
      />

      <PortalModuleSubnav
        groups={RULES_SETTINGS_NAV_GROUPS}
        value={activeTab}
        onValueChange={handleNavChange}
        ariaLabel={RULES_SETTINGS_COPY.navAriaLabel}
      />

      <div className="min-w-0 space-y-6">
        {activeTab === 'compatibility' ? (
          <CompatibilityRulesManager canEdit={canEditCompat} />
        ) : null}
        {activeTab === 'tax-catalog' ? <TaxCatalogManager canEdit={canEditTax} /> : null}
        {activeTab === 'tax-rules-app' ? <TaxApplicationRulesManager canEdit={canEditTax} /> : null}
        {activeTab === 'tax-simulator' ? <TaxSimulatorPanel /> : null}
      </div>
    </div>
  );
}
