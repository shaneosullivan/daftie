/**
 * State management for the popup
 * @type {Object}
 * @property {boolean} hiddenEnabled - Whether the hidden properties should be shown
 * @property {string[]} hideList - List of properties to hide
 * @property {number} hiddenCount - Number of hidden properties
 */
let state = {
  hiddenEnabled: true,
  hideList: [],
  hiddenCount: 0,
};

/**
 * Updates the UI to reflect the current state
 * @returns {void}
 */
function updateUI() {
  const toggleText = document.getElementById("toggleHiddenText");
  const hideListInput = document.getElementById("hideList");

  // Update toggle button text
  toggleText.textContent = state.hiddenEnabled
    ? `Show ${state.hiddenCount} hidden`
    : `Hide ${state.hiddenCount}`;

  // Update hide list input
  hideListInput.value = state.hideList.join(", ");
}

/**
 * Notifies the content script of updated settings
 * @returns {Promise<void>}
 */
async function notifyContentScript() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: "settingsUpdated",
      settings: {
        hiddenEnabled: state.hiddenEnabled,
        hideList: state.hideList,
      },
    });
  }
}

/**
 * Loads settings from chrome.storage and updates the UI
 * @returns {void}
 */
async function loadSettings() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tab?.id) {
      // Get current count from content script
      chrome.tabs.sendMessage(
        tab.id,
        { type: "getHiddenCount" },
        (response) => {
          if (response) {
            state.hiddenCount = response.count;
            updateUI();
          }
        }
      );
    }
  } catch (error) {
    console.error("Failed to load settings:", error);
  }
}

/**
 * Saves current settings to chrome.storage
 * @returns {Promise<void>}
 */
async function saveSettings() {
  try {
    await chrome.storage.local.set({
      "global-controls": {
        hiddenEnabled: state.hiddenEnabled,
        hideList: state.hideList,
      },
    });
  } catch (error) {
    console.error("Failed to save settings:", error);
  }
}

/**
 * Toggles the hidden state and updates storage
 * @returns {void}
 */
async function toggleHidden() {
  state.hiddenEnabled = !state.hiddenEnabled;
  await saveSettings();
  updateUI();
  await notifyContentScript();
}

/**
 * Updates the hide list based on user input
 * @param {Event} event - The input change event
 * @returns {void}
 */
async function updateHideList(event) {
  state.hideList = event.target.value
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);

  await saveSettings();
  await notifyContentScript();
}

// Initialize popup
document.addEventListener("DOMContentLoaded", () => {
  // Load initial settings
  loadSettings();

  // Add event listeners
  document
    .getElementById("toggleHidden")
    .addEventListener("click", toggleHidden);
  document
    .getElementById("hideList")
    .addEventListener("change", updateHideList);
});
