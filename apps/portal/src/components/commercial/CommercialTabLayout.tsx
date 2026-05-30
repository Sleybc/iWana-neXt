'use client';

import { useRef, useState } from 'react';
import { cn } from '@iwana/ui';
import { CompatibilityRulesManager } from '@/components/commercial/CompatibilityRulesManager';
import { TaxCatalogManager } from '@/components/commercial/TaxCatalogManager';
import { TaxApplicationRulesManager } from '@/components/commercial/TaxApplicationRulesManager';
import { TaxSimulatorPanel } from '@/components/commercial/TaxSimulatorPanel';
import { OffersManager } from '@/components/commercial/OffersManager';
import { AdditionalProductsManager } from '@/components/settings/AdditionalProductsManager';
import { AdditionalServicesManager } from '@/components/settings/AdditionalServicesManager';
import { PlanCatalogManager } from '@/components/settings/PlanCatalogManager';

export type CommercialSubItem =
  | 'plans'
  | 'products'
  | 'services'
  | 'offers'
  | 'compatibility'
  | 'taxation';

export type TaxationSubItem = 'tax-catalog' | 'tax-rules-app' | 'tax-simulator';

const COMMERCIAL_SUBNAV: Array<{ id: CommercialSubItem; label: string }> = [
  { id: 'plans', label: 'Planes' },
  { id: 'products', label: 'Productos' },
  { id: 'services', label: 'Servicios' },
  { id: 'offers', label: 'Combos y promociones' },
  { id: 'compatibility', label: 'Compatibilidad' },
  { id: 'taxation', label: 'Catálogo de impuestos' },
];

const TAXATION_SUBNAV: Array<{ id: TaxationSubItem; label: string }> = [
  { id: 'tax-catalog', label: 'Catálogo' },
  { id: 'tax-rules-app', label: 'Reglas de aplicación' },
  { id: 'tax-simulator', label: 'Simulador tributario' },
];

interface CommercialTabLayoutProps {
  canEdit: boolean;
}

export function CommercialTabLayout({ canEdit }: CommercialTabLayoutProps) {
  const [activeSubItem, setActiveSubItem] = useState<CommercialSubItem>('plans');
  const [activeTaxationSubItem, setActiveTaxationSubItem] =
    useState<TaxationSubItem>('tax-catalog');

  // Refs para roving focus y navegación de teclado consistente entre subsecciones.
  const subNavRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const taxationSubNavRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = COMMERCIAL_SUBNAV.findIndex((item) => item.id === activeSubItem);
  const activeTaxationIndex = TAXATION_SUBNAV.findIndex(
    (item) => item.id === activeTaxationSubItem,
  );

  const focusSubItemAt = (index: number) => {
    const boundedIndex = (index + COMMERCIAL_SUBNAV.length) % COMMERCIAL_SUBNAV.length;
    const targetItem = COMMERCIAL_SUBNAV[boundedIndex];
    if (!targetItem) return;
    setActiveSubItem(targetItem.id);
    subNavRefs.current[boundedIndex]?.focus();
  };

  const focusTaxationSubItemAt = (index: number) => {
    const boundedIndex = (index + TAXATION_SUBNAV.length) % TAXATION_SUBNAV.length;
    const targetItem = TAXATION_SUBNAV[boundedIndex];
    if (!targetItem) return;
    setActiveTaxationSubItem(targetItem.id);
    taxationSubNavRefs.current[boundedIndex]?.focus();
  };

  const activePanelId =
    activeSubItem === 'taxation' ? `taxation-${activeTaxationSubItem}` : activeSubItem;

  return (
    <div className="flex w-full flex-1 flex-col overflow-hidden rounded-2xl border border-white/70 bg-white/95 shadow-sm dark:border-dark-border dark:bg-dark-surface-2/95">
      <div className="overflow-x-auto border-b border-gray-100 bg-iwana-surface-soft/90 px-4 dark:border-dark-border dark:bg-dark-surface-3/40 md:px-6">
        <nav
          role="tablist"
          aria-label="Subsecciones comerciales"
          className="-mb-px flex min-w-max gap-5 md:gap-6"
        >
          {COMMERCIAL_SUBNAV.map((item, index) => {
            const isActive = item.id === activeSubItem;

            return (
              <button
                key={item.id}
                id={`commercial-tab-${item.id}`}
                ref={(el) => {
                  subNavRefs.current[index] = el;
                }}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`commercial-panel-${item.id}`}
                tabIndex={isActive ? 0 : -1}
                className={cn(
                  'relative flex items-center gap-2 border-b-[3px] border-transparent px-2 py-4 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2',
                  isActive
                    ? 'border-iwana-secondary font-semibold text-iwana-secondary-700 dark:border-iwana-secondary dark:text-iwana-secondary-300'
                    : 'font-medium text-gray-500 hover:border-gray-200 hover:text-gray-800 dark:text-gray-400 dark:hover:border-dark-border dark:hover:text-gray-200',
                )}
                onClick={() => setActiveSubItem(item.id)}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                    event.preventDefault();
                    focusSubItemAt(activeIndex + 1);
                  }
                  if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                    event.preventDefault();
                    focusSubItemAt(activeIndex - 1);
                  }
                  if (event.key === 'Home') {
                    event.preventDefault();
                    focusSubItemAt(0);
                  }
                  if (event.key === 'End') {
                    event.preventDefault();
                    focusSubItemAt(COMMERCIAL_SUBNAV.length - 1);
                  }
                }}
              >
                {item.label}
                {isActive && (
                  <div className="absolute bottom-0 left-0 h-[3px] w-full rounded-t-full bg-iwana-secondary" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div
        id={`commercial-panel-${activePanelId}`}
        role="tabpanel"
        aria-labelledby={`commercial-tab-${activeSubItem}`}
        className="min-w-0 flex-1 bg-white px-4 py-5 dark:bg-dark-surface-2 md:px-6 md:py-6"
      >
        {activeSubItem === 'taxation' && (
          <div className="mb-5 overflow-x-auto border-b border-gray-100 pb-1 dark:border-dark-border">
            <nav
              role="tablist"
              aria-label="Subsecciones tributarias"
              className="-mb-px flex min-w-max gap-4"
            >
              {TAXATION_SUBNAV.map((item, index) => {
                const isTaxationActive = item.id === activeTaxationSubItem;

                return (
                  <button
                    key={item.id}
                    id={`commercial-tax-tab-${item.id}`}
                    ref={(el) => {
                      taxationSubNavRefs.current[index] = el;
                    }}
                    type="button"
                    role="tab"
                    aria-selected={isTaxationActive}
                    aria-controls={`commercial-tax-panel-${item.id}`}
                    tabIndex={isTaxationActive ? 0 : -1}
                    className={cn(
                      'relative border-b-[3px] border-transparent px-2 py-3 text-sm whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2',
                      isTaxationActive
                        ? 'border-iwana-secondary font-semibold text-iwana-secondary-700 dark:border-iwana-secondary dark:text-iwana-secondary-300'
                        : 'font-medium text-gray-500 hover:border-gray-200 hover:text-gray-800 dark:text-gray-400 dark:hover:border-dark-border dark:hover:text-gray-200',
                    )}
                    onClick={() => setActiveTaxationSubItem(item.id)}
                    onKeyDown={(event) => {
                      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                        event.preventDefault();
                        focusTaxationSubItemAt(activeTaxationIndex + 1);
                      }
                      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                        event.preventDefault();
                        focusTaxationSubItemAt(activeTaxationIndex - 1);
                      }
                      if (event.key === 'Home') {
                        event.preventDefault();
                        focusTaxationSubItemAt(0);
                      }
                      if (event.key === 'End') {
                        event.preventDefault();
                        focusTaxationSubItemAt(TAXATION_SUBNAV.length - 1);
                      }
                    }}
                  >
                    {item.label}
                    {isTaxationActive && (
                      <div className="absolute bottom-0 left-0 h-[3px] w-full rounded-t-full bg-iwana-secondary" />
                    )}
                  </button>
                );
              })}
            </nav>
          </div>
        )}

        {activeSubItem === 'plans' && <PlanCatalogManager canEdit={canEdit} />}
        {activeSubItem === 'products' && <AdditionalProductsManager canEdit={canEdit} />}
        {activeSubItem === 'services' && <AdditionalServicesManager canEdit={canEdit} />}
        {activeSubItem === 'offers' && <OffersManager canEdit={canEdit} />}
        {activeSubItem === 'compatibility' && <CompatibilityRulesManager canEdit={canEdit} />}
        {activeSubItem === 'taxation' && activeTaxationSubItem === 'tax-catalog' && (
          <TaxCatalogManager canEdit={canEdit} />
        )}
        {activeSubItem === 'taxation' && activeTaxationSubItem === 'tax-rules-app' && (
          <TaxApplicationRulesManager canEdit={canEdit} />
        )}
        {activeSubItem === 'taxation' && activeTaxationSubItem === 'tax-simulator' && (
          <TaxSimulatorPanel />
        )}
      </div>
    </div>
  );
}
