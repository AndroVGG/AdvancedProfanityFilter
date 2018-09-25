import { arrayContains, getVersion, isVersionOlder } from './lib/helper.js';
import WebConfig from './webConfig.js';
import Domain from './domain.js';

interface Version {
  major: number,
  minor: number,
  patch: number
}

////
// Actions and messaging

// Actions for extension install or upgrade
chrome.runtime.onInstalled.addListener(function(details){
  if (details.reason == 'install') {
    chrome.runtime.openOptionsPage();
  } else if (details.reason == 'update') {
    // var thisVersion = chrome.runtime.getManifest().version;
    // console.log('Updated from ' + details.previousVersion + ' to ' + thisVersion);

    // Open options page to show new features
    // chrome.runtime.openOptionsPage();

    // Run any data migrations on update
    updateMigrations(details.previousVersion);

    // Display update notification
    chrome.notifications.create('extensionUpdate', {
      'type': 'basic',
      'title': 'Advanced Profanity Filter',
      'message': 'Update installed, click for changelog.',
      'iconUrl': 'icons/icon64.png',
      'isClickable': true,
    });
  }
});

// Show badge with number of words filtered
chrome.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
    if (request.disabled === true) {
      chrome.browserAction.setIcon({path: 'icons/icon19-disabled.png', tabId: sender.tab.id});
    } else {
      if (request.counter) {
        chrome.browserAction.setBadgeText({text: request.counter, tabId: sender.tab.id});
      }

      if (request.advanced === true) {
        chrome.browserAction.setBadgeBackgroundColor({ color: [211, 45, 39, 255] }); // Red - Advanced
      } else if (request.advanced === false) {
        chrome.browserAction.setBadgeBackgroundColor({ color: [66, 133, 244, 255] }); // Blue - Normal
      }
    }
  }
);

////
// Context menu
//
// Add selected word/phrase and reload page (unless already present)
async function addSelection(selection: string) {
  let cfg = await WebConfig.build(); // TODO: Only need words here
  let result = cfg.addWord(selection);

  if (result) {
    let saved = await cfg.save();
    if (!saved) { chrome.tabs.reload(); }
  }
}

// Disable domain and reload page (unless already disabled)
async function disableDomain(cfg: WebConfig, domain: string, key: string) {
  if (!arrayContains(cfg[key], domain)) {
    cfg[key].push(domain);
    let result = await cfg.save();
    if (!result) { chrome.tabs.reload(); }
  }
}

// Remove all entries that disable the filter for domain
async function enableDomain(cfg: WebConfig, domain: string, key: string) {
  let newDomainList = Domain.removeFromList(domain, cfg[key]);

  if (newDomainList.length < cfg[key].length) {
    cfg[key] = newDomainList;
    let result = await cfg.save();
    if (!result) { chrome.tabs.reload(); }
  }
}

async function toggleDomain(domain: string, key: string) {
  let cfg = await WebConfig.build([key]);
  Domain.domainMatch(domain, cfg[key]) ? enableDomain(cfg, domain, key) : disableDomain(cfg, domain, key);
}

// This will look at the version (from before the update) and perform data migrations if necessary
// Only append so the order stays the same (oldest first).
async function updateMigrations(previousVersion) {
  let old = getVersion(previousVersion) as Version;
  // let current = chrome.runtime.getManifest().version

  // [1.0.13] - updateRemoveWordsFromStorage - transition from previous words structure under the hood
  if (isVersionOlder(old, getVersion('1.0.13'))) {
    // Note: using promise instead of async/await
    chrome.storage.sync.get({'words': null}, function(oldWords) {
      // console.log('Old words for migration:', oldWords.words);
      if (oldWords.words) {
        chrome.storage.sync.set({'_words0': oldWords.words}, function() {
          if (!chrome.runtime.lastError) {
            chrome.storage.sync.remove('words', function() {
              // Split words if necessary
              var wordsPromise = new Promise(function(resolve, reject) {
                resolve(WebConfig.build());
              });
              wordsPromise
                .then(function(response: WebConfig) {
                  response.save();
                });
            });
          }
        });
      }
    });
  }

  // [1.1.0] - Downcase and trim each word in the list (NOTE: This MAY result in losing some words)
  if (isVersionOlder(old, getVersion('1.1.0'))) {
    let cfg = await WebConfig.build();
    cfg.sanitizeWords();
    cfg.save();
  }

  // [1.2.0] - Change from a word having many substitutions to a single substitution
  if (isVersionOlder(old, getVersion('1.1.3'))) {
    let cfg = await WebConfig.build();
    // console.log('before', JSON.stringify(cfg.words));
    Object.keys(cfg.words).forEach(word => {
      let wordObj = cfg.words[word];
      if (wordObj.hasOwnProperty('words')) {
        // @ts-ignore
        wordObj.sub = wordObj.words[0] || '';
        // @ts-ignore
        delete wordObj.words;
      }
    });
    // console.log('after', JSON.stringify(cfg.words));
    cfg.save();
  }
}

////
// Menu Items
chrome.contextMenus.removeAll(function() {
  chrome.contextMenus.create({
    id: 'addSelection',
    title: 'Add selection to filter',
    contexts: ['selection']
  });

  chrome.contextMenus.create({
    id: 'toggleFilterForDomain',
    title: 'Toggle filter for domain',
    contexts: ['all']
  });

  chrome.contextMenus.create({
    id: 'toggleAdvancedModeForDomain',
    title: 'Toggle advanced mode for domain',
    contexts: ['all']
  });

  chrome.contextMenus.create({
    id: 'options',
    title: 'Options',
    contexts: ['page', 'selection']
  });
});

////
// Listeners
chrome.contextMenus.onClicked.addListener(function(info, tab) {
  switch(info.menuItemId) {
    case 'addSelection':
      addSelection(info.selectionText); break;
    case 'toggleFilterForDomain': {
      let url = new URL(tab.url);
      toggleDomain(url.hostname, 'disabledDomains'); break;
    }
    case 'toggleAdvancedModeForDomain': {
      let url = new URL(tab.url);
      toggleDomain(url.hostname, 'advancedDomains'); break;
    }
    case 'options':
      chrome.runtime.openOptionsPage(); break;
  }
});

chrome.notifications.onClicked.addListener(function(notificationId) {
  switch(notificationId) {
    case 'extensionUpdate':
      chrome.notifications.clear('extensionUpdate');
      chrome.tabs.create({url: 'https://github.com/richardfrost/AdvancedProfanityFilter/releases'});
      break;
  }
});
