# PRD — MOD12 Inventario / Submódulo Activos y comodato

**Version:** 1.0
**Estado:** ✅ **Aprobado / MVP cerrado** (G7 CTO GO 2026-07-21)
**Fecha:** 2026-07-21
**Modo activo:** Product Architect + Orchestrator
**Autor:** AI-EM-ARCH
**Clasificacion:** Confidencial — Uso interno
**PRD padre:** [PRD-MOD12-INVENTARIO-SCM-v1.0.md](PRD-MOD12-INVENTARIO-SCM-v1.0.md)
**ADR relacionado:** [ADR-048](../adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md) — **no se requiere ADR nuevo** (ver §9)
**Auditoría de origen:** [INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md](../informes/INFORME-MOD12-INVENTARIO-AUDITORIA-ESTADO-v1.0.md) (hallazgos H1 y H2)
**Spec de diseño:** [2026-07-21-mod12-activos-ficha360-comodato-fase05-design.md](../specs/2026-07-21-mod12-activos-ficha360-comodato-fase05-design.md)

---

## 1. Contexto y motivacion

El PRD padre define el valor de MOD12 en cuatro preguntas (§1): *dónde está, quién lo tiene, qué cliente lo usa en comodato, cuánto tiempo de vida útil queda*. La auditoría del 2026-07-21 verificó contra código que el sistema **no puede responder ninguna con una sola consulta**, pese a que toda la materia prima ya está escrita:

- `asset_lifecycle_events` **se escribe** en cada transición (recepción, transferencia, instalación, retorno, baja) y **nadie la lee**: `AssetLifecycleService.listForAsset` no tiene consumidor.
- El ledger registra cada movimiento con `serializedAssetId` en la línea, pero el kardex solo se puede filtrar por ítem y bodega — no por activo.
- `serialized_assets` guarda `purchaseOrderRef`, `purchaseDate`, `usefulLifeMonths`, `warrantyUntil` y `subscriberRefId`, y `GET /inventory/assets/:id` devuelve la fila cruda: sin historia, sin origen de compra legible, sin comodatos.
- `asset_loan_assignments` existe como tabla (migración 047) y como entidad registrada en `InventoryModule`, pero **ningún servicio la escribe ni la lee**. El comodato solo deja rastro lateral: la instalación desde OT pone `subscriberRefId` en el activo y lo ubica en `CUSTOMER_SITE`. Al retirar el equipo ese rastro se pisa, y no queda historia de qué cliente tuvo qué equipo, desde cuándo, ni bajo qué contrato. `contractRefId` nunca se escribe.

La brecha, igual que en Existencias, **no es de modelo sino de consulta y de cierre de ciclo**. Este PRD define el submódulo Activos y comodato en dos fases.

## 2. Alcance

### Declaración de arranque

> **Fase siguiente: MOD12 Fase 5A — Ficha 360 del activo.**
> Prompt: [`PROMPT-MOD12-ACTIVOS-FICHA-360-FASE-05A-v1.0.md`](../prompts/PROMPT-MOD12-ACTIVOS-FICHA-360-FASE-05A-v1.0.md) — **EJECUTABLE** al aprobar este PRD.
> Agentes: AI-SR-FULL (backend, líder) + AI-FE-PLATFORM (portal).
> Fase 5B (comodato) queda **NO EJECUTABLE** hasta cierre G7 de 5A (ADR-016).
> Sin ADR pendiente: ninguna de las dos fases crea bounded context, entidad ni migración.

### Roadmap del submódulo

| Fase | Alcance | Estado |
| --- | --- | --- |
| **5A — Ficha 360 del activo** | `GET /inventory/assets/:id` pasa a devolver un registro compuesto: activo + custodio actual + origen de compra + timeline de ciclo de vida + movimientos del ledger que tocan el activo + comodatos. Filtro `serializedAssetId` en el kardex. Drawer del portal reconstruido por secciones. **Solo lectura, aditivo.** | **Ejecutable** |
| **5B — Comodato con ciclo de vida** | Escribir `asset_loan_assignments` al instalar en cliente desde OT y cerrarlo (`removed_at`) al retornar o dar de baja; `GET /inventory/loans` con filtros; bandeja de comodatos en portal; el comodato aparece como sección viva de la ficha 360. | No ejecutable hasta G7 de 5A |

### En scope Fase 5A

- Composición de lectura del detalle de activo serializado, en una sola llamada.
- Consumo de `AssetLifecycleService.listForAsset` (hoy sin consumidor) como timeline legible en español.
- Filtro por activo en el kardex (`GET /inventory/movements?serializedAssetId=`), reutilizando el patrón de subconsulta por línea ya usado para `itemId` / `locationId`.
- Origen de compra legible: OC, fecha de compra y proveedor por **referencia opaca** más etiqueta ya disponible en el módulo (perfil de proveedor), sin lecturas cruzadas a Parties fuera de puerto.
- Vida útil y garantía presentadas como estado derivado (vigente / por vencer / vencida), **sin alertas ni jobs** — eso es H4 y su propia fase.
- Reconstrucción del `SerializedAssetDetailDrawer` por secciones, con la sección Comodato presente y vacía («Sin comodatos registrados») para que 5B solo la alimente.

### Fuera de scope Fase 5A

- Escritura de comodatos (Fase 5B).
- Alertas de vida útil, umbrales, jobs BullMQ y evento `StockLow` (hallazgo H4, fase propia).
- Documento y aprobación de bajas (hallazgo H3, fase propia).
- Resolución del nombre del suscriptor, técnico o contrato (boundary CRM/WFM — criterio ya fijado para RF-INV-21).
- Rediseño de las pestañas legacy Movimientos y Bajas (hallazgo H5).
- Exportables, depreciación contable y app móvil.

## 3. Personas y casos de uso

| Persona | Rol | Necesidad |
| --- | --- | --- |
| Soporte / NOC | SUPPORT / NOC | Ante una falla, abrir el equipo por serial o MAC y ver de una sola vez dónde está, quién lo tiene, desde cuándo y qué le pasó |
| Almacenista | ADMIN | Al recibir un retorno, ver la historia del equipo antes de clasificarlo (refurbish / reparación / baja) |
| Gerente / auditor | ADMIN | Reconstruir la trazabilidad completa de un activo: qué se compró, a quién, cuánto costó, dónde estuvo y en qué terminó |
| Operaciones | ADMIN / NOC | (5B) Saber qué equipos están en poder de clientes y cuáles deben recuperarse |

| CU | Actor | Descripción |
| --- | --- | --- |
| CU-ACT-01 | Soporte | Buscar un activo por serial/MAC y abrir su ficha 360 |
| CU-ACT-02 | Auditor | Recorrer el timeline de ciclo de vida de un activo y saltar al movimiento de ledger que lo originó |
| CU-ACT-03 | Almacenista | Ver el origen de compra del activo (OC, fecha, proveedor) desde la ficha |
| CU-ACT-04 | Operaciones | (5B) Listar comodatos abiertos y filtrarlos por suscriptor o contrato |
| CU-ACT-05 | Operaciones | (5B) Ver el comodato cerrarse automáticamente cuando el equipo retorna |

## 4. Requerimientos funcionales

| ID | Requerimiento | Fase | Prioridad |
| --- | --- | --- | --- |
| RF-ACT-01 | `GET /inventory/assets/:id` devuelve un registro compuesto con activo, custodio actual, origen de compra, ciclo de vida, movimientos y comodatos. | 5A | MVP |
| RF-ACT-02 | El timeline de ciclo de vida se presenta en orden cronológico descendente, con etiqueta en español por tipo de evento, transición de estado, ubicación y actor. | 5A | MVP |
| RF-ACT-03 | Los movimientos del activo se consultan paginados y se pueden filtrar desde el kardex por `serializedAssetId`. | 5A | MVP |
| RF-ACT-04 | La ficha muestra el origen de compra: número de OC, fecha de compra, costo de recepción y proveedor por referencia con etiqueta. | 5A | MVP |
| RF-ACT-05 | La ficha muestra vida útil y garantía como estado derivado (vigente / por vencer / vencida / sin dato), sin generar alertas. | 5A | MVP |
| RF-ACT-06 | La ficha muestra el custodio actual: tipo de responsable, ubicación y, cuando el activo está en cliente, la referencia de suscriptor — nunca datos personales. | 5A | MVP |
| RF-ACT-07 | Un activo sin historia (recién creado) muestra estados vacíos explicativos, no errores ni secciones en blanco. | 5A | MVP |
| RF-ACT-08 | La instalación en cliente desde OT crea un registro de comodato con suscriptor, contrato (si viene), fecha de instalación, OT y movimiento de origen, en la misma transacción del ledger. | 5B | MVP |
| RF-ACT-09 | El retorno o la baja de un activo en comodato cierra el comodato abierto (`removed_at`) en la misma transacción. | 5B | MVP |
| RF-ACT-10 | `GET /inventory/loans` lista comodatos con filtros por estado (abierto/cerrado), suscriptor, contrato y activo, paginado. | 5B | MVP |
| RF-ACT-11 | La creación y el cierre del comodato son idempotentes respecto del movimiento de ledger que los origina. | 5B | MVP |
| RF-ACT-12 | La bandeja de comodatos del portal permite ver los equipos en poder de clientes y abrir la ficha 360 de cada uno. | 5B | MVP |
| RF-ACT-13 | Fecha esperada de recuperación y alertas de no devolución. | Futura | Fase 2 |

## 5. Requerimientos no funcionales

| ID | Requerimiento | Criterio |
| --- | --- | --- |
| RNF-ACT-01 | Multi-tenancy | Schema tenant vía helpers vigentes (`runInTenantSchema`); tenant desde JWT verificado; nunca hardcodear schema. Prueba de aislamiento obligatoria en las rutas nuevas. |
| RNF-ACT-02 | Boundaries Modulith | Sin FKs ni lecturas directas a CRM, WFM, Parties o Tasks. `subscriberRefId`, `contractRefId`, `executionOrderRefId` son referencias opacas. |
| RNF-ACT-03 | Integridad | En 5B, comodato y movimiento de ledger se escriben en la **misma transacción**; nunca un comodato sin movimiento ni viceversa. |
| RNF-ACT-04 | Idempotencia | Reprocesar el mismo movimiento no duplica ni reabre comodatos (clave: `stock_movement_id`). |
| RNF-ACT-05 | Seguridad | RBAC igual al vigente para activos: ADMIN, NOC, SUPPORT en lectura. La ficha 360 no expone ninguna operación de escritura. |
| RNF-ACT-06 | Privacidad (Ley 1581) | MOD12 no almacena ni resuelve nombre, documento o dirección del suscriptor. La UI muestra referencia y etiqueta mínima. Sin PII en logs, fixtures ni mensajes de error. |
| RNF-ACT-07 | Performance | La ficha 360 compone varias consultas: todas acotadas por activo y apoyadas en índices existentes; el timeline y los movimientos se paginan en servidor. Escala objetivo: tenants con cientos de miles de activos sin degradación perceptible. |
| RNF-ACT-08 | Vocabulario | Texto visible en español, sentence case, sin enums crudos; etiquetas centralizadas en `inventory-labels.ts`. |
| RNF-ACT-09 | Cobertura | ≥ 80 % en el código nuevo core; OpenAPI/Swagger actualizado. |

## 6. Modelo de datos

**Ninguna de las dos fases crea entidades ni migraciones.** Se reutiliza lo existente:

| Tabla | Uso | Estado actual |
| --- | --- | --- |
| `serialized_assets` | Cabecera de la ficha | Escrita y leída |
| `asset_lifecycle_events` | Timeline | **Escrita, nunca leída** — 5A le da consumidor. **No tiene columna `stock_movement_id`**: el evento no se puede enlazar al movimiento que lo originó sin migración (ver §9) |
| `stock_movements` / `stock_movement_lines` | Movimientos del activo | Escritas; línea ya tiene `serialized_asset_id` |
| `goods_receipts` / `purchase_orders` / `supplier_profiles` | Origen de compra | Escritas; se leen dentro del propio módulo |
| `asset_loan_assignments` | Comodato | **Creada y vacía** — 5B la activa |

La tabla de comodato ya trae todas las columnas necesarias (`subscriber_ref_id`, `contract_ref_id`, `installed_at`, `removed_at`, `execution_order_ref_id`, `stock_movement_id`) e índice por activo e instalación. **RF-ACT-13 (fecha esperada de recuperación) exigiría columna nueva y por eso queda fuera del MVP:** si se decide adelantarlo, abre gate de ADR y se escala al CTO.

## 7. Contratos API

### Fase 5A (contrato congelado)

| Endpoint | Roles | Cambio |
| --- | --- | --- |
| `GET /api/v1/inventory/assets/:id` | ADMIN, NOC, SUPPORT | Pasa de devolver `SerializedAsset` a `SerializedAssetDetailRecord` (**cambio de shape**, aditivo: los campos actuales se conservan en la raíz) |
| `GET /api/v1/inventory/movements` | ADMIN, NOC, SUPPORT | Nuevo filtro opcional `serializedAssetId` (UUID); resto del contrato intacto |

```ts
interface SerializedAssetDetailRecord {
  // Cabecera: todos los campos actuales de SerializedAsset se conservan
  id: string; inventoryItemId: string;
  serialNumber: string | null; macAddress: string | null; assetTag: string | null;
  currentStatus: SerializedAssetStatus;
  currentLocationId: string | null;
  currentResponsibleType: InventoryResponsibleType;
  currentResponsibleRefId: string | null;
  subscriberRefId: string | null; contractRefId: string | null;
  purchaseOrderRef: string | null; purchaseDate: string | null;
  usefulLifeMonths: number | null; warrantyUntil: string | null;
  createdAt: Date; updatedAt: Date;

  // Composición nueva
  item: { id: string; sku: string; name: string; categoryName: string | null } | null;
  currentLocation: { id: string; code: string; name: string; type: StockLocationType } | null;
  purchaseOrigin: {
    purchaseOrderId: string | null; purchaseOrderNumber: string | null;
    goodsReceiptId: string | null; receivedAt: Date | null;
    supplierPartyRefId: string | null; supplierDisplayName: string | null;
    unitCost: string | null;                       // numeric as string
  } | null;
  usefulLife: {
    monthsTotal: number | null; monthsElapsed: number | null; monthsRemaining: number | null;
    warrantyUntil: string | null;
    status: 'sin-dato' | 'vigente' | 'por-vencer' | 'vencida';
  };
  lifecycle: { data: AssetLifecycleEventRecord[]; total: number; page: number; limit: number };
  movements: { data: StockMovementKardexRecord[]; total: number; page: number; limit: number };
  loans: { data: AssetLoanRecord[]; total: number };   // vacío hasta Fase 5B
}

interface AssetLifecycleEventRecord {
  id: string; eventType: AssetLifecycleEventType;
  fromStatus: SerializedAssetStatus | null; toStatus: SerializedAssetStatus | null;
  locationId: string | null; locationName: string | null;
  responsibleRefId: string | null;
  actorUserId: string | null; notes: string | null; occurredAt: Date;  // = created_at
}

interface AssetLoanRecord {
  id: string; serializedAssetId: string;
  subscriberRefId: string; contractRefId: string | null;
  installedAt: Date; removedAt: Date | null;
  executionOrderRefId: string | null; stockMovementId: string | null;
  status: 'abierto' | 'cerrado';
}
```

### Fase 5B (contrato borrador, se congela al emitir su definición)

| Endpoint | Roles | Propósito |
| --- | --- | --- |
| `GET /api/v1/inventory/loans` | ADMIN, NOC, SUPPORT | Listar comodatos con filtros `status`, `subscriberRefId`, `contractRefId`, `serializedAssetId`, paginado `{ data, total, page, limit }` |

**Sin endpoints de escritura.** El comodato nace y muere como efecto de operaciones existentes (`POST /inventory/movements/execution-order`, `POST /inventory/returns`, `POST /inventory/write-offs`), nunca por acción manual — coherente con la regla vigente de que `CUSTOMER_SITE` no es destino manual (informe SCM F01 §10.3).

## 8. Criterios de aceptacion

### Fase 5A

- CA-5A-01: Abrir un activo recibido por OC muestra su origen de compra con número de OC, fecha, proveedor y costo.
- CA-5A-02: El timeline muestra al menos los eventos de recepción, transferencia e instalación de un activo que pasó por ese ciclo, en español y en orden descendente.
- CA-5A-03: La sección de movimientos lista los movimientos de ledger que tocan el activo, con número de movimiento y origen legible, y permite abrir el kardex filtrado por ese activo.
- CA-5A-04: `GET /inventory/movements?serializedAssetId=<uuid>` devuelve solo movimientos cuyas líneas tocan ese activo.
- CA-5A-05: Un activo sin historia muestra estados vacíos explicativos en las cuatro secciones, con la sección Comodato indicando «Sin comodatos registrados».
- CA-5A-06: Vida útil y garantía muestran el estado derivado correcto en los cuatro casos (sin dato, vigente, por vencer, vencida).
- CA-5A-07: NOC y SUPPORT pueden abrir la ficha; un tenant no puede leer activos de otro (prueba de aislamiento).
- CA-5A-08: Swagger documenta el nuevo shape y el filtro; lint, typecheck y suites de inventario (API y portal) en verde.

### Criterios de entrada de Fase 5B (ADR-016)

- Informe de cierre de Fase 5A emitido con evidencia de CA-5A-01…08 y gates G5/G6/G7 superados.
- Sin deuda crítica abierta de 5A.
- Contrato de 5B congelado por AI-EM-ARCH y prompt marcado ejecutable.

## 9. Dependencias y riesgos

- **No se requiere ADR ni HLD nuevo.** Ninguna fase crea bounded context, entidad, migración ni patrón: 5A compone lecturas sobre el modelo aprobado por ADR-048 y 5B escribe en una tabla ya creada por la migración 047. Precedente directo: Existencias F1 y F2 se ejecutaron sin ADR por la misma razón, mientras que F3A/F3B/F4 sí lo exigieron por introducir entidades, invariantes o columnas. **Si al ejecutar 5B se concluye que hace falta una columna nueva (p. ej. fecha esperada de recuperación), se detiene y se escala: eso abre gate de ADR.**
- **Limitación conocida — el timeline no enlaza con el ledger (declarada, no oculta):** `asset_lifecycle_events` no guarda el `stock_movement_id` que originó cada evento. Correlacionarlos por marca de tiempo sería adivinar, así que **no se hace**: en 5A el ciclo de vida y los movimientos son dos secciones paralelas de la misma ficha, ambas ordenadas por fecha. Añadir la columna es la mejora natural, exige migración tenant y por tanto **gate de ADR**; se propone abordarla junto con H3/H4, cuando ya haya otra migración en juego, en vez de gastar un gate en una columna suelta.
- **Riesgo — cambio de shape de `GET /assets/:id` (medio):** el portal ya consume ese endpoint en `SerializedAssetDetailDrawer`. Mitigación: los campos actuales se conservan en la raíz del nuevo registro; el drawer se migra en la misma fase y sus tests cubren la compatibilidad.
- **Riesgo — costo de la composición (medio):** una ficha que dispara cinco consultas por apertura. Mitigación: todas acotadas por activo, paginación de servidor en timeline y movimientos, y decisión explícita en el spec sobre carga compuesta vs. perezosa.
- **Riesgo — tentación de resolver nombres (alto para el boundary):** mostrar «Juan Pérez» en vez de una referencia exige leer CRM. **No se hace.** Es el mismo criterio ya decidido para RF-INV-21. Si el negocio lo pide, se resuelve con un puerto tipado y su propia definición.
- **Riesgo — comodatos históricos inexistentes (bajo):** al activar 5B no hay datos previos; los equipos ya instalados en clientes no tendrán comodato retroactivo. Se declara como limitación conocida, no se hace backfill inventado.
- **Dependencia:** el flujo de instalación desde OT (`recordExecutionOrderMovement`) es de MOD11 vía puerto; 5B **no** cambia el contrato del puerto, solo añade un efecto interno de MOD12 en la misma transacción.

## 10. Definition of Done (Fase 5A)

- Backend y portal implementados según el prompt, sin violaciones de boundary ni imports circulares.
- Tests nuevos y existentes de inventario en verde (API y portal); cobertura ≥ 80 % en lo nuevo core; prueba de aislamiento tenant sobre las rutas afectadas.
- E2E ampliado: abrir la ficha 360 de un activo recibido y ver su timeline y su origen de compra.
- OpenAPI actualizado; texto visible en español sin enums crudos; sin PII en código, logs ni fixtures.
- `@iwana/db` reconstruido antes de typecheck (checklist DoD vigente); lint y typecheck limpios.
- Informe de fase en `docs/informes/INFORME-MOD12-ACTIVOS-FICHA-360-FASE-05A-v1.0.md` con evidencia de criterios y gates.
- Informe de auditoría de estado actualizado con el avance y decisión G7 registrada.
