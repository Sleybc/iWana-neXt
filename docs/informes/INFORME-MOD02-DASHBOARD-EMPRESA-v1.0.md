# INFORME — Definición Dashboard Empresa MOD02

**Versión:** 1.0
**Fecha:** 2026-03-17
**Estado:** En revisión
**Modo activo:** Architect
**Convención documental:** INFORME-MOD02-DASHBOARD-EMPRESA-v1.0.md

## Vínculos de trazabilidad

- PRD generado: docs/prds/PRD-MOD02-DASHBOARD-EMPRESA-v1.0.md
- HLD generado: docs/hlds/HLD-MOD02-DASHBOARD-EMPRESA-v1.0.md
- Backlog generado: docs/plans/PLAN-MOD02-DASHBOARD-EMPRESA-BACKLOG-v1.0.md
- Sprint plan generado: docs/sprints/PLAN-MOD02-DASHBOARD-EMPRESA-SPRINT-01-v1.0.md
- Prompt de ejecución generado: docs/prompts/PROMPT-MOD02-DASHBOARD-EMPRESA-FASE-01-v1.0.md
- PRD base: docs/prds/PRD-MOD02-DEFINICION-v1.0.md
- HLD backend relacionado: docs/hlds/HLD-MOD02-ARQUITECTURA-v1.0.md
- HLD frontend relacionado: docs/hlds/HLD-MOD02-FRONTEND-v1.0.md
- Informe de referencia: docs/informes/INFORME-MOD02-SPRINT-01-v1.0.md
- ADRs aplicables: ADR-018, ADR-019, ADR-022, ADR-023

---

## 1. Resumen ejecutivo

- Objetivo de la ejecución: formalizar el PRD del dashboard empresarial para la empresa ya creada y autenticada en `apps/portal`.
- Motivo: el flujo actual de login tenant-aware termina en un dashboard de suscriptor estático y no en una consola de administración del tenant.
- Resultado inicial: se emitió un PRD específico que define alcance, boundary, requerimientos funcionales, criterios de aceptación y dependencias para reemplazar el dashboard incorrecto.
- Resultado complementario: se emitió el HLD del dashboard empresarial con decisiones de arquitectura, contratos self-service, reglas de rol y estrategia de implementación.
- Resultado complementario 2: se emitió el backlog técnico ejecutable por capas, archivos y prioridades para llevar el PRD a implementación.
- Resultado complementario 3: se emitió el sprint plan de la primera fase de ejecución técnica.
- Resultado complementario 4: se emitió el prompt de ejecución para implementar el alcance definido sin romper el boundary tenant/plataforma.
- Estado: listo para ejecución técnica controlada.

---

## 2. Evidencia analizada

- `apps/portal/src/app/dashboard/page.tsx` contiene widgets de suscriptor con datos estáticos de plan, conexión y facturación.
- `apps/portal/src/components/auth/LoginForm.tsx` redirige a `/dashboard` tras login exitoso.
- `apps/portal/src/components/auth/AuthProvider.tsx` ya soporta el flujo tenant-aware y roles operativos posteriores a MFA.
- `apps/web/src/components/dashboard/DashboardClient.tsx` corresponde a dashboard de plataforma y gestión global de tenants.
- `docs/informes/INFORME-MOD02-SPRINT-01-v1.0.md` deja como deuda abierta el dashboard para roles operativos del tenant.

Conclusión del análisis:

El hueco no está en autenticación sino en la superficie protegida posterior al login dentro de `apps/portal`.

---

## 3. Decisiones documentales tomadas

- Se mantuvo el trabajo dentro de MOD02 para no inventar un módulo nuevo sin cierre formal del actual.
- Se emitió un PRD específico derivado de MOD02 y no un ADR, porque no cambia stack, tenancy ni boundary aprobado.
- Se definió `apps/portal` como consola empresarial tenant-aware.
- Se preservó `apps/web` como consola de plataforma.
- Se dejó explícito en HLD que el portal no debe consumir endpoints globales `tenants/:id` y que requiere contratos self-service del tenant autenticado.
- Se definió en backlog que la actividad reciente del MVP queda restringida a `ADMIN` mientras el backend mantenga esa política de acceso.

---

## 4. Riesgos identificados

- Riesgo 1: intentar resolver el dashboard empresarial consumiendo endpoints globales de tenants desde `apps/web` o contratos equivalentes.
- Riesgo 2: mantener copy, navegación y widgets de suscriptor dentro de la superficie empresarial.
- Riesgo 3: introducir métricas ficticias mientras aún no existen módulos fuente reales.
- Riesgo 4: mantener rutas visibles en el shell del portal que hoy no existen como páginas protegidas reales.
- Riesgo 5: ampliar permisos de auditoría a roles no `ADMIN` sin decisión de seguridad asociada.

---

## 5. Artefactos emitidos y foco de ejecución

- PRD emitido: alcance funcional, boundary y criterios de aceptación.
- HLD emitido: arquitectura de componentes, contratos, rutas, shell, rol y seguridad.
- Backlog emitido: secuencia técnica ejecutable con prioridades P0-P3.
- Sprint plan emitido: asignaciones, riesgos, blockers y Definition of Done del sprint.
- Prompt emitido: instrucciones operativas para implementación de la fase.

Foco recomendado de implementación:

- reemplazo del dashboard actual,
- creación de contratos self-service del tenant,
- corrección del shell y de las rutas visibles,
- pruebas del flujo login → dashboard empresa.

---

## 6. Decisión de salida

- Puede pasar a siguiente fase: Sí.
- Requiere correcciones previas: No en documentación; sí diseño e implementación de endpoints self-service del tenant antes de cerrar frontend final.
- Aprobadores pendientes: CTO / Architect governance.
