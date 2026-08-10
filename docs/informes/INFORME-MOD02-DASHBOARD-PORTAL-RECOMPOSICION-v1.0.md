# INFORME-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0

## Informe vivo — recomposición del `/dashboard` del portal

**Versión:** 1.0  
**Estado:** En progreso  
**Fecha:** 2026-08-10  
**Modo activo:** EM + Orchestrator ([perfil AI-EM-ARCH v2.4](../roles/Perfil_IA_EM_Architect_Unificado_v2.md))  
**Autor consolidación:** AI-EM-ARCH  
**Plan canónico (checklist):** [`docs/plans/2026-08-10-mod02-dashboard-portal-recomposicion.md`](../plans/2026-08-10-mod02-dashboard-portal-recomposicion.md)  
**Prompt G4:** [`PROMPT-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0.md)  
**Rama:** `feat/mod02-dashboard-portal-recomposicion`  
**HEAD al abrir informe:** `39a7bbc6`

---

## 1. Resumen

Recomponer el inicio `/dashboard` de `apps/portal` como centro de trabajo útil para los 12 roles, alineado a identidad iWana, accesible y verificable, **sin** endpoints nuevos ni ampliación de permisos. Gate de entrada G4 cumplido; **G6 NO-GO** hasta cerrar tracks A–D con evidencia.

## 2. Contratos congelados

| Contrato | Ruta | Versión |
| --- | --- | --- |
| HLD | `docs/hlds/HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md` | v2.0.1 G1 firmado |
| UX spec | `docs/specs/2026-08-04-portal-dashboard-recomposicion-ux-spec.md` | v1.0 |
| DS contrato | `docs/specs/2026-08-04-portal-dashboard-recomposicion-ds-contrato.md` | **v1.1** (re-sync 2026-08-10) |
| ADR capas z | `docs/adrs/ADR-075-Contrato-Capas-Z-Portal.md` | Aprobado |

## 3. Estado por track

| Track | Dueño | IDs | Estado | SHA / evidencia |
| --- | --- | --- | --- | --- |
| DOC | AI-EM-ARCH | DOC-1…DOC-4 | Hecho | Adenda prompt · §10ter auditoría · este informe · audits `BLOQUEANTE: 0` |
| A — backend | AI-SR-FULL | A-1…A-4 | Hecho | `e4f93324` · jest `tenant-self.spec.ts` 17/17 · typecheck `@iwana/api` exit 0 · C-1/C-2/C-3 |
| B — DS / primitives | AI-DS-OWNER + AI-FE-PLATFORM | B-1…B-6 | Hecho | `1db59f19` · tests portal 1121 pass · auditor P0/P1: 0 |
| C — dashboard | AI-FE-PLATFORM | C-1…C-13 | En progreso | Task 3 `b8517caa` · Task 4 `3aaa217a` · shell ver Track Shell |
| Shell | AI-FE-PLATFORM | SHELL-1…SHELL-6 | Hecho | `e09ffa9a` · jest shell 15/15 · typecheck 0 · audit-ui P0/P1=0 |
| D — calidad | AI-SR-QA | D-1…D-7 | Hecho | Task 6 · jest `components/dashboard` 7 suites / 76 pass · cobertura stmts **81,89%** / lines **84,97%** · E2E `portal-dashboard-empresa` **25/25** · evidencias `docs/informes/evidencias/portal-dashboard-recomposicion/` |

## 4. Matriz criterio ↔ test

| Criterio | Test previsto | Estado |
| --- | --- | --- |
| CA-V2-01/02 | `dashboard-role-composition.spec.ts` + E2E roles | Hecho — unit 12 roles; E2E ADMIN/NOC/SALES/TECHNICIAN |
| CA-V2-03 | Capturas 375/768/1280 | Hecho — `viewport-*.png` + E2E D-5 |
| CA-V2-04 | Bandas B0–B3 / métricas | Hecho unit (Task 4) + E2E indicadores |
| CA-V2-05 | Navegación indicador→filtro + Atrás | Hecho unit hrefs/caché R-5 (Task 3) |
| CA-V2-06 | `Promise.allSettled` degradación | Hecho unit + E2E error WFM |
| CA-V2-07/11 | Axe claro/oscuro + `null` honesto | Hecho — E2E D-1/D-2; residuales a11y **cerrados** (DS v1.1 + FE) |
| CA-V2-08 | Drawer teclado 375 px | Hecho — E2E D-4 |
| CA-V2-09/10 | Vocabulario + vacíos accionables | Hecho unit (Task 4) + E2E vacío |
| CA-V2-12 | Firmas iWana (barra lima + tokens) | Hecho — E2E D-7 + `firmas-iwana-1280.png` |
| UX-15/16 | Recarga silenciosa / Atrás sin fetch extra | Hecho unit (Task 3) + E2E actualizando |

## 5. Evidencia acumulada

| Fecha | Comando / artefacto | Resultado |
| --- | --- | --- |
| 2026-08-10 | Apertura de informe + DOC | En progreso |
| 2026-08-10 | Track B · `pnpm --filter @iwana/portal test -- --runInBand` | 174 suites · 1121 pass · 1 skip · exit 0 |
| 2026-08-10 | Track B · `audit-ui.mjs` shared+dashboard+layout | P0: 0 · P1: 0 · P2: 3 (hex MetricCard/TopHeader + lime-50 chip; Task 4/shell) |
| 2026-08-10 | `pnpm --filter @iwana/api exec jest src/modules/tenant/tenant-self.spec.ts --runInBand` | PASS 17/17 (Cached: N/A · corrida forzada) |
| 2026-08-10 | `pnpm --filter @iwana/api typecheck` | exit 0 |
| 2026-08-10 | Task 3 · jest composition + DashboardClient | 2 suites · 48 pass · exit 0 |
| 2026-08-10 | Task 3 · `pnpm --filter @iwana/portal typecheck` | exit 0 |
| 2026-08-10 | Task 4 · jest `src/components/dashboard` | 5 suites · 61 pass · exit 0 |
| 2026-08-10 | Task 4 · typecheck `@iwana/portal` | exit 0 |
| 2026-08-10 | Task 4 · `audit-ui` dashboard+PageHeader | sin hallazgos |
| 2026-08-10 | Task 6 · `pnpm --filter @iwana/portal exec jest --coverage --collectCoverageFrom=components/dashboard/**/*.{ts,tsx} --testPathPattern=components/dashboard --runInBand` | 7 suites · 76 pass · stmts **81,89%** · lines **84,97%** · Cached: N/A (corrida forzada) |
| 2026-08-10 | Task 6 · `pnpm exec playwright test --config e2e/playwright.portal.config.ts portal-dashboard-empresa` | **25/25** pass · ~53 s |
| 2026-08-10 | Capturas D-5/D-7 | `evidencias/portal-dashboard-recomposicion/viewport-{375,768,1280}.png` · `firmas-iwana-1280.png` |

Carpeta de capturas: `docs/informes/evidencias/portal-dashboard-recomposicion/`.

## 6. Deuda residual

| Severidad | Ítem | Dueño | Fase |
| --- | --- | --- | --- |
| Alta | Contrato tenant dashboard en `@iwana/shared` | AI-SR-FULL | Fuera de esta fase (decisión prompt §7) |
| Alta | Rate limit global API no cableado | AI-SEC-ENG / AI-PLAT-OPS | Escalado CTO |
| Media | Ampliar auditoría al rol AUDITOR (historial completo) | AI-SEC-ENG + producto | Tras aprobación seguridad |
| Media | Cookie httpOnly / RSC de datos | Ola sesión | Fuera de alcance |
| Media | Axe residual: eyebrow muted sobre accent `danger` (~4,45:1) | AI-DS-OWNER → AI-FE-PLATFORM | **Cerrado** — DS v1.1 §1.7 + `portalMetricEyebrowClassName` |
| Media | Axe residual: `text-iwana-primary` sin `dark:text-*` en CTAs secundarios / «Ver más» | AI-FE-PLATFORM | **Cerrado** — `portalInlineTextLinkClassName` + header dark |
| Media | Axe residual: badge error + `opacity-80` en métrica «Actualizando» | AI-FE-PLATFORM | **Cerrado** — sin `opacity-80`; señal por texto/`aria-live` |

## 7. Gates (registro separado — ADR-069)

| Gate | Estado | Evidencia |
| --- | --- | --- |
| G4 | Cumplido | Prompt v1.0 emitido 2026-08-04 |
| G6 | NO-GO | Pendiente Tasks 1–7 y dictámenes |
| G6.5 | No iniciado | Requiere CI Linux por SHA |
| G7 | No iniciado | Requiere recomendación AI-EM-ARCH + CTO |

## 8. Bitácora (append-only)

| Fecha/hora | ID | Agente | Estado | Evidencia/SHA | Nota |
| --- | --- | --- | --- | --- | --- |
| 2026-08-10 | PLAN | AI-EM-ARCH | Hecho | plan canónico | Plan emitido |
| 2026-08-10 | DOC-1…4 | AI-EM-ARCH | Hecho | adenda prompt · §10ter · informe · audits OK | Task 0 cerrada; rama `feat/mod02-dashboard-portal-recomposicion` |
| 2026-08-10 | A-DONE | AI-SR-FULL | Hecho | `e4f93324` | fiber=50 · mfaCoverage real · DTO 13 campos |
| 2026-08-10 | B-DONE | AI-FE-PLATFORM | Hecho | `1db59f19` | PortalDashboardMetric + z-tokens ADR-075 |
| 2026-08-10 | DESEMPATE-B-API | AI-EM-ARCH | Hecho | contrato DS §1 | Plan Task 2 API simplificada cede al contrato DS congelado (`accent` danger/neutral/primary/warning; `delta.tone`; `icon: ComponentType`) |
| 2026-08-10 | DECISIÓN-MFA-0 | AI-EM-ARCH | Hecho | ratio `1` | 0 usuarios ACTIVE → cobertura definida `1` (vacua); `null` solo fallo de fuente |
| 2026-08-10 | B-1…B-6 | AI-FE-PLATFORM | Hecho | `1db59f19` · portal-dashboard-metric.spec + suite portal · auditor P0/P1=0 | Contrato DS §1 (no API simplificada del plan). Tokens `--z-*` + contraste lima 4,76:1 en globals.css. `[CONSULTA]` API plan vs contrato DS. |
| 2026-08-10 | A-1…A-4 | AI-SR-FULL | Hecho | `e4f93324` · jest 17/17 · typecheck 0 · `DashboardSummaryTenantDto` · mfaCoverage real · fiber default 50 | Track A cerrado; sin endpoints nuevos ni ampliación `@Roles`; MFA 0 usuarios → ratio `1` |
| 2026-08-10 | C-1…C-7 | AI-FE-PLATFORM | Hecho | `b8517caa` · jest 48/48 · typecheck 0 · sync A-3 `e4f93324` | Composition 12 roles; fan-out `allSettled`; sin `RoleRestrictedView`; `DashboardSummaryTenant` 13 campos |
| 2026-08-10 | C-8…C-13 | AI-FE-PLATFORM | Hecho | `3aaa217a` · jest 61/61 · typecheck 0 · audit-ui 0 · MetricCard/DashboardPanel gone | Jerarquía B0–B3; PortalNavListRow; vocabulario historial; Assurance migrado |
| 2026-08-10 | SHELL-1…6 | AI-FE-PLATFORM | Hecho | `e09ffa9a` · jest shell 15/15 · typecheck 0 · audit-ui P0/P1=0 | Drawer inert+foco; barra lima; Buscar <1024 misma GlobalSearch; z ADR-075; lienzo neutral-50 |
| 2026-08-10 | D-1…D-7 | AI-SR-QA | Hecho | jest dashboard 76/76 · cov ≥80% · E2E 25/25 · evidencias PNG | Task 6 cerrada; 3 [CONSULTA] residuales a11y a DS/FE; no bloquea D-* (filtrados con evidencia) |
| 2026-08-10 | A11Y-R1…3 | AI-FE-PLATFORM | Hecho | `1014990f` · base DS `9937c7d7` · jest 86/86 · typecheck 0 · audit-ui P0/P1=0 | §1.7 eyebrow danger/warning; CTAs `dark:text-iwana-primary-300`; sin `opacity-80` Actualizando; filtros axe E2E retirados |
| 2026-08-10 | DS-v1.1 | AI-DS-OWNER | Hecho | contrato §1.7 · adenda prompt | Re-sync contrato DS v1.1 (eyebrow×accent danger/warning → `text-gray-700 dark:text-gray-200`). Tracks notificados: AI-FE-PLATFORM (aplica) · AI-SR-QA (re-mide). Carril rápido EM-ARCH; sin CTO/ADR. |
