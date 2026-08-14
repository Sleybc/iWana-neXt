# INFORME-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0

## Informe vivo — recomposición del `/dashboard` del portal

**Versión:** 1.0
**Estado:** Completado (G6 GO) — pendiente G6.5 / G7 · delta UX GO · **remediación UI §11 GO (P1 cerrados)**
**Fecha:** 2026-08-10 (apertura) · actualizado 2026-08-11
**Modo activo:** EM + Orchestrator ([perfil AI-EM-ARCH v2.4](../roles/Perfil_IA_EM_Architect_Unificado_v2.md))  
**Autor consolidación:** AI-EM-ARCH  
**Plan canónico (checklist):** [`docs/plans/2026-08-10-mod02-dashboard-portal-recomposicion.md`](../plans/2026-08-10-mod02-dashboard-portal-recomposicion.md)  
**Plan remediación UI:** [`docs/plans/2026-08-11-mod02-dashboard-remediacion-ui.md`](../plans/2026-08-11-mod02-dashboard-remediacion-ui.md)  
**Prompt G4:** [`PROMPT-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-RECOMPOSICION-v1.0.md)  
**Prompt delta UX:** [`PROMPT-MOD02-DASHBOARD-PORTAL-DELTA-UX-v1.0.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-DELTA-UX-v1.0.md)  
**Prompt remediación UI:** [`PROMPT-MOD02-DASHBOARD-PORTAL-REMEDIACION-UI-v1.0.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-REMEDIACION-UI-v1.0.md)
**Rama:** `feat/mod02-dashboard-portal-recomposicion`  
**HEAD al abrir informe:** `39a7bbc6`  
**SHA consolidación G6:** `53c1a3d9` (dictámenes tip `b8e76630`; código `d4ee265a` / `ddbc22cf` / `e09ffa9a` / `e4f93324`)
**Re-auditoría identidad/copy (2026-08-12):** [`INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.1.md`](INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.1.md) — G6 de recomposición **no se revierte**; el delta emite **GO con cambios** (P1 de vocabulario del nav y dos huecos de a11y locales).
**Delta densidad UI (2026-08-12):** autorizado e implementado. Contratos: UX adenda U-D · DS v1.4. Prompt: [`PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.0.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.0.md).
**Remediación P1/P2/P3 (2026-08-12):** autorizada e implementada. Contratos: UX U-R2bis/U-NAV · DS **v1.5**. Prompt: [`PROMPT-MOD02-DASHBOARD-PORTAL-REMEDIACION-P1-v1.0.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-REMEDIACION-P1-v1.0.md). Nav, CTA, foco, B3, historial y atajo de búsqueda cerrados.
**Densidad real U-D2 (2026-08-12):** autorizada e implementada. Contratos: UX adenda **U-D2** · DS **v1.6**. Prompt: [`PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.1.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.1.md). Home B1 `density="compact"` (fila `min-h-14`); Assurance permanece `default`; accesos tope 5 + Ver más; `PortalPanel compact` solo home.
**Auditoría tarjetas/aire v1.2 (2026-08-12):** [`INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.2.md`](INFORME-MOD02-DASHBOARD-PORTAL-AUDITORIA-UIUX-v1.2.md) — U-D2 **superada en anatomía B1**. Contratos: UX **U-D3** · DS **v1.7**. Prompt FE: [`PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.2.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-DENSIDAD-UI-v1.2.md).
**FE U-D3 (2026-08-12):** **GO** — `PortalDashboardMetric` compact vertical `min-h-24`/`text-2xl`/`rounded-2xl`; grid B1 `xl:grid-cols-4` sin `max-w` 50 %; skeleton `h-24`. Jest `portal-dashboard-metric` + `DashboardClient.spec` **52/52** · typecheck portal exit **0** · `audit-ui` P0/P1 **0**. G6 de recomposición **no se revierte**.
**U-B0bis encabezado sin botones (2026-08-13):** autorizada. Contratos: UX adenda **U-B0bis** · DS **v1.9**. U-B0 (toolbar bajo el H1) **superada**. `PageHeader` del Inicio = H1 + subtítulo; sin `PortalActionToolbar`; recarga por `Reintentar` de bloque.
**U-B0 franja fuera del título (2026-08-13):** **superada** por U-B0bis. Contratos históricos: UX adenda **U-B0** · DS **v1.8**. Prompt: [`PROMPT-MOD02-DASHBOARD-PORTAL-B0-TOOLBAR-v1.0.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-B0-TOOLBAR-v1.0.md).

---

## 1. Resumen

Recomponer el inicio `/dashboard` de `apps/portal` como centro de trabajo útil para los 12 roles, alineado a identidad iWana, accesible y verificable, **sin** endpoints nuevos ni ampliación de permisos. Gate de entrada G4 cumplido. **G6 GO** consolidado el 2026-08-10 (G6-1-R1 + G6-2 + G6-3-R1 + G6-4-R1). **G6.5 y G7 no se anticipan** (ADR-069).

## 2. Contratos congelados

| Contrato | Ruta | Versión |
| --- | --- | --- |
| HLD | `docs/hlds/HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md` | v2.0.1 G1 firmado |
| UX spec | `docs/specs/2026-08-04-portal-dashboard-recomposicion-ux-spec.md` | v1.0 + **U-B0bis** (2026-08-13; U-B0 superada) |
| DS contrato | `docs/specs/2026-08-04-portal-dashboard-recomposicion-ds-contrato.md` | **v1.9** (Inicio sin CTA de página; U-B0bis) |
| ADR capas z | `docs/adrs/ADR-075-Contrato-Capas-Z-Portal.md` | Aprobado |

## 3. Estado por track

| Track | Dueño | IDs | Estado | SHA / evidencia |
| --- | --- | --- | --- | --- |
| DOC | AI-EM-ARCH | DOC-1…DOC-4 | Hecho | Adenda prompt · §10ter auditoría · este informe · audits `BLOQUEANTE: 0` |
| A — backend | AI-SR-FULL | A-1…A-4 | Hecho | `e4f93324` · jest `tenant-self.spec.ts` 17/17 · typecheck `@iwana/api` exit 0 · C-1/C-2/C-3 |
| B — DS / primitives | AI-DS-OWNER + AI-FE-PLATFORM | B-1…B-6 | Hecho | `1db59f19` · tests portal 1121 pass · auditor P0/P1: 0 |
| C — dashboard | AI-FE-PLATFORM | C-1…C-13 | Hecho | Task 3 `b8517caa` · Task 4 `3aaa217a` · hidratación `d4ee265a` · contraste v1.2 `ddbc22cf` |
| Shell | AI-FE-PLATFORM | SHELL-1…SHELL-6 | Hecho | `e09ffa9a` · jest shell 15/15 · typecheck 0 · audit-ui P0/P1=0 |
| D — calidad | AI-SR-QA | D-1…D-7 | Hecho (Task 6) · **G6-4-R1 GO** | Task 6 cov OK · re-dictamen G6-4-R1: jest **77/77** · stmts **81,89%** / lines **84,97%** · E2E **26/26** · axe light OK · CA-V2-05 destino OK · ver §9 G6-4-R1 |

## 4. Matriz criterio ↔ test

| Criterio | Test previsto | Estado |
| --- | --- | --- |
| CA-V2-01/02 | `dashboard-role-composition.spec.ts` + E2E D-3 | Cubierto — G6-4 (baseline CA-01…06 no cuenta) |
| CA-V2-03 | E2E D-5 + `viewport-*.png` | Cubierto — G6-4 |
| CA-V2-04 | Unit B0–B3 + composition techo I-1…I-7 | Cubierto — G6-4 |
| CA-V2-05 | Unit hidratación I-1/I-2/I-4/I-7 + E2E indicador→filtro→recarga→Inicio | **OK G6-4-R1** — `d4ee265a` + E2E destino · ver §9 G6-4-R1 |
| CA-V2-06 | Unit `allSettled` + E2E error WFM | Cubierto — G6-4 |
| CA-V2-07/11 | E2E axe + unit null | **OK G6-4-R1** — axe light 4/4 pass post `ddbc22cf` · null unit OK |
| CA-V2-08 | E2E D-4 | Cubierto — G6-4 |
| CA-V2-09/10 | Unit vocabulario + vacíos + E2E vacío | Cubierto — G6-4 |
| CA-V2-12 | E2E D-7 + unit sombra soft | Cubierto — G6-4 |
| UX-15/16 | Unit recarga silenciosa + R-5 remount; E2E Actualizando | Cubierto — G6-4 (sin E2E browser Atrás; R-5 unit) |

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
| 2026-08-10 | G6-2 · `audit-ui.mjs` shared+dashboard+layout+dashboard/layout | P0: 0 · P1: 0 · P2 heurístico 1 descartado (chip activo) · dictamen **GO** · HEAD `eb5851d0` |
| 2026-08-10 | G6-3 · dictamen experiencia AI-PROD-UX | **NO-GO** · HEAD `eb5851d0` · CA-V2-05 insatisfactorio (hidratar filtros en 4 destinos) · ver §9 |
| 2026-08-10 | G6-4 · jest dashboard coverage (re-verify) | 7 suites · 76 pass · stmts **81,89%** · lines **84,97%** · branches 71,33% · Cached: N/A |
| 2026-08-10 | G6-4 · Playwright `portal-dashboard-empresa` (re-verify, sin filtros axe) | **21/25** · 4 fail axe `color-contrast` tema light · dark OK · ver §9 G6-4 |
| 2026-08-10 | G6-1 · gates técnicos AI-PLAT-OPS | SHA `eb5851d0` (≥ `1014990f`) · lint/typecheck/test monorepo/audits OK · E2E **21/25** exit 1 · ver §9 G6-1 |
| 2026-08-10 | G6-3-R1 · re-dictamen experiencia AI-PROD-UX | **GO** · HEAD `9fc1ca7f` (≥ `d4ee265a`+`ddbc22cf`) · CA-V2-05 OK · ver §9 G6-3-R1 |
| 2026-08-10 | G6-1-R1 · re-verify light AI-PLAT-OPS | SHA `9fc1ca7f` (≥ `d4ee265a`) · E2E **26/26** exit 0 · audit-ui exit 0 · ver §9 G6-1-R1 |
| 2026-08-10 | G6-4-R1 · jest dashboard coverage (re-verify post remediación) | 7 suites · **77** pass · stmts **81,89%** · lines **84,97%** · funcs 82,14% · branches 71,33% · Cached: N/A |
| 2026-08-10 | G6-4-R1 · Playwright `portal-dashboard-empresa` (re-verify) | **26/26** pass · axe light+dark OK · CA-V2-05 hidratación destino OK · ~67 s · ver §9 G6-4-R1 |
| 2026-08-13 | U-B0 · jest `DashboardClient.spec` + `portal-ui.spec` | **2 suites · 77 pass** · `audit-ui` P0/P1 **0** (P2 heurístico lime-50 preexistente en portal-ui, no del delta) |
| 2026-08-13 | U-B0bis · quitar franja B0 | Jest `DashboardClient.spec` + `portal-ui.spec` · **2 suites · 71 pass** · `audit-ui` P0/P1 **0** |

Carpeta de capturas: `docs/informes/evidencias/portal-dashboard-recomposicion/`.

## 6. Deuda residual

| Severidad | Ítem | Dueño | Fase |
| --- | --- | --- | --- |
| Alta | Contrato tenant dashboard en `@iwana/shared` | AI-SR-FULL | Fuera de esta fase (decisión prompt §7) |
| Alta | Rate limit global API no cableado | AI-SEC-ENG / AI-PLAT-OPS | Escalado CTO |
| Media | Ampliar auditoría al rol AUDITOR (historial completo) | AI-SEC-ENG + producto | Tras aprobación seguridad |
| Media | Cookie httpOnly / RSC de datos | Ola sesión | Fuera de alcance |
| Media | Axe residual: eyebrow muted sobre accent `danger` (~4,45:1) | AI-DS-OWNER → AI-FE-PLATFORM | **Cerrado eyebrow** — DS v1.1 §1.7 + `portalMetricEyebrowClassName` |
| Media | Axe residual: `text-iwana-primary` sin `dark:text-*` en CTAs secundarios / «Ver más» | AI-FE-PLATFORM | **Cerrado** — `portalInlineTextLinkClassName` + header dark |
| Media | Axe residual: badge error + `opacity-80` en métrica «Actualizando» | AI-FE-PLATFORM | **Cerrado** — sin `opacity-80`; señal por texto/`aria-live` |
| Alta | CA-V2-05: destinos no leen filtros de URL (I-1, I-2, I-4, I-7) | AI-FE-PLATFORM | **Cerrado G6-3 GO** — `d4ee265a` + E2E hidratación; residual menor: E2E usa Inicio sidebar (no `goBack`) |
| Alta | Axe `color-contrast` tema light: descripción muted × shell `danger` | AI-DS-OWNER + AI-FE-PLATFORM | **Cerrado G6-4-R1** — DS v1.2 `5f4d1b15` + `ddbc22cf` · axe light 4/4 pass |

## 7. Gates (registro separado — ADR-069)

| Gate | Estado | Evidencia |
| --- | --- | --- |
| G4 | Cumplido | Prompt v1.0 emitido 2026-08-04 |
| G6 | **GO** | Consolidación EM-ARCH 2026-08-10 · ver §9 G6-5 · SHA `53c1a3d9` |
| G6.5 | No iniciado | Requiere corrida Linux de CI **por SHA** (ADR-069) — no se infiere de G6 |
| G7 | No iniciado | Requiere recomendación AI-EM-ARCH + aprobación CTO — no se infiere de G6.5 |

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
| 2026-08-10 | G6-2 | AI-DS-OWNER | **GO** | HEAD `eb5851d0` · base a11y `1014990f` · DS v1.1 `9937c7d7` · audit-ui P0/P1=0 | Dictamen identidad: sin P0/P1; firmas, sombras duales, primitives canónicas, §1.7. Residual P2 no bloqueante: punto lima en historial. Ver §9. |
| 2026-08-10 | G6-3 | AI-PROD-UX | **NO-GO** | HEAD `eb5851d0` (≥ `1014990f`) · UX spec v1.0 · HLD CA-V2-01…12 | Experiencia: 11/12 CA OK; **CA-V2-05 falla** (filtros outbound sin hidratación en destino). Ver §9. |
| 2026-08-10 | G6-4 | AI-SR-QA | **NO-GO** | HEAD `7ea22066` · re-verify post `1014990f` · jest 76/76 cov ≥80% · E2E 21/25 | Filtros axe retirados OK; **CA-V2-07** falla (descripción muted×danger light); CA-V2-05 sin aserción destino/Atrás. Ver §9. |
| 2026-08-10 | DS-v1.2 | AI-DS-OWNER | Hecho | contrato §1.7 · adenda prompt G4 | Re-sync DS v1.2: description (+ muted cuerpo) × accent danger/warning → `text-gray-700 dark:text-gray-200`. FE aplica · QA re-mide. Carril rápido; sin CTO/ADR. |
| 2026-08-10 | CA-V2-05 + DS-v1.2-FE | AI-FE-PLATFORM | Hecho | `ddbc22cf` contraste · `d4ee265a` hidratación · E2E CA-V2-05 pass | Description muted on-tint; destinos hidratan URL; E2E indicador→filtro→recarga→Inicio. Re-dictamen G6-3/G6-4 pendiente. |
| 2026-08-10 | G6-1 | AI-PLAT-OPS | **NO-GO técnico** | SHA probado `eb5851d0` · E2E 21/25 exit 1 · audits BLOQUEANTE 0 | Gates ejecutados; no dictamen G6 consolidado. Ver §9 G6-1. |
| 2026-08-10 | G6-3-R1 | AI-PROD-UX | **GO** | HEAD `9fc1ca7f` (≥ `d4ee265a`+`ddbc22cf`) · UX §3.2/§3.5 · HLD CA-V2-01…12 | Re-dictamen: CA-V2-05 satisfecho (hidratación + E2E). Ver §9 G6-3-R1. |
| 2026-08-10 | G6-1-R1 | AI-PLAT-OPS | **OK light** | SHA `9fc1ca7f` (≥ `d4ee265a`) · E2E 26/26 exit 0 · audit-ui exit 0 | Re-verify acotado post remediación; **no** G6 GO. Ver §9 G6-1-R1. |
| 2026-08-10 | G6-4-R1 | AI-SR-QA | **GO** | HEAD `05425960` (≥ `d4ee265a`+`ddbc22cf`+`9fc1ca7f`) · jest 77/77 cov ≥80% · E2E 26/26 | Re-dictamen: CA-V2-07 axe light OK · CA-V2-05 destino OK. Ver §9 G6-4-R1. |
| 2026-08-10 | G6-5 | AI-EM-ARCH | **GO** | tip `b8e76630` · G6-1-R1 + G6-2 + G6-3-R1 + G6-4-R1 | Consolidación fase: G6 cumplido; G6.5/G7 abiertos. Ver §9 G6-5. |
| 2026-08-11 | E2E-R41-VALIDO | AI-SR-QA (verificación independiente) | Hecho | corrida 30/0/0/0/0 · `E2E_CLEANUP=OK` · gate parser exit 0 | Corrida E2E completa válida (local, `API_BASE_URL=3010` por stack dev en 3000). 4d verde con fixes de ráfaga BOLA (5 concurrentes) y reset 4a/4c. Dictamen QA: evidencia íntegra. G6.5 pendiente de CI Linux por SHA; G7 pendiente de decisión CTO. |
| 2026-08-11 | REM-UI-G4 | AI-EM-ARCH | Hecho | prompt remediación v1.0 · plan 2026-08-11 · informe §12 | Review §11 60/100 no invalida G6/delta; no ratifica delta. [DESEMPATE] viewport 1280. Tracks UX/DS/FE desplegados. |
| 2026-08-11 | REM-UI-GO | AI-EM-ARCH | Hecho | QA D-R* GO · FE C-R1…C-R7 · locator CA-05 | P1 §11 cerrados. Delta ratificado en UI. G6.5/G7 abiertos. |
| 2026-08-11 | C-R1…C-R7 | AI-FE-PLATFORM | Hecho | jest dashboard 38/38 + campana/cache · typecheck 0 · audit-ui 0 · E2E sin Chromium | Hora honesta por oleada; anuncio/foco B1; DropdownMenu B0; matriz 375/768/1280; cache audit compartida; I-6 foco+reduced motion; `<time>` mono. Sin veredicto §12. |
| 2026-08-11 | DS-B-R1…R3 | AI-DS-OWNER | **GO condicionado** | `DropdownMenu.tsx` :126-147 · :246-259 · :275-293 · `DashboardClient.tsx:370-371` · DS v1.3 §2.1 nota (a) | Carril rápido B-R1…B-R3. Sin bump v1.4. FE autorizado a componer. Ver §12 veredicto B. |
| 2026-08-11 | U-R1…U-R3 | AI-PROD-UX | Hecho | UX spec adendas R-A…R-D | Remediación UI formalizada. Copy hora desactualizada + alerta de grupo B1 + anuncio I-6. Matriz B0 375/768/1280. R-8 vigente. Sin [BLOQUEO]. |
| 2026-08-11 | D-R1…D-R7 | AI-SR-QA | **GO** | working tree · HEAD `ee0998d5` · jest 9/131 · cov lines 93,95% / branches 85,48% · typecheck 0 · audit-ui 0 · E2E 28/29 | CA-REM-01…10 OK. P1 R-P1-01…03 cerrados. Residual: locator E2E CA-05 (strict mode). No anticipa G6.5/G7. Ver §12 veredicto D. |

---

## 9. Dictámenes G6 (append-only)

### G6-2 · Identidad — AI-DS-OWNER

**Fecha:** 2026-08-10  
**Modo:** review (código) — skill `iwana-identity-ui-review`  
**Contrato:** [`2026-08-04-portal-dashboard-recomposicion-ds-contrato.md`](../specs/2026-08-04-portal-dashboard-recomposicion-ds-contrato.md) **v1.1** · Firma iWana · ADR-075  
**HEAD auditado:** `eb5851d0` (ancestro de `1014990f` a11y y `9937c7d7` DS v1.1: sí)

#### Veredicto: **GO**

Cero hallazgos P0/P1 de identidad en el alcance del home `/dashboard` + shell de layout. G6 consolidado sigue pendiente de G6-1/G6-3/G6-4/G6-5.

#### Script

```text
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs \
  apps/portal/src/components/shared/portal-ui.tsx \
  apps/portal/src/components/dashboard \
  apps/portal/src/components/layout \
  apps/portal/src/app/dashboard/layout.tsx
```

**Resultado:** P0: 0 · P1: 0 · P2: 1 heurístico `[revisar]` · P3: 0.

| Hallazgo script | Veredicto manual |
| --- | --- |
| `portal-ui.tsx:363` `bg-iwana-secondary-50` en `portalFilterChipClassName` activo | **Descartado** — acento de chip activo (predicado de interacción), no fondo base de panel; fondo suave del sistema permanece `iwana-surface-soft` |

**Puntaje derivado (alcance G6-2):** 97/100 (P0: 0, P1: 0, P2: 1 residual no reportado por el script, P3: 0) — banda alineada.

#### Evidencia de cumplimiento (checklist identidad)

| Check | Evidencia |
| --- | --- |
| Sombras duales | `portalMetricCardShellClassName` → `shadow-iwana-soft`; interactivo → `hover:shadow-iwana-active`; `PortalPanel` / `PageHeader` → `shadow-iwana-soft`; menú flotante del home → `shadow-iwana-lg` (nivel flotante autorizado) |
| Tokens (sin hex de marca / sin `tailwind.config`) | Sin `text-[#` / `bg-[#` en dashboard+layout del alcance; lienzo `bg-iwana-neutral-50` en `layout.tsx`; capas sticky/overlay/drawer vía `z-(--z-*)` (ADR-075) |
| Firma barra lima | `Sidebar.tsx` ítem activo: `span` `aria-hidden` con `bg-iwana-secondary dark:bg-iwana-secondary-400` (E2E D-7 + spec §5.1) |
| Sin primitives paralelas | `MetricCard.tsx` / `DashboardPanel.tsx` **ausentes**; consumidores usan `PortalDashboardMetric` + `PortalPanel` |
| Eyebrow §1.7 | `portalMetricEyebrowClassName`: tipografía `portal-eyebrow-muted` + override `text-gray-700 dark:text-gray-200` en `danger`/`warning`; test `portal-dashboard-metric.spec.tsx`; **sin** lima sobre rose/amber |
| Lima como predicado (núcleo) | `PortalMetricCardAccent` sin casilla lima; única puerta lima en métrica = `delta.tone === 'progress'` → `Badge variant="lime"`; «Actualizando» = avance; highlight comercial post I-6 = señal de aterrizaje (UX §3.4 sin href), no acento de urgencia |
| Acento de riesgo en KPI | I-4/I-5/I-6 usan `danger`/`warning` en composition — no lima |

#### Residual no bloqueante (P2)

| ID | Severidad | Evidencia | Impacto | Recomendación | Esfuerzo |
| --- | --- | --- | --- | --- | --- |
| ID-R1 | P2 | `RecentActivityPanel.tsx` — `bg-iwana-secondary-700` en viñeta de cada fila del historial (`aria-hidden`) | Lima sin predicado de completitud/avance/interacción (contrato §4.1 / prueba operativa «sustituir por gris») | Sustituir por `bg-gray-400 dark:bg-gray-500` (o token neutro de lista); no abrir casilla lima | S |

**Fuera de conteo bloqueante (shell legacy, no home metrics):** `NotificationBell` eyebrow con `tracking-[0.22em]` ad hoc; `DropdownUser` `shadow-lg` en lugar de `shadow-iwana-lg`. No elevan a P1; consolidación diferible.

#### Hallazgos P0 / P1

Ninguno.

#### Notas al orquestador

- Este dictamen **no** cierra G6 ni anticipa G6.5/G7.
- Residual ID-R1 puede remediarse en carril rápido FE sin reabrir contrato DS v1.1.
- Re-medir contraste eyebrow danger/warning queda en track QA (G6-4), no en este acto.

### G6-3 · Experiencia — AI-PROD-UX

**Fecha:** 2026-08-10  
**Modo:** review (experiencia) — perfil AI-PROD-UX · UX spec v1.0 congelada  
**Contratos:** [`2026-08-04-portal-dashboard-recomposicion-ux-spec.md`](../specs/2026-08-04-portal-dashboard-recomposicion-ux-spec.md) v1.0 · [`HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md`](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md) CA-V2-01…12 · plan §5  
**HEAD auditado:** `eb5851d0` (ancestro de `1014990f`: sí)

#### Veredicto: **NO-GO**

Once criterios de experiencia se cumplen con evidencia nueva (unit Task 3/4 + E2E Task 6 + capturas). **CA-V2-05 no se satisface:** el home emite hrefs con filtro (§3.2), pero cuatro destinos «Debe añadirse» (UX §3.5) **no hidratan** ese filtro desde la dirección. C-6 se cerró solo con hrefs + caché R-5; eso no verifica «el destino conserva el filtro al recargar». Tests baseline v1 (CA-01…06) no se cuentan como aserción nueva de CA-V2.

G6 consolidado sigue pendiente de remediación FE + re-dictamen G6-3 y de G6-1/G6-4/G6-5.

#### Chequeos de composición (plan G6-3)

| Check | Resultado | Evidencia |
| --- | --- | --- |
| Bandas B0–B3 | **OK** | `DashboardClient.tsx` B0 encabezado → B1 indicadores → B2/B2b → B3 subordinado; unit `B0–B3…`; capturas sin ficha empresa en primer viewport |
| Tareas por rol | **OK** | `dashboard-role-composition` 12/12 roles; techo ≠ composición; E2E D-3 ADMIN/NOC/SALES/TECHNICIAN |
| Primer viewport | **OK** | E2E D-5 375/768/1280: acción operable + ≥2 indicadores; `viewport-*.png` |
| Destinos / filtros | **FALLA** | Outbound OK (unit C-6); inbound I-1/I-2/I-4/I-7 sin lectura de URL (detalle abajo) |
| Estados | **OK** | Loading / vacío / error / `null` / actualizando · E2E D-1/D-2 + unit métricas |
| Sin gate binario | **OK** | `RoleRestrictedView` ausente en portal; unit + E2E sin «Panel en preparación» |
| Accesos rápidos filtrados | **OK** | `QuickActionsPanel.spec.tsx` por rol; sin Reportes / Fase siguiente |

#### Matriz CA-V2-01…12

| Criterio | Veredicto | Evidencia (aserciones nuevas de esta fase) |
| --- | --- | --- |
| CA-V2-01 | **OK** | Unit `dashboard-role-composition.spec.ts`: 12 roles con identidad B3 + quick-actions + acción primaria; E2E D-3 sin «Panel en preparación» (ADMIN/NOC/SALES/TECHNICIAN) |
| CA-V2-02 | **OK** | Unit: composición ⊆ techo de autorización por rol; destinos de registro tipado `/dashboard/*`; sin ampliación de permisos |
| CA-V2-03 | **OK** | E2E D-5: control de acción dentro del viewport + ≥2 indicadores a 375/768/1280; capturas `viewport-{375,768,1280}.png` |
| CA-V2-04 | **OK** | Registro I-1…I-7 (techo 7 ≤ 9); ADMIN 7; ACCOUNTANT 1; TECHNICIAN/base 0; unit B0–B3; métricas de cuenta fuera de B1 |
| CA-V2-05 | **NO-GO** | Hrefs unit OK (I-1…I-5, I-7; I-6 excepción onClick). **Falta hidratación en destino:** (1) agenda solo lee `technicianId`, ignora `view`/`fromDate`; (2) bandeja inicia con `buildDefaultPendingVisitFilters()` (`status: ''`), ignora `status=READY_TO_SCHEDULE`; (3) mesa: `TICKET_FILTER_KEYS` sin `slaBreachStatus` → I-4 ignorado; (4) expedientes: `useState(getDefaultExpedienteView())` sin `searchParams` → `view=open` no es filtro URL. I-3/I-5 sí leen URL. Sin E2E indicador→lista filtrada→recarga→Atrás. Contradice UX §3.3/§3.5 y HLD «destino conserva el filtro» |
| CA-V2-06 | **OK** | Unit `Promise.allSettled` + fallo WFM conserva assurance/accesos; E2E error de fuente |
| CA-V2-07 | **OK** | E2E D-1/D-2 axe claro/oscuro en cargado, vacío, error, `null`, loading, actualizando; residuales a11y cerrados `1014990f` |
| CA-V2-08 | **OK** | E2E D-4 375 px: drawer `inert`, Tab no entra al menú cerrado, Escape restaura foco |
| CA-V2-09 | **OK** | `RecentActivityPanel` / `TenantSummaryCard` mapean enums a vocabulario; unit vocabulario |
| CA-V2-10 | **OK** | Vacíos con siguiente acción (`Sin avisos de campo` → agenda; configuración al día); E2E vacío operativo |
| CA-V2-11 | **OK** | Unit + E2E: `null` → «Sin dato disponible», no cifra `0`; contraste AA post §1.7 |
| CA-V2-12 | **OK** | E2E D-7: barra lima + `aria-current` en Inicio; sombra soft en métrica; `firmas-iwana-1280.png`; lima no usada para urgencia |

#### Remediación mínima (desbloquea re-dictamen)

Dueño: **AI-FE-PLATFORM** (sin contrato nuevo ni ampliación `@Roles`).

1. Agenda (`SchedulingClient`): hidratar `view` + `fromDate` desde `searchParams` (I-1).
2. Bandeja (`PendingVisitRequestsView`): hidratar `status` (p. ej. `READY_TO_SCHEDULE`) desde URL (I-2).
3. Mesa (`AssuranceClient`): incluir `slaBreachStatus` en `TICKET_FILTER_KEYS` + `listFilters` (I-4).
4. Expedientes CRM: leer/escribir `view` en la dirección (I-7).
5. Prueba E2E nueva: clic indicador → URL con filtro → recarga conserva conjunto → Atrás vuelve al home (caché R-5).

Tras SHA de remediación: reabrir **G6-3** (no parchear este dictamen en silencio).

#### Notas al orquestador

- Este dictamen **no** cierra G6 ni anticipa G6.5/G7.
- No se exige cambio de alcance funcional ni de UX spec v1.0: el gap es implementación incompleta de §3.5 ya declarado en la spec.
- Baseline E2E CA-01…06 (v1) permanece útil como regresión, pero **no** cuenta como evidencia CA-V2.

### G6-4 · Calidad — AI-SR-QA

**Fecha:** 2026-08-10  
**Modo:** re-verify post a11y `1014990f` — perfil AI-SR-QA  
**Contratos:** HLD CA-V2-01…12 · UX-15/16 · plan §5 G6-4  
**HEAD auditado (pre-commit dictamen):** `7ea22066` (incluye `1014990f`)

#### Veredicto: **NO-GO**

Cobertura dashboard core ≥80% (stmts **81,89%** / lines **84,97%**). Filtros axe de residuales Task 6 **retirados** en `1014990f` (`runAxe` usa `result.violations` sin `nodes.filter`). E2E sin filtros: **21/25** — 4 fallos `color-contrast` en tema **light** (cargado / null / vacío / error). Tema dark y D-3/D-4/D-5/D-7 en verde. **No es bug de test:** el nodo fallante es la ranura `description` con `text-gray-500` (#6a7282) sobre shell `accent='danger'` (#fef3f3) ≈ **4,45:1**; §1.7 solo escaló el eyebrow. CA-V2-05 sigue sin aserción de hidratación destino + Atrás (heredado G6-3). Baseline E2E CA-01…06 **no cuenta**.

`[BLOQUEO]` producto → AI-DS-OWNER + AI-FE-PLATFORM (contraste descripción×danger/warning) y AI-FE-PLATFORM (CA-V2-05 hidratación + E2E). Sin cambio de código de feature en este acto QA.

#### Comandos re-verify

```text
pnpm --filter @iwana/portal exec jest --coverage --collectCoverageFrom="components/dashboard/**/*.{ts,tsx}" --testPathPattern=components/dashboard --runInBand
# → 7 suites · 76 pass · stmts 81,89% · lines 84,97% · funcs 82,14% · branches 71,33%

pnpm exec playwright test --config e2e/playwright.portal.config.ts portal-dashboard-empresa
# → 21 passed · 4 failed (axe color-contrast light) · ~62 s
```

#### Axe / filtros

| Check | Resultado |
| --- | --- |
| Filtros residuales Task 6 eliminados | **Sí** — diff `1014990f` retira `nodes.filter` / exclusiones color-contrast |
| `runAxe` actual | `AxeBuilder.withTags(['wcag2a','wcag2aa']).analyze()` → `expect(violations).toEqual([])` |
| Light (4 estados) | **FAIL** — 1 nodo `color-contrast` serio: `…text-gray-500…` «Acuerdo de servicio en riesgo» sobre `.border-rose-200` |
| Dark (4 estados) + loading + actualizando | **PASS** |

#### Matriz CA-V2-01…12 + UX-15/16 ↔ test (aserciones de fase)

| Criterio | Veredicto | Test con path |
| --- | --- | --- |
| CA-V2-01 | **OK** | `apps/portal/src/components/dashboard/dashboard-role-composition.spec.ts` — 12 roles + identidad/acción; `DashboardClient.spec.tsx` «Panel en preparación»; `e2e/tests/portal-dashboard-empresa.spec.ts` D-3 |
| CA-V2-02 | **OK** | `dashboard-role-composition.spec.ts` — techo autorización + destinos tipados `/dashboard/*` (no baseline CA-02) |
| CA-V2-03 | **OK** | `e2e/tests/portal-dashboard-empresa.spec.ts` D-5 viewport 375/768/1280 |
| CA-V2-04 | **OK** | `dashboard-role-composition.spec.ts` I-1…I-7 + techo; `DashboardClient.spec.tsx` «B0–B3…» |
| CA-V2-05 | **NO-GO** | Solo outbound: `DashboardClient.spec.tsx` «navega indicadores con filtros de URL (C-6)». **Sin** test que aserte hidratación en destino ni Atrás→home (criterio incompleto) |
| CA-V2-06 | **OK** | `DashboardClient.spec.tsx` «contiene fallos parciales…»; E2E «error de fuente…» |
| CA-V2-07 | **NO-GO** | E2E D-1/D-2 axe light **falla** (4 tests). Dark OK. Unit tokens AA en `dashboard-metrics-states.spec.tsx` no sustituye axe de página |
| CA-V2-08 | **OK** | `e2e/tests/portal-dashboard-empresa.spec.ts` D-4 drawer inert / Tab / Escape |
| CA-V2-09 | **OK** | `RecentActivityPanel.spec.tsx` «helpers de vocabulario…»; `TenantSummaryCard.spec.tsx` «traduce estados sin enums crudos…» |
| CA-V2-10 | **OK** | `OnboardingAlerts.spec.tsx` / `RecentActivityPanel.spec.tsx` vacíos accionables; E2E «vacío operativo» |
| CA-V2-11 | **OK** | `dashboard-metrics-states.spec.tsx` «value null…»; `DashboardClient.spec.tsx` «métrica nula…»; E2E null + «Sin dato disponible» (aserción de valor; axe light fallido va a CA-V2-07) |
| CA-V2-12 | **OK** | E2E D-7 firmas; `dashboard-metrics-states.spec.tsx` sombra soft/active |
| UX-15 | **OK** | `DashboardClient.spec.tsx` «recarga silenciosa…»; E2E «estado actualizando…» |
| UX-16 | **OK** | `DashboardClient.spec.tsx` «al remontar con caché de sesión no vuelve a pedir red (R-5)» (sin E2E browser Atrás dedicado) |

#### Cobertura (núcleo `components/dashboard`)

| Métrica | Valor | Umbral |
| --- | --- | --- |
| Statements | **81,89%** | ≥80% |
| Lines | **84,97%** | ≥80% |
| Functions | 82,14% | informativo |
| Branches | 71,33% | informativo |

#### Remediación mínima (desbloquea re-dictamen G6-4)

1. **AI-DS-OWNER / AI-FE-PLATFORM:** aplicar escalón AA a la ranura `description` (y cualquier muted) sobre shells `danger`/`warning` en `portal-ui.tsx` (`PortalMetricCard` / `PortalDashboardMetric` ~L426/L598), o extender contrato DS §1.7 a descripción; re-medir axe light sin filtros.
2. **AI-FE-PLATFORM:** cerrar hidratación CA-V2-05 (ítems G6-3) + E2E indicador→filtro→recarga→Atrás.
3. Reabrir **G6-4** (y G6-3) tras SHA de remediación — no reintroducir filtros axe.

#### Notas al orquestador

- Este dictamen **no** cierra G6 ni anticipa G6.5/G7.
- G6-3 marcó CA-V2-07 OK con confianza en `1014990f`; la re-medición G6-4 **revoca** ese OK para contraste de página en light.
- SHA del commit de este dictamen documental: el de `docs(mod02): record G6-4 SR-QA quality dictamen` (posterior a `7ea22066`).

### G6-1 · Gates técnicos — AI-PLAT-OPS

**Fecha:** 2026-08-10  
**Modo:** ejecución de gates (no dictamen de producto)  
**SHA confirmado al inicio:** `eb5851d0` (`git rev-parse --short HEAD`) · ancestro de `1014990f`: sí · rama `feat/mod02-dashboard-portal-recomposicion`  
**Nota:** durante la corrida el HEAD de rama avanzó con commits documentales posteriores (`5f4d1b15`+); la evidencia de comandos de este acto se ancla al SHA de apertura `eb5851d0`.

#### Resultado técnico: **NO-GO** (no es GO de G6 consolidado)

Causa: Playwright `portal-dashboard-empresa` **exit 1** (21 pass / 4 fail). Audits documentales `BLOQUEANTE: 0`. Lint/typecheck/`pnpm test` monorepo y suites acotadas en verde. **AI-PLAT-OPS no declara G6 GO** — consolidación EM-ARCH tras dictámenes.

#### Tabla de evidencia

| Comando | Exit | Notas críticas |
| --- | --- | --- |
| `pnpm lint` | **0** | Turbo 8/8 · Cached: 0 · 0 errors (warnings preexistentes portal/api/web/db/worker) |
| `pnpm typecheck` | **0** | Turbo 8/8 · Cached: 0 · ~10,5 s |
| `pnpm --filter @iwana/api exec jest src/modules/tenant/tenant-self.spec.ts --runInBand` | **0** | 1 suite · **17/17** pass · ~8 s |
| `pnpm --filter @iwana/portal test -- --runInBand` | **0** | 181 suites · **1205** pass · 1 skip · ~157 s |
| `pnpm test` (monorepo) | **0** | Turbo 9/9 · api 247 suites / 3133 pass · portal 181/1205 · web 23/113 · worker 15/105 · ~143 s |
| `pnpm exec playwright test --config e2e/playwright.portal.config.ts portal-dashboard-empresa` | **1** | **21/25** · 4 fail axe `color-contrast` tema **light** (cargado/null/vacío/error) · dark OK · ~64 s |
| `pnpm audit:adr-citations` | **0** | **BLOQUEANTE: 0** · AVISO: 113 |
| `pnpm audit:doc-locations` | **0** | **BLOQUEANTE: 0** · AVISO: 2 |
| `node …/audit-ui.mjs` (portal-ui + dashboard + layout + dashboard/layout) | **0** | P0: 0 · P1: 0 · P2: 1 heurístico · P3: 0 |

#### `[BLOQUEO]` E2E axe light

- **Tests:** estado cargado / dato null / vacío operativo / error de fuente · tema light.
- **Regla:** `color-contrast` (serious).
- **Nodo:** descripción `text-gray-500` (#6a7282) sobre shell `danger` (#fef3f3) · ratio **4,45:1** (umbral 4,5:1) · copy «Acuerdo de servicio en riesgo» · target `.border-rose-200`.
- **Alineación:** coincide con G6-4 / deuda residual description×danger; remediación FE/DS v1.2 en curso fuera de este acto plat-ops.

#### Conteos BLOQUEANTE (audits)

| Audit | BLOQUEANTE |
| --- | --- |
| `audit:adr-citations` | **0** |
| `audit:doc-locations` | **0** |

#### Notas al orquestador

- Este acto **solo** registra evidencia de plataforma/CI local; **no** sustituye G6-2…G6-5 ni declara GO/NO-GO de G6 consolidado.
- Re-ejecutar G6-1 tras SHA de remediación axe + hidratación CA-V2-05 si EM-ARCH lo exige antes de G6.5.

### G6-1-R1 · Re-verify light — AI-PLAT-OPS (post remediación)

**Fecha:** 2026-08-10  
**Modo:** re-verify acotado (solo Playwright + audit-ui; no suite completa de gates)  
**SHA al inicio:** `9fc1ca7f` (`git rev-parse --short HEAD`) · ≥ `d4ee265a`: sí · rama `feat/mod02-dashboard-portal-recomposicion`

#### Resultado técnico (alcance light): **OK**

E2E `portal-dashboard-empresa` **26/26** exit **0**. `audit-ui.mjs` exit **0** (P0: 0 · P1: 0 · P2: 1 heurístico · P3: 0). **AI-PLAT-OPS no declara G6 GO consolidado.**

| Comando | Exit | Notas |
| --- | --- | --- |
| `pnpm exec playwright test --config e2e/playwright.portal.config.ts portal-dashboard-empresa` | **0** | **26/26** pass · ~1,2 min |
| `node …/audit-ui.mjs` (portal-ui + dashboard + layout) | **0** | P0/P1: 0 · P2: 1 `[revisar]` lime-50-surface |

#### Notas al orquestador

- Alcance **light** únicamente; no re-ejecuta lint/typecheck/`pnpm test`/audits ADR.
- No sustituye G6-4 re-medir, G6-5 ni consolidación EM-ARCH de G6.

### G6-3-R1 · Re-dictamen experiencia — AI-PROD-UX (post CA-V2-05)

**Fecha:** 2026-08-10  
**Modo:** re-dictamen (experiencia) — perfil AI-PROD-UX · UX spec v1.0 congelada  
**Contratos:** [`2026-08-04-portal-dashboard-recomposicion-ux-spec.md`](../specs/2026-08-04-portal-dashboard-recomposicion-ux-spec.md) §3.2 / §3.5 · [`HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md`](../hlds/HLD-MOD02-DASHBOARD-EMPRESA-v2.0.md) CA-V2-01…12 · plan §5  
**HEAD auditado:** `9fc1ca7f` (ancestro de `d4ee265a` hidratación: sí · ancestro de `ddbc22cf` contraste v1.2: sí)  
**Dictamen previo:** G6-3 **NO-GO** (`eb5851d0`) — único fallo CA-V2-05

#### Veredicto: **GO**

Los cuatro destinos «Debe añadirse» de UX §3.5 **hidratan** el filtro desde la dirección. E2E `indicador → lista filtrada → recarga conserva filtro → Inicio` cubre I-1, I-2, I-4 e I-7. Los once CA que ya estaban OK en G6-3 se mantienen; **CA-V2-05 pasa a OK**. G6 consolidado sigue pendiente de G6-1 / re-dictamen G6-4 (axe light post `ddbc22cf`) / G6-5.

#### Chequeos de composición (plan G6-3)

| Check | Resultado | Evidencia |
| --- | --- | --- |
| Bandas B0–B3 | **OK** | Sin regresión vs G6-3 (`DashboardClient` B0→B3) |
| Tareas por rol | **OK** | Sin regresión vs G6-3 (`dashboard-role-composition` 12/12) |
| Primer viewport | **OK** | Sin regresión vs G6-3 (E2E D-5 + capturas) |
| Destinos / filtros | **OK** | Inbound I-1/I-2/I-4/I-7 hidratan URL (`d4ee265a`) + E2E CA-V2-05 |
| Estados | **OK** | Sin regresión vs G6-3 |
| Sin gate binario | **OK** | Sin regresión vs G6-3 |
| Accesos rápidos filtrados | **OK** | Sin regresión vs G6-3 |

#### Matriz CA-V2-01…12 (re-score)

| Criterio | Veredicto | Evidencia (aserciones nuevas / confirmadas) |
| --- | --- | --- |
| CA-V2-01 | **OK** | Sin regresión vs G6-3 |
| CA-V2-02 | **OK** | Sin regresión vs G6-3 |
| CA-V2-03 | **OK** | Sin regresión vs G6-3 |
| CA-V2-04 | **OK** | Sin regresión vs G6-3 · techo I-1…I-7 |
| CA-V2-05 | **OK** | **I-1** `hydrateSchedulingFiltersFromSearchParams` + `SchedulingClient` init · unit aria-pressed Día / rango API · E2E `view=day`+`fromDate` → reload conserva URL → Inicio. **I-2** `hydratePendingVisitFiltersFromSearchParams` + `PendingVisitRequestsView` · unit `status=READY_TO_SCHEDULE` en API · E2E URL+reload. **I-4** `TICKET_FILTER_KEYS` + `listFilters.slaBreachStatus` · unit `AT_RISK` en `listTickets` · E2E URL+reload. **I-7** `parseExpedienteViewFromSearchParams` + init `activeView` + write-back `view` en pestañas · unit incluye `converted` · E2E `view=open`+reload. I-3/I-5 ya existían; I-6 excepción §3.4. |
| CA-V2-06 | **OK** | Sin regresión vs G6-3 |
| CA-V2-07 | **OK*** | *Código DS v1.2 aplicado (`ddbc22cf`); **cierre formal axe light = re-dictamen G6-4** (no bloquea este acto experiencia) |
| CA-V2-08 | **OK** | Sin regresión vs G6-3 |
| CA-V2-09 | **OK** | Sin regresión vs G6-3 |
| CA-V2-10 | **OK** | Sin regresión vs G6-3 |
| CA-V2-11 | **OK** | Sin regresión vs G6-3 |
| CA-V2-12 | **OK** | Sin regresión vs G6-3 |

#### Residuales no bloqueantes (experiencia)

1. E2E CA-V2-05 vuelve al home vía enlace **Inicio** del sidebar, no via `page.goBack()` / botón Atrás del navegador (HLD nombra «Atrás»). El retorno al inicio queda asertado; el historial del navegador no.
2. E2E I-7 usa `view=open` (coincide con default de lista); la hidratación no-default (`converted`) queda cubierta en unit `expediente-list-view.spec.ts` + write-back en pestañas.

#### Notas al orquestador

- Este re-dictamen **cierra el bloqueante de experiencia G6-3** (CA-V2-05). **No** cierra G6 consolidado ni anticipa G6.5/G7.
- Desbloquea formalmente el track experiencia; G6-4 debe re-medir axe light post `ddbc22cf` y puede retirar el NO-GO heredado de CA-V2-05.
- Baseline E2E CA-01…06 (v1) sigue sin contar como evidencia CA-V2.
- SHA de este commit documental: el de `docs(mod02): re-dictamen G6-3 PROD-UX after CA-V2-05 fix`.

### G6-4-R1 · Re-dictamen calidad — AI-SR-QA (post remediación)

**Fecha:** 2026-08-10  
**Modo:** re-dictamen (calidad) — perfil AI-SR-QA · re-verify post `ddbc22cf` + `d4ee265a`  
**Contratos:** HLD CA-V2-01…12 · UX-15/16 · plan §5 G6-4  
**HEAD auditado:** `05425960` (ancestro de `d4ee265a` hidratación: sí · `ddbc22cf` contraste v1.2: sí · docs `9fc1ca7f`: sí)  
**Dictamen previo:** G6-4 **NO-GO** (`7ea22066`) — CA-V2-07 axe light description×danger + CA-V2-05 sin aserción destino

#### Veredicto: **GO**

Cobertura dashboard core ≥80% (stmts **81,89%** / lines **84,97%**). Jest dashboard **77/77**. Playwright `portal-dashboard-empresa` **26/26** (incluye D-1/D-2 axe light+dark + test CA-V2-05 hidratación destino). Filtros axe residuales **no** reintroducidos. Spot-check unit de helpers de hidratación: I-1 `scheduling-ui.spec.ts` / `SchedulingClient.spec.tsx`; I-2 `pending-visits-ui.spec.ts` / `PendingVisitRequestsView.spec.tsx`; I-4 `AssuranceClient.spec.tsx`; I-7 `expediente-list-view.spec.ts`. **CA-V2-05** y **CA-V2-07** pasan a OK. Baseline E2E CA-01…06 **no cuenta**.

Sin `[BLOQUEO]` de producto en este acto. G6 consolidado sigue pendiente de G6-5 + consolidación EM-ARCH (G6-1 light OK no sustituye GO consolidado).

#### Comandos re-verify

```text
pnpm --filter @iwana/portal exec jest --coverage --collectCoverageFrom="components/dashboard/**/*.{ts,tsx}" --testPathPattern=components/dashboard --runInBand
# → 7 suites · 77 pass · stmts 81,89% · lines 84,97% · funcs 82,14% · branches 71,33%

pnpm exec playwright test --config e2e/playwright.portal.config.ts portal-dashboard-empresa
# → 26 passed · 0 failed · ~67 s
```

#### Axe / filtros

| Check | Resultado |
| --- | --- |
| Filtros residuales Task 6 | **Ausentes** — `runAxe` → `expect(violations).toEqual([])` sin `nodes.filter` |
| Light (4 estados) | **PASS** — cargado / null / vacío / error |
| Dark (4 estados) + loading + actualizando | **PASS** |

#### Matriz CA-V2-01…12 + UX-15/16 ↔ test (deltas vs G6-4 NO-GO)

| Criterio | Antes (G6-4) | Ahora (G6-4-R1) | Evidencia |
| --- | --- | --- | --- |
| CA-V2-01…04 | OK | **OK** | Sin regresión |
| CA-V2-05 | **NO-GO** | **OK** | Unit hidratación I-1/I-2/I-4/I-7 + E2E `indicador → lista filtrada → recarga conserva filtro → Inicio` (`portal-dashboard-empresa.spec.ts`) |
| CA-V2-06 | OK | **OK** | Sin regresión |
| CA-V2-07 | **NO-GO** | **OK** | E2E D-1/D-2 axe light 4/4 pass post `ddbc22cf` / DS v1.2 |
| CA-V2-08…12 | OK | **OK** | Sin regresión |
| UX-15/16 | OK | **OK** | Sin regresión; E2E CA-V2-05 usa Inicio sidebar (no `goBack`) — residual no bloqueante alineado a G6-3-R1 |

#### Cobertura (núcleo `components/dashboard`)

| Métrica | Valor | Umbral |
| --- | --- | --- |
| Statements | **81,89%** | ≥80% |
| Lines | **84,97%** | ≥80% |
| Functions | 82,14% | informativo |
| Branches | 71,33% | informativo |

#### Notas al orquestador

- Este re-dictamen **cierra el bloqueante de calidad G6-4** (CA-V2-07 + CA-V2-05). **No** cierra G6 consolidado ni anticipa G6.5/G7.
- Delta E2E: **21/25 → 26/26** (+1 escenario CA-V2-05; 4 axe light recuperados).
- Delta jest dashboard: **76 → 77** pass; cobertura stmts/lines sin cambio material (≥80%).
- SHA de este commit documental: el de `docs(mod02): re-dictamen G6-4 SR-QA after remediacion`.

### G6-5 · Consolidación — AI-EM-ARCH

**Modo:** EM + Orchestrator  
**Fecha:** 2026-08-10  
**SHA tip al consolidar:** `b8e76630`

#### Veredicto G6: **GO**

| Sub-gate | Dictamen | SHA evidencia |
| --- | --- | --- |
| G6-1 técnico | **OK** tras R1 (lint/typecheck/test monorepo verdes en `eb5851d0`; E2E **26/26** + audit-ui en `9fc1ca7f`) | `c527636c` · `4aa226bc` |
| G6-2 identidad | **GO** (P0/P1 = 0; P2 viñeta lima cerrado en `7ea22066`) | `8ed02260` |
| G6-3 experiencia | **GO** tras R1 (CA-V2-01…12) | `05425960` |
| G6-4 calidad | **GO** tras R1 (cov ≥80%; E2E 26/26; CA-V2-05/07 OK) | `b8e76630` |

**Impacto:** multi-tenant sin cambio de aislamiento; seguridad sin ampliación de `@Roles`/endpoints; escala sin fachada agregadora; regulación N/A UI.

**Deuda residual aceptada (no bloquea G6):** E2E CA-V2-05 usa navegación «Inicio» del sidebar en lugar de `page.goBack()`; contrato tenant en `@iwana/shared` y rate-limit global fuera de fase.

**G6.5:** no iniciado — exige corrida Linux de CI identificada por SHA.  
**G7:** no iniciado — exige recomendación explícita + CTO.  
Ninguno se infiere de este GO (ADR-069).

---

## 10. Delta UX residual — 2026-08-11 (AI-EM-ARCH)

**Veredicto del review post-G6:** pantalla alineada al encuadre de recomposición; residual con **tarjetas gemelas** (mismo eyebrow Operaciones/Mesa/Comercial ×2) como hallazgo dominante de escaneo. **No invalida el G6 GO.**

**Prompt emitido:** [`PROMPT-MOD02-DASHBOARD-PORTAL-DELTA-UX-v1.0.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-DELTA-UX-v1.0.md) **v1.2 (opción 3)** — B1 por dominio, Ver más inteligente, deep links historial, pista **[CONSULTA] SEC-ENG** para AUDITOR/`audit-logs`. Clase A (anti-alcance) fuera. Página historial completo (P-4) fuera.

**Estado del delta:** **calidad GO** (2026-08-11, re-dictamen QA) · residual E2E Chromium · sin G6.5/G7

| Track | Agente | ID sesión |
| --- | --- | --- |
| E · SEC-ENG | [SEC-ENG consulta AUDITOR](986c06de-ce31-42a5-a4ea-7bb9cde5a34d) | **GO condicionado** (2026-08-11) |
| B · DS-OWNER | [DS-OWNER contrato v1.3](f16e14a3-6316-485f-a1c1-bb8b9a40f79d) | **Hecho** — DS v1.3 congelado |
| UX · PROD-UX | [PROD-UX adendas Ver más](203c093e-d92a-4685-9463-f09b39411f4e) | **Hecho** — U-1/U-2/U-3 en UX spec |
| A · SR-FULL MFA | [SR-FULL copy MFA](551e9811-0f18-4426-8c20-b64f79711f96) | **Hecho** — A-1/A-2 · tenant-self 17/17 |
| A · SR-FULL A-3 | [SR-FULL A-3 audit AUDITOR](c88c2f63-bd6d-406f-9cd2-2a5e3c6db47a) | **Hecho** — list +AUDITOR; export sin AUDITOR; sanitize read; 37 tests |
| C · FE-PLATFORM | [FE-PLATFORM delta C-1…C-12](ab543119-ee15-4587-a608-ebb8446a8d99) | **Hecho** — C-1…C-12 · jest 99/99 · audit-ui P0/P1=0 |
| C · FE C-13 | [FE C-13 historial AUDITOR](57644670-bf0d-41b1-9fed-f5a90ebdd13f) | **Hecho** — change-history AUDITOR · 68/68 |

**Oleada 2 (QA):** [SR-QA verificar delta UX](fc16160a-2913-47a7-93f6-f0cd8c479858) → **GO condicionado**

| CA | Resultado |
| --- | --- |
| 01,02,06–14 | OK |
| 03,04,05 | FAIL evidencia — falta unit D-1/D-2/D-3 |
| Cov dashboard | stmts **81,95%** / lines **85,05%** (sin retroceso) |
| E2E | no corrido (Chromium ausente); mock aún «MFA no obligatorio» |

**Oleada 2b (remediación QA):** [FE tests D-1 D-3 + E2E MFA](ad0373fe-8026-4bcf-a184-188a5b30a974) → **Hecho** (DashboardClient 21/21; mocks E2E MFA alineados)

**Oleada 2c (re-dictamen QA):** [SR-QA re-dictamen CA-03-05](fc16160a-2913-47a7-93f6-f0cd8c479858) → **GO condicionado** (solo E2E Chromium no ejecutado en sandbox; patrón G6)

| Métrica | Valor |
| --- | --- |
| CA-DELTA-01…14 | **OK** (03/04/05 remedados) |
| DashboardClient.spec | 21/21 |
| Cov dashboard | stmts **84,58%** / lines **87,15%** |
| E2E mock MFA | 0× «MFA no obligatorio» |
| Residual | Playwright browser en entorno local/CI (PLAT-OPS si hace falta) |

### Veredicto EM-ARCH — delta UX v1.2 (2026-08-11)

**Calidad del delta: GO** para integrar en la rama de trabajo (CA unitarios + SEC + DS + UX cerrados).
**No** anticipa G6.5 ni G7 (ADR-069).
**Residual explícito:** corrida E2E portal-dashboard con Chromium en CI/Linux cuando PLAT-OPS/CI lo permitan.

Tracks cerrados: SEC · DS v1.3 · PROD-UX · SR-FULL A-1…A-3 · FE C-1…C-13 · QA (re-dictamen).

### Dictamen SEC (pista E) — 2026-08-11

**Veredicto:** GO condicionado · agente [SEC-ENG consulta AUDITOR](986c06de-ce31-42a5-a4ea-7bb9cde5a34d)

**Controles mínimos (merge):**
1. `@Roles` list `GET /audit-logs` + `UserRole.AUDITOR`; tenant solo JWT.
2. Export: documentar o acotar `@Roles` por método (list +AUDITOR; export ADMIN/SYSTEM_ADMIN salvo justificación).
3. Re-sanitize `oldValue`/`newValue` en path de lectura (`AuditQueryService`).
4. FE home AUDITOR: solo acción, tipo entidad, actor, tiempo — sin dumps ni «ver todo»; límite ~8.
5. Tests: AUDITOR 200; otros 403; aislamiento tenant; sanitize read.
6. HLD-MOD02 §5.2 casilla AUDITOR «Actividad reciente» → Sí, citando este dictamen.

| A · SR-FULL A-3 | [SR-FULL A-3 audit AUDITOR](c88c2f63-bd6d-406f-9cd2-2a5e3c6db47a) | desbloqueado tras SEC GO |

### Actualización de ejecución local — 2026-08-11

Esta actualización deja trazabilidad de la ejecución AI-EM-ARCH solicitada para el prompt v1.2. Se aplicó el protocolo multiagente con tracks de escritura disjuntos: FE (`Banach`, `019ff105-418d-72d0-bb6e-335ee80cd581`), backend (`Erdos`, `019ff105-421d-73b1-b761-c4aa52c09844`) y revisiones independientes DS (`Hubble`), UX (`Hypatia`), SEC (`Fermat`) y QA (`Anscombe`). No se revirtió trabajo previo del usuario.

#### Resultado funcional del delta

- **B / DS:** `PortalDashboardMetric.eyebrow` continúa opcional; B1 usa la receta de agrupación por dominio existente, sin tokens, primitivas ni shell nuevos. Se retiró el override gris del eyebrow para conservar la firma lima.
- **UX / C:** la promoción «Ver más» ahora considera estado de carga/error; onboarding distingue operación activa, no iniciada y configuración al día; el historial expone error aunque no tenga entradas y su vacío no presenta acción irrelevante; se añadió `ExpedienteRecord` al mapa de labels/deep links; riesgo usa ámbar y no lima; el skeleton accesible usa `role="status"`.
- **A / seguridad y vocabulario:** MFA se muestra como «verificación en dos pasos»; `AUDITOR` puede consultar actividad, pero no exportarla; la lectura vuelve a sanitizar valores; el fallback del actor ya no selecciona ni expone email y usa un identificador corto no sensible.
- **C-13:** el historial de auditoría permanece acotado a la composición permitida del inicio, con una sola consulta y sin dumps de payload.

#### Evidencia fresca

| Validación | Resultado |
| --- | --- |
| `pnpm test` | **OK**, Turbo 9/9 tareas exitosas |
| `pnpm lint` | **OK**, 0 errores; solo warnings preexistentes |
| `pnpm typecheck` | **OK**, Turbo 8/8 tareas exitosas |
| Jest portal focalizado | **OK**, 6 suites / 95 tests |
| Jest API focalizado | **OK**, 4 suites / 37 tests |
| E2E `portal-dashboard-empresa` | **OK**, 26/26 tests |
| Cobertura dashboard | statements **85,96%**, lines **88,36%**, branches **78,02%** |
| `audit-ui.mjs` | **P0 = 0**, **P1 = 0**; un P2 heurístico permitido para filtro activo lima |
| Auditoría de ubicaciones documentales | **OK**, bloqueantes 0 |
| Auditoría de citas ADR | **OK**, bloqueantes 0 |

La cobertura de statements/lines supera el baseline del informe. Branches queda en 78,02% y se conserva como deuda informativa si el gate se interpreta estrictamente por cada métrica, no como una afirmación de cobertura total ≥80%.

#### Dictamen actualizado de seguridad y gates

SEC revalidó el cierre del bloqueo PII: no hay fallback de email en el read model, la lista incluye `AUDITOR`, la exportación lo excluye y los controles de tenant/sanitización están cubiertos por las pruebas HTTP focalizadas. La mención heredada de exportación para `AUDITOR` en `PRD-MOD01-DEFINICION-v1.1.md` entra en conflicto con el contrato específico vigente de MOD02 (`HLD-MOD02-DASHBOARD-EMPRESA-v2.0.1` y este prompt); se registra como deuda documental/contractual para armonización futura, no como bloqueo de este delta acotado.

**CA-DELTA-01…13:** GO con evidencia local. **CA-DELTA-14:** GO condicionado por pruebas HTTP y dictamen SEC; queda pendiente una E2E real dedicada a `AUDITOR` y aislamiento entre tenants. **G6.5:** pendiente de corrida Linux/CI identificada por SHA. **G7:** pendiente de recomendación explícita y decisión CTO. Ninguno se infiere de las validaciones locales.

### Recomendación de cierre G7 — pendiente de CTO

**[ESCALACION AL CTO]** Recomiendo cerrar G7 únicamente cuando el run Linux/CI del commit candidato confirme: (1) suite unitaria y gate de branches del dashboard ≥80%; (2) E2E real de `AUDITOR` con aislamiento entre tenants, listado 200 y exportación 403; (3) `E2E_CLEANUP=OK`; y (4) auditorías documentales sin bloqueantes. La recomendación no constituye aprobación: el estado G7 permanece **pendiente de decisión CTO** hasta que exista SHA/run CI y registro formal de aceptación.

### Cierre de pendientes corregibles — 2026-08-11

Se corrigieron los pendientes locales detectados en la revisión:

- La cobertura focalizada del dashboard quedó en **118/118 tests**, 7 suites, con **branches 85,15%** (statements 91,94%; lines 93,11%).
- El runner E2E ahora deriva `PORT` desde `API_BASE_URL`, completa el primer cambio de contraseña de los administradores efímeros y pasa al spec un token operativo del tenant B.
- La suite operacional espera el reset contractual entre 4a/4c y limita la ráfaga BOLA de 4d a cinco requests concurrentes, manteniendo 121 lecturas.
- El E2E real de AUDITOR quedó integrado: listado 200 acotado al tenant del JWT, actividad sintética del tenant B ausente y exportación 403. Las primeras corridas localizaron y corrigieron el 401 por credencial de B y los timeouts de 4c/4d.

#### Evidencia E2E y estado de gate

La primera corrida real alcanzó cleanup correcto, pero terminó en 15 pasadas y 2 fallos; la segunda, tras corregir AUDITOR y 4c, alcanzó 17 pasadas y 1 fallo en 4d. Una tercera corrida fue interrumpida por el límite accidental del proceso antes de producir contadores válidos; el stack efímero se retiró manualmente con `docker compose ... down -v`.

**Cuarta corrida (2026-08-11, completa y válida):** con los fixes de 4c (reset contractual forzado) y 4d (ráfaga BOLA a 5 concurrentes) ya en el working tree, la suite completa quedó **30/0/0/0/0** (30 passed · 0 failed · 0 skipped · 0 did-not-run · 0 flaky), `E2E_SETUP=OK`, `E2E_PLAYWRIGHT_EXIT=0` y `E2E_CLEANUP=OK`. El runner corrió en `http://127.0.0.1:3010` porque el stack dev local ocupa el 3000 (el provisioner deriva `PORT` de `API_BASE_URL`). El gate `--verify-playwright-markers` aceptó el log con exit 0. Se confirma el objetivo `30/0/0/0/0` **local**; **G6.5 sigue pendiente** de la corrida Linux de CI identificada por SHA (ADR-069) y de la verificación del job en GitHub Actions.

La recomendación G7 permanece sin cambios: requiere G6.5 verde (run CI Linux por SHA) y decisión formal del CTO.

---

## 11. Review UI — Centro de control (MOD02)

### Resumen ejecutivo

El inicio `/dashboard` se reconoce como iWana sin depender del logo: usa barra lima de navegación activa, sombra dual, cifras mono/tabulares, superficies y tonos semánticos del sistema. La tarea principal está bien expresada por rol, pero esta auditoría no ratifica el cierre del delta mientras sigan abiertos tres P1: frescura engañosa ante fallos parciales, recuperación de error incompleta para tecnologías de asistencia y menú móvil con semántica de menú sin su comportamiento de teclado.

**Modo:** código + screenshots frescos locales a 375/768/1280 px

**Script:** 0 deterministas, 0 heurísticos confirmados, 1 heurístico descartado

**Puntaje:** **60/100** (P0: 0, P1: 3, P2: 3, P3: 1)

El heurístico descartado fue `bg-iwana-secondary-50` en `portalFilterChipClassName`: es un acento de interacción permitido, no un fondo base.

### Hallazgos críticos (P0)

Ninguno.

### Hallazgos

#### [P1][Confianza del dato] Una actualización fallida aparenta ser una lectura reciente

- **Evidencia:** `apps/portal/src/components/dashboard/DashboardClient.tsx:1064` crea una hora nueva antes de conocer los resultados; `:1077-1084` conserva el dato anterior cuando una fuente falla; `:1098` publica la hora nueva de todos modos; `:1252-1254` no muestra error si la métrica aún conserva un valor.
- **Impacto:** una persona operadora puede tomar decisiones sobre cifras antiguas bajo una marca nueva de «Última lectura», sin señal de dato desactualizado.
- **Recomendación:** conservar la hora de la última lectura exitosa por fuente y representar `error + data` como dato anterior con aviso recuperable; la hora global solo debe avanzar cuando su alcance quede explícito o la lectura completa termine correctamente.
- **Esfuerzo:** M.

#### [P1][Accesibilidad] El flujo error → reintento no anuncia el bloque ni conserva el foco

- **Evidencia:** `docs/specs/2026-08-04-portal-dashboard-recomposicion-ds-contrato.md:395` asigna al bloque un único `PortalAlert live='polite'`, pero B1 solo compone tarjetas en `apps/portal/src/components/dashboard/DashboardClient.tsx:1232-1302`; `docs/specs/2026-08-04-portal-dashboard-recomposicion-ux-spec.md:336` exige mover el foco al encabezado cuando desaparece «Reintentar», y `DashboardClient.tsx:345-366` no implementa ese retorno.
- **Impacto:** lectores de pantalla no reciben un anuncio agregado del fallo y, tras una recuperación exitosa, usuarios de teclado pierden su posición en una página extensa.
- **Recomendación:** añadir un `PortalAlert` por grupo B1 afectado y un destino de foco estable (`tabIndex={-1}` + ref) para la transición `error → success`, manteniendo el error visual y reintento por tarjeta.
- **Esfuerzo:** M.

#### [P1][Accesibilidad] El menú móvil declara `menu` sin implementar el patrón de teclado

- **Evidencia:** `apps/portal/src/components/dashboard/DashboardClient.tsx:382-453` controla el desbordamiento solo con `useState` y clic; no resuelve Escape, flechas, clic exterior, foco inicial ni retorno al disparador. La primitive vigente `packages/ui/src/components/DropdownMenu.tsx:126-145,255-300` ya cubre esos comportamientos.
- **Impacto:** las acciones secundarias del encabezado son inconsistentes o inoperables con el patrón esperado por usuarios de teclado y tecnologías de asistencia.
- **Recomendación:** componer `Button`, `DropdownMenu`, `DropdownMenuTrigger`, `DropdownMenuContent` y `DropdownMenuItem` de `@iwana/ui`; añadir E2E de Escape, flechas y retorno de foco.
- **Esfuerzo:** M.

#### [P2][Responsive] B0 no respeta la distribución congelada de acciones

- **Evidencia:** `DashboardClient.tsx:370-371` incluye `inline-flex` en el class-token base y `:390`/`:398` intenta ocultar controles con `hidden md:inline-flex`; el render fresco a 375 px sigue mostrando «Actualizar», la secundaria, la primaria y el menú. Desde `md`, `:409` oculta el menú y quedan tres controles visibles. La matriz de `docs/specs/2026-08-04-portal-dashboard-recomposicion-ux-spec.md:369-375` exige 1+menú, 2 y 2+menú respectivamente.
- **Impacto:** el encabezado gana altura y ruido en teléfono, y la jerarquía de acciones diverge en los tres puntos de corte.
- **Recomendación:** retirar `inline-flex` del token compartido o resolver variantes con `cn`/CVA, y materializar exactamente la matriz de prioridad del contrato.
- **Esfuerzo:** S.

#### [P2][Ingeniería frontend] Historial y campana mantienen lecturas y vocabularios paralelos

- **Evidencia:** el dashboard consulta `audit` desde `DashboardClient.tsx:302`, mientras `apps/portal/src/components/layout/NotificationBell.tsx:77-106` vuelve a consultar y sondea cada minuto. Esto contradice R-8 de `docs/specs/2026-08-04-portal-dashboard-recomposicion-ux-spec.md:416-419`. Además, `RecentActivityPanel.tsx:50-107` y `NotificationBell.tsx:14-40` mantienen mapas distintos; la campana conserva fallback de enum crudo y muestra identificador en `:213-217`.
- **Impacto:** la misma actividad puede verse distinta entre dos superficies del Centro de control, aumenta el presupuesto de peticiones y reaparecen términos internos.
- **Recomendación:** compartir una sola lectura del shell/home y promover etiquetas de acción/entidad a un helper canónico de vocabulario; no mostrar identificadores salvo necesidad operativa explícita.
- **Esfuerzo:** M.

#### [P2][Feedback] «Ofertas en riesgo» puede parecer una acción sin efecto

- **Evidencia:** `DashboardClient.tsx:1286-1294` solo cambia `highlightCommercial` y abre el pliegue; el mensaje de destino vive en `:713-720`, por debajo de B1, sin desplazamiento, foco ni anuncio del bloque revelado.
- **Impacto:** la persona pulsa el indicador, permanece visualmente en la misma tarjeta y puede no descubrir la lista que acaba de abrirse.
- **Recomendación:** llevar foco/contexto al bloque revelado y anunciar su actualización; cualquier desplazamiento debe respetar `prefers-reduced-motion`.
- **Esfuerzo:** M.

#### [P3][Firma iWana] Tiempos secundarios pierden el tratamiento mono técnico

- **Evidencia:** la hora del encabezado en `DashboardClient.tsx:1214` y el tiempo relativo en `apps/portal/src/components/dashboard/RecentActivityPanel.tsx:223-229` no usan `font-mono`/`tabular-nums`; el segundo tampoco usa `<time dateTime>`.
- **Impacto:** baja ligeramente la estabilidad de escaneo y se pierde la señal de dato técnico definida por Firma iWana.
- **Recomendación:** aplicar `font-mono tabular-nums` y semántica `<time>` donde corresponda.
- **Esfuerzo:** S.

### Quick wins

1. Corregir la matriz responsive de B0 y añadir aserciones E2E de cantidad exacta de acciones por breakpoint.
2. Aplicar mono/tabular y `<time>` a las marcas de tiempo.

### Mejoras estratégicas

- Consolidar el desbordamiento del encabezado sobre las primitives `Button`/`DropdownMenu` existentes; no requiere dependencia ni ADR nuevos.
- Unificar la lectura y el vocabulario del historial entre home y campana.
- Resolver con PROD-UX + DS-OWNER la tensión entre la adenda B1 por dominios y el objetivo original de mostrar B1 completa + inicio de B2 a 1280 px: la captura fresca muestra seis indicadores completos y parte del séptimo, sin B2. La adenda versiona el layout de indicadores, pero no deroga de forma explícita ese presupuesto de primer viewport; se registra como decisión por aclarar, no como hallazgo puntuado.

### Evidencia ejecutada

| Validación | Resultado |
| --- | --- |
| `audit-ui.mjs` focalizado | P0: 0 · P1: 0 · P2 heurístico: 1 descartado · P3: 0 |
| Jest dashboard + primitive métrica | **8 suites / 129 tests** pasaron |
| Cobertura dashboard focalizada | **118/118** · statements 91,94% · branches 85,15% · functions 91,54% · lines 93,12% |
| Playwright responsive/Firma | **4/4** pasaron; las aserciones actuales no detectan la cantidad incorrecta de acciones |
| Playwright axe estados/temas | **10/10** pasaron; claro/oscuro sin violaciones para los casos ejecutados |

### Por verificar

- Ejecutar axe con tag explícito WCAG 2.2 AA y completar la matriz de los seis estados en ambos temas; hoy `runAxe` usa `wcag2a` + `wcag2aa`, loading solo claro y updating solo oscuro.
- Regenerar la evidencia versionada después de corregir B0; las capturas actuales contienen el indicador de desarrollo «Cache disabled» y no son baseline de regresión visual.
- Fortalecer D-5: hoy verifica acción primaria dentro del viewport y ausencia de solape, pero no cantidad de acciones ni B1 completa/inicio de B2 a 1280 px.
- Verificar la ruta específica de CA-02 antes del mock global para que la prueba no pueda ocultar un acceso a endpoints de plataforma.

### Veredicto

**Aprobada con cambios bloqueantes.** La identidad iWana está correctamente implantada y no se requiere rediseño; los tres P1 deben cerrarse antes de usar esta revisión como ratificación del delta. Este dictamen no anticipa G6.5 ni G7, que permanecen sujetos a la corrida Linux por SHA y a la decisión formal correspondiente.

---

## 12. Remediación UI post-review §11 — 2026-08-11 (AI-EM-ARCH)

**Modo:** Orchestrator + EM.

**Consolidación:** el review §11 (60/100, P0: 0 · P1: 3 · P2: 3 · P3: 1) **no invalida** el G6 GO de recomposición ni el GO de calidad del delta UX v1.2. Tampoco ratifica el cierre del delta. Los tres P1 son huecos de implementación contra contratos ya congelados (R-3, UX §6.4, DS §2.1 nota (a), UX §8, R-8), no un rediseño.

**Prompt G4 remediación:** [`PROMPT-MOD02-DASHBOARD-PORTAL-REMEDIACION-UI-v1.0.md`](../prompts/PROMPT-MOD02-DASHBOARD-PORTAL-REMEDIACION-UI-v1.0.md)  
**Plan:** [`2026-08-11-mod02-dashboard-remediacion-ui.md`](../plans/2026-08-11-mod02-dashboard-remediacion-ui.md)

### [DESEMPATE] Primer viewport a 1280 px

**Área RACI:** UX · **Decisión:** la adenda B1 deroga el tramo «banda completa + inicio de B2» de UX §8 solo a 1280 px y solo para roles con ≥ 2 grupos de dominio. Suelo de §2.2 intacto (B0 + ≥ 2 indicadores). A 1280 el primer viewport exige B0 + los dos primeros grupos de dominio completos. B2 puede quedar bajo el pliegue. Justificación: el defecto de tarjetas gemelas pesa más que ver el arranque de B2 sin scroll. Registro: prompt remediación §2.

### Tracks

| Track | Dueño | IDs | Estado |
| --- | --- | --- | --- |
| UX | AI-PROD-UX | U-R1…U-R3 | **Hecho** — adendas R-A…R-D + copy en UX spec |
| B · carril rápido | AI-DS-OWNER | B-R1…B-R3 | **GO condicionado** (2026-08-11) |
| C · FE | AI-FE-PLATFORM | C-R1…C-R7 | Hecho — dictamen QA **GO** |
| D · QA | AI-SR-QA | D-R1…D-R7 | **GO** (2026-08-11) |

**Anti-alcance:** sin endpoints, `@Roles`, tokens de marca, primitive nueva, G6.5 ni G7.

**Impacto:** tenant / seguridad / escala / regulación = sin impacto. Superficie = `apps/portal` home + campana del shell. PII = sin cambio.

### Veredicto B · carril rápido (AI-DS-OWNER) — 2026-08-11

Contrato DS **v1.3 congelado** — sin bump a v1.4. Cero tokens de marca. Cero primitive nueva. FE queda autorizado a componer ya.

| ID | Veredicto | Evidencia |
| --- | --- | --- |
| **B-R1** | **GO condicionado** | Desbordamiento B0 = `Button` + `DropdownMenu` / `Trigger` (`asChild`) / `Content` / `Item` de `@iwana/ui`. Primitive verificada: Escape + retorno al disparador (`DropdownMenu.tsx:255-259`); flechas en disparador (`:126-147`) y en menú (`:275-293`, también Home/End); clic exterior (`:246-252`); foco inicial por teclado (`:131-134` primer ítem, `:143-146` último). Condición: al activar un ítem que no navega, devolver el foco al disparador en el `onClick` del consumidor (`triggerRef` + microtask) — `DropdownMenuItem` solo hace `setOpen(false)` (`:370-374`). No es hueco de API ni `[BLOQUEO]`. |
| **B-R2** | **GO** | `headerActionClassName` (`DashboardClient.tsx:370-371`) no debe llevar `inline-flex` en el token compartido: anula `hidden md:inline-flex` de Actualizar/secundaria (`:390`, `:398`). Receta: `cn` / CVA por variante (display fuera del token base). Visibilidad del disparador del menú (375 / 768 / 1280) va en un **wrapper**, no en `Button` (`Button.tsx:18` ya trae `inline-flex`). Sin token de marca. |
| **B-R3** | **GO** | Se reafirma DS §2.1 nota (a): el anuncio de error es del **grupo B1** (`PortalAlert variant='error' live='polite'`, `portal-ui.tsx:1718` / `:1731-1734`), no de `PortalDashboardMetric`. Prohibido abrir `aria-live` en la tarjeta. Checklist §9 A («La tarjeta no emite `aria-live` propio») sigue vigente. |

### Veredicto D · QA (AI-SR-QA) — 2026-08-11

**Modo:** verificación ejecutada (no implementación). Skills: `testing-patterns`.  
**Contratos:** prompt remediación v1.0 · UX spec adendas R-A…R-D · copy oficial PROD-UX.  
**HEAD de referencia:** `ee0998d5` (working tree de remediación C-R1…C-R7). **No anticipa G6.5 ni G7.**

#### Dictamen: **GO**

CA-REM-01…10 OK. Los tres P1 del review §11 (R-P1-01…03) quedan cerrados con evidencia unitaria y, donde aplica, E2E. Un fallo E2E residual (CA-05 baseline) es locator en strict mode, no un P1 de producto.

#### Matriz CA-REM

> **U-B0bis:** CA-REM-01/02/05/06 cubrían la franja B0 (Actualizar global y menú). Esa superficie se retiró; la recarga queda en `Reintentar` por bloque (C-R2). Filas históricas se conservan como evidencia de G6.

| ID | Resultado | Test que lo cubre |
| --- | --- | --- |
| **CA-REM-01** | **OK** | `DashboardClient.spec.tsx` · `C-R1: fallo parcial no avanza la hora de B0 y anuncia dato desactualizado` — `dateTime` inalterado + copy `Algunos datos no se actualizaron. Revisa los avisos o pulsa Actualizar.` |
| **CA-REM-02** | **OK** | `DashboardClient.spec.tsx` · `C-R1: error + dato previo muestra Reintentar en la métrica` |
| **CA-REM-03** | **OK** | `DashboardClient.spec.tsx` · `C-R2` (un título de grupo + cuerpo R-B) · implementación `PortalAlert live="polite"` · E2E axe «error de fuente» light/dark **pass** |
| **CA-REM-04** | **OK** | `DashboardClient.spec.tsx` · `C-R2` — tras reintento, `document.activeElement` = encabezado `Operaciones de campo` con `tabindex="-1"` |
| **CA-REM-05** | **OK** | Unit `C-R3` (Escape + foco al disparador) · E2E `C-R3 / C-R4 · 375: 1 visible + menú; Escape y flechas devuelven el foco` **pass** |
| **CA-REM-06** | **OK** | Unit `C-R4` (token sin `inline-flex` base; menú `md:hidden xl:flex`) · E2E 375/768/1280 **pass** (1+menú / 2 / 2+menú) |
| **CA-REM-07** | **OK** | `DashboardClient.spec.tsx` · `C-R5` (`auditList` ×1 con campana+home) · `NotificationBell.spec.tsx` · `muestra vocabulario amigable y oculta enum e identificador` |
| **CA-REM-08** | **OK** | `DashboardClient.spec.tsx` · `C-R6` — foco en `Atención comercial`, anuncio exacto, `scrollIntoView` no llamado con `prefers-reduced-motion` |
| **CA-REM-09** | **OK** | `DashboardClient.spec.tsx` · `C-R7` (hora B0 `<time>` + `font-mono tabular-nums`) · `RecentActivityPanel.spec.tsx` (tiempos del historial) |
| **CA-REM-10** | **OK** | Comandos abajo: audit-ui P0/P1 = 0; cobertura sin retroceso vs §11; typecheck exit 0 |

#### Evidencia de comandos

| Validación | Resultado |
| --- | --- |
| Jest dashboard + cache + campana (`--testPathPattern="components/dashboard\|audit-feed-cache\|NotificationBell"`) | **9 suites / 131 tests** pass |
| Cobertura dashboard focalizada (mismo denominador §11: `components/dashboard/**`) | statements **92,65%** · branches **85,48%** · functions **91,83%** · lines **93,95%** · **126/126** — vs §11 lines 93,12% / branches 85,15% (**sin retroceso**) |
| Cobertura + `lib/audit-*.ts` | statements 92,73% · branches 85,13% · functions 92,45% · lines 93,93% · 131/131 |
| `pnpm --filter @iwana/portal typecheck` | **exit 0** |
| `audit-ui.mjs` dashboard + `NotificationBell.tsx` | **sin hallazgos** · P0: 0 · P1: 0 |
| Playwright `portal-dashboard-empresa` (Chromium usuario, `PLAYWRIGHT_BROWSERS_PATH`) | **28 passed / 1 failed** · C-R3/C-R4 (CA-REM-05/06) **pass** · axe error light/dark **pass** |

Nota de cobertura: el `collectCoverageFrom=src/components/dashboard/**/*.{ts,tsx}` del prompt midió 0/0 (`rootDir: src` + glob `{ts,tsx}` en PowerShell). Se reejecutó con globs relativos a `src` (`components/dashboard/**/*.ts` + `*.tsx`), el mismo patrón efectivo de §11.

#### Residual (no bloquea)

- E2E baseline **CA-05**: el locator `getByText(/historial de cambios/i)` chocaba en strict mode con el subtítulo de la campana. FE ajustó a `getByRole('heading', { name: /historial de cambios/i })`. Re-corrida Playwright de ese test: pendiente (Chromium ausente en el sandbox de FE). No es P1.
- El unit C-R2 no aserta el atributo `aria-live="polite"`; lo cubren la implementación (`live="polite"`) y axe E2E del estado error.

**Sin `[BLOQUEO]` a FE.** P1 R-P1-01…03 cerrados. Este dictamen no ratifica G6.5 ni G7.

### Consolidación EM-ARCH — remediación UI (2026-08-11)

**Calidad de la remediación: GO.** Los tres P1 del review §11 quedan cerrados. El delta UX v1.2 queda **ratificado en superficie UI** (ya no bloqueado por §11). **G6.5 y G7 siguen abiertos** (ADR-069): no se infieren de este GO.

Tracks: [PROD-UX](012d9363-fc34-4756-8b04-87a26d75aa20) · [DS-OWNER](fef0bc22-dc62-4e67-add7-175ce5dd7ef9) · [FE-PLATFORM](e1bf430d-0841-4de3-8a65-695d917a74ea) · [SR-QA](a3326c86-8e04-47cc-82ab-912496ce1f4c).
