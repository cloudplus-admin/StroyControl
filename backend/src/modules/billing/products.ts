export const products = {
  'uz.cloudplus.stroycontrol.one_time_job': 'one_time',
  'uz.cloudplus.stroycontrol.renovation_monthly': 'subscription',
  'uz.cloudplus.stroycontrol.houses_monthly': 'subscription',
  'uz.cloudplus.stroycontrol.commercial_monthly': 'subscription',
} as const;

export type ProductId = keyof typeof products;
export function isProductId(value: string): value is ProductId { return value in products; }
