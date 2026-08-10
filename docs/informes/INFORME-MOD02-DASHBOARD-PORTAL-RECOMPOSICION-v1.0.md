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
| D — calidad | AI-SR-QA | D-1…D-7 | Hecho (Task 6) · **G6-4 NO-GO** | Task 6 cov OK · re-verify G6-4: jest 76/76 · stmts **81,89%** / lines **84,97%** · E2E **21/25** (4 axe light fail) · filtros axe retirados `1014990f` · ver §9 G6-4 |

## 4. Matriz criterio ↔ test

| Criterio | Test previsto | Estado |
| --- | --- | --- |
| CA-V2-01/02 | `dashboard-role-composition.spec.ts` + E2E D-3 | Cubierto — G6-4 (baseline CA-01…06 no cuenta) |
| CA-V2-03 | E2E D-5 + `viewport-*.png` | Cubierto — G6-4 |
| CA-V2-04 | Unit B0–B3 + composition techo I-1…I-7 | Cubierto — G6-4 |
| CA-V2-05 | Hrefs unit C-6; falta E2E hidratación destino | **NO-GO** — G6-3 + G6-4 (sin aserción Atrás/recarga destino) |
| CA-V2-06 | Unit `allSettled` + E2E error WFM | Cubierto — G6-4 |
| CA-V2-07/11 | E2E axe + unit null | **NO-GO G6-4** — axe light `color-contrast` 4/4 fallan (descripción muted sobre `danger`) · null unit OK |
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
| Alta | CA-V2-05: destinos no leen filtros de URL (I-1, I-2, I-4, I-7) | AI-FE-PLATFORM | **Abierto — bloquea G6-3/G6-4** · hidratar `view`/`fromDate`, `status`, `slaBreachStatus`, `view=open`; prueba E2E indicador→filtro→recarga→Atrás |
| Alta | Axe `color-contrast` tema light: descripción `text-gray-500` (#6a7282) sobre shell `danger` (#fef3f3) ≈ **4,45:1** | AI-DS-OWNER + AI-FE-PLATFORM | **Abierto — bloquea G6-4** · ranura `description` de `PortalDashboardMetric`/`PortalMetricCard` no aplica escalón §1.7 (solo eyebrow); filtros axe E2E ya retirados |

## 7. Gates (registro separado — ADR-069)

| Gate | Estado | Evidencia |
| --- | --- | --- |
| G4 | Cumplido | Prompt v1.0 emitido 2026-08-04 |
| G6 | NO-GO | G6-2 GO · G6-3 NO-GO (CA-V2-05) · G6-4 NO-GO (CA-V2-07 axe light + CA-V2-05 sin prueba destino) · faltan G6-1/G6-5 |
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
| 2026-08-10 | G6-2 | AI-DS-OWNER | **GO** | HEAD `eb5851d0` · base a11y `1014990f` · DS v1.1 `9937c7d7` · audit-ui P0/P1=0 | Dictamen identidad: sin P0/P1; firmas, sombras duales, primitives canónicas, §1.7. Residual P2 no bloqueante: punto lima en historial. Ver §9. |
| 2026-08-10 | G6-3 | AI-PROD-UX | **NO-GO** | HEAD `eb5851d0` (≥ `1014990f`) · UX spec v1.0 · HLD CA-V2-01…12 | Experiencia: 11/12 CA OK; **CA-V2-05 falla** (filtros outbound sin hidratación en destino). Ver §9. |
| 2026-08-10 | G6-4 | AI-SR-QA | **NO-GO** | HEAD `7ea22066` · re-verify post `1014990f` · jest 76/76 cov ≥80% · E2E 21/25 | Filtros axe retirados OK; **CA-V2-07** falla (descripción muted×danger light); CA-V2-05 sin aserción destino/Atrás. Ver §9. |

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
