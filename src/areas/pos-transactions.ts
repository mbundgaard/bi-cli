import type { Area } from './types.js';
export type BusinessDateField = 'busDt' | 'opnBusDt' | 'clsdBusDt';
export interface TransactionEndpoint {
  noun: string; verb: 'list'; operation: string; description: string;
  dates: readonly BusinessDateField[];
  cursor?: 'changedSinceUTC' | 'transSinceUTC';
  guestSelectors?: boolean;
  note?: string;
}
export const transactionEndpoints: readonly TransactionEndpoint[] = [
  { noun: 'guest-checks', verb: 'list', operation: 'getGuestChecks', description: 'Guest checks for one location and exactly one business-date selection',
    dates: ['busDt', 'opnBusDt', 'clsdBusDt'], cursor: 'changedSinceUTC', guestSelectors: true,
    note: 'Use exactly one date: open/reopened, closed/reopen-closed, or their union (busDt, 20.1.10+). Native rvcNum requires 20.1.9.7+. changedSinceUTC tracks cloud changes, not just POS transaction time. Keep curUTC and check/line IDs when consuming deltas. Returned checks may recur; the CLI does not aggregate or reconcile them.' },
  { noun: 'non-sales', verb: 'list', operation: 'getNonSalesTransactions', description: 'Non-sales transactions for one location/business date', dates: ['busDt'], cursor: 'transSinceUTC' },
  { noun: 'journal-logs', verb: 'list', operation: 'getPOSJournalLogDetails', description: 'POS journal details; text may contain sensitive data', dates: ['busDt'] },
  { noun: 'waste', verb: 'list', operation: 'getPOSWasteDetails', description: 'POS waste transactions for one location/business date', dates: ['busDt'], cursor: 'transSinceUTC',
    note: 'transSinceUTC and returned curUTC require 20.3+. Oracle examples and response-schema field names differ; do not assume qty/amt/cost versus cnt/ttl/prepCost. Response fields are never renamed.' },
  { noun: 'guest-check-extensibility', verb: 'list', operation: 'getGuestCheckExtensibilityDetails', description: 'Guest-check extensibility for one location/open business date', dates: ['opnBusDt'] },
  { noun: 'guest-check-line-item-extensibility', verb: 'list', operation: 'getGuestCheckLineItemExtDetails', description: 'Guest-check line-item extensibility for one location/business date', dates: ['busDt'] },
  { noun: 'spi-payments', verb: 'list', operation: 'getSPIPaymentDetails', description: 'Sensitive SPI payment metadata for one location/business date', dates: ['busDt'], cursor: 'changedSinceUTC',
    note: 'Requires 20.1.11+ and Simphony Payment Interface (SPI), not Oracle MICROS Payment Cloud Service. Not a replacement for payment-transactions. Nested payment identifiers include guestCheckID (case-sensitive). Empty data is not proof of complete payment coverage.' },
];
export default { name: 'pos-transactions', oracleName: 'Transactions' } satisfies Area;
