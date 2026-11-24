/* eslint-disable jsx-a11y/control-has-associated-label */
import React, { useEffect, useState } from 'react';
import { Button, Input } from 'antd';

import AddDataInTable from '../../Content/add-data-in-table';
import GetBoxDetails from '../../Content/get-box-details';
import ShowProgressBar from '../../Content/show-progress-bar';

import './add-box-modal.css';

import {
  GetOrderId,
  ShowLoadingOnProgress,
  ShowLoadingOnTable,
  Sleep,
  getLocal
} from '../../utils/helpers';
import { API_ENDPOINTS, API_METHODS } from '../../utils/constants';

const AddBoxModal = ({ showAddBoxModal, setShowAddBoxModal }) => {
  const [boxDetails, setBoxDetails] = useState({});
  const [success, setSuccess] = useState(false);

  const handleDimensions = (key, value) => {
    setBoxDetails((prevDetails) => {
      const newDetails = { ...prevDetails };

      if (value === '' || value === null || value === undefined) {
        delete newDetails[key];
      } else {
        newDetails[key] = Number(value);
      }

      return newDetails;
    });
  };

  const handleSaveBox = async () => {
    setShowAddBoxModal(false);
    ShowLoadingOnProgress(true);
    ShowLoadingOnTable('div[class*="react-table-wrapper"]', true);

    const orderId = GetOrderId();
    const orderNumber = await getLocal('orderNumber') || '';

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        url: API_ENDPOINTS.NON_SECURED_ROUTES.ADD_CUSTOM_BOX,
        method: API_METHODS.POST,
        data: {
          orderId,
          orderNumber,
          ...boxDetails
        }
      }, async () => {
        if (chrome.runtime.lastError) {
          ShowLoadingOnProgress(false);
          ShowLoadingOnTable('div[class*="react-table-wrapper"]', false);

          reject(chrome.runtime.lastError);
        } else {
          setSuccess(true);

          resolve(true);
        }
      });
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape' || e.key === 'Enter') {
      setShowAddBoxModal(false);
    }
  };

  const updateTable = async () => {
    ShowLoadingOnProgress(true);
    ShowLoadingOnTable('div[class*="react-table-wrapper"]', true);

    const orderId = GetOrderId();
    const authHeader = await getLocal('authHeader');

    if (authHeader) {
      await GetBoxDetails(authHeader, orderId);

      ShowLoadingOnTable('div[class*="react-table-wrapper"]', false);

      await AddDataInTable({ orderId });

      await Sleep(2);

      ShowLoadingOnProgress(false);

      await ShowProgressBar();
    }
  };

  const isButtonDisabled = !boxDetails.length
    || !boxDetails.width
    || !boxDetails.height
    || !boxDetails.weight;

  useEffect(() => {
    if (success) {
      updateTable();

      setSuccess(false);
    }
  }, [success]);

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {showAddBoxModal && (
        <div
          className="custom-modal"
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
        >
          <div className="custom-modal-content">
            <h2>Add Custom Box</h2>
            <p>Add the dimensions of the custom box you want to add:</p>
            <div className="inputs-wrapper">
              <Input
                type="number"
                placeholder="Enter Length(in)"
                onChange={(e) => handleDimensions('length', e.target.value)}
              />
              <Input
                type="number"
                placeholder="Enter Width(in)"
                onChange={(e) => handleDimensions('width', e.target.value)}
              />
              <Input
                type="number"
                placeholder="Enter Height(in)"
                onChange={(e) => handleDimensions('height', e.target.value)}
              />
              <Input
                type="number"
                placeholder="Enter Weight(lbs)"
                onChange={(e) => handleDimensions('weight', e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <Button className="cancel-btn" onClick={() => setShowAddBoxModal(false)}>Cancel</Button>
              <Button
                onClick={() => handleSaveBox()}
                className={isButtonDisabled ? 'button-disabled' : 'save-btn'}
                disabled={isButtonDisabled}
              >
                Save
              </Button>
            </div>
          </div>
          <div
            className="custom-modal-backdrop"
            onClick={() => setShowAddBoxModal(false)}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
          />
        </div>
      )}
    </div>
  );
};

export default AddBoxModal;
