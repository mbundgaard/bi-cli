import type { Area } from './types.js';
export interface DailyEndpoint {
  noun: string; operation: string; description: string; note?: string; control?: boolean;
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
export const controlEndpoint: DailyEndpoint = {
  noun: 'control', operation: 'getControlDailyTotals', control: true,
  description: 'Control daily totals, end-of-day status and change indicators',
  note: 'Native RVC requires 20.1.9.7+; open/closed date selection requires 20.1.10+. Cloud lastUpdated timestamps require 20.1.12+. No local completion decision or reconciliation.',
};
export const allDailyEndpoints: readonly DailyEndpoint[] = [...dailyEndpoints, controlEndpoint];
export default { name: 'aggregations', oracleName: 'Aggregations', sections: ['daily', 'quarter-hour'] } satisfies Area;
