import { AxiosBaseUrl } from '../config/axios-configuration';

const axios = AxiosBaseUrl();

const getReplicaSku = (sku) => {
  let replica = sku;
  const unwanted = ['PK', 'FBM'];

  unwanted.forEach((token) => {
    const idx = replica?.toUpperCase()?.indexOf(token);
    if (idx !== -1) {
      replica = replica?.substring(0, idx);
    }
  });

  replica = replica?.replace(/-+$/, '');

  return replica;
};

const generateReplicaSkus = (skus = []) => {
  const result = [];

  skus.forEach((sku) => {
    result.push(sku);
    const replica = getReplicaSku(sku);

    if (replica) {
      result.push(replica);
    }
  });

  return [...new Set(result)];
};

const getLocal = async (localName) => {
  const localStorage = await chrome.storage.local.get(localName);
  return localStorage[localName];
};

const setLocal = async (localName, jsonData) => {
  await chrome.storage.local.set({ [localName]: jsonData });
  return Promise.resolve();
};

const getWithCache = async (key, fetchFn, ttl = 15 * 1000) => {
  const now = Date.now();

  const cached = await getLocal(key);

  const timestamp = await getLocal(`${key}_ts`);

  if (!cached || !timestamp || now - timestamp > ttl) {
    const data = await fetchFn();
    await setLocal(key, data);
    await setLocal(`${key}_ts`, now);
    return data;
  }

  return cached;
};

const ExtractFulfillmentPlanId = () => {
  const url = window.location.href;

  const match = url.match(/active\/(\d+)/);
  return match ? match[1] : null;
};

const FetchData = async ({
  url,
  method = 'GET',
  data = null,
  headers = {},
  params = {}
}) => {
  try {
    const response = await axios({
      url,
      method,
      data,
      headers,
      params
    });

    return response.data;
  } catch (error) {
    console.error('Error fetching data:', error);
    throw error;
  }
};

const GetQueryString = (p) => {
  const esc = encodeURIComponent;

  const buildQuery = (obj, prefix = '') => Object.keys(obj).map((k) => {
    const key = prefix ? `${prefix}[${esc(k)}]` : esc(k);
    const value = obj[k];

    if (typeof value === 'object' && value !== null) {
      return buildQuery(value, key);
    }

    return `${key}=${esc(value)}`;
  }).join('&');

  return buildQuery(p);
};

const extractOrderIdFromUrl = (url) => {
  const match = url?.match(/order\/([a-f0-9-]+)\//);
  return match ? match[1] : null;
};

const GetOrderId = () => {
  const orderId = extractOrderIdFromUrl(window.location.href);

  if (orderId) {
    setLocal('orderId', orderId);
  }

  return orderId;
};

const GetSku = ({ row }) => {
  const skuElements = row.querySelectorAll('div[class^="item-sku"]');
  if (skuElements.length > 0) {
    const firstSkuElement = skuElements[1];
    const itemSku = firstSkuElement.textContent.trim().replace('SKU: ', '');
    const sku = getReplicaSku(itemSku);
    return sku;
  }

  return null;
};

const ShowLoadingOnProgress = (shown) => {
  const progressBarContainer = document.querySelector('#progress-bar-container');
  if (progressBarContainer) {
    if (shown) {
      const newDiv = document.createElement('div');
      newDiv.textContent = 'Loading...';
      newDiv.id = 'loading-container';

      progressBarContainer.replaceWith(newDiv);
    }
  }

  if (!shown) {
    const loadingContainer = document.querySelector('#loading-container');
    if (loadingContainer) {
      loadingContainer.remove();
    }
  }
};

const ShowLoadingOnTable = (tableSelector, isLoading) => {
  if (!isLoading) {
    const overlays = document.querySelectorAll('.loading-overlay');
    overlays.forEach((overlay) => overlay.remove());
    return;
  }

  const tableElement = document.querySelector(tableSelector);

  if (tableElement) {
    if (!document.querySelector('.loading-overlay')) {
      const overlay = document.createElement('div');
      overlay.className = 'loading-overlay';
      overlay.innerHTML = '<div class="spinner"></div>';

      overlay.style.position = 'absolute';
      overlay.style.top = 0;
      overlay.style.left = 0;
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';

      overlay.querySelector('.spinner').style.border = '8px solid #f3f3f3';
      overlay.querySelector('.spinner').style.borderTop = '8px solid #3498db';
      overlay.querySelector('.spinner').style.borderRadius = '50%';
      overlay.querySelector('.spinner').style.width = '60px';
      overlay.querySelector('.spinner').style.height = '60px';
      overlay.querySelector('.spinner').style.animation = 'spin 1s linear infinite';

      tableElement.style.position = 'relative';
      tableElement.appendChild(overlay);
    }
  }
};

const Sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms * 1000); });

const SetInputValue = (element, value) => new Promise((resolve) => {
  const prototype = Object?.getPrototypeOf(element);
  const descriptor = Object?.getOwnPropertyDescriptor(prototype, 'value');
  descriptor?.set?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  resolve(true);
});

const WaitForSelector = (element, timeoutMs = 5000) => new Promise((resolve) => {
  const existing = document.querySelector(element);
  if (existing) {
    resolve(existing);
    return;
  }

  const startTime = Date.now();
  const setIntervalId = setInterval(() => {
    const selector = document.querySelector(element);
    if (selector) {
      clearInterval(setIntervalId);
      resolve(selector);
    } else if (Date.now() - startTime >= timeoutMs) {
      clearInterval(setIntervalId);
      resolve(null);
    }
  }, 100);
});

const getPackageIndexFromBoxId = (boxId) => {
  if (!boxId) return -1;
  const match = String(boxId).match(/-(\d+)$/);
  return match ? Number(match[1]) - 1 : -1;
};

export {
  ExtractFulfillmentPlanId,
  extractOrderIdFromUrl,
  FetchData,
  getLocal,
  GetQueryString,
  GetOrderId,
  GetSku,
  getWithCache,
  getReplicaSku,
  generateReplicaSkus,
  getPackageIndexFromBoxId,
  ShowLoadingOnProgress,
  ShowLoadingOnTable,
  Sleep,
  SetInputValue,
  setLocal,
  WaitForSelector
};
