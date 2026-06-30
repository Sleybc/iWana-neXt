# PROMPT - MOD00 Configuracion Fase 05

**Version:** 1.0  
**Estado:** Aprobado  
**Fecha:** 2026-05-21  
**Modulo:** MOD00 Configuracion Control Plane  
**Fase:** 05 - Unificacion visible de sedes WFM  
**Modo activo:** Mixto  
**Generado por:** AI-EM-ARCH  
**Plantilla base:** docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md

---

## 1. Objetivo exacto de la fase

Completar la unificacion visible entre Organizacion y Operacion de campo para que el tenant administre una sola nocion de sede, mientras WFM conserva ownership exclusivo de reglas operativas.

### Lo que si entra

- Consolidar sedes empresariales como unica referencia visible en portal WFM.
- Completar contratos backend para que horarios por sede, overrides y blackouts no dependan funcionalmente de exponer `WfmOperatingSite` al usuario.
- Mantener compatibilidad aditiva con persistencia legacy.
- Ajustar pruebas Jest y Playwright.
- Actualizar informe vivo con evidencia.

### Lo que no entra

- Eliminar `WfmOperatingSite` fisicamente sin plan de retiro aprobado.
- Reescribir agenda o work orders historicos.
- Mover ownership de reglas WFM a MOD00.
- Crear accesos directos a tablas cross-module.

## 2. Artefactos de entrada obligatorios

- ADR MOD00: docs/adrs/ADR-040-Configuracion-Control-Plane-Organizacion-Acceso.md
- PRD MOD00: docs/prds/PRD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
- HLD MOD00: docs/hlds/HLD-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
- Informe vivo: docs/informes/INFORME-MOD00-CONFIGURACION-CONTROL-PLANE-v1.0.md
- Spec WFM: docs/specs/2026-05-15-mod09-wfm-operating-hours-design.md
- Plan Fase 05: docs/plans/2026-05-21-mod00-configuracion-fase-05-unificacion-sedes.md
- Checklist Fase 05: docs/quality/CHECKLIST-MOD00-CONFIGURACION-FASE-05-v1.0.md

## 3. Instrucciones para Sr. Dev Fullstack

1. Partir del estado actual del repo; no revertir la compatibilidad ya agregada en `dispatch-sites` ni la UX ya simplificada del portal.
2. Llevar los boundaries administrativos WFM a soporte nativo de `organizationSiteId` donde siga existiendo dependencia funcional de `operatingSiteId`.
3. Mantener cualquier fallback legacy encapsulado, invisible para el usuario y documentado.
4. Validar que Organizacion sigue siendo owner del dato maestro de sede y WFM solo de sus reglas operativas.
5. Actualizar tests focalizados antes de ampliar superficie.
6. Cerrar la fase con evidencia real en el informe vivo.

## 4. Restricciones no negociables

- No romper ADR-040 ni boundaries del modulith.
- No ocultar deuda funcional sin documentarla.
- No acceder directamente a tablas de Organizacion desde WFM o portal fuera de puertos/apis aprobados.
- No eliminar compatibilidad legacy si deja datos historicos inaccesibles.

## 5. Entregables tecnicos obligatorios

- Contratos backend WFM ajustados.
- Portal de Operacion de campo sin duplicidad visible de sedes.
- Tests Jest backend y portal actualizados.
- Playwright focalizado de field operations.

## 6. Entregables documentales obligatorios

- Informe MOD00 actualizado.
- Checklist Fase 05 cerrado.
- Registro explicito de deuda remanente si aun queda retiro final de legacy.

## 7. Criterios de aceptacion

- CA-CFG5-01: El usuario ve una sola nocion de sede entre Organizacion y Operacion de campo.
- CA-CFG5-02: Horario por sede funciona sobre sedes empresariales habilitadas para despacho.
- CA-CFG5-03: Overrides y blackouts siguen operando sin exponer CRUD visible de `WfmOperatingSite`.
- CA-CFG5-04: La compatibilidad legacy no bloquea la pantalla y queda acotada.
- CA-CFG5-05: Las pruebas focalizadas y E2E quedan en verde.

## 8. Criterio de stop/go

Detenerse si la solucion exige romper datos historicos, mover ownership de WFM a MOD00 o introducir lecturas cross-module no aprobadas. Documentar y escalar con `[ESCALACION AL CTO]`.

## 9. Criterio de salida de la fase

- Backend validado.
- Portal validado.
- E2E validado.
- Informe actualizado.
- Deuda remanente documentada.
