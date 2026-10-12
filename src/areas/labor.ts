import type { Area } from './types.js';
export const laborEndpoint = {
  noun: 'time-cards', verb: 'list', operation: 'getTimeCardDetails',
  description: 'Sensitive time-card and related sales information; requires payroll preprocessing (20.2+)',
} as const;
export default { name: 'labor', oracleName: 'Labor' } satisfies Area;
