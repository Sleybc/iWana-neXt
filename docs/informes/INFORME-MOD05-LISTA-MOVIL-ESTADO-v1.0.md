# INFORME · MOD05 Lista móvil de Suscriptores · Estado de gates

**Fecha:** 2026-10-21 · **Fase:** 08 / E3 · **Base:** `ec6111e0` · **Estado:** G2 GO por decisión del CTO (2026-10-21); G7 en curso, ver informe de cierre

## Resumen

La interfaz móvil, el helper compartido de normalización y sus pruebas están implementados. Las revisiones de seguridad y design system dieron GO. Las pruebas locales y E2E del portal terminaron sin fallos ni cuarentenas. La fase no puede pasar a G7 porque sigue pendiente medir qué porcentaje de teléfonos del tenant de desarrollo acepta `toDialablePhone`, tal como pide CA-MV-08/PRD §8.

## Gates

| Gate | Resultado   | Evidencia                                                                                                                                                                                                   |
| ---- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| G0   | GO          | D-E3-1 a D-E3-6 aprobadas; PRD Fase 08 en `Aprobado`.                                                                                                                                                       |
| G1   | GO          | S1: `toDialablePhone` publicado en `@iwana/shared`; S2: spec UX móvil aprobada.                                                                                                                             |
| G2   | NO-GO       | CA-MV-01 a CA-MV-08 cubiertos. Los E2E globales tuvieron 309 casos: 291 aprobados, 18 omitidos con motivo, 0 fallidos, 0 flaky; el gate de cuarentenas reportó 0/0. Falta medir el porcentaje normalizable. |
| G3   | GO          | Sec-eng cerró la revisión: acciones condicionadas a la proyección y al rol, teléfonos no visibles, sin PII en URL/logs, enlaces seguros y WhatsApp sin texto.                                               |
| G4   | GO          | DS revisado en 375/768 px, claro/oscuro. `audit-ui.mjs`: P0 0, P1 0, P2 0, P3 0.                                                                                                                            |
| G5   | GO local    | Shared sin caché: 23 suites / 221 tests. Portal sin caché: 320 suites / 3.240 aprobados y 1 omitido preexistente. Tipos y lint de los paquetes modificados pasan.                                           |
| G7   | No iniciado | No se creó commit ni se hizo push; no se ejecutó CI de `main`.                                                                                                                                              |

## Evidencia de pruebas y cobertura

- E2E dirigido en el contenedor oficial de Playwright: 4 specs, 13 tests aprobados, 0 fallidos, 0 omitidos y 0 flaky.
- E2E global del portal en el contenedor: 291 aprobados, 18 omitidos con anotación por requerir configuración/credenciales live que no están presentes, 0 fallidos, 0 flaky. El script de cuarentena terminó con 0 filas activas de 0 permitidas.
- Cobertura de los siete fuentes de `apps/portal/src/components/crm/subscribers`: statements 83,73%, branches 76,53%, functions 81,81%, lines 85,24%. AGENTS.md no fija umbrales por archivo ni separa un mínimo para branches; el módulo supera 80% en statements y líneas.
- `@iwana/shared/src/constants/profile-phone.ts`: 100% statements, branches, functions y líneas en la medición dirigida de su spec.
- `pnpm audit:doc-locations`: 0 bloqueantes y 3 advertencias preexistentes de `.playwright-mcp`. `pnpm audit:adr-citations`: 0 bloqueantes y 144 advertencias preexistentes.

## Pendiente para G2

Se intentó únicamente con el rol `iwana_readonly` configurado para desarrollo. El acceso al puerto publicado del Postgres rechazó la conexión con SQLSTATE `53300` (máximo de conexiones); PgBouncer tampoco entregó una sesión utilizable en los intentos de V1. No se leyó ni registró ningún teléfono y no se cambiaron credenciales.

Los campos de teléfono principal y alterno se almacenan cifrados. Para calcular el porcentaje de normalización hacen falta una sesión de lectura disponible y la proyección autorizada que ya descifra esos campos, o una vía equivalente de agregación aprobada. Una consulta directa de los ciphertexts no puede medir `toDialablePhone` y no se usó una clave alternativa.

**Acción requerida:** liberar/reparar la conexión de solo lectura y proporcionar la vía aprobada para evaluar la proyección sin exponer números. Después, V1 completa el conteo porcentual (solo porcentaje y total), V4 repite el gate y, únicamente con GO, se ejecuta G7.

## Cambios incluidos en la fase

Tarjetas y acciones de contacto en móvil, chips desplazables y panel inferior de filtros; helper puro `toDialablePhone` en shared; pruebas de componentes y E2E móvil. No se modificó API ni proyección. Las capturas de auditoría quedan fuera del commit.

## Decisión del CTO (2026-10-21)

La métrica de teléfonos normalizables sale de G2: medirla exigía descifrar teléfonos fuera de la aplicación y el tenant de desarrollo solo tiene datos de semilla. Queda como pendiente previo a la beta, como CLI de solo agregados con el descifrado autorizado, corrido por tenant con datos reales; D-E3-6 se revisa con ese resultado. V4 se relanza sin la métrica y G7 continúa.

Incidente: la URI del rol `iwana_readonly` apareció en una salida de diagnóstico de la sesión (no en archivos del repo). El CTO rota la credencial; no se usa hasta entonces.
