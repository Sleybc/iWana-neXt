'use client';

import type { ReactNode } from 'react';

/** Meta-tile compartido de catálogo / detalle de existencias (G6 DS-OWNER Fase 04). */
export function InventoryMetaItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-iwana-surface-soft px-4 py-3 dark:border-dark-border dark:bg-dark-surface-3">
      <dt className="portal-eyebrow-muted">{label}</dt>
      <dd className="mt-1 text-sm font-medium tabular-nums text-gray-900 dark:text-white">
        {value}
      </dd>
    </div>
  );
}
