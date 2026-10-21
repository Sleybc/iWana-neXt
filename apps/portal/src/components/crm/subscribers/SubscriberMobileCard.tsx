'use client';

import Link from 'next/link';
import { useRef, type MouseEvent } from 'react';
import { Badge, Button } from '@iwana/ui';
import type { SubscriberListItem } from '@iwana/shared';
import { privacyDisplayValue } from '@/components/privacy/privacy-display';
import { SubscriberContactActions } from './SubscriberContactActions';
import {
  formatSubscriberListIdentityDetails,
  formatSubscriberName,
  formatSubscriberPrimaryService,
  SUBSCRIBER_STATUS_META,
} from './subscriber-ui';

interface SubscriberMobileCardProps {
  subscriber: SubscriberListItem;
  index: number;
  countryPrefix: string | null;
  onOpen: (subscriberId: string, index: number, trigger: HTMLButtonElement) => void;
  onSummaryRef?: (subscriberId: string, trigger: HTMLButtonElement | null) => void;
}

export function SubscriberMobileCard({
  subscriber,
  index,
  countryPrefix,
  onOpen,
  onSummaryRef,
}: SubscriberMobileCardProps) {
  const summaryButtonRef = useRef<HTMLButtonElement | null>(null);
  const privacyRedacted = subscriber.privacyRestricted || Boolean(subscriber.anonymizedAt);
  const name = privacyDisplayValue(
    subscriber.anonymizedAt ? null : formatSubscriberName(subscriber),
    {
      privacyRestricted: subscriber.privacyRestricted,
      anonymizedAt: subscriber.anonymizedAt,
    },
  );
  const identityDetails = formatSubscriberListIdentityDetails(subscriber);
  const service = formatSubscriberPrimaryService(subscriber);

  function openSummary() {
    const trigger = summaryButtonRef.current;
    if (trigger) onOpen(subscriber.id, index, trigger);
  }

  function handleCardClick(event: MouseEvent<HTMLElement>) {
    const target = event.target;
    if (target instanceof Element && target.closest('a,button,input,select,textarea')) return;
    openSummary();
  }

  return (
    <li>
      <article
        onClick={handleCardClick}
        className="cursor-pointer space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-iwana-soft transition-colors hover:border-iwana-primary/30 dark:border-dark-border dark:bg-dark-surface-2"
      >
        <header className="flex min-w-0 items-start justify-between gap-3">
          <h2 className="min-w-0 break-words text-base font-semibold text-iwana-primary dark:text-white">
            <Link
              href={`/dashboard/crm/subscribers/${encodeURIComponent(subscriber.id)}`}
              className="inline-flex min-h-11 items-center rounded-md underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary dark:focus-visible:ring-iwana-primary-300"
            >
              {name}
            </Link>
          </h2>
        </header>

        <Button
          ref={(node) => {
            summaryButtonRef.current = node;
            onSummaryRef?.(subscriber.id, node);
          }}
          type="button"
          variant="ghost"
          aria-label={`Abrir resumen de ${name}`}
          className="h-auto min-h-11 w-full justify-start whitespace-normal rounded-xl px-0 py-2 text-left font-normal text-gray-900 hover:bg-transparent dark:text-gray-100 dark:hover:bg-transparent"
          onClick={openSummary}
        >
          <span className="flex w-full min-w-0 flex-col items-start gap-2">
            <Badge variant={SUBSCRIBER_STATUS_META[subscriber.status].variant}>
              {SUBSCRIBER_STATUS_META[subscriber.status].label}
            </Badge>
            {identityDetails ? (
              <span className="break-words text-sm text-gray-600 dark:text-gray-300">
                {identityDetails}
              </span>
            ) : null}
            <span className="min-w-0 break-words font-medium">
              {service.title}
              {service.details ? (
                <span className="mt-1 block text-sm font-normal text-gray-600 dark:text-gray-300">
                  {service.details}
                </span>
              ) : null}
            </span>
          </span>
        </Button>

        {countryPrefix ? (
          <SubscriberContactActions
            name={name}
            phone={subscriber.phone}
            altContactPhone={subscriber.altContactPhone}
            whatsapp={subscriber.whatsapp}
            countryPrefix={countryPrefix}
            hidden={privacyRedacted}
          />
        ) : null}
      </article>
    </li>
  );
}
