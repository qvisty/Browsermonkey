// ==UserScript==
// @name         Div Table Parser
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Parses tables built with nested divs instead of <table> elements
// @match        *://*/*
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
  'use strict';

  // ============================================================
  // CONFIGURATION - Adjust these selectors to match your page
  // ============================================================
  const CONFIG = {
    // Selector for the table container
    tableSelector: '[role="table"], .table, .grid-table, .data-table',
    // Selector for each row (relative to table container)
    rowSelector: '[role="row"], .row, .tr, .grid-row',
    // Selector for each cell (relative to row)
    cellSelector: '[role="cell"], [role="columnheader"], .cell, .td, .th, .grid-cell',
    // If true, treats the first row as a header row
    firstRowIsHeader: true,
  };

  /**
   * Finds div-based tables on the page using CONFIG selectors.
   * Returns an array of table objects, each with { headers, rows }.
   */
  function parseDivTables() {
    const tables = document.querySelectorAll(CONFIG.tableSelector);
    if (tables.length === 0) {
      console.warn('[Div Table Parser] No tables found with selector:', CONFIG.tableSelector);
      return [];
    }

    return Array.from(tables).map((table, tableIndex) => {
      const rowElements = table.querySelectorAll(`:scope > ${CONFIG.rowSelector}`);
      if (rowElements.length === 0) {
        // Try without :scope > in case rows are deeper nested
        const deepRows = table.querySelectorAll(CONFIG.rowSelector);
        if (deepRows.length === 0) {
          console.warn(`[Div Table Parser] Table ${tableIndex}: No rows found`);
          return { headers: [], rows: [] };
        }
        return extractData(deepRows);
      }
      return extractData(rowElements);
    });
  }

  /**
   * Extracts headers and row data from a NodeList of row elements.
   */
  function extractData(rowElements) {
    const allRows = Array.from(rowElements).map((row) => {
      const cells = row.querySelectorAll(`:scope > ${CONFIG.cellSelector}`);
      if (cells.length === 0) {
        // Fallback: treat direct child divs as cells
        const childDivs = row.querySelectorAll(':scope > div, :scope > span');
        return Array.from(childDivs).map((c) => c.textContent.trim());
      }
      return Array.from(cells).map((c) => c.textContent.trim());
    });

    let headers = [];
    let dataRows = allRows;

    if (CONFIG.firstRowIsHeader && allRows.length > 0) {
      headers = allRows[0];
      dataRows = allRows.slice(1);
    }

    return { headers, rows: dataRows };
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
   * Converts parsed table data to a JSON array of objects (using headers as keys).
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
   * Logs table data to console in a readable format.
   */
  function logTables(tables) {
    tables.forEach((table, i) => {
      console.group(`[Div Table Parser] Table ${i + 1}`);
      if (table.headers.length > 0) {
        console.log('Headers:', table.headers);
      }
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
  }

  // --- Menu commands ---

  GM_registerMenuCommand('Parse div tables → Console', () => {
    const tables = parseDivTables();
    if (tables.length === 0) {
      alert('No div-based tables found. Check CONFIG selectors in the script.');
      return;
    }
    logTables(tables);
    alert(`Found ${tables.length} table(s). Check the browser console (F12).`);
  });

  GM_registerMenuCommand('Parse div tables → CSV (clipboard)', () => {
    const tables = parseDivTables();
    if (tables.length === 0) {
      alert('No div-based tables found.');
      return;
    }
    const csv = tables.map(toCSV).join('\n\n');
    GM_setClipboard(csv, 'text');
    alert(`CSV for ${tables.length} table(s) copied to clipboard.`);
  });

  GM_registerMenuCommand('Parse div tables → JSON (clipboard)', () => {
    const tables = parseDivTables();
    if (tables.length === 0) {
      alert('No div-based tables found.');
      return;
    }
    const json = tables.map(toJSON);
    GM_setClipboard(JSON.stringify(json, null, 2), 'text');
    alert(`JSON for ${tables.length} table(s) copied to clipboard.`);
  });

  // Expose globally for console access
  unsafeWindow.__divTableParser = { parseDivTables, toCSV, toJSON, CONFIG };
})();
