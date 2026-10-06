# Actualización R5 — cierre de bloqueos de entorno

- **Versión:** 1.2
- **Fecha:** 2026-10-06
- **Estado:** **NO-GO de R5** por la regresión del servidor nuevo. CA-09 quedó demostrado en el backend local; la prueba manual NVDA sigue pendiente de una persona.
- **Agente:** AI-SR-QA (`sr-qa`)
- **Informe base:** [R5 v1.1](INFORME-MOD11-CONSOLA-OT-OLA2B-R5-SR-QA-v1.1.md)
- **Plan vigente:** `docs/plans/2026-09-14-mod11-consola-ot-remediacion.md` v1.2, §Registro de bloqueos — Ola 2

## Decisiones de alcance

- **P95:** trasladado a G7 por decisión de AI-EM-ARCH. No se midió ni se reabrió en R5.
- **Lector de pantalla:** el guion de `docs/quality/2026-10-06-mod11-ola2b-guion-lector-pantalla-nvda.md` queda preparado para una persona. No se ejecutó ni se sustituyó por automatización.
- No se modificó código de producción y no se creó ningún commit.

## Regresión en servidor nuevo

Se repitieron los E2E de B0, R2, R3, Ola 1 y E4 en un servidor Next de prueba nuevo, en el puerto libre **3100**. El proceso atendió la aplicación y se detuvo al terminar. El runner imprimió los resultados de los 16 casos y quedó detenido durante teardown; se interrumpió únicamente ese proceso propio y se verificó que 3100 quedó cerrado.

| Resultado | Casos |
| --- | ---: |
| Aprobados | 0 |
| Fallidos | 16 |
| Total ejecutado | 16 |

Los 16 fallos se detienen en el mismo error de runtime: `useAuth debe usarse dentro de AuthProvider`, observado al renderizar `LoginForm` y `PortalDashboardLayout` desde `/auth/login`. Los casos no alcanzan sus aserciones funcionales. Se devuelve este hallazgo al dueño del Portal para corregir el contexto de autenticación y repetir la suite.

El proceso preexistente del puerto **3002 no se detuvo**. Al cierre seguía escuchando con PID 24100.

## CA-09 contra API y PostgreSQL locales

Se usó el tenant aislado `srqa-mod11-r5-20261006` (`tenant_srqa_mod11_r5_20261006`) y una OT sintética propia. La API de desarrollo levantada para esta ejecución respondió health 200 con DB y Redis disponibles. El primer proceso API apuntaba MinIO a `iwana-media.localhost` y devolvía `ENOTFOUND`; se levantó una instancia propia en el puerto **3010** con MinIO en path-style. No se cambió configuración ni código del producto.

El flujo se hizo sin `page.route` ni interceptación HTTP. Playwright dibujó trazos con eventos de mouse en un lienzo HTML `<canvas>`, exportó PNG y lo envió por el endpoint real de carga de evidencias. El API y el análisis de Media llevaron el asset a `AVAILABLE`; se registró por API con `evidenceType=SIGNATURE` y `requirementKey=CUSTOMER_SIGNATURE`. También quedaron disponibles y registradas las fotos requeridas por la plantilla v2. `close()` respondió **HTTP 200** y aceptó la ejecución.

La verificación de lectura confirmó por API y SQL la OT **OTE-20261006-003**, plantilla v2, `COMPLETED/EXECUTED` y `closed_at` presente. SQL confirmó una evidencia asociada al asset de firma con `SIGNATURE / CUSTOMER_SIGNATURE / AVAILABLE`. La OT queda identificada como fixture de QA; no se anuló.

**Límite de esta comprobación:** la pantalla del Portal no llegó a hidratarse por el fallo `AuthProvider` descrito arriba. La firma se trazó en el canvas de navegador del harness y se cargó por la API real; el componente de firma integrado en el Portal queda sin verificación de UI en esta corrida. El uso de material de la OT CA-09 figura `PENDING` en inventario aunque el gate de cierre aceptó la OT; ese estado no se presenta como movimiento confirmado.

## Datos preparados para la persona que hará NVDA

El seed idempotente `e2e/scripts/seed-mod11-r5-fixtures.mjs` creó usuarios sintéticos de prueba para los roles técnico y supervisor. Sus credenciales permanecen en el seed y no se incluyen en este informe.

| OT de prueba | Estado | Plantilla | Preparación verificada |
| --- | --- | ---: | --- |
| **OTE-20261006-001** | `ASSIGNED` | v2 | CPE de prueba en custodia `MOBILE_TECHNICIAN`; API reportó 2 unidades disponibles y 0 reservadas. |
| **OTE-20261006-002** | `BLOCKED` | v2 | Bloqueada por API; estado confirmado por API y SQL. |

La persona puede identificar las órdenes por esos números. No se ejecutó el guion NVDA.

## Aislamiento y evidencia

La comprobación SQL de `tenant_iwana` encontró **2 OT antes y después**, y **0 filas con `updated_at` posterior** a la captura inicial. Las escrituras de esta ejecución se limitaron al tenant sintético.

Scripts de apoyo:

- Seed NVDA: `e2e/scripts/seed-mod11-r5-fixtures.mjs`
- Ejecución y comprobación API/SQL de CA-09: `e2e/scripts/verify-mod11-r5-ca09.mjs`

## Veredicto

**R5 permanece en NO-GO** hasta corregir el error de `AuthProvider` y repetir los 16 E2E en servidor nuevo. **CA-09 backend está cerrado** con evidencia de API y SQL. La verificación manual con NVDA queda asignada a una persona. El p95 permanece como condición independiente de G7.
