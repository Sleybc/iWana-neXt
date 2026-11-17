# Spec — `privacy` · Bloqueo del titular en proyecciones operativas fuera de CRM y Billing

**Versión:** 1.0
**Estado:** Propuesta. Pendiente del G0 del CTO sobre §8. No se implementa nada antes de ese G0.
**Fecha:** 2026-11-05
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Prioridad:** alta para G7, sin fecha propia. No hay producción hasta la beta ([ADR-095](../adrs/ADR-095-Topologia-Productiva-Dominio-TLS-Hosting.md)), así que no hay titulares reales afectados. No bloquea MOD14.
**Artefactos base:** [ADR-094](../adrs/ADR-094-Modelo-Proteccion-Datos-Personales-Habeas-Data.md) D7 · [HLD Privacy v1.4](../hlds/HLD-PRIVACY-HABEAS-DATA-v1.4.md) §6.7 · [spec del barrido de texto libre](2026-11-03-privacy-barrido-texto-libre-supresion-spec.md)
**Plan:** [2026-11-05-privacy-bloqueo-proyecciones-operativas-orquestacion.md](../plans/2026-11-05-privacy-bloqueo-proyecciones-operativas-orquestacion.md) · **Lanzador:** [PROMPT-PRIVACY-BLOQUEO-PROYECCIONES-LAUNCH-v1.0](../prompts/PROMPT-PRIVACY-BLOQUEO-PROYECCIONES-LAUNCH-v1.0.md)

---

## 1. Resultado en una línea

ADR-094 D7 dice que un dato bloqueado «sale de toda proyección operativa», pero la marca `DATOS_BLOQUEADOS` solo se aplica en CRM y Billing. Tickets, visitas, órdenes de trabajo, aprovisionamiento y `parties` siguen mostrando el nombre, y a veces la dirección, sin consultarla.

## 2. Método y límites

- Lectura de código. Se buscaron todos los consumidores de `IPrivacyMarksReadPort` y todas las rutas `GET` que devuelven datos del titular.
- Solo estos módulos consultan la marca: `crm/subscribers`, `crm/expedientes`, `crm/contracts` y `billing`. Toda ruta fuera de ellos que devuelve un dato del titular lo hace sin mirarla.
- **No se ejecutó con canarios.** El inventario se confirma con pruebas en la Ola 1. Las filas de §5 quedan por confirmar.
- `DATOS_BLOQUEADOS` solo se abre al rechazar una supresión con `DEBER_LEGAL_CONSERVACION`, y ese fundamento exige no tener contrato abierto (`requests.service.ts:910`). Son exclientes, con historial en todos estos módulos.
- Esta spec no es una conclusión jurídica.

## 3. Inventario de fugas

| # | Ruta | Dato expuesto | Origen | Perfiles | Severidad |
| --- | --- | --- | --- | --- | --- |
| F-1 | `GET /assurance/tickets`, `/tickets/:id` | Nombre completo en `subject`: `Instalación — ${expedienteFullName}` | `tickets.service.ts:816`, enviado por el portal | Soporte y operación | Alta |
| F-2 | `GET /wfm/visit-requests`, `/:id` | `customerDisplayName` | `visit-requests.service.ts:1197-1206` y `:1217`, con `findDisplayNamesByIds` y `findDisplayNameById` (`expediente.service.ts:1060`, `:1078`), que no miran la marca | Operación y despacho | Alta |
| F-3 | `GET /wfm/visit-requests`, `/wfm/events` | `address` | `visit-requests.service.ts:499`, `schedule-events.service.ts:341` | Operación y despacho | Alta |
| F-4 | `GET /execution-orders`, `/:id` | `customerDisplayLabel` y `serviceAddress`, congelados en la OT | `execution-orders.service.ts:577`, `:1170-1171`; se copian desde visitas en `visit-requests.service.ts:956` | Técnicos, NOC, operación | Alta |
| F-5 | `GET /network/provisioning/inbox`, `/orders/:id/context` | Etiqueta del suscriptor | `service-provisioning.service.ts:907`, `:1039` | ADMIN, NOC | Media |
| F-6 | `GET /parties`, `/:id`, `/:id/contacts` | Party completo, con documento descifrado y contactos | `parties.controller.ts:58`, `:88`, `:197` | Solo ADMIN, que no trae `crm.blocked_data.read` | Alta |
| F-7 | `GET /execution-orders/:id/evidences`, `/evidence-assets/:id`, `/content` | Evidencias y firma | `execution-orders.controller.ts:234`, `:599`, `:610` | Técnicos, NOC, operación | Media |
| F-8 | `GET /media/:id/signed-url` | Cualquier asset por id, sin relación con el titular | `media.controller.ts:114` | ADMIN, NOC, ACCOUNTANT, SUPPORT | Media: exige conocer el id |

## 4. Descartados: no son fuga

| Ruta o módulo | Motivo |
| --- | --- |
| Búsqueda global | Es de plataforma e indexa empresas, usuarios y navegación; no suscriptores |
| `crm/contacts` | `ContactsModule` está desmontado (D-CONT) |
| `crm/attributions`, `crm/responsibilities` | Devuelven actores internos, no datos del titular |
| `audit_logs` | Sin PII por diseño; los escritores con texto libre son C-1 del barrido |
| `apps/worker` | No lee tablas del titular |

## 5. Por confirmar en la Ola 1

| Ruta | Duda |
| --- | --- |
| `GET /subscribers/:id/habeas-data/consents`, `/arco` | La leen ventas y soporte. Hay que ver qué devuelve |
| `GET /opportunities`, `/quotes` | Tienen `subscriberId` y `title` libre |
| `GET /crm/customers/:id/overview` | Devuelve `fullName` de `ProspectCase`; falta saber si un prospecto enlaza al titular |
| `GET /crm/potentials` | Nombre y contacto sin vínculo al Party: la marca no lo alcanza. Si no hay vínculo, se declara como límite |
| `inventory` | Equipos asignados en sitio del cliente |

## 6. Relación con el barrido

No se duplican. El barrido actúa en la **supresión**: anonimiza y escribe, una vez. Esta spec actúa en la **lectura** mientras dura el bloqueo: los datos deben conservarse, así que no se reescriben. R-3 a R-6 del barrido tratan las mismas columnas de tickets con otra regla, y las dos deben convivir.

## 7. Decisiones propuestas

### D-BLQ-1. Misma regla que CRM

Con `crm.blocked_data.read` o `privacy.read`, el dato se ve y se audita antes de responder; si la auditoría falla, 503 `PRIVACY_AUDIT_UNAVAILABLE`. Sin permiso se muestra «[Dato protegido por custodia legal]». Un listado audita una sola vez, con el conteo de bloqueados servidos.

### D-BLQ-2. Un puerto, una resolución

CRM expone `TitularProtectionReadPort.protectedRefs({ subscriberIds, expedienteIds, contractIds, partyIds })`, por lotes y sin PII, sobre `IPrivacyMarksReadPort`. Cada módulo enmascara en su proyección. Ningún módulo lee la marca ni tablas de CRM por su cuenta. Los métodos `findDisplayName*` de `expediente.service.ts` no se usan para proyectar sin pasar por esta regla.

### D-BLQ-3. Enmascarar al leer, nunca reescribir

El bloqueo conserva. Si se levanta, los datos vuelven intactos. Un `subject` con nombre se reemplaza entero en la respuesta del ticket enlazado.

### D-BLQ-4. Cortar la copia en origen

El ticket de instalación deja de copiar el nombre: `Instalación — {código del expediente}`. Reduce F-1 y R-3 del barrido a futuro. Cambia `tickets.service.ts:816`, `expedienteFullName` en el DTO y `SchedulingClient.tsx:501`.

### D-BLQ-5. Excepción operativa: OT abierta

Un excliente puede tener una OT abierta, como la recuperación de equipos. Propuesta: en una OT no terminal, el técnico asignado ve la **dirección**, y el nombre sale como «[Dato protegido por custodia legal]». En una OT terminal, los dos se ocultan. ⚠ Pregunta para el abogado: si recuperar equipos entra en los fines que permite el bloqueo.

### D-BLQ-6. `parties`

Aplica D-BLQ-1. ADMIN no recibe el permiso por defecto: sin él, ve la máscara.

### D-BLQ-7. Evidencias y Media

Las evidencias de una OT protegida siguen D-BLQ-1. `GET /media/:id/signed-url` comprueba el titular dueño del asset cuando existe el vínculo. Si no existe en todos los assets, se declara como límite y se trata en una decisión aparte.

### D-BLQ-8. Invariante

Una prueba de arquitectura lista las proyecciones con datos del titular y falla si una nueva no pasa por el puerto. Sigue el patrón de `erasure-coverage.invariant.spec.ts`.

### D-BLQ-9. Orden

Después de H-2 y del commit del barrido, porque comparten `assurance` y `wfm`. Bloquea G7, igual que el barrido.

## 8. Puntos para el G0 del CTO

1. Regla común y puerto (D-BLQ-1 y 2).
2. Enmascarar sin reescribir (D-BLQ-3).
3. Cortar el nombre en el `subject` (D-BLQ-4).
4. **OT abierta:** dirección visible y nombre oculto (D-BLQ-5).
5. `parties` para ADMIN (D-BLQ-6).
6. Media (D-BLQ-7).
7. Registrar esta spec como condición de salida de G7 (D-BLQ-9).

## 9. Criterios de aceptación

| ID | Criterio | Prueba |
| --- | --- | --- |
| CA-BLQ-01 | Con un titular bloqueado sembrado como canario, ninguna ruta de §3 devuelve su nombre, documento o dirección sin permiso | Integración contra PostgreSQL |
| CA-BLQ-02 | Con permiso, cada ruta devuelve el dato y audita antes de responder; si la auditoría falla, 503 sin datos | Integración |
| CA-BLQ-03 | Un listado genera una sola auditoría, con el conteo | Integración |
| CA-BLQ-04 | Las filas de la base quedan intactas; al cerrar la marca, los datos vuelven | Integración |
| CA-BLQ-05 | Un cliente sin marca no cambia de comportamiento en ninguna ruta | Suites existentes sin ajustes |
| CA-BLQ-06 | OT abierta y OT terminal cumplen D-BLQ-5 | Integración |
| CA-BLQ-07 | El ticket nuevo de instalación no contiene el nombre | Unitaria y E2E de agendamiento |
| CA-BLQ-08 | El invariante falla con una proyección nueva sin puerto | Arquitectura |
| CA-BLQ-09 | Cada fila de §5 queda clasificada como fuga, descartada o límite | Informe |
