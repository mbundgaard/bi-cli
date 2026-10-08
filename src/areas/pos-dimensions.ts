import type { Area } from './types.js';
export interface DimensionEndpoint {
  noun: string;
  verb: 'list' | 'get';
  operation: string;
  description: string;
  allLocations?: boolean;
  priceDates?: boolean;
  compatibilityNote?: string;
}
export const dimensionEndpoints: readonly DimensionEndpoint[] = [
  { noun: 'cash-management-items', verb: 'list', operation: 'getCashManagementItemDimensions', description: 'Cash management item definitions' },
  { noun: 'cashiers', verb: 'list', operation: 'getCashierDimensions', description: 'Cashier definitions' },
  { noun: 'discounts', verb: 'list', operation: 'getDiscountDimensions', description: 'Discount definitions' },
  { noun: 'employees', verb: 'list', operation: 'getEmployeeDimensions', description: 'Employee definitions (personnel data)' },
  { noun: 'job-codes', verb: 'list', operation: 'getJobCodeDimensions', description: 'Job code definitions' },
  { noun: 'latest-business-date', verb: 'get', operation: 'getLatestBusDt', description: 'Latest business date for the specified location', compatibilityNote: 'The tested deployment rejects include and searchCriteria with HTTP 400/code 33205, despite their presence in Swagger. Omit them for this operation. Explicit inputs are still forwarded unchanged for compatibility with other deployments.' },
  { noun: 'locations', verb: 'list', operation: 'getLocationDimensions', description: 'Location definitions; all-location discovery is organization-wide', allLocations: true },
  { noun: 'menu-item-prices', verb: 'list', operation: 'getMenuItemPrices', description: 'Active menu item prices, or explicit effective-date selection', priceDates: true },
  { noun: 'menu-items', verb: 'list', operation: 'getMenuItemDimensions', description: 'Menu item definitions' },
  { noun: 'order-channels', verb: 'list', operation: 'getOrderChannelDimensions', description: 'Order channel definitions' },
  { noun: 'order-types', verb: 'list', operation: 'getOrderTypeDimensions', description: 'Order type definitions' },
  { noun: 'reason-codes', verb: 'list', operation: 'getReasonCodeDimensions', description: 'Reason code definitions' },
  { noun: 'revenue-centers', verb: 'list', operation: 'getRevenueCenterDimensions', description: 'Revenue center definitions' },
  { noun: 'service-charges', verb: 'list', operation: 'getServiceChargeDimensions', description: 'Service charge definitions' },
  { noun: 'taxes', verb: 'list', operation: 'getTaxDimensions', description: 'Tax definitions' },
  { noun: 'tender-media', verb: 'list', operation: 'getTenderMediaDimensions', description: 'Tender media definitions' },
];
export default { name: 'pos-dimensions', oracleName: 'Point of Sale Dimensions' } satisfies Area;
