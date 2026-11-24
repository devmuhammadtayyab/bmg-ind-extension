import React, { useState, useEffect } from 'react';
import { Checkbox } from 'antd';

import { API_ENDPOINTS, API_METHODS } from '../../utils/constants';
import { getWithCache, ShowLoadingOnTable, setLocal } from '../../utils/helpers';

const NoBoxRequiredCheckbox = ({
  orderId,
  sellerSku
}) => {
  const [boxDetails, setBoxDetails] = useState([]);

  const GetNoBoxItems = async () => new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({
      url: API_ENDPOINTS.NON_SECURED_ROUTES.GET_NO_BOXES,
      method: API_METHODS.GET,
      params: { orderId }
    }, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        resolve(response?.noBoxItems);
      }
    });
  });

  const SaveNoBoxItem = async (needToSave) => {
    try {
      ShowLoadingOnTable('div[class*="react-table-wrapper"]', true);

      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({
          url: API_ENDPOINTS.NON_SECURED_ROUTES.SAVE_NO_BOX_ITEMS,
          method: API_METHODS.POST,
          data: { orderId, sellerSku, needToSave }
        }, (response) => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }

          if (response?.error || !response?.success) {
            reject(new Error(response?.error || 'Failed to save no-box item'));
            return;
          }

          GetNoBoxItems()
            .then(async (noBoxItems) => {
              setBoxDetails(noBoxItems);

              await setLocal('noBoxItems', noBoxItems);
              await setLocal(`noBoxItems-${orderId}`, noBoxItems);
              await setLocal(`noBoxItems-${orderId}_ts`, Date.now());

              resolve(true);
            })
            .catch(reject);
        });
      });
    } finally {
      ShowLoadingOnTable('div[class*="react-table-wrapper"]', false);
    }
  };

  const getBoxDetails = async () => {
    const noBoxItems = await getWithCache(
      `noBoxItems-${orderId}`,
      () => GetNoBoxItems(),
      15 * 1000
    );
    setBoxDetails(noBoxItems);

    await setLocal('noBoxItems', noBoxItems);
  };

  useEffect(() => {
    getBoxDetails();
  }, []);

  return (
    <div>
      <Checkbox
        checked={boxDetails?.some((b) => b.orderId === orderId && b.sellerSku === sellerSku)}
        onChange={(e) => SaveNoBoxItem(e.target.checked)}
      />
    </div>
  );
};

export default NoBoxRequiredCheckbox;
