'use client';

import { useRef, useState } from 'react';
import { cn } from '@iwana/ui';
import { CommercialCoverageCard } from './CommercialCoverageCard';
import { PlanCatalogManager } from './PlanCatalogManager';

export type CommercialSubItem = 'coverage' | 'plans';

const COMMERCIAL_SUBNAV: Array<{ id: CommercialSubItem; label: string }> = [
  { id: 'coverage', label: 'Cobertura' },
  { id: 'plans', label: 'Planes' },
];

interface CommercialTabLayoutProps {
  canEdit: boolean;
  fiberThresholdMeters: number;
}

export function CommercialTabLayout({ canEdit, fiberThresholdMeters }: CommercialTabLayoutProps) {
  const [activeSubItem, setActiveSubItem] = useState<CommercialSubItem>('coverage');

  // Refs para roving focus — patrón consistente con SettingsTabs.tsx (WCAG 2.1)
  const subNavRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = COMMERCIAL_SUBNAV.findIndex((item) => item.id === activeSubItem);

  /**
   * Mueve el foco al sub-ítem en `index` (con módulo para wrap-around),
   * actualiza el estado activo y enfoca el botón correspondiente.
   */
  const focusSubItemAt = (index: number) => {
    const boundedIndex = (index + COMMERCIAL_SUBNAV.length) % COMMERCIAL_SUBNAV.length;
    const targetItem = COMMERCIAL_SUBNAV[boundedIndex];
    if (!targetItem) return;
    setActiveSubItem(targetItem.id);
    subNavRefs.current[boundedIndex]?.focus();
  };

  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-6">
      {/* Sidebar de sub-navegación */}
      <nav
        aria-label="Subsecciones comerciales"
        className="flex shrink-0 flex-row gap-1 md:w-44 md:flex-col"
      >
        {COMMERCIAL_SUBNAV.map((item, index) => {
          const isActive = item.id === activeSubItem;
          return (
            <button
              key={item.id}
              ref={(el) => {
                subNavRefs.current[index] = el;
              }}
              type="button"
              // aria-pressed: correcto para toggles de panel en-página (no aria-current="page")
              aria-pressed={isActive}
              tabIndex={isActive ? 0 : -1}
              className={cn(
                'rounded-lg px-3 py-2 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2',
                isActive
                  ? 'bg-iwana-primary/10 text-iwana-primary dark:bg-iwana-primary-400/15 dark:text-iwana-primary-300'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-dark-surface-3 dark:hover:text-white',
              )}
              onClick={() => setActiveSubItem(item.id)}
              onKeyDown={(event) => {
                // WCAG 2.1: ambos ejes permiten navegar entre botones de panel
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
            </button>
          );
        })}
      </nav>

      {/* Contenido del sub-item activo */}
      <div className="min-w-0 flex-1">
        {activeSubItem === 'coverage' && <CommercialCoverageCard canEdit={canEdit} />}
        {activeSubItem === 'plans' && (
          <PlanCatalogManager canEdit={canEdit} fiberThresholdMeters={fiberThresholdMeters} />
        )}
      </div>
    </div>
  );
}
