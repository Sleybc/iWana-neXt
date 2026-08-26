# INFORME — CRM Expediente: Campo "Tipo de cliente" (segmento) — Fase Implementación

**Versión:** 1.0
**Fecha:** 2026-08-20
**Generado por:** AI-EM-ARCH (modo Orchestrator + EM)
**Módulo:** MOD05 CRM — expedientes y oportunidades
**Fase:** Implementación (etapa 5 del protocolo multiagente v1.5)
**Artefactos de la fase:** `docs/plans/2026-08-20-crm-expediente-tipo-cliente-segmento.md` · `docs/prompts/PROMPT-CRM-EXPEDIENTE-SEGMENTO-IMPLEMENTACION-v1.0.md`

## 1. Resumen

Captura del tipo de cliente (segmento) en el alta de oportunidad CRM, editable en "Interés comercial" del detalle, persistido en `expediente_records.customer_segment` y propagado al suscriptor en la conversión. Los dos tracks (backend y frontend) corrieron en paralelo contra el contrato congelado (enum `CustomerSegment` de `@iwana/shared`, sin tipos nuevos). Sin bloqueos, sin hallazgos P0-P2, con deuda de severidad baja registrada.

## 2. Entregables

### Backend (AI-SR-FULL)

| Artefacto                                                                                        | Detalle                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/database/src/migrations/tenant/runner.ts`                                              | Migración 116 registrada en `TENANT_MIGRATIONS` (orden tras la 115)                                                                                                                                                                                                  |
| `packages/database/src/migrations/tenant/116_add_customer_segment_to_expediente_records.spec.ts` | Spec hermano creado (convención 112/113): SQL up/down, reversible, sin schema hardcodeado, sin imports de apps/api. El `.ts` ya existía en disco con up/down correctos — no se reescribió                                                                            |
| `apps/api/src/modules/crm/expedientes/entities/expediente-record.entity.ts`                      | Columna `customerSegment` → `customer_segment` (varchar(20), nullable), paridad con `subscriber.entity.ts`                                                                                                                                                           |
| `apps/api/src/modules/crm/expedientes/dto/create-expediente.dto.ts`                              | `customerSegment: z.nativeEnum(CustomerSegment)` **requerido** en `CreateExpedienteSchema` (boundary real: `ZodBodyValidationPipe`)                                                                                                                                  |
| `apps/api/src/modules/crm/expedientes/expediente.service.ts`                                     | `create()` persiste el campo; case `COMMERCIAL_INTEREST` valida contra `Object.values(CustomerSegment)` con error de campo y permite limpiar a null; label `customerSegment: 'Tipo de cliente'`; audit log del create incluye el segmento (dato de negocio, sin PII) |
| `apps/api/src/modules/crm/subscribers/subscriber-creation.service.ts`                            | `resolveCustomerSegment`: propaga el segmento del expediente; sin segmento, fallback actual (JURIDICA→PYME, si no RESIDENTIAL)                                                                                                                                       |

### Frontend (AI-FE-PLATFORM)

| Artefacto                                                                           | Detalle                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/portal/src/lib/api-client.ts`                                                 | `CreateExpedienteDto.customerSegment` (requerido); `ExpedienteRecord.customerSegment` (nullable); enum ya importado de `@iwana/shared`                                                        |
| `apps/portal/src/components/crm/expedientes/expediente-ui.ts`                       | `CUSTOMER_SEGMENT_OPTIONS` exportado con labels canónicos (Residencial, SOHO, PyME, Gobierno, Corporativo, Mayorista)                                                                         |
| `apps/portal/src/components/crm/expedientes/ExpedientesLandingClient.tsx`           | Campo **segundo** tras "Nombre completo", placeholder "Selecciona una opción", sin default; validación `'Selecciona el tipo de cliente.'`; payload y reset actualizados; grid lg 4→5 columnas |
| `apps/portal/src/components/crm/expedientes/ExpedientesLandingClient.spec.tsx`      | Caso CA-1: submit sin segmento → mensaje visible y `createExpediente` no llamado                                                                                                              |
| `apps/portal/src/components/crm/expedientes/sections/constants.ts`                  | Campo `customerSegment` en configuración de `commercial_interest` (select, label, opciones, draft)                                                                                            |
| `apps/portal/src/components/crm/expedientes/sections/CommercialInterestSection.tsx` | Select de segmento (patrón de los selects existentes de la sección)                                                                                                                           |

### Documentación

| Artefacto                                                            | Detalle                                                                                |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md`                         | §12 CA-01 actualizado: alta con `fullName`, `customerSegment` (obligatorio) y `source` |
| `docs/prompts/PROMPT-CRM-EXPEDIENTE-SEGMENTO-IMPLEMENTACION-v1.0.md` | Prompt de ejecución G4 (este informe)                                                  |
| `docs/plans/2026-08-20-crm-expediente-tipo-cliente-segmento.md`      | Plan de fase (aprobado, sin cambios)                                                   |

## 3. Evidencia de gates

| Gate                                     | Estado        | Evidencia                                                                                                                                                                                                                                                                                  |
| ---------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **G1** (definición)                      | GO            | Plan aprobado con decisiones confirmadas del usuario; factibilidad validada por los tracks durante la ejecución (sin cambios de alcance ni boundary). Review cruzado: SR-FULL (factibilidad backend) y FE-PLATFORM (factibilidad frontend) dictaminaron viable al ejecutar                 |
| **G3** (factibilidad)                    | GO            | Sin dictámenes adversos; ajustes menores declarados como desvíos justificados (ver §5)                                                                                                                                                                                                     |
| **G4** (prompt de ejecución)             | GO            | `PROMPT-CRM-EXPEDIENTE-SEGMENTO-IMPLEMENTACION-v1.0.md` con contratos congelados citados (§3bis regla 4)                                                                                                                                                                                   |
| **G5** (implementación + gates técnicos) | GO            | Lint/typecheck 0 errores (api/db/portal; warnings pre-existentes ajenos a la feature); tests: db 22 suites/120 tests, api CRM 16 suites/324 tests, portal expedientes 11 suites/53 tests — **0 fallos**. Verificación con evidencia ejecutada (Jest real, no caché: `--runInBand` acotado) |
| **G6** (review de experiencia y calidad) | GO            | SR-QA: CA-1..CA-5 cubiertos (CA-2 frontend parcial, deuda aceptada), 0 bloqueantes, 0 importantes. SEC-ENG: **GO con observaciones** — 0 P0/P1/P2, 3 P3 informativos                                                                                                                       |
| **G6.5** (merge readiness)               | **PENDIENTE** | Requiere corrida Linux de GitHub Actions por SHA + artefacto resumen sanitizado (ADR-069). No se corrió en esta sesión — el merge **no está autorizado** por este informe                                                                                                                  |
| **G7** (producción)                      | NO APLICA     | Requiere recomendación EM-ARCH + aprobación del CTO                                                                                                                                                                                                                                        |

## 4. Cobertura de criterios de aceptación (dictamen SR-QA)

| CA                                                   | Veredicto                           | Evidencia                                                                                                                         |
| ---------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| CA-1 (alta exige segmento sin default y persiste)    | CUBIERTO                            | DTO zod + 3 tests schema + controller + UI + spec landing; deuda: sin aserción directa de `created.customerSegment` en `create()` |
| CA-2 (detalle edita en Interés comercial, 6 valores) | CUBIERTO backend / PARCIAL frontend | updateSection persiste/rechaza + constants + renderer; deuda: `CommercialInterestSection.spec.tsx` sin caso del Select            |
| CA-3 (conversión propaga; fallback sin segmento)     | CUBIERTO                            | 4 tests directos + 1 conversión completa `createFromExpediente`                                                                   |
| CA-4 (migración registrada, reversible, spec)        | CUBIERTO                            | runner + `migration-order.spec.ts` + spec hermano                                                                                 |
| CA-5 (lint/typecheck/tests en verde)                 | CUBIERTO                            | Evidencia §3                                                                                                                      |

Nota de plataforma (declarada, no inventada): el repo no mide cobertura ≥80% por módulo core CRM (umbrales por paquete en jest.config de api/portal); el gate 4 del protocolo sigue sin ser mecánicamente exigible por módulo — deuda de plataforma conocida, registrada.

## 5. Desvíos justificados del plan

1. `completeness-calculator.service.spec.ts`: 1 línea en helper local para compilar (`exactOptionalPropertyTypes`). El **servicio no se tocó** (regla del plan respetada).
2. Audit log del create incluye `customerSegment` (dato de negocio cerrado, sin PII) — regla dura de audit en CUD.
3. Sección permite limpiar el segmento a null (coherente con nullable por diseño y con los campos opcionales de la sección; el alta lo exige).
4. `SectionFieldRenderer.tsx` NO se modificó: no es consumido por ningún flujo activo (verificado); el detalle lo renderiza `CommercialInterestSection.tsx`.
5. Placeholder vía prop nativa del `Select` de `@iwana/ui` (mecanismo existente, patrón ya usado en la sección).

## 6. Deuda por severidad

**Estado: 4 de 4 ítems de la feature pagados el 2026-08-20** (tracks SR-FULL + FE-PLATFORM, evidencia en §6.1).

| Severidad             | Ítem                                                                                                                  | Estado                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Baja                  | Aserción directa `expect(created.customerSegment)` en el test de `create()` del servicio (cierra eslabón de CA-1)     | **Pagada** — spec ajustada al shape real del `create()` (re-lectura vía `findById`)                                   |
| Baja                  | Test de rama null-clear en `commercial_interest` (P3 H3-2 SEC-ENG)                                                    | **Pagada** — test nuevo `limpia customerSegment a null al actualizar la seccion de interes comercial`                 |
| Baja                  | Hardening tipo estricto `typeof rawSegment === 'string'` antes de coerción en validación de sección (P3 H3-1 SEC-ENG) | **Pagada** — guarda de tipo en el servicio + test con payload `['RESIDENTIAL']` rechazado                             |
| Baja                  | Caso de render/edición del Select de segmento en `CommercialInterestSection.spec.tsx` (opcional)                      | **Pagada** — 2 casos nuevos: render con 6 opciones canónicas + edición (PyME → `onChange('customerSegment', 'PYME')`) |
| Media (pre-existente) | `act()` warnings en `ExpedientesLandingClient.spec.tsx` (flujo de carga, ajeno a la feature)                          | Pendiente — iteración de limpieza separada                                                                            |
| Media (pre-existente) | Cobertura por módulo no instrumentada en CRM                                                                          | Pendiente — deuda de plataforma, fuera del alcance de esta fase                                                       |

Sin deuda crítica ni alta. No requiere escalación al CTO (perfil §3.3).

### 6.1 Evidencia del pago

| Comando                                                                            | Resultado                                             |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `pnpm --filter @iwana/api exec jest src/modules/crm/expedientes --runInBand`       | 6 suites / **128 tests passed** (2 nuevos) — 0 fallos |
| `pnpm --filter @iwana/api lint` / `typecheck`                                      | 0 errores (warnings pre-existentes ajenos) / limpio   |
| `pnpm --filter @iwana/portal exec jest src/components/crm/expedientes --runInBand` | 11 suites / **55 tests passed** (2 nuevos) — 0 fallos |
| `pnpm --filter @iwana/portal lint` (spec tocada) / `typecheck`                     | 0 errores / limpio                                    |

Archivos tocados por el pago: `apps/api/src/modules/crm/expedientes/expediente.service.ts` (guarda de tipo), `apps/api/src/modules/crm/expedientes/tests/expediente.service.spec.ts`, `apps/portal/src/components/crm/expedientes/sections/CommercialInterestSection.spec.tsx`.

## 7. Bloqueos y consultas

- `[BLOQUEO]`: ninguno emitido por los tracks.
- Consultas: ninguna bloqueante; desvíos registrados en §5 sin cambios de decisión.

## 8. Decisiones que requieren CTO

Ninguna. Sin ADR nuevo (la columna reutiliza el enum de ADR-025; sin cambio de boundary, stack ni contrato).

## 9. Impacto declarado

- **Multi-tenant:** sin impacto — columna dentro del schema tenant existente; migración sin calificación de schema (search_path); sin tenant hardcodeado (verificado por SEC-ENG).
- **Seguridad:** sin impacto adverso — enum cerrado a 6 valores en boundary; sin PII; audit sin datos sensibles.
- **Escala:** sin impacto — columna nullable sin índice; si más adelante se filtra pipeline por segmento, índice en migración aparte (plan §Riesgos).
- **Regulación:** sin impacto (CRC/DIAN no tocan el segmento de expediente).

## 10. Estado del merge (G6.5)

**Calidad aceptada (G6 GO), merge pendiente de la corrida Linux.** Para autorizar merge: corrida de GitHub Actions en Linux identificada por SHA (workflows `production-images` y `execution-orders-e2e` según ADR-069) + artefacto resumen sanitizado. Este informe no autoriza merge ni despliegue por sí solo.

---

## 11. Corrección posterior — pickers de catálogo en "Interés del cliente" (defecto de UX)

**Reportado:** 2026-08-20 — "Productos adicionales" y "Servicios adicionales" se veían como un input; deben ser una lista desplegable alimentada por /commercial.

**Causa raíz (doble bloqueo, verificado contra código):**

1. Backend: `catalog.service.ts` `searchForPicker` tenía guard `if (!q) return { data: [], total: 0 }` — la API prohibía listar el catálogo sin texto (`picker-search.dto.ts` lo documentaba como diseño).
2. Frontend: `SearchableMultiPicker` con `minChars=2` (default) no mostraba el listbox hasta escribir 2+ caracteres (fase `threshold`).

**Corrección (tracks en paralelo):**

| Capa                                                            | Cambio                                                                                                                                                                                                                                                                         | Evidencia                                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Backend (`catalog.service.ts`, `picker-search.dto.ts`, 2 specs) | Eliminado el guard de `q` vacío: con `q` vacío/undefined la query devuelve el top-20 del catálogo (tipo + activos, orden nombre). Comentario del DTO corregido. Shape `{data,total}` intacto — sin cambio de contrato tipado ni de OpenAPI                                     | `jest src/modules/commercial` → 19 suites / **181 tests passed**; lint 0 errores; typecheck limpio        |
| Frontend (`CommercialInterestSection.tsx` + spec)               | `minChars={0}` en los dos `SearchableMultiPicker`: al enfocar el picker despliega las opciones del catálogo (query vacía + debounce) y permite filtrar escribiendo. Componente shared `SearchablePicker.tsx` verificado (soporta `minChars=0` sin defecto) y **no modificado** | `jest src/components/crm/expedientes` → 11 suites / **56 tests passed**; lint 0 errores; typecheck limpio |

**Comportamiento resultante:** al abrir "Productos adicionales" / "Servicios adicionales" se despliega la lista del catálogo comercial (productos `type=PRODUCT`, servicios `type=SERVICE`, activos, orden alfabético, máx. 20, con aviso de truncamiento), con búsqueda por nombre disponible. Sin cambio de datos persistidos (siguen siendo IDs de catálogo).

**Observación no bloqueante:** el `SearchableMultiPicker` no tiene preload-on-mount (sí lo tiene el single `SearchablePicker`); la lista aparece tras el debounce de 300ms al abrir. Candidato de mejora para AI-DS-OWNER en iteración futura, no bloquea esta corrección.

**Gates:** sin cambios de alcance, boundary ni contrato de API → no requiere re-sync del §3bis. G6 sigue GO; G6.5 sigue pendiente de la corrida Linux.

---

## 12. Corrección posterior — picker "Plan de interés" (defecto de UX)

**Reportado:** 2026-08-20 — al buscar y seleccionar un plan "no pasaba nada": la selección parecía no reflejarse.

**Causa raíz (verificada con reproducción en navegador + código):**

1. Búsqueda solo por nombre (`ci.name ILIKE`): `q=fibra` devolvía 0 resultados porque ningún nombre de plan contiene "fibra" (la tecnología sí lo es). `q=radio` idéntico.
2. Planes homónimos indistinguibles: el tenant tiene 2 "Plan Alto", 2 "Plan Basico" y 2 "Plan Medio" (diferente tecnología/velocidades), todos con sublabel "Activo" → seleccionar una variante distinta se veía igual ("no pasa nada").
3. `minChars` default (2) en el `SearchablePicker` del plan: el catálogo no se desplegaba sin escribir 2+ caracteres (inconsistente con productos/servicios).

La selección en runtime **sí funcionaba** (input cambiaba, `GET /commercial/catalog/:id` 200, sin errores de consola); el problema era de descubrimiento y de diferenciación visual.

**Corrección (tracks en paralelo):**

| Capa                                                                  | Cambio                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Evidencia                                                                                                                                                                                       |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Backend (`catalog.service.ts` `searchForPicker`, controller, 2 specs) | Para `type=PLAN`: `leftJoin` a `plan_details` y filtro `(ci.name ILIKE OR pd.technology ILIKE)` — búsqueda por nombre **o** tecnología. Sublabel enriquecido `{technology} · ↓{download}Mbps · ↑{upload}Mbps` para distinguir homónimos; fallback "Activo"/"Inactivo" si el plan no tiene detalle. Productos/servicios sin cambios (nombre + "Activo"). Shape `{data,total}` y contrato `{id,label,sublabel}` intactos — sin cambio de contrato HTTP ni OpenAPI; descripción Swagger actualizada | `jest src/modules/commercial` → 19 suites / **182 tests passed** (incl. mock del join en tenant-isolation); lint 0 errores; typecheck limpio                                                    |
| Frontend (`CommercialInterestSection.tsx` + spec)                     | `minChars={0}` en el `SearchablePicker` de plan: preload del catálogo al montar (8 planes, description del combobox) + filtrado por tecnología. Componente shared `SearchablePicker.tsx` **no modificado**                                                                                                                                                                                                                                                                                       | `jest src/components/crm/expedientes/sections/CommercialInterestSection.spec.tsx` → **8 tests passed** (nuevos casos de precarga, sublabel y label compuesto); lint 0 errores; typecheck limpio |

**Mejora adicional (solicitud 2026-08-20):** el input ahora muestra el **label compuesto** `label — sublabel` tras seleccionar (mismo formato `formatItemText` de las opciones, SearchablePicker.tsx:155): "Plan Basico — Radio Enlace · ↓10Mbps · ↑5Mbps". Se aplica en selección (`onChange` del picker) y en rehidratación (`getPlanById`), vía helper local `planDisplayLabel` — sin tocar el primitive shared. Verificado en vivo: al guardar "Plan Alto — Radio Enlace · ↓20Mbps · ↑10Mbps", el input conserva la información completa tras recargar.

**Fixes de estabilidad detectados en verificación en vivo (2026-08-20):**

| Hallazgo                                                                                                                  | Causa raíz                                                                                                                                | Fix                                                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `plans/search` devolvía **500** con queries sin coincidencias (p. ej. "plana", o el label compuesto al enfocar el picker) | `searchForPicker` ejecutaba `pd.item_id IN (:...ids)` con lista vacía → PostgreSQL `syntax error at or near ")"` (catalog.service.ts:663) | Guard temprano: si `rows.length === 0` → `{ data: [], total }` sin consultar `plan_details`. Test añadido (`catalog.service.spec.ts`) → commercial suite **183 tests passed**                                                                                                                          |
| Al enfocar el picker con plan seleccionado, el label compuesto se usaba como query de búsqueda → error "Reintentar"       | `SearchablePicker` (single) disparaba el search con el `query` = label de la selección (con `minChars=0` siempre supera el umbral)        | El search solo corre si el query fue **editado por el operador** (`userEditedQueryRef`); el **preload** (minChars=0) usa controller propio que no aborta el search effect al cerrar; `Reintentar` con selección consulta la lista completa. `SearchablePicker.spec.tsx` **17 tests passed** (3 nuevos) |

Verificación en vivo post-fix (tenant `iwana`): enfocar el picker → lista precargada de 8 planes sin error; seleccionar "Plan Basico — Radio Enlace" → input muestra "Plan Basico — Radio Enlace · ↓10Mbps · ↑5Mbps"; escribir "zzz" → "0 planes" sin 500. Lint 0 errores y typecheck limpio en api y portal.

**Verificación en vivo (navegador, expediente `d1908501-36c4-4969-aede-6820b6ad484c`, tenant `iwana`):**

- `GET /commercial/plans/search?q=fibra` → 5 planes con tecnología "Fibra Optica" (antes 0). `q=radio` → 3 planes Radio Enlace.
- Listbox del picker muestra los homónimos diferenciados: "Plan Alto — Fibra Optica · ↓120Mbps · ↑60Mbps" vs "Plan Alto — Radio Enlace · ↓20Mbps · ↑10Mbps" (ídem Plan Basico y Plan Medio).
- Selección de "Plan Alto — Radio Enlace" → combobox muestra "Plan Alto" + botón "Limpiar selección"; `PATCH /sections/commercial_interest` → 200 con `interestedPlanId: 3b388d7e-...` (variante correcta); la sección pasó de 50% a 100%.

**Observación no bloqueante (follow-up para AI-DS-OWNER):** la sección no muestra indicador de "cambios pendientes" entre seleccionar y pulsar "Guardar cambios" (misma semántica de borrador explícito que el resto de secciones). Mejora transversal de UX, fuera del alcance de esta corrección.

**Corrección adicional (2026-08-20):** limpiar el plan ahora se persiste como `interestedPlanId: null`. Antes, el frontend omitía el campo vacío y el backend ignoraba valores falsy, por lo que un plan previamente guardado reaparecía tras recargar y la sección permanecía en 100 %. Se corrigieron ambos límites y se añadieron regresiones: API `expediente.service.spec.ts` 67/67; portal `constants.spec.ts` + `CommercialInterestSection.spec.tsx` 23/23; typecheck API y portal limpio. La construcción inicial del draft mantiene `interestedPlanId: ''` cuando la API devuelve `null`, por lo que un expediente nuevo sin plan se muestra vacío y no se completa por ese campo.

**Corrección de reapertura (2026-08-20):** el retraso al volver a abrir "Interés del cliente" provenía del desmontaje del acordeón. Al reabrir se repetían la hidratación del plan, los detalles de productos/servicios y el preload del catálogo. Se añadió `keepMounted` lazy-persistent al contrato de `SectionAccordion` y se activó únicamente en `ExpedienteSections`; los paneles nunca abiertos no generan carga y los paneles cerrados usan `hidden` con relación ARIA estable. Regresión cubierta en `ExpedienteSections.spec.tsx`: montaje único tras cerrar/reabrir.

**Gates:** sin cambios de alcance, boundary ni contrato de API → no requiere re-sync del §3bis. G6 sigue GO; G6.5 sigue pendiente de la corrida Linux (ADR-069).

---

## 13. Corrección posterior — mapa de viabilidad técnica sin teselas

**Reportado:** 2026-08-20 — la sección "Viabilidad técnica" mostraba el contenedor gris de Leaflet, controles y marcador, pero no cargaba el mapa base.

**Causa raíz:** `TechnicalFeasibilitySection.tsx` usa correctamente `https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png`; sin embargo, la CSP del portal solo permitía Gravatar en `img-src`, bloqueando las imágenes de las teselas OSM.

**Corrección:** `apps/portal/next.config.ts` ahora permite `https://*.tile.openstreetmap.org` en `img-src`. No se modificaron Leaflet, coordenadas, CSS ni la frontera cliente/servidor.

**Evidencia:** typecheck del portal y build de producción pasan. El servidor Next publicado devuelve la CSP con el dominio OSM incluido. La comprobación visual autenticada queda pendiente porque la sesión del navegador expiró.

---

## 14. Corrección posterior — alineación UI de "Viabilidad técnica"

**Reportado:** 2026-08-20 — la revisión visual detectó copy ambiguo, estado "Crítica" para una sección vacía, alternativas no operables por teclado y ausencia de feedback cuando las teselas del mapa fallaban.

**Correcciones aplicadas:**

- El mapa ahora comunica carga, error y reintento; el contenedor tiene región accesible y `aria-busy` durante la carga.
- Las alternativas de conexión usan `CheckboxCard` con controles nativos y la opción principal usa un botón con nombre accesible y `aria-pressed`.
- "Crítica"/"Atención" por porcentaje se reemplazó por "Pendiente"/"En progreso"/"Completa", separando avance de riesgo.
- Copy alineado: "Ubicación técnica", "Resultado de cobertura" y "Justificación técnica".
- Las alternativas largas ya no se truncan; se eliminaron hex de marca y sombras/radios locales en la superficie del mapa.
- Se añadió `TechnicalFeasibilitySection.spec.tsx` con estados del mapa, reintento, teclado, recomendación y copy.

**Evidencia:** auditoría `audit-ui.mjs` sin hallazgos en la sección; 49 pruebas focalizadas pasan; typecheck portal/UI y build de producción pasan. Lint sin errores, con warnings generales preexistentes del portal.

---

## 15. Corrección posterior — atribución inicial del asesor de origen

**Reportado:** 2026-08-20 — al crear una oportunidad con "Asesor de origen" y "Origen", el detalle podía mostrar "Sin atribución activa".

**Causa raíz:** el alta ya ejecutaba `POST /crm/expedientes/:id/attribution` con el asesor y canal seleccionados, pero el frontend absorbía cualquier error de esa segunda operación y reiniciaba el formulario como si la atribución se hubiera guardado. El backend conserva la separación correcta entre originador comercial y responsable operativo; no se modificaron sus permisos.

**Corrección:**

- La selección de "Asesor de origen" y "Origen" continúa creando la atribución comercial inicial.
- Si la atribución falla, la oportunidad queda creada, pero el formulario conserva sus valores y muestra una alerta accesible explicando el problema.
- La alerta incluye un enlace directo al detalle para corregir el originador mediante "Gestionar originador".
- "Sin asignar" sigue siendo válido y no crea una atribución.

**Evidencia:** `ExpedientesLandingClient.spec.tsx` cubre atribución exitosa y fallo visible; `ExpedientesLandingClient.spec.tsx` + `SeguimientoTab.spec.tsx` pasan con 11 tests; typecheck y lint del portal pasan sin errores; Prettier pasa. Persisten 48 warnings generales preexistentes y avisos `act(...)` de las pruebas de la landing, sin fallos.

---

## 16. Corrección posterior — respaldo visible del creador

**Reportado:** 2026-08-20 — oportunidades creadas antes de la corrección podían no tener fila en `sales_attributions` y seguían mostrando "Sin atribución activa".

**Causa raíz:** la atribución comercial y la autoría de creación son datos distintos. Para expedientes históricos sin atribución activa, el detalle no utilizaba el creador que ya devuelve `timeline.metadata.createdBy`.

**Corrección:** cuando no existe una atribución comercial activa, el panel "Asesor de origen" muestra el nombre del creador como respaldo y lo identifica explícitamente como "Creado por". No se crea una atribución retroactiva ni se confunde la autoría con una atribución comercial. Las atribuciones nuevas continúan mostrando primero el asesor atribuido.

**Evidencia:** regresión agregada en `SeguimientoTab.spec.tsx`; suite focalizada de landing y seguimiento: 12 tests pasan; typecheck portal pasa; Prettier pasa. Los avisos `act(...)` de la landing son preexistentes y no producen fallos.

---

## 17. Corrección posterior — productos adicionales en el resumen

**Reportado:** 2026-08-20 — la tarjeta "Interés del cliente" mostraba el plan y los servicios adicionales, pero omitía "Productos adicionales".

**Causa raíz:** el resumen recorría `additionalProductIds` bajo el título incorrecto "Servicios adicionales" y no hidrataba ni renderizaba `additionalServiceIds` como un grupo independiente.

**Corrección:** la tarjeta ahora muestra por separado "Productos adicionales" y "Servicios adicionales", resolviendo ambos grupos contra el catálogo y conservando el fallback al ID cuando un ítem no puede resolverse.

**Evidencia:** `SeguimientoTab.spec.tsx` cubre ambos grupos; la suite focalizada pasa con 4 tests; typecheck del portal y Prettier pasan.

---

## 18. Corrección posterior — paginador de la bitácora

**Reportado:** 2026-08-20 — el paginador del timeline usaba botones con `rounded-md` y bordes individuales, divergentes del contrato iWana de paginación numerada.

**Corrección:**

- Números de página con targets de 44 px, `rounded-xl` y estados inactivos sin borde.
- Página activa en azul noche con `aria-current="page"`.
- Anterior/Siguiente mediante `Button variant="secondary"`.
- Elipsis no interactiva con `aria-hidden` y carácter tipográfico `…`.
- Vista móvil con "Página X de Y" y números ocultos.
- Región `nav`, anuncio `aria-live` y restauración del foco al cambiar de página.
- Se conserva la opción especial `Todo` del timeline.

**Evidencia:** `ExpedienteTimelinePanel.spec.tsx` cubre forma, estados, elipsis, mobile, extremos, foco y anuncio; pruebas focalizadas: 8/8; typecheck y Prettier pasan. La auditoría UI solo reporta un warning P3 preexistente sobre el spinner de carga de la bitácora.

---

## 20. Corrección posterior — consistencia del bloque de opciones técnicas

**Reportado:** 2026-08-20 — el bloque de tecnologías candidatas se percibía desconectado del resto del portal por combinar `CheckboxCard`, una estrella flotante, tooltip y badge de éxito en una sola interacción.

**Corrección:**

- Se eliminó la estrella flotante, su tooltip y el selector secundario de "Opción principal" para dejar únicamente el checklist operativo.
- El contador ahora es siempre visible y neutral: "0/1/N opciones viables".
- Las candidatas usan el patrón estándar de `CheckboxCard` dentro de una superficie `iwana-surface-soft`.
- El mapa aparece antes del bloque de opciones, dejando la evidencia técnica como contexto inmediato del checklist.
- Se normalizó el shell de las secciones con `rounded-2xl`, `shadow-iwana-soft`, bordes del sistema y `Button variant="primary"`.
- `CheckboxCard` ahora hereda el foco visible compartido del design system.
- Se corrigieron selectores y datos de fixture en el E2E CRM para reflejar roles reales y evitar una falsa validación de PII.

**Evidencia:** pruebas focalizadas portal y UI: 29/29; E2E CRM: 12/12; typecheck portal y `@iwana/ui`; lint UI sin warnings; lint portal sin errores con 48 warnings generales preexistentes; Prettier y `audit-ui.mjs` pasan sin hallazgos. No se modificaron API, DTOs ni persistencia.

---

## 19. Corrección posterior — tooltip accesible de la opción principal

**Reportado:** 2026-08-20 — el botón de estrella de "Viabilidad técnica" usaba el tooltip nativo del atributo `title`, sin control visual consistente ni asociación explícita con el control.

**Corrección:** se reemplazó `title` por un tooltip local con `role="tooltip"`, `aria-describedby`, apertura en hover y foco de teclado, manteniendo el nombre accesible y `aria-pressed` del botón. No se introdujo una nueva primitive porque el patrón solo aplica a esta acción y puede componerse con `Button`.

**Evidencia:** `TechnicalFeasibilitySection.spec.tsx` valida ambos estados del tooltip y la ausencia de `title`; suite focalizada 7/7, typecheck y Prettier pasan. La auditoría `audit-ui.mjs` no reporta hallazgos. Lint pasa sin errores y conserva 48 warnings generales preexistentes.
