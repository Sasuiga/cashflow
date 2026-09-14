import { useMemo, useState } from 'react';
import {
  FACTORY_COST,
  HAND_LIMIT,
  HIRE_COST,
  MACHINE_COST,
  MATERIALS,
  RD_THRESHOLD,
  SALARY,
  SHOP_REFRESH_COST,
  cardById,
  productById,
} from '../game/data';
import {
  arOverdueOf,
  capacityOf,
  creditSaleRateOf,
  hireEffectLines,
  loanLimit,
  maxExtraProduce,
  monthGap,
  monthlyInterest,
  monthlySalary,
  orderFillPreview,
  orderMargin,
  receivablesNet,
} from '../game/engine';
import { MONTH_NAMES, ROLE_LABEL, money, productName, signedMoney } from '../game/format';
import { QUARTER_LABEL, climateById, goalById } from '../game/board';
import type { GameAction, GameState, MaterialId, Role } from '../game/types';
import { FinancePage } from './FinancePage';
import { JournalPage } from './JournalPage';
import { BoardModal, NewsModal, ReportModal } from './Modals';

const ROLES: Role[] = ['production', 'management', 'sales', 'rd'];
const QTY = [10, 20, 40];
const LOAN = [2, 4, 8];
const EXTRA = [0, 2, 4, 6];
const PHASES: Array<{ id: GameState['phase']; label: string }> = [
  { id: 'news', label: '事项' },
  { id: 'market', label: '接单' },
  { id: 'operate', label: '补缺口' },
  { id: 'report', label: '结算' },
];

type Sheet = 'books' | 'journal' | 'hire' | 'buy' | 'loan' | 'more' | null;

export function Board({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: (action: GameAction) => void;
}) {
  const [sheet, setSheet] = useState<Sheet>(null);
  const [hireRole, setHireRole] = useState<Role>('production');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [pickedCard, setPickedCard] = useState<string | null>(null);
  const [cart, setCart] = useState<Partial<Record<MaterialId, number>>>({});
  const [loanAmt, setLoanAmt] = useState(4);
  const reduceMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    [],
  );

  const overdue = arOverdueOf(state);
  const ar = receivablesNet(state);
  const gap = monthGap(state);
  const climate = climateById(state.climateId);
  const basic = state.basicGoalId ? goalById(state.basicGoalId) : null;
  const challenge = state.challengeGoalIds[0] ? goalById(state.challengeGoalIds[0]) : null;
  const cap = capacityOf(state);
  const playable = state.phase === 'market' || state.phase === 'operate';
  const visibleMats = MATERIALS.filter((item) => item.id !== 'd' || state.materialDUnlocked);
  const cartItems = visibleMats
    .map((item) => ({ material: item.id, qty: cart[item.id] ?? 0 }))
    .filter((line) => line.qty > 0);
  const room = Math.max(0, loanLimit(state.machines) - state.debt);
  const borrowAmt = Math.min(loanAmt, room);
  const repayAmt = Math.min(loanAmt, state.debt, Math.max(0, state.cash));

  const closeSheet = () => setSheet(null);

  return (
    <div className="play">
      <header className="play-hud">
        <div className="play-brand">
          <strong>CASHFLOW</strong>
          <span>
            {MONTH_NAMES[state.month - 1]} · {state.month}/12
          </span>
        </div>
        <div className="play-stats">
          <div className={`play-stat ${state.cash < 8 ? 'bad' : ''}`}>
            <em>现金</em>
            <b className="tick">{money(state.cash)}</b>
          </div>
          <div className="play-stat">
            <em>行动点</em>
            <div className="ap-row">
              {Array.from({ length: Math.max(state.maxAp, 1) }, (_, i) => (
                <i key={i} className={i < state.ap ? 'ap fill' : 'ap'} />
              ))}
            </div>
          </div>
          <div className="play-flags">
            {state.debt > 0 && <span className="flag chain">借 {money(state.debt)}</span>}
            {overdue > 0 && <span className="flag bad">逾期 {money(overdue)}</span>}
            {ar > 0 && overdue <= 0 && <span className="flag">应收 {money(ar)}</span>}
            <button type="button" className="flag-btn" onClick={() => setSheet('journal')}>
              菜单
            </button>
          </div>
        </div>
        {basic && (
          <p className="play-goal">
            {QUARTER_LABEL[state.quarter]} · {climate.name}
            {challenge ? ` · ${challenge.name}` : ''} · {basic.progress(state)}
          </p>
        )}
      </header>

      <nav className="phase-dots" aria-label="本月阶段">
        {PHASES.map((item) => (
          <span
            key={item.id}
            className={[
              'phase-dot',
              state.phase === item.id ? 'on' : '',
              state.phase === 'board' && item.id === 'news' ? 'on' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {item.label}
          </span>
        ))}
      </nav>

      <main className="play-stage">
        {state.phase === 'market' && (
          <section className="stage-block fade-in">
            <p className="stage-kicker">本月命题 · 点接即承诺 · 料价毛利未计人工</p>
            <div className="order-stack">
              {(state.monthOrders ?? []).map((order) => {
                const on = (state.acceptedOrderIds ?? []).includes(order.id);
                const fill = orderFillPreview(state, order.id);
                const margin = orderMargin(state, order);
                const open = expanded === order.id;
                return (
                  <article
                    key={order.id}
                    className={['order-card', on ? 'on' : '', fill.ok ? 'ok' : 'short'].join(' ')}
                  >
                    <button type="button" className="order-main" onClick={() => dispatch({ type: 'TOGGLE_ORDER', id: order.id })}>
                      {on && (
                        <em className="seal" aria-hidden>
                          接
                        </em>
                      )}
                      <header>
                        <b>
                          {productName(order.productId)} · {order.qty} 件
                        </b>
                        {order.kind === 'contract' && <em className="tag">合同</em>}
                      </header>
                      <p className={margin.margin >= 0 ? 'margin good' : 'margin bad'}>
                        毛利 {signedMoney(margin.margin)}
                        <small> · {Math.round(margin.rate * 100)}%</small>
                      </p>
                      <p className="order-meta">
                        {order.kind === 'contract' && !on
                          ? `不接也罚 ${money(order.penalty)}`
                          : fill.ok
                            ? '现在交得出'
                            : fill.missing.join('，') || '现在交不出'}
                        {order.kind !== 'contract' && order.penalty > 0 ? ` · 接了交不出罚 ${money(order.penalty)}` : ''}
                        {order.kind === 'contract' && on ? ` · 交不出罚 ${money(order.penalty)}` : ''}
                      </p>
                    </button>
                    <button type="button" className="order-more" onClick={() => setExpanded(open ? null : order.id)}>
                      {open ? '收起' : '明细'}
                    </button>
                    {open && (
                      <div className="order-detail">
                        <span>单价 {money(margin.price)}</span>
                        <span>料本 {money(margin.unit)}</span>
                        <span>营收 {money(margin.revenue)}</span>
                        <span>现销 {money(margin.revenue * (1 - creditSaleRateOf(state)))}</span>
                        <span>赊销 {money(margin.revenue * creditSaleRateOf(state))}</span>
                        <span>料价毛利，未计人工</span>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {state.phase === 'operate' && (
          <section className="stage-block fade-in">
            <p className="stage-kicker">
              {(state.acceptedOrderIds ?? [])
                .map((id) => (state.monthOrders ?? []).find((item) => item.id === id))
                .filter(Boolean)
                .map((order) => `${productName(order!.productId)} ${order!.qty}`)
                .join(' + ') || '本月未接单'}
            </p>
            <div className="cap-bar" aria-label="产能">
              <span>
                产能 {gap.capUsed}/{gap.capTotal}
              </span>
              <i
                className={gap.capUsed > gap.capTotal ? 'over' : ''}
                style={{ width: `${Math.min(100, (gap.capUsed / Math.max(1, gap.capTotal)) * 100)}%` }}
              />
            </div>
            <div className="factory-row">
              {Array.from({ length: state.slots }, (_, i) => (
                <div key={i} className={i < state.machines ? 'machine on' : 'machine'}>
                  {i < state.machines ? '机' : '空'}
                </div>
              ))}
              <div className="workers">
                {Array.from({ length: state.staff.production }, (_, i) => (
                  <i key={i} className={i < state.machines * 4 ? 'pawn' : 'pawn overflow'} />
                ))}
              </div>
            </div>
            <div className="piles">
              {visibleMats.map((item) => {
                const need = gap.materialNeed[item.id] ?? 0;
                const have = state.materials[item.id] ?? 0;
                const short = need > have + 1e-9;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={short ? 'pile short' : 'pile'}
                    onClick={() => setSheet('buy')}
                  >
                    <em>{item.name}</em>
                    <b>
                      {have}/{need || 0}
                    </b>
                  </button>
                );
              })}
            </div>
            <p className="hint tight">差什么看料堆和产能条。怎么补，由你选。</p>
          </section>
        )}
      </main>

      {playable && (
        <section className="shop-rail" aria-label="决策卡">
            {!state.shopDrawn ? (
              <button type="button" className="shop-empty" onClick={() => dispatch({ type: 'DRAW_SHOP' })}>
                翻开本月 3 张牌
              </button>
            ) : (
              <div className="shop-track">
                {state.shop.map((card, index) => {
                  const def = cardById(card.defId);
                  return (
                    <article key={card.uid} className="shop-card deal">
                      <b>{def.name}</b>
                      <p>{def.blurb}</p>
                      <button
                        type="button"
                        className="btn tiny"
                        disabled={state.cash < def.cost || state.hand.length >= HAND_LIMIT}
                        onClick={() => dispatch({ type: 'BUY_CARD', index })}
                      >
                        买 {money(def.cost)}
                      </button>
                    </article>
                  );
                })}
                <button
                  type="button"
                  className="shop-refresh"
                  disabled={state.cash < SHOP_REFRESH_COST}
                  onClick={() => dispatch({ type: 'DRAW_SHOP' })}
                >
                  刷新 {money(SHOP_REFRESH_COST)}
                </button>
              </div>
            )}
          </section>
      )}

      {playable && (
        <div className="hand-dock">
          {state.hand.length === 0 && <p className="hint tight">手牌空。接单阶段可买牌，补缺口才能打出。</p>}
          {state.hand.map((card) => {
            const def = cardById(card.defId);
            const on = pickedCard === card.uid;
            return (
              <button
                key={card.uid}
                type="button"
                className={on ? 'hand-card on' : 'hand-card'}
                onClick={() => {
                  if (state.phase !== 'operate') {
                    setPickedCard(on ? null : card.uid);
                    return;
                  }
                  if (!on) {
                    setPickedCard(card.uid);
                    return;
                  }
                  dispatch({ type: 'PLAY_CARD', uid: card.uid });
                  setPickedCard(null);
                }}
              >
                <b>{def.name}</b>
                <small>{def.blurb}</small>
                {state.phase === 'operate' && on && <em>再点打出 · 1 AP</em>}
              </button>
            );
          })}
        </div>
      )}

      {playable && (
        <footer className="thumb-bar">
          {state.phase === 'market' && (
            <button type="button" className="btn" onClick={() => dispatch({ type: 'LOCK_MARKET' })}>
              锁定订单，去补缺口
            </button>
          )}
          {state.phase === 'operate' && (
            <>
              <button type="button" className="btn ghost" onClick={() => setSheet('buy')}>
                采购
              </button>
              <button type="button" className="btn ghost" onClick={() => setSheet('hire')}>
                招聘
              </button>
              <button type="button" className="btn ghost" onClick={() => setSheet('loan')}>
                资金
              </button>
              <button type="button" className="btn ghost" onClick={() => setSheet('more')}>
                更多
              </button>
              <button type="button" className="btn" onClick={() => dispatch({ type: 'SETTLE' })}>
                结算
              </button>
            </>
          )}
        </footer>
      )}

      {state.phase === 'board' && (
        <BoardModal
          state={state}
          onToggle={(id) => dispatch({ type: 'TOGGLE_BOARD_GOAL', id })}
          onConfirm={() => dispatch({ type: 'CONFIRM_BOARD' })}
        />
      )}
      {state.phase === 'news' && (
        <NewsModal state={state} onChoose={(choice) => dispatch({ type: 'ACK_NEWS', choice })} />
      )}
      {state.phase === 'report' && (
        <ReportModal
          state={state}
          skipAnim={reduceMotion}
          onBooks={() => setSheet('books')}
          onNext={() => dispatch({ type: 'NEXT_MONTH' })}
        />
      )}

      {sheet === 'books' && (
        <div className="sheet-overlay" onClick={closeSheet}>
          <div className="bottom-sheet books" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>账本</h3>
              <button type="button" className="btn tiny ghost" onClick={closeSheet}>
                合上
              </button>
            </header>
            <FinancePage state={state} />
          </div>
        </div>
      )}

      {sheet === 'journal' && (
        <div className="sheet-overlay" onClick={closeSheet}>
          <div className="bottom-sheet books" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>日志与成就</h3>
              <button type="button" className="btn tiny ghost" onClick={closeSheet}>
                关闭
              </button>
            </header>
            <JournalPage state={state} />
          </div>
        </div>
      )}

      {sheet === 'hire' && (
        <div className="sheet-overlay" onClick={closeSheet}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>招聘 · {money(HIRE_COST)}</h3>
              <button type="button" className="btn tiny ghost" onClick={closeSheet}>
                关闭
              </button>
            </header>
            <div className="chip-row">
              {ROLES.map((role) => (
                <button
                  key={role}
                  type="button"
                  className={hireRole === role ? 'chip on' : 'chip'}
                  onClick={() => setHireRole(role)}
                >
                  {ROLE_LABEL[role]} {state.staff[role]}
                </button>
              ))}
            </div>
            {hireEffectLines(state, hireRole).map((line) => (
              <p key={line} className="hint">
                {line}
              </p>
            ))}
            <p className="hint">月薪 {money(SALARY[hireRole])} · 本月薪酬 {money(monthlySalary(state.staff))}</p>
            <button
              type="button"
              className="btn"
              disabled={state.phase !== 'operate' || state.ap < 1 || state.cash < HIRE_COST}
              onClick={() => {
                dispatch({ type: 'HIRE', role: hireRole });
                closeSheet();
              }}
            >
              确认入职
            </button>
          </div>
        </div>
      )}

      {sheet === 'buy' && (
        <div className="sheet-overlay" onClick={closeSheet}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>采购原料</h3>
              <button type="button" className="btn tiny ghost" onClick={closeSheet}>
                关闭
              </button>
            </header>
            {visibleMats.map((item) => (
              <div key={item.id} className="buy-row">
                <span>
                  {item.name}
                  <small>
                    库存 {state.materials[item.id]} · {money(state.materialPrices[item.id])}
                    {gap.materialNeed[item.id] ? ` · 履约需 ${gap.materialNeed[item.id]}` : ''}
                  </small>
                </span>
                <div className="chip-row">
                  {QTY.map((qty) => (
                    <button
                      key={qty}
                      type="button"
                      className={(cart[item.id] ?? 0) === qty ? 'chip on' : 'chip'}
                      onClick={() => setCart((prev) => ({ ...prev, [item.id]: prev[item.id] === qty ? 0 : qty }))}
                    >
                      {qty}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button
              type="button"
              className="btn"
              disabled={
                state.phase !== 'operate' ||
                cartItems.length === 0 ||
                (state.month < 7 && state.ap < 1)
              }
              onClick={() => {
                dispatch({ type: 'BUY_MATERIALS', items: cartItems });
                setCart({});
                closeSheet();
              }}
            >
              下单
            </button>
          </div>
        </div>
      )}

      {sheet === 'loan' && (
        <div className="sheet-overlay" onClick={closeSheet}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>资金</h3>
              <button type="button" className="btn tiny ghost" onClick={closeSheet}>
                关闭
              </button>
            </header>
            <p className="hint">
              负债 {money(state.debt)} / 上限 {money(loanLimit(state.machines))} · 月息 {money(monthlyInterest(state.debt))}
            </p>
            <div className="chip-row">
              {LOAN.map((amt) => (
                <button key={amt} type="button" className={loanAmt === amt ? 'chip on' : 'chip'} onClick={() => setLoanAmt(amt)}>
                  {amt}万
                </button>
              ))}
            </div>
            <div className="footer-actions">
              <button
                type="button"
                className="btn"
                disabled={state.phase !== 'operate' || state.ap < 1 || borrowAmt <= 0}
                onClick={() => {
                  dispatch({ type: 'BORROW', amount: borrowAmt });
                  closeSheet();
                }}
              >
                借入 {money(borrowAmt)}
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={repayAmt <= 0}
                onClick={() => {
                  dispatch({ type: 'REPAY', amount: repayAmt });
                  closeSheet();
                }}
              >
                偿还 {money(repayAmt)}
              </button>
            </div>
          </div>
        </div>
      )}

      {sheet === 'more' && (
        <div className="sheet-overlay" onClick={closeSheet}>
          <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
            <header>
              <h3>产线与研发</h3>
              <button type="button" className="btn tiny ghost" onClick={closeSheet}>
                关闭
              </button>
            </header>
            <p className="hint">
              设备 {state.machines}/{state.slots} · 厂区 {state.factories} · 产能 {cap} · 研发 {state.rdProgress}/
              {RD_THRESHOLD}
            </p>
            <div className="footer-actions stacked">
              <button
                type="button"
                className="btn ghost"
                disabled={state.ap < 1 || state.cash < MACHINE_COST || state.machines >= state.slots}
                onClick={() => {
                  dispatch({ type: 'BUY_MACHINE' });
                  closeSheet();
                }}
              >
                买设备 {money(MACHINE_COST)}
              </button>
              <button
                type="button"
                className="btn ghost"
                disabled={state.ap < 1 || state.cash < FACTORY_COST}
                onClick={() => {
                  dispatch({ type: 'EXPAND_FACTORY' });
                  closeSheet();
                }}
              >
                扩建厂区 {money(FACTORY_COST)}
              </button>
            </div>
            <p className="sheet-caption">超产入库</p>
            {state.unlockedProducts.map((id) => {
              const max = maxExtraProduce(state, id);
              const cur = state.extraProduce[id] ?? 0;
              return (
                <div key={id} className="buy-row">
                  <span>{productById(id).name}</span>
                  <div className="chip-row">
                    {EXTRA.map((qty) => (
                      <button
                        key={qty}
                        type="button"
                        className={cur === qty ? 'chip on' : 'chip'}
                        disabled={qty > max && qty !== 0}
                        onClick={() => dispatch({ type: 'SET_EXTRA_PRODUCE', productId: id, qty })}
                      >
                        {qty}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
