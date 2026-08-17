/* CommandEditor browser extension — background service worker (MV3)
 *
 * Privacy model (mirrors the site):
 *   - No host_permissions: the extension never reads page content.
 *   - No analytics, no remote code, no network calls of its own.
 *   - The only thing it does: take the URL of a link you right-clicked and
 *     open commandeditor.com/?import=<url>. The site then fetches the PDF
 *     bytes directly into your browser and processes them locally.
 */
const MENU_ID = 'ce-open-in-commandeditor';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Open in CommandEditor',
    contexts: ['link', 'page', 'image'],
    // Only offer the menu where a PDF (or convertible image) is plausible
    targetUrlPatterns: ['*://*/*.pdf', '*://*/*.PDF'],
  });
  chrome.contextMenus.create({
    id: 'ce-open-page',
    title: 'Edit this page as PDF in CommandEditor',
    contexts: ['page'],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && info.linkUrl) {
    chrome.tabs.create({
      url: 'https://commandeditor.com/?import=' + encodeURIComponent(info.linkUrl),
    });
  } else if (info.menuItemId === MENU_ID && info.pageUrl && info.pageUrl.toLowerCase().split('?')[0].endsWith('.pdf')) {
    chrome.tabs.create({
      url: 'https://commandeditor.com/?import=' + encodeURIComponent(info.pageUrl),
    });
  } else if (info.menuItemId === MENU_ID) {
    // Clicked on a non-PDF page — just open the toolkit
    chrome.tabs.create({ url: 'https://commandeditor.com/' });
  } else if (info.menuItemId === 'ce-open-page' && tab && tab.url) {
    // Send the user to Print-to-PDF with the page URL pre-noted
    chrome.tabs.create({
      url: 'https://commandeditor.com/?tool=printpdf&from=' + encodeURIComponent(tab.url),
    });
  }
});
