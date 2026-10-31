# PRD-MOD14 — Facturación · Fase 01: Cartera interna y política de facturación

**Versión:** 1.0
**Estado:** Aprobado
**Aprobado por:** CTO, 2026-10-31 (G0), con las recomendaciones de §9 (D-BIL-1 a D-BIL-12). D-BIL-2 y D-BIL-8 quedan provisionales y bloquean G7.
**Fecha:** 2026-10-31
**Emisor:** AI-EM-ARCH (modo Product Architect + EM)
**Decisión de arquitectura:** [ADR-103](../adrs/ADR-103-Modulo-Facturacion-MOD14.md) · enmienda D2 y D5 de [ADR-102](../adrs/ADR-102-Ciclo-Facturacion-y-Fecha-de-Corte-por-Servicio.md)
**Diseño:** [HLD-MOD14-FACTURACION-v1.0](../hlds/HLD-MOD14-FACTURACION-v1.0.md)
**Plan:** [2026-10-31-mod14-facturacion-fase-01-orquestacion.md](../plans/2026-10-31-mod14-facturacion-fase-01-orquestacion.md)
**Requisitos de origen:** [PRD maestro](PRD_Sistema_ISP_Colombia_v2_4.md) §5:
- RF-BIL-02 «factura automática al inicio del ciclo con prorrata», adaptado sin DIAN;
- RF-BIL-06, sustituido por ADR-102;
- RF-BIL-07, solo la señal de pago;
- RF-CRM-02, facturas en la ficha 360.

Y [PRD MOD05 Fase 09 v1.1](PRD-MOD05-CRM-SUBSCRIBERS-FASE-09-v1.1.md) §9.2 (dependencia P1). El motor de IVA de RF-BIL-09 se aplica conforme a ADR-093, que fija el tratamiento por punto y línea de servicio y asigna a Billing la resolución por línea.

**Referencia no normativa:** [UISP CRM v1.1](../referencias/REFERENCIA-UISP-CRM-MOD05-v1.1.md) §5 y §9.4

---

## 1. Problema

El ISP presta el servicio, pero el sistema no sabe cuánto le cobró a cada suscriptor ni si le pagó.

- **No hay documentos de cobro, pagos ni saldos.** La ficha 360 no muestra deuda, y la agenda de corte de ADR-102 lista a todos los contratos del ciclo, hayan pagado o no.
- **El corte automático está bloqueado** por P1 de ADR-102: falta la señal «pago del periodo registrado».
- **Cada ISP cobra distinto:** unos por anticipado y otros por periodo vencido, con fechas de corte fijas o con plazo de pago más gracia. Hoy solo existe la regla fija 1→15 / 15→30.

## 2. Objetivo

Que cada contrato activo tenga, por cada periodo:
- un documento de cobro con su valor e IVA por línea;
- los pagos registrados y aplicados;
- un estado de pago confiable: pagado, pendiente o vencido.

Ese estado debe salir de una política de facturación que cada ISP configura sin código.

**Resultado medible:** al cerrar la fase, para cualquier contrato activo con ciclo, la agenda de corte del día muestra «pagado» o «pendiente» calculado desde los pagos, y la ficha 360 muestra el saldo del suscriptor.

## 3. Alcance

**Dentro:**

- Política de facturación del tenant y sobrescrituras por contrato (ADR-103 D4), con vista previa de las fechas resultantes.
- Generación de documentos de cobro por contrato y periodo:
  - automática (job diario por tenant) o manual;
  - en borrador o con aprobación automática;
  - con consecutivo propio;
  - anulación con motivo.
- Líneas del plan y de los adicionales con precio, prorrateo e IVA por línea (ADR-093).
- Registro manual de pagos, aplicación a documentos, saldo a favor, aplicación automática y anulación de pagos.
- Estado de cuenta por suscriptor y por contrato.
- Pestaña «Facturación» en la ficha del suscriptor.
- Estado de pago del periodo en la agenda de corte existente.
- PDF del documento de cobro.
- Permisos de facturación y sección «Facturación» en Configuración.
- Señal de periodo pagado o reabierto (eventos de ADR-103 D2).

**Fuera** (ADR-103 D9):
- factura electrónica DIAN;
- notas crédito y débito;
- pasarelas de pago;
- cargo por mora;
- notificaciones;
- exportación contable;
- conciliación bancaria;
- **corte y reconexión automáticos**;
- descuentos y permanencia;
- agrupar varios contratos en un documento.

## 4. Actores

| Actor | Rol | Qué hace |
| --- | --- | --- |
| Administrador del ISP | `ADMIN` | Configura la política; emite, anula y genera documentos; registra y anula pagos |
| Cartera / contabilidad | `ACCOUNTANT` | Emite y anula documentos; registra y aplica pagos; consulta estados de cuenta |
| Atención al cliente | `SUPPORT`, `SALES` | Consulta el estado de cuenta en la ficha; registra pagos solo si su perfil tiene el permiso |
| Auditor | `AUDITOR` | Solo lectura |
| Sistema | job diario por tenant | Genera los periodos y documentos del día según la política |

La asignación definitiva de permisos por perfil se fija en el HLD §7 y se revisa con `sec-eng`.

## 5. Requisitos funcionales

### 5.1 Política de facturación

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-FAC-01 | El ISP configura su política: momento del cobro, días de anticipación de la generación, modo de corte, plazo de pago, días de gracia, corte sí/no, monto mínimo para cortar, prorrateo, primer periodo, generación automática, aprobación y hora de generación (ADR-103 D4) | MVP |
| RF-FAC-02 | Un contrato puede sobrescribir momento del cobro, anticipación, plazo, gracia, corte sí/no, primer periodo e inicio del cobro. Un campo vacío hereda la política del ISP | MVP |
| RF-FAC-03 | El sistema rechaza el corte por día fijo combinado con cobro vencido, con un mensaje que explica por qué | MVP |
| RF-FAC-04 | Al editar la política, y en el contrato, se muestra una **vista previa** con las próximas tres fechas de generación, vencimiento y corte, calculadas en el servidor | MVP |
| RF-FAC-05 | Los cambios de política aplican solo a periodos futuros. Cada periodo conserva la política con la que se generó | MVP |
| RF-FAC-06 | Los valores por defecto reproducen exactamente las fechas de corte de ADR-102 D5 (ver la tabla de ejemplos de §6 de este PRD) | MVP |

### 5.2 Documentos de cobro

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-FAC-10 | Con la generación automática activa, un proceso diario por ISP genera los periodos y documentos de los contratos que les toca ese día. Repetirlo no duplica nada | MVP |
| RF-FAC-11 | Un usuario con permiso genera manualmente el documento de un contrato y periodo, o los del día para todo el ISP | MVP |
| RF-FAC-12 | Un contrato activo o suspendido con ciclo genera periodos desde su inicio de cobro. Un contrato terminado deja de generar después de su fecha de fin | MVP |
| RF-FAC-13 | El primer periodo incompleto se prorratea según la política: en documento aparte o junto al siguiente | MVP |
| RF-FAC-14 | El documento lleva una línea por el plan y una por cada adicional con precio, con base, IVA por línea según el tratamiento del contrato, y total | MVP |
| RF-FAC-15 | Si una línea no tiene tratamiento de IVA resoluble o precio, el documento queda en borrador con el motivo visible y **no se puede emitir** | MVP |
| RF-FAC-16 | Con aprobación en borrador, el usuario revisa y emite uno o varios documentos. Con aprobación automática se emiten al generarse | MVP |
| RF-FAC-17 | Al emitir, el documento recibe el siguiente consecutivo del ISP, sin huecos entre emitidos, y congela los datos del adquirente y del emisor | MVP |
| RF-FAC-18 | Un documento emitido no se edita. Se anula con motivo de catálogo y nota; conserva su número; sus pagos aplicados vuelven a saldo a favor | MVP |
| RF-FAC-19 | El documento emitido se descarga en PDF con la leyenda de documento interno (D-BIL-2) | MVP |
| RF-FAC-20 | Lista de documentos con filtros por estado de pago, periodo, ciclo y suscriptor, paginada (ADR-065) | MVP |

### 5.3 Pagos

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-FAC-30 | Registrar un pago de un suscriptor: método de catálogo, monto, fecha, referencia y nota. Un reintento con la misma clave de idempotencia no lo duplica | MVP |
| RF-FAC-31 | Al registrar, el usuario aplica el pago a uno o varios documentos emitidos del suscriptor, o acepta la sugerencia: los más antiguos primero | MVP |
| RF-FAC-32 | El remanente no aplicado queda como saldo a favor del suscriptor y puede aplicarse después a mano | MVP |
| RF-FAC-33 | Con la aplicación automática activa, el saldo a favor se aplica a un documento al emitirse | MVP |
| RF-FAC-34 | Un pago no se edita. Se anula con motivo y nota, y sus aplicaciones se revierten en la misma operación | MVP |
| RF-FAC-35 | Un periodo pasa a «pagado» cuando lo aplicado a su documento cubre el total, y vuelve a «pendiente» o «vencido» si se anula un pago o el documento | MVP |

### 5.4 Consulta e integración

| ID | Requerimiento | Prioridad |
| --- | --- | --- |
| RF-FAC-40 | Estado de cuenta del suscriptor: documentos, pagos, aplicaciones, saldo pendiente y saldo a favor, con detalle por contrato | MVP |
| RF-FAC-41 | La ficha del suscriptor tiene la pestaña «Facturación» con el estado de cuenta y las acciones según permisos | MVP |
| RF-FAC-42 | La agenda de corte muestra el estado de pago del periodo de cada contrato: pago parcial, pagado, pendiente, vencido o sin documento (ADR-103 D3) | MVP |
| RF-FAC-43 | Cuando un periodo pasa a pagado o se reabre, el sistema lo publica para otros módulos, una vez por transición | MVP |
| RF-FAC-44 | Configuración → «Facturación» deja de estar en «Próximamente» y aloja la política del ISP | MVP |

## 6. Reglas de negocio

1. **Un documento por contrato y periodo.** Nunca dos documentos emitidos y vigentes para el mismo contrato y periodo.
2. **Periodo M:** desde el día de ciclo de M hasta el día anterior al día de ciclo de M+1.
3. **Generación:**
   - anticipado: inicio del periodo menos los días de anticipación;
   - vencido: inicio del periodo siguiente menos los días de anticipación.
4. **Corte y vencimiento:**
   - **día fijo** (por defecto): corte en el día de corte del ciclo (ADR-102) y vencimiento el día anterior (D-BIL-3);
   - **vencimiento más gracia:** vencimiento = emisión + plazo, y corte = vencimiento + máx(1, gracia).
5. **Día fijo solo con anticipado** (RF-FAC-03).
6. **Fechas** en la zona horaria del ISP, sin corrimiento por festivos (ADR-102 C3).
7. **Prorrateo:** precio del periodo × días cubiertos ÷ días del periodo, con días reales o mes de 30 según la política.
8. **Redondeo** según D-BIL-8. El total es la suma de las líneas redondeadas.
9. **Pagado** = suma de aplicaciones vigentes ≥ total del documento emitido.
10. **Vencido** = no pagado y la fecha del ISP es posterior al vencimiento.
11. Ninguna operación de esta fase **suspende ni reactiva** servicios.

**Ejemplos con los valores por defecto** (anticipado, día fijo, catálogo sembrado), que deben coincidir con ADR-102 D5. La columna «Vencimiento» aplica D-BIL-3 y no viene de ADR-102:

| Ciclo | Periodo | Generación | Vencimiento | Corte |
| --- | --- | --- | --- | --- |
| 1 | 2026-11-01 → 2026-11-30 | 2026-11-01 | 2026-11-14 | 2026-11-15 |
| 15 | 2026-11-15 → 2026-12-14 | 2026-11-15 | 2026-11-29 | 2026-11-30 |
| 15 | 2027-02-15 → 2027-03-14 | 2027-02-15 | 2027-02-27 | 2027-02-28 |
| 15 | 2028-02-15 → 2028-03-14 | 2028-02-15 | 2028-02-28 | 2028-02-29 (bisiesto) |
| 1 | 2026-12-01 → 2026-12-31 | 2026-12-01 | 2026-12-14 | 2026-12-15 |

**Ejemplo en modo vencimiento más gracia** (anticipado, plazo 14, gracia 3, ciclo 1): periodo 2026-11-01 → 2026-11-30, emisión el 2026-11-01, vencimiento el 2026-11-15 y corte el 2026-11-18. Con gracia 0, el corte es el 2026-11-16.

## 7. Criterios de aceptación

| ID | Criterio |
| --- | --- |
| CA-FAC-01 | Con la política por defecto, las fechas de §6 se reproducen en pruebas en tabla de la función de calendario, incluidos febrero 28/29 y diciembre → enero |
| CA-FAC-02 | Guardar «día fijo» con «vencido», en el ISP o en un contrato, devuelve 422 `BILLING_POLICY_INCOMPATIBLE` |
| CA-FAC-03 | Ejecutar dos veces el proceso del mismo día, en paralelo, deja un solo periodo y un solo documento por contrato. Prueba contra Postgres real, con conteo |
| CA-FAC-04 | 20 emisiones concurrentes en el mismo ISP producen 20 consecutivos distintos y sin huecos |
| CA-FAC-05 | Un contrato sin tratamiento de IVA o sin precio genera un borrador con motivo y su emisión devuelve 422 |
| CA-FAC-06 | Registrar el mismo pago dos veces con la misma clave de idempotencia crea un solo pago |
| CA-FAC-07 | Un pago que cubre el total pasa el periodo a pagado y publica la señal una sola vez. Anular ese pago lo reabre y publica la reapertura |
| CA-FAC-08 | Un pago mayor que la deuda deja el remanente como saldo a favor, que se aplica al siguiente documento si la política lo indica |
| CA-FAC-09 | Cambiar la política no altera las fechas ni los valores de periodos ya generados |
| CA-FAC-10 | La agenda de corte muestra el estado de pago correcto para contratos pagados, con pago parcial (vencidos y no vencidos), pendientes, vencidos y sin documento, según el orden de evaluación de ADR-103 D3 |
| CA-FAC-11 | Ningún endpoint de facturación responde sin el permiso correspondiente; la lectura no expone datos fiscales a roles sin acceso |
| CA-FAC-12 | Ninguna operación de la fase cambia el estado de un contrato ni del suscriptor |
| CA-FAC-13 | Toda mutación (política, documento, pago, aplicación, anulación) deja auditoría dentro de su transacción |
| CA-FAC-14 | El PDF del documento emitido se descarga y contiene número, periodo, líneas, IVA, total y la leyenda de documento interno |
| CA-FAC-15 | Cobertura ≥80 % en `billing`; migraciones reversibles con prueba de ida y vuelta contra Postgres real |

## 8. Vocabulario visible

Lo revisa `prod-ux` con `system-vocabulary-review`. El nombre del documento depende de D-BIL-2.

| Código | Texto visible |
| --- | --- |
| `billing_document` | Documento de cobro (provisional, D-BIL-2) |
| `BORRADOR` / `EMITIDO` / `ANULADO` | Borrador / Emitido / Anulado |
| `SIN_DOCUMENTO` / `PENDIENTE` / `PARCIAL` / `PAGADO` / `VENCIDO` | Sin documento / Pendiente / Pago parcial / Pagado / Vencido |
| `ANTICIPADO` / `VENCIDO` (momento) | Cobro anticipado / Cobro al final del periodo |
| `DIA_FIJO_CICLO` / `VENCIMIENTO_MAS_GRACIA` | Corte en día fijo del ciclo / Corte por plazo de pago más gracia |
| Saldo a favor | Saldo a favor |
| Aplicación | Aplicar pago |

## 9. Decisiones para G0 (resueltas el 2026-10-31)

| ID | Decisión | Opciones | Recomendación | Resolución del CTO (G0, 2026-10-31) |
| --- | --- | --- | --- | --- |
| D-BIL-1 | Ratificar la apertura de MOD14 por excepción a ADR-080 y aprobar ADR-103 | (a) aprobar · (b) esperar el cierre de MOD13 | (a); el usuario la pidió el 2026-10-31 |  |
| D-BIL-2 | Nombre legal y leyenda del documento interno | (a) «Cuenta de cobro» · (b) «Documento de cobro» · (c) otro con fuente oficial | **Requiere fuente oficial DIAN y concepto del contador.** No se inventa. Hasta resolverlo: (b) como provisional, con la leyenda «Documento interno: no es factura electrónica de venta» |  |
| D-BIL-3 | Vencimiento en modo día fijo | (a) día anterior al corte · (b) mismo día del corte | (a): coincide con «no registre pago → corte el día 15» de ADR-102 |  |
| D-BIL-4 | Prorrateo por defecto | Días reales o mes de 30; primer periodo aparte o junto al siguiente | Días reales y **aparte**: con cobro anticipado se cobra lo usado antes de prestar el periodo siguiente |  |
| D-BIL-5 | Generación y aprobación por defecto | (a) generación automática apagada y aprobación en borrador · (b) ambas automáticas | (a) en la Fase 01: el ISP revisa antes de emitir; se enciende por ISP en G7 |  |
| D-BIL-6 | Adicionales del contrato | (a) excluir de la Fase 01 · (b) ampliar `CommercialCatalogReadPort` con precio | (b) si MOD06 lo asume en la misma ola; si no, (a) con aviso visible |  |
| D-BIL-7 | Contratos activos sin precio congelado | (a) resolver el precio vigente por puerto al generar · (b) backfill único del snapshot | (b) por migración con informe de lo corregido, más (a) como verificación |  |
| D-BIL-8 | Redondeo | (a) pesos enteros por línea · (b) dos decimales | **Requiere concepto del contador.** Provisional: (b) en base de datos y (a) solo en la presentación |  |
| D-BIL-9 | Traspaso de la tabla `crm_billing_cycles` | (a) se queda en CRM y Billing la lee por contrato · (b) se mueve a Billing en esta fase | (a): menos riesgo; el traspaso, en una fase posterior |  |
| D-BIL-10 | Métodos de pago | Catálogo cerrado propuesto: efectivo, transferencia, consignación, datáfono, otro | Catálogo cerrado; el texto libre `contracts.payment_method` queda como dato heredado |  |
| D-BIL-11 | ¿El perfil Soporte registra pagos? | (a) sí · (b) no: solo ADMIN y Contable | (b) en la Fase 01, salvo que `sec-eng` y el negocio justifiquen el recaudo en mostrador por Soporte |  |
| D-BIL-12 | Alcance del saldo a favor (HLD Q1) | (a) entre contratos del mismo suscriptor · (b) solo dentro del contrato | (a), como UISP, que lo maneja por cliente |  |

## 10. Riesgos

Ver ADR-103 §Riesgos. Riesgos adicionales de producto:

| # | Riesgo | Mitigación |
| --- | --- | --- |
| P1 | La CRC exige un plazo de pago oportuno o un aviso previo distinto de la regla del ISP | El repo no tiene fuente verificada. La configuración permite ajustarlo sin código, y el corte sigue bloqueado por P2 de ADR-102 |
| P2 | Las preguntas al contador sin responder ([INFORME-CONSULTA-CONTADOR-IVA-FACTURACION](../informes/INFORME-CONSULTA-CONTADOR-IVA-FACTURACION-v1.0.md)) | Bloquean la Fase 02 (DIAN), no esta. Los conceptos dudosos se facturan al 19 %, como ese informe indica |
| P3 | Hoy ningún suscriptor de `tenant_iwana` tiene contrato activo con ciclo | La verificación E2E usa un tenant de pruebas con contratos sembrados; la regularización de datos reales es tarea de G7 |
| P4 | Tres módulos abiertos en paralelo | Gates estrictos; ningún bloque de esta fase toca archivos de MOD13 |
