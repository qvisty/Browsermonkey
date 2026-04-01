// ==UserScript==
// @name         Viggo Element Table Parser (PyScript + BeautifulSoup4)
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Uses PyScript/Pyodide to run BeautifulSoup4 in-browser for parsing Viggo's div-based element tables
// @match        *://*/*SchedulePlanning/SetupElement*
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  let pyodideInstance = null;

  async function ensurePyodide() {
    if (pyodideInstance) return pyodideInstance;

    if (typeof loadPyodide === 'undefined') {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/pyodide/v0.27.4/full/pyodide.js';
        script.onload = resolve;
        script.onerror = () => reject(new Error('Failed to load Pyodide'));
        document.head.appendChild(script);
      });
    }

    pyodideInstance = await loadPyodide();
    await pyodideInstance.loadPackage('micropip');
    const micropip = pyodideInstance.pyimport('micropip');
    await micropip.install('beautifulsoup4');
    return pyodideInstance;
  }

  async function parseViggoTable() {
    const pyodide = await ensurePyodide();
    pyodide.globals.set('page_html', document.documentElement.outerHTML);

    const result = pyodide.runPython(`
import json
from bs4 import BeautifulSoup

soup = BeautifulSoup(page_html, 'html.parser')

# Find the element list: ul.list-icons.list-elements
table = soup.select_one('ul.list-icons.list-elements')
rows = []

if table:
    for li in table.select(':scope > li'):
        # Skip header row
        if 'h' in li.get('class', []):
            continue

        row_div = li.select_one(':scope > div')
        if not row_div:
            continue

        # Name: from div.name > a (first text node, not the .hint span)
        name_el = li.select_one('div.name a.ajaxModal')
        name = ''
        if name_el:
            # Get direct text content, excluding child elements like span.hint
            for child in name_el.children:
                if isinstance(child, str):
                    name += child
            name = name.strip()

        # Length (hours): from div.length
        length_el = li.select_one('div.length')
        length = ''
        if length_el:
            # Get text without the <small> tag content appended weirdly
            texts = []
            for child in length_el.children:
                if isinstance(child, str):
                    texts.append(child.strip())
                elif child.name == 'small':
                    texts.append(child.get_text(strip=True))
            length = ''.join(texts)

        # Preparation: from p.muted.preparation
        prep_el = li.select_one('p.muted.preparation')
        preparation = prep_el.get_text(strip=True) if prep_el else ''

        # Teachers: from div.teachers ul.list-icons li > p
        teacher_els = li.select('div.teachers ul.list-icons li p')
        teachers = [t.get_text(strip=True) for t in teacher_els]

        # Exceptions count
        exc_btn = li.select_one('a.exception-button')
        exceptions = ''
        if exc_btn:
            label = exc_btn.select_one('label')
            if label:
                exceptions = label.get_text(strip=True)

        rows.append({
            'Navn': name,
            'Længde': length,
            'Forberedelse': preparation,
            'Undervisere': ', '.join(teachers),
            'Undtagelser': exceptions,
        })

json.dumps(rows, ensure_ascii=False)
    `);

    return JSON.parse(result);
  }

  function toCSV(rows) {
    if (rows.length === 0) return '';
    const headers = Object.keys(rows[0]);
    const escape = (val) => {
      val = String(val);
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };
    const lines = [headers.map(escape).join(',')];
    for (const row of rows) {
      lines.push(headers.map((h) => escape(row[h])).join(','));
    }
    return lines.join('\n');
  }

  function showStatus(msg, duration = 3000) {
    const el = document.createElement('div');
    el.textContent = msg;
    Object.assign(el.style, {
      position: 'fixed', top: '10px', right: '10px', zIndex: '999999',
      background: '#333', color: '#fff', padding: '12px 20px',
      borderRadius: '8px', fontSize: '14px', fontFamily: 'sans-serif',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)', transition: 'opacity 0.3s',
    });
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, duration);
  }

  GM_registerMenuCommand('Viggo -> Console', async () => {
    showStatus('Indlæser Pyodide + BeautifulSoup4...');
    try {
      const rows = await parseViggoTable();
      if (rows.length === 0) { alert('Ingen elementer fundet.'); return; }
      console.table(rows);
      showStatus(`${rows.length} elementer logget til konsollen (F12)`);
    } catch (e) { console.error(e); alert('Fejl: ' + e.message); }
  });

  GM_registerMenuCommand('Viggo -> CSV (clipboard)', async () => {
    showStatus('Indlæser Pyodide + BeautifulSoup4...');
    try {
      const rows = await parseViggoTable();
      if (rows.length === 0) { alert('Ingen elementer fundet.'); return; }
      GM_setClipboard(toCSV(rows), 'text');
      showStatus(`CSV med ${rows.length} elementer kopieret til clipboard`);
    } catch (e) { console.error(e); alert('Fejl: ' + e.message); }
  });

  GM_registerMenuCommand('Viggo -> JSON (clipboard)', async () => {
    showStatus('Indlæser Pyodide + BeautifulSoup4...');
    try {
      const rows = await parseViggoTable();
      if (rows.length === 0) { alert('Ingen elementer fundet.'); return; }
      GM_setClipboard(JSON.stringify(rows, null, 2), 'text');
      showStatus(`JSON med ${rows.length} elementer kopieret til clipboard`);
    } catch (e) { console.error(e); alert('Fejl: ' + e.message); }
  });

  unsafeWindow.__viggoParser = { parseViggoTable, toCSV };
})();
