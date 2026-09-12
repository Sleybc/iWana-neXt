# ADR-071: Convergencia de los runtimes Node a 24 LTS con fuente única de versión

**Versión:** 1.1
**Estado:** **Aprobado**
**Fecha:** 2026-08-03 · **v1.1 el mismo día** (ratifica la precisión del criterio de verificación 1, introducida durante la ejecución; sin cambios en la decisión, las alternativas ni el impacto)
**Modo activo:** Architect
**Autor:** AI-EM-ARCH
**Aprobación:** CTO Humano — 2026-08-03 (v1.0) · **ratificación del criterio 1 el 2026-08-03 (v1.1)**
**Módulos:** Plataforma transversal — imágenes de API, worker, web, portal y migrator
**Relacionado:** [ADR-070](ADR-070-Diferimiento-Dominio-Productivo.md) (superado) (primer ADR de infraestructura) · [INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md](../informes/INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md) §2.2 A7 · [INFORME-PLATAFORMA-DOCKER-LIMPIEZA-v1.0.md](../informes/INFORME-PLATAFORMA-DOCKER-LIMPIEZA-v1.0.md) §5.1

---

## Contexto

El repositorio declara **cuatro versiones de Node distintas**, y ninguna instancia las reconcilia:

| Dónde | Valor | Naturaleza |
| --- | --- | --- |
| `apps/api/Dockerfile:4`, `apps/web/Dockerfile:4,51`, `apps/portal/Dockerfile:4,43`, `apps/worker/Dockerfile:1` | `node:25.8.2` | **Runtime que se despliega** |
| `packages/database/Dockerfile.migrator:6` | `node:24.13.1-bookworm-slim` | Runtime del migrator |
| `package.json:9` | `"node": ">=24.0.0"` | Contrato declarado |
| `pnpm-workspace.yaml` | `useNodeVersion: 24.13.1` | Toolchain local |
| `.github/workflows/ci.yml:36,162,380`, `e2e-web-admin-smoke.yml:27` | `node-version: '24.x'` | **Runtime que se valida** |

### El problema real que este ADR resuelve

No es principalmente que Node 25 esté fuera de soporte. Es que **el runtime que CI valida no es el runtime que se despliega**.

Toda la suite —unitarias, integración, E2E, typecheck, lint— corre sobre Node 24.x en GitHub Actions. Las imágenes de API, worker, web y portal se construyen y ejecutan sobre Node 25.8.2. Cada gate verde de G6 y G6.5 certifica un binario que **nunca se ejecuta en un contenedor**. Una regresión propia del major 25 —un cambio en el runtime, en el resolver de módulos o en el motor— es invisible para el pipeline por construcción, no por descuido.

`.github/workflows/ci.yml:71` construye la imagen del worker en CI, así que la divergencia no es teórica: el mismo job que valida en Node 24 produce un artefacto en Node 25.

A eso se suma el soporte. Según el calendario oficial del proyecto Node.js (`nodejs/Release`, `schedule.json`, consultado el 2026-08-03):

| Versión | Inicio | LTS | Mantenimiento | Fin de vida |
| --- | --- | --- | --- | --- |
| **v24 "Krypton"** | 2025-05-06 | 2025-10-28 | 2026-10-20 | **2028-04-30** |
| **v25** | 2025-10-15 | *(nunca — impar)* | 2026-04-01 | **2026-06-01** |
| **v26** | 2026-05-05 | **2026-10-28** | 2027-10-20 | 2029-04-30 |

Node 25 alcanzó su fin de vida el **2026-06-01**: lleva **63 días sin recibir parches de seguridad**, y no volverá a recibirlos. Cuatro de las cinco imágenes del repositorio se construyen sobre esa base.

El informe de limpieza del 2026-08-02 ya registró esto como riesgo residual §5.1 y lo dejó "para una fase específica" sin nombrarla. La auditoría Docker del 2026-08-03 lo elevó a hallazgo A7 y alineó el migrator a 24.13.1, pero **las cuatro imágenes de aplicación requieren una decisión de stack que el perfil AI-EM-ARCH no puede tomar solo** (§5 de su matriz de decisiones: cambio de versión con potencial breaking change escala al CTO vía ADR).

### Por qué bloquea otro trabajo

Cuatro propuestas de la auditoría dependen de esta decisión y **no deben ejecutarse antes**:

| Propuesta | Dependencia |
| --- | --- |
| 9 — runner sobre `-slim`/`-alpine` sin pnpm global | Reescribe el stage final, que parte de la imagen base |
| 10 — cache mounts sobre el store de pnpm | Cambiar la base **invalida todas las capas de caché**; hacerlo antes obliga a rehacerlo |
| C1 — eliminar el doble `pnpm install` del stage builder | Misma reescritura de Dockerfile |
| 8 — construir api, web y portal en CI | No tiene sentido cablear en CI un build cuya base va a cambiar |

Optimizar los Dockerfiles antes de fijar la base es trabajo que se tira. Esta es la decisión que desbloquea la fase, y por eso llega primero.

## Decisión

**Se converge todo runtime Node del repositorio a la línea 24 LTS, con una única versión de patch declarada en un único lugar.**

1. **Las cuatro imágenes de aplicación pasan de `node:25.8.2` a la versión 24 LTS vigente**, en sus dos variantes actuales (`-bookworm` para los stages de build, `-alpine` para los runners de web y portal). El migrator ya está en `24.13.1` desde la auditoría del 2026-08-03.

2. **La versión de patch es una sola para todo el repositorio.** Hoy la misma decisión vive replicada en cinco Dockerfiles, `package.json`, `pnpm-workspace.yaml` y cuatro entradas de workflow. Se declara **`pnpm-workspace.yaml` → `useNodeVersion` como fuente de verdad** —ya lo es para el toolchain local— y el resto la referencia:
   - Los Dockerfiles reciben la versión por `ARG NODE_VERSION`, con default igual a esa fuente.
   - CI deja de usar `node-version: '24.x'` flotante y lee la versión exacta del workspace.
   - `package.json` → `engines.node` conserva el rango `>=24.0.0` como contrato mínimo de compatibilidad, que es su función, y **no** se convierte en un pin.

3. **CI valida y construye sobre la misma versión.** Es el punto que cierra el defecto de raíz: mientras el pin de CI y el de las imágenes puedan divergir, la divergencia volverá.

4. **No se adopta Node 26 en esta decisión.** Ver alternativas.

5. **Se registra un punto de reevaluación el 2026-10-28**, fecha en que Node 26 entra en LTS y Node 24 ya habrá pasado a mantenimiento (2026-10-20). No es un compromiso de migrar: es la fecha en la que la decisión se vuelve a mirar con datos, en lugar de por inercia.

## Alternativas descartadas

| Alternativa | Motivo del descarte |
| --- | --- |
| **A — Adoptar Node 26 ahora** | Node 26 es **Current, no LTS**: será LTS el 2026-10-28. Adoptarlo hoy repite exactamente el error que originó este ADR —desplegar un runtime sin soporte de largo plazo— a cambio de un horizonte mayor (2029-04-30 frente a 2028-04-30) que no se necesita. Además obligaría a cambiar también CI, `engines` y el toolchain local, que hoy ya están en 24: sería una migración mayor en lugar de una convergencia. Queda como la opción natural del punto de reevaluación de octubre |
| **B — Mantener Node 25 y alinear CI hacia arriba** | Cierra la divergencia CI↔runtime, pero consolidando el repositorio sobre una versión **que terminó su vida el 2026-06-01** y no recibirá más parches de seguridad. Convierte un defecto de proceso en una decisión deliberada de correr sin soporte |
| **C — No decidir y seguir con las cuatro versiones** | Es el estado actual. Cada gate verde seguiría certificando un runtime que no se despliega, y las cuatro propuestas de optimización de imágenes quedan bloqueadas indefinidamente. Ya lleva registrado dos informes sin fase asignada |

## Impacto declarado

| Dimensión | Impacto |
| --- | --- |
| **Multi-tenant** | **Sin impacto.** No toca el aislamiento por schema, la resolución de tenant ni `search_path` |
| **Seguridad** | **Positivo y directo.** Cuatro imágenes dejan de construirse sobre una base sin parches desde 2026-06-01. Es el motivo principal de urgencia |
| **Escala** | **Sin impacto** en el modelo de escala. Node 24 es la línea LTS con la que el proyecto ya valida |
| **Regulación** | **Sin impacto directo.** Ninguna obligación de CRC, DIAN, MinTIC ni Ley 1581 fija versión de runtime. Indirectamente, correr sobre software sin soporte de seguridad es difícil de sostener ante un tratamiento de datos personales bajo Ley 1581 — lo que conecta con el disparador 3 de [ADR-070](ADR-070-Diferimiento-Dominio-Productivo.md) (superado) |
| **Autoridad** | Cambio de versión de stack: **decisión del CTO**, conforme a §5 de la matriz del perfil AI-EM-ARCH |

## Riesgo y mitigación

El riesgo real es **bajar** un major, no subir: se pasa de 25 a 24.

| Riesgo | Evaluación | Mitigación |
| --- | --- | --- |
| Alguna dependencia exige Node ≥ 25 | **Bajo.** `package.json` declara `>=24.0.0` y la suite completa ya corre en Node 24.x en CI y en local (`useNodeVersion: 24.13.1`). No hay evidencia de uso de API exclusiva de 25 | Verificación explícita en el prompt de ejecución: `pnpm install --frozen-lockfile` y suite completa con `--force` |
| Diferencias de comportamiento entre `bookworm` y `alpine` (musl frente a glibc) | **Preexistente**, no introducido aquí: web y portal ya mezclan ambas | Sin cambio de variante en esta fase |
| Rebuild completo de todas las imágenes | **Cierto y asumido.** El caché quedará invalidado de todas formas | Es precisamente por esto que las propuestas 9, 10 y C1 se ejecutan **después**, en la misma fase |
| `sharp` y `msgpackr-extract` compilan binarios nativos (`onlyBuiltDependencies`) | **Medio** — son las dependencias sensibles al major de Node | Verificación de arranque real de API y worker en contenedor, no solo build correcto |

## Consecuencias

**Positivas**

- El artefacto que se despliega pasa a ser el que CI valida. Los gates G6 y G6.5 recuperan el significado que hoy no tienen para las imágenes.
- Se cierra el riesgo residual §5.1 del informe de limpieza, abierto desde el 2026-08-02.
- Se desbloquean las propuestas 8, 9, 10 y C1 de la auditoría, que son el trabajo con impacto real en tiempos de build.
- Una sola versión declarada en un solo sitio: la próxima actualización de Node es una línea, no ocho.

**Negativas / costo**

- Horizonte de soporte de 2028-04-30 en lugar de 2029-04-30, que es lo que daría Node 26. Se acepta a cambio de no volver a desplegar una versión Current.
- Node 24 entra en **mantenimiento el 2026-10-20** —dentro de unos dos meses y medio—, con cadencia de actualizaciones reducida a partir de esa fecha. De ahí el punto de reevaluación del 2026-10-28.
- Un rebuild completo de las cinco imágenes sin caché.

**Riesgos**

- **Que la fuente única no se respete** y alguien vuelva a fijar la versión en un Dockerfile. Mitigación: el prompt de ejecución exige un test que compare la versión de los Dockerfiles y de CI con `useNodeVersion`, siguiendo el patrón del test que la auditoría añadió para la lista de servicios de Compose.
- **Que el punto de reevaluación de octubre se olvide.** Mitigación: queda en este ADR con fecha, no en un informe.

## Criterio de verificación

Esta decisión se considera implementada cuando:

1. Ninguna referencia ejecutable `node:25` sobrevive en Dockerfiles, workflows,
   manifests o artefactos de build. Las menciones históricas en ADRs, prompts,
   planes e informes se conservan para trazabilidad y no son pins desplegables.
2. La versión de patch aparece declarada **una sola vez**; el resto la deriva.
3. CI construye y valida sobre esa misma versión.
4. Las cinco imágenes construyen, y **API y worker arrancan realmente en contenedor** — no basta con que el build termine.
5. `pnpm lint`, `pnpm typecheck` y la suite completa con `Cached: 0` pasan sobre la nueva versión.
6. Existe un test automatizado que falla si las declaraciones vuelven a divergir.

**Estado de implementación: IMPLEMENTADA** — verificado por auditoría
independiente de AI-EM-ARCH el 2026-08-03, por ejecución y no por reporte. Los
seis criterios se cumplen; G6.5 quedó GO con la corrida Linux de CI sobre el
merge-sha `1a95415a` del PR #2 (run `30835001419`) y CA-12 se cerró con el
`[DESEMPATE]` registrado en el informe de fase. Evidencia completa en
[INFORME-PLAT-OPS-CONVERGENCIA-NODE-v1.0.md](../informes/INFORME-PLAT-OPS-CONVERGENCIA-NODE-v1.0.md)
y §5.2 del
[informe de auditoría Docker](../informes/INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md).

**Trazabilidad del criterio 1 — RATIFICADO.** El borrador v1.0 decía "ninguna
referencia `node:25` sobrevive en el repositorio". La redacción vigente —acotada
a *referencias ejecutables* en Dockerfiles, workflows, manifests y artefactos de
build— es una precisión introducida durante la ejecución y razonada en el
`[DESEMPATE] Alcance de CA-01 y CA-02` del informe de fase. Es correcta en el
fondo: las únicas ocurrencias restantes son capturas de navegador archivadas en
`.playwright-mcp/`, que no son pines desplegables y que `.dockerignore` excluye
del contexto de build; eliminarlas falsearía la evidencia del diagnóstico sin
reducir ninguna divergencia de runtime.

El cambio entró en el mismo commit que la aprobación y que la implementación
(`b1e6a7de`), sin traza previa. La auditoría independiente de AI-EM-ARCH del
2026-08-03 lo señaló —el criterio que mide un trabajo no debe llegar junto al
trabajo que mide— y elevó la precisión al CTO. **El CTO la ratificó el
2026-08-03**, y esta v1.1 la incorpora al texto aprobado. La anomalía queda
registrada, no borrada: es el precedente de cómo se regulariza una edición
posterior a la aprobación.

## Referencias

- `nodejs/Release` → `schedule.json`, consultado el 2026-08-03 — calendario oficial de soporte
- [INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md](../informes/INFORME-PLATAFORMA-DOCKER-AUDITORIA-v1.0.md) §2.2 A7, §6 propuestas 6-10
- [INFORME-PLATAFORMA-DOCKER-LIMPIEZA-v1.0.md](../informes/INFORME-PLATAFORMA-DOCKER-LIMPIEZA-v1.0.md) §5.1
- [PROMPT-PLAT-OPS-CONVERGENCIA-NODE-v1.0.md](../prompts/PROMPT-PLAT-OPS-CONVERGENCIA-NODE-v1.0.md) — prompt de ejecución, condicionado a la aprobación de este ADR
- `docs/roles/Perfil_IA_Platform_Ops_Engineer_v1.md` §4 — matriz de decisiones de infraestructura
- `docs/prds/Stack_Tecnologico.md` — baseline de stack
