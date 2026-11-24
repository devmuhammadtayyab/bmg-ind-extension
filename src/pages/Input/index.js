import React, { useEffect, useState } from 'react';
import { Input, notification } from 'antd';
import isEmpty from 'lodash/isEmpty';

import Popover from './popover';
import ShowProgressBar from '../../Content/show-progress-bar';
import { ShowCreateShipmentButton } from '../../Content/need-to-show-create-shipment-button';

import '../../style.css';

import { API_ENDPOINTS, API_METHODS, FULFILMENT_CONFIG_API } from '../../utils/constants';
import {
  ExtractFulfillmentPlanId,
  ShowLoadingOnProgress,
  ShowLoadingOnTable,
  WaitForSelector,
  generateReplicaSkus,
  getLocal,
  getPackageIndexFromBoxId
} from '../../utils/helpers';
import { waitForBoxesSync } from '../../utils/boxes-sync';
import { boxItemMatchesLine, getMaxRemainingForSku } from '../../utils/order-quantity';
import { getShipmentItemsForOrder } from '../../utils/shipment-details';
import { getShipmentConfigCached } from '../../utils/shipment-config-cache';

const SaveInput = ({
  sellerSku,
  lineItemIndex,
  orderId,
  newQuantity,
  updateRemainingQuantity,
  updateBoxDetails
}) => {
  const [inputQuantity, setInputQuantity] = useState('');
  const [show, setShow] = useState(false);
  const [boxDetails, setBoxDetails] = useState([]);
  const [finalBox, setFinalBox] = useState({});
  const [remainingQuantity, setRemainingQuantity] = useState('');

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

  const SaveBoxItems = async () => {
    try {
      ShowLoadingOnProgress(true);
      ShowLoadingOnTable('div[class*="react-table-wrapper"]', true);

      return await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          url: API_ENDPOINTS.NON_SECURED_ROUTES.SAVE_BOX_ITEMS,
          method: API_METHODS.POST,
          data: { ...finalBox }
        }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            (async () => {
              const updatedQuantities = await updateRemainingQuantity({ orderId });
              const matchedSku = updatedQuantities.find(
                ({ sellerSku: sku, lineItemIndex: idx }) => (
                  sku === sellerSku && idx === lineItemIndex
                )
              );
              if (matchedSku) {
                const { remainingQuantity: rQuantity } = matchedSku;
                if (typeof rQuantity === 'number') {
                  const safeRemaining = Math.max(0, rQuantity);
                  setRemainingQuantity(safeRemaining);
                  setInputQuantity(safeRemaining === 0 ? '' : safeRemaining);
                }
                await updateBoxDetails({ orderId });
              }

              window.dispatchEvent(new CustomEvent('boxItemsUpdated', {
                detail: { orderId }
              }));

              ShowProgressBar();

              const selector = await WaitForSelector('div[class*="order-info-store-name-"] h4');
              if (selector && selector.textContent.includes('Amazon Vendor Central')) {
                await ShowCreateShipmentButton();
              }
            })();

            resolve(true);
          }
        });
      });
    } finally {
      ShowLoadingOnProgress(false);
      ShowLoadingOnTable('div[class*="react-table-wrapper"]', false);
    }
  };

  const handleBoxClick = async (boxDatax, boxIndex) => {
    try {
      ShowLoadingOnTable('div[class*="react-table-wrapper"]', true);
      await waitForBoxesSync();
    } catch {
      notification.error({
        message: 'Error',
        key: 'progress-error',
        description: 'Boxes are still syncing. Please wait and try again.'
      });
      return;
    } finally {
      ShowLoadingOnTable('div[class*="react-table-wrapper"]', false);
    }

    const { boxId, type, dimensions: boxDimensions } = boxDatax;
    const packageIndex = getPackageIndexFromBoxId(boxId);

    const productWithDimensions = await getLocal('productWithDimensions') || [];
    if (productWithDimensions.length === 0) {
      notification.error({
        message: 'Error',
        key: 'progress-error',
        description: 'Product dimensions is missing!'
      });

      return;
    }

    const shipmentConfig = await getShipmentConfigCached();

    const authHeader = await getLocal('authHeader');

    const shipmentItems = await getShipmentItemsForOrder(orderId);
    const boxItemsAll = await getLocal('boxItems') || [];

    const quantityFallbacks = [
      typeof newQuantity === 'number' ? newQuantity : null,
      inputQuantity
    ].filter((qty) => qty !== null && qty !== '' && qty !== 'N/A');

    const { maxRemaining } = getMaxRemainingForSku(
      sellerSku,
      shipmentItems,
      boxItemsAll,
      quantityFallbacks,
      lineItemIndex
    );

    const requestedQty = Number(inputQuantity);
    if (!Number.isFinite(requestedQty) || requestedQty <= 0) {
      notification.warning({
        message: 'Cannot add',
        key: 'bmg-invalid-qty',
        description: 'Enter a positive quantity before choosing a box.'
      });
      setShow(false);
      return;
    }

    if (maxRemaining <= 0) {
      notification.warning({
        message: 'Cannot add',
        key: 'bmg-no-remaining',
        description: 'No quantity remaining to add for this item.'
      });
      setShow(false);
      return;
    }

    const qtyToAdd = Math.min(requestedQty, maxRemaining);

    if (requestedQty > maxRemaining) {
      notification.warning({
        message: 'Quantity adjusted',
        key: 'progress-qty-clamp',
        description: `Only ${maxRemaining} unit(s) available; adding ${qtyToAdd} instead of ${requestedQty}.`
      });
    }

    const boxItems = boxItemsAll;
    const noBoxItems = await getLocal('noBoxItems') || [];

    const noBoxItemSkus = new Set(noBoxItems.map((item) => item.sellerSku));

    if (noBoxItemSkus.has(sellerSku)) {
      setFinalBox({
        boxId,
        type,
        sellerSku,
        lineItemIndex,
        quantityInBox: qtyToAdd
      });

      setInputQuantity('');
      setShow(false);

      return;
    }

    const itemsInThisBox = boxItems.filter((item) => item.boxId === boxId && item.type === type);

    const totalUsedVolume = itemsInThisBox.reduce((sum, item) => {
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

    const totalUsedWeight = itemsInThisBox.reduce((sum, item) => {
      const matchedProduct = productWithDimensions.find((p) => p.shipStationSku === item.sellerSku);
      if (!matchedProduct || !item.quantityInBox || !matchedProduct.dimensions.weight) return sum;

      return sum + (matchedProduct.dimensions.weight * item.quantityInBox);
    }, 0);

    if (productWithDimensions.length) {
      const skuVariants = generateReplicaSkus([sellerSku]);
      const product = productWithDimensions?.find(
        ({ shipStationSku: sku }) => skuVariants.includes(sku)
      );
      const box = boxItems?.find(
        ({ boxId: bId, ...item }) => bId === boxId && boxItemMatchesLine(item, sellerSku, lineItemIndex)
      );

      if (!product) {
        setInputQuantity('');
        setShow(false);

        notification.error({
          message: 'Error',
          key: 'progress-error',
          description: 'Product dimensions is missing!'
        });

        return;
      }

      let quantity = qtyToAdd;
      if (box?.quantityInBox) quantity += box.quantityInBox;

      if (product) {
        const { dimensions: productDimensions } = product;

        if (boxDimensions?.length && boxDimensions?.width && boxDimensions?.height) {
          const boxVolume = (boxDimensions.length * boxDimensions.width * boxDimensions.height);
          const itemVolume = (
            quantity
          * (
            productDimensions.length
            * productDimensions.width
            * productDimensions.height
          )
          );

          if (itemVolume + totalUsedVolume <= boxVolume) {
            const newItemWeight = qtyToAdd * productDimensions.weight;
            const totalWeightWithNewItem = totalUsedWeight + newItemWeight;

            if (totalWeightWithNewItem > 40) {
              notification.error({
                message: 'Error',
                key: 'progress-error',
                description: 'You cannot add this item to the box because the total box weight would exceed 40 pounds.'
              });
            } else {
              setFinalBox({
                boxId,
                type,
                sellerSku,
                lineItemIndex,
                quantityInBox: qtyToAdd
              });

              const pkg = packageIndex >= 0 ? shipmentConfig?.packages?.[packageIndex] : null;
              if (pkg && authHeader) {
                if (!pkg.weight) {
                  pkg.weight = { value: 0, unit: 'Ounces' };
                }
                const totalOunces = totalWeightWithNewItem * 16;
                pkg.weight.value = totalOunces;
                pkg.weight.unit = 'Ounces';

                await UpdateShipmentConfig({
                  authHeader,
                  requestBody: shipmentConfig
                });

                window.dispatchEvent(new CustomEvent('bmgPackageWeightUpdated', {
                  detail: {
                    packageIndex,
                    totalOunces
                  }
                }));
              }
            }
          } else {
            notification.error({
              message: 'Error',
              key: 'progress-error',
              description: `You cannot add this items to Selected Box because Item does not fit in the Box ${boxIndex}`
            });
          }

          setInputQuantity('');
          setShow(false);
        } else {
          notification.error({
            message: 'Error',
            key: 'progress-error',
            description: 'Box dimensions (length, width, and height) must all be greater than zero.'
          });
        }
      }
    }
  };

  const getBoxDetails = async () => {
    const packages = await getLocal(`packages-${orderId}`) || [];
    setBoxDetails(packages);
  };

  const checkRemainingQuantity = async () => {
    const boxItems = await getLocal('boxItems') || [];
    const shipmentItems = await getShipmentItemsForOrder(orderId);

    const { maxRemaining } = getMaxRemainingForSku(
      sellerSku,
      shipmentItems,
      boxItems,
      [typeof newQuantity === 'number' ? newQuantity : inputQuantity],
      lineItemIndex
    );

    setRemainingQuantity(maxRemaining);
  };

  useEffect(() => {
    getBoxDetails();
  }, []);

  useEffect(() => {
    const packagesKey = `packages-${orderId}`;

    const onStorageChange = (changes, area) => {
      if (area === 'local' && changes[packagesKey]) {
        getBoxDetails();
      }
    };

    const onBoxesSyncChanged = (event) => {
      if (event.detail?.syncing === false) {
        getBoxDetails();
      }
    };

    chrome.storage.onChanged.addListener(onStorageChange);
    window.addEventListener('bmgBoxesSyncChanged', onBoxesSyncChanged);

    return () => {
      chrome.storage.onChanged.removeListener(onStorageChange);
      window.removeEventListener('bmgBoxesSyncChanged', onBoxesSyncChanged);
    };
  }, [orderId]);

  useEffect(() => {
    checkRemainingQuantity();
  }, []);

  useEffect(() => {
    const onBoxItemsUpdated = (event) => {
      if (event.detail?.orderId === orderId) {
        checkRemainingQuantity();
      }
    };
    window.addEventListener('boxItemsUpdated', onBoxItemsUpdated);
    return () => window.removeEventListener('boxItemsUpdated', onBoxItemsUpdated);
  }, [orderId]);

  useEffect(() => {
    if (!isEmpty(finalBox)) {
      SaveBoxItems();
    }
  }, [finalBox]);

  useEffect(() => {
    if (typeof newQuantity === 'number' && Number.isFinite(newQuantity)) {
      setInputQuantity(newQuantity === 0 ? '' : newQuantity);
      setRemainingQuantity(newQuantity);
    } else if (newQuantity === 'N/A') {
      setInputQuantity('');
    }
  }, [newQuantity]);

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <Input
        value={inputQuantity}
        onChange={(e) => setInputQuantity(Number(e.target.value))}
        placeholder="Enter Quantity"
        style={{ marginRight: '8px' }}
        type="number"
        disabled={remainingQuantity !== '' && Number(remainingQuantity) <= 0}
        className="bmg-input-quantity"
      />
      <Popover
        boxDetails={boxDetails}
        show={show}
        setShow={setShow}
        btnDisable={inputQuantity === '' || Number(inputQuantity) <= 0}
        handleBoxClick={handleBoxClick}
        inputQuantity={inputQuantity}
        refreshBoxDetails={getBoxDetails}
      />
    </div>
  );
};

export default SaveInput;
