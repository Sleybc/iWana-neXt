# INFORME - MOD10 Service Assurance / Mesa de Ayuda Definicion

**Version:** 1.0  
**Estado:** En revisión  
**Fecha:** 2026-05-09  
**Modo activo:** Mixto  
**Autor:** AI-EM-ARCH  
**Clasificacion:** Confidencial - Uso Interno  

---

## 1. Objetivo

Consolidar el paquete documental necesario para que Sr. Dev Fullstack pueda ejecutar MOD10 Service Assurance / Mesa de Ayuda Fase 01 una vez aprobado el nuevo boundary por CTO.

---

## 2. Decisiones tomadas

| Decision | Estado | Referencia |
| --- | --- | --- |
| Adoptar `AssuranceModule` como bounded context de tickets, SLA y PQR | Aprobado | docs/adrs/ADR-038-Bounded-Context-Service-Assurance.md |
| Usar “Mesa de ayuda” como nombre visible en portal | Propuesto | docs/prds/PRD-MOD10-SERVICE-ASSURANCE-v1.0.md |
| Cubrir tickets mixtos cliente + internos en Fase 01 | En revisión | docs/specs/SPEC-MOD10-SERVICE-ASSURANCE-DISENO-v1.0.md |
| WFM conserva ownership de Work Orders | Alineado a ADR aprobado | docs/adrs/ADR-037-Bounded-Context-Programacion-WFM.md |
| Usar `MOD10` para evitar colisión con `MOD07 Taxation` y `MOD09 WFM` | Requiere aceptación CTO | docs/adrs/ADR-038-Bounded-Context-Service-Assurance.md |

---

## 3. Artefactos creados

| Artefacto | Ruta | Estado |
| --- | --- | --- |
| PRD | docs/prds/PRD-MOD10-SERVICE-ASSURANCE-v1.0.md | En revisión |
| Spec de diseño | docs/specs/SPEC-MOD10-SERVICE-ASSURANCE-DISENO-v1.0.md | En revisión |
| HLD | docs/hlds/HLD-MOD10-SERVICE-ASSURANCE-v1.0.md | En revisión |
| ADR | docs/adrs/ADR-038-Bounded-Context-Service-Assurance.md | Aprobado |
| Plan de fase | docs/plans/PLAN-MOD10-SERVICE-ASSURANCE-FASE-01-v1.0.md | En revisión |
| Prompt de ejecución | docs/prompts/PROMPT-MOD10-SERVICE-ASSURANCE-FASE-01-v1.0.md | En revisión |

---

## 4. Alcance definido para Fase 01

- Tickets externos e internos.
- Requester y subject tipados.
- Estados operativos y transiciones auditables.
- Comentarios y timeline append-only.
- SLA simple de primera respuesta y resolución.
- PQR CRC con timestamps y deadlines.
- Dashboard operativo.
- UI portal `/dashboard/assurance`.
- Solicitud de trabajo de campo hacia WFM por evento o puerto.

---

## 5. Bloqueantes y gates

| Bloqueante | Severidad | Acción requerida |
| --- | --- | --- |
| ADR-038 no aprobado | Resuelto | ADR aprobado y ejecución controlada habilitada |
| Numeración `MOD10` por colisión documental | Resuelto | CTO autorizó ejecución controlada con la numeración actual en ADR-038 |
| Contrato real Assurance-WFM no implementado | Media | Fullstack puede iniciar con puerto stub solo si queda documentado |

---

## 6. Riesgos residuales

- PQR CRC puede requerir verificación con fuente oficial si cambia la interpretación regulatoria.
- Tickets pueden contener datos sensibles en descripción; se requiere disciplina de logging y UI.
- La UI puede crecer demasiado si se intenta implementar NMS, WhatsApp o IA en Fase 01.

---

## 7. Recomendacion EM-ARCH

[ESCALACION AL CTO]

**Prioridad:** Alta  
**Contexto:** MOD10 introduce un nuevo bounded context (`AssuranceModule`) y resuelve tickets mixtos cliente + internos, SLA y PQR.  
**Opciones evaluadas:** CRM, WFM, HelpDesk genérico, Assurance como bounded context propio.  
**Recomendación:** Aprobar ADR-038 y ejecutar Fase 01 con `MOD10-SERVICE-ASSURANCE`, manteniendo WFM como owner de Work Orders.  
**Decision requerida antes de:** iniciar implementación productiva por Sr. Dev Fullstack.

---

## 8. Estado de salida

Paquete documental listo y ejecutado bajo autorización documentada. La continuidad de Fase 01 ya no depende de aprobar el boundary, sino de cerrar la evidencia funcional restante.

---

## 9. Avance portal Fase 01

### Cambios ejecutados

- Se implementó la ruta `apps/portal/src/app/dashboard/assurance/page.tsx` para exponer la vista de **Mesa de ayuda** en el portal empresarial.
- Se agregó `assuranceApi` a `apps/portal/src/lib/api-client.ts` con contratos frontend para tickets, comentarios, timeline, SLA y dashboard summary.
- Se creó la carpeta `apps/portal/src/components/assurance/` con vista operativa, formulario de creación, tabla densa `align-middle`, drawer de detalle y helpers de labels/UI.
- Se añadió la entrada de navegación `Mesa de ayuda` en `apps/portal/src/components/layout/Sidebar.tsx`.
- Se incorporaron pruebas frontend para labels, formulario base y navegación del sidebar.

### Verificación ejecutada

- `pnpm --filter @iwana/portal lint`
- `pnpm --filter @iwana/portal typecheck`
- `pnpm --filter @iwana/portal test -- --runInBand src/components/assurance/assurance-labels.spec.ts src/components/assurance/AssuranceCreateTicketForm.spec.tsx src/components/layout/Sidebar.spec.tsx`
- `pnpm exec playwright test --config e2e/playwright.portal.local.config.ts e2e/tests/portal-assurance.spec.ts`

### Riesgos residuales del frontend

- La acción **Vincular work order** usa entrada manual de UUID porque el alcance pedido no incluyó selector enriquecido desde WFM; si UX requiere catálogo visual, debe planificarse aparte.
- La tabla usa búsqueda local por asunto/número/referencias porque el backend expuesto en Fase 01 no publica filtro textual dedicado.
- Las políticas SLA se consumen solo para crear tickets; la edición de políticas no se abrió en esta entrega para evitar expandir alcance fuera del portal pedido.
