(async function() {
    let seenTweets = new Set();
    let noNewCount = 0;

    // Helper to scrape one article
    function scrape(article) {
        try {
            const userEl = article.querySelector('div[data-testid="User-Name"]');
            const textEl = article.querySelector('div[data-testid="tweetText"]');
            const timeEl = article.querySelector('time');
            
            if (!userEl || !textEl) return;

            const text = textEl.innerText;
            if (seenTweets.has(text)) return; // Skip duplicates

            seenTweets.add(text);

            const tweetData = {
                user: userEl.innerText.split('\n')[0],
                handle: userEl.innerText.split('\n')[1] || "@unknown",
                date: timeEl ? timeEl.getAttribute('datetime') : new Date().toISOString(),
                text: text
            };

            // SEND DATA TO POPUP
            chrome.runtime.sendMessage({ action: "new_tweet", data: tweetData });

            } catch (e) { console.log(e); }
        }
    })();
