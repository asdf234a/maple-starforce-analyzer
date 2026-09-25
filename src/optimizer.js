/**
 * maple-starforce-analyzer - optimizer.js
 * 동적계획법(Bellman) 기반 스타포스 기댓값 & 최적 전략 엔진
 * 참고: https://starforce.gg/blog/ev-calculation-logic
 *
 * 12성 이상 각 단계 s → s+1 의 기대값 (p: 성공, d: 파괴 확률, c: 1회 비용)
 *   일반(12성 롤백) : (c + d · (노작값 + E[12 → s])) / p
 *   파괴방지(15~17) : c_파방 / p
 *   확정복구(15~22) : (c + d · Restore(s)) / p
 *   확정복구(23~)   : (c + d · (Restore(22) + E[22 → s])) / p
 * 단계마다 기대값이 가장 낮은 전략을 채택합니다.
 * (각 단계의 선택은 이후 단계의 롤백 손실 E[12 → s]를 최소화하므로 단계별 최솟값이 곧 전역 최적입니다.)
 *
 * 파괴 횟수·소모 장비·시도 횟수·순수 강화비·복구비도 같은 재귀 구조로 계산합니다.
 */

import { getAttemptCosts, getProbTable, getRestoreTotalCost, parseEvent } from './starforceData.js';

const ROLLBACK_STAR = 12;
const RESTORE_CAP_STAR = 22;
const MAX_STAR = 30;

/**
 * 지표별 (1회 시도 시 값, 파괴 시 손실 값)
 * - cost: 총 기대 비용 / pure: 강화 메소 / recover: 노작·복구 비용
 * - destroys: 파괴 횟수 / spares: 소모 장비 개수 / trials: 시도 횟수
 */
const METRICS = ['cost', 'pure', 'recover', 'destroys', 'spares', 'trials'];

function attemptValues(attemptCost) {
  return { cost: attemptCost, pure: attemptCost, recover: 0, destroys: 0, spares: 0, trials: 1 };
}

function rollbackLossValues(basePrice) {
  return { cost: basePrice, pure: 0, recover: basePrice, destroys: 1, spares: 1, trials: 0 };
}

function restoreLossValues(restoreInfo) {
  return {
    cost: restoreInfo.totalCost,
    pure: 0,
    recover: restoreInfo.totalCost,
    destroys: 1,
    spares: restoreInfo.spareCount,
    trials: 0
  };
}

export class StarforceOptimizer {
  /**
   * 12성 → 30성 전 구간 최적 전략 및 12성 기준 누적 기댓값
   * @param {Object} item - { level, baseCost }
   * @param {string|null} event - 이벤트
   * @param {number} mvpDiscount - MVP 할인율 (0.03 / 0.05 / 0.1)
   * @param {boolean} pcRoom - PC방 할인 여부
   */
  static getOptimalReinforcement(item, event = null, mvpDiscount = 0, pcRoom = false) {
    const level = item.level;
    const basePrice = item.baseCost || 0;
    const costs = getAttemptCosts(level, event, mvpDiscount, pcRoom);
    const probTable = getProbTable({}, event);
    const safeTable = getProbTable({ 15: true, 16: true, 17: true }, event);

    // cum[m][s] = 12성 → s성 누적 기댓값 (지표 m)
    const cum = {};
    METRICS.forEach(m => {
      cum[m] = new Array(MAX_STAR + 1).fill(0);
    });

    const strategies = new Array(MAX_STAR).fill(null);
    const optimalSafeguard = [];
    const optimalRestore = [];
    const stepDetails = [];

    for (let s = ROLLBACK_STAR; s < MAX_STAR; s++) {
      const [pSuccess, , pDestroy] = probTable[s];
      const attempt = attemptValues(costs.discounted[s]);

      const step = (att, p, d, lossOf) => {
        const values = {};
        METRICS.forEach(m => {
          values[m] = (att[m] + d * lossOf(m)) / p;
        });
        return values;
      };

      // 1) 일반 진행 (파괴 시 12성 롤백)
      const rollbackLoss = rollbackLossValues(basePrice);
      const candidates = [{
        strategy: 'rollback',
        values: step(attempt, pSuccess, pDestroy, m => rollbackLoss[m] + cum[m][s])
      }];

      // 2) 파괴방지 (15~17성)
      if (s >= 15 && s <= 17 && pDestroy > 0) {
        const [pSafeSuccess, , pSafeDestroy] = safeTable[s];
        candidates.push({
          strategy: 'safeguard',
          values: step(attemptValues(costs.protected[s]), pSafeSuccess, pSafeDestroy, () => 0)
        });
      }

      // 3) 확정복구 (15~22성: 해당 성수, 23성~: 22성으로 복구)
      const restoreInfo = s >= 15
        ? getRestoreTotalCost({ level, star: s, spareCost: basePrice, event })
        : null;
      if (restoreInfo && pDestroy > 0) {
        const restoreLoss = restoreLossValues(restoreInfo);
        const lossOf = s <= RESTORE_CAP_STAR
          ? m => restoreLoss[m]
          : m => restoreLoss[m] + cum[m][s] - cum[m][RESTORE_CAP_STAR];
        candidates.push({ strategy: 'restore', values: step(attempt, pSuccess, pDestroy, lossOf) });
      }

      const chosen = candidates.reduce((best, c) => (c.values.cost < best.values.cost ? c : best));
      strategies[s] = chosen.strategy;
      if (chosen.strategy === 'safeguard') optimalSafeguard.push(s);
      if (chosen.strategy === 'restore') optimalRestore.push(s);

      METRICS.forEach(m => {
        cum[m][s + 1] = cum[m][s] + chosen.values[m];
      });

      const costOf = name => {
        const c = candidates.find(x => x.strategy === name);
        return c ? c.values.cost : null;
      };
      stepDetails.push({
        star: s,
        strategy: chosen.strategy,
        minCost: chosen.values.cost,
        cumulativeCost: cum.cost[s + 1],
        cumulativeDestroys: cum.destroys[s + 1],
        costSafe: costOf('safeguard'),
        costRestore: costOf('restore'),
        costRollback: costOf('rollback'),
        restoreValue: restoreInfo ? restoreInfo.totalCost : null,
        rollbackValue: basePrice + cum.cost[s]
      });
    }

    return {
      destroyPrevention: optimalSafeguard,
      restore: optimalRestore,
      strategies,
      stepDetails,
      cumulative: cum,
      cumulativeCost12ToCurrent: cum.cost
    };
  }

  /**
   * 시작 성수 → 목표 성수 정확 기댓값
   * - 12성 이상: E[N → M] = E[12 → M] − E[12 → N]
   * - 12성 미만: 파괴가 없으므로 단계별 c/p 합 (10성 이하 1+1 이벤트는 2단계 점프 반영)
   */
  static getExactMarkovExpectation(item, event = null, mvpDiscount = 0, pcRoom = false) {
    const opt = this.getOptimalReinforcement(item, event, mvpDiscount, pcRoom);
    const { level } = item;
    const startStar = Math.max(0, item.startStar ?? 0);
    const targetStar = Math.min(MAX_STAR, item.targetStar ?? 22);
    const costs = getAttemptCosts(level, event, mvpDiscount, pcRoom);
    const probTable = getProbTable({}, event);
    const { onePlusOneUnder10 } = parseEvent(event);

    const cum = opt.cumulative;
    const memo = new Map();

    // valueFrom(s)[m] = s성 → 목표 성수 기댓값
    const valueFrom = s => {
      const result = {};
      if (s >= targetStar) {
        METRICS.forEach(m => { result[m] = 0; });
        return result;
      }
      if (s >= ROLLBACK_STAR) {
        METRICS.forEach(m => { result[m] = cum[m][targetStar] - cum[m][s]; });
        return result;
      }
      if (memo.has(s)) return memo.get(s);

      const pSuccess = probTable[s][0];
      const next = valueFrom(s + 1 + (onePlusOneUnder10 && s <= 10 ? 1 : 0));
      const att = attemptValues(costs.discounted[s]);
      METRICS.forEach(m => { result[m] = att[m] / pSuccess + next[m]; });
      memo.set(s, result);
      return result;
    };

    const v = valueFrom(startStar);

    return {
      expCost: v.cost,
      expPureCost: v.pure,
      expRecoverCost: v.recover,
      expDestroyCount: v.destroys,
      expDestroys: v.spares,
      expTrials: v.trials,
      optimal: opt
    };
  }
}
