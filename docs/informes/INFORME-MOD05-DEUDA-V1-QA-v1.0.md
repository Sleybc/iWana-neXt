# INFORME — MOD05 · Deuda de código · V1 QA (E2E contra la API real)

**Versión:** 1.0 · **Fecha:** 2026-10-17 · **Emisor:** AI-SR-QA (`sr-qa`)
**Encargo:** fila V1 de [PROMPT-MOD05-DEUDA-CODIGO-LAUNCH-v1.1.md](../prompts/PROMPT-MOD05-DEUDA-CODIGO-LAUNCH-v1.1.md), sobre el contrato [v1.0](../prompts/PROMPT-MOD05-DEUDA-CODIGO-v1.0.md) §0–§3 y §5 y el delta [v1.1](../prompts/PROMPT-MOD05-DEUDA-CODIGO-v1.1.md).
**Plan:** [2026-10-17-mod05-deuda-codigo.md](../plans/2026-10-17-mod05-deuda-codigo.md) · **Base:** `main` en `e2348a42`.
**Skills leídas:** `e2e-testing-patterns`, `playwright-skill`, `iwana-test-evidence` y `verification-before-completion`.

## 1. Veredicto

**NO-GO para G6 en V1.** Hay dos criterios de aceptación de la ola en rojo, un defecto crítico abierto y uno alto:

| Defecto | Severidad | Efecto sobre V1 |
| --- | --- | --- |
| **DEF-01** | Crítica (preexistente, expuesta por V1) | Ningún alta manual de suscriptor es posible por HTTP. El caso 1 positivo («con DV, RUT y representante → alta») no puede pasar |
| **DEF-02** | Alta (introducida por B2) | El `/360` no descifra el documento fiscal. La pantalla no lo muestra (caso 3) y la edición del contrato desde el detalle queda bloqueada |

El resto de lo pedido está en verde contra la API real:
- conversión desde el expediente sin inferir datos fiscales;
- el aviso «Faltan datos fiscales…»;
- los 422 con `missing` exacto al activar y al contratar;
- el documento fiscal solo cifrado en la base;
- la supresión sobre las columnas nuevas;
- el mapeo de la 153 en filas heredadas;
- la regresión de la Fase 1b.

## 2. Entorno y precondiciones

| Ítem | Evidencia |
| --- | --- |
| PostgreSQL | `127.0.0.1:5433`, base `dbiw` (solo lectura desde la suite: `BEGIN READ ONLY` y `ROLLBACK`) |
| Redis | `127.0.0.1:6380` |
| Bloqueos de entorno | **Ninguno** |
| Tenant | `e2e-privacy-1b-a114bf06`, `ACTIVE`, schema `tenant_e2e_privacy_1b_a114bf06` |
| Migración 157 por `typeorm_migrations` | id 152 `SubscriberFiscalCompleteness1570000000000`; ids 148–151 = 153–156 |
| 157 por `pg_attribute` y `pg_constraint` | `vat_responsibility` nullable (`attnotnull=false`); `ck_subscribers_fiscal_complete_when_active` con `convalidated=false` (`NOT VALID`); `fk_subscribers_expediente_id`; columnas `fiscal_document_encrypted` y `fiscal_document_hmac` en `contracts` y `expediente_records`; `party_role_type` con `LEGAL_REPRESENTATIVE` |
| Tenants `MARKED_FOR_DELETION` antes del worker | **0** (`ACTIVE` 4, `INACTIVE` 18), comprobado dos veces: antes de arrancar y justo antes del worker |
| Servicios | API (`pnpm --filter @iwana/api dev`, `/api/v1/health` → 200), worker (`pnpm --filter @iwana/worker dev`) y portal (`next-dev.mjs --webpack --port 3002`, `NEXT_PUBLIC_PORTAL_API_URL` vacío) |
| Seed | `node e2e/scripts/seed-privacy-fase-1b-fixtures.mjs` → `ready`, ahora con 153–157 acreditadas |
| Migraciones | No se migró `dbiw` |

## 3. Conteo real

**Corrida de evidencia:** 2026-10-17 13:00:17 −0500, SHA `e2348a42`.

**Comando:**
```
pnpm exec playwright test --config e2e/playwright.portal.config.ts \
  e2e/tests/portal-mod05-deuda-fiscal-live.spec.ts e2e/tests/portal-privacy-fase-1b-live.spec.ts \
  --retries=0 --trace=retain-on-failure --reporter=list,json
```

**Resultado:** 12 tests: **9 passed, 3 failed, 0 skipped, 0 flaky**, en 51,5 s.

| # | Suite · test | Resultado | Duración |
| --- | --- | --- | --- |
| T0 | MOD05 · precondición: el tenant acredita 153–157 y el rol `LEGAL_REPRESENTATIVE` | passed | 0,5 s |
| T1 | MOD05 · alta jurídica: el esquema rechaza la falta de DV, RUT, IVA y representante | passed | 0,5 s |
| T2 | MOD05 · alta jurídica: con DV, RUT y representante → alta y Party `LEGAL_REPRESENTATIVE`; DV erróneo → 400 | **failed** (DEF-01) | 0,4 s |
| T3 | MOD05 · conversión desde expediente: `PROSPECT` sin datos fiscales, aviso, activar → 422; completar y activar → `ACTIVE` | passed | 5,1 s |
| T4 | MOD05 · contrato: sin completitud → 422; con completitud → 201, solo cifrado en base y visible en pantalla | **failed** (DEF-02, en el paso de pantalla) | 14,1 s |
| T5 | MOD05 · contrato: editar otro campo desde la pantalla conserva el documento fiscal cifrado | **failed** (DEF-02) | 4,0 s |
| T6 | MOD05 · supresión: anonimizar un prospecto anula el cifrado y el HMAC del documento fiscal | passed | 2,3 s |
| T7 | MOD05 · suscriptor heredado: la 153 mapeó el régimen y la pantalla muestra «pendientes de completar» | passed | 1,7 s |
| T8 | 1b · prospecto: SUPRIMIR, vista previa, resolver y anonimizar | passed | 4,7 s |
| T9 | 1b · ex suscriptor dentro de retención | passed | 7,7 s |
| T10 | 1b · contrato vigente: rechazo por deber contractual | passed | 3,5 s |
| T11 | 1b · traslado fuera de plazo | passed | 2,9 s |

**Por suite:**
- `portal-mod05-deuda-fiscal-live`: 8 tests, 5 passed y 3 failed;
- `portal-privacy-fase-1b-live`: 4 tests, 4 passed.

Antes de adaptar su fixture (§6), la 1b dio 2 passed y 2 failed: los dos casos que contratan recibían 422 `SUBSCRIBER_FISCAL_DATA_INCOMPLETE`, que es el comportamiento correcto según D-M05.

**Notas:**
- **T4 no es un rojo completo.** Todas sus aserciones de API y de base pasan antes del paso de pantalla, donde falla.
- **Sin `skip` ni reintentos.** Ningún `skip` condicional enmascara un caso. `--retries=0`.

## 4. Matriz R1–R15 ↔ test

No hay R12: el delta v1.1 numera R1′, R3′, R4′ y R13 a R15.

| R | Regla (resumen) | Test | Estado | Evidencia |
| --- | --- | --- | --- | --- |
| R1 / R1′ | El alta manual exige IVA y al menos un RUT; no escribe `tax_regime`; la conversión no infiere | T1, T3; T2 bloqueado | **Parcial** | T1: sin IVA, sin RUT, RUT vacío, fuera del catálogo o repetido → 400 con el campo en `fieldErrors`. T3: la conversión deja IVA `NULL`, RUT vacío y `tax_regime` `NULL`. El alta manual positiva no se puede ejercer (DEF-01) |
| R2 | 153: `SIMPLIFIED→NO_RESPONSABLE`, `COMMON→RESPONSABLE`; RUT heredado «Pendientes de completar» | T7, T3 | Verde | 16 filas heredadas, 0 descuadres de mapeo; la pantalla muestra «Responsabilidades del RUT pendientes de completar» y «No responsable» |
| R3 / R3′ | NIT y DV obligatorios en el alta; DV validado; en la edición, DV exigido y validado | T1, T3; T2 bloqueado | **Parcial** | T1: DV ausente o no numérico → 400 en `nitVerificationDigit`. T3: edición con DV erróneo → 400, sin cambios. El DV erróneo en el **alta** no se puede aislar: DEF-01 devuelve 400 antes |
| R4 / R4′ | Representante obligatorio en el alta (Party NATURAL con rol `LEGAL_REPRESENTATIVE`); la conversión lo deja `NULL` | T1, T3; T2 rojo | **Parcial** | T1: sin representante → 400; `legalRepresentativeId` → 400 (propiedad no permitida). T3: conversión con representante `NULL`. Tras la edición: Party NATURAL, distinto del de la empresa, rol `ACTIVE`, la empresa con `CUSTOMER`, `legal_representative_id` `NULL`. **El alta con Party y la deduplicación por HMAC no se pudieron ejercer (DEF-01)** |
| R5 | `fiscal_document` cifrado y con HMAC; nunca en claro | T4, T5 | Verde (base) | Contrato y expediente: `fiscal_document` `NULL`, cifrado presente que no contiene el valor, HMAC de 64 hex que no contiene el valor. El DTO no expone `fiscalDocumentEncrypted` ni `fiscalDocumentHmac` |
| R6 | CLI de backfill | — | Fuera del E2E | No se ejerce sin escribir en `dbiw`. Dato: el tenant tiene 12 contratos y 0 con `fiscal_document` en claro. Le corresponde a la integración de B2 y a V4 |
| R7 | La lectura descifra (con compatibilidad heredada) | T4, T5 | **Rojo** | `GET /crm/contracts/:id` y `GET /crm/subscribers/:id/contracts` descifran. **`GET /crm/subscribers/:id/360` devuelve `fiscalDocument` nulo (DEF-02)**. La lectura de una fila heredada en claro no se ejerce sin escribir en base: queda en la unidad de B2 |
| R8 | La supresión anula el cifrado y el HMAC | T6, T8 | Verde | Expediente con documento fiscal cifrado → SUPRIMIR → resolver: `fiscal_document`, `_encrypted` y `_hmac` en `NULL`, y `anonymized_at` fijado |
| R9 | FK `subscribers.expediente_id` | T3, T0 | Verde (parcial) | La FK existe y el suscriptor convertido apunta a su expediente. El aborto por huérfanos le corresponde a la integración de B0 |
| R10 | Entidad con `enum` igual que la DDL | — | Fuera del E2E | Le corresponde al test de paridad de B1 (`subscriber-enum-parity.postgres.integration.spec.ts`) |
| R11 | `subscribers.nit` en claro (D-FIS) | — | Observación | Sin test, por diseño |
| R13 | Completitud al activar y al contratar → 422 `SUBSCRIBER_FISCAL_DATA_INCOMPLETE` con `missing`, sin PII | T3, T4 | Verde | Activar: `missing` con los 4 campos, después `[NIT_VERIFICATION_DIGIT, LEGAL_REPRESENTATIVE]`; completar → `ACTIVE`. Contrato directo y `from-expediente` → 422, con 0 contratos creados; completar → 201. El cuerpo no contiene ni el NIT ni el correo |
| R14 | `fiscalCompleteness` en el detalle y aviso en el portal | T3, T7, T2 | Verde | `{complete:false, missing:[…]}` y después `{complete:true, missing:[]}`; el aviso «Faltan datos fiscales para activar o contratar» lista los 4 faltantes y desaparece al completar |
| R15 | Sin `taxRegime` inferido | T3 | Verde | `taxRegime` `null` en la respuesta y `tax_regime` `NULL` en la base tras la conversión |

**Casos del encargo:**

| Caso | Estado | Detalle |
| --- | --- | --- |
| (1) | **Rojo** | Rechazos en verde; alta positiva y Party en el alta en rojo por DEF-01. El Party con su rol queda acreditado por la vía de edición (T3) |
| (2) | **Verde** | Completo |
| (3) | **Rojo** | 422, 201 y base en verde; pantalla en rojo por DEF-02 |

## 5. Hallazgos

### DEF-01 · Crítica · preexistente (desde `15bda462`, Fase F1a de privacidad) · responsable `sr-backend`

`POST /crm/subscribers` con `authorizations` responde siempre `400 VALIDATION_ERROR` con `fieldErrors: { authorizations: ["Expected object, received array"] }`.

**Por qué no hay salida:**
- sin `authorizations`, el servicio exige `422 SUBSCRIBER_DATA_AUTHORIZATION_REQUIRED` (`apps/api/src/modules/crm/subscribers/subscribers.service.ts:272-284`);
- así que **no hay alta manual posible por HTTP**, ni natural ni jurídica;
- el portal envía el mismo arreglo (`apps/portal/src/components/crm/subscribers/SubscriberForm.tsx:261-268`), así que el alta desde la pantalla también falla.

**Causa:**
- el `ValidationPipe` global (`apps/api/src/main.ts:45-50`, `transform: true` y `enableImplicitConversion: true`) transforma el body al DTO de clase antes del `ZodBodyValidationPipe`;
- con `@Allow() authorizations?: Array<…>` (`apps/api/src/modules/crm/subscribers/dto/create-subscriber.dto.ts:119-120`), cada elemento se convierte en un `Array`.

**Reproducción aislada** (sin red ni datos), sobre el DTO compilado:
```
plainToInstance(CreateSubscriberDto, { authorizations: [{ purpose, granted, legalTextId }] }, { enableImplicitConversion: true })
→ Array.isArray(authorizations[0]) === true
→ CreateSubscriberSchema: path ["authorizations", 0] "Expected object, received array"
```

**Observaciones:**
- Probablemente las pruebas HTTP de B1 no instalan el pipe global; por eso no lo detectaron.
- **Bloquea el merge:** deja sin cubrir el criterio del caso 1 y el alta manual entera.

### DEF-02 · Alta · introducida por B2 (R7) · responsable `sr-backend` (B2), con apoyo de `fe-platform`

`SubscribersService.get360View` carga los contratos con `qr.manager.find(Contract, …)` sin hidratar `fiscal_document_encrypted` (`apps/api/src/modules/crm/subscribers/subscribers.service.ts:1338-1343`). En un contrato nuevo, `/360` devuelve `fiscalDocument: null`; `GET /crm/contracts/:id` y la lista por suscriptor sí lo descifran (`contracts.service.ts:408`, `:462`).

El portal arma la pestaña Servicios y el `ContractDetailDrawer` desde `/360` (`apps/portal/src/lib/api-client.ts:6542`). Consecuencias, las dos reproducidas en vivo:
1. **La pantalla no muestra el documento fiscal** (T4): la sección «Datos fiscales» muestra solo «Nombre fiscal».
2. **No se puede editar ningún campo de un contrato cifrado desde el detalle** (T5):
   - el formulario inicializa `fiscalDocument: ''` desde ese nulo (`ContractDetailDrawer.tsx:198`) y lo envía siempre (`:411`);
   - la API responde `PATCH /crm/contracts/:id → 400` con «El documento fiscal no tiene un formato válido.»;
   - no hay pérdida de datos: la validación frena la escritura y el cifrado sigue presente;
   - pero la edición queda inutilizable.

### Observaciones (no bloquean)

| # | Observación |
| --- | --- |
| O1 | `legalRepresentativeId` en el alta lo rechaza el `ValidationPipe` global (`forbidNonWhitelisted`: «property legalRepresentativeId should not exist»), no Zod. El efecto (400) es el esperado |
| O2 | El fixture de la suite viva de la Fase 1b contrataba sin completitud fiscal; con D-M05 eso es un 422 correcto. Se adaptó el fixture (§6), sin tocar producto |
| O3 | Las corridas dejan en el tenant expedientes, suscriptores y contratos sintéticos (prefijo `E2E-MOD05-DEUDA`, `example.invalid`). Dos expedientes extra vienen del diagnóstico de DEF-01 y del 400 de identificación jurídica |
| O4 | El expediente jurídico exige `primaryContactName` en la sección de identificación («Contacto principal es requerido»). Se agregó al fixture |

## 6. Cambios hechos (solo `e2e/**`)

| Archivo | Cambio |
| --- | --- |
| `e2e/tests/portal-mod05-deuda-fiscal-live.spec.ts` | **Nuevo:** 8 tests; lecturas de base `READ ONLY` que solo devuelven booleanos o conteos |
| `e2e/scripts/seed-privacy-fase-1b-fixtures.mjs` | Acredita además 153–157 en `typeorm_migrations` (aditivo; la salida informa `migrations: [149…157]`) |
| `e2e/tests/portal-privacy-fase-1b-live.spec.ts` | `convertToParty` completa `vatResponsibility` y `rutResponsibilities` antes de contratar (D-M05) |

- `.env.development.local`: el seed reescribió las mismas claves existentes, con los mismos valores.
- Ningún cambio en código de producto. Sin commits.

## 7. Trazas sanitizadas de los fallos

Los `trace.zip` contenían cabeceras `Authorization` con tokens de la sesión sintética. Se extrajo un resumen (método, ruta con `:id` y estado HTTP, sin cabeceras ni cuerpos) y se borraron los `trace.zip` y los videos de `test-results/`. Quedan las capturas y `error-context.md`, ignorados por git.

| Test | Últimas llamadas (sanitizadas) | Fallo |
| --- | --- | --- |
| T2 | `POST /auth/login → 200` · `GET /users/me → 200` · `GET /commercial/catalog → 200` · `GET /privacy/legal-texts/current → 200` · `POST /crm/subscribers → 400` | «Alta jurídica válida: HTTP 400 (VALIDATION_ERROR; campos: authorizations)» |
| T4 | 36 llamadas; las últimas: `GET /crm/subscribers/:id/360 → 200` ×2 · `GET /commercial/catalog/:id → 200` ×2 | `getByRole('dialog').getByText('Documento fiscal')`: elemento no encontrado; el drawer muestra solo «Nombre fiscal» |
| T5 | 33 llamadas; las últimas: `GET /crm/subscribers/:id/360 → 200` ×2 · `GET /commercial/catalog/:id → 200` ×2 · `PATCH /crm/contracts/:id → 400` | Se esperaba 200 y llegó 400; en pantalla, «El documento fiscal no tiene un formato válido.» |

## 8. Cierre de servicios

API, worker y portal detenidos al terminar:
- las tareas en segundo plano se cerraron y los procesos huérfanos (`nest start` y `next-dev`, creados a las 12:47 por esta corrida) se terminaron por árbol;
- verificado después: los puertos 3000 y 3002 no escuchan, y quedan 0 procesos `node` de `apps/api`, `apps/worker`, `apps/portal` o `next-dev.mjs`;
- PostgreSQL y Redis (Docker) siguen arriba: no son de esta corrida.

## 9. Siguiente paso recomendado

1. `sr-backend` corrige DEF-01 (que el pipe global no transforme `authorizations`, o validar `authorizations` antes de la conversión implícita) con una prueba HTTP que monte el `ValidationPipe` real de `main.ts`.
2. `sr-backend` (B2) corrige DEF-02 hidratando el documento fiscal en `get360View`. `fe-platform` evalúa no reenviar `fiscalDocument` cuando no cambió.
3. Re-correr V1 con el mismo comando: T2, T4 y T5 deben pasar sin tocar sus aserciones.

## 10. Addendum de revalidación de entorno (2026-10-17 18:13 -05:00)

**Estado de esta revalidación:** `[BLOQUEO DE ENTORNO]`. Las comprobaciones actuales no permiten iniciar una corrida fresca contra `dbiw`:

```powershell
Test-NetConnection -ComputerName 127.0.0.1 -Port 5433 -InformationLevel Quiet -WarningAction SilentlyContinue
False
Test-NetConnection -ComputerName 127.0.0.1 -Port 6380 -InformationLevel Quiet -WarningAction SilentlyContinue
False
```

La conexión PostgreSQL mediante `pg.Client` (cargando `.env.development.local` y `.env.development`, con `connectionTimeoutMillis: 3000`) devolvió:

```json
{"connected":false,"errorType":"Error","code":"ECONNREFUSED","syscall":"connect","address":"127.0.0.1","port":5433,"message":"connect ECONNREFUSED 127.0.0.1:5433"}
```

`docker ps -a --format '{{.Names}} {{.Status}}'` tampoco pudo consultar Docker: el daemon no está disponible (`failed to connect to the docker API at npipe:////./pipe/docker_engine`). Por lo tanto, en esta revalidación **no se pudo acreditar la migración 157 ni consultar el conteo de tenants `MARKED_FOR_DELETION`**. No se arrancaron API, worker ni portal; en particular, no se inició el worker sin verificar la guarda requerida. No se ejecutó Playwright y no se generaron trazas nuevas.

Los conteos **9 passed / 3 failed** de §3 y las trazas sanitizadas de §7 corresponden a la corrida histórica del **2026-10-17 13:00:17 -0500**; se conservan como evidencia histórica y **no son evidencia fresca de esta revalidación**.
