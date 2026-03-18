# Sprint 01 — MOD02 Dashboard Empresa

## iWana neXt Platform

**Versión:** 1.0
**Estado:** En revisión
**Fecha:** 2026-03-17
**Modo activo:** Mixto

**Objetivo del Sprint:** ejecutar la primera fase técnica del dashboard empresarial tenant-aware en `apps/portal`, cerrando el reemplazo del dashboard de suscriptor, los contratos self-service mínimos del tenant y la navegación protegida coherente con la empresa autenticada.

**Regla de interpretación:** este sprint cubre la primera fase de ejecución del dashboard empresarial derivado de MOD02. No implica cierre total del módulo ni apertura de un portal de suscriptor separado.

**Duración propuesta:** 1 semana hábil | **Inicio propuesto:** 2026-03-18 | **Fin propuesto:** 2026-03-24
**Fase:** DASHBOARD-EMPRESA-SPRINT-01
**PRD de referencia:** docs/prds/PRD-MOD02-DASHBOARD-EMPRESA-v1.0.md
**HLD de referencia:** docs/hlds/HLD-MOD02-DASHBOARD-EMPRESA-v1.0.md
**Backlog de referencia:** docs/plans/PLAN-MOD02-DASHBOARD-EMPRESA-BACKLOG-v1.0.md
**Prompt de ejecución:** docs/prompts/PROMPT-MOD02-DASHBOARD-EMPRESA-FASE-01-v1.0.md

---

## Objetivo de salida

Al cerrar este sprint debe existir una implementación consistente para:

- `apps/portal` como consola empresarial tenant-aware,
- contratos self-service mínimos del tenant autenticado,
- dashboard empresarial en `/dashboard` con datos reales o nulos controlados,
- shell y navegación sin rutas rotas,
- una ruta protegida complementaria mínima de configuración o placeholder controlado,
- evidencia técnica del flujo `login -> dashboard empresa`.

---

## Entregables documentales obligatorios del Sprint

| Artefacto | Responsable | Carpeta destino |
| --- | --- | --- |
| Informe de ejecución dashboard empresa | Sr. Dev Fullstack + EM | docs/informes/ |
| Evidencia QA / Playwright / validación técnica | Sr. Dev QA/Testing | docs/quality/ |
| Actualización del informe vivo de definición | EM + Architect | docs/informes/ |
| Decisión stop/go si se intenta romper el boundary tenant/plataforma | EM + Architect | docs/quality/ o docs/adrs/ |

---

## Asignaciones del Sprint

### Sr. Dev Fullstack

| # | Tarea | Referencia | Criterio de Done |
| --- | --- | --- | --- |
| F1 | Implementar contratos self-service del tenant autenticado para datos base y settings | BT-DE-02 | Existen endpoints equivalentes a `GET /tenants/me` y `GET /tenants/me/settings` sin privilegios de plataforma |
| F2 | Implementar summary del dashboard con datos reales o `null` controlado | BT-DE-03 | Existe contrato equivalente a `GET /dashboard/summary` o composición equivalente sin datos ficticios |
| F3 | Reemplazar el dashboard actual de suscriptor por uno empresarial en `apps/portal` | BT-DE-01 | No quedan widgets ni copy de suscriptor en `/dashboard` |
| F4 | Adaptar `Sidebar` del portal a navegación empresarial real | BT-DE-04 | El menú no expone rutas rotas y refleja el alcance empresarial |
| F5 | Ajustar `TopHeader` y `DropdownUser` al contexto empresarial | BT-DE-05 | El copy, búsqueda y acciones de usuario son coherentes con la empresa autenticada |
| F6 | Crear `settings` y cualquier placeholder mínimo necesario para rutas visibles | BT-DE-06 | No hay 404 desde navegación visible del shell |
| F7 | Implementar `DashboardClient` role-aware para carga y composición visual | BT-DE-07 | Existen estados loading, error, vacío y render por rol |
| F8 | Implementar resumen de empresa, alertas de onboarding y accesos rápidos | BT-DE-08, BT-DE-09, BT-DE-11 | Los bloques principales del dashboard quedan funcionales y conectados a datos reales |
| F9 | Integrar actividad reciente para `ADMIN` usando audit del tenant | BT-DE-10 | El panel solo se muestra a `ADMIN` o usa fallback coherente |
| F10 | Endurecer el `api-client` del portal para dashboard y self-service | BT-DE-12 | No hay consumo accidental de endpoints globales de plataforma |
| F11 | Actualizar el informe vivo con resultados, gaps y riesgos residuales | BT-DE-15 | Informe actualizado con evidencia y decisión de salida |

### Sr. Dev QA/Testing

| # | Tarea | Referencia | Criterio de Done |
| --- | --- | --- | --- |
| Q1 | Validar E2E de aterrizaje correcto tras login tenant-aware | BT-DE-14 | La suite confirma que el usuario llega al dashboard empresa y no al de suscriptor |
| Q2 | Verificar que no existan rutas rotas desde sidebar y dropdown | BT-DE-04, BT-DE-05, BT-DE-06 | Evidencia de navegación protegida estable |
| Q3 | Validar que el portal no consuma endpoints de plataforma para datos del tenant | HLD §3 | Evidencia funcional o técnica de consumo self-service |
| Q4 | Validar gating por rol o fallback en actividad reciente y accesos | HLD §5 | `ADMIN` ve actividad; roles no autorizados no rompen UI |
| Q5 | Emitir evidencia en docs/quality/ con hallazgos abiertos y cobertura del sprint | DoD sprint | Evidencia archivada y referenciada en informe |

### Engineering Manager / Architect

| # | Tarea | Referencia | Criterio de Done |
| --- | --- | --- | --- |
| M1 | Validar que el sprint no reutilice `tenants/:id` de plataforma desde `apps/portal` | HLD §3 | Cualquier desvío queda bloqueado o escalado |
| M2 | Validar consistencia final entre PRD, HLD, backlog, sprint y prompt | Gobernanza docs | Trazabilidad completa y sin contradicciones |
| M3 | Consolidar decisión stop/go si se intenta abrir alcance hacia portal de suscriptor separado o ampliación de auditoría por rol | HLD §7 | Decisión formal documentada |

---

## Dependencias y Blockers

| # | Descripción | Propietario | Fecha límite | Acción si no resuelto |
| --- | --- | --- | --- | --- |
| B1 | Definir e implementar endpoints self-service del tenant | Backend | Día 2 | Bloquear cierre del frontend final y documentar desvío |
| B2 | Confirmar estrategia de summary: endpoint dedicado o composición frontend | Backend + Architect | Día 2 | Fijar decisión técnica antes del desarrollo visual final |
| B3 | Resolver rutas visibles del shell con páginas reales o placeholders | Frontend | Día 3 | Retirar navegación no soportada del menú |
| B4 | Playwright y entorno de validación del portal disponibles | QA | Día 4 | Ejecutar con mocks controlados o documentar bloqueo real |

---

## Riesgos del Sprint

| ID | Riesgo | Impacto | Tratamiento |
| --- | --- | --- | --- |
| R1 | Reutilizar endpoints globales de plataforma rompe el boundary tenant-aware | Alto | Bloquear implementación y exigir contratos self-service |
| R2 | Mantener navegación visible a rutas inexistentes degrada la UX del portal | Alto | Crear placeholders mínimos o retirar accesos |
| R3 | Mostrar KPIs sin fuente real induce datos falsos | Crítico | Permitir `null` y estados “no disponible” |
| R4 | Forzar actividad reciente para roles no `ADMIN` abre una decisión de seguridad no cerrada | Medio | Limitar el panel a `ADMIN` en MVP |

---

## Definition of Done del Sprint

☐ `apps/portal` muestra un dashboard empresarial y no uno de suscriptor
☐ El portal consume contratos self-service del tenant autenticado
☐ No se usan endpoints globales `tenants/:id` desde `apps/portal`
☐ La navegación visible del shell no produce 404
☐ Existe al menos una ruta complementaria protegida mínima o placeholder controlado
☐ El dashboard renderiza datos reales o `null` controlado, nunca métricas inventadas
☐ La actividad reciente queda acotada a `ADMIN` o a fallback coherente
☐ Existe evidencia E2E del flujo `login -> dashboard empresa`
☐ El informe vivo queda actualizado en docs/informes/
☐ La evidencia QA queda archivada en docs/quality/

---

_Plan de Sprint generado por: AI-EM-ARCH — iWana neXt Platform_
_Fecha: 2026-03-17 | Fase DASHBOARD-EMPRESA-SPRINT-01_
