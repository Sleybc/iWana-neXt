# INFORME — MOD05 Cierre de venta · Fase 2 · Cierre v1.0

**Fecha:** 2026-11-11
**Spec:** [2026-11-11-mod05-cierre-de-venta-fase-2-contrato-automatico-e-instalacion](../specs/2026-11-11-mod05-cierre-de-venta-fase-2-contrato-automatico-e-instalacion.md) (G0 2026-11-11)
**Plan:** [2026-11-11-mod05-cierre-de-venta-fase-2](../plans/2026-11-11-mod05-cierre-de-venta-fase-2.md)
**Commits publicados:** `c158e3dc` ola 1 · `a4e3c43a` ola 2 · `4a4e0fe0` ola 3 · `e99e19a6` y `d50e4428` ola 4 · `0bbc9132` y `c6421af1` arreglos de CI
**Estado:** G6 ✅ · E2E en navegador ✅ · G6.5 ✅ 2026-11-11 (CI de `0bbc9132`, run 43114350921; `c6421af1`, run 43116053256)

## 1. Entregado

| Ola | Resultado |
|---|---|
| 1 | Inventario de no regresión; `installation_fee` oficial y congelado en el contrato; `connection_fee` retirado con respaldo auditado (migración 191) |
| 2 | Contrato `DRAFT` automático al pasar la oportunidad a «lista para instalación», uno por oportunidad (192), con aviso al responsable si falta un dato; línea `INSTALACION` en el primer cobro, neta de permanencia y con el IVA del internet (193) |
| 3 | Portal: aviso de creación automática fallida, «Falta ciclo de facturación», valor de instalación congelado, tipo de línea en documentos de cobro |
| 4 | `billingCycleMissing` en la OT; guardas de `down` en 191 y 192; cambio de plan en borrador anula la permanencia aceptada; instalación en el PDF; uso del servicio derivado (ADR-093); snapshot completo del plan; reintento al completar datos |

## 2. Evidencia

| Corrida | Resultado |
|---|---|
| API unit (sin caché) | 517 suites · 6939 tests |
| Worker | 27 suites · 264 tests |
| Portal | 369 suites · 3700 passed · 1 skipped |
| Integración `DB_NAME=test` | Contrato automático 11/11; marcas de privacidad 15/15; migraciones 191–193 en verde |
| E2E `portal-mod05-cierre-venta-f2-live` (API real) | 1 passed: CA-1 a CA-7 |
| E2E vivos de regresión | 41 passed · 2 failed (§4) · 1 skipped |

Revisores: `boundary-reviewer` GO (mayores cerrados en `e99e19a6`); `test-change-reviewer` sin regresión confirmada (R4 y R5 cerrados).

## 2.1 CI

El CI de `d50e4428` (run 43108316976) falló en 4 E2E por dos regresiones: consulta al catálogo con id de plan no UUID que abortaba la transacción del contrato automático, y aviso del contrato desplegado que desplazaba la ficha. Corregidas en `0bbc9132` (CI verde, run 43114350921). `c6421af1` pliega el aviso en el encabezado («Siguiente cobro» a 865 px) y alinea el E2E heredado de RUT con ADR-100.

## 3. Decisiones de ejecución

| Decisión | Motivo |
|---|---|
| Tipo de línea propio `INSTALACION` | Reconocer la línea por descripción era frágil |
| `ModuleRef` para romper el ciclo Contracts↔Subscribers, con registro si el puerto no resuelve | Evita fallos silenciosos en producción |
| Cambio de plan en borrador anula la permanencia aceptada | El descuento del plan anterior no debe sobrevivir |
| Instalación en «Condiciones comerciales» del PDF | Sección que la CRC permite modificar |
| Tope de la oferta = mínimo entre segmentos | Conservador; el contrato valida contra su segmento |
| `SERVICE_USAGE` como dato faltante | Nunca un contrato automático sin uso del servicio |
| Plan sin tarifa vigente → 422 `PLAN_PRICE_REQUIRED` también en la creación manual | Antes se creaba con snapshot vacío y sin mensualidad |

## 4. No verificado, deudas y riesgos

- `portal-billing-flow` RS-21: era el modo estricto de React en `next dev` (dos peticiones, dos auditorías); la prueba ahora compara contra las peticiones reales (8/8 local). Brecha: el flujo MOD14 en navegador se omite en CI por falta de credenciales de plataforma (derivar a `plat-ops`).
- `portal-contract-plan-change`: intermitente en corrida conjunta; pasa aislado.
- `subscriber-rut-responsibilities` (integración): exige un tenant de `E2E_TENANT_SLUG` que no existe en `test`.
- Sin E2E: cobro siguiente sin instalación y descuento total en cero (cubiertos por unit e integración); el texto del PDF no se extrae en E2E.
- IVA de la instalación: confirmar con el contador antes de producción (D-F1).
- Texto de la fila «CARGO DE INSTALACIÓN (ÚNICO, PRIMER COBRO)» en la plantilla: pendiente de aprobación.

## 5. Siguiente

1. Contrato activo sin cobros: [spec](../specs/2026-11-11-mod05-mod14-contrato-activo-sin-cobros.md), publicado en `57a43fd2` + `441ef807` + `8f06a8f9`, G6.5 ✅ 2026-11-12 (CI 43129869007); contrato `fe648c40` regularizado en desarrollo (oct 53.548,39 con instalación, vence 25-nov; nov 55.000).
2. Fase pendiente: etiquetas manuales + importación desde UISP.
