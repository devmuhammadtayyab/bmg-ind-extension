/* eslint-disable jsx-a11y/control-has-associated-label */
import React, { useState, useEffect } from 'react';
import { Button, Spin } from 'antd';

import AddDataInTable from '../../Content/add-data-in-table';
import GetBoxDetails from '../../Content/get-box-details';
import ShowProgressBar from '../../Content/show-progress-bar';

import './show-box-modal.css';

import { API_ENDPOINTS, API_METHODS, BOX_TYPE } from '../../utils/constants';
import {
  GetOrderId,
  ShowLoadingOnProgress,
  ShowLoadingOnTable,
  Sleep,
  getLocal
} from '../../utils/helpers';

const ShowBoxModal = ({ showBoxModal, setShowBoxModal }) => {
  const [customBoxes, setCustomBoxes] = useState([]);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const handleDeleteBox = async ({ boxId }) => new Promise((resolve, reject) => {
    setLoading(true);

    chrome.runtime.sendMessage({
      url: API_ENDPOINTS.NON_SECURED_ROUTES.DELETE_BOXES,
      method: API_METHODS.DELETE,
      params: {
        boxIds: [boxId],
        type: BOX_TYPE.CUSTOM
      }
    }, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        setMessage(response?.message);
        setLoading(false);
        resolve(response?.message);
      }
    });
  });

  const handleKeyDown = (e) => {
    if (e.key === 'Escape' || e.key === 'Enter') {
      setShowBoxModal(false);
    }
  };

  const GetBoxes = async ({ orderId }) => new Promise((resolve, reject) => {
    setLoading(true);

    chrome.runtime.sendMessage({
      url: API_ENDPOINTS.NON_SECURED_ROUTES.GET_BOXES,
      method: API_METHODS.GET,
      params: { orderId }
    }, (response) => {
      if (chrome.runtime.lastError) {
        reject(chrome.runtime.lastError);
      } else {
        setLoading(false);
        resolve(response?.boxes);
      }
    });
  });

  const getBoxDetails = async () => {
    const orderId = GetOrderId();

    const newBoxes = await GetBoxes({ orderId });
    const cBoxes = newBoxes?.filter(({ type }) => type === BOX_TYPE.CUSTOM);

    setCustomBoxes(cBoxes?.length > 0 ? cBoxes : []);
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

  useEffect(() => {
    if (showBoxModal) {
      getBoxDetails();
    } else {
      setMessage('');
    }
  }, [message, showBoxModal]);

  useEffect(() => {
    if (message) {
      updateTable();
    }
  }, [message]);

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {showBoxModal && (
        <div
          className="custom-modal"
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
        >
          <div className="custom-show-modal-content">
            <h2>Custom Box</h2>
            <div className="set-overlay">
              {loading ? <Spin />
                : customBoxes?.length > 0 ? (
                  customBoxes?.map((box, index) => (
                    <div className="package-set">
                      <div className="package-container">
                        <div className="package" key={box.boxId}>
                          <div className="header">
                            <div className="title">
                              Package
                              {' '}
                              {index + 1}
                            </div>
                            <div className="links">
                              <button className="bmg-danger-link" type="button" onClick={() => handleDeleteBox({ boxId: box.boxId })}>Delete</button>
                            </div>
                          </div>
                          <section className="body">
                            <div className="row">
                              <label className="row-label" htmlFor="multi-package-size">Size</label>
                              <div>
                                <div className="dimensions">
                                  <div className="dimension" data-input-type="length">
                                    <div className="number-input">
                                      <input aria-label="length input" type="number" value={box.dimensions.length} readOnly />
                                    </div>
                                    <label>L(in)</label>
                                  </div>
                                  <div className="dimension" data-input-type="width">
                                    <div className="number-input">
                                      <input aria-label="width input" type="number" value={box.dimensions.width} readOnly />
                                    </div>
                                    <label>W(in)</label>
                                  </div>
                                  <div className="dimension" data-input-type="height">
                                    <div className="number-input">
                                      <input aria-label="height input" type="number" value={box.dimensions.height} readOnly />
                                    </div>
                                    <label>H(in)</label>
                                  </div>
                                  <div className="dimension" data-input-type="weight">
                                    <div className="number-input">
                                      <input aria-label="weight input" type="number" value={box.dimensions.weight} readOnly />
                                    </div>
                                    <label>W(lbs)</label>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </section>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="no-data-found">
                    <p>No Data Found</p>
                  </div>
                )}
            </div>
            <div className="modal-actions">
              <Button className="confirm-btn" onClick={() => setShowBoxModal(false)}>Ok</Button>
            </div>
          </div>
          <div
            className="custom-modal-backdrop"
            onClick={() => setShowBoxModal(false)}
            onKeyDown={handleKeyDown}
            role="button"
            tabIndex={0}
          />
        </div>
      )}
    </div>
  );
};

export default ShowBoxModal;
