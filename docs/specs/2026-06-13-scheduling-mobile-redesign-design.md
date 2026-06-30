# Spec: Rediseño de Densidad Móvil y Saneamiento de Identidad - Módulo de Programación

**Estado:** Pendiente de Revisión  
**Fecha:** 2026-06-13  
**Autor:** Gemini CLI  
**Enfoque:** B (Optimización de Densidad Móvil + Corrección de Regresiones de Identidad)

---

## 1. Problema y Contexto

El dashboard de Programación (Scheduling) presenta actualmente tres problemas críticos de UX/UI:
1. **Densidad Vertical en Móvil:** El `SchedulingToolbar` apila 5 controles verticalmente, desplazando el contenido principal (Agenda) fuera del primer viewport.
2. **Violación de Identidad:** Uso de `tracking-[0.18em]` que rompe la legibilidad y las normas del Manual de Identidad de iWana.
3. **Inconsistencia Estética:** Uso de `rgba` hardcodeados en gradientes y superficies con opacidades inconsistentes.

## 2. Solución Propuesta

### 2.1. Toolbar Segmentado (Tabs) para Móvil
Se implementará un patrón de pestañas en `SchedulingToolbar.tsx` para breakpoints inferiores a `xl`:
- **Pestaña "Agenda":** Controles de navegación temporal (Hoy, Anterior, Siguiente, Etiqueta de Rango, Selector de Fecha).
- **Pestaña "Filtros":** Selectores de Técnico, Tipo de Trabajo y Estado del Evento.
- **Escritorio (xl+):** Se mantiene el layout de grid de 5 columnas para eficiencia operativa.

### 2.2. Saneamiento de Identidad y Estética
- **Tracking:** Reemplazar `tracking-[0.18em]` por `tracking-tight` (para títulos) y `tracking-normal` (para badges/texto base).
- **Gradientes:** Sustituir `rgba(165,195,48,...)` en `SchedulingSummaryStrip.tsx` por tokens de Tailwind (ej. `from-iwana-secondary-50/50`).
- **Capas (Surfaces):** Unificar fondos a `bg-white` (Light) y `dark:bg-dark-surface-2` (Dark) en todas las tarjetas secundarias del dashboard.

### 2.3. Adaptabilidad de Métricas
El `SchedulingSummaryStrip` ajustará su grid para evitar desbordamiento:
- `grid-cols-1` en móviles pequeños.
- `grid-cols-2` en tablets/móviles grandes.
- `2xl:grid-cols-4` en pantallas ultra-anchas.

## 3. Arquitectura y Componentes

### Archivos a Modificar:
1. `apps/portal/src/components/scheduling/SchedulingToolbar.tsx`: Lógica de pestañas y responsive grid.
2. `apps/portal/src/components/scheduling/SchedulingSummaryStrip.tsx`: Corrección de gradientes, tracking y responsive grid.
3. `apps/portal/src/components/scheduling/SchedulingClient.tsx`: Corrección de tracking en el PageHeader.
4. `apps/portal/src/components/scheduling/SchedulingDashboard.tsx`: Ajuste de espaciado y superficies.

## 4. Accesibilidad (WCAG 2.2 AA)
- Uso de `aria-label` descriptivos para las nuevas pestañas.
- Contraste de texto >= 4.5:1 (revisión de badges "lime").
- Foco visible con anillos de 2px `iwana-primary`.

## 5. Riesgos
- **Complejidad de Estado:** El cambio de pestañas debe ser puramente visual y no reiniciar los filtros de búsqueda.
- **Regresión Visual:** Asegurar que los cambios de tracking no afecten el alineamiento de componentes hermanos.
