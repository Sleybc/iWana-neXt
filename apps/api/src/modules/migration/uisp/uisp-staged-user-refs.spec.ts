import { stagedUispUserRefs, uispUserNumber } from './uisp-staged-user-refs';

describe('stagedUispUserRefs', () => {
  it('lee asignado y autores de actividad de un ticket', () => {
    const refs = stagedUispUserRefs('TICKET', {
      raw: {
        assignedUserId: 7,
        activity: [{ userId: 7 }, { userId: '12' }, { userId: null }, null, { comment: {} }],
      },
    });
    expect([...refs].sort((a, b) => a - b)).toEqual([7, 12]);
  });

  it('lee el registrador de un pago', () => {
    expect([...stagedUispUserRefs('PAGO', { raw: { userId: 30 } })]).toEqual([30]);
  });

  it('ignora otras entidades, cargas sin raw y valores no numéricos', () => {
    expect(stagedUispUserRefs('SUSCRIPTOR', { raw: { userId: 4 } }).size).toBe(0);
    expect(stagedUispUserRefs('TICKET', { raw: null }).size).toBe(0);
    expect(stagedUispUserRefs('TICKET', null).size).toBe(0);
    expect(stagedUispUserRefs('PAGO', { raw: { userId: 'persona' } }).size).toBe(0);
  });

  it.each([
    [5, 5],
    ['5', 5],
    [0, null],
    [-1, null],
    [1.5, null],
    ['05', null],
    [2_147_483_648, null],
    ['9999999999', null],
    [true, null],
  ])('uispUserNumber(%p) = %p', (value, expected) => {
    expect(uispUserNumber(value)).toBe(expected);
  });
});
