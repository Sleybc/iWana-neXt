'use client';

import { PortalSkeletonBlock, portalDataTableShellClassName } from '@/components/shared/portal-ui';
import { cn } from '@iwana/ui';

export function StockLocationsMatrixSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Cargando bodegas">
      <div className="space-y-3 border-b border-gray-100 pb-4 dark:border-dark-border">
        <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_200px_200px_auto] xl:items-end">
          <PortalSkeletonBlock className="h-12 rounded-2xl" />
          <PortalSkeletonBlock className="h-12 rounded-2xl" />
          <PortalSkeletonBlock className="h-12 rounded-2xl" />
        </div>
      </div>

      <div className={portalDataTableShellClassName}>
        <div className="border-b border-gray-100 bg-iwana-surface-soft px-4 py-3 dark:border-dark-border dark:bg-dark-surface-3">
          <div className="flex gap-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <PortalSkeletonBlock key={index} className="h-3 w-24 rounded-full" />
            ))}
          </div>
        </div>
        <div className="space-y-0 divide-y divide-gray-100 dark:divide-dark-border">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="grid grid-cols-6 gap-4 px-4 py-4">
              {Array.from({ length: 6 }).map((__, cellIndex) => (
                <PortalSkeletonBlock
                  key={cellIndex}
                  className={cn('h-4 rounded-full', cellIndex === 0 ? 'w-40' : 'w-24')}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
