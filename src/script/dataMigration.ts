import { getVersion, isVersionOlder } from './lib/helper';
import WebConfig from './webConfig';

export default class DataMigration {
  cfg: WebConfig;

  // Only append so the order stays the same (oldest first).
  static readonly migrations = new Map([
    ['1.0.13', 'moveToNewWordsStorage'],
    ['1.1.0', 'sanitizeWords'],
    ['1.2.0', 'singleWordSubstitution'],
    ['2.1.4', 'updateDefaultSubs'],
    ['2.3.0', 'fixSmartWatch'],
  ]);

  constructor(config) {
    this.cfg = config;
  }

  static async build() {
    let cfg = await WebConfig.build();
    return new DataMigration(cfg);
  }

  static latestMigration(): string {
    return Array.from(DataMigration.migrations)[DataMigration.migrations.size - 1][0];
  }

  static migrationNeeded(oldVersion: string): boolean {
    return isVersionOlder(getVersion(oldVersion), getVersion(DataMigration.latestMigration()));
  }

  // This will look at the version (from before the update) and perform data migrations if necessary
  byVersion(oldVersion: string) {
    let version = getVersion(oldVersion) as Version;
    let migrated = false;
    for (let [migrationVersion, migrationName] of DataMigration.migrations) {
      if (isVersionOlder(version, getVersion(migrationVersion))) {
        migrated = true;
        this[migrationName]();
      }
    }

    return migrated;
  }

  // [2.3.0]
  fixSmartWatch() {
    let cfg = this.cfg;
    let originalWord = 'twat';
    let originalWordConf = { matchMethod: 1, repeat: true, sub: 'dumbo' };
    let update = {
      twat: { matchMethod: 0, repeat: true, sub: 'dumbo' },
      twats: { matchMethod: 0, repeat: true, sub: 'dumbos' }
    };

    if (cfg.words[originalWord]
      && cfg.words[originalWord].matchMethod == originalWordConf.matchMethod
      && cfg.words[originalWord].sub == originalWordConf.sub
    ) {
      Object.keys(update).forEach(word => {
        cfg.words[word] = update[word];
      });
    }
  }

  // [1.0.13] - updateRemoveWordsFromStorage - transition from previous words structure under the hood
  moveToNewWordsStorage() {
    chrome.storage.sync.get({'words': null}, function(oldWords) {
      if (oldWords.words) {
        chrome.storage.sync.set({'_words0': oldWords.words}, function() {
          if (!chrome.runtime.lastError) {
            chrome.storage.sync.remove('words', function() {
              // Removed old words
            });
          }
        });
      }
    });
  }

  runImportMigrations() {
    this.sanitizeWords(); // 1.1.0
    this.singleWordSubstitution(); // 1.2.0
    this.updateDefaultSubs(); // 2.1.4
  }

  // [1.1.0] - Downcase and trim each word in the list (NOTE: This MAY result in losing some words)
  sanitizeWords() {
    this.cfg.sanitizeWords();
  }

  // [1.2.0] - Change from a word having many substitutions to a single substitution ({words: []} to {sub: ''})
  singleWordSubstitution() {
    let cfg = this.cfg;

    // console.log('before', JSON.stringify(cfg.words));
    Object.keys(cfg.words).forEach(word => {
      let wordObj = cfg.words[word] as WordOptions;
      if (wordObj.hasOwnProperty('words')) {
        // @ts-ignore: Old 'words' doesn't exist on Interface.
        wordObj.sub = wordObj.words[0] || '';
        // @ts-ignore: Old 'words' doesn't exist on Interface.
        delete wordObj.words;
      }
    });
    // console.log('after', JSON.stringify(cfg.words));
  }

  // [2.1.4] - Update default sub values
  updateDefaultSubs() {
    let cfg = this.cfg;
    let updatedWords = {
      bastard: {original: 'jerk', update: 'idiot'},
      bitch: {original: 'jerk', update: 'bench'},
      cocksucker: {original: 'idiot', update: 'suckup'},
      cunt: {original: 'explative', update: 'expletive' },
      fag: {original: 'slur', update: 'gay'},
      faggot: {original: 'slur', update: 'gay'},
      fags: {original: 'slur', update: 'gays'},
      fuck: { original: 'fudge', update: 'freak' },
      goddammit: {original: 'goshdangit', update: 'dangit'},
      jackass: {original: 'idiot', update: 'jerk'},
      nigga: {original: 'ethnic slur', update: 'bruh'},
      nigger: {original: 'ethnic slur', update: 'man'},
      niggers: {original: 'ethnic slurs', update: 'people'},
      tits: {original: 'explative', update: 'chest'},
      twat: {original: 'explative', update: 'dumbo'},
    };

    Object.keys(updatedWords).forEach(updatedWord => {
      if (cfg.words[updatedWord]) {
        let wordObj = cfg.words[updatedWord] as WordOptions;
        if (wordObj.sub == updatedWords[updatedWord].original) {
          wordObj.sub = updatedWords[updatedWord].update;
        }
      }
    });
  }
}