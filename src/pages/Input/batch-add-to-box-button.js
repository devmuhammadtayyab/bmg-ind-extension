import React, { useState, useEffect } from 'react';
import {
  Checkbox, Button, Dropdown, Menu, notification
} from 'antd';
import DownOutlined from '@ant-design/icons/DownOutlined';
import PlusOutlined from '@ant-design/icons/PlusOutlined';
import startCase from 'lodash/startCase';
import {
  getLocal,
  setLocal,
  ExtractFulfillmentPlanId,
  ShowLoadingOnTable,
  getPackageIndexFromBoxId,
  generateReplicaSkus,
  getReplicaSku
} from '../../utils/helpers';
import { findShipmentItemBySku, skuMatches } from '../../utils/order-quantity';
import { getShipmentItemsForOrder } from '../../utils/shipment-details';
import { subscribeBoxesSync, waitForBoxesSync } from '../../utils/boxes-sync';
import GetBoxDetails from '../../Content/get-box-details';
import {
  BOX_TYPE, API_ENDPOINTS, API_METHODS, FULFILMENT_CONFIG_API
} from '../../utils/constants';
import { getShipmentConfigCached } from '../../utils/shipment-config-cache';

const BatchAddToBoxButton = ({
  orderId,
  boxDetails,
  updateRemainingQuantity,
  updateBoxDetails
}) => {
  const [selectedCount, setSelectedCount] = useState(0);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSelectAllChecked, setIsSelectAllChecked] = useState(false);
  const [isSelectAllIndeterminate, setIsSelectAllIndeterminate] = useState(false);
  const [boxesSyncing, setBoxesSyncing] = useState(false);
  const [openingDropdown, setOpeningDropdown] = useState(false);
  const [localBoxDetails, setLocalBoxDetails] = useState(boxDetails);

  useEffect(() => subscribeBoxesSync(setBoxesSyncing), []);

  const refreshBoxDetailsFromStorage = async () => {
    const packages = await getLocal(`packages-${orderId}`) || [];
    setLocalBoxDetails(packages);
    return packages;
  };

  const syncPackagesForDropdown = async () => {
    await waitForBoxesSync();
    let packages = await refreshBoxDetailsFromStorage();
    if (packages.length > 0) {
      return packages;
    }

    const authHeader = await getLocal('authHeader');
    if (!authHeader) {
      return packages;
    }

    await GetBoxDetails(authHeader, orderId);
    packages = await getLocal(`packages-${orderId}`) || [];
    setLocalBoxDetails(packages);
    return packages;
  };

  useEffect(() => {
    setLocalBoxDetails(boxDetails);
  }, [boxDetails]);

  useEffect(() => {
    const packagesKey = `packages-${orderId}`;

    const onStorageChange = (changes, area) => {
      if (area === 'local' && changes[packagesKey]) {
        refreshBoxDetailsFromStorage();
      }
    };

    const onBoxesSyncChanged = (event) => {
      if (event.detail?.syncing === false) {
        refreshBoxDetailsFromStorage();
      }
    };

    chrome.storage.onChanged.addListener(onStorageChange);
    window.addEventListener('bmgBoxesSyncChanged', onBoxesSyncChanged);

    return () => {
      chrome.storage.onChanged.removeListener(onStorageChange);
      window.removeEventListener('bmgBoxesSyncChanged', onBoxesSyncChanged);
    };
  }, [orderId]);

  const UpdateShipmentConfig = async ({
    authHeader,
    requestBody
  }) => new Promise((resolve, reject) => {
    const fulfillmentPlanId = ExtractFulfillmentPlanId();

    chrome.runtime.sendMessage({
      url: `${FULFILMENT_CONFIG_API}/${fulfillmentPlanId}`,
      method: API_METHODS.POST,
      data: requestBody,
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader
      }
    }, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });

  const getEligibleSkus = async () => {
    const shipmentItems = await getShipmentItemsForOrder(orderId);
    const boxItems = await getLocal(`boxItems-${orderId}`) || [];
    const noBoxItems = await getLocal('noBoxItems') || [];
    const noBoxItemSkus = new Set(noBoxItems.map((item) => item.sellerSku));

    return shipmentItems
      .filter((item) => !noBoxItemSkus.has(item.sku))
      .filter((item) => {
        const totalQuantity = item.quantity || 0;
        const totalInBoxes = boxItems
          .filter((boxItem) => skuMatches(item.sku, boxItem.sellerSku))
          .reduce((total, boxItem) => total + boxItem.quantityInBox, 0);
        const remainingQuantity = totalQuantity - totalInBoxes;
        return remainingQuantity > 0;
      })
      .map((item) => item.sku);
  };

  const handleSelectAllChange = async (event) => {
    const { checked } = event.target;

    const eligibleItems = await getEligibleSkus();
    const selectedItems = checked ? eligibleItems : [];

    await setLocal(`batchSelectedItems-${orderId}`, selectedItems);
    setSelectedCount(selectedItems.length);
    setIsSelectAllChecked(checked);
    setIsSelectAllIndeterminate(false);

    window.dispatchEvent(new CustomEvent('batchSelectionChanged', {
      detail: { selectedCount: selectedItems.length }
    }));

    window.dispatchEvent(new CustomEvent('updateAllCheckboxes', {
      detail: {
        orderId,
        selectedItems,
        isSelectAll: checked
      }
    }));

    if (!checked) {
      window.dispatchEvent(new CustomEvent('clearBatchSelections', {
        detail: { orderId }
      }));
    }
  };

  useEffect(() => {
    const handleBatchSelectionChange = async (event) => {
      const eligibleSkus = await getEligibleSkus();
      const selectedItems = await getLocal(`batchSelectedItems-${orderId}`) || [];
      const prunedSelected = selectedItems.filter((sku) => eligibleSkus.includes(sku));

      if (prunedSelected.length !== selectedItems.length) {
        await setLocal(`batchSelectedItems-${orderId}`, prunedSelected);
      }

      setSelectedCount(prunedSelected.length);

      if (prunedSelected.length === 0) {
        setIsSelectAllChecked(false);
        setIsSelectAllIndeterminate(false);
      } else if (prunedSelected.length === eligibleSkus.length) {
        setIsSelectAllChecked(true);
        setIsSelectAllIndeterminate(false);
      } else {
        setIsSelectAllChecked(false);
        setIsSelectAllIndeterminate(true);
      }
    };

    window.addEventListener('batchSelectionChanged', handleBatchSelectionChange);

    const loadInitialCount = async () => {
      await handleBatchSelectionChange({});
    };
    loadInitialCount();

    return () => {
      window.removeEventListener('batchSelectionChanged', handleBatchSelectionChange);
    };
  }, [orderId]);

  const handleBatchBoxClick = async (boxData) => {
    try {
      ShowLoadingOnTable('div[class*="react-table-wrapper"]', true);
      await waitForBoxesSync();
    } catch {
      notification.error({
        message: 'Error',
        key: 'batch-sync-error',
        description: 'Boxes are still syncing. Please wait and try again.'
      });
      return;
    } finally {
      ShowLoadingOnTable('div[class*="react-table-wrapper"]', false);
    }

    const packages = await getLocal(`packages-${orderId}`) || [];
    const sortedBoxes = [...packages].sort((a, b) => {
      if (a.type === BOX_TYPE.CUSTOM && b.type !== BOX_TYPE.CUSTOM) return 1;
      if (a.type !== BOX_TYPE.CUSTOM && b.type === BOX_TYPE.CUSTOM) return -1;
      return a.boxId.localeCompare(b.boxId, undefined, { numeric: true });
    });
    const boxIndex = sortedBoxes.findIndex((box) => box._id === boxData._id) + 1;

    const selectedItems = await getLocal(`batchSelectedItems-${orderId}`) || [];

    if (selectedItems.length === 0) return;

    const boxItems = await getLocal(`boxItems-${orderId}`) || [];
    const shipmentItems = await getShipmentItemsForOrder(orderId);

    const remainingQuantities = {};
    selectedItems.forEach((sellerSku) => {
      const shipmentItem = findShipmentItemBySku(shipmentItems, sellerSku);
      const totalQuantity = shipmentItem?.quantity || 0;

      const skuVariants = generateReplicaSkus([getReplicaSku(sellerSku)]);
      const totalInBoxes = boxItems
        .filter((item) => skuVariants.includes(item.sellerSku))
        .reduce((total, item) => total + item.quantityInBox, 0);

      remainingQuantities[sellerSku] = totalQuantity - totalInBoxes;
    });

    const itemsToAdd = selectedItems.filter((sellerSku) => remainingQuantities[sellerSku] > 0);
    if (itemsToAdd.length === 0) return;

    const productWithDimensions = await getLocal('productWithDimensions') || [];
    if (productWithDimensions.length === 0) {
      notification.error({
        message: 'Error',
        key: 'batch-dimensions-error',
        description: 'Product dimensions is missing!'
      });
      return;
    }

    const authHeader = await getLocal('authHeader');

    const noBoxItems = await getLocal('noBoxItems') || [];
    const noBoxItemSkus = new Set(noBoxItems.map((item) => item.sellerSku));

    const itemsInThisBox = boxItems.filter(
      (item) => item.boxId === boxData.boxId && item.type === boxData.type
    );
    let totalUsedVolume = itemsInThisBox.reduce((sum, item) => {
      const matchedProduct = productWithDimensions.find((p) => p.shipStationSku === item.sellerSku);
      if (
        !matchedProduct
          || !item.quantityInBox
          || !matchedProduct.dimensions?.length
          || !matchedProduct.dimensions?.width
          || !matchedProduct.dimensions?.height
      ) return sum;

      const itemVolume = matchedProduct.dimensions.length
        * matchedProduct.dimensions.width
        * matchedProduct.dimensions.height;

      return sum + (itemVolume * item.quantityInBox);
    }, 0);

    let totalUsedWeight = itemsInThisBox.reduce((sum, item) => {
      const matchedProduct = productWithDimensions.find((p) => p.shipStationSku === item.sellerSku);
      if (!matchedProduct || !item.quantityInBox || !matchedProduct.dimensions.weight) return sum;

      return sum + (matchedProduct.dimensions.weight * item.quantityInBox);
    }, 0);

    await Promise.all(itemsToAdd.map(async (sellerSku) => {
      if (noBoxItemSkus.has(sellerSku)) {
        return;
      }

      const tableSku = getReplicaSku(sellerSku);
      const skuVariants = generateReplicaSkus([tableSku]);
      const product = productWithDimensions.find(
        ({ shipStationSku: sku }) => skuVariants.includes(sku)
      );
      if (!product) {
        notification.error({
          message: 'Error',
          key: `batch-product-${sellerSku}`,
          description: `Product dimensions missing for ${sellerSku}`
        });
        return;
      }

      const shipmentItem = findShipmentItemBySku(shipmentItems, sellerSku);
      const totalQuantity = shipmentItem?.quantity || '1';

      const currentBoxItems = await getLocal(`boxItems-${orderId}`) || [];
      const totalInBoxes = currentBoxItems
        .filter((item) => skuVariants.includes(item.sellerSku))
        .reduce((total, item) => total + item.quantityInBox, 0);

      const remainingQuantity = Number(totalQuantity) - totalInBoxes;

      if (remainingQuantity <= 0) {
        return;
      }

      const quantity = remainingQuantity.toString();
      const quantityNum = Number(quantity);

      if (Number.isNaN(quantityNum) || quantityNum <= 0) {
        return;
      }

      const existingBoxItem = boxItems.find((item) => item.boxId === boxData.boxId
        && item.type === boxData.type
        && skuVariants.includes(item.sellerSku));

      let finalQuantity = quantityNum;
      if (existingBoxItem?.quantityInBox) {
        finalQuantity += existingBoxItem.quantityInBox;
      }

      const { dimensions: boxDimensions } = boxData;
      const { dimensions: productDimensions } = product;

      if (!boxDimensions?.length || !boxDimensions?.width || !boxDimensions?.height) {
        notification.error({
          message: 'Error',
          key: 'batch-box-dimensions',
          description: 'Box dimensions are invalid'
        });
        return;
      }

      const boxVolume = (boxDimensions.length * boxDimensions.width * boxDimensions.height);
      const itemVolume = (finalQuantity * (
        productDimensions.length
        * productDimensions.width
        * productDimensions.height
      ));

      if (itemVolume + totalUsedVolume > boxVolume) {
        notification.error({
          message: 'Error',
          key: `batch-fit-${sellerSku}`,
          description: `Item ${sellerSku} does not fit in Box ${boxIndex}`
        });
        return;
      }

      const newItemWeight = quantityNum * productDimensions.weight;
      const totalWeightWithNewItem = totalUsedWeight + newItemWeight;

      if (totalWeightWithNewItem > 40) {
        notification.error({
          message: 'Error',
          key: `batch-weight-${sellerSku}`,
          description: `Item ${sellerSku} would exceed weight limit for Box ${boxIndex}`
        });
        return;
      }

      try {
        await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage({
            url: API_ENDPOINTS.NON_SECURED_ROUTES.SAVE_BOX_ITEMS,
            method: API_METHODS.POST,
            data: {
              orderId,
              boxId: boxData.boxId,
              type: boxData.type,
              sellerSku: tableSku,
              quantityInBox: quantityNum
            }
          }, (response) => {
            if (chrome.runtime.lastError) {
              reject(chrome.runtime.lastError);
            } else {
              resolve(response);
            }
          });
        });

        totalUsedVolume += itemVolume;
        totalUsedWeight += (quantityNum * productDimensions.weight);
      } catch (error) {
        notification.error({
          message: 'Error',
          key: `batch-add-${sellerSku}`,
          description: `Error adding item ${sellerSku} to box`
        });
      }
    }));

    if (authHeader) {
      const freshBoxItems = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          url: API_ENDPOINTS.NON_SECURED_ROUTES.GET_BOX_ITEMS,
          method: API_METHODS.GET,
          params: { orderId }
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(response?.boxItems || []);
          }
        });
      });

      const totalWeightLbs = freshBoxItems
        .filter((item) => item.boxId === boxData.boxId && item.type === boxData.type)
        .reduce((sum, item) => {
          const matchedProduct = productWithDimensions.find(
            (p) => p.shipStationSku === item.sellerSku
          );
          if (!matchedProduct || !item.quantityInBox || !matchedProduct.dimensions?.weight) {
            return sum;
          }
          return sum + (matchedProduct.dimensions.weight * item.quantityInBox);
        }, 0);

      const freshShipmentConfig = await getShipmentConfigCached();
      const packageIndex = getPackageIndexFromBoxId(boxData.boxId);
      const pkg = packageIndex >= 0 ? freshShipmentConfig?.packages?.[packageIndex] : null;

      if (pkg) {
        if (!pkg.weight) {
          pkg.weight = { value: 0, unit: 'Ounces' };
        }
        const totalOunces = totalWeightLbs * 16;
        pkg.weight.value = totalOunces;
        pkg.weight.unit = 'Ounces';

        await UpdateShipmentConfig({
          authHeader,
          requestBody: freshShipmentConfig
        });

        window.dispatchEvent(new CustomEvent('bmgPackageWeightUpdated', {
          detail: {
            packageIndex,
            totalOunces
          }
        }));
      }
    }

    await setLocal(`batchSelectedItems-${orderId}`, []);
    setSelectedCount(0);
    setShowDropdown(false);

    window.dispatchEvent(new CustomEvent('clearBatchSelections', {
      detail: { orderId }
    }));

    window.dispatchEvent(new CustomEvent('boxItemsUpdated', {
      detail: { orderId }
    }));

    window.dispatchEvent(new CustomEvent('updateCheckboxStates', {
      detail: { orderId }
    }));
    setIsSelectAllChecked(false);
    setTimeout(() => {
      updateRemainingQuantity({ orderId });
      updateBoxDetails({ orderId });
    }, 500);
  };

  const sortedBoxes = [...localBoxDetails].sort((a, b) => {
    if (a.type === BOX_TYPE.CUSTOM && b.type !== BOX_TYPE.CUSTOM) return 1;
    if (a.type !== BOX_TYPE.CUSTOM && b.type === BOX_TYPE.CUSTOM) return -1;
    return a.boxId.localeCompare(b.boxId, undefined, { numeric: true });
  });

  const menu = (
    <Menu
      items={sortedBoxes.map((data, index) => ({
        key: data._id,
        label: `Add ${selectedCount} item${
          selectedCount !== 1 ? 's' : ''
        } to Box ${index + 1} (${startCase(data.type)})`,
        onClick: async () => {
          await waitForBoxesSync();
          handleBatchBoxClick(data);
        }
      }))}
    />
  );

  return (
    <div style={{
      padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '8px'
    }}
    >
      <Checkbox
        checked={isSelectAllChecked}
        indeterminate={isSelectAllIndeterminate}
        onChange={handleSelectAllChange}
        style={{ marginRight: '8px' }}
      />
      <Dropdown
        overlay={menu}
        trigger={['click']}
        open={showDropdown}
        onOpenChange={async (visible) => {
          if (!visible) {
            setShowDropdown(false);
            return;
          }
          if (selectedCount === 0) return;
          setOpeningDropdown(true);
          try {
            const packages = await syncPackagesForDropdown();
            if (!packages.length) {
              setShowDropdown(false);
              return;
            }
            setShowDropdown(true);
          } catch {
            setShowDropdown(false);
          } finally {
            setOpeningDropdown(false);
          }
        }}
        placement="bottom"
        disabled={selectedCount === 0 || boxesSyncing || openingDropdown}
      >
        <Button
          type="primary"
          icon={<PlusOutlined />}
          disabled={selectedCount === 0 || boxesSyncing || openingDropdown}
          loading={boxesSyncing || openingDropdown}
          style={{
            fontSize: '12px',
            height: '28px',
            padding: '0 8px'
          }}
        >
          Add
          {' '}
          {selectedCount}
          {' '}
          to Box
          <DownOutlined style={{ marginLeft: '4px' }} />
        </Button>
      </Dropdown>
    </div>
  );
};

export default BatchAddToBoxButton;
