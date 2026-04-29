# FlightData Dashboard Redesign & Fuel Metric Refinement

본 설계안은 실제 비행 데이터(Block Fuel)와 Flight Plan(Trip Fuel) 간의 '택시 연료' 스케일 불일치 문제를 해결하고, 대시보드 UI를 간결하면서도 심층적인 분석이 가능하게 개편하는 것을 목표로 합니다.

## User Review Required

> [!IMPORTANT]
> **택시 연료(Taxi Fuel) 계산 기준**에 대한 확인이 필요합니다.
> 현재 `Checklist_App.config`의 `TAXI_FUEL_DB`를 통해 각 출발지 공항별 고정 TAXI FUEL을 가져옵니다.
> 1. **택시 포함 (Block Fuel):** `실제 BURN` vs `FPBURN + 고정 TAXI_FUEL`
> 2. **택시 제외 (Trip Fuel):** `실제 BURN - 고정 TAXI_FUEL` vs `FPBURN`
> 3. **택시 구간 특화 (Taxi Only):** `실제 택시 시간(Out+In) * 분당 소모량(약 12kg)` vs `고정 TAXI_FUEL`
> 위 논리로 데이터를 분리하여 대시보드 옵션으로 제공할 예정입니다. 이 논리가 맞는지 체크해 주시면 됩니다.

## Proposed Changes

### FlightData_App

#### [MODIFY] [main.py](file:///c:/Users/dlscj/Desktop/프로그램%20개발/OCC_Portal/FlightData_App/main.py)
* `Checklist_App.config`에서 `TAXI_FUEL_DB`를 import 합니다.
* SQLite `SELECT` 구문에 `DEP`(출발지) 칼럼을 명시적으로 추가하여 데이터를 로드합니다.
* `pandas` DataFrame 파이프라인에서 다음 칼럼들을 산출하여 JSON으로 전송합니다.
  - `CONFIG_TAXI`: `TAXI_FUEL_DB` 기준 출발 공항별 택시 연료 (없을 시 기본 200kg)
  - `ACTUAL_TAXI`: `(TAXI_OUT_MIN + TAXI_IN_MIN) * 12kg`
  - `TRIP_BURN`: `BURN - CONFIG_TAXI` (또는 실제 택시 소모량 차감)
  - `BLOCK_BURN`: `BURN` (기존과 동일)

#### [MODIFY] [dashboard.html](file:///c:/Users/dlscj/Desktop/프로그램%20개발/OCC_Portal/FlightData_App/templates/dashboard.html)
* **메인 요약 블록 삭제:** 화면 상단의 4x2 그리드 배열(8개 요약 카드) 코드를 삭제하여 화면 복잡도를 낮춥니다.
* **표본 수 및 유의율 표기:** 메인 컨테이너 최상단 또는 차트 좌측 상단에 `N=데이터수`, 유의수준(p-value) 등의 신뢰도 지표를 작고 깔끔하게 표기하는 영역을 신설합니다.
* **데이터 기준(뷰 모드) Toggle 버튼 신설:** 
  차트 패널 상단에 세 가지 연료 분석 기준을 선택할 수 있는 탭(토글)을 삽입합니다.
  - `[ 종합 소모량 (Include Taxi) ]` 
  - `[ 순항 소모량 (Exclude Taxi) ]`
  - `[ 택시 소모량 (Taxi Only) ]`
* **동적 요약 표(Table/Stats) 병합:**
  없어진 8개 블록 중 핵심 지표(탑재율, 방어율 등)만 추려, 차트 하단 혹은 옵션 탭 옆에 간결한 데이터 표/텍스트 형태로 통합 노출시킵니다. 선택된 뷰 모드에 따라 방어율(Coverage %), 평균 소모량 수치가 실시간 연동되어 바뀝니다.

## Open Questions

> [!WARNING]
> 현재 A320 모델의 통상 택시 분당 소모량을 **12kg/min** 로 계산하려고 합니다. 항공사마다 매뉴얼(FCOM)상 적용하는 기준이 `10kg~15kg` 등 다를 수 있는데, 12kg으로 고정해도 될까요?

## Verification Plan

### Manual Verification
- Render 환경 및 로컬 환경에서 노선을 선택했을 때 `dashboard.html`이 정상적으로 노출되는가?
- 선택한 탭(Include, Exclude, Taxi Only)에 따라 차트의 Y축 값(연료량) 리스케일링 및 플롯이 정상적으로 변경되는가?
- 8개의 윗 블록이 사라진 자리가 깔끔하게 차트 위주로 재편되었는지 시각적으로 점검.
