import AddDataInTable from './add-data-in-table';
import GetBoxDetails from './get-box-details';
import ShowProgressBar from './show-progress-bar';

import {
  GetOrderId,
  ShowLoadingOnProgress,
  ShowLoadingOnTable,
  Sleep,
  WaitForSelector,
  setLocal,
  getLocal
} from '../utils/helpers';
import {
  API_ENDPOINTS,
  API_METHODS
} from '../utils/constants';

const DeleteBoxes = async ({ boxIds }) => new Promise((resolve, reject) => {
  chrome.runtime.sendMessage({
    url: API_ENDPOINTS.NON_SECURED_ROUTES.DELETE_BOXES,
    method: API_METHODS.DELETE,
    params: {
      boxIds
    }
  }, (response) => {
    if (chrome.runtime.lastError) {
      reject(chrome.runtime.lastError);
    } else {
      resolve(response?.message);
    }
  });
});

const AttachClickListenerToDeletePackage = async () => {
  const orderNumber = await getLocal('orderNumber') || '';
  const boxIds = await getLocal('boxIds') || [];

  const deleteButtons = document.querySelectorAll('.button-danger-link');

  deleteButtons.forEach((button, index) => {
    if (!button.dataset.listenerAttached) {
      button.addEventListener('click', async () => {
        const boxId = `${orderNumber}-${index + 1}`;

        if (!boxIds.includes(boxId)) {
          boxIds.push(boxId);
          await setLocal('boxIds', boxIds);
        }

        button.dataset.listenerAttached = false;
      });
    }

    button.dataset.listenerAttached = false;
  });
};

const AttachClickListenerToSavePackages = () => {
  const modalButton = document.querySelectorAll('button.button-primary');
  const targetButton = modalButton && Array.from(modalButton)?.find((button) => button.textContent.trim() === 'Save Packages');

  if (targetButton && !targetButton.dataset.listenerAttached) {
    targetButton.addEventListener('click', async () => {
      ShowLoadingOnProgress(true);
      ShowLoadingOnTable('div[class*="react-table-wrapper"]', true);

      // const { boxIds = [] } = await chrome.storage.local.get(['boxIds']) || {};
      // if (boxIds.length > 0) {
      //   await DeleteBoxes({ boxIds });

      //   await chrome.storage.local.set({ boxIds: [] });
      // }

      await Sleep(4);

      const orderId = GetOrderId();
      const authHeader = await getLocal('authHeader');

      await setLocal(`packages-${orderId}`, []);

      if (authHeader) {
        await GetBoxDetails(authHeader, orderId);

        ShowLoadingOnTable('div[class*="react-table-wrapper"]', false);

        await AddDataInTable({ orderId });

        //await Sleep(2);

        ShowLoadingOnProgress(false);

        await ShowProgressBar(false);
      }
    });

    targetButton.dataset.listenerAttached = true;
  }
};

const getSidebarWeightValues = () => {
  const pounds = document.querySelector('input[aria-labelledby="order-details-weight pounds"]');
  const ounces = document.querySelector('input[aria-labelledby="order-details-weight ounces"]');
  if (!pounds || !ounces) return null;

  return {
    poundsValue: pounds.value || '0',
    ouncesValue: ounces.value || '0'
  };
};

const getBrowseRateWeightInputs = () => {
  const pounds = document.querySelector('[data-input-type="(lb)"] input[aria-labelledby="pounds"]');
  const ounces = document.querySelector('[data-input-type="(oz)"] input[aria-labelledby="ounces"]');
  if (!pounds || !ounces) return null;

  return { pounds, ounces };
};

const setBrowseRateInputValue = (input, value) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, String(value));
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
};

const syncBrowseRateWeightFromSidebar = async (poundsValue, ouncesValue) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 6000) {
    const inputs = getBrowseRateWeightInputs();
    if (inputs) {
      setBrowseRateInputValue(inputs.pounds, poundsValue);
      setBrowseRateInputValue(inputs.ounces, ouncesValue);

      // Re-apply briefly — ShipStation resets these after modal mount.
      const endAt = Date.now() + 2000;
      while (Date.now() < endAt) {
        const latest = getBrowseRateWeightInputs() || inputs;
        setBrowseRateInputValue(latest.pounds, poundsValue);
        setBrowseRateInputValue(latest.ounces, ouncesValue);
        await new Promise((resolve) => { setTimeout(resolve, 200); });
      }
      return true;
    }
    await new Promise((resolve) => { setTimeout(resolve, 100); });
  }
  return false;
};

const AttachClickListenerToBrowseRates = () => {
  const targetButton = Array.from(document.querySelectorAll('button'))
    .find((button) => button.textContent.trim() === 'Browse Rates');

  if (targetButton && !targetButton.dataset.bmgBrowseRatesWeightSyncAttached) {
    targetButton.addEventListener('click', async () => {
      const weight = getSidebarWeightValues();
      if (!weight) return;
      await syncBrowseRateWeightFromSidebar(weight.poundsValue, weight.ouncesValue);
    });
    targetButton.dataset.bmgBrowseRatesWeightSyncAttached = 'true';
  }
};

const AttachClickListenerToBoxType = () => {
  const buttons = Array.from(document.querySelectorAll('button[class^="button-unstyled dropdown-menu-item"]'));

  if (document.body.innerText.includes('My Custom Packages')) {
    buttons?.forEach((button) => {
      if (!button.dataset.listenerAttached) {
        button.addEventListener('click', async () => {
          ShowLoadingOnProgress(true);
          ShowLoadingOnTable('div[class*="react-table-wrapper"]', true);

          await Sleep(4);

          const orderId = GetOrderId();
          const authHeader = await getLocal('authHeader');

          await setLocal(`packages-${orderId}`, []);

          if (authHeader) {
            await GetBoxDetails(authHeader, orderId);

            ShowLoadingOnTable('div[class*="react-table-wrapper"]', false);

            await AddDataInTable({ orderId });

            //  await Sleep(2);

            ShowLoadingOnProgress(false);

            await ShowProgressBar(false);

            button.dataset.listenerAttached = false;
          }
        });
      }

      button.dataset.listenerAttached = true;
    });
  }
};

const CheckModal = () => {
  (async () => {
    const closeButton = await WaitForSelector('[aria-label="Close Order Details"]');
    if (closeButton && !closeButton.dataset.bmgCloseListenerAttached) {
      closeButton.dataset.bmgCloseListenerAttached = 'true';
      closeButton.addEventListener('click', () => {
        window.hasRunPutBoxDimensionsToMax = false;
        window.hasToSaveSocNumber = false;
      });
    }

    if (window.__bmgCheckModalIntervalId) {
      clearInterval(window.__bmgCheckModalIntervalId);
    }

    window.__bmgCheckModalIntervalId = setInterval(async () => {
      const selector = await WaitForSelector('button.button-primary');
      if (selector) {
        AttachClickListenerToSavePackages();
        AttachClickListenerToDeletePackage();
        AttachClickListenerToBrowseRates();
      }

      const dropDownSelector = await WaitForSelector('button[class^="button-unstyled dropdown-menu-item"]');
      if (dropDownSelector) {
        AttachClickListenerToBoxType();
      }
    }, 1000);
  })();
};

export default CheckModal;
