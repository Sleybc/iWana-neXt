# Spec — Transversal · Importación UISP: complementar un titular existente

**Versión:** 1.0
**Estado:** G0 aprobado por el usuario el 2026-11-15 («Apruebo G0»). [ADR-110](../adrs/ADR-110-Importacion-por-Lotes-desde-UISP-y-Portabilidad.md) D11 enmendado en v1.1 con esta spec
**Fecha:** 2026-11-15
**Emisor:** Claude Code, con criterio de AI-DATA-ENG
**Módulos:** plataforma (migración, worker) · MOD05 CRM · MOD14 Facturación · MOD09 Soporte
**Relacionado:** [spec de exportación e importación UISP](2026-11-10-transversal-exportacion-importacion-suscriptor-uisp.md) · [ADR-110](../adrs/ADR-110-Importacion-por-Lotes-desde-UISP-y-Portabilidad.md) D3, D6, D7, D10, D11, D14 · [ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md)

---

## 0. Problema

Un cliente que ya se dio de alta en iWana (por venta) y que tiene años de historial en UISP no puede traer ese historial. La simulación encuentra su documento, lo marca `TITULAR_EXISTENTE` (D11: conflicto, nunca fusión) y rechaza con él servicios, facturas, pagos, tickets y soportes (`DEPENDE_DE_TITULAR_RECHAZADO`).

Caso real: Alexander Benavides, creado en iWana el 2026-08-21, cliente 22 en UISP (registro de 2018). Su ZIP pesa 27,7 MB; el tope de tamaño ya se subió aparte (100 MB por ZIP, 200 MB por lote).

## 1. Decisiones del usuario (2026-11-15)

| # | Decisión |
|---|---|
| C1 | **Activación por titular:** la coincidencia por documento sigue siendo conflicto. Solo se complementa si un administrador lo confirma para ese titular. Queda auditado quién lo confirmó. |
| C2 | **Enfoque A:** la confirmación es una equivalencia nueva de tipo `TITULAR` en `migration_mappings`, junto a plan, método de pago, ciclo y etiqueta. |
| C3 | **Importar todo:** facturas, pagos, tickets y soportes de UISP entran completos, también los que se cruzan con el periodo que ya factura iWana. El cruce no bloquea: se informa. |
| C4 | **Servicios como contrato histórico:** cada servicio de UISP se crea como contrato **terminado**, aunque en UISP esté activo. Solo sostiene facturas, pagos y suspensiones; nunca factura ni aprovisiona y no toca el contrato de iWana. |
| C5 | **Datos de la persona: solo completar vacíos.** Nada de lo que tiene iWana se sobrescribe. Lo que difiere va al informe. |

## 2. Diseño

### 2.1 Equivalencia `TITULAR`

- `kind = 'TITULAR'`, `external_value` = id del cliente en UISP (`22`), `action = 'EQUIVALE'`, `target_ref` = id del suscriptor de iWana.
- Solo admite `EQUIVALE`. «Mantener como conflicto» es no guardar la equivalencia: el titular sigue rechazado como hoy.
- `external_label` va siempre `NULL`: la tabla de equivalencias no se purga (D10) y no puede guardar nombres ni documentos.
- Al guardarla, la API exige que el suscriptor destino:
  1. exista en el tenant;
  2. tenga el mismo HMAC de documento que el cliente de UISP en las intermedias del lote;
  3. no esté anonimizado ni con datos bloqueados (`privacyRestricted`);
  4. no esté ya enlazado a **otro** cliente de UISP (`external_id` distinto de `uisp:client:22`).

  Si falla, responde 422 `MIGRATION_TITULAR_TARGET_INVALID` y no guarda nada.
- La equivalencia persiste entre lotes: reimportar al mismo cliente no vuelve a preguntar.

### 2.2 Simulación

- La consulta de titulares existentes devuelve, además del HMAC, el id del suscriptor que coincide. Es un identificador, no PII.
- Coincidencia por documento:
  - **sin** equivalencia `TITULAR` → `TITULAR_EXISTENTE`, como hoy, y un pendiente de tipo `TITULAR` con el candidato (`candidateRef` = id del suscriptor);
  - **con** equivalencia hacia ese mismo suscriptor → el titular queda `VALIDO` en modo complemento (`derived.complementSubscriberId`) y sus dependientes se validan con las reglas de siempre;
  - **con** equivalencia hacia otro suscriptor → `TITULAR_EXISTENTE` (la equivalencia no corresponde al documento).
- En modo complemento no se exige `DATOS_OBLIGATORIOS_AUSENTES`: el titular ya existe con sus datos.
- Observación nueva `CRUCE_CON_FACTURACION_IWANA`: cuenta las facturas de UISP con fecha de emisión igual o posterior a la primera factura propia de iWana de ese suscriptor (no importada). Si no tiene facturas propias, no hay cruce.
- El informe del lote muestra por titular complementado: facturas y pagos a importar, cuántos se cruzan y el saldo pendiente que traen, para que el administrador lo vea antes de promover (D14 los vuelve cartera cobrable).

### 2.3 Promoción

- No se crea suscriptor. Se usa `complementSubscriberId` y se revalidan C2.1 a C2.4 dentro de la transacción del titular (savepoint). Si fallan, el titular y sus dependientes se rechazan con el motivo.
- Si `subscribers.external_id` es `NULL`, se fija en `uisp:client:<id>`. **Nunca** se escribe `import_batch_id` en un suscriptor complementado: la reversión borra los suscriptores que lo tienen.
- **Contratos históricos:** se crean como hoy (`external_id`, `import_batch_id`, plan y ciclo por equivalencia, historial de suspensiones), con `status = 'TERMINATED'` y `endDate` = fecha de fin de UISP o, si no tiene, la fecha de promoción. No emiten eventos de aprovisionamiento ni entran en la generación de facturas.
- Facturas, pagos, aplicaciones, tickets y soportes siguen el camino actual (idempotente por `external_id`, D3), colgados de los contratos históricos.
- `promotion_meta` del titular registra `{ mode: 'COMPLEMENTO', subscriberId, linkedExternalId: boolean, filled: [...] }`. Los valores no se guardan: solo el nombre del campo y el HMAC de lo escrito.

### 2.4 Completar datos vacíos

Solo si en iWana el campo está vacío:

| Dato | Destino |
|---|---|
| Correo y teléfono principal | `email`, `phone` (cifrados, con su HMAC) |
| Segundo contacto con teléfono | `altContactName`, `altContactPhone` |
| Contactos adicionales | `party_contact`, si el valor (por HMAC) no existe ya |
| Etiquetas con equivalencia | asignación con `import_batch_id`, si no la tiene |
| Dirección, barrio, municipio y coordenadas | solo si la dirección de iWana está vacía; se completan juntas, nunca mezcladas |

- No se tocan: nombres, documento, tipo de persona, estrato, datos fiscales, fecha de alta (`converted_at`) ni nada que ya tenga valor.
- Cada campo que difiere va al informe como «Dato distinto en UISP: teléfono principal», sin el valor.

### 2.5 Conciliación (D6)

Para un titular complementado se compara UISP (`accountBalance`, facturado, pagado) contra los totales **solo de lo importado** de UISP para ese suscriptor (`external_id` con prefijo `uisp:`), no contra todo su saldo en iWana. Las facturas propias de iWana nunca entran en la conciliación. El resto de titulares concilia igual que hoy.

### 2.6 Reversión (D7)

- Lo importado (contratos históricos, facturas, pagos, aplicaciones, tickets, soportes, etiquetas y contactos con `import_batch_id`) se revierte como hoy, con sus bloqueos (pago nuevo aplicado, documento emitido, OT).
- Del suscriptor complementado:
  - `external_id` vuelve a `NULL` si este lote lo fijó;
  - cada campo de `filled` vuelve a `NULL` solo si su HMAC actual es el que escribió el lote;
  - si alguien lo cambió después, la reversión se bloquea con el motivo nuevo `DATO_COMPLETADO_MODIFICADO`.
- El suscriptor, su contrato de iWana y sus facturas propias nunca se borran.
- La equivalencia `TITULAR` no se borra al revertir: es configuración del tenant, como las demás.

### 2.7 Portal (Configuración → Importaciones → lote)

- En «Equivalencias pendientes», un grupo **Titulares existentes**. Por cada uno, una tarjeta con:
  - «Cliente 22 de UISP»;
  - el candidato de iWana: nombre, documento enmascarado, «En iWana desde», estado y número de servicios, leído de CRM con los permisos del administrador;
  - el botón **Complementar este titular**, que abre un diálogo de confirmación con lo que hará:
    1. enlazar el cliente;
    2. crear N contratos históricos;
    3. importar N facturas y N pagos (con M que se cruzan con la facturación de iWana y el saldo que traen);
    4. completar solo datos vacíos.
- Tras confirmar, el lote se re-simula como con cualquier equivalencia.
- En el informe, el titular aparece como «Complementado» y no como «Creado».

## 3. Cambios por capa

| Capa | Cambio |
|---|---|
| Contrato (`packages/shared`) | `MIGRATION_MAPPING_KINDS` + `TITULAR`. Motivos `TITULAR_VINCULADO_A_OTRO_CLIENTE` y `DATO_COMPLETADO_MODIFICADO` (bloqueo de reversión). Observaciones `CRUCE_CON_FACTURACION_IWANA` y `DATO_DISTINTO_EN_UISP`. `candidateRef` opcional en el pendiente. Error `MIGRATION_TITULAR_TARGET_INVALID`. Conteo `titulares.complementados`. |
| Base de datos (tenant) | Migración nueva: `chk_migration_mappings_kind` admite `TITULAR`; `chk_migration_mappings_action_kind` sigue permitiendo `DESCARTAR`/`NOTA` solo en `ETIQUETA`. |
| API migración | Consulta de titulares con id; simulación (2.2); validación de la equivalencia (2.1); promoción en modo complemento (2.3, 2.4); conciliación acotada (2.5); reversión (2.6). |
| Puertos CRM / Billing | CRM: leer el candidato, enlazar `external_id`, completar campos vacíos con HMAC y revertirlos. Billing: totales solo de lo importado y fecha de la primera factura propia. Sin SQL cruzado entre módulos (boundaries del Modulith). |
| Portal | Grupo «Titulares existentes», diálogo de confirmación, estado «Complementado» en el informe y vocabulario en `migration-labels.ts`. |
| Documentación | Enmienda de ADR-110 D11; nota en la spec de importación. Sin cambio de PRD (RF-MIG-03 ya cubre la importación). |

## 4. Seguridad y privacidad

- Solo ADMIN con `migration.import.manage` guarda la equivalencia. Se audita en la misma transacción (actor, cliente de UISP, suscriptor destino), sin PII.
- La coincidencia se valida dos veces por HMAC del documento: al guardar y al promover. Un `target_ref` manipulado no enlaza a otra persona.
- Titulares anonimizados o con datos bloqueados nunca se complementan (ADR-094).
- Nada de nombres, documentos ni contactos en `migration_mappings`, en `counts` ni en `promotion_meta` (solo HMAC y nombres de campo).

## 5. Criterios de aceptación

1. Sin equivalencia, un titular existente se rechaza como hoy, con sus dependientes.
2. Con la equivalencia confirmada, el lote del cliente 22:
   - crea sus contratos como terminados;
   - importa todas las facturas, pagos con aplicaciones, tickets y soportes;
   - no crea un suscriptor nuevo y no modifica el contrato activo de iWana.
3. El informe muestra cuántas facturas se cruzan con la facturación de iWana y el saldo que traen, antes de promover.
4. Los campos vacíos se completan; ninguno con valor cambia. Las diferencias aparecen en el informe sin PII.
5. El lote concilia (`CONCILIADO`) cuando lo importado cuadra con UISP, aunque el suscriptor tenga facturas propias de iWana.
6. Reimportar el mismo ZIP no duplica nada (D3) y no pide confirmar otra vez.
7. Revertir deja al suscriptor como estaba antes del lote. Si un dato completado se editó después, la reversión se bloquea con motivo.
8. Una equivalencia hacia un suscriptor con otro documento, anonimizado o enlazado a otro cliente de UISP se rechaza con 422.
9. Los contratos históricos no generan facturas en el proceso diario ni órdenes de aprovisionamiento.

## 6. Pruebas

- Unitarias: simulación (sin equivalencia, con equivalencia correcta, con equivalencia a otro suscriptor, cruce), mapeo de datos a completar y validación de la equivalencia.
- Integración contra Postgres y Redis (`DB_NAME=test`), con un suscriptor existente con contrato y facturas propias más un ZIP sintético de dos servicios: promoción, conciliación, reimportación idempotente, reversión limpia y reversión bloqueada por dato editado.
- Generación diaria de facturas sobre un tenant con un contrato histórico: no factura.
- Portal: tarjeta del candidato, diálogo de confirmación, re-simulación y estado «Complementado».
- E2E del aprovisionador de importación con el caso complemento (regla G6: un spec E2E nuevo exige correr el aprovisionador).

## 7. Riesgos

| Riesgo | Mitigación |
|---|---|
| Cobro doble en el periodo cruzado (C3) | La observación y el saldo que trae se ven antes de promover; las facturas importadas cruzadas se pueden anular o ajustar después por el flujo de MOD14. |
| Deuda importada que dispara corte o suspensión (D14) | Se informa el saldo pendiente importado por titular antes de promover. |
| Enlazar a la persona equivocada | Doble validación por HMAC del documento y confirmación explícita por titular. |
| Reversión que borre al suscriptor | El suscriptor complementado nunca recibe `import_batch_id`; hay una prueba de integración que lo verifica. |

## 8. Fuera de alcance

- Fusionar dos suscriptores de iWana.
- Elegir campo por campo entre iWana y UISP.
- Corte de fechas automático o manual (se descartó en C3).
- Enlazar servicios de UISP con contratos existentes de iWana (se descartó en C4).
- Rellenar a posteriori clientes ya importados.

## 9. Gobierno

- **Enmienda de ADR-110 D11:** «Titulares existentes: la coincidencia por HMAC del documento es conflicto por defecto. Un administrador puede confirmar, por titular, una equivalencia `TITULAR` que complementa al suscriptor existente: contratos históricos terminados, historial completo y solo datos vacíos; nunca fusión de suscriptores ni sobrescritura».
- Después del G0 de esta spec: plan de implementación (`writing-plans`) y revisión de boundaries (CRM, Billing y migración por puertos).
