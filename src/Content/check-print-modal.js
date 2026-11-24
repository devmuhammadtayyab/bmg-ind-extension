import { API_ENDPOINTS, API_METHODS } from '../utils/constants';
import {
  GetQueryString,
  GetOrderId,
  getLocal
} from '../utils/helpers';

const PACKING_SLIP_LABEL = 'Packing Slip';
const DROPDOWN_ITEM_SELECTOR = 'button[class*="dropdown-menu-item"]';

const SaveShipmentDetails = async ({
  orderId,
  socNumber
}) => new Promise((resolve, reject) => {
  chrome.runtime.sendMessage({
    url: API_ENDPOINTS.NON_SECURED_ROUTES.SAVE_SHIPMENT_DETAILS,
    method: API_METHODS.POST,
    data: {
      orderId,
      socNumber
    }
  }, (response) => {
    if (chrome.runtime.lastError) {
      reject(chrome.runtime.lastError);
    } else {
      resolve(response?.message);
    }
  });
});

const setPackingSlipLoading = (button, loading) => {
  if (loading) {
    button.dataset.bmgOriginalText = button.textContent.trim();
    button.dataset.bmgLoading = 'true';
    button.textContent = 'Loading...';
    button.disabled = true;
    button.style.pointerEvents = 'none';
    button.style.opacity = '0.75';
    return;
  }

  button.textContent = button.dataset.bmgOriginalText || PACKING_SLIP_LABEL;
  button.disabled = false;
  button.style.pointerEvents = '';
  button.style.opacity = '';
  delete button.dataset.bmgLoading;
};

const findPackingSlipButton = () => {
  const buttons = document.querySelectorAll(DROPDOWN_ITEM_SELECTOR);
  return Array.from(buttons).find((button) => button.textContent.trim() === PACKING_SLIP_LABEL);
};

const isPackingSlipEnabled = async () => {
  const orderId = GetOrderId();
  const packages = await getLocal(`packages-${orderId}`) || [];
  const noBoxItems = await getLocal('noBoxItems') || [];
  return packages.length > 0 || noBoxItems.length > 0;
};

const updatePackingSlipButtonState = async () => {
  const button = findPackingSlipButton();
  if (!button || button.dataset.bmgLoading === 'true') return;

  const enabled = await isPackingSlipEnabled();
  button.disabled = !enabled;
  button.style.opacity = enabled ? '' : '0.5';
  button.style.pointerEvents = enabled ? '' : 'none';
};

const findPrintToggle = () => {
  const navBar = document.querySelector('[class*="nav-bar-actions"]');
  const toggles = navBar
    ? navBar.querySelectorAll('button[class*="dropdown-menu-toggler"]')
    : document.querySelectorAll('button[class*="dropdown-menu-toggler"]');

  return Array.from(toggles).find(
    (button) => button.textContent.replace(/\s+/g, ' ').trim().includes('Print')
  );
};

const closePrintDropdown = () => {
  const printToggle = findPrintToggle();
  if (printToggle) {
    printToggle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    printToggle.click();
  }

  document.getElementById('dropdown-wrapper-container')?.remove();
};

const handlePackingSlipClick = (event) => {
  const button = event.target.closest(DROPDOWN_ITEM_SELECTOR);
  if (!button || button.textContent.trim() !== PACKING_SLIP_LABEL) return;

  if (button.disabled || button.style.pointerEvents === 'none') {
    event.preventDefault();
    event.stopImmediatePropagation();
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();

  setPackingSlipLoading(button, true);

  const currentOrderId = GetOrderId();
  const url = `${process.env.REACT_APP_API_URL}${API_ENDPOINTS.NON_SECURED_ROUTES.DOWNLOAD_BOX_DETAILS}?${GetQueryString({ orderId: currentOrderId })}`;
  window.open(url, '_blank');
  closePrintDropdown();

  setPackingSlipLoading(button, false);
};

const CheckPrintModal = () => {
  if (window.__bmgCheckPrintModalInitialized) return;
  window.__bmgCheckPrintModalInitialized = true;

  document.addEventListener('click', handlePackingSlipClick, true);

  setInterval(async () => {
    if (document.querySelector('div[class*="inner-dropdown-menu"]')) {
      await updatePackingSlipButtonState();
    }

    const textarea = document.querySelector('textarea[id^="Internal"]');
    if (textarea) {
      const orderId = GetOrderId();

      if (textarea.value) {
        if (!window.hasToSaveSocNumber) {
          window.hasToSaveSocNumber = true;

          await SaveShipmentDetails({
            orderId,
            socNumber: textarea.value
          });
        }
      }

      if (!textarea.dataset.listenerAttached) {
        textarea.dataset.listenerAttached = 'true';

        textarea.addEventListener('blur', async () => {
          await SaveShipmentDetails({
            orderId: GetOrderId(),
            socNumber: textarea.value
          });
        });
      }
    }
  }, 1000);
};

export default CheckPrintModal;
