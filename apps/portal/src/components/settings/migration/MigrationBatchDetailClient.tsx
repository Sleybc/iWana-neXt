'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@iwana/ui';
import { ArrowLeft } from 'lucide-react';
import {
  MIGRATION_ENTITIES,
  type MigrationBatchReport,
  type MigrationEntity,
  type MigrationPendingValue,
  type MigrationRejectionReason,
  type MigrationRevertBlocker,
} from '@iwana/shared';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  PortalAlert,
  PortalPanel,
  PortalSkeletonBlock,
  portalInlineTextLinkClassName,
} from '@/components/shared/portal-ui';
import { formatBillingMoney } from '@/components/billing/billing-copy';
import { migrationApi } from '@/lib/api-client';
import {
  MIGRATION_COPY,
  MIGRATION_ENTITY_LABELS,
  MIGRATION_FILE_REJECTION_LABELS,
  MIGRATION_OBSERVATION_LABELS,
  MIGRATION_REJECTION_REASON_LABELS,
  MIGRATION_REVERT_BLOCK_LABELS,
  MIGRATION_SETTINGS_HREF,
  externalClientLabel,
  formatMigrationDate,
  migrationBatchStatusPresentation,
  migrationErrorMessage,
  revertBlockersFromError,
} from './migration-labels';
import { MigrationMappingEditor } from './MigrationMappingEditor';
import { MIGRATION_POLL_INTERVAL_MS, useMigrationAccess } from './useMigrationAccess';

type ConfirmKind = 'promote' | 'revert';

/** Promoción fallida: el lote quedó `CARGADO` y el worker marcó la promoción `FALLIDO`. */
export function isPromotionFailed(report: MigrationBatchReport): boolean {
  return report.status === 'CARGADO' && report.promotion?.procesamiento === 'FALLIDO';
}

/** Sigue procesando mientras la simulación o la promoción están pendientes (nunca si falló). */
export function isReportInProgress(report: MigrationBatchReport): boolean {
  if (report.counts.procesamiento === 'PENDIENTE') return true;
  if (isPromotionFailed(report)) return false;
  return report.status === 'CARGADO' || report.promotion?.procesamiento === 'PENDIENTE';
}

export function progressMessage(report: MigrationBatchReport): string {
  if (report.counts.procesamiento === 'PENDIENTE') {
    return 'Leyendo los archivos y simulando la importación. El informe se actualiza solo.';
  }
  if (isPromotionFailed(report)) {
    return 'La promoción del lote falló. Puedes intentar promoverlo de nuevo.';
  }
  if (report.status === 'CARGADO' || report.promotion?.procesamiento === 'PENDIENTE') {
    return 'Promoviendo el lote a iWana. El informe se actualiza solo.';
  }
  if (report.counts.procesamiento === 'FALLIDO') {
    return 'El procesamiento del lote falló. Sube los archivos de nuevo en un lote nuevo.';
  }
  return '';
}

function countEntries<K extends string>(record: Partial<Record<K, number>> | undefined) {
  return Object.entries(record ?? {}).filter(([, count]) => (count as number) > 0) as [K, number][];
}

function EntityReport({ report }: { report: MigrationBatchReport }) {
  const entities = MIGRATION_ENTITIES.filter((entity) => report.counts.entidades[entity]);
  if (entities.length === 0) {
    return <p className="text-sm text-gray-600 dark:text-gray-300">Aún no hay registros leídos.</p>;
  }
  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[28rem] text-sm">
          <caption className="sr-only">Registros por entidad</caption>
          <thead>
            <tr className="text-left text-gray-500 dark:text-gray-400">
              <th scope="col" className="py-2 pr-3 font-medium">
                Entidad
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Leídos
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Válidos
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                Rechazados
              </th>
              {report.promotion ? (
                <th scope="col" className="py-2 text-right font-medium">
                  Promovidos
                </th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 text-gray-900 dark:divide-dark-border dark:text-white">
            {entities.map((entity) => {
              const counts = report.counts.entidades[entity];
              return (
                <tr key={entity}>
                  <th scope="row" className="py-2 pr-3 text-left font-medium">
                    {MIGRATION_ENTITY_LABELS[entity]}
                  </th>
                  <td className="py-2 pr-3 text-right tabular-nums">{counts?.leidos ?? 0}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{counts?.validos ?? 0}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{counts?.rechazados ?? 0}</td>
                  {report.promotion ? (
                    <td className="py-2 text-right tabular-nums">
                      {report.promotion.promovidos[entity] ?? 0}
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <RejectionList title="Motivos de rechazo en la simulación" rejections={report.rejections} />
      {report.promotion ? (
        <RejectionList
          title="Motivos de rechazo al promover"
          rejections={report.promotion.rechazados}
        />
      ) : null}
    </div>
  );
}

function RejectionList({
  title,
  rejections,
}: {
  title: string;
  rejections: MigrationBatchReport['rejections'];
}) {
  const groups = MIGRATION_ENTITIES.map(
    (entity) =>
      [entity, countEntries<MigrationRejectionReason>(rejections[entity])] as [
        MigrationEntity,
        [MigrationRejectionReason, number][],
      ],
  ).filter(([, reasons]) => reasons.length > 0);
  if (groups.length === 0) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{title}</h3>
      {groups.map(([entity, reasons]) => (
        <div key={entity}>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
            {MIGRATION_ENTITY_LABELS[entity]}
          </p>
          <ul className="ml-4 list-disc text-sm text-gray-700 dark:text-gray-200">
            {reasons.map(([reason, count]) => (
              <li key={reason}>
                {MIGRATION_REJECTION_REASON_LABELS[reason]}: {count}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function FileAndObservationReport({ report }: { report: MigrationBatchReport }) {
  const fileRejections = countEntries(report.counts.archivos.rechazados);
  const observations = countEntries(report.counts.observaciones);
  return (
    <div className="space-y-3 text-sm text-gray-700 dark:text-gray-200">
      <p>
        Archivos recibidos: {report.counts.archivos.recibidos} · leídos:{' '}
        {report.counts.archivos.leidos}
      </p>
      {fileRejections.length > 0 ? (
        <ul aria-label="Archivos rechazados" className="ml-4 list-disc">
          {fileRejections.map(([reason, count]) => (
            <li key={reason}>
              {MIGRATION_FILE_REJECTION_LABELS[reason]}: {count}
            </li>
          ))}
        </ul>
      ) : null}
      {observations.length > 0 ? (
        <>
          <p className="font-medium text-gray-900 dark:text-white">Observaciones</p>
          <ul aria-label="Observaciones" className="ml-4 list-disc">
            {observations.map(([observation, count]) => (
              <li key={observation}>
                {MIGRATION_OBSERVATION_LABELS[observation]}: {count}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function ReconciliationReport({
  reconciliation,
}: {
  reconciliation: NonNullable<MigrationBatchReport['reconciliation']>;
}) {
  return (
    <div className="space-y-3">
      <PortalAlert
        variant={reconciliation.resultado === 'CONCILIADO' ? 'success' : 'warning'}
        title={
          reconciliation.resultado === 'CONCILIADO'
            ? 'Los saldos coinciden con UISP'
            : 'Hay diferencias con UISP'
        }
        description={`${reconciliation.conciliados} de ${reconciliation.titulares} suscriptores coinciden. Calculado el ${formatMigrationDate(reconciliation.calculadoEn)}.`}
      />
      {reconciliation.diferencias.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <caption className="sr-only">Diferencias por suscriptor</caption>
            <thead>
              <tr className="text-left text-gray-500 dark:text-gray-400">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Suscriptor
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Facturado (UISP / iWana)
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Pagado (UISP / iWana)
                </th>
                <th scope="col" className="py-2 font-medium">
                  Saldo (UISP / iWana)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-900 dark:divide-dark-border dark:text-white">
              {reconciliation.diferencias.map((difference) => (
                <tr key={difference.subscriberId}>
                  <th scope="row" className="py-2 pr-3 text-left font-medium">
                    <Link
                      href={`/dashboard/crm/subscribers/${encodeURIComponent(difference.subscriberId)}`}
                      className={portalInlineTextLinkClassName}
                    >
                      {externalClientLabel(difference.externalId)}
                    </Link>
                  </th>
                  {(['facturado', 'pagado', 'saldo'] as const).map((key) => (
                    <td key={key} className="py-2 pr-3 tabular-nums">
                      {formatBillingMoney(difference[key].uisp)} /{' '}
                      {formatBillingMoney(difference[key].iwana)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

const CONFIRM_COPY: Record<ConfirmKind, { title: string; description: string; action: string }> = {
  promote: {
    title: 'Promover el lote',
    description:
      'Los registros válidos pasan a iWana: suscriptores, servicios, cobros históricos, pagos, tickets y soportes. Los rechazados se quedan fuera. Al terminar se concilia contra UISP.',
    action: 'Promover',
  },
  revert: {
    title: 'Revertir el lote',
    description:
      'Se retira de iWana todo lo que trajo este lote. Si algo creado después depende de él, la reversión se bloquea y te decimos qué es.',
    action: 'Revertir',
  },
};

export function MigrationBatchDetailClient({ batchId }: { batchId: string }) {
  const access = useMigrationAccess();
  const [report, setReport] = useState<MigrationBatchReport | null>(null);
  const [pending, setPending] = useState<MigrationPendingValue[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<MigrationRevertBlocker[]>([]);
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  const [busy, setBusy] = useState<ConfirmKind | 'reconcile' | null>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback(async () => {
    try {
      const [next, nextPending] = await Promise.all([
        migrationApi.getBatch(batchId),
        migrationApi.pendingMappings(batchId),
      ]);
      setReport(next);
      setPending(nextPending);
      setLoadError(null);
    } catch (error) {
      setLoadError(migrationErrorMessage(error, 'No pudimos cargar el informe del lote.'));
    }
  }, [batchId]);

  useEffect(() => {
    if (access.ready && access.allowed) void load();
  }, [access.ready, access.allowed, load]);

  const inProgress = report ? isReportInProgress(report) : false;
  useEffect(() => {
    if (!inProgress) return;
    const timer = setInterval(() => void load(), MIGRATION_POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [inProgress, load]);

  async function runAction(kind: ConfirmKind | 'reconcile') {
    setConfirm(null);
    setBusy(kind);
    setActionError(null);
    setActionNotice(null);
    setBlockers([]);
    try {
      if (kind === 'promote') {
        await migrationApi.promote(batchId);
        setActionNotice('Promoción iniciada. El informe se actualiza solo.');
      } else if (kind === 'reconcile') {
        await migrationApi.reconcile(batchId);
        setActionNotice('Conciliación actualizada.');
      } else {
        await migrationApi.revert(batchId);
        setActionNotice('Lote revertido. Lo que trajo ya no está en iWana.');
      }
      await load();
    } catch (error) {
      if (kind === 'revert') setBlockers(revertBlockersFromError(error));
      setActionError(
        migrationErrorMessage(error, 'No pudimos completar la acción. Intenta de nuevo.'),
      );
    } finally {
      setBusy(null);
      titleRef.current?.focus();
    }
  }

  if (!access.ready || (access.allowed && !report && !loadError)) {
    return (
      <div className="space-y-6" aria-busy="true">
        <PageHeader title="Informe del lote" subtitle="Cargando…" />
        <PortalSkeletonBlock className="h-64" />
      </div>
    );
  }

  if (!access.allowed) {
    return (
      <div className="space-y-6">
        <PageHeader title="Informe del lote" subtitle={MIGRATION_COPY.pageSubtitle} />
        <PortalAlert
          variant="warning"
          title={MIGRATION_COPY.forbiddenTitle}
          description={MIGRATION_COPY.forbiddenDescription}
        />
      </div>
    );
  }

  const backLink = (
    <Link
      href={MIGRATION_SETTINGS_HREF}
      className={`${portalInlineTextLinkClassName} inline-flex items-center gap-1 text-sm`}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Volver a importaciones
    </Link>
  );

  if (!report) {
    return (
      <div className="space-y-6">
        {backLink}
        <PageHeader title="Informe del lote" subtitle="" />
        <PortalAlert
          variant="error"
          title={loadError ?? 'No pudimos cargar el informe del lote.'}
          action={
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Reintentar
            </Button>
          }
        />
      </div>
    );
  }

  const promotionFailed = isPromotionFailed(report);
  const status = migrationBatchStatusPresentation(
    report.status,
    report.counts.procesamiento,
    report.promotion?.procesamiento,
  );
  const purged = report.purgedAt !== null;
  // La API admite reintentar la promoción de un lote CARGADO cuya promoción falló.
  const canPromote =
    ((report.status === 'SIMULADO' && report.counts.procesamiento === 'COMPLETADO') ||
      promotionFailed) &&
    !purged;
  const canReconcile =
    (report.status === 'PROMOVIDO' || report.status === 'CONCILIADO') && !inProgress;
  const canRevert = canReconcile;
  const progress = progressMessage(report);

  return (
    <div className="space-y-6">
      {backLink}
      <PageHeader
        title={`Lote del ${formatMigrationDate(report.createdAt)}`}
        subtitle={`${report.filesReceived === 1 ? '1 archivo' : `${report.filesReceived} archivos`} de UISP`}
      />

      <PortalPanel
        title="Estado"
        titleRef={titleRef}
        titleTabIndex={-1}
        titleAddon={<Badge variant={status.variant}>{status.label}</Badge>}
        actions={
          <div className="flex flex-wrap gap-2">
            {canPromote ? (
              <Button
                type="button"
                className="min-h-11"
                disabled={busy !== null}
                loading={busy === 'promote'}
                onClick={() => setConfirm('promote')}
              >
                Promover
              </Button>
            ) : null}
            {canReconcile ? (
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                disabled={busy !== null}
                loading={busy === 'reconcile'}
                onClick={() => void runAction('reconcile')}
              >
                Conciliar
              </Button>
            ) : null}
            {canRevert ? (
              <Button
                type="button"
                variant="secondary"
                className="min-h-11"
                disabled={busy !== null}
                loading={busy === 'revert'}
                onClick={() => setConfirm('revert')}
              >
                Revertir
              </Button>
            ) : null}
          </div>
        }
      >
        <div className="space-y-3">
          <p role="status" aria-live="polite" className="text-sm text-gray-700 dark:text-gray-200">
            {progress}
          </p>
          {purged ? (
            <PortalAlert
              variant="info"
              title="Los archivos de este lote ya se eliminaron por retención"
              description="El informe se conserva; el lote ya no se puede promover."
            />
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Los archivos se eliminan el {formatMigrationDate(report.purgeAfter)}.
            </p>
          )}
          {canPromote && pending.length > 0 ? (
            <PortalAlert
              variant="warning"
              title="Hay valores sin equivalencia"
              description="Los registros que los usan se rechazarán al promover. Asigna las equivalencias abajo antes de promover."
            />
          ) : null}
          {actionNotice ? <PortalAlert variant="success" title={actionNotice} /> : null}
          {actionError ? (
            <PortalAlert
              variant="error"
              live="assertive"
              title={actionError}
              description={
                blockers.length > 0 ? (
                  <ul aria-label="Qué bloquea la reversión" className="ml-4 list-disc">
                    {blockers.map((blocker) => (
                      <li key={blocker.motivo}>
                        {MIGRATION_REVERT_BLOCK_LABELS[blocker.motivo]}: {blocker.cantidad}
                      </li>
                    ))}
                  </ul>
                ) : undefined
              }
            />
          ) : null}
        </div>
      </PortalPanel>

      <PortalPanel title="Informe por entidad" labelled>
        <EntityReport report={report} />
      </PortalPanel>

      <PortalPanel title="Archivos y observaciones" labelled>
        <FileAndObservationReport report={report} />
      </PortalPanel>

      {report.status === 'SIMULADO' || pending.length > 0 ? (
        <PortalPanel
          title="Equivalencias pendientes"
          description="Indica a qué corresponde en iWana cada plan, método de pago, ciclo o etiqueta de UISP."
          labelled
        >
          <MigrationMappingEditor pending={pending} onSaved={() => void load()} />
        </PortalPanel>
      ) : null}

      {report.reconciliation ? (
        <PortalPanel title="Conciliación con UISP" labelled>
          <ReconciliationReport reconciliation={report.reconciliation} />
        </PortalPanel>
      ) : null}

      <Dialog open={confirm !== null} onOpenChange={(open) => !open && setConfirm(null)}>
        <DialogContent className="max-w-lg">
          {confirm ? (
            <>
              <DialogHeader>
                <DialogTitle>{CONFIRM_COPY[confirm].title}</DialogTitle>
                <DialogDescription>{CONFIRM_COPY[confirm].description}</DialogDescription>
              </DialogHeader>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11"
                  onClick={() => setConfirm(null)}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="min-h-11"
                  variant={confirm === 'revert' ? 'destructive' : 'primary'}
                  onClick={() => void runAction(confirm)}
                >
                  {CONFIRM_COPY[confirm].action}
                </Button>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
