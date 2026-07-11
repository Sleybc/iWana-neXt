import { QueryFailedError } from 'typeorm';
import { PartyStatus } from '@iwana/shared';

/**
 * Almacen en memoria multi-schema que MODELA las restricciones reales de Postgres para MOD12
 * Proveedores. Permite ejercitar el servicio + adapter REALES (sin mockear SupplierProfileService)
 * y validar el alta atomica, la reutilizacion por documento, el 409 por unico real y el aislamiento
 * cross-tenant, sin depender de una base de datos viva (el repo no expone harness de DB real).
 *
 * Restricciones modeladas:
 * - party: unico parcial `idx_party_document_active (document_type, document_number)` (deleted_at IS NULL, status != MERGED).
 * - supplier_profiles: unico `uq_supplier_profiles_tenant_party_ref (tenant_id, party_ref_id)`
 *   y `uq_supplier_profiles_tenant_supplier_code (tenant_id, supplier_code)`.
 */

type Row = Record<string, any>;

interface SchemaData {
  party: Row[];
  party_role: Row[];
  party_contact: Row[];
  supplier_profiles: Row[];
  /** Simula una carrera: la proxima insercion de perfil pierde el codigo ante un peer concurrente. */
  concurrentCodeGrabPending: boolean;
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${String(idCounter).padStart(6, '0')}`;
}

function uniqueViolation(constraint: string): QueryFailedError {
  return new QueryFailedError('INSERT', [], { code: '23505', constraint } as never);
}

function collectionFor(entityName: string): keyof SchemaData {
  switch (entityName) {
    case 'Party':
      return 'party';
    case 'PartyRole':
      return 'party_role';
    case 'PartyContact':
      return 'party_contact';
    case 'SupplierProfile':
      return 'supplier_profiles';
    default:
      throw new Error(`Entidad no soportada por el store en memoria: ${entityName}`);
  }
}

export class InMemoryTenantStore {
  private readonly schemas = new Map<string, SchemaData>();

  private schema(schemaName: string): SchemaData {
    let data = this.schemas.get(schemaName);
    if (!data) {
      data = {
        party: [],
        party_role: [],
        party_contact: [],
        supplier_profiles: [],
        concurrentCodeGrabPending: false,
      };
      this.schemas.set(schemaName, data);
    }
    return data;
  }

  /** Precarga un Party con rol SUPPLIER (para pruebas de reutilizacion / aislamiento). */
  seedParty(
    schemaName: string,
    party: {
      id: string;
      partyType: string;
      documentType: string;
      documentNumber: string;
      displayName: string;
      legalName?: string | null;
      status?: PartyStatus;
    },
  ): void {
    this.schema(schemaName).party.push({
      legalName: null,
      status: PartyStatus.ACTIVE,
      deletedAt: null,
      ...party,
    });
  }

  /** Activa una carrera de codigo: la proxima insercion de perfil colisiona una vez y reintenta. */
  injectConcurrentCodeCollisionOnce(schemaName: string): void {
    this.schema(schemaName).concurrentCodeGrabPending = true;
  }

  managerFor(schemaName: string): InMemoryEntityManager {
    return new InMemoryEntityManager(this.schema(schemaName));
  }

  supplierProfiles(schemaName: string): Row[] {
    return this.schema(schemaName).supplier_profiles;
  }

  parties(schemaName: string): Row[] {
    return this.schema(schemaName).party;
  }
}

/** Subconjunto del EntityManager de TypeORM que el servicio + adapter realmente usan. */
export class InMemoryEntityManager {
  constructor(private readonly data: SchemaData) {}

  async transaction<T>(work: (manager: InMemoryEntityManager) => Promise<T>): Promise<T> {
    // Transaccion logica unica: opera sobre el mismo store (misma "conexion").
    return work(this);
  }

  async query(sql: string): Promise<unknown> {
    // SAVEPOINT / RELEASE / ROLLBACK TO SAVEPOINT: el `save` valida ANTES de mutar el estado,
    // por lo que un intento fallido no deja residuo y el savepoint puede ser no-op.
    void sql;
    return [];
  }

  create(entity: { name: string }, payload: Row): Row {
    void entity;
    return { ...payload };
  }

  async save(entity: { name: string }, payload: Row): Promise<Row> {
    const collection = collectionFor(entity.name);

    if (collection === 'party') {
      return this.saveParty(payload);
    }
    if (collection === 'supplier_profiles') {
      return this.saveSupplierProfile(payload);
    }

    // party_role / party_contact: sin unicos relevantes para estas pruebas.
    return this.upsert(this.data[collection] as Row[], payload, entity.name);
  }

  private saveParty(payload: Row): Row {
    if (!payload.id) {
      const duplicate = this.data.party.find(
        (row) =>
          row.documentType === payload.documentType &&
          row.documentNumber === payload.documentNumber &&
          !row.deletedAt &&
          row.status !== 'MERGED',
      );
      if (duplicate) {
        throw uniqueViolation('idx_party_document_active');
      }
    }
    return this.upsert(this.data.party, payload, 'Party');
  }

  private saveSupplierProfile(payload: Row): Row {
    if (this.data.concurrentCodeGrabPending) {
      // Un peer concurrente acaba de tomar este supplier_code: lo persistimos como suyo y
      // hacemos fallar este intento con el unico de codigo (el servicio debe reintentar).
      this.data.concurrentCodeGrabPending = false;
      this.data.supplier_profiles.push({
        id: nextId('peer-sp'),
        tenantId: payload.tenantId,
        partyRefId: nextId('peer-party'),
        supplierCode: payload.supplierCode,
      });
      throw uniqueViolation('uq_supplier_profiles_tenant_supplier_code');
    }

    const byParty = this.data.supplier_profiles.find(
      (row) => row.tenantId === payload.tenantId && row.partyRefId === payload.partyRefId,
    );
    if (byParty) {
      throw uniqueViolation('uq_supplier_profiles_tenant_party_ref');
    }

    const byCode = this.data.supplier_profiles.find(
      (row) => row.tenantId === payload.tenantId && row.supplierCode === payload.supplierCode,
    );
    if (byCode) {
      throw uniqueViolation('uq_supplier_profiles_tenant_supplier_code');
    }

    const now = new Date('2026-07-11T12:00:00.000Z');
    // Mutacion in-place como TypeORM (asigna id/timestamps al objeto guardado).
    payload.id = payload.id ?? nextId('sp');
    payload.createdAt = payload.createdAt ?? now;
    payload.updatedAt = now;
    this.data.supplier_profiles.push(payload);
    return payload;
  }

  private upsert(collection: Row[], payload: Row, prefix: string): Row {
    if (payload.id) {
      const existing = collection.find((row) => row.id === payload.id);
      if (existing) {
        Object.assign(existing, payload);
        return existing;
      }
      collection.push(payload);
      return payload;
    }
    // Mutacion in-place: TypeORM asigna el id generado al objeto pasado a save().
    payload.id = nextId(prefix.toLowerCase());
    collection.push(payload);
    return payload;
  }

  async findOne(entity: { name: string }, options: { where?: Row }): Promise<Row | null> {
    const collection = this.data[collectionFor(entity.name)] as Row[];
    const where = options?.where ?? {};
    return collection.find((row) => this.matches(row, where)) ?? null;
  }

  async find(entity: { name: string }, options?: { where?: Row }): Promise<Row[]> {
    const collection = this.data[collectionFor(entity.name)] as Row[];
    const where = options?.where ?? {};
    return collection.filter((row) => this.matches(row, where));
  }

  private matches(row: Row, where: Row): boolean {
    return Object.entries(where).every(([key, value]) => {
      // `IsNull()` de TypeORM: aproximamos como "campo nulo/ausente".
      if (value && typeof value === 'object' && '_type' in (value as Row)) {
        return row[key] === null || row[key] === undefined;
      }
      return row[key] === value;
    });
  }

  createQueryBuilder(entity: { name: string }, alias: string): InMemoryQueryBuilder {
    return new InMemoryQueryBuilder(this.data[collectionFor(entity.name)] as Row[], alias);
  }
}

/** QueryBuilder minimo: soporta MAX(supplier_code) y el listado paginado por tenant/estado. */
class InMemoryQueryBuilder {
  private tenantId?: string;
  private status?: string;
  private selectMax = false;
  private skipN = 0;
  private takeN = Number.MAX_SAFE_INTEGER;

  constructor(
    private readonly rows: Row[],
    private readonly alias: string,
  ) {}

  select(expression: string): this {
    if (expression.includes('MAX(')) {
      this.selectMax = true;
    }
    return this;
  }

  where(_clause: string, params?: Row): this {
    if (params?.tenantId) {
      this.tenantId = params.tenantId;
    }
    return this;
  }

  andWhere(clause: string | unknown, params?: Row): this {
    if (typeof clause === 'string' && clause.includes('status') && params?.status) {
      this.status = params.status;
    }
    return this;
  }

  orderBy(): this {
    return this;
  }

  skip(n: number): this {
    this.skipN = n;
    return this;
  }

  take(n: number): this {
    this.takeN = n;
    return this;
  }

  private filtered(): Row[] {
    return this.rows.filter(
      (row) =>
        (this.tenantId === undefined || row.tenantId === this.tenantId) &&
        (this.status === undefined || row.status === this.status),
    );
  }

  async getRawOne<T = Row>(): Promise<T> {
    void this.alias;
    const codes = this.filtered()
      .map((row) => row.supplierCode as string | undefined)
      .filter((code): code is string => typeof code === 'string')
      .sort();
    const maxValue = codes.length > 0 ? codes[codes.length - 1] : null;
    return { maxValue } as unknown as T;
  }

  async getCount(): Promise<number> {
    return this.filtered().length;
  }

  async getMany(): Promise<Row[]> {
    return this.filtered().slice(this.skipN, this.skipN + this.takeN);
  }
}
