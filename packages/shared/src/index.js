'use strict';
/**
 * @iwana/shared — Enums, interfaces y DTOs compartidos entre apps y packages.
 * Sprint 0 — Scaffold. Tipos de negocio se agregan en Sprint 1.
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
// Enums
__exportStar(require('./enums/user-role.enum'), exports);
__exportStar(require('./enums/user-status.enum'), exports);
__exportStar(require('./enums/tenant-status.enum'), exports);
__exportStar(require('./enums/audit-action.enum'), exports);
__exportStar(require('./enums/platform-role.enum'), exports);
__exportStar(require('./enums/company-type.enum'), exports);
__exportStar(require('./enums/document-type.enum'), exports);
__exportStar(require('./enums/person-type.enum'), exports);
__exportStar(require('./enums/customer-segment.enum'), exports);
__exportStar(require('./enums/vat-treatment.enum'), exports);
__exportStar(require('./enums/tax-regime.enum'), exports);
__exportStar(require('./enums/subscriber-status.enum'), exports);
__exportStar(require('./enums/crm'), exports);
__exportStar(require('./enums/commercial'), exports);
__exportStar(require('./enums/assurance'), exports);
__exportStar(require('./commercial'), exports);
__exportStar(require('./enums/taxation'), exports);
__exportStar(require('./enums/parties'), exports);
__exportStar(require('./enums/wfm'), exports);
__exportStar(require('./enums/organization'), exports);
__exportStar(require('./enums/access-control'), exports);
__exportStar(require('./enums/configuration'), exports);
__exportStar(require('./enums/tasks'), exports);
__exportStar(require('./enums/operations'), exports);
__exportStar(require('./enums/inventory'), exports);
__exportStar(require('./taxation'), exports);
// Interfaces
__exportStar(require('./interfaces/api-response.interface'), exports);
__exportStar(require('./interfaces/assurance-field-service-request.interface'), exports);
// DTOs
__exportStar(require('./dto/pagination.dto'), exports);
// Constants
__exportStar(require('./constants/queue-names'), exports);
__exportStar(require('./constants/search-job-names'), exports);
// Schemas Zod (frontend)
__exportStar(require('./schemas/auth.schema'), exports);
__exportStar(require('./schemas/subscriber.schema'), exports);
//# sourceMappingURL=index.js.map
