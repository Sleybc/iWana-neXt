# MOD12 Compras Workspace Hibrido Design

**Fecha:** 2026-06-25  
**Estado:** Aprobado  
**Modo activo:** Mixto  
**Responsable:** AI-EM-ARCH  
**Aprobado por:** CTO  
**Modulo base:** MOD12 Inventario / SCM  
**Referencias:** `docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md`, `docs/prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md`, `docs/hlds/HLD-MOD12-INVENTARIO-SCM-v1.0.md`

---

## 1. Contexto

El submodulo de Compras ya existe en MOD12 con flujo funcional minimo:

`solicitud -> cotizacion -> aprobacion -> OC -> recepcion`

Sin embargo, la experiencia actual sigue siendo una extension CRUD de Inventario. El portal no ofrece una mesa de compras operativa, la solicitud no maneja lineas propias, la aprobacion no depende de tipo mas monto, el proveedor se captura con referencia tecnica y la cotizacion no resuelve adjudicacion por linea.

La evolucion requerida debe mantenerse dentro de ADR-048:

- Compras sigue dentro de MOD12.
- Proveedores siguen siendo `Party` en MOD08.
- `inventory_items` sigue siendo item master fisico, no catalogo comercial.
- La recepcion sigue siendo la unica puerta que convierte compra en stock, lotes, seriales y ledger.

## 2. Decisiones aprobadas en diseno

1. La UI objetivo sera un **workspace hibrido**:
   - KPIs y bandejas por etapa arriba.
   - Tabla operativa densa abajo.
   - Drawer o panel lateral para trabajar cada solicitud.
2. La entrada de solicitud sera **mixta**:
   - item de inventario existente,
   - sugerencia de reposicion,
   - linea libre no catalogada.
3. Existiran cuatro tipos de solicitud:
   - `REPLENISHMENT`
   - `URGENT_OPERATION`
   - `PROJECT`
   - `FREE_PURCHASE`
4. La aprobacion sera **por tipo + monto**.
5. La cotizacion sera **hibrida**:
   - nace por solicitud,
   - puede adjudicarse por linea cuando haga falta.
6. El proveedor se selecciona desde MOD08 Parties y se muestra una ficha resumida operativa preparada para evolucionar a evaluacion futura.

## 3. Experiencia objetivo

### 3.1 Workspace

La pestaña `Compras` deja de ser un formulario lineal y pasa a tener:

- resumen superior con KPIs:
  - por cotizar,
  - por aprobar,
  - listas para OC,
  - por recibir,
  - urgentes,
  - vencidas;
- filtros rapidos por:
  - tipo de solicitud,
  - estado,
  - prioridad,
  - proveedor,
  - fecha requerida;
- tabla operativa con columnas:
  - numero,
  - tipo,
  - prioridad,
  - solicitante,
  - area,
  - estado global,
  - proveedor sugerido o adjudicado,
  - total estimado,
  - fecha requerida,
  - alertas;
- panel lateral de trabajo con secciones:
  - resumen,
  - lineas,
  - cotizaciones,
  - aprobaciones,
  - ordenes de compra,
  - recepciones,
  - trazabilidad.

### 3.2 Nueva solicitud

La solicitud se modela como cabecera + lineas.

Cabecera minima:

- tipo,
- prioridad,
- area solicitante,
- fecha requerida,
- justificacion,
- referencia operativa opcional.

Linea minima:

- origen de linea: item, sugerencia o libre,
- item o descripcion libre,
- cantidad,
- unidad,
- observaciones,
- proveedor sugerido opcional,
- estado de abastecimiento.

## 4. Modelo funcional

### 4.1 Agregados nuevos o refinados

- `purchase_requests`
  - extiende la cabecera actual con tipo, prioridad, area y justificacion estructurada.
- `purchase_request_lines`
  - modela cada necesidad abastecible de forma independiente.
- `supplier_quotes`
  - se mantiene como cabecera de oferta por solicitud.
- `purchase_request_line_awards`
  - registra adjudicacion por linea y deja preparada la generacion de una o varias OCs.
- `purchase_orders`
  - pueden derivar desde una solicitud parcial o total.
- `purchase_order_lines`
  - deben conservar referencia a la linea origen.

### 4.2 Flujo objetivo

1. Se crea una solicitud con tipo y una o mas lineas.
2. El sistema clasifica la politica aplicable por tipo + monto.
3. Se registran cotizaciones por solicitud.
4. El usuario adjudica una o varias lineas.
5. Se genera una o varias OCs.
6. La recepcion puede ser parcial y debe reflejar faltantes o danados.
7. La linea se cierra cuando queda recibida, cancelada o descartada con justificacion.

## 5. Reglas de negocio

### 5.1 Politica de cotizacion

- `REPLENISHMENT`: exige cotizacion por defecto.
- `URGENT_OPERATION`: puede saltar cotizacion con excepcion justificada.
- `PROJECT`: admite cotizacion y adjudicacion parcial por linea.
- `FREE_PURCHASE`: admite linea libre, pero exige mayor justificacion y control.

### 5.2 Aprobacion

- La aprobacion no depende solo del monto.
- La politica se evalua con:
  - tipo,
  - monto estimado,
  - presencia o ausencia de cotizacion,
  - excepcion declarada.
- Toda excepcion debe conservar:
  - motivo,
  - actor aprobador,
  - timestamp,
  - comentario auditable.

### 5.3 Recepcion

- La recepcion ya no puede tratar `status` como decorativo.
- Debe reflejar al menos:
  - completa,
  - parcial,
  - con faltantes,
  - con danados,
  - rechazada.
- Solo cantidades realmente recibidas deben impactar stock y ledger.

## 6. Boundaries y restricciones

- No crear un bounded context separado para Compras en esta fase.
- No duplicar maestro de proveedores dentro de MOD12.
- No fusionar catalogo comercial con item master fisico.
- No crear FKs cross-module.
- No permitir movimientos de stock por fuera del ledger al recibir mercancia.
- No incluir portal proveedor, scoring avanzado ni contratos marco en esta iteracion.

## 7. Impacto tecnico esperado

### Backend

- Nuevos enums de compras para tipo, prioridad y estado de linea.
- Nuevas tablas tenant-aware para lineas de solicitud y adjudicaciones.
- Endpoints de detalle, filtros, creacion con lineas, adjudicacion y aprobacion con excepciones.
- Puerto de lectura para resumen de proveedor desde MOD08.

### Frontend

- Reemplazo de `PurchaseDesk.tsx` por una composicion de workspace.
- Tabla densa y panel lateral con acciones contextuales por estado.
- Selector real de proveedor y ficha resumida.
- Mejor feedback contextual y gating por estado.

### Testing

- TDD sobre tipos de solicitud, adjudicacion, excepciones y recepciones parciales.
- Tests de UX sobre filtros, estados, drawer de trabajo y validaciones.
- E2E focalizado en:
  - reposicion,
  - urgente con excepcion,
  - proyecto con multiples lineas,
  - recepcion parcial.

## 8. Fases recomendadas

### Fase 1.5

- workspace hibrido,
- solicitud con lineas,
- tipos de solicitud,
- politica por tipo + monto,
- proveedor desde Parties,
- cotizacion hibrida preparada para crecer.

### Fase 2

- adjudicacion completa por linea,
- multiples OCs por solicitud,
- recepcion con faltantes y danados,
- cierre por linea.

### Fase 3

- scoring basico de proveedor,
- historial de cumplimiento,
- recomendaciones de compra mas inteligentes.

### Fase visual (UI alignment)

- Spec aprobado: `docs/specs/SPEC-MOD12-COMPRAS-UI-ALIGNMENT-v1.0.md`
- Plan Fase A: `docs/plans/2026-06-25-mod12-compras-ui-alignment-fase-a.md`
- Checklist: `docs/quality/CHECKLIST-MOD12-COMPRAS-UI-ALIGNMENT-v1.0.md`

## 9. Decision arquitectonica

**Recomendacion:** aprobar la evolucion de Compras como submodulo enriquecido de MOD12 sin crear nuevo BC y sin emitir ADR nuevo.

**Justificacion:** el refinamiento permanece dentro de ADR-048, no rompe boundaries ni cambia stack, pero si exige PRD, HLD, plan y prompt propios para ejecucion ordenada por fullstack.
