/**
 * maple-starforce-analyzer - markovEngine.js
 * 마르코프 해석적 기댓값 및 고정밀 몬테카를로 PMF 생성 엔진
 */

import { DEFAULT_EVENT, getAttemptCosts, getProbTable, getRestoreTotalCost, parseEvent } from './starforceData.js';
import { StarforceOptimizer } from './optimizer.js';

export class MarkovEngine {
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

    // 계층적 샘플링
    // 파괴 후 12성(또는 23성 이상 확정복구 시 22성)부터 다시 올라오는 비용을 매번 새로 시뮬레이션하면
    // 연산량이 기대 시도 횟수에 비례해 30성 목표에서는 수천만 번이 됩니다.
    // 대신 "12성 → s성" / "22성 → s성" 비용 표본 풀을 아래 단계부터 쌓아 두고, 파괴 시 풀에서 무작위로 뽑아 더합니다.
    // (X_{12→s+1} = X_{12→s} + 체류 비용(s), 체류 중 파괴 시 노작값 + 독립 표본 X_{12→s})
    // 연산량은 표본 수 × Σ(1/성공확률) 수준으로 목표 성수와 무관하게 일정합니다.
    const simCount = Math.max(1, simulationCount);
    const randomIndex = () => Math.floor(Math.random() * simCount);

    const pool12Cost = [];
    const pool12Spare = [];
    const pool22Cost = [];
    const pool22Spare = [];

    let spareAcc = 0;

    // s성 → s+1성 성공까지의 비용 표본 (소모 장비는 spareAcc에 누적)
    const sojourn = (s) => {
      const [pSuccess, pMaintain] = probTable[s];
      const attemptCost = safeguardRecord[s] ? costs.protected[s] : costs.discounted[s];
      const restoreInfo = strategies[s] === 'restore' ? restoreInfos[s] : null;
      let cost = 0;

      for (;;) {
        cost += attemptCost;
        const r = Math.random();
        if (r < pSuccess) return cost;
        if (r < pSuccess + pMaintain) continue; // 유지

        if (restoreInfo) {
          // 확정복구: 15~22성은 해당 성수, 23성 이상은 22성으로 복구 후 재상승
          cost += restoreInfo.totalCost;
          spareAcc += restoreInfo.spareCount;
          if (s > 22) {
            const j = randomIndex();
            cost += pool22Cost[s][j];
            spareAcc += pool22Spare[s][j];
          }
        } else {
          // 12성 롤백: 노작값 + 12성 → s성 재상승
          const j = randomIndex();
          cost += baseCost + pool12Cost[s][j];
          spareAcc += 1 + pool12Spare[s][j];
        }
      }
    };

    // 표본 풀 구축 (12성 → s성, 22성 → s성)
    if (targetStar > 12) {
      pool12Cost[12] = new Float64Array(simCount);
      pool12Spare[12] = new Float64Array(simCount);

      for (let s = 12; s < targetStar - 1; s++) {
        if (s === 22) {
          pool22Cost[22] = new Float64Array(simCount);
          pool22Spare[22] = new Float64Array(simCount);
        }

        const nextCost = new Float64Array(simCount);
        const nextSpare = new Float64Array(simCount);
        for (let i = 0; i < simCount; i++) {
          spareAcc = 0;
          nextCost[i] = pool12Cost[s][i] + sojourn(s);
          nextSpare[i] = pool12Spare[s][i] + spareAcc;
        }
        pool12Cost[s + 1] = nextCost;
        pool12Spare[s + 1] = nextSpare;

        if (s >= 22) {
          const next22Cost = new Float64Array(simCount);
          const next22Spare = new Float64Array(simCount);
          for (let i = 0; i < simCount; i++) {
            spareAcc = 0;
            next22Cost[i] = pool22Cost[s][i] + sojourn(s);
            next22Spare[i] = pool22Spare[s][i] + spareAcc;
          }
          pool22Cost[s + 1] = next22Cost;
          pool22Spare[s + 1] = next22Spare;
        }
      }
    }

    const costMap = new Map();
    const destroyMap = new Map();

    for (let sim = 0; sim < simCount; sim++) {
      let star = startStar;
      let spentCost = 0;
      spareAcc = 0;

      // 12성 미만: 파괴 없음 (10성 이하 1+1 이벤트 반영)
      while (star < Math.min(targetStar, 12)) {
        spentCost += costs.discounted[star];
        if (Math.random() < probTable[star][0]) {
          star += 1 + (onePlusOneUnder10 && star <= 10 ? 1 : 0);
        }
      }

      // 12성 이상: 단계별 체류 비용 합
      for (let s = Math.max(star, 12); s < targetStar; s++) {
        spentCost += sojourn(s);
      }

      const consumedEquipCount = spareAcc;

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
      costPMF,
      destroyPMF,
      binSize
    };
  }
}
