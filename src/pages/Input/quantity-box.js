/* eslint-disable max-len */
import React, { useState, useEffect } from 'react';
import {
  Button,
  Modal,
  Tooltip,
  Dropdown,
  Menu
} from 'antd';
import startCase from 'lodash/startCase';
import UndoOutlined from '@ant-design/icons/UndoOutlined';

import ShowProgressBar from '../../Content/show-progress-bar';
import { ShowCreateShipmentButton } from '../../Content/need-to-show-create-shipment-button';

import {
  API_ENDPOINTS,
  API_METHODS,
  BOX_TYPE,
  FULFILMENT_CONFIG_API
} from '../../utils/constants';
import {
  ExtractFulfillmentPlanId,
  ShowLoadingOnProgress,
  ShowLoadingOnTable,
  WaitForSelector,
  getLocal,
  getPackageIndexFromBoxId
} from '../../utils/helpers';
import { boxItemMatchesLine } from '../../utils/order-quantity';
import { getShipmentConfigCached } from '../../utils/shipment-config-cache';

const QuantityBox = ({
  orderId,
  sellerSku,
  lineItemIndex,
  newQuantity,
  updateRemainingQuantity,
  updateBoxDetails
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [show, setShow] = useState(false);
  const [boxDetails, setBoxDetails] = useState([]);
  const [selectedBox, setSelectedBox] = useState({});
  const [confirmLoading, setConfirmLoading] = useState(false);

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

  const ResetQuantityInBox = async ({ boxId, type }) => {
    try {
      ShowLoadingOnProgress(true);
      ShowLoadingOnTable('div[class*="react-table-wrapper"]', true);

      return await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          url: API_ENDPOINTS.NON_SECURED_ROUTES.RESET_QUANTITY_IN_BOX,
          method: API_METHODS.POST,
          data: { boxId, type, sellerSku, lineItemIndex }
        }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            (async () => {
              await updateRemainingQuantity({ orderId });

              await updateBoxDetails({ orderId });

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

  const handleBoxClick = async (data) => {
    setSelectedBox(data);
    setIsModalOpen(true);
    setShow(false);
  };

  const getBoxDetails = async () => {
    const packages = await getLocal(`packages-${orderId}`) || [];
    const boxItems = await getLocal('boxItems') || [];

    packages.sort((a, b) => {
      if (a.type === BOX_TYPE.CUSTOM && b.type !== BOX_TYPE.CUSTOM) return 1;
      if (a.type !== BOX_TYPE.CUSTOM && b.type === BOX_TYPE.CUSTOM) return -1;

      return a.boxId.localeCompare(b.boxId, undefined, { numeric: true });
    });

    const relatedBoxes = boxItems
      .filter((item) => boxItemMatchesLine(item, sellerSku, lineItemIndex))
      .map((item) => ({ boxId: item.boxId, type: item.type }));

    const filteredPackages = packages
      .map((b, originalIndex) => ({ ...b, originalIndex }))
      .filter((b) => relatedBoxes.some((rb) => rb.boxId === b.boxId && rb.type === b.type));

    setBoxDetails(filteredPackages);
  };

  useEffect(() => {
    getBoxDetails();
  }, []);

  const handleOk = async () => {
    setConfirmLoading(true);
    try {
      await ResetQuantityInBox({ boxId: selectedBox.boxId, type: selectedBox.type });

      const boxItems = await new Promise((resolve, reject) => {
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

      const productWithDimensions = await getLocal('productWithDimensions') || [];
      const authHeader = await getLocal('authHeader');
      const shipmentConfig = await getShipmentConfigCached();

      const totalWeightLbs = boxItems
        .filter((item) => item.boxId === selectedBox.boxId && item.type === selectedBox.type)
        .reduce((sum, item) => {
          const product = productWithDimensions.find((p) => p.shipStationSku === item.sellerSku);
          if (!product?.dimensions?.weight || !item.quantityInBox) return sum;
          return sum + (product.dimensions.weight * item.quantityInBox);
        }, 0);

      const packageIndex = getPackageIndexFromBoxId(selectedBox.boxId);
      const pkg = packageIndex >= 0 ? shipmentConfig?.packages?.[packageIndex] : null;
      if (pkg && authHeader) {
        if (!pkg.weight) {
          pkg.weight = { value: 0, unit: 'Ounces' };
        }
        const totalOunces = totalWeightLbs * 16;
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

      setIsModalOpen(false);
      setSelectedBox({});
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleCancel = () => {
    if (confirmLoading) return;
    setIsModalOpen(false);
    setSelectedBox({});
  };

  const menu = (
    <Menu
      items={boxDetails.map((data) => ({
        key: data._id,
        label: `Reset Box ${data.originalIndex + 1} (${startCase(data.type)})`,
        onClick: () => handleBoxClick(data)
      }))}
    />
  );

  return (
    <>
      <div className="bmg-remaining-quantity">
        <p className="bmg-remaining-quantity-value">{newQuantity}</p>
        <Tooltip title="It will remove all quantity of that item from selected box.">
          <Dropdown
            overlay={menu}
            trigger={['click']}
            open={show}
            onOpenChange={(visible) => {
              setShow(visible);
              if (visible) {
                getBoxDetails();
              }
            }}
            placement="bottom"
          >
            <Button style={{ display: (newQuantity !== 'N/A') ? 'block' : 'none' }} className="bmg-reset-btn">
              <UndoOutlined />
            </Button>
          </Dropdown>
        </Tooltip>
      </div>
      <Modal
        title="Reset Remaining Quantity"
        open={isModalOpen}
        onOk={handleOk}
        onCancel={handleCancel}
        centered
        okButtonProps={{ loading: confirmLoading }}
        cancelButtonProps={{ disabled: confirmLoading }}
        maskClosable={!confirmLoading}
        closable={!confirmLoading}
      >
        <p className="text-center">
          Do you really want to reset remaining quantity? This
          action will not be undone.
        </p>
      </Modal>
    </>
  );
};

export default QuantityBox;
