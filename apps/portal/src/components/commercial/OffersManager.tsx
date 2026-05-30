'use client';

import { useMemo, useRef, useState } from 'react';
import { Gift, Package } from 'lucide-react';
import { cn } from '@iwana/ui';
import { BundlesManager } from '@/components/commercial/BundlesManager';
import { PromotionsManager } from '@/components/commercial/PromotionsManager';

type OffersSubTab = 'bundles' | 'promotions';

const OFFERS_SUBTABS: Array<{ id: OffersSubTab; label: string; icon: typeof Package }> = [
  { id: 'bundles', label: 'Combos', icon: Package },
  { id: 'promotions', label: 'Promociones', icon: Gift },
];

interface OffersManagerProps {
  canEdit: boolean;
}

export function OffersManager({ canEdit }: OffersManagerProps) {
  const [activeTab, setActiveTab] = useState<OffersSubTab>('bundles');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const activeIndex = useMemo(
    () => OFFERS_SUBTABS.findIndex((tab) => tab.id === activeTab),
    [activeTab],
  );

  const focusTabAt = (index: number) => {
    const boundedIndex = (index + OFFERS_SUBTABS.length) % OFFERS_SUBTABS.length;
    const nextTab = OFFERS_SUBTABS[boundedIndex];
    if (!nextTab) return;
    setActiveTab(nextTab.id);
    tabRefs.current[boundedIndex]?.focus();
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-200 bg-iwana-surface-soft p-4 shadow-sm dark:border-dark-border dark:bg-dark-surface-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-iwana-secondary-700 dark:text-iwana-secondary-400">
          Ofertas
        </p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Construye combos y promociones temporales para mejorar la conversión comercial de la
          empresa.
        </p>

        <nav
          role="tablist"
          aria-label="Subsecciones de ofertas"
          className="mt-4 inline-flex w-full flex-wrap gap-2"
        >
          {OFFERS_SUBTABS.map((tab, index) => {
            const isActive = tab.id === activeTab;
            const Icon = tab.icon;

            return (
              <button
                key={tab.id}
                id={`offers-tab-${tab.id}`}
                ref={(el) => {
                  tabRefs.current[index] = el;
                }}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`offers-panel-${tab.id}`}
                tabIndex={isActive ? 0 : -1}
                className={cn(
                  'inline-flex min-w-[180px] items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2',
                  isActive
                    ? 'border-iwana-secondary-300 bg-iwana-secondary-50 text-iwana-secondary-700 dark:border-iwana-secondary/60 dark:bg-iwana-secondary/10 dark:text-iwana-secondary-300'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:text-gray-800 dark:border-dark-border dark:bg-dark-surface-2 dark:text-gray-300 dark:hover:text-white',
                )}
                onClick={() => setActiveTab(tab.id)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                    event.preventDefault();
                    focusTabAt(activeIndex + 1);
                  }
                  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    focusTabAt(activeIndex - 1);
                  }
                  if (event.key === 'Home') {
                    event.preventDefault();
                    focusTabAt(0);
                  }
                  if (event.key === 'End') {
                    event.preventDefault();
                    focusTabAt(OFFERS_SUBTABS.length - 1);
                  }
                }}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div
        id={`offers-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`offers-tab-${activeTab}`}
      >
        {activeTab === 'bundles' && <BundlesManager canEdit={canEdit} />}
        {activeTab === 'promotions' && <PromotionsManager canEdit={canEdit} />}
      </div>
    </div>
  );
}
