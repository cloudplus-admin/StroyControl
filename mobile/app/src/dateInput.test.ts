import { dateInputToDeadlineIso, dateInputToIso, formatDateInput, isoToDateInput } from './dateInput';
import { describe, expect, it } from 'vitest';

describe('date input', () => {
  it('keeps digits only and inserts separators', () => {
    expect(formatDateInput('1a0б082026')).toBe('10.08.2026');
    expect(formatDateInput('1008')).toBe('10.08');
  });

  it('combines a selected date and time into a valid instant', () => {
    const value = dateInputToDeadlineIso('15.08.2026', '18:30');
    expect(value).not.toBeNull();
    expect(new Date(value!).getTime()).toBe(new Date('2026-08-15T18:30:00').getTime());
    expect(dateInputToDeadlineIso('15.08.2026', '24:00')).toBeNull();
  });

  it('keeps every digit during sequential Android keyboard input', () => {
    let value = '';
    for (const digit of '12092025') value = formatDateInput(`${value}${digit}`);
    expect(value).toBe('12.09.2025');
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
