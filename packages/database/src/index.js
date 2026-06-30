'use strict';
/**
 * @iwana/db — Capa de acceso a datos con TypeORM.
 *
 * Sprint 1 — MOD01: entidades, DataSource, TenantContext y migracion publica.
 *
 * Referencias:
 * - HLD-MOD01-ARQUITECTURA-v1.0 Seccion 3 (Modelo de Datos)
 * - ADR-017 (Multi-tenant schema isolation)
 * - ADR-018 (TypeORM como ORM principal)
 */
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __exportStar =
  (this && this.__exportStar) ||
  function (m, exports) {
    for (var p in m)
      if (p !== 'default' && !Object.prototype.hasOwnProperty.call(exports, p))
        __createBinding(exports, m, p);
  };
Object.defineProperty(exports, '__esModule', { value: true });
exports.TenantContext =
  exports.runInTenantSchema =
  exports.isValidSchemaName =
  exports.dataSourceOptions =
  exports.AppDataSource =
    void 0;
// Entidades TypeORM
__exportStar(require('./entities'), exports);
// DataSource y utilidades de schema routing
var data_source_1 = require('./data-source');
Object.defineProperty(exports, 'AppDataSource', {
  enumerable: true,
  get: function () {
    return data_source_1.AppDataSource;
  },
});
Object.defineProperty(exports, 'dataSourceOptions', {
  enumerable: true,
  get: function () {
    return data_source_1.dataSourceOptions;
  },
});
Object.defineProperty(exports, 'isValidSchemaName', {
  enumerable: true,
  get: function () {
    return data_source_1.isValidSchemaName;
  },
});
Object.defineProperty(exports, 'runInTenantSchema', {
  enumerable: true,
  get: function () {
    return data_source_1.runInTenantSchema;
  },
});
// Contexto de tenant por request (AsyncLocalStorage)
var tenant_context_1 = require('./tenant-context');
Object.defineProperty(exports, 'TenantContext', {
  enumerable: true,
  get: function () {
    return tenant_context_1.TenantContext;
  },
});
//# sourceMappingURL=index.js.map
