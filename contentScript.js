let propertyMetadata = {};

const globalControls = {
  hiddenEnabled: true
};

function refreshUI() {
  addGlobalControls();
  updateHiddenState();
}

function findCards() {
  const buyLinks = Array.from(
    document.querySelectorAll(
      "#sr_content .PropertyCardContainer__container a.PropertyInformationCommonStyles__addressCopy--link"
    )
  );
  const buyCards = buyLinks.map(link => {
    const rootNode = findParentByClass(
      link,
      "PropertyCardContainer__container"
    );
    const detailsNode = rootNode.querySelector(
      ".FeaturedCardPropertyInformation__detailsCopyContainer, .StandardPropertyInfo__detailsContainer, .StandardPropertyInfo__detailsContainerNoBranding"
    );
    const costNode = rootNode.querySelector(
      ".PropertyInformationCommonStyles__costAmountCopy"
    );
    let cost = costNode ? costNode.textContent.trim() : "";
    if (cost.indexOf("€") !== 0) {
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

  if (buyLinks.length > 0) {
    return buyCards;
  }

  const rentBoxes = Array.from(
    document.querySelectorAll("#sr_content td > .box")
  );

  const rentCards = rentBoxes.map(box => {
    const rootNode = box;
    const detailsNode = rootNode.querySelector(".text-block");
    const costNode = rootNode.querySelector(".info-box strong");
    const linkNode = rootNode.querySelector(".search_result_title_box h2 a");
    let cost = costNode ? costNode.textContent.trim() : "";
    if (cost.indexOf("€") !== 0) {
      cost = null;
    }

    return {
      detailsNode,
      href: linkNode.href,
      linkNode,
      rootNode,
      cost
    };
  });

  return rentCards;
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

function addGlobalControls() {
  const container = document.querySelector(".tabs-container .tabs-area");

  if (!container) {
    return;
  }

  const cls = "df-global-controls";
  const existingNode = document.querySelector(`.${cls}`);

  // Regenerate the controls each time.  It's simpler than fiddling with each
  // control's state
  if (existingNode) {
    existingNode.parentNode.removeChild(existingNode);
  }

  let hiddenCount = 0;
  Object.keys(propertyMetadata).forEach(key => {
    const cardMetadata = propertyMetadata[key];
    hiddenCount += !!cardMetadata.hidden ? 1 : 0;
  });

  const toggleHiddenButton = `<button class="df-button df-toggle-hidden" ${
    hiddenCount > 0 ? "" : 'disabled="true"'
  }>${
    globalControls.hiddenEnabled
      ? `Show ${hiddenCount} hidden`
      : `Hide ${hiddenCount}`
  }</button>`;

  const controls = `<div class="df-global-controls">
    ${toggleHiddenButton}
   </div>`;

  const frag = document.createElement("div");
  frag.innerHTML = controls;
  frag
    .querySelector(".df-toggle-hidden")
    .addEventListener("click", toggleHidden, false);

  container.appendChild(frag);
}

function addCardControls(cardInfo, force) {
  const existingNode = cardInfo.detailsNode.querySelector(".df-card-controls");
  if (existingNode) {
    // Already added
    if (force === true) {
      existingNode.parentNode.removeChild(existingNode);
      const priceInfoNode = cardInfo.detailsNode.querySelector(
        ".df-price-history"
      );
      if (priceInfoNode) {
        priceInfoNode.parentNode.removeChild(priceInfoNode);
      }
    } else {
      return;
    }
  }
  const metadata = getMetadata(cardInfo);

  const controls = `<div class="df-card-controls">
      <button class="df-button df-hide">${
        metadata.hidden ? "Unhide" : "Hide"
      }</button>
      <button class="df-button df-notes">Notes</button>
      <textarea class="df-notes-text${
        metadata.notes ? " shown" : ""
      }" rows="4" cols="80">${metadata.notes || ""}</textarea>
     </div>`;

  let priceInfo = "";
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
          <tbody>${rows.join("")}</tbody>
        </table>
      </div>`;
  }

  const frag = document.createElement("div");
  frag.innerHTML = priceInfo + controls;

  frag.querySelector(".df-hide").addEventListener("click", () => {
    toggleHideCard(cardInfo);
  });

  frag.querySelector(".df-notes").addEventListener("click", () => {
    toggleNotes(cardInfo);
  });

  frag.querySelector(".df-notes-text").addEventListener("change", evt => {
    saveNotes(cardInfo, evt.target.value);
  });

  cardInfo.detailsNode.appendChild(frag);
}

function toggleHidden() {
  globalControls.hiddenEnabled = !globalControls.hiddenEnabled;
  updateHiddenState();
  writeStorage();
  addGlobalControls();
}

function updateHiddenState() {
  document.body.classList[globalControls.hiddenEnabled ? "remove" : "add"](
    "df-hidden-disabled"
  );
}

function toggleHideCard(cardInfo) {
  const metadata = getMetadata(cardInfo);
  metadata.hidden = !metadata.hidden;
  hideCards();
  writeStorage();
  refreshUI();
  addCardControls(cardInfo, true);
}

function toggleNotes(cardInfo) {
  const textarea = cardInfo.detailsNode.querySelector(".df-notes-text");
  textarea.classList.toggle("shown");
}

function saveNotes(cardInfo, textValue) {
  const metadata = getMetadata(cardInfo);
  metadata.notes = textValue;
  writeStorage();
}

function hideCards() {
  const cards = findCards();
  cards.forEach(cardInfo => {
    cardInfo.rootNode.classList[
      getMetadata(cardInfo).hidden === true ? "add" : "remove"
    ]("df-hidden");
  });
}

function addChangeListener() {
  const cardContainer = document.querySelector(".sr_content");

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
  cards.forEach(cardInfo => addCardControls(cardInfo, false));

  // Update the costs.
  let costsUpdated = false;
  cards.filter(cardInfo => !!cardInfo.cost).forEach(cardInfo => {
    const metadata = getMetadata(cardInfo);
    if (!metadata.costs) {
      metadata.costs = [];
    }
    if (
      cardInfo.cost &&
      !metadata.costs.some(costInfo => costInfo.value === cardInfo.cost)
    ) {
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

function getGlobalControlKeys() {
  return Object.keys(globalControls).map(key => "globalControls." + key);
}

function readStorage(cards, callback) {
  const keys = cards.map(cardInfo => getStorageKey(cardInfo));
  let completeCount = 0;

  function possiblyCallback() {
    if (completeCount === 2) {
      callback && callback();
    }
  }

  chrome.storage.sync.get(keys, function(result) {
    propertyMetadata = result;
    completeCount++;

    possiblyCallback();
  });

  chrome.storage.sync.get(["global-controls"], function(result) {
    const storedGlobalControls = result && result["global-controls"];
    if (storedGlobalControls) {
      Object.keys(storedGlobalControls).forEach(key => {
        globalControls[key] = storedGlobalControls[key];
      });
    }
    completeCount++;

    possiblyCallback();
  });
}

function writeStorage(callback) {
  const obj = {};
  Object.keys(propertyMetadata).forEach(key => {
    obj[key] = propertyMetadata[key];
  });
  obj["global-controls"] = globalControls;

  chrome.storage.sync.set(obj, function() {
    callback && callback();
  });
}

function autoExpandPropertyDescription() {
  const node = document.querySelector(".ExpandMoreIndicator__expandLinkText");
  if (node) {
    node.click();
  }
}

readStorage(findCards(), () => {
  initCards();
  hideCards();
  refreshUI();
  autoExpandPropertyDescription();
  addChangeListener();
});
