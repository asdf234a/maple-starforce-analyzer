/**
 * maple-starforce-analyzer - starforceData.js
 * https://github.com/kurateh/mesulive (mesu.live) 100% 동일 구현 데이터 & 공식
 */

export const STARFORCE_CONFIG = {
  maxStar: 30,

  itemPresets: [
    { id: 'eternal', name: '에테르넬 (250제)', level: 250, defaultBaseCost: 1500000000 },
    { id: 'whisper_250', name: '근원의 속삭임 (250제)', level: 250, defaultBaseCost: 600000000 },
    { id: 'dark_boss_200', name: '칠흑 200제 (몽벨/거공/마안/커포 등)', level: 200, defaultBaseCost: 1000000000 },
    { id: 'dark_boss_160', name: '칠흑 160제 (루컨마/마깃안 등)', level: 160, defaultBaseCost: 1500000000 },
    { id: 'arcane', name: '아케인셰이드 (200제)', level: 200, defaultBaseCost: 150000000 },
    { id: 'dawn_160', name: '여명의 보스 (160제 - 트왈마/에스텔라/데브 등)', level: 160, defaultBaseCost: 80000000 },
    { id: 'cra_150', name: '루타비스/카루타 (150제)', level: 150, defaultBaseCost: 5000000 }
  ],

  // mesulive: probTable (0~29성) [success, maintain, destroy]
  probTable: [
    [0.9975, 0.0025, 0], // 0
    [0.945, 0.055, 0], // 1
    [0.8925, 0.1075, 0], // 2
    [0.8925, 0.1075, 0], // 3
    [0.84, 0.16, 0], // 4
    [0.7875, 0.2125, 0], // 5
    [0.735, 0.265, 0], // 6
    [0.6825, 0.3175, 0], // 7
    [0.63, 0.37, 0], // 8
    [0.5775, 0.4225, 0], // 9
    [0.525, 0.475, 0], // 10
    [0.4725, 0.5275, 0], // 11
    [0.42, 0.58, 0], // 12
    [0.3675, 0.6325, 0], // 13
    [0.315, 0.685, 0], // 14
    [0.315, 0.66445, 0.02055], // 15
    [0.315, 0.66445, 0.02055], // 16
    [0.1575, 0.7751, 0.0674], // 17
    [0.1575, 0.7751, 0.0674], // 18
    [0.1575, 0.75825, 0.08425], // 19
    [0.315, 0.58225, 0.10275], // 20
    [0.1575, 0.716125, 0.126375], // 21
    [0.1575, 0.674, 0.1685], // 22
    [0.105, 0.716, 0.179], // 23
    [0.105, 0.716, 0.179], // 24
    [0.105, 0.716, 0.179], // 25
    [0.0735, 0.7412, 0.1853], // 26
    [0.0525, 0.758, 0.1895], // 27
    [0.0315, 0.7748, 0.1937], // 28
    [0.0105, 0.7916, 0.1979], // 29
  ],

  // restoreResourceTable [스페어 개수, 메소(억 단위)]
  // 140/160/200/250제: 인게임 확인값 (starforce.gg/blog/ev-calculation-logic)
  restoreResourceTable: {
    130: {
      15: [1, 1.19], 16: [1, 2.87], 17: [1, 4.85], 18: [1, 11.03], 19: [2, 18.27], 20: [0, 0], 21: [0, 0], 22: [0, 0]
    },
    135: {
      15: [1, 1.33], 16: [1, 3.21], 17: [1, 5.42], 18: [1, 12.31], 19: [2, 20.43], 20: [0, 0], 21: [0, 0], 22: [0, 0]
    },
    140: {
      15: [1, 1.49], 16: [1, 3.59], 17: [1, 6.06], 18: [1, 13.8], 19: [2, 22.8], 20: [2, 40.2], 21: [3, 50.5], 22: [4, 82.9]
    },
    145: {
      15: [1, 1.65], 16: [1, 3.98], 17: [1, 6.71], 18: [1, 15.28], 19: [2, 25.4], 20: [2, 44.5], 21: [3, 56.05], 22: [4, 92.25]
    },
    150: {
      15: [1, 1.83], 16: [1, 4.41], 17: [1, 7.45], 18: [1, 16.89], 19: [2, 28.03], 20: [2, 49.44], 21: [3, 62.24], 22: [4, 101.79]
    },
    160: {
      15: [1, 2.22], 16: [1, 5.35], 17: [1, 9.04], 18: [1, 20.6], 19: [2, 34.1], 20: [2, 60], 21: [3, 75.4], 22: [4, 124]
    },
    200: {
      15: [1, 4.33], 16: [1, 10.5], 17: [1, 17.7], 18: [1, 40.1], 19: [2, 66.5], 20: [2, 118], 21: [3, 148], 22: [4, 242]
    },
    250: {
      15: [1, 8.46], 16: [1, 20.4], 17: [1, 34.5], 18: [1, 78.3], 19: [2, 130], 20: [2, 229], 21: [3, 288], 22: [4, 473]
    }
  }
};

/**
 * mesulive: getCosts(equipLevel)
 */
export function getCosts(equipLevel) {
  return Array.from({ length: 30 }).map((_, star) => {
    if (star <= 9) {
      return Math.round((1000 + (Math.pow(equipLevel, 3) * (star + 1)) / 36) / 100) * 100;
    }

    const base = Math.pow(equipLevel, 3) * Math.pow(star + 1, 2.7);

    let divisor = 200;
    if (star === 10) divisor = 571;
    else if (star === 11) divisor = 314;
    else if (star === 12) divisor = 214;
    else if (star === 13) divisor = 157;
    else if (star === 14) divisor = 107;
    else if (star === 17) divisor = 150;
    else if (star === 18) divisor = 70;
    else if (star === 19) divisor = 45;
    else if (star === 21) divisor = 125;

    return 1000 + Math.round(base / divisor / 100) * 100;
  });
}

export const DEFAULT_EVENT = '샤이닝 스타포스 (비용 30% 할인 + 21성 이하 파괴 확률 30% 감소 + 흔적 복구 메소 20% 할인)';

/**
 * 이벤트 문자열 → 이벤트 효과 플래그
 * - 샤이닝 스타포스(샤타) = 비용 30% 할인 + 21성 이하 파괴 30% 감소 + 흔적 복구 메소 20% 할인
 */
export function parseEvent(event = null) {
  const e = event || '';
  const isShining = e.includes('샤이닝') || e.includes('샤타');
  return {
    costDiscount: isShining || e.includes('30% 할인') || e.includes('비용 할인') || e.includes('메소 할인'),
    destroyReduction: isShining || e.includes('파괴'),
    restoreDiscount: isShining || e.includes('흔적 복구'),
    onePlusOneUnder10: e.includes('10성 이하 1+1'),
    onePlusOne15: e.includes('1+1') && e.includes('15')
  };
}

/**
 * 성수별 1회 시도 비용
 * - discounted: MVP·PC방(17성 미만) 및 30% 할인 이벤트가 곱셈으로 적용된 비용
 * - protected: 파괴방지 ON 비용 (할인 비용 + 할인 전 비용 × 2)
 */
export function getAttemptCosts(level, event = null, mvpDiscount = 0, pcRoom = false) {
  const raw = getCosts(level);
  const { costDiscount } = parseEvent(event);

  const discounted = raw.map((cost, star) => {
    let m = star < 17 ? 1 - mvpDiscount - (pcRoom ? 0.05 : 0) : 1;
    if (costDiscount) m *= 0.7;
    return Math.round(cost * m);
  });

  return {
    raw,
    discounted,
    protected: discounted.map((cost, star) => cost + raw[star] * 2)
  };
}

/**
 * 성수별 [success, fail(유지), destroy] 확률표
 * @param {Object} safeguardRecord - { [star]: true } 파괴방지 적용 성수 (15~17성만 유효)
 */
export function getProbTable(safeguardRecord = {}, event = null) {
  const { destroyReduction, onePlusOne15 } = parseEvent(event);

  return STARFORCE_CONFIG.probTable.map((row, star) => {
    let [success, fail, destroy] = row;

    // 파괴확률 30% 감소 이벤트 (21성 이하)
    if (destroyReduction && star <= 21) {
      fail += destroy * 0.3;
      destroy *= 0.7;
    }

    // 15·16성 1+1 이벤트: 15 → 16 성공 보장
    if (onePlusOne15 && star === 15) return [1, 0, 0];

    // 파괴 방지 (15~17성)
    if (safeguardRecord[star] && star >= 15 && star <= 17) {
      fail += destroy;
      destroy = 0;
    }

    return [success, fail, destroy];
  });
}

const HUNDRED_MILLION = 100000000;

/**
 * 확정복구 1회 총비용 (스페어 장비 + 흔적 복구 메소)
 * - 15~22성: 해당 성수로 복구, 23성 이상: 22성으로 복구
 */
export function getRestoreTotalCost({ level, star, spareCost, event = null }) {
  const resByLevel = STARFORCE_CONFIG.restoreResourceTable[level];
  const restoreStar = Math.min(star, 22); // 22성 이상 파괴 시 22성으로 복구
  if (!resByLevel || !resByLevel[restoreStar]) return null;

  const [requiredSpareCount, restoreCostInHundredMillions] = resByLevel[restoreStar];
  if (requiredSpareCount <= 0 || restoreCostInHundredMillions <= 0) return null;

  const restoreCostMeso = Math.round(restoreCostInHundredMillions * HUNDRED_MILLION);
  const discountRatio = parseEvent(event).restoreDiscount ? 0.2 : 0;
  const discountedRestoreCostMeso = Math.round(restoreCostMeso * (1 - discountRatio));

  return {
    totalCost: spareCost * requiredSpareCount + discountedRestoreCostMeso,
    spareCount: requiredSpareCount,
    mesoCost: discountedRestoreCostMeso
  };
}
