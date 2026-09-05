# PROMPT DE EJECUCIÓN — MOD12 UoM · F5b · Validación dimensional y aplicación del factor de conversión

**Plantilla base:** `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` v1.2 *(en revisión — la regla de destino la respalda `AGENTS.md` → Documentation Rules)*
**Generado por:** AI-EM-ARCH (modo Orchestrator)
**Fecha:** 2026-09-02
**Versión:** 1.0

## Módulo

- **Nombre:** Inventario / SCM — unidades de medida
- **Código:** MOD12
- **Fase:** F5b — **D2 y D3 de ADR-085**: validación dimensional y aplicación efectiva del factor
- **Destinatarios:** **AI-SR-FULL** (implementación) + **AI-SR-QA** (verificación de saldos)
- **Autorización:** [ADR-085](../adrs/ADR-085-Unidades-Medida-Catalogo-Canonico-Conversion.md) **Aprobado por el CTO el 2026-09-02**

> ## ⛔ Gate de entrada — no negociable
>
> **F5a debe estar completada y cerrada antes de iniciar esta fase.** El orden de ADR-085 D5 es
> normativo: catálogo y migración (F5a) → validación dimensional → aplicación del factor. Aplicar la
> conversión sobre unidades sin normalizar es, en palabras del ADR, «el peor orden posible»:
> convertiría cantidades usando factores declarados entre unidades no validadas, **propagando el
> error en vez de corregirlo**.
>
> Verificar antes de escribir una línea: el catálogo canónico existe, la migración de normalización
> se completó en todos los tenants del entorno, y su informe tiene veredicto positivo.

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** que `purchaseToBaseUomFactor` deje de ser un campo decorativo y las
existencias vuelvan a ser correctas cuando la unidad de compra difiere de la base.

### El defecto que se corrige

`purchaseToBaseUomFactor` se persiste, se valida (`> 0` si hay unidad de compra) y el PRD lo exige en
RF-CAT-06. **Pero no se aplica en ninguna parte.** Verificado el 2026-09-02: el campo aparece solo en
`inventory-item.service.ts` — persistir, leer y copiar en el update. La búsqueda de
`UomFactor|uomFactor|conversionFactor` en `goods-receipt.service.ts`, `purchasing.service.ts` y los
servicios de stock devuelve **cero ocurrencias**.

En la recepción, `line.quantityReceived` pasa directo al ledger sin convertir
(`goods-receipt.service.ts:268` y `:315`, `stockLedgerService.recordMovementWithManager`).

**Efecto concreto:** artículo con unidad base `unidad`, unidad de compra `caja`, factor `100`. Al
recibir **2 cajas** se registran **2 unidades**, no 200. El saldo queda mal por un factor de 100, y de
ahí en cascada quedan mal el costo promedio móvil (ADR-059), el punto de reposición y el conteo
físico (ADR-054), que compara contra un teórico erróneo.

**Lo que sí entra:** validación dimensional (D2) y aplicación del factor en la entrada de mercancía (D3).

**Lo que no entra:** recálculo de saldos o movimientos históricos — **prohibido por D4**. El factor se
aplica solo hacia adelante.

---

## 2. Artefactos de entrada obligatorios

- **ADR:** `docs/adrs/ADR-085-...md` (**Aprobado**) — **D2, D3, D5 y las Reglas de implementación 2, 3, 4, 6, 8 son normativas aquí.**
- **PRD:** `PRD-MOD12-CATALOGO-MAESTRO-ARTICULOS-v1.0.md` (**Aprobado**) — RF-CAT-06.
- **ADRs relacionados:** `ADR-059` (costeo promedio móvil — consume el saldo que esta fase corrige), `ADR-054` (conteo físico), `ADR-050` (compra de mostrador — **verificar si su ingreso directo también necesita conversión**), `ADR-048` (boundaries).
- **Punto de intervención:** `apps/api/src/modules/inventory/services/goods-receipt.service.ts:268,315`.
- **Validación a extender:** `apps/api/src/modules/inventory/dto/index.ts:230-274` (`refineInventoryItemMaster`).
- **Salida de F5a:** catálogo canónico con dimensión en `packages/shared`, e informe de migración con veredicto.

---

## 3. Especificación (ADR-085 D2 y D3)

### D2 — La conversión solo es válida dentro de la misma dimensión

`purchaseToBaseUomFactor` solo se acepta si `purchase_unit_of_measure` y `unit_of_measure` comparten
dimensión. Declarar una conversión entre `metro` y `litro` pasa a ser **error de validación**, no un
dato aceptado como hoy.

**Excepción deliberada:** la dimensión `COUNT` admite conversión entre sus miembros — una `caja`
contiene N `unidad`. Es relación de empaque, no de magnitud física, y por eso vive dentro de `COUNT`.
Es además el caso de uso dominante.

### D3 — El factor se aplica en la entrada de mercancía

`GoodsReceiptService` convierte la cantidad recibida a unidad base **antes** de registrar el
movimiento en el ledger. La cantidad en unidad de compra se conserva en la línea de recepción para
trazabilidad y para el documento del proveedor.

**Regla derivada, normativa:** el ledger nunca almacena cantidades en unidad de compra. Un saldo es
comparable solo si todas sus entradas hablan la misma unidad.

---

## 4. Restricciones no negociables

1. **El ledger opera siempre en unidad base** (Regla 2). Ninguna cantidad en unidad de compra llega a `stock_ledger`.
2. **La conversión se aplica en un único punto** del flujo de entrada (Regla 3). **Prohibido duplicarla en el cliente** o en varios servicios: dos puntos de conversión terminan aplicándola dos veces.
3. **No recalcular movimientos ni saldos históricos** (Regla 6). Solo hacia adelante.
4. **La validación dimensional es autoritativa en backend** (Regla 4); el cliente puede guiar, no decidir.
5. **Artículos sin unidad de compra o sin factor no cambian de comportamiento.** La conversión solo actúa cuando ambos existen. Un factor ausente **nunca** se asume `1` de forma implícita en un artículo que sí declara unidad de compra distinta: eso es exactamente el error que se corrige.
6. **Revisar ADR-050 (compra de mostrador).** Su ingreso directo puede ser un segundo punto de entrada de mercancía. Si lo es, aplica la misma conversión; si se decide excluirlo, **justificarlo por escrito**.
7. **Precisión numérica:** el factor es `numeric(12,4)` y las cantidades son numéricas. Definir y documentar el redondeo; una conversión que introduce deriva decimal en cada recepción corrompe el saldo despacio, que es peor que corromperlo rápido.
8. Sin permisos nuevos. Sin cambios de boundary.

**Contratos congelados:** ADR-085 D2/D3 · catálogo canónico entregado por F5a · contrato de `StockLedgerService`.

---

## 5. Entregables

**Técnicos**
- `apps/api/src/modules/inventory/dto/index.ts` — validación dimensional en `refineInventoryItemMaster`.
- `apps/api/src/modules/inventory/services/goods-receipt.service.ts` — conversión antes del ledger; cantidad de compra conservada en la línea.
- Compra de mostrador (ADR-050), si procede tras la revisión de §4.6.
- Portal: mensaje claro cuando la validación dimensional rechaza; mostrar al usuario la equivalencia («2 cajas = 200 unidades») **antes** de confirmar la recepción.
- Tests: conversión con factor entero y decimal, redondeo, artículos sin factor, rechazo dimensional, y **prueba de no-doble-conversión**.

**Documentales**
- `docs/informes/INFORME-MOD12-UOM-CONVERSION-F5B-v1.0.md` con G6, G6.5 y G7 **por separado** (ADR-069), y evidencia explícita del antes/después de un saldo con unidad de compra.

---

## 6. Criterios de aceptación

- **CA-F5B-01:** recibir 2 cajas de un artículo con factor 100 registra **200 unidades** en el ledger. *Es el criterio central: demuestra que el defecto está corregido.*
- **CA-F5B-02:** la línea de recepción conserva la cantidad en unidad de compra para trazabilidad.
- **CA-F5B-03:** ninguna cantidad en unidad de compra llega a `stock_ledger`.
- **CA-F5B-04:** declarar un factor entre unidades de distinta dimensión (`metro` → `litro`) se rechaza con mensaje explicativo.
- **CA-F5B-05:** la conversión dentro de `COUNT` (caja → unidad) sí se acepta.
- **CA-F5B-06:** un artículo sin unidad de compra o sin factor se comporta exactamente como antes.
- **CA-F5B-07:** **la conversión se aplica una sola vez** — probado explícitamente contra doble aplicación.
- **CA-F5B-08:** el redondeo está definido, documentado y probado; sin deriva acumulada en recepciones sucesivas.
- **CA-F5B-09:** los saldos históricos no cambian — conteo antes y después.
- **CA-F5B-10:** el usuario ve la equivalencia antes de confirmar la recepción.
- **CA-F5B-11:** la revisión de ADR-050 está documentada, con su decisión y justificación.

## 7. Criterio de stop/go

**Detenerse inmediatamente si:**
- F5a no está cerrada o su migración quedó detenida en algún tenant. **El gate de entrada es duro.**
- Aparece un segundo punto de entrada de mercancía no previsto: inventariarlo y escalar antes de convertir en ninguno.
- La precisión numérica obliga a cambiar el tipo de alguna columna — es cambio de modelo y vuelve al ADR.
- Se descubre que algún tenant ya compensaba manualmente la falta de conversión (por ejemplo, tecleando 200 en vez de 2). **Aplicar la conversión sobre ese hábito duplicaría el error**: escalar antes de activar.

**Documentar causa en:** `INFORME-MOD12-UOM-CONVERSION-F5B-v1.0.md` §Bloqueos.
**Escalar a:** AI-EM-ARCH con etiqueta `[BLOQUEO]` antes de cerrar la sesión (protocolo §3).

## 8. Criterio de salida

- **Gate de entrada verificado y registrado** en el informe: F5a cerrada, migración completa, veredicto positivo.
- **Backend:** `pnpm --filter @iwana/api exec jest src/modules/inventory/tests/` (suite de inventario completa) en verde, **con `Cached: 0`**.
- **Evidencia del defecto corregido:** caso 2 cajas × factor 100 → 200 unidades, documentado con el antes y el después.
- **Saldos históricos intactos:** conteo idéntico antes y después.
- **E2E:** flujo de recepción de compra en verde.
- **Calidad:** `pnpm --filter @iwana/api typecheck && pnpm lint` en verde.
- **Gates:** G6, G6.5 (corrida Linux de CI por SHA) y G7 registrados por separado (ADR-069).

---

## Impacto declarado (AI-EM-ARCH)

- **Multi-tenant:** sin cambios de esquema; la conversión ocurre en el servicio, tenant-aware por `search_path`.
- **Seguridad:** sin cambio de superficie ni permisos nuevos.
- **Escala:** una multiplicación por línea de recepción. Sin impacto.
- **Regulación:** sin impacto directo. La valoración sigue siendo **operativa, no contable ni fiscal** (ADR-059). Un saldo correcto es condición necesaria para cualquier integración contable futura, pero **esta fase no la anticipa ni la habilita**.
- **Corrección de integridad:** es el punto central. Esta fase deja de producir saldos incorrectos hacia adelante. **No sanea el histórico** — ADR-085 lo declara riesgo aceptado: corregir lo ya registrado exige inventario físico, no migración. No presentar esta fase como si lo hiciera.
