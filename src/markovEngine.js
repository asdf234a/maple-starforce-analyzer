/**
 * maple-starforce-analyzer - markovEngine.js
 * 마르코프 해석적 기댓값 및 고정밀 몬테카를로 PMF 생성 엔진
 */

import { STARFORCE_CONFIG, getCosts, getProbTable, getRestoreTotalCost } from './starforceData.js';
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
        expTrials: 0,
        costPMF: new Float64Array([1]),
        destroyPMF: new Float64Array([1]),
        binSize
      };
    }

    const {
      event = '샤이닝 스타포스 (비용 30% 할인 + 21성 이하 파괴 확률 30% 감소 + 흔적 복구 메소 20% 할인)',
      autoOptimize = true,
      mvpDiscount = 0,
      pcRoom = false
    } = options;

    // 수학적 마르코프 최적화 및 정확 기댓값 산출
    const exactResult = StarforceOptimizer.getExactMarkovExpectation(item, event, mvpDiscount, pcRoom);
    const optimal = exactResult.optimal;

    const safeguardRecord = {
      15: optimal.destroyPrevention.includes(15),
      16: optimal.destroyPrevention.includes(16),
      17: optimal.destroyPrevention.includes(17)
    };

    const restoreRecord = {};
    for (let s = 15; s <= 22; s++) {
      restoreRecord[s] = optimal.restore.includes(s);
    }

    const probTable = getProbTable(safeguardRecord, event);
    const defaultCosts = getCosts(level);

    // 할인율 계산
    let discountRatio = mvpDiscount;
    if (pcRoom) discountRatio += 0.05;
    const isGlobalDiscount = event !== null && (event.includes('30%') || event.includes('샤이닝') || event.includes('샤타'));

    const discountedCosts = defaultCosts.map((cost, index) => {
      let c = index < 17 ? cost * (1 - discountRatio) : cost;
      if (isGlobalDiscount) c *= 0.7;
      return Math.round(c);
    });

    const isOnePlusOneEvent = event === '10성 이하 1+1';

    let totalSpentCost = 0;
    let totalPureCost = 0;
    let totalRecoverCost = 0;
    let totalConsumedEquips = 0;
    let totalTrials = 0;

    const costMap = new Map();
    const destroyMap = new Map();

    for (let sim = 0; sim < simulationCount; sim++) {
      let star = startStar;
      let spentCost = 0;
      let pureCost = 0;
      let recoverCost = 0;
      let consumedEquipCount = 0;
      let trials = 0;

      while (star < targetStar) {
        trials++;
        const probabilities = probTable[star];
        const isDecided = probabilities[0] === 1.0;

        const isProtected = safeguardRecord[`${star}`] && !isDecided;
        const stepCost = discountedCosts[star] + (isProtected ? defaultCosts[star] * 2 : 0);

        spentCost += stepCost;
        pureCost += stepCost;

        if (isDecided) {
          star += 1;
        } else {
          const r = Math.random();
          const pSuccess = probabilities[0];
          const pMaintain = probabilities[1];

          if (r < pSuccess) {
            star += 1 + (isOnePlusOneEvent && star <= 10 ? 1 : 0);
          } else if (r < pSuccess + pMaintain) {
            // 유지
          } else {
            // 파괴
            const isRestore = restoreRecord[star];

            if (isRestore) {
              // 직전 성수 복구
              const restoreInfo = getRestoreTotalCost({
                level,
                star,
                spareCost: baseCost,
                event
              });
              if (restoreInfo) {
                consumedEquipCount += restoreInfo.spareCount;
                spentCost += restoreInfo.totalCost;
                recoverCost += restoreInfo.totalCost;
              } else {
                consumedEquipCount += 1;
                spentCost += baseCost;
                recoverCost += baseCost;
                star = 12;
              }
            } else {
              // 12성 롤백 복구
              consumedEquipCount += 1;
              spentCost += baseCost;
              recoverCost += baseCost;
              star = 12;
            }
          }
        }
      }

      totalSpentCost += spentCost;
      totalPureCost += pureCost;
      totalRecoverCost += recoverCost;
      totalConsumedEquips += consumedEquipCount;
      totalTrials += trials;

      // 비용 히스토그램 Binning
      const binIdx = Math.floor(spentCost / binSize);
      costMap.set(binIdx, (costMap.get(binIdx) || 0) + 1);

      // 파괴 횟수 히스토그램
      destroyMap.set(consumedEquipCount, (destroyMap.get(consumedEquipCount) || 0) + 1);
    }

    // PMF 생성
    let maxBin = 0;
    for (const k of costMap.keys()) {
      if (k > maxBin) maxBin = k;
    }
    const costPMF = new Float64Array(maxBin + 1);
    for (let i = 0; i <= maxBin; i++) {
      costPMF[i] = (costMap.get(i) || 0) / simulationCount;
    }

    let maxDest = 0;
    for (const k of destroyMap.keys()) {
      if (k > maxDest) maxDest = k;
    }
    const destroyPMF = new Float64Array(maxDest + 1);
    for (let i = 0; i <= maxDest; i++) {
      destroyPMF[i] = (destroyMap.get(i) || 0) / simulationCount;
    }

    // 수량(count) 배수 적용
    return {
      item,
      name,
      count,
      expCost: exactResult.expCost * count, // 수학적 정확 기댓값 적용
      expPureCost: (totalPureCost / simulationCount) * count,
      expRecoverCost: (totalRecoverCost / simulationCount) * count,
      expDestroys: exactResult.expDestroys * count, // 수학적 정확 파괴수 적용
      expTrials: exactResult.expTrials * count,
      costPMF,
      destroyPMF,
      binSize
    };
  }
}
