import React from 'react';
import { Progress } from 'antd';

const ProgressComponent = ({ percentage }) => (
  <Progress className="bmg-progress" percent={percentage} />
);

export default ProgressComponent;
