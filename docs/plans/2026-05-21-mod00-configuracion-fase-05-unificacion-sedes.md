# MOD00 Configuracion Fase 05 Unificacion visible de sedes WFM

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidar una sola referencia visible de sedes entre Organizacion y Operacion de campo, retirando la exposicion funcional de `WfmOperatingSite` en portal y llevando los boundaries WFM a compatibilidad nativa con `organizationSiteId`.

**Architecture:** `OrganizationSite` sigue siendo el dato maestro visible aprobado por ADR-040. WFM conserva ownership de horarios operativos, cierres especiales, agenda y despacho, pero consume sedes por contratos tipados y sin UX duplicada.

> **Actualizacion 2026-05-22:** ADR-041 retira Excepciones por tecnico del producto WFM. Este plan ya no debe crear ni migrar contratos visibles de excepciones por tecnico. El trabajo de unificacion de sedes aplica a horarios por sede y cierres especiales.

**Tech Stack:** NestJS, OpenAPI, Next.js App Router, TypeScript strict, Jest, Playwright, pnpm/Turborepo.

---

## Source Artifacts

- ADR: `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`
- PRD: `docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- HLD: `docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- Informe vivo: `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md`
- Spec WFM: `docs/specs/2026-05-15-mod09-wfm-operating-hours-design.md`
- Prompt: `docs/prompts/PROMPT-MOD00-CONFIGURACION-FASE-05-v1.0.md`
- Checklist: `docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-05-v1.0.md`

## Scope

### Build in Fase 05

- Mantener una sola lista visible de sedes empresariales en portal para Operacion de campo.
- Hacer nativos los contratos WFM administrativos sobre `organizationSiteId` para horario por sede y cierres especiales.
- Reducir el uso de `WfmOperatingSite` a compatibilidad interna o migracion controlada.
- Cubrir la transicion con pruebas backend, portal y E2E.
- Actualizar informe vivo con evidencia y deuda remanente.

### Do not build in Fase 05

- Eliminar tablas legacy sin plan de retiro aprobado.
- Romper agenda historica o referencias persistidas a `operatingSiteId`.
- Mover ownership de reglas operativas desde WFM hacia MOD00.
- Crear lecturas cross-module no aprobadas.

## Task 1: Contracts backend nativos

- [ ] Agregar soporte nativo a `organizationSiteId` en horarios por sede y blackouts.
- [ ] Mantener compatibilidad aditiva con `operatingSiteId` mientras existan datos legacy.
- [ ] Exponer respuestas suficientes para que portal deje de depender de `operatingSites.list()` como fallback.
- [ ] Validar con Jest/HTTP tests focalizados de WFM.

## Task 2: Portal sin UX duplicada

- [ ] Mantener sedes empresariales como unica referencia visible en `WfmOperatingHoursManager`.
- [ ] Retirar fallback visual o textual que siga insinuando “sedes operativas” como concepto paralelo.
- [ ] Mostrar estados claros para sedes sin bridge operativo mientras dure la migracion.
- [ ] Validar con Jest focalizado del manager y pruebas de settings portal.

## Task 3: E2E y endurecimiento

- [ ] Cubrir Playwright sobre `/dashboard/settings/field-operations` con sedes empresariales visibles y sin CRUD paralelo legacy.
- [ ] Verificar que la organizacion sigue administrando sedes y WFM solo reglas operativas.
- [ ] Verificar 403 y degradacion parcial donde aplique.

## Task 4: Cierre documental

- [ ] Actualizar `docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md` con evidencia Fase 05.
- [ ] Actualizar spec WFM si cambia contrato aprobado.
- [ ] Registrar deuda remanente para retiro final de `WfmOperatingSite` si aun queda pendiente.

## Self-review checklist

- Existe una sola referencia visible de sedes para el usuario.
- WFM conserva ownership de reglas, no del dato maestro de sede.
- No hay acceso directo a tablas de Organizacion desde portal.
- Los contratos son aditivos y tenant-safe.
- El fallback legacy queda encapsulado y documentado.
