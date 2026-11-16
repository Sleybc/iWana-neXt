# INFORME — Transversal · Importación UISP: usuarios del personal · Cierre v1.0

**Fecha:** 2026-11-15
**Spec:** [2026-11-15-transversal-importacion-uisp-usuarios](../specs/2026-11-15-transversal-importacion-uisp-usuarios.md) v1.1 (G0 2026-11-15) · **ADR:** [ADR-110](../adrs/ADR-110-Importacion-por-Lotes-desde-UISP-y-Portabilidad.md) v1.2 D15 · **Plan:** [2026-11-15-transversal-importacion-uisp-usuarios](../plans/2026-11-15-transversal-importacion-uisp-usuarios.md) · **Runbook:** [RUNBOOK-UISP-CLAVE-API-USUARIOS-v1.0](../runbooks/RUNBOOK-UISP-CLAVE-API-USUARIOS-v1.0.md)
**Estado:** G6 ✅ (local) · sin commit · G6.5 pendiente de push y CI

## 1. Entregado

| Ola | Resultado |
|---|---|
| 1 | W0 línea base (687 verdes). A: contrato `migration-uisp-users`, kind `USUARIO`, migración tenant 211 (conexión y filas de revisión con CHECKs de purga de PII), supresión y K2 |
| 2 | B: conexión cifrada, cliente de solo lectura con huella TLS fijada, job «Traer usuarios», filas «sin datos». D: atribución al promover (asignado, autores, creador, registrador) y «Actualizar autores» |
| 3 | C: enlazar, crear y descartar en lote (inactivos `INACTIVE` y fuera de Programación), invitar, `.invalid` bloqueado por el mailer. F: sección «Usuarios de UISP» y botón en el lote |
| 4 | QA (E2E en vivo con UISP falso), revisiones y correcciones; invitación que crea la contraseña; página de crear contraseña en modo invitación |

## 2. Evidencia (conteo real, sin caché)

| Corrida | Resultado |
|---|---|
| API completa | 588 suites · 7838/7838 |
| Integración de migración (`DB_NAME=test`) | 40 + 1 omitida (Redis) |
| Integración de usuarios UISP + bloqueo de login (`AuthService` real: invitar → crear contraseña → login) | 22/22 |
| K2 (`iwana_it_g7_*`) | 5/5 (bloque A) |
| Portal (Importaciones · auth · usuarios) | ver §5 |
| E2E `portal-importacion-uisp-usuarios-live` + `portal-importacion-uisp-live` | 3/3 (antes del bloqueo SSRF; ver §4 D1) |
| `audit-ui.mjs` | sin hallazgos |

## 3. Revisiones

| Revisor | Veredicto | Atendido |
|---|---|---|
| `boundary-reviewer` | Sin bloqueantes | `tenant_id` en `recordCheck`; `emailTaken` documentado (unicidad por schema) |
| `contract-drift-reviewer` | Sin deriva de forma | Código propio `MIGRATION_UISP_USER_ALREADY_RESOLVED`; 409 unificado; textos; OpenAPI |
| `test-change-reviewer` | Sin regresiones ocultas | Retención de filas pendientes; `DELETE` genérico de `USUARIO` bloqueado; pruebas de «respetados» en creador, autores y pagos |
| `sec-eng` | GO condicionado | S-1 SSRF (lista de bloqueo con validación en el connect, excepción solo de pruebas prohibida en producción); S-2 «olvidé» no activa cuentas pendientes; S-3 purga a 30 días y al retirar; S-4 auditoría por fila; S-5 y S-6 roles importables |

## 4. Deudas

| # | Deuda | Dueño |
|---|---|---|
| D1 | El E2E en vivo necesita `MIGRATION_UISP_ALLOWED_PRIVATE_HOSTS=127.0.0.1` en la API. En el job E2E del CI ya lo fija `scripts/e2e-provision-operational.mjs`; falta en el `.env.development` local | usuario |
| D2 | `PORTAL_URL` no se pasa a la API en el compose de producción: el enlace de invitación caería en `FRONTEND_URL` | `plat-ops` (G7) |
| D3 | «Olvidé mi contraseña» y la verificación de correo del personal arman sus enlaces con `FRONTEND_URL` (apps/web) y sin `tenant`: probablemente rotos hoy (previo a esta fase) | `sr-backend` |
| D4 | El login no precarga la empresa desde `?tenant=` tras crear la contraseña | `fe-platform` |
| D5 | Un error transitorio de UISP queda registrado en cada intento del job; el portal puede cortar la espera antes de un reintento exitoso | `sr-backend` |
| D6 | Conectar la instancia real, revisar los 62 usuarios y «Actualizar autores» en el lote del cliente 22 | usuario |
