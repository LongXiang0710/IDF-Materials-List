(function (root) {
  'use strict';

  const TYPE_NAMES = {
    0: '附加口径', 30: '弯管', 31: '弯管', 35: '弯头', 36: '弯头', 40: '支管座', 41: '支管座', 42: '支管座',
    45: '三通', 46: '三通', 47: '三通', 50: '四通', 51: '四通', 52: '四通', 53: '四通', 55: '异径管',
    60: '带支管异径管', 61: '带支管异径管', 62: '带支管异径管', 65: '异径法兰', 70: '带支管弯管', 71: '带支管弯头', 72: '带支管弯头',
    75: '角阀', 76: '角阀', 80: '三通阀', 81: '三通阀', 82: '三通阀', 85: '四通阀', 86: '四通阀', 87: '四通阀', 88: '四通阀',
    90: '仪表', 91: '仪表', 92: '仪表', 93: '仪表', 95: '杂项组件', 96: '杂项组件', 100: '管道', 101: '定长管', 102: '定长管块',
    103: '变长管块', 104: '间隙组件', 105: '法兰', 106: '活套法兰组件', 107: '盲法兰', 110: '垫片', 111: '卫生接头', 112: '卫生背紧螺母',
    113: '卫生卡箍', 114: '卫生杂项组件', 115: '螺栓', 120: '焊缝', 125: '管帽', 126: '管箍 / 弯头座', 127: '活接头', 130: '阀门',
    132: '疏水器', 133: '疏水器', 134: '爆破片 / 放空', 136: '过滤器', 137: '过滤器', 140: '仪表气泡', 150: '管道支架',
    160: '附加材料（关联）', 161: '附加材料（独立）'
  };

  const PIPE_TYPES = new Set([100, 101, 102, 103]);
  const LENGTH_QUANTITY_TYPES = new Set([100]);
  // These records are additional legs of the same physical component. Only
  // the first/in-leg record contributes one BOM quantity.
  const CONTINUATION_RECORD_TYPES = new Set([
    31, 36, 41, 42, 46, 47, 51, 52, 53, 61, 62, 71, 72, 76,
    81, 82, 86, 87, 88, 91, 92, 93, 96, 133, 137
  ]);
  const NON_FLOW_TYPES = new Set([110, 115, 120, 150, 160, 161]);

  let SKEY_DEFINITIONS = root.ISOGEN_SKEY_DEFINITIONS || [];
  if (!SKEY_DEFINITIONS.length && typeof require === 'function') {
    try { SKEY_DEFINITIONS = require('./skey-data.js'); } catch (_) { /* Browser data is loaded separately. */ }
  }

  const SKEY_EXACT = new Map();
  const SKEY_PATTERNS = [];
  const SKEY_ZH_OVERRIDES = Object.freeze({
    FLBL: '盲板法兰', FLFL: '松套法兰', FLLB: '松套法兰', FLRC: '同心异径法兰', FLRE: '偏心异径法兰',
    FLSC: '螺纹法兰', FLSJ: 'J 型焊平焊法兰', FLSO: '平焊法兰', FOSO: '孔板平焊法兰', FLSW: '承插焊法兰',
    FLWN: '对焊颈法兰', FOWN: '孔板对焊颈法兰', FBSE: '活套环/翻边短节组合', JFWN: '夹套对焊颈法兰', JFSO: '夹套平焊法兰',
    FLRG: '活套环', FLSE: '翻边短节', IDPL: '仪表盘', IDFL: '法兰仪表盘', OP: '孔板', PR: '限流孔板', DR: '爆破片', RD: '爆破片',
    ELBW: '对焊弯头', ELCP: '压缩式弯头', ELSC: '内螺纹弯头', ELSW: '承插焊弯头', EBSC: '外螺纹弯头',
    EUBW: '180° 对焊回弯头', EUPL: '180° 平口回弯头', MIBW: '对焊虾米弯', MIFL: '法兰虾米弯',
    NRSC: '螺纹短节', NBSC: '螺纹对丝', COCP: '压缩式管箍', COSC: '螺纹管箍', COSW: '承插焊管箍',
    KABW: '对焊管帽', KACP: '压缩式管帽', KASC: '螺纹管帽', KASW: '承插焊管帽', KAFL: '法兰管帽',
    FPFL: '法兰定长管', FPPL: '定长管', FPFA: '扩口定长管', FPCL: '卡箍定长管', FPGL: '胶粘定长管', FPPF: '承插定长管',
    FPSC: '螺纹定长管', FPSW: '承插焊定长管', FPCP: '压缩式定长管', ANCH: '锚固支架', GUID: '导向支架',
    SPRG: '弹簧支架', HANG: '吊架', DUCK: '鸭脚支座', SKID: '滑动支座', ITFL: '法兰仪表三通',
    LVBW: 'Victaulic 焊接环'
  });
  const END_CONDITION_ZH = Object.freeze({
    BW: '对焊', CP: '压缩式', SW: '承插焊', FL: '法兰', SC: '螺纹', PL: '平口', LN: '衬套螺母式', LC: '衬套卡箍式',
    LR: '异径衬套式', MP: '外螺纹端', PF: '承插式', GL: '胶粘', CL: '卡箍式', FA: '扩口', BS: '球窝式', SB: '球窝式', GF: '压盖式'
  });

  function skeyPatternRegex(pattern) {
    let source = '^';
    for (let i = 0; i < pattern.length; i++) {
      const ch = pattern[i];
      if (ch === '*' && pattern[i + 1] === '*') { source += '[A-Z0-9]{2}'; i++; }
      else if (ch === '*') source += '[A-Z0-9]';
      else if (ch === '@' || ch === '+') source += '[1-9]';
      else source += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp(source + '$');
  }

  SKEY_DEFINITIONS.forEach(definition => {
    if (/[*@+]/.test(definition.skey)) SKEY_PATTERNS.push(Object.assign({ regex: skeyPatternRegex(definition.skey) }, definition));
    else SKEY_EXACT.set(definition.skey, definition);
  });
  SKEY_PATTERNS.sort((a, b) => b.skey.replace(/[*@+]/g, '').length - a.skey.replace(/[*@+]/g, '').length);

  function normalizeSkey(value) {
    const cleaned = String(value || '').toUpperCase().replace(/[\s,'";]/g, '');
    const match = cleaned.match(/[A-Z0-9]{2,4}/);
    return match ? match[0] : '';
  }

  function isContinuationComponent(component) {
    const { type, words } = component;
    // Olet records 40/41 describe different legs. In real IDF files the BOM
    // component (for example SKSW) may be carried by either record, while the
    // other leg has an empty SKEY. Count the SKEY-bearing record and ignore
    // only the empty leg; record 42 remains a continuation record.
    if (type === 40 || type === 41) return !normalizeSkey(words[11]);
    return CONTINUATION_RECORD_TYPES.has(type);
  }

  function chineseBaseName(officialName, pcfIdentification) {
    const name = officialName.toLowerCase();
    const pcf = String(pcfIdentification || '').toUpperCase();
    if (/blind flange/.test(name)) return '盲板法兰';
    if (/concentric reducing flange|reducing concentric flange/.test(name)) return '同心异径法兰';
    if (/eccentric reducing flange|reducing eccentric flange/.test(name)) return '偏心异径法兰';
    if (pcf === 'LAPJOINT-RING') return '活套环';
    if (pcf === 'LAPJOINT-STUB-END') return '翻边短节';
    if (pcf === 'ELBOLET') return '弯头支管台';
    if (pcf === 'OLET') return '支管台';
    if (pcf === 'NOZZLE') return '管嘴';
    if (pcf === 'CLAMP') return '卡箍';
    if (pcf === 'CONNECTOR') return '接头';
    if (pcf === 'NUT') return '螺母';
    if (pcf === 'REINFORCEMENTPAD') return '补强板';
    if (pcf === 'SAFETY-DISC') return '爆破片';
    if (pcf === 'SUPPORT') return '支吊架';
    if (pcf === 'UNION') return '活接头';
    if (pcf === 'CAP') return '管帽';
    if (pcf === 'COUPLING') return '管箍';
    if (pcf === 'WELD') return '焊缝';
    if (pcf.startsWith('PIPE-')) return pcf.includes('BLOCK') ? '管块' : '定长管';
    if (pcf.startsWith('FILTER')) return '过滤器';
    if (pcf === 'INSTRUMENT-DIAL') return '仪表盘';
    if (pcf === 'INSTRUMENT-TEE') return '仪表三通';
    if (pcf.startsWith('INSTRUMENT')) return '仪表';
    if (pcf === 'FLANGE-BLIND') return '盲板法兰';
    if (pcf === 'FLANGE-REDUCING-CONCENTRIC') return '同心异径法兰';
    if (pcf === 'FLANGE-REDUCING-ECCENTRIC') return '偏心异径法兰';
    if (pcf === 'FLANGE') return '法兰';
    if (pcf === 'ELBOW-REDUCING') return '异径弯头';
    if (pcf.startsWith('ELBOW')) return '弯头';
    if (pcf.startsWith('BEND')) return '弯管';
    if (pcf.startsWith('CROSS')) return '四通';
    if (pcf.startsWith('TEE')) return '三通';
    if (pcf.startsWith('REDUCER-CONCENTRIC')) return '同心异径管';
    if (pcf.startsWith('REDUCER-ECCENTRIC')) return '偏心异径管';
    if (pcf.startsWith('VALVE')) {
      if (/butterfly valve/.test(name)) return '蝶阀';
      if (/gate valve/.test(name)) return '闸阀';
      if (/globe valve/.test(name)) return '截止阀';
      if (/ball valve/.test(name)) return '球阀';
      if (/check valve|non-return valve/.test(name)) return '止回阀';
      if (/diaphragm valve/.test(name)) return '隔膜阀';
      if (/needle valve/.test(name)) return '针阀';
      if (/plug valve/.test(name)) return '旋塞阀';
      if (/control valve/.test(name)) return '调节阀';
      if (/pressure reducing/.test(name)) return '减压阀';
      if (/relief|vent valve/.test(name)) return '安全/放空阀';
      return '阀门';
    }
    if (pcf.startsWith('TRAP')) return '疏水器';
    if (/hose coupling/.test(name)) return '软管接头';
    if (/connector/.test(name)) return '接头';
    if (/flange/.test(name)) return '法兰';
    if (/butterfly valve/.test(name)) return '蝶阀';
    if (/gate valve/.test(name)) return '闸阀';
    if (/globe valve/.test(name)) return '截止阀';
    if (/ball valve/.test(name)) return '球阀';
    if (/check valve|non-return valve/.test(name)) return '止回阀';
    if (/diaphragm valve/.test(name)) return '隔膜阀';
    if (/needle valve/.test(name)) return '针阀';
    if (/plug valve/.test(name)) return '旋塞阀';
    if (/control valve/.test(name)) return '调节阀';
    if (/pressure reducing/.test(name)) return '减压阀';
    if (/relief|vent valve/.test(name)) return '安全/放空阀';
    if (/valve/.test(name)) return '阀门';
    if (/instrument dial/.test(name)) return '仪表盘';
    if (/instrument tee/.test(name)) return '仪表三通';
    if (/instrument/.test(name)) return '仪表';
    if (/filter|strainer/.test(name)) return '过滤器';
    if (/reducing elbow/.test(name)) return '异径弯头';
    if (/elbow/.test(name)) return '弯头';
    if (/bend/.test(name)) return '弯管';
    if (/instrument tee/.test(name)) return '仪表三通';
    if (/tee/.test(name)) return '三通';
    if (/cross/.test(name)) return '四通';
    if (/concentric reducer/.test(name)) return '同心异径管';
    if (/eccentric reducer/.test(name)) return '偏心异径管';
    if (/reducer|reducing block/.test(name)) return '异径管';
    if (/coupling/.test(name)) return '管箍';
    if (/cap/.test(name)) return '管帽';
    if (/fixed.*pipe|pipe block/.test(name)) return '定长管';
    if (/pipe/.test(name)) return '管道';
    if (/support weld/.test(name)) return '支架焊缝';
    if (/trap/.test(name)) return '疏水器';
    if (/nozzle/.test(name)) return '管嘴';
    if (/olet|half coupling/.test(name)) return '支管台';
    if (/union/.test(name)) return '活接头';
    if (/nipple/.test(name)) return '短节';
    if (/plug/.test(name)) return '塞头';
    if (/clamp/.test(name)) return '卡箍';
    if (/rupture disk/.test(name)) return '爆破片';
    if (/orifice plate/.test(name)) return '孔板';
    if (/restrictor plate/.test(name)) return '限流孔板';
    if (/reinforcing pad/.test(name)) return '补强板';
    if (/expansion bellows/.test(name)) return '膨胀节';
    if (/flexible hose/.test(name)) return '柔性软管';
    if (/sight glass/.test(name)) return '视镜';
    if (/weld/.test(name)) return '焊缝';
    return '';
  }

  function translatedSkeyName(definition, normalized) {
    if (SKEY_ZH_OVERRIDES[definition.skey]) return SKEY_ZH_OVERRIDES[definition.skey];
    const base = chineseBaseName(definition.name, definition.pcfIdentification);
    if (!base) return definition.name;
    let condition = '';
    if (definition.skey.includes('**')) condition = END_CONDITION_ZH[normalized.slice(-2)] || '';
    else if (/butt weld/i.test(definition.name)) condition = '对焊';
    else if (/socket weld/i.test(definition.name)) condition = '承插焊';
    else if (/screwed/i.test(definition.name)) condition = '螺纹';
    else if (/flanged/i.test(definition.name)) condition = '法兰';
    else if (/compression/i.test(definition.name)) condition = '压缩式';
    if (base.startsWith(condition)) condition = '';
    return condition + base;
  }

  function skeyMatchesIdfRecord(definition, componentType) {
    const recordTypes = String(definition.idfRecord || '').match(/\d+/g);
    return !recordTypes || !recordTypes.length || recordTypes.includes(String(componentType));
  }

  function resolveSkey(skey, fallbackType) {
    const normalized = normalizeSkey(skey);
    if (!normalized) return { normalized, name: TYPE_NAMES[fallbackType] || `组件 ${fallbackType}`, officialName: '', matchedSkey: '' };
    const exact = SKEY_EXACT.get(normalized);
    const definition = (exact && skeyMatchesIdfRecord(exact, fallbackType) ? exact : null) ||
      SKEY_PATTERNS.find(item => item.regex.test(normalized) && skeyMatchesIdfRecord(item, fallbackType));
    if (!definition) return { normalized, name: TYPE_NAMES[fallbackType] || `组件 ${fallbackType}`, officialName: '', matchedSkey: '' };
    return {
      normalized,
      name: translatedSkeyName(definition, normalized),
      officialName: definition.name,
      matchedSkey: definition.skey,
      referencePage: definition.page
    };
  }

  function categoryFor(type) {
    if (PIPE_TYPES.has(type)) return '管道';
    if ([65, 105, 106, 107].includes(type)) return '法兰';
    if ([110].includes(type)) return '垫片';
    if ([115].includes(type)) return '螺栓';
    if ([75, 76, 80, 81, 82, 85, 86, 87, 88, 90, 91, 92, 93, 95, 96, 130, 132, 133, 134, 136, 137, 140].includes(type)) return '阀门 / 管内件';
    if (type === 150) return '支吊架';
    if ([160, 161].includes(type)) return '附加材料';
    if (type === 120) return '焊缝';
    return '管件';
  }

  function tokenize(line) {
    const tokens = [];
    let current = '';
    let quote = null;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quote) {
        if (ch === quote) quote = null;
        else current += ch;
      } else if (ch === '"' || ch === "'") quote = ch;
      else if (/\s/.test(ch)) {
        if (current) { tokens.push(current); current = ''; }
      } else current += ch;
    }
    if (current) tokens.push(current);
    return tokens;
  }

  function firstInteger(value) {
    const match = String(value || '').match(/^-?\d+/);
    return match ? Number(match[0]) : NaN;
  }

  function parseNumber(value) {
    if (value === undefined || value === null || value === '') return NaN;
    const number = Number(String(value).replace(/,/g, ''));
    return Number.isFinite(number) ? number : NaN;
  }

  function decodeFlags(word11, word14) {
    const flags11 = Math.abs(firstInteger(word11)) || 0;
    const flags14 = Math.abs(firstInteger(word14)) || 0;
    const bomMode = Math.floor(flags11 / 1000000) % 10;
    const classCode = flags14 % 10;
    const classificationNames = { 0: '未分类', 1: '制作', 2: '安装', 3: '海工' };
    return {
      // Official word 11 rule: Millions 0 and 2 appear in the BOM;
      // Millions 1 is suppressed. Other undefined values are excluded.
      includeInBom: bomMode === 0 || bomMode === 2,
      bomMode,
      classCode,
      classificationValid: Object.prototype.hasOwnProperty.call(classificationNames, classCode),
      classification: classificationNames[classCode] || '未分类'
    };
  }

  function parseMaterialPointer(value) {
    const text = String(value || '').trim();
    if (!text) return 0;
    // Word 9 is positional from right to left: positions 1-3 (the lowest
    // three digits) are the material pointer, 4-6 are the reinforcement-pad
    // pointer, and 7-9 are the repeat-part number.
    if (/^\d{4,}$/.test(text)) return Number(text.slice(-3)) || 0;
    return Math.max(0, firstInteger(text) || 0);
  }

  function materialGroupKey(row) {
    return [row.code, row.description, row.bore, row.unit, row.skey, row.pipelineNumber].join('\u0001');
  }

  function mergeDistinctText(left, right) {
    const values = [left, right]
      .flatMap(value => String(value || '').split('、'))
      .map(value => value.trim())
      .filter(Boolean);
    return Array.from(new Set(values)).join('、');
  }

  function addQuantity(left, right) {
    return Number(((Number(left) || 0) + (Number(right) || 0)).toFixed(12));
  }

  function mergeRowMetadata(target, row) {
    target.componentType = mergeDistinctText(target.componentType, row.componentType);
    target.category = mergeDistinctText(target.category, row.category);
    target.classification = mergeDistinctText(target.classification, row.classification);
    target.skey = mergeDistinctText(target.skey, row.skey);
    target.pipelineNumber = mergeDistinctText(target.pipelineNumber, row.pipelineNumber);
    target.componentTypeOfficial = mergeDistinctText(target.componentTypeOfficial, row.componentTypeOfficial);
  }

  function formatBore(value, unitMode) {
    const bore = parseNumber(value);
    if (!Number.isFinite(bore)) return value || '—';
    if (unitMode === 'imperial') {
      const inches = bore / 16;
      if (Number.isInteger(inches)) return `${inches}\"`;
      const whole = Math.floor(inches);
      const numerator = Math.round((inches - whole) * 16);
      return whole ? `${whole} ${numerator}/16\"` : `${numerator}/16\"`;
    }
    return `DN${bore}`;
  }

  function inferUnitMode(components) {
    const bores = components.map(c => parseNumber(c.words[7])).filter(n => Number.isFinite(n) && n > 0);
    if (!bores.length) return 'metric';
    const commonInchEncoded = bores.filter(n => n % 8 === 0 && n <= 960).length / bores.length;
    const metricLike = bores.filter(n => [6, 8, 10, 15, 20, 25, 32, 40, 50, 65, 80, 100, 125, 150, 200, 250, 300, 350, 400, 450, 500, 600].includes(n)).length / bores.length;
    return commonInchEncoded > .72 && metricLike < .5 ? 'imperial' : 'metric';
  }

  function pipeLengthMm(words) {
    const coords = words.slice(1, 7).map(parseNumber);
    if (coords.some(n => !Number.isFinite(n))) return NaN;
    const dx = coords[3] - coords[0];
    const dy = coords[4] - coords[1];
    const dz = coords[5] - coords[2];
    return Math.sqrt(dx * dx + dy * dy + dz * dz) / 100;
  }

  function coordinateKey(words, offset) {
    const coordinates = words.slice(offset, offset + 3).map(parseNumber);
    if (coordinates.length !== 3 || coordinates.some(value => !Number.isFinite(value))) return '';
    return coordinates.map(value => Object.is(value, -0) ? 0 : value).join('|');
  }

  function reducingBoreLabel(large, small, unitMode) {
    if (unitMode === 'imperial') return `${formatBore(large, unitMode)}×${formatBore(small, unitMode)}`;
    const compact = value => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
    return `DN${compact(large)}×${compact(small)}`;
  }

  function inferConnectedBores(components, unitMode) {
    const endpointMap = new Map();
    const geometryComponents = components.filter(component => !NON_FLOW_TYPES.has(component.type));

    geometryComponents.forEach(component => {
      component.endpointKeys = Array.from(new Set([
        coordinateKey(component.words, 1),
        coordinateKey(component.words, 4)
      ].filter(Boolean)));
      component.endpointKeys.forEach(key => {
        if (!endpointMap.has(key)) endpointMap.set(key, new Set());
        endpointMap.get(key).add(component);
      });
    });

    const inferred = new Map();
    geometryComponents.forEach(component => {
      if (PIPE_TYPES.has(component.type)) return;
      const ownBore = parseNumber(component.words[7]);
      if (!Number.isFinite(ownBore) || ownBore <= 0) return;
      const connectedBores = new Set([ownBore]);
      component.endpointKeys.forEach(key => {
        endpointMap.get(key).forEach(neighbor => {
          if (neighbor === component) return;
          const bore = parseNumber(neighbor.words[7]);
          if (Number.isFinite(bore) && bore > 0) connectedBores.add(bore);
        });
      });
      const sizes = Array.from(connectedBores).sort((a, b) => b - a);
      if (sizes.length > 1 && sizes[0] !== sizes[sizes.length - 1]) {
        inferred.set(component, reducingBoreLabel(sizes[0], sizes[sizes.length - 1], unitMode));
      }
    });
    return inferred;
  }

  // -1 is an overflow record. It continues the preceding text verbatim and may
  // split a word in the middle, so no separator may be inserted. Remove only
  // the one delimiter after "-1" and trailing fixed-width padding; preserve an
  // additional leading space because it can be part of the original text.
  function overflowValue(rawLine) {
    const match = String(rawLine).match(/^\s*-1(?:[ \t]?)(.*)$/);
    return match ? match[1].replace(/[ \t]+$/, '') : '';
  }

  function parse(text, options) {
    options = options || {};
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
    const materials = [];
    const components = [];
    const diagnostics = [];
    let activeMaterial = null;
    let activePipelineNumber = '';
    let continuationTarget = null;

    lines.forEach((rawLine, index) => {
      const trimmed = rawLine.trim();
      if (!trimmed) return;
      const words = tokenize(trimmed);
      if (!words.length) return;
      const record = firstInteger(words[0]);
      if (!Number.isFinite(record)) return;

      if (record === -6) {
        activePipelineNumber = trimmed.replace(/^\s*-6\s*/, '').trim();
        continuationTarget = { field: 'pipelineNumber' };
        return;
      }
      if (record === -20) {
        activeMaterial = {
          pointer: materials.length + 1,
          code: trimmed.replace(/^\s*-20\s*/, '').trim(),
          description: '', optional: [], line: index + 1
        };
        materials.push(activeMaterial);
        continuationTarget = { field: 'code' };
        return;
      }
      if (record === -21 && activeMaterial) {
        const value = trimmed.replace(/^\s*-21\s*/, '').trim();
        activeMaterial.description = activeMaterial.description ? `${activeMaterial.description} ${value}` : value;
        continuationTarget = { field: 'description' };
        return;
      }
      if (record <= -80 && record >= -89 && activeMaterial) {
        const value = trimmed.replace(/^\s*-8\d\s*/, '').trim();
        activeMaterial.optional.push(value);
        continuationTarget = { field: 'optional', index: activeMaterial.optional.length - 1 };
        return;
      }
      if (record === -1 && continuationTarget) {
        const value = overflowValue(rawLine);
        if (continuationTarget.field === 'pipelineNumber') {
          activePipelineNumber += value;
        } else if (activeMaterial && continuationTarget.field === 'optional') {
          activeMaterial.optional[continuationTarget.index] += value;
        } else if (activeMaterial) {
          activeMaterial[continuationTarget.field] += value;
        }
        return;
      }
      continuationTarget = null;
      if (record > 0 && TYPE_NAMES[record] && record !== 999) {
        components.push({ type: record, words, line: index + 1, raw: trimmed, pipelineNumber: activePipelineNumber });
      }
    });

    const unitMode = options.unitMode || inferUnitMode(components);
    const connectedBoreLabels = inferConnectedBores(components, unitMode);
    const resultRows = [];
    let excludedCount = 0;
    let excludedPointerCount = 0;
    let excludedBomModeCount = 0;
    let invalidClassificationCount = 0;
    let continuationRecordCount = 0;
    let unlinkedCount = 0;

    components.forEach(component => {
      const { words, type, line, pipelineNumber } = component;
      if (isContinuationComponent(component)) { continuationRecordCount++; return; }
      const pointerText = words[8] || '';
      const pointer = parseMaterialPointer(pointerText);
      const flags = decodeFlags(words[10], words[13]);
      if (pointer === 0) { excludedCount++; excludedPointerCount++; return; }
      if (!flags.includeInBom) { excludedCount++; excludedBomModeCount++; return; }
      if (!flags.classificationValid) invalidClassificationCount++;
      const material = pointer > 0 ? materials[pointer - 1] : null;
      if (!material) {
        unlinkedCount++;
        diagnostics.push(`第 ${line} 行：${TYPE_NAMES[type]} 的物料指针“${pointerText || '空'}”未找到对应 -20 记录。`);
      }
      const lengthMm = LENGTH_QUANTITY_TYPES.has(type) ? pipeLengthMm(words) : NaN;
      const quantity = LENGTH_QUANTITY_TYPES.has(type) && Number.isFinite(lengthMm) ? lengthMm / 1000 : 1;
      const unit = LENGTH_QUANTITY_TYPES.has(type) && Number.isFinite(lengthMm) ? 'm' : '件';
      const weight = parseNumber(words[9]);
      const skeyInfo = resolveSkey(words[11] || '', type);
      resultRows.push({
        code: material ? material.code : (pointerText ? `[指针 ${pointerText}]` : '未关联'),
        description: material ? [material.description].concat(material.optional).filter(Boolean).join(' / ') : '未找到物料描述',
        category: categoryFor(type), bore: connectedBoreLabels.get(component) || formatBore(words[7], unitMode), boreRaw: words[7] || '',
        isReducing: connectedBoreLabels.has(component),
        quantity, unit, weight: Number.isFinite(weight) ? weight : 0, hasWeight: Number.isFinite(weight),
        classification: flags.classification, componentType: skeyInfo.name, componentTypeOfficial: skeyInfo.officialName,
        type, skey: skeyInfo.normalized || words[11] || '', skeyMatched: skeyInfo.matchedSkey, skeyReferencePage: skeyInfo.referencePage,
        pipelineNumber: pipelineNumber || '', sourceLine: line, materialPointer: pointer || '', raw: component.raw
      });
    });

    const grouped = new Map();
    resultRows.forEach(row => {
      const key = materialGroupKey(row);
      if (!grouped.has(key)) grouped.set(key, Object.assign({}, row, { sourceLines: [row.sourceLine], count: 1 }));
      else {
        const target = grouped.get(key);
        target.quantity = addQuantity(target.quantity, row.quantity);
        target.weight = addQuantity(target.weight, row.weight);
        target.hasWeight = target.hasWeight || row.hasWeight;
        target.count++;
        target.sourceLines.push(row.sourceLine);
        mergeRowMetadata(target, row);
      }
    });

    const rows = Array.from(grouped.values()).sort((a, b) =>
      a.category.localeCompare(b.category, 'zh-CN') || a.code.localeCompare(b.code, 'zh-CN') || a.bore.localeCompare(b.bore, 'zh-CN')
    );
    const pipeLength = resultRows.filter(r => r.unit === 'm').reduce((sum, row) => sum + row.quantity, 0);
    const totalWeight = resultRows.reduce((sum, row) => sum + row.weight, 0);

    if (!materials.length) diagnostics.unshift('未发现 -20 物料编码记录；请确认文件是否为 ISOGEN IDF 文本。');
    if (!components.length) diagnostics.unshift('未发现可识别的组件记录。');
    if (invalidClassificationCount) diagnostics.unshift(`${invalidClassificationCount} 个有效组件的第 14 字段个位包含未定义分类代码，材料表已按“未分类”处理。`);

    return {
      rows, materials, components, diagnostics, unitMode,
      stats: { materialRows: rows.length, componentCount: components.length, includedCount: resultRows.length, continuationRecordCount, excludedCount, excludedPointerCount, excludedBomModeCount, invalidClassificationCount, unlinkedCount, pipeLength, totalWeight, hasWeight: resultRows.some(r => r.hasWeight) }
    };
  }

  function mergeParsedResults(items) {
    const inputs = (items || []).filter(item => item && item.parsed);
    const grouped = new Map();
    const materials = [];
    const components = [];
    const diagnostics = [];
    const unitModes = new Set();

    inputs.forEach(item => {
      const fileName = item.name || '未命名文件';
      const parsed = item.parsed;
      unitModes.add(parsed.unitMode);
      materials.push(...parsed.materials.map(material => Object.assign({ sourceFile: fileName }, material)));
      components.push(...parsed.components.map(component => Object.assign({ sourceFile: fileName }, component)));
      diagnostics.push(...parsed.diagnostics.map(message => `${fileName}：${message}`));

      parsed.rows.forEach(row => {
        const key = materialGroupKey(row);
        if (!grouped.has(key)) {
          grouped.set(key, Object.assign({}, row, {
            sourceFiles: [fileName],
            sourceReferences: (row.sourceLines || [row.sourceLine]).map(line => `${fileName}:${line}`),
            sourceLines: Array.from(row.sourceLines || [row.sourceLine])
          }));
        } else {
          const target = grouped.get(key);
          target.quantity = addQuantity(target.quantity, row.quantity);
          target.weight = addQuantity(target.weight, row.weight);
          target.hasWeight = target.hasWeight || row.hasWeight;
          target.count = (target.count || 1) + (row.count || 1);
          if (!target.sourceFiles.includes(fileName)) target.sourceFiles.push(fileName);
          target.sourceReferences.push(...(row.sourceLines || [row.sourceLine]).map(line => `${fileName}:${line}`));
          mergeRowMetadata(target, row);
        }
      });
    });

    const rows = Array.from(grouped.values()).sort((a, b) =>
      a.pipelineNumber.localeCompare(b.pipelineNumber, 'zh-CN') ||
      a.category.localeCompare(b.category, 'zh-CN') ||
      a.code.localeCompare(b.code, 'zh-CN') || a.bore.localeCompare(b.bore, 'zh-CN')
    );
    const summed = field => inputs.reduce((total, item) => total + (item.parsed.stats[field] || 0), 0);
    return {
      rows, materials, components, diagnostics,
      unitMode: unitModes.size === 1 ? Array.from(unitModes)[0] : 'mixed',
      stats: {
        materialRows: rows.length,
        componentCount: summed('componentCount'),
        includedCount: summed('includedCount'),
        continuationRecordCount: summed('continuationRecordCount'),
        excludedCount: summed('excludedCount'),
        excludedPointerCount: summed('excludedPointerCount'),
        excludedBomModeCount: summed('excludedBomModeCount'),
        invalidClassificationCount: summed('invalidClassificationCount'),
        unlinkedCount: summed('unlinkedCount'),
        pipeLength: summed('pipeLength'),
        totalWeight: summed('totalWeight'),
        hasWeight: inputs.some(item => item.parsed.stats.hasWeight)
      }
    };
  }

  root.IDFParser = { parse, mergeParsedResults, materialGroupKey, mergeDistinctText, addQuantity, tokenize, TYPE_NAMES, categoryFor, pipeLengthMm, inferConnectedBores, reducingBoreLabel, decodeFlags, parseMaterialPointer, overflowValue, normalizeSkey, resolveSkey, skeyMatchesIdfRecord, isContinuationComponent, CONTINUATION_RECORD_TYPES, LENGTH_QUANTITY_TYPES };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.IDFParser;
})(typeof window !== 'undefined' ? window : globalThis);
