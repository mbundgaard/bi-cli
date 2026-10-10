import type { Area } from './types.js';
export interface DailyEndpoint {
  noun: string; operation: string; description: string; note?: string;
}
export const dailyEndpoints: readonly DailyEndpoint[] = [
  { noun: 'operations', operation: 'getOperationsDailyTotals', description: 'Operational daily totals by revenue center' },
  { noun: 'menu-items', operation: 'getMenuItemDailyTotals', description: 'Menu-item daily totals with price-level/order dimensions' },
  { noun: 'combo-items', operation: 'getComboItemDailyTotals', description: 'Combo-item daily totals and components', note: '20.1.8.3+. Keep combo/component relationships; no local roll-up or flattening.' },
  { noun: 'discounts', operation: 'getDiscountDailyTotals', description: 'Discount daily totals' },
  { noun: 'service-charges', operation: 'getServiceChargeDailyTotals', description: 'Service-charge daily totals' },
  { noun: 'tender-media', operation: 'getTenderMediaDailyTotals', description: 'Tender-media daily totals; not payment settlement totals' },
  { noun: 'taxes', operation: 'getTaxDailyTotals', description: 'Tax daily totals' },
  { noun: 'order-types', operation: 'getOrderTypeDailyTotals', description: 'Operational daily totals by order type' },
  { noun: 'order-channels', operation: 'getOrderChannelDailyTotals', description: 'Operational daily totals by order channel' },
  { noun: 'employees', operation: 'getEmployeeDailyTotals', description: 'Employee operational daily totals', note: 'Sensitive employee sales and tip information; minimize projections and protect exports.' },
  { noun: 'job-codes', operation: 'getJobCodeDailyTotals', description: 'Job-code daily hours and pay totals', note: 'Sensitive labor/pay information; not individual time-card records.' },
];
export default { name: 'aggregations', oracleName: 'Aggregations', sections: ['daily', 'quarter-hour'] } satisfies Area;
