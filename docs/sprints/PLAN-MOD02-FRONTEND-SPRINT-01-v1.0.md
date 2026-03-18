# Sprint 1 — Módulo 2 Frontend: Auth Empresarial de Tenant Activo

## iWana neXt Platform

**Versión:** 1.0
**Estado:** En revisión
**Fecha:** 2026-03-16
**Modo activo:** Mixto

**Objetivo del Sprint:** cerrar la superficie frontend tenant-aware de MOD02 en apps/portal, dejando el flujo completo de primer acceso ADMIN, recuperación de contraseña, MFA verify y MFA setup alineados al backend ya aprobado, sin mezclar auth de tenant con auth de plataforma.

**Regla de interpretación:** este sprint cubre la primera fase de ejecución frontend de MOD02. No se considera cierre del módulo ni expansión automática a apps/web.

**Duración propuesta:** 1 semana hábil | **Inicio propuesto:** 2026-03-16 | **Fin propuesto:** 2026-03-20
**Fase:** FRONTEND-SPRINT-01
**PRD funcional de referencia:** docs/prds/PRD-MOD02-DEFINICION-v1.0.md
**PRD frontend de referencia:** docs/prds/PRD-MOD02-FRONTEND-v1.0.md
**HLD backend de referencia:** docs/hlds/HLD-MOD02-ARQUITECTURA-v1.0.md
**HLD frontend de referencia:** docs/hlds/HLD-MOD02-FRONTEND-v1.0.md
**Prompt de ejecución:** docs/prompts/PROMPT-MOD02-FRONTEND-FASE-01-v1.0.md

---

## Objetivo de salida

Al cerrar este sprint debe existir una implementación consistente en apps/portal para:

- login tenant-aware,
- change-password obligatorio,
- forgot-password,
- reset-password,
- MFA verify,
- MFA setup con token de alcance limitado,
- redirecciones seguras por estado de autenticación,
- evidencia E2E del flujo de primer acceso ADMIN y recuperación de contraseña.

---

## Entregables documentales obligatorios del Sprint

| Artefacto | Responsable | Carpeta destino |
| --- | --- | --- |
| Informe de ejecución frontend MOD02 | Sr. Dev Fullstack + EM | docs/informes/ |
| Evidencia QA / Playwright | Sr. Dev QA/Testing | docs/quality/ |
| Actualización del informe de definición, si aplica | EM + Architect | docs/informes/ |
| Decisión stop/go, si aparece presión para ampliar apps/web | EM + Architect | docs/quality/ o docs/adrs/ |

---

## Asignaciones del Sprint

### Sr. Dev Fullstack

| # | Tarea | Referencia | Criterio de Done |
| --- | --- | --- | --- |
| F1 | Consolidar AuthProvider del portal con los cuatro estados de login definidos para MOD02 | PRD FE §4.1 | `authenticated`, `mfa_required`, `password_reset_required` y `mfa_setup_required` operan sin estados ambiguos |
| F2 | Revisar y ajustar `apps/portal/src/lib/api-client.ts` para separar correctamente access token, token temporal MFA y contexto de MFA pending login | HLD FE §3 y §5 | Persistencia local alineada al HLD y sin autenticación implícita con token limitado |
| F3 | Validar `apps/portal/src/components/auth/LoginForm.tsx` y su routing posterior al login | PRD FE §4.1, §8 | Cada estado redirige a la pantalla correcta sin loops |
| F4 | Completar o corregir `apps/portal/src/app/auth/change-password/page.tsx` para el flujo obligatorio de primer acceso | PRD FE §4.3 | Cambio de contraseña exitoso y retorno controlado al flujo definido |
| F5 | Completar o corregir `apps/portal/src/components/auth/MfaVerifyForm.tsx` para MFA login estándar | PRD FE §4.1 | Login con TOTP funcional y sin sesiones huérfanas |
| F6 | Completar o corregir `apps/portal/src/components/auth/MfaSetupForm.tsx` y `apps/portal/src/app/auth/mfa/setup/page.tsx` para MFA setup con token limitado | HLD FE §3.3 | QR, verify y limpieza del token temporal funcionan de punta a punta |
| F7 | Revisar y cerrar flujos de `apps/portal/src/app/auth/forgot-password/page.tsx` y `apps/portal/src/app/auth/reset-password/page.tsx` | PRD FE §4.3 | UX neutra, accesible y alineada al backend |
| F8 | Verificar accesibilidad WCAG 2.2 AA mínima en formularios críticos del portal | PRD FE §5 | Labels, aria-live, foco y feedback accesibles presentes |
| F9 | Corregir desvíos menores de consistencia visual o de mensajes de error en auth del portal | PRD FE §4.3 | Catálogo de mensajes no filtrante y coherente |
| F10 | Actualizar el informe documental activo con resultados, gaps o desvíos | Prompt de fase §6 | Informe actualizado con evidencia y riesgos residuales |

### Sr. Dev QA/Testing

| # | Tarea | Referencia | Criterio de Done |
| --- | --- | --- | --- |
| Q1 | Validar E2E del flujo de primer acceso ADMIN en portal | PRD FE §8, CA-03, CA-04 | Suite pasa o queda documentado el bloqueo real |
| Q2 | Validar E2E de forgot-password y reset-password en portal | PRD FE §8, CA-05 | Suite pasa o deja evidencia del gap |
| Q3 | Verificar que el token temporal MFA no deja sesión autenticada completa | HLD FE §5 | Evidencia funcional o test automatizado |
| Q4 | Validar ausencia de loops de navegación en login, change-password y MFA setup | HLD FE §3 | Rutas críticas navegables de forma determinística |
| Q5 | Emitir evidencia en docs/quality/ con resultados de Playwright y hallazgos abiertos | DoD sprint | Evidencia archivada y referenciada en informe |

### Engineering Manager / Architect

| # | Tarea | Referencia | Criterio de Done |
| --- | --- | --- | --- |
| M1 | Validar que el sprint no desborde el boundary hacia auth de plataforma en apps/web | HLD FE §1 | Cualquier intento de ampliación queda bloqueado o escalado |
| M2 | Revisar consistencia final entre PRD, HLD, prompt e implementación | Gobernanza docs | Trazabilidad completa y sin contradicciones |
| M3 | Consolidar decisión stop/go si emerge presión para paridad tenant-aware en apps/web | PRD FE §9 | Decisión formal documentada |

---

## Dependencias y Blockers

| # | Descripción | Propietario | Fecha límite | Acción si no resuelto |
| --- | --- | --- | --- | --- |
| B1 | Backend MOD02 debe mantenerse estable en contratos `/auth/*` consumidos por portal | Backend | Día 1 | Congelar cambios o documentar desviación |
| B2 | Playwright y configuración E2E del portal disponibles para validación | QA | Día 2 | Ejecutar con mocks o dejar evidencia del bloqueo |
| B3 | Definición de alcance: apps/web no entra como superficie tenant-aware en este sprint | Architect | Día 1 | Escalar si el alcance cambia |
| B4 | Integración de correo puede seguir mockeada o simulada si no existe entorno real | QA + Backend | Día 3 | Documentar limitación end-to-end |

---

## Riesgos del Sprint

| ID | Riesgo | Impacto | Tratamiento |
| --- | --- | --- | --- |
| R1 | Se intenta reutilizar apps/web como auth tenant-aware sin aprobación | Alto | Bloquear cambio y escalar |
| R2 | Token MFA setup queda vivo tras éxito o error | Crítico | Prueba explícita y limpieza obligatoria |
| R3 | Change-password rompe la secuencia del primer acceso | Alto | Verificar redirect chain completa |
| R4 | Falta cobertura E2E suficiente para aceptar el cierre del sprint | Alto | Priorizar Q1 y Q2 como gates |

---

## Definition of Done del Sprint

☐ apps/portal implementa y navega correctamente los seis flujos auth definidos en MOD02 frontend
☐ AuthProvider y api-client del portal reflejan los cuatro estados de login sin ambigüedad
☐ `iwana.portal.mfa-setup-token` se limpia en éxito, logout y expiración
☐ El ADMIN de primer acceso no puede acceder al dashboard antes de change-password + MFA setup
☐ Forgot-password y reset-password muestran UX neutra y consistente con seguridad
☐ E2E críticos del portal existen y están ejecutados o documentados con bloqueo verificable
☐ No se introdujo mezcla entre auth de tenant y auth de plataforma
☐ Informe de sprint o informe activo actualizado en docs/informes/
☐ Evidencia QA archivada en docs/quality/
☐ Si hubo desviación de alcance, existe decisión stop/go documentada

---

_Plan de Sprint generado por: AI-EM-ARCH — iWana neXt Platform_
_Fecha: 2026-03-16 | Fase FRONTEND-SPRINT-01_