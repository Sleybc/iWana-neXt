# Informe de deriva de contratos — Privacy Fase 1a

**Fecha:** 2026-10-14  
**Bloque:** C3b · contract-drift-reviewer  
**Resultado:** **NO-GO** — dos respuestas consumidas con una envoltura HTTP distinta a la que entrega la API; una brecha de tipado en el cliente.

## Alcance

Comparé los schemas de `packages/shared/src/schemas/privacy/**` y `subscriber.schema.ts` con sus productores en `apps/api` y consumidores en `apps/portal/src/lib/api-client.ts` y `apps/portal/src/components/privacy/**`. Incluí A23, A24 y la proyección 360° (`habeasData`, `arcoRequests`, `privacyMarks`). Revisión estática, sin modificar producción ni ejecutar pruebas.

## Hallazgos

### P1 — El portal no puede leer la URL firmada de evidencia

- **Productor:** `apps/api/src/modules/privacy/requests/requests.controller.ts:207` documenta una respuesta directa `{ url, expiresAt }`; `:223` la devuelve sin `{ data: ... }`.
- **Consumidor:** `apps/portal/src/lib/api-client.ts:9897` usa `request()` con el comportamiento normal de desempaquetar `body.data` (`:805`); `apps/portal/src/components/privacy/PrivacyRequestDetail.tsx:204` desestructura `url` del resultado.
- **Escenario:** al pulsar «Ver evidencia», `request()` entrega `undefined`; el portal no abre la evidencia y cae en el mensaje de error. El schema OpenAPI del endpoint también describe el objeto sin envoltura.
- **Corrección sugerida:** acordar una sola forma: envolver la respuesta del API en `data` o hacer que el cliente solicite la respuesta completa y valide el objeto directo.

### P1 — El inventario declarativo falla al cargarse en el portal

- **Productor:** `apps/api/src/modules/privacy/inventory/inventory.controller.ts:42` declara el retorno `PrivacyInventory`; `:43` devuelve el objeto directamente. `apps/api/src/modules/privacy/privacy-openapi.schemas.ts:256` documenta esa forma directa.
- **Consumidor:** `apps/portal/src/lib/api-client.ts:9951` llama `request()` y luego aplica `privacyInventorySchema`; `request()` devuelve `body.data` por defecto (`:805`).
- **Escenario:** el API responde con `{ generatedAt, databases }`; el helper devuelve `undefined` y el parseo falla. La sección de inventario no puede mostrar su contenido.
- **Corrección sugerida:** alinear el API o el consumidor con la misma envoltura, manteniendo el schema de respuesta acordado.

### P2 — Los métodos del cliente debilitan enums definidos por el contrato compartido

- `packages/shared/src/schemas/privacy/requests.ts:37` limita canales de respuesta; `:38` define fundamentos legales como enums.
- `apps/portal/src/lib/api-client.ts:9804` y `:9805` tipan `kind` y `status` del filtro como `string`; `:9844`, `:9863`, `:9873` y `:9881` también aceptan `string` para canal y fundamento en transiciones.
- **Escenario:** TypeScript permite enviar valores que el schema Zod del API rechazará con 400; el portal pierde la validación estática del contrato. La UI actual usa opciones válidas, por lo que no observé un fallo de ejecución concreto.
- **Corrección sugerida:** usar los tipos inferidos del schema compartido en los parámetros de filtros y cuerpos de transición.

## Contratos verificados sin deriva observada

- **A23:** `dataSubjectRequestDetailSchema` (`packages/shared/src/schemas/privacy/requests.ts:265`) contiene los campos de identidad y el `requester` nullable; `PrivacyRequestsService.get()` (`apps/api/src/modules/privacy/requests/requests.service.ts:421`) produce esos mismos campos y el portal parsea el detalle con el schema compartido (`apps/portal/src/lib/api-client.ts:9829`). No se proyectan `mediaId`, `identity_verified_by` ni actor de eventos.
- **A24:** el schema de escritura requiere `ConsentChannel` (`packages/shared/src/schemas/privacy/authorizations.ts:13`); el puerto restringe valores históricos a `LEGACY_IMPORT` (`apps/api/src/modules/privacy/ports/privacy-authorization-write.port.ts:4`), y el adaptador conserva ese camino histórico. La vista de lectura usa `channel: string` para permitir esos registros heredados (`authorizations.ts:24`).
- **Vista 360°:** API y portal declaran `habeasData: DataAuthorizationView[]`, `arcoRequests: RequestSummary[]` y `privacyMarks: PrivacyMark[]` (`apps/api/src/modules/crm/subscribers/subscribers.service.ts:1080` y `:1134`; `apps/portal/src/lib/api-client.ts:5672`). El adaptador CRM obtiene esas proyecciones desde los puertos privacy.
- La carga de evidencia y las respuestas de incidentes, autorizaciones, textos legales y marcas consumen la envoltura `data` que sus controladores entregan.

## Cierre

**NO-GO** hasta alinear las respuestas de evidencia e inventario con el comportamiento del cliente. El hallazgo P2 no bloquea por sí solo el uso actual, pero deja sin comprobación estática varios enums del contrato.
