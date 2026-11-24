import { API_ENDPOINTS, API_METHODS } from './constants';
import { ExtractFulfillmentPlanId } from './helpers';

const fetchShipmentConfig = () => new Promise((resolve, reject) => {
  const fulfillmentPlanId = ExtractFulfillmentPlanId();

  chrome.runtime.sendMessage({
    url: API_ENDPOINTS.NON_SECURED_ROUTES.GET_SHIPMENT_CONFIG,
    method: API_METHODS.GET,
    params: { fulfillmentPlanId }
  }, (response) => {
    if (chrome.runtime.lastError) {
      reject(chrome.runtime.lastError);
    } else {
      resolve(response?.shipmentConfig);
    }
  });
});

let shipmentConfigFetchPromise = null;
let activeFetchCount = 0;

const notifyShipmentConfigLoading = (loading) => {
  window.dispatchEvent(new CustomEvent('bmgShipmentConfigLoading', { detail: { loading } }));
};

const beginShipmentConfigFetch = () => {
  activeFetchCount += 1;
  if (activeFetchCount === 1) {
    notifyShipmentConfigLoading(true);
  }
};

const endShipmentConfigFetch = () => {
  activeFetchCount = Math.max(0, activeFetchCount - 1);
  if (activeFetchCount === 0) {
    notifyShipmentConfigLoading(false);
  }
};

export const getShipmentConfigCached = async () => {
  const planId = ExtractFulfillmentPlanId();
  if (!planId) return null;

  if (shipmentConfigFetchPromise) {
    return shipmentConfigFetchPromise;
  }

  beginShipmentConfigFetch();
  shipmentConfigFetchPromise = fetchShipmentConfig()
    .finally(() => {
      shipmentConfigFetchPromise = null;
      endShipmentConfigFetch();
    });

  return shipmentConfigFetchPromise;
};
