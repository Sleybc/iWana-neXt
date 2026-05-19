# PRD - MOD05 CRM Gestion Comercial y Operativa

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-04-04  
**Modo activo:** Architect  
**Autor:** AI-EM-ARCH (Lead Software Architect Senior)  
**PRD base:** `docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md`  
**PRD relacionado:** `docs/prds/PRD-MOD05-CRM-ORIGEN-ATRIBUCION-v1.1.md`  
**HLD relacionado:** `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md`  
**Informe relacionado:** `docs/informes/INFORME-MOD05-ATRIBUCION-INCENTIVOS-FASE1-v1.0.md`  
**ADRs aplicables:** ADR-016, ADR-018, ADR-019, ADR-022, ADR-024, ADR-026

> **Nota correctiva 2026-05-05:** la implementacion tecnica de esta experiencia debe alinearse con `docs/specs/2026-05-05-crm-pipeline-completeness-read-model-design.md`. La lectura de responsable actual, historial comercial e historial operativo debe resolverse via ports/read models de CRM y no por lecturas directas cross-module en servicios del expediente.

---

## 1. Contexto y problema

El detalle actual del expediente en MOD05 separa la informacion en dos bloques funcionales distintos:

1. `Interes comercial`
2. `Atribucion comercial`

En la operacion real esto genera confusion porque el usuario necesita responder simultaneamente preguntas distintas pero cercanas:

1. Que quiere el cliente.
2. Como llego la oportunidad.
3. Quien trajo el cliente.
4. Quien tiene el caso ahora.
5. Como se ha movido el expediente entre usuarios.

La separacion actual dificulta la lectura operativa del expediente y mezcla conceptos comerciales con conceptos de responsabilidad operativa.

---

## 2. Objetivo del documento

Definir la unificacion funcional y visual de las secciones comerciales del expediente bajo un solo bloque de experiencia llamado `Gestion comercial y operativa`, manteniendo separacion semantica en el modelo de datos entre:

1. Origen de la oportunidad.
2. Atribucion comercial.
3. Responsabilidad operativa.
4. Historial comercial.
5. Historial operativo.

---

## 3. Decision de producto

### 3.1 Nueva seccion unificada

Se reemplaza la lectura separada de `Interes comercial` y `Atribucion comercial` por una sola seccion de detalle:

**Nombre aprobado:** `Gestion comercial y operativa`

### 3.2 Orden visual aprobado

La seccion debe mostrarse en este orden:

1. Responsable actual
2. Interes del cliente
3. Origen de la oportunidad
4. Atribucion comercial
5. Historial comercial
6. Historial operativo

### 3.3 Prioridad visual

El dato mas visible del bloque debe ser:

#### Responsable actual

Esto responde a la necesidad operativa primaria: saber quien tiene el expediente en este momento.

---

## 4. Definiciones funcionales aprobadas

### 4.1 Responsable actual

Usuario que tiene el expediente en el momento presente y que debe ejecutar la siguiente accion operativa.

Reglas:

1. Cambia manualmente.
2. No cambia automaticamente por estado.
3. Puede cambiar muchas veces durante la vida del expediente.
4. Cada cambio debe dejar trazabilidad en historial operativo.

### 4.2 Interes del cliente

Describe lo que el cliente potencial desea contratar o comprar.

Incluye:

1. `interestedPlanId`
2. `additionalProductIds`

### 4.3 Origen de la oportunidad

Describe como nacio la oportunidad antes de que el equipo interno empezara a mover el expediente.

Incluye:

1. `acquisitionChannel`
2. `sourceDetail`

Definiciones:

- `Canal de captacion`: medio por el que llego la oportunidad.
- `Detalle de origen`: contexto libre complementario del canal.

Ejemplos:

1. Canal: `WHATSAPP` | Detalle: `Campana de marzo`
2. Canal: `REFERIDO_CLIENTE` | Detalle: `Referido por suscriptor activo`
3. Canal: `EVENTO` | Detalle: `Feria local de conectividad`

### 4.4 Atribucion comercial

Describe a quien se le reconoce comercialmente el cliente.

Incluye:

1. Originador comercial
2. Fecha de atribucion inicial
3. Correcciones excepcionales del originador

Reglas:

1. El originador comercial no es igual al responsable actual.
2. Debe mantenerse estable para futuros incentivos y bonificaciones.
3. Solo un admin puede corregirlo.
4. Toda correccion debe dejar motivo y trazabilidad.

### 4.5 Historial comercial

Registra solo eventos de correccion o reatribucion del originador comercial.

Cada evento debe guardar:

1. Originador anterior
2. Originador nuevo
3. Motivo
4. Fecha
5. Usuario administrador que hizo el cambio

### 4.6 Historial operativo

Registra traspasos normales del expediente entre usuarios.

Cada evento debe guardar:

1. Responsable anterior
2. Responsable nuevo
3. Fecha
4. Actor que realizo el cambio
5. Observacion opcional

---

## 5. Alcance

### En scope

| Area                      | Descripcion                                                           |
| ------------------------- | --------------------------------------------------------------------- |
| UX detalle expediente     | Unificar bloques actuales en una sola seccion coherente               |
| Naming funcional          | Renombrar subbloques para reducir ambiguedad                          |
| Responsabilidad operativa | Introducir `responsable actual` como concepto visible de primer nivel |
| Historiales separados     | Mantener historial comercial y operativo como conceptos distintos     |
| Permisos                  | Correccion de originador restringida a `ADMIN`                        |

### Fuera de scope

1. Motor de incentivos o bonificaciones.
2. Liquidacion de comisiones.
3. Automatizacion de asignacion por estado.
4. Modelado de areas como entidades formales.
5. Reglas SLA por area o cola.

---

## 6. Requisitos funcionales

### RF-GCO-01: Seccion unificada en detalle

El detalle del expediente debe mostrar una sola seccion visual `Gestion comercial y operativa` que agrupe interes, origen, atribucion y responsabilidad.

### RF-GCO-02: Responsable actual visible

La cabecera de la seccion debe exponer:

1. Responsable actual.
2. Rol del responsable actual si esta disponible.
3. Fecha de ultima asignacion.
4. Accion visible para reasignar manualmente.

### RF-GCO-03: Origen de la oportunidad no ambiguo

`Canal de captacion` y `Detalle de origen` deben quedar agrupados bajo `Origen de la oportunidad` y no deben aparecer duplicados con otro significado en atribucion.

### RF-GCO-04: Originador comercial protegido

El originador comercial debe visualizarse separado del responsable actual y su correccion solo debe permitirse a administradores.

### RF-GCO-05: Historiales separados

El expediente debe exponer:

1. Historial comercial.
2. Historial operativo.

No se aprueba una linea de tiempo unica que mezcle ambos tipos de evento.

### RF-GCO-06: Cambio manual de responsable actual

La reasignacion del responsable actual debe ser manual, no automatica por pipeline, y debe generar evento en historial operativo.

---

## 7. Modelo conceptual

### 7.1 Estado actual del expediente

Debe residir en el agregado principal `ExpedienteRecord`:

1. `interestedPlanId`
2. `additionalProductIds`
3. `acquisitionChannel`
4. `sourceDetail`
5. `currentResponsibleUserId` o equivalente aprobado
6. `currentResponsibleAssignedAt` o equivalente aprobado

### 7.2 Historial comercial

Puede reutilizar la entidad existente de atribucion si se adapta semantica y funcionalmente al concepto de originador comercial y correcciones auditables.

La resolucion de nombres y roles asociados al historial comercial debe realizarse via read models o puertos tipados del modulo CRM.

### 7.3 Historial operativo

Debe existir como historial independiente del comercial. Puede modelarse como nueva entidad de transferencias/asignaciones o como extension auditada del expediente, pero sin mezclar semantica con atribucion comercial.

La resolucion del responsable actual y de los actores del historial operativo debe evitar lecturas directas cross-module desde los servicios del expediente.

---

## 8. Reglas de negocio

| Regla                 | Decision                 |
| --------------------- | ------------------------ |
| Canal de captacion    | Unico por expediente     |
| Detalle de origen     | Opcional, contextual     |
| Responsable actual    | Editable manualmente     |
| Originador comercial  | Editable solo por admin  |
| Cambio de originador  | Requiere motivo          |
| Cambio de responsable | Crea historial operativo |
| Cambio de originador  | Crea historial comercial |

---

## 9. Requisitos de UX

### 9.1 Labels aprobados

| Label anterior       | Label nuevo                   |
| -------------------- | ----------------------------- |
| Interes comercial    | Interes del cliente           |
| Atribucion comercial | Atribucion comercial          |
| Origen del lead      | Origen de la oportunidad      |
| Seccion contenedora  | Gestion comercial y operativa |

### 9.2 Criterios de legibilidad

1. `Responsable actual` debe ir arriba.
2. `Originador comercial` no debe compartir fila principal con `Responsable actual`.
3. `Canal de captacion` y `Detalle de origen` deben leerse como un bloque unico.
4. Los historiales deben estar claramente etiquetados como comercial y operativo.

---

## 10. Seguridad y permisos

| Accion                        | Rol minimo                                            |
| ----------------------------- | ----------------------------------------------------- |
| Ver responsable actual        | Roles operativos autorizados del CRM                  |
| Reasignar responsable actual  | Admin o rol operativo autorizado segun politica final |
| Ver originador comercial      | Roles autorizados del CRM                             |
| Corregir originador comercial | `ADMIN`                                               |

Nota: la politica exacta de reasignacion operativa puede cerrarse en implementacion, pero la correccion del originador queda restringida a `ADMIN` por decision de producto aprobada.

---

## 11. Criterios de aceptacion

1. El usuario entiende sin ambiguedad quien tiene el caso ahora.
2. El usuario entiende sin ambiguedad quien trajo el cliente.
3. El canal de captacion queda asociado al origen de la oportunidad y no a la reasignacion interna.
4. La UI muestra una sola seccion coherente en vez de dos bloques confusos.
5. El historial comercial y el historial operativo se visualizan por separado.
6. Un admin puede corregir el originador con motivo obligatorio.
7. Un cambio de responsable actual no altera el originador comercial.

---

## 12. Riesgos y consideraciones

1. Si el modelo de datos colapsa originador y responsable actual en el mismo concepto, la confusion reaparecera.
2. Si se usa un solo historial generico para ambos tipos de evento, se perdera claridad de negocio.
3. Si el responsable actual se automatiza por estados en esta fase, se rompe la decision funcional aprobada.

---

## 13. Trazabilidad

- PRD base: `docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md`
- PRD relacionado: `docs/prds/PRD-MOD05-CRM-ORIGEN-ATRIBUCION-v1.1.md`
- HLD relacionado: `docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md`
- Informe relacionado: `docs/informes/INFORME-MOD05-ATRIBUCION-INCENTIVOS-FASE1-v1.0.md`

---

## 14. Decision final aprobada

Se aprueba avanzar con una experiencia unificada de `Gestion comercial y operativa` en el detalle del expediente, manteniendo separacion estructural entre origen, atribucion comercial y responsabilidad operativa.
