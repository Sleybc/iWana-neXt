'use client';

import { useParams } from 'next/navigation';
import { MigrationBatchDetailClient } from '@/components/settings/migration/MigrationBatchDetailClient';

export default function MigrationBatchPage() {
  const params = useParams<{ id: string }>();
  return <MigrationBatchDetailClient batchId={params.id} />;
}
