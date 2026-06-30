# INFORME: Agenda universal y despacho operativo explícito

**Version:** 1.2  
**Estado:** Completado  
**Fecha:** 2026-06-19  
**Modulo:** WFM Programacion + Usuarios internos (Portal/API/DB)  
**Plan relacionado:** `docs/plans/2026-06-19-scheduling-agenda-high-density-views.md`  
**Responsable de ejecucion:** Sr. Dev Fullstack

---

## 1. Resumen ejecutivo

Se corrigió la lógica del módulo para separar con claridad dos conceptos que estaban mezclados:

1. Cualquier usuario interno del tenant puede ser agendado como responsable.
2. Solo los usuarios marcados como recurso operativo participan en despacho diario, capacidad visible y recomendaciones.

En la misma línea evolutiva se cerró la estrategia de **vistas de alta densidad** en `Control de agenda`: `Día` y `Lista` como superficies operativas, `Semana` y `Mes` como lecturas analíticas de capacidad/carga, y umbral oficial `20+` tareas en el día visible para sugerir — sin auto-switch — el uso de `Lista`.

---

## 2. Entregables implementados

### Base de datos

1. Nueva columna `users.is_operational_resource` en esquema tenant.
2. Migración `044_add_operational_resource_to_users.ts`.
3. Backfill automático para dejar en `true` a `TECHNICIAN` y `CONTRACTOR`.

### Backend

1. `CreateUserDto`, `UpdateUserDto` y `UserResponseDto` ahora exponen `isOperationalResource`.
2. `UsersService` aplica default inteligente por rol y respeta override explícito.
3. `bulkCreate` acepta el campo de forma opcional.
4. Auditoría de creación y actualización incluye el estado operativo.

### Frontend portal — recursos operativos

1. `InternalUser`, `CreateInternalUserDto` y `UpdateInternalUserDto` incorporan `isOperationalResource`.
2. Alta y edición de usuarios permiten activar o desactivar despacho operativo.
3. La tabla de usuarios muestra si la persona queda en `Despacho operativo` o `Agenda general`.
4. El filtro operativo de scheduling usa la capacidad explícita, no el rol.

### Frontend portal — estrategia de alta densidad

1. `scheduling-ui.ts`: `HIGH_DENSITY_DAY_THRESHOLD = 20`, `isHighDensityScheduleDay()`, `getDefaultSchedulingViewForRole()`, `getRecommendedSchedulingViewForDensity()`, metadatos operativo/analítico por vista.
2. `SchedulingClient.tsx`: conteo del día visible, alertas contextuales en `Día` y `Lista`, default por rol sin sobrescribir elección manual.
3. `SchedulingToolbar.tsx`: grupos `Operativas` (Día, Lista) y `Analíticas` (Semana, Mes); copy por vista activa.
4. `ScheduleCalendar.tsx`: `Semana` y `Mes` como tableros de capacidad/carga con drill-down `Abrir día`; umbral importado desde `scheduling-ui.ts` (fuente única).
5. `ScheduleList.tsx`: posicionamiento como vista de volumen completo del rango activo.

---

## 3. Evidencia funcional

### Recursos operativos

1. Crear usuario técnico y recibir `isOperationalResource = true` por default.
2. Crear usuario técnico y desactivar manualmente su participación operativa.
3. Editar usuario existente y cambiar su participación en despacho.
4. Mantener agenda general para cualquier usuario interno; el tablero diario muestra solo recursos operativos.

### Alta densidad y jerarquía de vistas

1. La agenda arranca en `Día` para roles de coordinación y campo.
2. Con `20+` tareas en el día visible, `Día` muestra alerta informativa hacia `Lista` sin cambiar la vista automáticamente.
3. En `Lista`, con jornada densa, aparece confirmación positiva de superficie recomendada.
4. `Semana` y `Mes` muestran señales agregadas de carga y permiten `Abrir día` para despacho fino.
5. El usuario puede alternar manualmente entre las cuatro vistas; un refresh no revierte la elección.

---

## 4. Evidencia de calidad

### Unit tests (portal — scheduling)

Comandos ejecutados en iteraciones del plan:

```bash
pnpm --filter @iwana/portal test -- scheduling-ui.spec.ts SchedulingClient.spec.tsx ScheduleCalendar.spec.tsx ScheduleList.spec.tsx
```

Cobertura relevante:

1. Umbral `20` y recomendación hacia `Lista`.
2. Jerarquía operativa/analítica en toolbar.
3. `Semana` y `Mes` sin mini-listado dominante; drill-down a día.
4. `Lista` con copy de volumen y todos los eventos visibles.

### E2E portal

Archivo: `e2e/tests/portal-wfm-scheduling.spec.ts`

| Escenario | Objetivo | Estado |
| --- | --- | --- |
| Arranque en vista `Día` | Default inicial y copy operativo | Cubierto |
| Recomendación en `Día` con `20+` tareas | Alerta sin auto-switch | Cubierto |
| Cambio manual entre vistas con jornada densa | Sin pérdida de selección al refrescar en `Mes` | Cubierto |
| Drill-down `Semana` / `Mes` → `Día` | `Abrir día` deriva a despacho fino | Cubierto |
| `Lista` con jornada de alto volumen sin recortes | Tabla completa (`23` tareas mock) y detalle | Cubierto |

Notas de ejecución E2E:

1. Los fixtures mock programan eventos en `dayOffset +1`; los escenarios de alta densidad avanzan el rango con `Ir al rango siguiente` antes de validar conteos.
2. Los selectores de vista usan el grupo `Vistas operativas` / `Vistas analíticas` para evitar colisión con botones `Abrir día` del mapa mensual.

Comando:

```bash
pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-wfm-scheduling.spec.ts
```

---

## 5. Decisiones de diseño y correcciones 2026-06-19

1. **Fuente única del umbral:** `ScheduleCalendar` importa `HIGH_DENSITY_DAY_THRESHOLD` desde `scheduling-ui.ts`; no hay constante paralela local.
2. **Recomendación sin duplicar copy:** en vista `Día` densa, la sugerencia vive en `PortalAlert` del orquestador; el toolbar no repite el mismo mensaje.
3. **Densidad visual en tableros semanal/mensual:** métricas internas usan contenedores `rounded-xl` con fondo suave, sin cajas anidadas con doble borde.
4. **Sin auto-switch:** el umbral `20+` orienta; nunca cambia `filters.view` sin acción del usuario.

---

## 6. Riesgos y observaciones

1. El naming interno de `filterOperationalTechnicians` permanece por compatibilidad local, aunque ya filtra recursos operativos generales.
2. La migración cubre técnicos y contratistas históricos; conviene revisar administrativamente otros perfiles que deban entrar al despacho.
3. Los umbrales locales de color en `Semana`/`Mes` (6, 12, 20) ayudan a leer el mapa mensual/semanal y son independientes del trigger oficial del módulo (`20+` en día visible).
4. `Semana` sigue en observación de producto para evolucionar métricas por técnico cuando exista contrato backend dedicado.

---

## 7. Estado final

**Completado**

1. Agenda universal para usuarios internos.
2. Despacho operativo explícito y administrable.
3. Estrategia de vistas de alta densidad implementada y documentada.
4. Informe, pruebas unitarias y E2E alineados con el código vigente.
