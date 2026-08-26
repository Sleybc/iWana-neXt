# UX Spec — MOD06 Comercial · Resumen y navegación (Fase E · H8 / H9 / H10 / H12)

| Campo | Valor |
| --- | --- |
| **Versión** | 1.0 |
| **Estado** | **Aprobado G2** (AI-EM-ARCH · 2026-07-22) |
| **Fecha** | 2026-07-22 |
| **Autor** | AI-PROD-UX |
| **Aprobación** | G2 alcance UX sin cambio de RF del PRD; H9/H12 → FE ya; H8 → SR-FULL tras desempate tributario (2026-07-22) |
| **Enmienda G2b** | Q2/Q3 alineados a ADR-031: sin KPI de `tax_classification_id` legado; ver § Enmienda G2b abajo |
| **Módulo** | MOD06 Comercial · portal `/dashboard/commercial` |
| **Origen** | [PROMPT-MOD06-UI-FASE-E-v1.0](../prompts/PROMPT-MOD06-UI-FASE-E-v1.0.md) · [INFORME-COMMERCIAL-UI-ALIGNMENT-v1.1](../informes/INFORME-COMMERCIAL-UI-ALIGNMENT-v1.1.md) |
| **Skill** | `iwana-identity-ui-review` (modo diseño) |
| **Dirección visual** | [Firma iWana 2026-07-12](./2026-07-12-firma-iwana-diseno-visual-design.md) |

**Postura:** una decisión recomendada por hallazgo. Sin menú de opciones equivalentes.

**Alcance:** especificación de experiencia. No código, no mockup de alta fidelidad, no tokens nuevos. Implementación: AI-FE-PLATFORM tras G2. Contratos de datos: AI-SR-FULL evalúa tras G2.

---

## Decisión consolidada (resumen ejecutivo)

1. **H8** — Rediseñar Resumen como panel de orientación operativa (alertas + 5 KPIs con significado + lista corta de atención), no como índice de conteos.
2. **H9** — Separar grupo **Ofertas** (Combos · Promociones) y dejar en **Reglas** solo Compatibilidad · Tributación. El PRD no fija taxonomía de navegación; manda el modelo mental ya usado en dashboard y eyebrows.
3. **H10** — Acento KPI solo con regla semántica: `warning` / `danger` cuando hay riesgo o bloqueo; resto `neutral`. Prohibido `primary` decorativo.
4. **H12** — Promover **Resumen** fuera de grupo (sin rótulo «Operación»). No absorberlo en Catálogo.

---

## H8 — Resumen comercial orientado a tarea

### 1. Tarea principal del operador (1 frase)

En la vista Resumen, el gerente comercial (o quien gestione la oferta) debe **saber en menos de 10 segundos qué requiere atención hoy en catálogo, ofertas y reglas, y saltar a corregirlo** — no inventariar cuántos ítems activos existen.

Persona ancla: Gerente Comercial (PRD §3.1). Lectura secundaria: Jefe de Facturación (tributación incompleta).

### 2. Preguntas operativas que el resumen DEBE contestar

Ancladas en PRD MOD06 (vigencias RF-COM-14/19, precio vigente RF-COM-08, clasificación tributaria RF-COM-01/23–25, compatibilidad RF-COM-20–21, eventos de promoción RF-COM-31) y en la operación ISP real (oferta lista para cotizar sin sorpresas en caja).

| # | Pregunta operativa | Por qué importa en ISP |
| --- | --- | --- |
| Q1 | ¿Qué combos o promociones **vencen pronto** o están a **agotar usos**? | Evita vender una oferta que desaparece a mitad de campaña o deja de aplicar en cotización. |
| Q2 | ¿Qué del **catálogo activo** no está listo para vender (sin precio vigente o sin clasificación tributaria)? | Un plan activo sin precio o sin clasificación rompe cotización y facturación aguas abajo. |
| Q3 | ¿Hay **huecos en reglas** que bloquean o arriesgan la venta (planes activos sin regla tributaria aplicable; combos activos con ítems inactivos)? | Compatibilidad y tributación son prerrequisitos de cotización (Flujos 4–5 del PRD). |
| Q4 | ¿Qué **cambió recientemente** en la oferta comercial? | El operador vuelve al módulo entre sesiones; necesita “qué tocó alguien / qué expiró” sin auditar tablas. |
| Q5 | ¿Cuál es el **pulso de escala** de la oferta (activos con contexto, no índice de tabs)? | Sirve para tamaño relativo del tenant; subordinado a Q1–Q4. |

### 3. Señales UI, CTA y datos mínimos (nombres conceptuales)

Composición de la vista (orden de lectura, viewport desktop):

1. **Franja de alertas** (0–3, solo si hay riesgo) — arriba.
2. **Fila de KPIs** (exactamente **5** métricas núcleo) — centro.
3. **Lista corta «Requiere atención»** (máx. 5 filas) — abajo; si no hay ítems, empty saludable.

#### Q1 — Vigencias y cupos de ofertas

| Elemento | Spec |
| --- | --- |
| **Bloque** | Alerta accionable (`PortalAlert` warning) **si** hay ≥1 oferta en ventana de riesgo; más KPI «Vencen pronto» y filas en lista. |
| **Copy alerta (ejemplo)** | «3 promociones vencen en los próximos 7 días.» |
| **CTA** | «Ver ofertas» → tab Combos o Promociones según el tipo dominante; idealmente con filtro URL `status=expiring` (FE; si el filtro no existe aún, aterrizar en el tab y documentar deuda). |
| **KPI** | Título: «Vencen pronto» · eyebrow: «Ofertas» · valor: conteo en ventana · descripción: «Combos y promociones en los próximos 7 días o cerca del límite de usos.» |
| **Acento** | `warning` si conteo > 0; `neutral` si 0. |
| **Datos mínimos** | `offersExpiringSoonCount`, `offersNearUseLimitCount` (o unificado `offersAtRiskCount`); lista corta: `id`, `tipo` (combo\|promoción), `nombre`, `validTo` o `usosRestantes`, `destinoTab`. Ventana fija de producto: **7 días** calendario. |

#### Q2 — Completitud del catálogo vendible

| Elemento | Spec |
| --- | --- |
| **Bloque** | KPI «Listos para vender» + alerta si hay incompletos; filas en lista. |
| **KPI** | Título: «Listos para vender» · eyebrow: «Catálogo» · valor: `catalogSellableActiveCount` · total opcional: `catalogActiveCount` · descripción: «Planes, productos y servicios activos con precio vigente y clasificación tributaria.» |
| **Acento** | `danger` si `catalogIncompleteActiveCount` > 0; `neutral` si 0. |
| **CTA** | «Completar catálogo» → Planes (o el tipo con más incompletos). |
| **Datos mínimos** | `catalogActiveCount`, `catalogSellableActiveCount`, `catalogIncompleteActiveCount`; desglose conceptual por causa: `missingCurrentPriceCount`, `missingTaxClassificationCount`; filas: `id`, `tipo`, `nombre`, `motivo` (sin precio vigente \| sin clasificación tributaria). |

> **Nota SR-FULL:** «listo para vender» = ítem activo **y** precio vigente (RF-COM-08) **y** clasificación tributaria asignada (RF-COM-01). No inventar campos de inventario (fuera de scope PRD §2.2).

#### Q3 — Huecos en reglas (tributación / integridad de oferta)

| Elemento | Spec |
| --- | --- |
| **Bloque** | KPI «Huecos en reglas» + alerta si > 0; filas en lista. |
| **KPI** | Título: «Huecos en reglas» · eyebrow: «Reglas» · valor: conteo de bloqueos/riesgos · descripción: «Planes activos sin regla tributaria aplicable u ofertas con ítems inactivos.» |
| **Acento** | `danger` si conteo > 0; `neutral` si 0. |
| **CTA** | «Revisar reglas» → Tributación o Combos según el motivo dominante. |
| **Datos mínimos** | `activePlansWithoutApplicableTaxRuleCount` (definición exacta de «aplicable» la cierra SR-FULL; UX exige *algún* mapeo activo para la clasificación del plan); `activeBundlesWithInactiveItemsCount`; filas con `motivo` legible. |

> Compatibilidad cruzada exhaustiva (grafo REQUIRES/EXCLUDES) **no** se exige en Fase E como métrica del resumen — ver defer.

#### Q4 — Cambios recientes

| Elemento | Spec |
| --- | --- |
| **Bloque** | Lista corta (no KPI obligatorio). Título de sección: «Cambios recientes». |
| **Empty** | Si no hay cambios en la ventana: empty *sin resultados* corto («Sin cambios en los últimos 7 días.») **sin** CTA de creación. |
| **CTA por fila** | Clic → tab del recurso tocado. |
| **Datos mínimos** | Hasta 5 eventos: `occurredAt`, `actionLabel` (creado \| desactivado \| precio actualizado \| promoción iniciada \| promoción vencida), `entityType`, `entityName`, `destinoTab`. Ventana: **7 días**. Fuente preferente: eventos de dominio ya previstos (RF-COM-31 y afines) o proyección liviana; **sin PII**. |

#### Q5 — Pulso de escala (subordinado)

| Elemento | Spec |
| --- | --- |
| **Bloque** | Dos KPIs neutros de contexto (no son el foco de la vista). |
| **KPI A** | «Planes activos» · eyebrow Catálogo · `activePlansCount` / `plansCount` · CTA → Planes. |
| **KPI B** | «Ofertas vigentes» · eyebrow Ofertas · `activeOffersCount` (combos activos en vigencia + promociones vigentes) · CTA → Combos. |
| **Acento** | Siempre `neutral` (conteo de escala, no riesgo). |
| **Datos mínimos** | Conteos ya existentes en `getDashboardSummary()` más agregación `activeOffersCount` (SR-FULL puede derivarla). |

#### Mapa de los 5 KPIs núcleo (cumple techo 5–9)

| Orden | KPI | Pregunta |
| --- | --- | --- |
| 1 | Vencen pronto | Q1 |
| 2 | Listos para vender | Q2 |
| 3 | Huecos en reglas | Q3 |
| 4 | Planes activos | Q5 |
| 5 | Ofertas vigentes | Q5 |

Las 7 tarjetas actuales (activos/total por entidad) **se retiran** de la primera vista. No se reintroducen como segunda fila en Fase E.

#### Estados de experiencia

| Estado | Comportamiento |
| --- | --- |
| **Loading** | Skeletons con forma: 1 bloque alerta + 5 cards KPI + 5 filas lista (`PortalSkeletonBlock`). |
| **Error de carga** | `PortalEmptyState` «Indicadores no disponibles» + acción «Actualizar» (patrón actual). |
| **Primera vez** (catálogo vacío: 0 planes y 0 productos y 0 servicios) | Empty de primera vez: título «Arma tu oferta comercial», descripción corta, CTA primario «Crear plan» → Planes. Sin KPIs en cero como “éxito”. |
| **Saludable** (sin alertas, listas vacías de atención, cambios vacíos) | Sin franja de alertas; KPIs en `neutral`; sección atención: «Todo al día — no hay ítems que requieran acción.» (empty saludable, sin CTA forzado). |
| **Con riesgo** | Alertas arriba; KPIs con acento semántico; lista con filas accionables. |

### 4. H10 — Acentos KPI (decisión única)

**Regla enunciable (obligatoria):**

- `danger` → hay **bloqueo de venta** o integridad rota (`catalogIncompleteActiveCount` > 0 o `huecosEnReglas` > 0).
- `warning` → hay **riesgo temporal** (`offersAtRiskCount` > 0).
- `neutral` → métrica de escala o conteo en cero de riesgo.
- **`primary` queda prohibido en esta vista** salvo `emphasized` de foco de teclado/hover ya resuelto por el primitive; no usar `accent: 'primary'` como decoración de “importancia”.

**Justificación (Firma iWana):** «El color comunica significado (estado, avance, foco, acción), nunca adorno.» Un acento constante sin significado sería aceptable como fallback; aquí hay semántica real (riesgo vs escala), así que la regla semántica prevalece sobre “todo neutral”.

### 5. Criterios de aceptación UX (medibles)

1. En ≤10 s con datos de riesgo sembrados, un evaluador identifica al menos una acción pendiente **sin abrir otro tab** (protocolo de pasada 3: tarea visible en primer viewport).
2. Exactamente **5** KPIs núcleo en Resumen; ninguno es solo “activos/total” de una entidad sin semántica de riesgo o escala contextualizada.
3. Toda alerta y toda fila de «Requiere atención» tiene CTA o navegación a destino concreto (tab + entidad cuando exista id).
4. Empty de primera vez ≠ empty saludable ≠ error de carga (tres copies distintos).
5. Ningún KPI usa `accent: 'primary'` decorativo; acentos solo según regla H10.
6. Microcopy en español, sentence case, sin enums técnicos (`REQUIRES`, `IVA_FULL`, etc.).
7. Sin PII en ejemplos, specs ni payloads de resumen.
8. Criterio skill: *«La primera vista muestra qué se puede hacer y dónde actuar»* — verificado en walkthrough QA.

### 6. Qué NO entra en esta fase (defer explícito)

| Diferido | Motivo |
| --- | --- |
| Sparklines / series temporales en KPI | Firma §2.1 dirección; no bloquea tarea. |
| Command palette Cmd+K para saltos comerciales | Firma §3.2; otro track. |
| Grafo completo de compatibilidad en resumen | Costo cognitivo y de contrato; queda en tab Compatibilidad. |
| Simulador tributario embebido en Resumen | Ya vive bajo Tributación. |
| Feed de auditoría completa / quién cambió qué (usuario) | RF-COM-27 es tributario; no exponer PII de operadores en dashboard. |
| Filtros URL `status=expiring` si no existen | Señalizar a FE; aterrizaje a tab basta para G2. |
| Segunda fila de conteos por entidad | Reproduce el defecto H8. |
| Cambio de alcance PRD (nuevos RF) | Si SR-FULL no puede derivar un dato del modelo actual → **[ESCALACIÓN]** EM-ARCH, no inventar RF aquí. |

**Señal a SR-FULL:** `getDashboardSummary()` hoy solo expone conteos activos/total. Q1–Q4 exigen extensión de contrato; G2 aprueba la UX; SR-FULL decide shape y endpoints. No bloquear G2 por implementación.

---

## H9 — Taxonomía de navegación unificada

### 1. ¿El PRD fija taxonomía distinta?

**No.** El PRD [PRD-MOD06-COMERCIAL-DEFINICION-v1.0](../prds/PRD-MOD06-COMERCIAL-DEFINICION-v1.0.md) §2.1 enumera **áreas de dominio** separadas:

- Catálogo unificado  
- Bundles / Combos  
- Promociones  
- Reglas de compatibilidad  
- Clasificación tributaria / tabla de reglas tributarias  

No define grupos de tabs del portal ni el rótulo «Ofertas». El addendum Fase 02 no introduce taxonomía de navegación.

**Implicación:** no hay conflicto normativo. La barra de tabs debe alinearse al modelo mental ya coherente en dashboard (`Ofertas`) y panels (`eyebrow="Ofertas"` en Combos/Promociones). Un combo no es una regla.

### 2. Decisión recomendada (única)

| Grupo | Tabs | Contenido |
| --- | --- | --- |
| *(sin grupo)* | **Resumen** | Dashboard operativo (H8) |
| **Catálogo** | Planes · Productos adicionales · Servicios | Sin cambio de contenido |
| **Ofertas** | Combos · Promociones | Promover los subtabs actuales a tabs de grupo (desaparece el tab único «Combos y promociones» bajo Reglas) |
| **Reglas** | Compatibilidad · Tributación | Solo reglas; Tributación conserva sus subsecciones internas (Catálogo · Reglas de aplicación · Simulador) |

### 3. H12 — Grupo Operación de un solo elemento

**Decisión:** **promover Resumen fuera de agrupación** (primera posición, sin rótulo «Operación», sin track de grupo de un solo hijo).

**No absorber** Resumen dentro de Catálogo: Resumen orienta catálogo + ofertas + reglas; meterlo en Catálogo mentiría el modelo mental.

Esto elimina el andamiaje de grupo con un solo tab (peso de scroll en mobile) y cierra H12 dentro de H9.

### 4. Wireframe textual — barra de tabs resultante

```text
[ Resumen ]
│
├─ Catálogo
│    [ Planes ] [ Productos adicionales ] [ Servicios ]
│
├─ Ofertas
│    [ Combos ] [ Promociones ]
│
└─ Reglas
     [ Compatibilidad ] [ Tributación ]
           └─ (si Tributación activo) [ Catálogo | Reglas de aplicación | Simulador tributario ]
```

**Eyebrows de panel (alineación obligatoria):**

| Panel | Eyebrow |
| --- | --- |
| Resumen | Operación *(o «Resumen» — una sola palabra; no «Dashboard»)* |
| Planes / Productos / Servicios | Catálogo |
| Combos / Promociones | Ofertas |
| Compatibilidad | Reglas |
| Tributación (y subpaneles) | Tributación *(ya coherente)* |

Rótulos de grupo en la barra: todos con `portal-eyebrow` (cierra hallazgo 11 de forma colateral; FE).

### 5. Criterios de aceptación (H9 + H12)

1. No existe grupo de navegación con un solo tab.
2. «Combos» y «Promociones» no aparecen bajo el rótulo «Reglas».
3. Las tres superficies (barra de tabs, eyebrows de panel, eyebrows de KPI del resumen) usan la misma taxonomía: Catálogo · Ofertas · Reglas (+ Resumen suelto).
4. Clic en KPI «Ofertas» / «Vencen pronto» aterriza en tab del grupo Ofertas, no en Reglas.
5. Walkthrough: operador describe la barra como «resumen, catálogo, ofertas y reglas» sin contradicción con el contenido abierto.
6. Labels en sentence case / vocabulario de producto («Combos», no `bundles` visible).

### 6. Impacto en deep-links / URL params (solo señal)

Estado actual (`commercial-tab-params.ts`):

- Tabs: `summary` \| `plans` \| `products` \| `services` \| `offers` \| `compatibility` \| `taxation`
- Ofertas: `offers` + sub `bundles` \| `promotions` (`offers`, `offers/promotions`)
- Default: `summary` (sin query)

**Señal para FE-PLATFORM (no implementa PROD-UX):**

1. Preferir tabs de primer nivel `bundles` y `promotions` **o** conservar `offers`/`offers/promotions` mapeados a los dos triggers del grupo Ofertas. Decisión de ingeniería; UX exige dos tabs visibles en el grupo.
2. **Compatibilidad de deep-links:** cualquier URL existente `?tab=offers` y `?tab=offers/promotions` debe seguir resolviendo al panel correcto (redirect/alias). No romper bookmarks ni tests E2E sin migración explícita.
3. `summary` sin param permanece default.
4. Documentar en changelog de portal el mapa viejo → nuevo si cambian los valores canónicos.
5. Filtros de catálogo en URL no se tocan en esta spec.

---

## Solicitudes a otros roles

| Rol | Solicitud |
| --- | --- |
| **AI-EM-ARCH** | Aprobar G2 esta spec (alcance UX sin cambio de RF del PRD). |
| **AI-SR-FULL** | Extender `getDashboardSummary()` (o endpoint hermano) con los datos conceptuales de Q1–Q4; definir semántica exacta de «regla tributaria aplicable». |
| **AI-FE-PLATFORM** | Implementar H8/H9/H10/H12 tras G2; aliases URL; unificar `portal-eyebrow` en rótulos de grupo. |
| **AI-DS-OWNER** | Ningún token nuevo. Si la lista «Requiere atención» se repite en otros módulos, evaluar primitive `PortalAttentionList` *después* de 2+ usos — no inventar en esta fase; componer con `PortalPanel` + filas existentes. |
| **AI-SR-QA** | Casos: primera vez / saludable / con riesgo; taxonomía de tabs; acentos semánticos; deep-link `offers`. |

---

## [ESCALACIÓN] — solo si aparece en implementación

- Si «listo para vender» exige datos no modelados (p. ej. precio por segmento obligatorio sin default) → EM-ARCH decide regla de negocio; no la inventa UX.
- Si el feed de «Cambios recientes» no tiene fuente sin PII → diferir Q4 a fase F y mantener Q1–Q3 + Q5 (mínimo viable del Resumen).

---

## Enmienda G2b — desempate EM-ARCH (factibilidad SR-FULL · ADR-031)

Fecha: 2026-07-22. Fuente: dictamen [SR-FULL](ea577c93-5540-4dc8-b1e1-6367bd847d90) + [ADR-031](../adrs/ADR-031-Rediseno-Tributario-Comercial-Impuestos-Reglas-Simulador.md).

| Punto | Decisión |
| --- | --- |
| **Q2 «listo para vender»** | Ítem activo **y** ≥1 precio con `is_current = true` (cualquier segmento). **No** exigir `tax_classification_id` (concepto visible abandonado en ADR-031). Retirar `missingTaxClassificationCount` del contrato Fase E. |
| **Q3 «huecos en reglas»** | `activeBundlesWithInactiveItemsCount` (cualquier ítem del combo activo con `is_active = false`) **+** `taxRulesCoverageGapCount`: si `activePlansCount > 0` y el tenant no tiene ≥1 regla tributaria activa con ≥1 aplicación activa en vigencia → contar `activePlansCount` como hueco de cobertura (señal tenant-level, no match por segmento/estrato). **No** usar la definición legado por `tax_classification_id`. |
| **Q1 umbral usos** | «Cerca del límite» = `max_uses` no nulo y (`current_uses / max_uses ≥ 0.8` **o** `max_uses - current_uses ≤ 2`). |
| **Q4** | Confirmado diferido a fase F (sin feed durable sin PII). |
| **Contrato** | Extensión **aditiva** de `GET /commercial/dashboard/summary`; tipos canónicos en `@iwana/shared`. |
| **Copy UX** | KPI Q2 descripción: «Planes, productos y servicios activos con precio vigente.» (sin mención a clasificación). KPI Q3: «Combos con ítems inactivos u oferta activa sin reglas tributarias de aplicación.» |

Copy de alerta Q2: omitir «sin clasificación tributaria»; usar «sin precio vigente».

---

## Trazabilidad de cierre

| Hallazgo | Severidad | Decisión | Estado tras G2 |
| --- | --- | --- | --- |
| H8 | P1 | Resumen orientado a 5 preguntas; 5 KPIs; alertas + lista | Spec lista; impl. post-G2 (posible fase F si EM-ARCH difiere código) |
| H9 | P2 | Grupo Ofertas; Reglas = compatibilidad + tributación | Spec lista |
| H10 | P2 | Regla semántica danger/warning/neutral; no primary decorativo | Resuelto dentro de H8 |
| H12 | P3 | Resumen promovido, sin grupo Operación | Resuelto dentro de H9 |

**Criterio skill de cierre (modo diseño):** con esta spec implementada, la primera vista del módulo muestra *qué se puede hacer* (alertas + lista + CTAs) y *dónde actuar* (tabs alineados al mismo modelo mental).

---

## Enmienda 2026-08-19 — rail vertical y Tributación plana

La taxonomía Catálogo / Ofertas / Reglas **sigue vigente**. Tributación deja de ser un tab con subsecciones: Impuestos, Aplicación de impuestos y Simulador son destinos de primer nivel en Reglas. La presentación pasa de tabs navy agrupados a rail lima (`PortalModuleSubnav`).

Contrato: [2026-08-19-comercial-module-subnav-ux.md](./2026-08-19-comercial-module-subnav-ux.md).
