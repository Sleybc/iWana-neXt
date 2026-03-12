# Archivo de skills no activas

Este directorio contiene skills retiradas del catalogo activo de iWana neXt durante la depuracion del 2026-03-12.

## Estado

- Origen: .agents/skills/
- Motivo del traslado: fuera de scope, solapamiento, baja prioridad o dependencia externa no justificada para el proyecto
- Restauracion: manual y controlada
- Desglose actual del archivo: 679 directorios y 4 archivos legacy trasladados desde la raiz anterior
- Layout operativo actual:
  - `candidate-restore/`: vacia tras la restauracion ejecutada
  - `candidate-keep/`: revisadas y mantener archivadas
  - `hold/`: no recomendadas por ahora
  - raiz del archivo: historico irrelevante o sin decision de restauracion inmediata

## Regla de restauracion

Solo restaurar una skill si cumple todos estos criterios:

1. aporta valor directo al stack o al roadmap activo
2. no duplica una skill ya activa
3. no contradice AGENTS.md ni las instrucciones del repo
4. sus dependencias y herramientas estan realmente disponibles

## Politica estricta de reingreso

Antes de restaurar una skill archivada, debe quedar explicitado:

1. el caso de uso recurrente que justifica su retorno
2. la prioridad de uso que tendria en el catalogo activo
3. si complementa o sustituye una skill ya activa
4. las actualizaciones necesarias en README, INDEX, MANIFEST e informe vigente

No restaurar una skill si solo mejora amplitud de catalogo, si depende de tooling no disponible o si vuelve a inflar ruido de activacion.

## Tabla de decision vigente

### Restaurar

Sin entradas vigentes.

### Mantener archivada

- github-actions-templates
- deployment-pipeline-design
- slo-implementation
- prometheus-configuration
- grafana-dashboards
- distributed-tracing

### Descartar por ahora

- nx-workspace-patterns
- nodejs-best-practices
- context7-auto-research

## Referencias

- .agents/skills/README.md
- .agents/skills/INDEX.md
- .agents/skills/MANIFEST.json
- docs/informes/INFORME-SISTEMA-SKILLS-AUDITORIA-v1.0.md

## Shortlist inicial de restauracion sugerida

La shortlist inicial quedo resuelta en la tabla de decision vigente anterior.
