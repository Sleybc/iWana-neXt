# Referencia comparativa — UISP CRM para MOD05 iWana neXt

**Tipo:** Referencia técnica comparativa  
**Módulo destino:** MOD05 CRM; módulos futuros de Facturación y MOD13 Red y Aprovisionamiento  
**Versión:** 1.0  
**Estado:** Reemplazado por [v1.1](REFERENCIA-UISP-CRM-MOD05-v1.1.md) el 2026-10-31; se conserva como historial  
**Fecha:** 2026-10-31  
**Audiencia:** arquitectura, producto, backend, integraciones y operaciones

## 1. Propósito y autoridad

Este documento resume patrones funcionales útiles del CRM de UISP y los contrasta con el diseño vigente de iWana neXt. Sirve como insumo para futuras definiciones de Facturación, ciclo de vida del servicio e integración con equipos de red.

UISP es un referente comparativo, no una fuente de requisitos para iWana. Esta referencia no aprueba funciones, contratos de API, estados, reglas de cobro, políticas fiscales ni cambios de arquitectura. Si una recomendación se lleva a producto, debe formalizarse en el PRD, HLD o ADR dueño del cambio.

La documentación de UISP confirma funciones observables y contratos públicos de CRM; no publica el código completo de la aplicación, el esquema privado de base de datos ni todos los detalles de los procesos en segundo plano. Los patrones descritos aquí se limitan a lo documentado por Ubiquiti.

## 2. Modelo funcional observado

UISP organiza las operaciones alrededor de un servicio de cliente. El servicio combina relación comercial, plan, ubicación de red, ciclo de facturación y estado operativo:

- **Cliente:** cuenta comercial y datos de contacto.
- **Plan de servicio:** condiciones del producto; en la configuración de red puede incluir límites de subida/bajada y agregación.
- **Servicio:** suscripción concreta del cliente. Puede asociarse a un sitio o ubicación UISP.
- **Factura y pago:** documentos y movimientos separados. Los pagos pueden aplicarse a facturas y, en el escenario prepago documentado, el excedente queda como crédito para facturas posteriores.
- **Sitio de red:** vínculo explícito entre el servicio comercial y los equipos/direcciones de red que participan en la provisión.
- **Suspensión y shaping:** acciones de negocio del CRM que UISP traduce a reglas en un UISP Gateway compatible cuando existe la asociación de red necesaria.

La API publica recursos separados para clientes, servicios, planes, facturas, pagos, tickets, suspensiones y enlace servicio-ubicación. Esto permite que una integración opere mediante contratos REST sin depender de tablas privadas. [API CRM estable](https://unmscrm.docs.apiary.io/)

~~~mermaid
flowchart LR
    E["Expediente comercial"] --> S["Suscriptor"]
    S --> C["Contrato / servicio"]
    C --> P["Plan comercial"]
    C --> L["Sitio / ubicación de red"]
    C --> I["Factura por periodo"]
    I --> M["Pago y aplicación"]
    M -->|señal confirmada| B["Saldo, mora o siguiente ciclo"]
    B -->|política aprobada| X["Acción de servicio"]
    X --> A["Adaptador de provisión"]
    A --> R["Router / red"]
~~~

El diagrama describe un patrón funcional para evaluar en iWana. No representa la arquitectura interna de UISP ni afirma que iWana ya tenga implementados factura, pago o corte automático.

## 3. Patrones valiosos y adaptación recomendada

| Patrón observado en UISP | Tratamiento en iWana | Adaptación o límite |
|---|---|---|
| Un cliente puede tener servicios separados. | **Mantener.** iWana ya modela contratos por servicio y deriva el estado del suscriptor de esos contratos. | El corte y la facturación deben operar por contrato/servicio cuando la regla del ISP lo requiera, sin asumir que un cliente equivale a una sola conexión. |
| Plan y servicio conservan responsabilidades distintas. | **Adoptar como criterio de diseño.** | El catálogo comercial mantiene precios y ofertas; el contrato conserva las condiciones aceptadas por el cliente. La cotización no debe ser la fuente mutable de un servicio ya activo. |
| El servicio puede enlazarse con una ubicación de red. | **Adoptar con boundary.** | iWana debe resolver el vínculo mediante puertos/contratos con MOD13 o NMS; CRM no debe consultar tablas de red directamente. Definir si el vínculo apunta a sede, interfaz, CPE u otro recurso es trabajo de diseño futuro. |
| El ciclo de cobro pertenece al servicio. | **Ya alineado.** | ADR-102 define el ciclo en el contrato, no en el suscriptor, y fija el catálogo por tenant. UISP se usa como corroboración del patrón; no reemplaza ADR-102. |
| Factura, pago y saldo a favor son recursos distintos. | **Candidato prioritario para el módulo futuro de Facturación.** | Mantener trazabilidad entre periodo, factura, pagos aplicados, crédito y reversos. No inferir pago a partir de una operación de pasarela incompleta. |
| La mora puede disparar suspensión y el pago puede llevar a reactivación. | **Adoptar solo como flujo explícito y condicionado.** | Antes de automatizar se requieren fuente de verdad de pagos, política aprobada y ejecución de red disponible. La agenda manual vigente no debe convertirse implícitamente en un corte automático. |
| El plan puede comunicar límites de tráfico a la red. | **Adoptar mediante contrato de provisión.** | Separar la regla comercial del adaptador por fabricante. No asumir que UISP Gateway, EdgeRouter o un protocolo de Ubiquiti representan routers/OLTs de otros fabricantes. |
| CRM usa APIs y webhooks para integración. | **Adoptar los límites, no copiar el mecanismo sin revisar.** | En iWana, favorecer contratos tipados, permisos mínimos, eventos idempotentes y outbox cuando corresponda. Hidratar eventos desde la fuente de verdad y contemplar reintentos/reconciliación. |
| CRM ejecuta plugins PHP cargados en la aplicación. | **No adoptar ese modelo de extensión.** | Preferir módulos internos con puertos/adaptadores o servicios desacoplados. Un plugin ejecutado dentro del proceso CRM amplía la superficie de seguridad y complica el aislamiento. |
| UISP permite configuraciones fiscales de precio con o sin impuestos. | **No copiar reglas fiscales.** | iWana debe seguir las decisiones de Tributación/Parties y las fuentes oficiales aplicables a Colombia. La referencia no determina tasas, redondeos ni tratamiento tributario. |

## 4. Contraste con el diseño vigente de iWana

MOD05 tiene como entidad comercial principal el expediente progresivo y convierte al suscriptor en dos etapas. El PRD vigente deja fuera de alcance la implementación real de facturación, cobro, automatización de facturas y corte. La arquitectura prescribe `CrmModule` como bounded context y el uso de puertos para capacidades de otros módulos. [PRD MOD05](../prds/PRD-MOD05-CRM-DEFINICION-v2.0.md) · [HLD MOD05](../hlds/HLD-MOD05-ARQUITECTURA-v2.0.md)

ADR-102 ya fija un ciclo de facturación por contrato y una agenda de corte; no existe todavía un registro de pagos que permita decidir automáticamente quién está en mora. El corte automático queda condicionado a:

1. La señal autoritativa de pago por contrato y periodo.
2. La resolución de la revisión normativa pendiente mediante fuente oficial.
3. Un ejecutor de red con llamador real, o una decisión explícita de corte solo comercial.

Por tanto, la automatización de UISP sirve para identificar el patrón de integración negocio→red, pero **no** autoriza a habilitar corte en iWana ni a cambiar las fechas y reglas aprobadas por ADR-102. [ADR-102](../adrs/ADR-102-Ciclo-Facturacion-y-Fecha-de-Corte-por-Servicio.md)

### Secuencia objetivo para explorar en futuras fases

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
    BILL->>BILL: Registra pago y aplicación idempotente
    BILL->>OUT: Publica estado financiero confirmado
    OUT->>NET: Solicita suspensión o reactivación según política
    NET-->>OUT: Resultado de provisión
    OUT-->>CRM: Estado operativo conciliado
~~~

Esta secuencia es una propuesta de exploración, no un contrato aprobado. El módulo financiero debe ser dueño de factura, pago, periodo y mora; MOD13 debe ser dueño de la ejecución sobre red; CRM conserva el contrato y consulta los estados por interfaces aprobadas.

## 5. Criterios para usar esta referencia al definir funcionalidades

Al preparar una nueva fase de CRM o Facturación:

1. Identificar primero el artefacto iWana vigente y el dueño del dato.
2. Usar este documento para extraer patrones, no requisitos textuales.
3. Comparar cada patrón con los boundaries, tenancy, seguridad y reglas fiscales de iWana.
4. Registrar en el PRD qué se adopta, adapta o descarta y por qué.
5. Crear o actualizar ADR cuando el cambio altere boundaries, contratos entre módulos, seguridad o un patrón arquitectónico aprobado.
6. Mantener el ciclo por servicio y las precondiciones de corte de ADR-102 hasta que una decisión posterior aprobada los modifique.

## 6. Fuentes

### Ubiquiti / UISP

- [UISP CRM API Usage](https://help.uisp.com/hc/en-us/articles/22590956856087-UISP-CRM-API-Usage) — separación entre CRM API y Network API.
- [API CRM estable](https://unmscrm.docs.apiary.io/) — recursos, operaciones y autenticación con App Key.
- [Suspension, Traffic Shaping and Aggregation](https://help.uisp.com/hc/en-us/articles/22590998317719-UISP-Suspension-Traffic-Shaping-and-Aggregation) — relación servicio, plan, sitio, gateway, IP y reglas.
- [Prepaid Service and Service Reactivation](https://help.uisp.com/hc/en-us/articles/22590998643351-UISP-CRM-Prepaid-Service-and-Service-Reactivation) — crédito y facturación prepagada.
- [CRM Refunds](https://help.uisp.com/hc/en-us/articles/22590982769175-UISP-CRM-Refunds) — diferencia entre ajuste contable CRM y devolución al medio de pago.
- [CRM Plugins](https://help.uisp.com/hc/en-us/articles/22590998471191-UISP-CRM-Plugins) y [manifest](https://github.com/Ubiquiti-App/UCRM-plugins/blob/master/docs/manifest.md) — extensión PHP y configuración de plugins.

### iWana neXt

- [PRD MOD05 CRM](../prds/PRD-MOD05-CRM-DEFINICION-v2.0.md)
- [HLD MOD05 CRM](../hlds/HLD-MOD05-ARQUITECTURA-v2.0.md)
- [ADR-102: ciclo de facturación y fecha de corte por servicio](../adrs/ADR-102-Ciclo-Facturacion-y-Fecha-de-Corte-por-Servicio.md)
- [PRD maestro ISP Colombia](../prds/PRD_Sistema_ISP_Colombia_v2_4.md)
