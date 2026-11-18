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
  FPPL: [101, '定长管']
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
assert.equal(pipelineResult.rows.length, 2, '相同物料在不同管线中必须分别汇总');
assert.deepEqual(pipelineResult.rows.map(row => row.pipelineNumber).sort(), ['LINE-100-A', 'LINE-200']);

const mergedResult = parser.mergeParsedResults([
  { name: 'A.idf', parsed: pipelineResult },
  { name: 'B.idf', parsed: pipelineResult }
]);
assert.equal(mergedResult.rows.length, 2, '多文件中相同管线和物料应合并');
assert.equal(mergedResult.stats.componentCount, 4);
assert.equal(mergedResult.rows.find(row => row.pipelineNumber === 'LINE-100-A').quantity, 0.2);
assert.deepEqual(mergedResult.rows[0].sourceFiles, ['A.idf', 'B.idf']);

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

console.log('parser tests passed');
