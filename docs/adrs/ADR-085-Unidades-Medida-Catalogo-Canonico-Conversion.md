# ADR-085: Unidades de medida — catálogo canónico y aplicación efectiva del factor de conversión

**Version:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-09-02
**Fecha aprobación:** 2026-09-02
**Aprobado por:** CTO Humano (decisión en sesión de auditoría del catálogo)
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Modulo:** MOD12 Inventario / SCM
**Ownership:** MOD12 (datos y lógica de conversión)
**PRD relacionado:** docs/prds/PRD-MOD12-CATALOGO-MAESTRO-ARTICULOS-v1.0.md (Aprobado) — RF-CAT-06
**PRD relacionado:** docs/prds/PRD-MOD12-INVENTARIO-SCM-v1.0.md (interna 1.1, En revisión)
**HLD relacionado:** docs/hlds/HLD-MOD12-CATALOGO-MAESTRO-ARTICULOS-v1.0.md (Aprobado)
**ADR base:** docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md (Aprobado)
**ADR relacionado:** docs/adrs/ADR-059-Costeo-Promedio-Movil-Valoracion-Inventario.md (Aprobado)
**ADR relacionado:** docs/adrs/ADR-054-Conteo-Fisico-Inventario-Ciclico.md (Aprobado)
**Origen:** auditoría del catálogo maestro del 2026-09-02

---

## Contexto

### El estado actual

`inventory_items` tiene dos columnas de unidad y un factor que las relaciona
(`packages/database/src/entities/inventory-item.entity.ts`):

- `unit_of_measure` varchar(32) **NOT NULL** — unidad base en la que se cuentan las existencias
- `purchase_unit_of_measure` varchar(32) nullable — unidad en la que se compra
- `purchase_to_base_uom_factor` numeric(12,4) nullable — cuántas unidades base contiene una de compra

Ambas unidades son **texto libre**. No existe enum, tabla ni constante compartida: la búsqueda de
`UnitOfMeasure` en `packages/shared/src` devuelve **cero resultados**. La única validación es la
longitud (32 caracteres). Los valores en uso hoy en semillas y pruebas son `'unidad'` (22
ocurrencias), `'metro'` (9) y `'caja'` (2), y el formulario de alta propone `'unidad'` mientras las
pruebas del portal usan `'UND'`: **dos convenciones conviviendo desde el principio**.

### El defecto que obliga a decidir ahora

`refineInventoryItemMaster` (`apps/api/src/modules/inventory/dto/index.ts:230-274`) valida que, si hay
`purchaseUnitOfMeasure`, el factor sea mayor que cero. El PRD lo exige en RF-CAT-06 y el propio PRD
§6 declara la regla: *«`purchase_unit_of_measure` sin factor de conversion valido no debe aprobarse»*.

**Pero el factor no se aplica en ninguna parte.** Verificado el 2026-09-02: `purchaseToBaseUomFactor`
aparece exclusivamente en `inventory-item.service.ts` — persistir, leer y copiar en el update. La
búsqueda de `UomFactor|uomFactor|conversionFactor` en `goods-receipt.service.ts`,
`purchasing.service.ts` y los servicios de stock devuelve **cero ocurrencias**.

En la recepción de compras, `line.quantityReceived` pasa directo al ledger sin conversión
(`goods-receipt.service.ts:268` y `:315`, `stockLedgerService.recordMovementWithManager`).

Consecuencia operativa concreta: un artículo con unidad base `unidad`, unidad de compra `caja` y
factor `100`, al recibir **2 cajas**, registra **2 unidades** en existencias — no 200. El saldo queda
mal por un factor de 100, y a partir de ahí quedan mal el costo promedio móvil (ADR-059), el punto de
reposición y el conteo físico, que comparará contra un saldo teórico erróneo.

El defecto está latente hoy porque `'caja'` casi no se usa y el factor casi nunca se llena — entre
otras cosas porque, como registró la auditoría, **`purchaseUnitOfMeasure` y el factor no son
establecibles desde ninguna pantalla del portal**. En el momento en que la fase F1 exponga esos
campos, el defecto pasa de latente a activo.

### Por qué las dos cosas se deciden juntas

Aplicar el factor sobre unidades que nadie normaliza no resuelve el problema: si un artículo dice
`'caja'` y otro `'Caja'` y otro `'CAJA'`, el sistema no puede razonar sobre ellas, no puede validar
que la conversión tenga sentido dimensional (nadie impide declarar factor entre `'metro'` y
`'litro'`) y no puede agregar existencias comparables entre artículos. Normalizar sin aplicar el
factor deja el defecto intacto. Son una sola decisión.

---

## Decision propuesta

Se adopta un **catálogo canónico de unidades definido en el sistema** (no administrable por tenant),
con dimensión física declarada, y **la aplicación efectiva del factor de conversión en la entrada de
mercancía**.

### D1. Catálogo canónico en `@iwana/shared`, no tabla por tenant

Las unidades pasan de texto libre a un conjunto cerrado definido en código, con `code`, etiqueta y
**dimensión** (`COUNT`, `LENGTH`, `MASS`, `VOLUME`, `TIME`). El conjunto inicial cubre la operación
ISP real: unidad, caja, rollo, paquete, metro, kilómetro, kilogramo, gramo, litro, hora.

Se elige catálogo del sistema y **no** tabla administrable por tenant porque el conjunto de unidades
de un ISP es acotado y estable; un catálogo por tenant multiplicaría la superficie de administración,
haría que cada tenant reinventara `'unidad'` con su propia grafía y **volvería a introducir por otra
puerta el problema que este ADR cierra**. Si un tenant necesitara una unidad ausente, se añade al
catálogo del sistema por release, no por configuración.

### D2. La conversión solo es válida dentro de la misma dimensión

`purchaseToBaseUomFactor` solo se acepta si `purchase_unit_of_measure` y `unit_of_measure` comparten
dimensión. Declarar una conversión entre `metro` y `litro` pasa a ser un error de validación, no un
dato aceptado.

Excepción deliberada: la dimensión `COUNT` admite conversión entre sus miembros (una `caja` contiene
N `unidad`), que es precisamente el caso de uso dominante. Es una relación de empaque, no de
magnitud física, y por eso vive dentro de `COUNT`.

### D3. El factor se aplica en la entrada de mercancía

`GoodsReceiptService` convierte la cantidad recibida a unidad base antes de registrar el movimiento
en el ledger. La cantidad en unidad de compra se conserva en la línea de recepción para trazabilidad
y para el documento del proveedor; **el ledger y los saldos operan siempre en unidad base**.

Regla derivada: **el ledger nunca almacena cantidades en unidad de compra.** Un saldo es comparable
solo si todas sus entradas hablan la misma unidad.

### D4. Migración de los datos existentes: normalizar, nunca adivinar

La migración mapea los valores actuales a códigos canónicos por equivalencia conocida
(`'unidad'`, `'UND'`, `'und'` → `UNIT`; `'metro'`, `'m'` → `METER`; `'caja'` → `BOX`), **sin
normalización difusa**. Todo valor que no tenga equivalencia exacta se reporta y **detiene la
migración** para decisión humana: convertir una unidad por aproximación es corromper existencias en
silencio.

La migración **no recalcula ningún saldo histórico**. Los movimientos ya registrados quedan como
están; el factor se aplica solo hacia adelante. Recalcular retroactivamente exigiría saber qué
cantidad quiso registrar el operador, dato que no existe.

### D5. Secuencia obligatoria

1. Catálogo canónico y migración de normalización (D1, D4).
2. Validación dimensional (D2).
3. Aplicación del factor en recepción (D3).

**Aplicar D3 antes que D1 y D2 es el peor orden posible**: convertiría cantidades usando factores
declarados entre unidades no validadas, propagando el error en vez de corregirlo.

---

## Alternativas descartadas

### A. Tabla `inventory_units_of_measure` administrable por tenant

Descartada. Ofrece flexibilidad que la operación ISP no ha pedido, a cambio de: pantalla de
administración nueva, permisos nuevos, riesgo de que cada tenant cree variantes de la misma unidad, y
la misma deuda de normalización dentro de cada tenant. La flexibilidad real que se necesita —añadir
una unidad poco frecuente— se cubre con un release, no con configuración.

Reconsiderable si aparece evidencia de tenants con unidades genuinamente propias e incompatibles
entre sí.

### B. Lista blanca de validación sobre el `varchar` actual

Descartada como solución, **aceptable solo como paso intermedio**. Impide grafías nuevas, pero no
aporta dimensión, así que no permite validar que una conversión tenga sentido ni habilita agregación.
Deja el defecto D3 sin resolver, que es el que corrompe saldos.

### C. Eliminar `purchase_unit_of_measure` y comprar siempre en unidad base

Descartada. Es la opción más simple de implementar y la peor para el operador: obligaría a traducir
mentalmente «2 cajas» a «200 unidades» en cada recepción, trasladando al humano el cálculo que el
sistema debe hacer, y perdiendo el dato de la factura del proveedor. Contradice RF-CAT-06, que exige
persistir la unidad de compra y el factor.

---

## Consecuencias

### Positivas

- Las existencias vuelven a ser correctas cuando la unidad de compra difiere de la base — hoy no lo son.
- El costo promedio móvil (ADR-059), el punto de reposición y el conteo físico (ADR-054) operan sobre saldos fiables.
- Deja de ser posible declarar conversiones sin sentido dimensional.
- `purchaseToBaseUomFactor` deja de ser un campo decorativo: el PRD RF-CAT-06 pasa a estar cumplido de verdad, no solo persistido.

### Costos y tradeoffs

- Migración de datos con posible parada por valores no mapeables: exige una pasada de diagnóstico previa por tenant.
- Un conjunto cerrado de unidades significa que añadir una requiere release.
- El cambio de `varchar` a código canónico toca DTOs, formularios, tablas y las specs que asertan `'unidad'` o `'UND'`.

### Riesgos aceptados

- **Saldos históricos no se recalculan** (D4). Un tenant que ya haya comprado en unidad de compra tiene saldos mal desde antes de este ADR, y este ADR no los arregla: los congela y evita que sigan degradándose. Corregirlos exige inventario físico, no migración.
- El caso `COUNT` (caja → unidad) mezcla empaque con magnitud. Se acepta por ser el caso dominante y por evitar una jerarquía de empaques que nadie ha pedido.

---

## Reglas de implementacion

1. El catálogo de unidades vive en `packages/shared`; ningún módulo define su propia lista.
2. El ledger y los saldos operan **siempre** en unidad base. Ninguna cantidad en unidad de compra llega a `stock_ledger`.
3. La conversión se aplica en un único punto del flujo de entrada; prohibido duplicarla en el cliente.
4. La validación dimensional es autoritativa en backend (`refineInventoryItemMaster`); el cliente puede guiar, no decidir.
5. La migración se detiene ante cualquier valor sin equivalencia exacta y lo reporta. Prohibida la normalización difusa.
6. No se recalculan movimientos ni saldos históricos.
7. Migración aditiva y reversible, con `down()` verificado, sobre schema tenant.
8. Ejecutar en el orden de D5. Cualquier alteración del orden requiere volver a este ADR.

---

## Impacto (tenant / seguridad / escala / regulacion)

- **Multi-tenant:** el catálogo es del sistema, compartido por definición; los datos siguen en schema tenant. La migración corre por tenant y puede detenerse en uno sin bloquear a los demás.
- **Seguridad:** sin cambio de superficie. Sin permisos nuevos: la edición de unidades sigue bajo `INVENTORY_STOCK_MANAGE`. Sin PII.
- **Escala:** sin impacto. Sustituye comparación de cadenas por comparación de códigos; la conversión es una multiplicación por línea de recepción.
- **Regulación:** sin impacto directo. La valoración de inventario sigue siendo **operativa, no contable ni fiscal** (ADR-059). Un saldo correcto es condición necesaria para cualquier integración contable futura, pero este ADR no la anticipa ni la habilita.

---

## Requiere ADR: sí (este) · Requiere CTO: sí — **obtenido el 2026-09-02**

Es cambio de modelo de datos con migración sobre datos existentes y corrección de un
comportamiento que hoy produce saldos incorrectos. Escaló al CTO por tres motivos: toca el
bounded context aprobado en ADR-048, altera la base de cálculo de existencias, y su migración puede
detenerse ante datos no mapeables.

**Aprobación del CTO 2026-09-02.** Autoriza las decisiones D1-D5 y su ejecución en el orden de D5.

**Restricción de secuencia vigente:** este ADR debe estar ejecutado —al menos D1, D2 y D4— **antes de
exponer** `purchaseUnitOfMeasure` y `purchaseToBaseUomFactor` en la superficie de edición del catálogo
(fase F1). Mientras esos campos no sean establecibles desde la UI, el defecto permanece latente; en
cuanto se expongan, se activa. Si F1 llegara primero, esos dos campos quedan **fuera de su alcance**
hasta que este ADR esté ejecutado.

**Prompts de ejecución derivados:**
`docs/prompts/PROMPT-MOD12-UOM-FASE-F5A-CATALOGO-Y-MIGRACION-v1.0.md` (D1, D4) y
`docs/prompts/PROMPT-MOD12-UOM-FASE-F5B-DIMENSION-Y-CONVERSION-v1.0.md` (D2, D3).

---

## Referencias

- AGENTS.md — Architecture Rules (boundaries, modulith, tenancy por `search_path`)
- docs/prds/Stack_Tecnologico.md
- docs/prds/PRD-MOD12-CATALOGO-MAESTRO-ARTICULOS-v1.0.md — RF-CAT-06 y §6 Reglas de consistencia
- docs/adrs/ADR-048-Bounded-Context-Inventario-SCM-Ciclo-Vida-Productos.md
- docs/adrs/ADR-054-Conteo-Fisico-Inventario-Ciclico.md
- docs/adrs/ADR-059-Costeo-Promedio-Movil-Valoracion-Inventario.md
- packages/database/src/entities/inventory-item.entity.ts — `unit_of_measure`, `purchase_unit_of_measure`, `purchase_to_base_uom_factor`
- apps/api/src/modules/inventory/dto/index.ts:230-274 — `refineInventoryItemMaster`
- apps/api/src/modules/inventory/services/goods-receipt.service.ts:268,315 — punto donde hoy falta la conversión
