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
 * @returns {Promise<void>}
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
 * Adds all of a specific area to the hide list
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
 * @param {PropertyCard} cardInfo Property card information
 * @returns {Promise<void>}
 */
async function showPhotos(cardInfo) {
  try {
    const nextData = await getPropertyNextData(cardInfo);
    const images = nextData?.props?.pageProps?.listing?.media?.images || [];

    const urls = images
      .map((img) => ({
        // just two sizes instead of all sizes
        full: img.size1200x1200,
        thumb: img.size360x240,
      }))
      .filter((urls) => urls.full && urls.thumb);

    if (urls.length === 0) {
      throw new Error("No photos available");
    }

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

    /**
     * Updates current slide visibility and thumbnail states
     * @param {number} oldIdx - Index of current slide
     * @param {number} newIdx - Index of slide to show
     * @returns {void}
     */
    function changeSlide(oldIdx, newIdx) {
      slides[newIdx].classList.add("df-carousel__slide--visible");
      thumbnails[newIdx].classList.add("df-carousel__slide--visible");

      slides[oldIdx].classList.remove("df-carousel__slide--visible");
      thumbnails[oldIdx].classList.remove("df-carousel__slide--visible");

      currentIdx = newIdx;
    }

    /**
     * Handles next slide button click
     * @returns {void}
     */
    function handleNext() {
      const newIdx = currentIdx < slides.length - 1 ? currentIdx + 1 : 0;
      changeSlide(currentIdx, newIdx);
    }

    /**
     * Handles previous slide button click
     * @returns {void}
     */
    function handlePrev() {
      const newIdx = currentIdx > 0 ? currentIdx - 1 : slides.length - 1;
      changeSlide(currentIdx, newIdx);
    }

    /**
     * Handles thumbnail click events
     * @param {MouseEvent} e - Click event
     * @returns {void}
     */
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

    // Clean up on close
    dialog.addEventListener("close", () => {
      dialog.remove();
    });

    // Show dialog
    document.body.appendChild(dialog);
    dialog.showModal();
  } catch (error) {
    console.error("Error showing photos:", error);
  }
}

/**
 * Shows property location in a modal dialog using OpenStreetMap static map
 * @param {PropertyCard} cardInfo Property card information
 * @returns {Promise<void>}
 */
async function showMap(cardInfo) {
  try {
    const nextData = await getPropertyNextData(cardInfo);
    const listing = nextData?.props?.pageProps?.listing;

    if (!listing?.point?.coordinates) {
      throw new Error("Location coordinates not found");
    }

    const [longitude, latitude] = listing.point.coordinates;
    const address = listing.title;

    const dialog = document.createElement("dialog");
    dialog.className = "df-modal df-map-modal";

    // Create static map URL with marker
    const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${
      longitude - 0.01
    },${latitude - 0.01},${longitude + 0.01},${
      latitude + 0.01
    }&layer=mapnik&marker=${latitude},${longitude}`;

    dialog.innerHTML = `
      <div class="df-close-wrapper">
        <button class="df-button df-modal-close">Close</button>
      </div>
      <div class="df-map-container">
        <div class="df-map-contents">
          <iframe 
            width="100%" 
            height="600" 
            frameborder="0" 
            scrolling="no" 
            marginheight="0" 
            marginwidth="0"
            src="${mapUrl}">
          </iframe>
          <p class="df-map-address">${address}</p>
          <a href="https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}#map=15/${latitude}/${longitude}" 
            target="_blank" 
            class="df-button">
            View Larger Map
          </a>
        </div>
      </div>
    `;

    // Add close handler
    dialog.addEventListener("click", (e) => {
      if (e.target.closest(".df-modal-close")) {
        dialog.close();
      }
    });

    // Clean up on close
    dialog.addEventListener("close", () => {
      dialog.remove();
    });

    // Show dialog
    document.body.appendChild(dialog);
    dialog.showModal();
  } catch (error) {
    console.error("Error showing map:", error);

    // Fallback to old behavior
    window.open(
      cardInfo.href + "?df-map-view=1",
      "df-map",
      "width=610,height=800,resizable,scrollbars=yes,status=1"
    );
  }
}

/**
 * Saves notes for a property in local storage
 * @param {PropertyCard} cardInfo Property card information
 * @param {string} textValue Note content to save
 * @returns {Promise<void>}
 */
async function saveNotes(cardInfo, textValue) {
  // it looks like Daft doesn't allow users to add notes to properties
  // anymore, so I've removed the step that tries to sync to the note
  const metadata = getMetadata(cardInfo);
  metadata.notes = textValue;
  await writeStorage();
}

/**
 * Updates visibility of all property cards based on hide list and stored preferences
 * @returns {number} Number of hidden cards
 */
function hideCards() {
  const cards = findCards();
  hiddenCardsCount = 0;

  // Process each card
  cards.forEach((cardInfo) => {
    const metadata = getMetadata(cardInfo);

    // Check if card was manually hidden
    let shouldHide = metadata.hidden === true;

    // If not manually hidden, check if address matches any hide terms
    if (!shouldHide && cardInfo.address) {
      shouldHide = globalControls.hideList.some((term) =>
        cardInfo.address.includes(term.toLowerCase())
      );
    }

    // Update count and visibility
    if (shouldHide) {
      hiddenCardsCount++;
    }
    cardInfo.rootNode.classList.toggle("df-hidden", shouldHide);
  });

  return hiddenCardsCount;
}

/**
 * Adds a mutation observer to detect when new property cards are added
 * to the page through infinite scroll or filtering.
 * @returns {void}
 * @see https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver
 */
function addChangeListener() {
  const resultsContainer = document.querySelector('[data-testid="results"]');

  if (!resultsContainer) {
    console.warn("Results container not found");
    return;
  }

  const observer = new MutationObserver((mutations) => {
    // Only run initCards if we see nodes being added or removed
    const hasRelevantChanges = mutations.some(
      (mutation) =>
        mutation.type === "childList" &&
        (mutation.addedNodes.length > 0 || mutation.removedNodes.length > 0)
    );

    if (hasRelevantChanges) {
      initCards();
    }
  });

  observer.observe(resultsContainer, {
    childList: true,
    subtree: true,
  });
}

/**
 * Initializes controls for all property cards on the page.
 * Should be called on page load and when new cards are added.
 * @returns {void}
 */
function initCards() {
  try {
    const cards = findCards();
    // Skip if no cards found (might be a different page type)
    if (cards.length === 0) {
      return;
    }

    cards.forEach((cardInfo) => {
      addCardControls(cardInfo, false);
    });
  } catch (error) {
    console.error("Error initializing property cards:", error);
  }
}

/**
 * Gets or initializes metadata for a property card
 * @param {PropertyCard} cardInfo Property card information
 * @returns {PropertyMetadata} The property's metadata
 */
function getMetadata(cardInfo) {
  const key = getStorageKey(cardInfo);
  if (!propertyMetadata[key]) {
    propertyMetadata[key] = {
      hidden: false,
      notes: "",
    };
  }
  return propertyMetadata[key];
}

/**
 * Generates a unique storage key for a property
 * @param {PropertyCard} cardInfo Property card information
 * @returns {string} Storage key in format "property:${id}"
 */
function getStorageKey(cardInfo) {
  // Use the ID directly to prevent issues with changing URLs
  return `property:${cardInfo.id}`;
}

/**
 * @typedef {Object} StorageData
 * @property {Object<string, PropertyMetadata>} properties - Property metadata keyed by ID
 * @property {Object} globalControls - Global control settings
 */

/**
 * Reads property metadata and global controls from chrome.storage.local
 * @param {PropertyCard[]} cards Array of card information objects
 * @returns {Promise<void>}
 */
async function readStorage(cards) {
  try {
    // Create storage keys for each card
    const propertyKeys = cards.map((card) => getStorageKey(card));

    // Get both properties and global controls in one call
    const data = await chrome.storage.local.get({
      properties: {}, // Default empty object if not found
      "global-controls": {
        // Default settings if not found
        hiddenEnabled: true,
        hideList: [],
      },
    });

    // Update global state
    propertyMetadata = data.properties || {};

    // Update global controls if they exist
    if (data["global-controls"]) {
      Object.assign(globalControls, data["global-controls"]);
    }
  } catch (error) {
    console.error("Error reading from storage:", error);
    throw error; // Re-throw to handle in the calling function
  }
}

/**
 * Writes property metadata and global controls to chrome.storage.local
 * @returns {Promise<void>}
 */
async function writeStorage() {
  try {
    // Filter out empty metadata objects
    const filteredMetadata = {};
    Object.entries(propertyMetadata).forEach(([key, value]) => {
      if (Object.keys(value).length > 0) {
        filteredMetadata[key] = value;
      }
    });

    // Prepare data to store
    const data = {
      properties: filteredMetadata,
      "global-controls": globalControls,
    };

    // Store everything in one call
    await chrome.storage.local.set(data);
  } catch (error) {
    console.error("Error writing to storage:", error);
    throw error;
  }
}

/**
 * Creates HTML content from property details
 * @param {Object} listing - Property listing data from Next.js
 * @returns {string} Formatted HTML content
 */
function formatPropertyDetails(listing) {
  const features = listing.features || [];
  const featuresList =
    features.length > 0
      ? `<h3>Features</h3>
       <ul>${features.map((f) => `<li>${f}</li>`).join("")}</ul>`
      : "";

  return `
    <div class="property-details">
      <div class="description">${listing.description.replace(
        /\n/g,
        "<br>"
      )}</div>
      ${featuresList}
    </div>
  `;
}

/**
 * Checks if the current page is a supported Daft.ie page type
 * @returns {boolean}
 */
function isSupportedPageType() {
  return findCards().length > 0;
}

/**
 * Takes an address string and attempts to extract the place name from it
 * @param {string} address - Full address string
 * @returns {string|null} Place name or null if not found
 */
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

/**
 * Initialize extension functionality if we're on a supported page
 */
if (isSupportedPageType()) {
  readStorage(findCards())
    .then(() => {
      initCards();
      hideCards();
      updateVisibilityState();
      addChangeListener();
    })
    .catch((error) => {
      console.error("Failed to initialize extension:", error);
    });
}

/**
 * Handle messages from the popup
 * @type {chrome.runtime.onMessage}
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "getHiddenCount":
      sendResponse({ count: hiddenCardsCount });
      return true; // Keep message channel open for async response

    case "settingsUpdated":
      const { hiddenEnabled, hideList } = message.settings;
      globalControls.hiddenEnabled = hiddenEnabled;
      globalControls.hideList = hideList;
      updateVisibilityState();
      hideCards();
      break;
  }
});
