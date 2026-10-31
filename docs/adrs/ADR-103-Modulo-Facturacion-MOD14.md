# ADR-103: Módulo de Facturación (MOD14) — cartera interna y política de facturación configurable

**Versión:** 1.0
**Estado:** Aprobado
**Aprobado por:** CTO Humano — 2026-10-31 (G0), con D-BIL-1 a D-BIL-12 resueltas según las recomendaciones del [PRD Fase 01](../prds/PRD-MOD14-FACTURACION-FASE-01-v1.0.md) §9
**Fecha:** 2026-10-31
**Autor:** AI-EM-ARCH
**Modo activo:** Product Architect + Architect + Orchestrator
**Aprobación requerida:** CTO. Abre un módulo funcional por encima de la cota de ADR-080, crea un bounded context con tablas propias en el schema tenant y enmienda D2 y D5 de ADR-102.
**Módulos:** MOD14 Facturación (nuevo, dueño) · MOD05 CRM (proveedor del contrato y consumidor de la señal de pago) · MOD07 Tributación (proveedor del IVA) · MOD06 Comercial (proveedor de precios) · MOD08 Parties (datos del adquirente) · MOD13 Red y Aprovisionamiento (ejecutor futuro del corte)
**Relacionado:** [ADR-102](ADR-102-Ciclo-Facturacion-y-Fecha-de-Corte-por-Servicio.md) (Aprobado; ciclo por contrato, corte y precondiciones P1–P3) · [ADR-080](ADR-080-Dependencia-Descubierta-y-Cierre-En-Construccion.md) (Aprobado; cota de dos módulos abiertos) · [ADR-093](ADR-093-Tratamiento-IVA-Internet-por-Punto-y-Linea-de-Servicio.md) (Aprobado; Billing resuelve el IVA por línea) · [ADR-083](ADR-083-Convergencia-RBAC-Granular-Modulos-Operativos.md) (permisos granulares) · [ADR-065](ADR-065-Paginacion-Numerada-Tablas-Operativas.md) (listas) · [ADR-094](ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md) (retención de 10 años y suplantación) · [ADR-100](ADR-100-Responsabilidades-RUT-Condicionales-para-Activar-Suscriptor.md) (traducción de RUT vacía a `R-99-PN` al emitir)
**PRD de la fase:** [PRD-MOD14-FACTURACION-FASE-01-v1.0](../prds/PRD-MOD14-FACTURACION-FASE-01-v1.0.md) · **Diseño:** [HLD-MOD14-FACTURACION-v1.0](../hlds/HLD-MOD14-FACTURACION-v1.0.md) · **Plan:** [2026-10-31-mod14-facturacion-fase-01-orquestacion](../plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md)
**Referencia no normativa:** [REFERENCIA-UISP-CRM-MOD05-v1.1](../referencias/REFERENCIA-UISP-CRM-MOD05-v1.1.md) §5 y §9.4

---

## Contexto

iWana no registra facturas ni pagos. Lo confirma ADR-102 en su verificación en código: «Facturación, pagos, cartera, Wompi: No existen». Esa ausencia tiene tres consecuencias:

- El corte automático de ADR-102 D6 está bloqueado por P1, que exige la señal «pago del periodo registrado» por contrato y periodo.
- La ficha del suscriptor no puede mostrar saldo ni deuda (RF-CRM-02 del PRD maestro).
- No puede haber reconexión por pago (RF-BIL-07).

El PRD maestro tiene Billing «No iniciado» en la Ola 3 («Billing → Provisioning → NMS»), sin número de módulo ni ADR. MOD13 se abrió antes que Billing.

### Decisiones tomadas en la sesión de definición (2026-10-31)

| # | Pregunta | Decisión |
| --- | --- | --- |
| A1 | Cómo registrar el módulo frente a la cota de ADR-080, con MOD05 y MOD13 abiertos | Abrir como **MOD14**, con excepción explícita (D1). Ratificada por el CTO en G0 (2026-10-31) |
| A2 | Alcance de la Fase 01 | **Cartera interna:** documentos de cobro por periodo sin DIAN, pagos manuales con aplicación, saldo a favor, estado de cuenta y la señal de periodo pagado |
| A3 | Momento de la factura recurrente y del corte | **Configurables**, siguiendo el modelo de UISP CRM (D4) |

**Resolución G0 (2026-10-31):** el CTO aprobó este ADR y las recomendaciones del PRD Fase 01 §9 (D-BIL-1 a D-BIL-12). Las decisiones D-BIL-2 (nombre legal del documento) y D-BIL-8 (redondeo) quedan con su valor provisional y bloquean G7 hasta tener fuente oficial o concepto del contador.

### Cómo lo resuelve UISP CRM

UISP resuelve cada parámetro en tres niveles, **sistema → cliente → servicio**, donde un valor nulo hereda del nivel superior. Fuente: el contrato de su API CRM v1.0, estructuras `Options`, `Client` y `Service`; ver la referencia UISP §5.4.

- **Momento del cobro:** anticipado o vencido (`invoicingPeriodType`).
- **Calendario del periodo:**
  - día de inicio del periodo, de 1 a 28 o 31 para «último día»;
  - días de anticipación de la generación;
  - inicio del cobro, distinto de la activación;
  - prorrateo con días reales o mes de 30;
  - primer periodo prorrateado en documento aparte o junto al siguiente.
- **Generación:** facturación automática sí/no, y borrador o aprobación automática.
- **Vencimiento y corte:**
  - plazo de pago (`invoiceMaturityDays`, 14 por defecto);
  - corte por vencida sí/no;
  - días de gracia (`stopServiceDueDays`). Con 0 se corta el día siguiente al vencimiento; con 3, un vencimiento el 17 corta el 20;
  - monto impago mínimo para cortar.

ADR-102 fija otra regla: **un día de corte por ciclo**, no un plazo relativo. Este ADR conserva esa regla como modo por defecto y añade el modelo de UISP como alternativa.

---

## Decisión

### D1. Se abre MOD14 Facturación por excepción a ADR-080

- Número **MOD14**, nombre visible «Facturación».
- Con MOD05 y MOD13 abiertos, abrir MOD14 supera la cota de dos módulos. La excepción se justifica:
  - es la cadena de ingreso de la Ola 3, ya aprobada;
  - desbloquea P1 de ADR-102;
  - MOD13 está a la espera de G7, diferido hasta la beta mínima (ADR-095).
- El CTO la ratificó en G0 el 2026-10-31 (D-BIL-1 del PRD). No se abre una cuarta línea funcional mientras MOD05, MOD13 y MOD14 sigan abiertos.

### D2. Bounded context `BillingModule`

- Código en `apps/api/src/modules/billing` y entidades en `packages/database/src/entities`.
- Billing es **dueño** de:
  - la política de facturación;
  - los periodos facturables;
  - los documentos de cobro con sus líneas e impuestos;
  - los pagos y sus aplicaciones;
  - el saldo a favor;
  - la señal de periodo pagado.
- Ningún otro módulo escribe en esas tablas.
- **Consume solo por puertos** y no lee entidades ajenas:

| Proveedor | Puerto | Para qué |
| --- | --- | --- |
| MOD05 CRM | `BillingContractReadPort` (**nuevo**, implementado por CRM) | Contratos facturables: estado, ciclo, inicio de cobro, precio del plan, `vatSnapshot`, adicionales y datos fiscales del adquirente. Hoy CRM solo exporta servicios; Billing no los importa |
| MOD07 Tributación | `IInternetVatResolverPort`, `ITaxApplicationReadPort` | IVA por línea (ADR-093) y tributos aplicables |
| MOD06 Comercial | `CommercialCatalogReadPort` | Precio vigente cuando el contrato no lo tiene congelado (D-BIL-7) |
| MOD08 Parties | `IPartyReadPort` | Identificación del adquirente |

- **Billing ofrece** a otros módulos:

| Puerto o evento | Consumidor | Contenido |
| --- | --- | --- |
| `BillingAccountReadPort` | MOD05 (ficha 360 y agenda de corte) | Estado de cuenta por contrato y suscriptor; estado de pago del periodo vigente (`BillingPeriodPaymentState`, D3) |
| Evento `billing.contract-period.paid` | MOD05, y MOD13 a futuro | Contrato, periodo y fecha. Se emite después del commit |
| Evento `billing.contract-period.reopened` | MOD05 | Se emite al anular un pago que dejaba el periodo pagado |

- Los eventos llevan solo identificadores, sin datos personales. El consumidor rehidrata por puerto.
- `BillingActivationPort` (CRM, flujo antiguo de prospectos) queda como stub y no recibe uso nuevo.

### D3. Documento de cobro por contrato y periodo

- Se emite **un documento por contrato y periodo**. No se agrupan servicios del mismo suscriptor: el corte es por servicio (ADR-102 D1), y la señal de pago debe ser por contrato y periodo.
- El documento de la Fase 01 es **interno, no es factura electrónica**. Su nombre legal visible («cuenta de cobro», «documento de cobro» u otro) se fija en G0 con fuente oficial (D-BIL-2). Mientras tanto el código usa `billing_document`.
- **Ciclo de vida:** `BORRADOR` → `EMITIDO` → `ANULADO`.
  - El borrador se edita o se descarta.
  - El documento emitido es inmutable: se corrige anulando con motivo auditado y reemitiendo.
  - Las notas crédito y débito electrónicas son de la Fase 02.
- **Estado de pago** (`BillingPeriodPaymentState`): se deriva, no se persiste. Es el mismo vocabulario para el documento, el puerto y la agenda, evaluado en este orden:
  1. `SIN_DOCUMENTO`: el periodo no tiene documento emitido y vigente;
  2. `PAGADO`: lo aplicado cubre el total;
  3. `VENCIDO`: no está pagado y la fecha del tenant es posterior al vencimiento, tenga o no pagos parciales;
  4. `PARCIAL`: tiene aplicaciones que no cubren el total y no está vencido;
  5. `PENDIENTE`: sin aplicaciones y no vencido.

  Un documento solo en borrador cuenta como `SIN_DOCUMENTO` para el periodo.
- **Consecutivo:** propio por tenant, sin huecos entre emitidos, con advisory lock por tenant y reintento ante colisión (patrón de `wfm/services/work-orders.service.ts`). El borrador no consume número; la anulación conserva el suyo.
- **Líneas:**
  - el plan, desde el precio congelado del contrato;
  - los adicionales con precio (D-BIL-6);
  - los ajustes de prorrateo.
- **IVA por línea:** según el `vatSnapshot` del contrato (ADR-093). Una línea sin tratamiento resoluble falla cerrado y el documento no se emite.

### D4. Política de facturación configurable en dos niveles

- **Tenant:** una fila con los valores por defecto.
- **Contrato:** sobrescrituras, donde `null` hereda.
- Son el equivalente a los niveles sistema y servicio de UISP. El nivel cliente se descarta porque iWana factura por contrato.

| Campo | Nivel | Valores | Por defecto |
| --- | --- | --- | --- |
| `periodTiming` | tenant y contrato | `ANTICIPADO` · `VENCIDO` | `ANTICIPADO` |
| `cycleDay` | contrato (ADR-102 D1) | `cycle_day` activo del catálogo | — (obligatorio al activar) |
| `generationLeadDays` | tenant y contrato | 0–15 | 0 |
| `cutoffMode` | tenant | `DIA_FIJO_CICLO` · `VENCIMIENTO_MAS_GRACIA` | `DIA_FIJO_CICLO` |
| `paymentTermDays` | tenant y contrato | 0–60; solo en `VENCIMIENTO_MAS_GRACIA` | 14 |
| `graceDays` | tenant y contrato | 0–30; solo en `VENCIMIENTO_MAS_GRACIA` | 0 |
| `cutoffEnabled` | tenant y contrato | sí/no | sí |
| `minimumUnpaidForCutoff` | tenant | ≥ 0 | 0 |
| `prorationMethod` | tenant | `DIAS_REALES` · `MES_30` | D-BIL-4 |
| `firstPeriodMode` | tenant y contrato | `SEPARADO` · `JUNTO_AL_SIGUIENTE` | D-BIL-4 |
| `billingStartDate` | contrato | fecha | fecha de activación |
| `automaticGeneration` | tenant | sí/no | no (D-BIL-5) |
| `approvalMode` | tenant | `BORRADOR` · `AUTOMATICA` | `BORRADOR` (D-BIL-5) |
| `generationHour` | tenant | 0–23, en la zona del tenant | 6 |
| `autoApplyCredit` | tenant | sí/no: aplicar el saldo a favor al emitir (D6) | sí |
| `documentPrefix` | tenant | 1–10 caracteres del consecutivo (D3) | `DC` |

**Reglas:**

1. `DIA_FIJO_CICLO` exige `ANTICIPADO`. Con cobro vencido, el documento se emite al final del periodo y el día fijo de corte caería antes. La API rechaza la combinación con 422 `BILLING_POLICY_INCOMPATIBLE`, tanto en el tenant como en la sobrescritura de un contrato.
2. **El periodo congela su política.** Al generar el periodo se guarda la política efectiva. Cambiar la configuración afecta solo a periodos futuros; nunca a documentos ya generados.
3. Los cambios de política se auditan con valor anterior y nuevo, y se guardan con control de concurrencia (`expectedUpdatedAt`).

### D5. Calendario: un único módulo de funciones puras en `@iwana/shared`

Todo cálculo de fechas de facturación vive en `packages/shared/src/calendar/billing-calendar.ts`, un módulo nuevo de funciones puras (HLD §4). Ese módulo **reutiliza** `computeCutoffDate` de `billing-cutoff.ts`, que no cambia de archivo, firma ni resultado. Ni la API ni el portal calculan fechas fuera de este módulo.

- **Periodo M del contrato:** del día `cycleDay` de M al día anterior a `cycleDay` de M+1. Con ciclo 1 va del 1 al último día del mes; con ciclo 15, del 15 de M al 14 de M+1.
- **Fecha de generación:**
  - `ANTICIPADO`: inicio del periodo − `generationLeadDays`;
  - `VENCIDO`: inicio del periodo siguiente − `generationLeadDays`.
- **Corte y vencimiento:**

| Modo | Corte | Vencimiento |
| --- | --- | --- |
| `DIA_FIJO_CICLO` | `computeCutoffDate(cycleDay, cutoffDay, M)`, sin cambios. Ciclo 1 → 15 de M; ciclo 15 → 30 de M, o 28/29 en febrero | Día anterior al corte (D-BIL-3) |
| `VENCIMIENTO_MAS_GRACIA` | Vencimiento + máx(1, `graceDays`), igual que UISP: con gracia 0 se corta el día siguiente | Emisión + `paymentTermDays` |

- **Prorrateo:** valor = precio del periodo × días cubiertos ÷ días del periodo. Los días del periodo son los reales o 30, según `prorationMethod`.
- Todo se calcula en la zona horaria del tenant (`settings.timezone`). No hay corrimiento por festivos (ADR-102 C3).

### D6. Pagos y aplicación

- **Registro:** pago manual con método de catálogo cerrado (D-BIL-10), monto, fecha, referencia y nota.
  - Exige `Idempotency-Key`.
  - Solo anulable con motivo y auditoría, nunca editable.
- **Aplicación por coberturas:** cada `billing_payment_allocation` toma un monto del pago y lo asigna a un documento emitido.
  - El remanente sin asignar es **saldo a favor** del suscriptor.
  - Puede asignarse a mano o, según la política, automáticamente a los documentos más antiguos sin pagar del mismo suscriptor.
- **Anular un pago** revierte sus coberturas en la misma transacción. Si un periodo deja de estar pagado, se emite `billing.contract-period.reopened`.
- **Señal P1:** un periodo está **pagado** cuando la suma de las coberturas de su documento emitido es igual o mayor que su total. Al pasar a pagado se emite `billing.contract-period.paid`, una sola vez por transición e idempotente por (contrato, periodo).

### D7. Enmienda a ADR-102

| Decisión de ADR-102 | Cambio |
| --- | --- |
| D2 · catálogo `crm_billing_cycles` | La propiedad pasa a Billing, como D2 preveía. **En la Fase 01 la tabla no se mueve ni se renombra.** Billing la lee por el contrato tipado existente y sus consumidores no cambian. Moverla es decisión D-BIL-9 |
| D5 · cálculo del corte | Se generaliza a los dos modos de D5 de este ADR. Con los valores por defecto (`ANTICIPADO` + `DIA_FIJO_CICLO`) el resultado es **idéntico** al de ADR-102 en cada contrato vigente |
| D6 · corte automático | **Sigue bloqueado.** Este ADR cumple P1, pero P2 (régimen CRC) y P3 (ejecutor en red o corte solo comercial) siguen abiertas. La Fase 01 no corta |
| D7 · agenda de corte | Muestra el estado de pago del periodo por el puerto `BillingAccountReadPort`. La acción de corte sigue siendo la suspensión manual |

### D8. Permisos y configuración

- `BILLING_INVOICES_READ`, `BILLING_INVOICES_MANAGE`, `BILLING_PAYMENTS_READ` y `BILLING_PAYMENTS_REGISTER` pasan de `RESERVED` a `ASSIGNABLE`, por migración tenant con el patrón de `162_seed_network_permissions.ts`.
- Se añade `BILLING_POLICY_MANAGE` para editar la política.
- La sección de Configuración «Facturación» deja `COMING_SOON` y aloja la política del tenant.

### D9. Fuera de la Fase 01

- Factura electrónica DIAN y su proveedor tecnológico (ADR propio en la Fase 02; depende de las respuestas del contador sobre códigos de tributo).
- Notas crédito y débito.
- Pasarelas de pago.
- Cargo por mora.
- Notificaciones por correo o WhatsApp.
- Exportación contable.
- Conciliación bancaria.
- Corte y reconexión automáticos (ADR-102 D6).
- Descuentos y permanencia.

---

## Alternativas descartadas

**A1. Corte solo por vencimiento más gracia, como UISP.** Cambiaría la fecha de corte de todos los contratos vigentes y contradiría la regla del CTO de ADR-102. Por eso queda como modo opcional, no como reemplazo.

**A2. Tres niveles de configuración (sistema, cliente y servicio), como UISP.** iWana factura y corta por contrato (ADR-102 D1). Un nivel cliente añade una herencia más sin un caso de negocio que la pida.

**A3. Un documento por suscriptor que agrupe sus contratos.** Impide la señal de pago por contrato y periodo que exige el corte por servicio.

**A4. Empezar por la factura electrónica DIAN.** Depende de un proveedor tecnológico sin ADR y de los códigos de tributo que el contador aún no responde. Retrasaría P1 sin necesidad.

**A5. Persistir el estado de pago.** Es derivable de las aplicaciones y del vencimiento; persistirlo obliga a recalcularlo con cada pago, anulación o cambio de fecha. Solo se persiste la transición de la señal (`billing_period_signals`), para que el evento sea idempotente.

---

## Consecuencias

**Positivas**

- Existe por primera vez una fuente de verdad de lo cobrado y lo pagado por contrato y periodo: P1 de ADR-102 queda resuelta.
- La operación configura los tiempos de cobro y corte de cada ISP sin código, con valores por defecto que no alteran lo aprobado.
- La ficha 360 y la agenda de corte muestran deuda real.

**Negativas y costes**

- Se supera la cota de ADR-080: tres módulos abiertos en paralelo exigen disciplina de gates.
- El documento interno no sustituye la factura electrónica. Mientras no exista la Fase 02, el ISP debe facturar electrónicamente por fuera si la norma lo exige.
- CRM debe implementar un puerto de lectura nuevo para Billing.

**Impacto declarado**

| Dimensión | Impacto |
| --- | --- |
| Multi-tenant | Todas las tablas en el schema del tenant, con `tenant_id`; zona horaria del tenant; consecutivo por tenant; job diario por tenant con contexto explícito en el payload |
| Seguridad | Permisos granulares nuevos; auditoría dentro de la transacción; datos fiscales del adquirente congelados en el documento y protegidos por ADR-058; sin PII en logs ni en eventos |
| Escala | Generación idempotente por (contrato, periodo) con índice único; listas paginadas (ADR-065) |
| Regulación | Sin factura electrónica en esta fase; nombre legal del documento sujeto a fuente oficial; corte bloqueado por P2; retención de 10 años (ADR-094) |
| Boundaries | Solo puertos; ningún módulo lee tablas de Billing; Billing no lee entidades de CRM, Comercial ni Tributación |
| Cota de ADR-080 | Excepción declarada (D1), sujeta a ratificación en G0 |

---

## Riesgos

| # | Riesgo | Mitigación |
| --- | --- | --- |
| R1 | Un documento interno se confunde con una factura legal | Nombre visible fijado con fuente oficial (D-BIL-2) y leyenda en el PDF; DIAN en la Fase 02 |
| R2 | Error de fechas en meses cortos, cambio de año o zona horaria | Pruebas en tabla de la función de calendario: febrero 28/29, meses de 30/31, diciembre → enero, y fecha local a las 19:00–23:59 de Bogotá |
| R3 | El job y un pago concurrente dejan un periodo con estado incoherente | Advisory lock por (contrato, periodo); la señal se calcula dentro de la transacción del pago o de la anulación |
| R4 | Doble generación del mismo periodo por reintento del job | Índice único (contrato, inicio de periodo), advisory lock por (contrato, periodo) y un único job repetible por tenant con `jobId` determinista (HLD §6.1) |
| R5 | Contratos activos sin precio congelado (los convertidos de expediente guardan solo `{id, source}`) | D-BIL-7: resolver el precio vigente por puerto al generar, o hacer backfill. El documento nunca sale con precio 0 silencioso |
| R6 | Cambiar la política altera periodos ya generados | El periodo congela la política efectiva (D4, regla 2) |
| R7 | Se habilita el corte sin aviso previo exigido por la CRC | D6 de ADR-102 sigue bloqueado por P2; esta fase no corta |
