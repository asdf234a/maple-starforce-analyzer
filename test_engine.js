import { STARFORCE_CONFIG, getCosts, getProbTable, getRestoreTotalCost } from './src/starforceData.js';
import { MarkovEngine } from './src/markovEngine.js';
import { MultiAnalyzer } from './src/multiAnalyzer.js';

console.log('=== mesulive (https://github.com/kurateh/mesulive) 기준 테스트 ===');

// 1. 단일 아케인 0->22성 (샤타포스 1516 포함, 15-17 파방, 노작 1.5억)
const testItem1 = {
  name: '아케인셰이드 (200제)',
  level: 200,
  startStar: 0,
  targetStar: 22,
  baseCost: 150000000,
  count: 1
};

const options = {
  event: '샤타포스(15 16 포함)',
  safeguardRecord: { 15: true, 16: true, 17: true },
  restoreRecord: { 15: true, 16: true, 17: true, 18: true, 19: true, 20: true, 21: true, 22: true },
  mvpDiscount: 0,
  pcRoom: false
};

const singleRes = MarkovEngine.analyzeItem(testItem1, options);
console.log(`\n[단일 200제 아케인 0->22성 결과]`);
console.log(`기대 총비용: ${(singleRes.expCost / 100000000).toFixed(2)}억 메소`);
console.log(`순수 강화비: ${(singleRes.expPureCost / 100000000).toFixed(2)}억 메소`);
console.log(`흔적 복구비: ${(singleRes.expRecoverCost / 100000000).toFixed(2)}억 메소`);
console.log(`기대 소모 장비: ${singleRes.expDestroys.toFixed(2)}개`);
console.log(`기대 시도: ${singleRes.expTrials.toFixed(2)}회`);

// 2. 칠흑 5부위 22성
const darkboss5 = [
  { name: '거대한 공포 (200제)', level: 200, startStar: 0, targetStar: 22, baseCost: 4000000000, count: 1 },
  { name: '근원의 속삭임 (200제)', level: 200, startStar: 0, targetStar: 22, baseCost: 4500000000, count: 1 },
  { name: '마력이 깃든 안대 (160제)', level: 160, startStar: 0, targetStar: 22, baseCost: 2500000000, count: 1 },
  { name: '루즈 컨트롤 마크 (160제)', level: 160, startStar: 0, targetStar: 22, baseCost: 2500000000, count: 1 },
  { name: '커맨더 포스 링 (160제)', level: 160, startStar: 0, targetStar: 22, baseCost: 2200000000, count: 1 }
];

const multiRes = MultiAnalyzer.analyze(darkboss5, options);
console.log(`\n[칠흑 5부위 22성 결합 FFT 결과]`);
console.log(`총 기대 비용: ${(multiRes.totalExpCost / 1000000000000).toFixed(2)}조 메소`);
console.log(`총 기대 소모 장비: ${multiRes.totalExpDestroys.toFixed(2)}개`);
console.log(`상위 10% 컷: ${(multiRes.percentiles.p10 / 1000000000000).toFixed(2)}조 메소`);
console.log(`중앙값 (50%): ${(multiRes.percentiles.p50 / 1000000000000).toFixed(2)}조 메소`);
console.log(`하위 10% (90%): ${(multiRes.percentiles.p90 / 1000000000000).toFixed(2)}조 메소`);
console.log(`연산 소요 시간: ${multiRes.calcTimeMs.toFixed(2)} ms`);
