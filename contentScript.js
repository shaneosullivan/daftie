let propertyMetadata = {};

function findCards() {
  const links = Array.from(
    document.querySelectorAll(
      '.PropertyCardContainer__container a.PropertyInformationCommonStyles__addressCopy--link'
    )
  );
  return links.map(link => {
    const rootNode = findParentByClass(link, 'PropertyCardContainer__container');
    const detailsNode = rootNode.querySelector(
      '.FeaturedCardPropertyInformation__detailsCopyContainer, .StandardPropertyInfo__detailsContainer, .StandardPropertyInfo__detailsContainerNoBranding'
    );
    const costNode = rootNode.querySelector('.PropertyInformationCommonStyles__costAmountCopy');
    let cost = costNode ? costNode.textContent.trim() : '';
    if (cost.indexOf('€') !== 0) {
      cost = null;
    }

    return {
      detailsNode,
      href: link.href,
      linkNode: link,
      rootNode,
      cost
    };
  });
}

function findParentByClass(node, cls) {
  while (node && node !== document.body) {
    if (node.classList.contains(cls)) {
      return node;
    }
    node = node.parentNode;
  }
  return null;
}

function addControls(cardInfo) {
  if (cardInfo.detailsNode.querySelector('daftmonkey-controls')) {
    // Already added
    return;
  }
  const metadata = getMetadata(cardInfo);

  const controls = `<div class="daftmonkey-controls">
      <button class="df-button df-hide" >${metadata.hidden ? 'Unhide' : 'Hide'}</button>
     </div>`;

  let priceInfo = '';
  if (metadata.costs && metadata.costs.length > 1) {
    const rows = metadata.costs.map(costInfo => {
      const date = new Date(Date.parse(costInfo.date));
      return `<tr>
        <td>${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}</td>
        <td>${costInfo.value}</td>
      </tr>`;
    });
    priceInfo = `
      <div class="df-price-history">
        <div class="df-price-history-header">Price History</div>
        <table class="df-price-history-list">
          <tbody>${rows.join('')}</tbody>
        </table>
      </div>`;
  }

  const frag = document.createElement('div');
  frag.innerHTML = priceInfo + controls;

  frag.querySelector('.df-hide').addEventListener('click', () => {
    hideCard(cardInfo);
  });

  cardInfo.detailsNode.appendChild(frag);
}

function hideCard(cardInfo) {
  const metadata = getMetadata(cardInfo);
  metadata.hidden = !metadata.hidden;
  hideCards();
  writeStorage();
}

function hideCards() {
  const cards = findCards();
  cards.forEach(cardInfo => {
    if (getMetadata(cardInfo).hidden === true) {
      cardInfo.rootNode.style.display = 'none';
    }
  });
}

function addChangeListener() {
  const cardContainer = document.querySelector('.sr_content');

  if (cardContainer) {
    // Options for the observer (which mutations to observe)
    var config = { attributes: false, childList: true, subtree: true };

    // Callback function to execute when mutations are observed
    var callback = function(mutationsList, observer) {
      initCards();
    };

    // Create an observer instance linked to the callback function
    var observer = new MutationObserver(callback);

    // Start observing the target node for configured mutations
    observer.observe(targetNode, config);
  }
}

function initCards() {
  const cards = findCards();
  cards.forEach(addControls);

  // Update the costs.
  let costsUpdated = false;
  cards.filter(cardInfo => !!cardInfo.cost).forEach(cardInfo => {
    const metadata = getMetadata(cardInfo);
    if (!metadata.costs) {
      metadata.costs = [];
    }
    if (cardInfo.cost && !metadata.costs.some(costInfo => costInfo.value === cardInfo.cost)) {
      metadata.costs.push({
        date: new Date().toISOString(),
        value: cardInfo.cost
      });
      costsUpdated = true;
    }
  });
  if (costsUpdated) {
    writeStorage();
  }
}

function getMetadata(cardInfo) {
  const key = getStorageKey(cardInfo);
  if (!propertyMetadata[key]) {
    propertyMetadata[key] = {};
  }
  return propertyMetadata[key];
}

function getStorageKey(cardInfo) {
  return `property:${cardInfo.href}`;
}

function readStorage(cards, callback) {
  const keys = cards.map(cardInfo => getStorageKey(cardInfo));
  chrome.storage.sync.get(keys, function(result) {
    propertyMetadata = result;
    callback && callback();
  });
}

function writeStorage(cards, callback) {
  const obj = {};
  Object.keys(propertyMetadata).forEach(key => {
    obj[key] = propertyMetadata[key];
  });
  chrome.storage.sync.set(obj, function() {
    callback && callback();
  });
}

readStorage(findCards(), () => {
  initCards();
  hideCards();
  addChangeListener();
});
