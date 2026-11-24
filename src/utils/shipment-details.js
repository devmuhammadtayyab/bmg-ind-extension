import { API_ENDPOINTS, API_METHODS } from './constants';
import { FetchData, getLocal, setLocal } from './helpers';

const storageKey = (orderId) => `shipmentDetails-${orderId}`;

/** Order-scoped line items; avoids stale global `shipmentItems` after navigating between orders. */
export const getShipmentItemsForOrder = async (orderId) => {
  if (!orderId) {
    return (await getLocal('shipmentItems')) || [];
  }

  const stored = (await getLocal(storageKey(orderId))) || {};
  if (stored.shipmentItems?.length) {
    return stored.shipmentItems;
  }

  const activeOrderId = await getLocal('orderId');
  if (activeOrderId === orderId) {
    return (await getLocal('shipmentItems')) || [];
  }

  return [];
};

export const persistShipmentDetails = async (orderId, payload = {}) => {
  if (!orderId) return;

  const existing = (await getLocal(storageKey(orderId))) || {};
  await setLocal(storageKey(orderId), { ...existing, ...payload, orderId });
};

export const buildShipmentDetailsPayload = async (orderId, overrides = {}) => {
  const stored = (await getLocal(storageKey(orderId))) || {};
  const shipmentItems = overrides.shipmentItems
    ?? stored.shipmentItems
    ?? (await getLocal('shipmentItems'))
    ?? [];

  return {
    orderId: orderId || stored.orderId,
    orderNumber: overrides.orderNumber ?? stored.orderNumber ?? (await getLocal('orderNumber')) ?? '',
    fulfillmentPlanId: overrides.fulfillmentPlanId ?? stored.fulfillmentPlanId ?? '',
    orderDate: overrides.orderDate ?? stored.orderDate ?? '',
    shipDate: overrides.shipDate ?? stored.shipDate ?? '',
    shipmentItems,
    soldTo: overrides.soldTo ?? stored.soldTo ?? {},
    shipTos: overrides.shipTos ?? stored.shipTos ?? {},
    amountSummary: overrides.amountSummary ?? stored.amountSummary ?? {},
    socNumber: overrides.socNumber ?? stored.socNumber ?? ''
  };
};

export const scheduleSaveShipmentDetails = async (orderId, overrides = {}) => {
  if (!orderId) return;

  const payload = await buildShipmentDetailsPayload(orderId, overrides);
  await persistShipmentDetails(orderId, payload);

  const apiPayload = { ...payload };
  if (!apiPayload.shipmentItems?.length) {
    delete apiPayload.shipmentItems;
  }

  chrome.runtime.sendMessage({
    url: API_ENDPOINTS.NON_SECURED_ROUTES.SAVE_SHIPMENT_DETAILS,
    method: API_METHODS.POST,
    data: apiPayload
  }).then(ms => console.log('Saved shipment details:', ms)).catch(err => console.error('Failed to save shipment details:', err));
};
