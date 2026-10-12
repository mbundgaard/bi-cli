import type { Area } from './types.js';
export interface PaymentDimensionEndpoint {
  noun: string; operation: string; organizationWide: boolean; responseArray: string;
}
export const paymentDimensionEndpoints: readonly PaymentDimensionEndpoint[] = [
  { noun: 'account-holders', operation: 'getPaymentAccountHolderDimensions', organizationWide: true, responseArray: 'accountHolders' },
  { noun: 'accounts', operation: 'getPaymentAccountDimensions', organizationWide: false, responseArray: 'accounts' },
];
export default { name: 'payment-dimensions', oracleName: 'Payment Dimensions' } satisfies Area;
