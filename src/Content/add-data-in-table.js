import React from 'react';
import { createRoot } from 'react-dom/client';
import startCase from 'lodash/startCase';

import Input from '../pages/Input';
import QuantityBox from '../pages/Input/quantity-box';
import NoBoxRequiredCheckbox from '../pages/Input/no-box-required-checkbox';
import ShowImage from '../pages/Input/image-comp';
import BatchSelectionCheckbox from '../pages/Input/batch-selection-checkbox';
import BatchAddToBoxButton from '../pages/Input/batch-add-to-box-button';

import {
  API_ENDPOINTS,
  API_METHODS,
  BOX_TYPE,
  COLUMN_LIST,
  COLUMN_TYPE,
  COLUMN_TYPE_ID
} from '../utils/constants';
import {
  GetSku,
  GetOrderId,
  SetInputValue,
  getLocal,
  setLocal
} from '../utils/helpers';
import { boxItemMatchesLine } from '../utils/order-quantity';

const BODY_ROW_MARKER = 'react-table-body-row-bmg-extension';
const HEADER_ROW_MARKER = 'collaspe-item-bmg-extension';
const WRAPPER_MARKER = 'react-table-wrapper-bmg-extension';
const BODY_ROW_PREFIX = 'react-table-body-row';
const WRAPPER_PREFIX = 'react-table-wrapper';

const COLUMN_VALUE_TO_ID = {
  [COLUMN_TYPE.ITEM_NAME]: COLUMN_TYPE_ID.ITEM_NAME,
  [COLUMN_TYPE.REMAINING_QUANTITY]: COLUMN_TYPE_ID.REMAINING_QUANTITY,
  [COLUMN_TYPE.DIMENSIONS]: COLUMN_TYPE_ID.DIMENSIONS,
  [COLUMN_TYPE.NO_BOX_REQUIRED]: COLUMN_TYPE_ID.NO_BOX_REQUIRED,
  [COLUMN_TYPE.BOX_DETAILS]: COLUMN_TYPE_ID.BOX_DETAILS,
  [COLUMN_TYPE.BATCH_SELECTION]: COLUMN_TYPE_ID.BATCH_SELECTION,
  [COLUMN_TYPE.BOX_QUANTITY]: COLUMN_TYPE_ID.BOX_QUANTITY
};

const reactRoots = new WeakMap();

const renderIntoCell = (cell, element) => {
  let root = reactRoots.get(cell);
  if (!root) {
    root = createRoot(cell);
    reactRoots.set(cell, root);
  }
  root.render(element);
};

const GetProductDimensions = async ({ tableBodyRows }) => {
  const skuList = [];
  tableBodyRows.forEach((row) => {
    const itemSku = GetSku({ row });
    if (itemSku) skuList.push(itemSku);
  });

  if (skuList.length > 0) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        url: API_ENDPOINTS.NON_SECURED_ROUTES.GET_PRODUCT_DIMENSIONS,
        method: API_METHODS.GET,
        params: {
          sellerSkus: skuList
        }
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(response?.productsWithDimensions);
        }
      });
    });
  }

  return null;
};

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

const updateBoxDetails = async ({ orderId }) => {
  const tableBodyRows = document.querySelectorAll('div[class^="react-table-body-row"]');
  const boxItems = await GetBoxItems({ orderId });
  await setLocal('boxItems', boxItems);

  const packages = await getLocal(`packages-${orderId}`) || [];

  packages.sort((a, b) => {
    if (a.type === BOX_TYPE.CUSTOM && b.type !== BOX_TYPE.CUSTOM) return 1;
    if (a.type !== BOX_TYPE.CUSTOM && b.type === BOX_TYPE.CUSTOM) return -1;

    return a.boxId.localeCompare(b.boxId, undefined, { numeric: true });
  });

  tableBodyRows.forEach((row, lineItemIndex) => {
    ensureBodyRowMarker(row);
    const sellerSku = GetSku({ row });

    const relatedBoxes = boxItems
      .filter((item) => boxItemMatchesLine(item, sellerSku, lineItemIndex))
      .map((item) => ({ boxId: item.boxId, type: item.type }));

    const boxDetails = packages
      .map((b, originalIndex) => ({ ...b, originalIndex }))
      .filter((b) => relatedBoxes.some((rb) => rb.boxId === b.boxId && rb.type === b.type))
      .map((b) => `Box ${b.originalIndex + 1} (${startCase(b.type)})`);

    const cell = row.querySelector('div[role="cell"]:nth-child(9)');
    if (cell) {
      cell.textContent = boxDetails.length > 0 ? boxDetails.join('\n') : 'N/A';
    }
  });
};

const updateRemainingQuantity = async ({ orderId }) => {
  const tableBodyRows = document.querySelectorAll('div[class^="react-table-body-row"]');
  const boxItems = await GetBoxItems({ orderId });
  await setLocal('boxItems', boxItems);

  const updatedQuantities = [];
  tableBodyRows.forEach((row, lineItemIndex) => {
    ensureBodyRowMarker(row);
    const sellerSku = GetSku({ row });
    const quantity = row.querySelector('p[class*="quantity-text"]').innerText;
    const box = boxItems?.filter((item) => boxItemMatchesLine(item, sellerSku, lineItemIndex));
    const totalQuantityInBox = box?.reduce((total, b) => total + b.quantityInBox, 0) ?? 0;

    const orderQty = Number.parseInt(String(quantity ?? '').trim(), 10);
    let newQuantity;
    if (Number.isFinite(orderQty)) {
      newQuantity = Math.max(0, orderQty - totalQuantityInBox);
    } else {
      newQuantity = 'N/A';
    }

    const cell = row.querySelector('div[role="cell"]:nth-child(6)');
    if (cell) {
      const value = cell.querySelector('p[class*="bmg-remaining-quantity-value"]');
      if (value) value.textContent = newQuantity;
      const resetBtn = cell.querySelector('button.bmg-reset-btn');
      if (resetBtn) {
        if (newQuantity !== 'N/A') {
          resetBtn.style.display = 'block';
        } else {
          resetBtn.style.display = 'none';
        }
      }
    }

    const inputCell = row.querySelector('div[role="cell"]:nth-child(10)');
    if (inputCell) {
      const value = inputCell.querySelector('input[class*="bmg-input-quantity"]');
      if (value) {
        if (typeof newQuantity === 'number' && newQuantity <= 0) {
          value.classList.add('ant-input-disabled');
          value.setAttribute('disabled', 'true');
          SetInputValue(value, '');
        } else {
          value.classList.remove('ant-input-disabled');
          value.removeAttribute('disabled');

          const tempQuantity = typeof newQuantity === 'number' ? newQuantity : quantity;
          SetInputValue(value, tempQuantity);
        }
      }
    }

    updatedQuantities.push({
      sellerSku,
      lineItemIndex,
      remainingQuantity: newQuantity
    });
  });

  return updatedQuantities;
};

const sortPackages = (packages) => {
  packages.sort((a, b) => {
    if (a.type === BOX_TYPE.CUSTOM && b.type !== BOX_TYPE.CUSTOM) return 1;
    if (a.type !== BOX_TYPE.CUSTOM && b.type === BOX_TYPE.CUSTOM) return -1;

    return a.boxId.localeCompare(b.boxId, undefined, { numeric: true });
  });
  return packages;
};

const loadTableSharedData = async ({ orderId, tableBodyRows }) => {
  const [productsWithDimensions, boxItems, packagesRaw] = await Promise.all([
    GetProductDimensions({ tableBodyRows }),
    GetBoxItems({ orderId }),
    getLocal(`packages-${orderId}`)
  ]);
  await setLocal('productWithDimensions', productsWithDimensions);

  await setLocal('boxItems', boxItems);
  await setLocal(`boxItems-${orderId}`, boxItems);
  await setLocal(`boxItems-${orderId}_ts`, Date.now());

  return {
    productsWithDimensions,
    boxItems,
    packages: sortPackages([...(packagesRaw || [])])
  };
};

const isTableFullyInjected = (tableHeaderRow, tableBodyRows) => {
  if (!tableHeaderRow?.querySelector(`#${COLUMN_TYPE_ID.BOX_QUANTITY}`)) {
    return false;
  }

  if (!tableBodyRows?.length) {
    return false;
  }
  return Boolean(tableBodyRows[0]?.querySelector('input.bmg-input-quantity'));
};

const ensureBodyRowMarker = (row) => {
  if (row?.classList && !row.classList.contains(BODY_ROW_MARKER)) {
    row.classList.add(BODY_ROW_MARKER);
  }
};

const ensureHeaderRowMarker = (row) => {
  if (row?.classList && !row.classList.contains(HEADER_ROW_MARKER)) {
    row.classList.add(HEADER_ROW_MARKER);
  }
};

const ensureWrapperMarker = (wrapper) => {
  if (!wrapper?.classList || wrapper.classList.contains(WRAPPER_MARKER)) return;

  for (const cls of wrapper.classList) {
    if (cls.startsWith(`${WRAPPER_PREFIX}-`)) {
      wrapper.classList.add(WRAPPER_MARKER);
      return;
    }
  }
};

const getTableWrapper = () => {
  const wrapper = document.querySelector(`div[class*="${WRAPPER_PREFIX}"]`);
  ensureWrapperMarker(wrapper);
  return wrapper;
};

const markBodyRowsFromNodeList = (rows) => {
  for (let i = 0; i < rows.length; i += 1) {
    ensureBodyRowMarker(rows[i]);
  }
};

const markBmgTableElements = () => {
  const wrapper = getTableWrapper();
  const scope = wrapper || document;
  const headers = scope.querySelectorAll('div[class^="react-table-header-row"]');
  for (let i = 0; i < headers.length; i += 1) {
    ensureHeaderRowMarker(headers[i]);
  }
  const rows = scope.querySelectorAll(`div[class^="${BODY_ROW_PREFIX}"]`);
  markBodyRowsFromNodeList(rows);
};

const installBmgTableClassMarker = () => () => { };

const installCollapsibleHeaderMarker = installBmgTableClassMarker;
const markCollapsibleItemHeaders = markBmgTableElements;
const markReactTableBodyRows = markBmgTableElements;

const buildRowMetaList = (tableBodyRows, sharedData) => {
  const { productsWithDimensions, boxItems } = sharedData;

  return Array.from(tableBodyRows).map((row, lineItemIndex) => {
    const sellerSku = GetSku({ row });
    const quantity = row.querySelector('p[class*="quantity-text"]')?.textContent?.trim() ?? '';
    const matchingBoxItems = boxItems?.filter(
      (item) => boxItemMatchesLine(item, sellerSku, lineItemIndex)
    ) || [];
    const totalQuantityInBox = matchingBoxItems.reduce((total, b) => total + b.quantityInBox, 0);
    const orderQty = Number.parseInt(quantity, 10);
    const newQuantity = Number.isFinite(orderQty)
      ? Math.max(0, orderQty - totalQuantityInBox)
      : 'N/A';
    const productDim = productsWithDimensions?.find(({ shipStationSku: sku }) => sku === sellerSku);

    const imageContainer = row.querySelector('div[class*="item-image-container"]');
    const image = imageContainer?.querySelector('img');
    if (imageContainer && !image && productDim?.imageUrl) {
      imageContainer.classList.forEach((cls) => {
        if (cls.startsWith('empty-image')) {
          imageContainer.classList.remove(cls);
        }
      });
      imageContainer.innerHTML = '';
      renderIntoCell(imageContainer, <ShowImage src={productDim.imageUrl} alt={sellerSku} />);
    }

    return {
      sellerSku,
      quantity,
      matchingBoxItems,
      newQuantity,
      productDim
    };
  });
};

const AddOrUpdateColumn = ({
  tableHeaderRow,
  value,
  orderId,
  tableBodyRows,
  sharedData,
  rowMetaList
}) => {
  const columns = Array.from(tableHeaderRow.querySelectorAll('div[role="columnheader"]'));
  let columnIndex = columns.findIndex((column) => column.textContent === value);

  let headerCell;
  if (columnIndex === -1) {
    headerCell = document.createElement('div');
    headerCell.className = 'cell-QrqH_qU justify-center-Sy9d0em';
    headerCell.role = 'columnheader';
    headerCell.style = 'box-sizing: border-box; flex: 1 0 fit-content; min-width: 130px !important; width: fit-content;';
    headerCell.textContent = value;

    tableHeaderRow.appendChild(headerCell);
    columnIndex = columns.length;
  } else {
    headerCell = columns[columnIndex];
  }

  const columnId = COLUMN_VALUE_TO_ID[value];
  if (columnId && headerCell.id === columnId) return;

  const { packages } = sharedData;

  tableBodyRows.forEach((row, lineItemIndex) => {
    const rowCells = Array.from(row.querySelectorAll('div[role="cell"]'));
    let bodyCell;

    if (rowCells[columnIndex]) {
      bodyCell = rowCells[columnIndex];
    } else {
      bodyCell = document.createElement('div');
      row.querySelector('[role="row"]').appendChild(bodyCell);
    }

    bodyCell.className = 'cell-QrqH_qU justify-center-Sy9d0em';
    bodyCell.role = 'cell';
    bodyCell.style = 'box-sizing: border-box; flex: 1 0 130px; min-width: 130px; width: 130px;';

    const {
      sellerSku,
      quantity,
      matchingBoxItems,
      newQuantity,
      productDim
    } = rowMetaList[lineItemIndex];

    if (value === COLUMN_TYPE.ITEM_NAME) {
      headerCell.id = COLUMN_TYPE_ID.ITEM_NAME;

      headerCell.style.position = 'sticky';
      headerCell.style.left = '0px';
      headerCell.style.zIndex = '20';
      headerCell.style.setProperty('flex', '0 0 auto', 'important');
      headerCell.style.backgroundColor = '#f5f5f5';
      headerCell.style.boxShadow = '2px 0 4px rgba(0,0,0,0.1)';

      const itemNameCell = row.querySelector('div[role="cell"]:nth-child(1)');
      if (itemNameCell) {
        itemNameCell.style.position = 'sticky';
        itemNameCell.style.left = '0px';
        itemNameCell.style.padding = '16px';
        itemNameCell.style.zIndex = '10';
        itemNameCell.style.backgroundColor = '#ffffff';
        itemNameCell.style.boxShadow = '2px 0 4px rgba(0,0,0,0.1)';
      }
    } else if (value === COLUMN_TYPE.BATCH_SELECTION) {
      headerCell.id = COLUMN_TYPE_ID.BATCH_SELECTION;

      if (bodyCell.dataset.bmgBatch !== '1') {
        bodyCell.dataset.bmgBatch = '1';
        renderIntoCell(
          bodyCell,
          <BatchSelectionCheckbox orderId={orderId} sellerSku={sellerSku} />
        );
      }
    } else if (value === COLUMN_TYPE.REMAINING_QUANTITY) {
      headerCell.id = COLUMN_TYPE_ID.REMAINING_QUANTITY;

      if (!bodyCell.querySelector('.bmg-remaining-quantity-value')) {
        renderIntoCell(
          bodyCell,
          <QuantityBox
            orderId={orderId}
            sellerSku={sellerSku}
            lineItemIndex={lineItemIndex}
            newQuantity={newQuantity}
            updateRemainingQuantity={updateRemainingQuantity}
            updateBoxDetails={updateBoxDetails}
          />
        );
      }
    } else if (value === COLUMN_TYPE.DIMENSIONS) {
      headerCell.id = COLUMN_TYPE_ID.DIMENSIONS;

      const leftOffset = 150;
      headerCell.style.position = 'sticky';
      headerCell.style.left = `${leftOffset}px`;
      headerCell.style.zIndex = '19';
      headerCell.style.backgroundColor = '#f5f5f5';

      const product = productDim;

      if (bodyCell.dataset.bmgDimensions === '1') return;

      bodyCell.textContent = '';
      bodyCell.dataset.bmgDimensions = '1';
      const dimensionLines = product
        ? (() => {
          const { dimensions } = product;
          const {
            length,
            width,
            height,
            weight
          } = dimensions || {};
          return [
            `Length: ${length}in`,
            `Width: ${width}in`,
            `Height: ${height}in`,
            `Weight: ${weight}lbs`
          ];
        })()
        : ['N/A'];

      const wrapper = document.createElement('div');
      wrapper.style.marginTop = '6px';
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';

      dimensionLines.forEach((line) => {
        const p = document.createElement('p');
        p.textContent = line;
        p.style.fontSize = '14px';
        p.style.margin = '0px';
        wrapper.appendChild(p);
      });
      bodyCell.appendChild(wrapper);

      bodyCell.style.position = 'sticky';
      bodyCell.style.left = `${leftOffset}px`;
      bodyCell.style.zIndex = '9';
      bodyCell.style.minWidth = 'fit-content';
      bodyCell.style.width = 'fit-content';
      bodyCell.style.backgroundColor = '#ffffff';
    } else if (value === COLUMN_TYPE.BOX_QUANTITY) {
      headerCell.id = COLUMN_TYPE_ID.BOX_QUANTITY;

      if (!bodyCell.querySelector('input.bmg-input-quantity')) {
        renderIntoCell(
          bodyCell,
          <Input
            sellerSku={sellerSku}
            lineItemIndex={lineItemIndex}
            orderId={orderId}
            updateRemainingQuantity={updateRemainingQuantity}
            newQuantity={newQuantity === 'N/A' ? quantity : newQuantity}
            updateBoxDetails={updateBoxDetails}
          />
        );
      }
    } else if (value === COLUMN_TYPE.BOX_DETAILS) {
      headerCell.id = COLUMN_TYPE_ID.BOX_DETAILS;

      const relatedBoxes = matchingBoxItems
        .map((item) => ({ boxId: item.boxId, type: item.type }));

      const boxDetails = packages
        .map((b, originalIndex) => ({ ...b, originalIndex }))
        .filter((b) => relatedBoxes.some((rb) => rb.boxId === b.boxId && rb.type === b.type))
        .map((b) => `Box ${b.originalIndex + 1} (${startCase(b.type)})`);

      bodyCell.textContent = boxDetails.length > 0 ? boxDetails.join('\n') : 'N/A';
    } else if (value === COLUMN_TYPE.NO_BOX_REQUIRED) {
      headerCell.id = COLUMN_TYPE_ID.NO_BOX_REQUIRED;

      if (bodyCell.dataset.bmgNoBox !== '1') {
        bodyCell.dataset.bmgNoBox = '1';
        renderIntoCell(
          bodyCell,
          <NoBoxRequiredCheckbox sellerSku={sellerSku} orderId={orderId} />
        );
      }
    }
  });
};

const AddDataInTable = async ({ orderId, preloadedSharedData = null } = {}) => {
  if (!orderId) {
    orderId = GetOrderId();
  }
  const packages = await getLocal(`packages-${orderId}`) || [];

  const selectButtons = Array.from(document.querySelectorAll('section'));

  const selectButton = selectButtons[0];
  if (selectButton) {
    let container = selectButton.parentElement.querySelector('.batch-add-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'batch-add-container';
      container.style.marginTop = '8px';
      container.style.display = 'flex';
      container.style.justifyContent = 'flex-end';

      selectButton.parentElement.insertBefore(container, selectButton.nextSibling);
    }

    let root = reactRoots.get(container);
    if (!root) {
      root = createRoot(container);
      reactRoots.set(container, root);
    }

    root.render(
      <BatchAddToBoxButton
        key={orderId}
        orderId={orderId}
        boxDetails={packages}
        updateRemainingQuantity={updateRemainingQuantity}
        updateBoxDetails={updateBoxDetails}
      />
    );
  }

  getTableWrapper();

  const tableHeaderRow = document.querySelector('div[class^="react-table-header-row"');
  if (!tableHeaderRow) return;

  ensureHeaderRowMarker(tableHeaderRow);

  const tableBodyRows = document.querySelectorAll(`div[class^="${BODY_ROW_PREFIX}"]`);
  markBodyRowsFromNodeList(tableBodyRows);

  if (isTableFullyInjected(tableHeaderRow, tableBodyRows)) return;

  let sharedData = preloadedSharedData;
  if (!sharedData) {
    sharedData = await loadTableSharedData({ orderId, tableBodyRows });
  } else {
    // Ensure packages are updated with the latest from storage
    sharedData.packages = sortPackages([...(packages || [])]);
  }

  const rowMetaList = buildRowMetaList(tableBodyRows, sharedData);

  for (const value of COLUMN_LIST) {
    AddOrUpdateColumn({
      tableHeaderRow,
      value,
      orderId,
      tableBodyRows,
      sharedData,
      rowMetaList
    });
  }
};

export default AddDataInTable;
export {
  BODY_ROW_PREFIX,
  loadTableSharedData,
  markBmgTableElements,
  markCollapsibleItemHeaders,
  markReactTableBodyRows,
  installBmgTableClassMarker,
  installCollapsibleHeaderMarker
};
