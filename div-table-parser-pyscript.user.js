// ==UserScript==
// @name         Div Table Parser (PyScript + BeautifulSoup4)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Uses PyScript/Pyodide to run BeautifulSoup4 in-browser for parsing div-based tables
// @match        *://*/*
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  let pyodideReady = false;
  let pyodideInstance = null;

  /**
   * Loads Pyodide + installs beautifulsoup4 via micropip.
   * Returns the pyodide instance once ready.
   */
  async function ensurePyodide() {
    if (pyodideInstance) return pyodideInstance;

    // Load Pyodide from CDN
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

    pyodideReady = true;
    console.log('[Div Table Parser] Pyodide + BeautifulSoup4 ready');
    return pyodideInstance;
  }

  /**
   * Runs the BeautifulSoup4 parser on the current page HTML.
   * Returns parsed table data as a JS object.
   */
  async function parseDivTables() {
    const pyodide = await ensurePyodide();

    // Pass the current page HTML into Python
    pyodide.globals.set('page_html', document.documentElement.outerHTML);

    const result = pyodide.runPython(`
import json
from bs4 import BeautifulSoup

soup = BeautifulSoup(page_html, 'html.parser')

# Heuristics for finding div-based tables:
# 1. Elements with role="table", role="grid"
# 2. Common CSS class patterns: .table, .grid-table, .data-table, .datagrid
# 3. Structures with role="row" / role="cell" children

TABLE_SELECTORS = [
    '[role="table"]',
    '[role="grid"]',
    '.table:not(table)',
    '.grid-table',
    '.data-table',
    '.datagrid',
]

ROW_SELECTORS = [
    '[role="row"]',
    '.row', '.tr', '.grid-row',
]

CELL_SELECTORS = [
    '[role="cell"]',
    '[role="columnheader"]',
    '[role="gridcell"]',
    '.cell', '.td', '.th', '.grid-cell',
]

def find_tables(soup):
    """Find div-based table containers."""
    tables = []
    for sel in TABLE_SELECTORS:
        tables.extend(soup.select(sel))
    # Deduplicate (preserve order)
    seen = set()
    unique = []
    for t in tables:
        tid = id(t)
        if tid not in seen:
            seen.add(tid)
            unique.append(t)
    return unique

def find_rows(table_el):
    """Find row elements inside a table container."""
    for sel in ROW_SELECTORS:
        # Try direct children first
        rows = table_el.select(f':scope > {sel}')
        if not rows:
            rows = table_el.select(sel)
        if rows:
            return rows
    # Fallback: direct child divs that themselves contain multiple child divs
    children = [c for c in table_el.children if getattr(c, 'name', None) == 'div']
    if children and all(len(list(c.children)) > 1 for c in children[:3]):
        return children
    return []

def find_cells(row_el):
    """Find cell elements inside a row."""
    for sel in CELL_SELECTORS:
        cells = row_el.select(f':scope > {sel}')
        if not cells:
            cells = row_el.select(sel)
        if cells:
            return [c.get_text(strip=True) for c in cells]
    # Fallback: direct child divs/spans
    children = [c for c in row_el.children if getattr(c, 'name', None) in ('div', 'span')]
    if children:
        return [c.get_text(strip=True) for c in children]
    return []

def detect_header(rows_data):
    """Heuristic: first row is header if its content differs in character (e.g. all non-numeric)."""
    if len(rows_data) < 2:
        return [], rows_data
    first = rows_data[0]
    rest = rows_data[1:]
    # If first row values are all non-empty and none are purely numeric, treat as header
    if first and all(v and not v.replace('.','').replace(',','').isdigit() for v in first):
        return first, rest
    return [], rows_data

def parse_all():
    tables = find_tables(soup)
    results = []
    for table_el in tables:
        rows = find_rows(table_el)
        if not rows:
            continue
        rows_data = [find_cells(r) for r in rows]
        rows_data = [r for r in rows_data if r]  # skip empty rows
        if not rows_data:
            continue
        headers, data_rows = detect_header(rows_data)
        results.append({'headers': headers, 'rows': data_rows})
    return results

output = parse_all()
json.dumps(output, ensure_ascii=False)
    `);

    return JSON.parse(result);
  }

  /**
   * Converts parsed table data to CSV string.
   */
  function toCSV(tableData) {
    const escape = (val) => {
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        return `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    };

    const lines = [];
    if (tableData.headers.length > 0) {
      lines.push(tableData.headers.map(escape).join(','));
    }
    for (const row of tableData.rows) {
      lines.push(row.map(escape).join(','));
    }
    return lines.join('\n');
  }

  /**
   * Converts parsed table data to JSON array of objects.
   */
  function toJSON(tableData) {
    if (tableData.headers.length === 0) {
      return tableData.rows;
    }
    return tableData.rows.map((row) => {
      const obj = {};
      tableData.headers.forEach((header, i) => {
        obj[header] = row[i] ?? '';
      });
      return obj;
    });
  }

  /**
   * Shows a status notification on the page.
   */
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

  // --- Menu commands ---

  GM_registerMenuCommand('Parse div tables -> Console (PyScript)', async () => {
    showStatus('Loading Pyodide + BeautifulSoup4...');
    try {
      const tables = await parseDivTables();
      if (tables.length === 0) {
        alert('No div-based tables found on this page.');
        return;
      }
      tables.forEach((table, i) => {
        console.group(`[Div Table Parser] Table ${i + 1}`);
        if (table.headers.length > 0) console.log('Headers:', table.headers);
        console.table(
          table.rows.map((row) => {
            if (table.headers.length > 0) {
              const obj = {};
              table.headers.forEach((h, j) => (obj[h] = row[j] ?? ''));
              return obj;
            }
            return row;
          })
        );
        console.groupEnd();
      });
      showStatus(`Found ${tables.length} table(s) - check console (F12)`);
    } catch (e) {
      console.error('[Div Table Parser]', e);
      alert('Error: ' + e.message);
    }
  });

  GM_registerMenuCommand('Parse div tables -> CSV clipboard (PyScript)', async () => {
    showStatus('Loading Pyodide + BeautifulSoup4...');
    try {
      const tables = await parseDivTables();
      if (tables.length === 0) { alert('No div-based tables found.'); return; }
      const csv = tables.map(toCSV).join('\n\n');
      GM_setClipboard(csv, 'text');
      showStatus(`CSV for ${tables.length} table(s) copied to clipboard`);
    } catch (e) {
      console.error('[Div Table Parser]', e);
      alert('Error: ' + e.message);
    }
  });

  GM_registerMenuCommand('Parse div tables -> JSON clipboard (PyScript)', async () => {
    showStatus('Loading Pyodide + BeautifulSoup4...');
    try {
      const tables = await parseDivTables();
      if (tables.length === 0) { alert('No div-based tables found.'); return; }
      const json = tables.map(toJSON);
      GM_setClipboard(JSON.stringify(json, null, 2), 'text');
      showStatus(`JSON for ${tables.length} table(s) copied to clipboard`);
    } catch (e) {
      console.error('[Div Table Parser]', e);
      alert('Error: ' + e.message);
    }
  });

  // Expose for console access
  unsafeWindow.__divTableParser = { parseDivTables, toCSV, toJSON };
})();
