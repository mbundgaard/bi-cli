import type { Area } from './types.js';
export const cashManagementEndpoint = {
  noun: 'details', verb: 'list', operation: 'getCashManagementDetails',
  description: 'Cash Management details for one explicit location and business date',
} as const;
export default { name: 'cash-management', oracleName: 'Cash Management' } satisfies Area;
