/* eslint-disable no-await-in-loop */
/* eslint-disable no-restricted-syntax */
/* eslint-disable react/no-unstable-nested-components */

import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import axios from 'axios';
import { Select, Button } from 'antd';
import { API_ENDPOINTS, API_METHODS, PACKAGE_TYPE_API } from '../utils/constants';
import {
  SetInputValue,
  Sleep,
  getLocal,
  GetOrderId,
  ExtractFulfillmentPlanId
} from '../utils/helpers';
import { getShipmentConfigCached } from '../utils/shipment-config-cache';

const SelectDropdown = ({ subHeader }) => {
  const [latestCustomPackages, setLatestCustomPackage] = useState([]);

  const handleChange = (packageTypeId) => {
    const selectedPackage = latestCustomPackages.find((lp) => lp.packageTypeId === packageTypeId);
    let { length, width, height } = selectedPackage.dimensions;
    const { unit } = selectedPackage.dimensions;

    if (unit?.toLowerCase() === 'centimeters') {
      const CM_TO_INCH = 0.393701;
      length = (length * CM_TO_INCH).toFixed(2);
      width = (width * CM_TO_INCH).toFixed(2);
      height = (height * CM_TO_INCH).toFixed(2);
    }

    const addButton = subHeader.querySelector('button');

    if (addButton && addButton.textContent.trim() === 'Add Package') {
      addButton.click();

      setTimeout(async () => {
        const allPackages = document.querySelector('[class*="package-set-"]');

        if (allPackages && allPackages?.lastChild) {
          const lastPackage = allPackages.lastChild;

          const lengthInput = lastPackage.querySelector('input[aria-labelledby*="length"]');
          const label = lengthInput?.getAttribute('aria-labelledby') || '';
          const match = label.match(/multi-package-size(\d+)\s+length/);
          const index = match ? match[1] : null;

          const values = {
            [`multi-package-size${index} length`]: length,
            [`multi-package-size${index} width`]: width,
            [`multi-package-size${index} height`]: height
            // [`multi-package-weight${index} pounds`]: 40
          };

          for (const [ariaLabel, value] of Object.entries(values)) {
            const input = lastPackage.querySelector(`input[aria-labelledby="${ariaLabel}"]`);

            if (input) {
              input.value = value;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));

              await Sleep(0.05);
            }
          }
        }
      }, 200);
    }
  };

  const GetPackages = async () => {
    const authHeader = await getLocal('authHeader');

    if (authHeader) {
      const config = {
        method: API_METHODS.GET,
        url: PACKAGE_TYPE_API,
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader
        }
      };

      const response = await axios.request(config);

      return response?.data;
    }

    return null;
  };

  const getBoxDetails = async () => {
    const packages = await GetPackages();

    if (packages) {
      const customPackagesOnly = packages.filter((pkg) => pkg.isCustom === true);
      setLatestCustomPackage(customPackagesOnly);
    }
  };

  useEffect(() => {
    getBoxDetails();
  }, []);

  return (
    <Select
      style={{ width: 170 }}
      placeholder="Select your package"
      dropdownRender={() => (
        <div style={{ padding: 8 }}>
          {latestCustomPackages?.map((pkg) => (
            <Button
              key={pkg.packageTypeId}
              block
              type="text"
              onMouseDown={(e) => { e.stopPropagation(); handleChange(pkg.packageTypeId); }}
            >
              {pkg.name}
            </Button>
          ))}
        </div>
      )}
    />
  );
};

const WEIGHT_POUNDS_SELECTOR = 'input[aria-labelledby*="multi-package-weight"][aria-labelledby$="pounds"]';
const WEIGHT_OUNCES_SELECTOR = 'input[aria-labelledby*="multi-package-weight"][aria-labelledby$="ounces"]';
const ORDER_DETAILS_POUNDS_SELECTOR = 'input[aria-labelledby="order-details-weight pounds"]';
const ORDER_DETAILS_OUNCES_SELECTOR = 'input[aria-labelledby="order-details-weight ounces"]';
const PACKAGE_SET_SELECTOR = '[class*="package-set-"]';
const ORDER_DETAILS_DRAWER_SELECTOR = 'div[class*="flex-column-"][class*="order-details-drawer-"]';
const SHIPMENT_CONFIG_OVERLAY_CLASS = 'bmg-shipment-config-loading-overlay';
const POPULATE_DEBOUNCE_MS = 350;

const isAddPackageSectionOpen = () => Boolean(
  document.querySelector(PACKAGE_SET_SELECTOR)
  || document.querySelector(WEIGHT_POUNDS_SELECTOR)
);

const getAddPackageLoadingTarget = () => (
  document.querySelector(PACKAGE_SET_SELECTOR)
  || document.querySelector(ORDER_DETAILS_DRAWER_SELECTOR)
);

const setAddPackageSectionLoading = (loading) => {
  const target = getAddPackageLoadingTarget();
  if (!target) return;

  const existing = target.querySelector(`.${SHIPMENT_CONFIG_OVERLAY_CLASS}`);

  if (loading) {
    if (existing || !isAddPackageSectionOpen()) return;

    const overlay = document.createElement('div');
    overlay.className = SHIPMENT_CONFIG_OVERLAY_CLASS;
    overlay.innerHTML = '<div class="spinner"></div>';
    overlay.style.cssText = [
      'position:absolute',
      'top:0',
      'left:0',
      'width:100%',
      'height:100%',
      'background:rgba(255,255,255,0.8)',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'z-index:1000'
    ].join(';');

    const spinner = overlay.querySelector('.spinner');
    spinner.style.cssText = [
      'border:8px solid #f3f3f3',
      'border-top:8px solid #3498db',
      'border-radius:50%',
      'width:60px',
      'height:60px',
      'animation:spin 1s linear infinite'
    ].join(';');

    if (getComputedStyle(target).position === 'static') {
      target.style.position = 'relative';
    }
    target.appendChild(overlay);
    return;
  }

  existing?.remove();
};

let populateInProgress = false;
let populateDebounceTimer = null;
let isProgrammaticWeightUpdate = false;
let lastWeightInputCount = 0;
let wasMultiPackageModalVisible = false;
let hasFetchedWeightsFromDb = false;
let userEditedOrderWeight = false;

const populatedPackageIndices = new Set();
const userEditedWeightIndices = new Set();

let modalNeedsDbRefresh = false;
let modalCloseRefreshTimer = null;
let configureShipmentWeightTimer = null;
let orderWeightSaveTimer = null;
let activeWeightCacheOrderId = null;

const resetWeightStateForOrder = (orderId) => {
  activeWeightCacheOrderId = orderId;
  window.__bmgPackageWeightOunces = {};
  hasFetchedWeightsFromDb = false;
  userEditedOrderWeight = false;
  modalNeedsDbRefresh = true;
  wasMultiPackageModalVisible = false;
  lastWeightInputCount = 0;
  populatedPackageIndices.clear();
  userEditedWeightIndices.clear();
  clearTimeout(populateDebounceTimer);
  clearTimeout(configureShipmentWeightTimer);
  clearTimeout(modalCloseRefreshTimer);
  clearTimeout(orderWeightSaveTimer);
  populateDebounceTimer = null;
  configureShipmentWeightTimer = null;
  modalCloseRefreshTimer = null;
  orderWeightSaveTimer = null;
};

const ensureOrderContext = () => {
  const orderId = GetOrderId();
  if (!orderId) return null;

  if (activeWeightCacheOrderId !== orderId) {
    resetWeightStateForOrder(orderId);
  }

  return orderId;
};

const getPackageWeightCache = () => {
  ensureOrderContext();
  if (!window.__bmgPackageWeightOunces) {
    window.__bmgPackageWeightOunces = {};
  }
  return window.__bmgPackageWeightOunces;
};

const setCachedPackageWeight = (packageIndex, totalOunces) => {
  getPackageWeightCache()[packageIndex] = Number(totalOunces);
};

const replacePackageWeightCache = (entries) => {
  window.__bmgPackageWeightOunces = {};
  Object.entries(entries).forEach(([indexStr, totalOunces]) => {
    setCachedPackageWeight(Number(indexStr), totalOunces);
  });
};

const hasCachedPackageWeights = () => {
  ensureOrderContext();
  return Object.keys(getPackageWeightCache()).length > 0;
};

const syncPackageWeightCacheFromConfig = (packages) => {
  const entries = {};
  (packages || []).forEach((pkg, index) => {
    if (pkg?.weight?.value == null) return;
    entries[index] = pkg.weight.value;
  });
  replacePackageWeightCache(entries);
};

const getTotalCachedWeightOunces = () => Object.values(getPackageWeightCache())
  .reduce((sum, ounces) => sum + (Number(ounces) || 0), 0);

const syncCacheFromModalWeightInputs = () => {
  const weightInputs = document.querySelectorAll(WEIGHT_POUNDS_SELECTOR);
  const ouncesInputs = document.querySelectorAll(WEIGHT_OUNCES_SELECTOR);
  if (!weightInputs.length) return false;

  const entries = {};
  weightInputs.forEach((lbInput, index) => {
    const ozInput = ouncesInputs[index];
    if (!ozInput) return;
    entries[index] = ((Number(lbInput.value) || 0) * 16) + (Number(ozInput.value) || 0);
  });

  replacePackageWeightCache(entries);
  hasFetchedWeightsFromDb = true;
  return true;
};

const getOrderDetailsWeightOunces = () => {
  const orderPounds = document.querySelector(ORDER_DETAILS_POUNDS_SELECTOR);
  const orderOunces = document.querySelector(ORDER_DETAILS_OUNCES_SELECTOR);
  if (!orderPounds || !orderOunces) return null;

  return ((Number(orderPounds.value) || 0) * 16) + (Number(orderOunces.value) || 0);
};

const markOrderWeightEditedFromUi = ({ save = false } = {}) => {
  if (isProgrammaticWeightUpdate) return;

  const totalOunces = getOrderDetailsWeightOunces();
  if (totalOunces == null) return;

  userEditedOrderWeight = true;
  clearTimeout(configureShipmentWeightTimer);
  configureShipmentWeightTimer = null;
  syncOrderWeightToLocalCache(totalOunces);

  if (!save) return;

  clearTimeout(orderWeightSaveTimer);
  orderWeightSaveTimer = setTimeout(() => {
    saveOrderDetailsWeightToOurApi().catch(() => {});
  }, 150);
};

const refreshConfigureShipmentWeightFromDb = async () => {
  if (userEditedOrderWeight) return;

  const shipmentConfig = await getShipmentConfigCached();
  if (!shipmentConfig?.packages?.length) return;
  if (userEditedOrderWeight) return;

  syncPackageWeightCacheFromConfig(shipmentConfig.packages);
  hasFetchedWeightsFromDb = true;

  await applyOrderDetailsWeightIfAllowed(getTotalPackageWeightOunces(shipmentConfig.packages));
};

const buildUpdatedPackagesFromOrderWeight = (packages, totalOunces) => {
  const oldTotal = getTotalPackageWeightOunces(packages);
  const cacheEntries = {};
  const updatedPackages = (packages || []).map((pkg, index) => {
    const nextPkg = {
      ...pkg,
      weight: {
        ...(pkg.weight || {}),
        unit: 'Ounces',
        value: 0
      }
    };

    let newOunces = totalOunces;
    if (packages.length > 1 && oldTotal > 0) {
      const currentOz = Number(pkg?.weight?.value) || 0;
      newOunces = (currentOz / oldTotal) * totalOunces;
    } else if (index > 0) {
      newOunces = 0;
    }

    nextPkg.weight.value = newOunces;
    cacheEntries[index] = newOunces;
    return nextPkg;
  });

  return { updatedPackages, cacheEntries };
};

const syncOrderWeightToLocalCache = (totalOunces) => {
  const cache = getPackageWeightCache();
  const indexes = Object.keys(cache).map(Number).sort((a, b) => a - b);

  if (!indexes.length) {
    setCachedPackageWeight(0, totalOunces);
    hasFetchedWeightsFromDb = true;
    return;
  }

  const oldTotal = getTotalCachedWeightOunces();
  const entries = {};
  indexes.forEach((index, i) => {
    if (indexes.length > 1 && oldTotal > 0) {
      entries[index] = ((Number(cache[index]) || 0) / oldTotal) * totalOunces;
    } else {
      entries[index] = i === 0 ? totalOunces : 0;
    }
  });
  replacePackageWeightCache(entries);
  hasFetchedWeightsFromDb = true;
};

const saveOrderDetailsWeightToOurApi = async () => {
  const totalOunces = getOrderDetailsWeightOunces();
  if (totalOunces == null) return;

  syncOrderWeightToLocalCache(totalOunces);

  const fulfillmentPlanId = ExtractFulfillmentPlanId();
  if (!fulfillmentPlanId) return;

  const shipmentConfig = await getShipmentConfigCached();
  if (!shipmentConfig?.packages?.length) return;

  const { updatedPackages, cacheEntries } = buildUpdatedPackagesFromOrderWeight(
    shipmentConfig.packages,
    totalOunces
  );

  await new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      url: API_ENDPOINTS.NON_SECURED_ROUTES.SAVE_SHIPMENT_CONFIG,
      method: API_METHODS.POST,
      data: {
        ...shipmentConfig,
        fulfillmentPlanId,
        packages: updatedPackages
      }
    }, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });

  replacePackageWeightCache(cacheEntries);
  hasFetchedWeightsFromDb = true;
};

const applyOrderDetailsWeightIfAllowed = async (totalOunces) => {
  if (userEditedOrderWeight || totalOunces == null) return;

  const orderPounds = document.querySelector(ORDER_DETAILS_POUNDS_SELECTOR);
  const orderOunces = document.querySelector(ORDER_DETAILS_OUNCES_SELECTOR);
  if (orderPounds && orderOunces) {
    await applyWeightToInputs(orderPounds, orderOunces, totalOunces);
  }
};

const attachOrderWeightListener = () => {
  const orderPounds = document.querySelector(ORDER_DETAILS_POUNDS_SELECTOR);
  const orderOunces = document.querySelector(ORDER_DETAILS_OUNCES_SELECTOR);
  if (!orderPounds || !orderOunces) return;

  if (!orderPounds.dataset.bmgOrderWeightListenerAttached) {
    orderPounds.dataset.bmgOrderWeightListenerAttached = 'true';
    orderOunces.dataset.bmgOrderWeightListenerAttached = 'true';

    const onUserInput = (event) => {
      if (isProgrammaticWeightUpdate || !event.isTrusted) return;
      markOrderWeightEditedFromUi();
    };

    const onUserBlur = (event) => {
      if (isProgrammaticWeightUpdate || !event.isTrusted) return;
      if (!userEditedOrderWeight) return;
      markOrderWeightEditedFromUi({ save: true });
    };

    orderPounds.addEventListener('input', onUserInput);
    orderOunces.addEventListener('input', onUserInput);
    orderPounds.addEventListener('blur', onUserBlur);
    orderOunces.addEventListener('blur', onUserBlur);
  }

  // Arrow buttons don't fire input events the same way typing does.
  // lbs and oz each have their own unit container with their own arrows.
  [orderPounds, orderOunces].forEach((input) => {
    const unitRoot = input.closest('[data-input-type]') || input.parentElement;
    if (!unitRoot) return;

    unitRoot
      .querySelectorAll('[data-testid="number-arrow-up"], [data-testid="number-arrow-down"]')
      .forEach((arrowButton) => {
        if (arrowButton.dataset.bmgOrderWeightArrowAttached) return;
        arrowButton.dataset.bmgOrderWeightArrowAttached = 'true';

        arrowButton.addEventListener('click', () => {
          userEditedOrderWeight = true;
          clearTimeout(configureShipmentWeightTimer);
          configureShipmentWeightTimer = null;

          setTimeout(() => {
            markOrderWeightEditedFromUi({ save: true });
          }, 50);
        });
      });
  });
};

const isMultiPackageModalVisible = () => {
  const packageSet = document.querySelector(PACKAGE_SET_SELECTOR);
  if (!packageSet) return false;

  const rect = packageSet.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
};

const getWeightInputIndicesToPopulate = (weightInputs) => Array.from(weightInputs)
  .map((_, index) => index)
  .filter((index) => !populatedPackageIndices.has(index) && !userEditedWeightIndices.has(index));

const attachWeightInputListeners = () => {
  document.querySelectorAll(WEIGHT_POUNDS_SELECTOR).forEach((input, index) => {
    if (input.dataset.bmgWeightListenerAttached) return;

    input.dataset.bmgWeightListenerAttached = 'true';
    const syncPackageWeightToCache = () => {
      const ozInput = document.querySelectorAll(WEIGHT_OUNCES_SELECTOR)[index];
      if (!ozInput) return;
      const totalOunces = ((Number(input.value) || 0) * 16) + (Number(ozInput.value) || 0);
      setCachedPackageWeight(index, totalOunces);
    };

    input.addEventListener('input', (event) => {
      if (isProgrammaticWeightUpdate || !event.isTrusted) return;
      userEditedWeightIndices.add(index);
      populatedPackageIndices.add(index);
      syncPackageWeightToCache();
    });
  });

  document.querySelectorAll(WEIGHT_OUNCES_SELECTOR).forEach((input, index) => {
    if (input.dataset.bmgWeightOzListenerAttached) return;

    input.dataset.bmgWeightOzListenerAttached = 'true';
    input.addEventListener('input', (event) => {
      if (isProgrammaticWeightUpdate || !event.isTrusted) return;
      userEditedWeightIndices.add(index);
      populatedPackageIndices.add(index);

      const lbInput = document.querySelectorAll(WEIGHT_POUNDS_SELECTOR)[index];
      if (!lbInput) return;
      const totalOunces = ((Number(lbInput.value) || 0) * 16) + (Number(input.value) || 0);
      setCachedPackageWeight(index, totalOunces);
    });
  });
};

const hasUnpopulatedWeightInputs = () => {
  const weightInputs = document.querySelectorAll(WEIGHT_POUNDS_SELECTOR);
  return getWeightInputIndicesToPopulate(weightInputs).length > 0;
};

const checkForNewPackageRows = () => {
  const weightInputs = document.querySelectorAll(WEIGHT_POUNDS_SELECTOR);
  const count = weightInputs.length;

  attachWeightInputListeners();

  const modalJustOpened = !wasMultiPackageModalVisible;
  const newRowsAdded = count > lastWeightInputCount;

  if (modalJustOpened || newRowsAdded) {
    wasMultiPackageModalVisible = true;
    lastWeightInputCount = count;
    populatedPackageIndices.clear();

    if (hasFetchedWeightsFromDb && hasCachedPackageWeights() && !modalNeedsDbRefresh) {
      scheduleApplyCachedWeights();
    } else {
      modalNeedsDbRefresh = false;
      schedulePopulatePackageWeights({
        forceRefresh: true,
        repopulateAll: true,
        skipCooldown: true,
        delayMs: 300
      });
    }
    return true;
  }

  return false;
};

let lastProgrammaticWeightSync = 0;
const WEIGHT_SYNC_COOLDOWN_MS = 2500;

const getTotalPackageWeightOunces = (packages) => (packages || []).reduce(
  (sum, pkg) => sum + (Number(pkg?.weight?.value) || 0),
  0
);

const applyWeightToInputs = async (poundInput, ounceInput, totalOunces, { dispatchEnter = false } = {}) => {
  if (!poundInput || !ounceInput || totalOunces == null) return false;

  const isOrderDetailsInput = poundInput.matches?.(ORDER_DETAILS_POUNDS_SELECTOR)
    || ounceInput.matches?.(ORDER_DETAILS_OUNCES_SELECTOR);
  if (isOrderDetailsInput && userEditedOrderWeight) return false;

  const ouncesTotal = Number(totalOunces);
  const pounds = Math.floor(ouncesTotal / 16);
  const ounces = ouncesTotal - (pounds * 16);

  const currentLbs = Number(poundInput.value);
  const currentOz = Number(ounceInput.value);
  if (currentLbs === pounds && Math.abs(currentOz - ounces) < 0.00001) {
    return true;
  }

  isProgrammaticWeightUpdate = true;
  try {
    await SetInputValue(poundInput, pounds);
    await SetInputValue(ounceInput, ounces);
    if (dispatchEnter) {
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true
      });
      poundInput.dispatchEvent(enterEvent);
      ounceInput.dispatchEvent(enterEvent);
    }
  } finally {
    isProgrammaticWeightUpdate = false;
  }

  return true;
};

const applyWeightsFromCache = async () => {
  const cache = getPackageWeightCache();
  const weightInputs = document.querySelectorAll(WEIGHT_POUNDS_SELECTOR);
  const ouncesInputs = document.querySelectorAll(WEIGHT_OUNCES_SELECTOR);

  for (const [indexStr, totalOunces] of Object.entries(cache)) {
    const index = Number(indexStr);
    if (userEditedWeightIndices.has(index)) continue;
    if (!weightInputs[index] || !ouncesInputs[index]) continue;

    const applied = await applyWeightToInputs(
      weightInputs[index],
      ouncesInputs[index],
      totalOunces,
      { dispatchEnter: true }
    );
    if (applied) {
      populatedPackageIndices.add(index);
    }
  }
};

const populatePackageWeights = async ({ forceRefresh = false, repopulateAll = false } = {}) => {
  if (populateInProgress) return;

  populateInProgress = true;
  try {
    const shipmentConfig = await getShipmentConfigCached({ forceRefresh });
    if (!shipmentConfig?.packages?.length) return;

    syncPackageWeightCacheFromConfig(shipmentConfig.packages);
    hasFetchedWeightsFromDb = true;

    const weightInputs = document.querySelectorAll(WEIGHT_POUNDS_SELECTOR);
    const ouncesInputs = document.querySelectorAll(WEIGHT_OUNCES_SELECTOR);
    const indicesToPopulate = repopulateAll
      ? Array.from(weightInputs).map((_, index) => index)
        .filter((index) => !userEditedWeightIndices.has(index))
      : getWeightInputIndicesToPopulate(weightInputs);

    for (const index of indicesToPopulate) {
      const pkg = shipmentConfig.packages[index];
      if (!pkg?.weight || !weightInputs[index] || !ouncesInputs[index]) continue;

      const applied = await applyWeightToInputs(
        weightInputs[index],
        ouncesInputs[index],
        pkg.weight.value,
        { dispatchEnter: true }
      );
      if (applied) {
        populatedPackageIndices.add(index);
      }
    }

    await applyOrderDetailsWeightIfAllowed(getTotalPackageWeightOunces(shipmentConfig.packages));
  } finally {
    populateInProgress = false;
  }
};

const schedulePopulatePackageWeights = ({
  forceRefresh = false,
  repopulateAll = false,
  skipCooldown = false,
  delayMs = null
} = {}) => {
  if (repopulateAll && !skipCooldown && Date.now() - lastProgrammaticWeightSync < WEIGHT_SYNC_COOLDOWN_MS) {
    return;
  }

  if (repopulateAll) {
    populatedPackageIndices.clear();
  }

  clearTimeout(populateDebounceTimer);
  const debounceMs = delayMs ?? POPULATE_DEBOUNCE_MS;
  populateDebounceTimer = setTimeout(() => {
    populatePackageWeights({ forceRefresh: false, repopulateAll });
  }, debounceMs);
};

const scheduleApplyCachedWeights = () => {
  clearTimeout(populateDebounceTimer);
  populateDebounceTimer = null;
  requestAnimationFrame(() => {
    applyWeightsFromCache();
    applyOrderDetailsWeightIfAllowed(getTotalCachedWeightOunces());
  });
};

const tryApplyConfigureShipmentWeight = async ({ forceDb = false } = {}) => {
  if (!ensureOrderContext()) return;
  if (userEditedOrderWeight || isMultiPackageModalVisible()) return;

  const orderPounds = document.querySelector(ORDER_DETAILS_POUNDS_SELECTOR);
  const orderOunces = document.querySelector(ORDER_DETAILS_OUNCES_SELECTOR);
  if (!orderPounds || !orderOunces) return;

  attachOrderWeightListener();

  if (!forceDb && hasCachedPackageWeights()) {
    await applyOrderDetailsWeightIfAllowed(getTotalCachedWeightOunces());
    return;
  }

  await refreshConfigureShipmentWeightFromDb();
};

const scheduleConfigureShipmentWeight = () => {
  if (userEditedOrderWeight) return;

  clearTimeout(configureShipmentWeightTimer);
  configureShipmentWeightTimer = setTimeout(() => {
    tryApplyConfigureShipmentWeight();
  }, 300);
};

const ShowPackagesDropdown = () => {
  if (window.__bmgShowPackagesDropdownInitialized) return;
  window.__bmgShowPackagesDropdownInitialized = true;

  setInterval(() => {
    const subHeader = document.querySelector('[class*="sub-header-"]');
    if (subHeader) {
      if (!document.getElementById('custom-ant-select')) {
        const container = document.createElement('div');
        container.id = 'custom-ant-select';
        container.style.marginLeft = '20px';
        subHeader.appendChild(container);

        const root = ReactDOM.createRoot(container);
        root.render(<SelectDropdown subHeader={subHeader} />);
      }
    }
  }, 1000);

  setInterval(() => {
    const orderId = GetOrderId();
    if (!orderId || orderId === activeWeightCacheOrderId) return;

    resetWeightStateForOrder(orderId);

    if (document.querySelector(ORDER_DETAILS_POUNDS_SELECTOR) && !isMultiPackageModalVisible()) {
      scheduleConfigureShipmentWeight();
    }
  }, 500);

  let packageObserverDebounceTimer = null;
  const observer = new MutationObserver(() => {
    ensureOrderContext();
    attachOrderWeightListener();

    const orderWeightVisible = document.querySelector(ORDER_DETAILS_POUNDS_SELECTOR);
    if (orderWeightVisible && !isMultiPackageModalVisible() && !userEditedOrderWeight) {
      scheduleConfigureShipmentWeight();
    }

    const modalVisible = isMultiPackageModalVisible();

    if (!modalVisible) {
      if (wasMultiPackageModalVisible) {
        wasMultiPackageModalVisible = false;
        populatedPackageIndices.clear();
        userEditedWeightIndices.clear();
        clearTimeout(populateDebounceTimer);
        populateDebounceTimer = null;

        clearTimeout(modalCloseRefreshTimer);
        modalCloseRefreshTimer = setTimeout(() => {
          refreshConfigureShipmentWeightFromDb();
        }, 600);
      }
      return;
    }

    clearTimeout(packageObserverDebounceTimer);
    packageObserverDebounceTimer = setTimeout(() => {
      checkForNewPackageRows();
    }, 150);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('button');
    if (!button || button.textContent?.trim() !== 'Save Packages') return;

    ensureOrderContext();
    syncCacheFromModalWeightInputs();
    modalNeedsDbRefresh = true;
    userEditedWeightIndices.clear();
    populatedPackageIndices.clear();
    lastProgrammaticWeightSync = Date.now();
  }, true);

  window.addEventListener('bmgShipmentConfigLoading', (event) => {
    const { loading } = event.detail || {};
    if (loading) {
      if (isAddPackageSectionOpen()) {
        setAddPackageSectionLoading(true);
      }
    } else {
      setAddPackageSectionLoading(false);
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'boxesSyncLoading' && message.show === false && hasUnpopulatedWeightInputs()) {
      schedulePopulatePackageWeights({ forceRefresh: true });
    }
  });

  window.addEventListener('bmgPackageWeightUpdated', async (event) => {
    if (!ensureOrderContext()) return;

    const { packageIndex, totalOunces } = event.detail || {};
    lastProgrammaticWeightSync = Date.now();
    if (packageIndex == null || totalOunces == null) return;

    setCachedPackageWeight(packageIndex, totalOunces);
    hasFetchedWeightsFromDb = true;
    userEditedOrderWeight = false;

    const weightInputs = document.querySelectorAll(WEIGHT_POUNDS_SELECTOR);
    const ouncesInputs = document.querySelectorAll(WEIGHT_OUNCES_SELECTOR);
    if (weightInputs[packageIndex] && ouncesInputs[packageIndex] && !userEditedWeightIndices.has(packageIndex)) {
      await applyWeightToInputs(
        weightInputs[packageIndex],
        ouncesInputs[packageIndex],
        totalOunces,
        { dispatchEnter: true }
      );
    }

    await applyOrderDetailsWeightIfAllowed(getTotalCachedWeightOunces());

    const orderPounds = document.querySelector(ORDER_DETAILS_POUNDS_SELECTOR);
    const orderOunces = document.querySelector(ORDER_DETAILS_OUNCES_SELECTOR);
    if (orderPounds && orderOunces && !orderPounds.disabled && !orderOunces.disabled) {
      const enterEvent = new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true
      });
      orderPounds.dispatchEvent(enterEvent);
      orderOunces.dispatchEvent(enterEvent);
    }
  });
};

export default ShowPackagesDropdown;
