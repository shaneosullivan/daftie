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
    ? `Showing ${state.hiddenCount} hidden`
    : `Hide ${state.hiddenCount}`;

  // Update hide list input
  hideListInput.value = state.hideList.join(", ");
}

/**
 * Loads settings from chrome.storage and updates the UI
 * @returns {void}
 */
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get([
      "global-controls",
      "hiddenCount",
    ]);
    const controls = result["global-controls"] || {};

    state = {
      hiddenEnabled: controls.hiddenEnabled !== false,
      hideList: controls.hideList || [],
      hiddenCount: result.hiddenCount || 0,
    };

    updateUI();
  } catch (error) {
    console.error("Failed to load settings:", error);
  }
}

/**
 * Saves current settings to chrome.storage
 * @returns {void}
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
