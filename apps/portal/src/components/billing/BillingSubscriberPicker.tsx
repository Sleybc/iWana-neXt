'use client';

import { useEffect, useId, useState } from 'react';
import type { SubscriberListItem } from '@iwana/shared';
import { Button } from '@iwana/ui';
import { subscribersApi } from '@/lib/api-client';
import { PROTECTED_LABEL } from './billing-copy';
import { billingInputClass } from './billing-ui';

type SubscriberOption = { id: string; label: string };

function subscriberLabel(subscriber: SubscriberListItem): string {
  if (subscriber.privacyRestricted) return PROTECTED_LABEL;
  return (
    subscriber.businessName ||
    [subscriber.firstName, subscriber.lastName].filter(Boolean).join(' ') ||
    'Suscriptor sin nombre disponible'
  );
}

export function BillingSubscriberPicker({
  selected,
  onChange,
  label = 'Buscar suscriptor',
  disabled,
}: {
  selected: SubscriberOption | null;
  onChange: (value: SubscriberOption | null) => void;
  label?: string;
  disabled?: boolean;
}) {
  const id = useId();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<{ query: string; items: SubscriberListItem[] }>();
  const [error, setError] = useState('');
  const search = selected ? '' : query.trim();

  useEffect(() => {
    if (search.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void subscribersApi
        .list({ search, page: 1, limit: 10 }, undefined, { signal: controller.signal })
        .then(({ data }) => {
          if (!controller.signal.aborted) {
            setResult({ query: search, items: data });
            setError('');
          }
        })
        .catch(() => {
          if (!controller.signal.aborted) setError('No pudimos buscar suscriptores.');
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search]);

  if (selected) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span>{selected.label}</span>
        <Button
          className="min-h-11"
          type="button"
          variant="ghost"
          disabled={disabled}
          onClick={() => {
            setQuery('');
            onChange(null);
          }}
        >
          Cambiar suscriptor
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={billingInputClass}
        value={query}
        onChange={(event) => {
          setError('');
          setQuery(event.target.value);
        }}
        disabled={disabled}
      />
      {search.length >= 2 ? (
        error ? (
          <p role="alert">{error}</p>
        ) : result?.query !== search ? (
          <p role="status">Buscando suscriptores…</p>
        ) : result.items.length === 0 ? (
          <p role="status">No encontramos suscriptores.</p>
        ) : (
          <ul aria-label="Resultados de suscriptores" className="space-y-1">
            {result.items.map((subscriber) => (
              <li key={subscriber.id}>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={disabled}
                  onClick={() =>
                    onChange({ id: subscriber.id, label: subscriberLabel(subscriber) })
                  }
                >
                  {subscriberLabel(subscriber)}
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
