/**
 * maple-starforce-analyzer - markovEngine.js
 * 마르코프 해석적 기댓값 및 고정밀 몬테카를로 PMF 생성 엔진
 */

import { DEFAULT_EVENT, getAttemptCosts, getProbTable, getRestoreTotalCost, parseEvent } from './starforceData.js';
import { StarforceOptimizer } from './optimizer.js';

export class MarkovEngine {
  static analyzeItem(item, options = {}, binSize = 10000000) {
    return this.simulateItem(item, options, 40000, binSize);
  }

  /**
   * 단일 아이템 스타포스 강화 시뮬레이션 및 확률분포 생성
   */
  static simulateItem(item, options = {}, simulationCount = 40000, binSize = 10000000) {
    const {
      level = 200,
      startStar = 0,
      targetStar = 22,
      baseCost = 0,
      count = 1,
      name = '장비'
    } = item;

    if (startStar >= targetStar) {
      return {
        item,
        name,
        count,
        expCost: 0,
        expPureCost: 0,
        expRecoverCost: 0,
        expDestroys: 0,
        expDestroyCount: 0,
        expTrials: 0,
        costPMF: new Float64Array([1]),
        destroyPMF: new Float64Array([1]),
        binSize
      };
    }

    const {
      event = DEFAULT_EVENT,
      autoOptimize = true,
      mvpDiscount = 0,
      pcRoom = false
    } = options;

    // 수학적 마르코프 최적화 및 정확 기댓값 산출
    const exactResult = StarforceOptimizer.getExactMarkovExpectation(item, event, mvpDiscount, pcRoom);
    const strategies = exactResult.optimal.strategies;

    const safeguardRecord = {};
    exactResult.optimal.destroyPrevention.forEach(s => { safeguardRecord[s] = true; });

    const probTable = getProbTable(safeguardRecord, event);
    const costs = getAttemptCosts(level, event, mvpDiscount, pcRoom);
    const { onePlusOneUnder10 } = parseEvent(event);

    const restoreInfos = {};
    exactResult.optimal.restore.forEach(s => {
      restoreInfos[s] = getRestoreTotalCost({ level, star: s, spareCost: baseCost, event });
    });

    // 기대 시도 횟수가 매우 큰 구간(26성 이상 등)은 시뮬레이션 총 시도 수를 제한해 UI 멈춤 방지
    const MAX_TOTAL_TRIALS = 2e7;
    const simCount = Math.max(1, Math.min(simulationCount, Math.floor(MAX_TOTAL_TRIALS / Math.max(1, exactResult.expTrials))));

    const costMap = new Map();
    const destroyMap = new Map();

    for (let sim = 0; sim < simCount; sim++) {
      let star = startStar;
      let spentCost = 0;
      let consumedEquipCount = 0;

      while (star < targetStar) {
        const [pSuccess, pMaintain] = probTable[star];
        spentCost += safeguardRecord[star] ? costs.protected[star] : costs.discounted[star];

        const r = Math.random();
        if (r < pSuccess) {
          star += 1 + (onePlusOneUnder10 && star <= 10 ? 1 : 0);
        } else if (r < pSuccess + pMaintain) {
          // 유지
        } else if (strategies[star] === 'restore') {
          // 확정복구: 15~22성은 해당 성수, 23성 이상은 22성으로 복구
          const restoreInfo = restoreInfos[star];
          consumedEquipCount += restoreInfo.spareCount;
          spentCost += restoreInfo.totalCost;
          star = Math.min(star, 22);
        } else {
          // 12성 롤백 복구
          consumedEquipCount += 1;
          spentCost += baseCost;
          star = 12;
        }
      }

      // 비용 히스토그램 Binning
      const binIdx = Math.floor(spentCost / binSize);
      costMap.set(binIdx, (costMap.get(binIdx) || 0) + 1);

      // 소모 장비 히스토그램
      destroyMap.set(consumedEquipCount, (destroyMap.get(consumedEquipCount) || 0) + 1);
    }

    // PMF 생성
    let maxBin = 0;
    for (const k of costMap.keys()) {
      if (k > maxBin) maxBin = k;
    }
    const costPMF = new Float64Array(maxBin + 1);
    for (let i = 0; i <= maxBin; i++) {
      costPMF[i] = (costMap.get(i) || 0) / simCount;
    }

    let maxDest = 0;
    for (const k of destroyMap.keys()) {
      if (k > maxDest) maxDest = k;
    }
    const destroyPMF = new Float64Array(maxDest + 1);
    for (let i = 0; i <= maxDest; i++) {
      destroyPMF[i] = (destroyMap.get(i) || 0) / simCount;
    }

    // 수량(count) 배수 적용
    return {
      item,
      name,
      count,
      expCost: exactResult.expCost * count, // 수학적 정확 기댓값
      expPureCost: exactResult.expPureCost * count,
      expRecoverCost: exactResult.expRecoverCost * count,
      expDestroys: exactResult.expDestroys * count, // 기대 소모 장비 개수 (확정복구 스페어 포함)
      expDestroyCount: exactResult.expDestroyCount * count, // 기대 파괴 횟수
      expTrials: exactResult.expTrials * count,
      simulationCount: simCount,
      costPMF,
      destroyPMF,
      binSize
    };
  }
}
