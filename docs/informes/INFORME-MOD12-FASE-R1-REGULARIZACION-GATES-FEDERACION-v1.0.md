# Informe MOD12 — Fase R1: Regularización de gates de federación de maestros

**Versión:** 1.0
**Fecha:** 2026-09-01
**Módulo:** MOD12 Inventario/SCM + MOD00 Configuración (federación de maestros)
**Modo AI-EM-ARCH:** Architect + Orchestrator (auditoría y gobierno; correcciones de código mínimas y trazadas)
**Plan base:** `docs/plans/2026-09-01-inventario-maestros-ubicacion-inventory-vs-settings.md` (v1.1)
**ADR base:** `docs/adrs/ADR-084-Inventario-Maestros-Federacion-Settings.md` (Aprobado)

---

## 1. Contexto

La auditoría multiagente (3 agentes exploradores: FE, BE, docs) del plan detectó un hallazgo **P0 de gobernanza**: la implementación de la Fase 2B (alias federado de maestros en Settings) había adelantado a su propio gate — el registry de Settings estaba en `AVAILABLE` con `route` activa sin contar con el baseline de telemetría de 7 días ni la validación UX que **ADR-084 D5 y Regla 7** exigen antes de activar el alias en producción. Todo el código convivía sin commit en el working tree.

Decisión CTO registrada en sesión: **revertir el registry a `COMING_SOON`** hasta completar el baseline (opción recomendada, sin excepciones).

## 2. Hallazgos de la auditoría (resumen)

| Severidad | Hallazgo | Resolución |
|---|---|---|
| P0 | Fase 2B implementada sin commit y sin gates (registry `AVAILABLE`, wrapper federado, e2e) | Regularizada en esta fase (§3) |
| P1 | Plan declaraba como "evidencia verificada" estados falsos u obsoletos (registry `COMING_SOON` ya cambiado, "no hay wrapper", telemetría "por añadir" cuando ya estaba viva, `INVENTORY_MAESTROS` inexistente, ADR-083 "prevé" cuando ya está Aprobado) | Plan enmendado a v1.1 |
| P1 | ADR-084 L156 llamaba al plan "Propuesto" mientras el plan se declaraba "Aprobado" | Errata aplicada (Aprobado) |
| P2 | 9+ citas de líneas/rutas/secciones desplazadas (`inventory-nav.ts:52-61`→78-87, custody :884→866-869, `rules-settings-*` sin subcarpeta y 3→4 tabs, creación atómica Party+Rol en backend no frontend, registry en `services/` con 94 líneas, spec estilos en §2 L50-52, PRD-MOD00 §1, HLD-MOD00 L18-20) | Corregidas en plan v1.1 y ADR-084 |
| P2 | Comentario `inventory-nav.ts` citaba una "spec v1.2 federada" inexistente | Corregido (remite a ADR-084 D1) |
| P2 | `filterInventoryNavGroups` (gate CA-GATE-06) definido y testeado pero **sin consumidor productivo** | Cableado en `InventoryClient.tsx` (§3) |
| P2 | Crear archivo `HLD-MOD12-INVENTARIO-SCM-v1.1.md` colisionaría con la versión interna 1.1 ya existente dentro de v1.0 (ADR-068) | Convención corregida: delta en sitio |
| P3 | Deuda de duplicación FE/BE (drawers gemelos, 6 generadores de número, envelopes de paginación inconsistentes) | Plan aparte Propuesto: `docs/plans/2026-09-01-inventario-dedup-refactors.md` |

Verificación positiva: 0 cross-imports configuration↔inventory; ADR-084 coherente con ADR-040; ningún artefacto vigente contradictorio; todos los ADRs citados existen con el estado declarado.

## 3. Acciones aplicadas

### 3.1 Registry revertido a `COMING_SOON` (gate ADR-084 D5 / Regla 7)
- `apps/api/src/modules/configuration/services/settings-registry.service.ts` — bloque `SettingsSectionKey.INVENTORY` restaurado a `status: COMING_SOON`, `route: null`, `requiredPermissions: [SETTINGS_READ]` (estado pre-activación de main).
- `settings-registry.service.spec.ts` — expectativa actualizada a `COMING_SOON` + test nuevo que documenta el contrato de activación previsto (`AVAILABLE`, `route:/dashboard/settings/inventory?tab=catalog`, `requiredPermissions:[INVENTORY_STOCK_READ]`, nunca `SETTINGS_MANAGE`).
- Residual aceptado y documentado: el alias directo por URL (`/dashboard/settings/inventory?tab=...`) sigue técnicamente alcanzable mientras el wrapper exista en main, pero **no es descubrible** desde el grid de Settings (tarjeta `COMING_SOON`); el RBAC y el backend permanecen como barrera real. La activación plena exige completar Fase 1.

### 3.2 Wiring del gate de Compras (CA-GATE-06)
- `InventoryClient.tsx` ahora consume `usePermissions()` y aplica `filterInventoryNavGroups` en modo no-federado con la semántica del Sidebar: Compras se oculta **solo** con permisos efectivos resueltos (`status === 'ready'`, set no vacío, rol no-ADMIN, sin `inventory.purchasing.read`); en loading/degradado/tripwire queda visible (la barrera real es el backend `PermissionsGuard` en `purchasing.controller.ts`).

### 3.3 Código Fase 2B consolidado en main como **dormant**
- `apps/portal/src/app/dashboard/settings/inventory/page.tsx` (wrapper federado + 308 para tabs no-maestros).
- `apps/portal/src/components/inventory/inventory-nav.ts` (`INVENTORY_FEDERATED_TABS`, `INVENTORY_FEDERATED_NAV_GROUPS`, eyebrow `Maestros`).
- `apps/portal/src/components/inventory/InventoryClient.tsx` (modo `federatedMode`, telemetría `inventory.tab.view`).
- `apps/portal/src/lib/analytics.ts` (`trackEvent` no-op) + `Sidebar.tsx` (telemetría de clicks).
- `e2e/tests/portal-inventory-scm-federated.spec.ts` (alias, 308, custody mobile).
- Nota: `InventoryClient.tsx`/`InventoryClient.spec.tsx` incluyen además el reorder de subtabs de catálogo (Categorías primero) cubierto por `INFORME-INVENTORY-CATALOGO-DRAWER-NUEVO-PRODUCTO-v1.0.md`.

### 3.4 Documentación
- Plan enmendado a **v1.1** (estado real por fase, citas corregidas, fase R1 añadida al Work Plan).
- Erratas de ADR-084: estado del plan (Aprobado), refs de línea del gate, y contexto citando `filterInventoryNavGroups` en su posición real.
- Comentario de `inventory-nav.ts` corregido (remite a ADR-084 D1, no a una spec inexistente).

## 4. Estado de gates

| Gate | Estado | Evidencia |
|---|---|---|
| Fase 0 (decisión CTO, ADR-084) | PASSED 2026-09-01 | ADR-084 Aprobado, compliance ADR-040 D1-D7 |
| R1 (regularización) | PASSED 2026-09-01 | Este informe; registry `COMING_SOON` en main |
| Fase 1 (baseline 7 días + test UX) | PENDIENTE | Telemetría viva; baseline no iniciado |
| Fase 2B activación (registry `AVAILABLE`) | BLOQUEADA hasta Fase 1 | ADR-084 D5 / Regla 7 |
| Fase 3 (G6/G6.5/G7 + informe federación) | PENDIENTE | `INFORME-MOD12-SETTINGS-FEDERACION-MAESTROS-v1.0.md` al activar |

## 5. Pendientes (siguiente sesión o track paralelo)

1. Baseline manual de 7 días (SR-QA): tareas "crear categoría → crear producto → ver en Existencias" y "crear proveedor → crear solicitud" (5 operadores / 3 admins, tiempo y clics).
2. Test de encontrabilidad post-federación con la misma muestra.
3. Decisión de reactivación (registry `AVAILABLE`) + HLD-MOD12 delta en sitio + informe de federación con G6/G6.5/G7 por separado.
4. Revisión del plan de dedup Propuesto (`2026-09-01-inventario-dedup-refactors.md`) — deuda media, no bloqueante.

## 6. Impacto (tenant/seguridad/escala/regulación)

- **Multi-tenant:** sin cambios; maestros siguen en schema tenant bajo `InventoryModule`; `SET LOCAL search_path` por transacción intacto.
- **Seguridad:** gate de Compras ahora efectivo en UI (CA-GATE-06); backend ya lo aplicaba (`PermissionsGuard`). Sin nuevos permisos; sin `settings.manage` para maestros (PoLP).
- **Escala:** sin cambios de modelo ni endpoints; activación futura es metadata del registry (2 líneas).
- **Regulación:** sin impacto.
