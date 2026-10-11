import type { Area } from './types.js';
export interface AggregationEndpoint {
  noun: string; operation: string; description: string; note?: string; control?: boolean;
}
export type DailyEndpoint = AggregationEndpoint;
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
export const quarterHourEndpoints: readonly AggregationEndpoint[] = [
  { noun: 'operations', operation: 'getOperationsQuarterHourTotals', description: 'Operational quarter-hour totals by revenue center' },
  { noun: 'menu-items', operation: 'getMenuItemQuarterHourTotals', description: 'Menu-item quarter-hour totals and grouping dimensions' },
  { noun: 'combo-items', operation: 'getComboItemQuarterHourTotals', description: 'Combo-item quarter-hour totals and components', note: 'Preserve combo/component relationships; no local flattening or roll-up.' },
  { noun: 'discounts', operation: 'getDiscountQuarterHourTotals', description: 'Discount quarter-hour totals' },
  { noun: 'service-charges', operation: 'getServiceChargeQuarterHourTotals', description: 'Service-charge quarter-hour totals' },
  { noun: 'tender-media', operation: 'getTenderMediaQuarterHourTotals', description: 'Tender-media quarter-hour totals; not settlement receipts' },
  { noun: 'order-types', operation: 'getOrderTypeQuarterHourTotals', description: 'Operational quarter-hour totals by order type' },
  { noun: 'job-codes', operation: 'getJobCodeQuarterHourTotals', description: 'Job-code quarter-hour hours/pay totals', note: 'Sensitive labor/pay information; not individual time-card records.' },
];
export default { name: 'aggregations', oracleName: 'Aggregations', sections: ['daily', 'quarter-hour'] } satisfies Area;
