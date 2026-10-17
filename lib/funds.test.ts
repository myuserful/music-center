import { describe, expect, it } from 'vitest';
import { idState, validIsraeliId } from './funds';

describe('validIsraeliId', () => {
  it('accepts valid ids, with or without leading zeros', () => {
    expect(validIsraeliId('000000018')).toBe(true);
    expect(validIsraeliId('18')).toBe(false); // קצר מדי
    expect(validIsraeliId('339473308')).toBe(true);
    expect(validIsraeliId('123456782')).toBe(true);
  });
  it('rejects bad check digit and junk', () => {
    expect(validIsraeliId('123456789')).toBe(false);
    expect(validIsraeliId('12345678a')).toBe(false);
    expect(validIsraeliId('')).toBe(false);
  });
});

describe('idState', () => {
  it('classifies', () => {
    expect(idState({ id_number: '' })).toBe('missing');
    expect(idState({ id_number: '  ' })).toBe('missing');
    expect(idState({ id_number: '123456789' })).toBe('invalid');
    expect(idState({ id_number: '123456782' })).toBe('ok');
  });
});
