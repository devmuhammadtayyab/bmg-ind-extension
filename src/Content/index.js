import ShowAddBoxButton from './show-add-box-button';
import PutProductDimensions from './put-product-dimensions';
import CheckModal from './check-modal';
import CheckPrintModal from './check-print-modal';
import NeedToShowCreateShipmentButton from './need-to-show-create-shipment-button';
import ShowPackagesDropdown from './show-packages-dropdown';
import { ORDER_DETAILS_URLS } from '../utils/constants';

const runOrderScripts = () => {
  const isOrderDetailsUrl = ORDER_DETAILS_URLS.some((regex) => (
    regex.test(window.location.pathname)
  ));

  if (!isOrderDetailsUrl) return;

  ShowAddBoxButton();
  PutProductDimensions();
  CheckModal();
  CheckPrintModal();
  NeedToShowCreateShipmentButton();
  ShowPackagesDropdown();
};

if (!window.__bmgContentScriptLoaded) {//initializes once per tab keeping a single React/ReactDOM copy in memory
  window.__bmgContentScriptLoaded = true;

  runOrderScripts();//for hard reload

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.action === 'runOrderScripts') {
      runOrderScripts();
    }
  });
}
