'use client';

import { useRouter } from 'next/navigation';
import { Badge, Button } from '@iwana/ui';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { PersonType, SubscriberStatus } from '@iwana/shared';
import type { SubscriberRecord } from '@/lib/api-client';
import {
  CUSTOMER_SEGMENT_META,
  PERSON_TYPE_META,
  SUBSCRIBER_STATUS_META,
  formatSubscriberName,
} from './subscriber-ui';
import { VatTreatmentBanner } from './VatTreatmentBanner';

interface SubscriberHeaderProps {
  subscriber: SubscriberRecord;
  onChangeStatus: () => void;
}

export function SubscriberHeader({ subscriber, onChangeStatus }: SubscriberHeaderProps) {
  const router = useRouter();
  const name = formatSubscriberName(subscriber);
  const statusMeta = SUBSCRIBER_STATUS_META[subscriber.status as SubscriberStatus];
  const personMeta = PERSON_TYPE_META[subscriber.personType as PersonType];

  return (
    <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-[var(--shadow-sm)] dark:border-dark-border dark:bg-dark-surface-2">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <button
            type="button"
            onClick={() => router.push('/dashboard/crm/subscribers')}
            className="mb-2 flex items-center text-sm font-medium text-gray-500 transition-colors hover:text-iwana-primary"
          >
            <ArrowLeft className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Volver al listado
          </button>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold tracking-tight text-gray-900 dark:text-white md:text-2xl">
              {name}
            </h2>
            <Badge
              variant={statusMeta.variant}
              className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide"
            >
              {statusMeta.label}
            </Badge>
            <Badge
              variant={personMeta.variant}
              className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide"
            >
              {personMeta.label}
            </Badge>
            <Badge
              variant="neutral"
              className="rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wide"
            >
              {CUSTOMER_SEGMENT_META[subscriber.customerSegment].label}
            </Badge>
          </div>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">CRM · Suscriptores</p>
        </div>

        <Button type="button" variant="secondary" onClick={onChangeStatus}>
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Cambiar estado
        </Button>
      </div>

      <VatTreatmentBanner vatTreatment={subscriber.vatTreatment} taxRegime={subscriber.taxRegime} />
    </div>
  );
}
