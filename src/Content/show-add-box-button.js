import React from 'react';
import { createRoot } from 'react-dom/client';

import AddBox from '../pages/Box/add-box';

const ShowAddBoxButton = () => {
  const header = document.querySelector('div[class*="fulfillment-plan-header"]');
  let progressRoot = null;
  if (header) {
    const dropdownMenu = Array.from(header.querySelectorAll('div[class*="dropdown-menu"]'));
    if (dropdownMenu) {
      const targetDiv = dropdownMenu[dropdownMenu.length - 1];

      let addBoxContainer = document.querySelector('#add-box-btn-container');
      if (!addBoxContainer && targetDiv?.parentNode) {
        addBoxContainer = document.createElement('div');
        addBoxContainer.id = 'add-box-btn-container';

        const parentElement = targetDiv.parentNode;
        parentElement.insertBefore(addBoxContainer, targetDiv);

        if (!progressRoot) {
          progressRoot = createRoot(addBoxContainer);
        }
      }

      if (progressRoot) {
        progressRoot.render(<AddBox />);
      }
    }
  }
};

export default ShowAddBoxButton;
