# Spec — MOD10 Mesa de ayuda · Ticket cerrado en solo lectura

**Versión:** 1.0
**Estado:** Aprobado (G0) por el usuario en sesión el 2026-11-20: «Sí, bloquéalo»; ampliado a toda edición el mismo día: «Sí, bloquea todo»
**Fecha:** 2026-11-20
**Relacionado:** [asignación visible](2026-11-20-mod10-asignacion-visible-ux.md) · [lateral en un panel](2026-11-20-mod10-detalle-ticket-lateral-un-panel-ux.md)

## 1. Hechos

| # | Hecho | Fuente |
|---|---|---|
| H1 | Un ticket cerrado acepta comentarios, adjuntos, reasignación y cambio de área | `comments.service.ts:23`, `assurance.controller.ts:267`, `tickets.service.ts` (`assign`/`update`) |
| H2 | Solo el cambio de estado está protegido: CLOSED y CANCELLED no tienen transiciones de salida | `VALID_TRANSITIONS` |
| H3 | El portal desactiva estado y visita en tickets terminales (`isTerminalTicket`), pero deja el redactor | `AssuranceTicketDetail.tsx` |

## 2. Regla

| Estado | Cualquier escritura humana: comentar (con o sin adjuntos), reasignar, cambiar área, editar asunto, descripción, prioridad, origen o decisión de campo, vincular órdenes y solicitar visita |
|---|---|
| CLOSED, CANCELLED | Rechazado por la API con 409, código y mensaje en español. Sin excepción para notas internas |
| RESOLVED y los demás | Sin cambios |

Lo que escribe el sistema no se bloquea: el aviso de cierre de orden (`AssuranceExecutionOrderNotifierAdapter`), los registros internos del historial y la importación de UISP, que crea tickets ya cerrados con comentarios y adjuntos.

**Portal:**

- En un ticket cerrado o cancelado, el redactor se reemplaza por la línea «Este ticket está cerrado. Si el caso continúa, crea uno nuevo».
- Quien puede crear tickets ve además un botón para crear uno del mismo cliente.
- Responsable y área quedan como dato, sin control, tanto en el detalle como en la fila de la bandeja. No se ofrecen «Cambiar responsable» ni «Asignarme».

## 3. Criterios de aceptación

| # | Criterio |
|---|---|
| CA-1 | Cada operación de §2 sobre un ticket CLOSED y sobre uno CANCELLED responde 409 con su código; una prueba por operación y por estado |
| CA-2 | Sobre RESOLVED las mismas operaciones siguen funcionando |
| CA-3 | El aviso de cierre de orden y la importación de UISP siguen funcionando sobre tickets cerrados |
| CA-4 | El portal no ofrece redactor ni controles de asignación en un ticket cerrado o cancelado, y muestra la línea y el botón de §2 |
| CA-5 | Ninguna E2E existente comenta ni adjunta sobre un ticket cerrado; si alguna lo hace, se ajusta con `test-change-reviewer` |
