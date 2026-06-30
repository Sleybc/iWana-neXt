---
name: nextjs-app-router-patterns
description: Patrones Next.js App Router para iWana neXt con Server Components, boundaries cliente-servidor, carga de datos y flujos web alineados al repo.
---

# Next.js App Router Patterns

## Proposito

Usa esta skill cuando trabajes en frontend web con Next.js App Router dentro del repo.

El foco es aterrizar App Router al proyecto real: Server Components por defecto, Client Components solo cuando se justifiquen, carga de datos segura, rutas coherentes y UI alineada al sistema de componentes del repo.

## Cuando usarla

Activa esta skill para tareas como:

- Nuevas pantallas, layouts, rutas o segmentos.
- Separacion entre componentes de servidor y cliente.
- Carga de datos, mutaciones y manejo de estados de carga o error.
- Estructura de features en el frontend.
- Optimizacion de UX, SEO tecnico y navegacion.

## Reglas del repo

### 1. Server Components primero

Por defecto:

- carga datos en servidor cuando no necesites interactividad local
- deja secretos, tokens y logica sensible fuera del cliente
- usa Client Components solo para interaccion, estado local o APIs del navegador

### 2. App Router con estructura intencional

- layouts para estructura compartida real
- loading y error boundaries donde agreguen claridad operativa
- rutas y segmentos que reflejen el dominio, no solo la UI
- evita jerarquias de carpetas arbitrarias o page files inflados

### 3. Integracion con el resto del stack

- la UI debe convivir con OpenAPI, autenticacion, tenancy y accesibilidad
- no traslades al cliente decisiones que pertenecen al backend
- si un flujo depende del tenant o permisos, el diseño debe contemplarlo desde la carga de datos y el rendering

## Patrones preferidos

### Carga de datos

- fetch en servidor cuando el dato es parte del render inicial
- boundaries de cache y revalidacion explicitos si el caso lo requiere
- componentes chicos que separen layout, data y presentacion
- errores y vacios tratados como estados de producto, no como casos marginales

### Client Components

- usalos donde haya formularios interactivos, widgets o estado local real
- mantenlos acotados y cercanos al punto de interaccion
- evita convertir una pagina completa en cliente si solo un fragmento lo necesita

### Estructura

- organiza por feature o segmento de dominio
- comparte componentes y utilidades solo cuando el boundary sea claro
- layouts, pages y componentes auxiliares deben ser faciles de rastrear

### UX y accesibilidad

- estados loading, empty y error visibles y consistentes
- navegacion clara y semantica
- formularios con labels, feedback y errores accesibles
- responsive y performance como parte del flujo, no como ajuste final

## Checklist de revision

- La pantalla usa Server Components por defecto cuando es viable.
- Los Client Components estan justificados y acotados.
- La carga de datos no expone logica sensible al cliente.
- Loading, empty y error states estan cubiertos.
- La estructura de rutas refleja el dominio y no genera ruido.
- La implementacion respeta accesibilidad, seguridad e i18n cuando aplican.

## Heuristica para revisar codigo

Busca y corrige estas señales:

- `use client` en paginas completas sin razon clara
- fetches duplicados entre cliente y servidor sin necesidad
- componentes gigantes que mezclan layout, data y mutaciones
- errores sin manejo visible o estados vacios inexistentes
- rutas o segmentos nombrados solo por conveniencia tecnica
- logica sensible serializada al cliente

## Anti-patrones

Evita:

- usar App Router con mentalidad de Pages Router heredada
- mover toda la pantalla al cliente por facilidad de debugging
- mezclar concerns de dominio, UI y data fetching en un mismo archivo enorme
- dejar la estrategia de loading y error para despues
- construir navegacion sin considerar permisos o contexto de tenant

## Escalacion

Usa [ESCALACION AL CTO] si:

- una propuesta contradice el baseline frontend o el modelo de seguridad del sistema
- la solucion requiere desbordar el alcance de App Router con un cambio estructural mayor
