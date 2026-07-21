# INFORME — Remediación UI/UX consola de plataforma (apps/web)

**Modo:** EM + Orchestrator (AI-EM-ARCH)  
**Versión:** 1.1  
**Estado:** Cerrado — GO total (fases 01–05; sin deuda de alcance)  
**Fecha:** 2026-07-20  
**Convención:** `{TIPO}-{MODULO}-{FASE}-v{VERSION}.md`

## Vínculos de trazabilidad

- Plan: `docs/plans/PLAN-WEB-UIUX-REMEDIACION-v1.0.md`
- Prompts: `docs/prompts/PROMPT-WEB-UIUX-FASE-0{1,2,3,4,5}-v1.0.md`
- Skill: `.agents/skills/iwana-identity-ui-review/`
- Spec Firma: `docs/specs/2026-07-12-firma-iwana-diseno-visual-design.md`
- ADR-056 (dark surfaces)
- Auditoría transversal previa (contexto): `docs/informes/INFORME-TRANSVERSAL-WEB-PLATAFORMA-AUDITORIA-UI-v1.0.md`

---

## Identificación

- Módulo: WEB-UIUX (consola `apps/web`)
- Fases: 01–05 (remediación + verificación + filtros/export + afinamiento)
- Responsable orquestación: AI-EM-ARCH
- Ejecución FE: AI-FE-PLATFORM · Backend fase 04: AI-SR-FULL
- Aprobación identidad: AI-DS-OWNER · Re-review UX: AI-PROD-UX · CA: AI-SR-QA

---

## 1. Resumen ejecutivo

- **Objetivo:** cerrar P0/P1 del review multiagente + P2 quick wins + backlog explícito (Badge, Button lima, fase 04, URL/skeletons/targets), alineando `apps/web` a Firma iWana / ADR-056.
- **Resultado:** fases 01–05 cerradas con GO. Filtros/export de auditoría server-side; `Button variant="lime"`; persistencia URL y pulido empty/skeleton/targets en listados clave.
- **Estado:** Completa. Sin ítems “fuera de cierre” pendientes de este plan.

---

## 2. Entregables por fase

### Fase 01 — Identidad, dark, shell, auditoría

- Dark ADR-056; lienzo `iwana-surface-soft`; z-index corto (20/30/40).
- Campana semántica `error`/`warning`; audit scrolleable; búsqueda mobile ≥44px.
- `Badge`/`Card` tokenizados.

### Fase 02 — Modales y confirmación destructiva

- Modales usuarios → `Dialog`; `ConfirmDialog` único; cero `confirm()` nativos.
- Toast tenants accesible (error persistente).

### Fase 03 — Auth secundario

- Shell canónico `PlatformAuthExperience`; `LoginBrandPanel` extinguido; hex auth = 0.

### Fase 04 — Filtros y export server-side

- API: `fromDate`/`toDate` en platform-audit; `GET …/export` (plataforma + tenant), máx. 5000, header `X-Export-Truncated`.
- FE: filtros acción/fecha → `list`; export blob server-side; copy de “solo página” retirado.
- `severity`/`actionSet` del resumen: client-side sobre página ya filtrada (sin query `actions`).

### Fase 05 — Verificación + afinamiento

- Re-reviews DS-OWNER / PROD-UX GO; QA 14/14 CA; quick wins foco búsqueda, disclosure campana, toast ≥44px.
- P2 Badge/UsersTable saldada; afinamiento URL (`audit`/`users`/`tenants`), skeletons/empty, targets `min-h-11`.

### Cierre de deuda post-05

- `Button variant="lime"` (CTA de página; `primary` = sección) — sin invertido global ni escalado CTO.
- CTAs web: “Nueva empresa”, crear usuario → `lime`.

---

## 3. Evidencia de calidad

| Gate | Resultado |
| --- | --- |
| CA-101…105, 201…205, 301…304 | PASS (AI-SR-QA) |
| CA-401…403 (fase 04 FE) | PASS |
| Tests API audit export / fechas | 27 PASS |
| `dark:*-gray-{700-950}` / `confirm()` / hex auth | 0 |
| lint / typecheck web + ui (+ api fase 04) | Verde |

---

## 4. Deuda / backlog

| Ítem | Destino |
| --- | --- |
| Badge semánticos + UsersTable → `Badge` | **Cerrada** |
| Button lima | **Cerrada** (`variant="lime"`) |
| Fase 04 filtros/export | **Cerrada** |
| URL / skeletons / empty / targets (superficies plan) | **Cerrada** |
| Query `actions` multi-valor en API audit | Opcional futuro (no bloquea) |
| Migración masiva de CTAs `primary`→`lime` en todo el monorepo | Fuera de alcance (adopción gradual) |

---

## 5. Impacto declarado

- **Multi-tenant:** sin impacto de aislamiento; export/list tenant siguen contexto/`X-Tenant-Slug` aprobado.
- **Seguridad:** mejora (confirmaciones, diálogos, export acotado).
- **Escala / regulación:** export sync limitado a 5000 filas (truncado explícito).

---

## 6. Decisión de salida

| Pregunta | Decisión |
| --- | --- |
| ¿Cierre G5 01–04? | **Sí — GO** |
| ¿Cierre G6 fase 05 + afinamiento? | **Sí — GO** |
| ¿Correcciones previas obligatorias? | **No** |
| Aprobadores pendientes | Ninguno para este plan |

**Recomendación AI-EM-ARCH:** plan WEB-UIUX-REMEDIACION **cerrado**. Mergeable tras revisión humana habitual.

---

## 7. Verificación independiente de cierre (gate G7 — AI-EM-ARCH)

**Fecha:** 2026-07-20 · **Modo:** EM + Orchestrator · **Naturaleza:** verificación de segunda capa sobre el auto-reporte de fase 05. El aprobador (AI-EM-ARCH) no es productor de ningún artefacto de las fases 01–05. Evidencia recogida contra el árbol de trabajo real (commits `261b5aa8` + `f8600082`), no contra el reporte de los ejecutores.

### 7.1 Barrido mecánico (`audit-ui.mjs apps/web/src`)

| Métrica | Review inicial | Post-remediación (verificado) |
| --- | --- | --- |
| P0 | 1 | 0 |
| P1 | 6 (+18 deterministas script) | **0 reales** (2 residuales = falsos positivos ya dictaminados) |
| P2 | 15 | **0 reales** (1 residual = chip de icono, dictaminado) |
| Deterministas `dark-gray` / `z-war` / `brand-hex` | 31 | **0** |

Los 3 hallazgos residuales del script (`lime-text-aa` en `PlatformAuthExperience.tsx:98,104`, `lime-50-surface` en `AuditSummary.tsx:452`, 3 `spinner-primary`) son los mismos falsos positivos confirmados en el review original (lima sobre panel oscuro de auth con contraste AA; chip de icono; spinners no primarios). No son deuda.

### 7.2 Criterios grep-ables (todas las fases) — 0 = PASS

- `dark:(bg|border)-gray-(700|800|900|950)` en `apps/web/src` → **0** (CA-101).
- `confirm(` nativo → **0** (CA-202).
- Hex de marca en `app/auth` + `components/auth` → **0**; en todo `apps/web/src` → **0** (CA-301).
- `z-[999+]` → **0**.
- `role="dialog"` manual + `MODAL_PANEL_CLASS` en `components/users` → solo 1 ocurrencia, en el **mock de test** (`UserManagementModal.spec.tsx:60`), no en producción (CA-203 PASS).
- `bg-slate-50` en `layout.tsx` → **0**.

### 7.3 P0/P1 de comportamiento (no grep-ables) — confirmados en código

- **P0 confirmación destructiva:** `ConfirmDialog` cableado a "Eliminar usuario" y "Generar contraseña temporal" (`UserManagementModal.tsx:683,700`) y a eliminación de empresa con **confirmación tipada** por nombre (`TenantSettingsForm.tsx:652,665`).
- **P1 campana:** `NotificationBell.tsx` usa `bg-error-500`/`bg-warning-500` y `text-error-600`/`text-warning-400` según `worstAlertTone`; lima retirado como señal de alerta.
- **P1 responsive:** tabla técnica de auditoría con `overflow-x-auto` (`AuditLogsTable.tsx:292`); trigger de búsqueda mobile con estado `mobileSearchOpen`, foco gestionado y overlay (`TopHeader.tsx`).
- **P1 fiabilidad de datos:** fase 04 movió list + export CSV a server-side (`fromDate`/`toDate`, `GET …/export`, header `X-Export-Truncated`); el aviso de "solo esta página" persiste correctamente solo para el resumen (que sigue siendo muestral por diseño).
- **Variante lima de `Button`:** añadida como `variant="lime"` (`Button.tsx:22`) sin invertir `primary` — resuelve la divergencia spec↔código sin escalado CTO.

### 7.4 Gates de calidad (ejecutados por AI-EM-ARCH)

| Gate | Resultado |
| --- | --- |
| `pnpm --filter @iwana/web typecheck` | **Verde** |
| `pnpm --filter @iwana/web lint` | **Verde** |
| `pnpm --filter @iwana/web test` | **19 suites / 76 tests PASS** |

### 7.5 Veredicto de verificación

**GO confirmado.** La verificación independiente reproduce el cierre reportado: P0 y los 6 P1 del review están cerrados en código, los criterios de aceptación grep-ables dan 0, y los gates de calidad (typecheck, lint, 76 tests) están en verde. **Puntaje del skill post-remediación: 100/100** (0 hallazgos reales tras descartar falsos positivos ya dictaminados). Sin deuda crítica ni alta abierta atribuible a este plan. Queda como backlog opcional no bloqueante: query `actions` multi-valor en el API de auditoría y la adopción gradual de CTAs `primary`→`lime` en el resto del monorepo.

Siguiente paso acordado con el CTO humano: **afinamiento de diseño** sobre la base ya alineada (fase de pulido fino, no de remediación).
