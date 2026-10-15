# INFORME — MOD05 · E-3 (a) contacto pendiente · Cierre G6

**Versión:** 1.0 · **Fecha:** 2026-10-15
**Emisor:** AI-EM-ARCH (consolidación). Los veredictos son de `sec-eng`, `sr-qa`, `gate-verifier` y `boundary-reviewer`, ninguno de los cuales produjo el código
**Plan:** [2026-10-15-mod05-e3-contacto-pendiente.md](../plans/2026-10-15-mod05-e3-contacto-pendiente.md) · **Contrato:** [prompt E-3 v1.0](../prompts/PROMPT-MOD05-E3-CONTACTO-PENDIENTE-v1.0.md), de §1 a §9
**Estado:** **G6: GO** · G6.5 pendiente (CI por SHA después del commit) · G7 pendiente (CLI por tenant en el runbook)

## 1. Qué cierra

| Hallazgo o decisión | Cómo queda |
| --- | --- |
| **E-3 opción (a)** (CTO) | La conversión nunca se pierde por falta de contacto; la activación y el paso a `CLIENTE_ACTIVO` exigen al menos un teléfono o un correo (R1–R7) |
| **SUB-M07, SUB-B05, B7-03** (placeholders) | Ningún código escribe placeholders. La migración 148 relaja el `NOT NULL`, y el CLI `backfill-placeholder-contacts` limpia los datos existentes por tenant (en G7) |
| **SUB-A01** (fallos de conversión sin registro), **reabierto en esta fase** | Cerrado de punta a punta: los listeners propagan el error (`suppressErrors: false`), el fallo se registra con un código de dominio validado, el reintento solo da por resuelto cuando el efecto existe, el portal muestra el motivo y ofrece el reintento con el mismo techo de roles del endpoint, y el reintento queda auditado (`CONVERSION_RETRY`) |
| **R8** (prevención) | No se pasa a `LISTO_PARA_INSTALACION` sin la autorización de tratamiento de datos (422 síncrono) |
| **Anexo A del runbook de privacidad** | CLI `anonymize-titular` y procedimiento escritos (F3); `sec-eng` aprobó el CLI dentro del alcance A-1 a A-3 |

## 2. Veredictos que se consolidan

| Revisor | Informe | Veredicto |
| --- | --- | --- |
| `sec-eng` | [SEC v1.3](INFORME-MOD05-E3-E4-SEC-v1.3.md) (con [v1.0](INFORME-MOD05-E3-E4-SEC-v1.0.md)–[v1.2](INFORME-MOD05-E3-E4-SEC-v1.2.md)) | **GO**: CLI de placeholders, `contactPending`, errores 422, SEC-G4-01, 02 y 03 |
| `sr-qa` | [QA v1.2](INFORME-MOD05-E3-E4-QA-v1.2.md) y [H3](INFORME-MOD05-E3-H3-v1.0.md) | **GO**: E2E contra el portal y la API reales, sin interceptores. Cubren CA-E3-01 a 04, R8 y el banner; un ADMIN reintenta y un SALES ve el motivo sin la acción. Tenants desechables `INACTIVE` |
| `gate-verifier` | [GATES v1.4](INFORME-MOD05-E3-E4-GATES-v1.4.md) (con v1.0–v1.3) | **GO**: lint, typecheck y tests de los 5 paquetes sin caché; API 376 suites / 5.002 tests; integración real con exit 0 y la 148 registrada; cobertura D1 por encima de `fb3d41ee` en las 4 métricas; líneas cambiadas al 100 % (API 55/55, portal 51/51) |
| `boundary-reviewer` | Dentro de GATES v1.3 | Sin violaciones. La lectura de postcondición intra-CRM se aclaró en [ADR-027](../adrs/ADR-027-Conversion-Expediente-Subscriber-Two-Stage.md) |

## 3. Cómo se llegó al GO

| Ola | Resultado | Defecto del emisor (AI-EM-ARCH) |
| --- | --- | --- |
| 1 (E1–E3) | ✅ | — |
| 2 (E4) | NO-GO: E2E bloqueado; cobertura | El encargo del E2E omitió la precondición A18 |
| 2-bis (F1–F4) | Se descubre que SUB-A01 nunca funcionó (`suppressErrors` por defecto); el Anexo A estaba bloqueado | La re-auditoría dio A01 por cerrado apoyándose en B5 |
| 2-ter (G1–G4) | NO-GO por SEC-G4-01 | §7.2 nombró un permiso de UI distinto del endpoint, y el agente amplió los roles contra ADR-083 D2 |
| 2-quater (H1–H6) | ✅ | La regla D1 de cobertura se fijó sin medir antes la línea base (corregida en §7.1) |

Las lecciones quedaron en memoria: precondiciones de dominio en los E2E, cerrar fallos con tests que los provoquen dentro del mecanismo real, el permiso de UI igual al del endpoint y la línea base antes de fijar umbrales.

## 4. Condiciones y pendientes

| # | Pendiente | Gate | Dueño |
| --- | --- | --- | --- |
| 1 | CI de `main` en verde por SHA, con PASS de la 148, de las integraciones de E-3 (`contact-pending`, `g1-conversion-failure`, B5) y de los CLI | **G6.5** | CTO (push) → AI-EM-ARCH (verificación) |
| 2 | En cada tenant: la migración 148, `backfill-placeholder-contacts` (dry-run → `--apply`) y el conteo de suscriptores `ACTIVE` sin contacto | G7 | `plat-ops` (runbook) |
| 3 | Subir los branches de `crm/expedientes` a ≥ 80 % (hoy 58 %) | Antes del G7 de MOD05 | `sr-qa` (P1) |
| 4 | Orden del middleware de tenant frente al limitador (observación de `sec-eng`, anterior a E-3) | Transversal | `sec-eng` + `plat-ops` |
| 5 | Supuesto de R1: basta un canal; el correo de factura es de Billing | Lo revisa el CTO | CTO |

## 5. Efecto en la re-auditoría de MOD05

- SUB-A01 → ✅ (cierre en código, G6.5 pendiente).
- SUB-M07 y SUB-B05 → ✅ en código, con la limpieza de datos en G7.
- El criterio #5 del checklist vuelve a ✅.
- El checklist queda en **8 ✅ · 4 ⚠ · 2 ❌**; siguen abiertos el #1 (A06, mitigado por D-1B y el runbook) y el #10 (ADR-058 fase 2).
