# MOD05 Suscriptores — Fase 04: completitud de la ficha 360° — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: usa `subagent-driven-development` (recomendado) o `executing-plans` para ejecutar tarea por tarea. Los pasos usan checkbox (`- [ ]`) para seguimiento. Ejecutores: **AI-DS-OWNER ∥ AI-SR-FULL ∥ AI-PLAT-OPS → AI-FE-PLATFORM → AI-SR-QA**. AI-EM-ARCH no implementa código.

**Goal:** Que la ficha `/dashboard/crm/subscribers/[id]` responda sin salir de ella dónde vive el suscriptor, qué le ha pasado, qué tiene instalado y qué le falla — y que MOD05 quede cerrable en la Ola 2 del roadmap.

**Architecture:** CRM no lee tablas de MOD12 ni de MOD10: consulta **por puertos tipados** declarados en el consumidor e implementados en el proveedor. La bitácora es **proyección de lectura** sobre eventos ya persistidos, sin entidad nueva ni relleno retroactivo. El mapa pasa de marco embebido bloqueado por CSP a **Leaflet**, que no requiere ninguna directiva nueva. La ficha **lee**; nunca produce el hecho.

**Tech Stack:** NestJS + TypeORM + PostgreSQL por schema de tenant + Zod + Next.js portal + Leaflet + Jest + Playwright. Sin librería de mapas nueva (Leaflet ya está instalado).

**PRD:** [PRD-MOD05-CRM-SUBSCRIBERS-FASE-04-v1.0.md](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-04-v1.0.md) — Aprobado
**Prompt G4:** [PROMPT-MOD05-SUBSCRIBERS-FASE-04-v1.0.md](../prompts/PROMPT-MOD05-SUBSCRIBERS-FASE-04-v1.0.md) — contratos C-1 a C-8 congelados
**Spec UX congelada:** [2026-09-04-mod05-subscriber-360-ux-spec.md](../specs/2026-09-04-mod05-subscriber-360-ux-spec.md) — 48 criterios `CA-UX-S360-nn`, estados y copy
**Auditoría de origen:** [INFORME-MOD05-SUBSCRIBERS-AUDITORIA-FICHA-360-v1.0.md](../informes/INFORME-MOD05-SUBSCRIBERS-AUDITORIA-FICHA-360-v1.0.md)

---

## 0. Bloqueos — ambos cerrados

| # | Bloqueo | Dueño | Estado |
| --- | --- | --- | --- |
| **BL-1** | `subscriber_contacts` sin migración | CTO | ✅ **RESUELTO 2026-09-04** — ver abajo |
| **BL-2** | Orden por columna del listado | ADR-065 | ✅ **RESUELTO 2026-09-04** — ver abajo |

### BL-1 — resuelto: se construye con tope

La auditoría encontró **duplicación funcional**, no un simple olvido de migración: la tabla nunca existió, pero la capacidad de contacto alterno **sí funciona** vía `altContactName`/`altContactPhone` en la tabla de suscriptores (migración `016`), presentes en el schema compartido y editables en `SubscriberSections.tsx:474`. El módulo sobrevivió invisible porque sus dos pruebas **mockean `runInTenantSchema` completo** y pasan en verde sobre una tabla inexistente.

**Decisión del CTO:** no se retira. Se necesita espacio para dos contactos más, añadibles con una acción de añadir.

**Diseño fijado por AI-EM-ARCH:**

| Punto | Decisión |
| --- | --- |
| Modelo | La tabla pasa a ser **fuente única**. No conviven dos mecanismos para la misma capacidad |
| Tope | **3 por suscriptor** — el alterno de hoy más los dos pedidos. Regla de servicio, no de esquema |
| Dato existente | Backfill del contacto alterno como **primer registro** |
| Columnas viejas | **Deprecadas en su sitio, no eliminadas** (expansión y contracción). El drop es fase posterior |
| Defectos | H-5, H-6 y H-9 se corrigen **en el mismo acto**, no después |

Contrato completo en **C-8** del prompt. Bloque nuevo: **A-BE6**, que ahora precede a A-BE1.

### BL-2 — resuelto: no era una decisión, era aplicar el ADR

Estaba mal encuadrado como "medir o retirar". **ADR-065 ya lo decidió, en dos frases literales:**

- **§Decisión 1:** *"`sortableFields: []` es un estado conforme, **no deuda**. Un recurso puede permanecer así indefinidamente sin incumplir esta decisión."*
- **§Decisión 3:** *"Anunciar un parámetro que el servidor ignora... es un contrato falso: se corrige **retirando el anuncio, no poblando la lista**."*

Acción: **retirar el anuncio** de los parámetros de orden. `SORTABLE_FIELDS = []` se queda, y el primitive de cabecera ordenable **no se retira** (§Decisión 4): es fail-closed y espera contrato.

**Por qué no se mide aquí**, aunque se pudiera:

1. **No es problema de MOD05.** Los cuatro recursos que declaran la constante la tienen vacía: tickets, tareas, partes y suscriptores. §Decisión 5 asigna la medición a **AI-PLAT-OPS** y el tramo se autoriza recurso por recurso.
2. **No hay dataset.** `packages/database/src/seeds/` tiene un único archivo, ajeno a suscriptores. Sin volumen no hay p95 creíble, y §Decisión 2 prohíbe publicar sin medir.
3. **El portal ya está listo.** `canSort` deriva de `sortableFields.length > 0`: cuando llegue el tramo, no hará falta tocarlo.

**Ambos bloqueos cerrados. El plan arranca sin dependencias abiertas.**

---

## 1. Ruta crítica y paralelismo

```
OLA A  (sin cruce de boundary)
├─ A-DS1  DS-OWNER    spec del primitive de mapa      ─┐
├─ A-BE2  SR-FULL     bitácora (proyección)           ─┤
├─ A-BE3  SR-FULL     seguridad H-1/H-2/H-7           ─┤ paralelo
├─ A-OPS1 PLAT-OPS    registro de acceso del proxy    ─┤ (contra C-1..C-5, C-8)
├─ A-BE5  SR-FULL     coordenadas (C-5)               ─┤
├─ A-BE6  SR-FULL     contactos + migración 126 (C-8) ─┘
│                          │
├─ A-BE1  SR-FULL     relleno del 360°        ← A-BE6
├─ A-BE4  SR-FULL     retiro del anuncio de orden ← sin dependencias
│
└─ A-FE1  FE-PLATFORM ficha 360°   ← A-DS1 (mapa) + A-BE2 (bitácora) + A-BE5 (coords) + A-BE6 (contactos)
   └─ A-QA1 SR-QA     evidencia    ← A-FE1
                                                  │
                                            ═══ GATE OLA A ═══
                                                  │
OLA B  (integración cross-módulo)
├─ B-BE1  SR-FULL     contratos en @iwana/shared   ← secuencial, bloquea todo B
│  └─ B-BE2  SR-FULL     OpenAPI + spec guardián
│     ├─ B-BE6  SR-FULL     migración de índices    ─┐
│     ├─ B-BE3  SR-FULL     equipos (C-3)  ← B-BE6  ─┤ paralelo
│     ├─ B-BE4  SR-FULL     tickets (C-4)           ─┤
│     ├─ B-BE5  SR-FULL     proyección geo (C-6)    ─┘
│     └─ B-FE1  FE-PLATFORM cablear paneles ← B-BE3 + B-BE4
│        └─ B-QA1 SR-QA     evidencia
```

**Ruta crítica de la Ola A:** `A-BE6 → A-FE1 → A-QA1`. Con la incorporación de contactos, la migración `126` pasa a ser el nuevo cuello: A-BE1 y la UI de contactos cuelgan de ella. `A-DS1` sigue siendo crítica en paralelo para el mapa.
**Ruta crítica de la Ola B:** `B-BE1 → B-BE2 → B-BE6 → B-BE3 → B-FE1 → B-QA1`.

**Regla de no intervención (protocolo §3bis.3):** mientras un bloque respete su contrato de §2 del prompt y no toque alcance, boundary, tokens de marca ni dependencias nuevas, **decide y ejecuta sin gate de AI-EM-ARCH**. Un cambio de contrato es el único evento que fuerza re-sync, y se coordina vía AI-EM-ARCH: se versiona y se notifica, nunca se parchea en silencio.

**Estimación:** Ola A ~5-6 d con paralelismo (~10 serializados; +1,5 d por contactos). Ola B ~4-5 d con paralelismo (~7 serializados).

---

## 2. File map

### Ola A

| Archivo | Responsable | Rol |
| --- | --- | --- |
| `docs/specs/2026-09-04-primitive-mapa-portal.md` | DS-OWNER | **Nuevo** — contrato C-1 del primitive |
| `apps/api/src/modules/crm/subscribers/entities/subscriber.entity.ts` | SR-FULL | Transformer numérico en lat/lng (`:147,150`) |
| `packages/shared/src/schemas/subscriber.schema.ts` | SR-FULL | Anulabilidad + validación por pares (`:121-122`) |
| `apps/api/src/modules/crm/subscribers/subscribers.service.ts` | SR-FULL | Schema de ubicación (`:69-70`), semántica de nulo, relleno del 360° (`:841-845`), diff antes de mutar (`:485-504`), bitácora |
| `apps/api/src/modules/crm/subscribers/subscribers.controller.ts` | SR-FULL | Estrechar roles (`:102-110`), búsqueda sin PII en URL (`:188-214`), endpoint de bitácora |
| `apps/api/src/modules/crm/subscribers/subscribers.module.ts` | SR-FULL | Importar módulos de contactos, habeas data y puerto de cotizaciones |
| `apps/api/src/modules/crm/subscribers/dto/subscriber-timeline.dto.ts` | SR-FULL | **Nuevo** — molde de `expedientes/dto/expediente-timeline.dto.ts` |
| `packages/database/src/migrations/tenant/126_create_subscriber_contacts.ts` | SR-FULL | **Nuevo** — tabla ausente + backfill del contacto alterno + ancho cifrado corregido |
| `apps/api/src/modules/crm/contacts/entities/subscriber-contact.entity.ts` | SR-FULL | Ancho de columnas cifradas (H-9); retirar el comentario obsoleto sobre "legado en retiro" |
| `apps/api/src/modules/crm/contacts/contacts.service.ts` | SR-FULL | Verificación de pertenencia (H-6, `:50-74`), tope de 3, descifrado |
| `apps/api/src/modules/crm/contacts/contacts.controller.ts` | SR-FULL | Permisos de suscriptores (`:35,54,65,77`), no devolver cifrado (H-5, `:56-61`), prefijo `/crm/` |
| `apps/api/src/modules/crm/contacts/tests/*.spec.ts` | SR-FULL | Al menos una prueba **contra el esquema real** — hoy ambas pasan sobre una tabla inexistente |
| `nginx/nginx.prod.conf` | PLAT-OPS | Desactivar registro de acceso en `/api/` (`:104-121`) |
| `apps/portal/next.config.ts` | FE-PLATFORM | Política de referente propia en `headers()` |
| `apps/portal/src/components/shared/PortalMapView.tsx` | FE-PLATFORM | **Nuevo** — primitive Leaflet según C-1 |
| `apps/portal/src/components/crm/subscribers/SubscriberSections.tsx` | FE-PLATFORM | Retirar el iframe (`:569-593`) y montar el primitive |
| `apps/portal/src/components/crm/subscribers/SubscriberDetailClient.tsx` | FE-PLATFORM | 7 tabs, card de preparación para activación, gating de escritura |
| `apps/portal/src/components/crm/subscribers/SubscriberTabsContainer.tsx` | FE-PLATFORM | Patrón APG + estado de URL (`:22-56`) |
| `apps/portal/src/components/crm/subscribers/SeguimientoTab.tsx` | FE-PLATFORM | **Nuevo** — espejo de `crm/expedientes/SeguimientoTab.tsx` |
| `apps/portal/src/lib/api-client.ts` | FE-PLATFORM | Declarar preparación para activación y bitácora |
| `apps/portal/src/components/crm/subscribers/SubscribersLandingClient.tsx` | FE-PLATFORM | **Borrar** — código muerto |

### Ola B

| Archivo | Responsable | Rol |
| --- | --- | --- |
| `packages/shared/src/contracts/crm/*.ts` | SR-FULL | **Nuevos** — 6 contratos de lectura |
| `apps/api/openapi/crm-subscribers.v1.json` | SR-FULL | **Nuevo** — congelado v1.0.0 |
| `apps/api/src/modules/crm/subscribers/subscribers.swagger.spec.ts` | SR-FULL | **Nuevo** — guardián, molde de `tasks/tasks.swagger.spec.ts:128-133` |
| `apps/api/src/modules/crm/ports/subscriber-equipment-read.port.ts` | SR-FULL | **Nuevo** — C-3 |
| `apps/api/src/modules/crm/ports/subscriber-ticket-read.port.ts` | SR-FULL | **Nuevo** — C-4 |
| `apps/api/src/modules/inventory/adapters/subscriber-equipment-read.adapter.ts` | SR-FULL | **Nuevo** — el join vive en MOD12 |
| `apps/api/src/modules/inventory/services/asset-loan.service.ts` | SR-FULL | `leftJoin` para `?expand` (`:109-152`) |
| `apps/api/src/modules/assurance/adapters/subscriber-ticket-read.adapter.ts` | SR-FULL | **Nuevo** — con actor propagado |
| `apps/api/src/modules/assurance/dto/index.ts` | SR-FULL | Sujeto + tipo de solicitante (`:100-112`) |
| `packages/database/src/migrations/tenant/127_crm_subscriber_360_indexes.ts` | SR-FULL | **Nuevo** — 2 índices concurrentes. *(`124` y `125` están tomadas por MOD12)* |
| `apps/portal/src/components/crm/subscribers/EquipmentPanel.tsx` | FE-PLATFORM | **Nuevo** — dentro de Servicios |
| `apps/portal/src/components/crm/subscribers/TicketsTab.tsx` | FE-PLATFORM | **Nuevo** |
| `apps/portal/src/components/assurance/AssuranceCreateTicketForm.tsx` | FE-PLATFORM | Selector de suscriptor (`:196-201`) |

---

## 2bis. Qué lee cada agente antes de tocar código

Todos: `AGENTS.md` → el **PRD** (§5 RF, §6 RNF, §8 CA) → el **prompt** (§2 contratos) → este plan. Además, por bloque:

| Bloque | Lectura obligatoria adicional | Skill de `.agents/skills/` |
| --- | --- | --- |
| A-DS1 | `TechnicalFeasibilitySection.tsx:106-180` (origen del patrón) | `core-components`, `tailwind-patterns` |
| A-BE2 | `expedientes.controller.ts:297` + `dto/expediente-timeline.dto.ts` (molde) · ADR-065 | `nestjs-expert` |
| A-BE3 | ADR-067 §5, §8, §9 · `nginx.prod.conf:98` (patrón de la ruta de salud) | `backend-security-coder`, `security-auditor` |
| A-BE4 | **ADR-065 §Decisión 1, 3, 4 y 5** — la norma que cierra BL-2 | `nestjs-expert` |
| A-BE5, A-BE6 | ADR-066 (migraciones) · `089_pagination_ordering_indexes.ts:181-186` (guard) | `database-migration`, `postgresql` |
| A-FE1 | **`docs/specs/2026-09-04-mod05-subscriber-360-ux-spec.md`** (48 criterios, estados y copy) · spec de A-DS1 · disposiciones del informe UI/UX | `nextjs-app-router-patterns`, `iwana-identity-ui-review`, `system-vocabulary-review` |
| A-QA1, B-QA1 | ADR-065 §14 · CA del PRD §8 | `testing-patterns`, `playwright-skill` |
| B-BE1, B-BE2 | `tasks/tasks.swagger.spec.ts:128-133` (molde del guardián) · `openapi/tasks-execution-orders.v1.json` | `openapi-spec-generation` |
| B-BE3 | **ADR-048** · `tenant-crm-read-adapter.service.ts:16` (patrón puerto/adaptador) | `nestjs-expert` |
| B-BE4 | **ADR-038** · `tickets.service.ts:335` (regla de propiedad que NO se puede eludir) | `nestjs-expert`, `security-auditor` |
| B-BE5 | **ADR-067 §3, §6** — la cota no se relaja | `backend-security-coder` |

---

## 2ter. Secuencia de arranque

**Sin dependencias — se lanzan a la vez (7 bloques):**
`A-DS1` · `A-BE2` · `A-BE3` · `A-BE4` · `A-BE5` · `A-BE6` · `A-OPS1`

Prioridad dentro del arranque: **`A-BE6` primero**, porque es la ruta crítica (la migración `126` desbloquea A-BE1 y la UI de contactos), y **`A-DS1` inmediatamente después**, porque A-FE1 no puede empezar el mapa sin su contrato.

**Segundo turno:** `A-BE1` (tras A-BE6) · `A-FE1` (tras A-DS1, A-BE2, A-BE5 y A-BE6).
**Tercero:** `A-QA1`. **Luego:** Gate Ola A.

---

## 3. Tareas — Ola A

### A-DS1 · AI-DS-OWNER — contrato del primitive de mapa `[carril rápido, sin gate]`

- [ ] Extraer el patrón de `crm/expedientes/sections/TechnicalFeasibilitySection.tsx:106-180`: import diferido, `ResizeObserver` + `invalidateSize()`, manejo de `tileerror`
- [ ] Publicar la spec en `docs/specs/` con API (`latitude`, `longitude`, `readOnly`, `height`, `label`) y los **4 estados** de C-1
- [ ] Verificar que no exige ningún token nuevo. Si lo exigiera → `[BLOQUEO]`, no invención

### A-BE5 · AI-SR-FULL — coordenadas (C-5)

- [ ] Transformer numérico en la entidad. **Prohibido `pg.types.setTypeParser`** — convertiría el importe de `inventory-item.entity.ts:97`, que es cadena deliberadamente contra el error de coma flotante
- [ ] Anulabilidad en los **tres** sitios (schema compartido, schema de sección, semántica de actualización con `'latitude' in dto`, **nunca `??`**)
- [ ] Validación por pares: ambas o ninguna
- [ ] **No tocar oportunidades.** `crm/expedientes/status-transition.service.ts:102` compara por veracidad y con número una latitud de 0 pasa a ser falsa — el ecuador cruza Colombia
- [ ] Pruebas: borrado, media coordenada, fuera de rango, serialización numérica

### A-BE2 · AI-SR-FULL — bitácora (C-2)

- [ ] Endpoint con `page`, `limit 1..50` (def. 5), `filter`, cota compuesta `page × limit ≤ 500`
- [ ] **Lista blanca cerrada** de auditoría: solo `action = CREATE`, `new_value ? 'section'`, `new_value ? 'fromStatus'`. **Prohibido** proyectar valores crudos o filas de diferencia libre
- [ ] Unión discriminada por `kind`: `lifecycle`, `system`, `commercial`. Dejar el hueco de `equipment`/`support` con `meta.degradedSources`
- [ ] Prueba que verifique que un registro con diferencia libre **no** aparece proyectado

### A-BE3 · AI-SR-FULL — seguridad bloqueante

- [ ] **H-2 (D3):** estrechar a los 5 roles de ADR-067 §9
- [ ] **H-1:** retirar los datos personales de la cadena de consulta en la búsqueda determinista + emitir registro de acceso
- [ ] **H-7:** construir el diff **antes** de mutar la entidad
- [ ] Pruebas: denegación a los 2 roles retirados; diff con valor anterior correcto

### A-OPS1 · AI-PLAT-OPS

- [ ] Desactivar `access_log` en el bloque `/api/`, como ya se hace en la ruta de salud
- [ ] Verificar que ninguna petición registrada contiene datos personales (CA-S404-11)

### A-BE6 · AI-SR-FULL — contactos del suscriptor (C-8) `[nuevo, resuelve BL-1]`

- [ ] Migración `126_create_subscriber_contacts.ts`: crear la tabla que la entidad declara desde la Fase 01, con índices por tenant y por suscriptor
- [ ] **Ancho de columnas cifradas al formato real** (H-9). El actual desborda con cualquier correo de más de 31 caracteres
- [ ] **Backfill**: el contacto alterno existente pasa a ser el primer registro de cada suscriptor que lo tenga
- [ ] `down()` elimina la tabla. **Prohibido eliminar las columnas de contacto alterno en esta fase** — quedan deprecadas en su sitio
- [ ] **Tope de 3** por suscriptor, rechazado en servidor con mensaje explícito, no con error genérico
- [ ] **No devolver texto cifrado** (H-5): descifrar u omitir
- [ ] **Verificar pertenencia** al suscriptor de la ruta en actualización y borrado (H-6)
- [ ] Permisos de **suscriptores** en las cuatro rutas, y prefijo `/crm/` coherente con el módulo
- [ ] Retirar el comentario obsoleto de la entidad que afirma que suscriptores es "legado en proceso de retiro"
- [ ] **Al menos una prueba contra el esquema real.** Las dos actuales mockean el acceso a datos y pasan sobre una tabla que no existe

### A-BE1 · AI-SR-FULL — relleno del 360° `← A-BE6`

- [ ] Sustituir las colecciones vacías por los servicios existentes: consentimientos, solicitudes ARCO y puerto de cotizaciones
- [ ] Cablear contactos **después** de A-BE6 — antes de esa migración la tabla no existe
- [ ] Declarar la preparación para activación en el contrato

### A-BE4 · AI-SR-FULL — retiro del anuncio de orden `[sin dependencias]`

- [ ] Retirar `sortBy` y `sortDir` del handler del listado (`subscribers.controller.ts:125-126`)
- [ ] Retirarlos del tipo y de la petición en el portal, y **corregir el comentario que los llama "Ola 2 deuda"** (`SubscribersListClient.tsx:162`) — no son deuda
- [ ] **No declararlos en OpenAPI** (se propaga a B-BE2)
- [ ] **Dejar `SORTABLE_FIELDS = []` intacto** — estado conforme, ADR-065 §Decisión 1
- [ ] **No retirar** `PortalDataTableSortableHead` — es fail-closed y espera contrato (§Decisión 4)
- [ ] **No medir.** Es entregable de AI-PLAT-OPS sobre los cuatro recursos, y no hay dataset (§Decisión 5)

### A-FE1 · AI-FE-PLATFORM — ficha 360° `← A-DS1 + A-BE2 + A-BE5`

- [ ] Implementar el primitive C-1 y **retirar el iframe** con su atributo de referente
- [ ] Montar el mapa en Vista general (lectura) y en Dirección (borrador en vivo)
- [ ] Reorganizar a **7 tabs**: absorber Tributario en Financiero; panel de equipos dentro de Servicios **al nivel del suscriptor** (el vínculo con contrato es opcional; anidarlo orfanaría comodatos). En Ola A quedan preparados, no cableados
- [ ] Tab Seguimiento espejo del de oportunidades: 2 columnas, **chips con fuente**, orden descendente fijo, 5 estados, distinción entre "aún no hay actividad" y "sin resultados"
- [ ] Card de preparación para activación con los requisitos faltantes
- [ ] Sección de contactos en la tab Datos: hasta 3, con acción de añadir que **se deshabilita con explicación visible** al llegar al tope — nunca desaparece sin decir por qué `← A-BE6`
- [ ] Estado de URL por tab (C-7) + patrón APG completo
- [ ] Gating de escritura por permiso de gestión
- [ ] Política de referente en `next.config.ts`
- [ ] Borrar el componente de aterrizaje muerto y la dependencia de mapas React no usada

### A-QA1 · AI-SR-QA `← A-FE1`

- [ ] CA-S404-01 a 05, 09, 10, 11, 13, 14 **verificados en navegador**
- [ ] Cobertura ≥80% en los servicios tocados
- [ ] **Reportar conteo real de pruebas ejecutadas.** Un resultado en verde por caché de turbo o por ausencia de pruebas **no es evidencia**
- [ ] Emitir `INFORME-MOD05-SUBSCRIBERS-FASE-04-OLA-A-v1.0.md`

---

## 4. Tareas — Ola B

### B-BE1 · AI-SR-FULL — contratos `[secuencial, bloquea toda la Ola B]`

- [ ] Seis contratos en `packages/shared/src/contracts/crm/`, con la forma **exacta** que produce el saneador de respuesta
- [ ] Promover el resumen de preparación para activación, hoy emitido sin estar declarado
- [ ] Verificar que `packages/shared` **no importa de `apps/api`**; si falta algún enum allí, subirlo primero

### B-BE2 · AI-SR-FULL — OpenAPI `← B-BE1`

- [ ] `crm-subscribers.v1.json` v1.0.0
- [ ] **Spec guardián** contra el documento de ejecución. Sin guardián el archivo es decoración — por eso hoy solo existe el de tareas
- [ ] **No declarar** los parámetros de orden si A-BE4 resolvió por retirarlos

### B-BE6 · AI-SR-FULL — migración `← B-BE2`

- [ ] `127_crm_subscriber_360_indexes.ts`, `transactional = false` (ADR-066), con el guard de `089_pagination_ordering_indexes.ts:181-186`
- [ ] Índice de comodatos por suscriptor + índice geográfico parcial
- [ ] **Solo DDL de índices: sin relleno retroactivo.** Verificar `up` y `down` sobre un schema de tenant

### B-BE3 · AI-SR-FULL — equipos (C-3) `← B-BE6`

- [ ] Puerto en CRM, **adaptador en MOD12** — el join es de MOD12; hacerlo desde CRM viola ADR-048 §77
- [ ] `?expand=asset,item` **opt-in** con `leftJoin`. **Prohibida la consulta por fila.** Respuesta por defecto **byte-idéntica**
- [ ] Agregado bajo permiso de suscriptores, **no** de inventario. Identificador **del path, en servidor**; resolver el suscriptor (404) antes de consultar el puerto
- [ ] Excluir los campos de RNF-S404-07; condicionar la dirección física por rol
- [ ] Degradación declarada si el puerto falla

### B-BE4 · AI-SR-FULL — tickets (C-4) `← B-BE2`

- [ ] Ampliar el filtro de mesa de ayuda con sujeto y tipo de solicitante (índices ya existen, **sin migración**)
- [ ] Puerto con modo `requester|subject|any`. Con `any`: **dos consultas indexadas y merge, nunca `OR` en el `WHERE`**
- [ ] **El puerto propaga el actor.** Sin esto el agregado es un bypass de la regla de propiedad de `tickets.service.ts:335`. **Es la verificación más importante de la ola**
- [ ] `limit = 0` devuelve solo conteos
- [ ] Excluir los campos de RNF-S404-08

### B-BE5 · AI-SR-FULL — proyección geográfica (C-6) `← B-BE6`

- [ ] Lista blanca cerrada; filtro espacial **obligatorio**
- [ ] **No relajar la cota de ADR-067 §6.** Si producto pide densidad completa → endpoint **agregado** sin fila por suscriptor, o **escala al CTO**
- [ ] Finalidad por campo escrita en el módulo **antes del merge** + registro de acceso

### B-FE1 · AI-FE-PLATFORM `← B-BE3 + B-BE4`

- [ ] Cablear panel de equipos y tab Tickets, ambos **solo lectura**, con sus estados vacíos honestos
- [ ] Falta de permiso como aviso informativo, **nunca** tabla vacía
- [ ] Reapuntar los tipos del portal a `@iwana/shared` y **borrar el duplicado** de `api-client.ts:5255-5426`
- [ ] Sustituir el campo de texto libre del formulario de mesa de ayuda por un selector que fije solicitante **y** sujeto

### B-QA1 · AI-SR-QA

- [ ] CA-S404-07, 08, 12, 15, 16, 17 con conteo real
- [ ] Emitir `INFORME-MOD05-SUBSCRIBERS-FASE-04-OLA-B-v1.0.md`

---

## 4bis. Verificación — comandos y definición de terminado por bloque

**Un bloque no está terminado hasta que sus comandos pasan y su criterio queda verificado.** Un resultado en verde por caché de turbo o por ausencia de pruebas **no es evidencia**: hay que reportar el **conteo real** de pruebas ejecutadas.

| Bloque | Comando de verificación | Terminado cuando |
| --- | --- | --- |
| **A-DS1** | — (artefacto documental) | La spec está en `docs/specs/`, declara los 4 estados de C-1 y no exige tokens nuevos |
| **A-BE5** | `pnpm --filter @iwana/api exec jest src/modules/crm/subscribers` | Pruebas de: borrado de coordenadas, media coordenada rechazada, fuera de rango, y serialización **numérica** (no cadena) |
| **A-BE6** | `pnpm --filter @iwana/db build && pnpm --filter @iwana/db migration:tenant:run`, luego revertir | La migración aplica y revierte; **al menos una prueba corre contra el esquema real**; tope de 3 rechazado en servidor; ninguna respuesta trae texto cifrado; ruta cruzada entre suscriptores responde denegación |
| **A-BE2** | `pnpm --filter @iwana/api exec jest src/modules/crm/subscribers` | Existe prueba que verifica que un registro con **diferencia libre no aparece proyectado** |
| **A-BE3** | `pnpm --filter @iwana/api test` | Denegación verificada para los 2 roles retirados; prueba del registro de diferencias con valor anterior **correcto**; ninguna petición registrada lleva datos personales |
| **A-BE4** | `pnpm --filter @iwana/api typecheck && pnpm --filter @iwana/portal typecheck` | Los parámetros de orden ya no existen en handler ni en portal; `SORTABLE_FIELDS` sigue vacío; el primitive de cabecera sigue existiendo |
| **A-OPS1** | Inspección del registro del proxy tras una petición de búsqueda | Ninguna línea registrada contiene documento, correo ni teléfono |
| **A-BE1** | `pnpm --filter @iwana/api exec jest src/modules/crm/subscribers` | El 360° devuelve colecciones reales; la preparación para activación está declarada en el contrato |
| **A-FE1** | `pnpm --filter @iwana/portal test` + verificación en navegador | Los criterios `CA-UX-S360` que apliquen a la Ola A, verificados **en navegador** |
| **A-QA1** | `pnpm lint && pnpm typecheck` + `pnpm test` | Informe de Ola A emitido con conteo real |
| **B-BE1/B-BE2** | `pnpm --filter @iwana/api exec jest subscribers.swagger` | El spec guardián compara el documento publicado contra el generado y pasa |
| **B-BE3/B-BE4/B-BE5** | `pnpm --filter @iwana/api test` | Cada campo excluido verificado por prueba; **prueba explícita de que el actor se propaga** en tickets |
| **B-BE6** | `migration:tenant:run` + revertir | Aplica y revierte limpiamente sobre un schema de tenant |
| **B-FE1** | `pnpm --filter @iwana/portal test` + navegador | Con usuario **comercial** ambos paneles cargan sin denegación; ninguna acción de mutación alcanzable |

### Verificación en navegador (obligatoria para A-FE1, A-QA1, B-FE1, B-QA1)

Levantar con `pnpm dev` y entrar a `/dashboard/crm/subscribers/[id]`:

1. **Mapa** — consola sin **ninguna** violación de política de contenido; el mapa renderiza con teselas. Borrar coordenadas → guardar → recargar: quedan vacías. Introducir `999, 999` → mensaje en el campo, mapa sin montar.
2. **Seguimiento** — la bitácora lista eventos reales; los chips filtran; cambiar filtro vuelve a la primera página; una página fuera de rango sirve la última válida corrigiendo la URL.
3. **Contactos** — añadir hasta 3; al tercero la acción queda **deshabilitada con explicación visible**.
4. **Enlace profundo** — `?tab=seguimiento` abre el tab correcto; atrás vuelve al anterior; recargar preserva filtros.
5. **Teclado** — la tira de tabs es operable solo con teclado (flechas, inicio, fin).
6. **RBAC** — con usuario de solo lectura no hay ningún botón de escritura visible. Con usuario **comercial**, equipos y tickets cargan sin denegación (Ola B).

### Cómo se reporta

Cada ola cierra con su informe en `docs/informes/` (nombres en §6 del prompt), registrando: entregables, evidencia por criterio, **cobertura con conteo real de pruebas**, deuda por severidad, bloqueos emitidos y decisiones que requieren CTO.

Un `[BLOQUEO]` se emite **antes de cerrar la sesión**, con: qué, por qué, qué necesita, y **qué sí se pudo entregar sin ello**.

---

## 5. Gates

| Gate | Condición | Aprueba |
| --- | --- | --- |
| **Gate Ola A** | CA-S404-01 a 05, 09, 10, 11, 13, 14 en navegador · lint y typecheck limpios · cobertura ≥80% con conteo real · informe emitido | AI-EM-ARCH |
| **Gate Ola B** | Criterios restantes de §8 del PRD · guardián de OpenAPI en verde · migración aplicada y revertida | AI-EM-ARCH |
| **G6** | Ambas olas cerradas + checklist de Fase 02 ejecutado (hoy 0 de 50) + checklist de salida de la fase | AI-EM-ARCH |
| **G6.5** | Corrida Linux de CI **por SHA** + artefacto resumen sanitizado (conteos, plataforma, duración) | AI-EM-ARCH |
| **G7** | **Diferido por ADR-070.** Su ausencia **no es deuda** | CTO |

**El aprobador de un gate nunca es el productor del artefacto.**

---

## 6. Condiciones de parada

Escalar a AI-EM-ARCH y **no continuar** si:

- Un contrato C-1 a C-6 resulta inviable tal como está congelado
- El bloque exige **relajar la cota de paginación de ADR-067 §6** → escala al CTO, no se decide en el track
- El bloque exige tocar tokens de marca, un boundary o una dependencia nueva
- BL-1 sigue abierto y el bloque lo necesita
- Aparece exposición de datos personales no cubierta por ADR-067

---

## 7. Deuda que este plan no paga

Registrada en §8 del informe de auditoría: cifrado de identidad y geolocalización (hallazgo S-3 de ADR-078, propuesto) · transformer numérico en oportunidades · registro de intentos de contacto sobre suscriptores · indicador de tab lima en el contenedor de oportunidades · tab de Documentos.
