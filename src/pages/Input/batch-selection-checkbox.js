import React, { useState, useEffect } from 'react';
import { Checkbox } from 'antd';
import {
  getLocal, getWithCache, setLocal, ShowLoadingOnTable
} from '../../utils/helpers';
import { API_ENDPOINTS, API_METHODS } from '../../utils/constants';
import { getMaxRemainingForSku, skuMatches } from '../../utils/order-quantity';
import { getShipmentItemsForOrder } from '../../utils/shipment-details';

const BatchSelectionCheckbox = ({ orderId, sellerSku }) => {
  const [isSelected, setIsSelected] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);

  useEffect(() => {
    const loadSelectionAndStatus = async () => {
      const selectedItems = await getLocal(`batchSelectedItems-${orderId}`) || [];
      setIsSelected(selectedItems.some((sku) => skuMatches(sku, sellerSku)));

      const shipmentItems = await getShipmentItemsForOrder(orderId);
      const boxItems = await getLocal(`boxItems-${orderId}`) || [];
      const { maxRemaining } = getMaxRemainingForSku(sellerSku, shipmentItems, boxItems);

      setIsDisabled(maxRemaining <= 0);
      if (maxRemaining <= 0) {
        setIsSelected(false);
      }
    };
    loadSelectionAndStatus();

    const handleClearSelections = async (event) => {
      if (event.detail.orderId === orderId) {
        setIsSelected(false);
      }
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

    const handleBoxUpdate = async (event) => {
      if (event.detail.orderId === orderId) {
        ShowLoadingOnTable('div[class*="react-table-wrapper"]', true);

        const shipmentItems = await getShipmentItemsForOrder(orderId);
        const boxItems = await getWithCache(
          `boxItems-${orderId}`,
          () => GetBoxItems({ orderId }),
          7 * 1000
        );

        const { maxRemaining } = getMaxRemainingForSku(sellerSku, shipmentItems, boxItems);

        setIsDisabled(maxRemaining <= 0);

        if (maxRemaining <= 0) {
          const selectedItems = await getLocal(`batchSelectedItems-${orderId}`) || [];
          const newSelectedItems = selectedItems.filter((item) => !skuMatches(item, sellerSku));
          await setLocal(`batchSelectedItems-${orderId}`, newSelectedItems);
          setIsSelected(false);
        }

        ShowLoadingOnTable('div[class*="react-table-wrapper"]', false);
      }
    };

    const handleUpdateCheckboxStates = async (event) => {
      if (event.detail.orderId === orderId) {
        await handleBoxUpdate(event);
      }
    };

    const handleUpdateAllCheckboxes = async (event) => {
      if (event.detail.orderId !== orderId) return;

      const { selectedItems } = event.detail;
      const shipmentItems = await getShipmentItemsForOrder(orderId);
      const boxItems = await getLocal(`boxItems-${orderId}`) || [];
      const { maxRemaining } = getMaxRemainingForSku(sellerSku, shipmentItems, boxItems);

      if (maxRemaining <= 0) {
        setIsDisabled(true);
        setIsSelected(false);
        return;
      }

      setIsDisabled(false);
      setIsSelected(selectedItems.some((sku) => skuMatches(sku, sellerSku)));
    };

    const onShipmentDataReady = (changes, area) => {
      if (area === 'local' && (changes[`shipmentDetails-${orderId}`] || changes.shipmentItems)) {
        loadSelectionAndStatus();
      }
    };

    chrome.storage.onChanged.addListener(onShipmentDataReady);
    window.addEventListener('clearBatchSelections', handleClearSelections);
    window.addEventListener('boxItemsUpdated', handleBoxUpdate);
    window.addEventListener('updateCheckboxStates', handleUpdateCheckboxStates);
    window.addEventListener('updateAllCheckboxes', handleUpdateAllCheckboxes);

    return () => {
      window.removeEventListener('clearBatchSelections', handleClearSelections);
      window.removeEventListener('boxItemsUpdated', handleBoxUpdate);
      window.removeEventListener('updateCheckboxStates', handleUpdateCheckboxStates);
      window.removeEventListener('updateAllCheckboxes', handleUpdateAllCheckboxes);
      chrome.storage.onChanged.removeListener(onShipmentDataReady);
    };
  }, [orderId, sellerSku]);

  const handleSelectionChange = async (checked) => {
    const selectedItems = await getLocal(`batchSelectedItems-${orderId}`) || [];
    let newSelectedItems;

    if (checked) {
      newSelectedItems = [...selectedItems, sellerSku];
    } else {
      newSelectedItems = selectedItems.filter((item) => !skuMatches(item, sellerSku));
    }

    await setLocal(`batchSelectedItems-${orderId}`, newSelectedItems);
    setIsSelected(checked);

    window.dispatchEvent(new CustomEvent('batchSelectionChanged', {
      detail: { selectedCount: newSelectedItems.length }
    }));
  };

  return (
    <div style={{ textAlign: 'center', padding: '4px' }}>
      <Checkbox
        checked={isSelected && !isDisabled}
        disabled={isDisabled}
        onChange={(e) => handleSelectionChange(e.target.checked)}
        title={isDisabled ? 'Item already added to a box or no remaining quantity' : 'Select for batch addition'}
      />
    </div>
  );
};

export default BatchSelectionCheckbox;
