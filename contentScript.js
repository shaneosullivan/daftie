let propertyMetadata = {};
let hiddenCardsCount = 0;

const globalControls = {
  hiddenEnabled: true,
  hideList: [],
};

function refreshUI() {
  updateHiddenState();
}

function insertAfter(newNode, afterNode) {
  const sibling = afterNode.nextSibling;
  if (sibling) {
    afterNode.parentNode.insertBefore(newNode, sibling);
  } else {
    afterNode.parentNode.appendChild(newNode);
  }
}

function getTransactionType() {
  return window.location.href.indexOf("for-sale") > -1 ? "sale" : "rent";
}

/**
 * Finds and extracts property card information.
 *
 * This function searches the DOM for property listing cards and extracts relevant
 * information using data-testid and data-tracking attributes. It provides
 * a structured way to access property details including address, price, metadata,
 * and navigation elements.
 *
 * @returns {Array<Object>} Array of card objects with the following properties:
 *   @property {string} id - The property ID from the URL/data-testid
 *   @property {string} address - The property's full address text
 *   @property {string} href - The full URL to the property
 *   @property {Object} metadata - Property metadata
 *    @property {number} beds - Number of bedrooms (as integer)
 *    @property {number} baths - Number of bathrooms (as integer)
 *    @property {number} size - Property size in square meters (as integer)
 *    @property {string} type - Property type (e.g., "Detached", "Semi-D")
 *   @property {string} price - The property price text
 *   @property {Element} rootNode - Reference to the main card DOM element
 *   @property {Element} detailsNode - Reference to the details container DOM element
 *   @property {Element} linkNode - Reference to the main card link element
 *   @property {string} transactionType - Either "sale" or "rent" based on URL
 */
function findCards() {
  // Find all property cards using the consistent data-testid attribute
  const cardElements = Array.from(
    document.querySelectorAll('[data-testid^="result-"]')
  );

  const transactionType =
    window.location.href.indexOf("for-sale") > -1 ? "sale" : "rent";

  return cardElements.map((cardElement) => {
    const linkNode = cardElement.querySelector("a");
    const detailsContainer = cardElement.querySelector(
      '[data-testid="card-container"]'
    );
    const addressNode = cardElement.querySelector(
      '[data-tracking="srp_address"]'
    );
    const priceNode = cardElement.querySelector('[data-tracking="srp_price"]');
    const metadataNode = cardElement.querySelector(
      '[data-tracking="srp_meta"]'
    );

    // Extract property ID from either the data-testid or URL
    const id = cardElement.getAttribute("data-testid").split("-")[1];

    // Extract metadata from spans
    const metadataSpans = Array.from(
      metadataNode?.querySelectorAll("span") || []
    );

    /**
     *
     * @param {string} text
     * @returns {number}
     */
    function splitAndConvert(text) {
      return parseInt(text.split(" ")[0]);
    }

    const propertyMetadata = {
      beds: 0,
      baths: 0,
      size: 0,
      type: "",
    };

    for (let i = 0; i < metadataSpans.length; i++) {
      const span = metadataSpans[i];
      const text = span?.textContent || "";
      if (text.includes("Bed")) {
        propertyMetadata.beds = splitAndConvert(text);
      } else if (text.includes("Bath")) {
        propertyMetadata.baths = splitAndConvert(text);
      } else if (text.includes("m²")) {
        propertyMetadata.size = splitAndConvert(text);
      } else {
        propertyMetadata.type = text;
      }
    }

    return {
      id,
      address: addressNode?.textContent?.toLowerCase().trim() || "",
      href: linkNode?.href || "",
      metadata: propertyMetadata,
      price: priceNode?.textContent?.trim() || "",
      rootNode: cardElement,
      detailsNode: detailsContainer,
      linkNode: linkNode,
      transactionType,
    };
  });
}

function getPropertyId(cardInfo) {
  // Links look like
  // https://www.daft.ie/cork/houses-for-rent/ballineen/dromidclough-derrigra-ballineen-cork-1892028/
  // and the id is the last bit.
  const parts = cardInfo.href.split("-");
  return parts[parts.length - 1].split("/")[0];
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

function addCardControls(cardInfo, force) {
  // Instead of looking for a sibling, look for existing controls within the card
  const existingNode = cardInfo.rootNode.querySelector(".df-controls-wrapper");

  if (existingNode) {
    if (force === true) {
      existingNode.remove();
    } else {
      return;
    }
  }

  const metadata = getMetadata(cardInfo);
  const areaName = extractPlaceName(cardInfo.address || "");

  let areaNameHideButton = "";
  if (areaName) {
    areaNameHideButton = `<button class="df-button df-hide-area">Hide all ${capitalize(
      areaName
    )}</button>`;
  }

  const controls = `<div class="df-card-controls">
      <button class="df-button df-hide">${
        metadata.hidden ? "Unhide" : "Hide"
      }</button>
      <button class="df-button df-notes">Notes</button>
      <button class="df-button df-details">Show Details</button>
      <button class="df-button df-photos">Show Photos</button>
      <button class="df-button df-map">Show Map</button>
      ${areaNameHideButton}
     </div>`;

  const frag = document.createElement("div");
  frag.setAttribute("data-df", "controls");
  frag.className = "df-controls-wrapper";
  frag.innerHTML = controls;

  // Create notes container
  const notesFrag = document.createElement("div");
  notesFrag.innerHTML = `
    <div class="df-notes-container${metadata.notes ? " shown" : ""}">
      <div class="df-notes-inner">
        <textarea class="df-notes-text${
          metadata.notes ? " shown" : ""
        }" rows="3" cols="80" placeholder="Enter notes here">${
    metadata.notes || ""
  }</textarea>
      </div>
    </div>`;

  // Add event listeners
  frag.querySelector(".df-hide").addEventListener("click", () => {
    toggleHideCard(cardInfo);
  });

  frag.querySelector(".df-notes").addEventListener("click", () => {
    toggleNotes(cardInfo);
  });

  frag.querySelector(".df-details").addEventListener("click", (evt) => {
    const isShown = toggleDetails(cardInfo);
    evt.target.textContent = isShown ? "Hide Details" : "Show Details";
  });

  frag.querySelector(".df-photos").addEventListener("click", () => {
    showPhotos(cardInfo);
  });

  frag.querySelector(".df-map").addEventListener("click", () => {
    showMap(cardInfo);
  });

  const hideAreaButton = frag.querySelector(".df-hide-area");
  hideAreaButton &&
    hideAreaButton.addEventListener("click", () => {
      addToHideAreaList(areaName);
    });

  notesFrag
    .querySelector(".df-notes-text")
    .addEventListener("change", (evt) => {
      saveNotes(cardInfo, evt.target.value);
    });

  // Append controls to the card instead
  cardInfo.rootNode.appendChild(frag);

  // Add notes container to the controls wrapper
  const notesNode = notesFrag.firstElementChild;
  frag.appendChild(notesNode);

  cardInfo.notesNode = notesNode;
  cardInfo.controlsNode = frag;
}

function updateHideList(evt) {
  const hideList = evt.target.value;
  const tokens = hideList.split(",").map((item) => item.trim().toLowerCase());

  globalControls.hideList = tokens;
  writeStorage();
}

function addToHideAreaList(areaName) {
  areaName = areaName.toLowerCase();
  if (!globalControls.hideList.some((area) => area === areaName)) {
    globalControls.hideList.push(areaName);
    document.querySelector("#df-hide-input").value =
      globalControls.hideList.join(",");
    writeStorage();
    hideCards();
  }
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
  const notesNode = cardInfo.notesNode;
  notesNode.classList.toggle("shown");
}

function toggleDetails(cardInfo) {
  let detailsNode = cardInfo.extraDetailsNode;

  if (!detailsNode) {
    // sendEvent("action", "show_details");

    cardInfo.extraDetailsNode = detailsNode = document.createElement("div");
    detailsNode.innerHTML = "Loading ...";
    detailsNode.className = "df-details-container";
    cardInfo.controlsNode.appendChild(cardInfo.extraDetailsNode);

    const errMsg =
      "Sorry, something went wrong, we could not get the property details";

    fetchPropertyDetails(cardInfo)
      .then((content) => {
        detailsNode.innerHTML = content || errMsg;
      })
      .catch(() => {
        detailsNode.innerHTML = errMsg;
      });
  }

  cardInfo.extraDetailsNode.classList.toggle("shown");
  return cardInfo.extraDetailsNode.classList.contains("shown");
}

function capitalize(str) {
  return str
    ? str
        .split(" ")
        .map((s) => s.substring(0, 1).toUpperCase() + s.substring(1))
        .join(" ")
    : "";
}

function showPhotos(cardInfo) {
  fetchPageBody(cardInfo).then((frag) => {
    // Find list of photo images from the HTML for the carousel in the page.
    const urls = Array.from(
      frag.querySelectorAll("#pbxl_photo_carousel ul li img")
    ).map((img) => img.src);

    // sendEvent("action", "show_photos", null, urls.length);
    if (urls.length > 0) {
      const modal = document.createElement("div");
      modal.className = "df-modal";

      function goForward() {
        const currentScroll = modal.scrollTop;

        // Find the first image whose offset from the top is more than the
        // current scroll top
        const nodes = Array.from(modal.querySelectorAll(".df-img-wrapper"));

        if (nodes.length > 1) {
          const topPadding = nodes[0].offsetTop;
          nodes.some((node, idx) => {
            if (node.offsetTop > currentScroll + topPadding) {
              modal.scrollTop = node.offsetTop - 40;
              return true;
            }
            return false;
          });
        }
      }

      function goBack() {
        const currentScroll = modal.scrollTop;

        // Find the last image whose offset from the top is less than the
        // current scroll top
        const nodes = Array.from(modal.querySelectorAll(".df-img-wrapper"));
        for (let i = nodes.length - 1; i > -1; i--) {
          const node = nodes[i];
          if (node.offsetTop < currentScroll) {
            modal.scrollTop = node.offsetTop - 40;
            return;
          }
        }
      }

      function keyListener(evt) {
        const keyCode = evt.keyCode;
        let prevent = false;

        // ESC key
        if (keyCode === 27) {
          removeModal();
        } else if (keyCode === 37 || keyCode === 38) {
          // LEFT and UP keys
          goBack();
          prevent = true;
        } else if (keyCode === 39 || keyCode === 40) {
          // RIGHT and DOWN keys
          goForward();
          prevent = true;
        }

        if (prevent) {
          evt.preventDefault();
          evt.stopPropagation();
        }
      }

      function removeModal() {
        modal.parentNode.removeChild(modal);
        document.body.removeEventListener("keydown", keyListener, false);
      }

      function unhideImage(evt) {
        evt.target.classList.add("unhidden");
      }

      document.body.addEventListener("keydown", keyListener, false);

      const images = urls.map((url) => {
        const img = document.createElement("img");
        img.src = url;
        img.className = "df-img";

        img.addEventListener("load", unhideImage);
        return img;
      });

      const closeContainer = `
        <div class="df-close-wrapper">
          <button class="df-button df-modal-close">
            Close
          </button>
        </div>
      `;

      modal.innerHTML = closeContainer;

      images.forEach((img) => {
        const div = document.createElement("div");
        div.appendChild(img);
        div.className = "df-img-wrapper";

        modal.appendChild(div);
      });

      modal.addEventListener(
        "click",
        (evt) => {
          if (evt.target.tagName !== "IMG") {
            removeModal();
          }
        },
        false
      );

      document.body.appendChild(modal);
    }
  });
}

function showMap(cardInfo) {
  // It'd be nice to insert the map page in an iframe, but they do an annoying redirect in this case,
  // and attempts to block it with the 'sandbox' attribute cause the page itself to fail for
  // some reason.  So, let's go with the backup option of a popup window.
  // sendEvent("action", "show_map");
  window.open(
    cardInfo.href + "?df-map-view=1",
    "df-map",
    "width=610,height=800,resizable,scrollbars=yes,status=1"
  );
}

function saveNotes(cardInfo, textValue, skipServerSave) {
  // sendEvent("action", "save_note");

  const metadata = getMetadata(cardInfo);
  metadata.notes = textValue;
  writeStorage();

  if (!skipServerSave) {
    const propertyId = getPropertyId(cardInfo);

    var formData = new FormData();
    formData.append("action", "update_note");
    formData.append("note", textValue);
    formData.append("adId", propertyId);
    formData.append("adType", cardInfo.transactionType);

    // Try to save the note to the server for the user too!
    fetch("/my-daft/ajax/saved-ads/", {
      method: "POST",
      body: formData,
    });
  }
}

function hideCards() {
  const cards = findCards();
  hiddenCardsCount = 0;
  cards.forEach((cardInfo) => {
    let metadata = getMetadata(cardInfo);
    let hidden = metadata.hidden === true;
    if (!hidden && cardInfo.address) {
      hidden = globalControls.hideList.some((token) => {
        const idx = cardInfo.address.indexOf(token);
        return idx > -1;
      });
    }
    if (hidden) {
      hiddenCardsCount++;
    }

    cardInfo.rootNode.classList[hidden ? "add" : "remove"]("df-hidden");
  });
  return hiddenCardsCount;
}

/**
 * Adds a mutation observer to the page to detect changes in the DOM.
 * This is used to detect new property cards being added to the page as
 * the user navigates through listings.
 * @returns {void}
 * @see https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver
 */
function addChangeListener() {
  const cardContainer = document.querySelector('[data-testid="results"]');

  if (cardContainer) {
    const observer = new MutationObserver((mutationsList) => {
      initCards();
    });

    observer.observe(cardContainer, {
      childList: true,
      subtree: true,
    });
  }
}

/**
 * Finds property cards on the page and adds controls to them.
 * @returns {void}
 */
function initCards() {
  const cards = findCards();
  cards.forEach((cardInfo) => addCardControls(cardInfo, false));
}

/**
 * Saves property metadata and global controls to chrome.storage.
 * @returns {Promise<void>}
 * @see https://developer.chrome.com/docs/extensions/reference/storage/
 */
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
  return Object.keys(globalControls).map((key) => "globalControls." + key);
}

/**
 * Reads stored property metadata and global controls from chrome.storage
 * @param {Array} cards - Array of card information objects
 * @returns {Promise<void>}
 */
async function readStorage(cards) {
  const keys = cards.map((cardInfo) => getStorageKey(cardInfo));

  const [metadata, controls] = await Promise.all([
    chrome.storage.local.get(keys),
    chrome.storage.local.get(["global-controls"]),
  ]);

  propertyMetadata = metadata;

  const storedGlobalControls = controls["global-controls"];
  if (storedGlobalControls) {
    Object.keys(storedGlobalControls).forEach((key) => {
      globalControls[key] = storedGlobalControls[key];
    });
  }
}

/**
 * Writes property metadata and global controls to chrome.storage
 * @returns {Promise<void>}
 */
async function writeStorage() {
  const obj = {};
  Object.keys(propertyMetadata).forEach((key) => {
    // Only write objects that actually have something in them
    if (Object.keys(propertyMetadata[key]).length > 0) {
      obj[key] = propertyMetadata[key];
    }
  });
  obj["global-controls"] = globalControls;

  await chrome.storage.local.set(obj);
}

function autoExpandPropertyDescription() {
  const node = document.querySelector(".ExpandMoreIndicator__expandLinkText");
  if (node) {
    node.click();
  }
}

function getCardIndex(node) {
  const counterNode = node.querySelector(".sr_counter");
  if (counterNode) {
    const text = counterNode.textContent.split(".").join("").trim();
    return parseInt(text, 10);
  }
  return -1;
}

function getPageLinks() {
  const nodes = document.querySelectorAll(
    ".paging li:not(.next_page):not(.prev_page) a"
  );
  return Array.from(nodes)
    .filter((node) => {
      return node.textContent !== "...";
    })
    .map((node) => {
      return { node, link: node.href };
    });
}

function fixUpImageScript(script) {
  script = script
    .split("\n")
    .map((line) => {
      if (line.indexOf("imgEl.attr(") > 0) {
        const parts = line.split("'");
        if (parts.length > 5) {
          // There's too many apostrophes, somehow they got unescaped, e.g.
          // imgEl.attr('alt', ' Terraced House at 6 St. Patrick's Road, Drumcondra, Dublin 9');
          // &#039;
          // The first three parts are fine, as is the last part
          const firstPart = parts.slice(0, 3).join("'");
          const lastPart = parts[parts.length - 1];
          const middlePart = parts.slice(3, parts.length - 1).join("&#039;");
          return [firstPart, middlePart, lastPart].join("'");
        }
      }
      return line;
    })
    .join("\n");
  return `try{${script}}catch(e){}`;
}

function prefetchPages() {
  const allCards = findCards();

  // If there are no properties listed, ignore this page
  if (allCards.length === 0) {
    return;
  }

  const pageLinks = getPageLinks();
  const promises = pageLinks.map(({ node, link }) => {
    return fetch(link)
      .then((res) => res.text())
      .then((html) => sanitizeHtml(html))
      .then((html) => extractPageContent(html));
  });

  Promise.all(promises).then((pages) => {
    if (pages.length > 0) {
      const cardWrapper = allCards[0].rootNode.parentNode;

      // Collect <script> tags right after the cards that are used in the homes to buy section
      // to properly load the images
      const allScripts = [];
      // let pageScripts = '';
      const firstCardIndex = getCardIndex(allCards[0].rootNode);

      pages.forEach((pageInfo, idx) => {
        const { nodes, scripts } = pageInfo;
        nodes.forEach((node) => {
          const index = getCardIndex(node);

          // Insert the nodes in the correct order.  If we landed on a page in
          // the middle of the list of pages somehow, but earlier pages before
          // the current page where appropriate.
          if (firstCardIndex > -1 && index < firstCardIndex) {
            cardWrapper.insertBefore(node, allCards[0].rootNode);
          } else {
            cardWrapper.appendChild(node);
          }
        });
        scripts.forEach((script) => allScripts.push(fixUpImageScript(script)));
      });

      // Add the card controls to the newly inserted property cards.
      initCards();
      hideCards();
      const scriptInterval = setInterval(() => {
        if (allScripts.length > 0) {
          const scriptContent = allScripts.shift();

          // Avoid inserting too many scripts on the page.  At least in older
          // browsers there was an annoying limit (39?) of how many you could
          // insert dynamically.  Call me old fashioned, but let's clean up...
          const existingScriptNode = document.getElementById("df-script");
          if (existingScriptNode) {
            existingScriptNode.parentNode.removeChild(existingScriptNode);
          }

          // Make a new script node
          const scriptNode = document.createElement("script");
          scriptNode.setAttribute("id", "df-script");
          scriptNode.setAttribute("type", "text/javascript");
          scriptNode.textContent = scriptContent;
          document.body.appendChild(scriptNode);
        } else {
          clearInterval(scriptInterval);
        }
      }, 100);

      // Set an interval go through the lazily loaded images and add their
      // images bit by bit
      const lazyInterval = setInterval(() => {
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
          clearInterval(lazyInterval);
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

function fetchPageBody(cardInfo) {
  if (cardInfo.pageContentNode) {
    return Promise.resolve(cardInfo.pageContentNode);
  } else {
    return fetch(cardInfo.href)
      .then((resp) => resp.text())
      .then((html) => sanitizeHtml(html))
      .then((html) => {
        const frag = document.createElement("div");
        frag.innerHTML = html;
        cardInfo.pageContentNode = frag;
        return frag;
      });
  }
}

function getBodyContent(html) {
  // Find the body tag
  const bodyStartIdx = html.indexOf("<body");
  const bodyEndIdx = html.indexOf("</body");
  const bodyOuterContent = html.substring(bodyStartIdx, bodyEndIdx);
  const bodyContent = bodyOuterContent.substring(
    bodyOuterContent.indexOf(">") + 1
  );
  return bodyContent;
}

function fetchPropertyDetails(cardInfo) {
  return fetchPageBody(cardInfo).then((frag) => {
    const propertyDetailsNodes = frag.querySelectorAll(
      ".PropertyDescription__propertyDescription, .PropertyFeatures__featuresList, #smi-tab-overview"
    );
    if (propertyDetailsNodes) {
      return Array.from(propertyDetailsNodes)
        .map((node) => node.innerHTML)
        .join("<br />");
    } else {
      return null;
    }
  });
}

function extractPageContent(html) {
  const bodyContent = getBodyContent(html);
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

  let scripts = [];
  cards.forEach((node) => {
    const scriptNode = node.nextElementSibling;

    // We have to collect the contents of the script tags that follow each
    // card, as they initialize the image for the card.  Weird how they don't
    // just output that in the html, but here we are....
    if (scriptNode.tagName.toLowerCase() === "notscript") {
      scripts.push(scriptNode.textContent);
    }
  });

  return {
    nodes: cards,
    scripts: scripts,
  };
}

function isSupportedPageType() {
  return findCards().length > 0;
}

// When the user saves a note using the Daft native notes tools, also save it
// locally so we can stay in sync
function storeNoteFromDaftForm() {
  const saveButton = document.getElementById("save_note");
  const textarea = document.querySelector("textarea#modal_note");
  if (saveButton && textarea) {
    saveButton.addEventListener(
      "click",
      (evt) => {
        const href = "https://www.daft.ie" + window.location.pathname;
        saveNotes({ href }, textarea.value.trim(), true);
      },
      true
    );
  }
}

function extractPlaceName(address) {
  const possibleNames = address
    .toLowerCase()
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t.indexOf("co. ") < 0 && !t.match("[0-9]"));

  return possibleNames.length > 0
    ? possibleNames[possibleNames.length - 1]
    : null;
}

if (isSupportedPageType()) {
  // sendEvent("lifecycle", "load", getTransactionType());
  readStorage(findCards())
    .then(() => {
      initCards();
      hideCards();
      refreshUI();
      autoExpandPropertyDescription();
      addChangeListener();
      prefetchPages();
    })
    .catch((error) => {
      console.error("Failed to read storage:", error);
    });
} else {
  storeNoteFromDaftForm();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "getHiddenCount") {
    sendResponse({ count: hiddenCardsCount });
    return true;
  }
  if (message.type === "settingsUpdated") {
    globalControls.hiddenEnabled = message.settings.hiddenEnabled;
    globalControls.hideList = message.settings.hideList;
    updateHiddenState();
    hideCards();
  }
});
