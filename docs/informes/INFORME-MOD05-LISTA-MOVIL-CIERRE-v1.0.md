# MOD05 — Lista móvil de Suscriptores en tarjetas (E3) · Informe de cierre

**Versión:** 1.0 · **Fecha:** 2026-10-21 · **Estado:** Cerrado (G7)
**Emisor:** AI-EM-ARCH · **Modo:** Orquestador
**Fuentes:** [PRD Fase 08](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-08-v1.0.md), [plan](../plans/2026-10-21-mod05-lista-movil.md), [spec UX móvil](../specs/2026-10-21-mod05-lista-movil-ux-spec.md), [informe de avance](INFORME-MOD05-LISTA-MOVIL-ESTADO-v1.0.md), launchers [v1.0](../prompts/PROMPT-MOD05-LISTA-MOVIL-LAUNCH-v1.0.md) y [v1.1](../prompts/PROMPT-MOD05-LISTA-MOVIL-LAUNCH-v1.1.md).
**Commits en `main`:** `ec6111e0` (definición y G0) y `8865fd33` (implementación).

## 1. Alcance ejecutado

- **Tarjetas:** por debajo de 768 px la lista se muestra en tarjetas (nombre, estado, documento, tipo y segmento, servicio principal). Desde 768 px sigue la tabla, con un solo estado y una sola consulta.
- **Contacto:** «Llamar» (`tel:`) y «WhatsApp» (`https://wa.me/`, sin texto predefinido) usan los teléfonos que la proyección ya entrega por rol. El número no se muestra; los nombres accesibles incluyen el del suscriptor. Las mismas acciones aparecen en la vista lateral.
- **Normalización:** `toDialablePhone` en `@iwana/shared`, sobre `getCountryPhonePrefix` y el patrón E.164 canónico; si un teléfono no es marcable, se muestra un aviso en lugar del botón.
- **Controles en móvil:** chips en una fila desplazable y «Más filtros» como panel inferior, con el orden integrado.
- **Sin cambios** de API, de proyección ni del mapa de campos por rol.

## 2. Evidencia

| Verificación                                       | Resultado                                                                                                                                                                                                                                                                                                            |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tests de Shared y Portal (V4 relanzado, `--force`) | Shared 23 suites / 221 tests; Portal 320 suites / 3 240 tests y 1 omitido preexistente; lint y typecheck en verde; `Cached: 0 cached, 6 total`                                                                                                                                                                       |
| E2E del portal en el contenedor oficial (V1)       | 291 aprobados, 18 omitidos con motivo (specs `-live`), 0 fallidos, 0 flaky; E2E móvil dirigido 13/13                                                                                                                                                                                                                 |
| E2E del portal en local (V4)                       | 291 aprobados. Los 17 fallos son todos de specs `-live` (`deuda-fiscal`, `privacy`, `privacy-fase-1b`, `contact-pending`, `conversion-failure`), que en local corren contra la API real porque `.env.development.local` define sus variables; en CI y en el contenedor se omiten con motivo. Ninguno es de esta fase |
| Cuarentena                                         | `PASS (0/0)`                                                                                                                                                                                                                                                                                                         |
| Cobertura de los siete fuentes cambiados           | 83,73 % de sentencias y 85,24 % de líneas                                                                                                                                                                                                                                                                            |
| CI de `main` sobre `8865fd33`                      | **Verde** ([CI 39638138236](https://github.com/Sleybc/iWana-neXt/actions/runs/39638138236): Lint + Typecheck + Build + Unit tests, E2E portal bloqueante, E2E operativo R4.1, imágenes de producción e integridad de citas ADR; [smoke 39638138259](https://github.com/Sleybc/iWana-neXt/actions/runs/39638138259))  |

## 3. Gates

| Gate | Estado                                                                                                                   |
| ---- | ------------------------------------------------------------------------------------------------------------------------ |
| G0   | Aprobado por el CTO el 2026-10-21 (D-E3-1 a D-E3-6)                                                                      |
| G1   | GO: `toDialablePhone` publicado y spec UX móvil aprobada                                                                 |
| G2   | GO con CA-MV-01 a CA-MV-08. **Decisión del CTO (2026-10-21):** la métrica de teléfonos normalizables salió del gate (§4) |
| G3   | GO de `sec-eng`                                                                                                          |
| G4   | GO de `ds-owner` a 375 y 768 px, claro y oscuro; `audit-ui.mjs` en 0                                                     |
| G5   | GO local (V4 relanzado)                                                                                                  |
| G7   | Cerrado: commit, push y CI de `main` en verde con el job «E2E portal» bloqueante                                         |

## 4. Decisión sobre la métrica de G2

El plan pedía medir en el tenant de desarrollo qué porcentaje de teléfonos normaliza `toDialablePhone`. La medición se bloqueó (SQLSTATE `53300`), y además estaba mal planteada: los teléfonos están cifrados, así que medirlos con SQL exigía descifrar PII fuera de la aplicación, y el tenant de desarrollo solo tiene datos de semilla. El CTO decidió sacarla de G2 y dejarla como pendiente previo a la beta.

## 5. Pendientes

| #   | Pendiente                                                                                                                                                                                                                                                                                                                        | Responsable                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| —   | **CLI entregado:** `report:subscriber-phone-readiness` informa por tenant conteos y porcentajes por campo, además de suscriptores con acciones Llamar/WhatsApp disponibles. Usa `SubscribersService`/proyección y bloquea desarrollo local. Falta ejecutarlo con datos reales antes de la beta y revisar D-E3-6 con el resultado | CTO / `sr-backend`             |
| —   | **Incidente atendido:** credencial `iwana_readonly` rotada; `.claude/mcp-postgres.local.env` ahora declara `IWANA_MCP_DATABASE_URI`, consumida por el launcher canónico. Reiniciar Claude Code y OpenCode para abrir pools con la credencial nueva                                                                               | CTO                            |
| —   | **Diagnóstico atendido:** `max_connections=100`; el límite del rol `iwana_readonly` es 10 y las 10 conexiones estaban `idle` (máximo unos 3.180 min / 53 h), sin `application_name`; una conexión `iwana` estaba activa. No se terminaron sesiones: liberar los pools al reiniciar Claude Code y OpenCode                                    | CTO / `plat-ops`               |
| —   | Las specs `-live` fallan en local cuando hay variables pero la API real no responde; no afectan a CI                                                                                                                                                                                                                             | `sr-qa`, cuando exista staging |

**Siguiente en MOD05:** E5 (cambio de plan), que necesita un PRD conjunto con MOD06. E7 y E8 siguen bloqueadas por módulos que no existen.
