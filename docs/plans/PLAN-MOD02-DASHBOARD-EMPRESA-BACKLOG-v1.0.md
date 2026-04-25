# Plan Técnico — MOD02 Dashboard Empresa Backlog Ejecutable

**Versión:** 1.0
**Estado:** En revisión
**Fecha:** 2026-03-17
**Modo activo:** Mixto

## Trazabilidad

- PRD base: docs/prds/PRD-MOD02-DASHBOARD-EMPRESA-v1.0.md
- HLD base: docs/hlds/HLD-MOD02-DASHBOARD-EMPRESA-v1.0.md
- PRD funcional heredado: docs/prds/PRD-MOD02-DEFINICION-v1.0.md
- HLD frontend heredado: docs/hlds/HLD-MOD02-FRONTEND-v1.0.md
- Informe relacionado: docs/informes/INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md

---

## Objetivo

Traducir el PRD y el HLD del dashboard empresarial en un backlog técnico ejecutable, priorizado por impacto y separado por capa, evitando que la implementación derive hacia endpoints globales de plataforma o hacia un portal de suscriptor ambiguo.

---

## Prioridad P0 — Corregir superficie y contratos mínimos

### BT-DE-01 — Reemplazar el dashboard de suscriptor por dashboard empresarial

**Archivos objetivo**

- apps/portal/src/app/dashboard/page.tsx
- apps/portal/src/components/dashboard/* si se crean nuevos componentes

**Objetivo**

Eliminar widgets y copy de suscriptor y dejar la home protegida del tenant alineada con la operación empresarial.

**Criterios de cierre**

- No existen referencias a plan hogar, velocidad residencial ni facturación de cliente final.
- El `PageHeader` usa copy empresarial.
- La página queda preparada para recibir datos reales y estados por rol.

### BT-DE-02 — Definir contratos self-service del tenant autenticado

**Archivos objetivo**

- apps/api/src/modules/tenant/tenant.controller.ts o nueva superficie de consulta equivalente
- apps/api/src/modules/tenant/tenant.service.ts
- DTOs relacionados en tenant

**Objetivo**

Crear endpoints para consultar datos del tenant autenticado sin usar rutas globales de plataforma por `id`.

**Criterios de cierre**

- Existe un contrato equivalente a `GET /tenants/me`.
- Existe un contrato equivalente a `GET /tenants/me/settings`.
- Los endpoints respetan JWT + TenantMiddleware y no requieren privilegios de plataforma.

### BT-DE-03 — Exponer summary del dashboard con datos reales o nulos controlados

**Archivos objetivo**

- apps/api/src/modules/tenant/* o nueva query facade ligera para dashboard
- apps/portal/src/lib/api-client.ts

**Objetivo**

Habilitar un payload resumido de dashboard con información base del tenant, alertas y métricas iniciales sin inventar datos.

**Criterios de cierre**

- Existe un contrato equivalente a `GET /dashboard/summary` o composición equivalente desde frontend.
- Los campos sin fuente real se devuelven como `null` o lista vacía, no como datos ficticios.
- El portal consume ese contrato de forma tipada.

---

## Prioridad P1 — Shell empresarial y navegación segura

### BT-DE-04 — Adaptar `Sidebar` a navegación empresarial real

**Archivos objetivo**

- apps/portal/src/components/layout/Sidebar.tsx

**Objetivo**

Sustituir la navegación de suscriptor por navegación empresarial consistente con rutas reales o placeholders controlados.

**Criterios de cierre**

- El menú no expone rutas rotas.
- Los ítems reflejan dashboard empresa, configuración y accesos futuros controlados.
- La visibilidad del menú es compatible con rol cuando aplique.

### BT-DE-05 — Ajustar `TopHeader` y `DropdownUser` al contexto empresarial

**Archivos objetivo**

- apps/portal/src/components/layout/TopHeader.tsx
- apps/portal/src/components/layout/DropdownUser.tsx

**Objetivo**

Corregir textos, acciones y navegación del encabezado para el portal empresarial del tenant.

**Criterios de cierre**

- El placeholder de búsqueda no habla de facturas o trámites de suscriptor.
- El menú de usuario no navega a rutas inexistentes.
- El display name y subtítulo muestran contexto empresarial útil.

### BT-DE-06 — Crear páginas protegidas mínimas o placeholders para rutas expuestas

**Archivos objetivo**

- apps/portal/src/app/settings/page.tsx
- apps/portal/src/app/profile/page.tsx si se mantiene la ruta
- otras rutas protegidas solo si permanecen visibles en shell

**Objetivo**

Evitar navegación rota desde el shell del portal.

**Criterios de cierre**

- Toda ruta visible desde menú o dropdown existe.
- Las rutas no implementadas usan estado “próximamente” o placeholder controlado.
- No hay 404 desde acciones principales del dashboard.

---

## Prioridad P2 — Composición del dashboard y gating por rol

### BT-DE-07 — Implementar `DashboardClient` role-aware en portal

**Archivos objetivo**

- apps/portal/src/components/dashboard/DashboardClient.tsx
- apps/portal/src/app/dashboard/page.tsx

**Objetivo**

Separar la carga de datos y la composición visual del dashboard en un componente cliente mantenible.

**Criterios de cierre**

- Existe un componente contenedor responsable de cargar summary y actividad.
- La UI cambia por rol sin forks innecesarios.
- Hay estados de loading, error y vacío accesibles.

### BT-DE-08 — Implementar bloque de resumen de empresa

**Archivos objetivo**

- apps/portal/src/components/dashboard/TenantSummaryCard.tsx
- apps/portal/src/components/dashboard/MetricCard.tsx o componente equivalente

**Objetivo**

Mostrar nombre, slug, estado y configuración base de la empresa autenticada.

**Criterios de cierre**

- La información viene de contratos self-service.
- No expone datos cross-tenant.
- El estado del tenant se representa con semántica visual consistente.

### BT-DE-09 — Implementar alertas de onboarding del tenant

**Archivos objetivo**

- apps/portal/src/components/dashboard/OnboardingAlerts.tsx

**Objetivo**

Guiar al ADMIN y roles autorizados sobre faltantes de configuración o módulos no habilitados.

**Criterios de cierre**

- Las alertas no dependen de copy hardcodeado disperso.
- Cada alerta tiene severidad y CTA opcional.
- Las alertas desaparecen o se ajustan según datos reales.

### BT-DE-10 — Implementar actividad reciente para ADMIN

**Archivos objetivo**

- apps/portal/src/components/dashboard/RecentActivityPanel.tsx
- apps/portal/src/lib/api-client.ts

**Objetivo**

Reutilizar el audit log del tenant para mostrar actividad reciente del dashboard en el alcance permitido por backend.

**Criterios de cierre**

- El panel consume `auditApi.list({ limit })` o un contrato reciente equivalente.
- Solo `ADMIN` lo visualiza en MVP.
- Los demás roles reciben fallback coherente o no ven el panel.

### BT-DE-11 — Implementar accesos rápidos empresariales y módulos próximos

**Archivos objetivo**

- apps/portal/src/components/dashboard/QuickActionsPanel.tsx

**Objetivo**

Exponer accesos reales y placeholders gobernados para módulos empresariales siguientes.

**Criterios de cierre**

- Los accesos activos llevan a rutas existentes.
- Los módulos futuros están deshabilitados o marcados como próximos.
- No hay navegación a pantallas no implementadas sin advertencia.

---

## Prioridad P3 — Seguridad, calidad y evidencia

### BT-DE-12 — Endurecer el `api-client` del portal para dashboard

**Archivos objetivo**

- apps/portal/src/lib/api-client.ts

**Objetivo**

Agregar clientes tipados para tenant self-service y dashboard, manteniendo el manejo de tenancy y refresh ya aprobado.

**Criterios de cierre**

- El cliente expone métodos para tenant self y dashboard summary.
- No reusa accidentalmente endpoints globales de plataforma.
- Maneja errores 401/403/404 sin estados inconsistentes.

### BT-DE-13 — Cobertura de pruebas backend para contratos self-service

**Archivos objetivo**

- tests o specs de tenant/dashboard en apps/api

**Objetivo**

Verificar que un usuario del tenant solo obtiene su propio tenant y que un usuario de plataforma no usa estos endpoints como atajo sin contexto válido.

**Criterios de cierre**

- Hay tests de autorización y tenancy.
- Hay evidencia de respuesta controlada ante tenant no resoluble.

### BT-DE-14 — Cobertura de pruebas frontend y E2E

**Archivos objetivo**

- pruebas de componentes/dashboard del portal
- e2e/tests/**/* relacionadas al flujo del portal empresarial

**Objetivo**

Validar el flujo `login tenant-aware -> dashboard empresa -> navegación mínima protegida`.

**Criterios de cierre**

- Existe al menos una E2E del aterrizaje correcto tras login.
- Existe evidencia de que no se renderiza el dashboard de suscriptor.
- Existe evidencia de gating por rol o fallback por permisos.

### BT-DE-15 — Actualizar documentación y evidencia de cierre

**Archivos objetivo**

- docs/informes/INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md
- docs/quality/* si aplica

**Objetivo**

Cerrar la trazabilidad documental y de QA de la fase de implementación.

**Criterios de cierre**

- El informe vigente se actualiza, no se duplica.
- La evidencia de pruebas queda referenciada.
- Quedan riesgos residuales y stop/go documentados.

---

## Dependencias y decisiones abiertas

| ID | Dependencia o decisión | Impacto | Acción recomendada |
| --- | --- | --- | --- |
| D1 | No existen hoy endpoints `me` para tenant | Alta | Implementar BT-DE-02 antes del frontend final |
| D2 | `audit-logs` actual solo habilita `ADMIN` | Media | Mantener actividad reciente solo para ADMIN en MVP |
| D3 | El shell apunta a rutas inexistentes | Alta | Ejecutar BT-DE-04 y BT-DE-06 antes de cerrar UI |
| D4 | Los KPIs de módulos futuros aún no tienen fuente | Alta | Usar `null`, placeholders y alertas de onboarding |

---

## Secuencia recomendada de ejecución

1. BT-DE-02
2. BT-DE-03
3. BT-DE-01
4. BT-DE-04
5. BT-DE-05
6. BT-DE-06
7. BT-DE-07
8. BT-DE-08
9. BT-DE-09
10. BT-DE-10
11. BT-DE-11
12. BT-DE-12
13. BT-DE-13
14. BT-DE-14
15. BT-DE-15

---

## Criterio de stop/go

- Stop si la implementación intenta leer `tenants/:id` desde `apps/portal` como solución rápida.
- Stop si se quiere mantener navegación visible a rutas inexistentes sin placeholder controlado.
- Stop si se pretende ampliar permisos de auditoría a roles no `ADMIN` sin validación de seguridad.
- Go si el portal queda alineado como consola empresarial del tenant y los contratos self-service respetan el boundary vigente.
