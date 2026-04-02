// ==UserScript==
// @name         Viggo Element Table -> Excel
// @namespace    http://tampermonkey.net/
// @version      4.2
// @description  Loader - henter seneste kode fra GitHub ved hver sideindlæsning
// @match        https://eeskole.viggo.dk/SchedulePlanning/SetupElement*
// @match        https://*.viggo.dk/SchedulePlanning/SetupElement*
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @connect      raw.githubusercontent.com
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_URL = 'https://raw.githubusercontent.com/qvisty/Browsermonkey/main/viggo-excel.js';

  GM_xmlhttpRequest({
    method: 'GET',
    url: SCRIPT_URL + '?t=' + Date.now(),
    onload: function (response) {
      if (response.status === 200) {
        try {
          const fn = new Function('GM_registerMenuCommand', response.responseText);
          fn(GM_registerMenuCommand);
        } catch (e) {
          console.error('[Viggo Excel Loader] Fejl ved kørsel af script:', e);
        }
      } else {
        console.error('[Viggo Excel Loader] Kunne ikke hente script:', response.status);
      }
    },
    onerror: function (e) {
      console.error('[Viggo Excel Loader] Netværksfejl:', e);
    }
  });
})();
