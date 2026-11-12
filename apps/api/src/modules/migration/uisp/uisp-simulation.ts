import {
  DocumentTypeParty,
  MIGRATION_EXTERNAL_ID_PREFIX,
  normalizeDocumentNumber,
  type MigrationBatchCounts,
  type MigrationBatchRejections,
  type MigrationEntity,
  type MigrationFileRejectionReason,
  type MigrationMappingAction,
  type MigrationMappingKind,
  type MigrationObservation,
  type MigrationPendingValue,
  type MigrationRejectionReason,
} from '@iwana/shared';
import type { ParseUispResult, ParsedUispPackage, UispClient } from './uisp-parser';
import { titularPersonFields } from './uisp-titular-required';

/**
 * Validación y armado de la simulación (ADR-110 D2, D4, D11; spec §3.2).
 *
 * Función pura: recibe los paquetes leídos y los hechos ya consultados (equivalencias,
 * titulares existentes por HMAC, `external_id` anonimizados o ya importados) y devuelve los
 * registros para las intermedias más el informe por entidad y motivo, sin PII.
 *
 * Reglas:
 * - Sin equivalencia (plan, método de pago, ciclo, etiqueta) → rechazo con motivo; nunca se
 *   inventa (D4). Los valores faltantes salen en `pendientesEquivalencia`.
 * - Documento ausente o con formato inválido → observación `DATOS_FISCALES_INCOMPLETOS`.
 * - Titular sin los datos que CRM exige (`chk_subscriber_person_fields`; regla compartida con
 *   la promoción) → `DATOS_OBLIGATORIOS_AUSENTES`, salvo que ya esté importado.
 * - Ciclo con equivalencia cuyo día no está activo en CRM → `CICLO_SIN_EQUIVALENCIA`.
 * - Coordenadas fuera de Colombia → se descartan; observación y cola de datos incompletos.
 * - HMAC del documento ya presente → `TITULAR_EXISTENTE` (conflicto, nunca fusión, D11).
 * - `external_id` de un titular anonimizado → `TITULAR_ANONIMIZADO`.
 * - Estrato → entra pendiente de evidencia; no fija IVA (ADR-093).
 * - Tickets: tareas referenciadas que no viajan en `jobs.json` se cuentan.
 * - Los registros de un titular rechazado se rechazan con `DEPENDE_DE_TITULAR_RECHAZADO`
 *   salvo que tengan un motivo propio.
 */
export type MappingIndex = Map<MigrationMappingKind, Map<string, MigrationMappingAction>>;

export interface TitularLookupFacts {
  existingHmacs: ReadonlySet<string>;
  anonymizedExternalIds: ReadonlySet<string>;
  importedExternalIds: ReadonlySet<string>;
}

export interface SimulationContext extends TitularLookupFacts {
  mappings: MappingIndex;
  hmacOf: (normalizedDocument: string) => string;
  /**
   * Ciclos de facturación: día destino de cada equivalencia `CICLO` (`target_ref`) y días
   * activos en CRM. Si se omiten, solo se valida que la equivalencia exista.
   */
  cycles?: {
    targetDayOf: ReadonlyMap<string, number | null>;
    activeDays: ReadonlySet<number>;
  };
}

export interface StagedRecord {
  entity: MigrationEntity;
  externalId: string;
  status: 'VALIDO' | 'RECHAZADO';
  reason: MigrationRejectionReason | null;
  /** Carga útil para la promoción; se cifra antes de persistir. */
  payload: Record<string, unknown>;
}

export interface SimulationResult {
  records: StagedRecord[];
  counts: MigrationBatchCounts;
  rejections: MigrationBatchRejections;
}

export interface TitularFacts {
  documentType: 'CC' | 'NIT';
  documentNumber: string | null;
  stratum: number | null;
}

const SAFE_ID = /^[A-Za-z0-9._-]{1,64}$/u;
const COLOMBIA_BOUNDS = { minLat: -4.3, maxLat: 13.6, minLon: -82.0, maxLon: -66.8 };
const DOCUMENT_KEY = /c[eé]dula|documento|identificaci[oó]n|^nit$|\bnit\b/iu;
const STRATUM_KEY = /estrato/iu;

export function externalIdOf(entity: MigrationEntity, id: string): string {
  return `uisp:${MIGRATION_EXTERNAL_ID_PREFIX[entity]}:${id}`;
}

function safeId(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return SAFE_ID.test(text) ? text : null;
}

function attributeValue(client: UispClient, key: RegExp): string | null {
  for (const attribute of client.attributes ?? []) {
    const label = `${attribute.key ?? ''} ${attribute.name ?? ''}`.trim();
    if (key.test(label) && attribute.value !== null && attribute.value !== undefined) {
      const text = String(attribute.value).trim();
      if (text) return text;
    }
  }
  return null;
}

/** Documento y estrato del titular desde los atributos de UISP (spec §3.2). */
export function extractTitularFacts(client: UispClient): TitularFacts {
  const documentType = client.clientType === 2 ? 'NIT' : 'CC';
  const raw = attributeValue(client, DOCUMENT_KEY);
  let documentNumber: string | null = null;
  if (raw) {
    // NIT con dígito de verificación: «900123456-7» → base de 9 dígitos.
    const withDv = /^\s*([\d.\s]+)-\s*\d\s*$/u.exec(raw);
    const base = documentType === 'NIT' && withDv ? withDv[1]! : raw;
    if (!/[^\d.\s-]/u.test(base)) {
      const normalized = normalizeDocumentNumber(
        documentType === 'NIT' ? DocumentTypeParty.NIT : DocumentTypeParty.CC,
        base,
      );
      const valid =
        documentType === 'NIT'
          ? /^\d{9,10}$/u.test(normalized)
          : /^\d{5,10}$/u.test(normalized) && !/^0+$/u.test(normalized);
      documentNumber = valid ? normalized : null;
    }
  }
  const stratumRaw = attributeValue(client, STRATUM_KEY);
  const stratum = stratumRaw && /^[1-6]$/u.test(stratumRaw) ? Number(stratumRaw) : null;
  return { documentType, documentNumber, stratum };
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

/** `null` si no hay coordenadas; `true`/`false` según caigan dentro de Colombia. */
export function coordinatesInColombia(lat: unknown, lon: unknown): boolean | null {
  const latitude = toNumber(lat);
  const longitude = toNumber(lon);
  if (latitude === null || longitude === null) return null;
  return (
    latitude >= COLOMBIA_BOUNDS.minLat &&
    latitude <= COLOMBIA_BOUNDS.maxLat &&
    longitude >= COLOMBIA_BOUNDS.minLon &&
    longitude <= COLOMBIA_BOUNDS.maxLon
  );
}

/** Documentos normalizados de los titulares con documento válido (para calcular HMAC). */
export function collectTitularKeys(results: ParseUispResult[]): {
  documents: string[];
  externalIds: string[];
} {
  const documents = new Set<string>();
  const externalIds = new Set<string>();
  for (const result of results) {
    if (!result.ok) continue;
    const id = safeId(result.value.client.id);
    if (id) externalIds.add(externalIdOf('SUSCRIPTOR', id));
    const facts = extractTitularFacts(result.value.client);
    if (facts.documentNumber) documents.add(facts.documentNumber);
  }
  return { documents: [...documents], externalIds: [...externalIds] };
}

class SimulationAccumulator {
  readonly records: StagedRecord[] = [];
  readonly counts: MigrationBatchCounts;
  readonly rejections: MigrationBatchRejections = {};
  private readonly seen = new Set<string>();
  private readonly pending = new Map<string, MigrationPendingValue>();

  constructor(filesReceived: number) {
    this.counts = {
      procesamiento: 'COMPLETADO',
      archivos: { recibidos: filesReceived, leidos: 0, rechazados: {} },
      entidades: {},
      observaciones: {},
      tareasSinFuente: 0,
      pendientesEquivalencia: [],
      procesadoEn: new Date().toISOString(),
    };
  }

  rejectFile(reason: MigrationFileRejectionReason): void {
    const rejected = this.counts.archivos.rechazados;
    rejected[reason] = (rejected[reason] ?? 0) + 1;
  }

  observe(observation: MigrationObservation, amount = 1): void {
    this.counts.observaciones[observation] = (this.counts.observaciones[observation] ?? 0) + amount;
  }

  pendingValue(kind: MigrationMappingKind, value: string, label: string | null): void {
    const key = `${kind}\u0000${value}`;
    const current = this.pending.get(key);
    if (current) {
      current.occurrences += 1;
      if (!current.externalLabel && label) current.externalLabel = label;
    } else {
      this.pending.set(key, {
        kind,
        externalValue: value.slice(0, 120),
        externalLabel: label ? label.slice(0, 120) : null,
        occurrences: 1,
      });
    }
  }

  hasExternalId(entity: MigrationEntity, externalId: string): boolean {
    return this.seen.has(`${entity}\u0000${externalId}`);
  }

  add(
    entity: MigrationEntity,
    externalId: string,
    reason: MigrationRejectionReason | null,
    payload: Record<string, unknown>,
  ): void {
    const counts = (this.counts.entidades[entity] ??= { leidos: 0, validos: 0, rechazados: 0 });
    counts.leidos += 1;
    const key = `${entity}\u0000${externalId}`;
    if (this.seen.has(key)) {
      // La restricción única del lote impide guardar el duplicado: solo cuenta.
      counts.rechazados += 1;
      this.bumpRejection(entity, 'EXTERNAL_ID_DUPLICADO');
      return;
    }
    this.seen.add(key);
    if (reason) {
      counts.rechazados += 1;
      this.bumpRejection(entity, reason);
    } else {
      counts.validos += 1;
    }
    this.records.push({
      entity,
      externalId,
      status: reason ? 'RECHAZADO' : 'VALIDO',
      reason,
      payload,
    });
  }

  private bumpRejection(entity: MigrationEntity, reason: MigrationRejectionReason): void {
    const byReason = (this.rejections[entity] ??= {});
    byReason[reason] = (byReason[reason] ?? 0) + 1;
  }

  finish(): SimulationResult {
    this.counts.pendientesEquivalencia = [...this.pending.values()].sort(
      (a, b) => a.kind.localeCompare(b.kind) || a.externalValue.localeCompare(b.externalValue),
    );
    return { records: this.records, counts: this.counts, rejections: this.rejections };
  }
}

function hasMapping(ctx: SimulationContext, kind: MigrationMappingKind, value: string): boolean {
  return ctx.mappings.get(kind)?.has(value) ?? false;
}

function simulatePackage(
  pkg: ParsedUispPackage,
  fileIndex: number,
  ctx: SimulationContext,
  acc: SimulationAccumulator,
): void {
  const clientId = safeId(pkg.client.id);
  if (!clientId) {
    acc.rejectFile('CLIENTE_AUSENTE');
    return;
  }
  const clientExternalId = externalIdOf('SUSCRIPTOR', clientId);
  if (acc.hasExternalId('SUSCRIPTOR', clientExternalId)) {
    acc.rejectFile('CLIENTE_REPETIDO');
    return;
  }
  acc.counts.archivos.leidos += 1;
  const source = { fileIndex };

  // ── Titular ──
  const facts = extractTitularFacts(pkg.client);
  const queues: string[] = [];
  let titularReason: MigrationRejectionReason | null = null;
  if (ctx.anonymizedExternalIds.has(clientExternalId)) {
    titularReason = 'TITULAR_ANONIMIZADO';
  } else if (facts.documentNumber && ctx.existingHmacs.has(ctx.hmacOf(facts.documentNumber))) {
    titularReason = ctx.importedExternalIds.has(clientExternalId) ? null : 'TITULAR_EXISTENTE';
  }
  const alreadyImported = ctx.importedExternalIds.has(clientExternalId);
  if (alreadyImported) acc.observe('YA_IMPORTADO');
  if (
    !alreadyImported &&
    !titularPersonFields(pkg.client as unknown as Record<string, unknown>, facts).complete
  ) {
    titularReason ??= 'DATOS_OBLIGATORIOS_AUSENTES';
  }
  if (!facts.documentNumber) {
    acc.observe('DATOS_FISCALES_INCOMPLETOS');
    queues.push('DATOS_FISCALES_INCOMPLETOS');
  }
  const clientInColombia = coordinatesInColombia(
    pkg.client.addressGpsLat,
    pkg.client.addressGpsLon,
  );
  if (clientInColombia === false) {
    acc.observe('COORDENADAS_FUERA_DE_COLOMBIA');
    queues.push('DATOS_INCOMPLETOS');
  }
  if (facts.stratum !== null) acc.observe('ESTRATO_PENDIENTE_EVIDENCIA');
  const tagRefs: string[] = [];
  for (const tag of pkg.client.tags ?? []) {
    const tagId = String(tag.id);
    tagRefs.push(tagId);
    if (!hasMapping(ctx, 'ETIQUETA', tagId)) {
      acc.pendingValue('ETIQUETA', tagId, tag.name ?? null);
      titularReason ??= 'ETIQUETA_SIN_EQUIVALENCIA';
    }
  }
  acc.add('SUSCRIPTOR', clientExternalId, titularReason, {
    source,
    raw: pkg.client,
    derived: {
      documentType: facts.documentType,
      documentNumber: facts.documentNumber,
      stratum: facts.stratum === null ? null : { value: facts.stratum, evidence: 'PENDIENTE' },
      coordinatesDiscarded: clientInColombia === false,
      queues,
      tagRefs,
    },
  });
  const dependency: MigrationRejectionReason | null = titularReason
    ? 'DEPENDE_DE_TITULAR_RECHAZADO'
    : null;

  const belongs = (value: unknown): boolean =>
    value === null || value === undefined || String(value) === clientId;

  // ── Servicios → contratos ──
  for (const { record, index } of pkg.services) {
    const id = safeId(record?.id) ?? `sin-id-${fileIndex}-${index}`;
    let reason: MigrationRejectionReason | null = null;
    if (!record || !safeId(record.id) || !belongs(record.clientId)) reason = 'DATOS_INVALIDOS';
    let coordinatesDiscarded = false;
    if (record) {
      const plan = record.servicePlanId;
      if (plan === null || plan === undefined) {
        reason ??= 'DATOS_INVALIDOS';
      } else if (!hasMapping(ctx, 'PLAN', String(plan))) {
        acc.pendingValue('PLAN', String(plan), record.servicePlanName ?? record.name ?? null);
        reason ??= 'PLAN_SIN_EQUIVALENCIA';
      }
      const day = record.invoicingPeriodStartDay;
      if (day !== null && day !== undefined) {
        if (!hasMapping(ctx, 'CICLO', String(day))) {
          acc.pendingValue('CICLO', String(day), null);
          reason ??= 'CICLO_SIN_EQUIVALENCIA';
        } else if (ctx.cycles) {
          // Misma condición que la promoción: destino presente y ciclo activo en CRM.
          const target = ctx.cycles.targetDayOf.get(String(day)) ?? null;
          if (target === null || !ctx.cycles.activeDays.has(target)) {
            reason ??= 'CICLO_SIN_EQUIVALENCIA';
          }
        }
      }
      if (coordinatesInColombia(record.addressGpsLat, record.addressGpsLon) === false) {
        coordinatesDiscarded = true;
        acc.observe('COORDENADAS_FUERA_DE_COLOMBIA');
      }
    }
    acc.add('CONTRATO', externalIdOf('CONTRATO', id), reason ?? dependency, {
      source: { ...source, index },
      raw: record,
      derived: { clientExternalId, coordinatesDiscarded },
    });
  }

  // ── Facturas → documentos de cobro históricos ──
  for (const { record, index, pdfPath } of pkg.invoices) {
    const id = safeId(record?.id) ?? `sin-id-${fileIndex}-${index}`;
    const invalid = !record || !safeId(record.id) || !belongs(record.clientId);
    if (record && !pdfPath) acc.observe('FACTURA_SIN_PDF');
    acc.add(
      'DOCUMENTO_COBRO',
      externalIdOf('DOCUMENTO_COBRO', id),
      invalid ? 'DATOS_INVALIDOS' : dependency,
      {
        source: { ...source, index, pdfPath },
        raw: record,
        derived: { clientExternalId },
      },
    );
  }

  // ── Pagos ──
  for (const { record, index } of pkg.payments) {
    const id = safeId(record?.id) ?? `sin-id-${fileIndex}-${index}`;
    let reason: MigrationRejectionReason | null = null;
    if (!record || !safeId(record.id) || !belongs(record.clientId)) reason = 'DATOS_INVALIDOS';
    if (record) {
      const method = record.methodId;
      if (!method) {
        reason ??= 'DATOS_INVALIDOS';
      } else if (!hasMapping(ctx, 'METODO_PAGO', method)) {
        acc.pendingValue('METODO_PAGO', method, null);
        reason ??= 'METODO_PAGO_SIN_EQUIVALENCIA';
      }
    }
    acc.add('PAGO', externalIdOf('PAGO', id), reason ?? dependency, {
      source: { ...source, index },
      raw: record,
      derived: { clientExternalId },
    });
  }

  // ── Tickets ──
  for (const { record, index, attachmentPaths } of pkg.tickets) {
    const id = safeId(record?.id) ?? `sin-id-${fileIndex}-${index}`;
    const invalid = !record || !safeId(record.id) || !belongs(record.clientId);
    const missingJobs = (record?.assignedJobIds ?? []).filter(
      (jobId) => !pkg.jobIds.has(String(jobId)),
    ).length;
    if (missingJobs > 0) {
      acc.observe('TAREAS_SIN_FUENTE');
      acc.counts.tareasSinFuente += missingJobs;
    }
    acc.add('TICKET', externalIdOf('TICKET', id), invalid ? 'DATOS_INVALIDOS' : dependency, {
      source: { ...source, index, attachmentPaths },
      raw: record,
      derived: { clientExternalId, tasksWithoutSource: missingJobs },
    });
  }

  // ── Documentos: código estable por contenido, nunca el nombre del archivo ──
  for (const document of pkg.documents) {
    const code = `${clientId}-${document.sha256.slice(0, 24)}`.slice(0, 64);
    acc.add('SOPORTE_DOCUMENTAL', externalIdOf('SOPORTE_DOCUMENTAL', code), dependency, {
      source: { ...source, path: document.path },
      raw: null,
      derived: {
        clientExternalId,
        sha256: document.sha256,
        sizeBytes: document.sizeBytes,
        origin: 'IMPORTADO',
      },
    });
  }
}

/**
 * Simula el lote completo. `results[i]` corresponde al ZIP `i` (posición de subida); un
 * resultado fallido cuenta como archivo rechazado con su motivo.
 */
export function simulateBatch(
  results: Array<ParseUispResult>,
  ctx: SimulationContext,
): SimulationResult {
  const acc = new SimulationAccumulator(results.length);
  results.forEach((result, fileIndex) => {
    if (!result.ok) {
      acc.rejectFile(result.reason);
      return;
    }
    simulatePackage(result.value, fileIndex, ctx, acc);
  });
  return acc.finish();
}

/** Índice de equivalencias por tipo y valor externo. */
export function buildMappingIndex(
  rows: Array<{
    kind: MigrationMappingKind;
    externalValue: string;
    action: MigrationMappingAction;
  }>,
): MappingIndex {
  const index: MappingIndex = new Map();
  for (const row of rows) {
    const byKind = index.get(row.kind) ?? new Map<string, MigrationMappingAction>();
    byKind.set(row.externalValue, row.action);
    index.set(row.kind, byKind);
  }
  return index;
}
