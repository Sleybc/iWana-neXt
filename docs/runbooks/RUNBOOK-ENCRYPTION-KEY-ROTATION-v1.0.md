# RUNBOOK — Rotación de clave de cifrado (MFA + PII)

**Tipo:** Runbook operativo  
**Módulo:** TRANSVERSAL — Secretos / cifrado en reposo  
**Versión:** 1.0  
**Fecha:** 2026-07-19  
**Autor:** AI-PLAT-OPS  
**Referencias:** [ADR-058](../adrs/ADR-058-Rotacion-Clave-Cifrado-PII-MFA.md) · [INFORME SEC-02…05](../informes/INFORME-TRANSVERSAL-REMEDIACION-SEC-02-05-v1.0.md) · hallazgo SEC-02  
**Estado ADR-058:** Aprobado (CTO 2026-07-19) — go ops registrado; ejecutar por entorno con checklist §3

---

## Propósito

Rotar `MFA_ENCRYPTION_KEY` (AES-256-GCM, 64 hex → 32 bytes) con ventana de doble lectura (`MFA_ENCRYPTION_KEY_PREVIOUS`), sin downtime de lectura y sin perder ciphertext legado.

Esta clave cifra secretos MFA **y** PII de CRM/parties hasta la fase 2 del ADR (separación `PII_ENCRYPTION_KEY`).

**Fuera de alcance de este runbook:** cambiar algoritmo. Recifrado prod y purge git están **autorizados** por CTO (ADR-058) y se ejecutan aquí con dry-run y checklist por entorno.

---

## 1. Generación segura de clave

```bash
openssl rand -hex 32
```

- Salida: exactamente 64 caracteres hex (`[0-9a-f]`).
- Generar **fuera** del repositorio; pegar solo en el secret store / `.env` local no versionado.
- No reutilizar claves entre entornos.
- Alternativa on-prem: HSM / secrets manager del operador (mismo formato hex).

Validación fail-fast (código, AI-SR-FULL): rechazar entropía nula (p. ej. 64 ceros, 64 `f`) y placeholders obvios. No hay excepción “ceros para docker”.

---

## 2. Orden de despliegue (estricto)

| Paso | Acción | Notas |
| --- | --- | --- |
| 0 | Inventario | CLI desplegado: `pnpm encryption:reencrypt` (alias de `pnpm --filter @iwana/api encryption:reencrypt` → `node dist/cli/reencrypt-aes.js`). Requiere build previo de `@iwana/api`. |
| 1 | Generar clave nueva | `openssl rand -hex 32` → guardar como **nueva** (aún no activa en prod). |
| 2 | Desplegar doble clave | `MFA_ENCRYPTION_KEY_PREVIOUS` = clave **antigua** (la que aún descifra el ciphertext existente; puede ser débil/comprometida). `MFA_ENCRYPTION_KEY` = clave **nueva** fuerte (cifra escrituras nuevas; Joi rechaza entropía nula). |
| 3 | Healthcheck | `GET /api/v1/health` OK; login/MFA/PII de lectura smoke en el entorno. |
| 4 | Dry-run del recifrado | `pnpm encryption:reencrypt` (default dry-run). Revisar conteos: candidates, reencrypted (plan), decrypt_errors, schemas. Opcional: `-- --schema=tenant_x`. |
| 5 | Recifrado real | Solo si dry-run está limpio y hay go/no-go del entorno (tabla abajo): `pnpm encryption:reencrypt -- --apply`. Idempotente por tenant; métricas en stdout. |
| 6 | Verificación 100 % | `pnpm encryption:reencrypt -- --verify-active-only` — descifrado solo con `MFA_ENCRYPTION_KEY` (sin PREVIOUS). Exit ≠ 0 si quedan fallos. |
| 7 | Retirar PREVIOUS | Quitar `MFA_ENCRYPTION_KEY_PREVIOUS` del entorno y redesplegar. |
| 8 | Post-check | Healthcheck + smoke MFA/PII otra vez. |

Rollback en ventana de doble clave: volver a poner la antigua en `MFA_ENCRYPTION_KEY` y dejar `PREVIOUS` vacío o alineado al runbook de incidente — **no** retirar PREVIOUS si el recifrado no terminó.

Coordinación: AI-PLAT-OPS ejecuta el despliegue de variables y la orquestación; el artefacto de recifrado lo entrega AI-SR-FULL. Sin ese binario/job, detenerse en el paso 0.

---

## 3. Checklist go / no-go por entorno

| Entorno | Quién da el go | Condiciones mínimas |
| --- | --- | --- |
| **dev / lab local** | Owner técnico del entorno | Backup o volumen desechable aceptable; dry-run primero; no secretos reales de clientes. |
| **staging** | EM-ARCH + owner staging | Backup restaurable verificado; ventana acordada; dry-run limpio; ADR-058 conocido. |
| **producción** | **CTO — go concedido 2026-07-19** (ADR-058) | Backup/restore probado; dry-run limpio en staging equivalente; plan de rollback escrito; owner PLAT-OPS confirma ventana; G7 de release si aplica despliegue. |

Go CTO de ADR registrado. Cada ventana de prod aún exige checklist de esta fila antes de pasos 5–7 (no reabrir decisión; sí confirmar readiness operativa).

---

## 4. Qué NO hacer

1. **Dejar 64 ceros** (u otra clave de entropía nula) en ningún entorno, ni “temporalmente” en docker.
2. **Commitear** `MFA_ENCRYPTION_KEY`, `MFA_ENCRYPTION_KEY_PREVIOUS`, ni dumps con ciphertext+clave.
3. **Retirar `PREVIOUS`** antes de verificar recifrado al **100 %** (filas ilegibles = incidente).
4. Invertir previous/activa en el primer despliegue (escrituras nuevas quedarían con la clave vieja o ilegibles).
5. Ejecutar purge de historial git en el mismo cambio que la rotación (ver §5).
6. Force-push o `git filter-repo` / BFG sin decisión CTO y sin confirmar que ningún entorno vivo depende del secreto leaked.

---

## 5. Historial git (purge)

Si una clave débil o real estuvo versionada:

- **No** reescribir historial en este procedimiento.
- Escalar al CTO: purge solo **después** de rotar en todos los entornos que aún pudieran usar ese valor.
- Implica coordinación (force-push controlado, invalidación de clones) — fuera de alcance de AI-PLAT-OPS sin go explícito.

---

## 6. Variables y plantilla

Ver `.env.example` (raíz): `MFA_ENCRYPTION_KEY` vacío + comentario de generación; `MFA_ENCRYPTION_KEY_PREVIOUS` opcional y vacío por defecto.

En local, si el `.env` no versionado aún tiene 64 ceros: generar clave nueva, seguir §2 (PREVIOUS = valor antiguo solo en secret store local), no subir el archivo.

---

## 7. Nota para AI-SEC-ENG

Este runbook **no** auto-aprueba el gate de seguridad (G-SEC). SEC-ENG debe re-revisar tras merges de remediación (fail-fast Joi, job de recifrado, ausencia de placeholders inseguros en ejemplos versionados).
