# CHECKLIST-SISTEMA-SKILLS-GOBERNANZA-v1.0

Modo activo: Mixto.

## Proposito

Definir la politica operativa minima para mantener el catalogo de skills de iWana neXt util, pequeno y alineado al stack real del repo.

## Reglas de admision

1. Una skill solo entra al catalogo activo si cubre un caso de uso recurrente y verificable en el repo.
2. Toda skill nueva o restaurada debe clasificarse como primera linea, segunda linea o especializada por necesidad.
3. Debe quedar explicito si reemplaza, complementa o duplica una skill ya activa.
4. Su frontmatter debe ser valido y compatible con el formato soportado por skills.
5. Debe quedar trazabilidad sincronizada en README, INDEX, MANIFEST e informe vigente.

## Reglas de rechazo

1. Rechazar skills que solo agreguen amplitud de catalogo sin necesidad real.
2. Rechazar skills que dependan de tooling, MCPs o flujos no disponibles en el entorno real.
3. Rechazar skills que contradigan AGENTS.md, el stack aprobado o la gobernanza documental.
4. Rechazar skills redundantes frente a una skill activa ya suficiente.

## Reglas de restauracion

1. Restaurar solo skills con decision vigente de restauracion o nueva aprobacion explicita.
2. Antes de restaurar, verificar caso de uso, prioridad, impacto sobre skills activas y costo de ruido de activacion.
3. Restaurar por reincorporacion controlada en `.agents/skills/` y sincronizacion de `skills-lock.json` cuando aplique.
4. Actualizar siempre README, INDEX, MANIFEST e informe vigente tras la restauracion.

## Regla de mantenimiento

1. El catalogo activo debe permanecer pequeno y orientado a ejecucion real.
2. Cualquier drift de formato o metadata invalida debe corregirse antes de ampliar el catalogo.
3. Toda revision futura debe partir del estado documentado en `docs/informes/INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md`.

## Estado actual de referencia

- Skills activas: 41.
- Restaurables priorizadas: 0.
- Revisadas y mantener archivadas: 6.
- En hold: 3.
- Decisions historicas: conservadas en `docs/informes/INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md`.
