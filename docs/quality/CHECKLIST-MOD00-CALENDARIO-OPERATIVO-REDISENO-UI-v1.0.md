# CHECKLIST - MOD00 Calendario operativo rediseño UI

**Version:** 1.1  
**Estado:** Aprobado  
**Fecha:** 2026-05-30  
**Modulo:** MOD00 Configuracion Control Plane  
**Fase:** Refinamiento UI/UX posterior a Fase 06  
**ADR rector:** `docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md`  
**ADR relacionado:** `docs/adrs/ADR-042-Calendario-Operativo-Jornadas.md`  
**Spec:** `docs/specs/2026-05-29-mod00-calendario-operativo-jornadas-redesign-design.md`  
**Plan:** `docs/plans/2026-05-29-mod00-refinamiento-calendario-operativo-jornadas.md`  
**Plan complementario:** `docs/plans/2026-05-30-mod00-calendario-operativo-distribucion-contenedores-ui.md`  
**Prompt:** `docs/prompts/PROMPT-MOD00-CALENDARIO-OPERATIVO-REDISENO-UI-v1.0.md`

---

## 1. Stop/go inicial

- [x] El equipo leyó la spec de rediseño completa antes de editar componentes.
- [x] Se confirmó que el alcance es solo UI/UX y no reabre ownership ni endpoints.
- [x] Se confirmó que Fase 06 cerrada queda como antecedente historico y no se reabre su checklist.
- [x] Si `WfmOperatingHoursManager` requiere cambios profundos, existe decision explicita para separar ese slice.

## 2. Jerarquia de la pantalla

- [x] `CalendarSettingsClient` presenta el orden visual aprobado: base, sede, fechas especiales, visitas, cambios puntuales.
- [x] El header comunica mejor el objetivo de la pantalla y el estado operativo general.
- [x] El shell separa con claridad los horarios estructurales de las capas operativas complementarias.
- [x] Cada bloque tiene una descripcion corta y clara.
- [x] Las acciones primarias son visibles y las secundarias no compiten con ellas.

## 3. Editor semanal responsive

- [x] `BusinessHoursWeekEditor` mantiene su contrato actual de datos.
- [x] Desktop conserva lectura tabular clara.
- [x] Mobile ofrece una lectura usable sin depender de scroll horizontal como solucion principal.
- [x] El modo read-only sigue funcionando.
- [x] Los `data-testid` afectados quedaron actualizados en tests.

## 4. Excepciones y cambios puntuales

- [x] El formulario de excepciones no domina el primer viewport.
- [x] El formulario de eventualidades no domina el primer viewport.
- [x] Los listados se entienden mejor que en la version anterior.
- [x] Los badges, estados y feedback son consistentes entre paneles.
- [x] No se introducen terminos de ausencias personales ni lenguaje tecnico interno.

## 5. WFM y boundaries

- [x] El bloque WFM deja claro que aplica a programacion de visitas.
- [x] El refinamiento no cambia ownership ni contratos de WFM.
- [x] La degradacion de sedes de visitas no bloquea la gestion global de cierres WFM.
- [x] No se mezcla horario base empresarial con eventualidades o ausencias personales.
- [x] Si hubo deuda residual en WFM, esta documentada en el informe vivo.

## 6. Accesibilidad y responsive

- [x] Foco visible en botones, tabs, toggles e inputs.
- [x] Contraste legible en badges, alerts y superficies suaves.
- [x] Navegacion por teclado funcional en acciones principales.
- [x] La pantalla es operable en desktop y mobile.

## 7. Validacion tecnica

- [x] `pnpm --filter @iwana/portal typecheck` en verde.
- [x] Jest focalizado de portal para calendario en verde.
- [x] Playwright `portal-settings-calendar.spec.ts` en verde.
- [x] El E2E del calendario valida la nueva jerarquia observable del shell.

## 8. Cierre documental

- [x] Spec de rediseño actualizada con referencias a plan, prompt y checklist.
- [x] Informe vivo MOD00 actualizado con esta iteracion.
- [x] Checklist cerrada con evidencia real o bloqueos explicitos.
- [x] No se alteraron retroactivamente artefactos cerrados de Fase 06.

---

## 9. Evidencia ejecutada

- Typecheck portal en verde.
- Jest focalizado de calendario en verde con 7 suites y 60 pruebas.
- Playwright del calendario en verde con 8 de 8 pruebas usando `e2e/tests/portal-settings-calendar.spec.ts`.
- La spec E2E valida `calendar-operational-status`, `calendar-shell-primary` y `calendar-shell-secondary`.

## 10. Cierre

Checklist cerrada sin bloqueos abiertos dentro del alcance de refinamiento UI/UX posterior a Fase 06.
