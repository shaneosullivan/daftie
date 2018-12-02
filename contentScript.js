let propertyMetadata = {};

const globalControls = {
  hiddenEnabled: true
};

function refreshUI() {
  addGlobalControls();
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

function findCards() {
  const buyLinks = Array.from(
    document.querySelectorAll(
      "#sr_content .PropertyCardContainer__container a.PropertyInformationCommonStyles__addressCopy--link"
    )
  );

  const transactionType =
    window.location.href.indexOf("for-sale") > -1 ? "sale" : "rent";

  const buyCards = buyLinks.map(link => {
    const rootNode = findParentByClass(
      link,
      "PropertyCardContainer__container"
    );
    const detailsNode = rootNode.querySelector(
      ".FeaturedCardPropertyInformation__detailsCopyContainer, .StandardPropertyInfo__detailsContainer, .StandardPropertyInfo__detailsContainerNoBranding"
    );

    return {
      detailsNode,
      href: link.href,
      linkNode: link,
      rootNode,
      transactionType
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
    const linkNode = rootNode.querySelector(".search_result_title_box h2 a");

    return {
      detailsNode,
      href: linkNode.href,
      linkNode,
      rootNode,
      transactionType
    };
  });

  return rentCards;
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
  const sibling = cardInfo.rootNode.nextElementSibling;
  const existingNode =
    sibling && sibling.getAttribute("data-df") === "controls" ? sibling : null;

  if (existingNode) {
    // Already added
    if (force === true) {
      existingNode.parentNode.removeChild(existingNode);
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
      <button class="df-button df-details">Show Details</button>
      <button class="df-button df-photos">Show Photos</button>
     </div>`;

  const frag = document.createElement("div");
  frag.setAttribute("data-df", "controls");
  frag.className = "df-controls-wrapper";
  frag.innerHTML = controls;

  frag.querySelector(".df-hide").addEventListener("click", () => {
    toggleHideCard(cardInfo);
  });

  frag.querySelector(".df-notes").addEventListener("click", () => {
    toggleNotes(cardInfo);
  });

  frag.querySelector(".df-details").addEventListener("click", evt => {
    console.log("toggleDetails");
    const isShown = toggleDetails(cardInfo);
    evt.target.textContent = isShown ? "Hide Details" : "Show Details";
  });

  frag.querySelector(".df-photos").addEventListener("click", () => {
    showPhotos(cardInfo);
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

  notesFrag.querySelector(".df-notes-text").addEventListener("change", evt => {
    saveNotes(cardInfo, evt.target.value);
  });

  // cardInfo.detailsNode.appendChild(frag);
  insertAfter(frag, cardInfo.rootNode);
  const notesNode = notesFrag.firstElementChild;
  frag.appendChild(notesNode);

  cardInfo.notesNode = notesNode;
  cardInfo.controlsNode = frag;
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
  const notesNode = cardInfo.notesNode;
  notesNode.classList.toggle("shown");
}

function toggleDetails(cardInfo) {
  let detailsNode = cardInfo.extraDetailsNode;

  if (!detailsNode) {
    cardInfo.extraDetailsNode = detailsNode = document.createElement("div");
    detailsNode.innerHTML = "Loading ...";
    detailsNode.className = "df-details-container";
    cardInfo.controlsNode.appendChild(cardInfo.extraDetailsNode);

    const errMsg =
      "Sorry, something went wrong, we could not get the property details";

    fetchPropertyDetails(cardInfo)
      .then(content => {
        detailsNode.innerHTML = content || errMsg;
      })
      .catch(() => {
        detailsNode.innerHTML = errMsg;
      });
  }

  cardInfo.extraDetailsNode.classList.toggle("shown");
  return cardInfo.extraDetailsNode.classList.contains("shown");
}

function showPhotos(cardInfo) {
  fetchPageBody(cardInfo).then(frag => {
    console.log("showPhotos, ", frag);
    const script = Array.from(frag.querySelectorAll("notscript")).filter(
      node => {
        return node.textContent.indexOf("pb_media") > -1;
      }
    )[0];

    if (script) {
      const urls = script.textContent
        .split("\n")
        .filter(line => {
          // Only use the lines that contain a url
          return line.indexOf("http") > -1;
        })
        .map(line => {
          // start the string at http, end just before the last double quote, e.g.
          // , "http://some.domain/foo.jpg",
          return line.substring(
            line.indexOf('"') + 1,
            line.lastIndexOf('"') - 1
          );
        });

      const modal = document.createElement("div");
      modal.className = "df-modal";

      function keyCloseListener(evt) {
        // ESC key
        if (evt.keyCode === 27) {
          removeModal();
        }
      }

      function removeModal() {
        modal.parentNode.removeChild(modal);
        document.body.removeEventListener("keydown", keyCloseListener, false);
      }

      document.body.addEventListener("keydown", keyCloseListener, false);

      const images = urls.map(url => {
        const img = document.createElement("img");
        img.src = url;
        img.className = "df-img";
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

      images.forEach(img => {
        const div = document.createElement("div");
        div.appendChild(img);
        div.className = "df-img-wrapper";

        modal.appendChild(div);
      });

      modal.addEventListener(
        "click",
        evt => {
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

function saveNotes(cardInfo, textValue, skipServerSave) {
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
      body: formData
    });
  }
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

  chrome.storage.local.get(keys, function(result) {
    propertyMetadata = result;
    completeCount++;

    possiblyCallback();
  });

  chrome.storage.local.get(["global-controls"], function(result) {
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
    // Only write objects that actually have something in them
    if (Object.keys(propertyMetadata[key]).length > 0) {
      obj[key] = propertyMetadata[key];
    }
  });
  obj["global-controls"] = globalControls;

  chrome.storage.local.set(obj, function() {
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
  const counterNode = node.querySelector(".sr_counter");
  if (counterNode) {
    const text = counterNode.textContent
      .split(".")
      .join("")
      .trim();
    return parseInt(text, 10);
  }
  return -1;
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

function fixUpImageScript(script) {
  script = script
    .split("\n")
    .map(line => {
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
      .then(res => res.text())
      .then(html => sanitizeHtml(html))
      .then(html => extractPageContent(html));
  });

  Promise.all(promises).then(pages => {
    if (pages.length > 0) {
      const cardWrapper = allCards[0].rootNode.parentNode;

      // Collect <script> tags right after the cards that are used in the homes to buy section
      // to properly load the images
      const allScripts = [];
      // let pageScripts = '';
      const firstCardIndex = getCardIndex(allCards[0].rootNode);

      pages.forEach((pageInfo, idx) => {
        const { nodes, scripts } = pageInfo;
        nodes.forEach(node => {
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
        scripts.forEach(script => allScripts.push(fixUpImageScript(script)));
      });

      // Add the card controls to the newly inserted property cards.
      initCards();

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
      .then(resp => resp.text())
      .then(html => sanitizeHtml(html))
      .then(html => {
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
  return fetchPageBody(cardInfo).then(frag => {
    const propertyDetailsNodes = frag.querySelectorAll(
      ".PropertyDescription__propertyDescription, .PropertyFeatures__featuresList, #smi-tab-overview"
    );
    if (propertyDetailsNodes) {
      return Array.from(propertyDetailsNodes)
        .map(node => node.innerHTML)
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
  cards.forEach(node => {
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
    scripts: scripts
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
      evt => {
        const href = "https://www.daft.ie" + window.location.pathname;
        saveNotes({ href }, textarea.value.trim(), true);
      },
      true
    );
  }
}

if (isSupportedPageType()) {
  readStorage(findCards(), () => {
    initCards();
    hideCards();
    refreshUI();
    autoExpandPropertyDescription();
    addChangeListener();
    prefetchPages();
  });
} else {
  storeNoteFromDaftForm();
}
