---
name: codebase-cleanup-deps-audit
description: Auditoría de dependencias pnpm para iWana neXt — vulnerabilidades CVE, licencias, paquetes desactualizados, supply chain. Usar antes de releases o cuando pnpm audit reporte issues.
---

# Codebase & Dependency Audit — iWana neXt

## Propósito

Governa la auditoría de dependencias del monorepo iWana neXt con pnpm.
Cubre vulnerabilidades CVE, licencias, paquetes desactualizados y supply chain.

## Usar este skill cuando

- Se prepare un release y se quiera verificar el estado de seguridad de las dependencias.
- `pnpm audit` reporte vulnerabilidades en el pipeline de CI.
- Se sospeche de una dependencia desactualizada o con CVE conocido.
- Se revise el lockfile antes de un merge a main.

## No usar este skill cuando

- La tarea sea de seguridad de código fuente (usar `security-auditor`).
- La tarea sea de configuración de infraestructura (usar `docker-expert`).

## Reglas del monorepo pnpm

- **Siempre usar `pnpm audit`** — nunca `npm audit` ni `yarn audit`.
- El lockfile es `pnpm-lock.yaml` — nunca `package-lock.json` ni `yarn.lock`.
- Los workspaces se filtran con `pnpm --filter`.
- TruffleHog está activo en CI para detección de secretos — no hardcodear credenciales.

## Comandos de auditoría

```bash
# Auditoría de todo el monorepo
pnpm audit

# Auditoría solo de dependencias de producción
pnpm audit --prod

# Auditoría de un workspace específico
pnpm --filter @iwana/api audit
pnpm --filter @iwana/web audit

# Ver paquetes desactualizados
pnpm outdated

# Ver paquetes desactualizados en un workspace
pnpm --filter @iwana/api outdated

# Actualizar un paquete (con precaución — verificar breaking changes)
pnpm update nombre-paquete --filter @iwana/api

# Verificar integridad del lockfile
pnpm install --frozen-lockfile
```

## Workflow de auditoría pre-release

### Paso 1: Auditoría de vulnerabilidades

```bash
pnpm audit --prod
```

Interpretar resultados:

| Severidad | Acción |
|---|---|
| `critical` | Bloquea release. Corregir en el sprint actual |
| `high` | Corregir antes del release o documentar excepción con CTO |
| `moderate` | Evaluar impacto. Corregir si hay fix disponible |
| `low` | Documentar en backlog. No bloquea release |

### Paso 2: Paquetes desactualizados

```bash
pnpm outdated
```

Priorizar actualizaciones de:
- Paquetes con CVEs conocidos (ver paso 1)
- Paquetes en `dependencies` (producción) antes que `devDependencies`
- Paquetes del stack core: `next`, `@nestjs/*`, `typeorm`, `bullmq`

### Paso 3: Verificar lockfile

```bash
# Verificar que el lockfile está sincronizado
pnpm install --frozen-lockfile

# Si falla, regenerar:
pnpm install
git add pnpm-lock.yaml
```

### Paso 4: Verificar secretos (TruffleHog)

TruffleHog corre automáticamente en CI. Para ejecutar localmente:

```bash
# Si TruffleHog está instalado:
trufflehog filesystem . --exclude-paths=.gitignore
```

## Remediación de vulnerabilidades

### Actualización directa (recomendado)

```bash
# Ver si hay una versión que corrija el CVE
pnpm audit --json | jq '.advisories | to_entries[] | {package: .value.module_name, severity: .value.severity, fix: .value.patched_versions}'

# Actualizar el paquete vulnerable
pnpm update nombre-paquete@version-segura --filter workspace-afectado
```

### Override forzado (solo si no hay actualización directa)

En `package.json` raíz, sección `pnpm.overrides`:

```json
{
  "pnpm": {
    "overrides": {
      "paquete-vulnerable": ">=version-segura"
    }
  }
}
```

> **Nota:** El repo ya tiene un override activo: `"ioredis": "5.10.0"`. Documentar cualquier nuevo override con el CVE que lo justifica.

## Revisión de licencias

Para dependencias de producción, verificar que la licencia es compatible:

- ✅ MIT, Apache 2.0, BSD, ISC — compatibles
- ⚠️ GPL, AGPL — revisar con CTO antes de incluir
- ❌ Licencias comerciales sin contrato — no incluir sin aprobación

```bash
# Ver licencias de dependencias directas
pnpm licenses list
```

## Checklist pre-release

- [ ] `pnpm audit --prod` sin vulnerabilidades `critical` ni `high` sin excepción documentada
- [ ] `pnpm outdated` revisado — paquetes core actualizados o decisión documentada
- [ ] `pnpm install --frozen-lockfile` sin errores
- [ ] Sin secretos detectados por TruffleHog en CI
- [ ] Overrides documentados en `package.json` con justificación

## Anti-patrones

- `npm audit fix --force` — sobrescribe el lockfile pnpm y rompe el monorepo
- Ignorar `critical` sin excepción documentada — bloquea merge según gates de AGENTS.md
- Hardcodear credenciales en cualquier archivo — TruffleHog lo detecta en CI
- Actualizar paquetes sin revisar breaking changes — especialmente en `@nestjs/*` y `next`
- Eliminar overrides sin verificar que el CVE fue corregido upstream
