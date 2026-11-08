import { AssuranceTitularErasureParticipant } from '../../assurance/privacy/assurance-titular-erasure.participant';
import { NetworkTitularErasureParticipant } from '../../network/privacy/network-titular-erasure.participant';
import { SupplierProfileReadAdapter } from '../../inventory/privacy/supplier-profile-read.adapter';
import { erasureSupplierProfile } from '../../privacy/requests/erasure-errors';
import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ErasureBlocker, ErasureCategory } from '@iwana/shared';
import { QueryFailedError, type EntityManager, type QueryRunner } from 'typeorm';
import { summarizeErrorForLog } from '@iwana/db';
import {
  IPersonalDataErasurePort,
  type PersonalDataErasurePlan,
  type PersonalDataErasureTarget,
} from '../../privacy/ports/personal-data-erasure.port';
import { MediaTitularErasureParticipant } from '../../media/privacy/media-titular-erasure.participant';
import { PartyTitularErasureParticipant } from '../../parties/privacy/party-titular-erasure.participant';
import { UserAccountErasureParticipant } from '../../users/privacy/user-account-erasure.participant';
import { CrmTitularErasureParticipant } from './titular-erasure/crm-titular-erasure.participant';
import { WfmTitularErasureParticipant } from '../../wfm/privacy/wfm-titular-erasure.participant';
import { ExecutionOrderTitularErasureParticipant } from '../../tasks/privacy/execution-order-titular-erasure.participant';
import { OperationalTaskTitularErasureParticipant } from '../../tasks/privacy/operational-task-titular-erasure.participant';
import { BillingTitularErasureParticipant } from '../../billing/privacy/billing-titular-erasure.participant';
import {
  columnOf,
  readTenantColumns,
  tableExists,
  type ErasureKeys,
  type TenantColumn,
} from './titular-erasure/titular-erasure-sql';
import type {
  TitularErasureParticipant,
  TitularErasureScope,
  TitularErasureTableResult,
} from './titular-erasure/titular-erasure.types';

const CATEGORIES = [
  'IDENTIFICACION',
  'CONTACTO',
  'UBICACION',
  'FISCAL',
  'COMERCIAL',
  'EVIDENCIA_CONSENTIMIENTO',
  'CUENTA_USUARIO',
  'EVIDENCIA_DOCUMENTAL',
  'OPERACION_CAMPO',
] as const satisfies readonly ErasureCategory[];

/**
 * SQLSTATE que delatan una deriva entre el SQL de un participante y el esquema
 * tenant (tabla o columna ausente, literal fuera del enum, tipos incompatibles).
 * Son fallos esperables del alcance: se responden con código de dominio y no
 * como 500 genérico.
 */
const PARTICIPANT_SCHEMA_SQLSTATES = new Set(['42P01', '42703', '22P02', '42883', '42804']);

type ParticipantPhase = 'resolveScope' | 'plan' | 'apply';

interface NamedParticipant {
  name: string;
  participant: TitularErasureParticipant;
}

interface ResolvedScope {
  scope: TitularErasureScope;
  candidateExpedienteIds: string[];
  blockers: ErasureBlocker[];
  results: TitularErasureTableResult[];
}

@Injectable()
export class CrmPersonalDataErasureAdapter extends IPersonalDataErasurePort {
  private readonly logger = new Logger(CrmPersonalDataErasureAdapter.name);
  private readonly participants: readonly NamedParticipant[];
  private readonly assurance: AssuranceTitularErasureParticipant;
  private readonly network: NetworkTitularErasureParticipant;
  private readonly suppliers: SupplierProfileReadAdapter;

  constructor(
    private readonly crm: CrmTitularErasureParticipant,
    private readonly party: PartyTitularErasureParticipant,
    private readonly users: UserAccountErasureParticipant,
    private readonly wfm: WfmTitularErasureParticipant,
    private readonly executionOrders: ExecutionOrderTitularErasureParticipant,
    private readonly operationalTasks: OperationalTaskTitularErasureParticipant,
    private readonly media: MediaTitularErasureParticipant,
    @Optional()
    @Inject(BillingTitularErasureParticipant)
    private readonly billing?: BillingTitularErasureParticipant,
    @Optional()
    @Inject(AssuranceTitularErasureParticipant)
    assurance?: AssuranceTitularErasureParticipant,
    @Optional()
    @Inject(NetworkTitularErasureParticipant)
    network?: NetworkTitularErasureParticipant,
    @Optional()
    @Inject(SupplierProfileReadAdapter)
    suppliers?: SupplierProfileReadAdapter,
  ) {
    super();
    // Sin valores por defecto: un cableado olvidado fallaba en silencio con
    // participantes creados con un ConfigService vacío. Falla cerrado aquí.
    if (!assurance || !network || !suppliers) {
      throw new Error(
        'CrmPersonalDataErasureAdapter exige assurance, network y suppliers; registra sus módulos.',
      );
    }
    this.assurance = assurance;
    this.network = network;
    this.suppliers = suppliers;
    this.participants = [
      { name: 'crm', participant: crm },
      { name: 'party', participant: party },
      { name: 'users', participant: users },
      { name: 'assurance', participant: assurance },
      { name: 'wfm', participant: wfm },
      { name: 'execution-orders', participant: executionOrders },
      { name: 'operational-tasks', participant: operationalTasks },
      { name: 'network', participant: network },
      { name: 'media', participant: media },
      ...(billing ? [{ name: 'billing', participant: billing }] : []),
    ];
  }

  async plan(
    target: PersonalDataErasureTarget,
    ctx: { manager: EntityManager },
  ): Promise<PersonalDataErasurePlan> {
    this.assertBillingParticipantRegistered();
    const qr = this.requireTransaction(ctx.manager);
    const resolved = await this.resolve(target, qr);
    const counts = Object.fromEntries(CATEGORIES.map((category) => [category, 0])) as Record<
      ErasureCategory,
      number
    >;
    for (const result of resolved.results) counts[result.category] += result.selected;
    return {
      candidateExpedienteIds: resolved.candidateExpedienteIds,
      blockers: resolved.blockers.filter(
        (
          blocker,
        ): blocker is Extract<
          ErasureBlocker,
          'UNRECONCILED_TITULAR' | 'ACTIVE_USER_ACCOUNT' | 'SUPPLIER_PROFILE_LINKED'
        > =>
          blocker === 'UNRECONCILED_TITULAR' ||
          blocker === 'ACTIVE_USER_ACCOUNT' ||
          blocker === 'SUPPLIER_PROFILE_LINKED',
      ),
      counts,
    };
  }

  async anonymize(
    input: PersonalDataErasureTarget & { expedienteIds: string[]; actorId: string },
    ctx: { manager: EntityManager },
  ): Promise<{ categories: ErasureCategory[]; changedRows: number }> {
    this.assertBillingParticipantRegistered();
    const qr = this.requireTransaction(ctx.manager);
    await qr.query(`SELECT set_config('iwana.titular_erasure', 'on', true)`);
    const resolved = await this.resolve(input, qr);
    if (!this.sameSet(input.expedienteIds, resolved.candidateExpedienteIds)) {
      throw new ConflictException({
        code: 'PRIVACY_ERASURE_CANDIDATES_CHANGED',
        message: 'Los expedientes del titular cambiaron; actualiza la vista previa.',
      });
    }
    if (resolved.blockers.includes('ACTIVE_USER_ACCOUNT')) {
      throw new ConflictException({
        code: 'PRIVACY_ERASURE_ACTIVE_ACCOUNT',
        message: 'Una cuenta enlazada debe darse de baja antes de suprimir los datos.',
      });
    }
    if (resolved.blockers.includes('UNRECONCILED_TITULAR')) {
      throw new ConflictException({
        code: 'PRIVACY_ERASURE_UNRECONCILED_TITULAR',
        message: 'El titular debe conciliarse antes de suprimir los datos.',
      });
    }

    if (resolved.blockers.includes('SUPPLIER_PROFILE_LINKED')) throw erasureSupplierProfile();

    const applied: TitularErasureTableResult[] = [];
    for (const entry of this.participants) {
      applied.push(
        ...(await this.runParticipant(entry, 'apply', () =>
          entry.participant.apply(resolved.scope, qr, 'apply'),
        )),
      );
    }
    const residual = applied.reduce((sum, result) => sum + result.residual, 0);
    if (residual > 0) {
      throw new ConflictException({
        code: 'PRIVACY_ERASURE_VERIFICATION_FAILED',
        message: 'La verificación de anonimización no se completó; no se aplicaron cambios.',
      });
    }
    const changedByTable = new Map<string, number>();
    const categories = new Set<ErasureCategory>();
    for (const result of applied) {
      changedByTable.set(
        result.table,
        Math.max(changedByTable.get(result.table) ?? 0, result.changed),
      );
      if (result.changed > 0) categories.add(result.category);
    }
    return {
      categories: [...categories],
      changedRows: [...changedByTable.values()].reduce((sum, changed) => sum + changed, 0),
    };
  }

  /** Entrada común al CLI de emergencia: las mismas instancias y reglas se usan sin Nest. */
  async applyScope(
    scope: TitularErasureScope,
    qr: QueryRunner,
    mode: 'dry-run' | 'apply',
  ): Promise<TitularErasureTableResult[]> {
    this.assertBillingParticipantRegistered();
    await this.resolveParticipants(scope, qr);
    if (mode === 'apply') {
      if (scope.partyId && (await this.suppliers.hasSupplierProfile(scope.partyId, qr)))
        throw erasureSupplierProfile();
      const active = await this.users.activeAccountCount(scope.userIds, qr);
      if (active > 0) {
        throw new Error(`Hay ${active} cuenta(s) enlazada(s) activa(s); no se aplicaron cambios.`);
      }
    }
    const results: TitularErasureTableResult[] = [];
    for (const { participant } of this.participants) {
      results.push(...(await participant.apply(scope, qr, mode)));
    }
    return results;
  }

  async resolveCliScope(
    target: PersonalDataErasureTarget,
    expedienteIds: string[],
    qr: QueryRunner,
    tenantSchema: string,
    cryptoKeys: ErasureKeys,
  ): Promise<TitularErasureScope> {
    this.assertBillingParticipantRegistered();
    const columns = await readTenantColumns(qr);
    const explicitExpedienteIds = [...new Set(expedienteIds.map((id) => id.toLowerCase()))];
    const markedExpedienteIds = await this.findExpedienteIdsByAnonymizedRequest(
      qr,
      columns,
      target.requestId,
    );
    const mergedExpedienteIds = [
      ...new Set([...explicitExpedienteIds, ...markedExpedienteIds]),
    ].sort();
    const byPartySubscriberIds = await this.crm.findSubscriberIds(qr, target.partyId);
    const markedSubscriberIds = await this.findSubscriberIdsByAnonymizedRequest(
      qr,
      columns,
      target.requestId,
    );
    const subscriberIds = [...new Set([...byPartySubscriberIds, ...markedSubscriberIds])].sort();
    const userIds = await this.users.findUserIds(
      {
        partyId: target.partyId,
        subscriberIds,
        expedienteIds: mergedExpedienteIds,
        userIds: [],
      },
      qr,
    );
    return {
      partyId: target.partyId,
      subscriberIds,
      expedienteIds: mergedExpedienteIds,
      userIds,
      requestId: target.requestId,
      requesterDocumentHmac: target.requesterDocumentHmac,
      tenantSchema,
      cryptoKeys,
    };
  }

  /**
   * Remediación por solicitud (R2): un `--apply --request` sobre una solicitud
   * ya resuelta vuelve a seleccionar los expedientes que esa solicitud marcó,
   * sin exigir `--expediente`. Solo lee marcas; no cambia el comportamiento API.
   */
  private async findExpedienteIdsByAnonymizedRequest(
    qr: QueryRunner,
    columns: Map<string, TenantColumn>,
    requestId: string,
  ): Promise<string[]> {
    if (!requestId) return [];
    if (
      !tableExists(columns, 'expediente_records') ||
      !columnOf(columns, 'expediente_records', 'anonymized_request_id')
    ) {
      return [];
    }
    const rows = (await qr.query(
      `SELECT id::text AS id FROM expediente_records
         WHERE anonymized_request_id = $1::uuid ORDER BY id::text FOR SHARE`,
      [requestId],
    )) as Array<{ id: string }>;
    return [...new Set(rows.map((row) => String(row.id).toLowerCase()))];
  }

  /** Igual que expedientes: suscriptores ya marcados por esta solicitud. */
  private async findSubscriberIdsByAnonymizedRequest(
    qr: QueryRunner,
    columns: Map<string, TenantColumn>,
    requestId: string,
  ): Promise<string[]> {
    if (!requestId) return [];
    if (
      !tableExists(columns, 'subscribers') ||
      !columnOf(columns, 'subscribers', 'anonymized_request_id')
    ) {
      return [];
    }
    const rows = (await qr.query(
      `SELECT id::text AS id FROM subscribers
         WHERE anonymized_request_id = $1::uuid ORDER BY id::text FOR SHARE`,
      [requestId],
    )) as Array<{ id: string }>;
    return [...new Set(rows.map((row) => String(row.id).toLowerCase()))];
  }

  private async resolve(
    target: PersonalDataErasureTarget,
    qr: QueryRunner,
  ): Promise<ResolvedScope> {
    const columns = await readTenantColumns(qr);
    const candidateExpedienteIds = target.requesterDocumentHmac
      ? await this.crm.findExpedienteIdsByDocumentHmac(qr, target.requesterDocumentHmac)
      : [];
    const subscriberIds = await this.crm.findSubscriberIds(qr, target.partyId);
    const preliminary: TitularErasureScope = {
      partyId: target.partyId,
      subscriberIds,
      expedienteIds: candidateExpedienteIds,
      userIds: [],
      requestId: target.requestId,
      requesterDocumentHmac: target.requesterDocumentHmac,
    };
    const userIds = await this.users.findUserIds(preliminary, qr);
    const schemaRows = (await qr.query('SELECT current_schema() AS schema_name')) as Array<{
      schema_name: string;
    }>;
    const scope: TitularErasureScope = {
      ...preliminary,
      userIds,
      ...(schemaRows[0]?.schema_name ? { tenantSchema: schemaRows[0].schema_name } : {}),
    };
    const blockers: ErasureBlocker[] = [];
    if (
      !target.partyId &&
      target.requesterDocumentHmac &&
      columns.has('subscribers.document_number_hmac')
    ) {
      const matches = (await qr.query(
        'SELECT COUNT(*)::int AS count FROM subscribers WHERE document_number_hmac = $1',
        [target.requesterDocumentHmac],
      )) as Array<{ count: number }>;
      if ((matches[0]?.count ?? 0) > 0) blockers.push('UNRECONCILED_TITULAR');
    }
    const activeAccountCount = await this.users.activeAccountCount(userIds, qr);
    if (activeAccountCount > 0) blockers.push('ACTIVE_USER_ACCOUNT');
    if (scope.partyId && (await this.suppliers.hasSupplierProfile(scope.partyId, qr)))
      blockers.push('SUPPLIER_PROFILE_LINKED');

    await this.resolveParticipants(scope, qr, true);
    const results: TitularErasureTableResult[] = [];
    for (const entry of this.participants) {
      results.push(
        ...(await this.runParticipant(entry, 'plan', () => entry.participant.plan(scope, qr))),
      );
    }
    return { scope, candidateExpedienteIds, blockers, results };
  }

  private requireTransaction(manager: EntityManager): QueryRunner {
    const qr = manager.queryRunner;
    if (!qr?.isTransactionActive) {
      throw new Error('La anonimización requiere una transacción activa.');
    }
    return qr;
  }

  private assertBillingParticipantRegistered(): void {
    if (this.billing) return;
    throw new ServiceUnavailableException({
      code: 'PRIVACY_ERASURE_PARTICIPANT_UNAVAILABLE',
      message: 'El participante fiscal de supresión no está disponible.',
    });
  }

  /** El CLI conserva el error original (`domainErrors = false`); la API lo traduce. */
  private async resolveParticipants(
    scope: TitularErasureScope,
    qr: QueryRunner,
    domainErrors = false,
  ): Promise<void> {
    for (const entry of this.participants) {
      const resolveScope = entry.participant.resolveScope?.bind(entry.participant);
      if (!resolveScope) continue;
      if (domainErrors) {
        await this.runParticipant(entry, 'resolveScope', () => resolveScope(scope, qr));
      } else {
        await resolveScope(scope, qr);
      }
    }
  }

  /**
   * Ejecuta un paso de un participante. Un fallo de esquema esperable se
   * registra con participante, fase y un resumen sin datos del driver; se
   * responde con un código de dominio. Cualquier otro error se propaga intacto.
   */
  private async runParticipant<T>(
    entry: NamedParticipant,
    phase: ParticipantPhase,
    step: () => Promise<T>,
  ): Promise<T> {
    try {
      return await step();
    } catch (error) {
      const sqlState = this.schemaSqlState(error);
      if (!sqlState) throw error;
      this.logger.error(
        `PRIVACY_ERASURE_PARTICIPANT_UNAVAILABLE participant=${entry.name} phase=${phase} ` +
          summarizeErrorForLog(error),
      );
      throw new ServiceUnavailableException({
        code: 'PRIVACY_ERASURE_PARTICIPANT_UNAVAILABLE',
        message:
          'No se pudo calcular el alcance de la supresión en este momento; no se aplicaron cambios.',
      });
    }
  }

  private schemaSqlState(error: unknown): string | null {
    if (!(error instanceof QueryFailedError)) return null;
    const code = (error.driverError as { code?: unknown } | undefined)?.code;
    return typeof code === 'string' && PARTICIPANT_SCHEMA_SQLSTATES.has(code) ? code : null;
  }

  private sameSet(left: string[], right: string[]): boolean {
    if (left.length !== right.length) return false;
    const sortedRight = [...right].sort();
    return [...left].sort().every((value, index) => value === sortedRight[index]);
  }
}
