import { describe, expect, it } from 'vitest';
import { asciiIdempotencyKey } from './httpHeaders';

describe('HTTP header values', () => {
  it('builds a deterministic ASCII idempotency key from Cyrillic input', () => {
    const key = asciiIdempotencyKey('mobile-task', 'section-1', 'Проверить армирование', '2026-08-12T18:59:00.000Z');
    expect(key).toBe(asciiIdempotencyKey('mobile-task', 'section-1', 'Проверить армирование', '2026-08-12T18:59:00.000Z'));
    expect(key).toMatch(/^mobile-task:[0-9a-f]{8}$/);
    expect([...key].every((character) => character.charCodeAt(0) <= 0x7f)).toBe(true);
  });

  it('changes when request data changes', () => {
    expect(asciiIdempotencyKey('mobile-task', 'section-1', 'Задача 1')).not.toBe(asciiIdempotencyKey('mobile-task', 'section-1', 'Задача 2'));
  });
});
