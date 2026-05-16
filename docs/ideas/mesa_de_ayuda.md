# Módulo de Mesa de Ayuda

## 1. Concepto del módulo

### Nombre interno

HelpDesk / Tickets / Mesa de Ayuda (Core Support Engine)

### Principio clave

"Resolver en el menor número de clics posibles, con el máximo contexto posible".

## 2. Problemas que debe resolver en un ISP real

- soporte fragmentado entre WhatsApp, llamadas y CRM
- falta de contexto del cliente al atender
- ausencia de trazabilidad clara
- escalamiento manual y caótico
- SLA inexistente o no medible

## 3. Idea central del módulo

### Ticket con contexto enriquecido automático

Cada ticket no es solo un caso: es una vista unificada del cliente, el problema y la operación.

## 4. Estructura del módulo

### 4.1 Vista principal: dashboard operativo

Diseño sugerido: tipo kanban más métricas en header.

Columnas:

- Nuevos
- En proceso
- En espera cliente
- Escalados
- Cerrados

#### Métricas en tiempo real, top bar

- tickets abiertos
- SLA en riesgo
- tiempo promedio de respuesta
- técnicos activos

### 4.2 Vista rápida tipo one glance

Cada ticket debe mostrar:

```text
TicketCard
- cliente: nombre + ID
- estado: badge color
- prioridad: alta/media/baja
- servicio: plan / nodo
- problema: resumen IA
- tiempo: tiempo abierto
- SLA: contador regresivo
```

## 5. Integraciones, clave del sistema

Aquí está el diferencial real.

### 5.1 CRM

- historial de interacciones
- notas comerciales
- estado del cliente, VIP, moroso, etc.

### 5.2 Suscriptores

- plan activo
- estado del servicio
- consumo o tráfico
- últimos cortes o fallas

### 5.3 Red / ISP, futuro

- estado del nodo
- MikroTik / OLT
- alarmas

### 5.4 Comercial

- cliente en proceso de venta
- upsell o cross-sell activo

## 6. Features inteligentes de alto valor

### 6.1 Auto-enriquecimiento del ticket

Cuando se crea:

- detecta cliente automáticamente
- trae estado de conexión
- trae facturación
- trae tickets previos

### 6.2 Clasificación automática con IA

Tipos:

- soporte técnico
- facturación
- comercial

Prioridad automática según:

- cliente VIP
- caída masiva

### 6.3 Detección de incidentes masivos

Si existen muchos tickets similares:

```text
if tickets_similares > threshold:
  generar_incidente_global = true
```

Luego agrupa tickets y presenta una vista tipo outage.

### 6.4 SLA dinámico

```text
SLA
- respuesta: 15 min
- resolucion: 2 h
- depende de:
  - tipo_cliente
  - tipo_problema
```

Visual sugerido:

- Verde: OK
- Amarillo: riesgo
- Rojo: incumplido

### 6.5 Timeline unificado

Dentro del ticket:

```text
Timeline
- creacion
- interaccion del operador
- cambios de estado
- logs automaticos de red
- mensajes del cliente
```

## 7. UX/UI alineado con iWana

Según el manual:

- minimalismo con jerarquía clara
- bordes redondeados, 2xl
- espacios amplios
- colores funcionales por estado

### Componentes clave

#### Ticket card

- glassmorphism ligero
- hover con expansión rápida

#### Panel lateral, slide-over

- sin navegación completa
- todo inline y fluido

#### Microinteracciones

- cambio de estado animado
- countdown de SLA en vivo

## 8. Acciones rápidas, UX crítico

En cada ticket:

- cambiar estado en un clic
- asignar técnico
- ver cliente
- ver estado de red
- responder

## 9. Flujos principales

### 9.1 Creación de ticket

Origen:

- manual
- cliente desde portal
- WhatsApp, futuro
- evento automático de red

### 9.2 Resolución

El flujo debe cerrar el caso con trazabilidad completa, estado final, causa y evidencia cuando aplique.

## 10. Métricas para producto

- tiempo de primera respuesta
- tiempo de resolución
- porcentaje de SLA cumplido
- tickets por cliente
- tickets por nodo, clave para ISP

## 11. Diferenciadores del módulo

Este módulo no debe ser un helpdesk genérico.

### Diferencial iWana

- integrado con red ISP
- contexto automático
- vista operacional, no solo CRM
- detección de fallas masivas
- enfoque en tiempo real

## 12. Roadmap sugerido

### Fase 1, MVP

- CRUD de tickets
- Kanban
- integración básica con clientes
- SLA simple

### Fase 2

- timeline
- auto-clasificación
- métricas

### Fase 3

- integración de red
- incidentes masivos
- IA

## 13. Ideas avanzadas

### Copilot para soporte

- sugerir respuesta
- detectar causa probable

### Mapa de incidencias

- geolocalización de fallas

### Alertas proactivas

- crear ticket automático si cae un nodo

## 14. Riesgos técnicos

- integraciones mal desacopladas que introduzcan latencia
- sobrecarga de UI que rompa el minimalismo
- SLA mal definido que genere ruido operativo
