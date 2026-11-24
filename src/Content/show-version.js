import './show-version.css';

(() => {
  const version = chrome.runtime.getManifest().version;
  const BADGE_ID = 'bmg-extension-version';

  const ORDER_NAV_SELECTOR = 'div[class*="order-details-nav-bar-"] div[class*="nav-bar-actions-"]';
  const BATCH_WRAPPER_SELECTOR = 'div[class*="add-to-batch-wrapper-"]';

  const findOrderNavTarget = () => {
    const navActions = document.querySelector(ORDER_NAV_SELECTOR)
      || document.querySelector('div[class*="nav-bar-actions-"]');
    const batchWrapper = navActions?.querySelector(BATCH_WRAPPER_SELECTOR);

    if (!navActions || !batchWrapper) return null;

    return { navActions, insertBefore: batchWrapper };
  };

  const findMainNavTarget = () => {
    const appHeader = document.querySelector('div[class*="app-header-"]');
    if (!appHeader) return null;

    const ratesAnchor = [...appHeader.querySelectorAll('a, button')].find(
      (el) => el.textContent?.replace(/\s+/g, ' ').trim() === 'Rates'
    );
    if (ratesAnchor) return { type: 'after', anchor: ratesAnchor };

    const routesNav = appHeader.querySelector('div[class*="routes-"]:not([class*="routes-dropdown"])');
    return routesNav ? { type: 'append', anchor: routesNav } : null;
  };

  const createVersionBadge = (variantClass) => {
    const badge = document.createElement('span');
    badge.id = BADGE_ID;
    badge.className = `bmg-extension-version ${variantClass}`;
    badge.title = 'BMG extension version';
    badge.dataset.bmgVersion = version;

    const label = document.createElement('strong');
    label.className = 'bmg-extension-version__label';
    label.textContent = 'Extension Version:';

    const versionText = document.createElement('span');
    versionText.className = 'bmg-extension-version__number';
    versionText.textContent = version;

    badge.append(label, versionText);
    return badge;
  };

  const isOrderPlacementCorrect = (badge, target) => (
    badge?.dataset.bmgVersion === version
    && badge.parentElement === target.navActions
    && badge.nextElementSibling === target.insertBefore
  );

  const isMainPlacementCorrect = (badge, target) => {
    if (!badge || badge.dataset.bmgVersion !== version) return false;

    if (target.type === 'after') {
      return badge.previousElementSibling === target.anchor;
    }

    return badge.parentElement === target.anchor
      && badge === target.anchor.lastElementChild;
  };

  const injectVersion = () => {
    const orderTarget = findOrderNavTarget();

    if (orderTarget) {
      const existing = document.getElementById(BADGE_ID);
      if (isOrderPlacementCorrect(existing, orderTarget)) return;
      existing?.remove();

      orderTarget.navActions.insertBefore(
        createVersionBadge('bmg-extension-version--order'),
        orderTarget.insertBefore
      );
      return;
    }

    const mainTarget = findMainNavTarget();
    if (!mainTarget) return;

    const existing = document.getElementById(BADGE_ID);
    if (isMainPlacementCorrect(existing, mainTarget)) return;
    existing?.remove();

    const badge = createVersionBadge('bmg-extension-version--main');
    if (mainTarget.type === 'after') {
      mainTarget.anchor.insertAdjacentElement('afterend', badge);
    } else {
      mainTarget.anchor.appendChild(badge);
    }
  };

  injectVersion();

  new MutationObserver(injectVersion).observe(document.body, {
    childList: true,
    subtree: true
  });
})();
