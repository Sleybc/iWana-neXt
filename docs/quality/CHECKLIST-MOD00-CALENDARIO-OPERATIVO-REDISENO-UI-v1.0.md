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
- [ ] Playwright `portal-settings-calendar.spec.ts` ejecutado en esta iteracion — pendiente de stack/autenticacion.
- [x] El E2E del calendario esta alineado a la nueva jerarquia observable mediante `calendar-step-1..4`.

## 8. Cierre documental

- [x] Spec de rediseño actualizada con referencias a plan, prompt y checklist.
- [x] Informe vivo MOD00 actualizado con esta iteracion.
- [x] Checklist cerrada con evidencia real o bloqueos explicitos.
- [x] No se alteraron retroactivamente artefactos cerrados de Fase 06.

---

## 9. Evidencia ejecutada

- Typecheck portal en verde.
- Jest focalizado de calendario en verde; la ejecucion final cubre 9 suites y 114 pruebas.
- La spec E2E usa `calendar-step-1`, `calendar-step-2`, `calendar-step-3` y `calendar-step-4`; la ejecución focalizada pasó 9/9 pruebas en Chromium.
- La cobertura E2E usa `calendar-step-1`, `calendar-step-2`, `calendar-step-3` y `calendar-step-4` sin una card adicional de resumen.
- El shell usa dos carriles independientes: `calendar-lane-1-2` para horarios habituales y `calendar-lane-3-4` para cambios por fecha; en mobile se apilan completos en orden `1→2→3→4`.
- La expansión de un panel solo desplaza el siguiente panel de su propio carril; no se sincronizan alturas entre columnas.
- El E2E desktop valida la expansión del paso 3 sin desplazar el carril izquierdo; el E2E mobile valida el flujo vertical y los formularios cerrados.
- Los listados de excepciones y eventualidades tienen una representacion movil apilada y una tabla desktop separadas por breakpoint.
- `randomAccess=false` queda bloqueado por falta de cursor en el contrato API; no se declara cierre ni se inventa «Cargar mas».

## 10. Cierre

Checklist aprobada con un bloqueo abierto de contrato: la variante cursor de eventualidades requiere soporte API/backend explicito.
