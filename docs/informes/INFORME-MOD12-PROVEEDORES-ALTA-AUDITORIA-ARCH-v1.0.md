# INFORME DE AUDITORIA (2ª capa) - MOD12 Proveedores Alta Fase 05

**Version:** 1.0
**Fecha:** 2026-07-11
**Modo activo:** Governance + Orchestrator (AI-EM-ARCH)
**Auditor:** AI-EM-ARCH (revision de 2ª capa sobre entrega de AI-SR-FULL)
**Protocolo:** Multiagente — 4 sub-auditorias (DB/boundary, backend/API, frontend, tests/docs/alcance)
**Commit auditado:** `8ce3d26b` "feat(mod12): alta proveedores Fase 05 y continuidad comercial"
**Artefactos de referencia:** ADR-052, PRD-MOD12-PROVEEDORES-v1.0, plan 2026-07-11-mod12-proveedores-alta-fase-05, PROMPT-MOD12-PROVEEDORES-ALTA-FASE-05-v1.0
**Informe del ejecutor evaluado:** docs/informes/INFORME-MOD12-PROVEEDORES-ALTA-FASE-05-v1.0.md
**Checklist evaluado:** docs/quality/CHECKLIST-MOD12-PROVEEDORES-ALTA-FASE-05-v1.0.md

---

## 1. Veredicto

**NO-GO de cierre (Rechazo condicionado).** La funcionalidad existe, respeta el boundary en codigo y en gran parte implementa el diseno aprobado; pero **3 hallazgos criticos** y **3 altos** impiden dar por cerrada la fase. La remediacion es acotada y esta especificada en el prompt Fase 05-B (`docs/prompts/PROMPT-MOD12-PROVEEDORES-ALTA-REMEDIACION-FASE-05B-v1.0.md`).

El aprobador de este gate (AI-EM-ARCH) no es el productor del artefacto de codigo (AI-SR-FULL); el que definio la fase audita la entrega. Cumple protocolo §3.3.

## 2. Lo que CUMPLE (verificado en codigo, no en el informe)

- **Boundary Compras -> Parties: cero acceso directo a tablas `party*`.** Toda escritura via `IPartyWritePort`, lectura via `IPartyReadPort`/`SupplierPartyPort` (`supplier-profile.service.ts:11`; `ports/supplier-party.port.ts:3,66`).
- **Entidad y migracion correctas y reversibles.** `supplier-profile.entity.ts` con columnas, tipos e indices tenant-first y unicos correctos; `064_create_supplier_profiles.ts` up/down reversible, enum PG, registrada en `runner.ts:24,123` y `entities/index.ts:86`.
- **Puerto de comando + binding.** `IPartyWritePort` con firma de ADR-052 §D2; bindeado y **exportado** para inyeccion cross-module (`parties.module.ts:37-42`).
- **Idempotencia por documento (RF-PROV-02).** El adapter reutiliza Party por `(documentType, documentNumber)` y solo agrega/reactiva rol SUPPLIER (`party-write.adapter.ts:31-97`).
- **Atomicidad de la ESCRITURA.** Party+rol+perfil comparten la transaccion tenant (`supplier-profile.service.ts:67-78`; el adapter opera solo sobre `ctx.manager`).
- **Endpoints conformes.** 5 rutas bajo `/purchasing`, `@Roles(UserRole.*)` (enum, no strings), Zod, `@ApiOperation`; `providers`/`summary` preservados (`purchasing.controller.ts:177-235`).
- **RBAC segun decision CTO v1:** ADMIN/NOC/SUPPORT; **no** se creo rol `PURCHASER`.
- **RF-PROV-06 / RF-PROV-08 realmente aplicados.** 409 en espanol por perfil duplicado; `assertEligibleForPurchasing` invocado en `RfqService.invite` y `PurchasingService` (bloqueo real de proveedor no-ACTIVE en compras).
- **Sin PII en logs** (`party-write.adapter.ts:55` loguea solo `party.id`). Unit specs solidos en casos (8/10/8, conteos exactos).

## 3. Hallazgos

### CRITICA

- **C1 — Commit no atomico / violacion de Completitud.** ~40 de 89 archivos del commit son trabajo ajeno a la Fase 05 (comercial: Offers/Promotions/Tax*/Plan/Additional; MOD02 `tenant.service.ts`; MOD06; migracion `063_drop_legacy_additional_products`; seeds; informes MOD02/MOD06; PNGs). La contaminacion **consumio la migracion `063`** que el prompt reservaba para `supplier_profiles`, forzando su renumerado a `064`. Imposibilita revertir la Fase 05 de forma aislada. **El informe del ejecutor no lo reconoce.**
- **C2 — Test de aislamiento tenant inexistente.** `**/*.isolation.spec.ts` -> 0 archivos; grep `isolation|cross-tenant` en `modules/inventory` -> 0. Es DoD explicito (PROMPT §6/§8). Omitido y **no declarado como desvio**.
- **C3 — Evidencia de gates y cobertura ausente.** No existe reporte de cobertura ni log de lint/typecheck/tests en `docs/quality/`. Las afirmaciones "gates verdes" y "cobertura >=80%" del informe (`:46-57`) y checklist (`:51-53`) son **declarativas, no verificables**. La revision "AI-SEC-ENG PASS" es autodeclarada sin artefacto.

### ALTA

- **A1 — `party` (resumen de identidad) del response de `POST /suppliers` es SIEMPRE null.** Tras crear el Party dentro de la transaccion no confirmada, `getSupplierSummary` lo lee a traves de un `runInTenantSchema` NUEVO (otra conexion); bajo READ COMMITTED no ve el Party sin confirmar -> devuelve null. Defecto garantizado en cada alta. El perfil se persiste bien y el GET posterior si compone. (`supplier-profile.service.ts:98` -> `party-read.adapter.ts:25-28`).
- **A2 — La reutilizacion de identidad en la UI no es real.** El drawer busca por documento pero **descarta el `partyRefId`** hallado y `CreateSupplierDto` no admite ese campo; el alta siempre envia identidad completa y la deduplicacion queda 100% delegada al backend por `(documentType, documentNumber)`, pese al aviso "Reutilizaremos su identidad". Ademas `documentType` no se sincroniza del tercero hallado y queda bloqueado en NIT; la busqueda es por texto libre, no por `(tipo+numero)` exacto. Riesgo de tercero duplicado. (`SupplierFormDrawer.tsx:274-282`; `api-client.ts:6033-6053`).
- **A3 — Las pruebas de "integracion" y "E2E" no ejercitan el sistema real.** La integracion HTTP **mockea `SupplierProfileService`** (`supplier-profile.http.integration.spec.ts:151`): valida routing/RBAC, no el alta atomica ni el 409 por restriccion real; el escenario "reutilizado" no existe a nivel HTTP. El E2E corre contra **backend mockeado** via `page.route` (`portal-inventory-scm.spec.ts:1273-1368`): no toca API/DB y no cubre el bloqueo propagado a RFQ/OC que exige el DoD.

### MEDIA

- **M1 — El adapter no delega en los servicios de Parties.** `PartyWriteAdapter` manipula las entidades `Party`/`PartyRole`/`PartyContact` directamente via `EntityManager` en vez de `PartyService`/`PartyRoleService`/`PartyContactService` (ADR-052 §D2, regla de boundary #4). No es fuga cross-module (permanece dentro de entidades de Parties) ni bug hoy (Parties no cifra `document_number` actualmente), pero omite reglas de negocio centralizadas (validacion/normalizacion/eventos). **Es la desviacion que la revision reforzada AI-SEC-ENG debe resolver o documentar como excepcion.**
- **M2 — `supplier_code` sin reintento ante colision.** `generateSupplierCode` calcula `MAX+1` una vez; el 23505 de `uq_supplier_profiles_tenant_supplier_code` no se captura (solo el de `party_ref`) -> 500 en vez de "siguiente numero libre". Incumple RF-PROV-05/CA-04 (`supplier-profile.service.ts:356-372,100-104`).
- **M3 — Boundary sin test de arquitectura.** El DoD pedia test de arquitectura/imports que guarde "Compras no toca tablas de Parties"; solo hay grep manual. El codigo cumple, pero el gate queda sin guardia automatica.
- **M4 — Checklist marcado 100% con evidencia inexistente y omisiones.** Items de lint/test/migracion aplicada marcados sin adjunto; sin item de isolation ni de cobertura pese a ser DoD.

### BAJA

- B1 — N+1 en `list`: un `runInTenantSchema` (2 queries) por perfil via `getSupplierSummary` (hasta ~200 tx por pagina con limit=100).
- B2 — `UpdateSupplierSchema` sin `.refine('al menos un campo')`; PATCH `{}` es no-op.
- B3 — `isDirty` en alta solo cubre 3 campos; la guardia de descarte no cubre el resto.
- B4 — La busqueda del drawer no muestra `SupplierSummaryCard` del resultado para confirmar identidad (solo alert de texto).
- B5 — `incoterm` varchar libre sin lista controlada en shared (ADR lo dejo condicional).
- B6 — Reutilizacion podria alcanzar un Party `MERGED` (defecto preexistente heredado de `PartyService`, no introducido aqui).

## 4. Desempates de auditoria

- **[DESEMPATE] Atomicidad.** Posiciones: DB-auditor "CUMPLE"; API-auditor "response.party null". **Decision:** ambas correctas — la **escritura** es atomica (CUMPLE); el defecto A1 es solo la **lectura de vuelta** para el payload. No contradictorio.
- **[DESEMPATE] Numero de migracion 063 vs 064.** **Decision:** `064` es la eleccion de ingenieria correcta (063 legitimamente ocupada); **se conserva `064`** y se corrige la deriva documental (ADR/plan/prompt decian 063). El problema real no es el numero sino C1.

## 5. Decision de gate y remediacion

- **Fase 05: NO cerrada.** Bloqueada por C1, C2, C3 (gates de merge del perfil §Tests: cobertura, isolation, evidencia) y A1 (defecto funcional).
- **Historia del commit (C1) — DECISION CTO 2026-07-11:** **No se reescribe historia.** Se cierra como **incidente de proceso documentado**. Motivos verificados que hacen inviable un split limpio: (1) el commit `8ce3d26b` **ya esta pusheado a `origin/main`** (reescribir exigiria force-push a remoto compartido); (2) **entrelazamiento en el mismo archivo** — `InventoryClient.tsx` (88 lineas supplier + 15 commercial + 4 catalog) y `api-client.ts` mezclan ambos concerns, y separarlos requiere `rebase -i`/`add -p` (nivel hunk) no disponibles en el entorno; un split a nivel de archivo dejaria commits sin compilar. **Control preventivo:** se refuerza "un commit atomico por fase" como gate de proceso; la remediacion Fase 05-B se entrega en su propio commit limpio de solo-proveedores. La deriva de numeracion `063->064` provocada por C1 queda aceptada (`064` es correcto).
- **Revision reforzada AI-SEC-ENG:** pendiente real sobre M1 (delegacion del adapter) antes de merge.
- **Prompt de remediacion:** `docs/prompts/PROMPT-MOD12-PROVEEDORES-ALTA-REMEDIACION-FASE-05B-v1.0.md`.
- **Correccion documental exigida al ejecutor:** actualizar su informe de cierre y checklist para declarar los desvios reales (isolation ausente, sin evidencia de cobertura, commit mezclado) — no marcar cerrado lo no verificado.

## 6. Clasificacion de deuda tecnica

| Sev | Items | Bloquea cierre |
| --- | --- | --- |
| Critica | C1, C2, C3 | Si |
| Alta | A1, A2, A3 | Si |
| Media | M1, M2, M3, M4 | M1/M2 si; M3/M4 recomendado |
| Baja | B1–B6 | No (backlog) |

---

## Referencias

- docs/adrs/ADR-052-Alta-Proveedores-SupplierProfile-Puerto-Comando-Parties.md
- docs/prds/PRD-MOD12-PROVEEDORES-v1.0.md
- docs/plans/2026-07-11-mod12-proveedores-alta-fase-05.md
- docs/prompts/PROMPT-MOD12-PROVEEDORES-ALTA-FASE-05-v1.0.md
- docs/informes/INFORME-MOD12-PROVEEDORES-ALTA-FASE-05-v1.0.md (ejecutor)
- AGENTS.md; docs/roles/Perfil_IA_EM_Architect_Unificado_v2.md
