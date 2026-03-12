# ADR-021: Adopcion de Perfil Unificado EM + Architect como Fuente Primaria de Gobernanza Tecnico-Operativa

**Estado:** Propuesto  
**Fecha:** 2026-03-07  
**Autor:** AI-EM-ARCH  
**Aprobador Requerido:** CTO Humano

---

## Contexto

El proyecto iWana neXt mantiene actualmente dos perfiles separados de gobierno tecnico:

- Engineering Manager Senior
- Lead Software Architect Senior

Ambos documentos son solidos, pero presentan fricciones operativas cuando se usan como fuente simultanea para dirigir ejecucion, arquitectura, calidad y cumplimiento:

1. Duplican responsabilidades de revision, escalacion y definicion.
2. Mezclan autoridad operativa y autoridad arquitectonica sin una matriz unica de decisiones.
3. Fijan stack y versiones con distintos niveles de precision, lo que puede entrar en conflicto con el baseline real de sprint y con [docs/prds/Stack_Tecnologico.md](docs/prds/Stack_Tecnologico.md).
4. No dejan una fuente primaria unica para sesiones mixtas de planificacion + arquitectura + control de calidad.

Esto incrementa el riesgo de interpretaciones inconsistentes al redactar PRDs, emitir prompts de ejecucion, revisar PRs o escalar decisiones al CTO.

---

## Decision

Se propone adoptar [docs/roles/Perfil_IA_EM_Architect_Unificado_v1.md](docs/roles/Perfil_IA_EM_Architect_Unificado_v1.md) como **fuente primaria de gobernanza tecnico-operativa** para:

- definicion de modulos,
- diseno arquitectonico,
- planificacion de sprint,
- code review de segunda capa,
- control de calidad de salida,
- verificacion de cumplimiento,
- escalaciones tecnicas al CTO.

Los documentos historicos se conservan, pero pasan a estado de **referencia historica**:

- [docs/roles/Perfil_IA_Engineering_Manager_Senior_v1.md](docs/roles/Perfil_IA_Engineering_Manager_Senior_v1.md)
- [docs/roles/Perfil_IA_Lead_Software_Architect_Senior_v1.md](docs/roles/Perfil_IA_Lead_Software_Architect_Senior_v1.md)

Reglas de adopcion:

1. El perfil unificado define la matriz de decision y los modos EM, Architect y Mixto.
2. El perfil unificado no reemplaza la autoridad del CTO ni la aprobacion formal de ADRs.
3. El perfil unificado no fija versiones operativas del stack; remite al baseline de sprint y a [docs/prds/Stack_Tecnologico.md](docs/prds/Stack_Tecnologico.md).
4. Toda sesion de trabajo nueva de gobierno, definicion o revision debe usar el perfil unificado como documento base.

---

## Consecuencias

### Positivas

- Reduce ambiguedad entre responsabilidades de gestion y arquitectura.
- Consolida precedencia documental y reglas de escalacion.
- Evita contradicciones entre latest estable y baseline implementable.
- Mejora consistencia entre PRD, HLD, ADR, review y DoD.
- Permite operar sesiones mixtas sin cambiar de perfil base.

### Negativas

- Requiere disciplina para que el equipo deje de invocar perfiles legados como fuente primaria.
- Exige actualizacion futura del perfil unificado cuando cambie stack, regulacion o gobernanza.

### Riesgos

- Que el equipo siga citando reglas del documento legado por costumbre.
- Que se interprete el documento unificado como aprobacion automatica de decisiones reservadas al CTO.

Mitigaciones:

- Marcar documentos legados como referencia historica.
- Mantener matriz de decisiones y precedencia documental visible en el perfil unificado.
- Exigir referencia al ADR-021 en futuras actualizaciones de gobernanza.

---

## Alternativas Evaluadas

| Alternativa                                           | Pros                             | Contras                              | Razon de descarte                                 |
| ----------------------------------------------------- | -------------------------------- | ------------------------------------ | ------------------------------------------------- |
| Mantener perfiles separados sin cambios               | No requiere migracion documental | Mantiene ambiguedad actual           | No resuelve solapes ni contradicciones operativas |
| Fusionar completamente y eliminar perfiles legados    | Fuente unica inmediata           | Pierde trazabilidad historica        | Descartada para preservar auditoria documental    |
| Mantener perfiles separados con anexo de coordinacion | Menor cambio estructural         | Sigue habiendo dos fuentes primarias | Insuficiente para sesiones mixtas                 |

---

## Dependencias

- [docs/prds/PRD_Sistema_ISP_Colombia_v2_2.md](docs/prds/PRD_Sistema_ISP_Colombia_v2_2.md)
- [docs/prds/Stack_Tecnologico.md](docs/prds/Stack_Tecnologico.md)
- [docs/roles/Perfil_IA_EM_Architect_Unificado_v1.md](docs/roles/Perfil_IA_EM_Architect_Unificado_v1.md)
- ADR-002, ADR-013, ADR-016 y ADRs vigentes ya citados por el proyecto
