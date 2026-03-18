# PROMPT — MOD02 Frontend Fase 01

**Versión:** 1.0
**Estado:** En revisión
**Fecha:** 2026-03-16
**Modo activo:** Mixto

## Vínculos de trazabilidad

- Plantilla base: docs/prompts/TEMPLATE-PROMPT-EJECUCION-FASE-MODULO.md
- PRD funcional base: docs/prds/PRD-MOD02-DEFINICION-v1.0.md
- PRD frontend base: docs/prds/PRD-MOD02-FRONTEND-v1.0.md
- HLD backend base: docs/hlds/HLD-MOD02-ARQUITECTURA-v1.0.md
- HLD frontend base: docs/hlds/HLD-MOD02-FRONTEND-v1.0.md
- Plan de sprint base: docs/sprints/PLAN-MOD02-FRONTEND-SPRINT-01-v1.0.md
- Backlog técnico base: docs/plans/PLAN-MOD02-FRONTEND-BACKLOG-v1.0.md
- Informe relacionado: docs/informes/INFORME-MOD02-DEFINICION-v1.0.md

## Modulo

- Nombre: Auth Empresarial de Tenant Activo — Frontend
- Codigo: MOD02
- Fase: FRONTEND-FASE-01
- Version: 1.0
- Fecha: 2026-03-16
- Generado por: Engineering Manager
- Nombre de archivo destino: docs/prompts/PROMPT-MOD02-FRONTEND-FASE-01-v1.0.md

---

## 1. Objetivo exacto de la fase

- Resultado esperado: cerrar la implementación frontend tenant-aware de MOD02 en apps/portal y dejar explícitos los límites de apps/web como superficie de auth de plataforma.
- Lo que si entra:
  - consolidar en apps/portal los flujos login, change-password, forgot-password, reset-password, mfa/verify y mfa/setup,
  - alinear AuthProvider y api-client del portal con los cuatro estados de login definidos en el PRD frontend,
  - asegurar manejo correcto del token temporal `mfa-setup`,
  - completar o ajustar pruebas E2E del portal para primer acceso ADMIN y recuperación de contraseña,
  - corregir desvíos menores de UX, accesibilidad y seguridad detectados frente al PRD/HLD.
- Lo que no entra:
  - convertir apps/web en una superficie tenant-aware equivalente,
  - cambiar contratos backend fuera de ajustes estrictamente necesarios para consistencia ya aprobada,
  - introducir nuevo state manager, nuevo design system o cambio de stack,
  - resolver integraciones de correo fuera de mocks, adapters o pruebas ya aprobadas.

## 2. Artefactos de entrada obligatorios

- PRD del modulo: docs/prds/PRD-MOD02-DEFINICION-v1.0.md
- HLD del modulo: docs/hlds/HLD-MOD02-ARQUITECTURA-v1.0.md
- ADRs aplicables: ADR-019, ADR-022, ADR-023, ADR-025, ADR-026
- Sprint plan aplicable: docs/sprints/PLAN-MOD02-FRONTEND-SPRINT-01-v1.0.md
- Prompt arquitectonico origen: docs/hlds/HLD-MOD02-FRONTEND-v1.0.md
- Backlog técnico aplicable: docs/plans/PLAN-MOD02-FRONTEND-BACKLOG-v1.0.md
- Artefactos faltantes detectados:
  - decisión formal si se desea ampliar alcance tenant-aware a apps/web.

## 3. Instrucciones para Sr. Dev Fullstack

1. Revisar primero los documentos base y validar que la implementación se limite a apps/portal como superficie canónica tenant-aware.
2. Tomar el sprint plan y el backlog técnico como orden operativo de ejecución; si encuentras contradicción con PRD/HLD, prevalecen PRD y HLD y debes documentar el desvío.
3. Verificar en apps/portal la consistencia entre LoginForm, AuthProvider, api-client y las rutas /auth/* del flujo completo.
4. Ajustar o completar la navegación para que los estados `authenticated`, `mfa_required`, `password_reset_required` y `mfa_setup_required` redirijan exactamente al siguiente paso definido.
5. Validar que el token `iwana.portal.mfa-setup-token` no autentique la app, se limpie al completar el flujo y también ante expiración o error relevante.
6. Ejecutar el backlog técnico por prioridad, empezando por BT-01 a BT-05 antes de cerrar tareas auxiliares o de pulido.
7. Corregir cualquier desvío de accesibilidad en labels, feedback de error, navegación por teclado y estados aria-live de formularios críticos.
8. Ejecutar o completar pruebas E2E del portal para:
   - primer acceso ADMIN,
   - recuperación de contraseña,
   - expiración o reinicio del flujo MFA setup si hay cobertura viable.
9. No introducir paridad forzada en apps/web. Si encuentras presión funcional para hacerlo, detener la ejecución y documentar la necesidad como decisión de alcance.
10. Actualizar documentación si algún detalle de implementación aprobado requiere ajuste menor y dejar evidencia en el informe relacionado.

## 4. Restricciones no negociables

- No romper boundaries del modulith ni mezclar auth de tenant con auth de plataforma.
- No mover lógica sensible de tenancy al cliente más allá del tenant slug controlado.
- No usar credenciales, PII real, tokens ni secretos en código, logs, tests o documentación.
- No omitir pruebas E2E y documentación de cierre de fase.
- No introducir cambios de stack, librerías o patrones de estado sin necesidad documentada.

## 5. Entregables tecnicos obligatorios

- Codigo frontend en apps/portal alineado al PRD y HLD frontend.
- Ajustes puntuales en packages/shared o packages/ui solo si son necesarios y compatibles con el boundary actual.
- Tests unitarios o de componentes para lógica crítica si hay desvíos no cubiertos hoy.
- Tests E2E Playwright del portal actualizados o validados.
- Ajustes de contratos frontend si el código actual no refleja fielmente el backend ya aprobado.

## 6. Entregables documentales obligatorios

- Actualizacion del informe vigente en docs/informes/INFORME-MOD02-DEFINICION-v1.0.md o del informe de sprint correspondiente si ya existe uno activo para ejecución frontend.
- Evidencia de calidad en docs/quality/ si la fase genera hallazgos o checklist específico.
- Actualización de PRD/HLD solo si se detecta desviación aprobada y necesaria.
- Decision stop/go documentada si aparece presión para ampliar MOD02 a apps/web tenant-aware.

## 7. Criterios de aceptacion

- CA-01: apps/portal implementa sin flujos rotos login, change-password, forgot-password, reset-password, mfa/verify y mfa/setup.
- CA-02: AuthProvider del portal y su api-client reflejan correctamente los cuatro estados de login definidos en docs/prds/PRD-MOD02-FRONTEND-v1.0.md.
- CA-03: el token temporal de MFA setup se persiste por separado, no construye sesión autenticada y se elimina tras éxito, logout o expiración.
- CA-04: el flujo de primer acceso ADMIN impide acceso al dashboard antes de completar cambio de contraseña y setup MFA.
- CA-05: las pruebas E2E críticas del portal quedan implementadas o verificadas con evidencia.

## 8. Criterio de stop/go

- Detenerse inmediatamente si:
  - se requiere convertir apps/web en auth tenant-aware,
  - el backend necesario difiere materialmente del contrato ya aprobado,
  - aparece una excepción de seguridad o tenancy no contemplada.
- Documentar causa en: docs/informes/INFORME-MOD02-DEFINICION-v1.0.md o informe de sprint activo.
- Escalar a: CTO + Architect governance si el cambio afecta boundary o alcance.
- Recomendacion esperada: mantener apps/portal como implementación canónica o aprobar explícitamente una ampliación de alcance.

## 9. Criterio de salida de la fase

- Backend validado: no requiere cambios estructurales nuevos para soportar el frontend objetivo.
- Frontend validado: apps/portal alineado al PRD/HLD y sin rutas críticas rotas.
- Base de datos validada: no aplica salvo dependencia contractual del backend ya aprobada.
- Tests en verde: suites relevantes del portal ejecutadas o listas para ejecución controlada.
- Documentacion archivada: informe actualizado y trazabilidad completa entre PRD, HLD y prompt.