'use client';

import { useId, useState } from 'react';
import { Avatar, cn } from '@iwana/ui';
import { getCountryPhonePrefix, PersonType } from '@iwana/shared';
import type { SubscriberRecord } from '@/lib/api-client';
import {
  PortalFieldList,
  PortalFieldRow,
  PortalPanel,
  portalPanelDenseActionClassName,
} from '@/components/shared/portal-ui';
import { privacyDisplayValue } from '@/components/privacy/privacy-display';
import { maskDocument } from '@/components/privacy/privacy-labels';
import { SubscriberContactActions } from './SubscriberContactActions';
import { SubscriberDerivedBadges } from './SubscriberDerivedBadges';
import type { SubscriberDerivedBadge } from './subscriber-badges';
import {
  CUSTOMER_SEGMENT_META,
  DOCUMENT_TYPE_OPTIONS,
  PERSON_TYPE_META,
  formatSubscriberDate,
  formatSubscriberLocation,
  formatSubscriberName,
} from './subscriber-ui';

interface SubscriberIdentityCardProps {
  subscriber: SubscriberRecord;
  badges: SubscriberDerivedBadge[];
  /** La ficha llegó desde una oportunidad comercial. */
  hasOrigin: boolean;
  onOpenData: () => void;
}

/** Documento enmascarado (CA-4): nunca el número completo en la Vista general. */
export function formatMaskedDocument(
  subscriber: Pick<SubscriberRecord, 'personType' | 'documentType' | 'documentNumber' | 'nit'>,
): string | null {
  if (subscriber.personType === PersonType.JURIDICA) {
    const nit = subscriber.nit?.trim();
    return nit ? `NIT ${maskDocument(nit)}` : null;
  }
  const number = subscriber.documentNumber?.trim();
  if (!number) return null;
  const typeLabel = DOCUMENT_TYPE_OPTIONS.find(
    (item) => item.value === subscriber.documentType,
  )?.label;
  return typeLabel ? `${typeLabel} ${maskDocument(number)}` : maskDocument(number);
}

/** ID visible: el externo cuando existe (p. ej. importado); si no, el prefijo del interno. */
function visibleId(subscriber: Pick<SubscriberRecord, 'id' | 'externalId'>): string {
  return subscriber.externalId?.trim() || subscriber.id.slice(0, 8).toUpperCase();
}

/** Tarjeta de identidad de la Vista general; conserva el encabezado «Contacto» (CA-1). */
export function SubscriberIdentityCard({
  subscriber,
  badges,
  hasOrigin,
  onOpenData,
}: SubscriberIdentityCardProps) {
  const nameId = useId();
  const moreId = useId();
  const [expanded, setExpanded] = useState(false);
  const anonymizedAt = subscriber.anonymizedAt;
  // El dato personal se ve con el mismo criterio que la pestaña Datos.
  const personalVisible = !anonymizedAt && !subscriber.privacyRestricted;
  const anonymizedValue = privacyDisplayValue(null, { anonymizedAt });
  const name = personalVisible ? formatSubscriberName(subscriber) : anonymizedValue;
  const document = personalVisible ? formatMaskedDocument(subscriber) : null;

  const textRow = (label: string, value: string | null | undefined, mono = false) =>
    personalVisible ? (
      <PortalFieldRow label={label} empty={!value?.trim()} mono={mono}>
        {value}
      </PortalFieldRow>
    ) : (
      <PortalFieldRow label={label}>{anonymizedValue}</PortalFieldRow>
    );

  return (
    <PortalPanel
      as="section"
      labelled
      density="dense"
      title="Contacto"
      actions={
        <button type="button" className={portalPanelDenseActionClassName} onClick={onOpenData}>
          Ver datos
        </button>
      }
    >
      <div className="flex items-start gap-3 pb-2">
        <Avatar name={personalVisible ? name : ''} size="md" labelledById={nameId} />
        <div className="min-w-0 space-y-1.5">
          <p
            id={nameId}
            className="break-words text-base font-semibold text-gray-900 dark:text-white"
          >
            {name}
          </p>
          <SubscriberDerivedBadges badges={badges} />
        </div>
      </div>
      <PortalFieldList>
        <PortalFieldRow label="ID" mono>
          {visibleId(subscriber)}
        </PortalFieldRow>
        {personalVisible ? (
          <PortalFieldRow label="Documento" mono empty={!document}>
            {document}
          </PortalFieldRow>
        ) : (
          <PortalFieldRow label="Documento">{anonymizedValue}</PortalFieldRow>
        )}
        {textRow('Correo', subscriber.email)}
        {textRow('Teléfono', subscriber.phone)}
        {personalVisible && subscriber.altContactPhone?.trim()
          ? textRow('Teléfono alternativo', subscriber.altContactPhone)
          : null}
        {personalVisible && subscriber.whatsapp?.trim()
          ? textRow('WhatsApp', subscriber.whatsapp)
          : null}
        <PortalFieldRow label="Ubicación">
          {personalVisible
            ? formatSubscriberLocation(subscriber.city, subscriber.department)
            : anonymizedValue}
        </PortalFieldRow>
      </PortalFieldList>
      {personalVisible ? (
        <div className="pt-2">
          <SubscriberContactActions
            name={name}
            phone={subscriber.phone}
            altContactPhone={subscriber.altContactPhone}
            whatsapp={subscriber.whatsapp}
            countryPrefix={getCountryPhonePrefix()}
          />
        </div>
      ) : null}
      {expanded ? (
        <div id={moreId}>
          <PortalFieldList className="border-t border-gray-100 dark:border-dark-border">
            {textRow('Dirección', subscriber.address)}
            <PortalFieldRow label="Tipo de persona">
              {PERSON_TYPE_META[subscriber.personType].label}
            </PortalFieldRow>
            <PortalFieldRow label="Segmento">
              {CUSTOMER_SEGMENT_META[subscriber.customerSegment].label}
            </PortalFieldRow>
            <PortalFieldRow label="Fecha de alta">
              {formatSubscriberDate(subscriber.createdAt)}
            </PortalFieldRow>
            <PortalFieldRow label="Origen">
              {hasOrigin ? 'Oportunidad comercial' : 'Registro directo'}
            </PortalFieldRow>
          </PortalFieldList>
        </div>
      ) : null}
      <div className="flex justify-end pt-1">
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={expanded ? moreId : undefined}
          className={cn(portalPanelDenseActionClassName)}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Mostrar menos' : 'Mostrar más'}
        </button>
      </div>
    </PortalPanel>
  );
}
