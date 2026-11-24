import round from 'lodash/round';

import { BOX_TYPE } from './constants';

const sortPackages = (packages) => [...packages].sort((a, b) => {
  if (!a.type && b.type) return 1;
  if (a.type && !b.type) return -1;
  if (!a.type && !b.type) return 0;

  if (a.type === BOX_TYPE.CUSTOM && b.type !== BOX_TYPE.CUSTOM) return 1;
  if (a.type !== BOX_TYPE.CUSTOM && b.type === BOX_TYPE.CUSTOM) return -1;

  return a.boxId.localeCompare(b.boxId, undefined, { numeric: true });
});

export const calculateOverallBoxFillPercentage = ({
  productWithDimensions,
  boxItems,
  noBoxItems = [],
  packages
}) => {
  const noBoxItemSkus = new Set(noBoxItems.map((item) => item.sellerSku));
  const sortedPackages = sortPackages(packages);

  let totalProductVolume = 0;
  let totalBoxVolume = 0;
  let maxBoxFillPercent = 0;

  sortedPackages.forEach((pkg) => {
    const { height, length, width } = pkg.dimensions || {};
    if (!height || !length || !width) return;

    const boxVolume = height * length * width;
    if (!boxVolume) return;

    let boxProductVolume = 0;
    const packageItems = boxItems.filter(
      ({
        boxId,
        type,
        sellerSku
      }) => boxId === pkg.boxId
        && type === pkg.type
        && !noBoxItemSkus.has(sellerSku)
    );

    packageItems.forEach((item) => {
      const product = productWithDimensions.find((p) => p.shipStationSku === item.sellerSku);
      if (product?.dimensions) {
        const { height: ph, length: pl, width: pw } = product.dimensions;
        if (ph && pl && pw) {
          boxProductVolume += ph * pl * pw * item.quantityInBox;
        }
      }
    });

    totalProductVolume += boxProductVolume;
    totalBoxVolume += boxVolume;
    maxBoxFillPercent = Math.max(maxBoxFillPercent, (boxProductVolume / boxVolume) * 100);
  });

  const percentage = totalBoxVolume
    ? round((totalProductVolume / totalBoxVolume) * 100, 2)
    : 0;

  return {
    percentage,
    isOverflow: maxBoxFillPercent > 100
  };
};
