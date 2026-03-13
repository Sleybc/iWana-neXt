-- =============================================================================
-- tenant_template.sql — DDL real para el schema aislado por tenant.
--
-- SEGURIDAD: el caller (TenantProvisioningService) DEBE validar que
-- __SCHEMA_NAME__ coincida con /^tenant_[a-z][a-z0-9_]{0,54}$/
-- antes de interpolar. NUNCA interpolar user input sin validar.
--
-- TRANSACCIONALIDAD (Riesgo R1): el script entero se ejecuta dentro
-- de una transaccion explicita BEGIN/COMMIT. Si cualquier sentencia
-- falla, el ROLLBACK previene schemas corruptos a medio crear.
--
-- PGBOUNCER (Riesgo R2): SET LOCAL search_path revierte al fin de la
-- transaccion. Compatible con transaction pooling mode.
--
-- Uso en TenantProvisioningService:
--   const sql = template.replaceAll('__SCHEMA_NAME__', validatedSchemaName);
--   await pool.query(sql); // o via QueryRunner de TypeORM
--
-- Referencias:
--   HLD-MOD01-ARQUITECTURA-v1.0 Seccion 3 (Modelo de Datos — Schema por tenant)
--   ADR-017: Multi-tenant schema-per-tenant isolation
--   CHECKLIST-RIESGOS-SPRINT-01-v1.0.md R1, R2
-- =============================================================================

BEGIN;

-- Crear el schema del tenant si no existe
CREATE SCHEMA IF NOT EXISTS "__SCHEMA_NAME__";

-- Fijar search_path para el resto del script (LOCAL = revierte al COMMIT/ROLLBACK)
SET LOCAL search_path TO "__SCHEMA_NAME__";

-- ===========================================================================
-- Tabla: users
-- Empleados, tecnicos, vendedores y suscriptores del ISP.
-- email y mfa_secret cifrados AES-256-GCM; email_hash SHA-256 para busquedas.
-- ===========================================================================
CREATE TABLE users (
  id                       UUID         NOT NULL DEFAULT gen_random_uuid(),
  email                    VARCHAR(512) NOT NULL,          -- AES-256-GCM cifrado
  email_hash               VARCHAR(64)  NOT NULL,          -- SHA-256, para busquedas
  password_hash            VARCHAR(60)  NOT NULL,          -- bcrypt 12 rounds
  role                     VARCHAR(20)  NOT NULL,
  status                   VARCHAR(30)  NOT NULL DEFAULT 'PENDING_VERIFICATION',
  tenant_id                UUID         NOT NULL,          -- FK logica a public.tenants
  mfa_enabled              BOOLEAN      NOT NULL DEFAULT FALSE,
  mfa_secret               VARCHAR(512),                   -- AES-256-GCM cifrado, nullable
  password_reset_required  BOOLEAN      NOT NULL DEFAULT FALSE,
  password_reset_token     VARCHAR(512),                   -- cifrado, nullable
  password_reset_expires_at TIMESTAMPTZ,
  failed_login_attempts    INTEGER      NOT NULL DEFAULT 0,
  locked_until             TIMESTAMPTZ,
  last_login_at            TIMESTAMPTZ,
  email_verified           BOOLEAN      NOT NULL DEFAULT FALSE,
  email_verification_token VARCHAR(512),                   -- cifrado, nullable
  created_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at               TIMESTAMPTZ,
  CONSTRAINT pk_users              PRIMARY KEY (id),
  CONSTRAINT uq_users_email_hash   UNIQUE (email_hash),
  CONSTRAINT chk_users_role        CHECK (role IN (
    'ADMIN','NOC','SUPPORT','SALES','TECHNICIAN','ACCOUNTANT',
    'HR','SUBSCRIBER','CONTRACTOR','PARTNER','AUDITOR',
    'INVESTOR','SYSTEM_ADMIN','IWANA_SUPPORT'
  )),
  CONSTRAINT chk_users_status      CHECK (status IN (
    'PENDING_VERIFICATION','ACTIVE','SUSPENDED','INACTIVE'
  ))
);

CREATE INDEX idx_users_email_hash    ON users(email_hash);
CREATE INDEX idx_users_tenant_role   ON users(tenant_id, role);
CREATE INDEX idx_users_tenant_status ON users(tenant_id, status);
-- Indice parcial para soft-delete: solo registros eliminados
CREATE INDEX idx_users_deleted_at    ON users(deleted_at) WHERE deleted_at IS NOT NULL;

-- ===========================================================================
-- Tabla: refresh_tokens
-- Tokens de sesion persistente con rotation y deteccion de reuse attack.
-- tokenHash = SHA-256 del token real (el token crudo nunca se persiste).
-- familyId agrupa todos los tokens rotados de una misma sesion.
-- ===========================================================================
CREATE TABLE refresh_tokens (
  id            UUID        NOT NULL DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL,
  token_hash    VARCHAR(64) NOT NULL,    -- SHA-256 del token, longitud fija 64 hex
  family_id     UUID        NOT NULL,    -- agrupador de sesion para reuse attack
  expires_at    TIMESTAMPTZ NOT NULL,
  revoked_at    TIMESTAMPTZ,             -- NULL = vigente
  revoke_reason VARCHAR(50),            -- LOGOUT|ROTATION|REUSE_ATTACK|PASSWORD_CHANGE|ADMIN
  ip_address    VARCHAR(45),
  user_agent    VARCHAR(512),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_refresh_tokens           PRIMARY KEY (id),
  CONSTRAINT uq_refresh_tokens_hash      UNIQUE (token_hash),
  CONSTRAINT chk_rt_revoke_reason        CHECK (
    revoke_reason IS NULL OR revoke_reason IN (
      'LOGOUT', 'ROTATION', 'REUSE_ATTACK', 'PASSWORD_CHANGE', 'ADMIN'
    )
  )
  -- SIN updated_at — revokedAt captura cualquier cambio de estado
);

CREATE INDEX idx_rt_token_hash  ON refresh_tokens(token_hash);
CREATE INDEX idx_rt_family_id   ON refresh_tokens(family_id);
CREATE INDEX idx_rt_user_revoked ON refresh_tokens(user_id, revoked_at);

-- ===========================================================================
-- Tabla: audit_logs
-- Registro append-only de toda operacion CUD del tenant.
-- Retencion minima 7 anios (Ley 1581/2012 + CRC).
-- RLS previene DELETE y UPDATE directos (refuerzo a nivel de DB).
-- ===========================================================================
CREATE TABLE audit_logs (
  id           UUID        NOT NULL DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL,
  user_id      UUID,                    -- nullable: jobs del sistema
  action       VARCHAR(50) NOT NULL,
  entity_type  VARCHAR(100) NOT NULL,
  entity_id    VARCHAR(100) NOT NULL,
  old_value    JSONB,
  new_value    JSONB,
  ip_address   VARCHAR(45),
  user_agent   VARCHAR(512),
  request_id   VARCHAR(100),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pk_audit_logs PRIMARY KEY (id),
  CONSTRAINT chk_al_action CHECK (action IN (
    'CREATE','UPDATE','DELETE','LOGIN','LOGOUT','LOGIN_FAILED',
    'ACCOUNT_LOCKED','PASSWORD_CHANGED','PASSWORD_RESET_REQUESTED',
    'MFA_ENABLED','MFA_DISABLED','TENANT_PROVISIONED',
    'TENANT_SUSPENDED','TENANT_ACTIVATED'
  ))
  -- SIN updated_at — SIN deleted_at — APPEND-ONLY
);

CREATE INDEX idx_al_tenant_created ON audit_logs(tenant_id, created_at);
CREATE INDEX idx_al_entity         ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_al_user_created   ON audit_logs(user_id, created_at);
CREATE INDEX idx_al_action_tenant  ON audit_logs(action, tenant_id);

-- RLS: prevenir DELETE y UPDATE directos en audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Politica restrictiva: permite solo SELECT e INSERT, bloquea UPDATE/DELETE
CREATE POLICY audit_logs_no_mutate
  ON audit_logs
  AS RESTRICTIVE
  FOR ALL
  TO PUBLIC
  USING (TRUE);

-- Revocar privilegios destructivos a nivel de tabla
-- (complementa la politica RLS — defensa en profundidad)
REVOKE DELETE ON audit_logs FROM PUBLIC;
REVOKE UPDATE ON audit_logs FROM PUBLIC;

COMMIT;
