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

  const notesFrag = document.createElement("div");
  notesFrag.innerHTML = `
    <div class="df-notes-container${metadata.notes ? " shown" : ""}">
      <div class="df-notes-inner">
        <textarea class="df-notes-text${
          metadata.notes ? " shown" : ""
        }" rows="3" cols="80" placeholder="Enter notes here">${metadata.notes ||
    ""}</textarea>
      </div>
    </div>`;
  cardInfo.rootNode.appendChild(notesFrag);

  cardInfo.rootNode
    .querySelector(".df-notes-text")
    .addEventListener("change", evt => {
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
  const textarea = cardInfo.rootNode.querySelector(".df-notes-container");
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

function getCardIndex(node) {
  const text = node
    .querySelector(".sr_counter")
    .textContent.split(".")
    .join("")
    .trim();
  return parseInt(text, 10);
}

function getPageLinks() {
  const nodes = document.querySelectorAll(
    ".paging li:not(.next_page):not(.prev_page) a"
  );
  return Array.from(nodes)
    .filter(node => {
      return node.textContent !== "...";
    })
    .map(node => {
      return { node, link: node.href };
    });
}

function prefetchPages() {
  const pageLinks = getPageLinks();
  const promises = pageLinks.map(({ node, link }) => {
    return fetch(link)
      .then(res => res.text())
      .then(html => sanitizeHtml(html))
      .then(html => extractPageContent(html));
  });

  Promise.all(promises).then(pages => {
    if (pages.length > 0) {
      const allCards = findCards();
      const cardWrapper = allCards[0].rootNode.parentNode;

      // const allScripts = [];
      // let pageScripts = "";
      const firstCardIndex = getCardIndex(allCards[0].rootNode);

      pages.forEach((pageInfo, idx) => {
        const { nodes, script } = pageInfo;
        nodes.forEach(node => {
          const index = getCardIndex(node);

          // Insert the nodes in the correct order.  If we landed on a page in
          // the middle of the list of pages somehow, but earlier pages before
          // the current page where appropriate.
          if (index < firstCardIndex) {
            cardWrapper.insertBefore(node, allCards[0].rootNode);
          } else {
            cardWrapper.appendChild(node);
          }
        });
        // pageScripts += script;

        // Chunk the script injection by page.  For some reason
        // (a race condition?) some images in later pages do not load
        // if (idx > 0 && (idx + 1) % 20 === 0) {
        //   allScripts.push(pageScripts);
        //   pageScripts = "";
        // }
      });

      // if (pageScripts) {
      //   allScripts.push(pageScripts);
      // }

      // const interval = setInterval(() => {
      //   if (allScripts.length > 0) {
      //     const scriptContent = allScripts.shift();
      //
      //     // Avoid inserting too many scripts on the page.  At least in older
      //     // browsers there was an annoying limit (39?) of how many you could
      //     // insert dynamically.  Call me old fashioned, but let's clean up...
      //     const existingScriptNode = document.getElementById("df-script");
      //     if (existingScriptNode) {
      //       existingScriptNode.parentNode.removeChild(existingScriptNode);
      //     }
      //
      //     // Make a new script node
      //     const scriptNode = document.createElement("script");
      //     scriptNode.setAttribute("id", "df-script");
      //     scriptNode.setAttribute("type", "text/javascript");
      //     scriptNode.textContent = scriptContent;
      //     document.body.appendChild(scriptNode);
      //   } else {
      //     console.log("clearning interval");
      //     clearInterval(interval);
      //   }
      // }, 500);

      // Set an interval go through the lazily loaded images and add their
      // images bit by bit
      const interval = setInterval(() => {
        const lazyImages = Array.from(
          document.querySelectorAll("img.lazy[data-original]")
        );

        let counter = 0;
        if (lazyImages.length > 0) {
          lazyImages.some((img, idx) => {
            const url = img.getAttribute("data-original");
            if (url) {
              img.src = url;
              // Remove the data-original attribute so this node doesn't show up
              // in the query any more
              img.removeAttribute("data-original");
              counter++;
            }
            return counter > 10;
          });
        }

        if (counter === 0) {
          // If we didn't process any nodes, we're done!
          clearInterval(interval);
        }
      }, 1000);

      // Move the paging node back to the bottom
      const pagingNode = document.querySelector("ul.paging");
      pagingNode.parentNode.appendChild(pagingNode);

      const prevLink = pagingNode.querySelector("li.prev_page + li a");
      const nextLinkOld = pagingNode.querySelector("li.next_page");
      const nextLink = nextLinkOld
        ? nextLinkOld.previousElementSibling.querySelector("a")
        : null;

      if (prevLink && prevLink.textContent === "...") {
        prevLink.textContent = "Previous";
        prevLink.parentNode.style.display = "inline-block";
      }
      if (nextLink && nextLink.textContent === "...") {
        nextLink.textContent = "Next";
        nextLink.parentNode.style.display = "inline-block";
      }
    }
  });
}

function sanitizeHtml(html) {
  return html
    .split("<script")
    .join("<notscript")
    .split("</script")
    .join("</notscript");
}

function extractPageContent(html) {
  // Find the body tag
  const bodyStartIdx = html.indexOf("<body");
  const bodyEndIdx = html.indexOf("</body");
  const bodyOuterContent = html.substring(bodyStartIdx, bodyEndIdx);
  const bodyContent = bodyOuterContent.substring(
    bodyOuterContent.indexOf(">") + 1
  );
  const frag = document.createElement("div");
  frag.innerHTML = bodyContent;

  let buyCards = frag.querySelectorAll(".PropertyCardContainer__container");
  let cards = [];
  if (buyCards.length > 0) {
    cards = Array.from(buyCards);
  } else {
    let rentCards = frag.querySelectorAll("#sr_content .box");
    cards = Array.from(rentCards);
  }

  let script = "";
  cards.forEach(node => {
    const scriptNode = node.nextElementSibling;

    // We have to collect the contents of the script tags that follow each
    // card, as they initialize the image for the card.  Weird how they don't
    // just output that in the html, but here we are....
    if (scriptNode.tagName.toLowerCase() === "notscript") {
      script += scriptNode.textContent;
    }
  });

  return {
    nodes: cards,
    script: script
  };
}

readStorage(findCards(), () => {
  initCards();
  hideCards();
  refreshUI();
  autoExpandPropertyDescription();
  addChangeListener();
  prefetchPages();
});
