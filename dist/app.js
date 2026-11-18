(function () {
  'use strict';

  const $ = id => document.getElementById(id);
  const state = { files: [], fileResults: [], parsed: null, rows: [], encodings: [] };
  const els = {
    upload: $('uploadSection'), workspace: $('workspace'), dropZone: $('dropZone'), fileInput: $('fileInput'), choose: $('chooseButton'), replace: $('replaceButton'),
    fileName: $('fileName'), fileMeta: $('fileMeta'), encoding: $('encodingSelect'), notice: $('notice'), body: $('materialBody'), rowCount: $('rowCount'),
    empty: $('emptyState'), search: $('searchInput'), category: $('categoryFilter'), csv: $('csvButton'), excel: $('excelButton'),
    exportModeWrap: $('exportModeWrap'), exportMode: $('exportModeSelect'),
    materials: $('statMaterials'), components: $('statComponents'), included: $('statIncluded'), pipeLength: $('statPipeLength'), weight: $('statWeight'),
    diagnosticCount: $('diagnosticCount'), diagnosticContent: $('diagnosticContent'), help: $('helpDialog')
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>'"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[ch]);
  }

  function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
  }

  function formatNumber(value, digits) {
    return Number(value || 0).toLocaleString('zh-CN', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function detectAndDecode(buffer, requested) {
    if (requested && requested !== 'auto') return { text: new TextDecoder(requested).decode(buffer), encoding: requested };
    try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(buffer), encoding: 'utf-8' }; }
    catch (_) { return { text: new TextDecoder('gb18030').decode(buffer), encoding: 'gb18030' }; }
  }

  async function readFiles(fileList) {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    const totalSize = files.reduce((sum, file) => sum + file.size, 0);
    if ((files.some(file => file.size > 50 * 1024 * 1024) || totalSize > 100 * 1024 * 1024) &&
        !confirm(`已选择 ${files.length} 个文件，共 ${formatSize(totalSize)}，解析可能需要一些时间。是否继续？`)) return;
    state.files = files;
    const parsedFiles = await Promise.all(files.map(async file => {
      const buffer = await file.arrayBuffer();
      const decoded = detectAndDecode(buffer, els.encoding.value);
      return { name: file.name, encoding: decoded.encoding, parsed: IDFParser.parse(decoded.text) };
    }));
    state.fileResults = parsedFiles;
    state.encodings = parsedFiles.map(item => item.encoding);
    state.parsed = IDFParser.mergeParsedResults(parsedFiles);
    state.rows = state.parsed.rows;
    showWorkspace();
  }

  function showWorkspace() {
    const parsed = state.parsed;
    els.upload.classList.add('is-hidden');
    els.workspace.classList.remove('is-hidden');
    const totalSize = state.files.reduce((sum, file) => sum + file.size, 0);
    const encodingLabel = Array.from(new Set(state.encodings)).map(value => value.toUpperCase()).join(' / ');
    const unitLabel = parsed.unitMode === 'metric' ? '公制口径' : parsed.unitMode === 'imperial' ? '英制口径' : '混合口径';
    els.fileName.textContent = state.files.length === 1 ? state.files[0].name : `${state.files.length} 个 IDF 文件`;
    els.fileName.title = state.files.map(file => file.name).join('\n');
    els.fileMeta.textContent = `${formatSize(totalSize)} · ${encodingLabel} · ${unitLabel}`;
    els.exportModeWrap.classList.toggle('is-hidden', state.files.length < 2);
    els.materials.textContent = parsed.stats.materialRows.toLocaleString('zh-CN');
    els.components.textContent = parsed.stats.componentCount.toLocaleString('zh-CN');
    els.included.textContent = `${parsed.stats.includedCount} 项进入 BOM${parsed.stats.excludedCount ? ` · ${parsed.stats.excludedCount} 项排除` : ''}`;
    els.pipeLength.textContent = `${formatNumber(parsed.stats.pipeLength, 3)} m`;
    els.weight.textContent = parsed.stats.hasWeight ? formatNumber(parsed.stats.totalWeight, 3) : '—';

    const messages = [];
    if (!parsed.rows.length) messages.push('未生成材料表，请展开下方“解析详情”检查文件内容。');
    if (parsed.stats.unlinkedCount) messages.push(`${parsed.stats.unlinkedCount} 个组件未关联到 -20 物料记录，已保留在表中供检查。`);
    if (messages.length) { els.notice.textContent = messages.join(' '); els.notice.classList.remove('is-hidden'); }
    else els.notice.classList.add('is-hidden');

    const categories = Array.from(new Set(parsed.rows.map(r => r.category))).sort((a, b) => a.localeCompare(b, 'zh-CN'));
    els.category.innerHTML = '<option value="">全部分类</option>' + categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    renderDiagnostics();
    applyFilters();
    scrollTo({ top: 0, behavior: 'smooth' });
  }

  function renderDiagnostics() {
    const parsed = state.parsed;
    const items = parsed.diagnostics.slice(0, 80);
    els.diagnosticCount.textContent = parsed.diagnostics.length;
    els.diagnosticContent.innerHTML = `<div>已解析 ${state.files.length} 个文件，识别到 ${parsed.materials.length} 条物料字典记录，口径模式为${parsed.unitMode === 'metric' ? '公制' : parsed.unitMode === 'imperial' ? '英制' : '混合'}。已合并多腿组件的延续记录 ${parsed.stats.continuationRecordCount || 0} 条；排除指针为 0 的组件 ${parsed.stats.excludedPointerCount || 0} 项，Millions 位为 1 的组件 ${parsed.stats.excludedBomModeCount || 0} 项；第 14 字段分类代码异常 ${parsed.stats.invalidClassificationCount || 0} 项。</div>` +
      (items.length ? `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : '<div>未发现需要人工处理的记录。</div>');
  }

  function filteredRows(rows) {
    const query = els.search.value.trim().toLocaleLowerCase('zh-CN');
    const category = els.category.value;
    return rows.filter(row => {
      const haystack = [row.code, row.description, row.bore, row.componentType, row.classification].join(' ').toLocaleLowerCase('zh-CN');
      return (!query || haystack.includes(query)) && (!category || row.category === category);
    });
  }

  function applyFilters() {
    state.rows = filteredRows(state.parsed.rows);
    renderTable();
  }

  function renderTable() {
    els.body.innerHTML = state.rows.map((row, index) => `<tr>
      <td class="muted-cell">${index + 1}</td>
      <td>${escapeHtml(row.componentType)}</td>
      <td>${escapeHtml(row.bore)}</td>
      <td class="code">${escapeHtml(row.code)}</td>
      <td>${escapeHtml(row.description)}</td>
      <td class="number">${formatNumber(row.quantity, row.unit === 'm' ? 3 : 0)}</td>
      <td>${row.unit}</td>
      <td class="number">${row.hasWeight ? formatNumber(row.weight, 3) : '—'}</td>
      <td>${escapeHtml(row.classification)}</td>
      <td>${escapeHtml(row.skey || '')}</td>
      <td>${escapeHtml(row.pipelineNumber || '')}</td>
    </tr>`).join('');
    els.rowCount.textContent = `共 ${state.rows.length} 条${state.rows.length !== state.parsed.rows.length ? ` / 全部 ${state.parsed.rows.length} 条` : ''}`;
    els.empty.classList.toggle('is-hidden', state.rows.length > 0);
  }

  function csvCell(value) { return `"${String(value == null ? '' : value).replace(/"/g, '""')}"`; }
  function exportRows(rows) {
    return rows.map((r, i) => [
      i + 1,
      r.componentType,
      r.bore,
      r.code,
      r.description,
      Number(r.quantity.toFixed(r.unit === 'm' ? 3 : 0)),
      r.unit,
      r.hasWeight ? Number(r.weight.toFixed(3)) : 0,
      r.classification,
      r.skey || '',
      r.pipelineNumber || ''
    ]);
  }
  const headers = ['序号', '组件类型', '规格/NS', '物料编码', '材料描述', '数量', '单位', '重量', '归属', 'SKEY', '管线号'];

  function download(blob, extension, requestedBase) {
    const base = requestedBase || (state.files.length === 1 ? state.files[0].name.replace(/\.[^.]+$/, '') : 'IDF合并');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = `${base}_材料表.${extension}`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportCsv() {
    const csv = '\uFEFF' + [headers].concat(exportRows(state.rows)).map(row => row.map(csvCell).join(',')).join('\r\n');
    download(new Blob([csv], { type: 'text/csv;charset=utf-8' }), 'csv');
  }

  function xmlEscape(value) { return escapeHtml(value).replace(/&#39;/g, '&apos;'); }
  function buildExcelXml(materialRows) {
    const rows = [headers].concat(exportRows(materialRows));
    const body = rows.map((row, ri) => `<Row ss:Height="${ri === 0 ? 24 : 21}">${row.map((cell, ci) => {
      const isNumber = ri > 0 && [0, 5, 7].includes(ci) && cell !== '' && Number.isFinite(Number(cell));
      const style = ri === 0 ? 'Header' : (isNumber ? 'Number' : 'Body');
      return `<Cell ss:StyleID="${style}"><Data ss:Type="${isNumber ? 'Number' : 'String'}">${xmlEscape(cell)}</Data></Cell>`;
    }).join('')}</Row>`).join('');
    return `<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles>
  <Style ss:ID="Default"><Alignment ss:Vertical="Center"/><Font ss:FontName="Microsoft YaHei" ss:Size="10"/></Style>
  <Style ss:ID="Body"><Alignment ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9E2DE"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E4E9E6"/></Borders></Style>
  <Style ss:ID="Number"><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#D9E2DE"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E4E9E6"/></Borders></Style>
  <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF" ss:Size="11"/><Interior ss:Color="#1F785E" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FFFFFF"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FFFFFF"/></Borders></Style>
</Styles>
<Worksheet ss:Name="材料汇总"><Table x:FullColumns="1" x:FullRows="1"><Column ss:Width="54"/><Column ss:Width="155"/><Column ss:Width="90"/><Column ss:Width="180"/><Column ss:Width="340"/><Column ss:Width="85"/><Column ss:Width="55"/><Column ss:Width="80"/><Column ss:Width="75"/><Column ss:Width="90"/><Column ss:Width="150"/>${body}</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane><ProtectObjects>False</ProtectObjects><ProtectScenarios>False</ProtectScenarios></WorksheetOptions></Worksheet></Workbook>`;
  }

  function downloadExcel(rows, baseName) {
    const xml = buildExcelXml(rows);
    download(new Blob(['\uFEFF', xml], { type: 'application/vnd.ms-excel;charset=utf-8' }), 'xls', baseName);
  }

  function exportExcel() {
    if (state.files.length > 1 && els.exportMode.value === 'separate') {
      state.fileResults.forEach(item => {
        const baseName = item.name.replace(/\.[^.]+$/, '');
        downloadExcel(filteredRows(item.parsed.rows), baseName);
      });
      return;
    }
    downloadExcel(state.rows);
  }

  function openPicker(event) { event.stopPropagation(); els.fileInput.value = ''; els.fileInput.click(); }
  els.choose.addEventListener('click', openPicker);
  els.replace.addEventListener('click', openPicker);
  els.dropZone.addEventListener('click', openPicker);
  els.dropZone.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') openPicker(event); });
  els.fileInput.addEventListener('change', event => readFiles(event.target.files).catch(showError));
  ['dragenter', 'dragover'].forEach(name => els.dropZone.addEventListener(name, event => { event.preventDefault(); els.dropZone.classList.add('is-dragging'); }));
  ['dragleave', 'drop'].forEach(name => els.dropZone.addEventListener(name, event => { event.preventDefault(); els.dropZone.classList.remove('is-dragging'); }));
  els.dropZone.addEventListener('drop', event => readFiles(event.dataTransfer.files).catch(showError));
  els.encoding.addEventListener('change', () => { if (state.files.length) readFiles(state.files).catch(showError); });
  els.search.addEventListener('input', applyFilters);
  els.category.addEventListener('change', applyFilters);
  els.csv.addEventListener('click', exportCsv);
  els.excel.addEventListener('click', exportExcel);
  $('helpButton').addEventListener('click', () => els.help.showModal());
  $('closeHelp').addEventListener('click', () => els.help.close());
  els.help.addEventListener('click', event => { if (event.target === els.help) els.help.close(); });

  function showError(error) {
    console.error(error);
    alert(`无法解析文件：${error.message || error}`);
  }
})();
