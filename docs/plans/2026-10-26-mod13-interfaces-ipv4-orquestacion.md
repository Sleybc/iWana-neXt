# Plan — MOD13: interfaces y registro asistido de IPv4

**Versión:** 3.13
**Estado:** E7_resume v1.5 ejecutado como re-revisión documental sin re-ejecutar (launcher v1.19): `sr-qa` cierra P1-1/P1-2 y `sec-eng` mantiene el PASS de seguridad con C1 cerrada, C2 aceptada y C3 aceptada con C3.1/C3.2 cerradas y C3.3 previa al commit. AI-EM-ARCH dictamina **G6 PASS**. E7_resume v1.4 ejecutó V-0..V-5 y R-1..R-9 en una corrida única sobre E1 persistente; R-1..R-6, R-8 y R-9 PASS con evidencia; R-7 se sostiene por R-8 (R-7a) y por la guarda fail-closed con el 409 y el probe del mismo build (R-7b). Opción B y ADR-101 aprobados; G1–G4 PASS/cerrados; CA-R12 PASS en baseline sembrado aislado. G6.5 no se inicia todavía: requiere resolver los tres fallos del Portal completo y un CI Linux por SHA. G7 sigue separado/pendiente; `NETWORK_IP_PROTECTION=PENDING`; sin commit. La evidencia previa de paquetes/cobertura permanece en §10 y el informe vivo.
**Fecha:** 2026-10-27  
**Modo:** EM + Orchestrator  
**Objetivo:** resolver los seis puntos del catálogo con múltiples interfaces, continuidad router→red y reutilización segura de direcciones.

**Cambio v1.8 → v1.9:** registra la implementación y evidencia O2-M, integración FE/O3-Q, el nuevo candidato G4 v1.15 y sus correcciones de filtros/parámetros/pausa; incorpora la revisión SEC-ENG y deja G6 parcial hasta cerrar los residuos CA-R01–R12, el umbral de cobertura y el ensayo operativo de rollback. Los freezes v1.12/v1.13 conservan su carácter histórico.

**Cambio v1.9 → v2.0:** registra el G4 PASS/freeze v1.15 con hash final tras contract-drift PASS; actualiza conteos finales API/Portal, config fail-closed PENDING y SEC PASS condicionado; deja G6/CA-R12/rollback/G6.5/G7 abiertos con razones y evidencia.

**Cambio v2.0 → v2.1:** registra G4 v1.16 PASS tras review independiente y hash final; alinea el gateway confirmado con UX/runtime, preserva `VALIDATION_ERROR` legacy y distingue prefijo no asignable. Incorpora los fixes de QA a pruebas de catálogo y cobertura API 23/315 con módulo network sobre 80% agregado; deja G6 abierto por CA-R12, pruebas Redis omitidas y evidencia integrada restante.

**Cambio v2.1 → v2.2:** añade ejecución PostgreSQL + Redis de 1 suite/5 tests/0 skips, migration-order 1/6 y el resultado DATA-ENG de 0 tenants candidatos en `dbiw` para baseline legacy poblado. Mantiene G6 NO PASS por CA-R12 y evidencia live/visual/WCAG pendiente; `ipProtection=PENDING`.

**Cambio v2.2 → v2.3:** registra la decisión humana de sustituir el baseline legacy de `dbiw` por un tenant legacy sembrado con volumen en un entorno aislado; enmienda la matriz QA a v1.6 (§13.7, criterios E-1 a E-8) y emite el launcher v1.9 para plat-ops, data-eng, sr-qa y sec-eng. Traslada a G7 el riesgo residual del baseline sintético. No cambia el estado de ningún gate.

**Cambio v2.3 → v2.4:** registra las correcciones recomendadas por la revisión independiente SR-QA de v1.6 y publica matriz v1.7 con `/32` local, pools `/16–/30` con gateway, clones E-6/E-7, huellas por columnas legacy, EXPLAIN detallado y rollback seguro ante repeatables. SR-QA dio PASS documental final a v1.7; esto no cambia gates de ejecución. E-1 pasó con PostgreSQL tmpfs y Redis efímero; E-2/E-5 ahora pasan, E-6/E-7/E-8 siguen en ejecución.

**Cambio v2.4 → v2.5:** registra el PASS E-2/E-5 con 160 migraciones tenant hasta 164, cuatro huellas E-5 idénticas, conteos reales y clones E6/E7; refleja el límite de runtime (Redis `REDIS_DB`, sin `BullMQ.prefix` configurable) y separa procesos API/worker por rama. Publica matriz v1.8 y launcher v1.11; SR-QA dio PASS documental independiente a v1.8, sin cambiar los gates de ejecución. G6 sigue NO PASS.

**Cambio v2.5 → v2.6:** registra E-6/E-8 y el recheck E7_match; SR-QA confirmó E-6 de ejecución y E-7 NO PASS; SEC-ENG resolvió la condición del snapshot positivo y el LOW de rutas personales, manteniendo límites de loopback/TLS. El rollback original conserva un reconcile fallido, y el rollback integral nuevo no se ejecutó porque faltaba una topología privada demostrada durante el bootstrap del backend anterior. E-8 live pasó 2/2 pero la WCAG manual no quedó completa. El gate de paquetes API pasó tras corregir el inventario del flag destructivo de 165; Portal completo mantiene tres fallos fuera de MOD13. G6 queda NO PASS; G6.5/G7 siguen separados y `NETWORK_IP_PROTECTION=PENDING`.

**Cambio v2.6 → v2.7:** actualiza el seguimiento real después del retorno de sesión: boundary-reviewer PASS tras reemplazar las lecturas directas de `public.tenants` por `TenantLifecycleReadPort`; API completa 431/5.813 PASS/15 skips; cobertura focal actualizada a 23 suites/321 tests y seis fuentes core de red sobre 80% agregado en las cuatro métricas. E-8 live 2/2 y axe/teclado/foco 14/14 pasan dentro del alcance `PENDING`; SR-QA excluye formularios/estados ajenos a ese flujo. E-7_final demostró preflight con proxy loopback 3011 y backend privado sin puerto publicado, clon E7_match y Redis DB4 preparados con 17 colas pausadas; el rollback integral sigue en ejecución y no cambia G6. `NETWORK_IP_PROTECTION=PENDING`.

**Cambio v2.7 → v2.8:** cierra API completa con 431 suites/5.814 tests PASS y 15 skips guardados; build, typecheck y ESLint focal PASS. Las integraciones reales fallaron primero por metadata `Tenant` ausente en los fixtures (22/76 fallidos); se corrigieron ambos fixtures y el sanitizer que enmascaraba errores con `name` de solo lectura; rerun PostgreSQL/Redis 76/76 PASS. E-7_final ejecutó reconciliación controlada con el protector; G6 quedó abierto a espera de captura autenticada y SEC. `NETWORK_IP_PROTECTION=PENDING`.

**Cambio v2.8 → v2.9:** SEC-ENG dio PASS de seguridad a E7_final tras el POST autenticado en clon descartable con el mismo build: GET meta 200 `PENDING`, POST válido 409 `IP_PROTECTION_PENDING`, cero cambios de filas/hashes; el guard local deniega y la reserva legacy revierte. Los dos traces E7_final (19:31:56Z y 19:51:42Z) registran una ejecución completada cada uno, 8×100 y un snapshot positivo por ejecución. La segunda fue el avance selectivo de la ocurrencia repeatable de 19:45Z autorizado; la ocurrencia 20:00Z quedó diferida y sin procesar. El corte 17/17 pausado registró waiting/active/failed/paused-jobs/DLQ=0, delayed=3, repeatables=3 y baseline 6/6. El wrapper exit 1 provino de comparar repeatable scoped=1 con global=3; BullMQ emitió `completed`. SEC dio PASS y SR-QA reportó G6-ready; G6 espera gate-verifier y cierre AI-EM-ARCH. G6.5/G7 continúan separados. El contrato permanece fail-closed: `NETWORK_IP_PROTECTION=PENDING`.

**Cambio v2.9 → v3.0:** AI-EM-ARCH cierra CA-R12 y G6 PASS con E-1–E-8 revisados por SEC/SR-QA y los gates frescos del verificador: API 431/5.814, Portal MOD13 7/57, Web 38/233, DB 77/423, Shared 26/242 y UI 7/51; migración/orden 2 suites/8 tests; cobertura core y conjunto seleccionado sobre 80% agregada en las cuatro métricas. El rojo de Portal completo (3 suites/3 tests fallidos y 1 omitido) queda separado por ser de MOD05/comercial/RadioCardGroup. E1/E8 conservan evidencia live previa porque Docker Engine ya no está disponible; el teardown de los contenedores E1 no pudo verificarse, aunque el API/proxy propios están detenidos y no hay listeners en sus puertos. G6.5 CI Linux por SHA y G7 primer tenant real/decisión CTO siguen pendientes; `NETWORK_IP_PROTECTION=PENDING`.

**Cambio v3.0 → v3.1:** la revisión del cierre detectó que E7_final no probó la parte «reanudar y volver a avanzar» de E-7: terminó con 17/17 colas pausadas, `NETWORK_RESERVATIONS_PAUSED=true` y la reserva legacy solo en transacciones revertidas. G6 pasa a PASS condicionado a E7_resume. Se emiten el [encargo E7_resume v1.0](../prompts/PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.0.md) y el launcher v1.12 (plat-ops, sec-eng, sr-qa), que también cierra el teardown de E-1, pendiente porque Docker Engine no respondía.

**Cambio v3.1 → v3.2:** plat-ops detuvo E7_resume en R-0: Docker Engine no respondió (`docker info` y `docker ps -a` filtrado exit 1), por lo que E1 y E7_final quedaron sin verificar; no se tocaron DB/Redis ni se reconstruyeron recursos. El artefacto quedó `NOT_EXECUTED`, con SHA registrado en matriz §13.8. SEC no encontró bloqueos en el registro; SR-QA confirmó que no demuestra R-1–R-9. AI-EM-ARCH devuelve G6 a NO PASS conforme a la condición, deja G6.5 sin iniciar y conserva G7 separado y `NETWORK_IP_PROTECTION=PENDING`.

**Cambio v3.2 → v3.3:** el PostgreSQL de E-1 corría en tmpfs, así que E1 y E7_final se perdieron al detenerse el engine. Decisión humana: reconstruirlos con el generador versionado y verificar huellas antes de reanudar. Se emiten el [encargo E7_resume v1.1](../prompts/PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.1.md), con el paso R-0b y la protección de `e2-e5.json` (el generador lo sobrescribe), y el launcher v1.13. G6 sigue NO PASS.

**Cambio v3.3 → v3.4:** registra el intento E7_resume v1.1 detenido en R-0, los SHA del generador y E2/E5, y las revisiones SEC/SR-QA. E1/E7_final no se reconstruyeron; G6 permanece NO PASS, G6.5 no inicia, G7 sigue separado y `NETWORK_IP_PROTECTION=PENDING`.

**Cambio v3.4 → v3.5:** registra el segundo intento E7_resume v1.1: R-0/R-0b(a)/build PASS; generador detenido en R-0b(b) porque E1 aún no tenía el registro de migraciones públicas. E2/E5 fue restaurado al SHA original y E1 queda preservado. SEC/SR-QA no encontraron bloqueos documentales; no hay evidencia de E-7. G6 NO PASS.

**Cambio v3.5 → v3.6:** corrige la precondición faltante del generador: v1.2 aplica las migraciones públicas solo en el E1 aislado y verifica las 27 antes de sembrar; conserva E1/E2-E5 y el fallo v1.1 como historial. Se emite el launcher v1.14; los gates no cambian.

**Cambio v3.6 → v3.7:** registra el avance E7_resume v1.2 hasta R-0b(d): baseline público/tenant y 6/6 hashes legacy PASS, fixture/proyecciones y conteos parciales PASS; la huella `execution_orders` completa difiere de la histórica y no hay proyección histórica verificable. Data-eng, SEC y SR-QA coinciden en detener antes de R-1. G6 NO PASS; G6.5 no inicia; E1 queda preservado y `NETWORK_IP_PROTECTION=PENDING`. Se publica launcher v1.15.

**Cambio v3.7 → v3.8:** la fuente histórica de `execution_orders` existía: el helper de E7_match, que seguía en el temporal. Se preservó byte a byte como evidencia (SHA `2398d360…7004`). La diferencia con E7_final se debía a que el fixture versionado no copió tres literales (`customer_display_label`, `work_summary`, `started_at`), que la especificación de v1.1 no fijaba. Se emiten el [encargo E7_resume v1.3](../prompts/PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.3.md), porque v1.2 ya estaba ocupado, y el launcher v1.16. G6 sigue NO PASS.

**Cambio v3.8 → v3.9:** registra H-0 de E7_resume v1.3 como `NOT_EXECUTED`: Docker info/inspect exit 0, pero ambos contenedores E1 están `exited` con health `starting`. No se inició Docker ni los contenedores; no se consultaron DB/Redis, no se verificó el helper temporal y no se cambió el fixture. H-1–H-3/R-1–R-9 y teardown no ejecutados; los contenidos tmpfs quedan sin verificar. Se emite launcher v1.17; G6 NO PASS y `NETWORK_IP_PROTECTION=PENDING`.

**Cambio v3.9 → v3.10:** un reinicio de Docker Engine a las 21:59:20Z dejó los contenedores E1 en `Exited (255)` y borró su tmpfs; los contenedores de desarrollo, con política de reinicio, volvieron solos. Fue la tercera pérdida del entorno. Decisión humana: E1 con volúmenes nombrados, una sola corrida con checkpoints y sin versiones nuevas por intentos `NOT_EXECUTED`. Se emiten el [encargo E7_resume v1.4](../prompts/PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.4.md) y el launcher v1.18. G6 sigue NO PASS.

**Cambio v3.10 → v3.11:** registra el resultado de E7_resume v1.4 —V-0..V-5 y R-1..R-9 en corrida única; R-1..R-6/R-8/R-9 PASS y R-7 sin huellas persistidas— y el dictamen G6 NO PASS tras las revisiones `sr-qa` y `sec-eng`. Añade el artefacto consolidado `e7-resume-v1.4-r1-r9.json`, su sidecar y el alcance de v1.5; no se versiona el launcher ni se abre G6.5/G7.

**Cambio v3.11 → v3.12:** decisión humana de re-revisar G6 sin re-ejecutar. R-7a se apoya en R-8; R-7b, en el probe de captura con el mismo build y en la guarda estática de captura. AI-EM-ARCH retira el criterio «3002 intacto», declara MFA fuera de alcance y asume que su R-9 borró los runners. Se emiten el [encargo E7_resume v1.5](../prompts/PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.5.md) y el launcher v1.19. G6 sigue NO PASS hasta los dictámenes.

**Cambio v3.12 → v3.13:** registra el resultado de la re-revisión. `sr-qa` da PASS a P1-1 (R-8 para R-7a; guarda fail-closed, 409 y probe del mismo build para R-7b) y a P1-2 (límite declarado, nombre del consolidado y apéndice). `sec-eng` mantiene el PASS de seguridad: C1 cerrada con `docker info` 29.9.2 y los cuatro listados con exit 0, C2 aceptada y C3 aceptada con C3.1 (SHA de los dos runners supervivientes) y C3.2 (manifiesto de los 25 archivos de evidencia cruda) cerradas; C3.3 (versionar el saneador) queda previa al commit. AI-EM-ARCH dictamina **G6 PASS**. No se re-ejecutó nada, `NETWORK_IP_PROTECTION=PENDING`, G6.5 no inicia y G7 sigue separado. Sin commit.

**Definición propuesta:** [INFORME-MOD13-ROUTERS-ANALISIS-v1.0](../informes/INFORME-MOD13-ROUTERS-ANALISIS-v1.0.md). **Baseline aprobado:** [PRD v1.1](../prds/PRD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md), [HLD v1.1](../hlds/HLD-MOD13-RED-APROVISIONAMIENTO-FASE-01-v1.1.md), [ADR-044](../adrs/ADR-044-Separacion-OrganizationSite-NmsNode.md), [ADR-098](../adrs/ADR-098-IPAM-y-Aprovisionamiento-Certificado-MOD13.md).

## 1. Estado real de partida

**Decisión humana, 2026-10-26:** «Apruebo la opción B». Se ejecuta O0-D/O0-U/O0-B con el alcance ya aceptado. Los documentos de definición y los gates técnicos se consolidan con sus revisores; la aprobación de la opción no se solicita otra vez.

**Enmienda de protección, 2026-10-26:** el CTO aprobó formalmente la opción A de [ADR-101 v1.1](../adrs/ADR-101-Enmienda-ADR-098-Proteccion-IP-Infraestructura-MOD13-v1.1.md). Se registra la protección tenant-wide de IP locales en las tres rutas IPAM. G1 cerró con PASS independiente de AI-SR-FULL y AI-PROD-UX; el G4 original se cerró contract-first con v1.12 y luego se re-sincronizó a v1.13 para describir el 404 uniforme de order-context. La captura de IP locales sigue deshabilitada.

**Baseline legacy sembrado, 2026-10-27:** la búsqueda `READ ONLY` de DATA-ENG halló 0 tenants legacy elegibles en `dbiw`. Decisión humana: «Aprobado: sustituir el baseline legacy de dbiw por un tenant legacy sembrado con volumen en un entorno aislado.» Los criterios de aislamiento, volumen, procedencia sin PII, huellas, rollback y evidencia live están en la [matriz QA v1.7 §13.7](../quality/2026-10-26-mod13-interfaces-matriz.md). No se vuelve a buscar un tenant real en `dbiw` para G6.

- Corrección local del botón y ayudas: ejecutada en el turno previo; 2 suites/13 pruebas y validaciones estáticas registradas en el [informe UI](../informes/INFORME-MOD13-REVISION-UI-v1.0.md). No redespachar ni dar esa evidencia por una validación de B.
- Corte histórico previo a O2-M: interfaces/direcciones normalizadas, asociación de red y autocompletado estaban **sin implementar**. La implementación y validación O2-M actuales están registradas en §9.
- Hallazgos iniciales de referencias/PATCH/exclusiones se corrigieron en H; pruebas HTTP, unitarias y PostgreSQL de runtime constan en §9.
- NMS y descubrimiento RouterOS: fuera de alcance. Registrar nombres de interfaces lógicas no configura VLAN ni bridges.
- **Corte inicial previo a E1–E8 (2026-10-27; estado histórico):** G1–G4 estaban cerrados con PASS formal de AI-EM-ARCH y revisiones independientes. G4 v1.12/v1.13/v1.15 conserva PASS histórico; G4 v1.16 está congelado con paridad de 35 operaciones/29 paths y SHA-256 registrado en §9. En ese corte G6 aún estaba NO PASS por CA-R12 y evidencia integrada restante; el cierre vigente consta en §10. G6.5 y G7 siguen pendientes.
- La captura de nuevas IP locales no puede salir antes de que el IPAM las proteja. Las redes existentes y sus servicios deben seguir operando.
- **Registro histórico del G4 original, 2026-10-26:** la definición contract-first del protocolo §3bis acepta tipos/DTO compartidos más OpenAPI comprometida. El target v1.12 no afirmaba que los handlers existieran; el snapshot O2-C no recibió stubs. La re-sincronización G4 v1.13 y el runtime posterior se registran en §8. No reabrir B ni ADR-101.

## 2. Olas, responsables y salidas

| Ola / bloque                    | Responsable único | Alcance y artefacto de salida                                                                                                                      | Dependencia / salida                                                           |
| ------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| O0-D — modelo                   | `data-eng`        | Modelo, invariantes, locks, índices, transición y rollback en `docs/specs/2026-10-26-mod13-interfaces-modelo.md`                                   | Borrador documental; sin migración ni código                                   |
| O0-U — propuesta UX             | `prod-ux`         | Recorrido, datos conocidos/derivados/manuales, vocabulario y CA-R01–12 en `docs/specs/2026-10-26-mod13-interfaces-ux.md`                           | Paralelo a O0-D; sin UI detallada a cargo del orquestador                      |
| O0-B — contrato preliminar      | `sr-backend`      | Factibilidad y propuesta request/response/errores en `docs/specs/2026-10-26-mod13-interfaces-api.md`                                               | Usa D/U; consulta temprana en paralelo y consolidación después                 |
| O1-DS — contrato de componentes | `ds-owner`        | Anatomía, componentes existentes, estados y accesibilidad en `docs/specs/2026-10-26-mod13-interfaces-ds.md`                                        | Tras G1; consume UX y patrones existentes                                      |
| O1-F — factibilidad frontend    | `fe-platform`     | Dictamen vigente v1.2: `docs/informes/INFORME-MOD13-INTERFACES-FACTIBILIDAD-FE-v1.2.md`                                                            | UX/DS; revalidación D10 contra API v1.5                                        |
| O1-S — revisión de diseño       | `sec-eng`         | Diseño G3 en `INFORME-MOD13-INTERFACES-SEGURIDAD-v1.4.md`; re-review de runtime en `INFORME-MOD13-INTERFACES-SEGURIDAD-v1.5.md`                    | D/API; paralelo a DS/F, sin implementar hallazgos                              |
| O1-Q — estrategia QA            | `sr-qa`           | Matriz CA→test, factories y evidencia requerida en `docs/quality/2026-10-26-mod13-interfaces-matriz.md`                                            | CA y borradores; actualiza al congelar contratos                               |
| O2-C — publicación del contrato | `sr-backend`      | Entregado: shared types/Zod/DTO, snapshot runtime y target OpenAPI; G4 re-sync v1.16 congelado con 35 operaciones/29 paths; sin activar captura IP | Contract-drift PASS; metadata hash final verificada; G4 PASS                   |
| O2-H — integridad vigente       | `sr-backend`      | Puertos de sedes/cobertura, PATCH nullable y validación de exclusiones; pruebas y OpenAPI                                                          | Tras G4; solo este agente escribe las superficies backend/contratos            |
| O2-M — persistencia e IPAM      | `sr-backend`      | Entidades, migración tenant manual, protección de IP locales, concurrencia y ocupación                                                             | Secuencial a H por archivos compartidos; diseño D revisado                     |
| O2-FE — experiencia             | `fe-platform`     | Router→interfaces/redes, campos derivados y alternativa manual; reporte en `docs/informes/INFORME-MOD13-INTERFACES-IMPLEMENTACION-FE-v1.0.md`      | En paralelo con H/M contra contratos congelados y mocks; integrar después de M |
| O3-Q — validación integrada     | `sr-qa`           | PostgreSQL real, E2E, visual/a11y y evidencia en `docs/informes/INFORME-MOD13-INTERFACES-CALIDAD-v1.0.md`                                          | BE/FE integrados; no sustituye evidencia con mocks                             |
| O3-S — revisión final           | `sec-eng`         | Revalidación del diff y controles; actualización de su informe vivo                                                                                | Paralela a O3-Q; sin modificar implementación                                  |

**Actos de gobierno propios de AI-EM-ARCH:** consolidar D/U/B en adendas o nuevas versiones de PRD/HLD, registrar la confirmación del CTO sobre alcance/G1, resolver G2/G3, emitir los encargos G4 por ola y declarar la congelación de contratos **reales** por ruta/versión. No se asignan estos actos a un subagente ni se marca aprobado un artefacto propio sin revisión independiente.

Estado documental de definición: modelo v1.7 registra el baseline E-2/E-5; UX v2.2, DS v1.3, aprovisionamiento UX v1.3 y factibilidad FE v1.2. PRD/HLD vigentes v1.4 registran alcance y ejecución; la matriz QA v2.2, API v1.16 congelado e informes vivos registran revisión y evidencia. D3 conserva manage-only y D10 autoriza antes de leer proyecciones owner-side. El [encargo integral de ejecución](../prompts/PROMPT-MOD13-INTERFACES-IPV4-EJECUCION-v1.0.md) sigue siendo la fuente de alcance; el launcher v1.11 es el encargo histórico de inicio y este plan registra el estado y gates vigentes.

**Ruta crítica:** O0 → G1 → G2 → G3 → O2-C/review → G4 → O2-H → O2-M → integración con O2-FE paralelo → O3-Q/O3-S → G6 → CI por SHA/G6.5. **Estado actual al 2026-10-27:** O2-H/O2-M/FE integrados; G1–G4 cerrados PASS; CA-R12 conserva PASS del baseline sembrado. E-7_final probó rollback y protección, pero E7_resume quedó `NOT_EXECUTED` en R-0, por lo que G6 está NO PASS/reabierto. E-1–E-8 conservan sus resultados previos dentro de los límites documentados; el gate de reanudación de E-7 sigue abierto. La cobertura de seis fuentes core `network` supera 80% en las cuatro métricas. G6.5 no se inicia; G7 sigue separado y pendiente. `NETWORK_IP_PROTECTION` permanece `PENDING`.

## 3. Dispatch de agentes y skills

Todas las skills siguientes se verificaron contra `.agents/skills/<nombre>/SKILL.md` el 2026-10-26. Se leen como documentación antes de actuar. La matriz mantiene un responsable por bloque.

| Bloque      | Subagente     | Skills obligatorias                                                               | Apoyo y condición                                                                                                                                     | Descartadas y motivo                                                                                             | Gate ejecutable / comprobación                                                     |
| ----------- | ------------- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| O0-D        | `data-eng`    | `postgresql`, `architect-review`                                                  | `iwana-tenant-migration` para secuencia de transición; `database-migration` solo guía subordinada a AGENTS: sin generación automática                 | `bullmq-specialist`: no jobs; `docker-expert`: sin infraestructura                                               | Citas y ubicaciones; revisión de modelo por SR-FULL/SEC                            |
| O0-U        | `prod-ux`     | `brainstorming`, `system-vocabulary-review`, `iwana-identity-ui-review`           | `senior-ui-systems-designer` si requiere decisiones visuales; `core-components` para patrones disponibles                                             | `openapi-spec-generation`: no define API; `tailwind-patterns`: no implementa UI                                  | Auditoría documental; trazabilidad de CA-R01–12                                    |
| O0-B        | `sr-backend`  | `nestjs-expert`, `architect-review`, `openapi-spec-generation`                    | `typescript-expert` para contratos; `postgresql` para consulta de datos                                                                               | `auth-implementation-patterns`: no cambia login; `bullmq-specialist`: no eventos nuevos                          | Auditoría documental; factibilidad preliminar y ausencia de cambios productivos    |
| O1-DS       | `ds-owner`    | `core-components`, `iwana-identity-ui-review`, `system-vocabulary-review`         | `tailwind-patterns` al citar tokens reales; `wcag-audit-patterns` para estados                                                                        | `database-migration`: no datos; `frontend-dev-guidelines`: no código                                             | Contrato completo; tokens existentes; auditoría documental                         |
| O1-F        | `fe-platform` | `nextjs-app-router-patterns`, `frontend-dev-guidelines`, `architect-review`       | `core-components` para costo de composición                                                                                                           | `database-migration`: no backend                                                                                 | Dictamen separado de backend; costos relativos y bloqueos por contrato             |
| O1-S / O3-S | `sec-eng`     | `security-auditor`, `backend-security-coder`                                      | `frontend-security-coder` si revisión de UI expone datos; `architect-review` para puertos                                                             | `auth-implementation-patterns`: no rediseño de auth; `docker-expert`: no despliegue nuevo                        | Revisión de IDs, guards, logs y transacciones; hallazgos sin autoimplementar       |
| O1-Q        | `sr-qa`       | `testing-patterns`, `e2e-testing-patterns`                                        | `wcag-audit-patterns` al definir visual/a11y; `playwright-skill` al fijar selectores                                                                  | `iwana-matriz-motivos`: no cambia motivos MOD11↔MOD12                                                            | Matriz con prueba discriminante por criterio y fixtures sintéticas                 |
| O2-C        | `sr-backend`  | `openapi-spec-generation`, `typescript-expert`, `nestjs-expert`                   | `test-driven-development` para compatibilidad de esquemas                                                                                             | `iwana-tenant-migration`: sin DDL en este bloque                                                                 | Typecheck, pruebas de contratos y diff OpenAPI; publicación antes de congelar      |
| O2-H        | `sr-backend`  | `nestjs-expert`, `backend-security-coder`, `test-driven-development`              | `openapi-spec-generation` para errores/PATCH; `testing-patterns` para HTTP                                                                            | `bullmq-specialist`: sin jobs; `database-migration`: H no modifica schema                                        | Unit/HTTP/tenancy y typecheck; referencias por puertos                             |
| O2-M        | `sr-backend`  | `postgresql`, `iwana-tenant-migration`, `test-driven-development`                 | `database-migration` subordinada a AGENTS; `iwana-test-evidence` para Postgres real                                                                   | `bullmq-specialist`: sin worker; `docker-expert`: sin plataforma                                                 | Orden de migraciones, up/down/up aislado, concurrencia, ocupación y cobertura core |
| O2-FE       | `fe-platform` | `frontend-dev-guidelines`, `iwana-identity-ui-review`, `system-vocabulary-review` | `nextjs-app-router-patterns` para contexto/URL; `core-components` y `tailwind-patterns` para composición; `testing-patterns` si cambia comportamiento | `database-migration`: backend; `senior-ui-systems-designer`: no reabrir diseño congelado                         | ESLint/typecheck, componentes y `audit-ui.mjs`                                     |
| O3-Q        | `sr-qa`       | `testing-patterns`, `e2e-testing-patterns`, `iwana-test-evidence`                 | `playwright-skill` para E2E; `wcag-audit-patterns` para WCAG 2.2 AA; `verification-before-completion` al emitir dictamen                              | `iwana-matriz-motivos`: no nuevos motivos de inventario; `docker-expert`: operación de CI corresponde a PLAT-OPS | PostgreSQL real, cobertura core ≥80 %, E2E/visual/a11y y conteos no cacheados      |

No se necesitan plugins externos ni dependencias nuevas para esta evolución. Los auxiliares `boundary-reviewer`, `contract-drift-reviewer`, `gate-verifier` y `docs-governance` pueden revisar el diff cuando corresponda; no sustituyen al responsable ni aprueban implementación futura en esta definición.

## 4. Verificación ejecutable prevista

Estos comandos son **para la futura implementación**, no resultados de esta sesión. Antes de cada corrida se listarán sus pruebas y se registrarán suites, tests, skips y cobertura reales.

```powershell
pnpm lint
pnpm typecheck
pnpm --filter @iwana/shared exec jest contracts/network --listTests --runInBand
pnpm --filter @iwana/shared exec jest contracts/network --runInBand --no-cache
pnpm --filter @iwana/api exec jest modules/network --listTests --runInBand
pnpm --filter @iwana/api exec jest modules/network --runInBand --no-cache
pnpm --filter @iwana/api exec jest --config jest.integration.config.js modules/network --listTests --runInBand
pnpm --filter @iwana/api exec jest --config jest.integration.config.js modules/network --runInBand --no-cache
pnpm --filter @iwana/db exec jest src/migrations/tenant/migration-order.spec.ts --runInBand --no-cache
pnpm --filter @iwana/portal exec jest components/network --runInBand --no-cache
pnpm test:coverage
pnpm exec playwright test --config e2e/playwright.portal.config.ts e2e/tests/portal-network-provisioning-live.spec.ts
node .agents/skills/iwana-identity-ui-review/scripts/audit-ui.mjs apps/portal/src/components/network
pnpm audit:adr-citations
pnpm audit:doc-locations
pnpm sync:agents:check
```

Las specs nuevas de direcciones/locks deben quedar dentro de los patrones de integración reales y añadirse al inventario de pruebas del encargo final. La prueba `up/down/up` y la carrera alta de pool↔IP local no quedan cubiertas solo por `migration-order.spec.ts`: exigir ejecución contra PostgreSQL real en esquemas aislados construidos por migraciones reales, además del fixture simplificado actual de IPAM. Las carreras usan barreras y locks retenidos, en ambos órdenes; conservar además la prueba de 20 reservas concurrentes distintas. `@iwana/db` debe compilarse antes de migrar. No usar `--passWithNoTests`, `describe.skip` o caché de Turbo como evidencia. La cobertura reportará las métricas reales por módulo; el gate no se deduce del número de pruebas.

## 5. Riesgos, salida y decisiones pendientes

- **G1 PASS y cerrado:** opción B y ADR-101 v1.1 aprobados; AI-SR-FULL aprobó factibilidad backend de PRD/HLD y AI-PROD-UX aprobó alcance/producto, ambos tras revisar D-23–D-25. No volver a solicitar esas decisiones.
- **G2 PASS y cerrado:** DS-OWNER v1.2/v1.3, UX v2.1 y SR-QA v1.0; evidencia de estados en claro/oscuro y contraste en la matriz.
- **G3 PASS y cerrado por AI-EM-ARCH:** API funcional v1.5, DS v1.3, FE v1.2 PASS, SEC v1.4 PASS y QA v1.2 PASS recomendado, preservado en matriz v1.3. Se revisaron `EffectivePermissionScopePort`, D3 manage-only, D10 posterior a autorización, respuestas y linealización owner-side.
- **G4:** target original v1.12 y re-sync v1.13/v1.15 (35 operaciones/29 paths) conservan sus freezes y dictámenes históricos. El re-sync v1.16 alinea gateway, errores, filtros y UUID; contract-drift PASS independiente. El target y la copia activa coinciden con el sidecar SHA-256 `f38785c9a6615b69b28510cc64b8afed04a9ec15e6ab1f5db2e4b417f329ae70`. El freeze no certifica IPAM completo ni habilita captura.
- **O2-H PASS limitado:** implementa validación de referencias, PATCH nullable, exclusiones y autorización D23 antes de las lecturas owner-side. Cobertura, integración PostgreSQL, typecheck, lint y revisiones constan en §8. D10 se transfiere a M.
- **O2-FE integrado:** los flujos contra mocks tipados están integrados al runtime; Playwright O3-Q pasó 12/12 con axe, teclado, foco, seis combinaciones de viewport/tema y estados de pausa. El flujo usa mocks HTTP y no sustituye las pruebas API/PostgreSQL.
- **O2-M implementado:** entidades y migración tenant 165; IP locales protegidas tenant-wide en validación manual, asignación automática, ocupación y reutilización en regularización; carreras y MT-01 probados. El resumen de evidencia y límites está en §9 y el informe de calidad.
- **Integridad:** IDs inválidos/ajenos, PATCH que no desasocia y exclusiones inconsistentes se cierran en H; acceso entre módulos por puertos, nunca por tablas ajenas.
- **Concurrencia y rollback:** las tres rutas IPAM y las carreras principales están verificadas. CA-R12 quedó PASS con el ensayo E-7_final sobre el baseline sembrado aislado, incluido rollback old→protector sin perder la protección. E7_resume no pudo ejecutarse en R-0, así que G6 vuelve a NO PASS aunque CA-R12 conserve su resultado. El riesgo residual del baseline sintético se controla por G7 al repetir E-5/E-6 en el primer tenant real de beta. No volver a API antiguo ignorando la protección; rollout backend→UI.
- **Legacy:** mantener valores y servicios; sin crear interfaces o gateways mediante inferencias desde texto. Redes existentes con interfaz nula conservan operación. El baseline sembrado no reproduce toda la variedad de producción: antes de migrar el primer tenant real en la beta, G7 repite huellas y discriminantes (E-5/E-6) en lectura sobre ese tenant.
- **Semántica de direcciones históricas:** no ampliar silenciosamente el alcance de inmutabilidad de CIDR/gateway ni permitir cambiar una IP asignada por editar infraestructura.
- **G6/G6.5/G7 separados:** G6 está NO PASS/reabierto porque E7_resume no se ejecutó; el agregado `network` supera 80% en las cuatro métricas, con hotspot de branches por archivo en `network-interface-catalog.service`. G6.5 requiere resolver antes los tres fallos ajenos del Portal completo y luego CI Linux sobre SHA identificado; no se inicia mientras G6 siga abierto. G7 requiere repetir E-5/E-6 en el primer tenant real de beta y decisión del CTO. No reutilizar evidencia de otra fase.

## 6. Evidencia documental de la definición original (corte v1.6)

Revisión de archivos y cinco consultas expertas de solo lectura. SEC-ENG y SR-QA revisaron los artefactos emitidos y reportaron sin ajustes bloqueantes de definición, condicionado a los gates pendientes. Esta emisión no ejecuta pruebas de producto ni cambia código.

| Comprobación ejecutada                                  | Resultado real                                                                                                                      |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm audit:adr-citations`                              | Salida 0; 0 bloqueantes, 146 avisos globales; 86 ADRs indexados                                                                     |
| Auditoría de citas sobre los cuatro artefactos emitidos | Salida 0; sin hallazgos                                                                                                             |
| `pnpm audit:doc-locations`                              | Salida 0; 0 bloqueantes, 3 avisos globales en `.playwright-mcp/`; 2029 Markdown escaneados                                          |
| `pnpm sync:agents:check`                                | Salida 0; 13 agentes sincronizados                                                                                                  |
| Prettier sobre los cuatro artefactos de esta emisión    | Formato correcto                                                                                                                    |
| Comprobación de enlaces locales y espejo                | Enlaces resueltos en 4 archivos; launcher de 34 líneas; bloque idéntico al espejo del plan                                          |
| PostgreSQL de desarrollo (`dbiw`, solo lectura)         | `server_version_num=180003`; `set_masklen`, `host`, `network` y `broadcast` reportan `IMMUTABLE`; evidencia acotada a esa instancia |

Los avisos globales de esa auditoría no son aprobaciones de contenido y no se corrigen fuera del alcance de la definición. No se declara el repositorio sin deuda documental.

## 7. Evidencia del corte O2-C/G4 — 2026-10-26

| Comprobación ejecutada                                | Resultado real                                                                    |
| ----------------------------------------------------- | --------------------------------------------------------------------------------- |
| `@iwana/shared` full Jest `--runInBand --no-cache`    | 26 suites / 242 tests PASS                                                        |
| API full Jest baseline v1.10 `--runInBand --no-cache` | 423 suites / 5.631 tests PASS; 4 suites / 15 tests omitidos por guards existentes |
| Target v1.12 + snapshot runtime                       | 2 suites / 17 tests PASS; target contract-first 35 ops, runtime 21 ops            |
| Typecheck API + shared                                | PASS                                                                              |
| ESLint focal + Prettier                               | PASS                                                                              |
| `git diff --check`                                    | Exit 0; aviso CRLF en informe UI ajeno                                            |
| Reviews independientes G4                             | SEC-ENG PASS limitado; SR-QA PASS; contract-drift-reviewer PASS                   |

La corrida API full es baseline anterior al delta documental v1.11/v1.12; el test focal actual de contrato y snapshot se ejecutó otra vez tras registrar `FROZEN_BY_G4`. El informe vivo §8.3 separa esa evidencia de las pruebas futuras de tenancy, concurrencia, migración, E2E, accesibilidad y cobertura core.

## 8. Evidencia de ejecución — estado vigente 2026-10-26

- **G4 re-sync v1.13:** target con 35 operaciones/29 paths; snapshot histórico v1.12 preservado con SHA-256 `F0409834F55555B5322B07B61109039224AC48F7DE7990D97DD61B955C8FF533`. Re-sync añade solo el 404 `RESOURCE_NOT_FOUND` a `order-context`; contract-drift-reviewer, SEC-ENG y SR-QA PASS. Tests de contrato/Swagger: 2 suites/20 tests PASS; runtime 23 operaciones/20 paths.
- **O2-H PASS limitado:** cobertura no-cache 19 suites/195 tests. `ServiceProvisioningService`: 97.98% líneas, 96.88% statements, 97.10% funciones, 80.43% ramas; `NetworkCatalogService`: 94.79%, 92.17%, 96.07% y 80.00%. D23 HTTP + Tasks port en PostgreSQL `127.0.0.1:5433/dbiw`: 2 suites/18 tests PASS con schema aleatorio y verificación de aislamiento. Typecheck PASS; ESLint 0 errores/7 warnings preexistentes ajenos. SR-QA, SEC-ENG y boundary-reviewer PASS limitados. No incluye D10 ni M.
- **O2-FE PASS local:** Portal 6 suites/33 tests y `@iwana/ui` 1 suite/5 tests; revisión independiente SR-QA PASS. E2E, regresión visual 375/768/1280 claro/oscuro y WCAG manual quedan pendientes de integración.
- **O2-M:** habilitado después de H. Incluye D10, DDL/migración tenant, tres rutas IPAM, tenancy, contención del host deduplicado y rollback fail-closed. La migración debe recalcularse con la secuencia tenant vigente al crearla; el último archivo observado en la definición fue 164. Las carreras deben usar barreras y locks retenidos, sin sleeps; se exigen 20 reservas simultáneas, ambos órdenes IP↔reserva e IP↔alta pool, schemas de dos tenants, I-1 y EXPLAIN para /16.
- **Separación de gates:** CA-R12 y rollback son requisito para habilitar captura; G6 de QA/calidad, G6.5 CI Linux por SHA y G7 productivo permanecen separados. No se afirma cobertura/evidencia de M hasta su ejecución real.

## 9. O2-M y validación integrada — corte v2.6 (2026-10-27)

**Estado de implementación:** O2-H/O2-M y la integración FE están implementados. La migración tenant 165 y entidades son aditivas; el legacy permanece sin inferir interfaces ni gateways. La protección por host tenant-wide está activa en validación manual, asignación automática, ocupación y reutilización en regularización. `ipProtection=PENDING`; la UI no permite captura/corrección de IP local.

| Ejecución directa                            | Conteo / resultado                                                                                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| API network + inventory, cobertura sin caché | 23 suites / 315 tests / 0 skips. Incluye `network-catalog`, IPAM, interfaces, aprovisionamiento y utilidad inventory.                                                    |
| Portal network + portal-ui, sin caché        | 8 suites / 109 tests / 0 skips; la spec de copy 1 suite/14 tests está incluida.                                                                                          |
| OpenAPI + Swagger tras freeze                | 2 suites / 24 tests / 0 skips.                                                                                                                                           |
| Interceptor de auditoría                     | 1 suite / 5 tests / 0 skips; omite campos sensibles solo en copia auditada, conserva respuesta y metadata HTTP.                                                          |
| PostgreSQL real (`dbiw`, `127.0.0.1:5433`)   | 6 suites / 111 tests / 0 skips: D23/MT-01, cableado sobre migraciones tenant, auditoría, IPAM, catálogo y carreras.                                                      |
| Carrera L2 determinista                      | 1 suite / 71 tests / 0 skips; locks externos fuerzan ambos órdenes sin depender del orden de waiters.                                                                    |
| Migración tenant 165                         | 1 suite / 1 test / 0 skips; `up/down/up` real compara snapshot legacy sintético y bloquea `down` con datos/asociaciones nuevas. No hay snapshot de tenant poblado.       |
| Orden de migraciones tenant                  | 1 suite / 6 tests / 0 skips; warnings ts-jest por `packages/shared/dist/*.js`.                                                                                           |
| PostgreSQL + Redis real                      | 1 suite / 5 tests / 0 skips; `dbiw` + `iwana_redis_dev` en 6380, schema y prefijos de cola aleatorios; PING=PONG.                                                        |
| Portal E2E + axe                             | 1 archivo / 12 tests / 0 skips en mocks; 375/768/1280 light/dark, teclado, foco y axe. No se repitió: la suite escribe capturas aprobadas y el puerto 3002 está ocupado. |
| Typecheck monorepo                           | `pnpm typecheck`: 8 tareas exitosas, 6 cacheadas y 2 ejecutadas; API/Portal compilaron.                                                                                  |
| Lint API y formato                           | ESLint: 0 errores/7 warnings preexistentes fuera del delta; Prettier focal PASS. `git diff --check` exit 0 con aviso CRLF en informe UI ajeno.                           |

**Cobertura core (% statements / branches / functions / lines):** network agregado **96.06 / 82.91 / 98.40 / 99.12**; `network-catalog.service.ts` **96.36 / 86.47 / 98.36 / 99.73**; `ipam.service.ts` **97.43 / 97.50 / 100 / 98.59**; `network-interface-catalog.service.ts` **93.68 / 71.71 / 100 / 100**; `service-provisioning.service.ts` **97.13 / 82.26 / 97.18 / 98.15**. El gate agregado del módulo `network` supera 80% en las cuatro métricas; se conserva el hotspot de branches por archivo en `network-interface-catalog.service.ts`. El total de todos los archivos seleccionados fue **96.17 / 83.23 / 98.46 / 99.15**.

**Incidencias resueltas durante la validación:** una corrida inicial reprodujo una falla en el caso “reserva primero”; el test dependía del orden de adquisición de waiters. Se actualizó su barrera con locks externos que garantizan el orden probado. La suite corregida aislada pasó 1/1 y el rerun completo pasó 71/71. Una fixture PostgreSQL simplificada de auditoría no contenía `legacy_lan_interface_id` tras migración 165; se añadió el campo únicamente a la fixture y la suite pasó 2/2. La primera corrida del spec de eventos de provisioning quedó omitida al no detectar la bandera de Redis; la ejecución posterior apuntó a `iwana_redis_dev` en el puerto 6380 y pasó 1 suite/5 tests/0 skips. Las seis suites PostgreSQL previas del alcance pasaron 111/111.

**Revisiones y gates:** G4 v1.16 recibió contract-drift PASS, hash final verificado y fue congelado; v1.15 permanece inmutable como freeze histórico. DATA-ENG dio PASS limitado al baseline sintético pre/post migration 165. En lectura `READ ONLY` con `iwana_readonly`, la búsqueda de un tenant legacy elegible en `dbiw` encontró 0 candidatos, sin consultar IPs ni datos de abonados. Portal incluye copy específico para 13 códigos antes genéricos. SEC-ENG dio PASS del delta de pausa/privacidad/IPAM y guard 401/403; su PASS de config está condicionado a PENDING. SR-QA dio PASS documental final a v1.7 y v1.8, sin acreditar pruebas ni cambiar gates. E-1 PASS: PostgreSQL 18.3 en tmpfs y Redis efímero dedicado, loopback; puertos E6/E8 3004/3005 libres. DATA-ENG completó E-2/E-5: 160 migraciones tenant hasta 164, ciclo 165 `up/down/up`, seis tablas legacy con SHA/conteos iguales en cuatro cortes, integridad referencial sin inconsistencias y clones E6/E7 idénticos. QA y PLAT-OPS ejecutan E-6/E-8 y E-7 en paralelo mediante API 3004/3006 y Redis `REDIS_DB` separados; SEC-ENG revisará al cerrar esos bloques. G1–G4 están cerrados; G6 es NO PASS por CA-R12 y evidencia integrada pendiente. G6.5 Linux por SHA y G7 producción siguen pendientes. El detalle está en la [matriz QA v1.8](../quality/2026-10-26-mod13-interfaces-matriz.md) y el [informe de calidad v1.0](../informes/INFORME-MOD13-INTERFACES-CALIDAD-v1.0.md).
**Revisiones y gates al corte v2.6:** G4 v1.16 recibió contract-drift PASS y quedó congelado. DATA-ENG dio PASS limitado al baseline sintético pre/post migration 165. La búsqueda `READ ONLY` en `dbiw` encontró 0 tenants legacy elegibles. E-1/E-2/E-5 pasaron; la evidencia original E-7 dejó un job fallido y una cola pausada, y E7_match validó el caso positivo de batches sin repetir el rollback integral. E-8 live pasó 2/2 y la WCAG completa aún no estaba auditada. G1–G4 estaban cerrados; G6 NO PASS y `NETWORK_IP_PROTECTION=PENDING`. Ver los seguimientos v2.7 en secciones superiores, matriz §13.7 e informe vivo.

## 10. Seguimiento de reanudación y dictamen E7_resume — v3.2 (2026-10-27)

| Gate/evidencia | Estado real tras la reanudación |
| --- | --- |
| Boundary Modulith | `boundary-reviewer` PASS. Network inyecta `TenantLifecycleReadPort` exportado por TenantModule; no quedan lecturas directas de `public.tenants` en processors. Reconciliación sigue exigiendo `ACTIVE`/no eliminado; eventos admiten status no marcado para borrado y no eliminado. |
| API completa | Turbo `--force`, sin caché: 431 suites/5.814 tests PASS, 4 suites/15 tests omitidos por guards externos. Build, typecheck API y ESLint focal PASS. |
| Integraciones CA-R12 tras boundary | Primer intento rojo: 2 suites, 22 fallos/54 PASS de 76, por faltar `Tenant` en metadata TypeORM de ambos fixtures; el sanitizer también enmascaró un error getter-only. Tras agregar la entidad y endurecer el sanitizer: 2 suites/76 tests PASS/0 skips (eventos 5/5; carreras 71/71) contra E1/E6 y Redis DB5. |
| Cobertura core | 23 suites/321 tests/0 skips. Seis fuentes core `network`: 92,50/80,83/98,23/95,08; todos los archivos seleccionados: 92,66/81,12/98,28/95,20 statements/branches/functions/lines. Reconciliador y catálogo de interfaces siguen hotspots por archivo; ambos agregados superan 80%. |
| E-8 | Live contra API/Portal reales 2/2. E2E/axe mockeado Chromium 14/14, teclado/foco/errores y axe WCAG 2.2 AA en detalle/formulario interfaz `PENDING`, claro/oscuro. PASS solo dentro de ese alcance; no certifica formularios/estados restantes de MOD13. |
| E-7_final | API legacy en bridge privado sin PortBindings, inalcanzable desde host; proxy loopback `127.0.0.1:3011` con health 200 y 403 en las mutaciones. Protector `127.0.0.1:3010`, mismo build/hash que el probe; POST autenticado válido 409 `IP_PROTECTION_PENDING`, sin mutación en siete tablas; IP local `IP_PROTECTED_BY_INFRASTRUCTURE`; reserva legacy transaccional revertida. SEC: PASS de seguridad. |
| E-7_final Redis DB4 | Dos ejecuciones controladas completaron (traces 19:31:56Z y 19:51:42Z; cada una 8×100, snapshots `[0,1,0,0,0,0,0,0]`, cero errores/retries). La segunda fue el único avance autorizado de la ocurrencia 19:45Z; 20:00Z quedó diferida/sin procesar. No hubo retry ni reejecución de la ocurrencia 19:45Z. Wrapper exit 1 por aserción scoped=1 vs global=3; BullMQ `completed`. Corte: 17/17 paused, waiting/active/failed/paused-jobs/DLQ=0, delayed=3, repeatables=3, 6/6 hashes/checks. |
| E7_resume R-0 | **NOT_EXECUTED**. `docker info --format '{{.ServerVersion}}'` y `docker ps -a` filtrado terminaron exit 1 al fallar la conexión al pipe `npipe:////./pipe/dockerDesktopLinuxEngine`; no se pudo verificar E1 ni E7_final. Puerto 3014 libre; no listeners en 3010–3015, 5434 o 6381. Redis DB7 no leído; ninguna DB/Redis tocada; R-1–R-9 no ejecutados; `runnerExitCode=null`. JSON saneado SHA-256 `EE7DC6FB5171867D23DF8E442AB00FB9BD38D43B2224BB862B0B8983464DD7C8`. SEC no encontró bloqueos en el registro de preflight; SR-QA confirmó que no acredita reanudación, reserva/release HTTP, legacy 6/6 ni teardown. No se arrancó ni reconstruyó Docker/E1. |
| G6 / G6.5 / G7 | **G6 NO PASS/reabierto** por AI-EM-ARCH según §13.8: E7_resume no pudo ejecutarse en R-0. El gate-verifier y la evidencia previa de E-1–E-8 no sustituyen este criterio de E-7. **G6.5** no se inicia; además deben resolverse los tres fallos ajenos del Portal completo antes de CI Linux por SHA. **G7** primer tenant real/decisión CTO sigue pendiente y separado. `NETWORK_IP_PROTECTION=PENDING`. |

## 11. Resultado de E7_resume v1.1 — 2026-10-27

| Gate/evidencia | Resultado de esta ejecución |
| --- | --- |
| R-0 | **NOT_EXECUTED**: `docker info` y `docker ps` filtrado exit 1; pipe Docker Desktop ausente. E1/E7_final/Redis DB7 no verificables. |
| Preparación | SHA del generador coincide; archivos de conexión presentes (solo booleano); puertos 3014/5434/6381 libres; SHA E2/E5 sin cambio. |
| Ejecución | No se inició Docker ni se accedió a DB/Redis; R-0b(a/b/c/d), R-1–R-9 no ejecutados; runner null. |
| Revisiones | SEC: sin bloqueos en el registro, sin dictamen de recursos no inspeccionados. SR-QA: `NOT_EXECUTED`, no acredita criterios E-7. |
| Dictamen | G6 **NO PASS**. No iniciar G6.5; G7 permanece separado; `NETWORK_IP_PROTECTION=PENDING`. |

Artefacto v1.1 [e7-resume.json](../quality/evidence-mod13-ca-r12-e1/e7-resume.json), SHA-256 `CC3A1856C5199E5595F3210B54718ECE0350A8BCD9764E7441C90CBA66B31405`. El v1.0 anterior se preserva como [e7-resume-v1.0.json](../quality/evidence-mod13-ca-r12-e1/e7-resume-v1.0.json), SHA-256 `EE7DC6FB5171867D23DF8E442AB00FB9BD38D43B2224BB862B0B8983464DD7C8`. No se ejecutaron pruebas nuevas ni se hizo commit.

## 12. Resultado de E7_resume v1.1 — segundo intento (2026-10-27)

| Gate/evidencia | Resultado |
| --- | --- |
| R-0 | PASS: Docker 29.9.2, generador SHA correcto, sin contenedores E1 previos y puertos requeridos libres. |
| R-0b(a) | PASS: PostgreSQL y Redis E1 loopback/tmpfs saludables; sin persistencia; DB0–DB7 vacías al inicio. Digests y salidas están en el artefacto. |
| R-0b(b) | Build `@iwana/db` exit 0; generador exit 1 (`42P01`, falta `public.typeorm_migrations`). No migró, sembró ni creó clones. Se detuvo según el encargo. |
| E2/E5 | SHA restaurado e igual a original/backup: `8D20DBC5297E163FFA4E1640E216C750027243EA5956FACE38FE55593223D82A`. |
| Revisiones | SEC: sin bloqueos en el artefacto; SR-QA: no satisface E-7. Ambas revisiones no verificaron recursos live. |
| Dictamen | G6 **NO PASS**; G6.5 no inicia; G7 separado; `NETWORK_IP_PROTECTION=PENDING`. E1 queda preservado. |

El generador consulta `public.typeorm_migrations` antes de comenzar su trabajo tenant. R-0b(b) v1.1 no incluía aplicar las migraciones públicas al E1 recién creado; cualquier continuación requiere incorporar explícitamente ese bootstrap y verificar 27 migraciones públicas antes de correr el generador. Artefacto [e7-resume-v1.1-attempt2.json](../quality/evidence-mod13-ca-r12-e1/e7-resume-v1.1-attempt2.json), SHA-256 `6BF470CF0E9AB206F24692860F4A31F3FF0EE5E9A0FAAFDA3C74F8A8C741FB4B`. Sin pruebas nuevas ni commit.

## 13. Corrección operativa E7_resume v1.2 — 2026-10-27

La revisión estática del error R-0b(b) confirma que el generador consulta public.typeorm_migrations antes de sus etapas tenant y no aplica migraciones públicas. Por eso el v1.1 se detuvo en E1 recién creado. El encargo v1.2 agrega pnpm --filter @iwana/db migration:run, limitado a la DB E1 y ejecutado con sus credenciales locales en memoria; exige 27 filas públicas antes de volver a ejecutar el generador. No se autoriza db:migrate:all, migraciones tenant en este bootstrap ni acceso a dbiw. E1 y el artefacto del fallo permanecen preservados. G6 NO PASS hasta cerrar E7_resume y revisiones SEC/SR-QA.

## 14. Resultado de E7_resume v1.2 — R-0b(d) bloqueado (2026-10-27)

E7_resume v1.2 reconstruyó el baseline en E1 tras aplicar 27 migraciones públicas, generó el seed/clone y pasó 6/6 hashes legacy y los controles de conteo/referenciales. La verificación histórica de `execution_orders` quedó bloqueada: el SHA completo actual `9f6329fa…` no coincide con el histórico `42e4c46e…`; no hay una proyección histórica verificable que permita excluir divergencias en otras columnas. DATA-ENG y SR-QA indican no avanzar a R-1; SEC-ENG dio PASS acotado a artefactos. La inspección read-only de `pg_database` (exit 0) encontró E7/E7_final y ninguna DB `e7_match`; no hay una fuente de fila histórica en E1. R-1–R-9 y teardown no se ejecutaron. E1/E7_final permanecen preservados, G6 NO PASS y `NETWORK_IP_PROTECTION=PENDING`. Detalle y SHA completos en [matriz §13.12](../quality/2026-10-26-mod13-interfaces-matriz.md) y [E-7](../quality/evidence-mod13-ca-r12-e1/e7-rollback.md).

## 15. Fuente histórica recuperada y E7_resume v1.3 (2026-10-27)

El helper de E7_match se preservó como evidencia y explica la diferencia de `execution_orders`: el fixture no copió tres literales. El detalle y el criterio de comparación están en la matriz v2.7 §13.13.

### Snapshot del lanzamiento v1.16

El [snapshot v1.16](../prompts/PROMPT-MOD13-INTERFACES-IPV4-EJECUCION-LAUNCH-v1.16.md) emitió E7_resume v1.3. El launcher vigente v1.17 y el resultado de H-0 están en §16; los bloques v1.15, v1.14 y v1.13 quedan como snapshots.

### PROMPT DE LANZAMIENTO v1.16 — snapshot al lanzamiento

```markdown
# Lanzamiento — MOD13 · E7_resume v1.3: fixture alineado al helper histórico y reanudación

**Versión:** 1.16 · **Estado:** vigente; sustituye a v1.15 · **Fecha:** 2026-10-27
**Plan:** [orquestación v3.8](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md) · **Encargo:** [E7_resume v1.3](PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.3.md) · **Matriz:** [QA v2.7 §13.13](../quality/2026-10-26-mod13-interfaces-matriz.md)
**Evidencia:** [helper histórico](../quality/evidence-mod13-ca-r12-e1/e7-match-insert-helper.cjs.txt) · [R-0b(d) v1.2](../quality/evidence-mod13-ca-r12-e1/e7-resume-v1.2-r0bd.json) · [E-7](../quality/evidence-mod13-ca-r12-e1/e7-rollback.md) · **ADR:** [ADR-101 v1.1](../adrs/ADR-101-Enmienda-ADR-098-Proteccion-IP-Infraestructura-MOD13-v1.1.md) · **Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)

**Estado:** G6 NO PASS. v1.2 se detuvo en R-0b(d): el fixture no copió la fila de E7_match (difieren `customer_display_label`, `work_summary` y `started_at`). La fuente histórica es el helper de E7_match, ya preservado como evidencia (SHA `2398d360…7004`). Se reutilizan E1 y la semilla; no se vuelve a correr el generador. `NETWORK_IP_PROTECTION=PENDING`.

| #   | Subagente  | Encargo                                                                                                                                                                                               | Skills obligatorias                                                        | Insumo                              |
| --- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------- |
| 1   | `plat-ops` | H-0: preflight de Docker, E1, bases `…_e7`/`…_e7_final` y SHA del helper preservado frente al original del temporal.                                                                                  | `docker-expert`, `postgresql`                                              | Encargo v1.3; E1 preservado         |
| 2   | `data-eng` | H-1: alinear `scripts/mod13-ca-r12-e7-fixture.cjs` con los literales del helper, sin asignar `started_at`; registrar diff y SHA nuevos.                                                              | `postgresql`, `iwana-tenant-migration`                                     | Helper preservado; fixture actual   |
| 3   | `plat-ops` | H-2: renombrar el E7_final de v1.2 a `…_e7_final_v12`, recrear E7_final desde `…_e7` y aplicar el fixture. Tras H-3 PASS, ejecutar R-1 a R-9 (reanudación, reserva/release HTTP, rechazos, corte y teardown). | `docker-expert`, `database-migration`, `iwana-queue-inspect`, `postgresql` | Fixture #2; encargos v1.0/v1.1      |
| 4   | `sr-qa`    | H-3: derivar la fila esperada solo del helper y del catálogo; comparar `to_jsonb(r)` sin `created_at`/`updated_at` columna por columna. Después verificar R-1 a R-9 contra E-7 y §13.8.               | `iwana-test-evidence`, `verification-before-completion`, `postgresql`      | Helper; E7_final de #3; matriz v2.7 |
| 5   | `sec-eng`  | Revisar los artefactos de H-3 y R-1 a R-9: `PENDING` mantenido, sin secretos ni PII, la reserva no tocó direcciones locales y el teardown eliminó credenciales y bases.                                 | `security-auditor`                                                         | Resultados #3/#4; ADR-101 v1.1      |

**Secuencia:** #1 → #2 → #3 (H-2) → #4 (H-3) → solo con H-3 PASS, #3 (R-1 a R-9) → (#4 ∥ #5) → dictamen de AI-EM-ARCH sobre G6. Una columna distinta detiene el ensayo. Sin commit. G6.5 y G7 siguen separados; antes de G6.5, resolver los 3 fallos del Portal completo ajenos a MOD13.
```

## 16. E7_resume v1.3 — H-0 `NOT_EXECUTED` (2026-10-27)

Docker respondió, pero el preflight detectó los contenedores PostgreSQL y Redis E1 en estado `exited`, health `starting`; H-0 requiere ambos saludables. Plat-ops no los inició ni reconfiguró. Por detención inmediata no comprobó la existencia de `…_e7`/`…_e7_final` ni comparó el helper temporal; solo se comprobó la copia preservada contra el SHA esperado. No se corrieron H-1–H-3/R-1–R-9, pruebas ni teardown. Los contenedores siguen presentes, pero los datos en tmpfs no se dan por preservados. Artefacto saneado: [H-0](../quality/evidence-mod13-ca-r12-e1/e7-resume-v1.3-h0.json). G6 NO PASS, `NETWORK_IP_PROTECTION=PENDING`.

## 17. E7_resume v1.4 — E1 persistente y corrida única (2026-10-27)

E1 pasa de tmpfs a volúmenes nombrados con `--restart unless-stopped`. El encargo v1.4 integra bootstrap público, generador, fixture alineado, V-5 (antes H-3) y R-1 a R-9 en una corrida con checkpoints. Un bloqueo de entorno se anota en E-7 y no versiona este plan. Detalle en la matriz v2.9 §13.15.

## 18. E7_resume v1.5 — re-revisión sin re-ejecutar (2026-10-27)

La nota v1.5 lleva a `sr-qa` y `sec-eng` los argumentos de la matriz v2.11 §13.17 sobre P1-1, P1-2 y C1–C3. Si `sr-qa` no los acepta, se emite aparte una corrida completa.

**Resultado (2026-10-27).** `sr-qa` dio PASS a P1-1 (R-8 para R-7a; guarda fail-closed, 409 y probe del mismo build para R-7b) y a P1-2 (límite declarado de runners, nombre del consolidado y apéndice completo). `sec-eng` mantuvo el PASS de seguridad, cerró C1 con `docker info` 29.9.2 y los cuatro listados con exit 0, aceptó C2 y C3, y cerró C3.1/C3.2; C3.3 quedó cerrada al versionar el saneador en `scripts/build-repo-artifact.cjs` y copiar los 25 crudos al repo. AI-EM-ARCH dictamina **G6 PASS**. El detalle está en el [apéndice E7_resume v1.5](../quality/evidence-mod13-ca-r12-e1/e7-rollback.md) y en la matriz v2.12 §13.17. `NETWORK_IP_PROTECTION=PENDING`; G6.5 no inicia todavía y G7 sigue separado. El commit de la fase incluye la evidencia y el saneador.

### Lanzamiento vigente

El archivo [launcher vigente v1.19](../prompts/PROMPT-MOD13-INTERFACES-IPV4-EJECUCION-LAUNCH-v1.19.md) es la fuente y prevalece si diverge. Los bloques v1.18 y anteriores quedan como snapshots.

### PROMPT DE LANZAMIENTO v1.19 — bloque copiar/pegar

```markdown
# Lanzamiento — MOD13 · E7_resume v1.5: re-revisión de G6 sin re-ejecutar

**Versión:** 1.19 · **Estado:** vigente; sustituye a v1.18 · **Fecha:** 2026-10-27
**Plan:** [orquestación v3.12](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md) · **Encargo:** [E7_resume v1.5](PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.5.md) · **Matriz:** [QA v2.11 §13.17](../quality/2026-10-26-mod13-interfaces-matriz.md)
**Evidencia:** [R-1 a R-9 v1.4](../quality/evidence-mod13-ca-r12-e1/e7-resume-v1.4-r1-r9.json) · [probe de captura](../quality/evidence-mod13-ca-r12-e1/e7-auth-capture-probe.json) · [E-7](../quality/evidence-mod13-ca-r12-e1/e7-rollback.md) · **Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)

**Estado:** G6 NO PASS tras v1.4 por P1-1 (R-7 sin huellas persistidas) y P1-2 (entrega documental). Decisión humana: re-revisión sin re-ejecutar. R-7a se apoya en R-8; R-7b, en el probe de captura con el mismo build y en la guarda estática; 3002 se retira del criterio y MFA queda fuera de alcance. `NETWORK_IP_PROTECTION=PENDING`.

| #   | Subagente | Encargo                                                                                                                                                                                | Skills obligatorias                                     | Insumo                                  |
| --- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------------------------- |
| 1   | `sr-qa`   | Re-evaluar P1-1 con §2 (R-8 para R-7a; probe + mismo build + guarda para R-7b) y P1-2 con §3. Dictaminar PASS o NO PASS con razón; sin ejecutar contra bases ni colas.               | `iwana-test-evidence`, `verification-before-completion` | Encargo v1.5; artefactos v1.4 y probe   |
| 2   | `sec-eng` | Cerrar C1 repitiendo en solo lectura los cuatro listados de Docker y la búsqueda de temporales; revisar C2/C3 contra las disposiciones de §3.                                           | `security-auditor`                                      | Encargo v1.5; ADR-101 v1.1              |

**Secuencia:** (#1 ∥ #2) → apéndice en E-7 → dictamen de AI-EM-ARCH sobre G6. Si `sr-qa` no acepta §2, AI-EM-ARCH emite aparte una corrida completa. Sin commit. G6.5 y G7 siguen separados; antes de G6.5, resolver los 3 fallos del Portal completo ajenos a MOD13.
```

### PROMPT DE LANZAMIENTO v1.18 — bloque copiar/pegar

```markdown
# Lanzamiento — MOD13 · E7_resume v1.4: E1 persistente y corrida única hasta el teardown

**Versión:** 1.18 · **Estado:** vigente; sustituye a v1.17 · **Fecha:** 2026-10-27
**Plan:** [orquestación v3.10](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md) · **Encargo:** [E7_resume v1.4](PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.4.md) · **Matriz:** [QA v2.9 §13.15](../quality/2026-10-26-mod13-interfaces-matriz.md)
**Evidencia:** [helper histórico](../quality/evidence-mod13-ca-r12-e1/e7-match-insert-helper.cjs.txt) · [E2/E5](../quality/evidence-mod13-ca-r12-e1/e2-e5.json) · [E-7](../quality/evidence-mod13-ca-r12-e1/e7-rollback.md) · **ADR:** [ADR-101 v1.1](../adrs/ADR-101-Enmienda-ADR-098-Proteccion-IP-Infraestructura-MOD13-v1.1.md) · **Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)

**Estado:** G6 NO PASS. Un reinicio de Docker Engine (21:59:20Z) borró por tercera vez el E1 en tmpfs. v1.4 recrea E1 con volúmenes nombrados y `--restart unless-stopped`, y ejecuta de V-0 a R-9 en una sola corrida con checkpoints. Los intentos `NOT_EXECUTED` solo se anotan en E-7, sin versionar plan ni matriz. `NETWORK_IP_PROTECTION=PENDING`.

| #   | Subagente  | Encargo                                                                                                                                                                                  | Skills obligatorias                                                        | Insumo                              |
| --- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ----------------------------------- |
| 1   | `data-eng` | V-4 (código): alinear `scripts/mod13-ca-r12-e7-fixture.cjs` con los literales del helper, sin asignar `started_at`; registrar diff y SHA. Puede ir en paralelo con #2.                     | `postgresql`, `iwana-tenant-migration`                                     | Helper preservado; encargo v1.3 H-1 |
| 2   | `plat-ops` | V-0 a V-3: preflight, E1 con volúmenes, bootstrap público y generador protegiendo `e2-e5.json`. Con #1 listo: V-4 (E7_final) y, tras V-5 PASS, R-1 a R-9 con teardown de contenedores y volúmenes. | `docker-expert`, `database-migration`, `iwana-queue-inspect`, `postgresql` | Encargo v1.4; fixture #1            |
| 3   | `sr-qa`    | V-5: fila esperada solo del helper y del catálogo; comparación sin `created_at`/`updated_at`. Al final, verificar R-1 a R-9 contra E-7 y §13.8.                                           | `iwana-test-evidence`, `verification-before-completion`, `postgresql`      | Helper; E7_final de #2; matriz v2.9 |
| 4   | `sec-eng`  | Revisar artefactos y teardown: `PENDING` mantenido, sin secretos ni PII, reserva sin direcciones locales, volúmenes y credenciales retirados.                                            | `security-auditor`                                                         | Resultados #2/#3; ADR-101 v1.1      |

**Secuencia:** (#1 ∥ #2 V-0 a V-3) → #2 V-4 → #3 V-5 → solo con V-5 PASS, #2 R-1 a R-9 → (#3 ∥ #4) → dictamen de AI-EM-ARCH sobre G6. Ante una interrupción, reanudar desde el último checkpoint verificado. Sin commit. G6.5 y G7 siguen separados; antes de G6.5, resolver los 3 fallos del Portal completo ajenos a MOD13.
```

### PROMPT DE LANZAMIENTO v1.17 — corte bloqueado en H-0

```markdown
# Lanzamiento — MOD13 · E7_resume v1.3: preflight E1 no saludable

**Versión:** 1.17 · **Estado:** vigente; sustituye a v1.16 · **Fecha:** 2026-10-27
**Plan:** [orquestación v3.9](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md) · **Encargo:** [E7_resume v1.3](PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.3.md) · **Matriz:** [QA v2.8 §13.14](../quality/2026-10-26-mod13-interfaces-matriz.md)
**Evidencia:** [H-0](../quality/evidence-mod13-ca-r12-e1/e7-resume-v1.3-h0.json) · [helper preservado](../quality/evidence-mod13-ca-r12-e1/e7-match-insert-helper.cjs.txt) · [E-7](../quality/evidence-mod13-ca-r12-e1/e7-rollback.md) · **ADR:** [ADR-101 v1.1](../adrs/ADR-101-Enmienda-ADR-098-Proteccion-IP-Infraestructura-MOD13-v1.1.md)

**Estado:** H-0 `NOT_EXECUTED`: Docker 29.9.2 responde, pero PostgreSQL y Redis E1 están `exited`/`starting`. No se iniciaron ni reconfiguraron; las DB y el helper temporal no se verificaron. H-1–H-3/R-1–R-9 no ejecutados. G1–G4 PASS; G6 NO PASS; tmpfs no se da por preservado; `NETWORK_IP_PROTECTION=PENDING`.

| # | Subagente | Encargo | Skills obligatorias | Insumo |
| --- | --- | --- | --- | --- |
| 1 | `plat-ops` | Repetir solo H-0 cuando E1 esté saludable; comprobar DBs y helper temporal. No iniciar/recrear contenedores ni correr el generador. | `docker-expert`, `postgresql` | E1; evidencia H-0 |
| 2 | `data-eng` | H-1 solo tras H-0 PASS: alinear fixture con el helper histórico. | `postgresql`, `iwana-tenant-migration` | Helper preservado; fixture |
| 3 | `plat-ops` | H-2 y, solo tras H-3 PASS, R-1–R-9 conforme al encargo v1.3. | `docker-expert`, `database-migration`, `iwana-queue-inspect`, `postgresql` | E1; E7; prompt v1.3 |
| 4 | `sr-qa` | H-3 como comparador independiente; después verifica R-1–R-9. | `iwana-test-evidence`, `verification-before-completion`, `postgresql` | Helper; matriz v2.8 |
| 5 | `sec-eng` | Revisar H-3 y resultados R-1–R-9; mantener PENDING y revisar seguridad/teardown. | `security-auditor` | Evidencia; ADR-101 |

**Secuencia:** H-0 PASS → H-1 → H-2 → H-3 PASS → R-1–R-9 → revisión SEC/SR-QA → dictamen AI-EM-ARCH. Sin reconstruir E1, sin commit. G6.5/G7 permanecen separados.
```

### Snapshot del lanzamiento v1.16

El [snapshot v1.16](../prompts/PROMPT-MOD13-INTERFACES-IPV4-EJECUCION-LAUNCH-v1.16.md) emitió E7_resume v1.3 antes del preflight H-0; el estado resultante se registra arriba.

### PROMPT DE LANZAMIENTO v1.15 — corte bloqueado en R-0b(d)

```markdown
# Lanzamiento — MOD13 · E7_resume v1.2: bloqueo de equivalencia histórica

**Versión:** 1.15 · **Estado:** vigente; sustituye a v1.14 · **Fecha:** 2026-10-27
**Plan:** [orquestación v3.7](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md) · **Encargo:** [E7_resume v1.2](PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.2.md) · **Matriz:** [QA v2.6 §13.12](../quality/2026-10-26-mod13-interfaces-matriz.md)
**Evidencia:** [R-0b(c/d)](../quality/evidence-mod13-ca-r12-e1/e7-resume-v1.2-r0bd.json) · [reconstrucción](../quality/evidence-mod13-ca-r12-e1/e7-resume-rebuild-e2-e5.json) · [E-7](../quality/evidence-mod13-ca-r12-e1/e7-rollback.md) · **ADR:** [ADR-101 v1.1](../adrs/ADR-101-Enmienda-ADR-098-Proteccion-IP-Infraestructura-MOD13-v1.1.md)

**Estado:** R-0b(b2)/R-0b(c) PASS; en R-0b(d), 6/6 hashes legacy y conteos PASS, `execution_orders` bloqueado: SHA histórico `42e4c46e…` ≠ actual `9f6329fa…`, sin proyección histórica comparable. E1 no contiene DB `e7_match` (catálogo leído, exit 0). SEC PASS acotado a artefactos; data-eng y SR-QA: no iniciar R-1. G6 NO PASS; E1/E7_final preservados; `NETWORK_IP_PROTECTION=PENDING`.

| # | Subagente | Encargo | Skills obligatorias | Insumo |
| --- | --- | --- | --- | --- |
| 1 | `data-eng` | Continuar solo si se recupera una fuente histórica verificable para comparar la proyección completa de `execution_orders`; E1 no contiene `e7_match`. No inferir equivalencia ni alterar criterios. | `postgresql`, `iwana-tenant-migration` | R-0b(d); E-7; fixture versionado |
| 2 | `plat-ops` | No iniciar R-1–R-9 hasta recibir comparación histórica independiente PASS; preservar E1/E7_final y no tocar Redis/colas. | `docker-expert`, `database-migration`, `iwana-queue-inspect`, `postgresql` | E1; E7_resume v1.2 |
| 3 | `sec-eng` | Mantener PENDING y revisar cualquier artefacto nuevo antes de uso. | `security-auditor` | Evidencia y ADR-101 v1.1 |
| 4 | `sr-qa` | Confirmar que la equivalencia cumple matriz §13.9 antes de desbloquear E-7. | `iwana-test-evidence`, `verification-before-completion` | Matriz v2.6; dictamen data-eng |

**Secuencia:** #1 → si y solo si comparación histórica verificable PASS, #2 R-1–R-9 → (#3 ∥ #4) → dictamen AI-EM-ARCH. Sin alterar E-7, sin commit. G6.5/G7 siguen separados.
```

### Snapshot del lanzamiento v1.14

El [snapshot v1.14](../prompts/PROMPT-MOD13-INTERFACES-IPV4-EJECUCION-LAUNCH-v1.14.md) dirigió E7_resume v1.2 con bootstrap público explícito; llegó hasta R-0b(d) y quedó detenido por el bloqueo documentado en §14.

### PROMPT DE LANZAMIENTO v1.14 — bloque copiar/pegar

```markdown
# Lanzamiento — MOD13 · E7_resume v1.2: bootstrap público, reconstrucción y reanudación

**Versión:** 1.14 · **Estado:** vigente; sustituye a v1.13 · **Fecha:** 2026-10-27
**Plan:** [orquestación v3.6](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md) · **Encargo:** [E7_resume v1.2](PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.2.md) · **Matriz:** [QA v2.5 §13.11](../quality/2026-10-26-mod13-interfaces-matriz.md)
**Evidencia:** [intento v1.1](../quality/evidence-mod13-ca-r12-e1/e7-resume-v1.1-attempt2.json) · [E-7](../quality/evidence-mod13-ca-r12-e1/e7-rollback.md) · [E2/E5](../quality/evidence-mod13-ca-r12-e1/e2-e5.json) · **ADR:** [ADR-101 v1.1](../adrs/ADR-101-Enmienda-ADR-098-Proteccion-IP-Infraestructura-MOD13-v1.1.md)

**Estado:** G1–G4 PASS; G6 NO PASS. E7_resume v1.1 se detuvo porque E1 no tenía `public.typeorm_migrations`; E1 está preservado. v1.2 aplica primero las 27 migraciones públicas solo en E1 y luego ejecuta el generador. Docker Desktop debe permanecer abierto. `NETWORK_IP_PROTECTION=PENDING`.

| # | Subagente | Encargo | Skills obligatorias | Insumo |
| --- | --- | --- | --- | --- |
| 1 | `data-eng` | Tras el seed, fixture OT determinista y validación de huellas en R-0b(c/d). | `postgresql`, `iwana-tenant-migration` | E2/E5; E-7; generador |
| 2 | `plat-ops` | R-0 a R-0b(b2); reutiliza E1; bootstrap público, semilla y protección E2/E5. | `docker-expert`, `database-migration`, `postgresql` | Encargo v1.2; intento v1.1 |
| 3 | `sec-eng` | Revisar secretos, protección IP, E2/E5, teardown y límites de seguridad del resultado. | `security-auditor` | Resultado #2; ADR-101 |
| 4 | `sr-qa` | Revisar huellas, 17/17, reconcile natural, reserva/release, legacy 6/6 y teardown. | `iwana-test-evidence`, `verification-before-completion` | Resultado #2; matriz v2.5 |

**Secuencia:** #2 hasta R-0b(b2) → #1 → #2 desde R-0b(c/d) hasta R-9 → (#3 ∥ #4) → AI-EM-ARCH. No commit. G6.5 espera G6 y resolver los 3 fallos externos del Portal; G7 sigue separado.
```

### Snapshot del lanzamiento v1.13

El [snapshot v1.13](../prompts/PROMPT-MOD13-INTERFACES-IPV4-EJECUCION-LAUNCH-v1.13.md) dirige E7_resume v1.1: reconstrucción de E1/E7_final con huellas, reanudación y teardown. El bloque v1.12 queda como snapshot.

#### PROMPT DE LANZAMIENTO v1.13 — snapshot copiar/pegar

```markdown
# Lanzamiento — MOD13 · E7_resume v1.1: reconstrucción, reanudación y teardown

**Versión:** 1.13 · **Estado:** vigente; sustituye a v1.12 · **Fecha:** 2026-10-27
**Plan:** [orquestación v3.3](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md) · **Encargo:** [E7_resume v1.1](PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.1.md) · **Matriz:** [QA v2.3 §13.8](../quality/2026-10-26-mod13-interfaces-matriz.md)
**Evidencia:** [E-7](../quality/evidence-mod13-ca-r12-e1/e7-rollback.md) · [E2/E5](../quality/evidence-mod13-ca-r12-e1/e2-e5.json) · **ADR:** [ADR-101 v1.1](../adrs/ADR-101-Enmienda-ADR-098-Proteccion-IP-Infraestructura-MOD13-v1.1.md) · **Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)

**Estado:** G1–G4 PASS. G6 NO PASS: E7_resume v1.0 terminó `NOT_EXECUTED` en R-0 y el tmpfs de E-1 se perdió con el engine. v1.1 reconstruye E1/E7_final con el generador (SHA `91b78e32…ed9`) y exige huellas iguales antes de reanudar. Requisito previo: el usuario abre Docker Desktop. `NETWORK_IP_PROTECTION=PENDING`.

| #   | Subagente  | Encargo                                                                                                                                                                                                       | Skills obligatorias                                                         | Insumo                            |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------- |
| 1   | `data-eng` | R-0b(c): versionar `scripts/mod13-ca-r12-e7-fixture.cjs` con la fila de OT de E7_match y tiempos fijos; validar en R-0b(d) que las 6 huellas legacy igualan E2/E5 y las proyecciones igualan E7_final.        | `postgresql`, `iwana-tenant-migration`                                      | Generador; evidencia E2/E5 y E-7  |
| 2   | `plat-ops` | R-0 a R-9 de v1.1: recrear E-1 en tmpfs, correr el generador protegiendo `e2-e5.json`, crear E7_final, reanudar 17 colas y admisión, reserva y release HTTP, rechazos 409/protegida, corte y teardown completo. | `docker-expert`, `database-migration`, `iwana-queue-inspect`, `postgresql`  | Encargo v1.1; fixture #1          |
| 3   | `sec-eng`  | Revisar que `PENDING` se mantuvo, que no quedaron secretos en artefactos ni temporales, que la reserva no tocó direcciones locales y que el teardown eliminó credenciales y bases.                              | `security-auditor`                                                          | Resultado #2; ADR-101 v1.1        |
| 4   | `sr-qa`    | Verificar contra E-7 y §13.8: equivalencia por huellas, 17/17 reanudadas, reconcile natural `completed`, deltas de R-6, legacy 6/6, `e2-e5.json` intacto y cada runner con exit 0.                           | `iwana-test-evidence`, `verification-before-completion`                     | Resultado #2; matriz v2.3         |

**Secuencia:** #2 hasta R-0b(b) → #1 → #2 desde R-0b(c) → (#3 ∥ #4) → dictamen de AI-EM-ARCH sobre G6. Cualquier huella distinta detiene el ensayo. Sin commit. G6.5 y G7 siguen separados; antes de G6.5, resolver los 3 fallos del Portal completo ajenos a MOD13.
```

El [launcher v1.12](../prompts/PROMPT-MOD13-INTERFACES-IPV4-EJECUCION-LAUNCH-v1.12.md) dirigió E7_resume; el R-0 terminó en `NOT_EXECUTED`. El launcher v1.11 y el v1.9 con el que se retomó el encargo quedan como cortes históricos. El encargo E7_resume permanece pendiente de un entorno Docker verificable; no reconstruir E1 ni la semilla. No cambia el alcance del encargo integral v1.0.

### PROMPT DE LANZAMIENTO v1.12 — snapshot al lanzamiento (R-0 terminó NOT_EXECUTED)

```markdown
# Lanzamiento — MOD13 · E7_resume: reanudación tras rollback y teardown de E1

**Versión:** 1.12 · **Estado:** vigente; sustituye a v1.11 · **Fecha:** 2026-10-27
**Plan:** [orquestación v3.1](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md) · **Encargo:** [E7_resume v1.0](PROMPT-MOD13-INTERFACES-IPV4-E7-RESUME-v1.0.md) · **Matriz:** [QA v2.1 §13.7](../quality/2026-10-26-mod13-interfaces-matriz.md)
**Evidencia previa:** [E-7](../quality/evidence-mod13-ca-r12-e1/e7-rollback.md) · **ADR:** [ADR-101 v1.1](../adrs/ADR-101-Enmienda-ADR-098-Proteccion-IP-Infraestructura-MOD13-v1.1.md) · **Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md)

**Estado al lanzamiento:** G1–G4 PASS. G6 PASS **condicionado** a E7_resume: E7_final probó el rollback y la protección, pero no la reanudación (17/17 colas pausadas, admisión cerrada, reserva solo transaccional). Si E7_resume falla o no puede ejecutarse, G6 se reabre. El R-0 de este intento terminó `NOT_EXECUTED`; el estado vigente está en §10. `NETWORK_IP_PROTECTION=PENDING`.

| #   | Subagente  | Encargo                                                                                                                                                                                                  | Skills obligatorias                                                   | Insumo                          |
| --- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------- |
| 1   | `plat-ops` | Ejecutar R-0 a R-9 del encargo: clon de E7_final, reanudar 17 colas y admisión, reserva y release HTTP autenticados, IP local rechazada (409 y protegida), corte de huellas y colas, teardown de E1.        | `docker-expert`, `database-migration`, `iwana-queue-inspect`, `postgresql` | Encargo E7_resume; clon E7_final |
| 2   | `sec-eng`  | Revisar que `PENDING` se mantuvo, que la reserva no tocó direcciones locales, que no quedaron secretos en artefactos ni temporales y que el teardown es completo.                                            | `security-auditor`                                                    | Resultado #1; ADR-101 v1.1      |
| 3   | `sr-qa`    | Verificar contra E-7 de la matriz que la reanudación quedó probada: 17/17 reanudadas, ocurrencia natural de reconcile `completed`, deltas esperados, legacy 6/6 y runner con exit 0.                       | `iwana-test-evidence`, `verification-before-completion`               | Resultado #1; matriz v2.1       |

**Secuencia:** #1 → (#2 ∥ #3) → dictamen de AI-EM-ARCH sobre la condición de G6. Si R-0 encuentra E1 o E7_final ausentes, #1 reporta `NOT_EXECUTED` con la causa y no reconstruye nada. Sin commit. G6.5 por SHA Linux y G7 permanecen separados; antes de G6.5 deben resolverse los 3 fallos del Portal completo ajenos a MOD13.
```

### PROMPT DE LANZAMIENTO v1.11 — bloque histórico anterior a la reanudación

```markdown
# Lanzamiento — MOD13 · CA-R12, E-2/E-5 PASS y QA/rollback aislados

**Versión:** 1.11 · **Estado:** vigente; sustituye a v1.10 y aclara el aislamiento que soporta el runtime · **Fecha:** 2026-10-27
**Plan:** [orquestación v2.5](../plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md) · **PRD:** [v1.4](../prds/PRD-MOD13-INTERFACES-IPV4-ADDENDUM-v1.4.md) · **HLD:** [v1.4](../hlds/HLD-MOD13-INTERFACES-IPV4-ADDENDUM-v1.4.md)
**Spec:** [API v1.16 congelada](../specs/2026-10-26-mod13-interfaces-api.md) · **Modelo:** [v1.7 E-2/E-5](../specs/2026-10-26-mod13-interfaces-modelo.md) · **Matriz:** [QA v1.8 §13.7](../quality/2026-10-26-mod13-interfaces-matriz.md)
**Plantilla:** [TEMPLATE-PROMPT-LANZAMIENTO.md](TEMPLATE-PROMPT-LANZAMIENTO.md) · **Encargo:** [ejecución v1.0](PROMPT-MOD13-INTERFACES-IPV4-EJECUCION-v1.0.md)

**Estado:** G1–G4 PASS; G4 v1.16 congelado (`f38785c9a6615b69b28510cc64b8afed04a9ec15e6ab1f5db2e4b417f329ae70`). E-1/E-2/E-5 PASS; E-6/E-8 y E-7 en ejecución; G6 NO PASS; `NETWORK_IP_PROTECTION=PENDING`. SR-QA dio PASS documental a v1.7 y a la aclaración v1.8 (Redis DB/procesos por clon); no cambia gates de ejecución.

| #   | Subagente  | Encargo                                                                                                                                                                                                         | Skills obligatorias                                                                      | Insumo                                 |
| --- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------- |
| 1   | `plat-ops` | **Completado:** PostgreSQL tmpfs y Redis efímero dedicados en loopback; no se accedió a `dbiw`; API 3004/Portal 3005 libres al preparar E-1.                                                                    | `docker-expert`, `database-migration`                                                    | Matriz v1.8 §13.7 E-1                  |
| 2   | `data-eng` | **Completado:** E-2/E-5 PASS; generador determinista, 160 migraciones tenant hasta 164, ciclo real 165 `up/down/up`, cuatro cortes de seis tablas con hashes iguales; clones E6/E7 idénticos.                   | `postgresql`, `iwana-tenant-migration`, `database-migration`                             | Evidencia `e2-e5.json`; modelo v1.7    |
| 3   | `sr-qa`    | E-6/E-8 en DB E6: API 3004, Portal 3005, `REDIS_DB=0`; I-1=0, estados preservados, protección IPAM, down bloqueado y EXPLAIN comparable; E2E live/WCAG manual, sin actualizar snapshots.                        | `iwana-test-evidence`, `e2e-testing-patterns`, `wcag-audit-patterns`, `testing-patterns` | DB E6; API v1.16; matriz v1.8          |
| 4   | `plat-ops` | E-7 en DB E7: build anterior exacto API 3006, `REDIS_DB=1`; detener productores/schedulers/workers, verificar repeatables y todos los estados; bloqueo externo antes del bootstrap y hasta restaurar protector. | `docker-expert`, `database-migration`, `iwana-queue-inspect`                             | DB E7; HEAD previo `81adebe9`; ADR-101 |
| 5   | `sec-eng`  | Revisar generador/origen, Redis DBs y procesos aislados, E-6/E-7 y rollback; mantener PENDING y captura bloqueada hasta CA-R12 PASS.                                                                            | `security-auditor`                                                                       | E-2–E-8; matriz v1.8; ADR-101 v1.1     |

**Secuencia:** #1 → #2 → (#3 ∥ #4) → #5 solo con DBs, `REDIS_DB`, API y worker efectivamente separados; la app no admite `BullMQ.prefix` configurable. Si cualquier aislamiento no se verifica, serializar #3/#4. Mantener `PENDING`. G7 repite E-5/E-6 en lectura sobre primer tenant real de beta; G6.5 por SHA Linux y G7 permanecen separados. Sin NMS/RouterOS ni mezcla sede física, nodo técnico y cobertura.
```

El siguiente bloque conserva literalmente el prompt original del usuario para trazabilidad. Es histórico; la definición, G4 y la implementación O2-H/O2-M/FE ya avanzaron. Para continuar, usar launcher v1.11 y el estado de este plan.

```text
Actúa como AI-EM-ARCH según AGENTS.md y docs/roles/Perfil_IA_EM_Architect_Unificado_v2.md.
La opción B ya está aprobada. Ejecuta docs/prompts/PROMPT-MOD13-INTERFACES-IPV4-EJECUCION-v1.0.md.
Lee docs/plans/2026-10-26-mod13-interfaces-ipv4-orquestacion.md y retoma el estado real sin rehacer lo terminado.
Usa los agentes y SKILL.md de la matriz: data-eng, prod-ux y sr-backend para consolidar; ds-owner y fe-platform para diseño/factibilidad; sec-eng y sr-qa para revisar.
Completa PRD/HLD y G1–G3 con revisión independiente; publica contratos reales y registra su congelación/G4.
Después delega backend y frontend: H→M secuencial, FE paralelo contra mocks tipados y posterior integración.
Resuelve los seis puntos, conserva legacy y protege IP de infraestructura en todo IPAM antes de habilitar su captura.
Sin ampliar a NMS/RouterOS ni mezclar sede física, nodo técnico y cobertura.
Ejecuta pruebas reales de tenancy, concurrencia, migración, E2E y accesibilidad; reporta conteos, cobertura y gates separados.
No te detengas en otro plan ni pidas de nuevo aprobación de B; continúa los bloques habilitados y reporta bloqueos concretos.
```
