'use strict';

const assert = require('node:assert/strict');
const parser = require('../dist/parser.js');

const overflowIdf = `
110 0 0 0 0 0 0 200 1 0.5 2000000 GASK 0 2
-20 PGGSD63A4DGDZ
-1 Z-08
-21 /PGGSD63A4DGD
-1 ZZ-08 DN200 S
-1 PIRAL WOUND G
-1 ASKET with In
-1 ner and Outer
-1  Ring CL300(P
-1 N50) 304/FG,O
-80 Heat Tr
-1 acing
999
`;

const result = parser.parse(overflowIdf, { unitMode: 'metric' });

assert.equal(result.materials.length, 1);
assert.equal(result.materials[0].code, 'PGGSD63A4DGDZZ-08');
assert.equal(
  result.materials[0].description,
  '/PGGSD63A4DGDZZ-08 DN200 SPIRAL WOUND GASKET with Inner and Outer Ring CL300(PN50) 304/FG,O'
);
assert.deepEqual(result.materials[0].optional, ['Heat Tracing']);
assert.equal(result.rows[0].code, 'PGGSD63A4DGDZZ-08');
assert.equal(
  result.rows[0].description,
  '/PGGSD63A4DGDZZ-08 DN200 SPIRAL WOUND GASKET with Inner and Outer Ring CL300(PN50) 304/FG,O / Heat Tracing'
);

// A later stray overflow record must not modify the last material text once a
// non-text record has closed the continuation context.
const closedContext = parser.parse(`
-20 ITEM
100 0 0 0 10000 0 0 25 1 1 2000000 PIPE 0 1
-1 SHOULD-NOT-APPEND
-21 DESCRIPTION
999
`);
assert.equal(closedContext.materials[0].code, 'ITEM');

const skeyCases = {
  FLWN: [105, '对焊颈法兰'],
  ',VTFL,': [130, '法兰闸阀'],
  ELSW: [35, '承插焊弯头'],
  IDFL: [90, '法兰仪表盘'],
  ELBW: [35, '对焊弯头'],
  FLSW: [105, '承插焊法兰'],
  FPPL: [101, '定长管'],
  SKSW: [40, '承插焊支管台'],
  WTBW: [40, '对焊支管台'],
  SWBW: [40, '对焊支管台'],
  LABW: [40, '对焊支管台'],
  HCSW: [40, '承插焊支管台'],
  NZWS: [31, '管嘴'],
  CLVR: [113, '卡箍'],
  LNSW: [113, '承插焊接头'],
  LVBW: [95, 'Victaulic 焊接环']
};
Object.entries(skeyCases).forEach(([skey, [type, expected]]) => {
  assert.equal(parser.resolveSkey(skey, type).name, expected, `SKEY ${skey}`);
});
assert.equal(parser.resolveSkey('ZZZZ', 130).name, '阀门');
assert.equal(parser.resolveSkey('BOLT', 115).name, '螺栓', '不得把 BOLT 跨类型误匹配为 BO**');
assert.equal(parser.resolveSkey('BOFL', 95).name, 'Block offset', '相同通配规则在正确 IDF 类型上仍应生效');

const pipelineResult = parser.parse(`
-6 LINE-100-
-1 A
100 0 0 0 10000 0 0 25 1 1 2000000 PIPE 0 1
-6 LINE-200
100 0 0 0 20000 0 0 25 1 2 2000000 PIPE 0 1
-20 PIPE-CODE
-21 PIPE DESCRIPTION
999
`);
assert.equal(pipelineResult.rows.length, 2, '每个管线号的材料必须单独统计');
assert.equal(pipelineResult.rows.find(row => row.pipelineNumber === 'LINE-100-A').quantity, 0.1);
assert.equal(pipelineResult.rows.find(row => row.pipelineNumber === 'LINE-200').quantity, 0.2);

const mergedResult = parser.mergeParsedResults([
  { name: 'A.idf', parsed: pipelineResult },
  { name: 'B.idf', parsed: pipelineResult }
]);
assert.equal(mergedResult.rows.length, 2, '多文件中相同管线号、SKEY、规格和材料才允许合并');
assert.equal(mergedResult.stats.componentCount, 4);
assert.equal(mergedResult.rows.find(row => row.pipelineNumber === 'LINE-100-A').quantity, 0.2);
assert.equal(mergedResult.rows.find(row => row.pipelineNumber === 'LINE-200').quantity, 0.4);
assert.ok(mergedResult.rows.every(row => row.sourceFiles.join(',') === 'A.idf,B.idf'));

const materialGroupingResult = parser.parse(`
-6 GROUPING-TEST
35 0 0 0 10000 0 0 200 1 1 2000000 ELSW 0 1
35 20000 0 0 30000 0 0 200 1 1 2000000 ELBW 0 2
35 40000 0 0 50000 0 0 100 1 1 2000000 ELSW 0 1
35 60000 0 0 70000 0 0 200 2 1 2000000 ELSW 0 1
35 80000 0 0 90000 0 0 200 3 1 2000000 ELSW 0 1
35 100000 0 0 110000 0 0 200 4 1 2000000 ELSW 0 1
-20 SAME-CODE
-21 SAME DESCRIPTION
-20 SAME-CODE
-21 SAME DESCRIPTION
-20 SAME-CODE
-21 DIFFERENT DESCRIPTION
-20 DIFFERENT-CODE
-21 SAME DESCRIPTION
999
`);
assert.equal(materialGroupingResult.rows.length, 5, '编码、描述、规格、单位、SKEY 和管线号全部相同才允许合并');
const groupedSameMaterial = materialGroupingResult.rows.find(row => row.code === 'SAME-CODE' && row.description === 'SAME DESCRIPTION' && row.bore === 'DN200' && row.skey === 'ELSW');
assert.ok(groupedSameMaterial, '应找到相同规格、相同材料、相同 SKEY 的合并行');
assert.equal(groupedSameMaterial.quantity, 2, '相同 SKEY 和管线号的相同材料应累计数量');
assert.equal(groupedSameMaterial.classification, '制作');
assert.equal(materialGroupingResult.rows.find(row => row.skey === 'ELBW').quantity, 1, '不同 SKEY 必须拆成新材料行');
assert.ok(materialGroupingResult.rows.some(row => row.code === 'SAME-CODE' && row.description === 'SAME DESCRIPTION' && row.bore === 'DN100'), '不同规格必须拆行');
assert.ok(materialGroupingResult.rows.some(row => row.code === 'SAME-CODE' && row.description === 'DIFFERENT DESCRIPTION'), '不同描述必须拆行');
assert.ok(materialGroupingResult.rows.some(row => row.code === 'DIFFERENT-CODE'), '不同物料编码必须拆行');

const strictBomResult = parser.parse(`
-6 FILTER-TEST
100 0 0 0 10000 0 0 25 0 1 2000000 PIPE 0 1
100 0 0 0 10000 0 0 25 1 1 0 PIPE 0 1
100 0 0 0 10000 0 0 25 1 1 1000000 PIPE 0 1
100 0 0 0 10000 0 0 25 1 1 2000000 PIPE 0 1
-20 PIPE-CODE
-21 PIPE DESCRIPTION
999
`);
assert.equal(strictBomResult.stats.componentCount, 4);
assert.equal(strictBomResult.stats.includedCount, 2);
assert.equal(strictBomResult.stats.excludedCount, 2);
assert.equal(strictBomResult.stats.excludedPointerCount, 1);
assert.equal(strictBomResult.stats.excludedBomModeCount, 1);
assert.equal(strictBomResult.rows.length, 1);
assert.equal(strictBomResult.rows[0].quantity, 0.2, 'Millions 0 和 2 的管段均应计入');
assert.equal(parser.parseMaterialPointer('123456000'), 0, '复合字段最低三位 000 必须保持为零指针');
assert.equal(parser.parseMaterialPointer('123456001'), 1, '复合字段最低三位是物料指针');
assert.equal(parser.parseMaterialPointer('000123456'), 456, '高位字段不得覆盖最低三位的物料指针');
assert.equal(parser.decodeFlags(0, 5).classification, '未分类');
assert.equal(parser.decodeFlags(0, 5).classificationValid, false);
assert.equal(parser.decodeFlags(0, 3).classification, '海工');
assert.equal(parser.decodeFlags(0, 3).classificationValid, true);

const reducingResult = parser.parse(`
-6 REDUCING-TEST
100 0 0 0 10000 0 0 200 1 1 2000000 PIPE 0 1
35 10000 0 0 20000 0 0 200 2 1 2000000 ELSW 0 1
100 20000 0 0 30000 0 0 100 3 1 2000000 PIPE 0 1
100 40000 0 0 50000 0 0 200 1 1 2000000 PIPE 0 1
35 50000 0 0 60000 0 0 200 2 1 2000000 ELSW 0 1
100 60000 0 0 70000 0 0 200 1 1 2000000 PIPE 0 1
-20 PIPE-200
-21 PIPE DN200
-20 ELBOW-200
-21 ELBOW
-20 PIPE-100
-21 PIPE DN100
999
`);
const elbowRows = reducingResult.rows.filter(row => row.componentType === '承插焊弯头');
assert.equal(elbowRows.length, 2);
assert.ok(elbowRows.some(row => row.bore === 'DN200×100' && row.isReducing), '异径弯头应显示大径×小径');
assert.ok(elbowRows.some(row => row.bore === 'DN200' && !row.isReducing), '等径弯头应保持单一规格');
assert.ok(reducingResult.rows.filter(row => row.category === '管道').every(row => !row.isReducing), '管道不得被标为异径管件');

const quantityResult = parser.parse(`
-6 QUANTITY-TEST
45 0 0 0 10000 0 0 200 1 1 2000000 TESW 0 1
46 10000 0 0 10000 10000 0 100 1 1 2000000 TESW 0 1
47 10000 0 0 20000 0 0 200 1 1 2000000 TESW 0 1
101 30000 0 0 36000 0 0 200 2 1 2000000 FPPL 0 1
100 40000 0 0 46000 0 0 200 3 1 2000000 PIPE 0 1
-20 TEE-CODE
-21 TEE DESCRIPTION
-20 FIXED-PIPE-CODE
-21 FIXED PIPE DESCRIPTION
-20 PIPE-CODE
-21 PIPE DESCRIPTION
999
`);
assert.equal(quantityResult.stats.componentCount, 5, '应保留原始组件记录总数');
assert.equal(quantityResult.stats.continuationRecordCount, 2, '三通的 46/47 是延续腿记录');
assert.equal(quantityResult.stats.includedCount, 3, '三通、定长管和普通管道各形成一个材料项');
const teeQuantity = quantityResult.rows.find(row => row.code === 'TEE-CODE');
const fixedPipeQuantity = quantityResult.rows.find(row => row.code === 'FIXED-PIPE-CODE');
const pipeQuantity = quantityResult.rows.find(row => row.code === 'PIPE-CODE');
assert.equal(teeQuantity.quantity, 1);
assert.equal(teeQuantity.unit, '件');
assert.equal(fixedPipeQuantity.quantity, 1, '定长管必须按件计');
assert.equal(fixedPipeQuantity.unit, '件');
assert.equal(pipeQuantity.quantity, 0.06, '普通管道应按坐标长度计米');
assert.equal(pipeQuantity.unit, 'm');

const skswQuantityResult = parser.parse(`
-6 SKSW-COUNT-TEST
40 0 0 0 0 0 0 200 2, , 2000000 , , 9000 1
41 0 0 0 10000 0 0 40 1, , 2000000 ,SKSW, 9000 1
42 0 0 0 0 0 0 200 2, , 2000000 , , 9000 1
40 20000 0 0 20000 0 0 200 2, , 2000000 , , 9000 1
41 20000 0 0 30000 0 0 40 1, , 2000000 ,SKSW, 9000 1
42 20000 0 0 20000 0 0 200 2, , 2000000 , , 9000 1
40 40000 0 0 50000 0 0 40 1, , 2000000 ,SKSW, 9000 1
41 50000 0 0 50000 0 0 200 2, , 2000000 , , 9000 1
42 50000 0 0 50000 0 0 200 2, , 2000000 , , 9000 1
-20 SKSW-MATERIAL
-21 SOCKET WELD OLET
-20 PIPE-MATERIAL
-21 PIPE
999
`);
const skswQuantityRows = skswQuantityResult.rows.filter(row => row.skey === 'SKSW');
assert.equal(skswQuantityRows.length, 1, '相同管线、规格和材料的 SKSW 应汇总为一行');
assert.equal(skswQuantityRows[0].quantity, 3, 'SKSW 位于 40 或 41 记录时都必须正确计数');
assert.equal(skswQuantityResult.rows.some(row => row.skey === '' && row.componentType === '支管座'), false, '不得把 Olet 的空 SKEY 腿误计为材料');

console.log('parser tests passed');
