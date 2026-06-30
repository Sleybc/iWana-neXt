# Rediseño UX/UI - Expediente CRM (Vista general, Gestión, Seguimiento)

**Versión:** 1.0  
**Estado:** En revisión  
**Fecha:** 2026-06-03

## 1. Contexto

Se auditó el expediente CRM en runtime sobre `/dashboard/crm/expedientes/[id]` y se validaron las secciones **Vista general**, **Gestión** y **Seguimiento** con foco de operación SaaS B2B.

Diagnóstico consolidado:

- Vista general concentra demasiadas señales con jerarquía visual pareja (resumen, pendientes, progreso, datos y acciones).
- Gestión funciona bien por bloques, pero tiene densidad y ritmo visual variables entre secciones.
- Seguimiento está bien orientado a operación, pero el timeline puede mejorar escaneabilidad por tipo de evento y prioridad.

Este spec define una guía ejecutable para Fullstack basada en dirección visual iWana: claridad operativa, consistencia sistémica, densidad controlada y accesibilidad AA.

## 2. Objetivo

Mejorar la efectividad operativa del expediente CRM reduciendo fricción cognitiva y aumentando la claridad de decisiones en las tres secciones principales, sin cambiar contratos API ni reglas de negocio.

## 3. Alcance

Incluye:

- `Vista general` dentro de `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
- `Gestión` (bloques/secciones operativas del expediente)
- `Seguimiento` (acciones rápidas + timeline + panel lateral de contexto)

No incluye:

- nuevos endpoints o cambios de dominio backend,
- cambios de estados de negocio del pipeline,
- rediseño del shell global del portal.

## 4. Dirección recomendada

Se adopta dirección **Flujo narrativo operativo** con mini-contexto persistente:

- **Vista general:** tablero de decisión (estado, readiness, acción inmediata).
- **Gestión:** ejecución por secciones con prioridad visual explícita.
- **Seguimiento:** trazabilidad y acciones rápidas con mejor lectura por tipo de evento.

## 5. Punto 1 - Estructura exacta de bloques

## 5.1 Vista general (estructura objetivo)

Orden obligatorio de bloques (top-down):

1. Header operativo compacto
2. Estado + readiness de transición
3. Acción recomendada ahora
4. Resumen de completitud por secciones
5. Contexto del caso (datos complementarios)
6. Acciones de pipeline

Detalle por bloque:

1. Header operativo compacto:

- Botón volver
- Nombre de oportunidad
- Badge de estado actual
- Metadata mínima (fecha, responsable, canal)

1. Estado + readiness de transición:

- Banner único de readiness (sin duplicidad de mensajes)
- Lista de faltantes bloqueantes priorizados

1. Acción recomendada ahora:

- CTA principal único (ejemplo: agendar instalación)
- CTA secundario (aplicar transición)

1. Resumen de completitud por secciones:

- Progreso global
- Lista breve de secciones con estado (completa, atención, pendiente)

1. Contexto del caso:

- Estado
- Fuente
- Municipio
- Código postal
- Estrato
- Responsable actual

1. Acciones de pipeline:

- Selector de nuevo estado
- Campo motivo opcional
- Botones de confirmación

Regla de layout:

- Desktop: 2 bloques dominantes por viewport máximo.
- Tablet/mobile: stack vertical sin pérdida de CTA principal.

## 5.2 Gestión (estructura objetivo)

Estructura fija:

1. Encabezado de gestión (título + progreso resumido)
2. Grilla de secciones operativas
3. Cada sección con header estándar
4. Área de edición de sección
5. Acción guardar por sección

Header estándar de sección (obligatorio):

- Icono
- Nombre de sección
- Descripción breve
- Porcentaje de avance
- Indicador de prioridad visual

Prioridad visual por sección:

- Crítica: pendiente bloqueante
- Atención: parcialmente completa
- Completa: lista para transición

Secciones esperadas en flujo:

- Identificación
- Contacto
- Dirección
- Viabilidad técnica
- Interés del cliente
- Cumplimiento legal
- Soportes documentales

## 5.3 Seguimiento (estructura objetivo)

Orden obligatorio:

1. Barra de acciones rápidas
2. Panel activo de operación (contacto/responsable/originador)
3. Filtros de timeline
4. Lista de eventos
5. Paginación
6. Panel lateral de contexto persistente

Barra de acciones rápidas:

- Registrar contacto
- Reasignar responsable
- Gestionar originador

Timeline:

- Eventos con tipología visual consistente: contacto, pipeline, asignaciones, auditoría, sistema
- Timestamp visible y estable
- Información primaria primero (qué cambió y quién)

Panel lateral persistente:

- Responsable actual
- Originador
- Interés del cliente
- Origen

## 6. Punto 2 - Prioridad de implementación por sprint

## Sprint 1 (quick wins de alto impacto)

Objetivo:

- Mejorar claridad sin reestructura profunda.

Entregables:

1. Reorden de bloques en Vista general según estructura objetivo.
2. Unificación visual del bloque readiness (evitar mensajes duplicados).
3. Estandarización de header de secciones en Gestión (icono, descripción, porcentaje).
4. Tipificación visual de eventos en Seguimiento por tipo.
5. Ajustes de densidad y espaciado en cards/tablas para escaneo rápido.

Riesgo:

- Bajo a medio (principalmente frontend y composición).

## Sprint 2 (consolidación estructural)

Objetivo:

- Hacer consistente el patrón operativo entre secciones.

Entregables:

1. Prioridad visual por sección en Gestión (crítica/atención/completa).
2. Reforzar bloque "Acción recomendada ahora" en Vista general.
3. Refinar panel activo de acciones en Seguimiento (jerarquía, estados y foco).
4. Consolidar timeline en componente reusable por tipo de evento.

Riesgo:

- Medio (refactor de componentes compartidos del expediente).

## Sprint 3 (opcional de madurez)

Objetivo:

- Escalabilidad visual y preparación para módulos afines.

Entregables:

1. Patrón reusable de timeline operativo para otros módulos.
2. Reglas de layout del expediente como guideline interna de portal.
3. Hardening responsive para breakpoints críticos.

Riesgo:

- Medio (coordinación transversal con sistema visual).

## 7. Punto 3 - Criterios de aceptación visual listos para PR

Checklist de aceptación (bloqueante para merge de UI):

1. Jerarquía

- El primer viewport deja claro estado actual, próximos pasos y acción principal.
- No hay más de 2 bloques con el mismo peso visual dominante al inicio.

1. Consistencia

- Headers de secciones en Gestión siguen el mismo patrón visual.
- Eventos de Seguimiento mantienen codificación visual estable por tipo.

1. Densidad operativa

- La pantalla se puede escanear sin scroll excesivo para identificar bloqueantes.
- En desktop no hay superficies redundantes con información repetida.

1. Accesibilidad

- Contraste AA en textos y badges críticos.
- Foco visible en controles de tabs, botones y campos.
- Color no es el único indicador de estado (incluye etiqueta textual).

1. Responsive

- 375px, 768px, 1024px y 1440px sin solapamiento ni pérdida de CTA primaria.
- Barra de acciones en Seguimiento sigue siendo operable en mobile.

1. Sistema visual iWana

- Uso de tokens y primitives del portal.
- Sin estilos ad hoc que dupliquen patrones existentes.

1. Validación técnica mínima por PR

- `pnpm --filter @iwana/portal exec tsc -p tsconfig.json --noEmit` en verde.
- `get_errors` sin errores en archivos tocados.
- Tests focalizados del slice modificado en verde.

## 8. Definición de listo para ejecutar (Fullstack)

Un PR se considera alineado a este spec cuando:

- implementa al menos un bloque completo del Sprint 1 o Sprint 2,
- adjunta evidencia visual before/after,
- cumple checklist de aceptación visual,
- no altera contratos backend ni permisos de negocio.

## 9. Archivos foco para ejecución

- `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
- `apps/portal/src/components/crm/expedientes/SeguimientoTab.tsx`
- `apps/portal/src/components/crm/expedientes/ExpedienteHeader.tsx`
- `apps/portal/src/components/crm/expedientes/sections/ExpedienteSections.tsx`
- `apps/portal/src/components/crm/expedientes/expediente-ui.ts`

## 10. Riesgos y mitigación

Riesgos:

- regresión responsive por reorganización de bloques,
- pérdida de consistencia entre Vista general y Seguimiento,
- deuda de componentes si no se consolida en primitives.

Mitigación:

- cambios por fases (Sprint 1 primero),
- validación visual por breakpoint en cada PR,
- refactor incremental en componentes compartidos en lugar de cambios masivos.
