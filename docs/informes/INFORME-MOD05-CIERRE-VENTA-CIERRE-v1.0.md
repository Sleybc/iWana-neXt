# INFORME — MOD05 Cierre de venta · Contrato firmado en la instalación · Cierre v1.0

**Fecha:** 2026-11-11
**Spec:** [2026-11-11-mod05-cierre-de-venta-contrato-firmado](../specs/2026-11-11-mod05-cierre-de-venta-contrato-firmado.md) (G0 2026-11-11) · **ADR:** [ADR-109](../adrs/ADR-109-Contrato-Firmado-en-Instalacion-y-PDF-en-Worker.md) (Aprobado)
**Plan:** [2026-11-11-mod05-cierre-de-venta-contrato-firmado](../plans/2026-11-11-mod05-cierre-de-venta-contrato-firmado.md)
**Commits publicados:** `420013dd` ola 1 · `0064ec4a` ola 2 · `db755009` ola 3 · `97bc2ecf` ola 4 · `4e9d1334` ola 5
**Estado:** G6 ✅ · E2E en navegador ✅ · **G6.5 ✅ 2026-11-11** (CI run 43083595499 success y E2E Web Admin Smoke 43083595359 success, sobre `26b0a81e`)

**Tren:** a las olas se sumaron `40a19893` (la API compilada no arrancaba: `express` no es dependencia directa de `@iwana/api`) y `26b0a81e` (inventarios de recifrado K2 y de supresión de texto para las tablas 183–190; intermitencia de la carrera MOD13). Los CI 43073794853 y 43077333725 fallaron por esas causas.

## 1. Entregado

| Ola | Bloques | Resultado |
|---|---|---|
| 1 | W0 · K | Inventario de no regresión (activación manual, motivos comerciales, consola de OT); contratos compartidos (evento `crm.contract.activated`, `CONTRACT_UNSIGNED`, permiso de aviso, `CONTRATO_SERVICIO`, firma, generación, permanencia, perfil del operador) |
| 2 | A0 · A · H · B · E | Perfil del operador (184); plantilla legal HTML con declaración jurídica (185); permanencia en plan y contrato (183); generación del PDF en el worker con `playwright-core` + Chromium (186); primer cobro inmediato e idempotente en MOD14 |
| 3 | D · F-be · A0-fe | Firma con huella, PDF firmado re-renderizado, `DRAFT→ACTIVE` y outbox (188); `/activate` intacto y `/activate-manual` con motivo; bloqueo `CONTRACT_UNSIGNED` y aviso de 48 h por permiso (187); sección de datos del operador en organización; límite de 1 MB solo en la ruta de firma |
| 4 | C · G · F-fe | Paso «Contrato» en la consola de OT; lectura del contrato y titular por OT para el técnico; firma con aprovisionamiento certificado (D7); descarga del firmado con huella y permiso; copia por correo (189); fila en Documentos e insignia «Pendiente de firma» |
| 5 | QA · seguridad · boundaries | SEC-1 a SEC-5 y SEC-7 corregidos (barrido de medios, render desde plantilla congelada con lista blanca y huella (190), cobro desde el outbox, acceso del técnico solo en ejecución, tenants desde el registro); guarda del `down` de 183; E2E del flujo completo |

## 2. Evidencia

| Corrida | Resultado |
|---|---|
| API unit (jest directo, sin caché) | 510 suites · 6830 tests |
| Worker | 27 suites · 262 tests |
| Shared | 37 suites · 558 tests |
| Portal | 368 suites · 3685 passed · 1 skipped |
| Integración `DB_NAME=test` (API, database, worker con Chromium real) | Verde en cada ola; última pasada 7 suites / 40 tests API, 9 database, 3 worker |
| E2E `portal-mod05-cierre-venta-live` (API real) | 1/1: CA-1, CA-2, CA-3, CA-4, CA-5, CA-6, CA-9, CA-11, CA-12, axe claro y oscuro |
| E2E vivos MOD05, OT y organización | 60 passed · 1 skipped · 1 failed (preexistente, §4) |

Revisores: `contract-drift` y `boundary-reviewer` GO condicionado → mayores cerrados en la ola 5; `sec-eng` GO para G6 y NO-GO para G7 hasta SEC-1/2/4 → cerrados en `4e9d1334`.

## 3. Decisiones tomadas durante la ejecución

| # | Decisión |
|---|---|
| D7 | «Servicio activo» = aprovisionamiento certificado; `billing_start_date` = activación o certificación (spec D7, ADR-109 D2). MOD13 no cambia |
| — | `/activate` conserva roles y el paso `SUSPENDED→ACTIVE` (inventario W0); desde DRAFT emite el evento `MANUAL` y genera el primer cobro |
| — | La plantilla se publica con la declaración «aprobado por asesoría jurídica», usuario y fecha, sin datos del abogado (decisión del usuario) |
| — | El PDF firmado se borra con la anonimización del titular: la retención se aplica antes con el bloqueo (ADR-094 §D7) |
| — | Descarga por streaming de la API con `no-store` en lugar de URL firmada (más estricto) |

## 4. Omitido, no verificado y riesgos

- `portal-mod05-deuda-fiscal-live` «suscriptor heredado» falla contra la base de desarrollo: la regla de completitud cambió en `eaa72683` y en CI se omite. Ajeno a la fase; requiere decisión del comportamiento esperado.
- `portal-billing-flow` «titular bloqueado RS-21»: conteo de auditoría +1 en local, atribuido a efectos dobles de `next dev`; no verificado.
- Integración de recifrado K2 no ejecutada (exige base `iwana_it_g7_*`).
- Imagen Docker del worker con Chromium escrita pero no construida (riesgo R1 para `plat-ops`).
- El evento `crm.contract.activated` no lleva HMAC; el consumidor valida contra el outbox (SEC-3).
- Pendiente de producto: cobro de la penalidad por terminación anticipada (MOD14, fase posterior); confirmar si el cargo por conexión del plan es el mismo concepto que `installation_fee`.
- Chromium sin sandbox del SO; mitigado (sin JS, red bloqueada). Recomendación SEC-6 para `plat-ops`.

## 5. Atajos

| `atajo:` | Motivo |
|---|---|
| Barrido de medios cada 6 h en vez de borrado inmediato | Evita borrar evidencia si la supresión revierte |
| Firma re-renderiza en el worker y la API espera hasta 60 s | Evita `pdf-lib` y Chromium en la API |

## 6. Líneas por superficie (5 commits)

docs 308 · código 9601 · pruebas (incluye specs, integración y capturas) 11555.

## 7. Siguiente

1. G6.5 con el CI de `4e9d1334`.
2. Fase pendiente ya decidida: etiquetas manuales + importación desde UISP.
