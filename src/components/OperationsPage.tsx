import { useState, type ReactNode } from 'react';
import {
  FACTORY_COST,
  HAND_LIMIT,
  FACTORY_UPKEEP,
  HIRE_COST,
  INTEREST_RATE,
  MACHINE_BASE_CAP,
  MACHINE_COST,
  MATERIALS,
  PRODUCTS,
  RD_THRESHOLD,
  RD_UNLOCKS,
  SALARY,
  WORKERS_PER_MACHINE,
  cardById,
  productById,
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
  totalStaff,
} from '../game/engine';
import { ROLE_DETAIL, ROLE_HINT, ROLE_LABEL, bomLabel, materialName, money, qty } from '../game/format';
import type { DeptId, GameAction, GameState, MaterialId, Role } from '../game/types';

const ROLES: Role[] = ['production', 'management', 'sales', 'rd'];
const QTY = [10, 20, 40];
const LOAN = [2, 4, 8];

function deptDone(state: GameState, id: DeptId): string {
  const lines = state.deptActs[id] ?? [];
  return lines.length > 0 ? lines.join('；') : '本月尚未行动。';
}

function Dept({
  title,
  intro,
  done,
  open,
  onToggle,
  wide,
  children,
}: {
  title: string;
  intro: string;
  done: string;
  open: boolean;
  onToggle: () => void;
  wide?: boolean;
  children: ReactNode;
}) {
  const idle = done === '本月尚未行动。';
  return (
    <section className={wide ? 'dept wide' : 'dept'}>
      <button type="button" className="dept-head" onClick={onToggle} aria-expanded={open}>
        <div>
          <h3>{title}</h3>
          <p className="dept-intro">{intro}</p>
          <p className={idle ? 'dept-done idle' : 'dept-done'}>{done}</p>
        </div>
        <span>{open ? '收起' : '展开'}</span>
      </button>
      {open && <div className="dept-body">{children}</div>}
    </section>
  );
}

function Facts({ children, title = '现状' }: { children: ReactNode; title?: string }) {
  return (
    <div className="dept-block">
      <p className="dept-kicker">{title}</p>
      {children}
    </div>
  );
}

function Actions({ children, note }: { children?: ReactNode; note?: string }) {
  return (
    <div className="dept-block">
      <p className="dept-kicker">本月行动</p>
      {note && <p className="hint">{note}</p>}
      {children}
    </div>
  );
}

export function OperationsPage({
  state,
  dispatch,
}: {
  state: GameState;
  dispatch: (action: GameAction) => void;
}) {
  const [open, setOpen] = useState<Record<DeptId, boolean>>(() => {
    const phone = window.matchMedia('(max-width: 720px)').matches;
    return {
      ceo: !phone,
      hr: !phone,
      infra: !phone,
      store: !phone,
      sales: !phone,
      rd: !phone,
      finance: !phone,
    };
  });
  const [material, setMaterial] = useState<MaterialId>('a');
  const [buyQty, setBuyQty] = useState(20);
  const [loanAmt, setLoanAmt] = useState(4);
  const [hireRole, setHireRole] = useState<Role | null>(null);

  const acting = state.phase === 'actions';
  const producing = state.phase === 'produce';
  const canAct = acting && state.ap > 0;
  const visibleMaterials = MATERIALS.filter((item) => item.id !== 'd' || state.materialDUnlocked);
  const unit = state.materialPrices[material] ?? 0;
  const buyCost = Math.round(unit * buyQty * (1 - state.modifiers.nextBuyDiscount) * 10) / 10;
  const room = Math.max(0, loanLimit(state.machines) - state.debt);
  const nextUnlock = RD_UNLOCKS[state.rdUnlockIndex];
  const nextProduct = nextUnlock?.product ? productById(nextUnlock.product) : null;
  const waitPoints = Math.max(0, RD_THRESHOLD - state.rdProgress);
  const products = PRODUCTS.filter((item) => state.unlockedProducts.includes(item.id));
  const cardWeights = ROLES.map((role) => ({
    role,
    weight: 1 + state.staff[role] * 0.85,
  }));
  const cardWeightTotal = cardWeights.reduce((sum, item) => sum + item.weight, 0);

  const toggle = (id: DeptId) => setOpen((prev) => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className="ops">
      <p className="ops-lead">
        每个部门先看现状，再决定要不要做事。带「耗 1 AP」的按钮会花掉行动点；销售部的产销安排不耗行动点。
      </p>

      <div className="dept-grid">
        <Dept title="总经理室" intro="翻牌、买牌、打牌，用决策卡影响当月经营。" done={deptDone(state, 'ceo')} open={open.ceo} onToggle={() => toggle('ceo')} wide>
          <Facts>
            <div className="row">
              <span>剩余行动点</span>
              <span>
                {state.ap} / {state.maxAp}
              </span>
            </div>
            <div className="row">
              <span>决策卡</span>
              <span>
                {state.cardsUnlocked
                  ? `手牌 ${state.hand.length} / ${HAND_LIMIT}`
                  : '未解锁（三月或编制满 6 人）'}
              </span>
            </div>
            <div className="sheet-wrap" style={{ marginTop: 12 }}>
            <table className="sheet dark">
              <thead>
                <tr>
                  <th>人员结构</th>
                  <th className="num">人数</th>
                  <th className="num">本月卡类倾向</th>
                </tr>
              </thead>
              <tbody>
                {cardWeights.map((item) => (
                  <tr key={item.role}>
                    <td>{ROLE_LABEL[item.role]}</td>
                    <td className="num">{state.staff[item.role]} 人</td>
                    <td className="num">{Math.round((item.weight / cardWeightTotal) * 100)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            <p className="hint" style={{ marginTop: 10 }}>
              某类员工越多，翻开的决策卡越容易出对应花色。加人请去人事部。
            </p>
          </Facts>
          <Actions
            note={
              !state.cardsUnlocked
                ? '决策卡尚未解锁。到了三月，或编制满 6 人后，这里才能翻牌。'
                : acting
                  ? '翻牌、买牌不耗行动点。只有打出手牌耗 1 AP。'
                  : '现在只能看已有的牌。打牌要等行动阶段。'
            }
          >
            {state.cardsUnlocked && acting && (
              <>
                <div className="footer-actions" style={{ marginTop: 0, justifyContent: 'flex-start' }}>
                  <button className="btn small ghost" disabled={state.shopDrawn} onClick={() => dispatch({ type: 'DRAW_SHOP' })}>
                    {state.shopDrawn ? '本月已翻牌' : '翻开本月卡铺 · 不耗 AP'}
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
                          <div className="cost">{money(def.cost)} · 买牌不耗 AP</div>
                          <button className="btn small" style={{ marginTop: 10 }} onClick={() => dispatch({ type: 'BUY_CARD', index })}>
                            买入「{def.name}」 · 不耗 AP · 花费 {money(def.cost)}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                )}
              </>
            )}
            {state.cardsUnlocked && state.hand.length > 0 && (
              <div className="hand" style={{ marginTop: 14 }}>
                {state.hand.map((card) => {
                  const def = cardById(card.defId);
                  return (
                    <article key={card.uid} className="card">
                      <div className="suit">手牌 · {ROLE_LABEL[def.suit]}</div>
                      <h4>{def.name}</h4>
                      <p>{def.blurb}</p>
                      {acting ? (
                        <button className="btn small" disabled={!canAct} style={{ marginTop: 10 }} onClick={() => dispatch({ type: 'PLAY_CARD', uid: card.uid })}>
                          打出「{def.name}」 · 耗 1 AP
                        </button>
                      ) : (
                        <div className="cost">行动阶段才能打出</div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
            {state.cardsUnlocked && state.hand.length === 0 && (
              <p className="hint">手牌是空的。{acting ? '先翻牌再选购。' : '等行动阶段再翻牌。'}</p>
            )}
          </Actions>
        </Dept>

        <Dept title="财务部" intro="借款、还款，调度现金与负债。" done={deptDone(state, 'finance')} open={open.finance} onToggle={() => toggle('finance')} wide>
          <Facts>
            <div className="row">
              <span>货币资金</span>
              <span>{money(state.cash)}</span>
            </div>
            <div className="row">
              <span>短期借款</span>
              <span>{money(state.debt)}</span>
            </div>
            <div className="row">
              <span>设备抵押额度</span>
              <span>
                {money(loanLimit(state.machines))} · 还可借 {money(room)}
              </span>
            </div>
            <div className="row">
              <span>预计本月利息</span>
              <span>{state.debt > 0 ? money(state.debt * INTEREST_RATE) : '无'}</span>
            </div>
            <div className="row">
              <span>净资产</span>
              <span>{money(netAssetsOf(state))}</span>
            </div>
          </Facts>
          <Actions note={acting ? '借款与还款都记入现金流量表筹资活动。' : '资金调度要等事件结束后才能做。'}>
            <div className="qty-row">
              {LOAN.map((n) => (
                <button key={n} className={loanAmt === n ? 'chip on' : 'chip'} onClick={() => setLoanAmt(n)}>
                  {money(n)}
                </button>
              ))}
            </div>
            <div className="qty-row" style={{ marginTop: 8 }}>
              <button className="btn small" disabled={!canAct} onClick={() => dispatch({ type: 'BORROW', amount: Math.min(loanAmt, room) })}>
                借入 {money(Math.min(loanAmt, room))} · 耗 1 AP
              </button>
              <button className="btn small ghost" disabled={!canAct} onClick={() => dispatch({ type: 'REPAY', amount: loanAmt })}>
                偿还 {money(loanAmt)} · 耗 1 AP
              </button>
            </div>
          </Actions>
        </Dept>

        <Dept title="人事部" intro="招聘四类员工，编制影响产能、行动点和卡类。" done={deptDone(state, 'hr')} open={open.hr} onToggle={() => toggle('hr')}>
          <Facts>
            <div className="sheet-wrap">
              <table className="sheet dark staff-sheet">
                <thead>
                  <tr>
                    <th>岗位</th>
                    <th className="num">人数</th>
                    <th className="num">月薪</th>
                    <th className="num">小计</th>
                  </tr>
                </thead>
                <tbody>
                  {ROLES.map((role) => (
                    <tr key={role}>
                      <td>{ROLE_LABEL[role]}</td>
                      <td className="num">{state.staff[role]}</td>
                      <td className="num">{money(SALARY[role])}</td>
                      <td className="num">{money(state.staff[role] * SALARY[role])}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>合计</td>
                    <td className="num">{totalStaff(state.staff)} 人</td>
                    <td />
                    <td className="num">{money(monthlySalary(state.staff))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Facts>
          <Actions note={acting ? '点岗位先看职责和代价，确认后入职。' : '人事令要等事件结束后才能发。'}>
            <div className="qty-row stacked">
              {ROLES.map((role) => (
                <button key={role} className="chip" disabled={!canAct} onClick={() => setHireRole(role)}>
                  招聘{ROLE_LABEL[role]}
                </button>
              ))}
            </div>
          </Actions>
        </Dept>

        <Dept title="基建部" intro="购买设备、扩建厂区，扩大产能。" done={deptDone(state, 'infra')} open={open.infra} onToggle={() => toggle('infra')}>
          <Facts>
            <div className="row">
              <span>厂区 / 机位</span>
              <span>
                {state.factories} 座 · {state.machines}/{state.slots} 台在用
              </span>
            </div>
            <div className="row">
              <span>本月产能</span>
              <span>
                {capacityOf(state)}（设备 {state.machines}×{MACHINE_BASE_CAP}，生产工最多 {state.machines * WORKERS_PER_MACHINE} 人上线）
              </span>
            </div>
            <div className="row">
              <span>厂区月维护</span>
              <span>{money(state.factories * FACTORY_UPKEEP)}</span>
            </div>
          </Facts>
          <Actions note={acting ? '机位满了要先扩厂。' : '基建令要等事件结束后才能发。'}>
            <div className="action-grid">
              <button className="action" disabled={!canAct} onClick={() => dispatch({ type: 'BUY_MACHINE' })}>
                <b>购买设备 1台 · 耗 1 AP · 花费 {money(MACHINE_COST)}</b>
                <small>基础产能 +{MACHINE_BASE_CAP}，最多安置 {WORKERS_PER_MACHINE} 名生产工。</small>
              </button>
              <button className="action" disabled={!canAct} onClick={() => dispatch({ type: 'EXPAND_FACTORY' })}>
                <b>扩建厂区 1座 · 耗 1 AP · 花费 {money(FACTORY_COST)}</b>
                <small>机位 +3，月维护 +{money(FACTORY_UPKEEP)}。</small>
              </button>
            </div>
          </Actions>
        </Dept>

        <Dept title="采购部" intro="按报价采购原料入库。" done={deptDone(state, 'store')} open={open.store} onToggle={() => toggle('store')}>
          <Facts title="库房现状">
            <div className="sheet-wrap">
            <table className="sheet dark">
              <thead>
                <tr>
                  <th>原料</th>
                  <th className="num">库存</th>
                  <th className="num">报价</th>
                  <th className="num">存货金额</th>
                </tr>
              </thead>
              <tbody>
                {visibleMaterials.map((item) => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td className="num">{qty(state.materials[item.id])}</td>
                    <td className="num">{money(state.materialPrices[item.id])} / 件</td>
                    <td className="num">{money(state.materials[item.id] * state.materialPrices[item.id])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {products.some((item) => (state.finished[item.id] ?? 0) > 0) && (
              <div style={{ marginTop: 10 }}>
                {products
                  .filter((item) => (state.finished[item.id] ?? 0) > 0)
                  .map((item) => (
                    <div className="row" key={item.id}>
                      <span>成品库存 · {item.name}</span>
                      <span>{qty(state.finished[item.id] ?? 0)}</span>
                    </div>
                  ))}
              </div>
            )}
          </Facts>
          <Actions note={acting ? '一次采购只买一种原料。有折扣时会写在报价里。' : '采购单要等事件结束后才能下。'}>
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
            </div>
            <div className="footer-actions" style={{ justifyContent: 'flex-start' }}>
              <button className="btn small" disabled={!canAct} onClick={() => dispatch({ type: 'BUY_MATERIAL', material, qty: buyQty })}>
                采购{materialName(material)} {buyQty}件 · 耗 1 AP · 花费 {money(buyCost)}
              </button>
            </div>
          </Actions>
        </Dept>

        <Dept title="研发中心" intro="靠研发人员推进项目，解锁新产品与特种料。" done={deptDone(state, 'rd')} open={open.rd} onToggle={() => toggle('rd')}>
          <Facts>
            <div className="row">
              <span>研发人员</span>
              <span>
                {state.staff.rd} 人 · 结算时推进 {state.staff.rd} 点
              </span>
            </div>
            <div className="row">
              <span>当前项目进度</span>
              <span>
                {state.rdProgress} / {RD_THRESHOLD}
              </span>
            </div>
            <div className="rd-bar" aria-hidden>
              <i style={{ width: `${Math.min(100, (state.rdProgress / RD_THRESHOLD) * 100)}%` }} />
            </div>
            <p className="hint">
              {state.staff.rd <= 0
                ? '实验室无人值守，本月结算不会推进。去人事部招研发。'
                : nextProduct
                  ? `下一档：${nextProduct.name}。还需 ${waitPoints} 点，按现有人手约 ${Math.ceil(waitPoints / state.staff.rd)} 个月。`
                  : nextUnlock?.unlockD
                    ? '下一档将开特种合金线。'
                    : '量产项目已经做完，团队在做工艺微调。'}
            </p>
            <div className="sheet-wrap" style={{ marginTop: 12 }}>
            <table className="sheet dark">
              <thead>
                <tr>
                  <th>已有产品</th>
                  <th>BOM</th>
                  <th className="num">单件料本</th>
                </tr>
              </thead>
              <tbody>
                {products.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.tier} · {item.name}
                    </td>
                    <td>{bomLabel(item.bom)}</td>
                    <td className="num">{money(bomCost(state, item.id))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Facts>
          <Actions note="研发中心本身不耗行动点。加人请去人事部，打研发卡请去总经理室。" />
        </Dept>

        <Dept title="销售部" intro="查看行情，安排本月唯一产品产销。" done={deptDone(state, 'sales')} open={open.sales} onToggle={() => toggle('sales')}>
          <Facts>
            <div className="row">
              <span>销售人员</span>
              <span>
                {state.staff.sales} 人 · {ROLE_HINT.sales}
              </span>
            </div>
            <div className="sheet-wrap">
            <table className="sheet dark">
              <thead>
                <tr>
                  <th>产品</th>
                  <th className="num">市价</th>
                  <th className="num">需求</th>
                  <th className="num">当前可产</th>
                </tr>
              </thead>
              <tbody>
                {products.map((item) => (
                  <tr key={item.id}>
                    <td>
                      {item.tier} · {item.name}
                    </td>
                    <td className="num">{money(sellPriceOf(state, item.id))}</td>
                    <td className="num">{demandOf(state, item.id)}</td>
                    <td className="num">{maxProduce(state, item.id)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Facts>
          <Actions
            note={
              producing
                ? '本月只排一种。产量取产能与原料的较小值，再与需求取小后售出。'
                : acting
                  ? '各部门行动可以随时停。准备出货时，在这里排产，不耗 AP。'
                  : '行情可以先看。排产要等行动阶段结束。'
            }
          >
            {producing && (
              <>
                <div className="produce-list">
                  {products.map((item) => {
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
                    确认排产「{state.selectedProduct ? productById(state.selectedProduct).name : ''}」并结算 · 不耗 AP
                  </button>
                </div>
              </>
            )}
            {acting && (
              <button className="btn small ghost" onClick={() => dispatch({ type: 'GO_PRODUCE' })}>
                现在就去排产 · 不耗 AP
              </button>
            )}
          </Actions>
        </Dept>
      </div>

      {hireRole && (
        <div className="overlay hire-overlay" onClick={() => setHireRole(null)}>
          <div className="modal hire-modal" onClick={(event) => event.stopPropagation()}>
            <p className="kicker" style={{ color: '#8a7040' }}>
              人事令
            </p>
            <h2>招聘{ROLE_LABEL[hireRole]} 1 人</h2>
            <p className="lead">入职后立刻到岗。先看清楚这个岗位做什么，以及要付什么代价。</p>
            <ul className="hire-points">
              {ROLE_DETAIL[hireRole].map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <div className="hire-costs">
              <div>
                <em>招聘费</em>
                <strong>{money(HIRE_COST)}</strong>
                <span>当月现金支付，记入管理费用</span>
              </div>
              <div>
                <em>月薪</em>
                <strong>{money(SALARY[hireRole])}</strong>
                <span>本月计入应付职工薪酬，下月结算时支付</span>
              </div>
              <div>
                <em>行动点</em>
                <strong>1 AP</strong>
                <span>确认后立即消耗</span>
              </div>
            </div>
            {state.cash < HIRE_COST && <p className="hint">现金不够支付招聘费。</p>}
            <div className="footer-actions">
              <button className="btn ghost" onClick={() => setHireRole(null)}>
                取消
              </button>
              <button
                className="btn"
                disabled={state.cash < HIRE_COST || !canAct}
                onClick={() => {
                  dispatch({ type: 'HIRE', role: hireRole });
                  setHireRole(null);
                }}
              >
                确认招聘
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
