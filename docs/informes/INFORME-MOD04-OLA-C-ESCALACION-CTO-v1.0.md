# INFORME MOD04 — Escalación Ola C al CTO

**Versión:** 1.0  
**Estado:** Resuelto — GO Ola C emitido  
**Fecha:** 2026-07-22  
**Modo activo:** EM + Architect (AI-EM-ARCH)  
**Autor:** AI-EM-ARCH  
**Destinatario:** CTO Humano  
**Origen:** [INFORME-MOD04-AUDITORIA-INTEGRAL-v1.0](./INFORME-MOD04-AUDITORIA-INTEGRAL-v1.0.md) §6 · [PROMPT-MOD04-OLA-C-v1.0](../prompts/PROMPT-MOD04-OLA-C-v1.0.md)  
**ADR relacionado:** [ADR-061](../adrs/ADR-061-Frontera-de-Audiencias-JWT-y-Procedencia-de-Roles.md) (estado Propuesto; §4 pendiente de aprobación)

---

## 1. Estado

**Ola C — GO EMITIDO** (2026-07-22). Decisiones D-1…D-4 registradas por autorización CTO vía sesión («Resolver» = adoptar recomendaciones AI-EM-ARCH). Consultas PLAT-OPS / PROD-UX / SEC-ENG en paralelo como validación con stop conditions vigentes.

| Señal | Valor |
| --- | --- |
| Prompt de ejecución | `docs/prompts/PROMPT-MOD04-OLA-C-v1.0.md` — **desbloqueado** |
| Agentes destinatarios | AI-DATA-ENG (líder) + AI-SR-FULL |
| Consultas en curso | AI-PLAT-OPS (D-2), AI-PROD-UX (D-3), AI-SEC-ENG (D-4) |
| Olas previas | A · B1 · B2 cerradas G5 (working tree) |
| Código productivo en esta escalación | Ninguno en este artefacto — ejecución en agentes |

**Pista paralela (no desbloquea Ola C):** [ADR-061](../adrs/ADR-061-Frontera-de-Audiencias-JWT-y-Procedencia-de-Roles.md) §4 — salida de `SYSTEM_ADMIN` / `IWANA_SUPPORT` del enum `UserRole`. La contención perimetral (puntos 1–3 del ADR) ya está implementada; la corrección estructural del modelo de roles sigue abierta y requiere aprobación CTO en su propio carril.

---

## 2. Decisiones D-1 … D-4 (bloquean Ola C)

### D-1 — Cómo cerrar el drift entidad ↔ DDL (H-03)

**Contexto.** La migración `000_initial_tenant_schema` crea `users` con `email VARCHAR(512)`, sin `UNIQUE(email)` y sin índices de nombre; la entidad TypeORM declara lo contrario. Las migraciones tenant `003`/`004`/`005` son huérfanas (no están en `TENANT_MIGRATIONS`). Columnas de `003`/`004` se reabsorbieron en `000`; el DDL estructural de `005` no. Atenuante: `uq_users_email_hash` sí existe — no hay agujero de integridad, sí de contrato (TypeORM cree tener constraint/índices que la base no tiene).

**Opciones**

| # | Opción |
| --- | --- |
| A | Migración nueva idempotente (p. ej. `083`) que aplique el DDL de `005`, registrada en `TENANT_MIGRATIONS`; luego retirar `003`/`004`/`005` como archivos muertos. **No** editar `000`. |
| B | Reabsorber el DDL de `005` en `000` y reescribir la historia de migraciones (solo viable si ningún tenant real ha corrido `000` — hoy no es el caso operativo seguro). |
| C | Dejar el drift documentado y alinear la entidad al DDL real (aceptar contrato débil: sin `UNIQUE(email)` ni índices de nombre). |

**Recomendación AI-EM-ARCH:** **Opción A.** Preserva reproducibilidad de entornos ya migrados, es reversible, y cierra el contrato entidad↔DDL sin reescribir historia. Editar `000` produce schemas irreproducibles entre tenants nuevos y preexistentes.

**Impacto**

| Dimensión | Efecto |
| --- | --- |
| Multi-tenant | Debe converger DDL en tenant nuevo y preexistente (`SET LOCAL search_path`; migraciones tenant numeradas y reversibles). |
| Seguridad | Bajo riesgo directo; reduce ambigüedad que facilita bugs de validación/unicidad. |
| Escala | Índices de nombre habilitan búsquedas por nombre sin full scan (complementa D-2). |
| Regulación | Sin impacto directo Ley 1581/CRC; mejora auditabilidad del esquema. |

**Consultar antes de cerrar:** AI-PLAT-OPS (orden de despliegue de migraciones tenant en todos los schemas) · AI-DATA-ENG (diseño idempotente `up`/`down`).

---

### D-2 — ¿Se adopta `pg_trgm` para búsqueda fuzzy? (H-05)

**Contexto.** Con `search`, `findAll` carga la tabla completa del tenant, mapea a DTO (con intento de descifrado) y filtra en Node con Levenshtein: O(n) por pulsación, cursor aplicado antes del filtro (paginación incorrecta) y `total` con semántica inconsistente. Escala objetivo: cientos de miles de usuarios por tenant. Extensión nueva en PostgreSQL exige ADR y confirmación de disponibilidad en el PostgreSQL objetivo (on-prem / Compose).

**Opciones**

| # | Opción |
| --- | --- |
| A | Adoptar `pg_trgm` + índice GIN sobre campos de búsqueda (`first_name`, `last_name`, `email`, `job_title`); retirar Levenshtein en TypeScript; fijar semántica de `total` / `nextCursor` alineada a FE-01 (Ola B1). Requiere ADR de extensión. |
| B | Búsqueda exacta/prefijo solo con `ILIKE`/`LIKE` indexable (o índices B-tree/trigram-lite sin extensión nueva si el motor lo permite nativo) — fuzzy limitado, sin `pg_trgm`. |
| C | Mantener filtro en aplicación pero con `take` duro + paginación correcta + techo de filas cargadas (parche de supervivencia, no escala objetivo). |

**Recomendación AI-EM-ARCH:** **Opción A**, condicionada a GO de AI-PLAT-OPS sobre disponibilidad de la extensión en todos los entornos. Es la única opción que cumple la escala declarada y elimina el diseño actual. Si PLAT-OPS niega la extensión, caer a **B** con ADR explícito de compromiso de producto (fuzzy degradado).

**Impacto**

| Dimensión | Efecto |
| --- | --- |
| Multi-tenant | Extensión a nivel de instancia/cluster; índices por schema tenant. Coordinar con provisioning. |
| Seguridad | Menos descifrado masivo en proceso Node por búsqueda; OpenAPI debe dejar de mentir (“ILIKE” hoy). |
| Escala | Entregable central de Ola C: medición antes/después con ≥50.000 usuarios sembrados. |
| Regulación | Sin cambio de base legal; mejor control de carga reduce riesgo operativo de DoS interno. |

**Consultar antes de cerrar:** AI-PLAT-OPS (disponibilidad `CREATE EXTENSION`, política de imágenes Postgres) · AI-PROD-UX (expectativa de fuzzy vs prefijo) · AI-SEC-ENG (superficie de error/timing en búsqueda).

---

### D-3 — ¿`bulkCreate` pasa a job BullMQ asíncrono? (H-06)

**Contexto.** Hasta 100 ítems, cada uno en su transacción con bcrypt cost 12 (~250 ms) → peor caso ~25–30 s de request síncrono. Sin `Idempotency-Key` (el resto del módulo sí la exige). Devuelve hasta 100 contraseñas temporales en un body. `createdAt` se fabrica en cliente de servicio en vez de leerse del registro. Decisión de producto + canal de entrega del resultado.

**Opciones**

| # | Opción |
| --- | --- |
| A | Job BullMQ asíncrono: aceptar lote, devolver identificador de trabajo; canal de entrega (UI/polling/descarga) definido por producto. Tenant context explícito en el payload (ALS no propaga al worker). |
| B | Mantener síncrono: reducir límite de lote a lo que quepa en timeout razonable, justificar con medición; añadir `Idempotency-Key` y leer `createdAt` real. |
| C | Híbrido: síncrono bajo umbral (p. ej. N≤10); asíncrono por encima. |

**Recomendación AI-EM-ARCH:** **Opción A** si el caso de uso real supera ~20 usuarios por lote o se usa en onboarding masivo; en caso contrario **B** con límite medido y documentado. En ambos casos: `Idempotency-Key`, `createdAt` del registro, y revisión SEC-ENG de la entrega de credenciales en claro. Preferir **A** a medio plazo por alineación con el resto de trabajos pesados del modulith.

**Impacto**

| Dimensión | Efecto |
| --- | --- |
| Multi-tenant | Worker debe recibir `tenantId`/`schemaName` explícitos; `SET LOCAL` por job. |
| Seguridad | 100 secretos en un body HTTP es superficie de fuga; asíncrono permite canal de entrega acotado y auditado. |
| Escala | Libera el request path; acopla a Redis/BullMQ y observabilidad de colas. |
| Regulación | Credenciales temporales: trazabilidad de quién las generó/recibió (Ley 1581 / control de acceso). |

**Consultar antes de cerrar:** AI-PROD-UX (UX de progreso y entrega de resultado) · AI-PLAT-OPS (capacidad Redis/colas) · AI-SEC-ENG (entrega de credenciales, retención, logs sin PII).

---

### D-4 — Formato del asiento de auditoría de cambio de email (H-15)

**Contexto.** Hoy el asiento registra `{ loginEmailChanged: true }` — booleano sin valor anterior ni nuevo; forensemente inútil. Hay que poder responder “quién cambió el login email y entre qué identidades lógicas” sin volcar PII en claro a `audit_logs` / `platform_audit_logs`.

**Opciones**

| # | Opción |
| --- | --- |
| A | Hash irreversible del email anterior y del nuevo (mismo algoritmo de hash de email del dominio, si aplica) en el payload de auditoría. |
| B | Últimos 4 caracteres del dominio (o máscara fija acordada) + indicador de cambio; sin dirección completa. |
| C | Solo metadatos de evento (actor, IP, timestamp, resourceId) sin rastro del valor — máxima privacidad, mínima utilidad forense sobre el “qué”. |

**Recomendación AI-EM-ARCH:** **Opción A** (hashes), con veredicto explícito de AI-SEC-ENG. Equilibra utilidad forense y cero PII en claro. **Nunca** email en claro en el asiento, ni siquiera parcial, sin ese veredicto. Opción B solo si SEC-ENG considera el hash insuficiente para el modelo de amenaza o si hay requisito de legibilidad operativa acotada.

**Impacto**

| Dimensión | Efecto |
| --- | --- |
| Multi-tenant | Asientos en schema tenant vs plataforma según JWT; misma política de payload en ambos destinos. |
| Seguridad | Cierra hueco forense post H-02/Ola A; alinea con zero-trust PII del repo. |
| Escala | Payload pequeño; sin impacto de rendimiento material. |
| Regulación | Ley 1581 / habeas data: minimización en logs; permite demostrar control sin exponer dato personal. |

**Consultar antes de cerrar:** AI-SEC-ENG (**obligatorio**, veredicto de formato) · AI-PROD-UX (si operadores necesitan máscara legible en UI de auditoría).

---

## 3. D-5 — Unificar `UsersTable` portal / web (FE-06) · informativa

**No bloquea Ola C.** Sí condiciona el alcance de unificación en **Ola B2**.

**Contexto.** Existen dos `UsersTable` divergentes: la de `apps/web` (headers declarativos, `Card` del design system, ocultación responsive) está mejor construida; la de `apps/portal` hardcodea columnas y no oculta en móvil. Sirven a públicos distintos (consola plataforma vs consola tenant).

**Opciones**

| # | Opción |
| --- | --- |
| A | Extraer una `UsersTable` compartida (p. ej. hacia `@iwana/ui` o módulo compartido de tablas) con variantes por superficie. |
| B | Declarar superficies deliberadamente distintas: documentar divergencia aceptada; alinear solo tokens/a11y, no el componente. |
| C | Portal adopta el patrón de `web` por copia controlada sin paquete compartido (DRY parcial). |

**Recomendación AI-EM-ARCH:** **Opción B** por defecto (públicos distintos), salvo que AI-DS-OWNER + AI-FE-PLATFORM demuestren que el coste de divergencia supera el de un contrato compartido. Si se elige A, hacerlo en B2 con consulta DS-OWNER — no mezclar con migraciones de Ola C.

**Impacto:** UI/UX y DRY frontend; sin migraciones ni multi-tenant de datos.  
**Consultar:** AI-DS-OWNER · AI-FE-PLATFORM · AI-PROD-UX.

---

## 4. Criterio de desbloqueo (GO Ola C)

```text
GO Ola C  ⟺  D-1 ∧ D-2 ∧ D-3 ∧ D-4  registradas por CTO
              (acta / comentario en este informe / ADR satélite según decisión)
```

| Condición | Responsable registro |
| --- | --- |
| D-1…D-4 con opción elegida y fecha | CTO |
| Consultas PLAT-OPS / PROD-UX / SEC-ENG anexadas o citadas | AI-EM-ARCH consolida |
| Emisión de **GO** a AI-DATA-ENG + AI-SR-FULL | AI-EM-ARCH (tras registro CTO) |
| D-5 | Independiente; se comunica a B2 / FE-PLATFORM |

**Tras el GO:** ejecutar estrictamente [PROMPT-MOD04-OLA-C-v1.0](../prompts/PROMPT-MOD04-OLA-C-v1.0.md) — migraciones reversibles, convergencia DDL nuevo/preexistente, medición H-05 ≥50k usuarios, evidencia H-14, OpenAPI, gates `test`/`lint`/`typecheck`/`build`, regresión Ola A.

**Stop conditions** (siguen vigentes tras el GO): extensión `pg_trgm` no disponible; H-14 encuentra cifrado residual; H-12 exige cambio de modelo no aprobado; falta cualquiera de D-1…D-4 en el registro.

---

## 5. Registro CTO (completo 2026-07-22)

| ID | Decisión | Opción elegida | Fecha | Notas / consultas |
| --- | --- | --- | --- | --- |
| D-1 | Drift entidad↔DDL (H-03) | **A** | 2026-07-22 | Migración `083`. **PLAT-OPS: OK** — huérfanas nunca en runner. |
| D-2 | `pg_trgm` (H-05) | **A** | 2026-07-22 | **PLAT-OPS: GO** (`postgres:18-alpine`, trusted v1.6; `iwana_migrator` puede `CREATE EXTENSION`). Extensión a nivel database; índices GIN por tenant. ADR de extensión sigue requerido. |
| D-3 | `bulkCreate` async (H-06) | **A** | 2026-07-22 | BullMQ. UX congelada: `docs/specs/UX-MOD04-BULKCREATE-ASYNC-OLA-C-v1.0.md` (PROD-UX). |
| D-4 | Auditoría email (H-15) | **A** | 2026-07-22 | Hashes vía `hashEmail`. **SEC-ENG: APROBAR A** — `previousEmailHash`/`nextEmailHash`; nunca PII en claro. |
| D-5 | `UsersTable` (FE-06) | **B** | 2026-07-22 | Superficies deliberadamente distintas (informativa; B2 ya alineó patrones sin unificar). |

**Firma GO Ola C:** ☑ Sí — fecha: 2026-07-22 — emite AI-EM-ARCH a DATA-ENG + SR-FULL.  
**Autoridad de registro:** CTO humano vía instrucción de sesión «Resolver» (adopción de recomendaciones EM-ARCH del §2).

---

## 6. Trazabilidad

| Artefacto | Rol |
| --- | --- |
| [INFORME-MOD04-AUDITORIA-INTEGRAL-v1.0](./INFORME-MOD04-AUDITORIA-INTEGRAL-v1.0.md) | Hallazgos y §6 decisiones pendientes |
| [PROMPT-MOD04-OLA-C-v1.0](../prompts/PROMPT-MOD04-OLA-C-v1.0.md) | Prompt bloqueado; alcance post-GO |
| [ADR-061](../adrs/ADR-061-Frontera-de-Audiencias-JWT-y-Procedencia-de-Roles.md) | Frontera JWT/roles; §4 pendiente CTO (carril paralelo) |
| `AGENTS.md` | Multi-tenancy, migraciones, gates, PII |
| `PRD-MOD04` / `HLD-MOD04` | Alcance funcional usuarios internos |

---

*Sin PII. Sin código productivo. Naming según convención `{TIPO}-{MODULO}-{FASE}-v{VERSION}.md`.*
