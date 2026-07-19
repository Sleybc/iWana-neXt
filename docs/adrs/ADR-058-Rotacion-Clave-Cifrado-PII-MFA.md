# ADR-058: Rotación y separación de la clave de cifrado AES (MFA + PII)

**Versión:** 1.0
**Estado:** Aprobado
**Fecha:** 2026-07-19
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Aprobado por:** CTO Humano (2026-07-19)
**Hallazgo origen:** SEC-02 (crítica) — revisión AppSec 2026-07-19

---

## Contexto

La variable `MFA_ENCRYPTION_KEY` (64 hex → 32 bytes) se usa como clave AES-256-GCM para:

1. Secretos MFA (`mfaSecret`) en usuarios de tenant y plataforma.
2. PII del CRM y parties: cédulas, teléfonos, emails cifrados en reposo (expedientes, subscribers, contacts, potentials, parties).

Joi en `app.module.ts` solo valida `length(64)`. Un valor de **64 ceros** (`0`×64) es sintácticamente válido, tiene entropía nula y —si estuvo en historial git o `.env` compartidos— compromete **todo el cifrado en reposo** del CRM, no solo MFA.

La remediación no es solo “cambiar el `.env`”: el ciphertext existente solo se descifra con la clave antigua. Hace falta un plan de rotación con ventana de doble lectura y recifrado controlado. Ese plan es operativo (AI-PLAT-OPS) y se ejecuta según [`RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md`](../runbooks/RUNBOOK-ENCRYPTION-KEY-ROTATION-v1.0.md) bajo el go del CTO registrado en este ADR.

## Decisión

### 1. Rechazo fail-fast de claves débiles (inmediato, sin tocar datos)

Antes de aceptar `MFA_ENCRYPTION_KEY` (y cualquier clave de cifrado hermana):

- Exactamente 64 caracteres hex `[0-9a-fA-F]{64}`.
- Rechazar patrones de entropía nula o placeholder: todo `0`, todo `f`/`F`, repetición de un solo nibble, y literales documentados tipo `CHANGE_ME` / secuencias obvias de laboratorio si aparecen como hex válido.
- En `NODE_ENV=production` (y staging si existe): fallar el arranque si la clave no pasa. En desarrollo local: fallar igual — no hay excepción de “ceros para docker”.

Esto cierra el vector de arranque con clave inútil **sin** recifrar.

### 2. Rotación con doble clave (fase operativa)

Introducir soporte de lectura dual:

| Variable | Rol |
| --- | --- |
| `MFA_ENCRYPTION_KEY` | Clave **activa** (cifra escrituras nuevas) |
| `MFA_ENCRYPTION_KEY_PREVIOUS` | Opcional; solo descifrado de ciphertext legado durante la ventana de rotación |

Procedimiento (AI-PLAT-OPS + AI-SR-FULL):

1. Generar clave nueva con `openssl rand -hex 32` (o HSM/secrets manager on-prem).
2. Desplegar con `PREVIOUS` = clave comprometida/antigua y `MFA_ENCRYPTION_KEY` = nueva.
3. Job/migración revisable (BullMQ o CLI tenant-aware) que recorre entidades cifradas, descifra con previous/activa y reescribe con activa; idempotente; por tenant; con métricas y dry-run.
4. Tras verificación: retirar `PREVIOUS` del entorno.
5. **No** reescribir historial git en el mismo cambio de código: la limpieza del historial es decisión CTO aparte (ver Escalación).

### 3. Separación de claves MFA vs PII (fase 2, no bloquea la rotación)

Blast radius actual: una sola clave abre MFA y cédulas. Tras la rotación de emergencia:

- Introducir `PII_ENCRYPTION_KEY` (mismo formato y validación).
- MFA y secretos de autenticación siguen en `MFA_ENCRYPTION_KEY`.
- CRM/parties migran escrituras a `PII_ENCRYPTION_KEY` con el mismo patrón previous/activa.
- Hasta completar fase 2, `PII_ENCRYPTION_KEY` puede ausentarse y el runtime usa `MFA_ENCRYPTION_KEY` como fallback **solo en no-producción**; en producción fase 2 exige ambas.

### 4. Fuera de alcance de este ADR

- Ejecutar el recifrado sobre datos reales sin go del CTO.
- Reescritura destructiva del historial git (filter-repo/BFG).
- Cambiar algoritmo (AES-256-GCM se mantiene).

## Consecuencias

**Positivas**

- Deja de ser posible arrancar con clave de entropía nula.
- Rotación operable sin downtime de lectura.
- Reduce (fase 2) el acoplamiento MFA↔PII.

**Negativas / costos**

- Job de recifrado toca todos los schemas tenant; requiere ventana y monitoreo.
- Doble variable aumenta superficie de configuración (mitigado por Joi).
- Historial git puede seguir conteniendo la clave débil hasta decisión CTO de purge.

**Riesgos**

- Recifrado incompleto deja filas ilegibles al retirar `PREVIOUS` → el job debe reportar fallos y bloquear el retiro.
- Confundir previous/activa en un rollback → runbook con orden estricto.

## Alternativas descartadas

1. **Solo documentar “usar openssl rand”** — no es control; Joi seguiría aceptando ceros.
2. **Recifrado in-place sin previous** — ventana de indisponibilidad e irrecuperabilidad ante fallo a mitad.
3. **Una clave por tenant** — mejora aislamiento pero complica ops MVP; queda como evolución futura, no bloquea SEC-02.

## Cumplimiento e impacto

| Dimensión | Impacto |
| --- | --- |
| Multi-tenant | Recifrado por schema; sin cross-tenant |
| Seguridad | Crítico — remedia clave débil / historial |
| Escala | Job batch; miles de tenants ⇒ paginación + concurrency limitada |
| Regulación | Refuerza cifrado en reposo (Ley 1581 — medida técnica); no sustituye base legal de tratamiento |

## Aprobación CTO (2026-07-19)

1. **ADR aprobado** — decisión §§1–3 vigentes.
2. **Go operativo** — rotación + recifrado autorizados por entorno (dev → staging → prod) siguiendo el runbook; dry-run obligatorio antes de recifrado real.
3. **Purge de historial git** — autorizado **después** de rotar todos los entornos vivos que aún usen la clave comprometida; force-push solo en ventana coordinada por PLAT-OPS.

## Referencias

- Hallazgo SEC-02 (revisión AppSec 2026-07-19)
- `apps/api/src/app.module.ts` (validación Joi)
- Servicios CRM/auth que derivan AES desde `MFA_ENCRYPTION_KEY`
- ADR-030 (Party / campos cifrados)
- RF-SEC / PRD sistema — auditoría y PII
