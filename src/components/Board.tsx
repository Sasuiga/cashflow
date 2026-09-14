import { useState } from 'react';
import {
  FACTORY_COST,
  HIRE_COST,
  MACHINE_COST,
  MATERIALS,
  PRODUCTS,
  cardById,
} from '../game/data';
import {
  bomCost,
  capacityOf,
  demandOf,
  loanLimit,
  maxProduce,
  monthlySalary,
  netAssetsOf,
  sellPriceOf,
} from '../game/engine';
import { MONTH_NAMES, ROLE_HINT, ROLE_LABEL, money, qty } from '../game/format';
import type { GameAction, GameState, MaterialId, Role } from '../game/types';
import { FinancePage } from './FinancePage';
import { JournalPage } from './JournalPage';

const ROLES: Role[] = ['production', 'management', 'sales', 'rd'];
const QTY = [10, 20, 40];
const LOAN = [2, 4, 8];
type MainPage = 'ops' | 'books' | 'journal';

export function Board({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: (action: GameAction) => void;
}) {
  const [page, setPage] = useState<MainPage>('ops');
  const [material, setMaterial] = useState<MaterialId>('a');
  const [buyQty, setBuyQty] = useState(20);
  const [loanAmt, setLoanAmt] = useState(40);
  const visibleMaterials = MATERIALS.filter((item) => item.id !== 'd' || state.materialDUnlocked);
  const unit = state.materialPrices[material];
  const buyCost = Math.round(unit * buyQty * (1 - state.modifiers.nextBuyDiscount) * 10) / 10;
  const room = Math.max(0, loanLimit(state.machines) - state.debt);
  const acting = state.phase === 'actions';
  const producing = state.phase === 'produce';

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <div className="brand">
            CASHFLOW
            <span>
              {MONTH_NAMES[state.month - 1]} · 第 {state.month}/12 月 · 北港制造
            </span>
          </div>
          <div className="month-track" style={{ margin: '14px 0 0', width: 280 }}>
            {Array.from({ length: 12 }, (_, i) => (
              <div key={i} className={i < state.month ? 'month-pip on' : 'month-pip'} />
            ))}
          </div>
        </div>
        <div className="stats">
          <div className={`stat ${state.cash < 8 ? 'bad' : 'good'}`}>
            <em>现金</em>
            <strong>{money(state.cash)}</strong>
          </div>
          <div className="stat">
            <em>负债</em>
            <strong>{money(state.debt)}</strong>
          </div>
          <div className={`stat ${netAssetsOf(state) < 20 ? 'bad' : 'good'}`}>
            <em>净资产</em>
            <strong>{money(netAssetsOf(state))}</strong>
          </div>
          <div className="stat">
            <em>行动点 {state.ap}/{state.maxAp}</em>
            <div className="ap-row">
              {Array.from({ length: state.maxAp }, (_, i) => (
                <i key={i} className={i < state.ap ? 'ap fill' : 'ap'} />
              ))}
            </div>
          </div>
        </div>
      </header>

      <nav className="tabs" aria-label="主页面">
        <button className={page === 'ops' ? 'tab on' : 'tab'} onClick={() => setPage('ops')}>
          经营
        </button>
        <button className={page === 'books' ? 'tab on' : 'tab'} onClick={() => setPage('books')}>
          财务报表
        </button>
        <button className={page === 'journal' ? 'tab on' : 'tab'} onClick={() => setPage('journal')}>
          日志与成就
        </button>
      </nav>

      {page === 'books' && <FinancePage state={state} />}
      {page === 'journal' && <JournalPage state={state} />}
      {page === 'ops' && (
      <div className="layout">
        <aside className="stack">
          <section className="panel">
            <h3>市场行情</h3>
            {PRODUCTS.filter((item) => state.unlockedProducts.includes(item.id)).map((item) => (
              <div className="row" key={item.id}>
                <span>{item.name}</span>
                <span>
                  {money(state.productPrices[item.id] ?? item.basePrice)} · {demandOf(state, item.id)}
                </span>
              </div>
            ))}
            {state.modifiers.extraCapacity || state.modifiers.extraDemand || state.modifiers.priceBonus || state.modifiers.nextBuyDiscount ? (
              <p className="hint" style={{ marginTop: 12 }}>
                本月修正：产能 {state.modifiers.extraCapacity} · 需求 {state.modifiers.extraDemand} · 售价{' '}
                {Math.round(state.modifiers.priceBonus * 100)}% · 采购折扣 {Math.round(state.modifiers.nextBuyDiscount * 100)}%
              </p>
            ) : (
              <p className="hint" style={{ marginTop: 12 }}>
                价格按 0.1～0.5 跳动，需求按 5 件一档。
              </p>
            )}
          </section>
          <section className="panel">
            <h3>公司盘面</h3>
            <div className="row">
              <span>厂区 / 机位</span>
              <span>
                {state.factories} 座 · {state.machines}/{state.slots}
              </span>
            </div>
            <div className="row">
              <span>本月产能</span>
              <span>{capacityOf(state)}</span>
            </div>
            <div className="row">
              <span>月工资</span>
              <span>{money(monthlySalary(state.staff))}</span>
            </div>
            <div className="row">
              <span>融资上限</span>
              <span>{money(loanLimit(state.machines))}</span>
            </div>
            {ROLES.map((role) => (
              <div className="row" key={role}>
                <span>{ROLE_LABEL[role]}</span>
                <span>{state.staff[role]} 人</span>
              </div>
            ))}
          </section>

          <section className="panel">
            <h3>库存与 BOM</h3>
            {visibleMaterials.map((item) => (
              <div className="row" key={item.id}>
                <span>
                  {item.name} · {money(state.materialPrices[item.id])}
                </span>
                <span>{qty(state.materials[item.id])}</span>
              </div>
            ))}
            <p className="hint" style={{ marginTop: 12 }}>
              低端 2钢+1塑 · 普通 1钢+2塑+1芯 · 高端 1塑+2芯
              {state.unlockedProducts.includes('economy') ? ' · 经济 1钢+1塑' : ''}
              {state.unlockedProducts.includes('special') ? ' · 特种 1塑+1合金' : ''}
            </p>
          </section>
        </aside>

        <main className="stack">
          {acting && (
            <>
              <section className="panel">
                <h3>基本行动 · 各耗 1 AP</h3>
                <div className="action-grid">
                  <button className="action" onClick={() => dispatch({ type: 'BUY_MACHINE' })}>
                    <b>购买设备 · {money(MACHINE_COST)}</b>
                    <small>每台基础产能 10，最多安置 4 名生产工。</small>
                  </button>
                  <button className="action" onClick={() => dispatch({ type: 'EXPAND_FACTORY' })}>
                    <b>扩建厂区 · {money(FACTORY_COST)}</b>
                    <small>新厂区提供 3 个机位，并增加月维护。</small>
                  </button>
                </div>
                <div className="qty-row" style={{ marginTop: 12 }}>
                  {ROLES.map((role) => (
                    <button key={role} className="chip" onClick={() => dispatch({ type: 'HIRE', role })}>
                      招{ROLE_LABEL[role]} {money(HIRE_COST)}
                    </button>
                  ))}
                </div>
                <p className="hint">
                  {ROLES.map((role) => `${ROLE_LABEL[role]}：${ROLE_HINT[role]}`).join(' / ')}
                </p>
              </section>

              <section className="panel">
                <h3>采购与融资</h3>
                <div className="qty-row">
                  {visibleMaterials.map((item) => (
                    <button
                      key={item.id}
                      className={material === item.id ? 'chip on' : 'chip'}
                      onClick={() => setMaterial(item.id)}
                    >
                      {item.name}
                    </button>
                  ))}
                  {QTY.map((n) => (
                    <button key={n} className={buyQty === n ? 'chip on' : 'chip'} onClick={() => setBuyQty(n)}>
                      {n} 件
                    </button>
                  ))}
                  <button className="btn small" onClick={() => dispatch({ type: 'BUY_MATERIAL', material, qty: buyQty })}>
                    采购 {money(buyCost)}
                  </button>
                </div>
                <div className="qty-row" style={{ marginTop: 10 }}>
                  {LOAN.map((n) => (
                    <button key={n} className={loanAmt === n ? 'chip on' : 'chip'} onClick={() => setLoanAmt(n)}>
                      {money(n)}
                    </button>
                  ))}
                  <button className="btn small" onClick={() => dispatch({ type: 'BORROW', amount: Math.min(loanAmt, room) })}>
                    借款（剩余 {money(room)}）
                  </button>
                  <button className="btn small ghost" onClick={() => dispatch({ type: 'REPAY', amount: loanAmt })}>
                    还款
                  </button>
                </div>
              </section>

              <section className="panel">
                <h3>决策卡 {state.cardsUnlocked ? '' : '· 三月或编制满 6 人后解锁'}</h3>
                {state.cardsUnlocked && (
                  <>
                    <div className="footer-actions" style={{ marginTop: 0, justifyContent: 'flex-start' }}>
                      <button className="btn small ghost" disabled={state.shopDrawn} onClick={() => dispatch({ type: 'DRAW_SHOP' })}>
                        {state.shopDrawn ? '本月已翻牌' : '翻开本月卡铺（不耗 AP）'}
                      </button>
                    </div>
                    {state.shop.length > 0 && (
                      <div className="cards" style={{ marginTop: 12 }}>
                        {state.shop.map((card, index) => {
                          const def = cardById(card.defId);
                          return (
                            <article key={card.uid} className="card" style={{ ['--tilt' as string]: `${index - 1}deg` }}>
                              <div className="suit">{ROLE_LABEL[def.suit]}</div>
                              <h4>{def.name}</h4>
                              <p>{def.blurb}</p>
                              <div className="cost">{money(def.cost)}</div>
                              <button className="btn small" style={{ marginTop: 10 }} onClick={() => dispatch({ type: 'BUY_CARD', index })}>
                                选购
                              </button>
                            </article>
                          );
                        })}
                      </div>
                    )}
                    {state.hand.length > 0 && (
                      <div className="hand" style={{ marginTop: 14 }}>
                        {state.hand.map((card) => {
                          const def = cardById(card.defId);
                          return (
                            <article key={card.uid} className="card">
                              <div className="suit">手牌 · {ROLE_LABEL[def.suit]}</div>
                              <h4>{def.name}</h4>
                              <p>{def.blurb}</p>
                              <button className="btn small" style={{ marginTop: 10 }} onClick={() => dispatch({ type: 'PLAY_CARD', uid: card.uid })}>
                                打出 · 1 AP
                              </button>
                            </article>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
                <div className="footer-actions">
                  <button className="btn" onClick={() => dispatch({ type: 'GO_PRODUCE' })}>
                    安排产销
                  </button>
                </div>
              </section>
            </>
          )}

          {producing && (
            <section className="panel">
              <h3>本月只排一种产品</h3>
              <p className="hint">产量取产能与原料的较小值，再与需求取小后售出。剩余成品留在库里。</p>
              <div className="produce-list" style={{ marginTop: 12 }}>
                {PRODUCTS.filter((item) => state.unlockedProducts.includes(item.id)).map((item) => {
                  const can = maxProduce(state, item.id);
                  const demand = demandOf(state, item.id);
                  const price = sellPriceOf(state, item.id);
                  const sold = Math.min(can + (state.finished[item.id] ?? 0), demand);
                  return (
                    <button
                      key={item.id}
                      className={state.selectedProduct === item.id ? 'product on' : 'product'}
                      onClick={() => dispatch({ type: 'SELECT_PRODUCT', id: item.id })}
                    >
                      <b>
                        {item.tier} · {item.name}
                      </b>
                      <div>{item.blurb}</div>
                      <div className="meta">
                        <span>可产 {can}</span>
                        <span>需求 {demand}</span>
                        <span>单价 {money(price)}</span>
                        <span>单件成本 {money(bomCost(state, item.id))}</span>
                        <span>预计收入 {money(sold * price)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="footer-actions">
                <button className="btn" disabled={!state.selectedProduct} onClick={() => dispatch({ type: 'SETTLE' })}>
                  确认并结算本月
                </button>
              </div>
            </section>
          )}

          {!acting && !producing && (
            <section className="panel">
              <h3>本月正在展开</h3>
              <p className="hint">先处理月报与事件。决策台会在事件结束后打开。</p>
            </section>
          )}
        </main>
      </div>
      )}
    </div>
  );
}
