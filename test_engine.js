/**
 * 스타포스 기댓값 엔진 검증
 * - starforce.gg 블로그 수식 레퍼런스(test/blog_reference.json)와 12→13~30성 전 구간 비교
 * - 확률표/시작 성수 분해/몬테카를로 일관성 검사
 * 실행: npm test
 */
import fs from 'fs';
import assert from 'assert/strict';
import { STARFORCE_CONFIG, DEFAULT_EVENT, getProbTable } from './src/starforceData.js';
import { StarforceOptimizer } from './src/optimizer.js';
import { MarkovEngine } from './src/markovEngine.js';
import { MultiAnalyzer } from './src/multiAnalyzer.js';

const EVENTS = {
  none: null,
  shata: DEFAULT_EVENT,
  '1516': '15·16성 1+1',
  destroy: '파괴 확률 30% 감소',
  discount: '강화 비용 30% 할인'
};
const MVP = { none: 0, silver: 0.03, gold: 0.05, diamond: 0.1 };

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log(`✔ ${name}`);
  } catch (e) {
    failures++;
    console.log(`✘ ${name}\n  ${e.message}`);
  }
}

function assertClose(actual, expected, relTol, label) {
  const err = expected === 0 ? Math.abs(actual) : Math.abs(actual / expected - 1);
  assert.ok(Number.isFinite(actual) && err <= relTol, `${label}: expected ${expected}, got ${actual} (rel err ${err})`);
}

const eok = v => `${(v / 1e8).toFixed(2)}억`;

// 1. 확률표
test('확률표 각 행의 합 = 1', () => {
  STARFORCE_CONFIG.probTable.forEach((row, s) => {
    assertClose(row[0] + row[1] + row[2], 1, 1e-12, `${s}성`);
  });
  for (const ev of Object.values(EVENTS)) {
    getProbTable({ 15: true, 16: true, 17: true }, ev).forEach((row, s) => {
      assertClose(row[0] + row[1] + row[2], 1, 1e-12, `${ev} ${s}성`);
    });
  }
});

// 2. 블로그 레퍼런스 비교
const reference = JSON.parse(fs.readFileSync(new URL('./test/blog_reference.json', import.meta.url)));

test(`블로그 레퍼런스 ${reference.length}개 조건 × 13~30성: 기대 비용·파괴 횟수·시도 횟수 일치`, () => {
  for (const c of reference) {
    const label = `${c.level}제 노작 ${eok(c.baseCost)} ${c.event} mvp=${c.mvp} pc=${c.pcRoom}`;
    for (let target = 13; target <= 30; target++) {
      const r = StarforceOptimizer.getExactMarkovExpectation(
        { level: c.level, baseCost: c.baseCost, startStar: 12, targetStar: target },
        EVENTS[c.event], MVP[c.mvp], c.pcRoom
      );
      assertClose(r.expCost, c.cost[target], 1e-9, `${label} 12→${target} 비용`);
      assertClose(r.expDestroyCount, c.destroys[target], 1e-9, `${label} 12→${target} 파괴 횟수`);
      assertClose(r.expTrials, c.trials[target], 1e-9, `${label} 12→${target} 시도 횟수`);
    }
  }
});

test('블로그 Python expected_to(22) 결과와 12→22성 일치', () => {
  for (const c of reference) {
    const r = StarforceOptimizer.getExactMarkovExpectation(
      { level: c.level, baseCost: c.baseCost, startStar: 12, targetStar: 22 },
      EVENTS[c.event], MVP[c.mvp], c.pcRoom
    );
    assertClose(r.expCost, c.blogCode22, 1e-9, `${c.level}제 ${c.event}`);
  }
});

// 3. 시작 성수 분해 E[N→M] = E[12→M] − E[12→N]
test('시작 성수가 12성 초과일 때 E[N→M] = E[12→M] − E[12→N]', () => {
  const c = reference.find(x => x.level === 200 && x.baseCost === 15e8 && x.event === 'shata' && x.mvp === 'none');
  for (const [n, m] of [[17, 22], [18, 22], [22, 25], [24, 30]]) {
    const r = StarforceOptimizer.getExactMarkovExpectation(
      { level: 200, baseCost: 15e8, startStar: n, targetStar: m }, DEFAULT_EVENT
    );
    assertClose(r.expCost, c.cost[m] - c.cost[n], 1e-9, `${n}→${m}`);
  }
});

// 4. 최적 전략은 단계별 최솟값 (5% 마진 없음)
test('단계별로 기대값이 가장 낮은 전략을 선택', () => {
  for (const c of reference) {
    const opt = StarforceOptimizer.getOptimalReinforcement({ level: c.level, baseCost: c.baseCost }, EVENTS[c.event], MVP[c.mvp], c.pcRoom);
    for (const d of opt.stepDetails) {
      const options = [d.costRollback, d.costSafe, d.costRestore].filter(v => v !== null);
      assert.equal(d.minCost, Math.min(...options), `${c.level}제 ${d.star}성`);
    }
  }
  const opt = StarforceOptimizer.getOptimalReinforcement({ level: 160, baseCost: 25e8 }, DEFAULT_EVENT);
  assert.ok(opt.restore.includes(18) && opt.restore.includes(20), `160제 노작 25억 샤타: 18·20성 확정복구 선택 (got ${opt.restore})`);
});

// 5. 몬테카를로 분포가 정확 기댓값과 일치 (표본평균 ± 4σ)
function mcCheck(item, options, sims) {
  const binSize = 1e6;
  const r = MarkovEngine.simulateItem(item, options, sims, binSize);
  let mean = 0;
  let sq = 0;
  r.costPMF.forEach((p, i) => {
    const v = (i + 0.5) * binSize;
    mean += p * v;
    sq += p * v * v;
  });
  const se = Math.sqrt((sq - mean * mean) / r.simulationCount);
  const diff = Math.abs(mean - r.expCost);
  assert.ok(diff <= 4 * se + binSize, `MC 평균 ${eok(mean)} vs 정확 ${eok(r.expCost)} (σ/√n=${eok(se)})`);
  return { mean, exact: r.expCost };
}

test('몬테카를로 평균 ≈ 정확 기댓값 (0→22, 샤타)', () => {
  mcCheck({ level: 200, startStar: 0, targetStar: 22, baseCost: 30e8 }, { event: DEFAULT_EVENT }, 40000);
});

test('몬테카를로 평균 ≈ 정확 기댓값 (12→22, 평시 MVP 다이아 + PC방)', () => {
  mcCheck({ level: 160, startStar: 12, targetStar: 22, baseCost: 25e8 }, { event: null, mvpDiscount: 0.1, pcRoom: true }, 40000);
});

test('몬테카를로 평균 ≈ 정확 기댓값 (22→24, 23성 이상 22성 확정복구 경로)', () => {
  const opt = StarforceOptimizer.getOptimalReinforcement({ level: 200, baseCost: 5e8 }, null);
  assert.ok(opt.restore.includes(23), `200제 노작 5억 평시: 23성 확정복구 선택 (got ${opt.restore})`);
  mcCheck({ level: 200, startStar: 22, targetStar: 24, baseCost: 5e8 }, { event: null }, 20000);
});

test('몬테카를로 평균 ≈ 정확 기댓값 (0→12, 10성 이하 1+1)', () => {
  mcCheck({ level: 200, startStar: 0, targetStar: 12, baseCost: 1e8 }, { event: '10성 이하 1+1' }, 40000);
});

// 6. 26성 이상 목표도 유한한 값
test('26~30성 목표: 비용/파괴/시도가 유한하고 단조 증가', () => {
  let prev = 0;
  for (let t = 22; t <= 30; t++) {
    const r = StarforceOptimizer.getExactMarkovExpectation({ level: 250, baseCost: 15e8, startStar: 0, targetStar: t }, DEFAULT_EVENT);
    for (const k of ['expCost', 'expDestroys', 'expDestroyCount', 'expTrials']) {
      assert.ok(Number.isFinite(r[k]) && r[k] >= 0, `${t}성 ${k}=${r[k]}`);
    }
    assert.ok(r.expCost > prev, `${t}성 비용 증가`);
    prev = r.expCost;
  }
});

// 7. 다중 장비 결합 분석 (요약 출력)
test('칠흑 5부위 22성 결합 분석', () => {
  const items = [
    { name: '거대한 공포', level: 200, startStar: 0, targetStar: 22, baseCost: 40e8, count: 1 },
    { name: '근원의 속삭임', level: 200, startStar: 0, targetStar: 22, baseCost: 45e8, count: 1 },
    { name: '마력이 깃든 안대', level: 160, startStar: 0, targetStar: 22, baseCost: 25e8, count: 1 },
    { name: '루즈 컨트롤 마크', level: 160, startStar: 0, targetStar: 22, baseCost: 25e8, count: 1 },
    { name: '커맨더 포스 링', level: 160, startStar: 0, targetStar: 22, baseCost: 22e8, count: 1 }
  ];
  const res = MultiAnalyzer.analyze(items, { event: DEFAULT_EVENT });
  assert.ok(res.percentiles.p10 <= res.percentiles.p50 && res.percentiles.p50 <= res.percentiles.p90);
  console.log(`  총 기대 비용 ${eok(res.totalExpCost)} | 기대 소모 장비 ${res.totalExpDestroys.toFixed(2)}개 | ` +
    `p10 ${eok(res.percentiles.p10)} / p50 ${eok(res.percentiles.p50)} / p90 ${eok(res.percentiles.p90)} | ${res.calcTimeMs.toFixed(0)}ms`);
});

test('다중 분석: 30성 목표도 메모리 폭주 없이 완료', () => {
  const res = MultiAnalyzer.analyze([{ name: '에테르넬', level: 250, startStar: 22, targetStar: 30, baseCost: 15e8, count: 1 }], { event: DEFAULT_EVENT });
  assert.ok(Number.isFinite(res.totalExpCost));
});

if (failures > 0) {
  console.log(`\n${failures}개 테스트 실패`);
  process.exit(1);
}
console.log('\n모든 테스트 통과');
