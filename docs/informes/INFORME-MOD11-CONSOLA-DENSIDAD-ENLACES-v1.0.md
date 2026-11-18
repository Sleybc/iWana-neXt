# INFORME — MOD11 Operaciones · Consola de la orden: densidad y enlaces · v1.0

**Fecha:** 2026-11-18
**Spec:** [2026-11-18-mod11-consola-orden-densidad-y-enlaces-ux](../specs/2026-11-18-mod11-consola-orden-densidad-y-enlaces-ux.md) v1.0 (G0 2026-11-18), complementa la [spec vigente v1.5](../specs/2026-10-05-mod11-consola-ot-requisito-ux.md)
**Plan:** [2026-11-18-mod11-consola-orden-densidad-y-enlaces](../plans/2026-11-18-mod11-consola-orden-densidad-y-enlaces.md) · **Launcher:** [PROMPT-MOD11-CONSOLA-DENSIDAD-ENLACES-LAUNCH-v1.0](../prompts/PROMPT-MOD11-CONSOLA-DENSIDAD-ENLACES-LAUNCH-v1.0.md)
**Estado:** seis olas ejecutadas; sin commit ni push. G6 del paso 1 y del paso 2 con dos gates abiertos (§5). G6.5 pendiente de push autorizado.

## 1. Decisiones del usuario durante la ejecución

| # | Decisión | Fecha |
|---|---|---|
| U1 | Matriz de 12 combinaciones: ajustar solo los conteos N | 2026-11-18 |
| U2 | Reescribir al patrón índice MomentContainer.spec:333, :374, :458, :258-261 y Drawer.spec:1631 | 2026-11-18 |
| U3 | Ajustar 10 specs solo en interacción, número una vez, vocabulario y aprovisionamiento tras su línea | 2026-11-18 |
| U4 | Punto de control: paso 1 aprobado en su portal | 2026-11-18 |
| U5 | Corregir ahora la fuga de `site.label` (titular bloqueado) | 2026-11-18 |
| U6 | Ventana del puerto 3002 para medición y E2E | 2026-11-18 |

Dictámenes: R0 (`prod-ux`) GO con condiciones para D2; `ds-owner` aprueba la barra de cierre por carril rápido (prop `footer` de `OperationalSidePeek`, sin primitive nueva).

## 2. Qué cambió

**Paso 1 (portal).** D1: la lectura de aprovisionamiento sube al hook `use-execution-order-provisioning.ts`; el gate y el paso de contrato ya no dependen del panel montado; MOD13, la API y el gate sin cambios. Orden cabecera → Compromiso → Requisitos → Cierre. Índice de requisitos como `nav` + `ol` + `button` con `aria-current="step"`, un solo cuerpo montado; aprovisionamiento es una línea del índice (si el snapshot ya trae ese requisito, no se duplica). Cabecera compacta con el número una vez. Barra de cierre `ExecutionOrderClosureBar.tsx` en el `footer`. «OT» → «orden» según la tabla de R0. Corrección de foco al volver a pulsar la línea activa.

**Paso 2 (API + portal).** `ExecutionOrderDetail` v1.8 y OpenAPI 1.6.0 con `subscriber`, `sourceTicket` y `visit` opcionales y nulables, leídos por `CrmSubscriberReadPort` y el puerto nuevo `AssuranceTicketReferenceReadPort`, con regla de nulo por permiso y titular, fallo cerrado y aislamiento por tenant. `site.label = municipality ?? null` (U5). OpenAPI corregido (`annulled`, nulables de `schedule`, `allOf` + `nullable`, `allowedActions`). ETag del detalle `"1.8-<version>"` con prueba que lo ata al contrato. Cabecera de la consola con cliente y enlaces a ficha, ticket y agenda del día de la visita.

## 3. Conteos (jest `--no-cache`)

| Corrida | Línea base W0 | Final |
|---|---|---|
| Portal `src/components/operations` | 48 suites · 823 | 51 suites · 848/848 |
| Portal completo | — | 444/444 suites · 4955 pasan, 1 omitida (ajena), 0 fallan |
| `@iwana/shared` | — | 56/56 · 787/787 |
| `@iwana/api` unitaria completa | — | 615/616 suites · 8189/8190 (1 falla, §5) |
| API integración tasks + assurance (Postgres real) | — | 17 suites + 1 omitida · 132 pasan, 1 omitida |
| E2E consola con mocks (ola1, r2, r3, b0, field-flow) | 10/17 tras P1 | 17/17 |
| E2E con API real (a11y, cierre-venta, primer-cobro) | — | 17 pasan, 2 fallan (ajenas, §6), 1 omitida |

`tsc`, `lint` (0 errores) y `audit-ui.mjs` (sin hallazgos) limpios en shared, api y portal. Cobertura API de archivos tocados ≥ 83 %.

## 4. Criterios de aceptación (navegador 1440×900 y 375 px, OTE-20261111-003)

| CA | Resultado | Evidencia |
|---|---|---|
| CA-1 | GO | `ExecutionOrderConsole.inventory.spec.tsx` verde antes y después |
| CA-2 | GO | Compromiso en 246 px, primer pendiente en 460 px (pantalla hasta 815) |
| CA-3 | GO | Panel 2662 → 1283 px |
| CA-4 | GO | Pruebas del gate de cierre sin cambios de expectativa; API sin cambios en el gate |
| CA-5 | GO | Matriz verde con conteos N ajustados (U1) y recorrido de las 6 líneas sin captura |
| CA-6 | GO | Número una vez a 1440 y 375 |
| CA-7 | GO | Teclado verificado en navegador; jest-axe sin violaciones claro/oscuro. axe en navegador bloqueado por CSP |
| CA-8 | GO | Desborde 0; barra de 77 px sin solape |
| CA-9 | GO | Tres enlaces abren su destino; sin permiso, null (17/17 unitarias API, 8/8 portal) |
| CA-10 | GO por pruebas | Integración 6/6 con bloqueado y suprimido; sin orden bloqueada en el tenant para verlo en vivo |
| CA-11 | GO | Integración con cruce en el mismo y en otro schema; `boundary-reviewer` GO |

## 5. Gates abiertos

1. `app.config.production-urls.spec.ts` falla en la suite completa de la API (pasa sola 29/29). Causa probable: fuga de `MIGRATION_UISP_ALLOWED_PRIVATE_HOSTS` desde el `.env.development` local entre suites; el diff no toca ese spec ni la carga de entorno. Se cierra con el CI de `main` tras el push.
2. Cerrado: re-revisión de `test-change-reviewer` GO (H1–H6 cerrados, 249/249 aisladas). Residual: falta una prueba de que activar otra línea lleva el foco a su título (D11).
3. E2E que exigen el aprovisionador, no ejecutadas para no levantar procesos sobre el entorno del usuario: `e2e/tests/api/execution-orders-operational.spec.ts` (literal ETag en `:287`) y `portal-network-provisioning-live.spec.ts:712`, `:1110`.
4. G6.5: requiere push autorizado y CI verde.

## 6. Deudas

| # | Deuda | Dueño sugerido |
|---|---|---|
| D1 | La bandeja de órdenes sigue mostrando `customerDisplayLabel` con titular bloqueado | `sec-eng` · spec de bloqueo en proyecciones (bloquea G7) |
| D2 | MOD13 dice «certificado» y el gate publica el requisito pendiente en OTE-20261111-003; el portal acepta `ACTIVE`, el gate solo `CERTIFIED` | `sr-backend` |
| D3 | La agenda no abre un evento concreto; el enlace va al día de la visita | Programación |
| D4 | «Cerrar OT» y dos textos de `ExecutionOrderCloseSection.tsx` con «OT»; aviso de pendientes sigue `role="alert"` | `fe-platform` con autorización |
| D5 | `cierre-venta-live:207`: con dos contratos en borrador el endpoint devuelve null y no hay paso Contrato | `sr-backend` |
| D6 | `primer-cobro-completo-live:1368` espera centavos que el formateador omite | carril billing |
| D7 | Cobertura portal < 80 % en `ExecutionOrderProvisioningPanel`, `ExecutionOrderCloseSection` y ramas de error del hook | `sr-qa` |
| D8 | `sign()` en `r2` hace scroll; ninguna E2E detecta el lienzo fuera del pliegue | `sr-qa` |
| D9 | `TasksModule` importa `SubscribersModule` completo por un puerto | AI-EM-ARCH |
| D11 | Prueba de foco al título al activar otra línea; nombres exactos inexactos en `ExecutionOrderDrawer.spec.tsx` ~:498-512 | `sr-qa` |
| D10 | Datos sintéticos de las E2E con API real en el tenant del usuario (p. ej. OTE-20261118-003) | usuario |

## 7. Archivos

Producción portal: `ExecutionOrderMomentContainer`, `ExecutionOrderProvisioningPanel`, `ExecutionOrderRequirementIndex`, `RequirementChecklist`, `ExecutionOrderSummary`, `ExecutionOrderCommitmentSection`, `ExecutionOrderCloseSection`, `ExecutionOrderEvidenceAction`, `execution-order-contract-signing`, `operations-labels`; nuevos `use-execution-order-provisioning`, `ExecutionOrderClosureBar`, `execution-order-links`. API: `tasks.module`, `assurance.module`, controlador, DTO, interceptor, OpenAPI; nuevos `execution-order-console-links.service` y el puerto y adaptador de Assurance. Contrato: `packages/shared/src/contracts/operations/execution-orders.ts`. Pruebas y E2E: ver `git status`.
