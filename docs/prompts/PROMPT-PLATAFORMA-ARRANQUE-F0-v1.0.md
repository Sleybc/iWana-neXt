# PROMPT — Plataforma · Experiencia de arranque · Fase F0: congelar contratos

**Versión:** 1.0
**Fecha:** 2026-08-09
**Generado por:** AI-EM-ARCH (Engineering Manager + Architect)
**Destinatarios:** AI-SR-FULL (C1) · AI-DS-OWNER (C3) · AI-PROD-UX (C4) · AI-SEC-ENG (revisión de C1)
**Etapa del workflow:** 2 y 3 (solución + factibilidad) — produce los contratos que desbloquean F1, F2 y F3 en paralelo
**Checklist vivo:** [CHECKLIST-PLATAFORMA-ARRANQUE-F0-v1.0.md](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-F0-v1.0.md)
**Informe de fase:** `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F0-v1.0.md`

---

## 1. Objetivo exacto de la fase

**Resultado esperado:** cuatro contratos congelados, cada uno con artefacto localizable en el repositorio, que permitan a F1, F2 y F3 ejecutarse **en paralelo sin coordinarse entre sí**.

**Lo que sí entra:**

- **C1** — contrato de API de estado de arranque: tipos y función de cálculo en `packages/shared/src/contracts/system/boot-status.contract.ts`, exportados desde `packages/shared/src/index.ts`, con su prueba de forma. *(AI-SR-FULL)*
- **C3** — contrato de design system para un medidor de progreso **sin React**: lista cerrada de variables CSS que la pantalla puede usar, geometría, estados y equivalencia declarada con `packages/ui/src/components/ProgressMeter.tsx`. Artefacto: `docs/specs/2026-08-09-arranque-sistema-ds-contrato.md`. *(AI-DS-OWNER)*
- **C4** — especificación UX del arranque: los identificadores de paso, su copy en español, los mensajes de estado por componente y el copy de cierre. Artefacto: `docs/specs/2026-08-09-arranque-sistema-ux-spec.md`. *(AI-PROD-UX)*
- Revisión de seguridad de C1 por AI-SEC-ENG **antes** de declararlo congelado.

**Lo que no entra:**

- Implementar el endpoint, el orquestador, la pantalla o el instalador. F0 **no toca** `apps/`, `scripts/`, `nginx/` ni `docker-compose*.yml`.
- El contrato C2 (shape del archivo de estado de desarrollo): lo declara AI-PLAT-OPS dentro de F1, derivado de C1.

---

## 2. Artefactos de entrada obligatorios

- **HLD:** [HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md](../hlds/HLD-PLATAFORMA-ARRANQUE-EXPERIENCIA-v1.0.md) — §5 fija la forma de C1, §4.5 sus restricciones de seguridad
- **ADR:** [ADR-079](../adrs/ADR-079-Superficie-Publica-Estado-Arranque.md) — Decisión 5 es normativa para C1
- **ADR relacionado:** [ADR-078](../adrs/ADR-078-Reapertura-Dominio-Productivo-Por-PII-Real.md) *(propuesto)* — fija por qué el defecto de proxy en desarrollo no se toca
- **Fuentes de diseño (para C3):** `packages/ui/src/styles/globals.css` (tokens reales — manda sobre *qué existe*) · `packages/ui/src/components/ProgressMeter.tsx` (referencia de lenguaje visual) · la spec Firma iWana y `docs/identity/`
- **Referencia externa:** repositorio `Ubiquiti-App/UCRM`, script de instalación. Referencia de **invariantes**, no de estilo tipográfico
- **Artefactos faltantes detectados:** el corpus no tiene PRD de instalación de producto. El HLD cubre la definición necesaria para este frente; no inventar PRD

---

## 3. Instrucciones

### 3.1 AI-SR-FULL — contrato C1

1. Crear `packages/shared/src/contracts/system/boot-status.contract.ts` con la forma que fija el HLD §5: la tupla de componentes, los tres tipos de unión, las dos interfaces y `calculateBootPercent`.
2. `calculateBootPercent` es **función pura**, sin dependencias, con su tabla de pesos exportada. Contribución por estado: listo 1 · iniciando 0,5 · degradado 0,5 · pendiente 0. Resultado entero 0–100.
3. Exportar desde `packages/shared/src/index.ts` siguiendo el patrón del bloque de contratos existente.
4. Escribir la **prueba de forma**: serializar una respuesta y asertar que el conjunto de claves es **exactamente** el del DTO. Esta prueba es el control que impide que alguien añada un campo de diagnóstico más adelante.
5. Escribir pruebas de `calculateBootPercent`: todos pendientes → 0; todos listos → 100; monotonía al avanzar un componente; suma de pesos = 100.
6. **No implementar el endpoint.** Eso es F2.

### 3.2 AI-DS-OWNER — contrato C3

1. Inventariar los tokens **realmente existentes** en `packages/ui/src/styles/globals.css` que la pantalla necesita: superficie, texto primario y secundario, primario de marca, secundario de marca, track del medidor, estado de error, radios y tipografía.
2. Publicar la **lista cerrada** de variables CSS autorizadas. La pantalla no puede usar ninguna fuera de esa lista, y ninguna puede ser un valor literal inventado.
3. Especificar la geometría del medidor por equivalencia con `ProgressMeter.tsx`: altura de la barra, radio, degradado de relleno, color del track, tamaño del porcentaje y el indicador por componente en sus dos estados.
4. Especificar el comportamiento en tema claro y oscuro.
5. Declarar explícitamente la **equivalencia visual** con `ProgressMeter.tsx` y firmarla: es la única garantía de que la duplicación deliberada que acepta ADR-079 no derive.
6. Definir el criterio de la **prueba anti-deriva** que F3 debe implementar: extraer cada `var(--x)` del CSS de la pantalla y asertar que está definida en `globals.css`.
7. **No escribir código.** El contrato es una especificación.

### 3.3 AI-PROD-UX — contrato C4

1. Fijar los **identificadores de paso** del arranque de desarrollo y su copy en español. Base propuesta, ajustable con justificación:

   | Id | Copy | Peso |
   |---|---|---|
   | `free-ports` | Liberando puertos de desarrollo | 1 |
   | `docker-pull` | Descargando imágenes | 25 |
   | `docker-up` | Levantando infraestructura | 12 |
   | `minio-init` | Inicializando almacenamiento de objetos | 2 |
   | `docker-ps` | Verificando infraestructura | 1 |
   | `build-shared` | Compilando contratos compartidos | 4 |
   | `build-storage` | Compilando capa de almacenamiento | 3 |
   | `migrate` | Aplicando migraciones | 10 |
   | `api-boot` | Compilando y arrancando la API | 30 |
   | `apps-ready` | Arrancando consola, portal y procesos en segundo plano | 12 |

   Los pesos **deben sumar 100**. Si se ajusta uno, se ajusta otro.

2. Fijar el copy de los **siete componentes** de la pantalla web. Vocabulario obligatorio: genérico, sin nombre de producto (`Base de datos`, no el motor; `Búsqueda`, no el buscador). Es requisito de seguridad de ADR-079 Decisión 5, no preferencia de estilo.
3. Fijar el copy de las tres pistas (`waiting`, `slow`, `needs_operator`) para cada estado no listo. Deben orientar sin diagnosticar.
4. Fijar el copy de cierre en terminal —qué se dice sobre las URLs y sobre dónde está la credencial de primer ingreso, **nunca su valor**— y el estado final de la pantalla antes de redirigir.
5. Aplicar la skill `system-vocabulary-review`: es texto visible nuevo.
6. Fijar el comportamiento accesible: nombre accesible del medidor, región activa para el cambio de paso y foco. La pantalla debe ser navegable y anunciable sin ratón.

### 3.4 AI-SEC-ENG — revisión de C1

Verificar contra ADR-079 Decisión 5, punto por punto:

1. Ningún componente nombra un producto o motor concreto.
2. No existe estado `failed` ni ningún campo de texto libre.
3. La respuesta con el sistema listo no reporta componentes.
4. El componente de identidad no revela si existe cuenta de administrador.
5. No hay versiones, hostnames, puertos, nombres de schema, conteos de migración ni de tenant, marcas de tiempo de arranque, uptime ni identificadores de build.
6. La forma admite caché y no obliga a exponer nada por unicidad de respuesta.

Emitir dictamen **viable / viable con ajustes / inviable**. Sin dictamen, C1 no se declara congelado.

---

## 4. Restricciones no negociables

1. **F0 no toca ejecución.** Ni `apps/`, ni `scripts/`, ni `nginx/`, ni `docker-compose*.yml`. Único cambio en código: el archivo de contrato de C1, su export y sus pruebas.
2. **Nunca PII ni credenciales** en ningún artefacto.
3. **Vocabulario genérico obligatorio** en C1 y C4: es control de seguridad.
4. **Toda cita de un ADR no aprobado lleva su marcador** `(propuesto)` / `(en revisión)` / `(superado)`. `pnpm audit:adr-citations` es **gate bloqueante del protocolo** y debe correrse a mano antes de cerrar la fase: hoy **no está cableado en `.github/workflows/`**, así que CI no lo atrapará por ti (ver observación OBS-01 del [tablero](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md)).
5. **Los tokens mandan sobre la spec.** Si C3 necesita un token que no existe en `globals.css`, no se inventa: se propone su alta como cambio de design system separado, o se resuelve con los existentes.
6. **Ningún contrato se declara congelado sin artefacto localizable** en el repositorio. Un acuerdo verbal no es un contrato.
7. **Marcar el checklist en el mismo commit que entrega cada ítem**, con evidencia citable. Un `[x]` sin evidencia es defecto bloqueante.

---

## 5. Entregables técnicos obligatorios

- `packages/shared/src/contracts/system/boot-status.contract.ts`
- Export en `packages/shared/src/index.ts`
- Pruebas del contrato: forma exacta de claves + comportamiento de `calculateBootPercent`
- `pnpm --filter @iwana/shared build` y `typecheck` en verde

## 6. Entregables documentales obligatorios

- `docs/specs/2026-08-09-arranque-sistema-ds-contrato.md` — estado **Congelado**, versión de contrato 1.0
- `docs/specs/2026-08-09-arranque-sistema-ux-spec.md` — estado **Congelado**, versión de contrato 1.0
- Dictamen de AI-SEC-ENG registrado en el informe de fase
- `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F0-v1.0.md` desde la [plantilla](../informes/PLANTILLA-INFORME-PLATAFORMA-ARRANQUE-FASE-v1.0.md)
- [CHECKLIST-PLATAFORMA-ARRANQUE-F0-v1.0.md](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-F0-v1.0.md) marcado en vivo
- Fila F0 del [tablero](../quality/CHECKLIST-PLATAFORMA-ARRANQUE-TABLERO-v1.0.md) actualizada al cierre

Ambas specs deben llevar la cabecera del repositorio: versión, estado, fecha, autor, etapa del workflow, alcance, entradas leídas **con su marcador de estado**, y el deslinde "qué es y qué no es este documento".

---

## 7. Criterios de aceptación

- **CA-F0-01** — `boot-status.contract.ts` existe, compila y se exporta desde el índice del paquete compartido.
- **CA-F0-02** — La prueba de forma falla si se añade una clave al DTO. Verificado con control negativo.
- **CA-F0-03** — Los pesos suman exactamente 100 y hay prueba que lo asserta.
- **CA-F0-04** — `calculateBootPercent` es monotónica: avanzar el estado de un componente nunca reduce el porcentaje.
- **CA-F0-05** — La respuesta con `phase === 'ready'` no reporta componentes, con prueba.
- **CA-F0-06** — Ningún identificador de componente nombra un producto o motor concreto.
- **CA-F0-07** — C3 lista solo variables CSS que existen en `globals.css`, verificado una a una.
- **CA-F0-08** — C3 declara y firma la equivalencia visual con `ProgressMeter.tsx`.
- **CA-F0-09** — C4 fija diez pasos con pesos que suman 100 y copy en español sin enums crudos.
- **CA-F0-10** — Dictamen de AI-SEC-ENG emitido y registrado antes de declarar C1 congelado.
- **CA-F0-11** — `pnpm audit:doc-locations` y `pnpm audit:adr-citations` en verde.

---

## 8. Criterio de stop/go

**Detenerse inmediatamente si:**

- C3 necesita un token de marca que no existe en `globals.css` → es cambio de lenguaje visual, **escala al CTO**, no se decide en la fase.
- AI-SEC-ENG dictamina **inviable** sobre C1.
- La forma que fija el HLD §5 resulta insuficiente para alguna sonda **sin** violar la Decisión 5 de ADR-079.

**Documentar causa en:** `docs/informes/INFORME-PLATAFORMA-ARRANQUE-F0-v1.0.md` y en la sección de pendientes del checklist.
**Escalar a:** AI-EM-ARCH con marcador `[BLOQUEO]`. Si toca tokens de marca, AI-EM-ARCH escala al CTO.
**Recomendación esperada:** una posición decidible, no un menú.

---

## 9. Criterio de salida de la fase

- [ ] C1 publicado, compilando, con pruebas en verde y dictamen de seguridad emitido
- [ ] C3 publicado en `docs/specs/` con estado **Congelado** y versión 1.0
- [ ] C4 publicado en `docs/specs/` con estado **Congelado** y versión 1.0
- [ ] Ningún artefacto de ejecución modificado (`git status` limpio en `apps/`, `scripts/`, `nginx/`, `docker-compose*.yml`)
- [ ] Informe de fase archivado con la línea de resumen de Turbo mostrando **`Cached: 0`**
- [ ] Checklist F0 completo y fila del tablero actualizada
- [ ] AI-EM-ARCH declara los contratos congelados citando **ruta y versión** en los prompts de F1, F2 y F3
