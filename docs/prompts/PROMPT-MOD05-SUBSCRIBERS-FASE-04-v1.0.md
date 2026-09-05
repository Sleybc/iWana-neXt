# PROMPT DE EJECUCIÓN — MOD05 Suscriptores · Fase 04 (Completitud de la ficha 360°)

**Version:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-09-04
**Emisor:** AI-EM-ARCH (modo Orchestrator)
**PRD de la fase:** [docs/prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-04-v1.0.md](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-04-v1.0.md) — **Aprobado**, 2026-09-04
**HLD:** [docs/hlds/HLD-MOD05-ARQUITECTURA-v2.0.md](../hlds/HLD-MOD05-ARQUITECTURA-v2.0.md) — v2.2, Aprobado
**Agentes destinatarios:** AI-SR-FULL · AI-FE-PLATFORM · AI-DS-OWNER · AI-SR-QA · AI-PLAT-OPS

---

## 0. Cómo se usa este prompt

Cada agente ejecuta **solo su bloque**. Los bloques de la misma ola corren **en paralelo** contra los contratos congelados de §2: mientras un track respete su contrato y no toque alcance, boundary, tokens de marca ni dependencias nuevas, **decide y ejecuta sin gate** (protocolo §3bis.3).

Un cambio de contrato es el **único** evento que fuerza re-sync, y se coordina vía AI-EM-ARCH: se versiona y se notifica. **Nunca se parchea en silencio.**

Si un agente encuentra algo que no puede resolver dentro de su sesión, emite `[BLOQUEO]` **antes de cerrarla**, con: qué, por qué, qué necesita y qué sí pudo entregar sin ello.

---

## 1. Entradas obligatorias

Leer antes de tocar código, en este orden:

1. `AGENTS.md` — gobernanza maestra.
2. El **PRD de la fase** (arriba), en particular §5 (RF), §6 (RNF) y §8 (CA).
3. **`docs/specs/2026-09-04-mod05-subscriber-360-ux-spec.md`** — spec de UX **congelada** (AI-PROD-UX v1.0): arquitectura de información, estados, copy y los **48 criterios `CA-UX-S360-nn`**. Obligatoria para AI-FE-PLATFORM.
4. `docs/informes/INFORME-MOD05-CRM-DETALLE-SUSCRIPTORES-AUDITORIA-UIUX-v1.0.md` — **disposiciones vinculantes**, veredicto Aprobada 0 P0–P3.
5. ADRs que gobiernan esta fase: **ADR-038** (boundary Assurance), **ADR-048** (boundary Inventario/SCM), **ADR-065** (paginación y orden), **ADR-067** (proyección PII), **ADR-066** (migraciones), **ADR-083** (RBAC granular). Todos **Aprobados**.
6. La skill de `.agents/skills/INDEX.md` que corresponda al bloque asignado.

---

## 2. Contratos congelados

Congelados el 2026-09-04. Versión **1.0**. Cualquier desviación se escala, no se improvisa.

### C-1 · Contrato de componente — primitive de mapa (dueño: AI-DS-OWNER)

- **Origen de la extracción:** `apps/portal/src/components/crm/expedientes/sections/TechnicalFeasibilitySection.tsx:106-180` (import diferido de Leaflet, `ResizeObserver` + `invalidateSize()`, manejo de `tileerror`).
- **API:** `latitude`, `longitude`, `readOnly`, `height`, `label`.
- **Estados obligatorios (4):** sin coordenadas · coordenadas inválidas · cargando · no disponible con reintento. En los dos primeros **el componente no monta el mapa**.
- **Prohibido:** centro por defecto ante ausencia de coordenadas; marcador arrastrable en esta fase.
- **Obligatorio:** atribución de OpenStreetMap visible y enlazada; `role="region"` con nombre accesible en español y `aria-busy` durante la carga.
- **Sin tokens nuevos.** Si el componente exigiera un token que no existe, es `[BLOQUEO]` hacia AI-DS-OWNER, no invención.

### C-2 · Contrato de API — bitácora del suscriptor (dueño: AI-SR-FULL)

```
GET /crm/subscribers/:id/timeline
Roles: los cinco de ADR-067 §9 · Permiso: crm.subscribers.read
Query: page >= 1 (def. 1) · limit 1..50 (def. 5) · filter
Cota compuesta: page × limit <= 500
```

- **Molde:** `apps/api/src/modules/crm/expedientes/expedientes.controller.ts:297` + `dto/expediente-timeline.dto.ts`.
- **Implementación:** **proyección de lectura. Prohibido crear entidad nueva o hacer relleno retroactivo.**
- **Lista blanca de auditoría, cerrada:** solo `action = CREATE`, `new_value ? 'section'` o `new_value ? 'fromStatus'`. **Prohibido** proyectar `oldValue`/`newValue` crudos y **prohibido** proyectar filas de diferencia libre (`isDiff: true`).
- **Respuesta:** unión discriminada por `kind`. Ola A emite `lifecycle`, `system` y `commercial`. Ola B añade `equipment` y `support`.
- **`meta.degradedSources`:** si un puerto de MOD12/MOD10 falla, se responde **200 con el resto** declarando la degradación. La disponibilidad de CRM no depende de otro módulo.

### C-3 · Contrato de API — equipos del suscriptor (dueño: AI-SR-FULL, Ola B)

```
GET /crm/subscribers/:id/equipment
Permiso: crm.subscribers.read  (NO inventory.stock.read)
Query: status 'abierto'|'cerrado' · page · limit 1..50 (def. 20)
```

- **Puerto** declarado en `apps/api/src/modules/crm/ports/`; **adaptador en `apps/api/src/modules/inventory/adapters/`**. El join pertenece íntegramente a MOD12; hacerlo desde CRM viola ADR-048 §77.
- **Enriquecimiento en origen** con `?expand=asset,item` **opt-in** sobre el listado de comodatos: un `leftJoin` en `apps/api/src/modules/inventory/services/asset-loan.service.ts:109-152`. **Prohibida la consulta por fila.** La respuesta por defecto queda **byte-idéntica**.
- **El identificador del suscriptor se resuelve del path, en servidor.** Jamás se acepta del cliente. Resolver primero el suscriptor en el tenant (404 si no existe) y solo después consultar el puerto.
- **Campos que NO cruzan:** ubicación y responsable actual, orden y fecha de compra, coste, proveedor, vida útil, garantía, identificadores de movimiento y de orden de ejecución. La **dirección física del equipo se condiciona por rol** (NOC, TECHNICIAN, ADMIN, SUPPORT).
- **Sí cruzan:** identificador del comodato, estado, fecha de instalación y de retiro, nombre y modelo del ítem, serial o etiqueta del activo.

### C-4 · Contrato de API — tickets del suscriptor (dueño: AI-SR-FULL, Ola B)

```
GET /crm/subscribers/:id/tickets
Permiso: crm.subscribers.read
Query: by 'requester'|'subject'|'any' (def. 'requester') · status · page · limit 0..50 (def. 20)
limit = 0 devuelve solo los conteos
```

- **Filtrado en mesa de ayuda, nunca en el adaptador de CRM.** Traer páginas para descartarlas convierte un índice en un barrido.
- **Con `by='any'`: dos consultas indexadas y merge. Prohibido el `OR` en el `WHERE`** — no aprovecha ninguno de los dos índices parciales.
- **El puerto propaga el actor.** `apps/api/src/modules/assurance/services/tickets.service.ts:335` restringe a determinados roles a sus propios tickets; sin propagar el actor, este agregado sería un **bypass** de esa regla. Es la verificación más importante de la Ola B.
- **El adaptador exige el tipo de solicitante** junto a la referencia, con validación de formato: la columna es compartida entre tipos y el filtro sin tipo es ambiguo por diseño.
- **Campos que NO cruzan:** descripción, comentarios (con énfasis en los internos), notas de transición, identidad del asignado.

### C-5 · Contrato de datos — coordenadas (dueño: AI-SR-FULL, Ola A)

- **Transformer numérico** en `apps/api/src/modules/crm/subscribers/entities/subscriber.entity.ts:147,150`.
- **Prohibido `pg.types.setTypeParser`**: convertiría todo valor numérico del sistema, incluido el importe de `apps/api/src/modules/inventory/entities/inventory-item.entity.ts:97`, que es cadena **deliberadamente** para evitar error de coma flotante. Sería una regresión sobre dinero.
- **Anulabilidad en tres sitios, o el borrado es un no-op silencioso:**
  1. `packages/shared/src/schemas/subscriber.schema.ts:121-122`
  2. el schema de la sección de ubicación en `apps/api/src/modules/crm/subscribers/subscribers.service.ts:69-70` — **este es el que usa la ficha 360°**
  3. la semántica de actualización: `'latitude' in dto ? dto.latitude : actual`. **Nunca `??`**, que colapsa el nulo en "sin cambio".
- **Validación por pares:** ambas presentes o ambas ausentes.
- **NO tocar oportunidades en esta fase.** `apps/api/src/modules/crm/expedientes/status-transition.service.ts:102` compara por veracidad, y con número una latitud de 0 pasa a ser falsa. El ecuador cruza Colombia. Tarea separada.

### C-6 · Contrato de proyección geográfica (dueño: AI-SR-FULL, Ola B)

- **Lista blanca cerrada:** identificador, latitud, longitud, estado, ciudad, nodo de cobertura. **Nada más.** Sin búsqueda, sin nombre, sin dirección.
- **Filtro espacial obligatorio** (área o nodo de cobertura).
- **La cota de paginación de ADR-067 §6 NO se relaja.** Si producto necesita densidad completa del mapa, la salida es un endpoint **agregado** (conteos por nodo o celda, sin fila por suscriptor), que no es un listado de datos personales. Relajar la cota **escala al CTO**.
- **Finalidad declarada por campo escrita en el módulo antes del merge**, y registro de acceso masivo. Sin esa línea el endpoint no cumple ADR-067, aunque la proyección sea mínima.

### C-8 · Contrato de datos — contactos del suscriptor (dueño: AI-SR-FULL, Ola A)

Resuelve **BL-1**. Decisión del CTO del 2026-09-04: la tabla se **crea con tope**, no se retira. Contexto del hallazgo en `docs/informes/INFORME-MOD05-SUBSCRIBERS-AUDITORIA-FICHA-360-v1.0.md`.

**Migración `126_create_subscriber_contacts.ts`** (`124` y `125` están tomadas por MOD12):

- Crea la tabla que `apps/api/src/modules/crm/contacts/entities/subscriber-contact.entity.ts` declara desde la Fase 01 y que **nunca tuvo migración**. Índices por tenant y por suscriptor, como declara la entidad.
- **Ancho de las columnas cifradas al formato real.** El actual (120) desborda con cualquier correo de más de 31 caracteres: el formato es `hex(iv):hex(tag):hex(ct)`. Alinear con los 500 que usa la tabla de suscriptores (hallazgo **H-9**).
- **Backfill**: el contacto alterno existente en la tabla de suscriptores se copia como **primer registro** de cada suscriptor que lo tenga.
- `down()` elimina la tabla. Es reversible en su totalidad: tabla nueva, sin datos previos, y el origen del backfill se conserva intacto.

**Expansión y contracción:** las columnas de contacto alterno de la tabla de suscriptores quedan **deprecadas en su sitio, NO se eliminan**. Su drop es fase posterior, cuando se confirme que ningún consumidor las lee. **Prohibido eliminarlas en esta fase.**

**Reglas de servicio:**

- **Tope de 3 contactos por suscriptor.** El servidor rechaza el cuarto con mensaje explícito, no con un error genérico.
- **Fuente única:** tras esta migración la aplicación lee y escribe contactos **solo** desde la tabla. No se mantiene lógica dual.
- **Nunca devolver texto cifrado** al cliente: descifrar, u omitir el campo (hallazgo **H-5**). Hoy `contacts.controller.ts:56-61` devuelve la entidad cruda.
- **Verificar pertenencia** al suscriptor de la ruta en actualización y borrado (hallazgo **H-6**). Hoy `contacts.service.ts:50-74` busca solo por identificador de contacto, así que dentro del mismo tenant se puede modificar el contacto de otro suscriptor pasando una ruta arbitraria.
- **Permisos de suscriptores**, no de oportunidades, en las cuatro rutas (`contacts.controller.ts:35,54,65,77`).
- **Prefijo de ruta coherente** con el resto del módulo: hoy cuelga de `/subscribers/...` mientras todo lo demás usa `/crm/subscribers/...`.

**Pruebas:** los dos ficheros de `contacts/tests/` mockean el acceso a datos al punto de pasar en verde **sobre una tabla que no existe**. Es el patrón de evidencia falsa: al menos una prueba debe ejecutarse **contra el esquema real**.

**UI (AI-FE-PLATFORM, dentro de A-FE1):** sección de contactos en la tab Datos, con acción de añadir que **se deshabilita con explicación visible** al llegar al tope — nunca desaparece sin decir por qué.

---

## 3. Bloques de ejecución — Ola A

### A-BE5 · AI-SR-FULL — coordenadas

Aplicar **C-5** completo. Sin dependencias; puede arrancar de inmediato.

### A-BE6 · AI-SR-FULL — contactos del suscriptor (C-8) `← A-BE6 precede a A-BE1`

Aplicar **C-8** completo. **BL-1 quedó resuelto por el CTO el 2026-09-04: se construye con tope, no se retira.**

### A-BE1 · AI-SR-FULL — payload 360° `← A-BE6`

1. Sustituir las colecciones codificadas como vacías en `apps/api/src/modules/crm/subscribers/subscribers.service.ts:841-845` por los servicios que **ya existen e indexan por suscriptor**: consentimientos, solicitudes ARCO y el puerto de lectura de cotizaciones. Requiere importar los módulos en `subscribers.module.ts`. **Es cableado, no trabajo de modelo — no lo presupuestes como tal.**
2. Los **contactos** se cablean solo después de A-BE6; antes de esa migración la tabla no existe y cualquier lectura falla.
3. Declarar la preparación para activación en el contrato — hoy el backend la emite y el portal ni la declara.

### A-BE2 · AI-SR-FULL — bitácora

Aplicar **C-2** para `lifecycle`, `system` y `commercial`. Sin migración, sin puerto.

### A-BE3 · AI-SR-FULL + AI-PLAT-OPS — seguridad bloqueante

1. **H-1:** retirar los datos personales de la cadena de consulta en la búsqueda determinista (cuerpo de petición, o búsqueda solo por valor derivado precalculado) y **emitir registro de acceso**. En paralelo, AI-PLAT-OPS desactiva el registro de acceso sobre la ruta de API en `nginx/nginx.prod.conf`, como ya se hace para la ruta de salud.
2. **H-2 (D3 del CTO):** estrechar el listado a los **cinco roles** de ADR-067 §9 en `apps/api/src/modules/crm/subscribers/subscribers.controller.ts:102-110`.
3. **H-7:** construir el registro de diferencias **antes** de mutar la entidad (`subscribers.service.ts:485-504`). Hoy el valor anterior ya contiene el nuevo, y el rastro no permite reconstruir nada.
### A-BE4 · AI-SR-FULL — retiro del anuncio de orden (cierra BL-2)

**No hay decisión que tomar aquí: ADR-065 §Decisión 3 ya la tomó.** *"Anunciar un parámetro que el servidor ignora y devolver siempre `meta.sort: null` es un contrato falso: se corrige **retirando el anuncio, no poblando la lista**."*

1. Retirar `@Query('sortBy')` y `@Query('sortDir')` del handler del listado (`subscribers.controller.ts:125-126`).
2. Retirar los mismos parámetros del tipo y de la construcción de la petición en el portal (`api-client.ts`, `SubscribersListClient.tsx:162-165`), y **corregir el comentario que los llama "Ola 2 deuda"**: no son deuda.
3. **No declararlos en OpenAPI** (aplica a B-BE2).
4. **`SORTABLE_FIELDS = []` se queda tal cual.** Es **estado conforme**, no deuda — ADR-065 §Decisión 1: *"Un recurso puede permanecer así indefinidamente sin incumplir esta decisión."*
5. **No retirar** `PortalDataTableSortableHead` ni marcarlo como muerto (ADR-065 §Decisión 4): está construido, es correcto y es fail-closed. Espera contrato que lo habilite.
6. **No medir aquí.** La medición de p95 es entregable de **AI-PLAT-OPS** y cubre los cuatro recursos que declaran la constante — tickets de mesa de ayuda, tareas, partes y suscriptores (ADR-065 §Decisión 5). Además no existe dataset de suscriptores con el que medir. Cuando llegue, el tramo se autoriza recurso por recurso y **el portal no necesitará cambios**: `canSort` ya deriva de `sortableFields.length > 0`.

### A-DS1 · AI-DS-OWNER — primitive de mapa

Definir y publicar **C-1** en `docs/specs/`. Es carril rápido de UI: **decide sin gate de AI-EM-ARCH** mientras no toque tokens de marca.

### A-FE1 · AI-FE-PLATFORM — ficha 360°

1. Implementar el primitive de **C-1** y **retirar el marco embebido** de `apps/portal/src/components/crm/subscribers/SubscriberSections.tsx:569-593`, incluido su atributo de política de referente.
2. Reorganizar los tabs a los **7 de RF-S404-01**: absorber Tributario en Financiero, y montar el panel de equipos dentro de Servicios **al nivel del suscriptor** (el vínculo con el contrato es opcional; anidarlo por contrato dejaría comodatos huérfanos). En la Ola A el panel de equipos y el tab Tickets quedan preparados, no cableados.
3. Tab **Seguimiento** espejo de `apps/portal/src/components/crm/expedientes/SeguimientoTab.tsx` y `ExpedienteTimelinePanel.tsx`: dos columnas, chips con fuente, orden descendente fijo, cinco estados, distinción entre "aún no hay actividad" y "sin resultados".
4. Card **Preparación para activación** en Vista general, consumiendo el dato que el backend **ya calcula y el portal ni siquiera declara**.
5. Tabs a estado de URL (**C-7**: parámetro de consulta, slugs `general·datos·servicios·tickets·financiero·cumplimiento·seguimiento`; valor desconocido resuelve al primero sin entrada de historial; cambio de tab con entrada de historial; al salir de un tab se limpian sus parámetros).
6. Patrón APG completo en `SubscriberTabsContainer.tsx:22-56`: relación con el panel, índice de tabulación móvil, flechas, inicio y fin. Hoy faltan las tres cosas.
7. Gating de escritura por permiso de gestión — hoy un usuario de solo lectura ve **todos** los botones de guardar.
8. Añadir política de referente propia en `apps/portal/next.config.ts`.
9. Retirar el componente de aterrizaje muerto y la dependencia de mapas React no utilizada.

### A-QA1 · AI-SR-QA

Cobertura de los servicios tocados y **verificación en navegador** de los criterios CA-S404-01 a CA-S404-14 que apliquen a la Ola A. Reportar **conteo real de pruebas ejecutadas**: un resultado en verde por caché o por ausencia de pruebas **no es evidencia**.

---

## 4. Bloques de ejecución — Ola B

| Bloque | Agente | Encargo |
| --- | --- | --- |
| **B-BE1** | AI-SR-FULL | Contratos de lectura en `packages/shared/src/contracts/crm/`, incluida la promoción del resumen de preparación para activación que hoy se emite sin estar declarado. Verificar que `packages/shared` **no importe de `apps/api`** |
| **B-BE2** | AI-SR-FULL | OpenAPI del módulo **con spec guardián** replicando `apps/api/src/modules/tasks/tasks.swagger.spec.ts:128-133`. Sin guardián el archivo es decoración — por eso hoy solo existe el de tareas |
| **B-BE3** | AI-SR-FULL | **C-3** equipos (puerto, adaptador en MOD12, enriquecimiento opt-in) |
| **B-BE4** | AI-SR-FULL | **C-4** tickets (ampliar el filtro de mesa de ayuda con sujeto y tipo de solicitante; puerto con actor propagado) |
| **B-BE5** | AI-SR-FULL | **C-6** proyección geográfica |
| **B-BE6** | AI-SR-FULL | Migración única de índices, `transactional = false` (ADR-066), con el guard de `packages/database/src/migrations/tenant/089_pagination_ordering_indexes.ts:181-186`. **Solo DDL de índices: sin relleno retroactivo, totalmente reversible** |
| **B-FE1** | AI-FE-PLATFORM | Cablear panel de equipos y tab Tickets; reapuntar los tipos del portal a `@iwana/shared` y **borrar el duplicado**; sustituir la captura de referencia por texto libre en el formulario de mesa de ayuda por un selector que fije solicitante **y** sujeto |
| **B-QA1** | AI-SR-QA | CA-S404-07, 08, 12, 15, 16 y 17 |

---

## 5. Restricciones transversales

1. **Modulith:** sin acceso directo a tablas de otro módulo, sin llamada HTTP interna entre módulos, sin imports circulares.
2. **Multi-tenant por schema:** tenant desde contexto verificado; `SET LOCAL search_path` por transacción. Nunca hardcodear tenant ni schema.
3. **La ficha lee; nunca produce el hecho.** Toda mutación de activos ocurre en MOD12 o se deriva de una orden de ejecución; toda mutación de tickets ocurre en MOD10. Duplicar aquí una sola de esas acciones abre dos caminos para el mismo hecho y garantiza divergencia.
4. **Honestidad de estados vacíos:** un filtro sin fuente no se pinta; "no puedes ver" nunca se representa como "no tiene"; prohibido mostrar un conteo en cero cuando la llamada falló.
5. **Vocabulario visible:** "oportunidad" y "suscriptor". Prohibido "expediente", "lead" y "pipeline" en texto renderizado. Sin identificadores opacos visibles.
6. **Cero datos personales reales** en código, pruebas, fixtures, documentación y ejemplos: ni nombres, ni documentos, ni direcciones, ni coordenadas de domicilios reales, ni seriales de producción.
7. **Sin `any` explícito, sin promesas flotantes, sin datos personales en registros de log.**

---

## 6. Entregables

| Entregable | Ruta | Ola |
| --- | --- | --- |
| Spec del primitive de mapa | `docs/specs/2026-09-04-primitive-mapa-portal.md` | A |
| Informe de Ola A | `docs/informes/INFORME-MOD05-SUBSCRIBERS-FASE-04-OLA-A-v1.0.md` | A |
| Informe de Ola B | `docs/informes/INFORME-MOD05-SUBSCRIBERS-FASE-04-OLA-B-v1.0.md` | B |
| Checklist de salida | `docs/quality/CHECKLIST-MOD05-SUBSCRIBERS-FASE-04-v1.0.md` | B |
| Informe de cierre de módulo | `docs/informes/INFORME-MOD05-CIERRE-MODULO-v1.0.md` | Cierre |

Cada informe registra: entregables, evidencia de gates, **cobertura con conteo real**, deuda por severidad, bloqueos y decisiones que requieren CTO.

---

## 7. Stop / Go

**STOP — no continuar y escalar a AI-EM-ARCH:**

- Un contrato de §2 resulta inviable tal como está congelado.
- El bloque exige relajar la cota de paginación de ADR-067 §6 → **escala al CTO**, no se decide en el track.
- El bloque exige tocar tokens de marca, un boundary de módulo o una dependencia nueva.
- La decisión sobre la tabla de contactos (A-BE1 paso 3) sigue abierta y el bloque la necesita.
- Se descubre exposición de datos personales no cubierta por ADR-067.

**GO — Ola A cierra cuando:**

- CA-S404-01 a CA-S404-05, CA-S404-09, CA-S404-10, CA-S404-11, CA-S404-13 y CA-S404-14 pasan **verificados en navegador**.
- `pnpm lint` y `pnpm typecheck` limpios.
- Cobertura ≥80% en los servicios tocados, **con conteo real**.
- Informe de Ola A emitido.

**GO — Ola B cierra cuando:** se cumplen los criterios restantes de §8 del PRD, el spec guardián de OpenAPI está en verde y la migración aplicó y revirtió limpiamente sobre un schema de tenant.

**GO — cierre de módulo:** DoD §10 del PRD completo, con **G6 y G6.5 registrados por separado**. G7 permanece diferido por ADR-070; su ausencia **no es deuda**.
