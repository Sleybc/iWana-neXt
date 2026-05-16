# Objetivo del módulo WFM (WorkForce Management)

Para iWana neXt, el WFM no debe sentirse como un ERP pesado ni como una tabla infinita.
Debe parecer más un centro operacional visual, orientado a:

- técnicos ISP
- cuadrillas
- instalaciones
- soporte
- agenda operacional
- SLA
- capacidad operativa
- geolocalización
- productividad

La clave es esta: entender el estado operativo completo en menos de 10 segundos.

## Concepto UX/UI

### Filosofía visual

Tomando el stack actual, Next.js + React 19 + Tailwind 4 + shadcn/ui, la interfaz debería inspirarse en:

- Linear
- Notion
- Plane
- Monday, tomando solo lo mejor
- ClickUp simplificado
- Datadog dashboards
- Uber Fleet

Pero adaptado a ISP y técnicos de campo.

## Principios del módulo

### 1. Overview first

El usuario debe ver:

- qué está atrasado
- qué está en riesgo
- qué técnico está saturado
- qué zonas tienen problemas
- cuántas órdenes están activas

Todo eso sin entrar a tablas.

### 2. Visualización tipo command center

La pantalla principal no debe ser CRUD-first. Debe ser:

- métricas
- timeline
- mapa
- alertas
- capacidad
- estado en tiempo real

### 3. Jerarquía visual fuerte

Prioridades:

| Prioridad | Elemento            |
| --------- | ------------------- |
| Alta      | SLA roto o retrasos |
| Media     | Técnicos saturados  |
| Media     | Órdenes próximas    |
| Baja      | Históricos          |

## Lluvia de ideas: vistas principales

### 1. Dashboard Operacional (Main View)

Es la pantalla más importante.

#### Layout ideal

```text
HEADER
--------------------------------
KPIs
--------------------------------
Timeline operacional
--------------------------------
Mapa + técnicos + OT
--------------------------------
Alertas / SLA / riesgos
--------------------------------
```

#### KPIs ultra visuales

Cards minimalistas:

- Órdenes activas
- Instalaciones hoy
- Tickets críticos
- SLA en riesgo
- Técnicos en ruta
- Técnicos offline
- Tiempo promedio de atención

#### Experiencia visual

Estado por color muy limpio:

- Verde: OK
- Amarillo: Riesgo
- Rojo: Crítico
- Azul: En ruta

Sin exceso de colores.

### 2. Timeline Inteligente

Es una de las vistas más importantes.

#### Inspiración

- Google Calendar
- Linear roadmap
- Jira Timeline
- Dispatching systems

#### Vista horizontal

```text
08:00 ----------------------- 18:00

Tecnico A
[Instalacion][Soporte][Corte]

Tecnico B
[Migracion][Disponible]
```

#### Interacciones

- drag and drop
- resize de tareas
- detección de conflictos
- cálculo automático de capacidad
- sugerencias con IA

#### Heatmap de saturación

- Verde: libre
- Amarillo: carga media
- Rojo: sobrecargado

### 3. Vista Mapa (muy importante)

En ISP esto es clave.

#### Vista tipo Uber o Fleet

Debe mostrar:

- técnicos en tiempo real
- órdenes
- zonas saturadas
- nodos
- clientes críticos
- cortes masivos

#### Clustering automático

Si hay muchas órdenes:

```text
[12]
[8]
[25]
```

#### Rutas

- optimización automática
- tiempo estimado
- tráfico
- distancia

### 4. Panel "Ahora"

Un panel tipo NOC operacional.

#### Preguntas que debe responder

- ¿Qué está pasando ahora?
- ¿Quién está atrasado?
- ¿Qué SLA se rompe primero?
- ¿Qué técnico necesita ayuda?

#### Feed operacional en tiempo real

```text
10:02 - Tecnico Juan inicio OT-1922
10:04 - SLA en riesgo alto OT-1881
10:08 - Cliente VIP sin atencion
```

### 5. Vista de Técnicos

No debe ser una tabla aburrida.

#### Card operacional de referencia

```text
Carlos Perez
Zona Norte
######-- 70% carga

- 4 ordenes activas
- 1 retrasada
- ETA proxima: 12 min
```

#### Acciones rápidas

- reasignar
- llamar
- WhatsApp
- ver ruta
- bloquear agenda
- agregar OT urgente

### 6. Planificador Drag & Drop

Es el core del WFM.

#### Asignación inteligente

Al mover una OT, el sistema evalúa:

- distancia
- tráfico
- skills
- SLA
- carga
- disponibilidad
- inventario

#### Recomendaciones con IA

> Sugerencia: mover OT-1991 a Juan reduce 32 min.

### 7. Vista tipo Kanban Operacional

Es muy útil para supervisores.

#### Columnas

- Pendiente
- Asignada
- En ruta
- En sitio
- Finalizada
- Bloqueada

#### Reglas de UX

- cards compactas
- SLA visible
- badges críticos
- prioridad visual fuerte

### 8. Centro de Alertas

Debe ser minimalista y no invasivo.

#### Tipos de alerta

- SLA en riesgo
- técnico detenido
- OT vencida
- GPS offline
- cliente VIP
- inventario faltante

#### Panel lateral moderno

```text
ALERTA: 3 ordenes vencen en 20 min
ALERTA: Zona Norte saturada
ALERTA: Tecnico sin movimiento hace 40 min
```

### 9. Capacity Planning

Es un diferenciador fuerte.

#### Visualización sugerida

```text
Zona Norte
#########- 90%

Zona Sur
#####----- 50%
```

#### Predicción

- saturación mañana
- backlog semanal
- horas hombre
- capacidad por skill

### 10. Mobile-first para técnicos

Es crítico.

#### App técnica ultra simple

Solo debería mostrar:

- siguiente OT
- mapa
- check-in
- evidencia
- firma
- materiales
- cerrar OT

#### UX móvil

Máximo permitido:

- 2 taps por acción
- offline-first
- fotos rápidas
- dictado por voz

## Ideas diferenciales muy potentes

### A. Mission Control

Pantalla gigante tipo centro de operaciones, ideal para NOC.

### B. Playback Operacional

Permite ver cómo evolucionó el día operacional, como un replay.

### C. Smart Dispatch

La IA propone automáticamente:

- reasignaciones
- agrupaciones geográficas
- optimización de rutas
- balance de carga

### D. SLA Radar

Visual circular sugerido:

```text
Critico -> 3
Riesgo  -> 12
OK      -> 88
```

### E. Operational Health Score

Score único sugerido: 92/100.

Basado en:

- puntualidad
- SLA
- backlog
- saturación
- tiempos muertos

## Arquitectura recomendada para iWana

Con el stack actual.

### Frontend

- Next.js App Router
- React Server Components
- Tailwind 4
- shadcn/ui
- TanStack Query
- Zustand para estado realtime de UI
- Framer Motion

### Realtime

Recomendado:

- WebSockets
- SSE para dashboards
- Redis Pub/Sub

### Mapa

Opciones:

| Tecnología  | Recomendación       |
| ----------- | ------------------- |
| Mapbox      | Mejor UX            |
| Leaflet     | Más económico       |
| Google Maps | Costoso para escala |

### Timeline

Opciones:

| Librería                | Uso           |
| ----------------------- | ------------- |
| react-calendar-timeline | Base          |
| dnd-kit                 | Drag and drop |
| visx                    | Charts custom |

## Diseño visual recomendado

### Estilo

- mucho espacio en blanco
- bordes suaves
- sombras sutiles
- tipografía limpia
- cards compactas
- información escaneable

### Anti-patrones

- no usar tablas gigantes
- no abusar de modales
- no usar demasiados colores
- no crear formularios eternos
- no usar menús anidados complejos
- no recargar dashboards

## Feature roadmap sugerido

### Fase 1: MVP visual

- Dashboard
- Timeline
- Kanban
- Técnicos
- Mapa básico
- Alertas
- SLA

### Fase 2

- optimización de rutas
- capacity planning
- mobile app
- GPS realtime

### Fase 3

- IA para dispatching
- predicción de saturación
- recomendaciones automáticas
- replay operacional

## Nombre conceptual interno

Podría manejarse como:

- iWana Flow
- iWana Ops
- iWana Dispatch
- iWana FieldOps
- iWana Mission Control
- iWana Workforce

## Recomendación conceptual

El módulo no debe sentirse como "gestión de órdenes". Debe sentirse como "control operacional en tiempo real".
