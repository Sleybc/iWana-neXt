import { CustomerSegment, PersonType } from '@iwana/shared';
import { TaxApplicationService } from './services/tax-application.service';
import { CommercialTaxAliasController } from './commercial-tax-alias.controller';

describe('CommercialTaxAliasController', () => {
  const taxApplicationService = {
    listRules: jest.fn(),
    createRule: jest.fn(),
    simulate: jest.fn(),
    listApplications: jest.fn(),
    createApplication: jest.fn(),
    updateApplication: jest.fn(),
    deleteApplication: jest.fn(),
  };
  let controller: CommercialTaxAliasController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new CommercialTaxAliasController(
      taxApplicationService as unknown as TaxApplicationService,
    );
  });

  it('forwards the deprecated rule and application routes to the taxation service', async () => {
    const query = { cursor: 'cursor', limit: 12 };
    const rule = { id: 'rule-1' };
    const application = { id: 'application-1' };
    taxApplicationService.listRules.mockReturnValue([rule]);
    taxApplicationService.createRule.mockResolvedValue(rule);
    taxApplicationService.listApplications.mockReturnValue([application]);
    taxApplicationService.createApplication.mockResolvedValue(application);
    taxApplicationService.updateApplication.mockResolvedValue(application);
    taxApplicationService.deleteApplication.mockResolvedValue(undefined);

    expect(controller.findAllRules(query)).toEqual([rule]);
    await expect(
      controller.createRule({} as never, { user: { sub: 'actor-1' } } as never),
    ).resolves.toEqual({ data: rule });
    expect(controller.listApplications(query)).toEqual([application]);
    await expect(controller.createApplication({} as never)).resolves.toEqual({ data: application });
    await expect(controller.updateApplication('application-1', {} as never)).resolves.toEqual({
      data: application,
    });
    await expect(controller.deleteApplication('application-1')).resolves.toBeUndefined();

    expect(taxApplicationService.listRules).toHaveBeenCalledWith(query);
    expect(taxApplicationService.createRule).toHaveBeenCalledWith(expect.anything(), 'actor-1');
    expect(taxApplicationService.listApplications).toHaveBeenCalledWith(query);
    expect(taxApplicationService.deleteApplication).toHaveBeenCalledWith('application-1');
  });

  it('omits optional simulation fields when absent and includes supplied stratum and municipality', async () => {
    taxApplicationService.simulate.mockResolvedValue({ applications: [], winnerRuleId: null });

    await controller.simulateTax({
      personType: PersonType.JURIDICA,
      segment: CustomerSegment.PYME,
    });
    await controller.simulateTax({
      personType: PersonType.NATURAL,
      segment: CustomerSegment.RESIDENTIAL,
      stratum: 2,
      municipalityCode: '11001',
    });

    expect(taxApplicationService.simulate).toHaveBeenNthCalledWith(1, {
      personType: PersonType.JURIDICA,
      segment: CustomerSegment.PYME,
    });
    expect(taxApplicationService.simulate).toHaveBeenNthCalledWith(2, {
      personType: PersonType.NATURAL,
      segment: CustomerSegment.RESIDENTIAL,
      stratum: 2,
      municipalityCode: '11001',
    });
  });
});
