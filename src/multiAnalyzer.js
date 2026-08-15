/**
 * maple-starforce-analyzer - multiAnalyzer.js
 * 여러 개 아이템의 강화 비용 & 파괴 횟수 결합 분포 분석기
 */

import { MarkovEngine } from './markovEngine.js';
import { FFTEngine } from './fftEngine.js';

export class MultiAnalyzer {
  /**
   * 백분위수(Percentile) 산출 (0.0 ~ 1.0)
   */
  static getPercentile(pmf, binMultiplier = 1, pTarget = 0.5) {
    let cum = 0;
    for (let i = 0; i < pmf.length; i++) {
      cum += pmf[i];
      if (cum >= pTarget) {
        return i * binMultiplier;
      }
    }
    return (pmf.length - 1) * binMultiplier;
  }

  /**
   * 다중 아이템 종합 분석 수행
   * @param {Array} items - 아이템 목록 [{ id, name, level, startStar, targetStar, baseCost, count }]
   * @param {Object} options - 전역 옵션 (event30, event1516, mvpDiscount, pcRoom, preventDestruction)
   */
  static analyze(items, options = {}) {
    const startTime = performance.now();

    if (!items || items.length === 0) {
      return null;
    }

    // 아이템들의 총 비용 규모에 따라 적절한 binSize 자동 산정 (기본 1천만 메소, 대규모는 5천만~1억 메소)
    let totalRoughCost = 0;
    items.forEach(it => {
      const diff = Math.max(0, it.targetStar - it.startStar);
      totalRoughCost += diff * 1500000000 * (it.count || 1);
    });

    let binSize = 10000000; // 1,000만 메소
    if (totalRoughCost > 500000000000) { // 5,000억 초과 시
      binSize = 50000000; // 5,000만 메소
    } else if (totalRoughCost > 200000000000) { // 2,000억 초과 시
      binSize = 25000000; // 2,500만 메소
    }

    // 개별 아이템 분석
    const itemResults = items.map(item => MarkovEngine.analyzeItem(item, options, binSize));

    // 전체 아이템 FFT 합성곱
    const allCostPMFs = itemResults.map(r => r.costPMF);
    const allDestroyPMFs = itemResults.map(r => r.destroyPMF);

    const totalCostPMF = FFTEngine.convolveMultiple(allCostPMFs);
    const totalDestroyPMF = FFTEngine.convolveMultiple(allDestroyPMFs);

    // 총 기댓값
    const totalExpCost = itemResults.reduce((acc, r) => acc + r.expCost, 0);
    const totalExpDestroys = itemResults.reduce((acc, r) => acc + r.expDestroys, 0);
    const totalExpTrials = itemResults.reduce((acc, r) => acc + r.expTrials, 0);

    // 주요 백분위수 산출 (상위 X% = 누적 하위 100-X%)
    // 예: 상위 10% 컷 = 10th percentile (운이 좋은 상위 10%의 비용)
    // 예: 하위 10% 컷 = 90th percentile (비용이 많이 든 상위 90% 누적 비용)
    const percentiles = {
      p1: this.getPercentile(totalCostPMF, binSize, 0.01),
      p5: this.getPercentile(totalCostPMF, binSize, 0.05),
      p10: this.getPercentile(totalCostPMF, binSize, 0.10),
      p25: this.getPercentile(totalCostPMF, binSize, 0.25),
      p50: this.getPercentile(totalCostPMF, binSize, 0.50), // 중앙값 (Median)
      p75: this.getPercentile(totalCostPMF, binSize, 0.75),
      p90: this.getPercentile(totalCostPMF, binSize, 0.90),
      p95: this.getPercentile(totalCostPMF, binSize, 0.95),
      p99: this.getPercentile(totalCostPMF, binSize, 0.99)
    };

    // 누적 분포(CDF) 생성
    const totalCostCDF = new Float64Array(totalCostPMF.length);
    let cdfAcc = 0;
    for (let i = 0; i < totalCostPMF.length; i++) {
      cdfAcc += totalCostPMF[i];
      totalCostCDF[i] = Math.min(1.0, cdfAcc);
    }

    // 대장장이 가격(기댓값의 1.08배) 구간 및 승률 분석
    const smithCost = totalExpCost * 1.08;
    const smithBinIdx = Math.min(totalCostCDF.length - 1, Math.max(0, Math.floor(smithCost / binSize)));
    const smithWinProb = (totalCostCDF[smithBinIdx] || 0) * 100; // 직작이 대장장이보다 저렴할 확률
    const smithLoseProb = Math.max(0, 100 - smithWinProb);       // 직작이 대장장이보다 비쌀 확률

    const smithAnalysis = {
      multiplier: 1.08,
      smithCost,
      winProb: smithWinProb,       // 이득 확률 (%)
      loseProb: smithLoseProb,     // 손해 확률 (%)
      percentileRank: (100 - smithWinProb).toFixed(2) // 상위 몇 % 선인지
    };

    // 파괴 횟수 상세 통계 (0회 ~ 10회 이상)
    const destroyStats = [];
    let dCum = 0;
    for (let d = 0; d < Math.min(totalDestroyPMF.length, 25); d++) {
      const prob = totalDestroyPMF[d];
      dCum += prob;
      destroyStats.push({
        destroys: d,
        probability: prob,
        cumulative: Math.min(1.0, dCum)
      });
    }

    const calcTimeMs = performance.now() - startTime;

    return {
      items: itemResults,
      binSize,
      totalExpCost,
      totalExpDestroys,
      totalExpTrials,
      percentiles,
      smithAnalysis,
      totalCostPMF,
      totalCostCDF,
      totalDestroyPMF,
      destroyStats,
      calcTimeMs
    };
  }
}
