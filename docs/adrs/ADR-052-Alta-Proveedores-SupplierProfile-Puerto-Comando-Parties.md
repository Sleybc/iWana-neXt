# ADR-052: Alta de proveedores — SupplierProfile en Compras y puerto de comando a Parties

**Version:** 1.0
**Estado:** Aprobado
**Aprobado por:** CTO
**Fecha:** 2026-07-11
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Modulo:** MOD12 Inventario / SCM (submodulo Compras) + MOD08 Parties (contrato de escritura)
**PRD relacionado:** docs/prds/PRD-MOD12-PROVEEDORES-v1.0.md
**HLD relacionado:** docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md
**ADR antecedente:** docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md
**ADR base (identidad):** docs/adrs/ADR-030-Modelo-Party-Multi-Rol.md
**ADR relacionados:** docs/adrs/ADR-050-Compra-Mostrador-Ingreso-Directo.md, docs/adrs/ADR-051-RFQ-Solicitud-Cotizacion-Invitaciones.md
**Plan:** docs/plans/2026-07-11-mod12-proveedores-alta-fase-05.md
**Prompt de ejecucion:** docs/prompts/PROMPT-MOD12-PROVEEDORES-ALTA-FASE-05-v1.0.md

---

## Contexto

El submodulo de Compras de MOD12 referencia hoy al proveedor **como un `Party` con rol `SUPPLIER`** (MOD08 Parties), siempre por `party_ref_id` sin FK cross-module. Todo el flujo de compras ya consume esa referencia:

- `supplier_quotes.party_ref_id`, `purchase_orders.party_ref_id`, `purchase_rfq_invitations.party_ref_id`, `purchase_request_line_awards.awarded_party_ref_id`.
- `inventory_items.preferred_supplier_ref_id` + `supplier_sku`.
- Puerto de **solo lectura** `SupplierPartyPort` (`apps/api/src/modules/inventory/ports/supplier-party.port.ts`) que traduce `Party -> SupplierPartySummary` via `IPartyReadPort.searchByRole(SUPPLIER, ...)`.
- Endpoints de lectura `GET /purchasing/providers` y `GET /purchasing/providers/:partyRefId/summary`, consumidos por `SupplierPicker` / `SupplierMultiPicker` en el portal.

**El hueco:** no existe un camino para **dar de alta y gestionar** un proveedor. Hoy no hay forma de crear el `Party` con rol `SUPPLIER` desde Compras, no existe la entidad de perfil comercial de proveedor que ADR-030 D5 anticipo (`supplier_profile`), y los pickers dependen de que el proveedor ya exista en el maestro por otra via. El negocio (idea MOD12, rol PURCHASER "gestiona catalogo de proveedores") y el PRD Taxation+Parties (§7: "el futuro comprador creara `Party` + rol `SUPPLIER` + `SupplierProfile`") exigen cerrar este paso.

La identidad del proveedor **no se discute**: ADR-030 ya decidio que todo tercero es un `Party` y descarto (alternativa B) crear una tabla `suppliers` paralela por duplicacion de identidad y riesgo de habeas data. Lo que este ADR decide es **como se crea/gestiona el proveedor respetando ese boundary** y **donde vive su perfil comercial de compra**.

---

## Decision

Se adopta el **Alta de Proveedores** como funcionalidad del submodulo Compras de MOD12, con dos piezas:

1. Una entidad nueva **`SupplierProfile`** (perfil comercial de compra), propiedad del contexto Compras dentro de MOD12, en relacion 1:1 con un `Party` que tiene rol `SUPPLIER` activo. Realiza el `supplier_profile` "futuro" de ADR-030 D5.
2. Un **puerto de comando** nuevo **`IPartyWritePort`**, propiedad de MOD08 Parties, que permite a Compras **asegurar** (crear o reutilizar) un `Party` y asignarle el rol `SUPPLIER` sin acceder a las tablas de Parties. Es el dual de escritura del `IPartyReadPort` ya existente.

El alta es una **operacion atomica orquestada desde Compras** que: asegura la identidad via el puerto de comando de Parties y crea el `SupplierProfile`, todo dentro de la misma transaccion tenant.

### D1. Entidad `SupplierProfile` (nueva, propiedad de Compras/MOD12)

Tabla `supplier_profiles` en schema tenant. Perfil comercial de compra; **no** duplica datos de identidad (documento, razon social) que son de `Party`.

Columnas (borrador):

- `id` uuid PK
- `tenant_id` uuid
- `party_ref_id` uuid — referencia logica a `party.id` (MOD08), **sin FK cross-module**
- `party_role_id` uuid — referencia logica al `party_role.id` (rol SUPPLIER que habilito el perfil)
- `supplier_code` varchar — codigo legible del proveedor, patron `PROV-NNNNNN` (secuencial por tenant, colision `23505` reintenta siguiente)
- `payment_terms_days` int nullable — condiciones de pago (dias)
- `currency` char(3) nullable — moneda de compra por defecto
- `incoterm` varchar nullable — incoterm por defecto (texto controlado en shared)
- `default_lead_time_days` int nullable — lead time por defecto del proveedor
- `purchasing_contact_name` varchar nullable
- `purchasing_contact_email` varchar nullable
- `purchasing_contact_phone` varchar nullable
- `status` enum `supplier_profile_status` (`ACTIVE | INACTIVE | BLOCKED`), default `ACTIVE` — habilitacion del proveedor para nuevas compras
- `notes` text nullable
- `created_by_user_id` uuid nullable
- `created_at`, `updated_at` timestamptz

Indices y unicidad (todos tenant-first): unico `(tenant_id, party_ref_id)` (un solo perfil por proveedor), unico `(tenant_id, supplier_code)`, indice `(tenant_id, status)`.

Enum nuevo en `packages/shared/src/enums/inventory/`: `SupplierProfileStatus { ACTIVE, INACTIVE, BLOCKED }`.

### D2. Puerto de comando `IPartyWritePort` (nuevo, propiedad de MOD08 Parties)

Contrato tipado abstracto en `apps/api/src/modules/parties/ports/party-write.port.ts`, implementado por un adapter en Parties, registrado en `PartiesModule` e inyectado en Compras — **espejo exacto** del `IPartyReadPort` existente.

Metodo principal:

```ts
ensurePartyWithRole(
  input: EnsurePartyInput,   // documentType, documentNumber, partyType, displayName,
                             // legalName?, contacts?[]
  role: PartyRoleType,       // SUPPLIER en este caso
  ctx: { manager: EntityManager; actorUserId?: string },
): Promise<{ partyId: string; partyRoleId: string; partyCreated: boolean; roleAdded: boolean }>;
```

Semantica (idempotente por documento):

- Busca `Party` por `(documentType, documentNumber)` en el tenant.
- Si **no existe**: crea el `Party` (+ contactos) delegando en `PartyService`, luego asigna rol `SUPPLIER`.
- Si **existe**: reutiliza la identidad; si no tiene rol `SUPPLIER` activo, lo asigna (o reactiva un rol `INACTIVE`). No duplica identidad (cumple ADR-030 CA-05: un mismo Party puede ser CUSTOMER + SUPPLIER).
- Ejecuta **dentro del `EntityManager`/transaccion** que le pasa el llamante, para que el alta sea atomica con la creacion del `SupplierProfile`.
- El adapter delega en los servicios de Parties (`PartyService`, `PartyRoleService`, `PartyContactService`); **no** expone ni permite a Compras tocar tablas `party*`.

### D3. Orquestacion del alta (desde Compras)

Endpoint `POST /purchasing/suppliers` en `purchasing.controller.ts`. En `runInTenantSchema` + transaccion:

1. `IPartyWritePort.ensurePartyWithRole({...identidad, contactos}, SUPPLIER, { manager })` -> `{ partyId, partyRoleId }`.
2. `SupplierProfileService.create({ partyRefId: partyId, partyRoleId, ...comercial }, manager)`; genera `supplier_code`; colision de perfil (`23505` sobre `(tenant_id, party_ref_id)`) -> `409 Conflict` "ya existe un perfil de proveedor para este tercero".
3. Respuesta: `SupplierProfileRecord` compuesto con `SupplierPartySummary` (via `SupplierPartyPort`).
4. CUD auditado por `AuditInterceptor`.

### D4. Superficie de API (borrador)

Bajo `/purchasing`, roles ADMIN/NOC/SUPPORT (ver D6), Zod, multi-tenant. Convivencia con los endpoints de lectura existentes:

- `POST /purchasing/suppliers` — alta (asegura Party+rol SUPPLIER + crea SupplierProfile).
- `GET /purchasing/suppliers` — listado paginado con filtro `status`/texto; compone perfil + `SupplierPartySummary`.
- `GET /purchasing/suppliers/:partyRefId` — detalle (perfil + resumen de identidad).
- `PATCH /purchasing/suppliers/:partyRefId` — editar **campos comerciales** del perfil (no identidad; la identidad se edita en Parties).
- `POST /purchasing/suppliers/:partyRefId/status` — activar / inactivar / bloquear (`SupplierProfileStatus`).
- `GET /purchasing/providers` y `.../summary` (existentes) — se conservan; siguen alimentando `SupplierPicker`/`SupplierMultiPicker`.

### D5. Reutilizacion de identidad y edicion de datos maestros

- El alta **reutiliza** un `Party` existente cuando el documento ya esta en el maestro (p. ej. un cliente que ademas es proveedor): solo agrega el rol `SUPPLIER` + el `SupplierProfile`. La UI debe ofrecer **buscar por documento antes de crear**.
- Los datos de identidad (documento, razon social, contactos base) son **propiedad de Parties**; su edicion no ocurre en Compras. Compras solo administra el perfil comercial (`SupplierProfile`) y el estado de habilitacion.

---

## Reglas de boundary

1. La identidad del proveedor vive en MOD08 Parties (`Party` + rol `SUPPLIER`); **no** se crea tabla `suppliers` de identidad (ADR-030, alternativa B descartada).
2. `SupplierProfile` es propiedad de Compras/MOD12 y referencia `party_ref_id` / `party_role_id` **sin FK cross-module**; no expone `partyRefId` como texto en UI.
3. Compras **no** accede a tablas `party*`: toda escritura de identidad pasa por `IPartyWritePort`; toda lectura por `IPartyReadPort` / `SupplierPartyPort`.
4. `IPartyWritePort` es propiedad de Parties; su adapter delega en los servicios de Parties y participa de la transaccion del llamante (atomicidad del alta).
5. Multi-tenant estricto: `TenantContext.getOrThrow()` + `runInTenantSchema`; entidad tenant-aware con indices tenant-first.
6. Todas las operaciones CUD pasan por `AuditInterceptor`; sin PII/secretos en logs.
7. Migracion tenant reversible (`up`/`down`); verificar numeracion libre antes de crear (proxima esperada: `063`).

---

## Consecuencias

### Positivas

- Cierra el paso faltante: se puede dar de alta y gestionar proveedores sin salir de Compras, alimentando RFQ, cotizacion, OC y proveedor preferido del articulo.
- Respeta el maestro unico de terceros: cero duplicacion de identidad; un mismo tercero puede ser cliente y proveedor (ADR-030 CA-05).
- Deja el primer puerto de **escritura** cross-module bien definido y reutilizable (RRHH/`employee_profile` seguira el mismo patron).
- Retrocompatible: los endpoints de lectura y los pickers existentes siguen funcionando sin cambios.

### Costos y tradeoffs

- Nueva entidad + migracion tenant + enum compartido.
- Nuevo contrato de boundary (`IPartyWritePort`) con adapter y wiring en dos modulos.
- La atomicidad exige que el puerto de comando acepte y opere sobre el `EntityManager` del llamante (guardrail de implementacion).

### Riesgos aceptados

- Coexistencia de proveedores "solo identidad" (Party con rol SUPPLIER sin `SupplierProfile`, si se crearon por otra via) con proveedores "con perfil": el listado de gestion se basa en `SupplierProfile`; los pickers siguen basados en rol. Se asume backfill opcional posterior si se requiere unificar.
- La edicion de identidad desde Compras queda deliberadamente fuera; el usuario que necesite corregir documento/razon social va a Parties. Se asume aceptable para v1.

---

## Alternativas consideradas

### A1: `Party(SUPPLIER)` + `SupplierProfile` + puerto de comando a Parties (elegida)

Respeta ADR-030, no duplica identidad, deja un contrato de escritura limpio y reutilizable, alta atomica. Frontera clara entre identidad (Parties) y perfil comercial (Compras).

### A2: Tabla `suppliers` de identidad propia en Compras

Descartada. Replica documento/razon social/contactos, rompe el maestro unico, genera riesgo de habeas data e inconsistencia. Ya descartada como alternativa B de ADR-030.

### A3: Orquestacion en el cliente (el portal hace `POST /parties` y luego `POST /purchasing/suppliers`)

Descartada. Expone la orquestacion y el boundary al frontend, el alta no es atomica (puede quedar Party sin perfil o rol sin identidad), y duplica reglas de unicidad de documento en el cliente.

### A4: Metadata comercial del proveedor dentro de `party_role` (JSON)

Descartada. Mezcla datos comerciales de compra (propiedad de un contexto) en el maestro de Parties, que por ADR-030 D6 no conoce reglas comerciales. Contamina el boundary.

---

## Impacto de implementacion

- **Shared:** enum `SupplierProfileStatus`; barrels de enums; tipo/const de incoterms si se controla en shared.
- **Database:** entidad `SupplierProfile`; migracion tenant `063_create_supplier_profiles.ts` (crea enum PG + tabla + indices + unicos); registro en `data-source`.
- **API (Parties):** `IPartyWritePort` + adapter `PartyWriteAdapter`; wiring en `PartiesModule`; reutiliza `PartyService`/`PartyRoleService`/`PartyContactService`.
- **API (Compras/MOD12):** `SupplierProfileService`; endpoints en `purchasing.controller.ts`; DTOs Zod; registro en `inventory.module.ts` (inyecta `IPartyWritePort`).
- **Portal:** nueva pestana `suppliers` en `InventoryClient` (patron Panel -> Table -> Drawer de Categorias); drawer de alta con paso "buscar por documento (reutilizar) -> perfil"; reutiliza `SupplierSummaryCard`; cliente API; vocabulario espanol (`SUPPLIER_STATUS_LABELS`).
- **OpenAPI:** nuevos endpoints.
- **Testing:** unit de `SupplierProfileService` y del adapter (`ensurePartyWithRole` crea vs reutiliza, idempotencia, atomicidad, multi-tenant); integracion HTTP del alta; E2E portal. Cobertura core >= 80%.

### Impacto declarado (perfil AI-EM-ARCH)

- **Multi-tenant:** todo bajo `TenantContext` + `runInTenantSchema`; migracion por schema; indices tenant-first. Sin impacto en aislamiento.
- **Seguridad / RBAC:** `documentNumber` sigue cifrado en `Party`; el `SupplierProfile` **no** duplica PII de identidad; datos bancarios del proveedor quedan **fuera de v1** (escalacion al CTO). Nuevo puerto de escritura auditado; sin nueva superficie de autenticacion. Cambio de schema + boundary -> **revision reforzada AI-SEC-ENG** obligatoria.
- **Escala:** relacion 1:1 con Party; listado y busqueda paginados por rol/estado. Sobrevive a miles de tenants. Sin impacto.
- **Regulacion (Colombia):** el regimen tributario del proveedor se resuelve **consumiendo** el catalogo Taxation `context = PURCHASE` (RF-TAX-01), no se redefine aqui. Retencion en la fuente / autorretencion aplican en OC/pago, fuera del alta; sus reglas especificas **requieren verificacion con fuente oficial DIAN**.

---

## Escalaciones al CTO

**[ESCALACION AL CTO] Prioridad:** Media | **Estado:** Resueltas por el CTO (2026-07-11).

1. **Datos bancarios del proveedor (PII financiera).** **Decision CTO: opcion (a)** — no se almacenan en v1; se difieren a la integracion de pagos/tesoreria. El alta, RFQ y OC no los requieren.
2. **Mapeo RBAC del rol comprador (PURCHASER / ADMIN_SCM).** **Decision CTO:** en v1 el acceso es ADMIN/NOC/SUPPORT (igual que el resto de Inventario/Compras); PURCHASER se mapea a permiso gobernado en fase posterior, **sin** enum de rol nuevo sin ADR.

---

## Nota de implementacion (Fase 05-B) — Excepcion M1 a §D2

**Contexto:** La auditoria de 2ª capa (INFORME-MOD12-PROVEEDORES-ALTA-AUDITORIA-ARCH-v1.0, hallazgo M1) observo que `PartyWriteAdapter` manipula las entidades `Party`/`PartyRole`/`PartyContact` directamente por `EntityManager` en lugar de delegar en `PartyService`/`PartyRoleService`/`PartyContactService`, como sugiere §D2 ("delega en los servicios de Parties").

**Analisis:** Los tres servicios (`PartyService`, `PartyRoleService`, `PartyContactService`) abren su **propia** `runInTenantSchema` (conexion/transaccion nueva) y **no aceptan** un `EntityManager` del llamante. Delegar en ellos desde el adapter dentro de la transaccion del alta es inviable sin refactorizarlos para aceptar un `manager` opcional — un cambio mayor en la superficie de otro modulo (MOD08 Parties). Hacerlo sin ese refactor rompe la **atomicidad** exigida por §D3/regla de boundary #4 (Party+rol+perfil en una sola transaccion): las escrituras irian por conexiones distintas y una falla parcial dejaria residuo.

**Decision (excepcion aprobada):** Se **mantiene** que `PartyWriteAdapter` opere sobre las entidades de Parties **exclusivamente a traves del `EntityManager` transaccional del llamante**, sin delegar en los servicios. La excepcion se limita a Compras↔Parties (alta atomica) y se justifica por:
- **Atomicidad:** una sola transaccion tenant garantiza que no queden Party sin perfil ni rol sin identidad.
- **Boundary intacto:** el adapter es **propiedad de Parties** (vive en `modules/parties/adapters`); Compras jamas toca tablas `party*` (garantizado por el test de arquitectura `inventory-parties-boundary.arch.spec.ts`).
- **Reglas de negocio preservadas:** la **unicidad de documento** se garantiza en dos capas — (a) el adapter busca por `(documentType, documentNumber)` antes de crear y (b) el indice unico parcial `idx_party_document_active` en `party(document_type, document_number)` (migracion `022`). La **normalizacion** (trim) se aplica en el boundary Zod (`CreateSupplierSchema`). Parties **no** cifra hoy `document_number` ni emite eventos en la creacion base, por lo que no se omite logica de negocio critica.

**Pruebas que respaldan la excepcion:** `party-write.adapter.spec.ts` → describe "unicidad y normalizacion de documento (M1)" (busca por documento exacto excluyendo soft-deleted, reutiliza sin duplicar); integracion HTTP real e isolation cross-tenant.

**Deuda / evolucion:** si a futuro Parties centraliza cifrado de documento, validaciones adicionales o eventos de dominio en la creacion, se debera dotar a esos servicios de un metodo `ensure`/`findOrCreate(manager)` que participe de la transaccion del llamante y migrar el adapter a delegar. Registrado como deuda tecnica. **Visto bueno AI-SEC-ENG:** la desviacion no introduce fuga cross-module ni PII en logs (solo `party.id`).

## Estado de aprobacion

**Aprobado por el CTO (2026-07-11).** Habilita la ejecucion de la Fase 05 conforme al plan y prompt asociados, incluyendo el cambio de schema (migracion `063`), el nuevo contrato de boundary `IPartyWritePort` y la entidad `SupplierProfile`. Escalaciones resueltas (datos bancarios fuera de v1; RBAC ADMIN/NOC/SUPPORT). **Revision reforzada AI-SEC-ENG** obligatoria antes del merge (cambio de schema + boundary de escritura cross-module).

---

## Referencias

- AGENTS.md
- docs/roles/Perfil_IA_EM_Architect_Unificado_v2.md
- docs/adrs/ADR-030-Modelo-Party-Multi-Rol.md
- docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md
- docs/adrs/ADR-050-Compra-Mostrador-Ingreso-Directo.md
- docs/adrs/ADR-051-RFQ-Solicitud-Cotizacion-Invitaciones.md
- docs/prds/PRD-TAXATION-PARTIES-COMMERCIAL-REDESIGN-v1.0.md
- docs/prds/PRD-MOD12-COMPRAS-WORKSPACE-HIBRIDO-v1.0.md
- docs/hlds/HLD-MOD08-PARTIES-v1.0.md
- docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md
- apps/api/src/modules/parties/ports/party-read.port.ts
- apps/api/src/modules/inventory/ports/supplier-party.port.ts
- packages/database/src/entities/inventory-item.entity.ts
