# Informe PLAT-OPS — Reproducibilidad del perfil production

**Fecha:** 2026-07-28
**Responsable:** AI-PLAT-OPS
**Coordinación:** R0/R3.1
**Estado:** Remediación parcial; referencias pendientes bloquean el despliegue real

## Hallazgo y corrección

El perfil `production` tenía fallbacks `:latest` y tags flotantes, además de un
`MIGRATOR_IMAGE` implícito. Se eliminaron los fallbacks y Compose ahora exige
referencias explícitas para pgBouncer, MinIO, `mc`, Nginx y el migrator. PostgreSQL
18.3, Redis 8.6 y Typesense 28.0 quedan declarados con las referencias que el
baseline documenta.

`.env.production.example` contiene únicamente placeholders no desplegables y
valores no sensibles necesarios para resolver Compose. El uso productivo queda
documentado con `docker compose --env-file .env.production`; la validación usa
`config --quiet` para no imprimir secretos.

## Bloqueo coordinado

**[BLOQUEO]** `Stack_Tecnologico.md` registra pgBouncer, MinIO y el runtime de
Nginx como “latest stable”, pero no aprueba una versión exacta ni un digest.
Tampoco existe en el repo una referencia aprobada para la imagen del migrator.
No se inventaron versiones: R0/R3.1 debe aportar o aprobar esas referencias
antes del despliegue. Mientras tanto, los placeholders hacen que la validación
estructural de Compose sea reproducible sin convertirlos en imágenes operativas.

## Verificación

```text
docker compose --env-file .env.production.example --profile production -f docker-compose.yml config --quiet
```

La salida esperada es vacía y el código de salida debe ser `0`. No se ejecuta
`config` sin `--quiet` porque puede revelar valores de entorno.

## SEC finales R0/R3.1

`migrator-prod` usa exclusivamente `DB_MIGRATOR_USER` y
`DB_MIGRATOR_PASSWORD`. API, worker y pgBouncer usan la identidad de aplicación
(`DB_APP_USER`/`DB_APP_PASSWORD`), mientras PostgreSQL conserva la identidad de
bootstrap (`DB_BOOTSTRAP_USER`/`DB_PASSWORD`). Las seis variables de credenciales
requeridas —tres identidades, cada una con usuario y contraseña: bootstrap, app y
migrator— fallan individualmente si faltan; no tienen defaults.

Las referencias pendientes del ejemplo ahora llevan un tag no operativo
`approval-required`, por lo que no pueden resolverse como `latest`. El bloqueo de
las aprobaciones de pgBouncer, MinIO, Nginx, Adminer y migrator permanece explícito.
