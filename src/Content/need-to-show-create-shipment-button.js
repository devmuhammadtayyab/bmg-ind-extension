import React from 'react';
import { createRoot } from 'react-dom/client';

import CreateShipment from '../pages/Create Shipment/create-shipment';

import { API_ENDPOINTS, API_METHODS } from '../utils/constants';
import { calculateOverallBoxFillPercentage } from '../utils/box-fill-percentage';
import {
  GetOrderId,
  GetSku,
  WaitForSelector,
  getLocal,
  setLocal
} from '../utils/helpers';

const GetBoxItems = async ({ orderId }) => new Promise((resolve, reject) => {
  chrome.runtime.sendMessage({
    url: API_ENDPOINTS.NON_SECURED_ROUTES.GET_BOX_ITEMS,
    method: API_METHODS.GET,
    params: { orderId }
  }, (response) => {
    if (chrome.runtime.lastError) {
      reject(chrome.runtime.lastError);
    } else {
      resolve(response?.boxItems);
    }
  });
});

export const ShowCreateShipmentButton = async () => {
  const orderId = GetOrderId();
  const tableBodyRows = document.querySelectorAll('div[class^="react-table-body-row"');
  const boxItems = await GetBoxItems({ orderId });
  await setLocal('boxItems', boxItems);

  const productWithDimensions = await getLocal('productWithDimensions') || [];
  const packages = await getLocal(`packages-${orderId}`) || [];

  const noBoxItems = await getLocal('noBoxItems') || [];
  const { percentage } = calculateOverallBoxFillPercentage({
    productWithDimensions,
    boxItems,
    noBoxItems,
    packages
  });

  const allQuantitiesAvailable = Array.from(tableBodyRows).every((row) => {
    const sellerSku = GetSku({ row });
    const quantity = parseInt(row.querySelector('p[class*="quantity-text"]').innerText, 10);

    if (boxItems?.length) {
      const totalQuantityInBox = boxItems
        .filter((item) => item.sellerSku === sellerSku)
        .reduce((sum, item) => sum + item.quantityInBox, 0);

      return totalQuantityInBox === quantity;
    }

    return false;
  });

  if (allQuantitiesAvailable && percentage < 100) {
    const targetDiv = document.querySelector('#add-box-btn-container');

    let progressRoot = null;
    if (targetDiv) {
      let addBoxContainer = document.querySelector('#create-shipment-btn-container');
      if (!addBoxContainer) {
        addBoxContainer = document.createElement('div');
        addBoxContainer.id = 'create-shipment-btn-container';

        const parentElement = targetDiv.parentNode;
        parentElement.insertBefore(addBoxContainer, targetDiv);

        if (!progressRoot) {
          progressRoot = createRoot(addBoxContainer);
        }
      }

      if (progressRoot) {
        progressRoot.render(<CreateShipment />);
      }
    }
  } else {
    const addBoxContainer = document.querySelector('#create-shipment-btn-container');
    if (addBoxContainer) {
      addBoxContainer.remove();
    }
  }
};

const NeedToShowCreateShipmentButton = () => {
  (async () => {
    const selector = await WaitForSelector('div[class*="order-info-store-name-"] h4');
    if (selector && selector.textContent.includes('Amazon Vendor Central')) {
      await ShowCreateShipmentButton();
    }
  })();
};

export default NeedToShowCreateShipmentButton;
