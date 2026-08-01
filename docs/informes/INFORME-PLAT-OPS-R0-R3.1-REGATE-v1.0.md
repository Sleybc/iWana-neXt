# Informe PLAT-OPS — Re-gate R0/R3.1

**Fecha:** 2026-07-28
**Responsable:** AI-PLAT-OPS
**Estado:** PASS estructural de Compose

> **Nota de vigencia (2026-07-30).** Tras esta evidencia, el perfil `production`
> se separó a `docker-compose.prod.yml`. El comando citado más abajo se conserva
> tal como se ejecutó y **no se reescribe**; la invocación vigente añade
> `-f docker-compose.prod.yml` junto a `-f docker-compose.yml`. Ver
> [INFORME-PLAT-OPS-REPRODUCIBILIDAD-PRODUCTION-v1.0.md](./INFORME-PLAT-OPS-REPRODUCIBILIDAD-PRODUCTION-v1.0.md).

## Corrección

`.env.production.example` ahora contiene placeholders no secretos y no vacíos
para las dos claves JWT. Se expresan como PEM con separadores `\\n` dentro de
valores entrecomillados; Compose conserva el valor y la API convierte esos
separadores a saltos de línea en runtime. Las claves reales solo deben existir
en el `.env.production` local ignorado por Git.

## Verificación

Comando exacto ejecutado:

```text
docker compose --profile production --env-file .env.production.example -f docker-compose.yml config --quiet
```

**Resultado:** PASS — salida vacía, código de salida `0`.

No se modificaron `.env.development` ni los documentos preexistentes protegidos
contra cambios de whitespace.
