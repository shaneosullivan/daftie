/**
 * @typedef {Object} PropertyMetadata
 * @property {boolean} hidden - Whether the property is hidden
 * @property {string} notes - User notes about the property
 */

/** @type {Object.<string, PropertyMetadata>} */
let propertyMetadata = {};
let hiddenCardsCount = 0;

/** @type {{hiddenEnabled: boolean, hideList: string[]}} */
const globalControls = {
  hiddenEnabled: true,
  hideList: [],
};

/**
 * Updates the visibility state of hidden properties in the UI
 * @returns {Promise<void}
 */
function updateVisibilityState() {
  document.body.classList[globalControls.hiddenEnabled ? "remove" : "add"](
    "df-hidden-disabled"
  );
}

/**
 * Gets whether it is a sale or rent page from the URL.
 * @returns {string}
 */
function getTransactionType() {
  return window.location.href.indexOf("for-sale") > -1 ? "sale" : "rent";
}

/**
 * Finds and extracts property card information using DOM elements
 * @returns {Array<PropertyCard>} Array of card objects
 */
function findCards() {
  // Find all property cards using the consistent data-testid attribute
  const cardElements = Array.from(
    document.querySelectorAll('[data-testid^="result-"]')
  );

  const transactionType = getTransactionType();

  return cardElements.map((cardElement) => {
    const id = cardElement.getAttribute("data-testid").split("-")[1];
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

    // Basic metadata from DOM - we'll get full data only when needed
    const metadataSpans = Array.from(
      metadataNode?.querySelectorAll("span") || []
    );
    const metadata = {
      beds: 0,
      baths: 0,
      size: 0,
      type: "",
    };

    for (const span of metadataSpans) {
      const text = span?.textContent || "";
      if (text.includes("Bed")) {
        metadata.beds = parseInt(text) || 0;
      } else if (text.includes("Bath")) {
        metadata.baths = parseInt(text) || 0;
      } else if (text.includes("m²")) {
        metadata.size = parseInt(text) || 0;
      } else {
        metadata.type = text;
      }
    }

    return {
      id,
      address: addressNode?.textContent?.toLowerCase().trim() || "",
      href: linkNode?.href || "",
      metadata,
      price: priceNode?.textContent?.trim() || "",
      rootNode: cardElement,
      detailsNode: detailsContainer,
      linkNode,
      transactionType,
    };
  });
}

/**
 * Adds control buttons and notes container to a property card
 * @param {PropertyCard} cardInfo Property card information
 * @param {boolean} [force=false] Whether to force re-adding controls
 * @returns {void}
 */
function addCardControls(cardInfo, force = false) {
  // Check for existing controls within the card
  const existingNode = cardInfo.rootNode.querySelector(".df-controls-wrapper");
  if (existingNode) {
    if (force === true) {
      existingNode.remove();
    } else {
      return;
    }
  }

  const metadata = getMetadata(cardInfo);
  const areaName = extractPlaceName(cardInfo.address);

  // Create controls wrapper
  const controlsWrapper = document.createElement("div");
  controlsWrapper.setAttribute("data-df", "controls");
  controlsWrapper.className = "df-controls-wrapper";

  // Build controls HTML
  const controls = document.createElement("div");
  controls.className = "df-card-controls";
  controls.innerHTML = `
    <button class="df-button df-hide">${
      metadata.hidden ? "Unhide" : "Hide"
    }</button>
    <button class="df-button df-notes">Notes</button>
    <button class="df-button df-details">Show Details</button>
    <button class="df-button df-photos">Show Photos</button>
    <button class="df-button df-map">Show Map</button>
    ${
      areaName
        ? `<button class="df-button df-hide-area">Hide all ${capitalize(
            areaName
          )}</button>`
        : ""
    }
  `;

  // Create notes container
  const notesContainer = document.createElement("div");
  notesContainer.className = `df-notes-container${
    metadata.notes ? " shown" : ""
  }`;
  notesContainer.innerHTML = `
    <div class="df-notes-inner">
      <textarea class="df-notes-text" rows="3" 
        placeholder="Enter notes here">${metadata.notes || ""}</textarea>
    </div>
  `;

  // Add event listeners
  controls.querySelector(".df-hide").addEventListener("click", () => {
    toggleHideCard(cardInfo);
  });

  controls.querySelector(".df-notes").addEventListener("click", () => {
    toggleNotes(cardInfo);
  });

  controls.querySelector(".df-details").addEventListener("click", (evt) => {
    toggleDetails(cardInfo).then((isShown) => {
      evt.target.textContent = isShown ? "Hide Details" : "Show Details";
    });
  });

  controls.querySelector(".df-photos").addEventListener("click", () => {
    showPhotos(cardInfo);
  });

  controls.querySelector(".df-map").addEventListener("click", () => {
    showMap(cardInfo);
  });

  const hideAreaButton = controls.querySelector(".df-hide-area");
  if (hideAreaButton && areaName) {
    hideAreaButton.addEventListener("click", () => {
      addToHideAreaList(areaName);
    });
  }

  notesContainer
    .querySelector(".df-notes-text")
    .addEventListener("change", (evt) => {
      saveNotes(cardInfo, evt.target.value);
    });

  // Assemble and add to card
  controlsWrapper.appendChild(controls);
  controlsWrapper.appendChild(notesContainer);
  cardInfo.rootNode.appendChild(controlsWrapper);

  // Store references
  cardInfo.notesNode = notesContainer;
  cardInfo.controlsNode = controlsWrapper;
}

/**
 * Gets Next.js data for a property, fetching only once if needed
 * @param {PropertyCard} cardInfo Property card information
 * @returns {Promise<Object>} The property's Next.js data
 */
async function getPropertyNextData(cardInfo) {
  // Return cached data if we already fetched it
  if (cardInfo.nextData) {
    return cardInfo.nextData;
  }

  try {
    const response = await fetch(cardInfo.href);
    const html = await response.text();

    // Extract Next.js data script
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const nextDataScript = doc.querySelector("#__NEXT_DATA__");

    if (!nextDataScript) {
      throw new Error("Next.js data not found");
    }

    // Parse and cache the data
    cardInfo.nextData = JSON.parse(nextDataScript.textContent);
    return cardInfo.nextData;
  } catch (error) {
    console.error("Error fetching property data:", error);
    throw error;
  }
}

/**
 * Adds an area name to the global hide list
 * @param {string} areaName Name of the area to hide
 */
async function addToHideAreaList(areaName) {
  areaName = areaName.toLowerCase();
  if (!globalControls.hideList.some((area) => area === areaName)) {
    globalControls.hideList.push(areaName);
    await writeStorage();
    hideCards();
  }
}

/**
 * Toggles a card's hidden state.
 * @param {PropertyCard} cardInfo Property card information
 * @returns {void}
 */
function toggleHideCard(cardInfo) {
  const metadata = getMetadata(cardInfo);
  metadata.hidden = !metadata.hidden;
  hideCards();
  writeStorage();
  updateVisibilityState();
  addCardControls(cardInfo, true);
}

/**
 * Toggles visibility of the notes textarea
 * @param {PropertyCard} cardInfo Property card information
 * @returns {void}
 */
function toggleNotes(cardInfo) {
  const notesNode = cardInfo.notesNode;
  notesNode.classList.toggle("shown");
}

/**
 * Toggles the visibility of a property's description, which is
 * scraped from the property page.
 * @param {PropertyCard} cardInfo Property card information
 * @returns {boolean} Whether the details are now shown
 */
async function toggleDetails(cardInfo) {
  let detailsNode = cardInfo.extraDetailsNode;

  if (!detailsNode) {
    cardInfo.extraDetailsNode = detailsNode = document.createElement("div");
    detailsNode.className = "df-details-container";
    cardInfo.controlsNode.appendChild(detailsNode);

    detailsNode.innerHTML =
      '<div class="loading">Loading property details...</div>';

    try {
      const nextData = await getPropertyNextData(cardInfo);
      const listing = nextData?.props?.pageProps?.listing;

      if (!listing?.description) {
        throw new Error("Property description not found");
      }

      const features = listing.features || [];
      const featuresList =
        features.length > 0
          ? `<h3>Features</h3>
           <ul>${features.map((f) => `<li>${f}</li>`).join("")}</ul>`
          : "";

      detailsNode.innerHTML = `
        <div class="property-details">
          <div class="description">${listing.description.replace(
            /\n/g,
            "<br>"
          )}</div>
          ${featuresList}
        </div>
      `;
    } catch (error) {
      detailsNode.innerHTML = `<div class="error">${error.message}</div>`;
    }
  }

  detailsNode.classList.toggle("shown");
  return detailsNode.classList.contains("shown");
}

function capitalize(str) {
  return str
    ? str
        .split(" ")
        .map((s) => s.substring(0, 1).toUpperCase() + s.substring(1))
        .join(" ")
    : "";
}

/**
 * Shows property photos in a modal dialog with carousel
 * @param {Object} cardInfo - Property card information
 */
async function showPhotos(cardInfo) {
  try {
    const { nextData } = await fetchPageBody(cardInfo);

    let urls = [];
    if (nextData?.props?.pageProps?.listing?.media?.images) {
      urls = nextData.props.pageProps.listing.media.images
        .map((img) => ({
          full: img.size1200x1200,
          thumb: img.size360x240,
        }))
        .filter((urls) => urls.full && urls.thumb);
    }

    if (urls.length > 0) {
      const dialog = document.createElement("dialog");
      dialog.className = "df-modal";

      // Create carousel HTML
      dialog.innerHTML = `
        <div class="df-close-wrapper">
          <button class="df-button df-modal-close">Close</button>
        </div>
        <div class="df-carousel">
          <div class="df-carousel__main">
            <button class="df-carousel__button" type="button" aria-label="Previous photo" id="prevButton">
              <svg class="df-carousel__arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path>
              </svg>
            </button>
            <ul class="df-carousel__slides">
              ${urls
                .map(
                  (url, idx) => `
                <li class="df-carousel__slide df-carousel__slide--main ${
                  idx === 0 ? "df-carousel__slide--visible" : ""
                }">
                  <img 
                    class="df-carousel__img" 
                    src="${url.full}"
                    data-imgid="${idx}"
                    loading="${idx < 2 ? "eager" : "lazy"}"
                    alt="Property photo ${idx + 1}"
                  >
                </li>
              `
                )
                .join("")}
            </ul>
            <button class="df-carousel__button" type="button" aria-label="Next photo" id="nextButton">
              <svg class="df-carousel__arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
              </svg>
            </button>
          </div>
          <div class="df-carousel__thumbnails">
            <ul class="df-carousel__slides df-carousel__slides--thumbnails">
              ${urls
                .map(
                  (url, idx) => `
                <li class="df-carousel__slide df-carousel__slide--thumbnail ${
                  idx === 0 ? "df-carousel__slide--visible" : ""
                }">
                  <img 
                    class="df-carousel__img" 
                    src="${url.thumb}"
                    data-imgid="${idx}"
                    alt="Thumbnail ${idx + 1}"
                  >
                </li>
              `
                )
                .join("")}
            </ul>
          </div>
        </div>
      `;

      let currentIdx = 0;
      const slides = dialog.querySelectorAll(".df-carousel__slide--main");
      const thumbnails = dialog.querySelectorAll(
        ".df-carousel__slide--thumbnail"
      );

      function changeSlide(oldIdx, newIdx) {
        // Update visibility
        slides[newIdx].classList.add("df-carousel__slide--visible");
        thumbnails[newIdx].classList.add("df-carousel__slide--visible");

        slides[oldIdx].classList.remove("df-carousel__slide--visible");
        thumbnails[oldIdx].classList.remove("df-carousel__slide--visible");

        currentIdx = newIdx;
      }

      // Event handlers
      function handleNext() {
        const newIdx = currentIdx < slides.length - 1 ? currentIdx + 1 : 0;
        changeSlide(currentIdx, newIdx);
      }

      function handlePrev() {
        const newIdx = currentIdx > 0 ? currentIdx - 1 : slides.length - 1;
        changeSlide(currentIdx, newIdx);
      }

      function handleThumbnailClick(e) {
        const imgId = e.target.dataset.imgid;
        if (imgId !== undefined) {
          const newIdx = parseInt(imgId, 10);
          if (newIdx !== currentIdx) {
            changeSlide(currentIdx, newIdx);
          }
        }
      }

      // Add event listeners
      dialog.querySelector("#nextButton").addEventListener("click", handleNext);
      dialog.querySelector("#prevButton").addEventListener("click", handlePrev);
      dialog
        .querySelector(".df-carousel__slides--thumbnails")
        .addEventListener("click", handleThumbnailClick);

      dialog.addEventListener("keydown", (e) => {
        if (e.key === "ArrowRight") {
          e.preventDefault();
          handleNext();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          handlePrev();
        }
      });

      dialog.addEventListener("click", (e) => {
        if (e.target.closest(".df-modal-close")) {
          dialog.close();
        }
      });

      // Clean up
      dialog.addEventListener("close", () => {
        dialog.remove();
      });

      // Show dialog
      document.body.appendChild(dialog);
      dialog.showModal();
    }
  } catch (error) {
    console.error("Error showing photos:", error);
  }
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

/**
 * Sanitizes HTML by removing script tags and ad-related content
 * while preserving formatting
 * @param {string} html - Raw HTML string to sanitize
 * @returns {string} Sanitized HTML with preserved formatting
 */
function sanitizeHtml(html) {
  const div = document.createElement("div");
  div.innerHTML = html;

  // Remove ad-related elements
  const adElements = div.querySelectorAll(
    '[data-testid^="dfp-slot"], .adunitContainer, .adBox'
  );
  adElements.forEach((el) => el.remove());

  // not quite sure how they've done it, but the description has no html markup,
  // but is still somehow formatted on the property detail page 🤷‍♂️
  // unfortunately, this means the formatting is not there when we extract it
  const text = div.innerHTML;
  return text;
}

/**
 * Fetches and extracts the Next.js page data and HTML content
 * @param {Object} cardInfo - Property card information
 * @returns {Promise<{html: Element, nextData: Object}>} Both the HTML fragment and parsed Next.js data
 */
async function fetchPageBody(cardInfo) {
  if (cardInfo.pageContentNode) {
    return {
      html: cardInfo.pageContentNode,
      nextData: cardInfo.nextData,
    };
  }

  try {
    const response = await fetch(cardInfo.href);
    if (!response.ok) {
      throw new Error(`Failed to fetch page (${response.status})`);
    }

    const html = await response.text();

    // Create HTML fragment
    const frag = document.createElement("div");
    frag.innerHTML = html;

    // Extract Next.js data
    const nextDataScript = frag.querySelector("#__NEXT_DATA__");
    let nextData = null;
    if (nextDataScript) {
      try {
        nextData = JSON.parse(nextDataScript.textContent);
      } catch (e) {
        console.error("Error parsing Next.js data:", e);
      }
    }

    cardInfo.pageContentNode = frag;
    cardInfo.nextData = nextData;

    return { html: frag, nextData };
  } catch (error) {
    console.error("Error fetching property page:", error);
    throw new Error("Failed to load property page");
  }
}

/**
 * Pulls and formats property details from the Next.js data or page content
 * @param {Object} cardInfo - Property card information
 * @returns {Promise<string>} Formatted HTML string of property details
 */
async function fetchPropertyDetails(cardInfo) {
  try {
    const { nextData } = await fetchPageBody(cardInfo);

    let description = "";
    let features = [];

    if (nextData?.props?.pageProps?.listing) {
      const listing = nextData.props.pageProps.listing;
      description = listing.description || "";
      features = listing.features || [];
    }

    if (!description) {
      throw new Error("Property description not found");
    }

    // Format the details with features list if available
    const featuresList =
      features.length > 0
        ? `
     <h3>Features</h3>
     <ul>
       ${features.map((f) => `<li>${f}</li>`).join("")}
     </ul>
   `
        : "";

    return `
     <div class="property-details">
       <div class="description">${description.replace(/\n/g, "<br>")}</div>
       ${featuresList}
     </div>
   `;
  } catch (error) {
    console.error("Error fetching property details:", error);
    throw new Error("Could not load property details. Please try again later.");
  }
}

/**
 * Toggles the visibility of property details
 * @param {Object} cardInfo - Property card information
 * @returns {boolean} Whether the details are now shown
 */
async function toggleDetails(cardInfo) {
  let detailsNode = cardInfo.extraDetailsNode;

  if (!detailsNode) {
    cardInfo.extraDetailsNode = detailsNode = document.createElement("div");
    detailsNode.className = "df-details-container";
    cardInfo.controlsNode.appendChild(detailsNode);

    detailsNode.innerHTML =
      '<div class="loading">Loading property details...</div>';

    try {
      const content = await fetchPropertyDetails(cardInfo);
      detailsNode.innerHTML = content;
    } catch (error) {
      detailsNode.innerHTML = `<div class="error">${error.message}</div>`;
    }
  }

  detailsNode.classList.toggle("shown");
  return detailsNode.classList.contains("shown");
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
      updateVisibilityState();
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
    updateVisibilityState();
    hideCards();
  }
});
