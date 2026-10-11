# ADR-085: Unidades de medida — catálogo canónico y aplicación efectiva del factor de conversión

**Version:** 1.1
**Estado:** Aprobado
**Enmienda v1.1:** Aprobada por el CTO el 2026-10-11. La v1.0 (D1-D5) sigue vigente. Los cambios de v1.1 están marcados como (v1.1) y resumidos en el registro de cambios.
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
§6 declara la regla: _«`purchase_unit_of_measure` sin factor de conversion valido no debe aprobarse»_.

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

### D2. La conversión solo es válida dentro de la misma dimensión, salvo las unidades de empaque (v1.1)

`purchaseToBaseUomFactor` solo se acepta si `purchase_unit_of_measure` y `unit_of_measure` comparten
dimensión. Declarar una conversión entre `metro` y `litro` pasa a ser un error de validación, no un
dato aceptado.

Excepción deliberada: la dimensión `COUNT` admite conversión entre sus miembros (una `caja` contiene
N `unidad`), que es precisamente el caso de uso dominante. Es una relación de empaque, no de
magnitud física, y por eso vive dentro de `COUNT`.

**v1.1 — Unidades de empaque de contenido fijo.** Una unidad de empaque (`ROLL`, `BOX`, `PACKAGE`)
puede usarse como unidad de compra de un artículo cuya unidad base pertenece a **otra dimensión**
(por ejemplo, rollo → metro o caja → kilogramo) cuando el artículo declara un **factor fijo,
positivo y explícito** (`purchase_to_base_uom_factor`), que es el contenido de un empaque. La
excepción es de empaque, no de magnitud:

- solo en el sentido empaque → unidad base, nunca a la inversa ni entre dos magnitudes físicas
  (metro ↔ litro sigue siendo un error de validación);
- el factor es un dato del artículo, no un valor por defecto del sistema;
- la validación es autoritativa en el backend (regla de implementación 4).

**Pares habilitados en el código a la fecha:** `ROLL → METER`. Habilitar otro par de empaque es
añadirlo a la tabla de pares de `packages/shared` con sus tests; no requiere un ADR nuevo.

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

La migración **no recalcula saldos históricos**. Los movimientos ya registrados quedan como están;
el factor se aplica solo hacia adelante. Recalcular retroactivamente exigiría saber qué cantidad quiso
registrar el operador, dato que normalmente no existe.

**v1.1 — Conversión histórica excepcional.** Cuando ese dato sí existe (un humano con autoridad sobre
el inventario confirma el contenido exacto de cada empaque registrado), se admite convertir **una
vez** la unidad base de un artículo y su historial, con este procedimiento obligatorio:

1. **Autorización expresa** del responsable del inventario del tenant, registrada en el informe.
2. **Alcance cerrado:** un artículo y un tenant por ejecución.
3. **Respaldo previo** de las filas afectadas, exportado fuera del esquema del tenant (no como tabla
   residual en él).
4. **Transacción única y verificable:**
   - cantidades del ledger, saldos y salidas × factor;
   - costos unitarios de unidad base ÷ factor;
   - los documentos de compra (órdenes y recepciones) **conservan** la unidad de compra.
5. **Verificación posterior:**
   - suma del ledger = suma de saldos, por ubicación y lote;
   - valor del inventario sin cambios (dentro de la escala de D6);
   - ningún consumo, baja o conteo en curso sobre el artículo.
6. **Informe** en `docs/informes/` con el antes y el después.

La primera aplicación fue la conversión de un artículo de fibra (rollo → metro) en un tenant de
pruebas, el 2026-10-11 (`docs/informes/INFORME-MOD12-FIBRA-DROP-METROS-v1.0.md`).

### D6. Precisión del costo de unidad base (v1.1)

Los costos de unidad base (`inventory_items.base_cost`, `standard_cost`, `last_purchase_cost` y
`average_cost`) y `stock_movement_lines.unit_cost` se almacenan como `numeric(14,5)` (migración tenant
142). Al dividir un costo de compra por un factor grande, redondear a centavos altera el valor del
inventario: 168.067,23 por rollo ÷ 1.000 m = 168,06723 por metro.

**Escala vigente en el código:** 5 decimales para los pares de empaque habilitados en D2 y 2 para el
resto. **Deuda declarada:** el problema de precisión no es exclusivo de los empaques; cualquier
factor ≥ 100 lo provoca. La escala debería decidirse por la magnitud del factor y no por el par de
unidades. Se corregirá cuando aparezca el siguiente factor grande.

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
- **Conversión histórica excepcional (v1.1):** reescribe registros del ledger de un artículo. Se acepta solo bajo el procedimiento de D4 y cuando el contenido de cada empaque es un dato confirmado, no una estimación.
- **Unidades de empaque entre dimensiones (v1.1):** un factor mal declarado en un empaque de otra dimensión no es detectable por la validación dimensional. La mitigación es que el factor sea un dato explícito por artículo y que su edición siga bajo `INVENTORY_STOCK_MANAGE`.
- El caso `COUNT` (caja → unidad) mezcla empaque con magnitud. Se acepta por ser el caso dominante y por evitar una jerarquía de empaques que nadie ha pedido.

---

## Reglas de implementacion

1. El catálogo de unidades vive en `packages/shared`; ningún módulo define su propia lista.
2. El ledger y los saldos operan **siempre** en unidad base. Ninguna cantidad en unidad de compra llega a `stock_ledger`.
3. La conversión se aplica en un único punto del flujo de entrada; prohibido duplicarla en el cliente.
4. La validación dimensional es autoritativa en backend (`refineInventoryItemMaster`); el cliente puede guiar, no decidir.
5. La migración se detiene ante cualquier valor sin equivalencia exacta y lo reporta. Prohibida la normalización difusa.
6. No se recalculan movimientos ni saldos históricos, salvo la conversión histórica excepcional de D4 (v1.1), con su procedimiento completo.
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

**Enmienda v1.1: aprobada por el CTO el 2026-10-11.** Generaliza el caso de la fibra en tres reglas:

- D2: unidades de empaque de contenido fijo;
- D4: procedimiento de conversión histórica excepcional;
- D6: precisión del costo base.

No cambia D1, D3 ni D5.

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

---

## Registro de cambios

| Versión | Fecha | Cambio | Estado |
| --- | --- | --- | --- |
| 1.0 | 2026-09-02 | Catálogo canónico, validación dimensional, factor en recepción y migración sin recálculo (D1-D5) | Aprobado por el CTO |
| 1.1 | 2026-10-11 | D2 admite unidades de empaque de contenido fijo entre dimensiones con factor explícito. D4 incorpora el procedimiento de conversión histórica excepcional. Nace D6, con la precisión del costo base `numeric(14,5)` (migración 142). Se retiran del ADR los datos de un tenant concreto, que quedan en su informe | Aprobado por el CTO (2026-10-11) |
