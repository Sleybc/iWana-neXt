# PRD - MOD12 Compras Workspace Hibrido

**Version:** 1.0  
**Fecha:** 2026-06-25  
**Estado:** Aprobado  
**Modo activo:** Mixto  
**Responsable:** AI-EM-ARCH  
**Aprobado por:** CTO  
**Modulo:** MOD12 Inventario / SCM  
**Submodulo:** Compras

---

## 1. Contexto y motivacion

MOD12 ya cubre compras basicas dentro del flujo de inventario, pero la experiencia actual sigue siendo demasiado manual para un equipo de abastecimiento real. La solicitud es liviana, no hay lineas propias, la aprobacion no depende de tipo mas monto, el proveedor se captura con referencia tecnica y la cotizacion no soporta adjudicacion flexible.

El objetivo de este PRD es convertir Compras en una mesa operativa usable sin salir de MOD12 ni romper ADR-048.

## 2. Alcance

### En scope

- Workspace hibrido de compras dentro de la pestaña `Compras` de MOD12.
- Solicitudes con cabecera y lineas.
- Tipos de solicitud:
  - reposicion,
  - urgente operativa,
  - proyecto / instalacion / expansion,
  - compra libre / administrativa.
- Politica de aprobacion por tipo + monto.
- Cotizacion por solicitud con adjudicacion preparada para resolucion por linea.
- Selector de proveedor desde MOD08 Parties con ficha resumida.
- Recepciones parciales con faltantes y danados reflejados en flujo.

### Fuera de scope

- Portal proveedor.
- Scoring avanzado de proveedores.
- Contratos marco de compras.
- ERP externo real.
- Catalogo comercial como origen principal de lineas.
- Contabilidad o facturacion.

## 3. Personas y casos de uso

| Persona | Rol operativo | Necesidad principal |
| --- | --- | --- |
| Responsable de compras | Compras | Gestionar bandeja, cotizaciones, adjudicaciones y OCs |
| Gerente / administrador | ADMIN | Aprobar por politica y revisar excepciones |
| Almacenista | Bodega | Recibir parcialmente, registrar novedades y cerrar abastecimiento |
| Supervisor operativo | Operaciones | Solicitar urgencias y proyectos con trazabilidad |
| Auditor | Auditoria | Revisar decisiones, excepciones y recepciones |

| CU | Actor | Descripcion |
| --- | --- | --- |
| CU-CMP-01 | Compras | Crear solicitud con una o mas lineas |
| CU-CMP-02 | Compras | Registrar cotizaciones por solicitud |
| CU-CMP-03 | Compras | Adjudicar proveedor por solicitud o por linea |
| CU-CMP-04 | Gerente | Aprobar por tipo + monto o autorizar excepcion |
| CU-CMP-05 | Compras | Generar una o varias OCs desde lineas adjudicadas |
| CU-CMP-06 | Almacenista | Registrar recepcion total o parcial con faltantes o danados |
| CU-CMP-07 | Auditor | Ver trazabilidad completa de la solicitud hasta la recepcion |

## 4. Requerimientos funcionales

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-CMP-01 | Exponer workspace hibrido con KPIs, bandejas, tabla densa y panel lateral de trabajo. | MVP |
| RF-CMP-02 | Crear solicitud con tipo, prioridad, area, fecha requerida, justificacion y referencia operativa opcional. | MVP |
| RF-CMP-03 | Permitir lineas de solicitud desde item de inventario, sugerencia de reposicion o texto libre. | MVP |
| RF-CMP-04 | Mantener estado individual por linea de solicitud. | MVP |
| RF-CMP-05 | Registrar cotizaciones por solicitud con proveedor, vigencia, monto y condiciones. | MVP |
| RF-CMP-06 | Permitir adjudicacion total o parcial por linea sin romper el flujo por solicitud. | MVP |
| RF-CMP-07 | Aplicar aprobacion por tipo + monto con excepcion justificada y auditada. | MVP |
| RF-CMP-08 | Generar una o varias ordenes de compra desde lineas adjudicadas. | MVP |
| RF-CMP-09 | Mostrar proveedor mediante selector desde Parties y ficha resumida operativa. | MVP |
| RF-CMP-10 | Registrar recepcion completa o parcial con faltantes o danados. | MVP |
| RF-CMP-11 | Actualizar stock, lotes, seriales y ledger solo con cantidades efectivamente recibidas. | MVP |
| RF-CMP-12 | Exponer trazabilidad desde solicitud hasta recepcion por cabecera y por linea. | MVP |
| RF-CMP-13 | Preparar estructura de proveedor para evolucion futura a evaluacion y scoring. | Fase 2 |

### Adenda 2026-09-11 — eje de selección de RF-CMP-06 y RF-CMP-08 (Fase 30)

Esta adenda **precisa** dos requisitos aprobados; no los modifica ni amplía su alcance. Emitida por
AI-EM-ARCH tras la decisión del CTO del 2026-09-11.

**Eje de la adjudicación.** RF-CMP-06 dice *qué* debe ser posible (adjudicación total o parcial por
línea) pero no fija *cómo* se selecciona. La Fase 20 lo implementó con eje **línea → cotización**: una
tarjeta por línea de solicitud y, dentro, la elección de proveedor. La operación real del comprador
recorre el camino inverso —revisa una cotización y decide qué productos de ella le sirven—, de modo
que el eje canónico pasa a ser **cotización → productos**, resuelto como matriz productos ×
cotizaciones. Ver [SPEC Fase 30](../specs/2026-09-11-mod12-compras-adjudicacion-matriz-design.md).

**Un producto, un proveedor.** Decisión del CTO del 2026-09-11: dentro de una solicitud, cada producto
se adjudica íntegro a un solo proveedor; lo que se reparte entre proveedores son productos distintos.
La regla de parcialidad de **cantidad** de RF-06-01 del PRD de cierre de flujo —solo las solicitudes de
tipo `PROJECT` admiten repartir la cantidad de una misma línea— **se mantiene intacta**.

**La solicitud sobrevive a la conversión parcial.** RF-CMP-08 («generar una o varias órdenes de compra
desde líneas adjudicadas») se precisa así: emitir órdenes para parte de las líneas **no** cierra la
solicitud. Permanece en `APPROVED` y admite tandas posteriores hasta que toda línea viva esté ordenada.
El eje de cobertura que lo expone es derivado, no persistido —
[ADR-087 (aprobado)](../adrs/ADR-087-Cobertura-Adjudicacion-Derivada-Compras.md), G1 GO del CTO el 2026-09-11 (opción 1).

## 5. Requerimientos no funcionales

| ID | Requerimiento | Criterio |
| --- | --- | --- |
| RNF-CMP-01 | Multi-tenancy | Todo dato vive en schema tenant. |
| RNF-CMP-02 | Boundaries | Proveedores por referencia logica; sin copiar maestro de MOD08. |
| RNF-CMP-03 | Integridad | Solicitud, lineas, adjudicacion y recepcion deben preservar consistencia transaccional. |
| RNF-CMP-04 | Seguridad | JWT, RBAC, Zod, audit trail y excepciones auditadas. |
| RNF-CMP-05 | UX operativa | La vista principal debe priorizar filtros, estados y acciones contextuales. |
| RNF-CMP-06 | Observabilidad | Logs y eventos sin PII, con ids de solicitud, linea, proveedor y actor. |
| RNF-CMP-07 | Evolucion | El modelo debe permitir scoring futuro sin cambiar ownership de proveedor. |

## 6. Modelo de datos borrador

### `purchase_requests`

Agregar o asegurar:

- `request_type`
- `priority`
- `requesting_area`
- `justification`
- `operational_ref_type`
- `operational_ref_id`
- `exception_reason`
- `approved_by_user_id`

### `purchase_request_lines`

Campos minimos:

- `id`
- `tenant_id`
- `purchase_request_id`
- `source_kind`: `INVENTORY_ITEM`, `REPLENISHMENT_SUGGESTION`, `FREE_TEXT`
- `inventory_item_id` nullable
- `free_text_description` nullable
- `quantity_requested`
- `unit_of_measure`
- `suggested_party_ref_id` nullable
- `line_status`
- `notes`

### `purchase_request_line_awards`

Campos minimos:

- `id`
- `tenant_id`
- `purchase_request_line_id`
- `supplier_quote_id` nullable
- `awarded_party_ref_id`
- `awarded_quantity`
- `award_notes`

### `purchase_order_lines`

Agregar referencia a `purchase_request_line_id`.

## 7. Contratos de API borrador

### Nuevos o refinados endpoints

| Metodo | Ruta | Proposito |
| --- | --- | --- |
| GET | `/purchasing/requests` | Listar solicitudes con filtros de workspace |
| GET | `/purchasing/requests/:id` | Obtener detalle completo con lineas, cotizaciones y awards |
| POST | `/purchasing/requests` | Crear solicitud con lineas |
| POST | `/purchasing/requests/:id/quotes` | Registrar cotizacion |
| POST | `/purchasing/requests/:id/approve` | Aprobar o autorizar excepcion |
| POST | `/purchasing/requests/:id/awards` | Registrar adjudicacion por linea |
| POST | `/purchasing/orders` | Crear una o varias OCs desde lineas adjudicadas |
| POST | `/purchasing/orders/:id/receipts` | Registrar recepcion con novedades |
| GET | `/purchasing/providers/:partyRefId/summary` | Obtener ficha resumida del proveedor |

## 8. Criterios de aceptacion

1. Un usuario autorizado puede crear una solicitud con tipo, prioridad y una o mas lineas.
2. Una solicitud puede mezclar lineas de inventario, sugerencias y texto libre.
3. El workspace muestra KPIs, bandejas y acciones contextuales por estado.
4. La politica de aprobacion depende de tipo + monto.
5. Una urgencia puede saltar cotizacion solo con excepcion justificada y auditada.
6. El proveedor se selecciona desde Parties y muestra ficha resumida.
7. Una solicitud puede generar una o varias OCs.
8. La recepcion parcial no ingresa stock por cantidades no recibidas.
9. Faltantes y danados quedan reflejados en la trazabilidad.
10. Ningun cambio rompe ADR-048 ni crea FKs cross-module.

## 9. Dependencias y riesgos

| Dependencia / riesgo | Impacto | Mitigacion |
| --- | --- | --- |
| Resumen de proveedor desde MOD08 | Medio | Puerto tipado y fallback controlado |
| Politica tipo + monto poco definida | Alto | Parametrizar reglas minimas y defaults claros |
| Recepcion parcial mal modelada | Alto | Persistir estados por linea y actualizar stock solo por recibido |
| Mezcla con catalogo comercial | Medio | Mantener productos comerciales fuera del alta principal de lineas |
| Crecimiento excesivo de Compras | Medio | Dejar scoring, contratos marco y portal proveedor fuera de alcance |

## 10. Definition of Done

- PRD, HLD, plan, prompt y checklist generados.
- Backend con tablas, DTOs, endpoints y reglas basicas operativas.
- Frontend con workspace hibrido usable.
- Tests unitarios, integracion, frontend y E2E enfocados en Compras.
- Sin violaciones de boundary ni duplicacion de proveedor.
- Informe de fase actualizado con comandos y resultados.
