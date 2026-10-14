# Informe Q4 — Spec UX de privacidad · Fase 1

**Fecha:** 2026-10-14  
**Versión:** 1.0  
**Estado:** **[BLOQUEO] — Q4 detenido; spec no emitida ni ratificable**  
**Responsable:** AI-PROD-UX  
**Contrato de referencia:** C-PRIV-API v1.0

## Resultado

Q4 se detuvo antes de redactar una spec parcial. La radicación y varios recorridos de privacidad requieren datos que C-PRIV-API v1.0 no define. Inventarlos aquí rompería el contrato congelado. La ratificación de AI-EM-ARCH queda pendiente de resolver estos bloqueos y relanzar Q4.

La ruta `docs/specs/2026-10-14-privacy-fase-1-ux-spec.md` quedó libre; este informe es el único archivo creado por Q4. No se modificó código, tokens, contratos, otras rutas ni el alcance de Fase 04 de suscriptores.

## Bloqueos P1

| ID | Falta contractual | Efecto en el diseño | Fuente |
| --- | --- | --- | --- |
| Q4-BL-01 | C-PRIV-API pide «solicitante y su evidencia», pero no fija los campos de identidad, la referencia de evidencia ni su mecanismo de captura/consulta. La tabla `data_subject_requests` solo enumera `requester_kind` y `requester_document_hmac`. | No se puede diseñar ni validar la radicación de CONSULTA, RECLAMO o SUPLANTACIÓN ni mostrar al operador qué evidencia quedó verificada. | [Prompt, C-PRIV-DDL y C-PRIV-API](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.0.md#2-contratos-congelados), [ADR-094, D3](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md#d3-solicitudes-del-titular-con-reloj-legal) |
| Q4-BL-02 | R5 exige registrar la tarea manual de suspensión del cobro con fecha, pero ni la fila de `data_subject_requests` ni el DTO/respuesta de C-PRIV-API exponen tarea, fecha o estado de esa gestión. La respuesta tampoco define qué contratos quedaron suspendidos. | No se puede diseñar la confirmación visible de la suspensión ni el seguimiento de la tarea externa sin inferir un estado o una fecha. | [Prompt, C-PRIV-DDL y R5](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.0.md#2-contratos-congelados), [ADR-094, D4](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md#d4-marcas-sobre-el-titular) |
| Q4-BL-03 | ADR-094 registra 20 días hábiles para que la persona denuncie, pero señala que no está definido desde cuándo corren. C-PRIV-API y el modelo de solicitud tampoco exponen fecha de inicio o fecha límite de denuncia. | No se puede presentar una fecha límite fiable ni un recordatorio de este plazo en la pantalla de suplantación. | [ADR-094, H6](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md#1-verificación-del-insumo), [Prompt, R5](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.0.md#2-contratos-congelados) |
| Q4-BL-04 | La revocación se define por finalidad en ADR-094 D2; el DTO de autorización tiene `purpose`, pero la solicitud del titular solo documenta `right`. No hay campo para identificar la finalidad objeto de revocación. | No se puede especificar la radicación ni la decisión sobre qué autorización debe revocarse. | [ADR-094, D2 y D3](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md#d2-autorizaciones-por-finalidad-de-solo-anexar), [Prompt, C-PRIV-API](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.0.md#c-priv-api-v10--rest-y-dtos-zod-en-iwanasharedpackages-sharedsrcschemasprivacy) |
| Q4-BL-05 | La API enumera las acciones `require-info`, `complete` y `transfer`, pero no fija sus cuerpos; `responseChannel` tampoco publica valores permitidos. El contenido exacto que debe acompañar el requerimiento de información o el traslado queda sin contrato. | No se pueden cerrar formularios, validaciones ni plantillas accionables para las seis transiciones. | [Prompt, C-PRIV-API y R6](../prompts/PROMPT-PRIVACY-HABEAS-DATA-FASE-1-v1.0.md#c-priv-api-v10--rest-y-dtos-zod-en-iwanasharedsrcschemasprivacy) |

## Deuda nueva P2

| ID | Falta | Efecto |
| --- | --- | --- |
| Q4-D-01 | `GET /privacy/inventory` describe el propósito del inventario, pero no tiene schema de respuesta en los DTOs publicados de `packages/shared/src/schemas/privacy/`. | No es posible definir filas, agrupación o contenido accesible del inventario para el registro del ISP. |
| Q4-D-02 | El esquema de incidentes devuelve `reportedAt`, pero C-PRIV-API solo publica POST y GET; no hay acción/contrato para registrar que el reporte externo ya se envió. | La UI puede mostrar el dato si el servidor lo entrega, pero no puede ofrecer una actualización de seguimiento en esta fase. No se diseñará una acción que la API no soporta. |

## Validación documental — conteo real

| Comprobación | Resultado |
| --- | ---: |
| Fuentes de Q4 leídas: `AGENTS.md`, bootstrap, ADR-094, plan Fase 1, prompt Fase 1, spec existente del 360° y dirección visual Firma iWana | **7/7** |
| Skills obligatorias leídas: `iwana-identity-ui-review`, `system-vocabulary-review`, `docs-architect` | **3/3** |
| Acciones método-ruta en la tabla C-PRIV-API revisadas | **20** |
| Módulos Zod compartidos de privacidad publicados y revisados | **5** |
| Rutas libres al iniciar: spec Q4 e informe Q4 | **2/2** |
| Rutas libres al cerrar: spec Q4; informe Q4 creado por esta sesión | **1/1** |
| Criterios `CA-UX-PRIV-nn` emitidos | **0** — bloqueado; no se emitió una spec parcial |

La búsqueda de PRD/HLD específicos de `privacy` no encontró artefactos con ese nombre; para Q4 se aplicaron ADR-094, plan y prompt congelado, además de la spec 360° vigente. No se ejecutaron pruebas de código porque Q4 es una definición UX documental y se detuvo antes de producirla.

## Deuda y siguiente paso

**Deuda nueva:** 5 bloqueos P1 y 2 brechas P2, todos originados por el contrato incompleto respecto a los recorridos solicitados. No se creó deuda visual ni deuda de implementación.

AI-EM-ARCH debe resolver los campos ausentes con Q3 y ratificar cualquier ajuste del contrato por el proceso de versionado. Después, relanzar Q4 contra la versión ratificada; no implementar la Fase 1 de portal hasta contar con la spec aprobada.
