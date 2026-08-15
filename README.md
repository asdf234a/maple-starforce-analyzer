# 🌟 메이플스토리 스타포스 다중 강화 분포 분석기 (Maple Starforce Multi-Analyzer)

[![Web App](https://img.shields.io/badge/Live_Demo-asdf234a.github.io-388bfd?style=for-the-badge&logo=github)](https://asdf234a.github.io/maple-starforce-analyzer/)
[![Update](https://img.shields.io/badge/MapleStory-2026_Starforce_Official-orange?style=for-the-badge)](https://asdf234a.github.io/maple-starforce-analyzer/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

> **메이플스토리 최신 스타포스 개편 시스템(하락 0% 삭제 · 파괴 시 직전 성수 복구 메소 도입)** 기준의 단일 및 다중 장비 강화 비용 & 파괴 횟수 확률분포(PMF/CDF) 분석 웹 애플리케이션입니다.  
> *(※ 본 분석기는 정밀 시뮬레이션 기반 확률 모델을 사용하므로 실제 수치와 약간의 오차가 존재할 수 있습니다)*

### 🌐 [👉 웹사이트 바로가기 (클릭하여 실행)](https://asdf234a.github.io/maple-starforce-analyzer/)

---

## ✨ 핵심 기능 (Features)

### 1. ⚡ FFT(고속 푸리에 변환) 기반 다중 아이템 결합 확률분포 분석
- 단일 장비뿐만 아니라 **칠흑 5세트, 에테르넬 4세트, 아케인 5세트 등 다중 장비**를 동시에 강화할 때의 **총비용 결합 확률분포(PMF/CDF)**와 **총 파괴 횟수 분포**를 $O(N \log N)$ FFT 합성곱 엔진으로 **0.2초 이내**에 실시간 연산합니다.

### 2. 🧠 동적 계획법(DP) 기반 강화 경로 자동 최적화
- 각 성수($15 \to 22$)별로 장비 레벨과 노작 가격, 이벤트 상태를 고려하여:
  - **15~17성**: `[파괴방지(+200%) / 확정복구(직전 성수) / 12성 롤백]` 3자 비교
  - **18~22성**: `[확정복구(직전 성수) / 12성 롤백]` 2자 비교
- 수학적으로 기댓값 비용이 최소가 되는 **최적의 파괴방지 및 복구 전략**을 자동으로 탐색하여 적용합니다.

### 3. 🔨 대장장이 가격 (기댓값 × 1.08) 누적 확률 및 직작 승률 분석
- 대리 강화 / 완제품 시세 기준이 되는 **대장장이 가격(1.08배)**이 전체 누적 확률분포(CDF)의 상위 몇 %에 위치하는지 분석합니다.
- **직작 성공 승률(%)**을 제공하여 완제품 구매 vs 직작의 유불리를 통계적으로 판단할 수 있습니다.

### 4. 💾 내 커스텀 프리셋 시스템
- 내가 자주 시뮬레이션하는 장비 세팅을 원하는 이름으로 브라우저(`localStorage`)에 영구 저장하고 언제든 원클릭으로 불러올 수 있습니다.

### 5. 💰 만 메소 단위 입력 & 정밀 표기
- 노작 장비 가격 입력 시 **'만 메소' 단위**로 간편하게 입력 (예: `32` 입력 시 32만 메소, `400000` 입력 시 40억 메소).
- 기댓값 및 모든 통계 지표를 **소수점 3자리**까지 정밀하게 계산 및 표기합니다.

### 6. 📤 3가지 포맷 결과 내보내기 (Export)
- **📋 텍스트 리포트 복사**: 메이플 인벤, 디스코드, 길드 단톡방 공유용 서식 리포트 클립보드 복사
- **📊 CSV 엑셀 다운로드**: 백분위수 10단계 및 장비별 분석 표가 담긴 UTF-8 BOM CSV 파일 다운로드
- **📁 JSON 다운로드**: 강화 설정 및 분석 데이터 전체를 JSON 파일로 내보내기

---

## 📊 적용된 최신 스타포스 공식 & 데이터

- **강화 비용 공식**:
  - $0 \sim 9$성: $\text{round}\left((1000 + \frac{L^3 \times (S+1)}{36}) / 100\right) \times 100$
  - $10 \sim 29$성: $1000 + \text{round}\left(\frac{L^3 \times (S+1)^{2.7}}{\text{divisor}} / 100\right) \times 100$
    *(10성 571, 11성 314, 12성 214, 13성 157, 14성 107, 17성 150, 18성 70, 19성 45, 21성 125, 그 외 200)*
- **확률 테이블**: 스타캐치 상시 산입 확률표 반영 (하락 삭제)
- **파괴 복구 규정**:
  - $15 \sim 18$성: 노작 장비 1개 + 레벨 비례 복구 메소
  - $19 \sim 20$성: 노작 장비 2개 + 레벨 비례 복구 메소
  - $21$성: 노작 장비 3개 + 레벨 비례 복구 메소
  - $22$성: 노작 장비 4개 + 레벨 비례 복구 메소
- **샤이닝 스타포스**: 비용 30% 할인 + 21성 이하 파괴 확률 30% 감소 + 흔적 복구 메소 비용 20% 할인

---

## 🛠️ 기술 스택 (Tech Stack)

- **Frontend**: Vanilla HTML5, Modern CSS3 (Glassmorphism Dark Theme), ES Modules JavaScript
- **Algorithms**: Radix-2 Cooley-Tukey FFT Engine, Markov Chain & DP Optimizer Engine
- **Visualization**: Chart.js (PDF/CDF Dual-Axis & Destroy Distribution Charts)
- **Deployment**: GitHub Pages (Static Hosting)

---

## 💻 로컬 실행 방법 (Local Run)

```bash
# 저장소 클론
git clone https://github.com/asdf234a/maple-starforce-analyzer.git

# 폴더 이동
cd maple-starforce-analyzer

# 로컬 서버 실행 (또는 start.bat 더블클릭)
npm start
```
브라우저에서 `http://localhost:3000`으로 접속합니다. (서버 없이 `maple-starforce-analyzer.html` 더블클릭만으로도 실행 가능)

---

## 📄 라이선스 (License)

이 프로젝트는 [MIT License](LICENSE)에 따라 자유롭게 수정 및 배포가 가능합니다.
