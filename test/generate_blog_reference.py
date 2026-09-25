"""
starforce.gg 블로그 기준 기댓값 레퍼런스 생성기 → test/blog_reference.json

아래 모델 코드(Options ~ expected_to)는 다음 글의 Python 코드를 그대로 옮긴 것입니다.
  출처: https://starforce.gg/blog/ev-calculation-logic
  Licensed under the MIT License. Copyright (c) 2026 STARFORCE.GG

steps_all()은 같은 글 본문(2-4절, "평균 파괴 횟수 및 평균 시도 횟수")의 수식대로
- 22성 초과 단계에서도 확정복구(22성 복구) vs 12성 롤백 중 최솟값을 고르고
- 파괴 횟수 / 시도 횟수를 같은 재귀 구조로 계산합니다.
(블로그 코드의 expected_to는 22성 초과에서 12성 롤백 후보를 빼고 계산하므로 22성 이하만 비교합니다.)

실행: python3 test/generate_blog_reference.py
"""
from dataclasses import dataclass, replace
from enum import Enum
class MVP(Enum):
    NONE = "none"
    SILVER = "silver"
    GOLD = "gold"
    DIAMOND = "diamond"
@dataclass(frozen=True)
class Options:
    mvp: MVP = MVP.NONE
    pc: bool = False
    meso_event: bool = False
    prevent_destroy: bool = False
    destroy_down: bool = False
    one_plus_one_15: bool = False
    shata: bool = False
D: dict[int, int] = {
    12: 214, 13: 157, 14: 107, 15: 200, 16: 200, 17: 150,
    18: 70,  19: 45,  20: 200, 21: 125,
    **{s: 200 for s in range(22, 30)},
}
_MVP_DISCOUNT: dict[MVP, float] = {
    MVP.NONE: 1.00, MVP.SILVER: 0.97, MVP.GOLD: 0.95, MVP.DIAMOND: 0.90,
}
def raw_cost(s: int, level: int) -> int:
    raw = 1000 + (level ** 3 * (s + 1) ** 2.7) / D[s]
    return int(raw / 100 + 0.5) * 100
def discount(s: int, opts: Options) -> float:
    m_mvp = _MVP_DISCOUNT[opts.mvp] if s < 17 else 1.0
    if s < 17 and opts.pc:
        m_mvp -= 0.05
    m_event = 0.70 if opts.meso_event else 1.0
    return m_mvp * m_event
def cost(s: int, level: int, opts: Options) -> int:
    raw = raw_cost(s, level)
    total = raw * discount(s, opts)
    if opts.prevent_destroy:
        total += 2 * raw
    return int(total + 0.5)
@dataclass(frozen=True)
class Odds:
    success: float
    fail: float
    destroy: float
BASE_ODDS: dict[int, Odds] = {
    12: Odds(0.4200, 0.5800,    0.0000),
    13: Odds(0.3675, 0.6325,    0.0000),
    14: Odds(0.3150, 0.6850,    0.0000),
    15: Odds(0.3150, 0.66445,   0.02055),
    16: Odds(0.3150, 0.66445,   0.02055),
    17: Odds(0.1575, 0.7751,    0.0674),
    18: Odds(0.1575, 0.7751,    0.0674),
    19: Odds(0.1575, 0.75825,   0.08425),
    20: Odds(0.3150, 0.58225,   0.10275),
    21: Odds(0.1575, 0.716125,  0.126375),
    22: Odds(0.1575, 0.6740,    0.1685),
    23: Odds(0.1050, 0.7160,    0.1790),
    24: Odds(0.1050, 0.7160,    0.1790),
    25: Odds(0.1050, 0.7160,    0.1790),
    26: Odds(0.0735, 0.7412,    0.1853),
    27: Odds(0.0525, 0.7580,    0.1895),
    28: Odds(0.0315, 0.7748,    0.1937),
    29: Odds(0.0105, 0.7916,    0.1979),
}
def odds_for(s: int, opts: Options) -> Odds:
    o = BASE_ODDS[s]
    success, fail, destroy = o.success, o.fail, o.destroy
    if opts.destroy_down and s <= 21:
        fail += destroy * 0.3
        destroy *= 0.7
    if opts.one_plus_one_15 and s == 15:
        return Odds(1.0, 0.0, 0.0)
    if opts.prevent_destroy:
        fail += destroy
        destroy = 0.0
    return Odds(success, fail, destroy)
RESTORE_COUNT: dict[int, int] = {
    15: 1, 16: 1, 17: 1, 18: 1, 19: 2, 20: 2, 21: 3, 22: 4,
}
RESTORE_COST: dict[int, dict[int, int]] = {
    15: {140:   1_4900_0000, 160:   2_2200_0000, 200:   4_3300_0000, 250:   8_4600_0000},
    16: {140:   3_5900_0000, 160:   5_3500_0000, 200:  10_5000_0000, 250:  20_4000_0000},
    17: {140:   6_0600_0000, 160:   9_0400_0000, 200:  17_7000_0000, 250:  34_5000_0000},
    18: {140:  13_8000_0000, 160:  20_6000_0000, 200:  40_1000_0000, 250:  78_3000_0000},
    19: {140:  22_8000_0000, 160:  34_1000_0000, 200:  66_5000_0000, 250: 130_0000_0000},
    20: {140:  40_2000_0000, 160:  60_0000_0000, 200: 118_0000_0000, 250: 229_0000_0000},
    21: {140:  50_5000_0000, 160:  75_4000_0000, 200: 148_0000_0000, 250: 288_0000_0000},
    22: {140:  82_9000_0000, 160: 124_0000_0000, 200: 242_0000_0000, 250: 473_0000_0000},
}
def restore_cost(s: int, level: int, base_price: float, opts: Options) -> float:
    s_eff = min(s, 22)
    meso = RESTORE_COST[s_eff][level] * (0.8 if opts.shata else 1.0)
    return base_price * RESTORE_COUNT[s_eff] + meso
def expected_step(s: int, level: int, base_price: float,
                  cum_ev: float, cum_ev_after_22: float,
                  opts: Options) -> float:
    o = odds_for(s, opts)
    c = cost(s, level, opts)
    candidates: list[float] = []
    if s > 22:
        restore = restore_cost(22, level, base_price, opts) + cum_ev_after_22
    else:
        restore = base_price + cum_ev
    candidates.append((c + o.destroy * restore) / o.success)
    if 15 <= s <= 17:
        opts_prev = replace(opts, prevent_destroy=True)
        o_prev = odds_for(s, opts_prev)
        c_prev = cost(s, level, opts_prev)
        candidates.append(c_prev / o_prev.success)
    if 15 <= s <= 22:
        guard = restore_cost(s, level, base_price, opts)
        candidates.append((c + o.destroy * guard) / o.success)
    return min(candidates)
def expected_to(target: int, level: int, base_price: float, opts: Options):
    """12성 → target성 누적 EV + 단계별 breakdown 반환."""
    cum_ev = 0.0
    cum_ev_after_22 = 0.0
    breakdown = []
    for s in range(12, target):
        ev = expected_step(s, level, base_price, cum_ev, cum_ev_after_22, opts)
        cum_ev += ev
        if s >= 22:
            cum_ev_after_22 += ev
        breakdown.append((s, ev, cum_ev))
    return cum_ev, breakdown


import json
import os

METRICS = ['cost', 'destroys', 'trials']


def steps_all(level, bp, opts, target=30):
    cum = {m: [0.0] * 31 for m in METRICS}
    for s in range(12, target):
        o = odds_for(s, opts)
        c = cost(s, level, opts)
        att = {'cost': c, 'destroys': 0, 'trials': 1}
        cands = []
        roll = {'cost': bp, 'destroys': 1, 'trials': 0}
        cands.append({m: (att[m] + o.destroy * (roll[m] + cum[m][s])) / o.success for m in METRICS})
        if 15 <= s <= 17 and o.destroy > 0:
            op = replace(opts, prevent_destroy=True)
            oo = odds_for(s, op)
            a2 = {'cost': cost(s, level, op), 'destroys': 0, 'trials': 1}
            cands.append({m: a2[m] / oo.success for m in METRICS})
        if s >= 15 and o.destroy > 0:
            r = {'cost': restore_cost(s, level, bp, opts), 'destroys': 1, 'trials': 0}
            extra = (lambda m: cum[m][s] - cum[m][22]) if s > 22 else (lambda m: 0)
            cands.append({m: (att[m] + o.destroy * (r[m] + extra(m))) / o.success for m in METRICS})
        best = min(cands, key=lambda x: x['cost'])
        for m in METRICS:
            cum[m][s + 1] = cum[m][s] + best[m]
    return cum


MVPS = {'none': MVP.NONE, 'silver': MVP.SILVER, 'gold': MVP.GOLD, 'diamond': MVP.DIAMOND}

cases = []
for level in (140, 160, 200, 250):
    for bp in (1.5e8, 15e8, 50e8):
        for ev in ('none', 'shata'):
            for mvp, pc in (('none', False), ('diamond', True)):
                cases.append((level, bp, ev, mvp, pc))
cases += [
    (200, 30e8, '1516', 'none', False),
    (160, 25e8, 'destroy', 'gold', False),
    (200, 30e8, 'discount', 'silver', True),
]

out = []
for level, bp, ev, mvp, pc in cases:
    opts = Options(
        mvp=MVPS[mvp], pc=pc,
        meso_event=ev in ('shata', 'discount'),
        destroy_down=ev in ('shata', 'destroy'),
        shata=ev == 'shata',
        one_plus_one_15=ev == '1516',
    )
    cum = steps_all(level, bp, opts)
    out.append(dict(
        level=level, baseCost=bp, event=ev, mvp=mvp, pcRoom=pc,
        cost=cum['cost'], destroys=cum['destroys'], trials=cum['trials'],
        blogCode22=expected_to(22, level, bp, opts)[0],
    ))

path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'blog_reference.json')
with open(path, 'w') as f:
    f.write('[\n' + ',\n'.join(json.dumps(c) for c in out) + '\n]\n')
print(f'{len(out)} cases -> {path}')
