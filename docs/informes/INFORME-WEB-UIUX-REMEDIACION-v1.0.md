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
