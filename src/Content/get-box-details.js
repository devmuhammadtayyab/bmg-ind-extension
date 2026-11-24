import axios from 'axios';
import round from 'lodash/round';

import {
  API_ENDPOINTS,
  API_METHODS,
  BOX_TYPE,
  ORDER_DETAILS_API
} from '../utils/constants';
import { setLocal } from '../utils/helpers';
import { scheduleSaveShipmentDetails } from '../utils/shipment-details';

const SaveBoxes = async ({ boxDetails }) => new Promise((resolve, reject) => {
  chrome.runtime.sendMessage({
    url: API_ENDPOINTS.NON_SECURED_ROUTES.SAVE_BOXES,
    method: API_METHODS.POST,
    data: { boxDetails }
  }, (response) => {
    if (chrome.runtime.lastError) {
      reject(chrome.runtime.lastError);
    } else {
      resolve(response?.message);
    }
  });
});

const GetBoxes = async ({ orderId }) => new Promise((resolve, reject) => {
  chrome.runtime.sendMessage({
    url: API_ENDPOINTS.NON_SECURED_ROUTES.GET_BOXES,
    method: API_METHODS.GET,
    params: { orderId }
  }, (response) => {
    if (chrome.runtime.lastError) {
      reject(chrome.runtime.lastError);
    } else {
      resolve(response?.boxes);
    }
  });
});

const GenerateBoxId = (currentId, orderNumber) => {
  currentId += 1;

  return `${orderNumber}-${currentId}`;
};

const GetBoxDetails = async (authHeader, orderId) => {
  const config = {
    method: API_METHODS.POST,
    url: ORDER_DETAILS_API,
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader
    },
    data: JSON.stringify([orderId])
  };

  let response = {};

  try {
    response = await axios.request(config);
  } catch (error) {
    response = await axios.request(config);
  }

  if (response?.data) {
    const { fulfillmentPlans = [], salesOrders = [] } = response.data || {};

    let orderNumber = '';
    let shipmentItems = [];
    let soldTo = {};
    let amountSummary = {};
    let orderDateTime = '';
    let shipByDateTime = '';
    if (salesOrders.length) {
      ([{
        orderNumber,
        orderDateTime,
        shipByDateTime,
        items: shipmentItems,
        soldTo,
        amountSummary
      }] = salesOrders);
    }

    if (salesOrders.length && orderId) {
      await setLocal('orderNumber', orderNumber);
      await setLocal('shipmentItems', shipmentItems);
    }

    if (fulfillmentPlans?.length) {
      let labelConfiguration = {};
      let fulfillmentPlanId = '';
      let notes = [];
      if (fulfillmentPlans.length > 1) {
        ({
          fulfillmentPlanId,
          labelConfiguration = {},
          notes = []
        } = fulfillmentPlans[fulfillmentPlans.length - 1]);
      } else {
        ([{
          fulfillmentPlanId,
          labelConfiguration = {},
          notes = []
        }] = fulfillmentPlans || []);
      }

      const socNumber = notes.find((note) => note.type === 'Internal')?.body || '';
      const shipmentDetailsPayload = {
        orderId,
        orderNumber,
        fulfillmentPlanId,
        orderDate: orderDateTime,
        shipDate: shipByDateTime,
        shipmentItems,
        soldTo,
        shipTos: labelConfiguration?.shipTo || {},
        amountSummary,
        socNumber
      };

      if (orderId) {
        scheduleSaveShipmentDetails(orderId, shipmentDetailsPayload);
      }

      if (labelConfiguration?.packages?.length && fulfillmentPlanId) {
        chrome.runtime.sendMessage({
          url: API_ENDPOINTS.NON_SECURED_ROUTES.SAVE_SHIPMENT_CONFIG,
          method: API_METHODS.POST,
          data: {
            fulfillmentPlanId,
            ...labelConfiguration
          }
        });
      }

      if (labelConfiguration?.packages?.[0]?.dimensions) {
        const boxes = labelConfiguration.packages.map((data, index) => {
          const {
            dimensions: {
              length = 0,
              width = 0,
              height = 0,
              unit: vUnit = ''
            } = {},
            weight: {
              value: weight = 0,
              unit: wUnit = ''
            } = {}
          } = data || {};

          let newLength = length;
          let newWidth = width;
          let newHeight = height;
          let newWeight = weight === 0 ? 40 : weight;
          if (vUnit === 'Centimeters') {
            newLength = round(length * 0.393701, 2);
            newWidth = round(width * 0.393701, 2);
            newHeight = round(height * 0.393701, 2);
          }

          if (weight !== 0 && wUnit === 'Ounces') {
            newWeight = round(weight * 0.0625, 2);
          }

          const convertedDimensions = {
            length: newLength,
            width: newWidth,
            height: newHeight,
            weight: newWeight
          };

          delete data.weight;

          return {
            ...data,
            orderId,
            boxId: GenerateBoxId(index, orderNumber),
            dimensions: convertedDimensions
          };
        });

        await SaveBoxes({ boxDetails: boxes });

        const newBoxes = await GetBoxes({ orderId });
        newBoxes.sort((a, b) => {
          if (a.type === BOX_TYPE.CUSTOM && b.type !== BOX_TYPE.CUSTOM) return 1;
          if (a.type !== BOX_TYPE.CUSTOM && b.type === BOX_TYPE.CUSTOM) return -1;

          return a.boxId.localeCompare(b.boxId, undefined, { numeric: true });
        });

        await setLocal('orderNumber', orderNumber);
        await setLocal(`packages-${orderId}`, newBoxes);
        await setLocal('shipmentItems', shipmentItems);
      } else {
        await setLocal(`packages-${orderId}`, []);
        await setLocal('shipmentItems', shipmentItems);
      }
    }
  }
};

export default GetBoxDetails;
