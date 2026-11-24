/* eslint-disable consistent-return */
/* eslint-disable jsx-a11y/control-has-associated-label */
import React, { useState } from 'react';
import DatePicker from 'react-datepicker';

import { Button, Select, notification } from 'antd';

import './add-box-modal.css';
import 'react-datepicker/dist/react-datepicker.css';

import { API_ENDPOINTS, API_METHODS } from '../../utils/constants';
import { getLocal } from '../../utils/helpers';

const { Option } = Select;

const AddBoxModal = ({ showCreateShipmentModal, setShowCreateShipmentModal }) => {
  const [startDate, setStartDate] = useState(new Date());
  const [selectedHour, setSelectedHour] = useState('09');
  const [selectedMinute, setSelectedMinute] = useState('00');

  const isValidBusinessDay = (date) => {
    const day = date.getDay();
    return day !== 0 && day !== 6;
  };

  const addBusinessDays = (date, days) => {
    let businessDaysAdded = 0;
    const result = new Date(date);
    while (businessDaysAdded < days) {
      result.setDate(result.getDate() + 1);
      if (isValidBusinessDay(result)) {
        businessDaysAdded += 1;
      }
    }

    return result;
  };

  const handleSaveBox = async () => {
    const orderNumber = await getLocal('orderNumber') || '';

    const dateTime = new Date(startDate);
    dateTime.setHours(selectedHour);
    dateTime.setMinutes(selectedMinute);

    const minPickupDate = addBusinessDays(new Date(), 2);

    if (dateTime < minPickupDate) {
      notification.error({
        message: 'Error',
        key: 'progress-error',
        description: 'The pickup date must be at least 2 business days from today.'
      });

      return;
    }

    const dateString = dateTime.toISOString();

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        url: API_ENDPOINTS.NON_SECURED_ROUTES.CREATE_SHIPMENT,
        method: API_METHODS.POST,
        data: {
          orderNumber,
          requestedPickupDate: dateString
        }
      }, async (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          if (response?.error) {
            notification.error({
              message: 'Error',
              key: 'progress-error',
              description: response.error
            });
          }
          setShowCreateShipmentModal(false);
          resolve(true);
        }
      });
    });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape' || e.key === 'Enter') {
      setShowCreateShipmentModal(false);
    }
  };

  const isButtonDisabled = !startDate
    || !selectedHour
    || !selectedMinute;

  const isWeekday = (date) => {
    const day = date.getDay();
    return day !== 0 && day !== 6;
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {showCreateShipmentModal && (
        <div
          className="custom-modal"
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
        >
          <div className="custom-modal-content">
            <h2>CreateShipment</h2>
            <p>Please select pickup date to create shipment:</p>
            <div className="date-wrapper">
              <DatePicker
                showIcon
                selected={startDate}
                onChange={(date) => setStartDate(date)}
                isClearable
                filterDate={isWeekday}
                placeholderText="Please select date!"
              />
              <Select
                value={selectedHour}
                onChange={setSelectedHour}
                style={{ width: 80 }}
                placeholder="Hour"
              >
                {Array.from({ length: 24 }, (_, i) => (
                  <Option key={i} value={i.toString().padStart(2, '0')}>
                    {i.toString().padStart(2, '0')}
                  </Option>
                ))}
              </Select>
              <Select
                value={selectedMinute}
                onChange={setSelectedMinute}
                style={{ width: 80 }}
                placeholder="Minute"
              >
                {Array.from({ length: 60 }, (_, i) => (
                  <Option key={i} value={i.toString().padStart(2, '0')}>
                    {i.toString().padStart(2, '0')}
                  </Option>
                ))}
              </Select>
            </div>
            <div className="modal-actions">
              <Button className="cancel-btn" onClick={() => setShowCreateShipmentModal(false)}>Cancel</Button>
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
            onClick={() => setShowCreateShipmentModal(false)}
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
