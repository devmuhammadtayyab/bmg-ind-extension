import React, { useState } from 'react';
import { Button } from 'antd';

import AddBoxModal from './add-box-modal';

const CreateShipment = () => {
  const [showCreateShipmentModal, setShowCreateShipmentModal] = useState(false);

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <Button
        style={{ marginRight: '8px' }}
        onClick={() => setShowCreateShipmentModal(true)}
      >
        Create Shipment
      </Button>
      <AddBoxModal
        showCreateShipmentModal={showCreateShipmentModal}
        setShowCreateShipmentModal={setShowCreateShipmentModal}
      />
    </div>
  );
};

export default CreateShipment;
