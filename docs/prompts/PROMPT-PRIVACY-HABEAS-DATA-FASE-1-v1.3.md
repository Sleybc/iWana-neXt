# PROMPT DE EJECUCIÓN — Módulo `privacy` · Habeas Data · Fase 1 (ADR-094)

**Version:** 1.3 — sucede a [v1.2](PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.2.md) (superado). Cadena de fuentes: v1.3 → v1.2 → v1.1 → v1.0; cada versión rige en lo que la siguiente no cambia
**Estado:** Emitido — G4 vigente
**Fecha:** 2026-10-14
**Emisor:** AI-EM-ARCH (modo Orchestrator)
**Plan:** [2026-10-14-privacy-habeas-data-fase-1.md](../plans/2026-10-14-privacy-habeas-data-fase-1.md) v1.3

## 0. Estado de la Ola 2-bis + Ola 2

| Bloque | Estado verificado por AI-EM-ARCH |
| --- | --- |
| Q1Δ | ✅ 146 `up/down/up` con 6 tests contra Postgres real; triggers y CHECK de A10, A12, A13 y A17 |
| Q2Δ | ✅ A12, A14, A15 y A16; idempotencia de `sourceRef` contra Postgres (1/1) |
| Q3Δ | ✅ A10, A11, A13, A17 y A19; integración real 9/9 |
| Q4Δ | ✅ Spec v1.2 con 52 CA, **ratificada** con la precisión de §17 (CA-53) |
| Q5 | ✅ A17 (CRM), A18, A20, A21; integración real 15/15. `boundary-reviewer` sin hallazgos. Un solo `forwardRef` (`privacy.module.ts:64`) |
| Q6 | ✅ A19 en la API; integración real 1/1. Métrica solo en logs (P2: no hay backend de métricas) |
| Gate combinado | API 350 suites / 4.847 tests; shared 18 / 166; typecheck 4/4; 0 en caché |

**Verificado en el código:**
- El adaptador de suplantación usa el `manager` recibido.
- La actualización está protegida por `status = ACTIVE`.
- El evento `crm.contract.suspended` sale en `afterTransactionCommit`.
- No hay listeners de ese evento: la suspensión equivale, en efecto, a la manual de `ContractsService.suspend`, que tampoco emite. Queda como deuda P3: el adaptador replica la regla de transición en lugar de reutilizarla.

## 1. Adenda v1.3

### A22. Identidad pendiente: traslado y no legitimación (defecto del emisor)

A1 (v1.1) dijo «identidad obligatoria para pasar a `EN_TRAMITE`». La DDL la extendió a `NO_PROCEDENTE` y `TRASLADADA`. Con eso:
- es **imposible rechazar** a quien no acredita legitimación: el fundamento `SOLICITANTE_NO_LEGITIMADO` presupone la identidad **no** verificada, y hoy `reject` choca con el CHECK y falla en la base;
- es **imposible trasladar** dentro de los 2 días hábiles una solicitud de un solicitante aún sin verificar, aunque el traslado depende de la competencia, no de la identidad.

**Corrección:**

| Capa | Cambio |
| --- | --- |
| DDL (146, no commiteada) | `ck_data_subject_requests_verified_before_processing` exige identidad solo para `EN_TRAMITE`, `PRORROGADA` y `RESUELTA`. Nuevo `CHECK (status <> 'NO_PROCEDENTE' OR identity_verified_at IS NOT NULL OR legal_basis = 'SOLICITANTE_NO_LEGITIMADO')` |
| Servicio | `transfer` no exige identidad. `reject` sin identidad solo admite `legalBasis = SOLICITANTE_NO_LEGITIMADO`; con otro fundamento → 422 `PRIVACY_REQUEST_IDENTITY_REQUIRED`. `complete` sigue exigiéndola |
| UI | Spec §17, CA-UX-PRIV-53 |

### D-POT. `PotentialsModule` montado por primera vez (decisión del CTO)

- `PotentialsModule` **nunca estuvo registrado** en `CrmModule`.
- Q5 lo montó con autorización del CTO para completar A18.
- Ni `apps/portal` ni `apps/web` consumen `/crm/potentials`.
- Quedan expuestos tres endpoints sin auditar (`POST`, `GET` y `POST :id/qualify`), aunque protegidos por JWT, rol y permiso.

**El supuesto de A18 era mío: di por hecho que la superficie estaba viva.**

- **Recomendación de AI-EM-ARCH:** desmontarlo, es decir, revertir las 2 líneas de `crm.module.ts` y su spec. La captura queda lista en `PotentialsService` para cuando el roadmap de CRM monte la superficie.
- **Si el CTO lo mantiene:** `sec-eng` incluye `/crm/potentials` en el cierre de la Ola 4.

### A23. Proyección del detalle de solicitudes (v1.3.1 · cierra el `[BLOQUEO]` de Q7)

**Causa: defecto del emisor.** v1.1 A1 decía «la respuesta los devuelve solo a quien tiene `privacy.manage`», pero no definió la forma del detalle. `toPublicRequest` omite, con razón, todo lo de identidad.

**Contrato.** `GET /privacy/requests/:id` (`privacy.read`) devuelve `{ request, events, tasks }`. Además de los campos actuales, `request` añade:

```ts
identityStatus: 'PENDIENTE' | 'VERIFICADA';                 // siempre; derivado de identity_verified_at
identityVerificationMethod: IdentityVerificationMethod | null; // siempre; no es PII
identityVerifiedAt: string | null;                         // siempre
hasRequesterEvidence: boolean;                             // siempre; NUNCA el mediaId
requester: { name: string; documentType: DocumentTypeParty; document: string; contact: string } | null;
// requester ≠ null SOLO si quien llama tiene el permiso efectivo privacy.manage
```

**Reglas:**
- **Permiso:** `privacy.manage` se evalúa con `EffectivePermissionsService`, el mismo evaluador de `PermissionsGuard`, nunca por rol.
- **Respuesta con `requester`:** lleva `Cache-Control: no-store` y genera una auditoría explícita `operation: 'REQUEST_IDENTITY_VIEWED'`, con `requestId` y sin PII.
- **Actor:** no se expone `identity_verified_by` ni el `actor_id` de los eventos (CA-26). El detalle muestra el método y la fecha. Quién verificó queda en la auditoría.
- **Deuda P3 (Fase 2):** nombres de actores en el detalle, mediante un puerto de lectura de usuarios.
- **Fuera de la proyección:** el listado y `RequestSummary` no cambian.

**Navegación (P2 de Q7).** Q7 añade a su propiedad la entrada **Privacidad** de `apps/portal/src/components/layout/Sidebar.tsx`, visible con `privacy.read`. Solo esa entrada.

### A24. El canal es el medio del titular, no la superficie (v1.3.2 · cierra el P1 de Q7)

**Causa: defecto del emisor en A18 (v1.2).** «`channel` lo fija el servidor según la superficie» confundió dos datos distintos:
- **Medio:** cómo otorgó o retiró la autorización el titular (`ConsentChannel`: `TELEFONO`, `PRESENCIAL`, `EMAIL`, `MENSAJE_TEXTO`, `MENSAJERIA_INSTANTANEA`). Es un **hecho probatorio** (Decreto 1377 art. 7: escrito, oral o conducta inequívoca), y solo el operador lo conoce.
- **Superficie:** dónde se registró en el sistema. No es prueba y ya se deriva de `source_ref`, `captured_by` y la auditoría.

**Efectos verificados en el árbol (sin commitear):**
- la conversión sobrescribe el medio original del expediente con `'CRM_CONVERSION'` (`subscribers.service.ts:411,432`), lo que **destruye prueba**;
- el alta directa graba `'CRM_ALTA'` (`:465`);
- la ficha 360° graba `'FICHA_360'` (`CompliancePanel.tsx:75`);
- Q7 deshabilitó la captura en el expediente.

**Sin captura en el expediente, toda conversión nueva cae en 422 por falta de `TRATAMIENTO_CONTRACTUAL`. El árbol actual no se puede commitear.**

**Contrato:**

| Punto | Regla |
| --- | --- |
| `data_authorizations.channel` | El medio. `ConsentChannel` es obligatorio salvo con `kind = LEGACY_IMPORT`, que conserva el valor histórico. Se valida en Zod y en el puerto A15; **sin DDL nuevo** (el backfill trae valores heredados) |
| Superficie | No se persiste como canal. Se eliminan `CRM_ALTA`, `CRM_CONVERSION`, `CRM_EXPEDIENTE`, `CRM_POTENCIAL` y `FICHA_360` |
| Expediente (`POST /crm/expedientes/:id/consents`) | Sin cambios: ya exige `ConsentChannel`. El portal reactiva la captura con el selector de medio |
| Conversión | Traspasa el `channel` original de cada `consent_records`. Si no es un `ConsentChannel` válido, va como `LEGACY_IMPORT` |
| Alta directa | `CreateSubscriberSchema` añade `authorizationChannel: ConsentChannel`, obligatorio cuando hay `authorizations`: un medio por acto de alta |
| `POST /privacy/authorizations` | `channel: z.nativeEnum(ConsentChannel)`, en lugar de `string ≤ 64` |
| Potenciales | `consentChannel` pasa a `ConsentChannel`, se mantenga o no D-POT |
| UI | Spec §17: CA-33 se reemplaza |

## 2. Bloques

### Q3Δ3 · `sr-backend` — A23 (antes de Q7)

**Propiedad:** `privacy/requests/**` y `schemas/privacy/requests*`.

**Stop/go:**
- turbo API `--force`;
- tests del detalle con y sin `privacy.manage`, que comprueban `requester` nulo, que nunca se expone `mediaId` ni actor, el `no-store` y la auditoría sin PII;
- integración contra Postgres real con una solicitud pendiente y otra verificada con evidencia.

### Q2Δ4 · `sr-backend` — A24 (lado `privacy`)

**Propiedad:** `privacy/authorizations/**` y `schemas/privacy/authorizations*`.

**Cambio:** `channel` como `ConsentChannel` en el DTO y en el puerto A15 (salvo `LEGACY_IMPORT`). Se ajustan los specs que usan `'FICHA_360'` o `'CRM_CONVERSION'`.

**Stop/go:** turbo `api` + `shared` `--force`, con tests de canal inválido → 400 y de `LEGACY_IMPORT` con valor histórico → aceptado.

### Q5Δ1 · `sr-backend` — A24 (lado CRM)

**Propiedad:** `crm/subscribers/**`, `crm/potentials/**` y `packages/shared/src/schemas/subscriber.schema.ts`.

**Cambio:**
- la conversión traspasa el medio original;
- el alta directa usa `authorizationChannel`;
- `consentChannel` de potenciales pasa a enum.

**Stop/go:**
- turbo API `--force`;
- integración real: un expediente con consentimiento `TELEFONO` convertido deja la autorización con `TELEFONO`, y repetir la conversión no duplica;
- alta directa sin `authorizationChannel` → 400.

### Q7Δ1 · `fe-platform` — A24 (portal)

**Propiedad:** `ConsentsPanel.tsx`, la sección de autorizaciones de `SubscriberForm.tsx` y `components/privacy/CompliancePanel.tsx`.

**Cambio:**
- se reactiva la captura en el expediente con el selector de medio;
- el alta y la ficha 360° piden el medio una vez por acto.

Rótulos: Teléfono, Presencial, Correo electrónico, Mensaje de texto, Mensajería instantánea.

**Stop/go:**
- turbo portal `--force`;
- `audit-ui.mjs`;
- tests de CA-31, CA-33 (nuevo) y CA-50;
- e2e: capturar en el expediente → convertir → ver la autorización con el medio en la ficha 360°.

### Ola 3-pre — deltas A22 (✅ cerrados el 2026-10-14: Q1 v1.3 10+3 tests; Q3 v1.3 10/10 y API 351 / 4.852)

**Q1Δ2 · `data-eng`**
- **Propiedad:** la 146 y sus specs.
- **Cambio:** los dos CHECK de A22.
- **Stop/go:** `up/down/up` contra Postgres real. Cuatro tests: `NO_PROCEDENTE` sin identidad con `SOLICITANTE_NO_LEGITIMADO` pasa; con otro fundamento falla; `TRASLADADA` sin identidad pasa; `RESUELTA` sin identidad falla.

**Q3Δ2 · `sr-backend`**
- **Propiedad:** `privacy/requests/**` y `schemas/privacy/requests*`.
- **Cambio:** las guardas de A22.
- **Stop/go:** turbo API `--force`, más una integración real de `reject` y `transfer` sin identidad.

### Ola 2 (cont.) — Q7 · `fe-platform` (spec v1.2 ratificada, §17 incluida)

**Propiedad:**
- `apps/portal/src/components/privacy/**` (nuevo);
- la ruta `apps/portal/src/app/dashboard/privacy/**`;
- la sección `privacy` de `apps/portal/src/lib/api-client.ts`, más los campos `habeasData`, `arcoRequests` y `privacyMarks` de la vista 360° y `privacyMarks` de los listados;
- en la ficha 360° (`SubscriberDetailClient.tsx`, `SubscriberTabsContainer.tsx`, `ServiciosTab.tsx`), solo los paneles de autorizaciones, solicitudes y marcas de **Cumplimiento** y la selección de contratos impugnados;
- `SubscriberForm.tsx`, solo la sección de autorizaciones del alta;
- `ConsentsPanel.tsx`, solo la versión vigente;
- `CreateContractDialog.tsx` y `ConvertExpedienteToContractDialog.tsx`, solo el manejo de los 422 `SUBSCRIBER_DATA_AUTHORIZATION_REQUIRED`, `CONTRACT_DATA_AUTHORIZATION_REQUIRED` y `PRIVACY_LEGAL_TEXT_NOT_PUBLISHED`;
- el banner de marcas en `SubscribersListClient.tsx` y en la vista de lista de expedientes (`expediente-list-view.ts`).

**Reglas:**
- No toca el backend ni los contratos de `@iwana/shared`.
- Si falta un campo, emite `[BLOQUEO]`.
- Con A22 pendiente, la UI de CA-53 se prueba con la API mockeada. La verificación real ocurre en el cierre.

**Stop/go:**
- `pnpm exec turbo run test --filter=@iwana/portal --force`, con conteo real;
- `.agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sin reglas duras violadas;
- un test por CA (de CA-01 a CA-53, con la tabla CA ↔ test en el informe);
- un e2e Playwright de radicar → verificar identidad → completar → resolver;
- un e2e de suplantación desde la ficha 360°.

## 3. Después

### D-F1A. División de la Fase 1 (recomendación de AI-EM-ARCH; decide el CTO)

**Fase 1a:** núcleo, solicitudes, suplantación, alertas, CRM y portal (Q1 a Q7, A1 a A24). Se cierra **ahora** con la Ola 4a, para llegar a G6 antes de que rija la Ley 2573 (19-nov).

**Fase 1b:** Q8, bloqueo y anonimización, **después**. Su contrato de v1.0 no pasa la pasada regla → campo. Quedan abiertos:
1. **Dónde vive el bloqueo.** CRM no puede leer `party_privacy_marks`. La propuesta es una marca en Party (`processing_blocked_at`) escrita por `IPersonalDataBlockPort` en `parties`, con migración 148.
2. **Índice de búsqueda.** Hay que trazar `search-index.processor.ts` para retirar y reindexar a quien está bloqueado o anonimizado.
3. **Prospectos sin Party.** La supresión que procede casi siempre es la de un prospecto; hay que borrar por HMAC de documento en expedientes y potenciales.
4. **Qué se conserva.** La factura se queda 10 años, en el módulo de facturación. `data_authorizations` es de solo-anexar y guarda `ip`. La solicitud misma es la prueba de cumplimiento.
5. **Disparo.** Si `resolve` de SUPRIMIR ejecuta la anonimización en la misma transacción, con confirmación explícita.

AI-EM-ARCH emite el contrato Q8 v1.0 con esa pasada antes de lanzarlo. Q8 **no** está en la ruta crítica de la Ley 2573.

### Ola 4a — cierre de la Fase 1a

**Precondición de entorno (CTO):** `pnpm db:backup` y luego `pnpm db:migrate:all` sobre `dbiw`, para aplicar las públicas 026 y 027 y las tenant 145 a 147. Sin esto no hay E2E contra la API real.

| Bloque | Subagente | Alcance | Stop/go |
| --- | --- | --- | --- |
| C1 | `sec-eng` | ASVS L2 sobre `/privacy/**` y las superficies CRM tocadas. Revisa: solo-anexar y triggers; evidencia (carga, firma de 300 s, `no-store`, auditoría); proyección A23 por permiso; suplantación (pertenencia, transacción, autorización); ausencia de PII en logs, auditoría, colas y correos; `/crm/potentials` si D-POT se mantiene | GO/NO-GO con hallazgos por severidad |
| C2 | `sr-qa` | Matriz CA ↔ test (CA-01 a CA-53, con el CA-33 reemplazado), verificada test por test. Tabla de plazos legales. Cobertura ≥ 80 % en statements y branches de `apps/api/src/modules/privacy/**`. E2E de Playwright **contra la API levantada** sobre `dbiw` migrada: radicar → verificar → completar → resolver; suplantación desde la ficha 360°; capturar en el expediente → convertir → ver el medio. Cobertura de interacciones (P2 de Q7) | Conteos reales sin caché; ningún E2E simulado |
| C3 | `boundary-reviewer` ∥ `contract-drift-reviewer` | Diff completo de la Fase 1a | Sin hallazgos bloqueantes |
| C4 | `gate-verifier` | «Gates Before Merge» de `api`, `shared`, `db`, `portal` y `worker` | Evidencia con comandos y conteos |
| C5 | `docs-governance` | `docs/` modificados en la fase | Sin bloqueantes |

C1, C2 y C3 corren en paralelo; C4 y C5 al final. Los hallazgos vuelven a su dueño (Q1 a Q7) mediante un delta que emite AI-EM-ARCH. Ningún revisor corrige.

**Después de la Ola 4a:**
- AI-EM-ARCH consolida `INFORME-PRIVACY-FASE-1A-CIERRE-G6-v1.0.md`.
- G6.5: la 027 pública en CI.
- Antes de G7: `HLD-PRIVACY-v1.0`.

## 4. Ola 4a: NO-GO y Ola 4a-bis (v1.3.3)

### Disposición de los hallazgos

**Decisiones del CTO (2026-10-14):**
- **D-F1A aprobada:** Q8 sale a la Fase 1b.
- **D-POT:** desmontar. Hecho: `crm.module.ts` y su spec vuelven a `main`, y `PotentialsModule` no está registrado.
- **Checkpoint commiteado:** `91283057`, `15bda462` y `a5a78672`.

| Hallazgo | Severidad | Decisión | Dueño |
| --- | --- | --- | --- |
| SEC-01: `proof` sin `no-store` ni auditoría | P1 | Igualar a A11: `Cache-Control: no-store` y auditoría explícita `AUTHORIZATION_PROOF_VIEWED`, con `authorizationId` y sin PII | R1 |
| SEC-02: storage local sin vencimiento | P2 | **No bloquea G6.** Producción obliga MinIO (`app.config.ts:351-354`). Deuda para `plat-ops`: el adaptador local debe respetar el TTL o servir solo con token. Regla: no cargar datos reales con storage local | `plat-ops` (deuda) |
| BOUNDARY: el adaptador CRM escribe `AuditLog` directamente | Bloqueante | **A25** (abajo). Además, la escritura directa se salta `sanitizeAuditPayload` | R2 |
| DRIFT P1: evidencia (`requests.controller.ts:223`) e inventario (`inventory.controller.ts:43`) sin envoltura `data` | P1 | La convención del módulo es `{ data }` (los demás controladores de `privacy` la usan). **Corrige el productor**, con su OpenAPI | R1 |
| DRIFT P2: `api-client.ts` tipa enums como `string` | P2 | Usar los tipos inferidos de `@iwana/shared` en filtros y cuerpos de transición | R3 |
| QA: C2 no corrió | Bloqueante | Precondición del CTO **pendiente**: `pnpm db:backup` y `pnpm db:migrate:all` sobre `dbiw` | CTO → R4 |
| Cobertura `privacy`: 54,33 % de statements y 32,57 % de branches | Bloqueante | Llevar a ≥ 80 / 80 con tests de servicio y controlador, no solo de integración | R4 |
| DOCS: §Lanzamiento del plan apuntaba a LAUNCH v1.1 | Bloqueante | Corregido por AI-EM-ARCH en el plan v1.5 | ✅ |
| DOCS menor: patrón `ADR-094-…` | Menor | Es la convención del catálogo de ADR (79 indexados). No requiere cambio | — |
| DOCS menor: launchers sin fecha ni estado | Menor | A partir de LAUNCH v1.7 llevan `Fecha` y `Estado` | ✅ |

### A25. Auditoría dentro de la transacción del llamador

El módulo `audit` publica:

```ts
AuditService.logWithin(entry: AuditEntryInput, manager: EntityManager): Promise<void>
```

| Aspecto | Regla |
| --- | --- |
| Escritura | Con el `manager` recibido, cuyo `search_path` ya fijó el llamador |
| Saneado | Aplica `sanitizeAuditPayload` |
| Tenant | Resuelve `tenantId` igual que `log()` |
| Errores | **Los propaga**: forma parte de la transacción. Si la auditoría de la suspensión falla, la suplantación se revierte |
| `log()` | Sin cambios: sigue aislado y sin propagar |

El adaptador de suplantación usa `logWithin`. Ningún módulo fuera de `audit` crea `AuditLog`.

### Bloques de la Ola 4a-bis

| Bloque | Subagente | Propiedad | Stop/go |
| --- | --- | --- | --- |
| R1 | `sr-backend` | `privacy/authorizations/**` (SEC-01), `privacy/inventory/**` y `privacy/requests/requests.controller.ts` (envolturas), `privacy-openapi.schemas.ts` | turbo `api` + `shared` `--force`; tests HTTP de `no-store`, auditoría sin PII y envoltura `{ data }` en los tres endpoints |
| R2 | `sr-backend` | `apps/api/src/modules/audit/**` (solo `logWithin` y sus tests) y `crm/privacy-adapters/**` | turbo API `--force`; integración real: un fallo de auditoría revierte la suspensión; el payload sale saneado; `grep` sin `AuditLog` fuera de `audit` |
| R3 | `fe-platform` | `apps/portal/src/lib/api-client.ts` (sección `privacy`) y sus specs | turbo portal `--force`; typecheck; tests de Ver evidencia e inventario contra la respuesta con `{ data }` |
| R4 | `sr-qa` | Solo tests: `apps/api/src/modules/privacy/**/*.spec.ts`, `e2e/tests/portal-privacy*` | Arranca **tras** R1–R3 y la precondición del CTO. Matriz CA-01 a 53; plazos; cobertura ≥ 80 % de statements y branches de `privacy`; tres E2E contra la API real; conteos sin caché |

**Re-verificación (después de R1 a R4, solo lectura):** `sec-eng` revisa SEC-01; `boundary-reviewer` revisa A25; `contract-drift-reviewer` revisa la envoltura y los enums; `gate-verifier` corre los cinco paquetes; `docs-governance` revisa el plan v1.5. Después, AI-EM-ARCH consolida `INFORME-PRIVACY-FASE-1A-CIERRE-G6-v1.0.md`.
