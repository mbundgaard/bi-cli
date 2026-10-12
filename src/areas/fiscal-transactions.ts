import type { Area } from './types.js';
export interface FiscalEndpoint { noun: string; operation: string; responseArray: string; description: string }
export const fiscalEndpoints: readonly FiscalEndpoint[] = [
  { noun: 'invoices', operation: 'getFiscalInvoiceData', responseArray: 'invoiceData', description: 'Fiscal invoice data; country-specific records, not invoice creation' },
  { noun: 'totals', operation: 'getFiscalTotalData', responseArray: 'totalData', description: 'Fiscal total data; not POS daily aggregates or reconciled accounting totals' },
  { noun: 'invoice-controls', operation: 'getFiscalInvoiceControlData', responseArray: 'invoiceControlData', description: 'Fiscal invoice control metadata; not POS control daily totals or lock operations' },
];
export default { name: 'fiscal-transactions', oracleName: 'Fiscal Transactions' } satisfies Area;
