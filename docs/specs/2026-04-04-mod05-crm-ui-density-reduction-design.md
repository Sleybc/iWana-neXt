# Diseno UX/UI - MOD05 CRM Portal Reduccion de Densidad Visual

**Version:** 1.0  
**Estado:** En revision  
**Fecha:** 2026-04-04  
**Tipo:** Diseno de experiencia  
**Modulo:** MOD05 CRM  
**Alcance:** Portal tenant-aware  
**PRD de referencia:** docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md  
**HLD de referencia:** docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md  
**ADR de referencia:** docs/adrs/ADR-024-Migracion-CRM-Expediente-Unico.md  
**Specs relacionadas:** docs/superpowers/specs/SPEC-MOD05-REDISENO-v1.0.md, docs/superpowers/specs/SPEC-MOD05-EXPEDIENTE-UNICO-v1.0.md, docs/superpowers/specs/2026-04-04-mod05-crm-gestion-comercial-operativa-fase-01-design.md  
**Prototipos de referencia:** docs/prototipo/prototipo_expediente.html, docs/prototipo/prototipo_secciones_expedientes.html

---

## 1. Objetivo

Reducir la carga visual del CRM del portal sin alterar el modelo funcional de Expediente Unico Progresivo.

La meta no es redisenar el producto desde cero ni migrarlo a un wizard. La meta es mejorar jerarquia, ritmo visual y disclosure progresivo en tres vistas del modulo:

1. overview del CRM;
2. listado de expedientes;
3. detalle de expediente.

El foco principal de esta spec es el detalle de expediente, porque hoy concentra la mayor densidad cognitiva y visual del modulo.

---

## 2. Problema actual

### 2.1 Sintoma general

El CRM actual resuelve muchas necesidades funcionales, pero varias pantallas exponen demasiados bloques con el mismo peso visual.

Esto produce tres efectos negativos:

1. cuesta identificar la prioridad real de la pantalla;
2. acciones y contexto compiten entre si;
3. el usuario necesita leer demasiado antes de decidir que hacer.

### 2.2 Hallazgos por pantalla

#### Overview

En `apps/portal/src/components/crm/CrmOverviewClient.tsx` el resumen numerico, las oportunidades recientes y la lectura del pipeline compiten con enfasis parecido.

#### Listado

En `apps/portal/src/app/dashboard/crm/expedientes/page.tsx` la pantalla intenta crear, filtrar y revisar en el mismo nivel jerarquico. El formulario inline expandido para nueva oportunidad interrumpe la lectura principal de la tabla.

#### Detalle de expediente

En `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx` conviven en la misma zona alta:

1. header del caso;
2. resumen del expediente;
3. gestion comercial y operativa;
4. secciones editables;
5. acciones del pipeline;
6. tabs operacionales;
7. sidebar de actividad.

El resultado es correcto funcionalmente, pero recargado visualmente.

---

## 3. Principios de diseno aprobados

### 3.1 Jerarquia primero

Cada pantalla debe responder una sola pregunta principal:

1. overview: como va el modulo;
2. listado: que expedientes necesito revisar;
3. detalle: cual es el estado del caso y cual es la siguiente accion.

### 3.2 Disclosure progresivo

La interfaz no debe mostrar todo al mismo tiempo. Lo esencial debe quedar en el primer viewport. Lo secundario debe requerir scroll, tab o expansion controlada.

### 3.3 Una accion primaria por bloque

Ningun bloque debe contener mas de una accion primaria visible. Las demas acciones pasan a contexto secundario.

### 3.4 Menos ruido, misma trazabilidad

Se reduce densidad visual sin eliminar contexto funcional. Historicos, metadata y secciones siguen existiendo, pero cambian de prioridad y presentacion.

### 3.5 Reutilizacion del lenguaje del portal

No se introduce un sistema visual nuevo. El rediseño debe apoyarse en patrones ya validados del portal:

1. `apps/portal/src/components/layout/PageHeader.tsx`
2. `apps/portal/src/components/dashboard/MetricCard.tsx`
3. `apps/portal/src/components/settings/SettingsTabs.tsx`
4. `apps/portal/src/components/crm/expedientes/ExpedienteTabsContainer.tsx`

---

## 4. Alcance

### Incluye

1. refinamiento UX/UI del overview del CRM;
2. refinamiento UX/UI del listado de expedientes;
3. refinamiento UX/UI del header y detalle de expediente;
4. reorganizacion visual de secciones, sidebar y tabs;
5. reglas de densidad, grid y semantica visual.

### No incluye

1. cambios de backend o contrato API;
2. cambios de modelo de datos o nuevas entidades;
3. rediseño del shell global del portal;
4. migracion a wizard por etapas del pipeline;
5. rebranding o cambio de identidad visual transversal.

---

## 5. Overview objetivo

### 5.1 Estructura

La pantalla de overview debe quedar organizada asi:

1. header estandar con una sola accion primaria;
2. banda compacta de 3 o 4 metricas;
3. grid de dos columnas:
   - izquierda: oportunidades recientes;
   - derecha: lectura rapida del pipeline.

### 5.2 Decision visual

Las metricas no deben sentirse como un dashboard financiero. Deben ser una lectura corta de estado.

### 5.3 Cambios esperados

1. reducir el peso visual de bloques secundarios;
2. evitar tres tarjetas con protagonismo equivalente;
3. dejar claro que el overview es una puerta de entrada, no la pantalla principal de gestion.

---

## 6. Listado objetivo

### 6.1 Estructura

La pantalla de listado debe separar tres niveles:

1. cabecera y CTA `Nueva oportunidad`;
2. toolbar de filtros compacta;
3. tabla principal como contenido dominante.

### 6.2 Regla clave

La creacion de una nueva oportunidad no debe vivir expandida por defecto dentro del flujo de lectura de la tabla.

Se aprueba como direccion preferida cualquiera de estas dos variantes:

1. card plegable bajo el header;
2. drawer/modal ligero.

### 6.3 Tabla editorial

La tabla debe reducir densidad por fila:

1. la primera columna concentra nombre, fuente y contexto breve;
2. estado y completitud se mantienen como senales rapidas;
3. datos secundarios pasan a texto auxiliar;
4. se evita acumular badges y microelementos dentro de la misma fila.

### 6.4 Responsive

En mobile y tablet:

1. filtros plegables;
2. scroll horizontal controlado solo para la tabla;
3. no duplicar toolbar y filtros extensos en el primer viewport.

---

## 7. Detalle de expediente objetivo

### 7.1 Meta principal

El detalle debe dejar de comportarse como una pagina larga con todo visible y pasar a una composicion de ficha con vistas hermanas.

La experiencia debe responder dos necesidades separadas:

1. comprender rapidamente el estado del expediente;
2. entrar a una vista especializada para trabajar o consultar una capa concreta.

La `Vista general` debe responder solo estas preguntas:

1. quien es el caso;
2. en que estado esta;
3. que tan avanzado va;
4. cual es la siguiente accion probable.

### 7.2 Layout objetivo

#### Tabs de primer nivel aprobados

1. `Vista general`
2. `Secciones`
3. `Seguimiento`
4. `Consentimientos`
5. `Cobertura`
6. `Contexto`

Esta navegacion reemplaza la necesidad de sidebar persistente cargada con historiales y metadata.

#### Rol de cada tab

1. `Vista general`: ficha ejecutiva del expediente.
2. `Secciones`: consola de trabajo principal para editar el expediente.
3. `Seguimiento`: capa comercial operativa del dia a dia.
4. `Consentimientos`: capa legal aislada.
5. `Cobertura`: capa tecnica aislada.
6. `Contexto`: bitacora e informacion administrativa de consulta.

#### Primer viewport de Vista general

1. header limpio del expediente;
2. tarjeta hero de resumen del caso;
3. snapshot comercial compacto;
4. grid de tarjetas por dimension;
5. acciones rapidas minimas.

No deben convivir en `Vista general` formularios densos, historicos largos ni bloques administrativos extensos.

#### Segundo viewport

1. el resto del trabajo profundo ocurre en tabs especializados;
2. `Secciones` concentra la edicion completa del expediente;
3. `Contexto` concentra actividad, metadata e historial del pipeline.

### 7.3 Header del expediente

`apps/portal/src/components/crm/expedientes/ExpedienteHeader.tsx` debe alinearse al lenguaje de `PageHeader`.

Se aprueban estos ajustes:

1. mantener volver al listado;
2. mantener nombre, badge de estado y subtitulo;
3. mantener progreso global, pero en formato compacto;
4. remover CTA redundante `Nuevo registro` del header.

El header debe perder protagonismo ornamental y ganar claridad informativa.

### 7.4 Resumen superior

La tarjeta de resumen debe inspirarse en el prototipo `prototipo_expediente.html`.

Debe incluir solo:

1. estado actual;
2. fuente u origen resumido;
3. municipio o contexto geografico breve;
4. barra de progreso general;
5. linea sintetica de dimensiones comercial, legal, tecnica y operativa.

No debe incluir formularios ni historicos.

### 7.5 Vista general resumida por dimensiones

`Vista general` no debe mostrar las 8 secciones como tarjetas independientes ni incluir el acordeon completo.

Se aprueba un grid de 4 tarjetas, una por dimension:

1. `Comercial`
2. `Tecnica`
3. `Legal`
4. `Operativa`

#### Contenido minimo de cada tarjeta

1. nombre de la dimension;
2. porcentaje general;
3. indicador breve de progreso;
4. mini lista de secciones asociadas;
5. estado rapido por seccion: completado, en progreso o pendiente;
6. CTA discreto para ir a `Secciones`.

#### Mapeo aprobado

1. `Comercial`: Identificacion, Contacto, Interes del cliente.
2. `Tecnica`: Ubicacion, Viabilidad tecnica.
3. `Legal`: Consentimiento y validacion.
4. `Operativa`: Facturacion, Instalacion.

#### Regla critica

Estas tarjetas son de lectura orientada a decision. No se convierten en mini formularios ni en una version resumida editable del tab `Secciones`.

### 7.6 Gestion comercial y operativa

El bloque actual es util, pero demasiado denso para su ubicacion actual.

Se aprueba dividirlo en dos niveles:

1. arriba: estado operacional actual y accion puntual de reasignacion si aplica;
2. abajo o en bloques secundarios: historiales comercial y operativo.

La experiencia principal no debe obligar a leer ambos historiales antes de continuar con las secciones del expediente.

En `Vista general`, este bloque solo debe aparecer como snapshot compacto.

La edicion profunda y la lectura de historiales no viven ahi.

### 7.7 Tab Secciones

`Secciones` se convierte en la vista principal de trabajo del expediente.

Aqui vive el acordeon completo con las 8 secciones editables.

Direccion aprobada:

1. un solo panel expandido a la vez;
2. headers mas limpios;
3. icono, titulo, descripcion y progreso como patron fijo;
4. menos badges decorativos;
5. mayor separacion entre header de seccion y contenido del formulario.

La referencia principal es `prototipo_secciones_expedientes.html`, adaptada al sistema visual real del portal.

### 7.8 Reglas de formulario dentro de Secciones

1. formularios densos en 2 columnas;
2. 3 columnas solo para campos muy cortos y fuertemente relacionados;
3. ayudas y estados en microcopy bajo el campo, no en chips extra;
4. boton de guardado contextual, pequeno y al cierre del panel;
5. evitar reordenamientos bruscos de layout por cambios menores de estado.

### 7.9 Refinamiento especifico por seccion

#### Identificacion

La seccion debe agruparse visualmente asi:

1. tipo de persona y documento;
2. datos del titular o razon social;
3. contacto principal cuando aplique.

El cambio entre persona natural y juridica no debe romper la lectura del bloque completo.

#### Viabilidad tecnica

La seccion debe agruparse asi:

1. resultado tecnico;
2. tecnologia candidata o recomendada;
3. nivel de certeza y fuente;
4. observacion tecnica.

El objetivo es reducir la sensacion de checkboxes y selects compitiendo sin jerarquia.

#### Facturacion e instalacion

Estas secciones deben verse mas operativas y menos pesadas. Si tienen pocos campos, el layout debe responder con menor altura visual y no conservar un contenedor sobredimensionado.

### 7.10 Tabs especializados adicionales

Los tabs `Seguimiento`, `Consentimientos` y `Cobertura` dejan de sentirse como bloques enterrados debajo de la vista principal y pasan a vistas especializadas.

#### Seguimiento

1. intentos de contacto;
2. notas operativas de relacion comercial;
3. acciones del dia a dia con el caso.

#### Consentimientos

1. estado legal del expediente;
2. trazabilidad de autorizaciones;
3. alertas legales cuando existan.

#### Cobertura

1. verificaciones tecnicas;
2. resultados de viabilidad;
3. evidencias o detalles de disponibilidad.

### 7.11 Tab Contexto

`Contexto` reemplaza la sidebar como contenedor de informacion consultiva.

Se aprueba dejar solo:

1. actividad reciente resumida;
2. historial del pipeline;
3. metadata operativa compacta.

#### Orden interno recomendado

1. actividad reciente arriba;
2. historial del pipeline en medio;
3. metadata operativa abajo.

`Contexto` es una vista de lectura, no de edicion.

### 7.12 Acciones rapidas versus acciones administrativas

`Vista general` puede conservar una tarjeta minima de acciones rapidas:

1. cambiar estado;
2. programar instalacion;
3. reactivar, si aplica.

El bloque completo de pipeline y su detalle historico no deben competir con el resumen del caso.

---

## 8. Reglas visuales transversales

### 8.1 Color

1. `iwana-primary` para estructura y enfasis principal;
2. `iwana-secondary` solo como acento decorativo o de progreso;
3. `iwana-secondary-700` para texto sobre fondo claro cuando aplique;
4. gris para metadata e informacion secundaria.

### 8.2 Elevacion

1. priorizar borde suave y contraste antes que sombra fuerte;
2. no usar muchas cards con el mismo nivel de protagonismo;
3. cada viewport debe tener un unico foco dominante.

### 8.3 Badges y senales

1. badge para estado real o prioridad real;
2. no usar badge como sustituto de buena jerarquia tipografica;
3. la completitud puede convivir con barra y texto, sin exceso de chips adicionales.

### 8.4 Responsive

1. una sola columna cognitiva en mobile;
2. desaparece la sidebar persistente en detalle;
3. la navegacion por tabs organiza las capas del expediente;
4. secciones abiertas una por vez;
5. filtros y tablas adaptados a lectura por bloques.

---

## 9. Mapa de reutilizacion de componentes

| Necesidad | Referencia actual | Decision |
| --- | --- | --- |
| Header de pagina | `apps/portal/src/components/layout/PageHeader.tsx` | Mantener patron base |
| Header detalle expediente | `apps/portal/src/components/crm/expedientes/ExpedienteHeader.tsx` | Simplificar y acercar a `PageHeader` |
| Metricas compactas | `apps/portal/src/components/dashboard/MetricCard.tsx` | Reutilizar lenguaje visual |
| Tabs accesibles | `apps/portal/src/components/settings/SettingsTabs.tsx` | Usar como referencia de interaccion |
| Tabs del expediente | `apps/portal/src/components/crm/expedientes/ExpedienteTabsContainer.tsx` | Extender a tabs de primer nivel para toda la ficha |
| Semantica de estados | `apps/portal/src/components/crm/expedientes/expediente-ui.ts` | Centralizar labels, badges y variantes |

---

## 10. Prioridad de ejecucion sugerida

1. `apps/portal/src/app/dashboard/crm/expedientes/[id]/page.tsx`
2. `apps/portal/src/components/crm/expedientes/ExpedienteHeader.tsx`
3. `apps/portal/src/components/crm/expedientes/ExpedienteTabsContainer.tsx`
4. `apps/portal/src/components/crm/expedientes/expediente-ui.ts`
5. `apps/portal/src/app/dashboard/crm/expedientes/page.tsx`
6. `apps/portal/src/components/crm/CrmOverviewClient.tsx`

---

## 11. Criterios de aceptacion de diseno

1. El detalle deja de comportarse como una pagina larga y pasa a una ficha con tabs de primer nivel.
2. `Vista general` funciona como resumen ejecutivo del expediente, no como vista de edicion profunda.
3. `Secciones` pasa a ser el centro del flujo de trabajo del expediente.
4. `Contexto` absorbe actividad reciente, metadata e historial del pipeline.
5. La sidebar persistente deja de ser necesaria en el detalle.
6. El listado prioriza lectura de la tabla por encima de la creacion inline.
7. El overview se percibe como entrada rapida, no como dashboard recargado.
8. El modulo conserva consistencia con el lenguaje del portal y no introduce una UI paralela.

---

## 12. Riesgos y mitigaciones

1. **Riesgo de simplificar demasiado y ocultar contexto util:**
   - Mitigacion: mover contexto a bloques secundarios o tabs, no eliminarlo.
2. **Riesgo de inconsistencia entre overview, listado y detalle:**
   - Mitigacion: reutilizar primitives y reglas visuales compartidas.
3. **Riesgo de que `Vista general` se vuelva otro dashboard cargado:**
   - Mitigacion: usar 4 tarjetas por dimension, no 8 tarjetas por seccion, y reservar la edicion para `Secciones`.
4. **Riesgo de esconder demasiado trabajo detras de tabs:**
   - Mitigacion: mantener `Vista general` con resumen, siguiente paso y accesos claros a los tabs especializados.

---

## 13. Fuera de alcance explicito

1. creacion de un wizard multi-step;
2. cambios de ownership entre modulos;
3. nuevas entidades de workflow tecnico;
4. cambios de API o persistencia motivados solo por la limpieza visual.
