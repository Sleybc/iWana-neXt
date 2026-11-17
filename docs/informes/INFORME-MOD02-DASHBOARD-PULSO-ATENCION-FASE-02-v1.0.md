# INFORME — MOD02 · Inicio «Pulso y atención» · Fase 2

**Versión:** 1.0
**Fecha:** 2026-11-17
**Estado:** G6 cerrado en local, con dos fallos ajenos documentados (§3). Commits locales sin push; G6.5 pendiente (CI de `main` tras el tren)
**Definición:** [`HLD-MOD02-DASHBOARD-EMPRESA-v3.0.md`](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v3.0.md) (§8: respuestas de G1) · [ADR-112](../adrs/ADR-112-Sistema-de-Graficas-del-Portal.md) · [contrato DS de gráficas](../specs/2026-11-17-portal-graficas-ds-contrato.md) · [plan](../plans/2026-11-17-mod02-dashboard-pulso-y-atencion-fase-2.md) · desviaciones en la [§13 de la dirección](../specs/2026-11-16-portal-dashboard-pulso-y-atencion-direccion.md)

## 1. Qué cambió

| Commit | Ola | Contenido |
| --- | --- | --- |
| `324ebc03` | Fase 1 | Inicio «Pulso y atención» con contratos vigentes (commit previo a la Ola 2, exigido por el plan) |
| `d6b83827` | 0 (G1) | Contratos N1–N3 en `packages/shared` con Zod estricto; HLD v3.0 §8; ADR-112; contrato DS de gráficas |
| `3bc6d67a` | 1 (G3, G4) | `GET /billing/dashboard/summary`, `GET /crm/subscribers/dashboard/summary`, `GET /assurance/dashboard/series`; wrapper `Chart` (`@iwana/ui`, Recharts 3.10.1 en la entrada diferida `@iwana/ui/chart`), tokens `--chart-1..4`, regla ESLint |
| `095a65be` | 2 (G6) | Clientes N1–N3 en `api-client.ts`, tres fuentes en el fan-out y el techo por rol, celdas Recaudo del mes y Cartera vencida, neto en Suscriptores activos, bloque Tendencia (8) junto a la cola (4), áreas a tres columnas con Facturación, caché de sesión por persona y vaciada al cerrar sesión, `ProgressMeter compact` (aditivo), E2E del inicio 27 → 45 |
| Ola D4 (commit de esta enmienda) | D4 | Decisión del CTO del 2026-11-17: el Ejecutivo comercial ve dinero. N1 admite `SALES` (mismos dos permisos, que el rol ya tiene); techo y composición de SALES con Recaudo, Cartera, tendencia Recaudo y área Facturación («Planes sin precio» cede su celda); G1-4 y D4 dejan de ser supuestos |

Agentes: `sr-backend` (B0, B1, B2), `sec-eng` (B0-SEC y re-revisión en G3), `ds-owner` (B0-DS), `fe-platform` (B3, B4), `sr-qa` (B5); revisores `boundary-reviewer`, `contract-drift-reviewer`, `test-change-reviewer`, `gate-verifier`.

## 2. Evidencia por gate

| Gate | Comando | Resultado real |
| --- | --- | --- |
| Pre-Ola 2 | `npx jest src/components/dashboard` (portal) | 8 suites / 141 tests en verde antes del commit `324ebc03` |
| G1 | `jest` de los 3 contratos nuevos · `jest` completo de `@iwana/shared` · `tsc --noEmit` | 3 / 27 · 54 / 772 · 0 errores; veredicto `sec-eng`: GO con condiciones (aplicadas en HLD §8.5); contrato DS emitido |
| G3 | `jest` de los tres `dashboard/` del API (unitarias + HTTP de autorización) | 6 suites / 79 tests en verde (403 sobre todo el enum `UserRole` menos los admitidos; 403 con permiso revocado; 401; 400 con query extra) |
| G3 | `DB_NAME=test jest --config jest.integration.config.js` sobre los tres `dashboard/` | `--listTests` = 3 archivos; 3 suites / 18 tests; p95 N1 100–107 ms (12 000 documentos), N2 18–20 ms, N3 9,5–16 ms (presupuesto 300 ms; sin índice ni caché) |
| G3 | `boundary-reviewer` · re-revisión `sec-eng` | Sin violaciones de boundary · GO (solo P3; P3-A, P3-B y P3-D corregidos antes del commit) |
| G4 | `jest` completo de `@iwana/ui` · medición de `/dashboard` (`measure-route.cjs`) · `contract-drift-reviewer` | 11 / 70 (Ola 1) → 12 / 72 (Ola 2) · JS inicial +105 B en la Ola 1 · sin deriva (M1 resuelto: la Contadora ve N2, HLD §5) |
| G6 | Typecheck de api, portal, ui y shared · lint de api, portal y ui | 0 errores (`turbo --force`, `gate-verifier`) |
| G6 | `jest` completo de `@iwana/api` | 609 suites / 8116 tests, 1 fallo ajeno (§3), 0 skipped; línea base de la fase 603 / 8032 |
| G6 | `jest` completo de `@iwana/portal` | 425 suites / 4539 tests: 4537 pasan, 1 skipped preexistente (`InventoryClient.spec.tsx`), 1 fallo ajeno (§3) |
| G6 | Specs del inicio: `src/components/dashboard` + `api-client-dashboard` + `dashboard-session-cache` + `AuthProvider.logout` | 13 suites / 237 tests en verde |
| G6 | Cobertura de archivos nuevos | API: todos ≥ 80 % en líneas y ramas (mínimo 80 % ramas en N3). Portal: `DashboardTrend.tsx` 100 %, bloque `dashboardSeriesApi` 100 %, `DashboardClient` 80,19 % ramas, `dashboard-session-cache` 100 % |
| G6 | `pnpm exec playwright test --config e2e/playwright.portal.config.ts portal-dashboard-empresa --retries=0` (build de producción, puerto 3002) | 45 / 45 en verde, 1,6 min; CA-PA-01 a 1440×900: pulso 375 px, Tendencia 862 px, cola 859 px |
| G6 | `audit-ui.mjs apps/portal/src/components/dashboard` | Sin hallazgos (P0–P3 = 0) |
| G6 | `grep -r "from 'recharts'" apps/` · `pnpm audit --prod --audit-level=critical` | 0 · 0 críticas (las 3 altas son de `apps/api`: joi, zod, glob; ninguna de Recharts) |
| G6 | JS inicial de `/dashboard` | 1 149 819 → 1 179 412 B (gzip 325 964 → 336 345); chunk diferido de Recharts 391 783 B (gzip 111 463), fuera del JS inicial |
| G6 | `test-change-reviewer` | Sin regresión; dos decisiones ratificadas por AI-EM-ARCH (§4) y dos huecos de cobertura cerrados con pruebas |
| D4 | `jest src/modules/billing/dashboard` (API) · integración `DB_NAME=test` de N1 | 2 suites / 31 tests (200 para ADMIN, ACCOUNTANT y SALES; 403 para los 9 roles restantes y para SALES sin alguno de los dos permisos) · 1 suite / 6 tests |
| D4 | Specs del inicio (dashboard + cliente N1–N3 + caché + logout) · `tsc --noEmit` de api y portal · `audit-ui.mjs` | 13 suites / 243 tests (antes 237) · 0 errores · sin hallazgos |
| D4 | E2E del inicio con build de producción (`--retries=0`) | 46 / 46 en verde con una copia temporal de la config en el puerto 3012 (borrada). Repetida después con la config oficial `e2e/playwright.portal.config.ts` en el 3002, ya libre: 46 / 46 en verde (1,8 min). Dos fallos de la primera corrida eran selectores de la prueba (nombre accesible de la fila de la cola; «$» del valor de Inventario para NOC) y se corrigieron sin cambiar la regla |
| D4 | `sec-eng` · `test-change-reviewer` | GO (SALES ya tenía lectura nominal de documentos y pagos; sin umbral k) · sin regresión; la negación de dinero para SUPPORT y NOC queda reforzada |

### 2.1 Carraca de conteos

| Paquete | Antes → después | Fuente de la línea base |
| --- | --- | --- |
| api | 603 / 8032 → 609 / 8116, skipped 0 → 0 | Corrida del orquestador al abrir la fase |
| portal | 423 / 4511 (1 skipped) → 425 / 4539 (1 skipped) | Corrida del orquestador en la Ola 2 |
| ui | 8 / 55 → 12 / 72 | CI de `main` en `65a3c12f` |
| shared | 50 / 733 → 54 / 772 | CI de `main` en `65a3c12f` |

## 3. Fallos ajenos a esta fase

| Suite | Clasificación | Evidencia |
| --- | --- | --- |
| `apps/api/src/app.config.production-urls.spec.ts` | Aislamiento del spec, solo con `.env.development` local | Falla en la suite completa (`MIGRATION_UISP_ALLOWED_PRIVATE_HOSTS no puede definirse con NODE_ENV=production`); aislada 29/29 y el grupo `app.config` 66/66 tres veces. Su helper no purga la variable que añadió `46dd6d55`; las suites nuevas no cargan `.env`. El archivo `.env.development` no existe en CI |
| `apps/portal/src/lib/jest-context-mocks-stable.structure.spec.ts` | Spec sin commit de otra sesión | Señala `SubscriberEquipmentTab.spec.tsx` (MOD05); ningún archivo de esta fase |

## 4. Supuestos y decisiones

| # | Decisión | Estado |
| --- | --- | --- |
| G1-4 | «Recaudado» = caja del mes (pagos `REGISTRADO` por `paid_at`), HLD §8.6 | **Decidido por el CTO el 2026-11-17** («Caja del mes»); sin cambio de código |
| D4 | Dinero en el inicio para Administradora, Contadora **y Ejecutivo comercial** (N1 con `@Roles(ADMIN, ACCOUNTANT, SALES)` y los dos permisos de facturación, que SALES ya tiene en la matriz V2), HLD §8.9 | **Decidido por el CTO el 2026-11-17** («También Comercial»); aplicado en la ola D4 (§1) |
| Contadora | Pulso: Recaudo (con lo facturado en la frase), Cartera, Suscriptores activos y Planes sin precio; Tendencia Recaudo y Suscriptores | Ratificado por AI-EM-ARCH (dirección §13); pendiente del CTO con la Contadora |
| Pulso del Ejecutivo comercial | Oportunidades, Suscriptores activos, Recaudo del mes, Cartera vencida y Ofertas en riesgo; «Planes sin precio» cede su celda y queda en la cola de atención | Decisión de AI-EM-ARCH al aplicar D4 (dirección §6 y §13) |
| Salud de Facturación | «En riesgo» si hay saldo de más de 90 días; «Atención» si hay otra cartera vencida; «Al día» sin cartera | Ratificado por AI-EM-ARCH (dirección §13) |
| Bajas (N2) | `from_status` en `ACTIVE`/`SUSPENDED`: un prospecto descartado no cuenta como retiro | Precisión de AI-SR-FULL aceptada (HLD §8.3) |

## 5. Seguridad

Veredicto de `sec-eng`: GO en G1 (con condiciones) y en G3. Condiciones cumplidas: N1 exige `BILLING_INVOICES_READ` y `BILLING_PAYMENTS_READ`; N2 solo ADMIN, SALES y ACCOUNTANT; `days` acotado 7–31 con Zod estricto; controladores propios con `PermissionsGuard` (N2 registrado antes de `:id`); fecha civil del tenant por parámetro SQL; `Cache-Control: no-store` en los tres; caché de sesión del inicio por persona y vaciada al cerrar sesión (P2-2); tabla espejo de guards frente al techo por rol (P3-5). Reidentificación: sin supresión de conteos bajos mientras N1/N2 solo los vean roles con acceso nominal; si se añade un rol sin ese acceso, k ≥ 5 obligatorio.

## 6. Deuda nueva

| Sev. | Deuda | Dueño |
| --- | --- | --- |
| P2 | `network-provisioning.controller.ts:143` declara `@Permissions(NETWORK_PROVISIONING_READ)` sin `PermissionsGuard` (preexistente, lo consume el inicio) | `sr-backend`, encargo aparte |
| ~~P2~~ | ~~La tabla del wrapper usaba `iwana-scroll-inset`, que solo existe en un cambio sin commit de otra sesión~~ — **cerrado 2026-11-17**: el contenedor de la tabla usa solo `overflow-x-auto` (no es redondeado, no necesita el ajuste); contrato DS y spec del wrapper actualizados | — |
| P2 | Mini serie en la celda Suscriptores activos sin contrato DS (desviación §13) | `ds-owner` |
| P3 | `audit-feed-cache.ts` guarda el historial sin la persona en la clave y no se vacía al cerrar sesión | `fe-platform` / `sec-eng` |
| P3 | `PAID_SQL` duplicada en N1 (prueba que detecta divergencia y reconciliación con la lista) hasta poder extraerla de `billing-documents.service.ts` | `sr-backend` |
| P3 | `civilDateIn` duplicada en N2 y N3 | `sr-backend` |
| P3 | `ProgressMeter compact` y el conteo de exportaciones sin reflejar en `core-components` (el SKILL tiene cambios ajenos) | `ds-owner` |
| P3 | Tramo 61–90 días en `bg-amber-500` (2,15:1); pestañas de `@iwana/ui` sin flechas; skeleton diferido siempre de barras | `fe-platform` |
| P3 | Caso reabierto cuenta en el día de su última resolución; N3 incluye cancelados | Producto, si se decide otra regla |
| P3 | `app.config.production-urls.spec.ts` no purga `MIGRATION_UISP_ALLOWED_PRIVATE_HOSTS` | Dueño de la importación UISP |

Omitido: índices de N1 (p95 medido dentro del presupuesto), caché Redis, «Hoy en agenda» y salud de red (N4). No verificado: comportamiento con datos de un tenant real grande y G6.5. G1-4 y D4 los decidió el CTO el 2026-11-17; publicar queda en espera por su indicación («Todavía no»).
