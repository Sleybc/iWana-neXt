# ADR-098: IPAM y aprovisionamiento certificado del servicio (MOD13 Red y Aprovisionamiento)

**Versión:** 1.0
**Estado:** Aprobado
**Aprobado por:** CTO, 2026-10-22, junto con G0 de MOD13 Fase 01 y las decisiones D-NET-1 a D-NET-7 del PRD
**Fecha:** 2026-10-22
**Aprobación requerida:** CTO (módulo nuevo y cambio de boundary — perfil §5)
**Modo activo:** Architect + EM
**Autor:** AI-EM-ARCH
**Módulos:** MOD13 Red y Aprovisionamiento (nuevo) · MOD11 Ejecución Operativa · MOD05 CRM · MOD12 Inventario
**Relacionado:** [ADR-027](ADR-027-Conversion-Expediente-Subscriber-Two-Stage.md) (Aprobado, se enmienda en D7) · [ADR-044](ADR-044-Separacion-OrganizationSite-NmsNode.md) (Aprobado) · [ADR-046](ADR-046-Bounded-Context-Tasks-Ejecucion-Operativa.md) (Aprobado) · [ADR-068](ADR-068-Sincronizacion-OT-Ejecucion-Proyecciones-Operativas.md) (Aprobado) · [ADR-088](ADR-088-Cierre-OT-y-Culminacion-Instalacion-Hitos-Separados.md) (Aprobado, este ADR lo desarrolla) · [ADR-097](ADR-097-Puertos-de-lectura-para-avisos-de-terminacion-MOD05.md) (Aprobado, patrón de puertos)
**Definición:** [PRD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1](../prds/PRD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md) · [HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1](../hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md)

---

## Contexto

El 2026-10-22 el CTO reportó que un suscriptor de `tenant_iwana` (en adelante, «el caso de origen») quedó instalado y seguía como prospecto. Verificado en datos:

| Hecho | Estado |
| --- | --- |
| OT `OTE-20260828-001`, `work_type = INSTALLATION` | `COMPLETED`; `ExecutionOrderClosedV1` publicado sin error el 2026-10-11 |
| Expediente vinculado | `LISTO_PARA_INSTALACION`, `checklist_completed = false` |
| Suscriptor | `PROSPECT`, `activated_at` nulo |
| Contratos del suscriptor | Ninguno (en `tenant_iwana` ningún suscriptor tiene contrato) |

Causas:

1. ADR-027 activa al suscriptor solo cuando el expediente llega a `CLIENTE_ACTIVO`, y ese paso hoy es manual.
2. `ExecutionOrderClosedV1` solo lo consume la proyección de agenda, visita y tarea (`apps/worker/src/processors/execution-order-events.processor.ts:709-779`). Ningún módulo comercial ni de red reacciona al cierre.
3. **El aprovisionamiento no existe.** No hay routers, redes IPv4, IP asignadas ni método de control. `ProvisioningActivationPort` es un stub `Promise<void>`. El PRD maestro lo tiene como filas 5 («Provisioning multi-método») y 6-B («IPAM + recursos de red»), no iniciadas.

ADR-088 dejó resuelto el marco:
- **D2:** el cierre de la OT exige la activación **técnica** (el servicio funcionando), no la comercial; eso rompe el ciclo cierre ↔ activación.
- **D5:** prohíbe sustituir la señal de aprovisionamiento por una autodeclaración del técnico.
- El dueño del aprovisionamiento quedó como «Provisioning (futuro)». Este ADR lo crea.

Referencia de mercado:
- **WispHub:** cada router MikroTik con sus rangos IPv4; al instalar se elige router, IP disponible, plan y método (Simple Queue, PCQ con address-list, PPPoE, DHCP, ARP); un «activador» valida la evidencia de campo antes de liberar al técnico.
- **UISP:** separa Plan, Servicio, Sitio y Dispositivo.

Decisiones del CTO del 2026-10-22:
- Los métodos vigentes son Simple Queue con IP fija y PCQ con address-list, y el modelo debe extenderse a otros.
- La primera entrega no escribe en el router.
- El aprovisionamiento ocurre con la OT en ejecución y antes de cerrarla.
- La IP se reserva con la OT en ejecución.
- Certifica Aprovisionamiento/NOC, nunca el técnico de la OT.
- La guarda de cierre aplica también a las OT de instalación ya abiertas.

---

## Decisión

### D1. Se crea el bounded context MOD13 «Red y Aprovisionamiento»

`apps/api/src/modules/network/` es dueño de cuatro cosas:

| Entidad | Qué es |
| --- | --- |
| `NetworkRouter` | Punto de control de red (MikroTik); cada uno define sus métodos de control |
| `Ipv4Network` | Segmento IPv4 de un router, con rango asignable y exclusiones |
| `IpAssignment` | Una IP en uso o reservada, con su ciclo de vida |
| `ServiceProvisioning` | El servicio técnico de un suscriptor para una instalación: router, IP, método, CPE, certificación |

MOD13 cubre las filas 5 y 6-B del PRD maestro. El NMS (fila 3: monitoreo y `NmsNode`) sigue siendo otro contexto. Según ADR-044, `NetworkRouter` referencia `organizationSiteId` y `commercialNodeId` de forma opcional y no se fusiona con ellos.

### D2. El método de control es un enum extensible con parámetros tipados

`ControlMethod` arranca con `SIMPLE_QUEUE_STATIC_IP` y `PCQ_ADDRESS_LIST`. Añadir `PPPOE`, `DHCP_LEASE` u otro supone:
1. ampliar el enum;
2. añadir su rama en la unión discriminada Zod de `controlParams`;
3. añadir su rama en el adaptador del router.

No cambian ni las entidades ni el flujo.

### D3. La IP se asigna desde MOD13 con unicidad garantizada por la base

- La siguiente IP libre se calcula bajo `pg_advisory_xact_lock` por segmento.
- Un índice único parcial `(tenant_id, ip) WHERE status IN ('RESERVED','ACTIVE')` es la garantía final.
- Una IP elegida a mano se valida contra el CIDR, el rango asignable, las exclusiones y el gateway.
- La IP se **reserva** con la OT `IN_PROGRESS` y se **libera** si la OT termina `NOT_EXECUTED`, `CANCELLED` o anulada.

### D4. La certificación de Aprovisionamiento/NOC es la señal real de ADR-088 D2 y D5

Certificar es afirmar que el servicio quedó funcionando con la IP y el método asignados. Lo hace un usuario con `network.provisioning.certify` y su `sub` debe ser **distinto** de `execution_orders.assigned_technician_id` (maker-checker). Además, la certificación referencia una evidencia de la propia OT.

Así se cumple ADR-088 D5 **sin enmendarlo**: quien ejecuta nunca certifica su propio trabajo.

### D5. Cerrar una OT de instalación como ejecutada exige el aprovisionamiento certificado

Cerrar una OT con `work_type = INSTALLATION` y resultado `EXECUTED` o `EXECUTED_WITH_OBSERVATIONS` exige que exista un `ServiceProvisioning` `CERTIFIED` para esa OT. Se aplica de dos formas:
- **Plantilla:** nuevo requisito `kind: 'PROVISIONING'`, que publica `INSTALACION_ESTANDAR` v3.
- **Guarda directa en `close()`:** cubre las OT vivas, cuyo snapshot no se re-congela (ADR-088, Consecuencias). Se gobierna por tenant con el ajuste `network.enforceProvisioningOnInstallClose`. La migración lo crea apagado y se enciende para todos los tenants al cerrar la ola que entrega la UI del panel (R2); a partir de ahí es el valor por defecto.

Esto es la activación técnica de ADR-088 D2, no la comercial: no reabre el ciclo que ese ADR rompió.

### D6. La integración entre módulos va solo por puertos y eventos

| Necesidad | Mecanismo | Dueño |
| --- | --- | --- |
| MOD13 lee estado, tipo, suscriptor y técnico de la OT | `ExecutionOrderReadPort.getExecutionSnapshot` (se amplía el puerto existente) | MOD11 |
| MOD13 lee el contexto comercial del suscriptor (expediente, plan, contratos) | `SubscriberServiceContextReadPort` | MOD05 |
| MOD13 lee el CPE instalado por la OT | `InstalledEquipmentReadPort` | MOD12 |
| MOD11 consulta el estado de aprovisionamiento para su gate | `ServiceProvisioningReadPort` | Lo define MOD11, lo implementa MOD13 (patrón `evidence-asset.port.ts`) |
| MOD13 reacciona al cierre, cancelación y anulación de la OT | Reenvío firmado con HMAC desde el worker a `network-execution-events` + inbox idempotente (patrón inventario, ADR-068) | MOD13 |
| MOD05 y MOD12 reaccionan a la activación del servicio | Evento intra-API `network.service-provisioning.activated` | MOD05 y MOD12, cada uno en sus tablas |

### D7. Enmienda a ADR-027: `CLIENTE_ACTIVO` lo dispara la activación técnica

Cuando un `ServiceProvisioning` pasa a `ACTIVE` (OT cerrada como ejecutada con aprovisionamiento certificado), MOD05 lleva el expediente vinculado a `CLIENTE_ACTIVO` con actor de sistema. El resto de la cadena de ADR-027 queda igual: `crm.expediente.activated` → `activateFromExpediente` → suscriptor `ACTIVE`.

Las guardas de MOD05 se respetan y no se evaden:
- contacto real del expediente;
- completitud fiscal del suscriptor en `SubscriberStatusTransitionService`.

Si una guarda falla, el servicio de red queda `ACTIVE` igual y MOD05 deja visible «activación comercial pendiente», con su causa.

### D8. El contrato no se activa por esta vía

`ContractsService.activate` es la convención de **firma** (`DRAFT → ACTIVE`, ADR-088 contexto). La activación técnica no firma contratos.
- `ServiceProvisioning.contractId` es opcional: se liga cuando el suscriptor tiene un contrato elegible.
- MOD12 fija `contractRefId` del comodato solo cuando ese vínculo existe.

La «instalación culminada» de ADR-088 D1 sigue exigiendo además el contrato legal: **suscriptor `ACTIVE` no equivale a instalación culminada**. Un suscriptor puede estar activo, con servicio de red, sin contrato firmado; la culminación sigue pendiente y visible hasta la firma.

### D9. El router se escribe a través de un puerto; la primera entrega es manual

`RouterProvisioningPort` define `apply`, `remove`, `suspend` y `sync`.
- El adaptador de esta fase, `ManualRouterProvisioningAdapter`, no se conecta al router y devuelve la «instrucción de configuración»: cola o address-list, IP, MAC, velocidades.
- Aprovisionamiento la aplica en el MikroTik antes de certificar.
- El adaptador RouterOS API (8728/8729, credenciales cifradas, conectividad por VPN) es otra fase con su propio ADR.

### D10. Regularización de instalaciones cerradas sin aprovisionamiento

Un comando con permiso `network.provisioning.regularize` y motivo obligatorio crea el servicio directamente `ACTIVE` con `origin = REGULARIZED`, para OT de instalación ya cerradas como ejecutadas. Emite el mismo evento de activación y no modifica la OT. Resuelve el caso que originó este ADR sin SQL manual.

---

## Consecuencias

**Positivas**

- La instalación termina con un servicio de red identificable (router, IP, método, CPE), y el suscriptor se activa sin intervención manual.
- ADR-088 obtiene su señal real de aprovisionamiento sin enmendar D5.
- El paso a la escritura automática en MikroTik se reduce a un adaptador nuevo, sin rediseño.

**Negativas y costes**

- El cierre de toda OT de instalación pasa a depender de un segundo rol (NOC). Los tenants sin ese rol deben asignarlo o apagar el ajuste de D5, y apagarlo queda auditado.
- Mientras el adaptador sea manual, la base y el router pueden divergir. La certificación es el control compensatorio; la conciliación automática llega con el adaptador RouterOS.
- El reenvío desde el worker suma una cola y un inbox.

**Impacto declarado**

| Dimensión | Impacto |
| --- | --- |
| **Multi-tenant** | Todas las tablas viven en el schema del tenant con `tenant_id`. Los locks de IPAM incluyen el id del segmento, que ya es por tenant. |
| **Seguridad** | Superficie nueva: catálogo de red y comandos de aprovisionamiento con seis permisos nuevos. Sin credenciales de router en esta fase. Las IP privadas de clientes son dato operativo, no PII, pero no viajan en logs junto a nombre o documento. Revisión de AI-SEC-ENG obligatoria (HMAC, maker-checker, regularización). |
| **Escala** | El cálculo de la siguiente IP recorre como máximo el rango asignable (≤ 65 534 direcciones por el CHECK /16) dentro de un lock por segmento. |
| **Regulación** | Sin impacto directo; la certificación con evidencia soporta la trazabilidad de la entrega del servicio. |
| **Boundaries** | Un contexto nuevo con puertos explícitos; ningún módulo lee tablas de otro. |

---

## Riesgos

| # | Riesgo | Mitigación |
| --- | --- | --- |
| R1 | Un tenant sin usuarios NOC queda con todas las instalaciones incerrables | Ajuste por tenant (D5) y plantilla de rol «Aprovisionamiento» asignable; la bandeja muestra las OT bloqueadas |
| R2 | La guarda en `close()` se aplica antes de que exista la UI del panel de aprovisionamiento | La guarda (bloque B2 del plan) y el panel (bloque F2) se habilitan juntos: el ajuste arranca apagado en la migración y se enciende en G7, después de F2 |
| R3 | Doble asignación de IP por concurrencia | Lock por segmento más índice único parcial; test de integración con 20 reservas concurrentes |
| R4 | El expediente no pasa a `CLIENTE_ACTIVO` por una guarda de MOD05 y el suscriptor sigue como prospecto sin que nadie lo vea | D7 exige el registro visible de «activación comercial pendiente» y un test que provoque el fallo dentro del listener real |
| R5 | Se usa la regularización como atajo para saltarse la certificación | Permiso propio, motivo obligatorio, solo para OT ya cerradas, auditoría, y `origin` visible en la ficha |

---

## Alternativas descartadas

**A1. Activar al suscriptor directamente al cerrar la OT, sin aprovisionamiento.** Resuelve el síntoma, pero deja clientes activos sin red asignada. El CTO lo descartó.

**A2. IPAM dentro de MOD12 Inventario.** El PRD maestro separa expresamente los recursos de red (fila 6-B) del inventario de materiales. Una IP no tiene costo, bodega ni custodia.

**A3. Que el técnico certifique desde la OT.** Lo prohíbe ADR-088 D5.

**A4. Reservar la IP al agendar.** Deja reservas huérfanas de instalaciones que nunca ocurren. El CTO fijó la reserva con la OT en ejecución.

**A5. Integración RouterOS en la primera entrega.** Exige conectividad a cada router, custodia de credenciales y conciliación, y retrasa la corrección del flujo. Queda detrás del puerto de D9.
