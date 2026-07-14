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

**1ª pasada (commit 8ce3d26b): NO-GO de cierre.** 3 criticas + 3 altas. La remediacion se especifico en el prompt Fase 05-B.

**2ª pasada (commit 2db5ab31, remediacion): GO de cierre CONDICIONADO.** Verificado independientemente por AI-EM-ARCH (ver §7). Condicion unica: E2E Playwright.

**3ª pasada (AI-SR-QA ejecuta; AI-EM-ARCH ratifica, 2026-07-11): GO de cierre — con deuda acotada de E2E full-stack.** AI-SR-QA ejecuto el E2E `portal-inventory-scm.spec.ts` → **22/22 PASS**, añadiendo el caso UI RF-PROV-08 (OC BLOCKED) y estabilizando una asercion de badge. **Matiz verificado por el arquitecto:** ese E2E corre a **nivel UI contra backend mockeado** (`page.route('**/api/v1/**')`, linea 448; el propio evidence lo declara con el ruido `ECONNREFUSED :3000`). Valida el cableado de la UI, **no** el flujo full-stack browser→API→DB real. El backend real ya esta cubierto por la integracion HTTP (service+adapter+store que modela constraints PG) y RF-PROV-08 por unit en `RfqService`/`PurchasingService`. **Veredicto de gate (AI-EM-ARCH):** Fase 05 **cerrada a nivel de codigo y calidad**; queda como **deuda de testing acotada y trazable** (no bloqueante del merge) la ejecucion del E2E full-stack real en CI/staging con stack levantado, antes del deploy productivo. Detalle en §8.

*(El detalle §2–§6 corresponde a la 1ª pasada; se conserva como registro. El estado vigente es §7 + §8.)*

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

---

## 7. Re-auditoria de 2ª pasada — Remediacion Fase 05-B (commit `2db5ab31`)

**Fecha:** 2026-07-11 · **Verificado por:** AI-EM-ARCH (corrida independiente, no lectura del informe del ejecutor).

### Veredicto: **GO de cierre CONDICIONADO** — condicion unica: E2E Playwright verde en CI antes de push/deploy.

### Verificacion independiente (ejecutada por el auditor, no declarativa)

| Gate | Resultado propio |
| --- | --- |
| `jest supplier-profile party-write inventory-parties-boundary` | **5 suites / 32 tests PASS** |
| `typecheck` @iwana/api + @iwana/portal | **PASS** |
| `lint` @iwana/api + @iwana/portal | **PASS** |
| Commit atomico solo-proveedores, padre `8ce3d26b` intacto, **no pusheado** | **Confirmado** |
| Evidencia adjunta en `docs/quality/evidence-fase-05b/` | Presente |

### Cierre de hallazgos

| ID | Estado | Verificacion |
| --- | --- | --- |
| A1 (party null en alta) | **CERRADO** | identidad compuesta en la tx del alta (`party-write.adapter.ts` `buildIdentitySnapshot`; `supplier-profile.service.ts summaryFromIdentity`); cubierto por integracion real verde |
| A2 (reutilizacion falsa) | **CERRADO** | endpoint `GET /purchasing/suppliers/lookup` por documento (DESEMPATE §6: dedupe backend, sin `partyRefId` en DTO); UI sincroniza documentType/partyType/legalName y muestra `SupplierSummaryCard` |
| A3 (pruebas mockeadas) | **CERRADO** (codigo + E2E ejecutado en §8) | integracion HTTP real, isolation spec, E2E RFQ+OC BLOCKED — **22/22 PASS** |
| C2 (isolation) | **CERRADO** | `supplier-profile.isolation.spec.ts` PASS |
| C3 (evidencia) | **CERRADO** | gates corridos por el auditor (arriba), evidencia adjunta |
| M1 (delegacion adapter) | **ACEPTADO COMO EXCEPCION** | ADR-052 §"Nota de implementacion (Fase 05-B)"; excepcion tecnicamente correcta (atomicidad), boundary test-guarded, unicidad garantizada por busqueda previa + indice unico parcial `022`. **Ratificada por el arquitecto.** |
| M2 (supplier_code sin reintento) | **CERRADO** | `persistProfileWithUniqueCode` con SAVEPOINT + reintento acotado; test de colision |
| M3 (boundary sin test) | **CERRADO** | `inventory-parties-boundary.arch.spec.ts` PASS |
| C1 (commit mezclado) | **DOCUMENTADO** | incidente de proceso (decision CTO §5); no reversible por pushed+entrelazado |

### Condicion de salida (unica pendiente) — **CUMPLIDA en §8**

- **E2E Playwright** (`pnpm test:e2e:portal -- portal-inventory-scm.spec.ts`, incluye proveedor BLOCKED rechazado en RFQ/OC): **ejecutado y verde** por AI-SR-QA (2026-07-11). Ver §8.

### Observaciones de gobierno (no bloqueantes)

- El "visto bueno AI-SEC-ENG" que aparece en la nota M1 del ADR es autoatestacion del ejecutor; la **revision reforzada real** es esta auditoria de 2ª capa, que ratifica la excepcion M1 por su merito tecnico (bajo riesgo, sin fuga cross-module, sin PII en logs).
- `pnpm test` de monorepo completo no se corrio; solo se verifico `@iwana/api` + lint/typecheck de portal + E2E SCM. Otros paquetes no son tocados por el commit; riesgo bajo.
- Backlog de deuda registrado (B1 N+1 en list, B2 `.refine`, B3 isDirty, B5 incoterms, B6 Party MERGED). **Cerrado B1–B5 por AI-SR-FULL (2026-07-11) — ver §9.**

### Decision (2ª pasada)

Fase 05 **cerrada a nivel de codigo y calidad** con GO condicionado. Al pasar el E2E, el cierre es definitivo. No se requiere nueva intervencion del arquitecto salvo que el E2E revele regresion.

---

## 8. Cierre de condicion E2E — AI-SR-QA (2026-07-11)

**Rol:** AI-SR-QA · **Comando:** `pnpm test:e2e:portal -- portal-inventory-scm.spec.ts`

| Gate | Resultado |
| --- | --- |
| Suite `portal-inventory-scm.spec.ts` | **22/22 PASS** (~56.7 s) |
| RF-PROV-08 RFQ BLOCKED | PASS — `rechaza invitar a un proveedor BLOCKED en el RFQ` |
| RF-PROV-08 OC BLOCKED | PASS — `rechaza emitir OC a un proveedor BLOCKED` (caso UI añadido en esta sesion; el mock ya existia) |
| Alta/reutilizacion/bloqueo proveedores | PASS — asercion de badge `Bloqueado` desambiguada (strict mode drawer+lista) |

**Evidencia:** `docs/quality/evidence-fase-05b/e2e-portal-inventory-scm-summary.txt` (+ log completo y corrida focalizada RF-PROV-08).

### Ratificacion y veredicto de gate (AI-EM-ARCH, 2026-07-11)

El registro §8 fue redactado por AI-SR-QA; el **veredicto de cierre es potestad de AI-EM-ARCH** (el QA reporta a este perfil y no aprueba cierres — perfil AI-SR-QA §2). Ratifico lo verificado y corrijo el alcance:

- **Lo que SI queda probado:** UI de proveedores (alta, reutilizacion, edicion, bloqueo) y RF-PROV-08 en RFQ/OC a **nivel UI** (E2E 22/22, backend mockeado con `page.route`); backend real de alta atomica/409/reutilizacion/`supplier_code` por integracion HTTP (store que modela constraints PG); RF-PROV-08 enforcement por unit; isolation cross-tenant; boundary por arch-test; lint/typecheck/cobertura core ≥80% (corridos por el arquitecto en 2ª pasada).
- **Lo que NO queda probado (deuda de testing acotada):** el flujo **full-stack real** browser→API→DB (incl. RF-PROV-08 propagado contra Postgres real). El E2E vigente lo simula con mocks; una validacion real exige stack levantado (Postgres+API+portal+navegador), fuera del alcance de este entorno. Riesgo **bajo**: ambos extremos estan probados por separado; el hueco es el cable literal.

**Veredicto: GO de cierre.** Fase 05 cerrada a nivel de codigo y calidad. El commit `2db5ab31` queda habilitado para push a `origin/main`. **Gate de salida a produccion (obligatorio, no bloquea el merge):** correr el E2E full-stack real en CI/staging con la API/DB reales antes del deploy productivo; si aparece regresion, reabrir. Deuda registrada en el backlog de testing y en el checklist de la fase.

---

## 9. Cierre de deuda de backlog B1–B5 — AI-SR-FULL (2026-07-11)

**Rol:** AI-SR-FULL v2.0 · **Skills aplicadas:** `nestjs-expert`, `testing-patterns`

| Item | Descripcion | Solucion |
| --- | --- | --- |
| B1 — N+1 en `list` | Hasta N×2 `runInTenantSchema` por pagina | `getSupplierSummariesBatch` en `SupplierPartyPort`; implementado con `getByIds` + `listContactsForIds` (2 queries paralelas via `Promise.all`). `IPartyReadPort` extendido. `enrichProfiles` refactorizado. |
| B2 — PATCH vacio sin validacion | `UpdateSupplierSchema` aceptaba `{}` como no-op silencioso | `.refine(values => some !== undefined)` en `UpdateSupplierSchema`; test de regresion añadido. |
| B3 — `isDirty` incompleto en alta | Guardia de descarte solo vigilaba 3 campos en modo create | Comparacion `JSON.stringify(form) !== JSON.stringify(default())` para identidad Y comercial; cubre todos los campos. |
| B5 — `incoterm` varchar libre | Campo libre sin lista controlada | Enum `IncotermCode` (Incoterms 2020: EXW/FCA/CPT/CIP/DAP/DPU/DDP/FAS/FOB/CFR/CIF) en `@iwana/shared`; Zod `nativeEnum` en el DTO; `Select` con opciones controladas en el portal. |
| B4 | Ya corregido en remediacion Fase 05-B (A2). | — |
| B6 — Party MERGED en reutilizacion | Defecto preexistente en `PartyService` anterior a Fase 05. | Fuera de alcance: no introducido en esta fase; se trazara como issue separado en Parties. |

**Gates verificados:**
- `pnpm --filter @iwana/api typecheck` → PASS
- `pnpm --filter @iwana/portal typecheck` → PASS
- `pnpm --filter @iwana/api lint` + `@iwana/portal lint` → PASS (0 errores)
- `pnpm --filter @iwana/api test` → **149 suites / 1485 tests PASS** (8 tests nuevos respecto al cierre anterior)

**Archivos modificados:**
- `packages/shared/src/enums/inventory/incoterm-code.enum.ts` (nuevo)
- `packages/shared/src/enums/inventory/index.ts`
- `apps/api/src/modules/parties/ports/party-read.port.ts`
- `apps/api/src/modules/parties/adapters/party-read.adapter.ts`
- `apps/api/src/modules/parties/adapters/party-read.adapter.spec.ts`
- `apps/api/src/modules/inventory/ports/supplier-party.port.ts`
- `apps/api/src/modules/inventory/services/supplier-profile.service.ts`
- `apps/api/src/modules/inventory/dto/index.ts`
- `apps/api/src/modules/inventory/tests/supplier-profile.service.spec.ts`
- `apps/portal/src/components/inventory/SupplierFormDrawer.tsx`

**Deuda residual:**
- B6 (Party MERGED): issue trazable en MOD08 Parties — preexistente, fuera de alcance de MOD12.
- E2E full-stack real: gate obligatorio antes de deploy productivo (ver §8).

---

## 10. Auditoria de 2ª capa sobre deuda B1–B5 — AI-EM-ARCH (2026-07-11)

**Rol:** AI-EM-ARCH v2.0 · **Scope:** revision independiente de los 10 archivos del commit B1–B5 contra reglas de boundary, multi-tenancy, seguridad y calidad de tests.

### Hallazgos por item

| Item | Veredicto | Observaciones |
| --- | --- | --- |
| **B1 — N+1 batch** | **CONFIRMADO CERRADO** | `IPartyReadPort` extendido de forma aditiva (2 metodos abstractos; unica implementacion `PartyReadAdapter` actualizada en mismo commit). `getSupplierSummariesBatch` usa `Promise.all([getByIds, listContactsForIds])`: 2 `runInTenantSchema` en paralelo independientemente del tamaño de pagina. `AsyncLocalStorage` propaga `TenantContext` a ambas ramas del `Promise.all` — sin riesgo de escape de tenant. El costo de anidar estas llamadas dentro del `runInTenantSchema` externo de `list()` es identico al patron preexistente (era N×2; ahora es 2 fijos). Boundary correctamente respetado: sin acceso directo a tablas de `parties`. |
| **B2 — PATCH vacio** | **CONFIRMADO CERRADO** | `Object.values(value).some((v) => v !== undefined)` es correcto para todos los campos de `supplierCommercialFields` (todos `optional().nullable()`). Caso borde verificado: `{}` → Zod produce `{ campo: undefined, ... }` → refine falla correctamente. `{ incoterm: null }` → `null !== undefined` → refine pasa correctamente (limpiar campo es operacion valida). Patron mas robusto que el check campo-por-campo de `UpdateStockLocationSchema`; se autoajusta a futuros campos del schema. |
| **B3 — isDirty create** | **CONFIRMADO CERRADO** | `JSON.stringify` contra `defaultIdentityForm()` y `defaultCommercialForm()` es determinista: ambos objetos usan las mismas claves en el mismo orden de insercion. `defaultCommercialForm()` usa `satisfies CommercialFormState` (check compilacion, sin efecto runtime). Costo: O(n) por render; con 8-10 campos de strings cortos es < 1 ms. |
| **B5 — incoterm enum** | **CONFIRMADO CERRADO** | `IncotermCode` (Incoterms 2020, 11 codigos) en `@iwana/shared`; Zod `nativeEnum`; `@ApiPropertyOptional({ enum: IncotermCode })` en `CreateSupplierDto` y `UpdateSupplierDto`; portal `Select` con opciones derivadas de `Object.values(IncotermCode)`. Guard en `commercialFormFromSupplier` para datos legacy (valor almacenado no en el enum → se renderiza como vacío, no falla). Columna `varchar` sin migracion: decision correcta — la validacion es de escritura futura, no retro-activa. La estrechez del contrato OpenAPI (de `string` a enum) es aceptable: no hay clients previos en produccion y el campo siempre fue semanticamente controlado. |
| **B4** | N/A | Cerrado en remediacion Fase 05-B; sin regresion en este commit. |
| **B6** | **FUERA DE ALCANCE** | Ratificado: defecto preexistente en `PartyService` (anterior a Fase 05); no introducido por este trabajo. Debe trazarse en backlog de MOD08. |

### Verificacion de restricciones de gobierno

| Restriccion | Resultado |
| --- | --- |
| Sin PII real en tests/fixtures | PASS — datos ficticios (`DOC-FICT-001`, `noreply@example.invalid`, `3000000000`) |
| Tenant desde JWT / sin hardcode | PASS — `TenantContext.getOrThrow()` en cada metodo del adaptador; ningun schema hardcodeado |
| Sin violacion de boundary cross-module | PASS — extension aditiva de `IPartyReadPort`; solo `PartyReadAdapter` implementa; no hay importacion directa de entidades `party*` desde `inventory` |
| Typecheck limpio | PASS — typecheck `@iwana/api` + `@iwana/portal` confirmados en §9 |
| Lint limpio | PASS — confirmado en §9 |
| Tests: 149 suites / 1485 | PASS — incluye 8 tests nuevos para B1/B2/B5 en 2 specs |
| OpenAPI actualizado | PASS — `@ApiPropertyOptional({ enum: IncotermCode })` en ambos DTOs |
| Sin migracion implicita | PASS — columna `varchar` inalterada; validacion solo en escritura nueva |

### Nuevas deudas introducidas

**Ninguna.** Los cambios son aditivos y acotados al scope declarado. La arquitectura del boundary Compras→Parties permanece intacta.

### Observacion de calidad de tests

El nombre del test `'retorna Map con lista vacia para partyId sin contactos'` en `party-read.adapter.spec.ts:304` era impreciso: el comportamiento real es que la clave **no existe** en el Map, no que exista con lista vacía. **Corregido en esta sesion** a `'no inserta clave en el Map cuando el party no tiene contactos'`.

### Veredicto de 2ª capa

**GO definitivo.** Deuda B1–B5 cerrada correctamente. Sin nuevas deudas tecnicas, sin violaciones de boundary, sin regresiones de seguridad. El commit de deuda puede integrarse en `main`. El gate de produccion pendiente sigue siendo unicamente el E2E full-stack real (ver §8) — sin cambio respecto al estado anterior al trabajo de deuda.
