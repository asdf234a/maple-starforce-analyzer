/**
 * maple-starforce-analyzer - optimizer.js
 * 동적계획법(DP / Bellman Equation) 기반 강화 최적화 엔진
 * 
 * 각 성수별 [파괴방지 사용 / 확정복구 사용 / 12성 롤백] 중
 * 기댓값 비용이 최소가 되는 최적의 전략을 도출합니다.
 */

import { STARFORCE_CONFIG, getCosts, getProbTable, getRestoreTotalCost } from './starforceData.js';

export class StarforceOptimizer {
  /**
   * getOptimalReinforcement 구현
   * @param {Object} item - { level, baseCost }
   * @param {string|null} event - 이벤트
   * @param {number} mvpDiscount - MVP 할인율
   * @param {boolean} pcRoom - PC방 할인 여부
   * @returns {Object} { destroyPrevention: number[], restore: number[], stepDetails: Array }
   */
  static getOptimalReinforcement(item, event = null, mvpDiscount = 0, pcRoom = false) {
    const level = item.level;
    const basePrice = item.baseCost; // 노작 장비 가격 (메소)
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

    const isDestroyReduction = event !== null && (event.includes('파괴') || event.includes('샤이닝'));

    // 12성까지의 누적 비용 L (12성 이전은 파괴가 없으므로 단순 합산)
    let cumulativeCost12ToCurrent = 0;

    // 12 ~ 14성 구간
    for (let s = 12; s < 15; s++) {
      const pSuccess = STARFORCE_CONFIG.probTable[s][0];
      const stepCost = discountedCosts[s];
      // 12~14성은 파괴 0%
      const expStepCost = stepCost / pSuccess;
      cumulativeCost12ToCurrent += expStepCost;
    }

    const optimalSafeguard = []; // 파괴방지 권장 성수 목록 [15, 16, 17]
    const optimalRestore = [];   // 확정복구 권장 성수 목록 [15..22]
    const stepDetails = [];      // 각 성수별 세부 비교 데이터

    // 15 ~ 17성 구간 (파괴방지 vs 확정복구 vs 12성 롤백 3자 비교)
    for (let s = 15; s <= 17; s++) {
      const baseProb = STARFORCE_CONFIG.probTable[s];
      let rawSuccess = baseProb[0];
      let rawDestroy = isDestroyReduction ? baseProb[2] * 0.7 : baseProb[2];

      const normalCost = discountedCosts[s];
      const safeguardCost = normalCost + defaultCosts[s] * 2;

      // 1) 파괴방지 사용 시 1단계 도달 기댓값
      // 파괴율 = 0, 성공률 = rawSuccess
      const costSafe = safeguardCost / rawSuccess;

      // 2) 파괴방지 미사용 + 확정 복구 시 1단계 도달 기댓값
      const restoreInfo = getRestoreTotalCost({ level, star: s, spareCost: basePrice, event });
      const restoreValue = restoreInfo ? restoreInfo.totalCost : Infinity;
      const costRestore = (rawDestroy * restoreValue + normalCost) / rawSuccess;

      // 3) 파괴방지 미사용 + 12성 롤백 복구 시 1단계 도달 기댓값
      const rollbackValue = basePrice + cumulativeCost12ToCurrent;
      const costRollback = (rawDestroy * rollbackValue + normalCost) / rawSuccess;

      let chosenStrategy = 'restore';
      let minCost = costRestore;

      if (rawSuccess < 1.0) {
        if (costSafe <= costRestore && costSafe <= costRollback) {
          chosenStrategy = 'safeguard';
          minCost = costSafe;
          optimalSafeguard.push(s);
        } else if (costRestore <= costSafe && costRestore <= costRollback) {
          chosenStrategy = 'restore';
          minCost = costRestore;
          optimalRestore.push(s);
        } else {
          chosenStrategy = 'rollback';
          minCost = costRollback;
        }
      } else {
        minCost = normalCost;
      }

      cumulativeCost12ToCurrent += minCost;

      stepDetails.push({
        star: s,
        strategy: chosenStrategy,
        minCost,
        costSafe,
        costRestore,
        costRollback,
        restoreValue,
        rollbackValue
      });
    }

    // 18 ~ 22성 구간 (확정복구 vs 12성 롤백 2자 비교)
    for (let s = 18; s <= 22; s++) {
      const baseProb = STARFORCE_CONFIG.probTable[s];
      const rawSuccess = baseProb[0];
      const rawDestroy = (isDestroyReduction && s <= 21) ? baseProb[2] * 0.7 : baseProb[2];
      const normalCost = discountedCosts[s];

      const restoreInfo = getRestoreTotalCost({ level, star: s, spareCost: basePrice, event });
      const restoreValue = restoreInfo ? restoreInfo.totalCost : Infinity;
      const rollbackValue = basePrice + cumulativeCost12ToCurrent;

      const isRestoreBetter = restoreValue < rollbackValue;
      const chosenLoss = isRestoreBetter ? restoreValue : rollbackValue;
      const expStepCost = (normalCost + rawDestroy * chosenLoss) / rawSuccess;

      if (isRestoreBetter) {
        optimalRestore.push(s);
      }

      cumulativeCost12ToCurrent += expStepCost;

      stepDetails.push({
        star: s,
        strategy: isRestoreBetter ? 'restore' : 'rollback',
        minCost: expStepCost,
        costSafe: null,
        costRestore: (normalCost + rawDestroy * restoreValue) / rawSuccess,
        costRollback: (normalCost + rawDestroy * rollbackValue) / rawSuccess,
        restoreValue,
        rollbackValue
      });
    }

    return {
      destroyPrevention: optimalSafeguard,
      restore: optimalRestore,
      stepDetails
    };
  }
}
