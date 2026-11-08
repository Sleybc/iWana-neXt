# Plan — privacy · Correcciones de los bloqueos de G7

> Para agentes ejecutores: leer `executing-plans` como documentación al ejecutar este plan. No repetir bloques con evidencia cerrada; conservar todos los cambios ajenos del workspace.

**Versión:** 1.0
**Estado:** En ejecución por instrucción del responsable del proyecto; definición de H-EXP en revisión
**Fecha:** 2026-11-07
**Modo:** EM / Architect / Orchestrator
**Objetivo:** registrar la firma confirmada, definir H-EXP, clasificar las 37 columnas de MOD14 y ejecutar la migración 177 y su verificación por tenant en desarrollo.
**Arquitectura:** conservar el Modulith, participantes por módulo y `SET LOCAL search_path` por transacción. H-EXP reutilizará las reglas existentes después de revalidar todos los deberes de conservación; esta ola emite su definición, sin construir el motor nuevo.
**Stack:** el vigente en [Stack_Tecnologico.md](../prds/Stack_Tecnologico.md), sin cambios de dependencias.
**Entradas:** [HLD privacy v1.5](../hlds/HLD-PRIVACY-HABEAS-DATA-v1.5.md), [spec del barrido v1.2](../specs/2026-11-03-privacy-barrido-texto-libre-supresion-spec.md), [ADR-104 aprobado](../adrs/ADR-104-Enmienda-ADR-094-D7-Retencion-PQR-y-Veracidad.md), [informe vivo de cierre](../informes/INFORME-PRIVACY-BARRIDO-TEXTO-LIBRE-CIERRE-v1.0.md).

## 1. Alcance y autorización

La instrucción del responsable del proyecto autoriza los cuatro trabajos. Su afirmación de que el abogado ya firmó cierra la falta de firma mediante el [acta de referencia](../legal/ACTA-PRIVACY-RETENCION-IWANA-2026-11-07.md), sin inventar copia, firma, PII o huella del original. No autoriza producción ni da por implementado H-EXP.

Los cambios MOD14 corrigen reglas omitidas, sin acortar retención: solo se aplican cuando la supresión ya procede. No se usa `--apply` de anonimización para forzar un cero en esta ola. La migración corre en desarrollo, previa inspección de historial y prerrequisitos; no se salta el orden de migraciones para insertar la 177 sobre una cadena incompleta. Dependencias ordinarias necesarias se aplican solo después de revisar su impacto; contracts destructivos con opt-in quedan fuera.

## 2. Bloques, ownership y dependencias

| Bloque | Responsable | Rutas propias | Salida y stop/go |
| --- | --- | --- | --- |
| G7-L | Gobierno AI-EM-ARCH | Acta, ADR-104 (seguimiento sin cambiar decisión), spec barrido, HLD y cierre vivo | Firma registrada según declaración; no se atribuye a las demás consultas jurídicas |
| G7-H | `sr-backend` (definición, consulta técnica) | `docs/specs/2026-11-07-privacy-h-exp-retencion-spec.md` | Spec implementable; cualquier enmienda de inmutabilidad o nuevo contrato autenticado se declara propuesta y exige gate previo |
| G7-M | `sr-backend` | `apps/api/src/cli/text-erasure-manifest.ts`; participante Billing y pruebas; participante CRM y pruebas solo para respaldo 175; guardas de anulación Billing | Clasificar las 37 columnas con escritor/consumidor; cerrar `void_note` y respaldo con prueba; no basta sustituir etiquetas |
| G7-T | `plat-ops` | `docs/informes/INFORME-PRIVACY-G7-TENANTS-v1.0.md`; evidencia agregada en `docs/informes/evidence/privacy-g7-2026-11-07/` | Historial antes/después, políticas y CHECK, `--verify-only` real por tenant, omisiones y ceros vacíos explícitos |
| G7-R | `sec-eng` | Revisión de solo lectura de G7-H/G7-M | Riesgos de retención, nuevo canal worker/API, inmutabilidad y no reintroducción de texto; hallazgos con rutas y severidad |
| G7-Q | `gate-verifier` | Revisión/ejecución de solo lectura del diff de G7-M | Conteos sin caché, integración real, lint/typecheck y cobertura acotada; no confundir G6 local con G6.5 Linux |

G7-H y G7-M se ejecutan en paralelo porque tienen ownership disjunto. G7-T compila artefactos actuales; si G7-M termina después, se reconstruye el CLI y se repite `--verify-only` con las reglas finales. G7-R sigue a H/M. G7-Q sigue al diff final; no se revierten migraciones en los tenants operativos para probar un `down`.

## 3. Dispatch de agentes y skills

Todas las skills siguientes existen en `.agents/skills/<nombre>/SKILL.md`, comprobadas contra disco. Se leen como documentación, no como tool nativa.

| Bloque | Subagente | Obligatorias | Apoyo (condición) | Descartadas y motivo | Gate ejecutable |
| --- | --- | --- | --- | --- | --- |
| G7-H | `sr-backend` | `docs-architect`, `postgresql`, `bullmq-specialist` | `backend-security-coder` al definir canal interno | `openapi-spec-generation`: aún no se implementa endpoint | CA trazables y revisión cruzada G7-R |
| G7-M | `sr-backend` | `nestjs-expert`, `testing-patterns`, `iwana-test-evidence` | `backend-security-coder` para guardas; `postgresql` para respaldo | `database-migration`: no cambia schema | Jest focal antes/después e integración PostgreSQL |
| G7-T | `plat-ops` | `database-migration`, `postgresql`, `verification-before-completion` | `iwana-test-evidence` si ejecuta pruebas | `bullmq-specialist`: operación CLI, no colas nuevas | Runner canónico y CLI compilados, exit code y conteos por tenant |
| G7-R | `sec-eng` | `security-auditor`, `backend-security-coder` | `postgresql` al revisar retención/transacciones | `openapi-spec-generation`: revisión, sin publicar contrato | Dictamen independiente sin P1 abierto |
| G7-Q | `gate-verifier` | `iwana-test-evidence`, `verification-before-completion` | `testing-patterns` para interpretar alcance | `database-migration`: sin nueva migración del diff | `pnpm --filter @iwana/api lint`, `pnpm --filter @iwana/api typecheck`, Jest sin caché |

## 4. Pasos y evidencia

- [x] Abrir perfil, bootstrap, reglas y documentos de origen; declarar ownership de agentes.
- [x] Registrar la confirmación de firma en acta sin PII y actualizar seguimiento de ADR-104.
- [ ] Emitir spec H-EXP v1.0 con relojes, concurrencia, auditoría, errores y pruebas.
- [ ] Revisar las 37 decisiones MOD14; corregir residuos y escritores que los reintroduzcan; comprobar los conteos contra línea base.
- [ ] Ejecutar la cadena necesaria hasta 177 por tenant elegible y `--verify-only`; incluir no elegibles y motivo.
- [ ] Repetir verificación con artefacto final si cambian reglas de Billing/CRM durante la operación.
- [ ] Ejecutar revisiones independientes G7-R/G7-Q y auditorías `pnpm audit:doc-locations` y `pnpm audit:adr-citations`.
- [ ] Actualizar cierre vivo con estado real, cifras, cobertura y `git diff --shortstat` acotado.

## 5. Condición de salida e impactos

Se entrega una spec, una clasificación completa respaldada por reglas y pruebas, y evidencia operativa local. H-EXP sigue bloqueando G7 hasta construirlo y probarlo; su plan de implementación se emite después de resolver sus decisiones de arquitectura y seguridad. No se publica ni aprueba producción en esta ola. No se hacen commits ni push solicitados implícitamente.

**Tenancy:** cada operación deriva tenant/schema del registro, sin cruces. **Seguridad:** salida agregada, cero PII/secretos, sin `--apply` ni conservación indefinida presentada como resuelta. **Escala:** ejecución y evidencia por tenant; H-EXP requiere lotes acotados y cursor. **Regulación:** se aplican ADR-094/104 aprobados; no se inventan plazos ni se extiende la firma a otros dictámenes. **Simplicidad:** ampliar participantes y guardas existentes; evitar nuevo motor dentro de esta corrección.

## Lanzamiento

El archivo [PROMPT-PRIVACY-G7-REVISION-LAUNCH-v1.0.md](../prompts/PROMPT-PRIVACY-G7-REVISION-LAUNCH-v1.0.md) es la fuente y prevalece. El bloque siguiente lanza solo la revisión pendiente; no vuelve a ejecutar migraciones ni bloques ya cerrados.

```text
Actúa como AI-EM-ARCH. Lee AGENTS.md y docs/plans/2026-11-07-privacy-g7-correcciones-orquestacion.md v1.0.
Revisa la spec docs/specs/2026-11-07-privacy-h-exp-retencion-spec.md v1.0 y los informes MOD14 y tenants enlazados en el cierre vivo.
No repitas G7-L/M/T cerrados. Despacha sec-eng y gate-verifier solo para revisiones aún pendientes según G7-R/Q y sus skills.
H-EXP está definido, no implementado: resuelve sus decisiones y gates antes de emitir el encargo de construcción; no declares G7 GO por crear la spec.
Consolida hallazgos y evidencia en el informe vivo; producción requiere aprobación del CTO.
```

## 6. Revisión de AI-EM-ARCH al reanudar (2026-11-07)

La sesión que ejecutaba este plan se cortó. Estado comprobado sobre el árbol, sin commit:

| Bloqueo | Estado | Hallazgo |
| --- | --- | --- |
| Firma (G7-L) | ✅ Cerrado | Acta sin PII; ADR-104 §6 y spec del barrido §13 actualizados |
| H-EXP (G7-H) | Spec v1.0 emitida, **sin G0** | Sigue bloqueando G7: falta construirla. Decisiones abiertas en su §10 |
| MOD14 (G7-M) | Código hecho, **no cerrable** | Unitarias 4/4 suites y 83 pruebas en verde. Pero: 56 caracteres U+FFFD en `text-erasure-manifest.ts` (tildes y `§` perdidos en los motivos nuevos); Prettier falla en 6 archivos; el manifiesto cita `INFORME-MOD14-PRIVACY-CLASIFICACION-v1.0.md`, que no existe; integración sin medir |
| Tenants (G7-T) | Migración hecha, **verificación incompleta** | 7 ACTIVE con 173–177. `--verify-only`: 6 en cero (vacíos), T01 (fixture E2E de privacidad) con 25 titulares y 50 residuos de reglas nuevas, 17 INACTIVE con fallo del CLI sin causa registrada. Falta `INFORME-PRIVACY-G7-TENANTS-v1.0.md` y repetir con las reglas finales de MOD14 |

Siguiente: bloque R1 ([lanzador](../prompts/PROMPT-PRIVACY-G7-CORRECCIONES-R1-LAUNCH-v1.0.md)), después G7-R y G7-Q.

### 6.1 R1 cerrada (2026-11-08), verificada por AI-EM-ARCH

- **G7-M:** manifiesto con 0 U+FFFD (704 entradas: 184 cubiertas, 520 excluidas, 0 `PENDIENTE-MOD14`); Prettier limpio en las 11 rutas; [informe de clasificación](../informes/INFORME-MOD14-PRIVACY-CLASIFICACION-v1.0.md) con 37 columnas y 7 reglas; único cambio de aserción `EXPECTED_PENDING_MOD14 → EXPECTED_CLASSIFIED_MOD14`, ordenado por G7-M.1.
- **G7-T:** [informe de tenants](../informes/INFORME-PRIVACY-G7-TENANTS-v1.0.md). 17 INACTIVE fallan cerrado por `SIN_MIGRACION_150`; T01 remediado de 50 a 0 residuos (25 solicitudes); los 7 ACTIVE en 0 con el CLI final. `nonproductionKeyFallback` era una anotación del generador: desarrollo no define `PII_ENCRYPTION_KEY` y usa el respaldo no productivo, coherente entre escritor y verificador.
- **Hallazgo para G7-R:** `--apply` con solo `--request` sobre una solicitud ya resuelta sale con exit 0 sin cambiar nada (`resolveCliScope` no resuelve por `anonymized_request_id`). Un operador creería haber remediado.
- **Siguiente:** G7-R y G7-Q con el [lanzador v1.1](../prompts/PROMPT-PRIVACY-G7-REVISION-LAUNCH-v1.1.md); después, commit y la Fase 1 de H-EXP.

### 6.2 G6 de R1 ✅ (2026-11-08)

- **G7-R (`sec-eng`):** sin P1. `void_note` y el respaldo 175 no dejan texto; las guardas de anulación se serializan con la supresión (`FOR SHARE` frente a `FOR UPDATE`); las exclusiones de muestra tienen escritor real; la evidencia no tiene identificadores. Un hallazgo Medio: el del CLI.
- **G7-Q, completado por AI-EM-ARCH:** unitarias de `apps/api` 483 suites y 6.396 pruebas sin caché (180 s); integración completa como en CI 74 suites y 518 pruebas, 0 fallos (272 s); typecheck y lint en 0 errores (7 avisos ajenos); 0 U+FFFD.
- **R2, corrección del CLI (Medio, antes de cualquier `--apply` fuera de T01):** [lanzador](../prompts/PROMPT-PRIVACY-G7-CLI-R2-LAUNCH-v1.0.md). Va antes de la Fase 1 de H-EXP, que reutiliza el mismo adaptador.
