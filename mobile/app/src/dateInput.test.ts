import { dateInputToIso, formatDateInput, isoToDateInput } from './dateInput';
import { describe, expect, it } from 'vitest';

describe('date input', () => {
  it('keeps digits only and inserts separators', () => {
    expect(formatDateInput('1a0б082026')).toBe('10.08.2026');
    expect(formatDateInput('1008')).toBe('10.08');
  });

  it('converts a valid date to ISO and rejects invalid dates', () => {
    expect(dateInputToIso('10.08.2026')).toBe('2026-08-10');
    expect(dateInputToIso('31.02.2026')).toBeNull();
    expect(dateInputToIso('10.08')).toBeNull();
  });

  it('converts an ISO date for editing', () => {
    expect(isoToDateInput('2026-08-10')).toBe('10.08.2026');
  });
});
