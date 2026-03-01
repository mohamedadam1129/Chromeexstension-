let tweetsData = [];
let isRedirectMode = false; // Flag to track if we need to redirect user

// --- 1. TRACKING CONFIGURATION (FILL THESE IN) ---
const GA_MEASUREMENT_ID = 'G-C9EZLVWGPF'; // <--- REPLACE THIS
const GA_API_SECRET = 'rqRSn3aZTrudtMUM5JtYPA';  // <--- REPLACE THIS (From GA4 Admin)

// Helper function to send events to Google Analytics
function sendEvent(eventName) {
  fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`, {
    method: "POST",
    body: JSON.stringify({
      client_id: "extension_user",
      events: [{
        name: eventName,
        params: { engagement_time_msec: "100" }
      }]
    })
  }).catch(err => console.error("Tracking Error:", err));
}

// Listen for messages from content.js
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "new_tweet") {
    addTweetToUI(request.data);
  } else if (request.action === "scan_complete") {
    finishScan();
  }
});

// GET UI ELEMENTS
const scanBtn = document.getElementById("scanBtn");
const downloadBtn = document.getElementById("downloadBtn");
const btnNotebookLM = document.getElementById("btnNotebookLM");
const resetBtn = document.getElementById("resetBtn");
const placeholder = document.getElementById("placeholder");
const resultsArea = document.getElementById("results-area");

// HIDE DOWNLOAD BUTTONS INITIALLY
downloadBtn.style.display = "none";
if (btnNotebookLM) btnNotebookLM.style.display = "none";
resetBtn.style.display = "none";

// --- 2. SMART REDIRECT CHECK (RUNS ON OPEN) ---
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  const currentUrl = tabs[0].url || "";
  
  // Check if user is on the correct bookmarks page (supports twitter.com and x.com)
  const isBookmarksPage = currentUrl.includes("twitter.com/i/bookmarks") || currentUrl.includes("x.com/i/bookmarks");

  if (!isBookmarksPage) {
    // If NOT on bookmarks, change button to Redirect Mode
    scanBtn.innerText = "Go to Bookmarks";
    placeholder.innerText = "You need to be on your Twitter Bookmarks page to use this tool.";
    isRedirectMode = true;
  }
});

// --- 3. SCAN / REDIRECT BUTTON LOGIC ---
scanBtn.addEventListener("click", () => {
  
  // CASE A: User is on wrong page -> Redirect them
  if (isRedirectMode) {
    chrome.tabs.update({ url: "https://x.com/i/bookmarks" });
    window.close(); // Close popup so they can see the page loading
    return;
  }

  // CASE B: User is on correct page -> Start Scan
  // 1. Send Tracking Event
  console.log("Tracking: Scan Started");
  sendEvent("scan_started");

  // 2. Update UI
  placeholder.style.display = "none";
  scanBtn.innerText = "Scanning... (Keep Open)";
  scanBtn.disabled = true;
  scanBtn.style.gridColumn = "span 2"; 

  // 3. Inject Content Script
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.scripting.executeScript({
      target: { tabId: tabs[0].id },
      files: ["content.js"]
    });
  });
});

function addTweetToUI(tweet) {
  tweetsData.push(tweet);
  document.getElementById("count").innerText = tweetsData.length;

  const div = document.createElement("div");
  div.className = "tweet-card";
  div.innerHTML = `
    <div class="tweet-header">
      <div>
        <span class="t-user">${tweet.user}</span>
        <span class="t-handle">${tweet.handle}</span>
      </div>
      <span class="t-date">${tweet.date.substring(0, 10)}</span>
    </div>
    <div class="t-text">${tweet.text.substring(0, 140)}...</div>
  `;
  resultsArea.insertBefore(div, resultsArea.firstChild);
}

function finishScan() {
  scanBtn.style.display = "none"; 
  resetBtn.style.display = "block";
  downloadBtn.style.display = "block";
  if (btnNotebookLM) btnNotebookLM.style.display = "block";
}

// --------------------------------------------------------
// OPTION 1: STANDARD CSV EXPORT
// --------------------------------------------------------
downloadBtn.addEventListener("click", () => {
  // 1. Send Tracking Event
  console.log("Tracking: CSV Download");
  sendEvent("download_csv_clicked");

  let csvContent = "\uFEFFUser,Handle,Date,Text,URL\n"; 
  tweetsData.forEach(t => {
    const safeText = t.text.replace(/"/g, '""').replace(/[\r\n]+/g, " ");
    csvContent += `"${t.user}","${t.handle}","${t.date}","${safeText}","${t.url}"\n`;
  });
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `twitter_bookmarks_export.csv`);
  document.body.appendChild(link);
  link.click();
});

// Reset Logic
resetBtn.addEventListener("click", () => {
  location.reload(); 
});

// --------------------------------------------------------
// OPTION 2: NOTEBOOKLM (AI) EXPORT
// --------------------------------------------------------
if (btnNotebookLM) {
  btnNotebookLM.addEventListener('click', () => {
    
    // 1. Send Tracking Event
    console.log("Tracking: NotebookLM Export");
    sendEvent("notebooklm_clicked");

    if (tweetsData && tweetsData.length > 0) {
      exportToNotebookLM(tweetsData);
    } else {
      alert("No bookmarks found! Please scan first.");
    }
  });
}

function exportToNotebookLM(bookmarks) {
  let content = `# TWITTER BOOKMARK ARCHIVE (AI-OPTIMIZED)\n\n`;
  content += `> **SYSTEM INSTRUCTION:** This file contains saved tweets. When answering questions, prioritize the content in the 'Tweet Text' sections. Group related tweets if they look like a thread.\n\n`;
  content += `---\n\n`;

  bookmarks.forEach(tweet => {
    const cleanText = tweet.text ? tweet.text.replace(/\s+/g, ' ').trim() : "Image/Video Only";
    const user = tweet.user || 'Unknown User';
    const handle = tweet.handle || 'Unknown Handle';
    const date = tweet.date || 'No Date';
    const url = tweet.url || '#';

    content += `## Tweet by ${user} (${handle}) - ${date}\n`;
    content += `**Tweet Text:**\n${cleanText}\n\n`;
    content += `**Source:** ${url}\n`;
    content += `\n---\n\n`; 
  });

  const blob = new Blob([content], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  
  const timestamp = new Date().toISOString().slice(0,10);
  a.download = `Twimark_Drag_This_To_NotebookLM_${timestamp}.md`;
  
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);

  setTimeout(() => {
    chrome.tabs.create({ url: 'https://notebooklm.google.com/' });
  }, 500); 
}