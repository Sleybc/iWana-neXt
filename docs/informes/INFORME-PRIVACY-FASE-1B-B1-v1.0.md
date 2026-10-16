# INFORME — Privacy Fase 1B · B1 Fundamentos de supresión

**Versión:** 1.0 · **Fecha:** 2026-10-16 · **Estado:** Parcial; S1 implementado, cierre sujeto al paso 2 de B2 · **Autor:** AI-SR-FULL (`sr-backend`)
**Encargo:** `docs/prompts/PROMPT-PRIVACY-FASE-1B-v1.0.md` §§0–3, §4 B1 · **Plan:** `docs/plans/2026-10-16-privacy-fase-1b-bloqueo-anonimizacion.md`
**Skills leídas:** `nestjs-expert`, `database-migration`, `iwana-tenant-migration`, `test-driven-development`, `backend-security-coder`, `iwana-test-evidence`.
**Propiedad tocada:** privacy API, su migración tenant, CRM module wiring de S1 y pruebas asociadas. Sin commits.

## 0. Estado y secuencia

- La ruta de este informe estaba libre antes de crearlo.
- Se escribieron los apartados requeridos de §2.2 (excepto `subscriber.schema.ts`), §2.4 y §2.10 según el plan; S1 se confirmó antes de que empezaran B2, B3 y B4.
- Se retiraron las referencias a `IPersonalDataBlockPort`; `rg` no encuentra referencias bajo `apps` ni `packages`.
- **No se retiró `PersonalDataErasureUnavailableAdapter`:** el informe B2 está bloqueado antes de su paso 2, por lo que no se ha cumplido la condición de retiro.
- No se modificaron contratos fuera de los artefactos de S1 definidos por el plan. No se registraron PII, ciphertext, HMAC ni claves en archivos o informes.

## 1. Resultado

S1 está integrado en el árbol compartido: entidad y proyección de lectura de supresión, puerto de borrado, reglas de transición y auditoría, esquema tenant reversible 149 y pruebas unitarias y PostgreSQL. La ruta `resolve` de supresión ahora registra el evento `RESOLVE` en la misma transacción. Una prueba PostgreSQL verifica que un participante que escribe y luego falla deja intactos el estado de la solicitud y sus datos auxiliares.

La fase B1 queda **parcial** hasta que B2 reporte su paso 2. B2 se detuvo por la decisión pendiente sobre `contracts`, snapshots y la relación de evidencia de Media; el adaptador Unavailable permanece como exige el orden de ejecución.

## 2. Verificación sin caché

| Alcance y comando | Resultado real |
| --- | --- |
| API privacy, Jest sin caché y cobertura limitada al módulo | 31 suites, 144 tests aprobados, 0 snapshots. Statements 93,62 % (1262/1348); branches 82,39 % (337/409); functions 88,83 % (183/206); lines 94,03 % (1150/1223). |
| `requests.service.postgres.integration.spec.ts`, PostgreSQL real | 1 suite, 14 tests aprobados, 0 snapshots. Incluye rollback transaccional del participante. |
| `migration-order.spec.ts` + `149_privacy_erasure_record.spec.ts` | 2 suites, 8 tests aprobados, 0 snapshots. |
| `149_privacy_erasure_record.integration.spec.ts`, PostgreSQL real | 1 suite, 1 test aprobado, 0 snapshots; verificó aplicar, comprobar, revertir y reaplicar. |
| Esquemas compartidos `requests.spec.ts` + `erasure.spec.ts` | 2 suites, 11 tests aprobados, 0 snapshots. |
| Ejecución enfocada de `requests.service.coverage.spec.ts` | 1 suite, 38 tests aprobados, 0 snapshots. Es una repetición de esa suite dentro del conjunto de API privacy; no se suma dos veces al conteo anterior. |

Typecheck aprobado para `@iwana/api`, `@iwana/db`, `@iwana/shared` y `@iwana/portal`. ESLint aprobado para privacy API, el wiring CRM de S1 y los archivos de privacidad portal modificados. `git diff --check` pasó. La prueba portal específica de B4 pasó: 1 suite, 4 tests.

## 3. Deuda nueva por severidad

| Severidad | Deuda introducida por B1 |
| --- | --- |
| P0 | Ninguna. |
| P1 | Ninguna de código. El retiro del adaptador depende del paso 2 de B2, aún no ejecutado. |
| P2 | Ninguna. |
| P3 | Ninguna. |

**Dependencia externa no contabilizada como deuda nueva de B1:** B2 documentó el bloqueo de alcance para `contracts`, sus snapshots y la referencia de evidencia de Media; el informe B3 documentó que R10 requiere acceso asignado a `crm/contacts/**`. Ambos requieren resolución de AI-EM-ARCH antes de certificar toda la fase.
