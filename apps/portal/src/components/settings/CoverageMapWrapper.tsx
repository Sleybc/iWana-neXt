'use client';

import dynamic from 'next/dynamic';
import type { CoverageNodeConfig, CoverageZoneConfig } from '@/lib/api-client';

const CoverageMap = dynamic(() => import('./CoverageMap'), {
  ssr: false,
  loading: () => (
    <div className="h-[400px] animate-pulse rounded-xl border border-gray-200 bg-gray-100 dark:border-dark-border dark:bg-dark-surface-3" />
  ),
});

interface CoverageMapWrapperProps {
  nodes: CoverageNodeConfig[];
  zones: CoverageZoneConfig[];
  readonly: boolean;
  onNodeClick: (node: CoverageNodeConfig) => void;
  onMapClick: (latlng: { lat: number; lng: number }) => void;
}

export function CoverageMapWrapper(props: CoverageMapWrapperProps) {
  return <CoverageMap {...props} />;
}
