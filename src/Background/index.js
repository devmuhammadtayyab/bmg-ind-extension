import round from 'lodash/round';
import {
  API_ENDPOINTS,
  API_METHODS,
  FULFILMENT_CONFIG_API,
  ORDER_DETAILS_API,
  ORDER_DETAILS_URLS,
  REASON_LIST,
  STATUS_LIST
} from '../utils/constants';
import { extractOrderIdFromUrl, FetchData, getLocal, setLocal } from '../utils/helpers';
import { scheduleSaveShipmentDetails } from '../utils/shipment-details';

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === REASON_LIST.INSTALL || reason === REASON_LIST.UPDATE) {
    chrome.action.setIcon({
      path: { 128: 'images/bmg-icon-128.png' }
    });
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === STATUS_LIST.COMPLETE) {
    if (tab.url) {
      const urlPath = new URL(tab.url).pathname;

      const isMatchingUrl = ORDER_DETAILS_URLS.some((regex) => regex.test(urlPath));

      if (isMatchingUrl) {
        chrome.tabs.sendMessage(tabId, { action: 'runOrderScripts' }).catch(() => {
          chrome.scripting.executeScript({
            target: { tabId },
            files: [
              'content.bundle.js'
            ]
          });
        });
      }
    }
  }
});

chrome.webRequest.onBeforeSendHeaders.addListener(async (details) => {
  const { requestHeaders } = details;
  const authHeader = requestHeaders.find((item) => item.name === 'Authorization');
  if (authHeader) {
    await setLocal('authHeader', authHeader.value);
  }
}, { urls: [ORDER_DETAILS_API] }, ['requestHeaders']);

const GenerateBoxId = (currentId, orderNumber) => {
  currentId += 1;

  return `${orderNumber}-${currentId}`;
};

const resolveOrderContext = async (tabId) => {
  let orderId = await getLocal('orderId');

  if (tabId >= 0) {
    try {
      const tab = await chrome.tabs.get(tabId);
      const urlOrderId = extractOrderIdFromUrl(tab.url);
      if (urlOrderId) {
        orderId = urlOrderId;
        await setLocal('orderId', orderId);
      }
    } catch {
      // Tab may be unavailable; fall back to stored orderId.
    }
  }

  const shipmentDetails = (await getLocal(`shipmentDetails-${orderId}`)) || {};
  const orderNumber = shipmentDetails.orderNumber || (await getLocal('orderNumber')) || '';

  return { orderId, orderNumber };
};

const hasValidPackageDimensions = (pkg) => {
  const {
    length = 0,
    width = 0,
    height = 0
  } = pkg?.dimensions || {};

  return length > 0 && width > 0 && height > 0;
};

const GET_RESPONSE_CACHE_TTL_MS = 4000;
const getResponseCache = new Map();
const getResponseInflight = new Map();

const CACHED_GET_ENDPOINTS = new Set([
  API_ENDPOINTS.NON_SECURED_ROUTES.GET_SHIPMENT_CONFIG,
  API_ENDPOINTS.NON_SECURED_ROUTES.GET_BOX_ITEMS,
  API_ENDPOINTS.NON_SECURED_ROUTES.GET_NO_BOXES,
  API_ENDPOINTS.NON_SECURED_ROUTES.GET_PRODUCT_DIMENSIONS
]);

const stableParamsKey = (params = {}) => {
  try {
    return JSON.stringify(params, Object.keys(params).sort());
  } catch {
    return String(params);
  }
};

const getCachedGetKey = (url, params = {}) => {
  if (url === API_ENDPOINTS.NON_SECURED_ROUTES.GET_SHIPMENT_CONFIG) {
    return `${url}:${params.fulfillmentPlanId || ''}`;
  }
  if (
    url === API_ENDPOINTS.NON_SECURED_ROUTES.GET_BOX_ITEMS
    || url === API_ENDPOINTS.NON_SECURED_ROUTES.GET_NO_BOXES
  ) {
    return `${url}:${params.orderId || ''}`;
  }
  if (url === API_ENDPOINTS.NON_SECURED_ROUTES.GET_PRODUCT_DIMENSIONS) {
    const skus = params.sellerSkus;
    const skuKey = Array.isArray(skus) ? [...skus].sort().join(',') : String(skus || '');
    return `${url}:${skuKey}`;
  }
  return `${url}:${stableParamsKey(params)}`;
};

const invalidateGetResponseCacheByUrl = (url, matcher) => {
  for (const key of [...getResponseCache.keys()]) {
    if (key.startsWith(`${url}:`) && (!matcher || matcher(key))) {
      getResponseCache.delete(key);
    }
  }
  for (const key of [...getResponseInflight.keys()]) {
    if (key.startsWith(`${url}:`) && (!matcher || matcher(key))) {
      getResponseInflight.delete(key);
    }
  }
};

const invalidateCachesAfterMutation = (request) => {
  const { url, data = {}, params = {} } = request;
  const orderId = data.orderId || params.orderId;

  if (url === API_ENDPOINTS.NON_SECURED_ROUTES.SAVE_SHIPMENT_CONFIG
    || (typeof url === 'string' && url.startsWith(FULFILMENT_CONFIG_API)
      && request.method === API_METHODS.POST)) {
    const planId = params.fulfillmentPlanId
      || data.fulfillmentPlanId
      || (typeof url === 'string' ? url.split('/').pop() : null);
    invalidateGetResponseCacheByUrl(
      API_ENDPOINTS.NON_SECURED_ROUTES.GET_SHIPMENT_CONFIG,
      planId ? (key) => key.endsWith(`:${planId}`) : null
    );
  }

  if (
    url === API_ENDPOINTS.NON_SECURED_ROUTES.SAVE_BOX_ITEMS
    || url === API_ENDPOINTS.NON_SECURED_ROUTES.RESET_QUANTITY_IN_BOX
  ) {
    invalidateGetResponseCacheByUrl(
      API_ENDPOINTS.NON_SECURED_ROUTES.GET_BOX_ITEMS,
      orderId ? (key) => key.endsWith(`:${orderId}`) : null
    );
  }

  if (url === API_ENDPOINTS.NON_SECURED_ROUTES.SAVE_NO_BOX_ITEMS) {
    invalidateGetResponseCacheByUrl(
      API_ENDPOINTS.NON_SECURED_ROUTES.GET_NO_BOXES,
      orderId ? (key) => key.endsWith(`:${orderId}`) : null
    );
  }
};

const fetchWithGetResponseCache = async (request) => {
  const isCachedGet = request.method === API_METHODS.GET
    && CACHED_GET_ENDPOINTS.has(request.url);
  const cacheKey = isCachedGet ? getCachedGetKey(request.url, request.params || {}) : null;
  const hasUsableKey = Boolean(cacheKey && !cacheKey.endsWith(':'));

  if (isCachedGet && hasUsableKey) {
    const cached = getResponseCache.get(cacheKey);
    if (cached && (Date.now() - cached.at) < GET_RESPONSE_CACHE_TTL_MS) {
      return cached.response;
    }

    const inflight = getResponseInflight.get(cacheKey);
    if (inflight) {
      return inflight;
    }
  }

  const fetchPromise = FetchData({
    url: request.url,
    method: request.method,
    ...(request?.params && { params: request.params }),
    ...(request?.data && { data: request.data }),
    ...(request?.headers && { headers: request.headers })
  }).then((response) => {
    if (isCachedGet && hasUsableKey) {
      getResponseCache.set(cacheKey, { response, at: Date.now() });
    }
    invalidateCachesAfterMutation(request);
    return response;
  }).finally(() => {
    if (isCachedGet && hasUsableKey) {
      getResponseInflight.delete(cacheKey);
    }
  });

  if (isCachedGet && hasUsableKey) {
    getResponseInflight.set(cacheKey, fetchPromise);
  }

  return fetchPromise;
};

chrome.webRequest.onBeforeRequest.addListener(async (details) => {
  if (details.method === 'POST' && details.requestBody) {
    const raw = details.requestBody.raw?.[0]?.bytes;
    if (raw) {
      const decoder = new TextDecoder('utf-8');
      const body = decoder.decode(raw);
      const parsedBody = JSON.parse(body);
      const { tabId } = details;
      const { orderId, orderNumber } = await resolveOrderContext(tabId);
      const { packages } = parsedBody;
      const packagesWithValidDimensions = (packages || []).filter(hasValidPackageDimensions);
      const shouldSyncBoxes = Boolean(orderId && packagesWithValidDimensions.length > 0);

      const notifyBoxesSync = (show) => {
        if (tabId >= 0) {
          chrome.tabs.sendMessage(tabId, { action: 'boxesSyncLoading', show }).catch(() => {});
        }
      };

      if (shouldSyncBoxes) {
        await setLocal('boxesSyncInProgress', true);
        notifyBoxesSync(true);
      }

      try {
        await FetchData({
          url: API_ENDPOINTS.NON_SECURED_ROUTES.SAVE_SHIPMENT_CONFIG,
          method: API_METHODS.POST,
          data: parsedBody,
          headers: {
            'Content-Type': 'application/json'
          }
        });
        invalidateCachesAfterMutation({
          url: API_ENDPOINTS.NON_SECURED_ROUTES.SAVE_SHIPMENT_CONFIG,
          method: API_METHODS.POST,
          data: parsedBody
        });

        if (shouldSyncBoxes) {
          const boxes = packages
            .map((data, index) => ({ data, index }))
            .filter(({ data }) => hasValidPackageDimensions(data))
            .map(({ data, index }) => {
              const {
                dimensions: {
                  length = 0,
                  width = 0,
                  height = 0,
                  unit: vUnit = ''
                } = {},
                weight: {
                  value: weight = 0,
                  unit: wUnit = ''
                } = {}
              } = data || {};

              let newLength = length;
              let newWidth = width;
              let newHeight = height;
              let newWeight = weight === 0 ? 40 : weight;
              if (vUnit === 'Centimeters') {
                newLength = round(length * 0.393701, 2);
                newWidth = round(width * 0.393701, 2);
                newHeight = round(height * 0.393701, 2);
              }

              if (weight !== 0 && wUnit === 'Ounces') {
                newWeight = round(weight * 0.0625, 2);
              }

              const convertedDimensions = {
                length: newLength,
                width: newWidth,
                height: newHeight,
                weight: newWeight
              };

              delete data.weight;

              return {
                ...data,
                orderId,
                boxId: GenerateBoxId(index, orderNumber),
                dimensions: convertedDimensions
              };
            });

          await FetchData({
            url: API_ENDPOINTS.NON_SECURED_ROUTES.SAVE_BOXES,
            method: API_METHODS.POST,
            data: { boxDetails: boxes }
          });

          const newBoxes = await FetchData({
            url: API_ENDPOINTS.NON_SECURED_ROUTES.GET_BOXES,
            method: API_METHODS.GET,
            params: { orderId }
          });
          await setLocal(`packages-${orderId}`, newBoxes?.boxes || []);
        }

        if (orderId) {
          scheduleSaveShipmentDetails(orderId, {
            fulfillmentPlanId: parsedBody.fulfillmentPlanId,
            shipTos: parsedBody.shipTo || {}
          });
        }
      } finally {
        if (shouldSyncBoxes) {
          await setLocal('boxesSyncInProgress', false);
          notifyBoxesSync(false);
        }
      }

      if (body) {
        chrome.tabs.query({ active: true, currentWindow: true }, async ([tab]) => {
          if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, {
              action: 'updateProgressBar'
            });
          }
        });
      }
    }
  }
}, { urls: [`${FULFILMENT_CONFIG_API}/*`] }, ['requestBody']);

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  (async () => {
    try {
      const response = await fetchWithGetResponseCache(request);

      if (
        request.url === API_ENDPOINTS.NON_SECURED_ROUTES.GET_BOXES
        && request.method === API_METHODS.GET
      ) {
        const orderId = request.params?.orderId || await getLocal('orderId');
        scheduleSaveShipmentDetails(orderId);
      }

      sendResponse(response);
    } catch (error) {
      sendResponse({ error: error?.response?.data?.error || error.message });
    }
  })();

  return true;
});
