# PROMPT — MOD05 · Deuda de código · Delta v1.2 · Correcciones de la Ola 2

**Versión:** 1.2 (delta sobre v1.0 y v1.1; lo que no se toca sigue vigente) · **Fecha:** 2026-10-17 · **Emisor:** AI-EM-ARCH · **Estado:** Contrato congelado
**Base:** `main` en `e2348a42`, con CI [`39054256748`](https://github.com/Sleybc/iWana-neXt/actions/runs/39054256748) en verde (5/5).
**Origen:**
- [V1](../informes/INFORME-MOD05-DEUDA-V1-QA-v1.0.md): 9/12, con DEF-01 crítica y DEF-02 alta;
- [V2](../informes/INFORME-MOD05-DEUDA-V2-SEC-v1.0.md): GO, con un medio (M-1);
- [V3](../informes/INFORME-MOD05-DEUDA-V3-REV-v1.0.md): boundary GO y contratos NO-GO (CD-01);
- [V4](../informes/INFORME-MOD05-DEUDA-V4-GATES-v1.0.md): suites verdes, integraciones omitidas por falta de base;
- [V5](../informes/INFORME-MOD05-DEUDA-V5-DOCS-v1.0.md): NO-GO por la redacción del launcher.

## 1. Hallazgos y disposición

| # | Sev. | Hallazgo | Disposición | Dueño |
| --- | --- | --- | --- | --- |
| DEF-01 | **Crítica** (preexistente desde `15bda462`) | `POST /crm/subscribers` con `authorizations` responde siempre 400 («Expected object, received array»). El `ValidationPipe` global (`main.ts:45-50`, con `transform` y `enableImplicitConversion`) convierte cada elemento en un arreglo **antes** del `ZodBodyValidationPipe`. **No hay alta manual posible**, ni por HTTP ni desde el portal | §2.1 | A |
| DEF-02 | Alta | `GET /crm/subscribers/:id/360` devuelve `fiscalDocument` en `null`: no descifra. La pantalla no lo muestra y la edición del contrato desde el detalle se bloquea | §2.2 | A |
| CD-01 | P1 | `search()` (`subscribers.service.ts:974-1044`) no hidrata `legalRepresentative.displayName`: sale `null` | §2.3 | A |
| CD-02 | P2 | El `PATCH …/section/…` acepta `rutResponsibilities` vacío o con repetidos, contra el schema compartido | §2.3 | A |
| CD-03 | P2 | En la edición, el DV es `z.string().max(1)`, sin `^\d$`. Si cambia el NIT sin DV y la fila no tenía DV, la edición se acepta | §2.3 | A |
| B-01 | P2 | `create()` repite a mano la regla fiscal con 400 `SUBSCRIBER_FISCAL_DATA_REQUIRED` | §2.3 | A |
| CD-04 | P2 | Un detalle con `privacyRestricted` anula `vatResponsibility`, `rutResponsibilities` y `fiscalCompleteness`; el listado sí los emite | Decisión del emisor, §2.3 | A |
| CD-07 y CD-08 | P3 | OpenAPI de `SubscriberListItem` sin los campos nuevos; ningún test fija el código 422 ni los literales de `missing` | §2.3 | A |
| M-1 | Media | La proyección de `legalRepresentative.displayName` no mira las marcas de privacidad **del Party del representante** | §2.4 | A |
| CD-05, CD-06 y deuda de B3 | P2/P3 | El DV del NIT está copiado en el portal y en `inventory/SupplierFormDrawer.tsx` (este con 11 pesos). El portal no separa el DV cuando se escribe `NIT-DV` | §2.5 | A + B |
| V4 | — | Las integraciones de db y api se omitieron: la base no estaba disponible | §3 | V4′ |
| V5 | — | El launcher v1.1 decía «no migres `dbiw`» en el bloque común y pedía migrarla como precondición del CTO | Lo corrige AI-EM-ARCH: los agentes nunca migran; el CTO sí, como precondición | AI-EM-ARCH |

## 2. Contratos de corrección

### 2.1 DEF-01 y su patrón (A)

- **Reproducir primero:** un test HTTP que monte la app con **exactamente** los pipes globales de `main.ts` (una utilidad compartida de test, por ejemplo `createAppWithGlobalPipes()`, para que no vuelvan a divergir) y envíe un alta con `authorizations`. Debe dar 400 hoy.
- **Corregir** `create-subscriber.dto.ts` para que `class-transformer` no deforme el arreglo de objetos (tipo de elemento explícito con `@Type`, o excluir la propiedad de la conversión implícita). La validación de forma sigue siendo de Zod.
- **Revisar los 7 DTO** con `@Allow()` sobre arreglos u objetos:
  - `create-subscriber.dto.ts:56, 120`;
  - `update-subscriber.dto.ts:50, 60` (`rutResponsibilities` es un arreglo de strings y puede deformarse igual);
  - `create-coverage-check.dto.ts:35`;
  - `execution-orders.dto.ts:229, 233`.

  Cada uno lleva un test con los pipes reales, y se corrige el que falle.
- **Guardia hacia adelante:** un test de arquitectura que falle si un DTO declara con `@Allow()` un arreglo de objetos sin tipo de elemento.

### 2.2 DEF-02 (A)

`get360View` (y cualquier otra lectura de contratos dentro de `crm/subscribers`) usa la misma proyección de lectura que `GET /crm/contracts/:id`: descifra el documento fiscal, con compatibilidad heredada (R7) y redacción por bloqueo. Test HTTP del 360° con un contrato cifrado y otro heredado en claro.

### 2.3 Contratos de suscriptor (A)

- **CD-01:** `search()` hidrata `legalRepresentative` igual que `findAll` y `findById`. Test de la búsqueda exacta.
- **CD-02 y CD-03:** el schema del `PATCH …/section/…` **reutiliza** los esquemas de shared: RUT con `.min(1)` y sin repetidos, y DV con `^\d$`. Si cambia el NIT y no llega un DV válido, responde 400.
- **B-01:** se elimina la regla fiscal escrita a mano en `create()`. El alta valida por el schema de shared (400 `VALIDATION_ERROR` con `fieldErrors`), y la completitud de activar y contratar sigue siendo exclusiva de `SubscriberFiscalCompletenessService` (422). Se retira `SUBSCRIBER_FISCAL_DATA_REQUIRED`.
- **CD-04 (decisión del emisor):** `vatResponsibility`, `rutResponsibilities` y `fiscalCompleteness` **no identifican** al titular sin su nombre y documento, y facturación los necesita. Entran en la **lista blanca** del detalle con `privacyRestricted`, igual que en el listado. Los tipos de shared no cambian.
- **CD-07 y CD-08:** OpenAPI del listado con los campos nuevos, y un test de contrato en shared para `SUBSCRIBER_FISCAL_DATA_INCOMPLETE` y los 4 literales de `missing`.

### 2.4 M-1 (A)

Si el Party del representante tiene `DATOS_BLOQUEADOS` activo y el actor no tiene `canSeeBlocked`, `legalRepresentative.displayName` sale como «Datos bloqueados». Si el Party está anonimizado, sale «Anonimizado». Usar `IPrivacyMarksReadPort.activeMarks` por lote, como las demás proyecciones. Test con los dos casos.

### 2.5 DV del NIT en un solo lugar (A, después B)

- **A:** mueve `calculateNitVerificationDigit` y el parseo `NIT-DV` (`parseExpedienteNit`) a `@iwana/shared`, con los vectores de 15 dígitos y de borde. La API los importa de ahí y borra su copia. Avisa **S3**.
- **B:** tras S3, el portal usa la función de shared. Borra la copia de `subscriber-fiscal.ts` y la de `inventory/SupplierFormDrawer.tsx` (la de 11 pesos), y normaliza `NIT-DV` igual que la API (CD-06). Tests de los dos formularios.

## 3. Evidencia obligatoria

- **A:** la suite completa de `@iwana/api` y `@iwana/shared` sin caché, con 0 fallos; `test:integration` de api contra `iwana_it_g7_ci` hasta la 157; la API arrancada hasta `/health`.
- **B:** la suite completa de `@iwana/portal` sin caché, con 0 fallos; typecheck.
- **Los dos:** `pnpm exec turbo run test --force --continue` con los totales.
- **Entorno:** PostgreSQL en `127.0.0.1:5433` y Redis en `127.0.0.1:6380`. Docker Desktop debe estar arriba; si el agente no lo alcanza, es un bloqueo de entorno con el comando y el error exactos.

## 4. Propiedad

| Bloque | Agente | Archivos |
| --- | --- | --- |
| A | `sr-backend` | `apps/api/src/modules/crm/subscribers/**`, los DTO de §2.1 (incluidos los de `crm/expedientes` y `tasks`, solo en lo de §2.1), la utilidad de test de pipes, `packages/shared/src/schemas/subscriber.schema*` y la función del DV en shared |
| B | `fe-platform` | `apps/portal/src/components/crm/subscribers/**` y `apps/portal/src/components/inventory/SupplierFormDrawer.tsx` |

## 5. Re-verificación

| # | Agente | Alcance |
| --- | --- | --- |
| V1′ | `sr-qa` | La suite `portal-mod05-deuda-fiscal-live` completa (12 tests) con `--retries=0`, incluidos el alta manual (DEF-01) y el 360° (DEF-02) |
| V3′ | `contract-drift-reviewer` | CD-01 a CD-08 y B-01 |
| V2′ | `sec-eng` | Solo M-1 y la guardia de DTO de §2.1 |
| V4′ | `gate-verifier` | Gates completos más las **integraciones** de db y api, ejecutadas (no omitidas) |

G4 y G6 se cierran con V1′, V3′ y V4′ en verde. G6.5, con el CI de `main` por SHA y todos los pasos ejecutados.

## 6. Gates abiertos tras la re-verificación (2026-10-17)

Resultado: V1′ 12/12, V2′ GO, integraciones de db (125) y api (97) ejecutadas, `/health` 200. Quedan tres gates abiertos.

| # | Gate | Corrección | Dueño |
| --- | --- | --- | --- |
| G-1 | CD-04 en el portal ([V3′](../informes/INFORME-MOD05-DEUDA-V3-REV-v1.1.md)): la API envía `vatResponsibility`, `rutResponsibilities` y `fiscalCompleteness` en el detalle con `privacyRestricted`, pero el portal los oculta | El portal los muestra con `privacyRestricted = true`, en solo lectura y sin acciones de edición (R10 de la Fase 1b sigue bloqueando las mutaciones). El aviso de datos fiscales faltantes también se muestra, sin el botón de completar. Test con el detalle restringido | `fe-platform` |
| G-2 | Cobertura de `packages/shared/src/schemas/subscriber.schema.ts` en 75 % (umbral del 80 % para código tocado) | Tests de contrato hasta ≥ 80 % de statements y branches: alta natural y jurídica, edición por sección, RUT vacío o repetido, DV no numérico, `legalRepresentative` y `fiscalCompleteness` | `sr-backend` |
| G-3 | Falta la revisión independiente de boundaries del diff `e2348a42..` (A y B) | `boundary-reviewer`: CRM → `parties` solo por `IPartyWritePort`; la función del DV en `@iwana/shared` sin importar código de apps; `SubscriberFiscalCompletenessService` como fuente única; la utilidad de test de pipes sin código de producción | `boundary-reviewer` |

Sobre el `[BLOQUEO]` de «S3»: S1, S2 y S3 son **puntos de sincronización**, no agentes. Se anuncian en el informe y en el chat. A dejó lista la función de shared antes de B, así que S3 se cumplió.

Cierre: G-1, G-2 y G-3 en verde → V4″ (`gate-verifier`) confirma los gates → AI-EM-ARCH consolida el cierre G6 y commitea.
