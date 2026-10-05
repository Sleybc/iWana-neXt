# PROMPT DE EJECUCIÓN — MOD11 Consola de OT · Ola 2 · R1 (contrato de componente)

**Versión:** 1.0
**Fecha:** 2026-10-05
**Generado por:** AI-EM-ARCH
**Agente destinatario:** **AI-DS-OWNER** (`ds-owner`)
**Fase que cubre:** R1 (incluye el estado visual «sin ventana» que pide E4)
**Estado:** despachable en paralelo con R0. Su **cierre** depende de que R0 publique su lista de necesidades (§3, paso 4).

## Vínculos de trazabilidad

- Plantilla base: `docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md` (v1.2, **En revisión**)
- Spec que ejecuta: `docs/specs/2026-09-14-mod11-consola-ot-requisito-como-eje-design.md` v1.1 (Aprobado), §4.1, §4.2 y §7 (fila «Componente — checklist por requisito»)
- E4: `docs/specs/2026-09-14-mod11-origen-ot-design.md` (Aprobada) §3.5 y [ADR-091](../adrs/ADR-091-Origen-de-la-OT-Despacho-y-Agenda-Actos-Separados.md) (Aprobado) §D5
- Plan: `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` v1.2
- Encargo hermano en paralelo: `docs/prompts/PROMPT-MOD11-CONSOLA-OT-OLA2-R0-PROD-UX-v1.0.md`. Su salida es `docs/specs/2026-10-05-mod11-consola-ot-requisito-ux.md`
- Contrato de componente vigente que se **amplía**, no se supera: `docs/specs/2026-09-13-mod11-operaciones-tablas-operativas-contrato-componente.md` v1.1 (Aprobado)
- Estrella Polar en sus tres dominios ([ADR-056](../adrs/ADR-056-Integridad-Base-Normativa-Diseno.md) §3):
  - los tokens reales de `packages/ui/src/styles/globals.css`;
  - la spec de la Firma iWana;
  - `docs/identity/` y `docs/prototipo/`.

### Contratos de API que consumes — no los modifiques

| Contrato | Ruta y versión |
| --- | --- |
| Estado por requisito | `packages/shared/src/contracts/operations/execution-orders-completion.ts` v1 — `ExecutionOrderRequirementStatus` |
| OT de ejecución | `packages/shared/src/contracts/operations/execution-orders.ts` **v1.4**: `ExecutionOrderScheduleView.window` es nulable desde la v1.3 |

---

## 1. Objetivo exacto de la fase

Publicar el **contrato de componente** sobre el que `fe-platform` implementará R2-R4 y la parte visual de E4. El contrato cubre tokens, API y estados requeridos. Con este contrato y la UX spec de R0 se cierra **G2**.

**Lo que sí entra:**

1. **`RequirementChecklist`**: la lista de requisitos como índice de navegación. Cubre los estados por ítem (cumplido, pendiente con razón, sin acción en v1, degradado sin `requirements[]`), el modo lectura y el modo acción, la densidad compacta (las observaciones 3 y 5 son de **espacio**) y la semántica accesible.
2. **`RequirementActionSheet`**: la superficie que abre el acto que satisface un requisito. Admite una variante por `kind`: actividad, evidencia (que incluye la firma), consumo con picker de custodia y aceptación. Declara también su relación con `OperationalSidePeek`/`ModalLayer`: cómo conviven un sheet y el drawer que ya está abierto.
3. **Estado «sin ventana» (E4).** Un veredicto: o el contrato de tablas operativas v1.1 ya lo cubre con un estado existente, y basta citarlo, o necesita un estado nuevo, y entonces lo amplías a **v1.2** y lo versionas en ese mismo artefacto.
4. **El veredicto de consolidación anti-duplicación.** Antes de crear un componente, debes justificar por qué no alcanzan los primitives que ya existen en `@iwana/ui`: `SectionHeader`, `SectionAccordion`, `ProgressMeter`, `Badge`, `Alert`, `CheckboxCard`, `OperationalSidePeek`, `ModalLayer` y `Dialog`. **Nota:** R0 tiene prohibido usar `SectionAccordion` sobre las seis secciones actuales. Si lo propones dentro del checklist, justifica que no reintroduce ese patrón.

**Lo que no entra:**

- Implementar componentes: es trabajo de `fe-platform` en R2-R4.
- Decidir el flujo, el copy o qué se monta en cada momento: es de R0. Tú contratas lo que R0 necesita.
- Elegir una librería de lienzo para la firma. Si el contrato la presupone, la declaras como necesidad para G3, sin elegirla.
- Tocar tokens de marca. Un token de marca nuevo es escalación al CTO (perfil §5), no carril rápido.

## 2. Pasos

1. Lee los `SKILL.md` de la matriz (§5).
2. Inventaría cómo pinta hoy la consola los requisitos, la custodia y la evidencia: qué clases ad hoc usa y qué primitives reutiliza. Hoy la consola no tiene ningún componente colapsable.
3. Redacta el contrato de `RequirementChecklist` y `RequirementActionSheet` a partir de la spec §4.1 y §4.2.
4. **Sincroniza con R0.** Cuando `prod-ux` publique su lista de necesidades, contrasta tu contrato contra ella. Cualquier divergencia que no puedas resolver en el carril rápido se convierte en `[DESEMPATE]` hacia AI-EM-ARCH.
5. Emite el veredicto del estado «sin ventana» (§1, punto 3).

## 3. Restricciones no negociables

- Tokens: solo los que existen en `globals.css`. Si propones un token semántico nuevo que no sea de marca, debe derivar de los existentes y justificarse.
- Contraste AA verificado en modo claro y en modo oscuro.
- El estado del requisito no se transmite solo por color.
- Ninguna API de componente recibe la identidad ni el rol del usuario: recibe `allowedActions` o booleanos que ya vienen derivados.

## 4. Entregables

- **Contrato:** `docs/specs/2026-10-05-mod11-consola-ot-requisito-contrato-componente.md`, en estado «Borrador para G2».
- **Si aplica**, la ampliación v1.2 del contrato de tablas operativas, con changelog y nota de que la v1.1 queda superada en ese mismo acto.
- **Informe:** `docs/informes/INFORME-MOD11-CONSOLA-OT-OLA2-R1-DS-OWNER-v1.0.md`, con el veredicto de anti-duplicación y las necesidades declaradas para G3.

## 5. Matriz de skills

| Tipo | Skills |
| --- | --- |
| **Obligatorias** | `core-components`, `senior-ui-systems-designer`, `tailwind-patterns`, `iwana-identity-ui-review`, `wcag-audit-patterns` |
| **De apoyo** | `ui-ux-pro-max`, subordinada a las anteriores y a los tokens (perfil Parte II, regla 12). Solo para explorar la densidad del checklist |
| **Descartadas** | `frontend-dev-guidelines` (no se escribe código); `system-vocabulary-review` (el copy es de R0); `playwright-skill` (no hay superficie implementada) |

**Gate ejecutable:** ninguno en esta fase. `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs` se aplica en R2-R4 sobre el código.

## 6. Stop/go

**GO si y solo si:**

- Los dos componentes tienen tokens, API y estados completos, incluidos los degradados.
- El veredicto de anti-duplicación está escrito.
- El estado «sin ventana» está resuelto: citado o versionado.
- El contrato cubre cada necesidad que declaró R0.
- No queda ningún `[DESEMPATE]` abierto.

**NO-GO si:**

- Aparece un token de marca nuevo.
- Aparece un componente que duplica un primitive existente sin justificarlo.
- El contrato presupone datos que la API no publica.
