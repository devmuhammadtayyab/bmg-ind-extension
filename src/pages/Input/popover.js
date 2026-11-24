import React, { useEffect, useState } from 'react';
import { Button, Dropdown, Menu, Spin } from 'antd';
import startCase from 'lodash/startCase';
import DownOutlined from '@ant-design/icons/DownOutlined';
import UpOutlined from '@ant-design/icons/UpOutlined';
import { BOX_TYPE } from '../../utils/constants';
import { subscribeBoxesSync, waitForBoxesSync } from '../../utils/boxes-sync';

const DropdownComponent = ({
  boxDetails,
  show,
  setShow,
  btnDisable,
  handleBoxClick,
  refreshBoxDetails
}) => {
  const [boxesSyncing, setBoxesSyncing] = useState(false);

  useEffect(() => subscribeBoxesSync(setBoxesSyncing), []);

  const sortedBoxes = [...boxDetails].sort((a, b) => {
    if (a.type === BOX_TYPE.CUSTOM && b.type !== BOX_TYPE.CUSTOM) return 1;
    if (a.type !== BOX_TYPE.CUSTOM && b.type === BOX_TYPE.CUSTOM) return -1;
    return a.boxId.localeCompare(b.boxId, undefined, { numeric: true });
  });

  const menu = (
    <Menu
      items={sortedBoxes.map((data, index) => ({
        key: data._id,
        label: `Add to Box ${index + 1} (${startCase(data.type)})`,
        onClick: async () => {
          await waitForBoxesSync();
          handleBoxClick(data, index + 1);
        }
      }))}
    />
  );

  const hasPackages = boxDetails?.length > 0;
  const isDropdownDisabled = btnDisable || boxesSyncing || !hasPackages;

  return (
    <Dropdown
      overlay={menu}
      trigger={['click']}
      open={show}
      transitionName=""
      onOpenChange={(visible) => {
        if (btnDisable || !hasPackages) return;
        setShow(visible);
      }}
      placement="bottom"
    >
      <Button disabled={isDropdownDisabled} className="bmg-add-quantity-dropdown">
        {boxesSyncing ? <Spin size="small" className="bmg-add-quantity-dropdown-spinner-pop" /> : (show ? <UpOutlined /> : <DownOutlined />)}
      </Button>
    </Dropdown>
  );
};

export default DropdownComponent;
