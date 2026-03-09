// background.js - Service worker for CamVlog

let recordingState = {
  isRecording: false,
  startTime: null,
};

// Open recorder in a full tab when extension icon is clicked
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SET_RECORDING_STATE") {
    recordingState = { ...recordingState, ...message.payload };
    sendResponse({ success: true });
  }

  if (message.type === "GET_RECORDING_STATE") {
    sendResponse(recordingState);
  }
});
