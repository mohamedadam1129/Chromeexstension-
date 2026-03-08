(function() {
  const STORAGE_KEY = "latest_exported_tweet_id";
  const NO_NEW_THRESHOLD = 3;
  const SCROLL_PAUSE_MS = 1500;

  let seenIds = new Set();
  let noNewCount = 0;

  function getTweetIdAndUrl(article) {
    const link = article.querySelector('a[href*="/status/"]');
    if (!link) return null;
    const href = link.getAttribute("href") || "";
    const match = href.match(/\/status\/(\d+)/);
    if (!match) return null;
    const id = match[1];
    const base = window.location.origin;
    const path = href.startsWith("http") ? href : (base + (href.startsWith("/") ? href : "/" + href));
    return { id, url: path };
  }

  function scrape(article) {
    try {
      const idUrl = getTweetIdAndUrl(article);
      if (!idUrl) return null;

      const userEl = article.querySelector('div[data-testid="User-Name"]');
      const textEl = article.querySelector('div[data-testid="tweetText"]');
      const timeEl = article.querySelector("time");
      if (!userEl || !textEl) return null;

      const text = textEl.innerText;
      const tweetData = {
        id: idUrl.id,
        url: idUrl.url,
        user: userEl.innerText.split("\n")[0],
        handle: userEl.innerText.split("\n")[1] || "@unknown",
        date: timeEl ? timeEl.getAttribute("datetime") : new Date().toISOString(),
        text: text
      };
      return tweetData;
    } catch (e) {
      console.log(e);
      return null;
    }
  }

  function idLessOrEqual(currentId, watermarkId) {
    if (!currentId || !watermarkId) return false;
    return BigInt(currentId) <= BigInt(watermarkId);
  }

  function getTweetArticles() {
    return Array.from(document.querySelectorAll('article[data-testid="tweet"], article'));
  }

  function getScrollContainer() {
    const main = document.querySelector('main[role="main"]') || document.querySelector('[data-testid="primaryColumn"]');
    if (main) return main;
    return document.scrollingElement || document.documentElement;
  }

  function scrollDown() {
    const container = getScrollContainer();
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  async function runScan(mode) {
    let watermarkId = undefined;
    if (mode === "smart_sync") {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      watermarkId = result[STORAGE_KEY];
      if (watermarkId != null) watermarkId = String(watermarkId);
    }

    const collected = [];
    noNewCount = 0;
    seenIds = new Set();

    while (noNewCount < NO_NEW_THRESHOLD) {
      const articles = getTweetArticles();
      let newInRound = 0;

      for (const article of articles) {
        const idUrl = getTweetIdAndUrl(article);
        if (!idUrl) continue;
        const currentId = idUrl.id;
        if (seenIds.has(currentId)) continue;

        if (mode === "smart_sync" && watermarkId != null && idLessOrEqual(currentId, watermarkId)) {
          chrome.runtime.sendMessage({ action: "scan_complete" });
          if (collected.length > 0) {
            const newestId = collected[0].id;
            await chrome.storage.local.set({ [STORAGE_KEY]: newestId });
          }
          return;
        }

        const tweetData = scrape(article);
        if (!tweetData) continue;

        seenIds.add(currentId);
        newInRound++;
        collected.push(tweetData);
        chrome.runtime.sendMessage({ action: "new_tweet", data: tweetData });
      }

      if (newInRound === 0) {
        noNewCount++;
      } else {
        noNewCount = 0;
      }

      scrollDown();
      await new Promise(r => setTimeout(r, SCROLL_PAUSE_MS));
    }

    chrome.runtime.sendMessage({ action: "scan_complete" });
    if (collected.length > 0) {
      const newestId = collected[0].id;
      await chrome.storage.local.set({ [STORAGE_KEY]: newestId });
    }
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "start_scan" && request.mode) {
      runScan(request.mode).then(() => sendResponse({ ok: true })).catch(err => {
        console.error(err);
        sendResponse({ ok: false });
      });
      return true;
    }
  });
})();
