# Informe — MOD05 Suscriptores · Remediación B4: mapa campo × rol

**Versión:** 1.0  
**Fecha:** 2026-10-12  
**Estado:** Entregado — **ratificado con cambios por AI-EM-ARCH el 2026-10-12** (spec §6). La aplicación pasó a B2 (B6 absorbido). Lo que sigue es el registro original de la entrega  
**Responsable:** `prod-ux`  
**Plan:** [Remediación de cumplimiento MOD05/MOD08](../plans/2026-10-11-mod05-subscribers-remediacion-cumplimiento.md), bloque B4  
**Prompt:** [Remediación MOD05/MOD08 v1.0](../prompts/PROMPT-MOD05-SUBSCRIBERS-REMEDIACION-v1.0.md) §3 B4

## 1. Entregables

| Ruta | Resultado |
| --- | --- |
| [`docs/specs/2026-10-11-mod05-subscriber-list-field-role-map.md`](../specs/2026-10-11-mod05-subscriber-list-field-role-map.md) | Matriz propuesta para los siete roles, justificación por caso de uso, decisión de mostrar documento por rol y tensión documental que debe resolver AI-EM-ARCH. |

## 2. Evidencia y decisiones

- Se trasladaron sin ampliar las diez claves y finalidades de `SUBSCRIBER_LIST_FIELD_PURPOSE` del informe de auditoría §6.3.
- Se contrastaron las personas y los casos de uso del PRD Subscriber Fase 04 §4, sus requisitos de mapa, contacto, tickets y equipos (§§5.2, 5.4–5.7), el alcance aún vigente de Fase 03 y los roles del PRD maestro §§4.2 y 13.3.
- La propuesta limita los datos personales por tarea: contacto e identificación para SUPPORT, ubicación y coordinación de instalación para TECHNICIAN, y `documentNumber` para conciliación de cartera de ACCOUNTANT. Para ADMIN, NOC, SALES y AUDITOR no se identificó necesidad de esos diez campos personales en el listado.
- La decisión de documento es **mostrarlo solo para SUPPORT y ACCOUNTANT**, sin enmascaramiento parcial, tal como exige el uso autorizado por ADR-067 §2 y la decisión de §Consecuencias / Fuera de alcance.
- La matriz no otorga permisos. Se deja explícita para ratificación la diferencia entre la petición actual de siete roles (plan/prompt B4 y ADR-083 §D3 para TECHNICIAN/AUDITOR) y el límite de cinco roles registrado en PRD Fase 04 §6.1 RNF-S404-02 y §9.4 D3.
- La auditoría y el prompt citan que el listado aún no muestra documento en `SubscribersListClient.tsx:516`; al inspeccionar el workspace compartido durante esta ejecución, esa zona ya contiene `formatDocumentDisplay(subscriber)` en el diff no confirmado de B3. No edité el archivo de B3; esta evidencia de estado no ratifica la matriz.
- No se ejecutaron pruebas: el entregable B4 es documental y no cambia código.

## 3. Ratificación y cierre

**Propuesta entregada; AI-EM-ARCH no ha ratificado ni aprobado esta spec dentro de este bloque.** La aplicación del mapa pertenece al bloque B6 después de la ratificación. La definición no emitió `[BLOQUEO]`: ningún rol necesita aquí un campo fuera de la finalidad congelada; los campos no justificados se omitieron.

## 4. Deuda nueva por severidad

| Severidad | Deuda nueva introducida por B4 |
| --- | --- |
| Crítica | Ninguna. |
| Alta | Ninguna. |
| Media | Ninguna. |
| Baja | Ninguna. |

La tensión ya existente entre el alcance de cinco roles del PRD Fase 04 y la solicitud vigente de mapear siete se registra como pendiente de ratificación, no como deuda introducida por B4. La implementación posterior del mapa corresponde al B6 previsto en el plan.
