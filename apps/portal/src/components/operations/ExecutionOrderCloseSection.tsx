'use client';

import { Camera, CheckCircle2 } from 'lucide-react';
import { ExecutionOrderResult } from '@iwana/shared';
import type { ExecutionOrderTemplateVersion } from '@iwana/shared';
import { Badge, Button, Input, Select } from '@iwana/ui';
import { PortalAlert } from '@/components/shared/portal-ui';
import type { NonRealizationCause } from '@/lib/api-client';
import type { ExecutionOrderDetailResponse } from '@/lib/api-client';
import { getTerminalHelp } from './execution-order-commitment-copy';
import { canInteract, isTerminalStatus } from './execution-order-moment';
import { getExecutionOrderCompletionDisplay } from './execution-order-view';
import {
  EXECUTION_ORDER_RESULT_LABELS,
  EXECUTION_ORDER_RESULT_VARIANTS,
  formatTaskDateTime,
} from './operations-labels';
import type { ExecutionOrderCloseForm } from './use-execution-order-close-form';

// B0 — bloque de cierre y resultado. Va después de los requisitos (UX §4.1 punto
// 5); en estado terminal queda en lectura. El estado del formulario lo posee el
// shell mediante `useExecutionOrderCloseForm`.

const CAUSE_CATEGORY_LABELS: Record<NonRealizationCause['category'], string> = {
  CUSTOMER: 'Cliente',
  OPERATIONAL: 'Operación',
  FORCE_MAJEURE: 'Fuerza mayor',
};

export interface ExecutionOrderCloseSectionProps {
  order: ExecutionOrderDetailResponse;
  template: ExecutionOrderTemplateVersion | null;
  form: ExecutionOrderCloseForm;
  isSubmitting: boolean;
  offline: boolean;
  nonRealizationCauses: NonRealizationCause[] | null;
  onUploadNonRealizationEvidence?: ((file: File) => Promise<void | boolean>) | undefined;
}

export function ExecutionOrderCloseSection({
  order,
  template,
  form,
  isSubmitting,
  offline,
  nonRealizationCauses,
  onUploadNonRealizationEvidence,
}: ExecutionOrderCloseSectionProps) {
  const terminal = isTerminalStatus(order.status);
  const canClose = template !== null && order.allowedActions?.includes('CLOSE') === true;
  const completion = getExecutionOrderCompletionDisplay(order.completion);
  const assigneePresent = order.assignee != null;

  return (
    <section
      aria-labelledby="eo-close-heading"
      className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-dark-border dark:bg-dark-surface-2"
    >
      <h3 id="eo-close-heading" className="text-sm font-semibold text-gray-900 dark:text-white">
        Cierre
      </h3>

      {terminal ? (
        <div className="mt-3">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            La OT está cerrada y solo puede consultarse.
          </p>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            {getTerminalHelp({
              status: order.status,
              allowedActions: order.allowedActions,
              assigneePresent,
            })}
          </p>
          {order.result && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant={EXECUTION_ORDER_RESULT_VARIANTS[order.result]}>
                {EXECUTION_ORDER_RESULT_LABELS[order.result] ?? 'Resultado registrado'}
              </Badge>
            </div>
          )}
          {order.completion.closedAt && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Cerrada el {formatTaskDateTime(order.completion.closedAt)}
            </p>
          )}
        </div>
      ) : canInteract(order, offline) && canClose ? (
        <div className="mt-3 space-y-3">
          <Select
            id="eo-close-result"
            label="Resultado"
            value={form.closeResult}
            options={form.resultOptions}
            disabled={isSubmitting}
            onChange={(event) => {
              const next = event.target.value as ExecutionOrderResult;
              form.setCloseResult(next);
              if (next !== ExecutionOrderResult.NOT_EXECUTED) {
                form.setSelectedNonRealizationCauseId('');
                form.setNonRealizationNote('');
                form.setNonRealizationEvidenceFile(null);
              }
            }}
          />
          {form.isNotExecuted && nonRealizationCauses && nonRealizationCauses.length > 0 && (
            <div className="space-y-3 rounded-xl border border-dashed border-gray-300 p-3 dark:border-dark-border">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                Causa de la visita no realizada
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Elige la causa antes de confirmar el cierre. Es obligatoria para conservar la
                trazabilidad.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {nonRealizationCauses.map((cause) => {
                  const isSelected = cause.id === form.selectedNonRealizationCauseId;
                  return (
                    <button
                      key={cause.id}
                      type="button"
                      aria-pressed={isSelected}
                      disabled={isSubmitting}
                      onClick={() => form.setSelectedNonRealizationCauseId(cause.id)}
                      className={`min-h-[44px] rounded-xl border p-3 text-left text-sm transition-colors ${
                        isSelected
                          ? 'border-iwana-primary bg-iwana-primary-50/60 dark:border-iwana-primary-300 dark:bg-iwana-primary-900/15'
                          : 'border-gray-200 bg-white hover:border-gray-300 dark:border-dark-border dark:bg-dark-surface-2'
                      }`}
                    >
                      <span className="block font-medium text-gray-900 dark:text-white">
                        {cause.label}
                      </span>
                      <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                        {CAUSE_CATEGORY_LABELS[cause.category] ?? 'Fuerza mayor'}
                        {cause.requiresEvidence ? ' · Requiere evidencia' : ''}
                      </span>
                    </button>
                  );
                })}
              </div>
              {form.nonRealizationRequiresEvidence && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                    Toma una foto del sitio. Es lo que respalda que la visita se intentó.
                  </p>
                  <input
                    ref={form.nonRealizationEvidenceRef}
                    type="file"
                    aria-label="Evidencia de intento fallido"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      form.setNonRealizationEvidenceFile(file);
                      if (onUploadNonRealizationEvidence) {
                        void onUploadNonRealizationEvidence(file);
                      }
                    }}
                  />
                  {form.nonRealizationEvidenceFile ? (
                    <div className="flex items-center gap-2 text-xs text-green-700 dark:text-green-300">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>{form.nonRealizationEvidenceFile.name}</span>
                      <button
                        type="button"
                        className="text-red-600 underline dark:text-red-400"
                        onClick={() => form.setNonRealizationEvidenceFile(null)}
                      >
                        Quitar
                      </button>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={isSubmitting}
                      onClick={() => form.nonRealizationEvidenceRef.current?.click()}
                    >
                      <Camera className="h-4 w-4" />
                      Adjuntar evidencia
                    </Button>
                  )}
                </div>
              )}
              <Input
                id="eo-non-realization-note"
                label="Cuéntanos qué pasó"
                value={form.nonRealizationNote}
                disabled={isSubmitting}
                onChange={(event) => form.setNonRealizationNote(event.target.value)}
                placeholder="Una línea ayuda a la reclasificación..."
              />
            </div>
          )}
          {form.isNotExecuted && (!nonRealizationCauses || nonRealizationCauses.length === 0) && (
            <PortalAlert
              variant="warning"
              title="Causas no disponibles"
              description="El catálogo de causas aún no está disponible. Consulta al coordinador para registrar este caso."
            />
          )}
          <Input
            id="eo-close-summary"
            label="Resumen de cierre"
            value={form.closeSummary}
            disabled={isSubmitting}
            onChange={(event) => form.setCloseSummary(event.target.value)}
            placeholder="Describe el resultado final del trabajo..."
            requiredIndicator
          />

          <fieldset className="space-y-3 rounded-xl border border-dashed border-gray-300 p-3 dark:border-dark-border">
            <legend className="px-1 text-sm font-medium text-gray-700 dark:text-gray-200">
              Aceptación del cliente{' '}
              {form.customerAcceptanceRequired ? '(obligatoria)' : '(opcional)'}
            </legend>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Selecciona una firma del cliente disponible y validada en esta orden.
            </p>
            <Select
              id="eo-customer-acceptance-artifact"
              label="Referencia de evidencia"
              value={form.customerAcceptanceArtifactId}
              options={form.customerAcceptanceEvidenceOptions}
              placeholder="Selecciona una firma disponible"
              disabled={isSubmitting || form.customerAcceptanceEvidenceOptions.length === 0}
              required={form.customerAcceptanceRequired}
              {...(form.customerAcceptanceEvidenceOptions.length === 0
                ? {
                    helperText:
                      'No hay una firma de cliente disponible y validada. Carga la evidencia de firma del cliente antes de cerrar.',
                  }
                : {})}
              onChange={(event) => form.setCustomerAcceptanceArtifactId(event.target.value)}
            />
            <Select
              id="eo-customer-acceptance-method"
              label="Forma de aceptación"
              value={form.customerAcceptanceMethod}
              placeholder="Selecciona una forma"
              options={form.customerAcceptanceMethodOptions}
              disabled={isSubmitting}
              onChange={(event) =>
                form.setCustomerAcceptanceMethod(
                  event.target.value as typeof form.customerAcceptanceMethod,
                )
              }
            />
            {form.customerAcceptanceIncomplete && (
              <p className="text-xs text-amber-800 dark:text-amber-200" role="alert">
                Completa la referencia y la forma de aceptación para enviarlas.
              </p>
            )}
          </fieldset>

          {/* Requisitos incompletos */}
          {template && !completion.isComplete && (
            <PortalAlert
              variant="warning"
              title="Requisitos pendientes"
              description={`Aún faltan requisitos de la plantilla. Progreso actual: ${completion.label}`}
            />
          )}

          {!form.closeConfirmOpen ? (
            <Button
              type="button"
              disabled={
                isSubmitting ||
                form.closeSummary.trim().length === 0 ||
                form.customerAcceptanceIncomplete ||
                !form.nonRealizationCanConfirm
              }
              onClick={() => {
                form.setCloseValidationError(null);
                if (!form.nonRealizationCanConfirm) {
                  form.setCloseValidationError('Elige una causa para cerrar como no ejecutada.');
                  return;
                }
                form.setCloseConfirmOpen(true);
              }}
            >
              Cerrar OT
            </Button>
          ) : (
            <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-900/20">
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                Confirmar cierre
              </p>
              <p className="mt-1 text-xs text-yellow-700 dark:text-yellow-300">
                Esta acción es definitiva. No podrás editar la OT después del cierre.
              </p>
              {form.closeValidationError && (
                <p className="mt-2 text-xs font-medium text-red-800 dark:text-red-200" role="alert">
                  {form.closeValidationError}
                </p>
              )}
              <div className="mt-3 flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="softDestructive"
                  disabled={isSubmitting}
                  onClick={form.handleCloseConfirm}
                >
                  Confirmar cierre
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={isSubmitting}
                  onClick={() => form.setCloseConfirmOpen(false)}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-3">
          {template === null ? (
            <PortalAlert
              variant="error"
              title="Plantilla no disponible"
              description="No es posible validar los requisitos de cierre. La orden permanece abierta hasta recuperar la versión asignada."
            />
          ) : (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {offline ? 'Sin conexión.' : 'No puedes cerrar esta orden.'}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
