import { describe, expect, it } from 'vitest';

import { API_BASE_URL } from './api';

describe('API configuration', () => {
  it('uses the public HTTPS test stand by default', () => {
    expect(API_BASE_URL).toBe('https://stroycontrol-api.cloudplus.uz');
    expect(API_BASE_URL).not.toContain('10.0.2.2');
  });
});
