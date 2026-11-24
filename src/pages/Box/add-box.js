import React, { useState } from 'react';
import { Button } from 'antd';

import AddBoxModal from './add-box-modal';
import ShowBoxModal from './show-box-modal';

const AddBox = () => {
  const [showAddBoxModal, setShowAddBoxModal] = useState(false);
  const [showBoxModal, setShowBoxModal] = useState(false);

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <Button
        style={{ marginRight: '8px' }}
        onClick={() => setShowAddBoxModal(true)}
      >
        Add Custom Box
      </Button>
      <Button
        onClick={() => setShowBoxModal(true)}
      >
        Show Custom Box
      </Button>
      <AddBoxModal
        showAddBoxModal={showAddBoxModal}
        setShowAddBoxModal={setShowAddBoxModal}
      />
      <ShowBoxModal
        showBoxModal={showBoxModal}
        setShowBoxModal={setShowBoxModal}
      />
    </div>
  );
};

export default AddBox;
