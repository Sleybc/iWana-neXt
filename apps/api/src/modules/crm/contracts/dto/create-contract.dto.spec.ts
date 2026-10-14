import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateContractDto } from './create-contract.dto';
import { CONTRACT_PLAN_ID_MAX_LENGTH } from '../utils/contract-plan-id.util';

/** Pasa por plainToInstance, como el ValidationPipe, para que el recorte de planId se aplique. */
function buildCreateDto(planId: unknown): CreateContractDto {
  return plainToInstance(CreateContractDto, {
    subscriberId: '00000000-0000-4000-8000-000000000001',
    planId,
    planSnapshotJson: {},
  });
}

function planIdErrors(errors: Awaited<ReturnType<typeof validate>>) {
  return errors.filter((error) => error.property === 'planId');
}

describe('CreateContractDto', () => {
  it('rechaza planId vacío, igual que la ruta desde expediente rechaza un plan ausente', async () => {
    const errors = await validate(buildCreateDto(''));

    expect(planIdErrors(errors)[0]?.constraints).toHaveProperty('minLength');
  });

  it('rechaza un planId formado solo por espacios, porque tras recortarlo queda vacío', async () => {
    const errors = await validate(buildCreateDto('   '));

    expect(planIdErrors(errors)[0]?.constraints).toHaveProperty('minLength');
  });

  it('recorta los espacios alrededor del planId antes de validarlo', async () => {
    const dto = buildCreateDto('  plan-fibra-300  ');

    expect(dto.planId).toBe('plan-fibra-300');
    expect(planIdErrors(await validate(dto))).toEqual([]);
  });

  it('no intenta recortar un planId que no es texto y lo rechaza por tipo', async () => {
    const errors = await validate(buildCreateDto(123));

    expect(planIdErrors(errors)[0]?.constraints).toHaveProperty('isString');
  });

  it('rechaza un planId de más de 120 caracteres', async () => {
    const errors = await validate(buildCreateDto('p'.repeat(CONTRACT_PLAN_ID_MAX_LENGTH + 1)));

    expect(planIdErrors(errors)[0]?.constraints).toHaveProperty('maxLength');
  });

  it('acepta un planId de exactamente 120 caracteres', async () => {
    const errors = await validate(buildCreateDto('p'.repeat(CONTRACT_PLAN_ID_MAX_LENGTH)));

    expect(planIdErrors(errors)).toEqual([]);
  });
});
