import 'reflect-metadata';

import { AUDIT_OMIT_RESPONSE_FIELDS_KEY } from '../audit/decorators/audit-omit-response-fields.decorator';
import { NetworkCatalogController } from './network-catalog.controller';
import { NetworkProvisioningController } from './network-provisioning.controller';

const ipamWrites = [
  'createRouter',
  'updateRouter',
  'setRouterActive',
  'setRouterInactive',
  'createRouterInterface',
  'updateRouterInterface',
  'activateRouterInterface',
  'deactivateRouterInterface',
  'createInterfaceIpv4Address',
  'updateInterfaceIpv4Address',
  'correctInterfaceIpv4Address',
  'createIpv4Network',
  'createAssistedIpv4Network',
  'updateIpv4Network',
  'setIpv4NetworkActive',
  'setIpv4NetworkInactive',
] as const;

const omittedSensitiveFields = [
  'address',
  'addresswithprefix',
  'assignablefrom',
  'assignableto',
  'cidr',
  'excludedips',
  'gateway',
  'host',
  'hostaddress',
  'interfaceaddress',
  'interfacename',
  'ip',
  'ipaddress',
  'ipv4',
  'ipv4address',
  'laninterface',
  'managementhost',
  'name',
  'notes',
  'releasedhost',
  'routername',
];

const provisioningWrites = ['reserve', 'regularize', 'certify', 'release'] as const;
const omittedProvisioningFields = [
  'cidr',
  'displaylabel',
  'ip',
  'name',
  'regularizationreason',
  'releasereason',
  'routerinstruction',
  'subscriberid',
];

describe('NetworkCatalogController — privacidad de auditoría IPAM', () => {
  it.each(ipamWrites)(
    'omitir campos sensibles de la respuesta CUD de %s sin suprimir el evento de auditoría',
    (methodName) => {
      const handler = NetworkCatalogController.prototype[methodName];

      expect(Reflect.getMetadata(AUDIT_OMIT_RESPONSE_FIELDS_KEY, handler)).toEqual(
        omittedSensitiveFields,
      );
    },
  );

  it.each(['listRouterInterfaces', 'listInterfaceIpv4Addresses'] as const)(
    'mantener el GET %s sin metadata de omisión CUD',
    (methodName) => {
      const handler = NetworkCatalogController.prototype[methodName];

      expect(Reflect.getMetadata(AUDIT_OMIT_RESPONSE_FIELDS_KEY, handler)).toBeUndefined();
    },
  );

  it.each(provisioningWrites)(
    'omitir IP y datos de suscriptor de la respuesta CUD de aprovisionamiento %s',
    (methodName) => {
      const handler = NetworkProvisioningController.prototype[methodName];

      expect(Reflect.getMetadata(AUDIT_OMIT_RESPONSE_FIELDS_KEY, handler)).toEqual(
        omittedProvisioningFields,
      );
    },
  );
});
