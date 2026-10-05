# PROMPT DE EJECUCIÓN — MOD11 Consola de OT · Ola 2 · R0 + E4 (UX)

**Versión:** 1.0
**Fecha:** 2026-10-05
**Generado por:** AI-EM-ARCH
**Agente destinatario:** **AI-PROD-UX** (`prod-ux`)
**Fases que cubre:** R0 del plan de consola **y la parte de UX de E4** del plan de origen (fusión decidida el 2026-10-05, ver §1)
**Estado:** despachable — la Ola 1 cerró en GO. **Relanzado el 2026-10-05 con la adenda A1**, que resuelve el `[BLOQUEO]` de la primera ejecución.

## Vínculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` (v1.2, **En revisión**)
- Spec que ejecuta (R0): `docs/specs/2026-09-14-mod11-consola-ot-requisito-como-eje-design.md` **v1.2** (Aprobado; la v1.2 corrige la fila *Bloqueada* de §4.2) — **§4.1, §4.2, §4.3, §4.4, §4.5, §4.6 y §10.12 son de lectura obligatoria**
- Spec que ejecuta (E4, solo UX): `docs/specs/2026-09-14-mod11-origen-ot-design.md` (Aprobada) — §3.5 y CA-12; [ADR-091](../adrs/ADR-091-Origen-de-la-OT-Despacho-y-Agenda-Actos-Separados.md) (Aprobado) §D5
- Spec que fija **qué requisitos hay**: `docs/specs/2026-09-14-mod11-acta-instalacion-design.md` v1.0 (Aprobado) §4.2 — plantilla `INSTALACION_ESTANDAR` v2, cinco requisitos; [ADR-088](../adrs/ADR-088-Cierre-OT-y-Culminacion-Instalacion-Hitos-Separados.md) (Aprobado) §D4
- Planes: `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` v1.2 · `docs/plans/2026-09-14-mod11-origen-ot.md` v1.1
- UX spec antecesora de la bandeja: `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-ux.md` v1.0 — esta fase la **amplía** para E4, no la supera
- Copy vigente que no se rehace: `docs/informes/INFORME-MOD11-CONSOLA-OT-OLA1-PROD-UX-v1.0.md` y `apps/portal/src/components/operations/execution-order-commitment-copy.ts`

### Contratos congelados que consumes — no los modifiques

| Contrato | Ruta y versión |
| --- | --- |
| API OT de ejecución | `packages/shared/src/contracts/operations/execution-orders.ts` **v1.4** (historial del docstring; la línea de cabecera aún dice v1.2 — no lo corrijas tú, es de `sr-backend`) |
| API estado por requisito | `packages/shared/src/contracts/operations/execution-orders-completion.ts` v1 |
| Componente tablas operativas | `docs/specs/2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md` v1.1 (Aprobado) |

Si la UX que diseñas exige un campo que esos contratos no publican, **emite `[BLOQUEO]` y para**: no diseñes sobre datos inexistentes.

### Adenda A1 (2026-10-05) — resolución del `[BLOQUEO]` del motivo de bloqueo

**Veredicto de AI-EM-ARCH:** el bloqueo **procede** y está bien emitido. La causa no está en la ejecución: es un defecto interno de la spec base, que en §4.2 pedía un dato que su propio §4.6 declaraba inexistente. Se corrigió en la spec v1.2.

- **No hay fuente de lectura aprobada para el motivo, y no se autoriza versionar el contrato** (spec v1.2 §10.12). El dato se persiste en la línea de tiempo, pero:
  - no tiene catálogo, así que sería un código crudo;
  - su lectura pertenece a T3 de línea de tiempo, con su condición de `sec-eng`;
  - el bloqueo no es alcanzable hoy desde el portal.
- **La celda *Bloqueada* se diseña con lo que existe:**
  - el estado de bloqueo, **sin motivo**;
  - la acción de desbloqueo solo si `allowedActions` la ofrece, conservando su disponibilidad real («Desbloqueo no disponible» mientras falte el catálogo);
  - el resto de la consola en lectura.
- **Ningún copy** insinúa que existe un motivo que no se muestra («ver motivo», «motivo no disponible» como hueco). Si la celda necesita orientar al usuario, nombra a quién acudir, no el dato ausente.
- Tu informe v1.0 queda como registro del bloqueo. Al cerrar, emite `INFORME-MOD11-CONSOLA-OT-OLA2-R0-PROD-UX-v1.1.md`, que lo supera.
- Tus hallazgos de la primera ejecución **se conservan**: los cinco requisitos son mapeables, y E4 se puede definir sin campos nuevos (ventana nulable + `createdAt` en el listado). Parte de ellos.

### Adenda A2 (2026-10-05) — auditoría G2 de la UX spec v1.0: correcciones y respuesta a la consulta de firma

**Veredicto de AI-EM-ARCH sobre `docs/specs/2026-10-05-mod11-consola-ot-requisito-ux.md` v1.0:** **GO condicionado** como mitad R0 de G2. G2 no cierra mientras R1 no entregue. Antes de esa cierre, la spec sube a **v1.1** con estas cuatro correcciones, todas verificadas contra el código:

1. **El borrador local offline no existe** (§5, «Sin conexión», y §9, «Sin conexión»). La consola solo detecta `navigator.onLine` (`use-execution-order-console.ts:112-125`) y ningún archivo de `apps/portal/src/components/operations/` persiste borradores. **El error nació en este encargo**: §3 paso 6 decía «el borrador local ya existe». Corrígelo así: sin conexión, se bloquean las escrituras y se conserva el copy vigente («Sin conexión; vuelve a intentar cuando recuperes la red.», `ExecutionOrderDrawer.tsx:888-890`). Ningún texto promete persistencia local. Retira también la necesidad 8 de §11.2.
2. **El orden por defecto de §7.2 se sustituye.** El orden en tres tramos que proponías no se apoya en el índice `idx_execution_orders_tenant_window_start` (migración 130). Exigiría DDL nueva y además invertiría el orden `DESC` aprobado en `docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md` §4.7.1, sin superarlo. **Decisión:** el orden por defecto pasa a ser `planned_window_start_at DESC NULLS FIRST, id DESC`, con `NULLS FIRST` explícito. Es el comportamiento implícito de PostgreSQL en `DESC` y lo cubre el índice actual, así que no requiere DDL. Las OT sin ventana encabezan la bandeja y CA-12 se cumple. La implementación es de `sr-backend` (datos de E4). Registra tu propuesta de tres tramos como **mejora diferida**: exige dictamen de `data-eng` sobre índice y paginación, y una enmienda de la spec del 2026-09-13.
3. **La etiqueta de §3 no es la del snapshot.** La migración 131 publica `installation-activity` con la etiqueta «Registro de la actividad en bitácora (NO requerido)». El cliente **no reescribe** etiquetas del snapshot (§3.2), así que esa es la etiqueta visible. Decláralo y quita la redundancia: con esa etiqueta, el estado del ítem opcional es «Sin registrar», no «Opcional · sin registrar». El «NO» en mayúsculas incumple el sentence case y queda como deuda de copy de la plantilla; se corrige con una v3 de la plantilla, que no es de este tramo.
4. **Respuesta a la `[CONSULTA]` de firma (§9).**
   - El trazo de la firma es una entrada **dependiente de la trayectoria**, el caso exceptuado por WCAG 2.1 SC 2.1.1 (Teclado). La superficie **no** necesita un trazo equivalente operable por teclado.
   - Sí **deben** ser operables por teclado, con foco gestionado y anuncios para lector de pantalla: las instrucciones y los controles «Limpiar», «Guardar firma» y «Cancelar».
   - **El nombre escrito no se acepta como evidencia `SIGNATURE`**: el artefacto no probaría lo que la etiqueta promete (ADR-088 §D4). `close()` además exige `method = SIGNATURE` para esa aceptación (`execution-orders.service.ts:1517-1520`).
   - Un cliente que no puede firmar con puntero no tiene vía alternativa en v1. Es deuda registrada en el plan. La validez jurídica de otra forma de aceptación electrónica *requiere verificación con fuente oficial* (Ley 527 de 1999) y queda fuera de alcance.
   - En §11.2 la necesidad 3 queda cerrada.

**Lo que se aprueba tal cual:**
- §3 con sus razones, que coinciden literalmente con `closure-gate-evaluator.service.ts:205-235`;
- la matriz de §4 y la celda bloqueada según A1;
- §6, §8 y la presentación «Por programar» / «Sin ventana planificada» de §7.1 y §7.3, que queda pendiente del veredicto de R1 frente a la raya de la tabla v1.1;
- la retirada del arrastre de archivos.

**Entrega:** spec UX v1.1, con changelog, y el informe `INFORME-MOD11-CONSOLA-OT-OLA2-R0-PROD-UX-v1.2.md`.

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** una UX spec que convierte la consola de OT de un formulario de seis secciones planas en un **expediente organizado por requisito y por momento**, y que hace legible una OT **sin cita** como trabajo por programar, no como fila rota.

**Por qué E4 viaja aquí.** E4 (origen) y R2-R4 (consola) intervienen la misma superficie: `ExecutionOrderDrawer.tsx`, `ExecutionOrderSummary.tsx` y la bandeja. Diseñarlas por separado obliga a rediseñar la consola dos veces y a que `fe-platform` pase dos veces por un archivo de 92 KB. Una sola UX spec, una sola pasada de implementación.

**Lo que sí entra:**

1. **Checklist como índice (spec consola §4.1).** Cada requisito muestra estado, razón y **la acción que lo satisface**, según el mapa `kind → acción` de la spec. `FIELD` y `MEASUREMENT` se muestran sin acción (§4.6), con un texto que no prometa una vía inexistente.
2. **Progresividad por momento (§4.2).** Qué se monta en pre-inicio, en progreso, bloqueada y en cierre/terminal. Se resuelve **no montando lo que no aplica**: no se aceptan acordeones sobre las seis secciones actuales.
3. **"Trabajo realizado" con propósito (observación 4).** Separar el histórico de la captura, y que cada registro diga qué requisito satisface.
4. **Custodia bajo demanda (§4.3, observación 5).** La custodia del ejecutor deja de ser un listado permanente: es un picker dentro del acto de registrar consumo, filtrado por la categoría del requisito `MATERIAL` que lo origina. Lo permanente son los consumos de la OT.
5. **Evidencia por requisito y firma (§4.5, observación 6).** La subida nace del requisito, con su `requirementKey` y su `evidenceType`. Captura de firma en el navegador para el requisito «Acta de conformidad firmada». **Decide el arrastre de archivos**: o se especifica, o se retira la promesa «Arrastra fotos o documentos relacionados con la instalación.» (`ExecutionOrderDrawer.tsx:1854`), que hoy no tiene manejadores.
6. **Render por rol (§4.4, D1).** Técnico o contratista asignado frente a supervisión (ADMIN, NOC, SUPPORT), derivado de `allowedActions`. Se conserva la regla de copy de la Ola 1: la pantalla dice lo que el usuario **sí** puede hacer.
7. **E4 — OT sin cita (origen §3.5, CA-12).** En la bandeja y en el detalle, una OT con `schedule.window = null` se lee como *trabajo por programar*. Define:
   - su presentación en la columna de ventana y en el resumen del detalle (`ExecutionOrderSummary.tsx:196` hoy asume ventana);
   - **el orden por defecto de la bandeja**, que deja de asumir `planned_window_start_at` (hoy `DESC`, migración 130). Propón el criterio y su justificación operativa;
   - el estado `CREATED` como bolsa **solo de supervisión** (ADR-091 §D6.1): un técnico nunca la ve, así que su copy le habla a quien coordina.

**Lo que no entra, y es deliberado:**

- **Oportunidades (observación 7).** Fuera de alcance por decisión del CTO (spec consola §5). No reserves espacio ni enlace hacia el expediente.
- **La acción de anular por error** (ADR-090). Su copy existe (`INFORME-MOD11-CORRECCION-OT-T2-v1.0.md`), pero su superficie no tiene tramo propio. Si la reorganización de la consola le deja un lugar natural, **anótalo como recomendación**; no lo especifiques.
- La línea de tiempo y su superficie de consulta (plan de línea de tiempo, T2/T3).
- Tokens, componentes y estados visuales: son de `ds-owner` en R1. Tú dices **qué** se muestra y **cuándo**; `ds-owner` dice **con qué**.
- La parte de datos de E4 (handlers y reconciliador ante `schedule_event_id IS NULL`, CA-13): es de `sr-backend` después de E3.

## 2. Artefactos de entrada obligatorios

- Código actual a leer, no a tocar: `ExecutionOrderDrawer.tsx` (secciones en `:912`, `:1005`, `:1127`, `:1387`, `:1707` y el cierre), `ExecutionOrderSummary.tsx`, `ExecutionOrdersTable.tsx`, `use-execution-order-console.ts`, `execution-order-requirement-status.ts`.
- La OT de la auditoría, `OTE-20260828-001`. **Atención:** su snapshot es de la plantilla **v1** (tres requisitos) y nunca tendrá los de la v2. La UX spec se diseña sobre la v2 y debe declarar cómo se ve una OT viva bajo v1 (convivencia de definiciones, acta §4.4).

## 3. Pasos

1. Leer los `SKILL.md` de la matriz (§6) antes de escribir.
2. Inventariar el estado actual por momento y por rol: qué monta hoy la consola en cada combinación. Es la línea base del entregable.
3. Diseñar la estructura por momento × rol (pasos 1 a 6 de §1) sobre los cinco requisitos de la v2.
4. Diseñar E4 (paso 7 de §1) para la bandeja y el detalle.
5. Redactar el copy completo, en español, en sentence case y sin enums crudos: títulos, estados vacíos, razones de requisito que el backend no traduce y acciones.
6. Declarar los estados de experiencia que R1 debe contratar: cargando, vacío, error, sin acceso, degradado sin `requirements[]` y offline (el borrador local ya existe).
7. **[CONSULTA] a `ds-owner`** si un patrón no tiene primitive en `@iwana/ui`. Sigue con lo que no depende de la respuesta.

## 4. Restricciones no negociables

- No inventar tokens, colores ni componentes: eso es R1.
- La UX no decide permisos: toda superficie se deriva de `allowedActions` o del `status`, nunca de la identidad leída en el cliente.
- Ninguna etiqueta afirma algo que la regla del requisito no comprueba (ADR-088 §D4).
- Accesibilidad: el estado de cada requisito se lee sin depender del color; la captura de firma tiene alternativa operable por teclado o declara su excepción como `[CONSULTA]` a AI-EM-ARCH.
- Sin dependencias nuevas implícitas: si la firma exige una librería de lienzo, lo **declaras** como necesidad para G3. No la eliges tú.

## 5. Entregables

- **UX spec:** `docs/specs/2026-10-05-mod11-consola-ot-requisito-ux.md`, con el estado «Borrador para G2». La aprueba AI-EM-ARCH, que no es su productor.
- Una matriz momento × rol con lo que monta cada combinación, y la tabla `kind → acción → copy`.
- Una sección «E4 — OT sin cita», con el orden por defecto propuesto y su justificación.
- Una tabla de copy cerrada.
- Una lista de necesidades para `ds-owner` (R1) y para el dictamen G3 de `fe-platform`.
- El informe de fase: `docs/informes/INFORME-MOD11-CONSOLA-OT-OLA2-R0-PROD-UX-v1.1.md`. Supera al v1.0, que registró el bloqueo.

## 6. Matriz de skills

| Tipo | Skills |
| --- | --- |
| **Obligatorias** | `brainstorming` (su salida de la sesión de origen es la base; no se re-ejecuta como sesión nueva), `system-vocabulary-review`, `ui-ux-pro-max` (subordinada a `iwana-identity-ui-review` y a los tokens) |
| **De apoyo** | `iwana-identity-ui-review`: para contrastar la propuesta con la Estrella Polar. `wcag-audit-patterns`: para especificar la alternativa accesible de la firma |
| **Descartadas** | `core-components` y `senior-ui-systems-designer`, porque el contrato de componente es de R1; `frontend-dev-guidelines` y `tailwind-patterns`, porque no se escribe código; `playwright-skill`, porque no hay verificación en navegador en una UX spec |

## 7. Stop/go

**GO si y solo si:**

- Cada uno de los cinco requisitos de la v2 tiene estado, razón y acción (o ausencia declarada de acción), con su copy.
- La matriz momento × rol no deja ninguna celda sin definir, y en pre-inicio no aparece superficie de captura (CA-10).
- La custodia solo aparece dentro del acto de consumo (CA-11).
- La OT sin cita tiene presentación y orden por defecto definidos en la bandeja y en el detalle (CA-12 de origen).
- El arrastre de archivos queda decidido.
- Una OT viva bajo la v1 tiene comportamiento declarado.

**NO-GO si:**

- La spec propone acordeones sobre las seis secciones actuales.
- La spec introduce tokens o componentes propios.
- La spec reabre el punto 7.
