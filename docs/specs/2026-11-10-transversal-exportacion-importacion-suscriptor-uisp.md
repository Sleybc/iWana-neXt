# Spec — Transversal · Exportación del suscriptor e importación desde UISP

**Versión:** 1.1 (2026-11-12, decisiones D1–D5 del usuario)
**Estado:** G0 aprobado por el usuario el 2026-11-12 («Apruebo el G0»); arquitectura en [ADR-110](../adrs/ADR-110-Importacion-por-Lotes-desde-UISP-y-Portabilidad.md). Insumo para enmendar el PRD maestro (S13, `RF-MIG-*`) y para un ADR de migración y portabilidad
**Fecha:** 2026-11-10
**Emisor:** Claude Code, con criterio de AI-DATA-ENG
**Módulos:** MOD05 CRM · MOD14 Facturación · MOD09 Soporte · privacy · plataforma (worker)
**Origen:** export de cliente de la instancia real (evidencia C26 de la [referencia UISP](../referencias/REFERENCIA-UISP-CRM-MOD05-v1.1.md) §15.9), custodiado fuera del repositorio
**Relacionado:** [PRD maestro](../prds/PRD_Sistema_ISP_Colombia_v2_4.md) S13, I17 y `RF-MIG-03` · [ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md) · [ADR-103](../adrs/ADR-103-Modulo-Facturacion-MOD14.md) · [ADR-102](../adrs/ADR-102-Ciclo-Facturacion-y-Fecha-de-Corte-por-Servicio.md) · [ADR-093](../adrs/ADR-093-Tratamiento-IVA-Internet-por-Punto-y-Linea-de-Servicio.md) · [spec de la ficha estilo UISP](2026-11-10-mod05-ficha-suscriptor-estilo-uisp-ux.md)

---

## 0. Principio

Complementar sin retroceso: el paquete de iWana debe ser **más completo y verificable** que el de UISP, y la importación no puede degradar datos que iWana tipa, cifra o calcula.

## 1. Anatomía del export de UISP

Un ZIP por cliente, generado desde la ficha:

| Archivo | Contenido | Hueco |
|---|---|---|
| `client.json` | Cliente, direcciones de contacto y de facturación, coordenadas, contactos con propósito (`isBilling`, `isContact`) y tipos, atributos, etiquetas con color, saldos y banderas (`hasOverdueInvoice`, `hasSuspendedService`, `hasOutage`) | Catálogos solo por ID (`organizationId`, `countryId`) |
| `services.json` | Plan, velocidades, precio individual, ID de contrato, `invoicingStart`, periodo anticipado o vencido, día de inicio, **periodos de suspensión** (inicio–fin) | `servicePlanId` sin catálogo |
| `invoices.json` + `invoices/*.pdf` | Facturas con renglones (`service`, `product`, `fee`), totales y **coberturas** (`paymentCovers`: pago o nota crédito → factura) | PDF solo de las facturas renderizadas (en la muestra, 19 de 53, desde marzo de 2023). El PDF no es factura DIAN: sin CUFE, IVA ni resolución |
| `payments.json` | Pagos con su cobertura | `methodId` es un UUID sin catálogo |
| `tickets.json` + `tickets/<id>/` | Tickets con actividad, comentarios públicos o privados y adjuntos por carpeta | Referencian tareas (`assignedJobIds`) que **no viajan**: `jobs.json` vacío |
| `documents/` | Archivos del cliente | Sin metadatos (fecha, autor, tipo, visibilidad) |
| `quotes`, `refunds`, `payment_plans`, `jobs` | Vacíos en la muestra | — |

Sin manifiesto, versión de formato ni sumas de verificación: no hay forma de probar que el paquete está completo.

## 2. Exportación desde iWana: paquete por suscriptor

### 2.1 Usos

| Uso | Disparador | Base |
|---|---|---|
| Derecho de consulta del titular (Ley 1581) | Solicitud de privacidad `CONSULTA` | `requestKindSchema` en `@iwana/shared` |
| Entrega de historial al retirar un tenant | Antes de la purga | ADR-033 y ADR-108 |
| Soporte y auditoría puntual | Operador con permiso | Auditoría |

### 2.2 Contenido

```
manifest.json     formatVersion, tenant, subscriberId, generatedAt, generatedBy, motivo, conteos y SHA-256 por archivo
subscriber.json   titular, perfil tributario, canales de contacto, direcciones
contracts.json    contratos, plan congelado, IVA y estrato con su evidencia, historial de ciclo de vida y periodos suspendidos
billing/          documentos de cobro, pagos con coberturas, saldo a favor, estado de cuenta (json + pdf)
support/          tickets, comentarios, visitas y órdenes de trabajo, con adjuntos
documents/        archivos + documents.json (tipo, versión, fecha, autor, visibilidad, origen)
privacy/          autorizaciones de tratamiento y solicitudes
catalogs.json     planes, métodos de pago, motivos y tipos usados en el paquete
```

### 2.3 Reglas

1. Trabajo asíncrono en BullMQ con payload sin PII (solo identificadores); el ZIP se guarda cifrado y se entrega por **URL firmada que vence**.
2. Permiso propio de exportación; el número de documento solo sale en claro para `CONSULTA` del propio titular o con el permiso de privacidad.
3. Auditoría en la misma transacción que encola el trabajo, con motivo obligatorio.
4. Titular anonimizado o bloqueado: no exportable (se responde con la guarda existente).
5. Todo dentro del schema del tenant; ningún paquete cruza tenants.

## 3. Importación desde UISP

### 3.1 Fuente

| Caso | Fuente |
|---|---|
| Migración de un tenant completo | API CRM de UISP (trae catálogos y tareas) |
| Casos sueltos o reconciliación | ZIP por cliente de §1 |

### 3.2 Correspondencia

| UISP | iWana | Regla |
|---|---|---|
| `client` + `userIdent` | Party + suscriptor; `external_id` = `uisp:<id>` | `clientType` 1 → natural, 2 → jurídica. Coordenadas fuera de Colombia → se descartan y el titular va a la cola de datos incompletos |
| Atributo Cédula | Documento cifrado + HMAC | Formato inválido o ausente → cola de datos fiscales incompletos |
| Atributo Estrato | Estrato del punto de servicio | Entra **pendiente de evidencia**; no fija IVA hasta confirmarse (ADR-093) |
| `contacts` | Canales de `party_contact` | Personas de contacto distintas del titular: fuera, por D-CONT |
| `tags` | Tabla de equivalencias por tenant | Las que iWana deriva (IVA, Siigo, datos faltantes) se descartan; las de criterio del operador van a etiqueta manual o a nota |
| `service` | Contrato | `status` 1 → `ACTIVE`; `invoicingPeriodStartDay` → ciclo de ADR-102 (fuera del catálogo → rechazo con motivo); periodos de suspensión → historial de ciclo de vida; plan por equivalencia con el catálogo MOD06 |
| `invoices` | Documentos de cobro MOD14 **históricos externos** | Solo lectura, con su PDF; no consumen numeración DIAN ni generan eventos de cobro |
| `paymentCovers` + `payments` | Pagos y aplicaciones MOD14 | Modelo equivalente; `methodId` por tabla de equivalencias |
| `tickets` | Tickets históricos MOD09 | Se respeta `public`; tareas solo si la fuente las trae |
| `documents/` | Soportes del suscriptor | Origen «importado», sin autor |

### 3.3 Ejecución

1. **Simulación** sin escrituras: informe con conteos por entidad y rechazos por motivo.
2. Carga a **tablas intermedias** del tenant con `batch_id`.
3. Promoción idempotente por `external_id`; repetir una carga no duplica.
4. **Conciliación** por titular: saldo recalculado en iWana = `accountBalance` de UISP; total facturado y total pagado iguales.
5. **Reversión** por `batch_id`.
6. Ningún dato personal en logs ni en payloads de cola.

## 4. Criterios de aceptación

| # | Criterio |
|---|---|
| CA-1 | Un paquete exportado se verifica contra su `manifest.json` (conteos y SHA-256) |
| CA-2 | Exportar y reimportar un titular en un tenant vacío reproduce saldo, contratos, documentos de cobro y tickets |
| CA-3 | La importación del ZIP de muestra concilia saldo, facturado y pagado, y reporta 9 tareas referenciadas sin fuente |
| CA-4 | Ninguna factura importada aparece como documento fiscal ni consume numeración |
| CA-5 | Un titular anonimizado no se exporta; un estrato importado no fija IVA sin evidencia |
| CA-6 | Integración contra Postgres real para la promoción y la reversión por lote |

## 5. Decisiones (usuario, 2026-11-12)

| # | Decisión |
|---|---|
| D1 | Enmendar `RF-MIG-03` del PRD maestro para incluir el CRM de UISP y WispHub |
| D2 | Un ADR de migración (tablas intermedias con `batch_id`, idempotencia por `external_id`, reversión) y portabilidad |
| D3 | El paquete de `CONSULTA` sale en JSON y PDF legible |
| D4 | El ZIP generado y las tablas intermedias se retienen 30 días |
| D5 | Se importan todas las facturas históricas, de solo lectura |
| D6 | Orden: primero la importación desde UISP (incluye etiquetas manuales por tenant, §3.2 `tags`); la exportación (§2) va en una fase posterior |
