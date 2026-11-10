# Referencia comparativa — UISP CRM para MOD05 iWana neXt

**Tipo:** Referencia técnica comparativa  
**Módulo destino:** MOD05 CRM; módulos futuros de Facturación y Soporte; MOD13 Red y Aprovisionamiento  
**Versión:** 1.1 (reemplaza a [v1.0](REFERENCIA-UISP-CRM-MOD05-v1.0.md))  
**Cambios (cabecera):** v1.1 evalúa la cobertura contra MOD05, amplía con el contrato de la API CRM, contrasta con el CRM y Suscriptores implementados (§10), añade la configuración de tiempos de facturación y corte (§5.4) y, en la rev. 4 (2026-11-09), la interfaz y experiencia de usuario (§15); historial completo en §17.  
**Estado:** Aprobado como documento de consulta; no normativo  
**Fecha:** 2026-10-31  
**Audiencia:** arquitectura, producto, backend, integraciones y operaciones

## 1. Propósito y autoridad

Este documento resume los procesos y patrones funcionales del CRM de UISP (Ubiquiti) y los contrasta con el diseño vigente de iWana neXt, para usarlos como insumo al definir nuevas fases de MOD05 CRM, del módulo futuro de Facturación y de la integración con MOD13.

UISP es un referente comparativo, no una fuente de requisitos. Esta referencia no aprueba funciones, contratos de API, estados, reglas de cobro, políticas fiscales ni cambios de arquitectura. Si una recomendación se lleva a producto, debe formalizarse en el PRD, HLD o ADR dueño del cambio.

**Base de evidencia.** Ubiquiti no publica el código ni el esquema de base de datos de UISP. La fuente principal de esta versión es el **contrato público de la API CRM v1.0** (API Blueprint descargado el 2026-10-31, 266 KB, ~8 400 líneas), complementado con los artículos del centro de ayuda. Lo que aquí se describe es **lo que el contrato expone** (recursos, campos, enumeraciones y acciones). Las reglas internas (por ejemplo, el orden exacto de las transiciones de estado) se marcan como **inferidas** cuando no están documentadas de forma explícita.

## 2. Evaluación de cobertura de la v1.0

La v1.0 cubría bien la relación servicio → factura → pago → suspensión → red, pero dejaba sin tratar la mayor parte de la superficie que MOD05 ya gestiona o va a gestionar. La contrastación contra el alcance de MOD05 (PRD v2.0 y fases 02–09 de Suscriptores) arrojó estas brechas:

| Área de MOD05 | ¿Cubierta en v1.0? | Qué faltaba | Sección v1.1 |
|---|---|---|---|
| Captación: lead → cliente | No | Lead como bandera del cliente, conversión automática al activar un servicio cotizado | §3.1, §4 |
| Ficha del suscriptor (360°) | Parcial | Tipo de cliente, ID visible propio, dirección de facturación separada, saldo/crédito/deuda calculados, banderas operativas | §3.1 |
| Contactos | No | Contactos múltiples con propósito (facturación / avisos) y tipos configurables | §3.2 |
| Etiquetas, atributos personalizados, bitácora, documentos | No | Etiquetas con color, atributos tipados por entidad, bitácora manual, documentos desde plantilla | §3.2 |
| Cotización | No | Cotización como documento con estado; servicio en estado «Cotizado» que se activa | §3.3 |
| Plan comercial | Parcial | Periodos de precio (1/3/6/12/24 meses), cargo de instalación, penalidad por terminación anticipada, permanencia mínima, archivado | §3.4 |
| Ciclo de vida del servicio | Parcial (solo activo/suspendido) | 9 estados, pausa programada, cambio diferido, fin inmediato, motivos de suspensión, historial de periodos suspendidos | §4 |
| Cambio de plan | No | Solicitud de cambio (operador o cliente) con aceptación explícita | §4.3 |
| Condiciones contractuales del servicio | No | ID de contrato, contrato abierto/cerrado, permanencia, descuentos con vigencia, recargos | §3.5 |
| Parámetros de facturación por servicio | Parcial | Anticipado/vencido, día de inicio de periodo, prorrateo, agrupación en factura, uso automático de crédito | §5 |
| Mora y corte | Parcial | Días de vencimiento y días de gracia antes del corte por cliente; cargo por mora | §5.2 |
| Pagos | Parcial | Cobertura pago↔factura, pagos sin asignar, notas crédito, reembolsos | §5.3 |
| Soporte y visitas | No | Tickets con grupos, etiquetas y visibilidad; trabajos agendados ligados a ticket | §6 |
| Autoservicio del cliente | No | Zona de cliente: facturas, pagos, tickets, cambio de plan, reactivación | §7 |
| Integración y eventos | Parcial | Webhooks como notificación ligera que se rehidrata por API; claves de app de lectura/escritura | §8 |

Conclusión: la v1.0 era **insuficiente** para usarse como referencia del módulo completo. Esta versión cierra esas brechas con el contrato de la API como evidencia.

Revisión del 2026-11-09: a ambas versiones les faltaba la **interfaz** (navegación, distribución de formularios, menús, botones y ubicación de los elementos), así que no servían como referencia de UI/UX. §15 la cubre con capturas oficiales y notas de versión.

## 3. Modelo funcional observado

UISP organiza la operación alrededor de **cliente → servicio**. El cliente es la cuenta comercial; el servicio es la suscripción concreta, con su plan, dirección, condiciones contractuales, parámetros de facturación y estado operativo. Un cliente puede tener varios servicios en direcciones distintas.

~~~mermaid
flowchart LR
    CL["Cliente / lead"] --> CO["Contactos y tipos"]
    CL --> AT["Atributos, etiquetas, bitácora, documentos"]
    CL --> Q["Cotización"]
    CL --> SV["Servicio"]
    SV --> PL["Plan + periodo de precio"]
    SV --> SU["Recargos y descuentos"]
    SV --> FE["Cargos: instalación, terminación, mora"]
    SV --> LO["Ubicación de red"]
    SV --> INV["Factura"]
    INV --> PC["Cobertura de pago"]
    PC --> PAY["Pago / nota crédito"]
    CL --> TK["Tickets"] --> JB["Trabajos agendados"]
~~~

### 3.1 Cliente y lead

- **Lead y cliente son la misma entidad** con una bandera (`isLead`). La conversión registra la fecha (`leadConvertedAt`) y ocurre automáticamente al crear un servicio regular o activar un servicio cotizado.
- **Tipo de cliente:** residencial (nombre y apellido obligatorios) o empresa (razón social obligatoria, NIT, sitio web y contacto de la empresa).
- **Identificador visible** propio (`userIdent`, «Custom ID») distinto del ID técnico.
- **Dirección de contacto y dirección de facturación** separadas, con opción «igual a la de contacto», geocodificación y coordenadas.
- **Parámetros de cobro por cliente que heredan del sistema si son nulos:** días de vencimiento de factura, si se corta por mora, días de gracia antes del corte, envío de factura física, uso de proforma, impuestos por defecto.
- **Saldos derivados:** saldo, crédito y deuda pendiente, y banderas calculadas para la lista: tiene factura vencida, tiene servicio suspendido, tiene falla de red en su ubicación, tiene servicio sin equipo vinculado.
- **Archivado y restauración** del cliente, distintos de la eliminación.
- **Referido** (texto libre) y **ISP anterior** como datos de origen comercial.

### 3.2 Datos auxiliares del cliente

- **Contactos múltiples:** cada uno con correo, teléfono y nombre, y dos banderas de propósito: recibe avisos de facturación / recibe otros avisos. Además, tipos de contacto configurables.
- **Atributos personalizados** definidos por el operador, tipados (`string`, `integer`, `boolean`, `date`, `enum`, `url`), aplicables a cliente, servicio, factura o pago, con control de visibilidad en la zona de cliente. Se pueden usar como filtro en la API.
- **Etiquetas** de cliente (y de ticket) con color de fondo y de texto, filtrables.
- **Bitácora del cliente** (`client-logs`): entradas manuales con usuario y fecha.
- **Documentos** del cliente (documento, imagen u otro), subidos o **generados desde plantilla** (por ejemplo, contrato).
- **Organizaciones:** varias razones sociales emisoras por instalación, cada una con su numeración de facturas, proformas y cotizaciones.

### 3.3 Cotización

- La cotización es un documento con numeración propia, plantilla, notas visibles y notas internas, ítems, descuento, impuestos y estado **Abierta / Aceptada / Rechazada**; puede quedar vinculada a la factura resultante.
- Por separado, un servicio puede crearse en estado **Cotizado** y activarse después (`activate-quoted`) indicando la fecha de inicio del servicio y la fecha de inicio de facturación.

### 3.4 Plan de servicio

- Tipo **Internet** (velocidades, ráfaga, límite de datos y velocidad reducida al superarlo, agregación) o **General**.
- **Periodos de precio:** 1, 3, 6, 12 o 24 meses, cada uno con su precio y habilitación.
- **Condiciones comerciales en el plan:** cargo de instalación, penalidad por terminación anticipada y permanencia mínima en meses.
- Modalidad **prepago** con configuración propia; plan **público** (ofrecido en autoservicio) o no; agrupación de planes; **archivado** (un plan archivado no admite nuevas solicitudes de cambio).
- **Productos** (venta única con unidad) y **recargos** (cargo recurrente adicional, p. ej. IP pública, con precio por periodo).

### 3.5 Condiciones contractuales del servicio

El servicio conserva las condiciones aceptadas, que pueden diferir del plan:

- **Precio individual** sobre el del plan (`hasIndividualPrice`) y etiqueta de factura propia.
- **ID de contrato**, contrato **abierto** o **cerrado** (con fecha fin obligatoria), **permanencia mínima**.
- **Descuento** porcentual o fijo con vigencia ligada a periodos de facturación.
- **Recargos** por servicio con precio propio.
- **Cargos** generados por el servicio: instalación y terminación anticipada (`Fee`, que también modela el cargo por mora ligado a la factura vencida). Un cargo ya facturado no se puede eliminar.
- Dirección y coordenadas del servicio, que si no se indican se heredan del cliente.
- Precio total calculado para el periodo vigente, con recargos, descuentos e impuestos.

## 4. Ciclo de vida del servicio

### 4.1 Estados

| Valor | Estado | Significado observado |
|---|---|---|
| 0 | Prepared | Creado con fecha de activación futura |
| 1 | Active | En servicio |
| 2 | Ended | Terminado |
| 3 | Suspended | Suspendido (por mora o manual, con motivo) |
| 4 | Prepared blocked | Preparado y bloqueado (sin documentación pública del disparador) |
| 5 | Obsolete | Versión reemplazada por un cambio de plan |
| 6 | Deferred | Versión futura de un cambio programado |
| 7 | Quoted | Cotizado, pendiente de activación |
| 8 | Inactive | Inactivo (p. ej. pausado) |

### 4.2 Acciones del contrato de API

| Acción | Efecto documentado |
|---|---|
| `activate-quoted` | Activa un servicio cotizado con `activeFrom` e `invoicingStart`; convierte al lead en cliente |
| `suspend` / `cancel-suspend` | Suspende con un **motivo de catálogo** (`service-suspension-reasons`) o levanta la suspensión |
| `pause` | Pausa por un rango de fechas (`pauseDate` → `reactivateDate`), cancelable |
| `cancel-deferred-change` | Cancela un cambio diferido o una pausa programada |
| `end` | Termina de inmediato; el día en curso no se factura |
| `activeTo` | Fecha fin programada: detiene la facturación futura |
| `traffic-shaping-override` | Sobrescribe la velocidad del plan con fecha de expiración opcional |
| `unmsclientsite/bind` / `unbind` | Vincula o desvincula el servicio de la ubicación de red |

El servicio expone además el **historial de periodos de suspensión** (`suspensionPeriods`, inicio y fin) y el consumo de datos por periodo.

### 4.3 Cambio de plan

- El cambio se expresa como **solicitud** (`service-change-requests`) hacia un periodo de plan destino; puede crearla el operador o el cliente desde la zona de cliente, y requiere **aceptación explícita** (`accept`).
- Los estados `Deferred` y `Obsolete` indican que el cambio se modela como **versión nueva del servicio** que entra en vigor en una fecha, dejando la anterior como obsoleta. *Inferido* del enum y de `cancel-deferred-change`; el centro de ayuda no documenta la regla de fecha de efecto.

~~~mermaid
stateDiagram-v2
    [*] --> Quoted: crear cotizado
    [*] --> Prepared: crear con fecha futura
    [*] --> Active: crear y activar
    Quoted --> Active: activate-quoted
    Prepared --> Active: llega activeFrom
    Active --> Suspended: mora o suspend(motivo)
    Suspended --> Active: pago o cancel-suspend
    Active --> Inactive: pause
    Inactive --> Active: reactivateDate
    Active --> Obsolete: cambio de plan efectivo
    Deferred --> Active: llega la fecha del cambio
    Active --> Ended: end o activeTo
    Suspended --> Ended: end
~~~

Las transiciones del diagrama son **inferidas** a partir de las acciones y estados publicados; el contrato no publica una tabla de transiciones.

## 5. Facturación, mora y pagos

### 5.1 Parámetros de facturación por servicio

| Parámetro | Comportamiento |
|---|---|
| `invoicingPeriodType` | Vencido (factura al final del periodo) o anticipado (al inicio) |
| `invoicingPeriodStartDay` | Día de inicio del periodo: 1–28 o 31 (= último día del mes) |
| `nextInvoicingDayAdjustment` | Días de anticipación con que se genera la factura recurrente |
| `invoicingStart` | Fecha desde la que se factura (distinta de la activación) |
| `invoicingProratedSeparately` | El primer periodo prorrateado se factura solo o junto con el siguiente completo |
| `invoicingSeparately` | No agrupar este servicio con otros del cliente en una sola factura |
| `useCreditAutomatically` | Aplicar el saldo a favor automáticamente |
| `sendEmailsAutomatically` | Generar y enviar la factura recurrente sin aprobación |

La factura tiene estados **Borrador / Sin pagar / Pago parcial / Pagada / Anulada / Proforma procesada** y la acción `approve` para borradores.

### 5.2 Mora y corte

- Por cliente (heredable del sistema): **días de vencimiento** de la factura, **si se corta** por factura vencida y **días de gracia** antes del corte. Ejemplo documentado: vencimiento el 17 y 3 días de gracia → corte desde el 20.
- **Cargo por mora** generado sobre la factura vencida.
- El pago de lo vencido lleva a la reactivación; en prepago, el cliente puede reactivar desde la página de suspensión eligiendo los meses que paga.

### 5.3 Pagos y aplicación

- El pago se registra con método, monto y referencia del proveedor. Su aplicación a facturas se modela como **coberturas** (`PaymentCover`): cada cobertura toma un monto de un pago o de una nota crédito y lo asigna a una factura o a un reembolso.
- Los pagos pueden quedar **sin asignar** (`unattached`) y asignarse o desasignarse después (`attach` / `detach`).
- **Notas crédito** y **reembolsos** son documentos propios; el reembolso contable del CRM es distinto de la devolución en el medio de pago.
- Tarjetas tokenizadas con autopago y límite mensual; planes de pago recurrente con el proveedor.

### 5.4 Configuración de tiempos de facturación y corte

Análisis hecho el 2026-10-31 para el módulo de Facturación (MOD14), sobre las estructuras `Options`, `Client` y `Service` del contrato de la API.

UISP resuelve cada parámetro en tres niveles: **sistema → cliente → servicio**. Un valor nulo en un nivel hereda del superior.

| Parámetro | Nivel | Efecto |
|---|---|---|
| `invoicingPeriodType` | sistema y servicio | **Forward:** factura al inicio del periodo (anticipada). **Backward:** al final (vencida) |
| `invoicePeriodStartDay` / `invoicingPeriodStartDay` | sistema y servicio | Día de inicio del periodo: 1–28, o 31 para «último día» |
| `serviceInvoicingDayAdjustment` / `nextInvoicingDayAdjustment` | sistema y servicio | Genera la factura N días antes de la fecha por defecto |
| `invoiceTimeHour` | sistema | Hora en que corre la generación |
| `invoicingStart` | servicio | Inicio del cobro, distinto de la activación |
| `billingCycleType` | sistema | Prorrateo con meses de 30 días o con días reales |
| `invoicingProratedSeparately` | servicio | Primer periodo prorrateado en su propia factura o junto al siguiente |
| `invoicingSeparately` | servicio | No agrupar el servicio con los demás del cliente |
| `generateInvoicesForNewServicesImmediately` | sistema | Factura al crear el servicio |
| `automaticBillingEnabled` | sistema | Activa o detiene la facturación recurrente; al reactivarla retoma donde quedó |
| `approveAndSendInvoiceAutomatically` | sistema | Aprueba y envía sola, o deja borradores para revisión |
| `invoiceMaturityDays` (14 por defecto) | sistema, cliente y factura | Plazo de pago, que define el vencimiento |
| `stopServiceDue` | sistema y cliente | Si se corta o no por factura vencida |
| `stopServiceDueDays` | sistema y cliente | Gracia: 0 corta el día siguiente al vencimiento; con 3, un vencimiento el 17 corta el 20 |
| `suspensionMinimumUnpaidAmount` | sistema | Monto impago mínimo, por factura, para cortar |
| `suspendTimeHour` | sistema | Hora del corte |
| `stopInvoicing` | sistema | No factura vencido un periodo suspendido entero |
| `lateFee*` | sistema | Cargo por mora: activo, días, valor e impuesto |
| `notificationInvoiceNearDue*` / `notificationInvoiceOverdue*` | sistema | Avisos antes y después del vencimiento, con reintentos |

**Cómo lo adopta iWana:** ver [ADR-103](../adrs/ADR-103-Modulo-Facturacion-MOD14.md) D4 y D5.
- Dos niveles: tenant y contrato. El nivel cliente se descarta porque iWana factura por contrato.
- Dos modos de corte:
  - `DIA_FIJO_CICLO`, la regla de ADR-102 y el valor por defecto;
  - `VENCIMIENTO_MAS_GRACIA`, el modelo de UISP.
- El corte en día fijo solo se admite con cobro anticipado.
- Cada periodo congela la política vigente al generarse.

## 6. Soporte y trabajo de campo

- **Tickets** con estados **Nuevo / Abierto / Pendiente / Resuelto**, grupo y usuario asignados, etiquetas, visibilidad para el cliente (`public`), comentarios con adjuntos y actividad. Un ticket puede nacer sin cliente si trae correo o teléfono (entrada por IMAP).
- **Trabajos agendados** (`scheduling/jobs`) con estados **Abierto / En progreso / Cerrado**, fecha, duración, dirección, coordenadas, tareas, comentarios y adjuntos, y **vínculo con tickets**.
- La API permite saber si la última actividad fue del cliente (`isLastActivityByClient`), útil para colas de atención.

## 7. Autoservicio del cliente (Client Zone)

La zona de cliente es un acceso separado (usuario del cliente; sin usuario, el acceso está deshabilitado) con invitación por correo. El cliente puede ver facturas y pagos, descargar PDF, gestionar tarjetas, ver cotizaciones, ver sus servicios y planes públicos, **solicitar cambio de plan**, abrir y comentar tickets, ver periodos prepagados y reactivar un servicio suspendido o pausado.

## 8. Integración

- **API REST** con claves de aplicación de tipo **lectura** o **escritura**.
- **Webhooks** que emiten solo `uuid`, `entity`, `entityId` y `changeType`; el consumidor **rehidrata** el estado consultando la API (`GET /webhook-events/{uuid}` y el recurso). Pueden dispararse por cambios de cliente o de plan, entre otros.
- **Plugins PHP** dentro del proceso del CRM (no recomendado para iWana, ver §9).

## 9. Patrones valiosos y tratamiento recomendado en iWana

Leyenda: **Ya alineado** (iWana lo cubre) · **Adoptar** · **Adaptar** (con cambios por boundary, regulación o tenancy) · **Evaluar** (requiere decisión de producto) · **No adoptar**.

### 9.1 Captación y ficha

| Patrón UISP | Situación en iWana (verificada 2026-10-31) | Tratamiento |
|---|---|---|
| Lead y cliente en una entidad con bandera y fecha de conversión | iWana usa el **expediente progresivo** como entidad maestra del pipeline y crea el suscriptor en dos etapas (PRD v2.0, Fase 03) | **Ya alineado**, con un modelo más rico (8 estados de pipeline, completitud por secciones, consentimiento triple). No retroceder a una bandera |
| Conversión automática al activar un servicio cotizado | El suscriptor se activa por el evento `crm.expediente.activated` | **Ya alineado** |
| Tipo residencial / empresa con validación condicional | El perfil tributario y ADR-100 condicionan los datos por tipo de persona y RUT | **Ya alineado**; reglas fiscales colombianas prevalecen |
| Dirección de facturación separada de la de contacto/servicio | El contrato tiene dirección de instalación y dirección fiscal | **Ya alineado** |
| Saldo, crédito y deuda en la ficha; banderas «vencido», «suspendido», «sin equipo», «falla» | La lista operativa (Fase 06) tiene cola de trabajo; no hay saldo porque no existe registro de pagos | **Adoptar** las banderas como **proyecciones de lectura** vía puertos (Facturación, MOD13); CRM no calcula saldos |
| Contactos múltiples con propósito (facturación / avisos) | El titular tiene correo, teléfono, WhatsApp y un contacto alterno (nombre y teléfono). `ContactsModule` está **desmontado** por D-CONT (CTO, 2026-10-15): la tabla `subscriber_contacts` nunca tuvo migración y el contacto canónico es `party_contact` (ADR-030). La 360° devuelve `contacts: []` a propósito (ver §10.3) | **Evaluar en fase propia**, como pide D-CONT. Definir primero si se trata de **canales del titular** (correos y teléfonos adicionales, que `party_contact` ya modela por tipo) o de **personas de contacto** (familiar, administrador de sitio), que `party_contact` no modela porque no tiene nombre. Los propósitos (facturación, operativo, comercial) deben alinearse con el consentimiento triple de Ley 1581 |
| Atributos personalizados tipados por entidad | No existen | **Evaluar** con cautela: útil para necesidades por tenant, pero exige gobierno de PII (cifrado, Ley 1581) y no debe sustituir campos que el negocio necesita tipados |
| Etiquetas con color filtrables | No existen | **Adoptar** como candidato de baja complejidad para segmentar la lista (p. ej. VIP, corporativo) |
| Bitácora manual del cliente | El expediente tiene timeline; el suscriptor tiene `crm_lifecycle_change` y auditoría | **Evaluar** una nota manual en la vista 360° si producto la pide; la auditoría sigue siendo la fuente de verdad |
| Documentos generados desde plantilla (contrato) | MOD05 tiene soportes documentales y textos legales (privacy) | **Adoptar** como candidato: generar el contrato de servicio desde plantilla versionada, ligado a la versión aceptada |
| Varias razones sociales emisoras por instalación | La razón social es el tenant | **No adoptar** dentro de un tenant sin ADR; impacta numeración DIAN y tenancy |

### 9.2 Cotización, plan y contrato

| Patrón UISP | Situación en iWana | Tratamiento |
|---|---|---|
| Cotización con estado y vínculo a factura | `QuoteStatus`: `DRAFT / SENT / APPROVED / REJECTED / EXPIRED`; el contrato referencia `quote_id` | **Ya alineado** (iWana añade envío y vencimiento) |
| Plan y servicio con responsabilidades distintas; precio individual | El contrato guarda `plan_snapshot_json` | **Ya alineado**. Registrar explícitamente si el precio es individual o del plan cuando exista Facturación |
| Periodos de precio de 1/3/6/12/24 meses | Catálogo de planes en MOD03; ciclo mensual 1/15 (ADR-102) | **Evaluar** en MOD03 si el negocio vende planes semestrales o anuales |
| Cargo de instalación y penalidad por terminación anticipada en el plan | No modelados | **Adaptar:** la permanencia mínima y su penalidad están reguladas en Colombia por el régimen de protección de usuarios de la CRC; verificar el texto vigente antes de modelarlas. El cargo de instalación pertenece a Facturación |
| Contrato abierto / cerrado y permanencia mínima | El contrato tiene `start_date` y `end_date` | **Adaptar** con la misma salvedad regulatoria |
| Descuento con vigencia por periodos | No modelado | **Candidato para Facturación**; el contrato solo conserva la condición pactada |
| Recargos recurrentes (IP pública) y productos | El contrato tiene `additional_product_ids` y `additional_service_ids` | **Ya alineado** en intención; definir precio y periodicidad en Facturación |

### 9.3 Ciclo de vida del servicio

| Patrón UISP | Situación en iWana | Tratamiento |
|---|---|---|
| Estado del servicio separado del cliente | `ContractStatus`: `DRAFT / ACTIVE / SUSPENDED / TERMINATED / ARCHIVED`; el suscriptor deriva su estado de los contratos (Fase 05) | **Ya alineado** |
| Suspensión con **motivo de catálogo** e historial de periodos | Fase 05 introdujo motivo de catálogo y tabla de cambios de ciclo de vida | **Ya alineado**. Evaluar exponer los **periodos suspendidos** (inicio–fin) como proyección, útil para descuentos por indisponibilidad y reclamos CRC |
| Estado «preparado» con activación futura | No existe: el contrato pasa de `DRAFT` a `ACTIVE` | **Evaluar** si se necesita activar con fecha futura; hoy la activación depende de la culminación de instalación (ADR-088) |
| **Pausa** programada con fecha de reactivación | No existe | **Evaluar** como producto (suspensión voluntaria temporal). Debe distinguirse de la suspensión por mora en motivo, facturación y efecto en red |
| **Cambio de plan** como solicitud aceptada y versión diferida del servicio | **En construcción, sin commitear:** `POST /crm/contracts/:id/plan-change` cambia el plan **de inmediato** en contratos `DRAFT`/`ACTIVE`, con control de concurrencia (`expectedUpdatedAt`, `expectedMonthlyPrice`), snapshot del catálogo, recálculo de IVA y auditoría en la misma transacción; sin prorrateo, cargos ni cambio en red ([spec](../specs/2026-10-30-mod05-cambio-plan-contrato-ux.md)) | **Ya alineado** en el cambio inmediato. Queda como candidato el **cambio diferido** a fecha de periodo y la conservación de la versión anterior como registro consultable (hoy solo queda en auditoría). Requiere PRD y probablemente ADR (afecta Facturación y MOD13) |
| Terminación inmediata vs programada (`end` / `activeTo`) | `TERMINATED` sin fecha programada | **Evaluar** baja programada a fin de periodo, coherente con ADR-097 (avisos de terminación) |
| Sobrescritura temporal de velocidad con expiración | No existe | **Candidato para MOD13** (pruebas, cortesía, incidentes); no en CRM |

### 9.4 Facturación, mora y pagos

| Patrón UISP | Situación en iWana | Tratamiento |
|---|---|---|
| Ciclo y parámetros de facturación por servicio | ADR-102: ciclo por contrato, días 1 y 15, corte 15 y 30, último día si no existe | **Ya alineado** en el principio; iWana fija catálogo cerrado en vez de día libre 1–28/31 |
| Días de gracia antes del corte, por cliente | ADR-102 fija la fecha de corte por ciclo; sin gracia configurable | **No cambiar** ADR-102 por esta referencia. Si el negocio pide gracia por cliente, requiere ADR nueva |
| Anticipado vs vencido; prorrateo del primer periodo | No definido | **Candidato prioritario para Facturación**; decidir con el CTO y la regla fiscal colombiana |
| Factura con borrador y aprobación; envío automático opcional | No existe Facturación | **Adoptar** el patrón de borrador → aprobación para facturación electrónica DIAN |
| Aplicación de pagos por **coberturas** (pago/nota crédito → factura/reembolso) | No existe | **Adoptar** como modelo de referencia: trazabilidad monto a monto, pagos sin asignar y reasignables |
| Cargo por mora | No modelado | **Adaptar:** los intereses y cargos por mora están limitados por norma colombiana; requiere revisión legal |
| Saldo a favor aplicado automáticamente | No existe | **Candidato para Facturación** |
| Reactivación por pago | Corte manual vigente; automatización condicionada por ADR-102 | Mantener las precondiciones de §12 |

### 9.5 Soporte, autoservicio e integración

| Patrón UISP | Situación en iWana | Tratamiento |
|---|---|---|
| Tickets con grupos, etiquetas, visibilidad y «última actividad del cliente» | Fase 07: pestaña Soporte con tickets y visitas desde MOD09 vía puertos | **Ya alineado** en la vista; los campos de cola pertenecen a MOD09 |
| Trabajos agendados vinculados a ticket | Órdenes de trabajo y visitas en MOD09/MOD11 | **Ya alineado** fuera de MOD05 |
| Zona de cliente con cambio de plan, tickets y reactivación | No existe portal de suscriptor | **Evaluar** como módulo propio; requiere ADR de identidad del suscriptor (separada de usuarios del ISP) |
| Claves de API de solo lectura o escritura | RBAC granular (ADR-083) | **Ya alineado** con mayor granularidad |
| Webhook delgado que se rehidrata desde la fuente | Eventos de dominio y outbox | **Adoptar** el principio: el evento lleva identificadores, no datos personales; el consumidor consulta la fuente con permisos |
| Plugins PHP dentro del proceso del CRM | — | **No adoptar**: amplía la superficie de ataque y rompe el aislamiento por tenant |
| Configuración fiscal con o sin impuestos incluidos | Tributación/Parties y reglas IVA de iWana | **No copiar** reglas fiscales |

## 10. Contraste detallado con el módulo implementado (CRM y Suscriptores)

Comparación capacidad por capacidad entre UISP y lo que **existe hoy en el código** de iWana: API `apps/api/src/modules/crm` (22 entidades, 82 endpoints en 14 archivos de controlador), contratos compartidos de `packages/shared` y portal `apps/portal/src/app/dashboard/crm` (expedientes, suscriptores, ficha y agenda de corte). Verificado el 2026-10-31 sobre `main` (`1ce4f263`) más el árbol de trabajo sin commitear.

> **Vigencia:** esta sección es anterior a MOD14 (`de0bcfa7`); ver la nota al final de §15.8.

Veredictos: **iWana supera** · **Paridad** · **Brecha** (UISP lo tiene y iWana no) · **Brecha deliberada** (fuera de alcance por decisión vigente) · **Hallazgo** (defecto o deuda propia que el contraste destapó).

### 10.1 Resumen

| Dominio | UISP | iWana hoy | Veredicto |
|---|---|---|---|
| Captación | Bandera `isLead` en el cliente | Expediente progresivo completo | **iWana supera** |
| Ficha del titular | Cliente con contacto, facturación, saldos | Suscriptor con PII cifrada, fiscal, privacidad | **iWana supera**, salvo saldos (**brecha deliberada**) |
| Contactos | Múltiples, con propósito | Canales del titular y un contacto alterno; contactos adicionales retirados por D-CONT | **Brecha deliberada** (fase propia pendiente) |
| Segmentación | Etiquetas y atributos | Segmento de cliente y colas de trabajo | **Brecha** menor |
| Cotización | Documento + servicio cotizado | Modelo con 5 estados y aceptación, pero **ningún flujo vigente la produce** | **Paridad** en el modelo; **hallazgo** en el flujo |
| Servicio / contrato | 9 estados, condiciones contractuales ricas | 5 estados, snapshot de plan, IVA y estrato | **Paridad** en lo esencial; **brecha** en condiciones y estados programados |
| Acciones de ciclo de vida | Por servicio | Por suscriptor sobre varios servicios, con vista previa e idempotencia | **iWana supera** |
| Cambio de plan | Solicitud + diferido | Inmediato (sin commitear) | **Paridad parcial** |
| Facturación, pagos, mora | Completo | Ciclo y agenda de corte; puerto de facturación vacío | **Brecha deliberada** |
| Fiscal Colombia | Impuestos genéricos | Perfil tributario, RUT, IVA por estrato | **iWana supera** |
| Privacidad | Sin equivalente en la API | Consentimientos, ARCO, marcas, anonimización, bloqueo de titular | **iWana supera** |
| Soporte | Tickets y trabajos en el CRM | Pestaña Soporte por puertos a MOD09/MOD11 | **Paridad** (otro dueño) |
| Documentos | Del cliente, desde plantilla | Soportes versionados del expediente, evidencia de estrato | **Paridad parcial** |
| Red | Vínculo a ubicación, falla, shaping | Nodo de cobertura, estado comercial de aprovisionamiento | **Brecha** en señales de red en la ficha |
| Autoservicio | Zona de cliente | No existe | **Brecha** |
| Integración | Claves de API, webhooks | RBAC granular, eventos/outbox | **iWana supera** en control; sin webhooks externos |

### 10.2 Captación (expediente) — iWana supera

| Capacidad | UISP | iWana (evidencia) |
|---|---|---|
| Estados del prospecto | Lead sí/no | 8 estados de pipeline con campos mínimos por transición, descarte y reactivación (`crm/expedientes`, `PATCH :id/status`, `POST :id/reactivate`) |
| Captura | Formulario de cliente | 8 secciones con completitud (`PATCH :id/sections/:section`) |
| Seguimiento comercial | Bitácora manual | Intentos de contacto, verificación de cobertura, timeline, responsable con historial, atribución de origen |
| Consentimiento | — | Consentimiento triple Ley 1581 con revocación |
| Documentos | Archivo suelto | Soportes por clave con versión, estado y URL de descarga |
| Conversión | Automática al activar servicio | Dos etapas, evento `crm.expediente.activated`, registro de fallos y reintento (`POST :id/retry-conversion`) |

**Hallazgo:** el PRD v2.0 declara deprecado el flujo `PotentialLead/ProspectCase` («backend legacy preservado temporalmente»), pero `crm/potentials` y `crm/prospects` siguen expuestos; también `opportunities` y `crm/reviews`, cuyo papel frente al expediente conviene confirmar. UISP tiene un solo camino de captación; en iWana conviene fechar el retiro del flujo deprecado para no mantener dos embudos.

### 10.3 Ficha del suscriptor

| Capacidad | UISP | iWana (evidencia) | Veredicto |
|---|---|---|---|
| Identificación | Residencial/empresa, `userIdent` | Tipo de persona, segmento, tipo y número de documento cifrado con búsqueda por HMAC, NIT con DV, representante legal, `external_id` | **iWana supera** |
| Direcciones | Contacto y facturación | Dirección del titular con coordenadas y nodo de cobertura; dirección de instalación y fiscal en el contrato; actualización del punto de servicio con recálculo de IVA (`PATCH crm/contracts/:id/service-point`) | **Paridad** |
| Estado del titular | Derivado de banderas | `LEAD / PROSPECT / ACTIVE / SUSPENDED / CANCELLED` derivado de los contratos, con historial (`GET :id/lifecycle-changes`) | **iWana supera** |
| Archivado | Archivar/restaurar | Baja lógica, cancelación con motivo y anonimización | **iWana supera** |
| Saldo y deuda | Saldo, crédito, deuda, factura vencida | No existe (no hay registro de pagos) | **Brecha deliberada** |
| Contactos | Lista con propósito y tipo | Correo, teléfono, WhatsApp y contacto alterno en el suscriptor; canales de la parte en `party_contact` (ADR-030). El código de `crm/contacts/` se conserva pero el módulo está desmontado (D-CONT, 2026-10-15) y `subscriber_contacts` no existe en ningún tenant | **Brecha deliberada.** `contacts: []` en la 360° es intencional. Los contactos adicionales requieren fase propia con su migración. El plan de Fase 04 (A-BE6, 2026-09-04) que pedía crear `subscriber_contacts` quedó reemplazado por D-CONT |
| Cotizaciones en la 360° | — | **Corregido el 2026-10-31:** con revisión de `sr-backend` y GO en tres olas ([informe v1.2](../informes/INFORME-MOD05-360-COTIZACIONES-REVISION-v1.2.md)); el contrato de la 360° vive en `@iwana/shared` (RF-S404-50). `get360View` devuelve las cotizaciones del suscriptor y de su expediente de origen como resumen comercial (sin snapshot del plan; vacío si el titular está anonimizado), según RF-S404-25 | **Paridad** en la vista. Hoy la lista sale vacía porque nada crea cotizaciones CRM (ver §10.8) |
| Etiquetas y atributos | Sí | No; hay segmento de cliente | **Brecha** menor |
| Nota manual | `client-logs` | Timeline del expediente; no hay nota libre en el suscriptor | **Brecha** menor |

### 10.4 Lista y colas de trabajo

| Capacidad | UISP | iWana (evidencia) | Veredicto |
|---|---|---|---|
| Filtros operativos | Vencido, suspendido, falla, lead, sin equipo | Colas Activos, Suspendidos, Contacto pendiente, Datos fiscales incompletos, Sin servicios vigentes, con conteos globales (`GET crm/subscribers/queue-counts`) | **Paridad** en concepto; las colas de iWana son de calidad de datos |
| Señales externas | Vencido (facturación), falla y sin equipo (red) | No existen | **Brecha** que depende de Facturación y MOD13 |
| Uso móvil | App móvil con conteos | Tarjetas móviles con llamar y WhatsApp, vista lateral | **Paridad** |

### 10.5 Servicio, contrato y ciclo de vida

| Capacidad | UISP | iWana (evidencia) | Veredicto |
|---|---|---|---|
| Estados | 9 (incluye preparado, cotizado, diferido, obsoleto, inactivo) | `DRAFT / ACTIVE / SUSPENDED / TERMINATED / ARCHIVED` | **Brecha** en estados programados; el resto es **paridad** |
| Condiciones del servicio | Precio individual, descuento, recargos, permanencia, contrato abierto/cerrado, ID de contrato | Snapshot del plan, alias, productos y servicios adicionales, medio de pago, ciclo, datos fiscales, estrato con evidencia, IVA, fechas de inicio y fin | **Paridad parcial**: faltan descuento, permanencia y precio individual explícito |
| Fecha de inicio de cobro | `invoicingStart` distinta de la activación | Ciclo al activar (ADR-102) | **Brecha deliberada** hasta Facturación |
| Suspender, reactivar, terminar | Por servicio, con motivo | Por suscriptor sobre los servicios elegidos, **vista previa del efecto** (`services/preview`), motivo de catálogo por acción, clave de idempotencia, permisos únicos; también por contrato | **iWana supera** |
| Pausa programada | `pause` con fecha de reactivación | No existe | **Brecha** |
| Baja programada | `activeTo` | Solo terminación inmediata | **Brecha** |
| Periodos suspendidos | Lista inicio–fin en el servicio | Derivables de `crm_lifecycle_change`, no expuestos como periodos | **Brecha** menor |
| Cambio de plan | Solicitud, aceptación, diferido | Inmediato con concurrencia, IVA y auditoría (sin commitear) | **Paridad parcial** |

### 10.6 Facturación y corte — brecha deliberada

iWana tiene catálogo de ciclos (`GET crm/billing-cycles`), agenda de corte (`GET crm/billing-cycles/cutoff-agenda` y la pantalla `subscribers/agenda-corte`) y un `BillingActivationPort` cuyo único método es `activate`. UISP tiene facturas, pagos, coberturas, notas crédito, reembolsos, cargos y corte automático. La brecha es deliberada (PRD v2.0 fuera de alcance; ADR-102 condiciona el corte automático). §5 y §9.4 son el insumo para el PRD del módulo de Facturación.

### 10.7 Lo que iWana tiene y UISP no

- **Cumplimiento fiscal colombiano:** perfil tributario, responsabilidades RUT (ADR-100), tratamiento de IVA sugerido y confirmado, estrato con evidencia.
- **Privacidad:** consentimientos de habeas data, solicitudes ARCO, marcas de privacidad, anonimización y guarda de titular bloqueado en las mutaciones.
- **Control de concurrencia** en mutaciones sensibles (`expectedUpdatedAt`) e **idempotencia** en acciones de ciclo de vida.
- **Multi-tenant por schema** con auditoría en la misma transacción.

Estas capacidades no se deben sacrificar al adoptar patrones de UISP.

### 10.8 Acciones derivadas del contraste

1. **Cotizaciones en la 360° — corregido el 2026-10-31**, revisado y certificado (GO en tres olas, [informe v1.2](../informes/INFORME-MOD05-360-COTIZACIONES-REVISION-v1.2.md)); la revisión también publicó el contrato de la 360° en `@iwana/shared` y corrigió un desfase de un día al guardar fechas de nacimiento (`subscribers.service.ts`, `loadSubscriberQuotes`, con prueba unitaria y de integración contra la tabla real de la migración 028). Queda un **hallazgo de flujo**: ninguna pantalla ni proceso crea cotizaciones CRM. Solo existe `POST /quotes`, sin consumidor, y la conversión desde expediente fija `quoteId` en nulo. UISP sí integra la cotización al alta del servicio (§3.3); definir si iWana la necesita es decisión de producto.
   - **Contactos:** no es un defecto. D-CONT los retiró a propósito; los contactos adicionales van en una fase propia (§11).
2. **Hallazgo — flujo anterior de captación:** fechar el retiro de `potentials` y `prospects`, y confirmar si `opportunities` y `reviews` siguen vigentes.
3. **Cerrar el cambio de plan inmediato** que está en el árbol de trabajo antes de abrir el diferido.
4. Llevar las brechas de §10.5 (pausa, baja programada, periodos suspendidos) y de §10.4 (señales externas) a la lista de §11.

## 11. Candidatos priorizados para futuras definiciones

Ordenados por valor para MOD05 y dependencia. No son compromisos; cada uno requiere PRD propio.

| Prioridad | Candidato | Dueño probable | Dependencia |
|---|---|---|---|
| Alta | Cerrar el cambio de plan inmediato en construcción y definir después el diferido (solicitud, aceptación, efecto a fecha de periodo, versión anterior consultable) | MOD05 + Facturación + MOD13 | Gates de la ola actual; PRD + ADR para el diferido |
| Media | Fase propia de contactos adicionales: decidir canales del titular (`party_contact`) frente a personas de contacto, con su migración | MOD05 + Parties | Decisión del CTO (D-CONT) |
| Media | Flujo de cotización: decidir si la cotización CRM forma parte del alta del servicio o se retira | MOD05 | Decisión de producto |
| — | **En construcción:** MOD14 Facturación Fase 01 (política configurable §5.4, documentos de cobro, pagos por coberturas, saldo a favor, señal P1) | MOD14 | [ADR-103](../adrs/ADR-103-Modulo-Facturacion-MOD14.md) y [PRD Fase 01](../prds/PRD-MOD14-FACTURACION-FASE-01-v1.0.md), G0 aprobado el 2026-10-31 |
| Alta | Modelo de aplicación de pagos por coberturas y saldo a favor | Facturación | Módulo de Facturación |
| Alta | Banderas operativas en la lista (vencido, sin equipo, falla de red) como proyecciones | MOD05 lectura | Puertos de Facturación y MOD13 |
| Media | Pausa voluntaria programada distinta de la suspensión por mora | MOD05 + Facturación | Decisión de producto |
| Media | Baja programada a fin de periodo | MOD05 | ADR-097 |
| Media | Propósitos de contacto de catálogo alineados al consentimiento | MOD05 | Ley 1581 |
| Media | Contrato de servicio generado desde plantilla versionada | MOD05 + privacy/legal | Textos legales |
| Media | Permanencia mínima, cargo de instalación y penalidad | MOD05 + Facturación | Revisión regulatoria CRC |
| Baja | Etiquetas de suscriptor | MOD05 | Ninguna |
| Baja | Atributos personalizados por tenant | MOD05 | Gobierno de PII |
| Baja | Portal de autoservicio del suscriptor | Módulo nuevo | ADR de identidad |

## 12. Contraste con las decisiones vigentes de iWana

MOD05 tiene como entidad comercial principal el expediente progresivo y convierte al suscriptor en dos etapas. El PRD vigente deja fuera de alcance la implementación real de facturación, cobro, automatización de facturas y corte. `CrmModule` es un bounded context y consume capacidades de otros módulos mediante puertos. [PRD MOD05](../prds/PRD-MOD05-CRM-DEFINICION-v2.0.md) · [HLD MOD05](../hlds/HLD-MOD05-ARQUITECTURA-v2.0.md)

ADR-102 fija el ciclo de facturación por contrato y la agenda de corte; aún no existe registro de pagos que permita decidir automáticamente quién está en mora. El corte automático sigue condicionado a:

1. La señal autoritativa de pago por contrato y periodo.
2. La resolución de la revisión normativa pendiente mediante fuente oficial.
3. Un ejecutor de red con llamador real, o una decisión explícita de corte solo comercial.

La automatización de UISP ilustra el patrón negocio → red, pero **no** autoriza a habilitar corte en iWana ni a cambiar las fechas y reglas de ADR-102. [ADR-102](../adrs/ADR-102-Ciclo-Facturacion-y-Fecha-de-Corte-por-Servicio.md)

~~~mermaid
sequenceDiagram
    participant CRM as MOD05 CRM
    participant BILL as Facturación futura
    participant PAY as Pasarela
    participant OUT as Eventos / outbox
    participant NET as MOD13 / adaptador de red

    CRM->>BILL: Contrato activo y ciclo asignado
    BILL->>BILL: Calcula periodo y emite factura
    BILL->>PAY: Solicita o recibe el pago
    PAY-->>BILL: Resultado con referencia externa
    BILL->>BILL: Registra pago y coberturas de forma idempotente
    BILL->>OUT: Publica estado financiero confirmado
    OUT->>NET: Solicita suspensión o reactivación según política
    NET-->>OUT: Resultado de provisión
    OUT-->>CRM: Estado operativo conciliado
~~~

Esta secuencia es una propuesta de exploración, no un contrato aprobado. Facturación es dueña de factura, pago, periodo y mora; MOD13, de la ejecución sobre red; CRM conserva el contrato y consulta los estados por interfaces aprobadas.

## 13. Límites de la evidencia

- El contrato de API muestra **qué** existe, no siempre **cuándo** ocurre. Quedan sin documentación pública verificable: el disparador de `Prepared blocked`, la regla de fecha de efecto del cambio de plan, el algoritmo de prorrateo y el catálogo completo de eventos de webhook.
- El centro de ayuda de UISP es escueto en procesos de CRM (leads, cotizaciones, cargos); las búsquedas del 2026-10-31 no devolvieron artículos sobre esos temas.
- Si una fase futura necesita esas reglas con precisión, la vía es una instancia UISP de prueba (por ejemplo, en modo sandbox del CRM) y documentar la observación, no inferirla.

## 14. Criterios para usar esta referencia

1. Identificar primero el artefacto iWana vigente y el dueño del dato.
2. Usar este documento para extraer patrones, no requisitos textuales.
3. Comparar cada patrón con boundaries, tenancy, seguridad, Ley 1581, régimen CRC y reglas fiscales de iWana.
4. Registrar en el PRD qué se adopta, adapta o descarta y por qué.
5. Crear o actualizar ADR cuando el cambio altere boundaries, contratos entre módulos, seguridad o un patrón aprobado.
6. Mantener el ciclo por servicio y las precondiciones de corte de ADR-102 hasta que una decisión posterior aprobada los modifique.

## 15. Interfaz y experiencia de usuario

Añadida el 2026-11-09. Hasta la rev. 3, ni la v1.0 ni la v1.1 describían la interfaz de UISP: cubrían funciones y el contrato de la API, sin menús, formularios, botones ni ubicación de elementos. Esta sección cubre ese hueco y lo contrasta con el portal de iWana.

### 15.1 Evidencia y límites

| Clave | Fuente | Vigencia |
|---|---|---|
| **C20** | Capturas oficiales del centro de ayuda de UISP: pagos, reembolsos, ficha de pago, formulario de plan, sección de facturación del servicio, ajustes de facturación y página de suspensión | Nov. 2020, UISP 1.x. Son las capturas más recientes publicadas por Ubiquiti |
| **C18** | Capturas del sitio de producto de UCRM, predecesor del CRM de UISP: ficha del cliente, factura, agenda y zona de cliente | 2018. Interfaz anterior: sirve para la composición de las vistas, no para el estilo actual |
| **RN** | Notas de versión de UISP publicadas en la comunidad de Ubiquiti, hasta la 3.1.65 | Vigentes. Nombran los elementos de la interfaz, pero sin capturas |

Límites: no existe demo pública (`ucrm-demo.ubnt.com` no responde), la app móvil UISP CRM ya no está en la App Store y no se usó ninguna instancia propia. La disposición actual (UISP 3.x) puede diferir de C20 en estilo y en el orden de las pestañas. Para confirmar un detalle antes de diseñar, la vía es una instancia de prueba (§13).

### 15.2 Navegación global

- **Riel lateral de íconos sin texto** (C20), en este orden: Panel, Clientes, Facturación, Pagos, Agenda, Tickets, Reportes; separador; Notificaciones, Ayuda y Configuración. En C18 el menú era expandido, con texto y submenús por grupo (Facturación, Red, Sistema).
- **Barra superior** con búsqueda global «Search CRM» centrada, acceso al módulo de red y avatar (C20). En la 3.1.65 la cabecera se unificó con la del módulo de red para cambiar de módulo sin perder el contexto (RN).
- **Configuración por áreas con pestañas horizontales:** Facturación → Facturación, Suspensión, Cargos, Organización, Impuestos, Medios de pago, Suscripciones (C20). Los planes viven en Sistema → Planes y productos, y las claves de API en Sistema → Seguridad (RN).
- **Panel principal configurable** (3.1.65): el operador elige qué gráficos ver, y las etiquetas de cliente del panel enlazan a la lista ya filtrada (RN).

### 15.3 Página de detalle

Patrón común a cliente, pago y factura (C20, C18):

1. **Encabezado:** migas «Clientes / nombre», donde la sección es un enlace de vuelta, y junto al título un **botón dividido** de creación. Su rótulo es la acción principal («+ Reembolso») y su flecha abre las demás: pago, pagos múltiples, importar pagos y reembolso.
2. **Barra de íconos de acciones del documento** junto al título: editar, enviar por correo, descargar, imprimir y eliminar. Las acciones excepcionales van aparte, como enlace a la derecha («Reembolsar al medio de pago original»).
3. **«Ver como cliente»** arriba a la derecha de la ficha: abre la zona de cliente tal como la ve el suscriptor (C18).
4. **Pestañas** bajo el encabezado. En C20 se ven Resumen, Facturas y Proformas, y la captura corta las siguientes. En C18: Información, Facturas, Pagos y Red.
5. **Cuerpo en dos columnas de tarjetas** con título en mayúsculas pequeñas: a la izquierda los datos propios («Información básica», «Detalle del pago»); a la derecha las relaciones («Facturas», con número, total y monto aplicado).

### 15.4 Resumen del cliente

Composición de C18, corroborada por la descripción del producto:

- **Franja de indicadores** arriba a la izquierda: saldo de cuenta, crédito y pendiente (en rojo si hay deuda). Debajo, pago esperado y próximo día de facturación.
- **Tarjeta de datos:** ID, correo, teléfono, dirección, fecha de registro, tipo de cliente, organización, cuenta bancaria y notas.
- **Columna derecha, de arriba abajo:** servicios, cada uno con un punto de color por estado, el plan, el sitio y el equipo al que se conecta, el precio, una etiqueta si está suspendido o terminado y un botón «+» para agregar; un **mapa** con la ubicación de cada servicio; las **facturas** recientes, con las vencidas en rojo y un enlace «Ver todas».
- Además: bitácora de actividad, notas, documentos con vista previa de imágenes (RN 3.1.65) y, si hay pagos recurrentes, un recuadro con el enlace «Nueva suscripción».
- **Cliente archivado en solo lectura:** no se edita nada hasta restaurarlo, y sus tickets se cierran al archivar (RN 3.1.65).
- La zona de cliente **reutiliza la misma composición** sin acciones de operador (C18).

### 15.5 Formularios

Observado en C20:

- **Un control segmentado arriba que cambia los campos:** Internet o General en el plan.
- **Etiqueta con asterisco** en los obligatorios e **ícono de ayuda (?)** en cada etiqueta, con la explicación del campo.
- **Unidad pegada al campo** («Mbps», prefijo «USD») y **texto en línea** para los parámetros numéricos: «[3] días de anticipación».
- **Revelado progresivo:** enlaces bajo el campo, como «Definir etiqueta en factura» o «Definir detalles de shaping», abren los campos opcionales solo si hacen falta.
- **Periodos de precio en una fila** de campos de moneda: mensual, 2, 3 y 6 meses, 1 y 2 años.
- **Herencia visible:** junto a cada parámetro heredable, una casilla «usar el valor del sistema». Mientras está marcada, el control se ve deshabilitado **mostrando el valor heredado**.
- **Booleanos como interruptor SÍ/NO**, y **enumeraciones de dos o tres opciones como control segmentado** (Vencido / Anticipado; Al crear / Al vencer).
- **Ajustes en dos columnas:** etiqueta a la izquierda; a la derecha el control, el texto de ayuda con «Leer más» y, al lado, el campo que depende de él («Cobrar automáticamente [1] días antes del vencimiento»).
- **Modales:** título centrado, cierre con X, etiquetas a la izquierda y una **pista contextual bajo el campo crítico** («Crédito disponible: $100.00»). Abajo a la derecha, «Cancelar» como texto y «Guardar» como primario.
- **Confirmaciones:** el título nombra la acción y la frase destaca en negrita el monto afectado.

### 15.6 Listas y grillas

- Pestañas de vista sobre la lista (todos los pagos… reembolsos), **casilla de selección con contador** para acciones masivas, encabezados ordenables con flecha y estado vacío en texto (C20).
- Acciones masivas en grillas, como enviar facturas desde la ficha del cliente; más filtros en facturas (RN 3.1.65).
- Más columnas configurables en la lista de clientes y exportación de facturas (RN 2.2.12). Filtro por torre a la que está conectado el cliente (RN 1.4.2).
- El ID visible propio (`userIdent`) reemplaza al técnico en todas las grillas y exportaciones (RN).

### 15.7 Agenda, soporte y autoservicio

- **Agenda** (C18): encabezado con «+», **cola de trabajos sin asignar** en una columna a la izquierda y **línea de tiempo por técnico** (una fila por técnico, columnas por hora) con navegación por fecha y cambio de vista. Desde la agenda se pueden borrar varios trabajos a la vez (RN).
- **Tickets:** comentarios privados o públicos, con botón «Hacer público» (RN).
- **Zona de cliente:** menú lateral con Cuenta, Pagos, Facturas y Soporte (C18). Allí el cliente puede activar 2FA y vincular uno de sus servicios al ticket que abre (RN).
- **Página de suspensión:** mensaje grande de servicio vencido, rango de fechas del servicio, un selector «¿Necesita más tiempo?» y un botón primario «Reactivar servicio» (C20).

### 15.8 Contraste con el portal de iWana y tratamiento

Situación de iWana verificada el 2026-11-09 en `main` (`9ed55090`) más el árbol de trabajo: `Sidebar.tsx`, `TopHeader.tsx`, `components/crm/subscribers/` y `components/billing/` de `apps/portal`, y `packages/ui/src/components`. Tratamientos con la leyenda de §9.

| Patrón UISP | iWana hoy | Tratamiento |
|---|---|---|
| Riel lateral solo de íconos | Menú lateral con texto agrupado por módulo, que se puede colapsar | **Ya alineado.** No usar íconos sin texto como modo por defecto: afecta la accesibilidad y el vocabulario |
| Búsqueda global en la barra superior | `GlobalSearch` en `TopHeader` | **Ya alineado** |
| Encabezado de ficha: migas, acción primaria y menú | `SubscriberHeader`: acción primaria según el estado (Suspender o Reactivar servicios), con el motivo visible cuando está deshabilitada, y «Más acciones» | **iWana supera** |
| Botón dividido «+ Nuevo ▾» con varias creaciones | No hay creación rápida desde la ficha; «Registrar pago» vive en Pagos | **Evaluar** un «Registrar ▾» en la ficha (pago, ticket, visita), filtrado por permisos y delegado al módulo dueño de cada acción |
| Pestañas de la ficha | Vista general, Servicios, Facturación, Soporte, Datos, Tributario y Cumplimiento | **Paridad**, con más profundidad fiscal y de privacidad |
| Indicadores financieros en el **resumen** | Están en la pestaña Facturación (total facturado, total pagado, deuda pendiente, saldo a favor); el panel «Facturación» de la vista general solo muestra medio de pago, ciclo y razón social | **Adoptar:** llevar deuda pendiente, saldo a favor y próximo corte a la cabecera de la vista general como lectura de MOD14, con enlace a la pestaña |
| Servicios con punto de estado, precio y «+» | `ContractCard` con estado, precio, próximo corte y menú de acciones | **Paridad** |
| Mapa de servicios en el resumen | `LocationPreviewMap` en la pestaña Datos | **Evaluar** en la vista general. La ubicación es dato personal: mostrarla solo con permiso |
| Facturas recientes con vencidas en rojo y «Ver todas» | Documentos en la pestaña Facturación | **Adoptar** un bloque de los últimos documentos pendientes en la vista general. No usar solo el color para marcar el vencido: añadir texto o ícono |
| «Ver como cliente» | No hay portal del suscriptor | **Brecha deliberada** (§9.5) |
| Casilla «usar el valor del sistema» que **muestra el valor heredado** | `BillingContractPolicy` ofrece «Heredar» como opción o como placeholder, pero no muestra el valor efectivo | **Adoptar:** mostrar el valor del tenant junto a «Heredar» («Heredar (14 días)») para que el operador sepa qué aplica |
| Ayuda (?) por campo | No hay primitive de tooltip en `@iwana/ui` (sí `Popover` y `FormField`) | **Evaluar** con `ds-owner`: la ayuda debe ser accesible con teclado y con lector de pantalla, no solo al pasar el mouse |
| Control segmentado e interruptor SÍ/NO | No existen como primitives; hay `RadioCardGroup` y `CheckboxCard` | **Evaluar** con `ds-owner` antes de crear primitives nuevas (regla de consolidación de `core-components`) |
| Revelado progresivo de campos opcionales | `SectionAccordion` y `FormSection` en `@iwana/ui` | **Adoptar** el criterio en los formularios largos de suscriptor y contrato, con las primitives existentes |
| Pista contextual bajo el campo crítico | Parcial en los diálogos de cobro | **Adoptar** en los montos («Saldo a favor disponible: …») |
| Confirmación que destaca el monto | Diálogo de ciclo de vida con **vista previa del efecto** e idempotencia | **iWana supera** |
| Selección múltiple con acciones masivas | La lista de suscriptores no tiene selección múltiple | **Evaluar** solo para acciones de bajo riesgo (exportar, etiquetar, enviar aviso). La suspensión masiva exige otra decisión por su efecto en red y en cobro |
| Columnas configurables y exportación CSV | Colas, filtros, orden, vista lateral (`SubscriberPeek`) y tarjetas móviles | **Evaluar** la exportación con gobierno de PII (Ley 1581): campos mínimos, permiso y auditoría |
| Etiquetas de color enlazadas desde el panel | No existen | Ya listado en §11 (prioridad baja) |
| Cliente archivado en solo lectura | Estado cancelado sin «Más acciones»; guarda de titular bloqueado y anonimizado | **Ya alineado** |
| Agenda con cola sin asignar y línea de tiempo por técnico | Módulo Programación, fuera de MOD05 | **Contrastar en el módulo dueño**, no en MOD05 |
| Página de suspensión con reactivación por pago | No existe | **Evaluar** con autoservicio y MOD13. Depende de las precondiciones de corte de §12 |

Las filas «Adoptar» de la ficha (indicadores, documentos pendientes y valor heredado) se especifican en la [spec del estado de cuenta en la ficha](../specs/2026-11-09-mod05-ficha-estado-de-cuenta-ux.md), aprobada el 2026-11-09.

**Nota de vigencia de §10.** §10.3, §10.6 y §11 describen un estado anterior a MOD14: hoy existen pestaña Facturación, documentos de cobro, pagos y saldo a favor (publicados en `de0bcfa7`). Esta revisión no re-audita §10 completa. Antes de usar §10 para una decisión de facturación, contrastarla con el código vigente.

## 16. Fuentes

### Ubiquiti / UISP

- [API CRM estable (documentación)](https://unmscrm.docs.apiary.io/) y [API Blueprint fuente](https://jsapi.apiary.io/apis/unmscrm.apib) — recursos, estructuras y enumeraciones citadas en §3–§8 (consultado 2026-10-31).
- [UISP CRM API Usage](https://help.uisp.com/hc/en-us/articles/22590956856087-UISP-CRM-API-Usage) — separación entre CRM API y Network API; cliente con varios servicios.
- [Suspension, Traffic Shaping and Aggregation](https://help.uisp.com/hc/en-us/articles/22590998317719-UISP-Suspension-Traffic-Shaping-and-Aggregation) — relación servicio, plan, sitio, gateway, IP y reglas.
- [Prepaid Service and Service Reactivation](https://help.uisp.com/hc/en-us/articles/22590998643351-UISP-CRM-Prepaid-Service-and-Service-Reactivation) — prepago, pausa con «Active to», reactivación desde la página de suspensión.
- [CRM Refunds](https://help.uisp.com/hc/en-us/articles/22590982769175-UISP-CRM-Refunds) — reembolso contable vs devolución en el medio de pago.
- [CRM Pricing Mode](https://help.uisp.com/hc/en-us/articles/22590970611479-UISP-CRM-Pricing-Mode) — precios con o sin impuestos.
- [CRM Sandbox Mode](https://help.uisp.com/hc/en-us/articles/22590956782871-UISP-CRM-Sandbox-Mode) — entorno para observar comportamiento sin efectos reales.
- [CRM Plugins](https://help.uisp.com/hc/en-us/articles/22590998471191-UISP-CRM-Plugins) y [manifest](https://github.com/Ubiquiti-App/UCRM-plugins/blob/master/docs/manifest.md) — extensión PHP.
- [LibreQoS issue #455](https://github.com/LibreQoE/LibreQoS/issues/455) — uso de webhooks del CRM por un integrador externo.
- Capturas de los artículos [Refunds](https://help.uisp.com/hc/en-us/articles/22590982769175-UISP-CRM-Refunds), [Prepaid Service and Service Reactivation](https://help.uisp.com/hc/en-us/articles/22590998643351-UISP-CRM-Prepaid-Service-and-Service-Reactivation) y [Ubiquiti Payment Gateway](https://help.uisp.com/hc/en-us/articles/22590998395543-UISP-CRM-Ubiquiti-Payment-Gateway) — evidencia C20 de §15 (consultado 2026-11-09).
- [Sitio de producto UCRM](https://d7yy9pqew0o2n.cloudfront.net/) — capturas de 2018 de la ficha del cliente, factura, agenda y zona de cliente (evidencia C18 de §15).
- [Notas de versión de UISP (RSS)](https://community.ui.com/rss/releases/UNMS/ff938aa4-bc58-49da-b9f6-2fc48b875ab0), en particular [UISP 2.2.12](https://community.ui.com/releases/UISP-Application-2-2-12/6f998fe1-0213-476b-8416-6163f5758a0a) y [UISP 1.4.2](https://community.ui.com/releases/UISP-1-4-2/9a1f73df-ac97-4ad0-8ad9-763049e38cc7) — evidencia RN de §15.

### iWana neXt

- [PRD MOD05 CRM](../prds/PRD-MOD05-CRM-DEFINICION-v2.0.md) y PRD de Suscriptores, fases 02–09
- [HLD MOD05 CRM](../hlds/HLD-MOD05-ARQUITECTURA-v2.0.md)
- [ADR-102: ciclo de facturación y fecha de corte por servicio](../adrs/ADR-102-Ciclo-Facturacion-y-Fecha-de-Corte-por-Servicio.md)
- [ADR-097: puertos de lectura para avisos de terminación](../adrs/ADR-097-Puertos-de-lectura-para-avisos-de-terminacion-MOD05.md)
- [PRD maestro ISP Colombia](../prds/PRD_Sistema_ISP_Colombia_v2_4.md)
- [Spec de cambio de plan del contrato](../specs/2026-10-30-mod05-cambio-plan-contrato-ux.md) y [plan](../plans/2026-10-30-mod05-cambio-plan-contrato.md)
- Código verificado el 2026-10-31 en `main` (`1ce4f263`) y árbol de trabajo: controladores y entidades de `apps/api/src/modules/crm/`, `subscribers/subscribers.service.ts` (`get360View`), `subscribers/subscriber-queue-predicates.ts`, `ports/`, `packages/shared/src/schemas/lifecycle.schema.ts`, `packages/shared/src/enums/subscriber-status.enum.ts`, `apps/portal/src/app/dashboard/crm/` y `apps/portal/src/components/crm/subscribers/`

## 17. Historial

| Versión | Fecha | Cambio |
|---|---|---|
| 1.0 | 2026-10-31 | Versión inicial: servicio, factura, pago, suspensión e integración con red |
| 1.1 | 2026-10-31 | Evaluación de cobertura contra MOD05; ampliación con el contrato de API: lead, contactos, atributos, etiquetas, documentos, cotización, plan, condiciones contractuales, 9 estados del servicio, pausa, cambio de plan, parámetros de facturación, mora, coberturas de pago, soporte, zona de cliente, webhooks; contraste verificado con el código; candidatos priorizados y límites de la evidencia |
| 1.1 (rev.) | 2026-10-31 | Antes del primer commit: nueva §10 con el contraste capacidad por capacidad contra el CRM y Suscriptores implementados; corrige §9.3 (el cambio de plan inmediato existe en el árbol de trabajo); registra los hallazgos de contactos y cotizaciones vacíos en la vista 360° y del flujo de captación deprecado aún expuesto; renumera §11–§16 |
| 1.1 (rev. 2) | 2026-10-31 | Corrige el hallazgo de contactos: `contacts: []` es intencional por D-CONT (CTO, 2026-10-15), que reemplazó el plan A-BE6 de Fase 04. Registra la corrección de cotizaciones en la 360° y el hallazgo de que ningún flujo crea cotizaciones CRM |
| 1.1 (rev. 3) | 2026-10-31 | Añade §5.4 (configuración de tiempos de facturación y corte, insumo de ADR-103) y el enlace a MOD14 en §11 |
| 1.1 (rev. 4) | 2026-11-09 | Nueva §15 de interfaz y experiencia de usuario: navegación, página de detalle, resumen del cliente, formularios, grillas, agenda y autoservicio, con su evidencia y su contraste contra el portal. Añade la nota de vigencia de §10 tras MOD14. Fuentes pasa a §16 e Historial a §17 |
