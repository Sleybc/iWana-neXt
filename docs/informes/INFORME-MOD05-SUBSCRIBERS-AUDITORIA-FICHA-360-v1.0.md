# INFORME — Auditoría en profundidad de la ficha de Suscriptores (MOD05)

**Versión:** 1.0
**Estado:** Vigente
**Fecha:** 2026-09-04
**Modo activo:** Product Architect + Architect + EM
**Autor:** AI-EM-ARCH
**Superficie auditada:** `/dashboard/crm/subscribers` y `/dashboard/crm/subscribers/[id]` (`apps/portal`), módulo `crm/subscribers` (`apps/api`)
**Solicitado por:** CTO
**Consultas ejecutadas (protocolo §6):** AI-SEC-ENG (riesgo) · AI-PROD-UX (viabilidad UX) · AI-SR-FULL (factibilidad backend)
**Artefactos emitidos:** [PRD Fase 04](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-04-v1.0.md) · [Prompt de ejecución](../prompts/PROMPT-MOD05-SUBSCRIBERS-FASE-04-v1.0.md) · HLD v2.2

---

## 1. Origen y alcance

El CTO reportó tres síntomas: el mapa de datos no funciona, seguimiento no muestra historial, y faltan el inventario del cliente y los tickets. Se auditaron las tres capas —frontend, backend y normativa— con verificación directa en código.

Los tres síntomas se confirman. Pero el hallazgo determinante no estaba en la lista.

## 2. Hallazgo determinante — el stub era la norma, no la deuda

`PRD-MOD05-CRM-SUBSCRIBERS-FASE-03-v1.0.md` (**Aprobado**) ordenaba expresamente dejar equipos y tickets como stub:

- **RF-S360-14** (`:97`): *"dejando equipos y provisioning como stub explícito"*.
- **§3.2** (`:61`): *"Implementación real de facturación, pagos, tickets, dispositivos, provisioning o consumo"* declarado fuera de scope.
- **RNF-S360-08** (`:124`): los placeholders deben ser explícitos y no simular datos inexistentes.

Los adaptadores stub de `apps/api/src/modules/crm/adapters/` **no eran deuda técnica: eran la implementación conforme de esa norma.** La instrucción fue correcta al emitirse en abril de 2026, cuando MOD12 y MOD10 no existían.

Hoy la premisa cayó: MOD12 está **cerrado** con comodatos reales por suscriptor (`INFORME-MOD12-CIERRE-MODULO-v1.0.md:80-81`) y MOD10 está construido. El stub dejó de estar justificado por inexistencia y pasó a ser **deuda funcional** que incumple RF-CRM-02 del PRD maestro (`PRD_Sistema_ISP_Colombia_v2_4.md:372`).

AI-SR-FULL emitió `[BLOQUEO]` formal al detectarlo: congelar contratos de equipos y tickets excedía el PRD vigente. **Se resolvió emitiendo el PRD Fase 04** (D1 del CTO), que levanta la exclusión y marca los requisitos superados en el mismo acto.

## 3. Hallazgos por síntoma

### 3.1 El mapa — muerto por política de contenido desde su construcción

`apps/portal/next.config.ts:43-53` emite una CSP **sin `frame-src` ni `child-src`**. El `<iframe>` a `openstreetmap.org` de `apps/portal/src/components/crm/subscribers/SubscriberSections.tsx:576` cae por tanto a `default-src 'self'` y **el navegador lo bloquea**. El mapa nunca funcionó en este portal.

Agravante de privacidad: el iframe fija `referrerPolicy="no-referrer-when-downgrade"` (`:581`), que **degrada deliberadamente** la política del sitio y envía a un tercero la ruta con el identificador del suscriptor, junto a la latitud y longitud exactas del domicilio en la cadena de consulta. AI-SEC-ENG lo caracteriza así: en un registro fuera del control del tenant queda correlacionable *"este operador, a esta hora, consultó esta vivienda concreta"*.

**El repo ya tenía la solución sin usar.** Dos implementaciones Leaflet operativas: `crm/expedientes/sections/TechnicalFeasibilitySection.tsx:117-165` y `settings/CoverageMap.tsx`. Y `img-src` **ya autoriza** las teselas de OpenStreetMap (`next.config.ts:46`): **Leaflet no requiere ninguna directiva CSP nueva.** Veredicto de AI-SEC-ENG: Leaflet, no `frame-src` — cero política nueva y estrictamente menos dato transferido.

Defectos anexos del contrato de coordenadas:

| Defecto | Evidencia |
| --- | --- |
| Las coordenadas **no se pueden borrar** | `SubscriberSections.tsx:297-298` descarta el valor indefinido, y `packages/shared/src/schemas/subscriber.schema.ts:121-122` no acepta nulo |
| Llegan como **cadena, no como número** | `entities/subscriber.entity.ts:147,150` son `numeric` sin transformer; el portal las tipa como número (`api-client.ts:5285`) |
| Media coordenada es aceptable | Sin validación por pares |
| El nodo de cobertura nunca se muestra | `coverageNodeId` existe en el registro y no se renderiza en ninguna superficie |

### 3.2 Seguimiento — el dato existe y se descarta

Los tabs Financiero, Cumplimiento y Seguimiento son `StubCard`: una tarjeta cuyo cuerpo es una sola frase (`SubscriberDetailClient.tsx:26-48`, `:326-358`).

Lo relevante es que **el backend ya produce el dato y el frontend lo tira**:

- `timelineSeed` viaja en el payload 360° y tiene **cero consumidores** en `apps/portal/src`.
- `subscribers.service.ts:841-845` devuelve `contacts: []`, `quotes: []`, `habeasData: []`, `arcoRequests: []` **codificados a mano**, pese a que los servicios existen e indexan por suscriptor (`crm/contacts/contacts.service.ts:40`, `crm/habeas-data/habeas-data.service.ts:33,57`) y el puerto de cotizaciones ya está enlazado.
- `provisioningReadiness` se calcula y se emite (`subscribers.service.ts:867`) y **el tipo del portal ni lo declara**. Es drift de contrato con el dato de mayor valor operativo de la ficha.

El molde de bitácora ya está resuelto para oportunidades (`expedientes.controller.ts:297` + `SeguimientoTab.tsx`) y no se portó. AI-SR-FULL recomienda **proyección de lectura, sin entidad nueva**: los eventos ya están persistidos con la forma exacta; crear una tabla habría exigido migración, relleno retroactivo, doble escritura y pruebas de consistencia entre dos fuentes para reproducir un dato que ya está en disco.

### 3.3 Inventario del cliente — existe en MOD12, invisible desde CRM

`GET /inventory/loans?subscriberRefId=` funciona (`inventory.controller.ts:450`). Tres obstáculos lo hacían inutilizable desde la ficha:

1. `AssetLoanRecord` **solo devuelve identificadores** (`inventory/types/serialized-asset-detail.types.ts:57-67`): sin serial, sin dirección física, sin modelo, sin categoría. Resolverlo por fila sería consulta por fila contra otro módulo.
2. Exige `inventory.stock.read`, permiso que **el rol comercial no tiene**: la pestaña habría respondido denegación a quien más usa la ficha.
3. **Falta índice** `(tenant_id, subscriber_ref_id)` en `asset_loan_assignments`: barrido secuencial desde el primer día.

En la UI de inventario el suscriptor aparece como referencia opaca truncada, sin resolver el nombre y **sin enlace de vuelta** a la ficha (`inventory-labels.ts:510-522`).

### 3.4 Tickets — se enlazan escribiendo el identificador a mano

`AssuranceCreateTicketForm.tsx:196-201` captura la referencia del suscriptor en un campo de **texto libre** con marcador de posición `"Ej. subscriber-001"`. Sin selector, sin validación, sin autocompletado.

`ListTicketsQuerySchema` (`assurance/dto/index.ts:100-112`) acepta el solicitante pero **no el sujeto ni el tipo de solicitante**, pese a existir ya el índice parcial correspondiente. Consecuencias: los tickets donde el suscriptor es el **afectado** y no el reportante son invisibles; y como la columna de referencia es compartida entre tipos de solicitante, **el filtro es ambiguo por diseño**.

## 4. Hallazgos de seguridad (AI-SEC-ENG)

| ID | Severidad | Hallazgo | Bloquea cierre |
| --- | --- | --- | --- |
| **H-1** | Alta | `GET /crm/subscribers/search` acepta documento, NIT, correo y teléfono **en la cadena de consulta** (`subscribers.controller.ts:188-214`), y `nginx/nginx.prod.conf:104-121` **no desactiva el registro de acceso** en la ruta de API — a diferencia de la ruta de salud. Contradice literalmente ADR-067 §8. Agravante: no emite registro de acceso y devuelve hasta 100 filas con dirección, coordenadas y NIT | **Sí** |
| **H-2** | Alta | El listado habilita **7 roles** (`subscribers.controller.ts:102-110`) contra los **5** que autorizó ADR-067 §9, que ya señalaba el alcance como probablemente excesivo. Se amplió en sentido contrario y sin enmienda | **Sí** |
| **H-3** | Alta | Degradación explícita del referente hacia un tercero (§3.1). Se extingue al retirar el iframe | Se cierra con A1 |
| **H-4** | Media | **No existe migración de `subscriber_contacts`.** La entidad existe, el módulo está registrado y sus cuatro rutas responden error de servidor. Superficie muerta que aparenta estar viva | Si se toca contactos |
| **H-5** | Media | Contactos devuelve la entidad cruda con los campos cifrados y se gobierna con permisos de **oportunidades**, no de suscriptores | Si se toca contactos |
| **H-6** | Media | Las rutas de actualización y borrado de contacto **no verifican pertenencia** al suscriptor de la ruta: ruptura de autorización a nivel de objeto dentro del tenant | Si se toca contactos |
| **H-7** | Media | El registro de diferencias de auditoría se construye **después** de mutar la entidad (`subscribers.service.ts:485-504`): el valor anterior ya contiene el nuevo. El rastro no permite reconstruir el estado previo | No, pero se corrige en Ola A |
| **H-8** | Media | El registro de acceso compensatorio de ADR-067 §5 se invoca sin esperar y traga toda excepción: si falla, la respuesta con datos personales sale igual y no queda constancia | No |
| **H-9** | Baja | El campo cifrado de correo en contactos está dimensionado a 120 caracteres; el formato cifrado desborda con cualquier correo de más de 31 | No |

**Nota preventiva de AI-SEC-ENG, incorporada al diseño:** la bitácora **no debe leer libremente `audit_logs`**. Esa tabla contiene datos personales escritos antes de la lista de redacción, es de solo anexado por trigger, y proyectarla resucitaría esa exposición ante roles comerciales. De ahí la lista blanca cerrada del contrato C-2.

## 5. Otros defectos confirmados

- **El ordenamiento del listado es código muerto.** `SORTABLE_FIELDS: string[] = []` (`subscribers.service.ts:104`) hace que los parámetros de orden sean inertes, mientras el listado y el portal los exponen. ADR-065 `:218` llama a esto *"contrato falso"*. Toda la UI de cabezales ordenables y el selector móvil nunca se renderizan.
- **No existe contrato de lectura tipado.** `sanitizeResponse` devuelve un mapa sin tipo; el DTO de respuesta está huérfano y desactualizado; no hay tipos en `packages/shared`; el portal duplica ~170 líneas de tipos a mano (`api-client.ts:5255-5426`). `apps/api/openapi/` contiene un único archivo, y es de otro módulo.
- **Los tabs no son estado de URL** (`SubscriberTabsContainer.tsx:23`): sin enlace profundo, se pierden al recargar. Y les faltan las tres piezas del patrón APG que el contenedor de oportunidades **sí** tiene: flechas, índice de tabulación móvil y relación con el panel.
- **Sin gating de escritura.** El permiso de gestión existe en el enum y **no se usa en ningún componente** del módulo: un usuario de solo lectura ve todos los botones de guardar, editar y cambiar estado.
- **Campos incorregibles tras el alta**: estrato, segmento, WhatsApp y fecha de nacimiento se capturan al crear y no son editables. El estrato gobierna la sugerencia automática de IVA (`TaxProfileBlock.tsx:498-515`), así que un estrato mal digitado **no tiene camino de corrección** desde la ficha.
- **La edición de facturación escribe en otro agregado**: el panel de la vista general guarda contra la *oportunidad*, no contra el suscriptor (`SubscriberDetailClient.tsx:246`), y sus fallos solo llegan a la consola (`:250-251`).
- **Código y dependencias muertas**: `SubscribersLandingClient.tsx` no lo importa nadie; `react-leaflet` está instalado y jamás se importa; dos métodos del cliente de API no tienen invocación.
- **~3.000 líneas sin una sola prueba**: `SubscriberDetailClient`, `SubscriberSections`, `ServiciosTab`, `TaxProfileBlock` y `ContractDetailDrawer`.

## 6. Estado de gobernanza al inicio de la auditoría

| Artefacto | Estado hallado | Disposición tomada |
| --- | --- | --- |
| `PRD-MOD05-CRM-SUBSCRIBERS-v1.0` | `Propuesto` — bloqueaba el cierre | **Marcado `Superado`** |
| `PRD-MOD05-CRM-SUBSCRIBERS-FASE-02-v1.0` | `Propuesto` — bloqueaba el cierre | **Marcado `Superado`** |
| `PRD-...-FASE-03-v1.0` | `Aprobado`, contradictorio con esta fase | **Vigencia parcial**; RF-S360-11, RF-S360-14, §3.2, CA-S360-05 y CA-S360-08 marcados |
| `HLD-MOD05-ARQUITECTURA-v2.0` | Afirmaba un ciclo de vida que **contradice a ADR-027 (Aprobado)** desde la Fase 03 | **Corregido, v2.2** |
| Informe de Fase 02 | **No existe** | Absorbido por la Fase 04 |
| `CHECKLIST-MOD05-...-FASE-02-v1.0` | **0 de 50 ítems ejecutados** | Pendiente en el DoD de cierre |
| Informe de cierre de MOD05 | **No existe** | Pendiente en el DoD de cierre |
| ADR-067 | 4 de 5 criterios de aceptación **abiertos** | Pendiente; el registro de acceso masivo se incorpora a la fase |

## 7. Decisiones del CTO — 2026-09-04

| # | Decisión | Alternativas descartadas |
| --- | --- | --- |
| **D1** | Emitir **PRD Fase 04**, levantando la exclusión y resolviendo los dos PRDs en `Propuesto` | Addendum mínimo a Fase 03 (dejaba MOD05 sin poder cerrarse); dejar equipos y tickets fuera |
| **D2** | Adoptar la arquitectura de información de **AI-PROD-UX**: 7 tabs, equipos dentro de Servicios, Tributario absorbido en Financiero | 9 tabs (tira inmanejable en móvil); 8 tabs |
| **D3** | **Estrechar** el listado a los 5 roles de ADR-067 §9 | Enmendar el ADR; diferir con deuda declarada |
| **D4** | **Dos olas**: A visible sin migración, B integración cross-módulo | Ola única; solo corrección de defectos |

## 8. Deuda declarada que esta fase no paga

| Deuda | Severidad | Razón |
| --- | --- | --- |
| Cifrado de identidad, domicilio, fecha de nacimiento y geolocalización; NIT en claro — hallazgo S-3 de ADR-078 (propuesto) | Media | Excede el boundary del módulo |
| Transformer numérico en oportunidades (`expediente-record.entity.ts:151-152`) | Media | Altera la comparación por veracidad donde una latitud de 0 es alcanzable — el ecuador cruza Colombia. Exige corregir antes la comparación |
| Registro de intentos de contacto sobre suscriptores | Media | No hay almacén; crearlo es alcance funcional nuevo |
| Indicador de tab lima en el contenedor de oportunidades (`ExpedienteTabsContainer.tsx:104`) | Baja | Contradice `INFORME-MOD05-CRM-DETALLE-SUSCRIPTORES-AUDITORIA-UIUX-v1.0.md:152`. Es de oportunidades, no de suscriptores. Se reporta a AI-DS-OWNER |
| Tab de Documentos | — | No existe repositorio documental por suscriptor. Un contenedor vacío no es una entrega |

## 9. Estado tras la auditoría

**MOD05 pasa de `Suspendido` a `En curso`** (Ola 2). Con MOD02 y MOD05 abiertos, el programa vuelve a la **cota de dos módulos** de ADR-080 §Decisión 4 por primera vez desde que la cota entró en vigor.

Gate de citas normativas: `pnpm audit:adr-citations` → **`BLOQUEANTE: 0`**.

Pendiente de ejecución: los bloques A-BE1 a A-QA1 y B-BE1 a B-QA1 del [prompt de la fase](../prompts/PROMPT-MOD05-SUBSCRIBERS-FASE-04-v1.0.md).
