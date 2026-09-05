# INFORME MOD09 — Visibilidad por rol del rail "Pendientes por programar"

**Versión:** 1.0
**Fecha:** 2026-09-01
**Módulo:** MOD09 Scheduling/WFM (apps/portal scheduling)
**Modo de sesión:** Orquestador AI-EM-ARCH (perfil v2.4) — plan aprobado por el CTO; implementación delegada a AI-FE-PLATFORM
**Estado:** Cerrado — gates en verde
**Antecesor:** [INFORME-MOD09-FIX-RAIL-PENDIENTES-PROGRAMAR-v1.0.md](INFORME-MOD09-FIX-RAIL-PENDIENTES-PROGRAMAR-v1.0.md)

---

## 1. Síntoma y decisión

En `/dashboard/scheduling/agenda`, los roles sin permiso de despacho (Técnico, Contratista, Ventas) veían la columna **"Pendientes por programar"** siempre vacía (estado vacío + botón "Ver bandeja completa"), ocupando la mitad del layout. Decisión aprobada: la columna solo se muestra a los roles de despacho (`canManageScheduling`: Admin, NOC, Soporte — misma fuente de permisos que ya gatea el fetch y el backend), y el hint "Arrastra un pendiente o haz clic para crear" también se oculta a quien no puede despachar.

## 2. Cambios (solo apps/portal, sin backend ni contrato)

| Archivo | Cambio |
| --- | --- |
| `apps/portal/src/components/scheduling/ScheduleCalendar.tsx` | Nueva prop `showPendingVisitsRail?: boolean` (default `true`, backward-compatible). `DailyAgenda`: grid a 1 columna y sin bordes residuales cuando el rail se oculta; `<PendingVisitsRail>` renderizado solo si la prop lo permite; hint de la grilla visible solo si existen handlers de despacho/creación (`onPendingVisitDrop \|\| onCreateEventSlot`). |
| `apps/portal/src/components/scheduling/SchedulingClient.tsx` | Pasa `showPendingVisitsRail={canManage}` (reutiliza `canManageScheduling`, sin sets de roles paralelos). |
| `apps/portal/src/components/scheduling/ScheduleCalendar.spec.tsx` | Casos nuevos: rail oculto (sin título, sin estado vacío, sin bandeja, sin hint, grilla operativa) y default con rail visible. |
| `apps/portal/src/components/scheduling/SchedulingClient.spec.tsx` | Casos nuevos: `TECHNICIAN` no ve el rail; `ADMIN` sí. |

`PendingVisitsRail`, la bandeja completa y el copy visible no cambiaron.

## 3. Verificación (gates)

| Gate | Resultado |
| --- | --- |
| Typecheck `@iwana/portal` | Sin errores (exit 0) |
| Tests `ScheduleCalendar.spec.tsx` | 15/15 (incluye 2 nuevos) |
| Tests nuevos `SchedulingClient.spec.tsx` (`-t "rail de pendientes para roles"`) | 2/2 |
| ESLint (archivos tocados) | 0 errores (2 warnings preexistentes de hook-deps, no relacionados) |
| Review identidad (`iwana-identity-ui-review`, modo review) | **Aprobada — 100/100, 0 hallazgos**; script `audit-ui.mjs` sin hallazgos; tokens y dark mode correctos, sin colores ni primitivas nuevas |
| PII / seguridad | Sin datos nuevos expuestos: el fetch ya estaba gateado por `canManage` y el backend bloquea Técnico/Contratista (403) |

**Nota:** las 3 fallas preexistentes de `SchedulingClient.spec.tsx` (toolbar, OT vinculada, manual visit) persisten por trabajo paralelo en el árbol — no son regresión de este cambio (ver informe antecesor §5).

## 4. Impacto

- **Multi-tenant / seguridad:** sin cambios de datos ni autorización; es visibilidad presentacional alineada al permiso existente (`SCHEDULING_MANAGE_ROLES`). Fuente única de verdad de permisos, sin duplicación.
- **Escala:** sin impacto (se evita render inútil del panel).
- **Regulación:** sin impacto.
- **UX:** roles operativos ven la grilla diaria a ancho completo sin affordances de despacho que no pueden ejercer.

## 5. Deuda / observaciones

1. La prop es backward-compatible (`default: true`); si mañana otra superficie monta `ScheduleCalendar` sin la prop, mantiene el comportamiento actual.
2. El gate del hint es por handlers (no por la prop): una vista sin permiso pero con handler de creación seguiría mostrándolo — comportamiento testeado y coherente con la semántica de affordance.
