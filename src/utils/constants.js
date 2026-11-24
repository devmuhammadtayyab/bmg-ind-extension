const API_ENDPOINTS = {
  NON_SECURED_ROUTES: {
    ADD_CUSTOM_BOX: '/add-custom-box',
    DELETE_BOXES: '/delete-boxes',
    DOWNLOAD_BOX_DETAILS: '/download-box-details',
    GET_BOX_ITEMS: '/get-box-items',
    GET_BOXES: '/get-boxes',
    GET_NO_BOXES: '/get-no-boxes',
    GET_SHIPMENT_CONFIG: '/get-shipment-config',
    RESET_QUANTITY_IN_BOX: '/reset-quantity-in-box',
    SAVE_BOX_ITEMS: '/save-box-items',
    SAVE_BOXES: '/save-boxes',
    SAVE_NO_BOX_ITEMS: '/save-no-box-items',
    GET_PRODUCT_DIMENSIONS: '/get-product-dimensions',
    CREATE_SHIPMENT: '/create-shipment',
    SAVE_SHIPMENT_CONFIG: '/save-shipment-config',
    SAVE_SHIPMENT_DETAILS: '/save-shipment-details'
  }
};

const API_METHODS = {
  GET: 'GET',
  POST: 'POST',
  DELETE: 'DELETE'
};

const BOX_TYPE = {
  SHIP_STATION: 'shipstation',
  CUSTOM: 'custom'
};

const BOX_TYPE_LIST = {
  LARGE_BOX: 'Large Box'
};

const COLUMN_LIST = ['Item Name', 'Remaining Quantity', 'Dimensions', 'No Box Required', 'Box Details', 'Batch Selection', 'Box Quantity'];

const COLUMN_TYPE = {
  ITEM_NAME: 'Item Name',
  REMAINING_QUANTITY: 'Remaining Quantity',
  DIMENSIONS: 'Dimensions',
  NO_BOX_REQUIRED: 'No Box Required',
  BOX_DETAILS: 'Box Details',
  BATCH_SELECTION: 'Batch Selection',
  BOX_QUANTITY: 'Box Quantity'
};

const COLUMN_TYPE_ID = {
  ITEM_NAME: 'item_name',
  REMAINING_QUANTITY: 'remaining_quantity',
  DIMENSIONS: 'dimensions',
  NO_BOX_REQUIRED: 'no_box_required',
  BOX_DETAILS: 'box_details',
  BATCH_SELECTION: 'batch_selection',
  BOX_QUANTITY: 'box_quantity'
};

const FULFILMENT_CONFIG_API = 'https://ship6.shipstation.com/api/fulfillmentplan/saveconfig';

const ORDER_DETAILS_API = 'https://ship6.shipstation.com/api/bulkload/BySalesOrderIds';

const PACKAGE_TYPE_API = 'https://ship6.shipstation.com/api/seller/packagetypes';

const ORDER_DETAILS_URLS = [
  /^\/orders\/awaiting-shipment\/store\/[\w-]+\/order\/[\w-]+\/active\/\d+$/,
  /^\/orders\/awaiting-shipment\/order\/[\w-]+\/active\/\d+$/,
  /^\/orders\/all-orders-search-result\/order\/[\w-]+\/active\/\d+$/,
  /^\/orders\/all-orders-search-result\/store\/[\w-]+\/order\/[\w-]+\/active\/\d+$/ // ← new pattern added
];

const REASON_LIST = {
  INSTALL: 'install',
  UPDATE: 'update'
};

const STATUS_LIST = {
  COMPLETE: 'complete'
};

export {
  API_ENDPOINTS,
  API_METHODS,
  BOX_TYPE_LIST,
  BOX_TYPE,
  COLUMN_LIST,
  COLUMN_TYPE,
  COLUMN_TYPE_ID,
  FULFILMENT_CONFIG_API,
  ORDER_DETAILS_API,
  ORDER_DETAILS_URLS,
  PACKAGE_TYPE_API,
  REASON_LIST,
  STATUS_LIST
};
