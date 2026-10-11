# PROMPT DE EJECUCIÓN — MOD11: registro compacto de equipos y materiales en la consola de OT

**Versión:** 1.0 · **Fecha:** 2026-10-11 · **Generado por:** AI-EM-ARCH
**Plan:** `docs/plans/2026-10-11-mod11-consola-registro-material.md` (aprobado por el CTO), con su matriz de skills en el §4.

**Reglas comunes:**

- sin commit;
- conteo real con `--no-cache`;
- **no se cambian** el contrato v1.7, el API ni MOD12: el POST de registro sigue igual;
- el copy va en español, en sentence case y sin enums;
- se reutiliza lo que ya existe antes de crear nada nuevo.

**Decisiones del CTO (no se re-litigan):**

- dirección B (la custodia es el formulario), con referencia + serial;
- un equipo por registro;
- los consumibles van en un requisito propio y opcional, `installation-materials`;
- equipo que no aparece: aviso a supervisión, sin serial manual.

**Archivo actual:** `apps/portal/src/components/operations/ExecutionOrderMaterialAction.tsx`.

- `ExecutorCustodyReadout` (líneas 114-249) muestra la custodia en solo lectura, con tarjetas grandes y el saldo del serializado duplicado.
- `ExecutionOrderMaterialAction` (líneas 263-479) tiene un formulario de 6 campos.
- `use-execution-order-custody.ts` ya filtra por la categoría del requisito y entrega `inventoryItemId` por activo.

---

## U1 — `prod-ux`: adenda v1.4 de la spec UX (ola 1)

Escribe la adenda en `docs/specs/2026-10-05-mod11-consola-ot-requisito-ux.md`, en una sección nueva que sustituye a los §5-6 para MATERIAL:

1. **Flujo con serial:**
   - instrucción «Selecciona el equipo que instalaste»;
   - línea de contexto en lectura: «Desde {custodia} · Se registrará como instalado en el sitio del cliente»;
   - tarjetas de radio con **serial** y «{referencia} · {SKU} · {estado}»;
   - búsqueda por serial o MAC si hay más de 8 equipos;
   - pie fijo con «Registrar equipo {serial}».
   - El POST se deriva así: `itemId` del activo, `quantity` 1 y `action` deducida del destino.
2. **Flujo de consumibles** (`installation-materials`): filas con «referencia · disponible N» y un control −/+, y un solo botón «Registrar materiales». Se hace un registro por fila con cantidad mayor que 0, y cada fila muestra su resultado.
3. **Lo que no se muestra:**
   - los saldos de los ítems serializados;
   - los materiales de otra categoría, que van a un desplegable cerrado «Otros materiales en custodia (n)» o no aparecen;
   - la custodia única y el destino fijo, que pasan a texto.
4. **Estados:**
   - cargando, vacío, error con reintentar, enviando y éxito («Equipo registrado. Queda pendiente de confirmación de inventario»);
   - fallo por fila;
   - «¿No ves el equipo? Contacta a supervisión para revisar tu custodia».
5. **Destino de los consumibles:** ratifica `INSTALLED_AT_CUSTOMER` o propón `INTERNAL_CONSUMPTION`, con el motivo.
6. **La regla de derivación de la acción:** `INSTALLED_AT_CUSTOMER` → Instalar y `INTERNAL_CONSUMPTION` → Consumir. Si un requisito no fija el destino, se conserva el selector.

**Entrega:** spec v1.4 e `docs/informes/INFORME-MOD11-CONSOLA-REGISTRO-MATERIAL-U1-v1.0.md`.

## D1 — `ds-owner`: contrato de `RadioCardGroup` (ola 1, en paralelo)

Congela en `docs/specs/2026-10-11-ui-radio-card-group-contrato-componente.md` el contrato de `RadioCardGroup` para `@iwana/ui`, como consolidación de tres implementaciones ad hoc:

- `inventory/QuoteShippingFields.tsx:107`;
- `commercial/catalog/PlanCatalogFormPeek.tsx:73`;
- `scheduling/ExhaustedAttemptsDecisionDialog.tsx:83`.

El contrato define:

- **props:** `legend`, `name`, `value`, `onChange`, `options` (título, descripción, `meta` en mono, deshabilitada con motivo), `density` y `disabled`;
- **anatomía:** radios nativos en un `fieldset`, `min-h-11`, el foco con `has-[:focus-visible]`, y la selección con `border-iwana-primary` + `bg-iwana-primary/5` más un indicador visible;
- **estados**, incluido el modo oscuro, solo con `dark-surface-*`;
- **reglas de a11y.**

Decide también si el control de cantidad −/+ existe o necesita su propia primitiva (`QuantityStepper`). **Entrega:** la spec de contrato y tu veredicto G2.

## F1 y F2 — `fe-platform` (ola 2) · Q1 — `sr-qa` (ola 3)

Se detallan en la adenda de este encargo cuando U1 y D1 estén en GO.

---

## Adenda 1 — 2026-10-11: G2 consolidado y ola 2

**Dictamen de AI-EM-ARCH:**

- **Paso 0 aplicado y verificado** en `tenant_iwana`:
  - los tres consumibles están en `CONSUMIBLESFO` y el XC220 en `CPE`;
  - la plantilla de instalación v3 está publicada;
  - las dos OT están en la v3, con 6 requisitos.
- **U1: GO.** La spec UX v1.4 §16 queda **aprobada** y el destino `INSTALLED_AT_CUSTOMER` se ratifica para los consumibles.
- **D1: GO.** El contrato `docs/specs/2026-10-11-ui-radio-card-group-contrato-componente.md` v1.0 queda congelado. No se crea `QuantityStepper`: el control −/+ se compone con `Input` y `Button` dentro de MOD11.
- **G2: CERRADO**, con tres condiciones técnicas para F2, que no cambian ninguna decisión de producto.

**Condiciones técnicas para F2:**

1. **El patrón se elige por el tipo de artículo, no por la clave del requisito.**
   - Los artículos con `trackingMode = SERIALIZED` usan tarjetas de radio.
   - El resto usa filas con cantidad.
   - Si un requisito tuviera de los dos, se muestran ambos grupos.
   - Para la v3 el resultado es el mismo que pide §16; así no se ata la UI a `installed-equipment` ni a `installation-materials`.
2. **`If-Match` en serie.** `handleRegisterExecutionOrderItemUsage` (`use-execution-order-console-adapter.ts:573`) usa `context.order.version` y refresca después. Varias filas no pueden lanzarse en paralelo ni en un bucle sobre una versión vieja.
   - Hace falta un manejador por lotes en el adaptador que envíe **en serie** y tome la versión vigente antes de cada POST.
   - Ante un `412`, refresca y reintenta **solo esa fila**, una vez.
   - Devuelve un resultado por fila, sin el mensaje global «El material fue registrado.».
3. **Idempotencia por fila.** `registerItemUsage` (`api-client.ts:7057`) genera la clave en cada llamada.
   - Hay que permitir pasar una `Idempotency-Key` explícita.
   - La fila conserva la suya entre reintentos, de modo que un reintento tras un corte de red no duplique el consumo.

### F1 — `fe-platform`: `RadioCardGroup` en `@iwana/ui`

1. Implementa el contrato v1.0 tal cual en `packages/ui/src/components/RadioCardGroup.tsx` y expórtalo en `packages/ui/src/index.ts`.
2. Migra los tres usos ad hoc:
   - `QuoteShippingFields`;
   - `PlanCatalogFormPeek`, donde se reemplazan los botones con `role=radio` y la navegación a mano;
   - `ExhaustedAttemptsDecisionDialog`.
   No cambia el comportamiento de negocio de ninguno.
3. **Specs:** selección, teclado con flechas, opción deshabilitada con motivo visible, `density` y ausencia de `role=radiogroup` redundante.

**Gates:** jest de `packages/ui` y de los tres consumidores con `--no-cache`, y typecheck global.

### F2 — `fe-platform`: rediseño de la hoja (después de F1)

1. En `ExecutionOrderMaterialAction.tsx`, sustituye `ExecutorCustodyReadout` y el formulario de 6 campos por los flujos de §16 con las tres condiciones de arriba:
   - **contexto en lectura:** custodia única y destino fijo;
   - **flujo serializado:** `RadioCardGroup` con serial, «referencia · SKU · estado», búsqueda con más de 8 equipos y pie fijo «Registrar equipo {serial}»;
   - **flujo de consumibles:** filas −/+ con disponibilidad neta y un POST en serie por fila;
   - **acción derivada del destino**, con una tabla compartida;
   - el enlace «¿No ves el equipo?».
2. Elimina el selector de acción y la entrada de serial manual del flujo de v3, y conserva el selector de destino solo cuando el snapshot no lo fija (§16.1).
3. Mantén intactos el historial, el reverso y el pie de historial (`ExecutionOrderMaterialHistory*`).
4. **Specs:**
   - los 8 criterios de §16.6;
   - las tres condiciones técnicas: el patrón por `trackingMode`, el `412` y la reutilización de la clave de idempotencia en el reintento.

**Gates:** jest de `apps/portal/src/components/operations` (≥ 779) con `--no-cache`, typecheck global y `audit-ui.mjs`.

**Entrega:** `docs/informes/INFORME-MOD11-CONSOLA-REGISTRO-MATERIAL-F-v1.0.md`. Sin commit.

---

## Adenda 2 — 2026-10-11: cierre de la ola 2 y Q1

**Dictamen de AI-EM-ARCH:** F1 y F2 en **GO**.

**Verificación en frío del orquestador:**

- typecheck `--force` **8/8**, `Cached: 0`;
- portal **805/805** con `--no-cache`: `operations/`, los consumidores migrados de `RadioCardGroup` y `api-client`;
- `@iwana/ui` **34/34**;
- `audit-ui.mjs` sin hallazgos en `ExecutionOrderMaterialAction.tsx` ni en `RadioCardGroup.tsx`.

**Revisión del reintento de idempotencia.** Es correcta: el servidor calcula el HMAC del payload sin la versión (`execution-orders.service.ts:4034`) y resuelve la repetición antes de `assertVersion`. Reutilizar la clave de la fila tras un `412` o un corte de red no duplica el consumo.

**Observación menor:** `RadioCardGroup.contract.spec.tsx` quedó en `apps/portal/src/components/shared/`. Si prueba la primitiva, el sitio que le corresponde es `packages/ui`.

### Q1 — `sr-qa`: verificación en el navegador

Usa solo `tenant_iwana`, con datos de ejemplo de desarrollo y la sesión de Nepomuceno (técnico). Las OT son `OTE-20260828-001` (en progreso) y `-002`.

1. **Equipo con serial:** abre «Registrar equipo instalado» y comprueba que hay 2 tarjetas.
   - No hay lista duplicada, ni campos de ítem, serial, acción o custodia, ni el saldo del serializado.
   - Elige `XC220-TEST-0031` y registra.
   - El consumo pasa de pendiente a `CONFIRMED`, el serial sale de la lista y el requisito queda «Cumplido».
   - En la base, el serial está en `INSTALLED_COMODATO` y hay un comodato abierto.
2. **Consumibles:** en «Materiales usados en la instalación», registra 2 patchcord y 1 roseta.
   - Hay dos registros independientes que llegan a `CONFIRMED`.
   - Los saldos bajan de 4 a 2 y de 2 a 1.
   - Las filas en 0 no se envían.
3. **Fallo de una fila y su reintento:** fuerza un fallo, por ejemplo con una cantidad superior a la disponible en otra pestaña.
   - Las demás filas conservan su resultado.
   - El reintento no duplica el consumo.
4. **Visual y a11y:**
   - viewports de 375 y 1280 px, tema claro y oscuro;
   - teclado: flechas en el grupo de radios y foco visible;
   - el pie fijo no tapa el foco;
   - con 2 seriales, la hoja cabe en 812 px sin desplazar hasta el botón.
5. **Regresión:** el historial y el reverso (como supervisor) siguen funcionando, y las tres pantallas migradas a `RadioCardGroup` funcionan:
   - cotización con envío;
   - peek del catálogo de planes;
   - diálogo de intentos agotados.

**Entrega:** `docs/informes/INFORME-MOD11-CONSOLA-REGISTRO-MATERIAL-Q1-SR-QA-v1.0.md`, con capturas en `docs/informes/assets/`. Sin commit.

---

## Adenda 3 — 2026-10-11: Q1 v1.2 en NO GO y bloque R-LOT

**Dictamen de AI-EM-ARCH.** El NO GO de Q1 se debe a un **defecto de MOD12 en el consumo de OT**, no al rediseño. El orquestador lo verificó en código y en la base:

- en `tenant_iwana`, todos los saldos están por lote (8 de 8);
- `getAvailabilityWithManager` compara el lote de forma estricta (`stock-balance.service.ts:210`) y el consumo no envía lote, así que el disponible sale 0 y el resultado es `CUSTODY_INSUFFICIENT`;
- `buildExecutionOrderMovementLines` (`stock-ledger.service.ts:1753`) crea las líneas sin lote.

La ola de consumo (G6 del 2026-10-09) no lo detectó porque el tenant sintético no usaba lotes. La spec de consumo pasa a **v1.2 con D13**, que fija la asignación FEFO→FIFO en MOD12, sin tocar el contrato ni el catálogo.

**Lo que sí quedó probado de la UI en Q1 v1.2:**

- 375×812 y 1280×800, en tema claro y oscuro;
- las flechas mueven la selección en el grupo de radios;
- el foco es visible.

Faltan las capturas como archivo.

### R-LOT — `sr-backend`

**Archivos propios:** `apps/api/src/modules/inventory/services/stock-ledger.service.ts`, `stock-balance.service.ts` (solo si hace falta un método nuevo de disponible agregado) y sus specs.

1. **Validación (D13):** el disponible es la suma de todos los lotes del ítem en la custodia (condición `NEW`). No cambies la semántica estricta de `getAvailabilityWithManager` para sus otros llamadores: añade un método agregado o una variante explícita.
2. **Asignación:**
   - FEFO por `expiry_date` ascendente, con las fechas nulas al final; a igual vencimiento, FIFO por `stock_lots.created_at`; el saldo sin lote, al final.
   - Una línea negativa por lote en la custodia y su línea positiva de destino con el **mismo lote**.
   - Serializados: el `lot_id` del activo y, si no tiene, 1 unidad asignada por la misma regla.
3. Mantén el advisory lock existente y la validación y el delta en la misma transacción.
4. **Reverso:** comprueba que un movimiento repartido en varios lotes se revierte línea a línea con sus lotes (R6).
5. **Tests integrados contra Postgres y Redis reales** (norma del 2026-10-08):
   - consumo repartido en 2 lotes;
   - `CUSTODY_INSUFFICIENT` cuando la suma de lotes no alcanza;
   - serializado sin lote con saldo por lote;
   - reverso de un movimiento repartido.

**Gates:** typecheck global, jest de `inventory` con `--no-cache` y el integrado con conteo real.

**Entrega:** `docs/informes/INFORME-MOD11-MOD12-INVENTARIO-R-LOT-v1.0.md`. Sin commit.

### Q1 — `sr-qa`: reanudar con R-LOT en GO

Reinicia el api y el worker con el build nuevo y repite los pasos 1 a 5 de la adenda 2. El consumo `REJECTED/CUSTODY_INSUFFICIENT` anterior del XC220 se conserva: tras un rechazo se puede registrar de nuevo. Guarda las capturas como archivos en `docs/informes/assets/`. **Entrega:** Q1 v1.3.

---

## Adenda 4 — 2026-10-11: identificación del equipo (serial y MAC) · F3

**Observación del CTO.** Al registrar, no se ve el serial ni la MAC, y hacen falta para no equivocarse de equipo.

**Análisis de AI-EM-ARCH**, sobre el DOM real con la sesión de Nepomuceno:

1. **El serial sí llega, pero se confunde con el resto.** La tarjeta muestra «XC220-TEST-0006» como título, en la misma tipografía que el nombre y el SKU, con «Onu Tp Link» y «CFO-SER-ROGPN-TPL-XC220 · Asignado a técnico» debajo. No destaca como identificador.
2. **La MAC nunca se muestra.** `ExecutionOrderMaterialAction.tsx:166` la usa solo para la búsqueda, que además aparece solo con más de 8 equipos. Y en `tenant_iwana` ningún activo tiene MAC: los 50 XC220 tienen `mac_address` vacío.
3. **Los dos requisitos de material tienen el mismo botón**, «Registrar equipo instalado» (`execution-order-actions.ts:58`). Desde «Materiales usados en la instalación» se abre una hoja de consumibles, sin serial. Es la causa más probable de la confusión.

### F3 — `fe-platform`

1. **Tarjeta del equipo:**
   - **serial** como título en `font-mono`, con más peso;
   - debajo, «MAC {mac}» en `font-mono` cuando exista, o «MAC no registrada», en gris, cuando falte;
   - después, la referencia y «SKU · estado».
   El resto del contrato `RadioCardGroup` no cambia: la línea de MAC va en `description` o en `meta`.
2. **Confirmación:** el pie fijo dice «Registrar equipo {serial}» y, si hay MAC, añade «· MAC {mac}» en una línea de resumen sobre el botón.
3. **Botón de cada requisito:** `requirementActionLabel` deja el texto fijo y usa la etiqueta del requisito del snapshot: «Registrar {etiqueta en minúscula inicial}», por ejemplo «Registrar materiales usados en la instalación». No se ata a las claves del requisito.
4. **Búsqueda:** el umbral de más de 8 equipos se mantiene.
5. **Specs:** serial y MAC visibles, el texto «MAC no registrada», el resumen del pie y el texto de cada botón.

**Gates:** jest de `operations/` con `--no-cache` y `audit-ui.mjs`. **Entrega:** `INFORME-MOD11-CONSOLA-REGISTRO-MATERIAL-F3-v1.0.md`. Sin commit.

**Datos (no es UI).** Para que la MAC aparezca, los activos tienen que tenerla. Capturar la MAC al recibir equipos `CPE`, y si debe ser obligatoria, es un tema del **módulo de inventario**. Queda anotado como deuda para su turno.

---

## Adenda 5 — 2026-10-11: identificación por serial o MAC · F3b

**Observación del CTO.** La tarjeta dice «MAC no registrada». Debe comprobar si el equipo tiene serial o MAC y mostrar el que tenga.

**Dictamen de AI-EM-ARCH.** El texto «MAC no registrada» lo pidió la adenda 4: **es un error de AI-EM-ARCH**.

En `tenant_iwana`, los 50 activos tienen serial y ninguno tiene MAC; en la base, `serial_number` y `mac_address` son opcionales. MOD12 identifica el activo por `serialNumber` (contrato v1.7), así que un equipo con MAC y sin serial no se puede registrar sin cambiar el contrato. Hoy se oculta en silencio (`ExecutionOrderMaterialAction.tsx:159`).

Además, F3 aplica estilos con selectores descendientes sobre el marcado interno de `RadioCardGroup` (`:415`). Es frágil y rompe el contrato del componente.

### F3b — `fe-platform`

1. **Identificadores de la tarjeta:** se muestran **solo los que existen**.

   | El equipo tiene | Título | Debajo | ¿Seleccionable? |
   | --- | --- | --- | --- |
   | Serial y MAC | `{serial}` | «MAC {mac}» | Sí |
   | Solo serial | `{serial}` | — | Sí |
   | Solo MAC | «MAC {mac}» | — | No; motivo: «Este equipo no tiene serial registrado. Pide a supervisión que lo complete para poder registrarlo.» |
   | Ni serial ni MAC | «Equipo sin identificar» | — | No; motivo: «Este equipo no tiene serial ni MAC registrados. Pide a supervisión que los complete.» |

   La referencia y «SKU · estado» siguen debajo de los identificadores. **Desaparece el texto «MAC no registrada».**
2. **Los equipos sin serial ya no se filtran:** se muestran deshabilitados, usando `disabled` y `disabledReason` del contrato `RadioCardGroup` v1.0.
3. **Fuera los selectores descendientes.** Usa solo las props del contrato. Los identificadores van en `meta`, que el contrato ya presenta en `font-mono`. Si el serial como título necesita tipografía mono, no lo fuerces: repórtalo como petición de contrato v1.1 a `ds-owner`.
4. **Pie fijo:** «{serial}» más «· MAC {mac}» solo si existe.
5. **Búsqueda:** por serial o MAC, sin cambios.
6. **Specs:** los cuatro casos de la tabla, la ausencia de «MAC no registrada» y que no quede ningún selector descendiente.

**Gates:** jest de `operations/` con `--no-cache`, typecheck global y `audit-ui.mjs`. **Entrega:** `INFORME-MOD11-CONSOLA-REGISTRO-MATERIAL-F3B-v1.0.md`. Sin commit.

**Deuda para el turno de inventario:** exigir al menos un identificador (serial o MAC) en la recepción de equipos `CPE`. **Deuda de contrato, solo si el negocio la necesita:** registrar un equipo identificado únicamente por MAC (`serializedAssetId` en el POST).

---

## Adenda 6 — 2026-10-11: identificadores con etiqueta y pie compacto · F3c

**Observación del CTO** (captura): al registrar, el serial y la MAC no se ven.

**Análisis de AI-EM-ARCH:**

- El título «XC220-TEST-0031» **es** el serial, pero va sin etiqueta y no se reconoce como tal.
- Los dos routers tienen `mac_address` vacío.
- La captura muestra además un **hueco vertical grande entre «Registrar equipo» y «Cancelar»**, por la maquetación del pie fijo.

### F3c — `fe-platform`

1. **Identificadores con etiqueta explícita:**
   - el título pasa a ser «Serial {serial}»;
   - debajo, «MAC {mac}» solo si existe;
   - el caso «solo MAC» se titula «MAC {mac}»;
   - la referencia y «SKU · estado» no cambian, y los casos deshabilitados de F3b tampoco.
2. **Pie:** el resumen dice «Serial {serial}», más «· MAC {mac}» si existe. «Registrar equipo» y «Cancelar» van juntos en la misma fila del pie, sin espacio vacío entre ellos. Revisa la causa (altura mínima, `flex-1` o espaciador del pie fijo) y compruébalo a 375 y 1280 px.
3. **Specs:** la etiqueta «Serial» en el título, «MAC» solo si existe y el pie sin espaciador.

**Gates:** jest de `operations/` con `--no-cache` y `audit-ui.mjs`. **Entrega:** `INFORME-MOD11-CONSOLA-REGISTRO-MATERIAL-F3C-v1.0.md`. Sin commit.

---

## Adenda 7 — 2026-10-11: auditoría de la corrección de unidades (Fibra Drop en metros) · F4

El CTO aplicó directamente una corrección: unidad de medida en la consola, Fibra Drop en metros, migración 142 y enmienda de ADR-085.

### Verificación en frío de AI-EM-ARCH

| Gate | Resultado |
| --- | --- |
| typecheck `--force` | 8/8 |
| API `inventory` + `tasks` | 1540/1548 (8 omitidos por gating) |
| `shared` | 125/125 |
| `db` | 368/368 |
| worker | 169/169 |
| **Portal `operations/` + `api-client`** | **22 fallos en 3 suites, 780/802.** La corrección no corrió tests |

En los datos de `tenant_iwana`:

- Fibra Drop está en `METER`, con `ROLL` y factor 1.000 y un costo medio de 168,06723.
- Los saldos son 19.000 en bodega y 1.000 en custodia, y su suma coincide con las líneas del ledger (20.000).
- El valor sigue en 3.361.344,60. **Los datos están bien.**

### Hallazgos

1. **[BLOQUEO] Regresión de la tarjeta del equipo.** Su título pasó a ser marca + modelo. El CTO **aprueba ese diseño** (2026-10-11), pero:
   - si el artículo no tiene marca o modelo, el título cae en «Serial X» y la descripción repite «Serial X»: el serial sale **duplicado** (así ocurre en los 22 tests);
   - se perdieron la referencia y el SKU.
2. **Lógica de proveedor dentro de la UI.** `ExecutionOrderMaterialAction.tsx:487` normaliza «TP Link» con una expresión regular. Si la marca debe verse de otra forma, se corrige en el maestro del artículo, no en el componente.
3. **ADR-085 enmendado sin control de versión.** Sigue en «1.0 Aprobado», sin registro de cambios, e incluye datos de un tenant de ejemplo (SKU y `tenant_iwana`). Un ADR es normativo para todos los tenants. AI-EM-ARCH propone una **v1.1** con dos reglas genéricas:
   - las unidades de empaque de contenido fijo (`ROLL`, `BOX`, `SPOOL`) se convierten a la unidad base con un factor explícito;
   - las conversiones históricas excepcionales siguen un procedimiento: autorización expresa, respaldo, verificación del valor e informe.
   El caso de Fibra Drop queda solo en su informe.
4. **Tabla de respaldo dentro del esquema del tenant** (`tenant_iwana.mod12_fibra_drop_uom_backup_20261011`). Ninguna migración la gestiona, así que es una deriva del esquema. Conviene exportarla a un archivo y eliminarla cuando el CTO dé por buena la conversión.
5. **La base sintética de QA (`i4_qa_20261006_a1`) no tiene la migración 142.** Hay que aplicarla antes de repetir los tests integrados contra ella.
6. **Hay otros frentes en el árbol** (`media.module.ts`, `worker.module.ts`, informes MOD03-STORAGE y MOD11-ORDEN-CAPTURA-FIRMA). Deben ir en commits separados de este frente.

### F4 — `fe-platform`

1. **Tarjeta (diseño aprobado por el CTO):**
   - título: marca + modelo tal como están en el maestro; si faltan, el **nombre del artículo** (referencia);
   - debajo, «Serial X» y «MAC Y» (si existe);
   - luego «SKU · estado»;
   - el serial **nunca** se repite;
   - se elimina la normalización de marca por expresión regular.
2. **Consumibles:** comprueba que la unidad (metros, unidades) aparece en el disponible, en la cantidad y en los −/+, y que la cantidad acepta los decimales que permita la unidad, si aplica.
3. **Tests:** actualiza los 22 fallidos al diseño aprobado y añade casos para «sin marca ni modelo» (sin serial duplicado) y para la unidad «metros».

**Gates:** jest de `operations/` y de `api-client` con `--no-cache` (0 fallos), typecheck global y `audit-ui.mjs`. **Entrega:** `INFORME-MOD11-CONSOLA-REGISTRO-MATERIAL-F4-v1.0.md`. Sin commit.
