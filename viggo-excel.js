// Viggo Element Table -> Excel
// Denne fil hentes automatisk af loader.user.js fra GitHub

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
    await micropip.install('openpyxl');
    return pyodideInstance;
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

  async function downloadExcel() {
    showStatus('Indlæser Pyodide + BeautifulSoup4 + openpyxl...');
    try {
      const pyodide = await ensurePyodide();
      pyodide.globals.set('page_html', document.documentElement.outerHTML);

      const xlsxBase64 = pyodide.runPython(`
import json
import base64
from io import BytesIO
from bs4 import BeautifulSoup
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side

soup = BeautifulSoup(page_html, 'html.parser')

# Get folder name from breadcrumbs
folder_name = 'Elementer'
breadcrumb = soup.select_one('.breadcrumbs span')
if breadcrumb:
    folder_name = breadcrumb.get_text(strip=True)

# Find the element list
table = soup.select_one('ul.list-icons.list-elements')
rows = []

if table:
    for li in table.select(':scope > li'):
        if 'h' in li.get('class', []):
            continue
        row_div = li.select_one(':scope > div')
        if not row_div:
            continue

        # Name
        name_el = li.select_one('div.name a.ajaxModal')
        name = ''
        if name_el:
            for child in name_el.children:
                if isinstance(child, str):
                    name += child
            name = name.strip()

        # Length
        length_el = li.select_one('div.length')
        length_val = 0.0
        if length_el:
            text = ''
            for child in length_el.children:
                if isinstance(child, str):
                    text += child.strip()
            text = text.replace(',', '.')
            try:
                length_val = float(text)
            except ValueError:
                length_val = 0.0

        # Preparation
        prep_el = li.select_one('p.muted.preparation')
        preparation = prep_el.get_text(strip=True) if prep_el else ''

        # Teachers
        teacher_els = li.select('div.teachers ul.list-icons li p')
        teachers = ', '.join([t.get_text(strip=True) for t in teacher_els])

        # Exceptions count
        exc_btn = li.select_one('a.exception-button')
        exceptions = 0
        if exc_btn:
            label = exc_btn.select_one('label')
            if label:
                try:
                    exceptions = int(label.get_text(strip=True))
                except ValueError:
                    exceptions = 0

        rows.append([name, length_val, preparation, teachers, exceptions])

# Create Excel workbook
wb = Workbook()
ws = wb.active
ws.title = folder_name[:31]  # Excel sheet name max 31 chars

# Styles
header_font = Font(bold=True, color='FFFFFF', size=11)
header_fill = PatternFill(start_color='4472C4', end_color='4472C4', fill_type='solid')
header_alignment = Alignment(horizontal='center', vertical='center')
thin_border = Border(
    left=Side(style='thin', color='D9D9D9'),
    right=Side(style='thin', color='D9D9D9'),
    top=Side(style='thin', color='D9D9D9'),
    bottom=Side(style='thin', color='D9D9D9'),
)

# Headers
headers = ['Navn', 'Timer', 'Forberedelse', 'Undervisere', 'Undtagelser']
for col, header in enumerate(headers, 1):
    cell = ws.cell(row=1, column=col, value=header)
    cell.font = header_font
    cell.fill = header_fill
    cell.alignment = header_alignment
    cell.border = thin_border

# Data rows
for row_idx, row_data in enumerate(rows, 2):
    for col_idx, value in enumerate(row_data, 1):
        cell = ws.cell(row=row_idx, column=col_idx, value=value)
        cell.border = thin_border
        if col_idx == 2:  # Timer column - number format
            cell.number_format = '0.00'
        if col_idx == 5:  # Undtagelser - center
            cell.alignment = Alignment(horizontal='center')

# Auto-width columns
for col in ws.columns:
    max_length = 0
    col_letter = col[0].column_letter
    for cell in col:
        if cell.value:
            max_length = max(max_length, len(str(cell.value)))
    ws.column_dimensions[col_letter].width = min(max_length + 4, 60)

# Sum row
sum_row = len(rows) + 2
ws.cell(row=sum_row, column=1, value='Total').font = Font(bold=True)
ws.cell(row=sum_row, column=2, value=f'=SUM(B2:B{sum_row-1})').font = Font(bold=True)
ws.cell(row=sum_row, column=2).number_format = '0.00'

# Freeze header row
ws.freeze_panes = 'A2'

# Auto-filter
ws.auto_filter.ref = f'A1:E{sum_row - 1}'

# Save to bytes
buffer = BytesIO()
wb.save(buffer)
base64.b64encode(buffer.getvalue()).decode('ascii')
      `);

      // Download the file
      const byteChars = atob(xlsxBase64);
      const byteArray = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) {
        byteArray[i] = byteChars.charCodeAt(i);
      }
      const blob = new Blob([byteArray], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      const folderName = document.querySelector('.breadcrumbs span')?.textContent?.trim() || 'Elementer';
      const date = new Date().toISOString().slice(0, 10);
      const filename = `${folderName}_${date}.xlsx`;

      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      a.click();
      URL.revokeObjectURL(a.href);

      showStatus(`${filename} downloadet!`);
    } catch (e) {
      console.error(e);
      alert('Fejl: ' + e.message);
    }
  }

  // Create a styled Excel button
  function createExcelBtn(className) {
    const btn = document.createElement('a');
    btn.href = '#';
    btn.className = className;
    btn.title = 'Download som Excel';
    btn.innerHTML = '<i class="flaticon-print"></i> Excel';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      downloadExcel();
    });
    return btn;
  }

  // Insert Excel download buttons into the page
  function insertButtons() {
    // Top button: after the folder heading ("Akkorder" etc.)
    const heading = document.querySelector('#element-details .head h3');
    if (heading && !heading.parentElement.querySelector('.viggo-excel-btn-top')) {
      const topBtn = createExcelBtn('viggo-excel-btn-top btn');
      heading.after(topBtn);
    }

    // Bottom button: in .button-group.right next to print icon
    const buttonGroup = document.querySelector('#element-details .button-group.right');
    if (buttonGroup && !buttonGroup.querySelector('.viggo-excel-btn-bottom')) {
      buttonGroup.insertBefore(createExcelBtn('viggo-excel-btn-bottom'), buttonGroup.firstChild);
    }
  }

  // Persistent check - handles AJAX navigation within Viggo's SPA
  setInterval(insertButtons, 1000);

  // Register menu command (passed from loader)
  if (typeof GM_registerMenuCommand !== 'undefined') {
    GM_registerMenuCommand('Viggo -> Download Excel', downloadExcel);
  }
})();
