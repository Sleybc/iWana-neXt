# INFORME-MOD01-USERS-REVIEW-FIX-v1.0

**Módulo:** MOD01 — usuarios internos del portal  
**Fase:** Corrección de gaps de revisión de `/dashboard/users`  
**Estado:** Ejecutado localmente, sin commit  
**Fecha:** 2026-08-18  
**Agente:** AI-FE-PLATFORM

---

## Alcance

- Se documentó el envelope Swagger real `{ data: { data, meta } }` sin cambiar el runtime HTTP.
- Se cubrieron las respuestas canónica, legacy y ausente/nula del parser de `usersApi.list()`.
- Se verificó el reintento del listado en `UsersClient`.
- Se añadió la aserción HTTP explícita de que `body.data.data` es un array.

Esta corrección no modificó branding, calendar ni datagrid.

## Evidencia

| Verificación | Resultado |
| --- | --- |
| Jest portal (`UsersClient.spec.tsx`, `api-client.spec.ts`) | 2 suites, 18 tests: PASS |
| Jest API (`users.controller.http.spec.ts`, `users.service.spec.ts`) | 2 suites, 89 tests: PASS |
| ESLint sobre archivos afectados | PASS, sin salida |
| Typecheck portal | PASS |
| Typecheck API | PASS |
| E2E `portal-users.spec.ts` | 10 tests: PASS |

## Riesgo residual

No quedan riesgos funcionales conocidos en los gaps revisados. La corrida Linux requerida por G6.5 no se ejecuta localmente y queda pendiente de CI.
