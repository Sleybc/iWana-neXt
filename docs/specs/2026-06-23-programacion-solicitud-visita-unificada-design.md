# Diseno - Programacion con Solicitud de Visita Unificada

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-06-23  
**Modo activo:** Mixto  
**Autor:** AI-EM-ARCH  
**Trazabilidad principal:** docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md  
**Trazabilidad relacionada:** docs/prds/PRD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md  
**HLD relacionado:** docs/hlds/HLD-MOD11-EJECUCION-OPERATIVA-TAREAS-v1.0.md  

---

## 1. Objetivo

Definir un modelo operativo unificado para evitar que `Programacion` replique la captura de negocio ya existente en `CRM`, `Mesa de ayuda` o `Tareas`.

La decision central es que `Programacion` deja de ser un modulo de captura general y pasa a ser el modulo donde una necesidad ya creada en otro lugar se convierte en:

- visita agendada;
- visita pendiente por coordinar;
- o resolucion sin visita.

---

## 2. Problema a resolver

Hoy el sistema corre el riesgo de repetir el mismo proceso en varios puntos:

- `CRM` captura una instalacion y luego `Programacion` vuelve a pedir datos parecidos para agendar;
- `Mesa de ayuda` puede capturar un ticket y luego `Programacion` volver a reconstruir el caso;
- `Tareas` puede capturar trabajo operativo y luego `Programacion` volver a levantar parte del contexto.

Eso genera:

- duplicacion de informacion;
- ownership ambiguo;
- formularios paralelos;
- reglas repetidas;
- y mayor probabilidad de inconsistencias entre caso, tarea y agenda.

---

## 3. Principio rector

La necesidad nace en su modulo de negocio.

La visita nace en una `solicitud de visita`.

La programacion ocurre en un solo lugar.

---

## 4. Decision de producto

Se adopta un objeto operativo comun llamado `solicitud de visita`.

Ese objeto representa la intencion formal de coordinar una visita de campo, independientemente de si el origen fue comercial, soporte, operacion o contingencia manual.

### 4.1 Lo que no es

La `solicitud de visita` no reemplaza:

- el ticket;
- la tarea;
- la oportunidad;
- el expediente;
- el evento de agenda;
- ni la orden de trabajo.

### 4.2 Lo que si es

La `solicitud de visita` es el puente entre:

- el modulo que origina la necesidad;
- y el modulo `Programacion`, que coordina la visita.

---

## 5. Ownership por capa

| Capa | Owner | Responsabilidad |
| --- | --- | --- |
| Origen comercial | CRM | oportunidad, expediente, instalacion comercial |
| Origen de soporte | Mesa de ayuda | ticket, caso, trazabilidad del incidente o requerimiento |
| Origen operativo | Tareas | trabajo ejecutable, responsable, destinatario, seguimiento del trabajo |
| Coordinacion de visita | Programacion | solicitud de visita, agenda, asignacion, reagendamiento, supervision |
| Ejecucion en terreno | Programacion / Operaciones de campo | evento programado, orden de trabajo ligera, estado de la visita |

Regla obligatoria:

- `Programacion` no debe absorber el ownership del caso de negocio.
- `CRM`, `Ticket` o `Tarea` no deben absorber el ownership de la agenda.

---

## 6. Objeto canonico: solicitud de visita

### 6.1 Campos minimos

| Campo | Uso |
| --- | --- |
| `originType` | CRM, Ticket, Tarea, Manual |
| `originRefId` | id del caso, expediente, ticket o tarea |
| `visitType` | instalacion, soporte, revision, retiro, visita tecnica, comercial |
| `customerOrRecipientLabel` | nombre resumido de cliente, sede o destinatario |
| `functionalOwnerLabel` | area o responsable funcional que origino la necesidad |
| `operationalSummary` | contexto corto y accionable |
| `priority` | criticidad operativa |
| `desiredWindow` | franja deseada, si existe |
| `requiresVisit` | confirma si realmente amerita coordinacion en terreno |
| `schedulingStatus` | estado del embudo de programacion |

### 6.2 Principios del objeto

- Debe permitir agendar sin volver a pedir todo el negocio.
- Debe vivir bien con origen externo.
- Debe ser suficientemente corto para usarse en bandeja.
- Debe poder resolverse sin visita cuando aplique.

---

## 7. Matriz de origen

| Origen | Objeto principal owner | Cuando crea solicitud de visita | Accion primaria | Puede ir a pendientes | Puede resolverse sin visita |
| --- | --- | --- | --- | --- | --- |
| CRM | oportunidad / expediente | cuando la instalacion o visita comercial requiere desplazamiento | `Agendar ahora` | Si | Si |
| Mesa de ayuda | ticket | cuando el caso requiere visita tecnica o presencial | `Agendar ahora` | Si | Si |
| Tareas | tarea | cuando el trabajo requiere cita, desplazamiento o coordinacion en terreno | `Agendar ahora` | Si | Si |
| Manual | Programacion | solo en contingencia, visita interna o regularizacion | `Agendar ahora` | Si | Si |

---

## 8. Reglas por origen

### 8.1 CRM

- La instalacion no debe nacer en `Programacion`.
- `CRM` crea la necesidad y decide si requiere visita.
- Si requiere visita, debe crear la `solicitud de visita`.
- Luego ofrece dos acciones:
  - `Agendar ahora`
  - `Enviar a pendientes`

### 8.2 Mesa de ayuda

- El ticket sigue siendo owner del caso.
- Si el caso necesita desplazamiento o atencion presencial, crea `solicitud de visita`.
- `Programacion` no debe volver a pedir la informacion del ticket.
- La agenda solo toma el contexto util para coordinar la visita.

### 8.3 Tareas

- La tarea sigue siendo owner del trabajo.
- Solo crea `solicitud de visita` cuando la tarea realmente requiere cita o trabajo de campo.
- Si la tarea no requiere desplazamiento, no debe pasar por `Programacion`.

### 8.4 Manual

- Debe existir solo como flujo excepcional.
- No debe usarse para crear una instalacion completa, un ticket completo o una tarea completa.
- Debe crear solo una `solicitud manual de visita`.

---

## 9. Estados recomendados

### 9.1 Estados de la solicitud de visita

| Estado | Significado |
| --- | --- |
| `pendiente por agendar` | existe necesidad, pero aun no tiene espacio confirmado |
| `lista para agendar` | tiene contexto suficiente para programarse |
| `agendada` | ya tiene evento confirmado |
| `reagendacion requerida` | existia agenda, pero necesita una nueva coordinacion |
| `cancelada` | ya no debe coordinarse |
| `resuelta sin visita` | el caso se atendio sin necesidad de desplazamiento |

### 9.2 Estados del evento de agenda

| Estado | Significado |
| --- | --- |
| `programado` | visita confirmada en agenda |
| `en ruta` | equipo desplazandose |
| `en ejecucion` | atencion en curso |
| `completado` | visita terminada |
| `no realizado` | no se pudo ejecutar |
| `reagendado` | el evento fue reemplazado por nueva coordinacion |
| `cancelado` | visita anulada |

### 9.3 Regla entre estados

La solicitud y el evento no son lo mismo:

- la solicitud explica por que existe la necesidad;
- el evento materializa cuando y con quien se atendera.

---

## 10. Reglas de orquestacion

1. El modulo de origen crea el caso principal.
2. Si requiere campo, crea una `solicitud de visita`.
3. El usuario decide una de tres salidas:
   - `Agendar ahora`
   - `Enviar a pendientes`
   - `Resolver sin visita`
4. Si agenda ahora:
   - se crea el evento de agenda;
   - opcionalmente se crea o vincula la orden de trabajo;
   - la solicitud pasa a `agendada`.
5. Si se envia a pendientes:
   - la solicitud queda en `Pendientes por agendar`.
6. Si luego se agenda desde pendientes:
   - se crea el evento;
   - la solicitud pasa a `agendada`.
7. Si el caso se resuelve sin desplazamiento:
   - la solicitud pasa a `resuelta sin visita`.

---

## 11. UX objetivo de Programacion

`Programacion` debe tener tres entradas principales:

- `Pendientes por agendar`
- `Agenda`
- `Solicitud manual`

### 11.1 Pendientes por agendar

Debe concentrar las solicitudes originadas desde:

- CRM;
- Mesa de ayuda;
- Tareas;
- Manual.

Cada fila o tarjeta debe mostrar:

- origen;
- tipo de visita;
- cliente, sede o destinatario;
- prioridad;
- ventana deseada;
- resumen operativo;
- accion primaria `Agendar`.

### 11.2 Agenda

Debe contener solo lo ya comprometido:

- visitas ya programadas;
- reasignaciones;
- reagendamientos;
- supervision operativa.

### 11.3 Solicitud manual

Debe ser visible, pero secundaria.

Su finalidad es:

- contingencia;
- captura telefonica o presencial aun no formalizada;
- visita interna;
- regularizacion de casos.

---

## 12. Lo que Programacion no debe hacer

- no debe crear una instalacion completa;
- no debe crear un ticket completo;
- no debe crear una tarea completa si esa tarea pertenece a otro flujo;
- no debe volver a pedir informacion ya existente en el modulo origen;
- no debe sentirse como una ruta paralela de captura general.

---

## 13. Politica de agendamiento manual

La opcion manual se conserva, pero degradada a flujo excepcional.

### 13.1 Se permite para

- contingencias operativas;
- solicitudes telefonicas o presenciales aun no formalizadas;
- visitas internas;
- regularizacion de casos legacy.

### 13.2 No debe usarse como ruta principal para

- instalaciones de CRM;
- casos de soporte ya formalizados en Mesa de ayuda;
- trabajos ya formalizados en Tareas.

### 13.3 Regla de producto

Si el caso ya tiene modulo owner, debe originarse alla y llegar a `Programacion` como `solicitud de visita`.

---

## 14. Vocabulario recomendado

### 14.1 Terminos visibles sugeridos

- `Pendientes por agendar`
- `Agenda`
- `Solicitud manual`
- `Caso relacionado`
- `Trabajo relacionado`
- `Origen`
- `Tipo de visita`
- `Agendar ahora`
- `Enviar a pendientes`
- `Resolver sin visita`

### 14.2 Terminos visibles a evitar

- `pending visits`
- `work order`
- `WFM`
- `ticketId`
- `taskId`
- `task-first`

---

## 15. Criterios de aceptacion de la decision

1. `Programacion` deja de presentarse como modulo general de captura para instalaciones, tickets o tareas.
2. `CRM`, `Mesa de ayuda` y `Tareas` pueden crear una `solicitud de visita` sin duplicar la captura principal.
3. Todo caso que requiera coordinacion de campo puede elegir entre `Agendar ahora` y `Enviar a pendientes`.
4. La opcion manual permanece disponible, pero como flujo excepcional y no como ruta principal.
5. La UI final distingue claramente entre:
   - caso de origen;
   - solicitud de visita;
   - evento de agenda.
6. `Programacion` conserva el ownership de agenda y supervision sin absorber el ownership del caso de negocio.

---

## 16. Recomendacion final

Se recomienda consolidar el producto sobre este modelo:

- el negocio nace en su modulo;
- la visita nace en una `solicitud de visita`;
- la programacion ocurre en un solo lugar;
- el agendamiento manual existe, pero como excepcion controlada.

Este enfoque reduce duplicacion, aclara ownership y permite que `Pendientes por agendar` se convierta en el embudo unico de coordinacion operativa.
