# Diseño — Corrección del CTA de coordinación de visita CRM

**Versión:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-07-27  
**Módulo:** CRM → Programación (WFM)  
**Trazabilidad:** `docs/prds/PRD-MOD09-PROGRAMACION-WFM-v1.0.md` (CU-WFM-08, CA-WFM-21) · `docs/specs/2026-06-23-programacion-solicitud-visita-unificada-design.md`

---

## Objetivo

Hacer que cada CTA visible `Coordinar visita de instalación` en el detalle de un expediente elegible cree o recupere la solicitud de visita CRM y abra la agenda de Programación con esa solicitud seleccionada.

## Problema confirmado

Los dos CTA actuales navegan a la misma ruta del expediente con el ancla `#programacion`. Esa navegación no ejecuta la orquestación existente ni emite solicitudes a Aseguramiento o WFM. Si el expediente no cumple la elegibilidad, el ancla ni siquiera existe y la acción parece inerte.

## Diseño aprobado para implementación

1. El detalle CRM tendrá un único manejador para los dos CTA. Al activarse, invocará `createCrmVisitRequestAndRoute` con el expediente, cliente, municipio, dirección y coordenadas disponibles, y con `nextAction: 'schedule-now'`.
2. La orquestación existente conservará su responsabilidad: asegurar el ticket de instalación, crear o reutilizar de manera idempotente la solicitud de visita y devolver la URL de agenda con `visitRequestId`.
3. El detalle redirigirá a la URL devuelta (`/dashboard/scheduling/agenda?source=pending-visits&visitRequestId=…`). La asignación de técnico y franja seguirá ocurriendo en Programación; el CTA no puede confirmar una agenda sin esos datos.
4. Ambos CTA se deshabilitarán mientras la operación esté en curso y cuando el expediente no esté habilitado para instalación. El estado de preparación ya visible explicará los requisitos pendientes. Si la orquestación falla, se mostrará el error en el feedback operativo de la vista.
5. La sección existente `Coordinación de visita` conserva las dos salidas explícitas: `Agendar ahora` y `Enviar a pendientes`. El cambio no elimina ni duplica ese flujo.

## Límites

- No se modifica el contrato HTTP, OpenAPI, modelo de datos ni migraciones.
- No se amplían permisos: la alineación del endpoint de Aseguramiento para el rol `SALES` queda fuera de este corte.
- No se rediseñan componentes ni textos visibles fuera del feedback de error ya previsto por la pantalla.

## Pruebas y evidencia

- Prueba de regresión de `page.spec.tsx`: un expediente listo, al activar el CTA, invoca la orquestación con `nextAction: 'schedule-now'` y navega a la URL de agenda, no a `#programacion`.
- Prueba de estado: el CTA queda inhabilitado mientras coordina y cuando falta elegibilidad.
- Se actualiza o elimina la prueba que actualmente fija la URL con ancla.
- E2E del origen CRM: valida las solicitudes de ticket y visita, y la navegación a la agenda. La confirmación final de técnico/franja permanece cubierta por el E2E WFM existente.

## Criterios de aceptación

1. Ningún CTA `Coordinar visita de instalación` usa una URL con `#programacion`.
2. Desde un expediente elegible, cada CTA crea o reutiliza la solicitud CRM y abre Programación con su identificador.
3. Un doble clic no crea solicitudes duplicadas.
4. La pantalla informa un fallo de orquestación sin ocultarlo ni navegar a un destino inválido.
5. Las pruebas focalizadas de portal y la evidencia E2E demuestran la regresión corregida.
