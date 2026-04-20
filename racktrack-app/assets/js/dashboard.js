document.addEventListener("DOMContentLoaded", () => {
  window.RackTrack.setupEvents();

  if (window.RackTrackInventoryPanel) {
    window.RackTrackInventoryPanel.setupInventoryEvents();
    window.RackTrackInventoryPanel.switchInventoryTab("items");
  }

  window.RackTrack.refreshAll();
});