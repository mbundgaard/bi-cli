import type { Area } from './types.js';
export interface PaymentTransactionEndpoint {
  noun: string; operation: string; dateField: 'busDt' | 'stlmtDt' | 'bookingDt' | 'payoutDt' | 'recordDt';
  dateOption: 'businessDate' | 'settlementDate' | 'bookingDate' | 'payoutDate' | 'recordDate';
  dateFlag: string; accountScoped?: boolean; cursor?: boolean; version: string;
}
export const paymentTransactionEndpoints: readonly PaymentTransactionEndpoint[] = [
  { noun: 'settlements', operation: 'getPaymentSettlements', dateField: 'stlmtDt', dateOption: 'settlementDate', dateFlag: '--settlement-date', version: '20.1.11' },
  { noun: 'transactions', operation: 'getPaymentTransactions', dateField: 'busDt', dateOption: 'businessDate', dateFlag: '--business-date', cursor: true, version: '20.1.11' },
  { noun: 'payouts', operation: 'getPaymentPayouts', dateField: 'bookingDt', dateOption: 'bookingDate', dateFlag: '--booking-date', version: '20.1.11' },
  { noun: 'payout-summary', operation: 'getPaymentPayoutSummary', dateField: 'payoutDt', dateOption: 'payoutDate', dateFlag: '--payout-date', accountScoped: true, cursor: true, version: '20.2' },
  { noun: 'chargebacks', operation: 'getPaymentChargebacks', dateField: 'recordDt', dateOption: 'recordDate', dateFlag: '--record-date', version: '20.1.11' },
];
export default { name: 'payment-transactions', oracleName: 'Payment Transactions' } satisfies Area;
