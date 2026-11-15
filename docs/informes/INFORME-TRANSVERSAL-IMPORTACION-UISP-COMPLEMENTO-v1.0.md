# INFORME — Transversal · Importación UISP: complementar titular existente · Cierre v1.0

**Fecha:** 2026-11-15
**Spec:** [2026-11-15-transversal-importacion-uisp-complementar-titular](../specs/2026-11-15-transversal-importacion-uisp-complementar-titular.md) v1.0 (G0 2026-11-15) · **ADR:** [ADR-110](../adrs/ADR-110-Importacion-por-Lotes-desde-UISP-y-Portabilidad.md) v1.1 D11 · **Plan:** [2026-11-15-transversal-importacion-uisp-complementar-titular](../plans/2026-11-15-transversal-importacion-uisp-complementar-titular.md)
**Publicación:** un solo commit al terminar las 4 olas (decisión del usuario). Incluye los arreglos previos del mismo día en la importación: contactos adicionales de UISP y topes de 100 MB por ZIP y 200 MB por lote
**Estado:** G6 ✅ (local) · G6.5 pendiente del CI de `main` tras el push

## 1. Entregado

| Ola | Resultado |
|---|---|
| 1 | W0 línea base. A: contrato (kind `TITULAR`, motivo, bloqueo, observaciones, `candidateRef`, error 422, conteo) y migración tenant 210 |
| 2 | B: candidato por HMAC en la simulación, equivalencia `TITULAR` validada al guardar, observación de cruce con la facturación de iWana |
| 3 | C: promoción en modo complemento (contratos históricos terminados, solo vacíos completados), conciliación acotada a lo importado, reversión que devuelve al suscriptor a su estado. F: grupo «Titulares existentes» y diálogo de confirmación en Importaciones |
| 4 | QA (E2E en vivo), revisiones de boundaries, seguridad, pruebas ajustadas y deriva de contrato; correcciones H1, H3, H4 y OpenAPI |

## 2. Evidencia (conteo real, sin caché)

| Corrida | Resultado |
|---|---|
| API unit focal (migration, crm y billing migration-adapters, parties) | 20 suites · 264/264 |
| API unit completa | 570 suites · 7607/7607 |
| Portal (settings/migration, crm/subscribers) | 55 suites · 595/595 |
| Integración `DB_NAME=test`: promoción | 14/14 (incluye complemento, reimportación, reversión, recifrado H1 y dirección original H4) |
| Integración: simulación + generación con contrato terminado importado | en verde; 1 omitida preexistente (Redis) |
| Migración 210 up/down | 5/5 |
| E2E `portal-importacion-uisp-live` (API, worker y portal reales) | 2/2 |
| `audit-ui.mjs` sobre el portal tocado | sin hallazgos |

## 3. Revisiones

| Revisor | Veredicto | Atendido |
|---|---|---|
| `sec-eng` | GO, sin críticos ni altos | SEC-L2 queda como deuda (D1) |
| `boundary-reviewer` | Sin bloqueantes; ampliación de `IPartyWritePort` conforme | JSDoc recolocados; `tenant_id` en `promotedInfo` |
| `test-change-reviewer` | Ningún ajuste oculta regresión | H1 (HMAC sobre valor en claro), H3 (rechazo sin candidato), H4 (dirección original exacta) corregidos; H2 decidido (abajo) |
| `contract-drift-reviewer` | Sin deriva API↔portal; dist al día | Swagger `kind` desde el contrato, 422 documentado, descripción de `targetRef`; nginx a 210M para margen multipart |

**Decisión H2 (orquestador):** la generación diaria excluye todo contrato `TERMINATED` importado, no solo los del complemento. Un contrato terminado de UISP ya fue facturado allí; prorratearlo en iWana sería cobrar dos veces. Antes de esta fase ocurría en importaciones normales y nadie lo había detectado.

## 4. Deudas

| # | Deuda | Estado |
|---|---|---|
| D1 | `MigrationTitularLookupPort` no recibía `tenantId` (SEC-L2) | ✅ 2026-11-15: el puerto recibe `tenantId` y todo su SQL filtra por `tenant_id` |
| D2 | `memoryStorage` podía cargar 20 × 100 MB en RAM antes de validar el total | ✅ `MigrationUploadSizeInterceptor` rechaza por `Content-Length` (413, o 411 sin él) antes de multer |
| D3 | Editar una equivalencia `TITULAR` ya consumida daba 422 | ✅ el destino se valida por HMAC contra el documento del lote vigente (también cierra SEC-L1), no contra la oferta de la simulación |
| D4 | El diálogo mostraba conteos del lote | ✅ `titularSummary` (servicios, facturas, pagos, tickets y cruces contra el candidato) en el pendiente; el aviso de cruce ya aparece antes de confirmar |
| D5 | Errores de tipos preexistentes en el E2E | ✅ corregidos |
| D6 | Caso real (cliente 22 de UISP): ejecutar en el tenant del usuario con su confirmación | pendiente del usuario |

Evidencia del cierre de deudas: API unit completa 571 suites · 7614/7614; integración de migración 20 + 1 omitida (Redis); portal Importaciones 52/52; contrato 16/16; E2E en vivo 2/2.
