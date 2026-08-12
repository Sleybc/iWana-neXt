# INFORME — Campana de avisos del directorio (`apps/web`)

**Versión:** 1.0  
**Estado:** Cerrado  
**Fecha:** 2026-08-11  
**Emite:** AI-FE-PLATFORM (carril rápido · chrome existente)  
**Skill:** `iwana-identity-ui-review` modo review + diseño · `system-vocabulary-review` (copy ya canónico, no se cambia)  
**Superficie:** `apps/web/src/components/layout/NotificationBell.tsx`  
**No aplica a:** `apps/portal` (campana de historial, no de directorio)

---

## Tarea del operador

Abrir la campana y ver **solo empresas que conviene revisar ahora**. Si el parque está sano, leer el empty — no un falso aviso.

## Hallazgo (funcional)

El copy ya era correcto (`Avisos del directorio` / `Empresas que conviene revisar ahora.` / `No hay avisos por ahora.`). El listado no: mapeaba **todas** las empresas de `tenantApi.list`, recortaba a 5 y priorizaba por tono. Una empresa **Activa** (p. ej. iWana) aparecía con punto verde como si fuera un aviso. El badge del icono ya ignoraba `success`; el panel no.

Eso contradice el subtítulo y el empty canónico. Un enablement previo había dejado las activas como «señal informativa» para no mostrar vacío; el producto ya tiene empty a propósito.

## Corrección

- Helper `tenantNeedsDirectoryReview`: solo `warning` / `error` (`PROVISIONING`, `SUSPENDED`, `PROVISIONING_FAILED`, `MARKED_FOR_DELETION`).
- Activa e inactiva **fuera** del panel → empty canónico.
- Escape restaura el foco al disparador (paridad con portal).
- Sin API nueva, sin lima de urgencia, sin cambio de copy.

## Evidencia

| Gate | Resultado |
| --- | --- |
| Jest `tenant-status-label` + `NotificationBell` | **2 suites / 11 tests** PASS |
| `pnpm --filter @iwana/web typecheck` | exit **0** |
| `audit-ui.mjs` campana + helper | **0 hallazgos** |

## Dictamen

**GO** para chrome web. Portal no se toca.
