import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  FACTORY_COST,
  FACTORY_UPKEEP,
  HAND_LIMIT,
  HIRE_COST,
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
  arOverdueOf,
  bomBookCost,
  buyCartCost,
  buyLineCost,
  capacityOf,
  creditSaleRateOf,
  finishedMaxAge,
  finishedProvisionOf,
  hireEffectLines,
  isProposalReady,
  loanLimit,
  materialMaxAge,
  materialProvisionOf,
  maxExtraProduce,
  monthlyInterest,
  monthlySalary,
  monthOutlook,
  productionPlan,
  receivablesGross,
  receivablesNet,
  purchaseQtyOptions,
  sellPriceOf,
  spotOf,
  totalStaff,
} from '../game/engine';
import { MONTH_NAMES, ROLE_HINT, ROLE_LABEL, bomLabel, materialName, money, qty, roundMoney, signedMoney } from '../game/format';
import { goalById, q3ProcurementFree } from '../game/board';
import type { DeptId, GameAction, GameState, MaterialId, MonthOrder, Role } from '../game/types';

const ROLES: Role[] = ['production', 'management', 'sales', 'rd'];
const LOAN = [2, 4, 8];
const EXTRA = [0, 2, 4, 6];

type StageId = 'ceo' | 'sales' | 'materials' | 'production' | 'rd' | 'treasury';

const DEPTS: { id: StageId; label: string }[] = [
  { id: 'ceo', label: '经理室' },
  { id: 'sales', label: '销售部' },
  { id: 'materials', label: '采购部' },
  { id: 'production', label: '生产部' },
  { id: 'rd', label: '研发部' },
  { id: 'treasury', label: '财务部' },
];

function stageDone(state: GameState, ids: DeptId[]): string {
  return ids.flatMap((id) => state.deptActs[id] ?? []).join('；');
}

function orderPreview(state: GameState, order: MonthOrder) {
  const price = sellPriceOf(state, order.productId);
  const revenue = roundMoney(order.qty * price);
  const credit = roundMoney(revenue * creditSaleRateOf(state));
  const unitMat = bomBookCost(state, order.productId);
  return {
    price,
    revenue,
    credit,
    cash: roundMoney(revenue - credit),
    stock: state.finished[order.productId] ?? 0,
    unitMat,
    unitGross: roundMoney(price - unitMat),
    gross: roundMoney(revenue - order.qty * unitMat),
  };
}

function Stage({
  id,
  title,
  intro,
  summary,
  done,
  now,
  children,
}: {
  id: StageId;
  title: string;
  intro?: string;
  summary?: string;
  done?: string;
  now?: boolean;
  children: ReactNode;
}) {
  return (
    <section id={`stage-${id}`} className={['dept', now ? 'now' : ''].filter(Boolean).join(' ')}>
      <header className="dept-head">
        <div>
          <h3>{title}</h3>
          {intro ? <p className="dept-intro">{intro}</p> : null}
          {summary ? <p className="dept-done">{summary}</p> : null}
          {done ? <p className="dept-done">{done}</p> : null}
        </div>
      </header>
      <div className="dept-body">{children}</div>
    </section>
  );
}

function Facts({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div className="dept-block">
      {title ? <p className="dept-kicker">{title}</p> : null}
      {children}
    </div>
  );
}

function Actions({ children, note }: { children?: ReactNode; note?: string }) {
  return (
    <div className="dept-block">
      {note && <p className="hint">{note}</p>}
      {children}
    </div>
  );
}

function HireBar({
  role,
  disabled,
  onHire,
}: {
  role: Role;
  disabled: boolean;
  onHire: (role: Role) => void;
}) {
  return (
    <div className="hire-action">
      <button className="chip" disabled={disabled} onClick={() => onHire(role)}>
        招聘{ROLE_LABEL[role]}人员
      </button>
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
  const acting = state.phase === 'actions';
  const producing = state.phase === 'produce';
  const arGross = receivablesGross(state);
  const arNet = receivablesNet(state);
  const overdue = arOverdueOf(state);
  const [active, setActive] = useState<StageId>('ceo');
  const touched = useRef(new Set<StageId>());
  const paneRef = useRef<HTMLDivElement>(null);
  const [cart, setCart] = useState<Partial<Record<MaterialId, number>>>({});
  const [loanAmt, setLoanAmt] = useState(4);
  const [hireRole, setHireRole] = useState<Role | null>(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const [pendingAdopt, setPendingAdopt] = useState<number | null>(null);

  const canAct = acting && state.ap > 0;
  const buyApFree = q3ProcurementFree(state.month);
  const canBuy = acting && (canAct || buyApFree);
  const visibleMaterials = MATERIALS.filter((item) => item.id !== 'd' || state.materialDUnlocked);
  const cartItems = visibleMaterials
    .map((item) => ({ material: item.id, qty: Math.min(cart[item.id] ?? 0, spotOf(state, item.id)) }))
    .filter((line) => line.qty > 0);
  const cartTotal = buyCartCost(state, cartItems);
  const cartOk = cartItems.length > 0 && state.cash >= cartTotal;
  const room = Math.max(0, loanLimit(state.machines) - state.debt);
  const borrowAmt = Math.min(loanAmt, room);
  const repayAmt = Math.min(loanAmt, state.debt, Math.max(0, state.cash));
  const currentInterest = monthlyInterest(state.debt);
  const afterBorrowInterest = monthlyInterest(state.debt + borrowAmt);
  const extraInterest = roundMoney(afterBorrowInterest - currentInterest);
  const afterRepayInterest = monthlyInterest(roundMoney(state.debt - repayAmt));
  const savedInterest = roundMoney(currentInterest - afterRepayInterest);
  const canBorrow = canAct && borrowAmt > 0;
  const canRepay = acting && repayAmt > 0;
  const nextUnlock = RD_UNLOCKS[state.rdUnlockIndex];
  const nextProduct = nextUnlock?.product ? productById(nextUnlock.product) : null;
  const waitPoints = Math.max(0, RD_THRESHOLD - state.rdProgress);
  const products = PRODUCTS.filter((item) => state.unlockedProducts.includes(item.id));
  const cardWeights = ROLES.map((role) => ({
    role,
    weight: 1 + state.staff[role] * 0.85,
  }));
  const cardWeightTotal = cardWeights.reduce((sum, item) => sum + item.weight, 0);
  const showAgeCols = visibleMaterials.some((item) => {
    if (state.materials[item.id] <= 0) return false;
    return materialMaxAge(state, item.id) >= 2 || materialProvisionOf(state, item.id) > 0;
  });
  const lots = state.receivables ?? [];

  const selectDept = (id: StageId) => {
    touched.current.add(id);
    setActive(id);
  };

  useEffect(() => {
    paneRef.current?.scrollTo({ top: 0 });
    setPendingAdopt(null);
  }, [active]);

  useEffect(() => {
    if (producing && !touched.current.has('production')) {
      setActive('production');
    }
  }, [producing]);

  const basicGoal = state.basicGoalId ? goalById(state.basicGoalId) : null;
  const challengeGoals = (state.challengeGoalIds ?? []).map((id) => goalById(id));
  const materialSummary = visibleMaterials
    .map((item) => `${item.name}库${qty(state.materials[item.id])} / 现货${spotOf(state, item.id)}`)
    .join(' · ') || '本月暂无原料现货';
  const orders = state.monthOrders ?? [];
  const accepted = state.acceptedOrderIds ?? [];
  const plan = productionPlan(state);
  const acceptedOrders = orders.filter((order) => accepted.includes(order.id));
  const acceptedViews = acceptedOrders.map((order) => ({
    order,
    item: productById(order.productId),
    view: orderPreview(state, order),
  }));
  const extraLines = products
    .map((item) => ({ item, qty: state.extraProduce?.[item.id] ?? 0 }))
    .filter((line) => line.qty > 0);
  const settleRevenue = acceptedViews.reduce((sum, line) => sum + line.view.revenue, 0);
  const settleGross = acceptedViews.reduce((sum, line) => sum + line.view.gross, 0);
  const settleQty = acceptedViews.reduce((sum, line) => sum + line.order.qty, 0);
  const skippedPenalty = orders
    .filter((order) => order.kind === 'contract' && !accepted.includes(order.id))
    .reduce((sum, order) => sum + (order.penalty ?? 0), 0);
  const cartSummary =
    cartItems.length > 0
      ? cartItems.map((line) => `${materialName(line.material)}${line.qty}件`).join('、')
      : '';
  const workersMax = state.machines * WORKERS_PER_MACHINE;
  const workerOverflow = Math.max(0, state.staff.production - workersMax);

  const briefing = (
    <aside className="exec-summary">
      {basicGoal && (
        <div className="exec-goal basic">
          <b>基本目标 · {basicGoal.name}</b>
          <p>{basicGoal.progress(state)}</p>
        </div>
      )}
      {challengeGoals.map((goal) => (
        <div key={goal.id} className="exec-goal challenge">
          <b>挑战目标 · {goal.name}</b>
          <p>{goal.progress(state)}</p>
        </div>
      ))}
      <div className="exec-outlook">
        <b>本月产销</b>
        <p>{monthOutlook(state)}</p>
      </div>
    </aside>
  );

  return (
    <div className="ops">
      <div className="dept-stage" ref={paneRef}>
        {active === 'ceo' && (
        <Stage id="ceo" title="经理室" done={stageDone(state, ['ceo'])}>
          {briefing}
          <Facts>
            <div className="sheet-wrap">
              <table className="sheet dark staff-sheet">
                <thead>
                  <tr>
                    <th>部门</th>
                    <th className="num">人数</th>
                    <th className="num">月薪小计</th>
                    <th className="num">提案倾向</th>
                  </tr>
                </thead>
                <tbody>
                  {cardWeights.map((item) => (
                    <tr key={item.role}>
                      <td>{ROLE_LABEL[item.role]}</td>
                      <td className="num">{state.staff[item.role]} 人</td>
                      <td className="num">{money(state.staff[item.role] * SALARY[item.role])}</td>
                      <td className="num">{Math.round((item.weight / cardWeightTotal) * 100)}%</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td>合计</td>
                    <td className="num">{totalStaff(state.staff)} 人</td>
                    <td className="num">{money(monthlySalary(state.staff))}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Facts>
          <div className="dept-block">
            <p className="dept-kicker">本月提案</p>
            <p className="hint">
              {acting
                ? pendingAdopt !== null
                  ? `待执行已满（${HAND_LIMIT}）。点选一份换下，或取消。`
                  : '每月可免费立项一份，次月才能落地。落地耗 1 AP 并支付费用。不立项也完全合法。'
                : '事件结束后才能立项和落地。编制决定本月会出现哪类提案。'}
            </p>
            {state.shop.length > 0 ? (
              <div className="cards" style={{ marginTop: 12 }}>
                {state.shop.map((card, index) => {
                  const def = cardById(card.defId);
                  const adopted = (state.cardsBoughtThisMonth ?? 0) >= 1;
                  const picking = pendingAdopt === index;
                  return (
                    <article
                      key={card.uid}
                      className={['card', picking ? 'picking' : ''].filter(Boolean).join(' ')}
                      style={{ ['--tilt' as string]: `${index - 1}deg` }}
                    >
                      <div className="suit">{ROLE_LABEL[def.suit]}类提案</div>
                      <h4>{def.name}</h4>
                      <p>{def.blurb}</p>
                      <div className="cost">
                        落地 {money(def.cost)} · 1 AP
                      </div>
                      {acting ? (
                        adopted ? (
                          <div className="cost">本月已立项</div>
                        ) : picking ? (
                          <button className="btn small ghost" style={{ marginTop: 10 }} onClick={() => setPendingAdopt(null)}>
                            取消替换
                          </button>
                        ) : (
                          <button
                            className="btn small"
                            style={{ marginTop: 10 }}
                            onClick={() => {
                              if (state.hand.length >= HAND_LIMIT) {
                                setPendingAdopt(index);
                                return;
                              }
                              dispatch({ type: 'BUY_CARD', index });
                            }}
                          >
                            立项「{def.name}」
                          </button>
                        )
                      ) : (
                        <div className="cost">行动阶段可立项</div>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="hint" style={{ marginTop: 12 }}>
                {state.phase === 'board' ? '确认本季目标后出示本月提案。' : '本月没有新的提案。'}
              </p>
            )}
            <p className="dept-kicker" style={{ marginTop: 18 }}>
              待执行
            </p>
            {state.hand.length > 0 ? (
              <div className="hand" style={{ marginTop: 12 }}>
                {state.hand.map((card) => {
                  const def = cardById(card.defId);
                  const ready = isProposalReady(card, state.month);
                  const replacing = pendingAdopt !== null;
                  return (
                    <article key={card.uid} className={['card', replacing ? 'picking' : ''].filter(Boolean).join(' ')}>
                      <div className="suit">
                        待执行 · {ROLE_LABEL[def.suit]}
                        {ready ? '' : ' · 下月可落地'}
                      </div>
                      <h4>{def.name}</h4>
                      <p>{def.blurb}</p>
                      <div className="cost">
                        落地 {money(def.cost)} · 1 AP
                      </div>
                      {replacing ? (
                        <button
                          className="btn small"
                          style={{ marginTop: 10 }}
                          onClick={() => {
                            if (pendingAdopt === null) return;
                            dispatch({ type: 'BUY_CARD', index: pendingAdopt, replaceUid: card.uid });
                            setPendingAdopt(null);
                          }}
                        >
                          换下这份
                        </button>
                      ) : acting ? (
                        ready ? (
                          <button
                            className="btn small"
                            style={{ marginTop: 10 }}
                            disabled={!canAct || state.cash < def.cost}
                            onClick={() => dispatch({ type: 'PLAY_CARD', uid: card.uid })}
                          >
                            落地「{def.name}」 · 耗 1 AP · 付现 {money(def.cost)}
                          </button>
                        ) : (
                          <div className="cost">下月才能落地</div>
                        )
                      ) : (
                        <div className="cost">{ready ? '行动阶段可落地' : '下月才能落地'}</div>
                      )}
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="hint" style={{ marginTop: 8 }}>
                还没有立项。每月从上面选一份即可。
              </p>
            )}
          </div>
          <HireBar role="management" disabled={!canAct} onHire={setHireRole} />
        </Stage>
        )}

        {active === 'sales' && (
        <Stage
          id="sales"
          title="销售部"
          intro="走量单件数大、占产能、现销好看；高端单毛利厚，但芯片现货紧，当月往往买不齐。整张交得出才接，接单不耗行动点。"
          summary={
            orders.length
              ? `已接 ${accepted.length}/${orders.length} 张 · 销售 ${state.staff.sales} 人`
              : `销售 ${state.staff.sales} 人 · 本月订单尚未开出`
          }
          done={stageDone(state, ['sales'])}
          now={producing || acting}
        >
          <Actions>
            {orders.length > 0 && (
              <div className="produce-list">
                {orders.map((order) => {
                  const view = orderPreview(state, order);
                  const on = accepted.includes(order.id);
                  const trial = productionPlan(state, on ? accepted : [...accepted, order.id], state.extraProduce ?? {});
                  const can = on || trial.ok;
                  const item = productById(order.productId);
                  return (
                    <button
                      key={order.id}
                      className={['product', on ? 'on' : '', !can ? 'locked' : '', order.kind === 'contract' ? 'contract' : '']
                        .filter(Boolean)
                        .join(' ')}
                      disabled={(!acting && !producing) || (!can && !on)}
                      onClick={() => dispatch({ type: 'TOGGLE_ORDER', id: order.id })}
                    >
                      <b>
                        {order.kind === 'contract' ? '合同 · ' : ''}
                        {item.tier} · {item.name} {order.qty} 件
                      </b>
                      <div>{item.blurb}</div>
                      <div className="meta">
                        <span>库存 {view.stock}</span>
                        <span>单价 {money(view.price)}</span>
                        <span>单件料本 {money(view.unitMat)}</span>
                        <span>单件毛利 {money(view.unitGross)}</span>
                        <span>毛利 {money(view.gross)}</span>
                        <span>占产能 {order.qty}</span>
                        <span>营业收入 {money(view.revenue)}</span>
                        <span>现销 {money(view.cash)}</span>
                        <span>赊销 {money(view.credit)}</span>
                        <span>{on ? '已接' : can ? '可接' : trial.missing.join('，') || '交不出'}</span>
                        {order.kind === 'contract' && !on ? <span>不接扣 {money(order.penalty)} 违约金</span> : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </Actions>
          <HireBar role="sales" disabled={!canAct} onHire={setHireRole} />
        </Stage>
        )}

        {active === 'materials' && (
        <Stage
          id="materials"
          title="采购部"
          intro="本月现货额度随机，料越高级越紧，月末作废不结转。想接高端单，得提前备货。"
          summary={materialSummary}
          done={stageDone(state, ['store'])}
          now={acting}
        >
          <Facts>
            <div className="sheet-wrap">
              <table className="sheet dark cart-sheet">
                <thead>
                  <tr>
                    <th>原料</th>
                    <th className="num">库存</th>
                    <th className="num">本月现货</th>
                    <th className="num">报价</th>
                    <th className="num">账面成本</th>
                    {showAgeCols && <th className="num">最长库龄</th>}
                    {showAgeCols && <th className="num">跌价准备</th>}
                    <th className="num">本次采购</th>
                    <th className="num">付现</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleMaterials.map((item) => {
                    const age = materialMaxAge(state, item.id);
                    const remaining = spotOf(state, item.id);
                    const pick = Math.min(cart[item.id] ?? 0, remaining);
                    const line = buyLineCost(state, item.id, pick);
                    const steps = purchaseQtyOptions(remaining);
                    return (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td className="num">{qty(state.materials[item.id])}</td>
                        <td className="num">{remaining > 0 ? qty(remaining) : '售罄'}</td>
                        <td className="num">{money(state.materialPrices[item.id])} / 件</td>
                        <td className="num">{money(state.materialCost?.[item.id] ?? 0)}</td>
                        {showAgeCols && (
                          <td className="num">{state.materials[item.id] > 0 ? `${age} 个月` : '—'}</td>
                        )}
                        {showAgeCols && <td className="num">{money(materialProvisionOf(state, item.id))}</td>}
                        <td className="num">
                          <span className="cart-qty">
                            <button
                              type="button"
                              className={pick === 0 ? 'chip on' : 'chip'}
                              disabled={!acting}
                              onClick={() => setCart((prev) => ({ ...prev, [item.id]: 0 }))}
                            >
                              0
                            </button>
                            {steps.map((n) => (
                              <button
                                key={n}
                                type="button"
                                className={pick === n ? 'chip on' : 'chip'}
                                disabled={!acting}
                                onClick={() => setCart((prev) => ({ ...prev, [item.id]: n }))}
                              >
                                {n}
                              </button>
                            ))}
                          </span>
                        </td>
                        <td className="num">{pick > 0 ? money(line) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {state.modifiers.nextBuyDiscount > 0 && (
              <p className="hint" style={{ marginTop: 8 }}>
                本单集采折扣 {Math.round(state.modifiers.nextBuyDiscount * 100)}%。
              </p>
            )}
          </Facts>
          <Actions
            note={
              acting
                ? buyApFree
                  ? '第三、四季度采购不耗行动点，仍要付现。本月没买完的额度月底作废。'
                  : '本月没买完的额度月底作废，高级料更宜提前备货。'
                : '事件结束后才能采购。'
            }
          >
            <div className="footer-actions" style={{ justifyContent: 'flex-start' }}>
              <button
                className="btn small"
                disabled={!canBuy || !cartOk}
                onClick={() => {
                  dispatch({ type: 'BUY_MATERIALS', items: cartItems });
                  setCart({});
                }}
              >
                {cartItems.length === 0
                  ? `确认采购 · ${buyApFree ? '不耗 AP' : '耗 1 AP'}`
                  : `确认采购 ${cartSummary} · 付现 ${money(cartTotal)} · ${buyApFree ? '不耗 AP' : '耗 1 AP'}`}
              </button>
            </div>
            {cartItems.length > 0 && state.cash < cartTotal && <p className="hint">现金不够支付本单。</p>}
          </Actions>
        </Stage>
        )}

        {active === 'production' && (
        <Stage
          id="production"
          title="生产部"
          intro="厂区、设备和生产工决定产能。有余量可以超产入库。"
          summary={`产能 ${capacityOf(state)} · 设备 ${state.machines} 台 · 生产工 ${state.staff.production} 人`}
          done={stageDone(state, ['infra'])}
          now={producing}
        >
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
                {capacityOf(state)}（设备 {state.machines}×{MACHINE_BASE_CAP}，生产工最多 {workersMax} 人上线
                {workerOverflow ? `，超编 ${workerOverflow}` : ''}）
              </span>
            </div>
            <div className="row">
              <span>厂区月维护</span>
              <span>{money(state.factories * FACTORY_UPKEEP)}</span>
            </div>
            <div className="row">
              <span>生产工</span>
              <span>{state.staff.production} 人</span>
            </div>
            <div className="row">
              <span>产能占用</span>
              <span>
                {plan.capUsed} / {plan.capTotal}
                {plan.missing.length ? ` · ${plan.missing.join('，')}` : ''}
              </span>
            </div>
            {products.some((item) => (state.finished[item.id] ?? 0) > 0) &&
              products
                .filter((item) => (state.finished[item.id] ?? 0) > 0)
                .map((item) => (
                  <div className="row" key={item.id}>
                    <span>成品 · {item.name}</span>
                    <span>
                      {qty(state.finished[item.id] ?? 0)} · 账面 {money(state.finishedCost?.[item.id] ?? 0)}
                      {finishedMaxAge(state, item.id) >= 2 ? ` · 库龄 ${finishedMaxAge(state, item.id)} 个月` : ''}
                      {finishedProvisionOf(state, item.id) > 0
                        ? ` · 跌价 ${money(finishedProvisionOf(state, item.id))}`
                        : ''}
                    </span>
                  </div>
                ))}
          </Facts>
          <Actions note={acting ? undefined : producing ? undefined : '事件结束后才能改编制和产线。'}>
            <div className="action-grid">
              <button className="action" disabled={!canAct} onClick={() => dispatch({ type: 'BUY_MACHINE' })}>
                <b>购买设备 1台 · 耗 1 AP · 付现 {money(MACHINE_COST)}</b>
                <small>基础产能 +{MACHINE_BASE_CAP}，最多安置 {WORKERS_PER_MACHINE} 名生产工。</small>
              </button>
              <button className="action" disabled={!canAct} onClick={() => dispatch({ type: 'EXPAND_FACTORY' })}>
                <b>扩建厂区 1座 · 耗 1 AP · 付现 {money(FACTORY_COST)}</b>
                <small>机位 +3，月维护 +{money(FACTORY_UPKEEP)}。</small>
              </button>
            </div>
            {(acting || producing) && products.length > 0 && (
              <div className="dept-block" style={{ paddingTop: 12 }}>
                <p className="dept-kicker">超产入库</p>
                {products.map((item) => {
                  const extra = state.extraProduce?.[item.id] ?? 0;
                  const max = maxExtraProduce(state, item.id);
                  return (
                    <div key={item.id} className="row" style={{ marginTop: 8 }}>
                      <span>
                        {item.name}
                        {extra > 0 ? ` · 已排 ${extra}` : ''}
                      </span>
                      <span className="qty-row" style={{ margin: 0 }}>
                        {EXTRA.map((n) => (
                          <button
                            key={n}
                            className={extra === n ? 'chip on' : 'chip'}
                            disabled={n > 0 && n > Math.max(extra, max)}
                            onClick={() => dispatch({ type: 'SET_EXTRA_PRODUCE', productId: item.id, qty: n })}
                          >
                            {n === 0 ? '不超产' : `+${n}`}
                          </button>
                        ))}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {producing && (
              <div className="footer-actions">
                <button className="btn small ghost" onClick={() => dispatch({ type: 'BACK_TO_ACTIONS' })}>
                  取消排产，返回经营
                </button>
                <button className="btn" disabled={!plan.ok} onClick={() => setSettleOpen(true)}>
                  确认接单并结算 · 不耗 AP
                </button>
              </div>
            )}
          </Actions>
          <HireBar role="production" disabled={!canAct} onHire={setHireRole} />
        </Stage>
        )}

        {active === 'rd' && (
        <Stage
          id="rd"
          title="研发部"
          intro="先看已有 BOM 和人手，再看项目进度。"
          summary={`${state.rdProgress} / ${RD_THRESHOLD} · ${state.staff.rd} 人`}
          done={stageDone(state, ['rd'])}
        >
          <Facts>
            <div className="sheet-wrap">
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
                      <td className="num">{money(bomBookCost(state, item.id))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <span>研发人员</span>
              <span>{state.staff.rd} 人</span>
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
                ? '实验室无人，本月结算不推进研发。'
                : nextProduct
                  ? `下一档：${nextProduct.name}。还需 ${waitPoints} 点，按现有人手约 ${Math.ceil(waitPoints / state.staff.rd)} 个月。`
                  : nextUnlock?.unlockD
                    ? '下一档将开特种合金线。'
                    : '量产项目已经做完，团队在做工艺微调。'}
            </p>
          </Facts>
          <HireBar role="rd" disabled={!canAct} onHire={setHireRole} />
        </Stage>
        )}

        {active === 'treasury' && (
        <Stage
          id="treasury"
          title="财务部"
          intro="现金不够时借款，有余钱再还。赊销尚未收回的部分，记在应收账款。"
          summary={
            [
              state.debt > 0
                ? `借款 ${money(state.debt)} · 利息 ${money(currentInterest)}/月 · 还可借 ${money(room)}`
                : `无借款 · 设备抵押额度 ${money(loanLimit(state.machines))}`,
              arGross > 0 ? `应收 ${money(arNet)}${overdue > 0 ? ` · 逾期 ${money(overdue)}` : ''}` : '本月还没有应收',
            ].join(' · ')
          }
          done={stageDone(state, ['finance'])}
          now={state.debt > 0 || arGross > 0}
        >
          <Facts title="借款">
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
            {currentInterest > 0 && (
              <div className="row">
                <span>预计本月利息</span>
                <span>{money(currentInterest)}</span>
              </div>
            )}
          </Facts>
          <Actions note={acting ? undefined : '资金调度要等事件结束后才能做。'}>
            <div className="qty-row">
              {LOAN.map((n) => (
                <button key={n} className={loanAmt === n ? 'chip on' : 'chip'} onClick={() => setLoanAmt(n)}>
                  {money(n)}
                </button>
              ))}
            </div>
            <div className="qty-row loan-actions" style={{ marginTop: 8 }}>
              <button className="btn small" disabled={!canBorrow} onClick={() => dispatch({ type: 'BORROW', amount: borrowAmt })}>
                {`借入 ${money(borrowAmt)} · 耗 1 AP${
                  extraInterest > 0
                    ? ` · 财务费用 ${signedMoney(extraInterest)}/月${currentInterest > 0 ? `（合计 ${money(afterBorrowInterest)}）` : ''}`
                    : ''
                }`}
              </button>
              <button className="btn small ghost" disabled={!canRepay} onClick={() => dispatch({ type: 'REPAY', amount: repayAmt })}>
                {`偿还 ${money(repayAmt > 0 ? repayAmt : loanAmt)} · 不耗 AP${
                  savedInterest > 0 ? ` · 财务费用 ${signedMoney(-savedInterest)}/月` : ''
                }`}
              </button>
            </div>
          </Actions>
          <Facts title="货款">
            <div className="row">
              <span>应收账款</span>
              <span>
                账面 {money(arNet)}
                {(state.badDebtProvision ?? 0) > 0 ? `（已提坏账 ${money(state.badDebtProvision)}）` : ''}
              </span>
            </div>
            {overdue > 0 && (
              <div className="row">
                <span>其中逾期</span>
                <span>{money(overdue)}</span>
              </div>
            )}
            {lots.length > 0 && (
              <div className="sheet-wrap" style={{ marginTop: 12 }}>
                <table className="sheet dark">
                  <thead>
                    <tr>
                      <th>发生月</th>
                      <th className="num">到期月</th>
                      <th className="num">金额</th>
                      <th className="num">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lots.map((lot, index) => {
                      const past = state.month - lot.dueMonth;
                      const status =
                        past < 0
                          ? `${lot.dueMonth - state.month} 个月后到期`
                          : past === 0
                            ? '本月到期'
                            : `逾期 ${past} 个月`;
                      return (
                        <tr key={`${lot.originMonth}-${lot.dueMonth}-${index}`}>
                          <td>{MONTH_NAMES[lot.originMonth - 1] ?? `${lot.originMonth}月`}</td>
                          <td className="num">{MONTH_NAMES[lot.dueMonth - 1] ?? `${lot.dueMonth}月`}</td>
                          <td className="num">{money(lot.amount)}</td>
                          <td className="num">{status}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Facts>
        </Stage>
        )}
      </div>

      <nav className="flow-rail" role="navigation" aria-label="经营分区">
        {DEPTS.map((dept) => (
          <button
            key={dept.id}
            type="button"
            className={active === dept.id ? 'on' : undefined}
            onClick={() => selectDept(dept.id)}
          >
            {dept.label}
          </button>
        ))}
        <button
          type="button"
          className="settle-nav"
          disabled={!acting && !producing}
          onClick={() => setSettleOpen(true)}
        >
          排产结算
        </button>
      </nav>

      {hireRole && (
        <div className="overlay hire-overlay" onClick={() => setHireRole(null)}>
          <div className="modal hire-modal" onClick={(event) => event.stopPropagation()}>
            <p className="kicker" style={{ color: '#8a7040' }}>
              编制
            </p>
            <h2>招聘{ROLE_LABEL[hireRole]} 1 人</h2>
            <p className="lead">{ROLE_HINT[hireRole]}</p>
            <ul className="hire-points">
              {hireEffectLines(state, hireRole).map((line) => (
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

      {settleOpen && (
        <div className="overlay hire-overlay" onClick={() => setSettleOpen(false)}>
          <div className="modal settle-modal" onClick={(event) => event.stopPropagation()}>
            <p className="kicker" style={{ color: '#8a7040' }}>
              本月排产
            </p>
            <h2>确认结算</h2>
            <p className="lead">核对已接订单和订单外生产后再入账。取消可继续调整。</p>
            <p className="sheet-caption">已排产订单</p>
            {acceptedViews.length === 0 ? (
              <p className="settle-empty">本月未接订单，结算后无销售收入。</p>
            ) : (
              <div className="sheet-wrap">
                <table className="sheet compact">
                  <thead>
                    <tr>
                      <th>产品类型</th>
                      <th className="num">数量</th>
                      <th className="num">收入</th>
                      <th className="num">毛利</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acceptedViews.map(({ order, item, view }) => (
                      <tr key={order.id}>
                        <td>
                          {item.tier} · {item.name}
                          {order.kind === 'contract' ? '（合同）' : ''}
                        </td>
                        <td className="num">{qty(order.qty)}</td>
                        <td className="num">{money(view.revenue)}</td>
                        <td className="num">{money(view.gross)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td>合计</td>
                      <td className="num">{qty(settleQty)}</td>
                      <td className="num">{money(settleRevenue)}</td>
                      <td className="num">{money(settleGross)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
            <p className="sheet-caption">订单外生产</p>
            {extraLines.length === 0 ? (
              <p className="settle-empty">本月无订单外生产。</p>
            ) : (
              <div className="sheet-wrap">
                <table className="sheet compact">
                  <thead>
                    <tr>
                      <th>类型</th>
                      <th className="num">数量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extraLines.map((line) => (
                      <tr key={line.item.id}>
                        <td>
                          {line.item.tier} · {line.item.name}
                        </td>
                        <td className="num">{qty(line.qty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {skippedPenalty > 0 && (
              <p className="settle-empty">未接合同将在结算时扣违约金 {money(skippedPenalty)}。</p>
            )}
            {!plan.ok && (
              <p className="hint settle-warn">当前排产无法交付：{plan.missing.join('，') || '产能或原料不足'}</p>
            )}
            <div className="footer-actions">
              <button className="btn ghost" onClick={() => setSettleOpen(false)}>
                取消
              </button>
              <button
                className="btn"
                disabled={!plan.ok}
                onClick={() => {
                  dispatch({ type: 'SETTLE' });
                  setSettleOpen(false);
                }}
              >
                确认结算
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
