/**
 * maple-starforce-analyzer - app.js
 * 메이플 스타포스 다중 강화 비용 & 파괴 분포 분석기 메인 컨트롤러
 */

import { STARFORCE_CONFIG } from './starforceData.js';
import { MultiAnalyzer } from './multiAnalyzer.js';
import { StarforceOptimizer } from './optimizer.js';

// 애플리케이션 상태 (기본 목록: 빈 목록으로 시작)
const state = {
  items: [],
  options: {
    event: '샤이닝 스타포스 (비용 30% 할인 + 21성 이하 파괴 확률 30% 감소 + 흔적 복구 메소 20% 할인)',
    autoOptimize: true,
    safeguard: { 15: true, 16: true, 17: true },
    restoreMode: 'optimal', // 'optimal' (성수별 최대 효율 복구)
    mvpDiscount: 0,
    pcRoom: false
  },
  costChart: null,
  destroyChart: null
};

// 로컬 스토리지 키
const STORAGE_KEY_PRESETS = 'maple_sf_custom_presets_v2';

/**
 * 메소 단위를 '~억 ~만 메소'로 포맷팅
 * @param {number} amount - 순수 메소 금액
 */
export function formatMeso(amount) {
  if (!amount || isNaN(amount) || amount === 0) return '0 메소';
  const val = Math.round(Number(amount));
  
  const jo = Math.floor(val / 1000000000000);
  const eok = Math.floor((val % 1000000000000) / 100000000);
  const man = Math.floor((val % 100000000) / 10000);
  const remainder = val % 10000;

  const parts = [];
  if (jo > 0) parts.push(`${jo}조`);
  if (eok > 0) parts.push(`${eok}억`);
  if (man > 0) parts.push(`${man.toLocaleString()}만`);
  if (parts.length === 0 && remainder > 0) parts.push(`${remainder.toLocaleString()}`);

  if (parts.length === 0) return '0 메소';
  return `${parts.join(' ')} 메소`;
}

/**
 * 만 메소 단위 입력값(예: 32 -> 320,000 메소)을 한글로 포맷팅
 * @param {number} manVal - 만 메소 단위의 수치
 */
export function formatManMeso(manVal) {
  if (!manVal || isNaN(manVal) || manVal <= 0) return '0 메소';
  const valInMeso = Number(manVal) * 10000;
  return formatMeso(valInMeso);
}

/**
 * 전역 옵션 객체 가공
 */
function getCalculatedOptions() {
  const ev = state.options.event === 'none' ? null : state.options.event;
  const isAuto = true; // 상시 자동 최적화 (DP)
  const restoreMode = 'optimal';
  const mvp = parseFloat(state.options.mvpDiscount);
  const pc = state.options.pcRoom;

  return {
    event: ev,
    autoOptimize: isAuto,
    restoreMode: restoreMode,
    safeguardRecord: { 15: true, 16: true, 17: true },
    restoreRecord: { 15: true, 16: true, 17: true, 18: true, 19: true, 20: true, 21: true, 22: true },
    mvpDiscount: mvp,
    pcRoom: pc
  };
}

/**
 * 분석 실행 및 전체 UI 렌더링
 */
function runAnalysis() {
  const calculatedOptions = getCalculatedOptions();
  const result = MultiAnalyzer.analyze(state.items, calculatedOptions);

  renderItemsList();
  renderKpis(result);
  renderCostChart(result);
  renderDestroyChart(result);
  renderTables(result);
}

/**
 * KPI 카드 갱신
 */
function renderKpis(result) {
  if (!result || !result.items || result.items.length === 0) {
    document.getElementById('kpiTotalCost').innerText = '-';
    document.getElementById('kpiMedianCost').innerText = '-';
    document.getElementById('kpiTop10Cost').innerText = '-';
    document.getElementById('kpiBottom10Cost').innerText = '-';
    document.getElementById('kpiSmithCost').innerText = '-';
    document.getElementById('kpiSmithDesc').innerText = '직작 승률: -%';
    document.getElementById('kpiTotalDestroys').innerText = '-';
    document.getElementById('kpiZeroDestroyProb').innerText = '노파괴(0개) 확률: -%';
    document.getElementById('kpiCalcTime').innerText = '0.00 ms';
    document.getElementById('kpiPureAndBase').innerText = '순수강화: - | 복구비: -';
    return;
  }

  document.getElementById('kpiTotalCost').innerText = formatMeso(result.totalExpCost);
  document.getElementById('kpiMedianCost').innerText = formatMeso(result.percentiles.p50);
  document.getElementById('kpiTop10Cost').innerText = formatMeso(result.percentiles.p10);
  document.getElementById('kpiBottom10Cost').innerText = formatMeso(result.percentiles.p90);
  document.getElementById('kpiTotalDestroys').innerText = `${result.totalExpDestroys.toFixed(3)} 개`;

  // 대장장이 가격 (기댓값 × 1.08) 및 승률
  if (result.smithAnalysis) {
    const s = result.smithAnalysis;
    document.getElementById('kpiSmithCost').innerText = formatMeso(s.smithCost);
    document.getElementById('kpiSmithDesc').innerText = `직작 승률: ${s.winProb.toFixed(1)}% (상위 ${s.percentileRank}% 선)`;
  }

  const pZero = (result.totalDestroyPMF[0] * 100).toFixed(2);
  document.getElementById('kpiZeroDestroyProb').innerText = `노파괴(0개) 확률: ${pZero}%`;
  document.getElementById('kpiCalcTime').innerText = `${result.calcTimeMs.toFixed(2)} ms`;

  // 순수 강화비와 복구비 분리 표시
  let totalBaseRecover = 0;
  let totalPureEnhance = 0;
  result.items.forEach(r => {
    totalBaseRecover += r.expRecoverCost || (r.expDestroys * (r.item.baseCost || 0));
    totalPureEnhance += r.expPureCost || Math.max(0, r.expCost - (r.expRecoverCost || 0));
  });
  
  document.getElementById('kpiPureAndBase').innerText = 
    `순수강화: ${formatMeso(totalPureEnhance)} | 복구비: ${formatMeso(totalBaseRecover)}`;
}

/**
 * 아이템 목록 UI 렌더링
 */
function renderItemsList() {
  const container = document.getElementById('itemsListContainer');
  const badge = document.getElementById('itemCountBadge');

  let totalCount = 0;
  state.items.forEach(i => totalCount += (parseInt(i.count) || 1));
  badge.innerText = totalCount;

  if (state.items.length === 0) {
    container.innerHTML = `
      <div class="empty-items-state" id="btnEmptyAdd">
        <i class="fa-solid fa-layer-group"></i>
        <p>강화할 장비가 없습니다.<br>클릭하여 첫 강화 대상을 등록해보세요!</p>
        <button type="button" class="btn-primary-sm" style="margin-top:10px;">
          <i class="fa-solid fa-plus"></i> 첫 장비 추가하기
        </button>
      </div>
    `;
    const emptyBtn = document.getElementById('btnEmptyAdd');
    if (emptyBtn) {
      emptyBtn.addEventListener('click', () => openItemModal(-1));
    }
    return;
  }

  container.innerHTML = state.items.map((item, idx) => `
    <div class="item-card" data-idx="${idx}">
      <div class="item-main-info">
        <div class="item-name-row">
          <span class="item-name">${item.name}</span>
          <span class="item-level-tag">${item.level}제</span>
          ${item.count > 1 ? `<span class="item-count-tag">${item.count}개</span>` : ''}
        </div>
        <div class="item-meta-row">
          <span><i class="fa-solid fa-star star-range"></i> ${item.startStar}성 → ${item.targetStar}성</span>
          <span>노작: ${formatMeso(item.baseCost)}</span>
        </div>
      </div>
      <div class="item-card-actions">
        <button type="button" class="btn-icon edit-item-btn" data-idx="${idx}" title="수정">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button type="button" class="btn-icon delete delete-item-btn" data-idx="${idx}" title="삭제">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');

  // 이벤트 바인딩
  container.querySelectorAll('.edit-item-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      openItemModal(idx);
    });
  });

  container.querySelectorAll('.delete-item-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(btn.dataset.idx);
      state.items.splice(idx, 1);
      runAnalysis();
    });
  });
}

/**
 * 비용 분포도 차트 렌더링 (Chart.js)
 */
function renderCostChart(result) {
  const ctx = document.getElementById('costDistChart').getContext('2d');
  if (!result || !result.totalCostPMF || result.totalCostPMF.length === 0) {
    if (state.costChart) state.costChart.destroy();
    return;
  }

  const { totalCostPMF, totalCostCDF, binSize, percentiles, smithAnalysis } = result;

  const maxIdx = totalCostPMF.length;
  const step = Math.max(1, Math.floor(maxIdx / 120));
  
  const labels = [];
  const pmfData = [];
  const cdfData = [];

  for (let i = 0; i < maxIdx; i += step) {
    const cost = i * binSize;
    labels.push(formatMeso(cost));
    
    let sumP = 0;
    for (let j = i; j < Math.min(maxIdx, i + step); j++) {
      sumP += totalCostPMF[j];
    }
    pmfData.push((sumP * 100).toFixed(3));
    cdfData.push((totalCostCDF[Math.min(totalCostCDF.length - 1, i + step - 1)] * 100).toFixed(2));
  }

  if (state.costChart) {
    state.costChart.destroy();
  }

  state.costChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'line',
          label: '누적 달성률 (CDF %)',
          data: cdfData,
          borderColor: '#388bfd',
          borderWidth: 2.5,
          pointRadius: 0,
          yAxisID: 'yCDF',
          tension: 0.1
        },
        {
          type: 'bar',
          label: '비용 구간별 확률 밀도 (%)',
          data: pmfData,
          backgroundColor: 'rgba(56, 139, 253, 0.25)',
          borderColor: 'rgba(56, 139, 253, 0.8)',
          borderWidth: 1,
          borderRadius: 2,
          yAxisID: 'yPDF'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: '#c9d1d9', font: { size: 12, family: 'Pretendard' } }
        },
        tooltip: {
          backgroundColor: 'rgba(19, 25, 34, 0.95)',
          titleColor: '#f0f6fc',
          bodyColor: '#c9d1d9',
          borderColor: 'rgba(255, 255, 255, 0.15)',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            title: (items) => `강화 비용: ${items[0].label}`,
            label: (item) => {
              if (item.datasetIndex === 0) {
                return `누적 완료 확률: ${item.formattedValue}% (이 비용 이내로 완성될 확률)`;
              }
              return `해당 구간 확률: ${item.formattedValue}%`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#8b949e', maxTicksLimit: 8, font: { size: 11, family: 'Pretendard' } }
        },
        yPDF: {
          position: 'left',
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#8b949e', callback: (v) => `${v}%`, font: { size: 11, family: 'Pretendard' } },
          title: { display: true, text: '구간 확률 (%)', color: '#8b949e' }
        },
        yCDF: {
          position: 'right',
          grid: { drawOnChartArea: false },
          min: 0,
          max: 100,
          ticks: { color: '#388bfd', callback: (v) => `${v}%`, font: { size: 11, family: 'Pretendard' } },
          title: { display: true, text: '누적 완료율 (%)', color: '#388bfd' }
        }
      }
    }
  });
}

/**
 * 파괴 횟수 분포 차트 렌더링
 */
function renderDestroyChart(result) {
  const ctx = document.getElementById('destroyDistChart').getContext('2d');
  if (!result || !result.destroyStats || result.destroyStats.length === 0) {
    if (state.destroyChart) state.destroyChart.destroy();
    return;
  }

  const stats = result.destroyStats;
  const labels = stats.map(s => `${s.destroys}개 파괴`);
  const probs = stats.map(s => (s.probability * 100).toFixed(2));
  const cumProbs = stats.map(s => (s.cumulative * 100).toFixed(1));

  if (state.destroyChart) {
    state.destroyChart.destroy();
  }

  state.destroyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          type: 'line',
          label: '누적 확률 (%)',
          data: cumProbs,
          borderColor: '#39c5cf',
          borderWidth: 2,
          pointRadius: 3,
          yAxisID: 'yCum',
          tension: 0.2
        },
        {
          type: 'bar',
          label: '발생 확률 (%)',
          data: probs,
          backgroundColor: stats.map(s => s.destroys === 0 ? 'rgba(63, 185, 80, 0.4)' : 'rgba(255, 123, 114, 0.4)'),
          borderColor: stats.map(s => s.destroys === 0 ? '#3fb950' : '#ff7b72'),
          borderWidth: 1,
          borderRadius: 4,
          yAxisID: 'yProb'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#c9d1d9', font: { size: 11, family: 'Pretendard' } }
        },
        tooltip: {
          backgroundColor: 'rgba(19, 25, 34, 0.95)',
          titleColor: '#f0f6fc',
          bodyColor: '#c9d1d9',
          callbacks: {
            label: (item) => `${item.dataset.label}: ${item.formattedValue}%`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#8b949e', font: { size: 11, family: 'Pretendard' } }
        },
        yProb: {
          position: 'left',
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#8b949e', callback: (v) => `${v}%` }
        },
        yCum: {
          position: 'right',
          grid: { drawOnChartArea: false },
          min: 0,
          max: 100,
          ticks: { color: '#39c5cf', callback: (v) => `${v}%` }
        }
      }
    }
  });
}

/**
 * 하단 테이블 2종 렌더링
 */
function renderTables(result) {
  const itemTbody = document.querySelector('#itemBreakdownTable tbody');
  const percTbody = document.querySelector('#percentileTable tbody');

  if (!result || !result.items || result.items.length === 0) {
    itemTbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#8b949e;">장비 목록이 비어 있습니다.</td></tr>';
    percTbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#8b949e;">데이터가 없습니다.</td></tr>';
    return;
  }

  const calculatedOptions = getCalculatedOptions();

  // 장비별 기여도 및 최적화 추천 전략 계산
  itemTbody.innerHTML = result.items.map(r => {
    const optimal = StarforceOptimizer.getOptimalReinforcement(
      r.item,
      calculatedOptions.event,
      calculatedOptions.mvpDiscount,
      calculatedOptions.pcRoom
    );

    // 15~17성 파방 전략 텍스트
    const safeStars = optimal.destroyPrevention;
    const safeBadges = [15, 16, 17].map(s => {
      const isSafe = safeStars.includes(s);
      return `<span class="strategy-badge ${isSafe ? 'safe-on' : 'safe-off'}">${s}성 ${isSafe ? '🛡️파방' : '파방X'}</span>`;
    }).join('');

    // 15~22성 복구 전략 텍스트
    const restoreBadges = (optimal.restore.length > 0)
      ? `<span class="strategy-badge restore-on">✨확정복구 (${optimal.restore.join(',')}성)</span>`
      : `<span class="strategy-badge restore-off">🔄12성 롤백</span>`;

    return `
      <tr>
        <td>
          <div style="font-weight:700; color:#f0f6fc;">${r.name}</div>
          <div class="item-strategy-container">
            <div class="strategy-group">${safeBadges}</div>
            <div class="strategy-group">${restoreBadges}</div>
          </div>
        </td>
        <td>${r.item.level}제</td>
        <td><span class="star-range">${r.item.startStar}성 → ${r.item.targetStar}성</span></td>
        <td>${r.count}개</td>
        <td>${formatMeso(r.item.baseCost)}</td>
        <td>
          <div style="font-weight:700; color:var(--accent-gold);">${formatMeso(r.expCost)}</div>
        </td>
        <td>
          <span style="color:#ff7b72; font-weight:700;">${r.expDestroys.toFixed(3)}개</span>
          <div style="font-size:11px; color:#8b949e;">평균 ${r.expTrials ? r.expTrials.toFixed(1) : '0'}회 시도</div>
        </td>
      </tr>
    `;
  }).join('');

  // 백분위수 테이블
  const p = result.percentiles;
  const s = result.smithAnalysis;

  const percRows = [
    { label: '상위 1% (최고의 대박)', meaning: '100명 중 가장 운 좋은 1명', val: p.p1, tag: 'tag-p10' },
    { label: '상위 5%', meaning: '상위 5% 이내 완성', val: p.p5, tag: 'tag-p10' },
    { label: '상위 10% (대박)', meaning: '상위 10% 이내 완성', val: p.p10, tag: 'tag-p10' },
    { label: '상위 25%', meaning: '상위 25% 이내 완성', val: p.p25, tag: '' },
    { label: '중앙값 (50%)', meaning: '유저 평균/기준 중간선 (절반이 이 비용 이하)', val: p.p50, tag: 'tag-p50' },
    { label: '기대값 (평균 1.00배)', meaning: '수학적 기댓값 평균 비용', val: result.totalExpCost, tag: '' },
    { label: '🔨 대장장이 가격 (1.08배)', meaning: `직작 승률 ${s.winProb.toFixed(1)}% (이 가격 이하로 완성할 확률)`, val: s.smithCost, tag: 'tag-smith' },
    { label: '상위 75% (하위 25%)', meaning: '다소 운이 없는 편', val: p.p75, tag: '' },
    { label: '상위 90% (억까/안전선)', meaning: '90% 확률로 이 예산 내 완성 (추천 예산)', val: p.p90, tag: 'tag-p90' },
    { label: '상위 95% (심각한 억까)', meaning: '95% 확률로 이 예산 내 완성', val: p.p95, tag: 'tag-p90' },
    { label: '상위 99% (파멸적인 억까)', meaning: '100명 중 99번째 완주선', val: p.p99, tag: 'tag-p90' }
  ];

  percTbody.innerHTML = percRows.map(row => {
    const isSmith = row.label.includes('대장장이');
    return `
      <tr ${isSmith ? 'style="background: rgba(230, 162, 60, 0.12); border-left: 3px solid #e6a23c;"' : ''}>
        <td><span class="percentile-tag ${row.tag}">${row.label}</span></td>
        <td style="${isSmith ? 'color:#e6a23c; font-weight:600;' : 'color:#8b949e;'}">${row.meaning}</td>
        <td>
          <strong style="${isSmith ? 'color:#e6a23c;' : ''}">${formatMeso(row.val)}</strong>
        </td>
      </tr>
    `;
  }).join('');
}

/**
 * 커스텀 프리셋 저장/불러오기/삭제 관리 (태그 칩 UI)
 */
function getSavedPresets() {
  try {
    const data = localStorage.getItem(STORAGE_KEY_PRESETS);
    return data ? JSON.parse(data) : {};
  } catch (e) {
    return {};
  }
}

function savePresetsToStorage(presets) {
  localStorage.setItem(STORAGE_KEY_PRESETS, JSON.stringify(presets));
}

function renderCustomPresetChips() {
  const container = document.getElementById('presetChipsContainer');
  if (!container) return;

  const presets = getSavedPresets();
  const keys = Object.keys(presets);

  if (keys.length === 0) {
    container.innerHTML = '<span class="preset-empty-msg">저장된 프리셋이 없습니다. 장비를 구성한 후 [+ 현재 목록 저장]을 눌러보세요.</span>';
    return;
  }

  container.innerHTML = keys.map(k => `
    <div class="preset-chip" data-key="${k}" title="클릭 시 이 프리셋을 불러옵니다">
      <span>${k}</span>
      <span class="chip-count">${presets[k].length}부위</span>
      <i class="fa-solid fa-xmark chip-delete" data-del-key="${k}" title="프리셋 삭제"></i>
    </div>
  `).join('');

  // 칩 클릭 시 불러오기
  container.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      if (e.target.classList.contains('chip-delete')) return;
      const k = chip.dataset.key;
      const presets = getSavedPresets();
      if (presets[k]) {
        state.items = JSON.parse(JSON.stringify(presets[k]));
        runAnalysis();
      }
    });
  });

  // 칩 삭제 버튼
  container.querySelectorAll('.chip-delete').forEach(delBtn => {
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const k = delBtn.dataset.delKey;
      if (confirm(`'${k}' 프리셋을 삭제하시겠습니까?`)) {
        const presets = getSavedPresets();
        delete presets[k];
        savePresetsToStorage(presets);
        renderCustomPresetChips();
      }
    });
  });
}

/**
 * 모달 열기/닫기 & 빠른 템플릿 칩 렌더링
 */
let currentEditIdx = -1;

function renderModalTemplateChips() {
  const container = document.getElementById('modalTemplateChips');
  if (!container) return;

  container.innerHTML = STARFORCE_CONFIG.itemPresets.map(p => `
    <button type="button" class="template-chip" data-id="${p.id}">
      ${p.name} (${p.level}제)
    </button>
  `).join('');

  container.querySelectorAll('.template-chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pId = chip.dataset.id;
      const preset = STARFORCE_CONFIG.itemPresets.find(p => p.id === pId);
      if (preset) {
        document.getElementById('inputItemName').value = preset.name;
        document.getElementById('inputItemLevel').value = preset.level;
        const manCost = Math.round(preset.defaultBaseCost / 10000);
        document.getElementById('inputBaseCost').value = manCost;
        document.getElementById('baseCostFormatted').innerText = formatManMeso(manCost);
      }
    });
  });
}

function openItemModal(editIdx = -1) {
  currentEditIdx = editIdx;
  const modal = document.getElementById('itemModal');
  const title = document.getElementById('modalTitle');

  renderModalTemplateChips();

  if (editIdx >= 0) {
    title.innerText = '강화 장비 수정';
    const it = state.items[editIdx];
    document.getElementById('inputItemName').value = it.name || '장비';
    document.getElementById('inputItemLevel').value = it.level || 200;
    document.getElementById('inputStartStar').value = it.startStar ?? 0;
    document.getElementById('inputTargetStar').value = it.targetStar ?? 22;
    const baseCostInMan = Math.round((it.baseCost || 0) / 10000);
    document.getElementById('inputBaseCost').value = baseCostInMan;
    document.getElementById('inputItemCount').value = it.count || 1;
    document.getElementById('baseCostFormatted').innerText = formatManMeso(baseCostInMan);
  } else {
    title.innerText = '새 강화 장비 추가';
    document.getElementById('inputItemName').value = '근원의 속삭임';
    document.getElementById('inputItemLevel').value = 250;
    document.getElementById('inputStartStar').value = 0;
    document.getElementById('inputTargetStar').value = 22;
    document.getElementById('inputBaseCost').value = 60000; // 6억 = 60,000만 메소
    document.getElementById('inputItemCount').value = 1;
    document.getElementById('baseCostFormatted').innerText = formatManMeso(60000);
  }

  modal.classList.add('active');
}

function closeItemModal() {
  document.getElementById('itemModal').classList.remove('active');
}

/**
 * 이벤트 리스너 등록
 */
function initEvents() {
  // 1. 샤이닝 스타포스 ON/OFF 토글 스위치
  const chkShining = document.getElementById('chkShiningEvent');
  if (chkShining) {
    chkShining.addEventListener('change', (e) => {
      if (e.target.checked) {
        state.options.event = '샤이닝 스타포스 (비용 30% 할인 + 21성 이하 파괴 확률 30% 감소 + 흔적 복구 메소 20% 할인)';
      } else {
        state.options.event = 'none';
      }
      runAnalysis();
    });
  }

  // 2. MVP 등급 알약형 버튼 그룹
  document.querySelectorAll('#mvpButtonGroup .pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#mvpButtonGroup .pill-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.options.mvpDiscount = parseFloat(btn.dataset.value) || 0;
      runAnalysis();
    });
  });

  // 3. PC방 할인 토글
  const chkPc = document.getElementById('chkPcRoom');
  if (chkPc) {
    chkPc.addEventListener('change', (e) => {
      state.options.pcRoom = e.target.checked;
      runAnalysis();
    });
  }

  // 4. 커스텀 프리셋 저장 버튼
  document.getElementById('btnSaveCustomPreset').addEventListener('click', () => {
    if (state.items.length === 0) {
      alert('저장할 장비 목록이 비어 있습니다. 먼저 장비를 추가하세요.');
      return;
    }
    const presetName = prompt('저장할 프리셋의 이름을 입력하세요:', `내 프리셋 (${state.items.length}부위)`);
    if (!presetName || !presetName.trim()) return;

    const presets = getSavedPresets();
    presets[presetName.trim()] = JSON.parse(JSON.stringify(state.items));
    savePresetsToStorage(presets);
    renderCustomPresetChips();
    alert(`'${presetName.trim()}' 프리셋이 저장되었습니다!`);
  });

  // 5. 전체 비우기 & 추가 모달
  document.getElementById('btnClearItems').addEventListener('click', () => {
    if (confirm('등록된 모든 장비를 목록에서 비우시겠습니까?')) {
      state.items = [];
      runAnalysis();
    }
  });

  document.getElementById('btnAddCustomItem').addEventListener('click', () => openItemModal(-1));
  document.getElementById('btnCloseModal').addEventListener('click', closeItemModal);
  document.getElementById('btnCancelModal').addEventListener('click', closeItemModal);

  // 노작 비용 실시간 포맷 표시 (만 메소 단위 입력 -> 한글 포맷팅)
  document.getElementById('inputBaseCost').addEventListener('input', (e) => {
    const manVal = parseFloat(e.target.value) || 0;
    document.getElementById('baseCostFormatted').innerText = formatManMeso(manVal);
  });

  function saveItemFromModal() {
    const nameVal = document.getElementById('inputItemName').value.trim() || '장비';
    const levelVal = parseInt(document.getElementById('inputItemLevel').value) || 200;
    const startVal = parseInt(document.getElementById('inputStartStar').value) ?? 0;
    const targetVal = parseInt(document.getElementById('inputTargetStar').value) || 22;
    const manVal = parseFloat(document.getElementById('inputBaseCost').value) || 0;
    const countVal = parseInt(document.getElementById('inputItemCount').value) || 1;

    if (startVal >= targetVal) {
      alert('목표 성수는 시작 성수보다 높아야 합니다.');
      return;
    }

    const itemData = {
      id: 'item_' + Date.now(),
      name: nameVal,
      level: levelVal,
      startStar: startVal,
      targetStar: targetVal,
      baseCost: manVal * 10000,
      count: countVal
    };

    if (currentEditIdx >= 0) {
      state.items[currentEditIdx] = itemData;
    } else {
      state.items.push(itemData);
    }

    closeItemModal();
    runAnalysis();
  }

  // 장비 저장 폼 submit & 버튼 click 양방향 처리
  document.getElementById('itemForm').addEventListener('submit', (e) => {
    e.preventDefault();
    saveItemFromModal();
  });

  const btnSave = document.getElementById('btnSaveItem');
  if (btnSave) {
    btnSave.addEventListener('click', (e) => {
      e.preventDefault();
      saveItemFromModal();
    });
  }

  // 1. 텍스트 리포트 복사 (인벤/디스코드용)
  const btnCopy = document.getElementById('btnCopyTextReport');
  if (btnCopy) {
    btnCopy.addEventListener('click', () => {
      const calculatedOptions = getCalculatedOptions();
      const result = MultiAnalyzer.analyze(state.items, calculatedOptions);
      if (!result || !result.items || result.items.length === 0) {
        alert('내보낼 장비 데이터가 없습니다.');
        return;
      }

      let report = `📊 [메이플 스타포스 강화 분석 리포트]\n`;
      report += `• 적용 이벤트: ${calculatedOptions.event ? '샤이닝 스타포스' : '일반 (없음)'}\n`;
      report += `• 자동 최적화(DP): ON (최소 비용 최적화)\n`;
      report += `• 총 기대 비용: ${formatMeso(result.totalExpCost)}\n`;
      report += `• 중앙값(50%): ${formatMeso(result.percentiles.p50)}\n`;
      report += `• 상위 10%(대박): ${formatMeso(result.percentiles.p10)}\n`;
      report += `• 하위 10%(억까선): ${formatMeso(result.percentiles.p90)}\n`;
      report += `• 기대 소모 장비: ${result.totalExpDestroys.toFixed(3)}개 (노파괴 확률 ${(result.totalDestroyPMF[0] * 100).toFixed(2)}%)\n\n`;

      report += `📋 [장비별 세부 전략 & 기댓값]\n`;
      result.items.forEach(r => {
        const optimal = StarforceOptimizer.getOptimalReinforcement(r.item, calculatedOptions.event, calculatedOptions.mvpDiscount, calculatedOptions.pcRoom);
        const safeStr = optimal.destroyPrevention.length > 0 ? `[${optimal.destroyPrevention.join(',')}성 파방]` : `[파방 미사용]`;
        const restStr = optimal.restore.length > 0 ? `[${optimal.restore.join(',')}성 확정복구]` : `[12성 롤백]`;
        report += `• ${r.name} (${r.item.level}제 | ${r.item.startStar}→${r.item.targetStar}성 | ${r.count}개): ${formatMeso(r.expCost)} | 파괴: ${r.expDestroys.toFixed(3)}개 | ${safeStr} ${restStr}\n`;
      });

      report += `\n📈 [비용 백분위수 컷라인 & 대장장이 비교]\n`;
      report += `• 상위 1%: ${formatMeso(result.percentiles.p1)}\n`;
      report += `• 상위 5%: ${formatMeso(result.percentiles.p5)}\n`;
      report += `• 상위 10%: ${formatMeso(result.percentiles.p10)}\n`;
      report += `• 상위 25%: ${formatMeso(result.percentiles.p25)}\n`;
      report += `• 중앙값 (50%): ${formatMeso(result.percentiles.p50)}\n`;
      report += `• 기댓값 (평균 1.00배): ${formatMeso(result.totalExpCost)}\n`;
      if (result.smithAnalysis) {
        const sm = result.smithAnalysis;
        report += `• 🔨 대장장이 가격 (1.08배): ${formatMeso(sm.smithCost)} (직작 승률 ${sm.winProb.toFixed(1)}% | 상위 ${sm.percentileRank}%선)\n`;
      }
      report += `• 상위 75%: ${formatMeso(result.percentiles.p75)}\n`;
      report += `• 상위 90% (추천 예산): ${formatMeso(result.percentiles.p90)}\n`;
      report += `• 상위 95%: ${formatMeso(result.percentiles.p95)}\n`;
      report += `• 상위 99%: ${formatMeso(result.percentiles.p99)}\n\n`;
      report += `※ 본 분석기는 시뮬레이션 기반 확률 모델을 사용하므로 실제 수치와 약간의 오차가 존재할 수 있습니다.\n`;

      navigator.clipboard.writeText(report).then(() => {
        alert('📋 분석 리포트가 클립보드에 복사되었습니다!\n메이플 인벤, 디스코드, 메모장 등에 붙여넣기(Ctrl+V)하세요.');
      }).catch(err => {
        prompt('아래 텍스트를 복사하세요:', report);
      });
    });
  }

  // 2. CSV 다운로드
  const btnCsv = document.getElementById('btnExportCsv');
  if (btnCsv) {
    btnCsv.addEventListener('click', () => {
      const calculatedOptions = getCalculatedOptions();
      const result = MultiAnalyzer.analyze(state.items, calculatedOptions);
      if (!result || !result.items || result.items.length === 0) {
        alert('내보낼 장비 데이터가 없습니다.');
        return;
      }

      let csv = '\uFEFF'; // UTF-8 BOM for Excel
      csv += '구분,장비명,레벨,시작성수,목표성수,수량,노작비용(메소),기대비용(메소),평균파괴수,최적파방,최적복구\n';
      result.items.forEach(r => {
        const optimal = StarforceOptimizer.getOptimalReinforcement(r.item, calculatedOptions.event, calculatedOptions.mvpDiscount, calculatedOptions.pcRoom);
        const safeStr = optimal.destroyPrevention.join(' ') || '미사용';
        const restStr = optimal.restore.join(' ') || '12성롤백';
        csv += `장비,${r.name},${r.item.level},${r.item.startStar},${r.item.targetStar},${r.count},${r.item.baseCost},${Math.round(r.expCost)},${r.expDestroys.toFixed(3)},${safeStr},${restStr}\n`;
      });

      csv += '\n백분위,비용(메소),설명\n';
      const p = result.percentiles;
      const s = result.smithAnalysis;
      const percData = [
        ['상위 1%', p.p1, '초대박'],
        ['상위 5%', p.p5, '극상위 행운'],
        ['상위 10%', p.p10, '대박'],
        ['상위 25%', p.p25, '상위 25%'],
        ['중앙값(50%)', p.p50, '유저 중간 기준선'],
        ['기댓값(평균)', result.totalExpCost, '수학적 기댓값 (1.00배)'],
        ['대장장이 가격(1.08배)', s.smithCost, `직작 승률 ${s.winProb.toFixed(1)}% (상위 ${s.percentileRank}%선)`],
        ['상위 75%', p.p75, '하위 25%'],
        ['상위 90%', p.p90, '90% 안전선'],
        ['상위 95%', p.p95, '심각한 억까'],
        ['상위 99%', p.p99, '파멸적 억까']
      ];
      percData.forEach(([label, val, desc]) => {
        csv += `${label},${Math.round(val)},${desc}\n`;
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `스타포스_강화분석_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
    });
  }

  // 3. JSON 다운로드
  const btnJson = document.getElementById('btnExportJson');
  if (btnJson) {
    btnJson.addEventListener('click', () => {
      const calculatedOptions = getCalculatedOptions();
      const result = MultiAnalyzer.analyze(state.items, calculatedOptions);
      const exportData = {
        exportedAt: new Date().toISOString(),
        options: state.options,
        calculatedOptions,
        items: state.items,
        summary: {
          totalExpCost: result.totalExpCost,
          totalExpDestroys: result.totalExpDestroys,
          percentiles: result.percentiles,
          smithAnalysis: result.smithAnalysis
        },
        itemBreakdown: result.items.map(r => ({
          name: r.name,
          level: r.item.level,
          startStar: r.item.startStar,
          targetStar: r.item.targetStar,
          baseCost: r.item.baseCost,
          expCost: r.expCost,
          expDestroys: r.expDestroys
        }))
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `스타포스_강화분석_${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
// 전역 헬퍼 노출 (인라인 및 외부 호출 완벽 지원)
window.openItemModal = openItemModal;
window.closeItemModal = closeItemModal;

// 초기화
function bootstrap() {
  renderCustomPresetChips();
  initEvents();
  runAnalysis();
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
