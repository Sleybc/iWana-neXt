# INFORME — MOD11 Operaciones · OLA 4 · Dictamen SEC-ENG — Re-verificación AppSec (etapa 6)

**Versión:** 1.0
**Actualización (reanudación):** 2026-09-13 — SEC-D1 **verificado y cerrado** tras la entrega de AI-SR-QA; [CONSULTA] asíncrona **cerrada**; veredicto final consolidado en §1.
**Estado:** Emitido — re-verificación AppSec cerrada (G6). SEC-D1 verificado. [CONSULTA] cerrada. Observaciones residuales no bloqueantes: SEC-D4 (Baja, funcional) y SEC-O2 (Baja). Condición externa ajena a seguridad: DEF-F6-01 (QA, funcional, dueño AI-SR-FULL) — ver §10.
**Fecha:** 2026-09-13
**Autor:** AI-SEC-ENG (Security Engineer / AppSec) — auditoría en modo solo lectura; no se modificó código, tests ni contratos; sin git commit ni ramas.
**Orden que acota:** docs/prompts/PROMPT-MOD11-OPERACIONES-SUBRUTAS-OLA4-SEC-ENG-v1.0.md v1.0 (etapa 6; G6 exige re-verificación AppSec).
**Punto de partida:** docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA2-SEC-ENG-v1.0.md (APROBADO CON OBSERVACIONES; condición D-1 levantada).
**Contexto normativo aplicado:** protocolo v1.5 (§2 RACI — Seguridad aplicativa: SEC-ENG R; §3 etapa 6 y gates; §4 gates 1, 7, 8; §6.2/§6.3 marcadores; §7.4 citas verificadas); spec docs/specs/2026-09-13-mod11-operaciones-subrutas-bandeja-ot-design.md v1.0 §5; ADR-065 v1.2 (§15, §22-bis), ADR-067 v1.0 (proyección mínima y finalidad por campo), ADR-066 v1.0; tabla de finalidad por campo en docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-G3-FACTIBILIDAD-BACKEND-v1.0.md §7. Baseline OWASP ASVS L2 (V4.1/V4.2 autorización, V5 validación, V6.3 aislamiento multi-tenant, V16.5 regresión).
**Skills leídas antes de revisar:** security-auditor, backend-security-coder, frontend-security-coder (obligatorias); testing-patterns (apoyo). Declaradas en §7.

---

## 1. VEREDICTO (FINAL)

> ## **APROBADO CON OBSERVACIONES**
>
> La re-verificación AppSec de la ola 4 (etapa 6, componente SEC-ENG) **cierra completa**: el scoping por actor no es eludible desde el frontend, el total del pie refleja el alcance del actor (ADR-065 §15), la proyección visible coincide con la tabla de finalidad ADR-067 (salvo la omisión registrada en SEC-D4, no bloqueante), la degradación del picker D-P1 no introdujo superficie ni revelación, los gates 1, 7 y 8 no arrojaron hallazgos bloqueantes y **SEC-D1 quedó verificado y cerrado** (§3.4): ambos casos CONTRACTOR existen, prueban el scoping restringido y romperían si el rol se retira de LIST_RESTRICTED_ROLES. La [CONSULTA] asíncrona de §5 queda **cerrada**.
>
> **Observaciones residuales (no bloqueantes):** SEC-D4 (Baja — divergencia funcional de proyección, dueño AI-SR-FULL) y SEC-O2 (Baja — fallback a email en responsibleLabel, sin cambio de severidad, dueño AI-SR-FULL con Producto).
>
> **Alcance de este veredicto y límite de lectura:** cubre la re-verificación de **seguridad**. No sustituye la aceptación de G6: existe un hallazgo **Crítico funcional** abierto de AI-SR-QA — **DEF-F6-01** (GET /tasks/execution-orders responde 400 en el stack real por colisión de rutas en tasks.module.ts) — con dueño AI-SR-FULL y marcadores propios de QA; verificado por este dictamen y analizado como **no-hallazgo de seguridad** (fail-closed, sin exposición ni bypass) en §10.
>
> **No hay hallazgos Críticos ni Altos de seguridad.** Ninguna condición de seguridad bloquea el merge.

---

## 2. Contexto y alcance de la re-verificación

### 2.1 DoR verificado antes de revisar (orden §5)

| Condición de entrada | Estado | Evidencia |
| --- | --- | --- |
| G5 completo | Cumplido | docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA3-CONSOLIDACION-v1.0.md §4: «G5 COMPLETO — APROBADO» (F0–F5 cerradas, H1–H6 verificados) |
| Dictamen SEC-ENG OLA2 localizable | Cumplido | docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA2-SEC-ENG-v1.0.md (leído íntegro; usado como punto de partida) |
| Entrega F5 en disco | Cumplido | apps/portal/src/components/operations/ (ExecutionOrdersClient/Table/Toolbar, OperationsUserPicker, execution-orders-query, operations-table-pagination) y apps/portal/src/app/dashboard/operations/ (layout + sub-rutas tasks/ y execution-orders/); use-operational-users.ts ausente (CA-08) |
| Reanudación SEC-D1 | Cumplido | Entrega de AI-SR-QA en disco (informe INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA4-SR-QA-v1.0.md §7) + casos verificados (§3.4) |

### 2.2 Preguntas respondidas

1. ¿El frontend de la bandeja elude el scoping por actor del servicio? No. ¿El total del pie refleja el alcance del actor (ADR-065 §15)? Sí.
2. ¿La proyección visible en pantalla coincide con la tabla de finalidad ADR-067 y no filtró serviceAddress, workInstructions ni contacto por la vía de la bandeja? Sí (con la omisión registrada en SEC-D4).
3. ¿El fallback a email en responsibleLabel sigue aceptable ahora que la etiqueta se pinta? Sí; sin cambio de severidad (SEC-O2, §4.2).
4. ¿AI-SR-QA añadió el caso CONTRACTOR (SEC-D1) y prueba lo que debe? **Sí — verificado y cerrado en la reanudación (§3.4).**
5. ¿La degradación del picker (D-P1) introdujo superficie nueva o revela lo que el 403 protegía? No.
6. Gates 1, 7 y 8: ¿vulnerabilidades conocidas, PII/credenciales en logs/código/fixtures, multi-tenancy desde JWT? Sin hallazgos bloqueantes (§3.6).

### 2.3 Método

Solo lectura sobre disco (código, contratos y tests), sin confiar en los informes: se abrieron los archivos citados y se verificó su contenido vigente. Se constató que el backend no cambió desde OLA2 (estructura y líneas del servicio estables), que los contratos congelados no cambiaron y que la superficie de F5 declara no haber tocado apps/api, packages/shared ni el e2e (consolidación OLA3 §1 y informe F5 §11; comprobación puntual por lectura). En la reanudación se aplicó el mismo criterio a los dos casos nuevos de SR-QA y al hecho DEF-F6-01 (§10), verificados por lectura directa (protocolo §7.4).

---

## 3. Puntos revisados con evidencia

### 3.1 Scoping por actor, extremo a extremo (alcance a)

**El frontend no puede ampliar el alcance porque no envía dimensión de alcance alguna; solo filtros que estrechan, y el servidor los interseca con la cláusula de actor (AND).**

- El builder del cliente toma únicamente la query de la URL y agrega page/limit: apps/portal/src/components/operations/ExecutionOrdersClient.tsx:58-77 (buildExecutionOrdersListParams) y :122-135 (fetch + normalización de meta). No hay campo de alcance (tenantId, actorId, schemaName) en ninguna ruta del cliente.
- El parser de URL solo lee claves conocidas y descarta el resto: apps/portal/src/components/operations/execution-orders-query.ts:46-83. El serializador omite sortBy/sortDir/cursor por diseño: api-client.ts:6929-6951 (12 parámetros; comentario explícito).
- En el servidor, la cláusula de actor se compone con AND sobre cualquier filtro del cliente: apps/api/src/modules/tasks/services/execution-orders.service.ts:515-522 (actorSub y poolExcludedStatus ligados) y :533-538 (assigneeId añade una condición OR propia dentro del AND). Un TECHNICIAN que filtre por otro técnico obtiene conjunción imposible → conjunto vacío, no ampliación.
- **Total del pie (ADR-065 §15):** datos y conteo salen de un único getManyAndCount sobre el QB ya scopeado y la meta se construye de ese total: execution-orders.service.ts:577-584; el cliente consume meta.total sin recomputarlo (ExecutionOrdersClient.tsx:128-133 y :352; pie en ExecutionOrdersTable.tsx:167-196). Test de dos alcances vigente: apps/api/src/modules/tasks/tests/tasks.boundary.spec.ts:349-383 (ADMIN total 3 vs TECHNICIAN total 1; un único getManyAndCount por listado).
- **R1 (riesgo dominante) confirmado en el código vigente:** apps/api/src/modules/tasks/guards/execution-order-access.guard.ts:37-51 — sin :id y sin @ExecutionOrderTenantScoped() la ruta es deny-by-default (403); con el decorador retorna true sin invocar assertActorAccess. Por tanto el control del listado vive en el servicio — verificado.
- **El detalle no es un atajo:** las rutas con :id (incluidos sub-recursos del drawer) pasan por assertActorAccess (guard :52-66). El deep link del drawer no puede saltarse el ABAC del detalle por más que el frontend lo invoque.
- **Nota de la reanudación (transparencia):** este análisis es estático (código y tests). En el stack real el endpoint de listado responde 400 por DEF-F6-01 (§10) hasta que AI-SR-FULL aplique el fix de orden de controladores; ninguna de las conclusiones de seguridad cambia (el fallo es fail-closed y no expone datos), pero la verificación E2E de estos controles sobre API real (bloque 9, casos 9f/9g) queda pendiente para después del fix (SEC-D2, §4.2).

### 3.2 Proyección PII (ADR-067) en la bandeja (alcance b)

- **Contrato congelado:** packages/shared/src/contracts/operations/execution-orders-list.ts:30-57 (ExecutionOrderListItem). No expone serviceAddress, workInstructions, contacto, completion, syncState, inventoryReconciliation ni template.
- **Implementación:** toListItem emite exactamente los campos del contrato (con assignee.type/id sin displayLabel): execution-orders.service.ts:2380-2409. La tabla renderiza 8 columnas de ese contrato: ExecutionOrdersTable.tsx:87-101 y :115-161; cliente, toolbar y query no usan ningún campo adicional.
- **Barrido del frontend (superficie de la bandeja):** cero referencias a serviceAddress, workInstructions, subscriberId, contactPhone ni customerPhone en apps/portal/src/components/operations. La única dirección que aparece es order.site.address del **detalle** (sede interna del tenant), legítima y protegida por el ABAC del detalle: ExecutionOrderDrawer.tsx:1727-1730 y ExecutionOrderSummary.tsx:198.
- **Conclusión:** lo proyectado coincide con la tabla de finalidad (G3 §7) y nada de la bandeja filtra dirección, instrucciones ni contacto. Única divergencia: assignee.displayLabel (SEC-D4, §4.1).

### 3.3 SEC-O2 — fallback a email en responsibleLabel (alcance c)

- El fallback sigue vigente: users.service.ts:562-582; línea 578: labels.set(user.id, fullName || user.email). El contrato lo declara opcional: packages/shared/src/contracts/operations/operational-tasks.ts:51 (responsibleLabel?: string | null).
- **Dónde se pinta hoy:** drawer de tarea (TaskDetailDrawer.tsx:80 vía resolveResponsibleLabel; resolución en TasksInboxClient.tsx:485-496), filtro de toolbar (TasksToolbar.tsx:107 y TasksInboxClient.tsx:253-256) y formulario de alta/edición (TaskCoreFields.tsx:128). En la tabla de tareas **no** se pinta responsibleLabel por fila (la columna es Destinatario con recipientLabel: TasksTable.tsx:219).
- **Evaluación:** la audiencia no cambió (roles con OPERATIONS_TASKS_READ: ADMIN, NOC, SUPPORT, SALES, TECHNICIAN, CONTRACTOR — access-control.constants.ts:744-833), la finalidad está declarada (spec §4.7.4; comentario de finalidad en users.service.ts:556-558) y el dato es de usuario interno del mismo tenant, no PII de suscriptor. Solo aparece cuando el usuario no tiene nombre compuesto; el email de login es identificador interno y queda dentro de la finalidad declarada.
- **Veredicto SEC-O2:** **sigue aceptable; sin cambio de severidad (Baja/Observación).** La visibilidad en drawer y filtros no agrega audiencia. Recomendación de minimización no bloqueante: preferir null o email enmascarado cuando no haya nombre, si Producto no usa esa etiqueta; dueño AI-SR-FULL con acuerdo de Producto. Queda abierta como observación, no como deuda bloqueante.

### 3.4 SEC-D1 — caso CONTRACTOR en los tests unitarios de scoping (alcance d) — **VERIFICADO Y CERRADO**

**Estado final: CERRADO SIN HALLAZGO** (reanudación del 2026-09-13, tras la entrega de AI-SR-QA).

Casos verificados en disco (lectura completa del caso y su contexto en ambos archivos):

- **apps/api/src/modules/tasks/tests/tasks.boundary.spec.ts:295-347** — «un CONTRACTOR queda dentro del scoping restringido (SEC-D1): no ve la OT de un técnico». Construye un actor real UserRole.CONTRACTOR con sub contractor-001 (:300-304); ejecuta el servicio real vía runList con el QB fake que captura predicados/parámetros y honra actorSub (:324); afirma el predicado parametrizado y que el sub no se concatena (:327-331); fija el conjunto exacto — propia + pool ASSIGNED, nunca la OT de tech-001 — y meta.total 2 (:334-340); y verifica consistencia bandeja↔detalle con isReadable para el rol contractor (:342-346).
- **apps/api/src/modules/tasks/tests/execution-orders.service-list.spec.ts:142-168** — «incluye CONTRACTOR en el scoping restringido (SEC-D1)». Actor CONTRACTOR con sub contractor-001 (:145-149); sobre el servicio real captura andWhere y afirma: predicado order.assigned_technician_id = :actorSub (:156-158), cláusula de pool con order.assigned_crew_id IS NULL y :poolExcludedStatus (:159-163) y binding exacto { actorSub: 'contractor-001', poolExcludedStatus: 'CREATED' } (:164-167).

Evaluación contra los tres requisitos del encargo:

1. **El predicado de scoping restringido incluye a CONTRACTOR (comparte rama con TECHNICIAN):** se cumple. Ambos casos afirman las cláusulas que solo produce la rama LIST_RESTRICTED_ROLES.includes(actor.role) del servicio (execution-orders.service.ts:515-522); que el caso pase implica pertenencia al array. La redacción del predicado y los parámetros son idénticos al caso TECHNICIAN del mismo archivo (service-list :117-140), lo que fija la equivalencia de rama.
2. **Parámetros/where se comportan como un técnico restringido:** se cumple. actorSub='contractor-001' y poolExcludedStatus='CREATED' ligados; el caso de boundary además simula el WHERE (el QB fake filtra con la misma regla) y fija la semántica v1 completa: ve la propia y el pool reclamable, nunca la de otro responsable, con total scopeado (§15).
3. **Retirar CONTRACTOR de LIST_RESTRICTED_ROLES rompería estos tests (prueba de regresión real):** se cumple por construcción, verificado paso a paso. Sin el rol en el array el servicio no añade la cláusula: en boundary fallan las aserciones de predicado y parámetro y, además, el QB fake (actorSub undefined) devuelve todas las filas, rompiendo la igualdad de conjuntos; en service-list no se invoca andWhere con el scope y fallan las tres aserciones. **No es un test que pase con cualquier rol:** el control negativo de ADMIN (sin :actorSub) existe en ambos archivos (service-list :135-139; boundary :349-383), de modo que la prueba discrimina restringido vs supervisor.
4. **Anti-teatral:** se cumple. Se capturan predicados y parámetros del servicio real (new ExecutionOrdersService), no códigos de estado; no hay 403/200 vacío que pase sin probar nada (precedente OLA2 cubierto).

Evidencia de ejecución (de AI-SR-QA; no replicada en esta sesión de solo lectura): INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA4-SR-QA-v1.0.md §5 (API jest: 313 suites / 3927 passed + 15 skipped; +2 casos vs OLA2, atribuidos a SEC-D1) y §7 («ambas suites pasan; retirar CONTRACTOR del array ahora rompe Jest»). La verificación de sustancia de este dictamen es de AI-SEC-ENG por lectura directa.

**Veredicto SEC-D1: CERRADA. Sin hallazgo. Sin observación residual.**

### 3.5 Degradación del picker D-P1 (alcance e)

- **Sin superficie nueva:** el picker consume el endpoint existente GET /users/search (api-client.ts:5149-5167) con guard idéntico al del listado retirado: @Roles(ADMIN, SYSTEM_ADMIN) + @Permissions(USERS_READ) en users.controller.ts:94-96 (GET /users) y :160-163 (GET /users/search). El swap no cambia quién está autorizado; hace visible un 403 que el catch del monolito ocultaba (consolidación OLA3 §5.1).
- **Mapeo visible y accionable:** OperationsUserPicker.tsx:58-75 mapea 403 a aviso PortalAlert y devuelve lista vacía; copy en ExecutionOrdersToolbar.tsx:154-155 y TasksToolbar.tsx:110-111 / TaskCoreFields.tsx:256-257 y :320-321.
- **Evaluación de fuga:** el aviso informa que el perfil no tiene acceso al buscador de personas — exactamente lo que el 403 ya comunica — y guía a operar sin el filtro. No revela contenido del directorio (nombres, correos, conteos) ni confirma la existencia de usuarios. Sin hallazgo.
- **Coherencia:** la UI no decide autorización (el 403 se produce en el servidor); el filtro «Asignado a» solo se degrada visualmente. La precisión del copy «la persona asignada aparece en cada orden» depende de SEC-D4 (ver impacto en §4.1).

### 3.6 Gates 1, 7 y 8 (alcance f)

**Gate 1 — vulnerabilidades conocidas en lo tocado:** la ola no incorpora dependencias nuevas (superficie tocada: archivos .ts/.tsx de apps/portal y sus specs; los imports de los archivos revisados provienen de paquetes ya existentes del workspace y @iwana/ui). El escaneo de CVEs de dependencias es control continuo de PLAT-OPS/CI (audit de pnpm) y no fue alterado por esta ola. Sin hallazgo en el alcance revisable de esta sesión (sin shell).

**Gate 7 — logs, código y fixtures sin PII real ni credenciales:**
- components/operations: cero console.*, cero localStorage/sessionStorage (el único match del barrido es el nombre del archivo use-execution-order-console.ts en un comentario), cero dangerouslySetInnerHTML/innerHTML/eval.
- Fixtures de los specs revisados: datos ficticios (dominios example.test e invalid; nombres ilustrativos); sin credenciales. El informe de QA declara la misma regla (OLA4-SR-QA §3.3).
- Backend tocado: logs con identificadores internos y sin payloads (execution-orders.service.ts:768-770, :1211-1213 y :1624-1628 — este último declara explícitamente no registrar el message del error para no volcar parámetros de la sentencia).
- SchedulingClient.tsx:727-745 conserva dos console.warn de errores de enlace preexistentes (sin credenciales ni payloads; no forma parte del cambio de F5 salvo la prop adaptada). Informativos; sin hallazgo.

**Gate 8 — multi-tenancy respetada (tenant desde JWT, nunca desde input):**
- El tenant del listado viene de TenantContext.getOrThrow (execution-orders.service.ts:500) y la query corre en runInTenantSchema con SET LOCAL search_path :507-510; el tenant_id y el actorSub son parámetros ligados.
- tenant.middleware.ts:72-88 resuelve el contexto de un JWT de tenant solo desde claims firmados, con cotejo del schemaName claim contra la BD (:79-81); el comentario :116-118 y el flujo :90-132 confirman que la cabecera X-Tenant-Slug no suplanta a un JWT de tenant verificado.
- El lookup de etiquetas también corre en el schema del tenant con parámetros ligados (users.service.ts:569-574). El cliente no envía dimensión de tenant en la llamada del listado (api-client.ts:6929-6951; el request resuelve slug por env/storage y el middleware lo ignora en requests autenticadas). Sin hallazgo.

---

## 4. Hallazgos y estado de observaciones OLA2

Formato [SEC-REVIEW]. **Sin hallazgos Críticos ni Altos de seguridad. Sin condiciones de seguridad para el merge por parte de SEC-ENG.**

### 4.1 Hallazgo nuevo

- **SEC-D4 · Divergencia entre la tabla de finalidad ADR-067 y la proyección implementada: assignee.displayLabel no se emite y la columna «Asignado a» muestra «Sin asignar» (Baja — funcional, sin fuga)**
  [SEC-REVIEW] Evidencia: apps/api/src/modules/tasks/services/execution-orders.service.ts:2377 (comentario de omisión deliberada en v1) y :2396-2400 (assignee se emite solo con type e id); apps/portal/src/components/operations/ExecutionOrdersTable.tsx:156 (order.assignee?.displayLabel ?? 'Sin asignar'). La tabla de finalidad por campo declara assignee.displayLabel con finalidad explícita de bandeja (INFORME-...-G3-FACTIBILIDAD-BACKEND-v1.0.md §7), y el tipo lo declara opcional (packages/shared/src/contracts/operations/execution-orders.ts:54-58).
  Impacto: toda OT asignada se pinta como «Sin asignar» en la bandeja (la fila pierde el dato que la finalidad declara y el copy de D-P1 «la persona asignada aparece en cada orden» resulta impreciso). No hay fuga de datos — la omisión es la dirección segura —, pero la superficie visible contradice la finalidad declarada.
  Corrección recomendada: emitir displayLabel en lote por página (mismo patrón que responsibleLabel: una consulta por página, máx. 100 ids; users.service.ts:562-582), o ajustar la celda y el copy si se ratifica descartar el campo.
  Dueño: AI-SR-FULL (proyección); decisión de alcance y copy alternativo, AI-EM-ARCH → AI-FE-PLATFORM si se descarta el campo. No bloqueante.

### 4.2 Observaciones OLA2 (re-emitidas)

- **SEC-O2 · Fallback a email en responsibleLabel (Baja/Observación — sin cambio de severidad).** Detalle y evaluación actualizada en §3.3. Sigue abierta como observación; dueño AI-SR-FULL (minimización, con Producto).
- **SEC-O3 · Futura población de sortableFields (Observación — sin cambio).** La lista blanca sigue vacía (spec §4.7.1; meta sort null) y el frontend no serializa sortBy/sortDir (api-client.ts:6929-6951; cero ocurrencias en components/operations). Se mantiene la disciplina de lista blanca y su test negativo para el tramo post-p95.
- **SEC-D2 · Corrida real del bloque 9 del e2e (BOLA sobre API real) — ABIERTA con causa precisa.** La corrida canónica ya se consiguió (OLA4-SR-QA §6.1) y midió que 9a falla con 400 por DEF-F6-01 (§10); 9b–9g no corrieron por modo serial. Cierre al fix de AI-SR-FULL y re-ejecución de QA. Defensa en profundidad pendiente, no condición del veredicto de seguridad.
- **SEC-D3 · Scoping v1 sin cuadrilla (Baja, falla cerrado).** Sin cambio; refinamiento v2 cuando exista el port tipado de WFM.
- **SEC-O1 · Inexactitud puntual del informe F1 sobre el cursor — CERRADA.** El informe F1 (OLA2-SR-FULL v1.0) fue corregido citando esta observación: docs/informes/INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA2-SR-FULL-v1.0.md:45 («esta fila lo citaba por error; corregido por observación SEC-O1 de AI-SEC-ENG»). Sin acción pendiente.
- **SEC-O4 · Rate limiting del listado (positivo).** Vigente: el listado hereda el bucket de lectura ligera eo-lightweight-read fail-closed (verificado en OLA2; la ola no tocó el controlador ni el throttler). Se registra como control vigente del pipeline por request.

### 4.3 Deudas verificadas en la reanudación

- **SEC-D1 · Cobertura unitaria del rol CONTRACTOR en el scoping del listado — CERRADA.** Ver §3.4. Sin hallazgo.

---

## 5. Marcador emitido y su cierre

[CONSULTA] De: AI-SEC-ENG → A: AI-EM-ARCH
Contexto: MOD11 Operaciones · OLA 4 · re-verificación AppSec (etapa 6) — SEC-D1 (caso CONTRACTOR en tests unitarios de scoping).
Pregunta concreta: ¿Confirma AI-EM-ARCH que AI-SR-QA añadirá el caso CONTRACTOR en los tests unitarios de scoping (apps/api/src/modules/tasks/tests/tasks.boundary.spec.ts y/o execution-orders.service-list.spec.ts) y que se notificará para reanudar esta re-verificación? Al cierre de esta sesión el caso no está en disco (evidencia en §3.4); la re-verificación se completará inspeccionando el caso contra los cuatro criterios de §3.4.
Bloqueante: No | Supuesto mientras tanto: el resto de la re-verificación se emite con este dictamen; SEC-D1 NO se declara verificado y el sellado de la etapa 6 por SEC-ENG queda condicionado a la reanudación.

**CIERRE DE LA CONSULTA (2026-09-13, reanudación):** AI-SR-QA entregó los dos casos (INFORME-MOD11-OPERACIONES-SUBRUTAS-OLA4-SR-QA-v1.0.md §7) y la inspección de sustancia se completó en esta reanudación contra los cuatro criterios: SEC-D1 **verificado y cerrado sin hallazgo** (§3.4). La consulta queda **CERRADA**; no requiere acción adicional de AI-EM-ARCH.

---

## 6. Reanudación (2026-09-13) — qué se hizo y con qué resultado

1. Se inspeccionaron en disco los dos casos entregados (tasks.boundary.spec.ts:295-347; execution-orders.service-list.spec.ts:142-168) y sus aserciones completas, junto con el informe de QA (§7).
2. Se contrastaron contra los criterios de aceptación publicados en la primera emisión de este dictamen (§3.4): los cumplen todos → SEC-D1 cerrada sin hallazgo.
3. Se verificó por lectura directa el hecho crítico externo DEF-F6-01 (§10) para evitar citar sin comprobar (protocolo §7.4).
4. Se cerró la [CONSULTA] (§5) y se consolidó el veredicto final (§1).

Naturaleza: reanudación de verificación en modo solo lectura; no se modificó código ni tests.

---

## 7. Skills declaradas

| Skill | Uso en esta revisión |
| --- | --- |
| security-auditor (obligatoria) | Marco de revisión: zero-trust PII, tenancy como control, OWASP aplicado al stack real, formato de hallazgos |
| backend-security-coder (obligatoria) | Verificación de validación en boundaries, ORM/parámetros ligados, tenancy por schema, logs sin PII |
| frontend-security-coder (obligatoria) | Verificación de no exposición al cliente, no XSS, autorización no delegada a la UI, navegación/redirect seguros |
| testing-patterns (apoyo) | Criterio anti-test-teatral para juzgar SEC-D1 (predicado + comportamiento, no status codes vacíos) |

---

## 8. Marcadores emitidos (resumen final)

- [CONSULTA] asíncrona de AI-SEC-ENG a AI-EM-ARCH (§5) — **CERRADA** en la reanudación del 2026-09-13 (SEC-D1 verificado). Sin marcadores SEC-ENG vivos.
- Sin [BLOQUEO] de SEC-ENG. (Existe un [BLOQUEO] vigente de AI-SR-QA por DEF-F6-01 — defecto funcional de ruteo, dueño AI-SR-FULL — que este dictamen registra como contexto en §10; no es un bloqueo de seguridad ni lo re-emite SEC-ENG.)
- Sin [ESCALACION AL CTO]: no aparece excepción de seguridad ni de cumplimiento que requiera decisión del CTO. (La eventual ampliación de @Roles de users/search para NOC/SUPPORT sigue siendo decisión de producto/seguridad fuera de este plan, ya escalada por AI-EM-ARCH en OLA3 §5.1 — no la reabre este dictamen.)
- Sin [ESCALACIÓN DE SEGURIDAD]: sin vulnerabilidad crítica confirmada.

---

## 9. Conclusión

1. **Scoping extremo a extremo verificado (estático):** el frontend de la bandeja no elude el scoping (no envía dimensión de alcance; filtros solo estrechan; el servidor interseca con AND) y el total del pie deriva del conteo del QB scopeado — sin fuga por conteo (ADR-065 §15). R1 sigue bajo control en el servicio.
2. **Proyección PII conforme a ADR-067** para la bandeja; sin serviceAddress, workInstructions ni contacto por esa vía. Única divergencia registrada en SEC-D4 (Baja, sin fuga).
3. **SEC-O2 sin cambio de severidad** (Baja/Observación): aceptable con finalidad declarada; recomendación de minimización no bloqueante.
4. **D-P1 resuelto conforme a la Salida 2:** sin superficie nueva, sin cambio de autorización y sin revelar lo que el 403 protegía.
5. **Gates 1, 7 y 8 sin hallazgos bloqueantes** en el alcance revisable.
6. **SEC-D1 verificado y cerrado:** ambos casos CONTRACTOR prueban el scoping restringido (predicado, parámetros y comportamiento) y su valor de regresión; sin hallazgo (§3.4).
7. **Re-verificación AppSec de la ola 4 cerrada** con veredicto final APROBADO CON OBSERVACIONES (§1), con dos observaciones no bloqueantes y la [CONSULTA] cerrada.

---

## 10. Contexto externo relevante — DEF-F6-01 (no es hallazgo de AI-SEC-ENG)

Registrado por transparencia y para que el expediente de G6 no confunda este veredicto de seguridad con la aceptación funcional:

- **Hecho verificado por lectura directa (protocolo §7.4):** apps/api/src/modules/tasks/tasks.module.ts:75 registra controllers: [TasksController, ExecutionOrdersController, ExecutionOrderTemplatesController]; TasksController declara @Get(':id') con ParseUUIDPipe en tasks.controller.ts:91-102. Express resuelve en orden de registro, de modo que GET /tasks/execution-orders (un solo segmento tras /tasks) lo captura tasks/:id con id='execution-orders' y el pipe responde 400. Confirmado por AI-SR-QA contra el API real (9a, HTTP 400) en OLA4-SR-QA §6.2.
- **Juicio de seguridad de AI-SEC-ENG:** **fail-closed y sin impacto de seguridad.** No ejecuta handler ni servicio (el pipe corta antes), no expone datos, no habilita acceso cruzado y no degrada controles de autorización: los guards de la ruta de tareas corren y el resultado es 400 para todos. La colisión afecta disponibilidad de la funcionalidad (CA-01/CA-03 en stack real), no confidencialidad ni integridad.
- **Estado y dueño:** defecto Crítico funcional con dueño AI-SR-FULL (fix de orden de controladores o router propio) y marcadores propios de QA ([BLOQUEO] a AI-EM-ARCH; [CONSULTA] bloqueante a AI-SR-FULL). SEC-ENG no emite marcador nuevo: no es dominio de seguridad y el bloqueo ya está emitido y con dueño.
- **Efecto sobre este dictamen:** ninguno sobre el veredicto; sí mantiene abierta la corrida E2E del bloque 9 (SEC-D2, §4.2) hasta el fix.

*Fin del dictamen (v1.0 actualizado en la reanudación del 2026-09-13). Emitido en modo solo lectura; ninguna corrección implementada por AI-SEC-ENG.*
