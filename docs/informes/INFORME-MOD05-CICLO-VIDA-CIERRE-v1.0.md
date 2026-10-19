# MOD05 — Ciclo de vida suscriptor ↔ contrato y suspensión unificada (E4) · Informe de cierre

**Versión:** 1.0 · **Fecha:** 2026-10-19 · **Estado:** Cerrado (G7)
**Emisor:** AI-EM-ARCH · **Modo:** Orquestador
**Fuentes:**
- [PRD Fase 05 v1.2](../prds/PRD-MOD05-CRM-SUBSCRIBERS-FASE-05-v1.2.md);
- [HLD Fase 05 v1.1](../hlds/HLD-MOD05-FASE-05-v1.1.md);
- [ADR-097](../adrs/ADR-097-Puertos-de-lectura-para-avisos-de-terminacion-MOD05.md);
- [plan](../plans/2026-10-19-mod05-ciclo-vida-suspension.md), [encargo v1.2](../prompts/PROMPT-MOD05-CICLO-VIDA-v1.2.md) y [launcher v1.2](../prompts/PROMPT-MOD05-CICLO-VIDA-LAUNCH-v1.2.md);
- [spec UX del diálogo](../specs/2026-10-19-mod05-suspension-servicios-ux-spec.md).

**Commits en `main`:**
- `a3c5539e`: definición y G0;
- `27625542`: arreglo transversal `AuthReadyGate`, fuera de E4 ([informe](INFORME-PORTAL-FIX-INSTANTNAV-v1.0.md)), del que dependen los journeys Chromium de E4;
- `a583e9f0`: implementación de E4;
- `3c8a9fff`: arreglo de una carrera de foco en el diálogo de ciclo de vida, detectada por el CI de `a583e9f0` (§2.1).

## 1. Alcance ejecutado

| Área | Entregado |
| --- | --- |
| Derivación | El contrato manda y el estado del suscriptor se deriva y persiste en la misma transacción (RF-LC-01 a RF-LC-06). `PATCH /status` rechaza `ACTIVE ⇄ SUSPENDED` con `SUBSCRIBER_STATUS_DERIVED` |
| Comandos | Suspender, reactivar y terminar por lote, con vista previa sin escritura, idempotencia y bloqueo de filas; las acciones individuales de contrato exigen motivo (RF-LC-07 a RF-LC-12) |
| Motivos | Catálogo cerrado provisional en `@iwana/shared` (`lifecycle.schema.ts`) con CHECK en base de datos (RF-LC-13 a RF-LC-15) |
| Historial | Tabla `crm_lifecycle_changes` (migración 158) con `batch_id`; `note` cifrada con AES-256-GCM e incluida en la rotación de claves (`reencrypt-aes.pii.ts`), según la respuesta de `sec-eng` a Q3 |
| Guardas | 409 para suscriptor cancelado, suspensión por mora y cancelación con servicios vivos (RF-LC-16 a RF-LC-18) |
| Permiso | `CRM_SUBSCRIBERS_MANAGE` para todos los actos de ciclo de vida; `CRM_EXPEDIENTES_MANAGE` ya no habilita transiciones de contrato |
| Avisos de terminación | Puertos de lectura de equipos en comodato (MOD12) y órdenes de ejecución abiertas (MOD11), con alcance de tenant (ADR-097) |
| Portal | Diálogo en dos pasos con vista previa, motivo en las acciones de contrato, acción primaria por estado, aviso «Sin servicios vigentes» y deriva `PROSPECT → SUSPENDED` eliminada |
| CLI | `report-lifecycle-inconsistencies.ts`, solo simulación y sin PII (D-E4-6) |

**Fuera de alcance (sin cambios):** integración real con Billing, corte en red (E8), retiro automático de comodato y OT de desinstalación, cambio de plan (E5), vista lateral y chips (E2).

## 2. Evidencia

| Verificación | Resultado |
| --- | --- |
| API, sin caché | 399 suites aprobadas y 4 omitidas; 5 364 tests aprobados y 15 omitidos |
| Shared | 22 suites; 204 tests |
| Portal, tras el arreglo SSR | 309 suites; 3 142 tests aprobados y 1 omitido (preexistente) |
| PostgreSQL | Ciclo de vida 8/8; migración 158 up/down 3/3; orden de migraciones 6/6 |
| E2E Chromium | `portal-mod05-lifecycle.spec.ts` 2/2 (sintético, sin credenciales ni datos reales); `portal-auth-ready-gate.spec.ts` 1/1 |
| Cobertura | `subscriber-lifecycle.service.ts`: 95,79 % de líneas y 82,50 % de ramas |
| Gates locales (V5) | Lint, typecheck, `pnpm audit --prod --audit-level critical`, OpenAPI, `audit-ui.mjs`, builds y `git diff --check` en verde |
| CI de `main` sobre `a583e9f0` | **Rojo** ([run 39282324929](https://github.com/Sleybc/iWana-neXt/actions/runs/39282324929)): 1 test del portal falló de 3143 (§2.1). E2E Web Admin Smoke en verde |
| CI de `main` sobre `3c8a9fff` | **Verde** ([CI 39292342570](https://github.com/Sleybc/iWana-neXt/actions/runs/39292342570): Lint + Typecheck + Build + Unit tests, imágenes de producción, E2E operativo R4.1, integridad de citas ADR y conteo de deuda E2E; [E2E Web Admin Smoke 39292342293](https://github.com/Sleybc/iWana-neXt/actions/runs/39292342293)) |

### 2.1 Fallo del CI y arreglo

El CI de `a583e9f0` falló en un solo test, `SubscriberLifecycleDialog.portal.spec.tsx` › «no permite aplicar una vista previa vacía…», que en local pasaba 10/10 en seis corridas. Causa: al cambiar de paso, el diálogo enfocaba su título en un `requestAnimationFrame` que nunca se cancelaba al desmontar y que buscaba el título por un id global. Con el runner cargado, el frame que dejaba el test anterior se ejecutaba durante el siguiente, enfocaba el título del diálogo nuevo y el `Select` cerraba su menú al perder el foco. En producción era el mismo defecto: un frame tardío podía quitarle el foco al operador justo después de cambiar de paso.

Arreglo (`fe-platform`, `3c8a9fff`): el frame se cancela en el cleanup, el título se busca dentro de la instancia y solo se mueve el foco si nadie lo reclamó, con la misma guarda que `Dialog` de `@iwana/ui`. Tres tests nuevos reproducen la carrera de forma determinista (rojo 2 de 13 antes del arreglo). Después: carpeta de suscriptores 15 suites y 192 tests; `src/components/crm` con `--maxWorkers=1`, 33 suites y 316 tests; typecheck y eslint con exit 0.

Trazabilidad de CA-LC-01 a CA-LC-12 a tests concretos: [plan](../plans/2026-10-19-mod05-ciclo-vida-suspension.md), «Estado de verificación».

## 3. Gates

| Gate | Estado |
| --- | --- |
| G0 | Aprobado por el CTO el 2026-10-19 (D-E4-1 A, D-E4-2 lista cerrada, D-E4-3 tabla nueva, D-E4-4 A, D-E4-5 `CRM_SUBSCRIBERS_MANAGE`, D-E4-6 solo informar) |
| G1 | GO: S1, S2 y S3; migración up/down; puertos con tenant actual |
| G2 | GO de `sr-qa` |
| G3 | GO de `sec-eng`: sin PII en logs, historial inmutable, permiso único |
| G4 | GO de `boundary-reviewer` y `contract-drift-reviewer`, tras corregir `hasLiveContracts` y OpenAPI |
| G5 | GO de `ds-owner` |
| G6 | GO con gates locales. **Corrección del CTO (2026-10-19):** la versión inicial del plan exigía el CI de `main` en G6 y dejaba el commit para G7; ese CI solo existe después del push, así que pasó a G7 |
| G7 | Cerrado: commits en `origin/main` hasta `3c8a9fff`, CI de `main` en verde sobre ese commit y este informe |

| Gate maestro (`AGENTS.md`) | Resultado |
| --- | --- |
| Sin vulnerabilidades críticas | Cumple (audit crítico en 0 y paso del CI) |
| Sin violaciones de boundary | Cumple (G4; lectura cruzada solo por puertos, ADR-097) |
| Cobertura ≥80 % core | Cumple en el servicio de ciclo de vida |
| OpenAPI | Actualizado |
| Migraciones reversibles | Cumple (158 up/down probada) |
| Sin PII en logs | Cumple (CA-LC-08; `note` cifrada y fuera del log) |
| Lint y typecheck | Cumple |

## 4. Pendientes y decisiones abiertas

| # | Pendiente | Responsable |
| --- | --- | --- |
| P3 | CA-LC-09 se prueba en el guard, no por HTTP: agregar un test e2e de API con un rol que solo tenga `CRM_EXPEDIENTES_MANAGE` | `sr-qa` |
| Q1 | Validar el catálogo de motivos contra el régimen de protección al usuario (RF-LC-15) | Asesoría jurídica |
| Q2 | Días de mora para suspender y cortar | CTO / comercial, cuando exista Billing |
| — | Correr el CLI de inconsistencias en cada tenant antes de la beta y resolver caso a caso (D-E4-6) | Operación, en G7 de producción (diferido hasta la beta, ADR-095) |
| P3 | `DialogTitle` de `@iwana/ui` no acepta `ref`, y la guarda de foco diferido ya está repetida en `Dialog`, `OperationalSidePeek`, `usePortalSideDrawerA11y` y este diálogo: evaluar consolidarla en un hook | `ds-owner` |
| — | El arreglo `AuthReadyGate` saca los árboles protegidos de la validación de navegación instantánea; su informe documenta el costo | `fe-platform` |

**Siguiente paso recomendado:** E1 + E2 de la [spec UX](../specs/2026-10-18-mod05-suscriptores-ux-rediseno-spec.md) §4 (columnas de servicio y zona, vista lateral y chips con conteo), que ahora pueden apoyarse en el estado derivado.
