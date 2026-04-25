# ADR-024: Migracion CRM a Expediente Unico Progresivo

**Estado:** Aprobado  
**Fecha:** 2026-03-23  
**Autor:** AI-EM-ARCH  
**Contexto PRD:** docs/prds/PRD-MOD05-CRM-DEFINICION-v2.0.md  
**Informe soporte:** docs/informes/INFORME-MOD05-DEFINICION-v1.0.md (§10)

---

## Contexto

MOD05 CRM paso por tres iteraciones de diseno:

1. **v1.0 — CRM clasico:** entidades separadas (leads, suscriptores, contratos) con pipeline plano.
2. **v1.1 — Lifecycle comercial-operativo:** PotentialLead → ProspectCase → instalacion → cliente. Implementado en Sprint 01 con PotentialsModule, ProspectsModule, ReviewsModule.
3. **v2.0 — Expediente Unico Progresivo:** registro maestro unico que reemplaza PotentialLead + ProspectCase con 8 secciones de captura progresiva, 12 estados de pipeline, 4 dimensiones de completitud y consentimiento triple (Ley 1581).

La auditoría de Sprint 02 revelo que el modelo dual PotentialLead/ProspectCase:
- Fragmentaba la informacion del prospecto entre dos entidades con campos solapados.
- Requeria sincronizacion manual entre entidades en cada transicion.
- No soportaba captura progresiva: obligaba a completar todos los datos antes de avanzar.
- No modelaba consentimiento triple ni completitud multidimensional.

---

## Decision

Se adopta el modelo Expediente Unico Progresivo con **migracion aditiva**:

1. Se crea `ExpedienteRecord` como entidad maestra con ~60 columnas en 8 secciones.
2. Se crean 4 entidades hijas: ContactAttempt, ConsentRecord v2, CoverageCheck, StatusChange.
3. Las entidades legacy (PotentialLead, ProspectCase, ConsentRecord v1, CustomerActivation) se **preservan** en base de datos — no se eliminan.
4. Los modulos legacy (PotentialsModule, ProspectsModule, ReviewsModule) se mantienen en backend como compatibilidad temporal, pero el portal ya no los consume.
5. El frontend portal se redirige al flujo de expediente unico; los componentes legacy del portal se retiran.

---

## Estrategia de migracion

### Aditiva — no destructiva

- Se crean tablas nuevas (`expediente_records`, `contact_attempts`, `consent_records`, `coverage_checks`, `status_changes`) via migracion de tenant.
- Las tablas legacy (`potential_leads`, `prospect_cases`) no se alteran ni eliminan.
- No se migran datos de tablas legacy a la nueva estructura: los expedientes nuevos se crean directamente en `expediente_records`.
- Los datos legacy permanecen accesibles via backend legacy hasta su retiro definitivo en Sprint 03+.

### Razonamiento

- La migracion aditiva minimiza el riesgo de perdida de datos.
- No requiere downtime ni script de transformacion de datos.
- Permite rollback inmediato: si el expediente unico falla, los datos legacy siguen intactos.
- El retiro de tablas legacy se difiere a un ADR futuro cuando se confirme que no hay datos activos pendientes.

---

## Cambios de boundary

| Componente | Antes (v1.1) | Despues (v2.0) |
| --- | --- | --- |
| Entidad principal | PotentialLead + ProspectCase | ExpedienteRecord |
| Pipeline | 8 estados en 2 entidades | 12 estados en 1 entidad |
| Consentimiento | ConsentRecord v1 (binario) | ConsentRecord v2 (triple, canal, IP, texto legal) |
| Completitud | No existia | 4 dimensiones: comercial, legal, tecnica, operativa |
| Cobertura | Campo en prospect | CoverageCheck entity con snapshot |
| Timeline | Cambios de estado basicos | StatusChange + ContactAttempt + metadata |

---

## Consecuencias

### Positivas
- Un solo registro maestro simplifica queries, reportes y UI.
- Captura progresiva: el asesor avanza con la informacion disponible sin bloqueos.
- Completitud multidimensional permite visibilidad granular del estado real del expediente.
- Consentimiento triple cumple Ley 1581 de forma auditable.
- Migracion aditiva = zero risk de perdida de datos.

### Negativas
- Tabla expediente_records tiene ~60 columnas (ancha); requiere disciplina en queries.
- Entidades legacy permanecen en schema → volumen de tablas temporalmente elevado.
- Enums CRM no tienen archivos fuente .ts en shared/src — solo compilados en dist.
- Endpoints legacy permanecen activos (superficie de ataque temporal).

### Riesgos residuales
1. Retiro de flujo legacy backend pendiente — documentar en Sprint 03.
2. Enums CRM sin fuente TS — deuda tecnica a corregir.
3. Tests E2E del flujo completo de expediente no cubren todos los escenarios de error.

---

## Alternativas consideradas

| Alternativa | Razon de descarte |
| --- | --- |
| Mantener modelo dual con sincronizacion | Complejidad creciente; datos fragmentados; no escalable |
| Migracion destructiva (DROP tablas legacy) | Riesgo de perdida de datos; requiere script de transformacion |
| Crear modulo CRM nuevo desde cero | Desperdicio del trabajo de Sprint 01; innecesario |

---

*ADR reconstruido por AI-EM-ARCH a partir del INFORME-MOD05-DEFINICION-v1.0.md §10 y el codigo fuente implementado.*
