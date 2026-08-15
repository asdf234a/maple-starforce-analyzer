/**
 * maple-starforce-analyzer - optimizer.js
 * 동적계획법(DP / Bellman Equation) 기반 강화 최적화 엔진
 * 
 * 12성 롤백 손실 = (baseCost + 12->s성 순수 강화 기댓값)
 * 확정 복구 손실 = (spareCount * baseCost + 할인된 복구 메소)
 * 파괴방지 비용 = 2 * 노할인 기본비용
 * 
 * 세 가지 전략 중 최소 비용 경로를 엄밀하게 도출합니다.
 */

import { STARFORCE_CONFIG, getCosts, getRestoreTotalCost } from './starforceData.js';

export class StarforceOptimizer {
  /**
   * getOptimalReinforcement
   * @param {Object} item - { level, baseCost }
   * @param {string|null} event - 이벤트
   * @param {number} mvpDiscount - MVP 할인율
   * @param {boolean} pcRoom - PC방 할인 여부
   * @returns {Object}
   */
  static getOptimalReinforcement(item, event = null, mvpDiscount = 0, pcRoom = false) {
    const level = item.level;
    const basePrice = item.baseCost; // 노작 장비 가격 (메소)
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

    const isDestroyReduction = event !== null && (event.includes('파괴') || event.includes('샤이닝') || event.includes('샤타'));

    // 12성부터 현재 성수까지의 순수 누적 비용 L (12성 이전은 파괴 없음)
    let cumulativeCost12ToCurrent = 0;
    let cumulativeDestroys = 0;
    let cumulativeTrials = 0;

    // 12 ~ 14성 구간
    for (let s = 12; s < 15; s++) {
      const pSuccess = STARFORCE_CONFIG.probTable[s][0];
      const stepCost = discountedCosts[s] / pSuccess;
      cumulativeCost12ToCurrent += stepCost;
      cumulativeTrials += 1 / pSuccess;
    }

    const optimalSafeguard = []; // 파괴방지 권장 성수 목록 [15, 16, 17]
    const optimalRestore = [];   // 확정복구 권장 성수 목록 [15..22]
    const stepDetails = [];      // 각 성수별 세부 비교 데이터

    // 15 ~ 17성 구간 (파괴방지 vs 확정복구 vs 12성 롤백 3자 비교)
    for (let s = 15; s <= 17; s++) {
      const baseProb = STARFORCE_CONFIG.probTable[s];
      const rawSuccess = baseProb[0];
      const rawDestroy = isDestroyReduction ? baseProb[2] * 0.7 : baseProb[2];

      const normalCost = discountedCosts[s];
      const safeguardCost = normalCost + defaultCosts[s] * 2;

      // 1) 파괴방지 사용 시
      const costSafe = safeguardCost / rawSuccess;

      // 2) 확정 복구 사용 시 (직전 성수 복구)
      const restoreInfo = getRestoreTotalCost({ level, star: s, spareCost: basePrice, event });
      const restoreLoss = restoreInfo ? restoreInfo.totalCost : Infinity;
      const costRestore = (normalCost + rawDestroy * restoreLoss) / rawSuccess;

      // 3) 12성 롤백 복구 사용 시
      const rollbackLoss = basePrice + cumulativeCost12ToCurrent;
      const costRollback = (normalCost + rawDestroy * rollbackLoss) / rawSuccess;

      let chosenStrategy = 'rollback';
      let minCost = costRollback;
      let stepDestroys = rawDestroy / rawSuccess;

      if (costSafe <= costRestore && costSafe <= costRollback) {
        chosenStrategy = 'safeguard';
        minCost = costSafe;
        stepDestroys = 0;
        optimalSafeguard.push(s);
      } else if (costRestore <= costRollback) {
        chosenStrategy = 'restore';
        minCost = costRestore;
        optimalRestore.push(s);
      }

      cumulativeCost12ToCurrent += minCost;
      cumulativeDestroys += stepDestroys;
      cumulativeTrials += (1 + (chosenStrategy === 'safeguard' ? 0 : rawDestroy * (chosenStrategy === 'restore' ? 0 : cumulativeTrials))) / rawSuccess;

      stepDetails.push({
        star: s,
        strategy: chosenStrategy,
        minCost,
        cumulativeCost: cumulativeCost12ToCurrent,
        cumulativeDestroys,
        costSafe,
        costRestore,
        costRollback,
        restoreValue: restoreLoss,
        rollbackValue: rollbackLoss
      });
    }

    // 18 ~ 22성 구간 (확정복구 vs 12성 롤백 2자 비교)
    for (let s = 18; s <= 22; s++) {
      const baseProb = STARFORCE_CONFIG.probTable[s];
      const rawSuccess = baseProb[0];
      const rawDestroy = (isDestroyReduction && s <= 21) ? baseProb[2] * 0.7 : baseProb[2];
      const normalCost = discountedCosts[s];

      const restoreInfo = getRestoreTotalCost({ level, star: s, spareCost: basePrice, event });
      const restoreLoss = restoreInfo ? restoreInfo.totalCost : Infinity;
      const rollbackLoss = basePrice + cumulativeCost12ToCurrent;

      const costRestore = (normalCost + rawDestroy * restoreLoss) / rawSuccess;
      const costRollback = (normalCost + rawDestroy * rollbackLoss) / rawSuccess;

      // 18성 이상에서는 복구 손실이 롤백 손실보다 확실히 저렴할 때만 채택 (동일 수준 시 롤백 권장)
      const isRestoreBetter = (restoreLoss < rollbackLoss);
      const minCost = isRestoreBetter ? costRestore : costRollback;

      if (isRestoreBetter) {
        optimalRestore.push(s);
      }

      cumulativeCost12ToCurrent += minCost;
      cumulativeDestroys += rawDestroy / rawSuccess;
      cumulativeTrials += (1 + (isRestoreBetter ? 0 : rawDestroy * cumulativeTrials)) / rawSuccess;

      stepDetails.push({
        star: s,
        strategy: isRestoreBetter ? 'restore' : 'rollback',
        minCost,
        cumulativeCost: cumulativeCost12ToCurrent,
        cumulativeDestroys,
        costSafe: null,
        costRestore,
        costRollback,
        restoreValue: restoreLoss,
        rollbackValue: rollbackLoss
      });
    }

    return {
      destroyPrevention: optimalSafeguard,
      restore: optimalRestore,
      stepDetails,
      cumulativeCost12ToCurrent
    };
  }

  /**
   * 시작 성수부터 목표 성수까지의 수학적 마르코프 정확 기댓값 계산
   */
  static getExactMarkovExpectation(item, event = null, mvpDiscount = 0, pcRoom = false) {
    const opt = this.getOptimalReinforcement(item, event, mvpDiscount, pcRoom);
    const { startStar = 0, targetStar = 22, level, baseCost } = item;
    const defaultCosts = getCosts(level);

    let discountRatio = mvpDiscount;
    if (pcRoom) discountRatio += 0.05;
    const isGlobalDiscount = event !== null && (event.includes('30%') || event.includes('샤이닝') || event.includes('샤타'));
    const discountedCosts = defaultCosts.map((cost, index) => {
      let c = index < 17 ? cost * (1 - discountRatio) : cost;
      if (isGlobalDiscount) c *= 0.7;
      return Math.round(c);
    });

    const isDestroyReduction = event !== null && (event.includes('파괴') || event.includes('샤이닝') || event.includes('샤타'));

    let totalCost = 0;
    let totalDestroys = 0;
    let totalTrials = 0;

    // 0~11성에서 목표성수로 갈 때
    for (let s = startStar; s < Math.min(targetStar, 12); s++) {
      const pSuccess = STARFORCE_CONFIG.probTable[s][0];
      totalCost += discountedCosts[s] / pSuccess;
      totalTrials += 1 / pSuccess;
    }

    // 12성부터 22성까지의 단계별 비용 합산
    let cum12 = 0;
    for (let s = 12; s < 15; s++) {
      const pSuccess = STARFORCE_CONFIG.probTable[s][0];
      const stepCost = discountedCosts[s] / pSuccess;
      cum12 += stepCost;
      if (s >= startStar && s < targetStar) {
        totalCost += stepCost;
        totalTrials += 1 / pSuccess;
      }
    }

    for (let s = 15; s < targetStar; s++) {
      const baseProb = STARFORCE_CONFIG.probTable[s];
      const rawSuccess = baseProb[0];
      const rawDestroy = (isDestroyReduction && s <= 21) ? baseProb[2] * 0.7 : baseProb[2];
      const normalCost = discountedCosts[s];

      const isSafe = opt.destroyPrevention.includes(s);
      const isRest = opt.restore.includes(s);

      let stepCost = 0;
      let stepDest = 0;

      if (isSafe) {
        stepCost = (normalCost + defaultCosts[s] * 2) / rawSuccess;
        stepDest = 0;
      } else if (isRest) {
        const restoreInfo = getRestoreTotalCost({ level, star: s, spareCost: baseCost, event });
        const restoreLoss = restoreInfo ? restoreInfo.totalCost : Infinity;
        stepCost = (normalCost + rawDestroy * restoreLoss) / rawSuccess;
        stepDest = rawDestroy / rawSuccess;
      } else {
        const rollbackLoss = baseCost + cum12;
        stepCost = (normalCost + rawDestroy * rollbackLoss) / rawSuccess;
        stepDest = rawDestroy / rawSuccess;
      }

      cum12 += stepCost;

      if (s >= startStar) {
        totalCost += stepCost;
        totalDestroys += stepDest;
        totalTrials += 1 / rawSuccess;
      }
    }

    return {
      expCost: totalCost,
      expDestroys: totalDestroys,
      expTrials: totalTrials,
      optimal: opt
    };
  }
}
