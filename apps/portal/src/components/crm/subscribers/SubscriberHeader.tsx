'use client';

import Link from 'next/link';
import {
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@iwana/ui';
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  MoreHorizontal,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { PersonType, SubscriberStatus } from '@iwana/shared';
import type { LifecycleAction } from '@iwana/shared';
import type { Contract, SubscriberRecord } from '@/lib/api-client';
import type { PrivacyMark } from '@iwana/shared';
import { PrivacyMarks } from '@/components/privacy/PrivacyMarks';
import { PrivacyAnonymizedBadge } from '@/components/privacy/PrivacyAnonymizedBadge';
import { privacyDisplayValue } from '@/components/privacy/privacy-display';
import { filterRutResponsibilities } from './subscriber-fiscal';
import {
  CUSTOMER_SEGMENT_META,
  PERSON_TYPE_META,
  SUBSCRIBER_STATUS_META,
  formatSubscriberName,
} from './subscriber-ui';
import { FiscalDataIncompleteAlert } from './FiscalDataIncompleteAlert';
import { VatTreatmentBanner } from './VatTreatmentBanner';
import { isEligibleLifecycleContract } from './subscriber-lifecycle-ui';

/** Opción de «Registrar ▾»: ya filtrada por el permiso del módulo dueño (CA-3). */
export interface SubscriberRegisterAction {
  id: 'pago' | 'ticket' | 'visita' | 'documento' | 'servicio';
  label: string;
  onSelect: () => void;
}

interface SubscriberHeaderProps {
  subscriber: SubscriberRecord;
  contracts?: Contract[];
  marks?: PrivacyMark[];
  canReadPrivacy?: boolean;
  onChangeStatus: () => void;
  onOpenLifecycle?: (action: LifecycleAction) => void;
  onCancelSubscriber?: () => void;
  onAddContact: () => void;
  onCompleteFiscalData?: () => void;
  /** Sin opciones permitidas, el botón «Registrar» no se muestra. */
  registerActions?: SubscriberRegisterAction[];
}

export function SubscriberHeader({
  subscriber,
  contracts = [],
  marks = [],
  canReadPrivacy = false,
  onChangeStatus,
  onOpenLifecycle = () => undefined,
  onCancelSubscriber = () => undefined,
  onAddContact,
  onCompleteFiscalData,
  registerActions = [],
}: SubscriberHeaderProps) {
  const name = privacyDisplayValue(
    subscriber.anonymizedAt ? null : formatSubscriberName(subscriber),
    {
      privacyRestricted: subscriber.privacyRestricted,
      anonymizedAt: subscriber.anonymizedAt,
    },
  );
  const statusMeta = SUBSCRIBER_STATUS_META[subscriber.status as SubscriberStatus];
  const personMeta = PERSON_TYPE_META[subscriber.personType as PersonType];
  const canEditSubscriber = !subscriber.privacyRestricted && !subscriber.anonymizedAt;
  // CD-04: la API mantiene IVA, RUT y completitud en la lista blanca del detalle restringido;
  // el aviso de faltantes se muestra en solo lectura, sin el botón de completar.
  const fiscalIncomplete =
    !subscriber.anonymizedAt &&
    subscriber.status !== SubscriberStatus.CANCELLED &&
    subscriber.fiscalCompleteness?.complete === false;
  const hasActiveServices = contracts.some((contract) =>
    isEligibleLifecycleContract(contract, 'SUSPEND'),
  );
  const hasSuspendedServices = contracts.some((contract) =>
    isEligibleLifecycleContract(contract, 'REACTIVATE'),
  );
  const cancellationDisabledCopy =
    'Termina primero todos los servicios vigentes para cancelar al suscriptor.';

  const touch = 'min-h-11 md:min-h-9';

  return (
    <div className="space-y-2 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-[var(--shadow-sm)] dark:border-dark-border dark:bg-dark-surface-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <Link
            href="/dashboard/crm/subscribers"
            aria-label="Volver a suscriptores"
            className={`inline-flex ${touch} items-center rounded-md text-sm font-medium text-gray-500 transition-colors hover:text-iwana-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-iwana-primary`}
          >
            <ArrowLeft className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Suscriptores
          </Link>
          <span className="text-gray-400 dark:text-gray-500" aria-hidden="true">
            /
          </span>
          <h2 className="min-w-0 break-words text-lg font-semibold tracking-tight text-gray-900 dark:text-white md:text-xl">
            {name}
          </h2>
          <Badge variant={statusMeta.variant} className="rounded-full">
            {statusMeta.label}
          </Badge>
          <PrivacyAnonymizedBadge
            anonymizedAt={subscriber.anonymizedAt}
            anonymizedRequestId={subscriber.anonymizedRequestId}
            canReadPrivacy={canReadPrivacy}
          />
          {subscriber.contactPending && (
            <Badge variant="warning" className="rounded-full">
              <AlertTriangle className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Contacto pendiente
            </Badge>
          )}
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {personMeta.label} · {CUSTOMER_SEGMENT_META[subscriber.customerSegment].label}
          </p>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canEditSubscriber && subscriber.contactPending && (
            <Button type="button" variant="secondary" className={touch} onClick={onAddContact}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Agregar contacto
            </Button>
          )}
          {canEditSubscriber && subscriber.status === SubscriberStatus.LEAD && (
            <Button type="button" variant="secondary" className={touch} onClick={onChangeStatus}>
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Cambiar estado
            </Button>
          )}
          {canEditSubscriber && subscriber.status === SubscriberStatus.ACTIVE && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Button
                type="button"
                variant="primary"
                className={touch}
                disabled={!hasActiveServices}
                aria-describedby={!hasActiveServices ? 'subscriber-suspend-disabled' : undefined}
                onClick={() => onOpenLifecycle('SUSPEND')}
              >
                Suspender servicios
              </Button>
              {!hasActiveServices && (
                <p
                  id="subscriber-suspend-disabled"
                  className="max-w-[16rem] text-xs text-gray-600 dark:text-gray-300"
                  role="status"
                >
                  No hay servicios activos para suspender.
                </p>
              )}
            </div>
          )}
          {canEditSubscriber && subscriber.status === SubscriberStatus.SUSPENDED && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <Button
                type="button"
                variant="primary"
                className={touch}
                disabled={!hasSuspendedServices}
                aria-describedby={
                  !hasSuspendedServices ? 'subscriber-reactivate-disabled' : undefined
                }
                onClick={() => onOpenLifecycle('REACTIVATE')}
              >
                Reactivar servicios
              </Button>
              {!hasSuspendedServices && (
                <p
                  id="subscriber-reactivate-disabled"
                  className="max-w-[16rem] text-xs text-gray-600 dark:text-gray-300"
                  role="status"
                >
                  No hay servicios suspendidos para reactivar.
                </p>
              )}
            </div>
          )}
          {registerActions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild aria-controls="subscriber-register-menu">
                <Button type="button" variant="primary" className={`${touch} gap-1.5`}>
                  <Plus className="h-4 w-4" aria-hidden="true" />
                  Registrar
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                id="subscriber-register-menu"
                width="w-56"
                align="end"
                sideOffset={8}
              >
                {registerActions.map((action) => (
                  <DropdownMenuItem key={action.id} className="min-h-11" onClick={action.onSelect}>
                    {action.label}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {canEditSubscriber && subscriber.status !== SubscriberStatus.CANCELLED && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild aria-controls="subscriber-action-menu">
                <Button type="button" variant="secondary" className={touch}>
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                  Más acciones
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                id="subscriber-action-menu"
                width="w-72"
                align="end"
                sideOffset={8}
              >
                {subscriber.hasLiveContracts && (
                  <DropdownMenuItem
                    id="subscriber-cancellation-disabled"
                    className="min-h-11 cursor-default whitespace-normal text-xs font-normal text-gray-600 dark:text-gray-300"
                    onClick={(event) => event.preventDefault()}
                  >
                    {cancellationDisabledCopy}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  disabled={subscriber.hasLiveContracts}
                  aria-describedby={
                    subscriber.hasLiveContracts ? 'subscriber-cancellation-disabled' : undefined
                  }
                  className="min-h-11 whitespace-normal"
                  onClick={onCancelSubscriber}
                >
                  Cancelar suscriptor
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <VatTreatmentBanner
          variant="inline"
          personType={subscriber.personType}
          vatResponsibility={subscriber.vatResponsibility}
          rutResponsibilities={filterRutResponsibilities(subscriber.rutResponsibilities)}
        />
        <PrivacyMarks marks={marks} />
      </div>

      {fiscalIncomplete && (
        <FiscalDataIncompleteAlert
          density="compact"
          missing={subscriber.fiscalCompleteness.missing}
          onComplete={canEditSubscriber ? onCompleteFiscalData : undefined}
        />
      )}
    </div>
  );
}
