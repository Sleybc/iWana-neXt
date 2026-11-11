# MOD05 Cierre de venta · Contrato firmado en la instalación · Plan de orquestación

> **Para quien ejecute:** skill obligatoria `executing-plans` (modo subagente). Cada bloque se descompone en pasos TDD con casillas al iniciarlo.

**Objetivo:** que el cliente firme en la visita el contrato CRC generado con sus datos reales, que la firma active el contrato con cobro desde la activación del aprovisionamiento y que MOD14 emita el primer cobro, sin perder ningún flujo actual.
**Arquitectura:** MOD05 es dueño del contrato, de la firma y del evento `crm.contract.activated`; el worker genera el PDF con `playwright-core` + Chromium (ADR-109 D5); MOD14 consume el evento; MOD11 aloja el paso «Contrato» en la consola de OT; MOD06 define la permanencia en el plan.
**Stack:** NestJS, TypeORM con migraciones tenant, BullMQ + outbox, Next.js App Router, `@iwana/ui`, Playwright, Jest.
**Spec:** [2026-11-11-mod05-cierre-de-venta-contrato-firmado](../specs/2026-11-11-mod05-cierre-de-venta-contrato-firmado.md) (G0 2026-11-11) · **ADR:** [ADR-109](../adrs/ADR-109-Contrato-Firmado-en-Instalacion-y-PDF-en-Worker.md) (Aprobado)
**Launcher:** [PROMPT-MOD05-CIERRE-VENTA-LAUNCH-v1.0](../prompts/PROMPT-MOD05-CIERRE-VENTA-LAUNCH-v1.0.md) (prevalece si diverge de §8)

---

## 1. Reglas de ejecución

- Todo en `main`, sin ramas. Árbol con cambios ajenos: no `stash`, `reset` ni `checkout` de rutas ajenas; commitear solo las rutas de la ola.
- No `pnpm dev` ni `scripts/dev.mjs`; no matar procesos `node` por nombre. Para E2E, la sesión principal levanta API y worker por separado (`pnpm --filter @iwana/api dev`, `pnpm --filter @iwana/worker dev`) con Docker arriba.
- Jest directo sin caché de Turbo con conteo real; integración con `DB_NAME=test`; suite completa si cambia un `@Module`.
- Verificar número de migración tenant libre al iniciar cada bloque con migración (último: 182).
- Antes del push: correr también los E2E vivos de MOD05 y OT que ya existen (lección del 2026-11-11).

## 2. Bloques

| Bloque | Spec | Superficie principal | Dueño |
|---|---|---|---|
| **W0** Inventario | §0 | Test de no regresión de: activación manual de contrato, motivos de bloqueo comercial actuales, pasos de la consola de OT y cierre con acta | `sr-qa` |
| **K** Contratos compartidos | todos | `@iwana/shared`: evento `crm.contract.activated` (solo ids), motivo `CONTRACT_UNSIGNED`, permiso `crm.contracts.pending_signature.notify`, tipo legal `CONTRATO_SERVICIO`, esquemas de firma, de estado de generación y de permanencia | `sr-backend` |
| **A0** Datos del operador | G3, CA-11 | API de organización (`apps/api/src/modules/organization`) + migración; sección en `OrganizationSettingsClient.tsx` | `sr-backend` → `fe-platform` |
| **A** Plantilla | D4, CA-6, CA-7 | `apps/api/src/modules/privacy/legal-texts`: tipo nuevo, aprobación de abogado obligatoria para publicar; semilla con el HTML de `contrato-unico-convergente-pospago.html` (G6: mover a `apps/worker/src/templates/contracts/contrato-servicio.base.html`; decidido), solo módulos fijos | `sr-backend` |
| **H** Permanencia | H, CA-13 | MOD06 plan: cargo por conexión y oferta de permanencia; MOD05 contrato: aceptación, montos y fechas; cálculo de la tabla 1–12 | `sr-backend` |
| **B** Generación | D5, CA-14 | MOD05: snapshot + encolar; worker: procesador nuevo `contract-pdf.processor.ts` con `playwright-core`; PDF cifrado en medios; huella; `apps/worker/Dockerfile` con Chromium | `sr-backend` + `plat-ops` |
| **D** Firma y activación | D1, D2, CA-2, CA-4, CA-8, CA-10, CA-12 | MOD05: endpoint de firma (evidencia, PDF firmado con firma incrustada, huella, `DRAFT→ACTIVE`, `billing_start_date` = activación del aprovisionamiento, outbox); activación manual ADMIN con motivo | `sr-backend` |
| **E** Primer cobro | D6, CA-3 | MOD14: consumidor de `crm.contract.activated`, generación inmediata idempotente | `sr-backend` |
| **F** Pendiente de firma | D3, CA-5 | Listener de aprovisionamiento → `CONTRACT_UNSIGNED`; trabajo diario de alerta a 48 h por permiso; insignia en ficha y lista | `sr-backend` → `fe-platform` |
| **C** Paso «Contrato» | CA-1, CA-12 | Consola de OT (`apps/portal/src/components/operations/`): habilitación por aprovisionamiento + evidencia de servicio funcionando; «Generando contrato…»; lectura; firma con `ExecutionOrderSignatureCapture`; sin descarga posterior para el técnico | `fe-platform` |
| **G** Documentos | CA-9 | Contrato firmado en la pestaña Documentos; copia por correo al titular | `fe-platform` + `sr-backend` |
| **QA** | CA-1 a CA-14 | E2E del flujo completo y regresión de OT y MOD05 | `sr-qa` |

## 3. Olas y dependencias

| Ola | Bloques en paralelo | Depende de | Contrato congelado al cerrar |
|---|---|---|---|
| 1 | W0 · K | — | K: todos los esquemas compartidos |
| 2 | A0-be · A · H · B · E | K | Endpoints de generación y estado; ADR-109 D5 en Dockerfile |
| 3 | D · F-be · A0-fe | A, B, H | Endpoint de firma y evento |
| 4 | C · G · F-fe | D | — |
| 5 | QA · revisores | 1–4 | — |

**Ruta crítica:** K → B → D → C → QA. E corre desde la ola 2 contra el evento congelado en K.

**Sincronización:** al cerrar cada ola, la sesión principal corre el inventario W0, conteos contra la línea base y los revisores de §5; commit por ola.

## 4. Gates

| Gate | Evidencia |
|---|---|
| G6 por ola | Lint, typecheck, jest de los paquetes tocados con conteo ≥ línea base; W0 verde |
| Migraciones | up/down contra Postgres real; `migration-order.spec.ts` |
| Evento | Integración Postgres + Redis reales: firma → outbox → MOD14 genera un único cobro; repetición idempotente |
| PDF | Integración del worker con Chromium real: PDF de 6 páginas sin módulos móviles; huella estable; alteración detectada |
| Seguridad | `sec-eng`: PDF y firma cifrados, URL firmada que vence, sin PII en logs ni colas, acceso del técnico solo durante la firma |
| Ola 5 | E2E del flujo con API y worker reales; E2E vivos de MOD05 y OT existentes en verde; axe en la consola de OT |
| G6.5 | CI de `main` verde sobre el commit publicado |

## 5. Matriz agente × skill

Claude Code **lee** cada `SKILL.md` antes de escribir código.

| Bloque | Agente | Obligatorias | De apoyo (condición) | Descartadas (motivo) |
|---|---|---|---|---|
| W0, QA | `sr-qa` | `testing-patterns`, `e2e-testing-patterns`, `iwana-test-evidence` | `wcag-audit-patterns` (ola 5); `e2e-triage` (si un E2E falla) | `test-driven-development` (W0 fija lo existente) |
| K | `sr-backend` | `typescript-expert`, `openapi-spec-generation` | `bullmq-specialist` (payload del evento) | `postgresql` (sin tablas) |
| A0-be, A, H, D, F-be | `sr-backend` | `nestjs-expert`, `iwana-tenant-migration`, `postgresql`, `backend-security-coder`, `openapi-spec-generation`, `testing-patterns` | `auth-implementation-patterns` (permiso nuevo) | `database-migration` (son migraciones tenant) |
| B | `sr-backend` + `plat-ops` | `bullmq-specialist`, `nestjs-expert`, `docker-expert`, `backend-security-coder` | `observability-engineer` (tiempos de render) | `iwana-tenant-migration` (sin tablas nuevas en B) |
| E | `sr-backend` | `bullmq-specialist`, `nestjs-expert`, `testing-patterns` | — | `openapi-spec-generation` (sin endpoint nuevo) |
| A0-fe, C, G, F-fe | `fe-platform` | `frontend-dev-guidelines`, `frontend-security-coder`, `system-vocabulary-review`, `testing-patterns` | `iwana-identity-ui-review` (paso «Contrato»); `wcag-audit-patterns` (canvas y lectura del PDF) | `core-components` (sin primitives nuevas) |
| Cierre de ola | sesión principal | `verification-before-completion`, `iwana-test-evidence`, `requesting-code-review` | `iwana-checkpoint-commit` (al commitear) | `dispatching-parallel-agents` (el plan define las olas) |
| Revisión | `boundary-reviewer` (olas 2–3), `contract-drift-reviewer` (olas 1–3), `test-change-reviewer` (si cambia un spec existente), `sec-eng` (olas 3 y 5), `gate-verifier` (cada ola), `docs-governance` (cierre) | — | — | — |

## 6. Riesgos

| # | Riesgo | Mitigación |
|---|---|---|
| R1 | Chromium no arranca en la imagen del worker (dependencias del sistema, sandbox) | `plat-ops` lo valida en la ola 2 con la imagen real antes de construir D |
| R2 | El técnico pierde conexión al generar o firmar | Generación idempotente por contrato y versión; la firma se reintenta con clave de idempotencia |
| R3 | Doble cobro por evento repetido | Idempotencia por contrato y periodo en MOD14 (gate «Evento») |
| R4 | Fecha de activación del aprovisionamiento no persistida en MOD05 | F-be la guarda al recibir `network.service-provisioning.activated`; D la exige |
| R5 | Plantilla sin aprobación de abogado registrada (G2) | CA-6: no se genera; desarrollo con versión de prueba marcada |

**Bloqueos abiertos:** ninguno (G2: la publicación exige la declaración de aprobación jurídica, sin datos del abogado).

## 7. Cierre de fase

Informe `docs/informes/INFORME-MOD05-CIERRE-VENTA-CIERRE-v1.0.md`: conteos por ola, evidencia de CA-1 a CA-14, líneas por superficie, libro de `atajo:` y lo omitido o no verificado (skill `iwana-cierre-fase`).

## 8. Lanzamiento

Ola 1 con dos encargos en paralelo (`sr-qa` W0 y `sr-backend` K), con este plan y la spec como fuente; consolidar en la sesión principal y seguir las olas de §3.
