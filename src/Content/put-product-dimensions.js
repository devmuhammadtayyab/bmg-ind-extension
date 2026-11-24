import AddDataInTable, {
  BODY_ROW_PREFIX,
  loadTableSharedData,
  markBmgTableElements
} from './add-data-in-table';
import GetBoxDetails from './get-box-details';
import ShowProgressBar from './show-progress-bar';

import { ORDER_DETAILS_URLS } from '../utils/constants';
import {
  GetOrderId,
  ShowLoadingOnProgress,
  ShowLoadingOnTable,
  WaitForSelector,
  getLocal
} from '../utils/helpers';

const DRAWER_SELECTOR = 'div[class*="flex-column-"][class*="order-details-drawer-"]';
const TABLE_SELECTOR = 'div[class*="react-table-wrapper"]';

const isOrderDetailsPath = (pathname) => (
  ORDER_DETAILS_URLS.some((regex) => regex.test(pathname))
);

const tableNeedsBmgInjection = () => {
  const wrapper = document.querySelector('div[class*="react-table-wrapper"]');
  if (!wrapper) return false;
  const bodyRow = wrapper.querySelector('div[class^="react-table-body-row"]');
  if (!bodyRow) return false;
  return !bodyRow.querySelector('input.bmg-input-quantity');
};

let reinjectTimer = null;
const REINJECT_DEBOUNCE_MS = 300;

const scheduleTableReinject = () => {
  clearTimeout(reinjectTimer);
  reinjectTimer = setTimeout(async () => {
    if (!tableNeedsBmgInjection()) return;

    const orderId = GetOrderId();
    if (!orderId) return;

    ShowLoadingOnTable(TABLE_SELECTOR, true);

    try {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await AddDataInTable({ orderId });
        await ShowProgressBar();

        if (!tableNeedsBmgInjection()) break;

        await new Promise((resolve) => { setTimeout(resolve, 250); });
      }
    } finally {
      ShowLoadingOnTable(TABLE_SELECTOR, false);
    }
  }, REINJECT_DEBOUNCE_MS);
};

const installTableRemountWatchers = () => {
  const onCaretClick = (event) => {
    if (!event.target.closest?.('[class*="collapsible-list-caret"]')) return;
    markBmgTableElements();
    scheduleTableReinject();
  };

  document.addEventListener('click', onCaretClick, true);

  return () => {
    document.removeEventListener('click', onCaretClick, true);
    clearTimeout(reinjectTimer);
  };
};

const installNavbarNavigationWatcher = () => {
  let lastPath = window.location.pathname;

  const intervalId = setInterval(() => {
    const path = window.location.pathname;
    if (path === lastPath) return;

    // Leaving order detail via navbar Orders — same reset as drawer X in check-modal.js.
    if (isOrderDetailsPath(lastPath) && !isOrderDetailsPath(path)) {
      window.hasRunPutBoxDimensionsToMax = false;
    }

    lastPath = path;
  }, REINJECT_DEBOUNCE_MS);

  return () => clearInterval(intervalId);
};

const PutProductDimensions = () => {
  (async () => {
    const orderId = GetOrderId();
    if (orderId && window.__bmgBootstrapInProgressOrderId === orderId) {
      return;
    }

    window.__bmgBootstrapInProgressOrderId = orderId;
    ShowLoadingOnTable(DRAWER_SELECTOR, true);

    try {
      const previousOrderId = window.__bmgLastLoadedOrderId;
      const isNewOrder = previousOrderId && orderId && previousOrderId !== orderId;
      const shouldBootstrap = !window.hasRunPutBoxDimensionsToMax || isNewOrder;

      let preloadedSharedData = null;

      if (shouldBootstrap) {
        // On hard refresh the drawer/table may not exist yet when the script first runs.
        // await WaitForSelector(DRAWER_SELECTOR);

        window.hasRunPutBoxDimensionsToMax = true;
        if (orderId) {
          window.__bmgLastLoadedOrderId = orderId;
        }

        const authHeader = await getLocal('authHeader');

        const tableBodyRows = document.querySelectorAll(`div[class^="${BODY_ROW_PREFIX}"]`);

        const [, sharedData] = await Promise.all([
          authHeader ? GetBoxDetails(authHeader, orderId) : Promise.resolve(),
          tableBodyRows.length > 0 ? loadTableSharedData({ orderId, tableBodyRows }) : Promise.resolve(null)
        ]);
        preloadedSharedData = sharedData;

        // await WaitForSelector(TABLE_SELECTOR);
      }
      await AddDataInTable({ orderId, preloadedSharedData });

      await ShowProgressBar();

      if (window.__bmgTableRemountCleanup) {
        window.__bmgTableRemountCleanup();
      }
      window.__bmgTableRemountCleanup = installTableRemountWatchers();

      if (window.__bmgNavbarNavCleanup) {
        window.__bmgNavbarNavCleanup();
      }
      window.__bmgNavbarNavCleanup = installNavbarNavigationWatcher();
    } finally {
      window.__bmgBootstrapInProgressOrderId = null;
      ShowLoadingOnTable(DRAWER_SELECTOR, false);
    }
  })();

  if (!window.__bmgPutProductDimensionsListenerAdded) {
    window.__bmgPutProductDimensionsListenerAdded = true;
    chrome.runtime.onMessage.addListener(async (message) => {
      if (message.action === 'boxesSyncLoading') {
        const on = message.show === true;
        ShowLoadingOnProgress(on);
        ShowLoadingOnTable('div[class*="react-table-wrapper"]', on);
        window.dispatchEvent(new CustomEvent('bmgBoxesSyncChanged', { detail: { syncing: on } }));
        return;
      }
      if (message.action === 'updateProgressBar') {
        await ShowProgressBar();
      }
    });
  }
};

export default PutProductDimensions;
