/**
 * maple-starforce-analyzer - markovEngine.js
 * mesulive (https://github.com/kurateh/mesulive) 시뮬레이션 알고리즘 및 마르코프 엔진 연동
 */

import { STARFORCE_CONFIG, getCosts, getProbTable, getRestoreTotalCost } from './starforceData.js';
import { FFTEngine } from './fftEngine.js';
import { StarforceOptimizer } from './optimizer.js';

export class MarkovEngine {
  /**
   * 단일 아이템 스타포스 강화 시뮬레이션 (mesulive & starforce.gg 최적화 지원)
   */
  static simulateItem(item, options = {}, simulationCount = 40000, binSize = 10000000) {
    const {
      level = 200,
      startStar = 0,
      targetStar = 22,
      baseCost = 0, // spareCost
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
      event = '샤타포스(15 16 포함)',
      autoOptimize = false,
      mvpDiscount = 0,
      pcRoom = false
    } = options;

    let safeguardRecord = options.safeguardRecord || { 15: true, 16: true, 17: true };
    let restoreRecord = options.restoreRecord || { 15: true, 16: true, 17: true, 18: true, 19: true, 20: true, 21: true, 22: true };

    // starforce.gg 강화 자동 최적화 모드
    if (autoOptimize) {
      const optimal = StarforceOptimizer.getOptimalReinforcement(item, event, mvpDiscount, pcRoom);
      safeguardRecord = {
        15: optimal.destroyPrevention.includes(15),
        16: optimal.destroyPrevention.includes(16),
        17: optimal.destroyPrevention.includes(17)
      };
      restoreRecord = {};
      for (let s = 15; s <= 22; s++) {
        restoreRecord[s] = optimal.restore.includes(s);
      }
    }

    const probTable = getProbTable(safeguardRecord, event);
    const defaultCosts = getCosts(level);

    // 할인율 계산
    let discountRatio = mvpDiscount;
    if (pcRoom) discountRatio += 0.05;

    const eventsWithGlobalCostDiscount = [
      '30% 할인',
      '샤타포스',
      '샤타포스(+흔적 복구 비용 20% 할인)',
      '샤타포스(15 16 포함)'
    ];
    const isGlobalDiscount = event !== null && eventsWithGlobalCostDiscount.includes(event);

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

        // 비용 계산: 파괴방지 비용은 defaultCosts[star] * 2 추가
        const isProtected = safeguardRecord[`${star}`] && !isDecided;
        const stepCost = discountedCosts[star] + (isProtected ? defaultCosts[star] * 2 : 0);

        spentCost += stepCost;
        pureCost += stepCost;

        if (isDecided) {
          star += 1;
        } else {
          // 확률 뽑기
          const r = Math.random();
          const pSuccess = probabilities[0];
          const pMaintain = probabilities[1];
          const pDestroy = probabilities[2];

          if (r < pSuccess) {
            // 성공
            star += 1 + (isOnePlusOneEvent && star <= 10 ? 1 : 0);
          } else if (r < pSuccess + pMaintain) {
            // 유지
          } else {
            // 파괴
            const destroyedAtStar = star;
            const restoreTargetStar = (destroyedAtStar <= 22 && restoreRecord[`${destroyedAtStar}`])
              ? destroyedAtStar
              : (destroyedAtStar > 22 && restoreRecord['22'] ? 22 : null);

            if (restoreTargetStar !== null) {
              const restoreInfo = getRestoreTotalCost({
                level,
                star: restoreTargetStar,
                spareCost: baseCost,
                event
              });

              if (restoreInfo !== null) {
                consumedEquipCount += restoreInfo.spareCount;
                spentCost += restoreInfo.totalCost;
                recoverCost += restoreInfo.totalCost;
                star = restoreTargetStar;
              } else {
                consumedEquipCount += 1;
                star = 12;
                spentCost += baseCost;
                recoverCost += baseCost;
              }
            } else {
              consumedEquipCount += 1;
              star = 12;
              spentCost += baseCost;
              recoverCost += baseCost;
            }
          }
        }
      }

      totalSpentCost += spentCost;
      totalPureCost += pureCost;
      totalRecoverCost += recoverCost;
      totalConsumedEquips += consumedEquipCount;
      totalTrials += trials;

      const cBin = Math.round(spentCost / binSize);
      costMap.set(cBin, (costMap.get(cBin) || 0) + 1 / simulationCount);
      destroyMap.set(consumedEquipCount, (destroyMap.get(consumedEquipCount) || 0) + 1 / simulationCount);
    }

    let maxCBin = 0;
    for (const b of costMap.keys()) if (b > maxCBin) maxCBin = b;
    const singleCostPMF = new Float64Array(maxCBin + 1);
    for (const [b, p] of costMap.entries()) singleCostPMF[b] = p;

    let maxDBin = 0;
    for (const b of destroyMap.keys()) if (b > maxDBin) maxDBin = b;
    const singleDestroyPMF = new Float64Array(maxDBin + 1);
    for (const [b, p] of destroyMap.entries()) singleDestroyPMF[b] = p;

    let finalCostPMF = singleCostPMF;
    let finalDestroyPMF = singleDestroyPMF;

    if (count > 1) {
      const multiCostList = Array(count).fill(singleCostPMF);
      const multiDestroyList = Array(count).fill(singleDestroyPMF);
      finalCostPMF = FFTEngine.convolveMultiple(multiCostList);
      finalDestroyPMF = FFTEngine.convolveMultiple(multiDestroyList);
    }

    return {
      item,
      name,
      count,
      expCost: (totalSpentCost / simulationCount) * count,
      expPureCost: (totalPureCost / simulationCount) * count,
      expRecoverCost: (totalRecoverCost / simulationCount) * count,
      expDestroys: (totalConsumedEquips / simulationCount) * count,
      expTrials: (totalTrials / simulationCount) * count,
      costPMF: finalCostPMF,
      destroyPMF: finalDestroyPMF,
      binSize
    };
  }

  static analyzeItem(item, options = {}, binSize = 10000000) {
    return this.simulateItem(item, options, 40000, binSize);
  }
}
