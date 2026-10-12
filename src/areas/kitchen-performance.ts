import type { Area } from './types.js';
import type { TransactionEndpoint } from './pos-transactions.js';
export const kitchenEndpoint = {
  noun: 'details', verb: 'list', operation: 'getKDSDetails',
  description: 'Kitchen display system orders and suborders for one location/business date',
  dates: ['busDt'], cursor: 'transSinceUTC',
} as const satisfies TransactionEndpoint;
export default { name: 'kitchen-performance', oracleName: 'Kitchen Performance' } satisfies Area;
