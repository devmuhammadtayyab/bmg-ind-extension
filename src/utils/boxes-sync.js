import { getLocal } from './helpers';

export const BOXES_SYNC_IN_PROGRESS_KEY = 'boxesSyncInProgress';

export const isBoxesSyncInProgress = async () => Boolean(await getLocal(BOXES_SYNC_IN_PROGRESS_KEY));

export const waitForBoxesSync = async ({ timeoutMs = 60000, intervalMs = 100 } = {}) => {
  const deadline = Date.now() + timeoutMs;

  while (await isBoxesSyncInProgress()) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for boxes to sync');
    }
    await new Promise((resolve) => {
      setTimeout(resolve, intervalMs);
    });
  }
};

export const subscribeBoxesSync = (callback) => {
  const onStorageChange = (changes, area) => {
    if (area === 'local' && changes[BOXES_SYNC_IN_PROGRESS_KEY]) {
      callback(Boolean(changes[BOXES_SYNC_IN_PROGRESS_KEY].newValue));
    }
  };

  chrome.storage.onChanged.addListener(onStorageChange);
  isBoxesSyncInProgress().then(callback);

  return () => {
    chrome.storage.onChanged.removeListener(onStorageChange);
  };
};
