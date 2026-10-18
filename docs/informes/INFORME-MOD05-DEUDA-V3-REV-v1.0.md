# INFORME MOD05 Deuda de código — V3 Revisión de boundary y contratos v1.0

| Campo | Valor |
| --- | --- |
| Fase | MOD05 Deuda de código, ola V (verificación) |
| Fila del launcher | V3 de `docs/prompts/PROMPT-MOD05-DEUDA-CODIGO-LAUNCH-v1.1.md` |
| Perfiles | `boundary-reviewer` ∥ `contract-drift-reviewer` (solo lectura) |
| Diff | `09af7f60^..e2348a42` |
| Contrato | `PROMPT-MOD05-DEUDA-CODIGO-v1.0.md` + delta `-v1.1.md` |
| Fecha | 2026-10-17 |
| Estado | Emitido |

## 1. Veredicto

| Mitad | Veredicto | P0 | P1 | P2 | P3 |
| --- | --- | --- | --- | --- | --- |
| Boundary | **GO** | 0 | 0 | 1 | 4 |
| Contratos | **NO-GO condicionado a CD-01** | 0 | 1 | 4 | 3 |
| **V3 consolidado** | **NO-GO hasta cerrar CD-01** | 0 | 1 | 5 | 7 |

Mínimo para GO: cerrar CD-01 con su test. Antes del cierre G6, cerrar CD-02, CD-03 y CD-04 y B-01, o aceptarlos por escrito. CD-04 y B-01 requieren una decisión de AI-EM-ARCH.

El orquestador comprobó CD-01 contra el código: `search()` (`subscribers.service.ts:974`) no llama a `hydrateLegalRepresentativeDisplayNames`. Esa función solo se invoca en `:690` (`findAll`) y `:730` (`findById`). El archivo del árbol de trabajo coincide con `e2348a42`.

La revisión es estática (lectura, grep y specs). No se ejecutaron tests.

## 2. Hallazgos — boundary

| ID | Sev. | Archivo:línea | Descripción | Recomendación |
| --- | --- | --- | --- | --- |
| B-01 | P2 | `apps/api/src/modules/crm/subscribers/subscribers.service.ts:286-312` | `create()` repite a mano la regla fiscal (IVA, RUT, NIT+DV y representante) sin pasar por `SubscriberFiscalCompletenessService`. Usa otro código y estado: 400 `SUBSCRIBER_FISCAL_DATA_REQUIRED` en lugar de 422 `SUBSCRIBER_FISCAL_DATA_INCOMPLETE`. Es una regla de entrada del alta, no la de activación, pero un cambio de regla obliga a tocar dos sitios. | AI-EM-ARCH decide si es una regla distinta (se documenta en el HLD con su código) o una copia (en ese caso, reutilizar `evaluate()` o `SUBSCRIBER_FISCAL_MISSING_FIELDS`). |
| B-02 | P3 | `subscribers.service.ts:188-189`, `:1044-1066` | `IPartyReadPort` se inyecta con `@Optional()`. Si falta, `legalRepresentative` sale `null` en silencio. En producción el puerto está cableado. | Quitar `@Optional()` o fallar explícitamente. Es el patrón previo del servicio, no una regresión. |
| B-03 | P3 | `packages/database/src/migrations/tenant/157_subscriber_fiscal_completeness.ts:15-24` | El CHECK `ck_subscribers_fiscal_complete_when_active` codifica un subconjunto de la regla (IVA y representante; no RUT ni DV). Es `NOT VALID`. | Documentarlo como subconjunto de defensa en profundidad. La fuente sigue siendo el servicio. |
| B-04 | P3 | `apps/portal/src/components/crm/subscribers/SubscriberSections.tsx:338-343`, `SubscriberForm.tsx:104-105`, `subscriber-fiscal.ts` | Validación de UX duplicada en el cliente, incluida la copia del DV (ver CD-05). La API es la autoridad. | Aceptable si se garantiza la paridad del DV (CD-05). |
| B-05 | P3 | `apps/api/src/modules/parties/privacy/party-titular-erasure.participant.ts:10-15` | `parties` importa `FieldRule` y tipos de `crm/privacy-adapters/...` y `crm` importa el participante de `parties`: es un ciclo de archivos. Viene de antes (156bc93d); este diff solo cambia la línea 18. | Fuera de alcance. Registrar como deuda y mover los tipos a una ubicación común. |

### Verificado sin hallazgo (boundary)

- **CRM → parties solo por puerto.**
  - Fuera de los specs, `crm/**` solo importa `IPartyWritePort`, `IPartyReadPort` y `PartiesModule` (`subscribers.module.ts:17`). Además están los imports del adaptador de privacidad, que vienen de antes (B-05).
  - No hay entidades, repositorios ni servicios de `parties` en `crm`.
  - No hay SQL cruzado contra `party` ni `party_role`.
  - El representante se escribe con `partyWritePort.ensurePartyWithRole(..., LEGAL_REPRESENTATIVE, { manager: qr.manager })` en `create` (`:459-477`) y en `update` (`:888-907`), dentro de la transacción tenant.
- **Fuente única de la completitud fiscal.**
  - Fuente: `subscriber-fiscal-completeness.service.ts`.
  - Consumidores: `subscriber-status-transition.service.ts:155-156` (paso a ACTIVE), `contracts.service.ts:142` (`create`), `contracts.service.ts:221` (`createFromExpediente`) y `subscribers.controller.ts:728` (proyección).
  - Ningún camino crea un suscriptor ACTIVE sin pasar por la regla.
  - No hay ciclo entre módulos: `ContractsModule → SubscribersModule`.
- **Tenancy.**
  - Las migraciones 153-157 no califican el schema; la 154 resuelve el enum con `current_schema()`.
  - Las consultas nuevas corren en `runInTenantSchema` con `qr.manager`.
  - El tenant sale de `TenantContext`, sin literales ni `search_path` fijado.
- **Migraciones.**
  - 153-157 están registradas en `runner.ts` y `revert.ts`.
  - La 154 protege su `down()` destructivo con `IWANA_ALLOW_DESTRUCTIVE_TENANT_DOWN`.
  - La 157 aborta si encuentra NULLs.

## 3. Hallazgos — contratos

| ID | Sev. | Archivo:línea | Descripción | Recomendación |
| --- | --- | --- | --- | --- |
| CD-01 | **P1** | `apps/api/src/modules/crm/subscribers/subscribers.service.ts:974-1044` (`search()`), consumido en `subscribers.controller.ts:378-383` | `POST /crm/subscribers/search` (búsqueda exacta) no hidrata el nombre del representante: `legalRepresentative` sale siempre `null` aunque haya `legalRepresentativePartyId`. Es el mismo caso que el precedente `listItemUsage()`: un campo de contrato que la proyección no devuelve. | Hidratar en `search()` igual que en `findAll()` y agregar un test de la ruta exacta con un JURIDICA con representante. |
| CD-02 | P2 | `subscribers.service.ts:75-98` frente a `packages/shared/src/schemas/subscriber.schema.ts:26-39, 289-290` | El schema de `PATCH /:id/section/:section` duplica `legalRepresentative` y su `rutResponsibilities` no tiene `.min(1)` ni unicidad. Por esa ruta se puede guardar `[]` o códigos repetidos, saltándose v1.0 §2.2. | Exportar `rutResponsibilitiesSchema` y `legalRepresentativeSchema` desde shared y reutilizarlos. Agregar un test de paridad entre las dos rutas de edición. |
| CD-03 | P2 | `subscriber.schema.ts:269`, `subscribers.service.ts:84`, `:833-843` | En la edición, el DV es `z.string().max(1)`, sin `^\d$`. Si cambia el NIT sin enviar DV y la fila no tenía DV, la edición se acepta. Incumple v1.0 §3 R3. | Aplicar el mismo regex que en el alta y responder 400 si cambia el NIT y no queda DV. Agregar el test HTTP de R3 en edición. |
| CD-04 | P2 | `subscribers.controller.ts:760-781` | En modo `privacyRestricted`, el detalle anula `vatResponsibility`, `rutResponsibilities` y `fiscalCompleteness`. El listado sí los emite, y los tipos de shared no los declaran nullables. | Decisión de AI-EM-ARCH. Se recomienda añadirlos a `allowed`, porque no son PII. |
| CD-05 | P2 | `apps/portal/src/components/crm/subscribers/subscriber-fiscal.ts:47-58` frente a `apps/api/src/common/crypto/nit-verification-digit.util.ts:3-17` | La copia del DV en el portal no tiene test de paridad con la de la API, y los vectores de 15 dígitos y de borde solo están en el portal. Hay además una tercera copia de 11 pesos en `apps/portal/src/components/inventory/SupplierFormDrawer.tsx:89-99`, fuera de alcance. | Mover la función a `@iwana/shared`, o fijar los mismos vectores en ambos specs. La tercera copia queda como deuda. |
| CD-06 | P3 | `subscriber-fiscal.ts:65-73`, `JuridicaPersonFields.tsx:25`, `SubscriberForm.tsx:278` | Si se escribe `900123456-8` en el campo NIT, la API separa el DV y lo acepta, pero el portal calcula sobre los 10 dígitos y muestra «no coincide». | Normalizar en el portal igual que la API, o restringir el campo a dígitos. |
| CD-07 | P3 | `subscribers.controller.ts:240-298` | El OpenAPI de `SubscriberListItem` no lista `vatResponsibility`, `rutResponsibilities` ni `legalRepresentative`. Tampoco listaba `taxRegime`, así que la omisión es anterior al diff. | Agregar los campos al schema OpenAPI. |
| CD-08 | P3 | `packages/shared/src/schemas/subscriber.schema.spec.ts` | Ningún test fija `SUBSCRIBER_FISCAL_DATA_INCOMPLETE` ni los 4 literales de `SUBSCRIBER_FISCAL_MISSING_FIELDS`. | Agregar un test de contrato pequeño. |

### Verificado sin deriva (contratos)

- **Shared:** `VatResponsibility`, los 5 códigos de `RUT_RESPONSIBILITIES` (iguales a v1.0 §2.2 y al CHECK de la 153), `PartyRoleType.LEGAL_REPRESENTATIVE`, `TaxRegime` marcado `@deprecated`, el DV `^\d$` en el alta y `legalRepresentative` estricto.
- **422:**
  - Un único emisor, `assertComplete`, que lanza `UnprocessableEntityException({ code, message, missing })` sin PII.
  - Ningún filtro global reescribe el cuerpo; el único `APP_FILTER` es `TenantContextMissingFilter`.
  - El portal lo lee en `api-client.ts:794-800` y `readFiscalDataIncompleteError`.
- **Consumidores del 422 en el portal:** `SubscriberStatusTransitionDialog.tsx:161`, `CreateContractDialog.tsx:328` y `ConvertExpedienteToContractDialog.tsx:158`, todos con `FiscalDataIncompleteAlert`. Las etiquetas salen de un `Record` exhaustivo.
- **Proyección y DTO:**
  - Se retiró `legalRepresentativeId` de las respuestas.
  - El documento del representante no se expone.
  - `findAll`, `findById` y `update` (que pasa por `findById`) hidratan el nombre.
- **DV del portal frente al de la API:** mismos pesos `[3,7,13,…,71]`, misma normalización `\D`, mismo límite de 15 dígitos y misma regla `% 11` (`r<2 → r`, si no `11-r`). La única diferencia es la de CD-06.

## 4. Derivaciones

- A V2 (`sec-eng`): el cifrado y HMAC del documento fiscal, el CLI `backfill-fiscal-document` y `fiscal-document.util.ts`. V3 no los evaluó.
- A AI-EM-ARCH: B-01 (regla del alta frente a regla de activación) y CD-04 (campos fiscales en modo restringido).
- A deuda fuera de fase: B-05 (ciclo `parties` ↔ `crm/privacy-adapters`) y la tercera copia del DV en `SupplierFormDrawer.tsx`.

## 5. Siguiente paso

Corregir CD-01 (sr-backend, con test) antes de V4. Después, gate-verifier (V4) corre sobre el árbol corregido.
