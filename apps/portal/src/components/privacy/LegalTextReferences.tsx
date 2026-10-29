'use client';

import { useEffect, useState } from 'react';
import { Button } from '@iwana/ui';
import type { LegalText } from '@iwana/shared';
import { PortalSidePeek } from '@/components/shared/portal-ui';
import { ApiError, privacyApi } from '@/lib/api-client';
import { LegalTextContent } from './LegalTextContent';

export function LegalTextReferences() {
  const [texts, setTexts] = useState<LegalText[]>([]);
  const [selected, setSelected] = useState<LegalText | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError(false);
    void Promise.all(
      (['POLITICA_TRATAMIENTO', 'AVISO_PRIVACIDAD'] as const).map(async (type) => {
        try {
          const result = await privacyApi.getCurrentLegalText(type);
          return result.type === type ? result : null;
        } catch (failure) {
          if (failure instanceof ApiError && failure.status === 404) return null;
          throw failure;
        }
      }),
    )
      .then((items) => {
        if (active) setTexts(items.filter((item): item is LegalText => item !== null));
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3">
        {texts.map((text) => (
          <button
            type="button"
            className="underline"
            key={text.id}
            onClick={() => setSelected(text)}
          >
            {text.type === 'POLITICA_TRATAMIENTO'
              ? 'Política de tratamiento'
              : 'Aviso de privacidad'}
          </button>
        ))}
      </div>
      {error ? (
        <p>
          No fue posible cargar los textos.{' '}
          <button type="button" className="underline" onClick={() => setRetry((n) => n + 1)}>
            Reintentar
          </button>
        </p>
      ) : null}
      {selected ? (
        <PortalSidePeek
          open
          onClose={() => setSelected(null)}
          title={
            selected.type === 'POLITICA_TRATAMIENTO'
              ? 'Política de tratamiento'
              : 'Aviso de privacidad'
          }
        >
          <p>Versión {selected.version}</p>
          <LegalTextContent content={selected.content} format={selected.format} />
          <Button variant="secondary" onClick={() => setSelected(null)}>
            Cerrar
          </Button>
        </PortalSidePeek>
      ) : null}
    </div>
  );
}
