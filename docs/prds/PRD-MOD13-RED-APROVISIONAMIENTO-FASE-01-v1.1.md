# PRD-MOD13 — Red y Aprovisionamiento · Fase 01: IPAM y activación certificada

**Versión:** 1.1
**Estado:** Aprobado
**Aprobado por:** CTO, 2026-10-22 (G0, con las recomendaciones de D-NET-1 a D-NET-7). v1.1 aprobada por el CTO el mismo día, con el re-sync tras la Ola 1.
**Historial:** v1.1 añade R6 ter (sin técnico asignado no hay aprovisionamiento) y confirma que regularizan ADMIN y Aprovisionamiento/NOC, ambas decisiones del CTO tras la revisión de seguridad S0. Remite al HLD v1.1.
**Fecha:** 2026-10-22
**Emisor:** AI-EM-ARCH (modo Product Architect + EM)
**Decisión de arquitectura:** [ADR-098](../adrs/ADR-098-IPAM-y-Aprovisionamiento-Certificado-MOD13.md)
**Diseño:** [HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1](../hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md)
**Plan:** [2026-10-22-mod13-aprovisionamiento.md](../plans/2026-10-22-mod13-aprovisionamiento.md)
**Requisitos de origen:** PRD maestro v2.4 §5.3 RF-PRV-01, 02, 04 y 08; §5.4.1 RF-INV-01 y 04; roadmap §14, filas 5 y 6-B

---

## 1. Problema

Una instalación terminada en campo no deja al cliente activo ni con un servicio de red identificable.

- **Caso que lo originó** (suscriptor de `tenant_iwana`, en adelante «el caso de origen»): OT `OTE-20260828-001` cerrada el 2026-10-11, suscriptor todavía `PROSPECT` y expediente en `LISTO_PARA_INSTALACION`.
- **Qué falta:**
  - un catálogo de routers y redes IPv4;
  - la asignación de una IP libre;
  - el registro del método de control en el MikroTik;
  - una verificación independiente de que el servicio quedó funcionando;
  - el paso automático del suscriptor a activo.

## 2. Objetivo

Que toda instalación termine así:
1. el área de Aprovisionamiento asigna router, red IPv4, IP y método de control mientras la OT está en ejecución;
2. Aprovisionamiento certifica que el servicio funciona;
3. el técnico cierra la OT;
4. el suscriptor queda `ACTIVE` sin intervención manual.

## 3. Alcance

**Dentro**

1. Catálogo de routers MikroTik: nombre, sede o nodo opcional, host de gestión, interfaz LAN, métodos de control, estado.
2. Catálogo de redes IPv4 por router: CIDR, gateway, rango asignable, exclusiones, método por defecto y ocupación.
3. Perfil de control por plan comercial: el nombre de address-list para PCQ.
4. Reserva de IP (automática o manual validada) con la OT de instalación `IN_PROGRESS`.
5. Instrucción de configuración manual para el MikroTik: cola o address-list, IP, MAC del CPE, velocidades del plan.
6. Certificación del servicio por Aprovisionamiento/NOC (maker-checker), con evidencia de la OT.
7. Guarda en el cierre de la OT de instalación (requisito `PROVISIONING` + guarda para OT vivas), gobernada por un ajuste del tenant.
8. Activación al cerrar: servicio de red `ACTIVE` → expediente `CLIENTE_ACTIVO` → suscriptor `ACTIVE`; comodato del CPE ligado al contrato si existe.
9. Liberación de la IP cuando la OT no se ejecuta, se cancela o se anula; reconciliador periódico.
10. Bandeja de aprovisionamiento, panel en la OT y sección «Servicio técnico» en la ficha del suscriptor.
11. Regularización de instalaciones ya cerradas sin aprovisionamiento (incluido el caso de origen).

**Fuera**

- Escribir en el router: API RouterOS, credenciales, VPN, conciliación automática (ADR-098 D9; fase propia).
- PPPoE, DHCP, VLAN, IPv6, RADIUS, OLT y ONU. El modelo los admite (ADR-098 D2), pero no se construyen.
- Suspensión y corte por mora (depende de Billing).
- Firma del contrato legal y «instalación culminada» (ADR-088 D1).
- Cambio de plan, traslado o retiro del servicio de red.
- Portal del cliente.

## 4. Actores

| Actor | Rol en el sistema | Qué hace |
| --- | --- | --- |
| Técnico de campo | `TECHNICIAN` | Instala el CPE (ya existe: `INSTALLED_AT_CUSTOMER`), adjunta evidencia, ve el estado y la IP **solo de sus OT** y cierra la OT. No ve la bandeja ni el servicio técnico de otros suscriptores |
| Aprovisionamiento / NOC | `NOC` + plantilla «Acceso estándar Aprovisionamiento» | Mantiene el catálogo de red, reserva la IP, configura el MikroTik, certifica y regulariza (regularizar: decisión del CTO, 2026-10-22) |
| Administrador del tenant | `ADMIN` | Gestiona el catálogo y el ajuste de la guarda |
| CRM | Sistema | Activa expediente y suscriptor al recibir el evento |

## 5. Requisitos funcionales

| ID | Requisito | Origen |
| --- | --- | --- |
| RF-NET-01 | Registrar, editar y desactivar routers con métodos de control soportados (`SIMPLE_QUEUE_STATIC_IP`, `PCQ_ADDRESS_LIST`) | RF-PRV-01, decisión CTO |
| RF-NET-02 | Registrar redes IPv4 por router con CIDR (prefijo entre /16 y /30), gateway, rango asignable, IP excluidas y método por defecto; mostrar su ocupación | RF-INV-01 |
| RF-NET-03 | Asociar a cada plan comercial un nombre de address-list para PCQ | RF-INV-04 |
| RF-NET-04 | Reservar para una OT de instalación `IN_PROGRESS` la siguiente IP libre del segmento elegido, o una IP manual validada | RF-PRV-02, decisión CTO |
| RF-NET-05 | Generar la instrucción de configuración del MikroTik según el método (adaptador manual) | RF-PRV-04 |
| RF-NET-06 | Certificar el servicio: solo `network.provisioning.certify`, actor distinto del técnico asignado, con evidencia de la OT | ADR-088 D5 |
| RF-NET-07 | Impedir el cierre `EXECUTED*` de una OT de instalación sin aprovisionamiento certificado cuando el ajuste del tenant está encendido | ADR-088 D2, decisión CTO |
| RF-NET-08 | Al cerrar ejecutada con certificación: servicio `ACTIVE`, IP `ACTIVE`, evento de activación | RF-PRV-08 |
| RF-NET-09 | Al cerrar `NOT_EXECUTED`, cancelar o anular la OT: liberar reserva e IP | Decisión CTO |
| RF-NET-10 | CRM pasa el expediente a `CLIENTE_ACTIVO` y el suscriptor a `ACTIVE`; si una guarda lo impide, deja visible «activación comercial pendiente» | ADR-098 D7 |
| RF-NET-11 | Inventario liga el comodato del CPE al contrato cuando el servicio tiene contrato | ADR-098 D8 |
| RF-NET-12 | Bandeja: OT de instalación en ejecución sin certificar, servicios `FAILED`, instalaciones cerradas sin aprovisionar | — |
| RF-NET-13 | Regularizar una OT de instalación cerrada como ejecutada, con motivo y permiso propio | ADR-098 D10 |
| RF-NET-14 | Ficha del suscriptor: sección «Servicio técnico» con IP, router, red, método, CPE (serial y MAC), estado, quién certificó y cuándo | — |
| RF-NET-15 | Reconciliador: liberar reservas cuya OT terminó sin evento procesado | Patrón ADR-068 |

## 6. Reglas de negocio

| # | Regla |
| --- | --- |
| R1 | Una IP está ocupada en un tenant si tiene una asignación `RESERVED` o `ACTIVE`. Nunca dos a la vez. |
| R2 | Nunca son asignables la dirección de red, el broadcast, el gateway ni las IP excluidas. |
| R3 | Solo se reserva para OT `IN_PROGRESS`, `work_type = INSTALLATION`, no anuladas y con suscriptor. |
| R4 | Una OT tiene a lo sumo un servicio de red no liberado. Reservar de nuevo en la misma OT reemplaza la reserva anterior: la libera con motivo `REPLACED`. |
| R5 | El método elegido debe estar en `supportedControlMethods` del router. `PCQ_ADDRESS_LIST` exige address-list (del perfil del plan o escrita a mano). |
| R6 | Certifica un usuario con `network.provisioning.certify` cuyo `sub` ≠ `assigned_technician_id` de la OT. |
| R6 bis | Deshacer una certificación (liberar un servicio `CERTIFIED`) exige `network.provisioning.certify` y un motivo auditado. El técnico de la OT nunca puede hacerlo. |
| R6 ter | Sin técnico asignado en la OT (`assigned_technician_id` nulo) no se puede reservar, certificar ni regularizar: `PROVISIONING_TECHNICIAN_REQUIRED`. La independencia de quien certifica nunca se presume. |
| R7 | La certificación exige una `execution_order_evidence` de la misma OT, de tipo `PHOTO` o `DOCUMENT`. |
| R8 | Solo se certifica un servicio `RESERVED` con la OT todavía `IN_PROGRESS`. |
| R9 | Con el ajuste encendido, el cierre `EXECUTED` o `EXECUTED_WITH_OBSERVATIONS` de una OT `INSTALLATION` exige servicio `CERTIFIED`. El cierre `NOT_EXECUTED` nunca lo exige. |
| R10 | Un cierre `EXECUTED*` sin servicio certificado (ajuste apagado u OT anterior) deja el servicio, si existe, en `FAILED`. La OT aparece en «Instalaciones sin aprovisionar». |
| R11 | La activación comercial nunca se fuerza: se respetan contacto real y completitud fiscal (ADR-098 D7). |
| R12 | Regularizar exige OT `INSTALLATION` cerrada como `EXECUTED*`, sin servicio activo, con motivo de 10 a 500 caracteres. |
| R13 | Desactivar un router o una red no libera IP activas. Impide nuevas reservas en ellos. |
| R14 | Ningún log ni payload de evento une IP con nombre, documento o teléfono del suscriptor. |

## 7. Criterios de aceptación

| CA | Criterio |
| --- | --- |
| CA-NET-01 | Una red /24 con gateway `.1` y rango `.10–.250` asigna `.10` primero, se salta las excluidas y responde `NETWORK_POOL_EXHAUSTED` al agotarse. |
| CA-NET-02 | 20 reservas concurrentes sobre la misma red producen 20 IP distintas (test de integración contra Postgres real). |
| CA-NET-03 | Una IP manual fuera del rango, excluida, gateway u ocupada se rechaza con un código específico. |
| CA-NET-04 | Reservar sobre una OT que no está en ejecución, no es de instalación o está anulada devuelve `PROVISIONING_ORDER_NOT_ELIGIBLE`. |
| CA-NET-05 | El técnico asignado que intenta certificar recibe `403 PROVISIONING_CERTIFIER_IS_EXECUTOR`. Sin evidencia: `PROVISIONING_EVIDENCE_REQUIRED`. |
| CA-NET-06 | Con el ajuste encendido, cerrar ejecutada sin certificar devuelve `CLOSURE_GATE_INCOMPLETE`, con el faltante «Aprovisionamiento certificado». Certificada, cierra. |
| CA-NET-07 | Tras cerrar ejecutada y certificada: servicio e IP `ACTIVE`, expediente `CLIENTE_ACTIVO`, suscriptor `ACTIVE` con `activated_at`, y `contract_ref_id` del comodato fijado si hay contrato. |
| CA-NET-08 | Cerrar `NOT_EXECUTED`, cancelar o anular deja el servicio y la IP en `RELEASED`, y la IP vuelve a ser asignable. |
| CA-NET-09 | Reentregar el mismo evento de cierre no cambia nada (inbox idempotente). |
| CA-NET-10 | Si el suscriptor no tiene contacto real, el servicio queda `ACTIVE` y la ficha muestra «Activación comercial pendiente: falta teléfono o correo». |
| CA-NET-11 | Regularizar la OT `OTE-20260828-001` deja la ficha de su suscriptor con IP, router y origen «Regularizado», y el suscriptor `ACTIVE`. |
| CA-NET-12 | Un usuario sin `network.catalog.manage` no ve las acciones de crear o editar; el endpoint devuelve 403. |
| CA-NET-13 | La bandeja lista las tres colas de RF-NET-12, con filtros y paginación numerada (ADR-065). |
| CA-NET-14 | Panel de la OT, bandeja y ficha cumplen la identidad iWana y WCAG AA a 375, 768 y 1280 px, en claro y oscuro. |

## 8. Vocabulario visible

| Término interno | Texto visible |
| --- | --- |
| `NetworkRouter` | Router |
| `Ipv4Network` | Red IPv4 |
| `ServiceProvisioning` | Servicio técnico |
| `RESERVED` / `CERTIFIED` / `ACTIVE` / `FAILED` / `RELEASED` | Reservado / Certificado / Activo / Sin aprovisionar / Liberado |
| `SIMPLE_QUEUE_STATIC_IP` | Cola simple con IP fija |
| `PCQ_ADDRESS_LIST` | PCQ con lista de direcciones |
| `REGULARIZED` | Regularizado |
| Certificar | Certificar servicio |

prod-ux lo revisa con `system-vocabulary-review` en el bloque P0 del plan.

## 9. Decisiones para G0

| ID | Decisión | Resolución del CTO (2026-10-22) |
| --- | --- | --- |
| D-NET-1 | Número de módulo | MOD13 «Red y Aprovisionamiento» |
| D-NET-2 | Aprobar ADR-098 y la enmienda de ADR-027 | Aprobar |
| D-NET-3 | Ajuste `enforceProvisioningOnInstallClose` | Se crea apagado y se enciende para todos los tenants en G7, después del bloque F2 |
| D-NET-4 | ¿Puede certificar `ADMIN`, además de `NOC` y la plantilla «Acceso estándar Aprovisionamiento»? | Sí, siempre con R6 |
| D-NET-5 | Prefijo admitido | Entre /16 y /30 |
| D-NET-6 | Evidencia válida para certificar | `PHOTO` o `DOCUMENT` de la OT (prueba de velocidad o CPE navegando) |
| D-NET-7 | Ejecutar la regularización del caso de origen en G7 por la UI, no por SQL | Sí. Requiere antes que su suscriptor tenga contacto real y datos fiscales completos (R11) |

## 10. Riesgos

Ver ADR-098 §Riesgos. Riesgo adicional de producto: hoy ningún suscriptor de `tenant_iwana` tiene contrato. Por eso RF-NET-11 no tendrá efecto visible hasta que se firmen contratos, y el servicio técnico se ancla a suscriptor y OT, no al contrato.
