# MOD05 — Suscriptores · Quick wins de UX · Informe vivo de ejecución

**Versión:** 1.0 · **Fecha:** 2026-10-18 · **Estado:** Cerrado (G6, 2026-10-18)
**Emisor:** AI-EM-ARCH · **Modo:** Orquestador
**Base:** `main` en `d9018071`.
**Fuentes:** [plan](../plans/2026-10-18-mod05-suscriptores-ux-quick-wins.md), [spec](../specs/2026-10-18-mod05-suscriptores-ux-rediseno-spec.md), [encargo](../prompts/PROMPT-MOD05-SUSCRIPTORES-UX-QW-v1.0.md), launchers [v1.0](../prompts/PROMPT-MOD05-SUSCRIPTORES-UX-QW-LAUNCH-v1.0.md) y [v1.1](../prompts/PROMPT-MOD05-SUSCRIPTORES-UX-QW-LAUNCH-v1.1.md).

## Alcance y autorización

G0 aprobado por el CTO en esta sesión: D-UX1 selector explícito, D-UX2 ocultar stubs, D-UX3 texto secundario. Solo frontend de `apps/portal`; QW1-QW6, sin E1-E8, API, contratos compartidos, design system ni migraciones.

Secuencia autorizada: F1 ∥ F2 ∥ F3 → G1 → V1 ∥ V2 ∥ V3 → V4 → G6. Propiedad disjunta del prompt §2. Ningún subagente commitea.

## Estado de gates

| Gate | Estado | Evidencia |
| --- | --- | --- |
| G0 | Aprobado | Instrucción del CTO, 2026-10-18 |
| G1 | Cumplido | F1: 1 suite/26 tests; F2: 4/43; F3: 5/69, sin caché; typecheck exit 0 por bloque |
| G2 | GO final de V1 | 14 suites/172 tests sin caché; IAB real del orquestador y E2E controlado de V1 |
| G3 | GO de V2 tras corrección | Contraste 7,19:1 claro/5,98:1 oscuro; P0-P3 0 |
| G4 | GO de V3 | 3 suites/42 tests focales sin caché; sin fugas nuevas |
| G5 | GO tras remediación | Auditoría: 0 críticas y 0 altas tras `a6ca8e3f` (CI verde, run 39158140592) y `f867cbd2`. V4 repetido: 307 suites, 3121 tests aprobados/1 omitido, lint y typecheck, Cached 0. Cobertura: umbrales configurados cumplen; objetivo integral ≥80 no acreditado, deuda P3 |
| G6 | Cerrado | Commit `d5b5c92d` en `origin/main` (push 2026-10-18), CI y E2E smoke en verde; ver «Cierre G6» |

## Preservación del workspace

Cambios preexistentes fuera de esta fase: `.gitignore`, `apps/portal/next-env.d.ts`, informe MOD05 de deuda y plan del 2026-10-17. No se incorporan al commit de esta fase. Los cuatro artefactos de definición de UX ya estaban sin seguimiento al arrancar; forman parte del alcance autorizado.

## Evidencia y deuda

### Implementación F1-F3 (evidencia inicial de G1)

| Bloque | Comando (prefijo `pnpm --filter @iwana/portal exec jest`) | Suites | Tests | Resultado |
| --- | --- | --- | --- | --- |
| F1 | `SubscribersListClient.spec.tsx --runInBand --no-cache --silent` | 1 | 26 | Aprobados, 0 omitidos |
| F2 | `subscriber-ficha-ux-qw.portal.spec.tsx SubscriberDetailClient.mod05-deuda.portal.spec.tsx subscriber-contact-pending.portal.spec.tsx mod05-iva-punto-servicio-ui.spec.tsx --no-cache --runInBand` | 4 | 43 | Aprobados |
| F3 | `subscriber-status-dialog-ux-qw.portal.spec.tsx subscriber-ui.spec.ts ContractCard.spec.tsx crm-contract-dialogs.portal.spec.tsx mod05-deuda-fiscal-ui.portal.spec.tsx --runInBand --no-cache` | 5 | 69 | Aprobados |

Los conteos son por corrida, con posible solapamiento; no se suman como total único. Cada bloque reportó `pnpm --filter @iwana/portal typecheck` y ESLint sobre sus archivos con exit 0. Ciclos rojos observados: F1 10 fallidos/13 aprobados; F2 7 fallidos/1 aprobado; F3 seis fallos del diálogo y ocho fallos al retirar temporalmente los cambios de carga (restaurados antes del verde final).

Reglas implementadas: F1 R1.1-R1.7 (CA1-CA2); F2 R2.1-R2.5, R3.1-R3.3, R5.1-R5.3 (CA3-CA5); F3 R4.1-R4.4, R5.4-R5.5, R6.1-R6.2 (CA6-CA8). Validación independiente pendiente.

NIT: criterio operativo acordado en la coordinación F1: nueve dígitos con DV opcional `-d`; otros documentos se envían como `documentNumber`. La ambigüedad de documentos numéricos de nueve dígitos es un límite de la heurística del contrato QW1, no una validación de identidad.

Auditoría del orquestador tras G1: `node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/crm/subscribers` → sin hallazgos (P0-P3 0). Veredicto de identidad pendiente de V2.

Auditorías documentales iniciales: `pnpm audit:doc-locations` → 0 bloqueantes/3 avisos; `pnpm audit:adr-citations` → 0 bloqueantes/144 avisos. Avisos generales del repositorio, sin correcciones ajenas al alcance.

### Revisiones y correcciones (historial; el estado vigente está en la tabla de gates)

V2 emitió NO-GO inicial: mensaje nuevo `text-error-700` sobre `dark-surface-2`, contraste 2,21:1. F1 agregó `dark:text-error-400` y reemplazó localmente el campo por `Input` del DS con `aria-invalid` y `aria-describedby` enlazados al error `role="alert"`. V2 revalidó GO: contraste 7,19:1 claro y 5,98:1 oscuro. CA8 mecánico cumple: P0-P3 0, sin tokens o variantes nuevos.

Coordinación detectó un fallo funcional de NIT con DV: el lookup API compara `nit` por igualdad, mientras creación separa DV. F1 eliminó solo el sufijo DV antes de enviar y actualizó su test de payload, sin modificar backend ni contratos. Rojo de las dos correcciones: dos tests fallidos antes del cambio; verde final F1: 1 suite/26 tests sin caché, typecheck y ESLint exit 0.

V3 emitió GO de privacidad: `pnpm --filter @iwana/portal exec jest SubscribersListClient.spec.tsx subscriber-ficha-ux-qw.portal.spec.tsx subscriber-status-dialog-ux-qw.portal.spec.tsx --runInBand --no-cache` → 3 suites/42 tests aprobados. CA2 cubierto; sin consultas por tecla, envíos duplicados o respuesta tardía cruzada; privacidad restringida preservada. El refresh tras 401 pertenece al transporte de autenticación preexistente y ocurre antes de lectura autorizada; no se considera reintento automático de consulta auditada en esta fase. No se modifica `api-client.ts`.

V1 ejecutó la carpeta completa sin caché: 14 suites/171 tests aprobados (50,493 s). La credencial disponible `E2E_PRIVACY_ADMIN_*` autentica como AUDITOR y `GET /crm/subscribers` responde 403. No hay variables admin operativas ni sesión de navegador reutilizable. Se solicitó al CTO una sesión con permiso CRM o variables locales admin, sin compartir contraseñas en chat. No se alteran permisos, cuentas ni infraestructura para sortear el bloqueo.

El CTO indicó usar una sesión abierta. El inventario accesible solo expone navegador integrado y MCP Apps, sin pestañas. Se solicitó adjuntar la pestaña o abrirla en el navegador integrado; pendiente de disponibilidad efectiva.

V1 complementó con Playwright contra el frontend real y HTTP sintético: 1 test aprobado y 1 live omitido explícitamente por falta de variables admin. Verificó lookup deliberado sin valor en URL, recarga/fallback/teclado de tabs, error de facturación interceptado y diálogo de suspender. En lista y ficha, viewport y ancho de documento son 375 px. Este resultado no sustituye CA1 con lookup real del seed. Artefacto reproducible: `e2e/tests/portal-crm-suscriptores-ux-qw-live.spec.ts`.

Durante esa interacción apareció un posible borrado del texto al confirmar el cambio de modo en URL. Se abrió reproducción F1 con navegación diferida antes de aceptar el cierre técnico. V4 ejecuta el snapshot anterior como diagnóstico y esperará el resultado de F1 para la corrida final.

F1 reprodujo el fallo (1 test fallido: confirmar navegación vaciaba el borrador). Corrección final: modo local inmediato y reconocimiento de su confirmación en URL; se conserva limpieza ante cambios externos por Atrás/Adelante. Test de navegación diferida, espera sin consulta por tecla y sin PII en URL, envío posterior y navegación. Verde final F1: 1 suite/27 tests, typecheck, lint y auditoría exit 0. V3 mantuvo GO tras revisar el diff final.

El CTO inició sesión administradora en el navegador integrado. El orquestador verificó en `localhost:3002`: listado accesible, búsqueda exacta devuelve una fila y no incorpora el valor a URL; Datos persiste tras recarga; End/Home/ArrowRight seleccionan las tabs esperadas; `financiero` cae en Vista general; diálogo Suspender muestra Razón con `required` y `aria-required`, Confirmar permanece bloqueado vacío y Cancelar cierra sin mutación. A viewport 375 × 812, documento de lista/ficha mide 370 px. Los valores personales visibles se mantuvieron en memoria de la interacción y no se transcribieron a código, tests, informes o capturas.

V1 emitió **GO final de G2** tras revisar la evidencia real del orquestador (la sesión IAB no era accesible desde el subagente) junto con sus pruebas propias: carpeta completa 14 suites/172 tests sin caché (45,623 s), Playwright controlado final 1 aprobado/1 omitido (6,2 s). El omitido automatizado necesita variables admin; no invalida la comprobación real mediante sesión IAB. El error de facturación se verificó con HTTP 409 sintético, sin envío de escritura real.

### Trazabilidad final de aceptación

| CA | Evidencia |
| --- | --- |
| CA1-CA2 | `SubscribersListClient.spec.tsx`: «CA1/CA2 %s envía %s solo al confirmar y conserva privacidad» (seis payloads); lookup real IAB devuelve una fila sin valor en URL |
| CA3 | `subscriber-ficha-ux-qw.portal.spec.tsx`: «CA3 conserva la tab de la URL y actualiza la ruta sin scroll», más fallback parametrizado; recarga y slug antiguo comprobados en IAB |
| CA4 | Misma spec: «CA4 enlaza tabs y paneles, conserva edición y permite flechas, Home y End sin violaciones axe»; teclado real IAB |
| CA5 | Misma spec: «CA5 muestra el mensaje de error de la API dentro de facturación»; E2E controlado fuerza HTTP 409 y verifica error visible |
| CA6 | `subscriber-status-dialog-ux-qw.portal.spec.tsx`: «oculta la razón sin destino y al activar», «exige razón para %s con marca visible», «muestra el mensaje público o el respaldo seguro»; diálogo IAB sin confirmar |
| CA7 | `ContractCard.spec.tsx`: «renderiza %s con Badge y texto»; `subscriber-ui.spec.ts`: «mapea %s al badge %s»; cinco estados y variantes compartidas |
| CA8 | Auditoría mecánica P0-P3 0 y GO de identidad V2 |
| CA9 | Cumple comandos: tests/lint/typecheck exit 0, Turbo Cached 0. El gate global G5 sigue abierto por seguridad y cobertura integral |

### Deuda y límites

| Severidad | Estado | Responsable / siguiente acción |
| --- | --- | --- |
| P1 | Resuelto | F1: contraste dark y vínculo accesible de error, revalidado V2 |
| P2 | Resuelto | F1: NIT con DV y carrera de navegación diferida, con regresiones |
| P3 | Abierto, no bloqueante | FE-PLATFORM/SR-QA: warnings React `act()` y temporizadores reales en tests del listado |
| Cobertura | Objetivo integral ≥80 no acreditado | V4 final: 11 fuentes QW líneas 83,20 %, sentencias 82,10 %, ramas 73,04 %, funciones 74,88 %; ver detalle final |

Sin cambios en API, contratos compartidos, primitives/tokens globales o migraciones. Sin confirmaciones de cambios de estado ni guardado de facturación sobre datos reales. La validación no constituye auditoría WCAG completa ni certificación de despliegue.

## V4 final y gates Before Merge

Comandos del verificador sobre el snapshot final estable:

```powershell
cmd /d /c "pnpm exec turbo run test --filter=@iwana/portal --force --only -- --runInBand --no-cache --coverage --coverageReporters=text-summary --coverageReporters=json-summary"
pnpm exec turbo run lint typecheck --filter=@iwana/portal --force --only
```

`--only` acota el gate al portal sin reconstruir paquetes externos; sus contratos y dependencias no cambiaron.

```text
Test Suites: 307 passed, 307 total
Tests:       1 skipped, 3121 passed, 3122 total
Time:        348.124 s
Tasks:       1 successful, 1 total
Cached:      0 cached, 1 total
```

Lint/typecheck: exit 0, 2 tareas exitosas/2, Cached 0/2, 14,023 s; lint 0 errores y 43 advertencias, ninguna en suscriptores. El único test omitido es preexistente en `InventoryClient.spec.tsx`, documentado por React 19/jsdom; no pertenece a esta fase. La corrida anterior durante el rojo de F1 se descarta por snapshot concurrente, sustituida por la corrida final anterior.

| Cobertura | Líneas | Sentencias | Ramas | Funciones |
| --- | --- | --- | --- | --- |
| Portal completo | 71,03 % | 70,00 % | 63,34 % | 63,41 % |
| 11 fuentes QW modificadas | 83,20 % | 82,10 % | 73,04 % | 74,88 % |

Se cumplen los umbrales ejecutables vigentes del portal (global S55/B47/F49/L57 y perfil ≥80), sin modificar configuración. No se afirma cumplimiento integral del objetivo ≥80 de `AGENTS.md`. Áreas QW con líneas por debajo de 80: `ContractCard` 63,88 %, `ContractDetailDrawer` 78,60 %, `ConvertExpedienteToContractDialog` 71,69 % y `CreateContractDialog` 77,10 %. FE-PLATFORM/SR-QA deben priorizar sus rutas sin cobertura en un encargo de pruebas; no se introduce una excepción de cobertura.

| Gate maestro | Resultado |
| --- | --- |
| Sin vulnerabilidades críticas | **NO-GO:** auditoría complementaria root, ver siguiente sección |
| Sin violaciones de boundary | Cumple alcance: sin cambios backend, shared, ui o api-client; revisiones V2/V3 |
| Cobertura ≥80 core | Objetivo integral no acreditado; umbrales configurados sí cumplen |
| OpenAPI | No aplica: no endpoints ni contratos nuevos |
| Migraciones reversibles | No aplica: sin cambios de base de datos |
| Sin PII en logs | GO final V3; valores de UI no registrados |
| Lint/typecheck | Cumplen, sin caché, 0 errores |

## Bloqueo de seguridad y decisión de cierre

`pnpm audit --prod --audit-level critical` → **exit 1**, 42 vulnerabilidades: 4 críticas, 17 altas, 16 moderadas y 5 bajas. Confirmación estructurada con `pnpm audit --prod --json`. Manifiestos y lockfile permanecen sin modificaciones: son hallazgos preexistentes, pero el gate exige ausencia de críticas y no permite omitirlos.

| Paquete | Advisory crítico reportado | Versión corregida indicada por auditoría |
| --- | --- | --- |
| next | [GHSA-p293-qw3h-jr36](https://github.com/advisories/GHSA-p293-qw3h-jr36) | ≥16.3.3 |
| next | [GHSA-2xp9-vwfh-vxw4](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4) | ≥16.3.3 |
| next | [GHSA-vcvr-r3jv-pc5j](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j) | ≥16.3.6 |
| proxy-addr | [GHSA-jqcg-44mw-7w3h](https://github.com/advisories/GHSA-jqcg-44mw-7w3h) | ≥2.0.8 |

[BLOQUEO] G5/G6 no pueden cerrarse por el gate de seguridad y falta de evidencia integral de cobertura. La fase autorizada es solo frontend y prohíbe cambiar backend/contratos/design system; no se amplía silenciosamente a manifiestos, lockfile o stack.

[ESCALACION AL CTO] Recomendación: encargar remediación de dependencias a PLAT-OPS con SEC-ENG y pruebas de cobertura pendientes a FE-PLATFORM/SR-QA; mantener estos quick wins listos para revisión. No se solicita ni se concede excepción de seguridad. Tras remediación y evidencia, repetir V4 y consolidar G6. No se inicia E1-E8.

**Decisión del CTO (2026-10-18):** no commitear los quick wins hasta que la remediación de dependencias deje 0 críticas en `pnpm audit --prod --audit-level critical` y se repita V4. La remediación corre como fase transversal propia (PLAT, `plat-ops` + `sec-eng`), con su plan y su informe. Al reanudar: verificar la evidencia de esa fase, repetir V4 sobre `@iwana/portal` sin caché, versionar el launcher de reanudación como v1.1 y consolidar G6.

## V4 tras la remediación de dependencias (2026-10-18)

Base: `main` local en `f867cbd2`. Incluye `a6ca8e3f` (Next ≥16.4, `proxy-addr` ≥2.0.8 y el paso de auditoría crítica en CI) y `f867cbd2` (nodemailer 10). Ninguno de los dos commits toca archivos de esta fase; los cambios de los quick wins siguen sin commitear.

| Verificación | Comando | Resultado |
| --- | --- | --- |
| Vulnerabilidades | `pnpm audit --prod --audit-level critical` | **0 críticas, 0 altas**; 4 moderadas y 1 baja |
| Tests y cobertura | `pnpm exec turbo run test --filter=@iwana/portal --force --only -- --runInBand --no-cache --coverage --coverageReporters=text-summary` | 307 suites aprobadas de 307; 3121 tests aprobados y 1 omitido (preexistente, `InventoryClient.spec.tsx`); `Cached: 0 cached, 1 total`; 396,6 s; exit 0 |
| Cobertura del portal | misma corrida | Líneas 71,03 %, sentencias 70 %, ramas 63,34 %, funciones 63,44 %: sin variación respecto de la corrida anterior |
| Lint y typecheck | `pnpm exec turbo run lint typecheck --filter=@iwana/portal --force --only` | 2 de 2 tareas exitosas; `Cached: 0 cached, 2 total`; lint 0 errores y 43 advertencias, ninguna en suscriptores |

**Estado de G5:** el gate «Sin vulnerabilidades críticas» pasa a **GO**. La cobertura se mantiene como estaba: los umbrales configurados del portal se cumplen y el objetivo integral ≥80 de `AGENTS.md` no se acredita para el portal. Las cuatro fuentes por debajo de 80 % de líneas quedan como deuda P3 de pruebas para `sr-qa`. El CI de `a6ca8e3f` estaba en curso al momento de esta corrida (E2E Web Admin Smoke en verde).

**Resultado:** F1-F3 y G2-G4 aprobados; CA1-CA9 funcionales/técnicos comprobados con los límites anteriores; G5 global NO-GO; **sin commit de G6**. Cambios preexistentes ajenos preservados byte a byte en su diff respecto de HEAD. Auditoría documental sin bloqueantes; correcciones menores de plantilla, dispatch y trazabilidad incorporadas.

## Cierre G6 (2026-10-18)

Condiciones del CTO cumplidas: 0 críticas en `pnpm audit --prod --audit-level critical`, V4 repetido sin caché sobre Next 16.4 y CI de `a6ca8e3f` en verde ([run 39158140592](https://github.com/Sleybc/iWana-neXt/actions/runs/39158140592): Lint + Typecheck + Build + Unit tests, imágenes de producción, E2E operativo R4.1, integridad de citas ADR y conteo de deuda E2E en verde).

- **Commit:** solo los archivos de esta fase: código y specs de `apps/portal/src/components/crm/subscribers/`, `e2e/tests/portal-crm-suscriptores-ux-qw-live.spec.ts`, la spec, el plan, el encargo, los launchers v1.0 y v1.1 y este informe. Quedan fuera los cambios ajenos (`.gitignore`, `apps/portal/next-env.d.ts`, `apps/web/next-env.d.ts`, el informe y el plan de deuda MOD05 del 2026-10-17). Commit `d5b5c92d`, publicado en `origin/main` junto con `f867cbd2`; [CI](https://github.com/Sleybc/iWana-neXt/actions/runs/39162335207) y [E2E Web Admin Smoke](https://github.com/Sleybc/iWana-neXt/actions/runs/39162335128) en verde.
- **Launchers:** la v1.0 conserva el lanzamiento de las Olas 1 y 2; la v1.1 es la reanudación del cierre tras el NO-GO de G5.
- **Deuda abierta:** P3 de pruebas para `sr-qa` (`ContractCard`, `ContractDetailDrawer`, `ConvertExpedienteToContractDialog` y `CreateContractDialog` por debajo de 80 % de líneas) y P3 de advertencias `act()` en los tests del listado.
- **Siguiente fase recomendada** (plan §6): E4, el addendum al PRD sobre la relación entre el estado del suscriptor y el de sus contratos, con la suspensión unificada.
