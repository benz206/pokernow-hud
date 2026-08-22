importScripts('/src/poker/evaluator.js', '/src/poker/equity.js');

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== 'analyze') return false;
  try {
    sendResponse(self.PokerEquity.analyze(msg.payload));
  } catch (err) {
    sendResponse({ error: String(err && err.message ? err.message : err) });
  }
  return false;
});
