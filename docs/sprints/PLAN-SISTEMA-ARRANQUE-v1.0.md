# PLAN DE ARRANQUE — iWana neXt Platform

## Engineering Manager (AI-EM) → CTO

## Fecha: 2026-03-07 | Versión: 1.2

---

## RESUMEN EJECUTIVO

El proyecto iWana neXt tiene documentación base suficiente para arrancar: PRD maestro v2.2,
stack tecnológico vigente, prompts arquitectónicos iniciales y manual de identidad.
No existe código fuente materializado en el repositorio. Este documento define el plan
de arranque ejecutable desde el estado real actual: qué se hace primero, quién lo hace y en qué orden.

**Principio rector:** El orden del roadmap se respeta por defecto: fundación técnica + Auth → Tenant → CRM → Billing → NMS → Provisioning...
Solo puede alterarse por prioridad de negocio o bloqueo técnico justificado, con decisión documentada y aprobación explícita del CTO.

---

## ESTADO ACTUAL DEL REPOSITORIO

| Componente                       | Estado                                                                     |
| -------------------------------- | -------------------------------------------------------------------------- |
| Documentación PRD v2.2           | ✅ Completa — Base definitiva aprobada                                     |
| Manual de Identidad iWana        | ✅ Completo — Design tokens listos                                         |
| Stack Tecnológico                | ✅ Definido                                                                |
| ADRs (001-016)                   | ✅ Referenciados en PRD v2.2; no materializados como archivos individuales |
| docs/adrs/                       | 🟡 Existe, pero solo contiene ADR-021 (superado); faltan ADRs operativos del arranque |
| Framework de Gobernanza Multi-IA | ✅ Definido                                                                |
| Código fuente                    | ❌ Cero líneas de aplicación materializadas                                |
| Monorepo Turborepo               | ❌ No materializado                                                        |
| Docker Compose                   | ❌ No materializado                                                        |
| CI/CD GitHub Actions             | ❌ No materializado                                                        |
| HLDs de módulos                  | ❌ No materializados en docs/hlds/                                         |
| Prompts arquitectónicos          | ✅ Existen MOD01 y MOD02                                                   |
| Prompts de ejecución             | ❌ No materializados                                                       |
| Design System (@iwana/ui)        | ❌ No existe; solo existe la guía documental                               |

---

## SECUENCIA DE ARRANQUE

### SEMANA 0 — Scaffold Maestro (Pre-Sprint)

**Quién:** Sr. Dev Fullstack (con supervisión EM)
**Duración:** 2-3 días
**Output:** Monorepo funcional, sin lógica de negocio

```
Tareas en orden:
1. Inicializar Turborepo + configurar packages/config (ESLint strict, Prettier, TS strict)
2. Crear estructura apps/ (api, web, portal, worker) — vacíos pero compilando
3. Crear packages/shared (DTOs base, enums UserRole, interfaces core)
4. Crear packages/database (TypeORM config + schema multi-tenant base)
5. Crear packages/ui (design tokens iWana + wrappers y convenciones sobre shadcn/ui; Tailwind CSS v4 con enfoque CSS-first)
6. Docker Compose completo: postgres, redis, minio, nginx, pgbouncer
7. GitHub Actions CI básico: lint + type-check + build
8. .env.example con todas las variables requeridas documentadas
9. README.md de instalación local (paso a paso para on-premise)
```

**Criterio de Done:** `turbo dev` levanta todos los servicios, `turbo lint` pasa, `turbo build` pasa.

---

### SPRINT 1 — Módulo 1: Auth + Tenant + Audit

**Duración:** 2 semanas
**Objetivo:** Dejar materializada la fundación técnica del monorepo y una primera fase ejecutable del Módulo 1 con Auth, multi-tenant real y audit log append-only. Este sprint no equivale al cierre total del módulo; el cierre ocurre solo cuando el módulo esté validado en producción.

#### Fase 1 — Definición (ANTES de codificar)

```
1. [EM → Architect Software] Usar docs/prompts/PROMPT-MOD01-ARQUITECTURA-v1.0.md como insumo base
2. [Architect Software] Generar o revalidar PRD-MOD01 + HLD-MOD01 + contratos API + esquema DB + criterios de aceptación
3. [CTO + EM] Revisar y aprobar PRD/HLD materializados
4. [EM] Alinear PLAN-MOD01-SPRINT-01-v1.0.md y prompts de ejecución con el PRD/HLD aprobados
5. [EM → Devs] Materializar prompts de ejecución para Semana 0 y Sprint 1
```

#### Fase 2 — Ejecución

```
Sr. Dev Fullstack:
  - Scaffold maestro: monorepo Turborepo, apps/, packages/, config compartida, CI base
  - @iwana/auth: NestJS module, JWT RS256, MFA TOTP, Guards (RBAC + ABAC)
  - @iwana/tenant: Schema routing middleware, tenant CRUD (SYSTEM_ADMIN)
  - @iwana/audit: Interceptor global append-only, audit_log entity
  - Frontend: Login page (web + portal) con design system iWana
  - DB: Migraciones TypeORM (schema público: tenants + platform_users; schema tenant: tablas locales)
  - Documentación por fase: informe técnico, decisiones tomadas, evidencia funcional y pendientes

Sr. Dev Data Engineer:
  - Seed script por tenant (ADMIN inicial con password temporal seguro)
  - Script de creación de schema en PostgreSQL al crear tenant
  - pgbouncer config para multi-schema connection pooling

Sr. Dev QA:
  - Tests unitarios: AuthService, TenantService, AuditInterceptor (≥ 80% coverage)
  - Tests de integración: flujo login completo, refresh token, MFA setup/verify
  - Tests de seguridad: reuse attack detection, rate limiting, ABAC isolation
  - E2E (Playwright): login con MFA en web y portal
```

#### Fase 3 — Auditoría y Cierre

```
1. [EM] Verificar criterios de aceptación CA-M01-001 a CA-M01-XXX
2. [EM] Generar INFORME-FASE-MOD01-S01.md e INFORME-SPRINT-01.md con métricas DORA
3. [Architect Software] Code review de boundaries, seguridad y completitud documental
4. [Architect Software] Emitir ADRs operativos requeridos por el módulo si aplican
5. [EM + Architect Software] Emitir checklist de salida o decisión de bloqueo técnico si el módulo no puede seguir
6. [CTO] Aprobar deploy a producción cuando el módulo complete sus gates reales
7. [EM] Iniciar siguiente fase del módulo o planificación del siguiente módulo según cierre o repriorización aprobada
```

---

### SPRINTS 2-12 — Módulos Restantes del MVP

| Sprint | Módulo                                                        | Dependencias               | Semana |
| ------ | ------------------------------------------------------------- | -------------------------- | ------ |
| S2     | Tenant management + schema routing + materialización ADR base | Auth + monorepo            | 3-4    |
| S3     | CRM core: Subscribers CRUD (Natural/Jurídico + estrato + IVA) | Auth + Tenant              | 5-6    |
| S4     | CRM: Leads + Contracts + Habeas Data                          | CRM core                   | 7-8    |
| S5     | Billing: Plans + Billing cycles + invoice generation          | CRM + Auth                 | 9-10   |
| S6     | Billing: Siigo/Alegra adapter + Wompi                         | Billing core               | 11-12  |
| S7     | NMS: MikroTik + SNMP poller + IOltAdapter (interfaz)          | Auth + Tenant              | 13-14  |
| S8     | Provisioning: Order-to-Activate + RADIUS + métodos de acceso  | CRM + NMS + Billing        | 15-16  |
| S9     | Inventory: IPAM + VLAN pools + recurso físico                 | Provisioning + CRM         | 17-18  |
| S10    | Service Assurance + WFM básico + Portal Contratista           | Assurance + Inventory      | 19-20  |
| S11    | Portal Cliente + Notificaciones Email + ETL base              | Billing + Assurance + Auth | 21-22  |
| S12    | Testing E2E + Hardening + Runbooks + UAT                      | Todos los módulos MVP      | 23-24  |

---

## REGLAS DE AVANCE, BLOQUEO Y REPRIORIZACIÓN

1. Cada módulo debe contar con PRD estructurado por Architect Software antes de ejecutar código.
2. Cada fase debe tener prompt detallado para Sr. Dev Fullstack y evidencia documental archivada en `docs/`.
3. El cierre de sprint no equivale al cierre del módulo.
4. El cierre real del módulo ocurre únicamente cuando Backend + Frontend + Base de Datos + Tests + documentación operativa están validados en producción.
5. Si un módulo queda técnicamente bloqueado, el equipo se detiene y emite decisión formal con causa, impacto, alternativas y recomendación.
6. Si negocio exige mover prioridad, el CTO puede repriorizar un módulo siempre que la dependencia técnica mínima esté resuelta y quede trazabilidad documental.

---

## ESTRUCTURA DE GOBERNANZA — DOCUMENTOS POR MÓDULO

Para cada módulo, el Architect Software emite la definición técnica y el Engineering Manager coordina, mantiene y audita la trazabilidad:

```
docs/
├── adrs/                                                 ← Decisiones de arquitectura, bloqueo y repriorización
│   ├── ADR-021-Perfil-Unificado-EM-Architect.md (superado)  ✅
│   ├── ADR-022-Politica-Ejecucion-Modular-Por-Fases.md  ✅
│   └── (pendientes ADRs operativos del arranque)
├── archive/                                              ← Vacío actualmente
├── database/                                             ← Reservado para análisis y decisiones de datos
├── hlds/                                                 ← Vacío actualmente; debe materializarse HLD-MOD01 primero
├── identity/                                             ← Manual de identidad corporativa
├── informes/                                             ← Informes de fase y cierre de módulo
├── prds/
│   ├── PRD_Sistema_ISP_Colombia_v2_2.md                 ✅ Base definitiva vigente
│   ├── PRD-MOD01-DEFINICION-v1.1.md                    ✅
│   └── Stack_Tecnologico.md                             ✅
├── prompts/
│   ├── PROMPT-MOD01-ARQUITECTURA-v1.0.md              ✅
│   ├── PROMPT-ARCHITECT-MOD02-CRM-Subscribers-Contracts.md ✅
│   └── (pendientes prompts de ejecución por fase)
├── quality/                                              ← Evidencia de calidad, checklists y decisiones stop/go
├── roles/                                                ← Perfiles IA
├── security/                                             ← Documentación de seguridad
└── sprints/
  ├── PLAN-SISTEMA-ARRANQUE-v1.0.md                    ✅ Este documento
  └── PLAN-MOD01-SPRINT-01-v1.0.md                     ✅ Existe; debe alinearse al estado real antes de ejecución
```

---

## SKILLS DE LOS IDEs — CONTEXTO PARA CADA ROL

### Sr. Dev Fullstack (Windsurf + GPT 5.3 Codex)

El Fullstack SIEMPRE arranca cada módulo leyendo:

1. El PROMPT de ejecución que genera el EM
2. El HLD materializado del módulo, si ya existe
3. Los ADRs relevantes al módulo
4. El PRD v2.2 secciones correspondientes

**Lo que debe saber usar en Windsurf:**

- Cascade para generar scaffolds de módulos NestJS completos
- Context Files: siempre incluir el HLD del módulo si existe, ADRs aplicables e interfaces de @iwana/shared
- Rules: TypeScript strict mode, ESLint iWana, naming conventions del PRD

**Anti-patterns a evitar:**

- Nunca `any` en TypeScript
- Nunca acceso directo a tablas de otro módulo
- Nunca credenciales en código
- Nunca saltar la capa de validación (class-validator + Zod)

---

### Sr. Dev Data Engineer (VsCode + DeepSeek-V3.2)

El Data Engineer SIEMPRE arranca cada módulo leyendo:

1. El esquema de DB del HLD, cuando ya esté materializado
2. Los ADRs de datos (ADR-002, ADR-007)
3. Los requisitos de retención (Ley 1581/2012)

**Lo que debe producir en cada módulo:**

- Archivo de migración TypeORM versionado (nombre: `YYYYMMDDHHMMSS-NombreDescriptivo.ts`)
- Script de seed por tenant
- Índices definidos (PRIMARY, UNIQUE, composite para queries frecuentes)
- Documentación de las queries más costosas y cómo se optimizan

**Anti-patterns a evitar:**

- Nunca migraciones sin rollback
- Nunca campos PII sin cifrado AES-256
- Nunca FK sin índice en la columna referenciada
- Nunca modificar tablas de otro módulo directamente

---

### Sr. Dev QA/Testing (Kiro + Claude Haiku 4.5)

El QA SIEMPRE arranca cada módulo leyendo:

1. Los Criterios de Aceptación (CA-MXX-YYY) del HLD, cuando exista
2. La Definition of Done del módulo
3. Los flujos de negocio del PRD para ese módulo

**Lo que debe producir en cada módulo:**

- Suite de tests unitarios: ≥ 80% cobertura en servicios y guards
- Suite de tests de integración: todos los endpoints con casos happy + edge + error
- Suite E2E (Playwright): flujos críticos del módulo
- Reporte de cobertura en el INFORME-SPRINT

**Anti-patterns a evitar:**

- Nunca tests sin assertions (tests vacíos que pasan)
- Nunca datos de producción en tests
- Nunca omitir tests de seguridad (autenticación, autorización, rate limiting)
- Nunca marcar un módulo como listo si la cobertura < 80%

---

## VARIABLES DE ENTORNO — MÍNIMAS PARA SPRINT 1

```bash
# Archivo: .env.example (subir al repo — .env al .gitignore)

# App
NODE_ENV=development
PORT=3000

# PostgreSQL
DB_HOST=localhost
DB_PORT=5432
DB_NAME=iwana_next
DB_USER=iwana_user
DB_PASSWORD=CHANGE_ME_IN_PRODUCTION

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=CHANGE_ME_IN_PRODUCTION

# JWT (RS256 — generar par de claves con: openssl genrsa -out private.pem 4096)
JWT_PRIVATE_KEY_PATH=./keys/private.pem
JWT_PUBLIC_KEY_PATH=./keys/public.pem
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Cifrado AES-256 para PII
ENCRYPTION_KEY=CHANGE_ME_32_CHARS_EXACTLY_HERE

# MinIO (Object Storage on-premise)
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=CHANGE_ME
MINIO_SECRET_KEY=CHANGE_ME
MINIO_BUCKET_NAME=iwana-storage

# Configuración de aplicación
APP_URL=http://localhost:3000
CORS_ORIGINS=http://localhost:3001,http://localhost:3002
```

---

## MÉTRICAS DE ÉXITO DEL MVP (90 días)

| KPI Ingeniería               | Target     | Medición                   |
| ---------------------------- | ---------- | -------------------------- |
| Test Coverage (módulos core) | ≥ 80%      | Jest coverage report       |
| Deployment Frequency         | ≥ 2/semana | GitHub Actions             |
| Lead Time for Changes        | < 2 días   | Desde commit hasta staging |
| Change Failure Rate          | < 5%       | Rollbacks / total deploys  |
| MTTR plataforma              | < 1 hora   | Prometheus alertas         |
| Deuda técnica                | < 20%      | SonarQube                  |
| API Response p99             | < 500ms    | Prometheus                 |
| Query p95                    | < 250ms    | PostgreSQL slow log        |

---

## PRÓXIMOS PASOS INMEDIATOS (HOY)

```
1. ✅ [EM] Validar PRD maestro y roadmap vigente como fuente primaria → DONE
2. ✅ [EM] Alinear este plan de arranque con el estado real del repositorio → DONE
3. 🟡 [Architect Software] Materializar HLD-MOD01-ARQUITECTURA-v1.0.md → PENDIENTE
4. 🟡 [EM] Materializar prompts de ejecución de Semana 0 y Sprint 1 → PENDIENTE
5. 🟡 [EM] Crear inventario mínimo de ADRs operativos realmente existentes → PENDIENTE
6. 🟡 [Sr. Dev Fullstack] Iniciar Scaffold Maestro (Semana 0) una vez queden materializados HLD y prompts de ejecución → PENDIENTE
```

---

_Documento generado por: Engineering Manager (AI-EM) — iWana neXt Platform_
_Fecha: 2026-03-07 | Framework de Gobernanza Multi-IA v2.0_
