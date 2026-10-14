# INFORME-MOD05-IVA-PDF-P3-v1.0

**Fecha:** 2026-10-12  
**Bloque:** P3 — Portal (`fe-platform`), Ola 1 de D-PDF (MOD05/MOD03)  
**Plan:** [2026-10-12-mod05-iva-soporte-pdf.md](../plans/2026-10-12-mod05-iva-soporte-pdf.md) · **Encargo:** [PROMPT-MOD05-IVA-PDF-v1.0.md](../prompts/PROMPT-MOD05-IVA-PDF-v1.0.md) §2 P3 · **Decisión:** [ADR-093](../adrs/ADR-093-Tratamiento-IVA-Internet-por-Punto-y-Linea-de-Servicio.md) D5  
**Estado:** Completado en el portal; criterios de P3 cumplidos. Sin commit (ver §4). El E2E de carga de PDF y la integración real dependen de P2.

## 1. Cambios entregados

- **Formatos admitidos (C-MEDIA-1 v1.0).** `ServicePointFields`, compartido por crear, convertir y el drawer, usa `accept="application/pdf,image/jpeg,image/png,image/webp"`. GIF e iconos salen del portal (parte de S-T7-03 que corresponde al portal).
- **Ayuda en lenguaje de negocio.** La ayuda termina en «Formatos admitidos: PDF o imagen JPG, PNG o WEBP, hasta 10 MB.» Sin códigos MIME.
- **Validación local antes de subir.** Tipo y tamaño (10 MiB) se comprueban con `stratumEvidenceFileError`. Tipo no admitido y tamaño tienen mensajes distintos. Un archivo rechazado no queda pendiente ni se envía.
- **422 `STRATUM_EVIDENCE_TYPE_NOT_ALLOWED`.** `stratumEvidenceUploadErrorMessage` lo traduce a «Ese tipo de archivo no está admitido. Formatos admitidos: PDF o imagen JPG, PNG o WEBP, hasta 10 MB.» Nunca reenvía el texto del servidor. Cualquier otro fallo de subida muestra el mensaje genérico ya existente: «No se pudo cargar el soporte. Intenta de nuevo.»
- **Subida aislada en el drawer.** En `handleSave` y `handleSaveServicePoint` la subida tiene su propio `try`. Un fallo de soporte ya no cae en `setSaveError(err.message)` ni en `setServicePointError(err.message)`. El error va al canal del control («No se guardó el soporte»), la edición queda abierta para reintentar y la respuesta de la subida actualiza `currentContract`, igual que la edición general.
- **Creación y conversión.** Los dos `catch` de subida (borrador nuevo y reintento) usan el mismo mapeo.
- **`contractsApi.create` retirado** en `apps/portal/src/lib/api-client.ts`. Motivo: no tiene consumidores. La búsqueda en todo el repositorio, sin `node_modules`, no encuentra ningún uso; el único uso dinámico, `contractsApi[action]`, cubre solo activate, suspend, reactivate, terminate y archive. Además, su payload era `Omit<ContractCreateInput,'subscriberId'>`, y `POST /crm/contracts` exige `subscriberId` (`create-contract.dto.ts`). Cierra el menor de deriva que T11 dejó abierto.
- **Módulo de reglas nuevo** `stratum-evidence.ts`, sin componentes: constantes, validación y mapeo de error. Lo consumen solo los tres contenedores.

Sin cambios visuales: no hay estilos nuevos ni tokens. Solo cambian el texto de la ayuda, el `accept`, los mensajes y el canal de error ya existente (`PortalAlert`).

## 2. Criterios y verificación

### 2.1 Tests

| Spec | Qué cubre | Tests |
| --- | --- | ---: |
| `stratum-evidence.spec.ts` (nuevo) | Reglas: `accept`, tope de 10 MiB, admisión y rechazo por tipo, rechazo por tamaño, mensajes sin códigos MIME, traducción del 422 sin reflejar el servidor | 18 |
| `stratum-evidence-upload.portal.spec.tsx` (nuevo) | Control: formatos declarados, PDF aceptado, GIF rechazado, más de 10 MB. Flujos: carga de PDF al convertir, al crear y al reemplazar; GIF que no se envía; 422 con reintento en creación y conversión; 422 en la edición general y en la acción dedicada del drawer | 11 |
| `mod05-iva-punto-servicio-ui.spec.tsx` (existente) | Dos aserciones de CA-UX-IVA-06 pasan al `accept` y a la ayuda nuevos. Sin tests añadidos | — |

- **Carga de PDF:** 3 tests (aceptar y dejar pendiente, subir al convertir, reemplazar en edición).
- **Rechazo de tipo no admitido:** 6 tests (GIF en el control, GIF que no se envía y 422 en cuatro caminos: conversión, creación, edición general y acción dedicada).

### 2.2 Gate del paquete

Comando: `pnpm exec turbo run test --filter=@iwana/portal --force`. Líneas literales del log:

```text
@iwana/shared:build: cache bypass, force executing c3c9335aea8c4236
@iwana/portal:test: cache bypass, force executing 4d4387bc1a630287
@iwana/portal:test: Test Suites: 296 passed, 296 total
@iwana/portal:test: Tests:       1 skipped, 2990 passed, 2991 total
@iwana/portal:test: Snapshots:   0 total
@iwana/portal:test: Time:        146.739 s
 Tasks:    2 successful, 2 total
Cached:    0 cached, 2 total
```

- **Caché:** 0 `cache hit` y 0 `FULL TURBO`. Ambas tareas se ejecutaron con `cache bypass`.
- **Saltado:** 1 test, `apps/portal/src/components/inventory/InventoryClient.spec.tsx:2244` (`it.skip`). Es preexistente en HEAD, el archivo no tiene cambios en el árbol y el propio archivo documenta el motivo (React 19 con jsdom; cubierto por E2E Playwright). No pertenece a P3.

### 2.3 Cobertura focalizada

No es un gate del paquete. Corrida de las 5 suites que ejercitan los archivos tocados: 5 suites, 68 tests en verde.

| Módulo | Stmts % | Branches % | Funcs % | Lines % |
| --- | ---: | ---: | ---: | ---: |
| `stratum-evidence.ts` | 100 | 100 | 100 | 100 |
| `CreateContractDialog.tsx` | 70.41 | 63.41 | 62.85 | 73.58 |
| `ConvertExpedienteToContractDialog.tsx` | 69.69 | 57.62 | 61.53 | 69.69 |
| `ContractDetailDrawer.tsx` | 75.6 | 66.94 | 75.86 | 76.11 |
| `api-client.ts` (archivo completo) | 7.27 | 2.88 | 2.38 | 7.91 |

La cifra de `api-client.ts` es del archivo entero y no aísla la sección de contratos.

### 2.4 Auditoría de UI

Comando: `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` sobre `CreateContractDialog.tsx`, `ConvertExpedienteToContractDialog.tsx`, `ContractDetailDrawer.tsx`, `stratum-evidence.ts` y `api-client.ts`.

Resultado: **P0 0 · P1 0 · P2 0 · P3 5** (deterministas bloqueantes: 0), exit 0.

Los 5 P3 son los mismos spinners `[revisar]` que la línea base previa a los cambios: `Loader2`/`RefreshCw` con `animate-spin` dentro de botones en guardado o conversión. No son carga primaria de página ni de tabla, así que no son deuda nueva. Los specs quedan fuera del auditor por diseño (`EXCLUDE_FILE` excluye `.spec.`).

### 2.5 Otros gates locales

- `pnpm --filter @iwana/portal typecheck` (`tsc --noEmit`): sin errores, exit 0.
- `pnpm --filter @iwana/portal exec eslint` sobre los 8 archivos tocados o nuevos: exit 0.
- `pnpm exec prettier --check` sobre los mismos 8: «All matched files use Prettier code style!».

## 3. Rutas entregadas

Nuevos:

- `apps/portal/src/components/crm/subscribers/stratum-evidence.ts`
- `apps/portal/src/components/crm/subscribers/stratum-evidence.spec.ts`
- `apps/portal/src/components/crm/subscribers/stratum-evidence-upload.portal.spec.tsx`

Modificados:

- `apps/portal/src/components/crm/subscribers/CreateContractDialog.tsx`
- `apps/portal/src/components/crm/subscribers/ConvertExpedienteToContractDialog.tsx`
- `apps/portal/src/components/crm/subscribers/ContractDetailDrawer.tsx`
- `apps/portal/src/lib/api-client.ts` (solo se retiró `contractsApi.create`)
- `apps/portal/src/components/crm/subscribers/mod05-iva-punto-servicio-ui.spec.tsx` (dos aserciones)

Sin tocar: backend (`apps/api`), `packages/shared`, `packages/database`, migraciones 026 y 145.

## 4. Coordinación y commit

- **No commiteé.** Los archivos del portal que toqué contienen hunks de la fase IVA sin commitear (código de T6 y specs de la fase, incluido `mod05-iva-punto-servicio-ui.spec.tsx`). Dependen de exports de `@iwana/shared` que todavía no están en HEAD (`VatLegalBasis`, `VatTreatment` y otros; `packages/shared` tiene cambios sin commitear). Un commit solo con mis rutas dejaría HEAD roto. Propongo commitear junto con la fase IVA, o con la lista de rutas que confirme el orquestador.
- No ejecuté `pnpm install`. El gate sí reconstruyó `@iwana/shared` (`tsc`) como dependencia de `test`, por `--force`.
- No usé la base `dbiw`; este cierre no la necesita.
- Antes de editar revisé el estado del árbol. No revertí ningún cambio ajeno.
- Nota de traspaso fuera del repo, en la carpeta compartida de la sesión: `fe-platform-P3-handover.md`.

## 5. Dependencia de P2 y riesgo de liberación

- Hoy `uploadStratumEvidence` usa `MediaUsage.GENERAL` (`apps/api/src/modules/media/media.service.ts`, bloque GENERAL), cuyo `allowedMimes` no incluye `application/pdf`. Hasta P2, un PDF responde 400 y el portal muestra «No se pudo cargar el soporte. Intenta de nuevo.». El texto del 400, que lista los formatos permitidos, no se muestra.
- **Recomendación:** no liberar la aceptación de PDF del portal antes de P2, o acordar el mensaje genérico durante esa ventana. Decide el orquestador.
- El mapeo del 422 depende de que `code` vaya en el **nivel superior** del cuerpo de error. El patrón de `contracts.service.ts` (`ConflictException({ code, message })`) lo cumple. Si el 422 anida el código, el portal caerá al mensaje genérico en runtime; no hay fallo de compilación ni de tipos que lo delate.
- Para sec-eng: el portal sube solo a `POST /crm/contracts/:id/stratum-evidence`, no a `/media/upload`. No muestra nombre de archivo, id ni URL. La validación de cliente es de experiencia de usuario; el servidor valida bytes y pertenencia al contrato.

## 6. E2E pendiente

No añadí un E2E de Playwright para la carga de PDF. Requiere el endpoint de P2 (Ola 2), API y base de datos de prueba, y no se cierra contra `dbiw`. Queda para sr-qa (Ola 3), dentro de la matriz de stop/go de P1–P3.

## 7. Deuda nueva e identificada por severidad

| Severidad | Nueva | Preexistente relevante | Detalle |
| --- | ---: | ---: | --- |
| P0 | 0 | 0 | — |
| P1 | 0 | 0 | — |
| P2 | 2 | 0 | (a) El portal acepta PDF antes de que el servidor lo admita (sección 5). (b) E2E de carga de PDF pendiente (sección 6). |
| P3 | 2 | 4 | **Nuevas:** (c) El `catch` del reintento con borrador ya guardado (`savedDraftId`, en creación y conversión) no tiene prueba de un segundo fallo; el mapeo sí tiene prueba unitaria. (d) Carga parcial: si la subida falla después de guardar el punto de servicio, el listado no se recarga hasta completar la edición (criterio CA-UX-IVA-08). **Preexistentes:** (e) `handleRemoveEvidence` muestra «No se pudo cargar el soporte» si falla la eliminación. (f) Los errores que no son del soporte se muestran con `err.message` del servidor en creación, conversión y drawer. (g) `api-client.ts` tiene `?` en lugar de tildes y separadores en comentarios (2 y 1 líneas; ya están en HEAD). (h) `currentContract` del drawer no se resincroniza con la prop `contract` (no verificado en el listado). |

**Registro del plan (no es de P3):** escaneo antivirus de PDF subidos. Media no lo tiene hoy; la severidad la decide sec-eng.

## 8. Pendiente

- P2: confirmar el contrato de 422 y la lista de MIME de C-API-4 (sección 5).
- sr-qa: E2E de carga de PDF y prueba del segundo fallo en el reintento (sección 6 y deuda c).
- Commit: por confirmar con el orquestador (sección 4).
