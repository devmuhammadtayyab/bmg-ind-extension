import React from 'react';
import { createRoot } from 'react-dom/client';

import Progress from '../pages/Input/progress';
import {
  GetOrderId,
  ShowLoadingOnTable,
  getWithCache,
  getLocal,
  setLocal
} from '../utils/helpers';
import { API_ENDPOINTS, API_METHODS } from '../utils/constants';
import { calculateOverallBoxFillPercentage } from '../utils/box-fill-percentage';

const GetBoxItems = async () => {
  const orderId = GetOrderId();

  return new Promise((resolve, reject) => {
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
};

const GetNoBoxItems = async ({ orderId }) => new Promise((resolve, reject) => {
  chrome.runtime.sendMessage({
    url: API_ENDPOINTS.NON_SECURED_ROUTES.GET_NO_BOXES,
    method: API_METHODS.GET,
    params: { orderId }
  }, (response) => {
    if (chrome.runtime.lastError) {
      reject(chrome.runtime.lastError);
    } else {
      resolve(response?.noBoxItems);
    }
  });
});

const UpdateProgressUsingSelector = (percentage = 0, isOveflow = false) => {
  if (isOveflow) {
    const progressDiv = document.querySelector('[id="progress-bar-container"]');
    progressDiv.innerHTML = '';
    const redDiv = document.createElement('div');
    redDiv.style.color = 'red';
    redDiv.innerText = 'Please remove some items from the last updated box!';
    progressDiv.appendChild(redDiv);
    return;
  }

  const progressBar = document.querySelector('.ant-progress-bg');
  const progressText = document.querySelector('.ant-progress-text');

  if (progressBar) {
    progressBar.style.width = `${percentage}%`;

    progressBar.style.setProperty('--progress-percent', percentage / 100);
  }

  if (progressText) {
    progressText.textContent = `${percentage}%`;

    progressText.setAttribute('title', `${percentage}%`);
  }
};

const ShowProgressBar = async () => {
  const productWithDimensions = await getLocal('productWithDimensions') || [];
  const orderId = GetOrderId();
  const packages = await getLocal(`packages-${orderId}`) || [];

  const [boxItems, noBoxItems] = await Promise.all([
    getWithCache(
      `boxItems-${orderId}`,
      () => GetBoxItems({ orderId }),
      3 * 1000
    ),
    getWithCache(
      `noBoxItems-${orderId}`,
      () => GetNoBoxItems({ orderId }),
      3 * 1000
    )
  ]);
  await setLocal('boxItems', boxItems);
  await setLocal('noBoxItems', noBoxItems);

  const { percentage, isOverflow } = calculateOverallBoxFillPercentage({
    productWithDimensions,
    boxItems,
    noBoxItems,
    packages
  });

  const navActions = document.querySelector('div[class^="fulfillment-plan-tags"');

  let progressRoot = null;
  if (navActions) {
    let progressBarContainer = document.querySelector('#progress-bar-container');
    if (!progressBarContainer) {
      progressBarContainer = document.createElement('div');
      progressBarContainer.id = 'progress-bar-container';

      navActions.insertAdjacentElement('afterend', progressBarContainer);

      if (!progressRoot) {
        progressRoot = createRoot(progressBarContainer);
      }
    }

    if (!progressRoot && progressBarContainer) {
      if (!progressRoot) {
        progressRoot = createRoot(progressBarContainer);
      }
    }

    if (isOverflow) {
      // notification.error({
      //   message: 'Error',
      //   key: 'progress-error',
      //   description: 'Please remove some items from the last updated box!'
      // });
      UpdateProgressUsingSelector(0, true);

      const addBoxContainer = document.querySelector('#create-shipment-btn-container');
      if (addBoxContainer) {
        addBoxContainer.remove();
      }
      ShowLoadingOnTable('div[class*="flex-column-"][class*="order-details-drawer-"]', false);
      return;
    }

    if (progressRoot) {
      progressRoot.render(<Progress percentage={percentage} />);
    } else {
      UpdateProgressUsingSelector(percentage);
    }
  }

  ShowLoadingOnTable('div[class*="flex-column-"][class*="order-details-drawer-"]', false);
};

export default ShowProgressBar;
