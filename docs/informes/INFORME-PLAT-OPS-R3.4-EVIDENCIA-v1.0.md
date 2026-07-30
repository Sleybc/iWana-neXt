# Informe de evidencia — R3.4 release y rollback

**Tipo:** Informe operativo
**Versión:** 1.0
**Fecha:** 2026-07-30
**Responsable:** AI-PLAT-OPS
**Estado:** Evidencia parcial; R3.4 no cerrado
**Artefacto:** [RUNBOOK-RELEASE-ROLLBACK-v1.0.md](../runbooks/RUNBOOK-RELEASE-ROLLBACK-v1.0.md)

## 1. Alcance de esta evidencia

Este informe registra únicamente verificaciones ejecutadas durante la creación del runbook. No registra como probados backups, restores, rollback ni certificados de producción.

## 2. Verificaciones ejecutadas

| Control | Comando / fuente | Resultado | Alcance |
|---|---|---|---|
| Configuración estructural del perfil production | `docker compose --profile production --env-file .env.production.example -f docker-compose.yml config --quiet` | **PASS**, código `0`, salida vacía | Valida interpolación de Compose; no despliega ni valida imágenes operativas, secretos, migraciones o TLS. |
| Presencia de secretos/certificados en Git | `git check-ignore -v secrets/iwana-selfsigned.crt secrets/iwana-selfsigned.key` y `git ls-files secrets` | **PASS**: ambos patrones ignorados; solo `secrets/.gitkeep` versionado | No prueba que exista un certificado operativo. |
| Estado local del directorio `secrets/` | listado de `secrets/` | **Solo `.gitkeep`** | No hay certificado disponible para probar. |
| Estado de cambios previos | `git status --short` | Cambios preexistentes no pertenecientes a R3.4 | No fueron modificados ni incluidos. |

## 3. Pendientes que bloquean el cierre

| Evidencia requerida | Estado | Responsable / decisión |
|---|---|---|
| Ensayo reproducible de rollback por componente y completo | **PENDIENTE** | AI-PLAT-OPS, con QA; registrar commit/digests y códigos de salida. |
| Restore global PostgreSQL verificado | **PENDIENTE** | AI-PLAT-OPS + DATA-ENG; datos protegidos y destino aislado. |
| Restore por schema tenant verificado | **PENDIENTE** | AI-PLAT-OPS + DATA-ENG; seleccionar tenant autorizado y no registrar PII. |
| Dominio y proveedor de CA para producción | **PENDIENTE** | **CTO**. La decisión registrada exige CA reconocida. |
| Emisión, renovación, recarga Nginx y handshake público | **PENDIENTE** | AI-PLAT-OPS; requiere provisión R3.5 y revisión SEC-ENG. |
| Referencias operativas de imágenes de producción | **PENDIENTE según R3.1** | Aprobación del release / CTO según corresponda. |

## 4. Dictamen

El runbook R3.4 está creado y cubre la superficie solicitada. La evidencia disponible es únicamente estructural/documental. **No se declara R3.4 cerrado ni se autoriza un release de producción** hasta que los pendientes anteriores tengan evidencia archivada y G7/CTO emitan el go correspondiente.
