# MOD05 + `privacy` — Camino a G7 (producción) · Plan de orquestación

**Fecha:** 2026-10-15 · **Versión:** 1.0 · **Emisor:** AI-EM-ARCH (modo EM + Orchestrator)
**Alcance:** las fases con G6 y G6.5 en GO que esperan producción:
- remediación MOD05 (B1–B13);
- IVA (ADR-093) y D-PDF;
- privacidad, Fase 1a (ADR-094);
- E-3 (a).

**Autoridad:**
- [Protocolo §3](../roles/Protocolo_Colaboracion_Multiagente_v1.md): G7 es «¿se puede desplegar?»; AI-EM-ARCH recomienda y **el CTO aprueba**, con dominio productivo, TLS, rollback por componente y restores global y por tenant verificados.
- [ADR-069](../adrs/ADR-069-Gates-G6.5-Merge-Readiness.md) §3 y [ADR-078](../adrs/ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md) (Aprobado, 2026-09-12).

**Prompt:** [PROMPT-MOD05-PRIVACY-G7-v1.0.md](../prompts/PROMPT-MOD05-PRIVACY-G7-v1.0.md) · **Launcher:** [PROMPT-MOD05-PRIVACY-G7-LAUNCH-v1.0.md](../prompts/PROMPT-MOD05-PRIVACY-G7-LAUNCH-v1.0.md)

## 0. Diagnóstico (verificado en el repositorio el 2026-10-15)

**G7 de estas fases depende del G7 de la plataforma, y la plataforma aún no tiene producción.**

| Condición de plataforma (ADR-069 §3) | Estado | Evidencia |
| --- | --- | --- |
| Dominio productivo | ❌ | `nginx/nginx.prod.conf` conserva 2 `REPLACE_ME_PRODUCTION_DOMAIN`; `.env.production.example` conserva 4, más 5 `approval-required` |
| TLS | ❌ | Sin certificado ni CA decididos ([plan de las cinco condiciones](2026-09-12-plat-ops-g7-cinco-condiciones.md) §2) |
| Rollback por componente | ⚠ | Documentado en el runbook de release; nunca ensayado salvo la reversibilidad de migraciones |
| Restore global | ⚠ | PostgreSQL con ensayo solo en desarrollo; MinIO y Redis sin procedimiento |
| Restore por tenant | ✅ | [Fase 01](../informes/INFORME-PLAT-OPS-RESTORE-TENANT-FASE-01-v1.0.md) en GO |

**Bloqueo raíz:** las **seis decisiones de infraestructura del CTO** (ADR-078 §D3 P2; [plan G7 de plataforma](../prompts/PROMPT-PLAT-OPS-G7-AUTORIZACION-PRODUCCION-v1.0.md) F0.2):
1. FQDN;
2. hosting;
3. CA y método ACME;
4. propietario de la zona DNS;
5. ventana operativa;
6. RPO/RTO.

Sin ellas no hay TLS ni ensayos sobre el entorno real.

**Riesgo de calendario:** la Ley 2573 rige el **19-11-2026** (5 semanas). La suplantación está lista en código y en CI, pero **no puede atenderse dentro de iWana mientras no haya producción**. Ver §4, contingencia.

## Estado al 2026-10-15 (Ola 1)

| Frente | Estado |
| --- | --- |
| K | K1 ✅, K2 ✅ (fixture), K3 ✅ GO. K2 falla sobre el estado heredado: 4 objetivos sin tabla (G7-1) |
| M | M1: borrador con 3 gates abiertos. M2: NO-GO (paso 6 y login 500). Rollback por tenant en base nueva ✅ |
| C | C1 ✅: branches de `crm/expedientes` en 81,44 % |
| D-CONT | ✅ Aprobado por el CTO y aplicado: `ContactsModule` desmontado (`crm.module.ts`), con un spec de regresión |
| Ola 2 | K2Δ ✅ · L1 ✅ (HTTP 500 = deuda P3, corregida) · D-CONT ✅ · M3: Compose ✅, rollback en sitio NO-GO (el CLI choca con el registro de tenants) · M2b: smoke ✅, release NO-GO (paso 4 con tablas nunca creadas, paso 8 sin validar, M1-G2) |
| Ola 3 | M4 ✅ (GO de `sec-eng`) · TA1 ✅ (O-1 P1: `opportunities` montado sin tabla → D-OPP) · M2c ✅ pasos 1–11, **con el tenant vacío en los backfills** → condición M2d |
| **Decisión del CTO (2026-10-16)** | [ADR-095](../adrs/ADR-095-Topologia-Productiva-Dominio-TLS-Hosting.md): `app.iwana.co` y `portal.iwana.co`, Let's Encrypt HTTP-01, DNS de la empresa, ventana martes o miércoles de 22:00 a 01:00, RPO ≤ 1 h y RTO ≤ 4 h. Hosting abierto (OCI Bogotá, servidor propio o Hostinger VPS). **G7 diferido hasta la beta mínima**; foco en terminar el código |
| Lado módulo | ✅ con la condición M2d — [informe de preparación](../informes/INFORME-MOD05-PRIVACY-G7-PREPARACION-v1.0.md). **G7 NO-GO por el frente P** |

## 1. Frentes

| Frente | Qué cierra | Dueño | Depende de |
| --- | --- | --- | --- |
| **P — Plataforma** | Las 4 condiciones abiertas, con el plan G7 de plataforma existente (F2 TLS en seco → F3 ensayos de rollback y restore global → F4 RPO/RTO → F5 TLS real → F6) | `plat-ops`; decisiones del CTO | **Las seis decisiones** |
| **K — ADR-058 fase 2** | Checklist MOD05 #10: clave `PII_ENCRYPTION_KEY` separada de la de MFA, fail-closed en producción, recifrado de los datos personales existentes | `sr-backend` → `data-eng` → `sec-eng` | Nada; **arranca ya** |
| **M — Release por tenant** | Un runbook único de ventana por tenant para estas fases y su **ensayo completo** sobre bases desechables | `plat-ops` + `sr-qa` | Nada para el ensayo; P y K para ejecutarlo en producción |
| **C — Cumplimiento y calidad** | Dictamen del contador (ADR-093 §6 y M03), dictamen jurídico (ADR-094 §7.3), Oficial de privacidad designado por ISP, branches de `crm/expedientes` ≥ 80 % (P1) | CTO · `sr-qa` | — |

## 2. Frente M: contenido del runbook por tenant

El runbook a escribir es `RUNBOOK-MOD05-PRIVACY-RELEASE-POR-TENANT-v1.0`. Integra y **no duplica**:
- el [runbook B13](../runbooks/RUNBOOK-MOD05-PARTY-PII-BACKFILL-v1.0.md) (143 y backfill de Party);
- el [runbook manual de privacidad](../runbooks/RUNBOOK-PRIVACY-BLOQUEO-SUPRESION-MANUAL-v1.0.md);
- el [runbook de release y rollback](../runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md);
- el de [MinIO](../runbooks/RUNBOOK-MEDIA-MINIO-v1.0.md);
- el de [rotación de claves](../runbooks/RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md).

| Paso | Contenido | Parada |
| --- | --- | --- |
| 0 | Precondiciones: G7 de plataforma, frente K desplegado, dictámenes, Oficial designado y texto de autorización aprobado por el ISP | Cualquiera ausente → NO-GO |
| 1 | Backup global y del tenant, con restore aislado verificado (herramienta de la Fase 01) | Sin restore verificado, no se migra |
| 2 | Ventana: escrituras detenidas; públicas 026 y 027; tenant 143 → 148 en orden del runner | Exit distinto de 0 → restore |
| 3 | Backfill de la 143 (dry-run → resolución humana → `--apply` → conteos), según B13 | Candidatos sin resolver → parar |
| 4 | Conciliación del backfill de la 146: filas sin Party o sin finalidad, informadas sin PII y resueltas por el Oficial | Sin conciliar → registrar y decidir |
| 5 | `backfill-placeholder-contacts` (dry-run → `--apply`), con el conteo de `ACTIVE` sin contacto entregado al operador | — |
| 6 | Frente K: recifrado de la PII existente a `PII_ENCRYPTION_KEY` (dry-run → aplicar → verificar) | Verificación incompleta → restore |
| 7 | Configuración del tenant: publicar el texto `AUTORIZACION` (**sin él, la captura y la conversión responden 422**), asignar `privacy.manage` al Oficial y revisar la retención | — |
| 8 | MinIO: bucket privado para `stratum_evidence` y `privacy_evidence`, sin política pública y con URL firmada de 300 s | URL pública → NO-GO |
| 9 | Arranque de las aplicaciones y smoke: alta con autorización, conversión, contacto pendiente, solicitud y suplantación sobre un tenant de prueba, y el job de alertas registrado | Smoke rojo → rollback |
| 10 | Entrada en vigor del runbook manual de privacidad: registro de casos abierto y reporte mensual | — |
| 11 | Rollback: **antes** del paso 3, restore; **después**, solo restore del tenant. Nunca `down` de la 143 ni de la 146 con datos reales | — |

## 3. Matriz de dispatch

Skills verificadas en disco; se leen como documentación.

| Bloque | Subagente | Obligatorias | Apoyo | Gate |
| --- | --- | --- | --- | --- |
| K1 | `sr-backend` | `nestjs-expert`, `backend-security-coder`, `test-driven-development` | — | Turbo API `--force`; fail-closed en producción probado |
| K2 | `data-eng` | `postgresql`, `backend-security-coder` | `database-migration` | Recifrado contra Postgres real: dry-run, aplicar e idempotencia |
| K3 | `sec-eng` | `security-auditor` | — | GO de K1 y K2 |
| M1 | `plat-ops` | `docs-architect`, `docker-expert` | `postgresql` | El runbook revisado por `sec-eng` |
| M2 | `sr-qa` + `plat-ops` | `iwana-test-evidence`, `verification-before-completion` | `playwright-skill` | Ensayo del runbook completo sobre una base desechable con datos sintéticos, con tiempos y conteos |
| C1 | `sr-qa` | `testing-patterns`, `iwana-test-evidence` | — | Branches de `crm/expedientes` ≥ 80 % |

**Orden:** K1 → K2 → K3 · M1 → M2 (M2, después de K2) · C1 en paralelo. El frente P sigue su propio plan cuando el CTO tome las seis decisiones.

## 4. Contingencia de la Ley 2573 (decisión del CTO)

Si la producción de iWana no está lista el 19-11, la obligación sigue vigente para el ISP. Hay dos opciones:
- **(a)** Atender los reportes de suplantación en el sistema actual del ISP, con un procedimiento manual: suspensión inmediata del producto suplantado, constancia de radicación y copia de documentos. Se migra a iWana al salir a producción.
- **(b)** Adelantar el frente P con prioridad máxima, lo que exige las seis decisiones **esta semana**.

**AI-EM-ARCH recomienda decidir (b) ya y preparar (a) como respaldo.** El procedimiento manual de (a) se puede escribir sobre el runbook de privacidad existente.

## 5. Decisión de G7

AI-EM-ARCH recomienda G7 cuando P, K, M y C estén cerrados, con su evidencia. **El CTO aprueba** (ADR-069). Ningún agente marca G7.

## Lanzamiento

> Espejo de [PROMPT-MOD05-PRIVACY-G7-LAUNCH-v1.0.md](../prompts/PROMPT-MOD05-PRIVACY-G7-LAUNCH-v1.0.md); el archivo prevalece.

Ahora: K1 (`sr-backend`) ∥ M1 (`plat-ops`) ∥ C1 (`sr-qa`). Después: K2 → K3 y M2.
