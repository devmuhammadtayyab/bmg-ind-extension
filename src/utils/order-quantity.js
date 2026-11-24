import { generateReplicaSkus } from './helpers';

const parsePositiveInt = (value) => {
  const qty = Number.parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(qty) && qty >= 0 ? qty : null;
};

export const skuMatches = (skuA, skuB) => {
  const variantsA = new Set(generateReplicaSkus([skuA]));
  return generateReplicaSkus([skuB]).some((variant) => variantsA.has(variant));
};

export const boxItemMatchesLine = (item, sellerSku, lineItemIndex) => {
  if (!skuMatches(sellerSku, item.sellerSku)) return false;
  if (typeof item.lineItemIndex === 'number') {
    return item.lineItemIndex === lineItemIndex;
  }
  return true;
};

export const findShipmentItemBySku = (shipmentItems, sellerSku) => (
  shipmentItems?.find((item) => skuMatches(sellerSku, item.sku)) ?? null
);

export const resolveOrderLineQuantity = (
  sellerSku,
  shipmentItems,
  fallbacks = [],
  lineItemIndex
) => {
  let sItem = null;
  if (
    typeof lineItemIndex === 'number'
    && shipmentItems?.[lineItemIndex]
    && skuMatches(sellerSku, shipmentItems[lineItemIndex].sku)
  ) {
    sItem = shipmentItems[lineItemIndex];
  } else {
    sItem = findShipmentItemBySku(shipmentItems, sellerSku);
  }

  const fromShipment = parsePositiveInt(sItem?.quantity);
  if (fromShipment != null) return fromShipment;

  const fallbackList = Array.isArray(fallbacks) ? fallbacks : [fallbacks];
  for (const fallback of fallbackList) {
    const parsed = parsePositiveInt(fallback);
    if (parsed != null) return parsed;
  }

  return null;
};

export const getMaxRemainingForSku = (
  sellerSku,
  shipmentItems,
  boxItems,
  fallbacks = [],
  lineItemIndex
) => {
  const totalInBoxes = (boxItems || [])
    .filter((item) => boxItemMatchesLine(item, sellerSku, lineItemIndex))
    .reduce((sum, item) => sum + (Number(item.quantityInBox) || 0), 0);

  const orderQty = resolveOrderLineQuantity(
    sellerSku,
    shipmentItems,
    fallbacks,
    lineItemIndex
  );
  if (orderQty == null) {
    return { maxRemaining: 0, orderQty: null, totalInBoxes };
  }

  return {
    maxRemaining: Math.max(0, orderQty - totalInBoxes),
    orderQty,
    totalInBoxes
  };
};
