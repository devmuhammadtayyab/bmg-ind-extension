import { BOX_TYPE_LIST } from '../utils/constants';
import {
  SetInputValue,
  ShowLoadingOnProgress,
  Sleep
} from '../utils/helpers';
import ShowProgressBar from './show-progress-bar';

async function WaitForElements(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const interval = 100;
    let elapsedTime = 0;

    const check = () => {
      const elements = document.querySelectorAll(selector);
      if (elements.length > 0) {
        resolve(elements);
      } else if (elapsedTime >= timeout) {
        reject(new Error(`Selector "${selector}" not found within ${timeout}ms`));
      } else {
        elapsedTime += interval;
        setTimeout(check, interval);
      }
    };

    check();
  });
}

(async () => {
  await Sleep(2);

  // const weightInput = document.querySelector('input[aria-labelledby^="order-details-weight pounds"]');
  // if (weightInput) {
  //   await SetInputValue(weightInput, '40');
  // }

  // const dropdown = document.getElementById('order-details-package');
  // if (!dropdown) {
  //   console.log('Dropdown not found!');

  //   return;
  // }

  // const iconDiv = dropdown.querySelector('div[class^="dropdown-toggler-chevron"]');
  // if (!iconDiv) {
  //   console.log('Dropdown toggle icon not found!');

  //   return;
  // }
  // iconDiv.click();
  // if (document.body.innerText.includes('My Custom Packages')) document.getElementById('order-details-package-listbox').style.visibility = 'hidden';

  // const dropdownOptionSelector = 'button[class^="button-unstyled dropdown-menu-item"]';
  // const buttons = await WaitForElements(dropdownOptionSelector, 5000);
  // if (!buttons || buttons.length === 0) {
  //   console.log('Dropdown options not found!');

  //   return;
  // }

  // let largeBoxButton = Array
  //   .from(buttons).find((button) => button.textContent.trim() === BOX_TYPE_LIST.LARGE_BOX);
  // if (!largeBoxButton) {
  //   console.log('Large Box option not found in the dropdown!');

  //   [largeBoxButton] = Array.from(buttons);
  // }
  // largeBoxButton.click();

  // ShowLoadingOnProgress(true);

  // await Sleep(4);

  // ShowLoadingOnProgress(false);

  // await ShowProgressBar();
})();
