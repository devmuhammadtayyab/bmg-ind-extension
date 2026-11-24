import React from 'react';
import { Tooltip } from 'antd';

const ShowImage = ({ src, alt }) => (
  <Tooltip
    placement="right"
    title={(
      <img
        src={src}
        alt={alt}
        style={{
          width: 200,
          height: 'auto',
          borderRadius: 6
        }}
      />
    )}
  >
    <img
      src={src}
      alt={alt}
      style={{
        width: 40,
        height: 40,
        cursor: 'pointer',
        borderRadius: 4,
        objectFit: 'cover'
      }}
    />
  </Tooltip>
);

export default ShowImage;
