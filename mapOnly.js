// This script is only run on a page that has "df-map-view=1" in the url.
// It hides everything except the map on a page, for display in a popup
function showOnlyMapOnPage() {
  const mapNode = document.getElementById('smi_map_holder');
  const mapNodeLink = document.getElementById('smi-map-link');

  if (!mapNode || !mapNodeLink) {
    return;
  }

  mapNodeLink.click();

  let node = mapNode;

  // Starting from the map node, traverse up to the body node and remove every sibling at every
  // step that is not part of the path to the map node.  This makes the map be the only thing on the
  // page
  while (node !== document.body) {
    // Hide all siblings, then go up and do it again
    const parent = node.parentNode;
    Array.from(parent.childNodes).forEach(childNode => {
      if (childNode !== node) {
        parent.removeChild(childNode);
      }
    });

    // node.style.display = 'block !important';
    // console.log('set node to block', node);
    node = node.parentNode;
  }

  const mapWrapper = document.getElementById('smi-tab-map');
  const size = mapWrapper.getBoundingClientRect();

  // Make the body the same dimensions as the map.
  document.body.style.height = size.height + 'px';
  document.body.style.width = size.width + 'px';
  document.body.classList.add('df-map-only-page');
}

showOnlyMapOnPage();
