'use client';

import { useState } from 'react';
import { cn } from '@iwana/ui';
import { CommercialCoverageCard } from './CommercialCoverageCard';
import { PlanCatalogCard } from './PlanCatalogCard';

type CommercialSubItem = 'coverage' | 'plans';

const COMMERCIAL_SUBNAV: Array<{ id: CommercialSubItem; label: string }> = [
  { id: 'coverage', label: 'Cobertura' },
  { id: 'plans', label: 'Planes' },
];

interface CommercialTabLayoutProps {
  canEdit: boolean;
}

export function CommercialTabLayout({ canEdit }: CommercialTabLayoutProps) {
  const [activeSubItem, setActiveSubItem] = useState<CommercialSubItem>('coverage');

  return (
    <div className="flex flex-col gap-4 md:flex-row md:gap-6">
      {/* Sidebar de sub-navegación */}
      <nav
        aria-label="Subsecciones comerciales"
        className="flex shrink-0 flex-row gap-1 md:w-44 md:flex-col"
      >
        {COMMERCIAL_SUBNAV.map((item) => {
          const isActive = item.id === activeSubItem;
          return (
            <button
              key={item.id}
              type="button"
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'rounded-lg px-3 py-2 text-left text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary focus-visible:ring-offset-2',
                isActive
                  ? 'bg-iwana-primary/10 text-iwana-primary dark:bg-iwana-primary-400/15 dark:text-iwana-primary-300'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-dark-surface-3 dark:hover:text-white',
              )}
              onClick={() => setActiveSubItem(item.id)}
            >
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Contenido del sub-item activo */}
      <div className="min-w-0 flex-1">
        {activeSubItem === 'coverage' && <CommercialCoverageCard canEdit={canEdit} />}
        {activeSubItem === 'plans' && <PlanCatalogCard canEdit={canEdit} />}
      </div>
    </div>
  );
}
