import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  CAP_OVERFLOW,
  CAP_PER_WORKER,
  FACTORY_COST,
  FACTORY_LIFE_MONTHS,
  FACTORY_UPKEEP,
  HAND_LIMIT,
  HIRE_COST,
  MACHINE_BASE_CAP,
  MACHINE_COST,
  MACHINE_LIFE_MONTHS,
  MATERIALS,
  IP_CATALOG,
  MAX_RD_PRODUCTS,
  PRODUCT_RD_MONTHS,
  TECH_RD_MONTHS,
  catalogOf,
  SALARY,
  SLOTS_PER_FACTORY,
  WORKERS_PER_MACHINE,
  cardById,
} from '../game/data';
import {
  arOverdueOf,
  bomBookCost,
  bomCost,
  buyCartCost,
  buyLineCost,
  capacityOf,
  creditSaleRateOf,
  availableTechIps,
  canOpenProductRd,
  canPickTechProject,
  currentProductProject,
  currentTechProject,
  factoryLayout,
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
  orderCapLoads,
  productionPlan,
  productOf,
  rdCapacityBonus,
  rdTrackProgress,
  rdTrackRate,
  rdTrackStaff,
  receivablesGross,
  receivablesNet,
  purchaseQtyOptions,
  materialCrateSize,
  sellPriceOf,
  spotOf,
  totalStaff,
} from '../game/engine';
import { MONTH_NAMES, RD_TRACK_LABEL, ROLE_HINT, ROLE_LABEL, bomLabel, factoryName, materialName, money, pctLabel, priceDelta, qty, roundMoney, signedMoney } from '../game/format';
import { goalById, q3ProcurementFree } from '../game/board';
import type { GameAction, GameState, IpId, MaterialId, MonthOrder, ProductDef, ProductId, RdTrack, Role } from '../game/types';

const ROLES: Role[] = ['production', 'management', 'sales', 'rd'];
const LOAN = [2, 4, 8];
const EXTRA = [0, 2, 4, 6];
type PlantKind = 'machine' | 'factory';

type StageId = 'ceo' | 'sales' | 'materials' | 'production' | 'rd' | 'treasury';

const DEPTS: { id: StageId; label: string }[] = [
  { id: 'ceo', label: '经理室' },
  { id: 'sales', label: '销售部' },
  { id: 'materials', label: '采购部' },
  { id: 'production', label: '生产部' },
  { id: 'rd', label: '研发部' },
  { id: 'treasury', label: '财务部' },
];

function Stage({
  id,
  title,
  intro,
  summary,
  now,
  children,
}: {
  id: StageId;
  title: string;
  intro?: string;
  summary?: string;
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
        </div>
      </header>
      <div className="dept-body">{children}</div>
    </section>
  );
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

function orderGapText(state: GameState, plan: ReturnType<typeof productionPlan>) {
  const parts: string[] = [];
  const capGap = Math.max(0, plan.capUsed - plan.capTotal);
  if (capGap > 0) parts.push(`产能 ${capGap}`);
  for (const mat of MATERIALS) {
    const short = (plan.materialNeed[mat.id] ?? 0) - (state.materials[mat.id] ?? 0);
    if (short > 0) parts.push(`${mat.name} ${short}`);
  }
  return parts.length ? `缺口：${parts.join('、')}` : '缺口：无';
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

function RdLabCard({
  state,
  track,
  acting,
  onOpenProduct,
}: {
  state: GameState;
  track: RdTrack;
  acting: boolean;
  onOpenProduct?: () => void;
}) {
  const staff = rdTrackStaff(state, track);
  const progress = rdTrackProgress(state, track);
  const cycle = track === 'product' ? PRODUCT_RD_MONTHS : TECH_RD_MONTHS;
  const rate = rdTrackRate(state, track);
  const product = track === 'product' ? currentProductProject(state) : null;
  const tech = track === 'tech' ? currentTechProject(state) : null;
  const hasProject = Boolean(product || tech);
  const remainProduct = MAX_RD_PRODUCTS - (state.extraProducts?.length ?? 0);
  const remainTech = availableTechIps(state).length;
  const idleName =
    track === 'product'
      ? remainProduct > 0
        ? '未开题'
        : '课题已结'
      : remainTech > 0
        ? '点选工艺开题'
        : '课题已结';
  const idleBlurb =
    track === 'product'
      ? remainProduct > 0
        ? '派人后随机生成 BOM 和名称，毛利保证高于现有最低档。'
        : '两档量产课题已经做完。'
      : remainTech > 0
        ? '从下方科技树点选一项知识产权，再派人攻关。'
        : '工艺专利已经齐了。';
  const projectName = product?.name ?? tech?.name ?? idleName;
  const blurb = product?.blurb ?? tech?.blurb ?? idleBlurb;
  const fill = hasProject
    ? Math.min(100, (progress / cycle) * 100)
    : (track === 'product' ? remainProduct <= 0 : remainTech <= 0)
      ? 100
      : 0;
  const pips = [1, 2, 3, 4];
  return (
    <article className={['rd-lab', staff > 0 ? 'on' : ''].filter(Boolean).join(' ')}>
      <span className="suit">{RD_TRACK_LABEL[track]}</span>
      <h4>{projectName}</h4>
      <p className="rd-lab-blurb">{blurb}</p>
      <div className="rd-bar" aria-hidden>
        <i style={{ width: `${fill}%` }} />
      </div>
      <div className="rd-lab-meta">
        <span>
          研发周期 {progress}/{cycle} 月
        </span>
        <span className={staff > 0 ? 'good' : undefined}>成功率 {pctLabel(rate)}</span>
      </div>
      <div className="rd-chance" aria-label={`成功率 ${pctLabel(rate)}`}>
        {pips.map((n) => (
          <i key={n} className={staff >= n ? 'on' : undefined} />
        ))}
        <em>{staff} 人在岗</em>
      </div>
      {track === 'product' && acting && canOpenProductRd(state) ? (
        <button type="button" className="chip" style={{ marginTop: 10 }} onClick={onOpenProduct}>
          随机开题
        </button>
      ) : null}
      {staff <= 0 ? (
        <p className="stat">实验室无人，本月结算不推进。</p>
      ) : !hasProject ? (
        <p className="stat">
          {track === 'product'
            ? remainProduct > 0
              ? '在岗等待开题，本月结算不推进。'
              : '量产课题已经做完。'
            : remainTech > 0
              ? '在岗等待点选工艺，本月结算不推进。'
              : '工艺专利已经齐了。'}
        </p>
      ) : progress >= cycle ? (
        <p className="stat">本月将按成功率结算课题。</p>
      ) : progress + 1 >= cycle ? (
        <p className="stat">本月结算将按成功率判定课题。</p>
      ) : null}
    </article>
  );
}

function IpRack({
  state,
  acting,
  onPick,
}: {
  state: GameState;
  acting: boolean;
  onPick: (id: IpId) => void;
}) {
  const owned = new Set(state.ownedIps ?? []);
  return (
    <div className="ip-rack">
      {IP_CATALOG.map((ip) => {
        const got = owned.has(ip.id);
        const current = !got && state.rdTechProjectId === ip.id;
        const pickable = acting && !got && canPickTechProject(state, ip.id);
        const className = ['ip-plate', got ? 'on' : '', current ? 'next' : '', pickable ? 'pick' : '']
          .filter(Boolean)
          .join(' ');
        const body = (
          <>
            <span className="suit">{got ? '已装备' : current ? '在研' : pickable ? '可选' : '待研'}</span>
            <h4>{ip.name}</h4>
            <p>{ip.effect}</p>
          </>
        );
        return pickable ? (
          <button key={ip.id} type="button" className={className} onClick={() => onPick(ip.id)}>
            {body}
          </button>
        ) : (
          <article key={ip.id} className={className}>
            {body}
          </article>
        );
      })}
    </div>
  );
}

function plantConfirmCopy(state: GameState, kind: PlantKind) {
  if (kind === 'machine') {
    const full = state.machines >= state.slots;
    const next = { ...state, machines: state.machines + 1 };
    return {
      kicker: '产线',
      title: '购买设备 1 台',
      confirm: '确认购买',
      instant: full
        ? [`当前厂区机位已满（${state.machines}/${state.slots}），需先扩建厂区才能再买设备。`]
        : [
            `立刻到位，占用 1 个机位。无人值守也有基础产能 ${MACHINE_BASE_CAP}。`,
            `最多再安置 ${WORKERS_PER_MACHINE} 名生产工，设备位内每人产能 +${CAP_PER_WORKER}。`,
            `本次：产能 ${capacityOf(state)} → ${capacityOf(next)}，机位 ${state.machines}/${state.slots} → ${state.machines + 1}/${state.slots}。`,
            `设备抵押融资上限 ${money(loanLimit(state.machines))} → ${money(loanLimit(state.machines + 1))}。`,
          ],
      ongoing: [`按 ${MACHINE_LIFE_MONTHS} 个月计提折旧。`, '不增加厂区月维护。'],
      costs: [
        { label: '设备款', value: money(MACHINE_COST), note: '当月现金支付，记入固定资产' },
        { label: '行动点', value: '1 AP', note: '确认后立即消耗' },
      ],
      blocked: full
        ? '厂区机位已满，请先扩建厂区。'
        : state.cash < MACHINE_COST
          ? '现金不够支付设备款。'
          : undefined,
      canConfirm: !full && state.cash >= MACHINE_COST,
    };
  }

  const nextSlots = state.slots + SLOTS_PER_FACTORY;
  const upkeepNow = state.factories * FACTORY_UPKEEP;
  const upkeepNext = (state.factories + 1) * FACTORY_UPKEEP;
  return {
    kicker: '厂区',
    title: '扩建厂区 1 座',
    confirm: '确认扩建',
    instant: [
      `立刻新开一座厂区，新增 ${SLOTS_PER_FACTORY} 个机位。新厂区会出现在生产部标签里。`,
      `本次：新增 ${factoryName(state.factories)}，机位 ${state.slots} → ${nextSlots}。`,
    ],
    ongoing: [
      `每月厂区维护 +${money(FACTORY_UPKEEP)}（本次 ${money(upkeepNow)} → ${money(upkeepNext)}），结算时从现金扣除。`,
      `按 ${FACTORY_LIFE_MONTHS} 个月计提折旧。`,
    ],
    costs: [
      { label: '扩建费', value: money(FACTORY_COST), note: '当月现金支付，记入固定资产' },
      { label: '行动点', value: '1 AP', note: '确认后立即消耗' },
    ],
    blocked: state.cash < FACTORY_COST ? '现金不够支付扩建费。' : undefined,
    canConfirm: state.cash >= FACTORY_COST,
  };
}

function PlantBoard({
  plants,
  openIndex,
  extraCapacity,
  onToggle,
}: {
  plants: ReturnType<typeof factoryLayout>;
  openIndex: number;
  extraCapacity: number;
  onToggle: (index: number) => void;
}) {
  return (
    <div className="plant-list">
      {plants.map((plant) => {
        const open = openIndex === plant.index;
        return (
          <div key={plant.index} className={['plant-tab', open ? 'open' : ''].filter(Boolean).join(' ')}>
            <button
              type="button"
              className="plant-tab-head"
              aria-expanded={open}
              onClick={() => onToggle(plant.index)}
            >
              <b>
                {plant.name} · 产能占用 {plant.used}/{plant.cap}
              </b>
              <em>{open ? '收起' : '展开'}</em>
            </button>
            {open ? (
              <div className="plant-tab-body">
                <div className="plant-slots">
                  {plant.machines.map((slot) =>
                    slot.filled ? (
                      <article key={slot.slot} className="plant-slot">
                        <span className="suit">机位 {slot.slot}</span>
                        <h4>{slot.slot}号机</h4>
                        <div className="plant-crew" aria-hidden>
                          {Array.from({ length: WORKERS_PER_MACHINE }, (_, i) => (
                            <i key={i} className={i < slot.workers ? undefined : 'off'} />
                          ))}
                        </div>
                        <p className="stat">工人 {slot.workers}/{WORKERS_PER_MACHINE} 人</p>
                        <p className="stat">
                          {slot.workers
                            ? `基础 ${MACHINE_BASE_CAP} + ${slot.workers}×${CAP_PER_WORKER}`
                            : `基础 ${MACHINE_BASE_CAP} · 无人值守`}
                        </p>
                        <p className="cap">{slot.cap}</p>
                        <p className="stat">本机产能</p>
                      </article>
                    ) : (
                      <article key={slot.slot} className="plant-slot empty">
                        <span className="suit">机位 {slot.slot}</span>
                        <h4>空机位</h4>
                        <p className="stat">尚未安置设备</p>
                      </article>
                    ),
                  )}
                </div>
                {plant.overflow > 0 ? (
                  <p className="plant-note">
                    超编 {plant.overflow} 人挂在本厂区 · 每人产能 +{CAP_OVERFLOW}，合计 +{plant.overflow * CAP_OVERFLOW}
                  </p>
                ) : null}
                {plant.index === 0 && extraCapacity !== 0 ? (
                  <p className="plant-note">
                    {extraCapacity > 0 ? `本月额外产能 +${extraCapacity}` : `本月事件影响产能 ${extraCapacity}`}
                    ，已计入本厂区占用。
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ScheduleBoard({
  state,
  plan,
  products,
  loads,
  canEdit,
  producing,
  onToggleOrder,
  onExtra,
  onSettle,
  onBack,
}: {
  state: GameState;
  plan: ReturnType<typeof productionPlan>;
  products: ProductDef[];
  loads: ReturnType<typeof orderCapLoads>;
  canEdit: boolean;
  producing: boolean;
  onToggleOrder: (id: string) => void;
  onExtra: (productId: ProductId, qty: number) => void;
  onSettle: () => void;
  onBack: () => void;
}) {
  const extraCap = products.reduce((sum, item) => sum + (state.extraProduce?.[item.id] ?? 0), 0);
  const orderCap = loads.reduce((sum, load) => sum + load.cap, 0);
  const over = plan.capUsed > plan.capTotal;
  const fill = plan.capTotal > 0 ? Math.min(100, (plan.capUsed / plan.capTotal) * 100) : 0;
  const [openStock, setOpenStock] = useState(false);

  return (
    <section className="schedule-board">
      <header className="schedule-head">
        <b>排产</b>
        <span className={over ? 'bad' : undefined}>
          占用 {plan.capUsed}/{plan.capTotal}
        </span>
      </header>
      <div className={['schedule-meter', over ? 'over' : ''].filter(Boolean).join(' ')} aria-hidden>
        <i style={{ width: `${fill}%` }} />
      </div>
      {plan.missing.length > 0 ? <p className="hint">{plan.missing.join('，')}</p> : null}

      <div className="schedule-pane">
        <header>
          <p className="dept-kicker">订单生产</p>
          <span>工单占用 {orderCap}</span>
        </header>
        <div className="job-list">
          {loads.length === 0 ? (
            <div className="job empty">
              <p>到销售部接单后，工单会落到这里。</p>
            </div>
          ) : (
            loads.map((load) => {
              const order = (state.monthOrders ?? []).find((item) => item.id === load.orderId);
              const item = productOf(state, load.productId);
              const body = (
                <>
                  <div>
                    <span className="suit">
                      {order?.kind === 'contract' ? '合同工单' : '市场工单'} · {item.tier}
                    </span>
                    <h4>
                      {item.name} {load.qty} 件
                    </h4>
                    <p className="stat">
                      {load.fromStock > 0 && load.make > 0
                        ? `本月现做 ${load.make} · 库存抵 ${load.fromStock}`
                        : load.make > 0
                          ? `本月现做 ${load.make}`
                          : `库存交付 ${load.fromStock}`}
                    </p>
                  </div>
                  <div className="job-cap">
                    <strong>{load.cap}</strong>
                    <span>产能占用</span>
                  </div>
                </>
              );
              return canEdit ? (
                <button key={load.orderId} type="button" className="job" onClick={() => onToggleOrder(load.orderId)}>
                  {body}
                </button>
              ) : (
                <article key={load.orderId} className="job">
                  {body}
                </article>
              );
            })
          )}
        </div>
      </div>

      <div className={['plant-tab', 'schedule-stock', openStock ? 'open' : ''].filter(Boolean).join(' ')}>
        <button
          type="button"
          className="plant-tab-head"
          aria-expanded={openStock}
          onClick={() => setOpenStock((open) => !open)}
        >
          <b>备货入库 · 产能占用 {extraCap}</b>
          <em>{openStock ? '收起' : '展开'}</em>
        </button>
        {openStock ? (
          <div className="plant-tab-body">
            <div className="stock-jobs">
              {products.map((item) => {
                const extra = state.extraProduce?.[item.id] ?? 0;
                const max = maxExtraProduce(state, item.id);
                const stock = state.finished[item.id] ?? 0;
                const age = finishedMaxAge(state, item.id);
                const provision = finishedProvisionOf(state, item.id);
                return (
                  <article key={item.id} className={['job', extra > 0 ? 'on' : ''].filter(Boolean).join(' ')}>
                    <div>
                      <span className="suit">{item.tier}</span>
                      <h4>{item.name}</h4>
                      <p className="stat">
                        库存 {qty(stock)}
                        {age >= 2 ? ` · 库龄 ${age} 个月` : ''}
                        {provision > 0 ? ` · 跌价 ${money(provision)}` : ''}
                      </p>
                    </div>
                    <div className="job-cap">
                      <strong>{extra}</strong>
                      <span>产能占用</span>
                    </div>
                    <div className="stock-lots">
                      {EXTRA.map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={extra === n ? 'chip on' : 'chip'}
                          disabled={!canEdit || (n > 0 && n > Math.max(extra, max))}
                          onClick={() => onExtra(item.id, n)}
                        >
                          {n === 0 ? '不备货' : `+${n}`}
                        </button>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {producing ? (
        <div className="footer-actions">
          <button className="btn small ghost" onClick={onBack}>
            取消排产，返回经营
          </button>
          <button className="btn" disabled={!plan.ok} onClick={onSettle}>
            确认接单并结算 · 不耗 AP
          </button>
        </div>
      ) : null}
    </section>
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
  const [plantKind, setPlantKind] = useState<PlantKind | null>(null);
  const [openPlant, setOpenPlant] = useState(-1);
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
  const products = catalogOf(state).filter((item) => state.unlockedProducts.includes(item.id));
  const cardWeights = ROLES.map((role) => ({
    role,
    weight: 1 + state.staff[role] * 0.85,
  }));
  const cardWeightTotal = cardWeights.reduce((sum, item) => sum + item.weight, 0);
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
  const orders = state.monthOrders ?? [];
  const accepted = state.acceptedOrderIds ?? [];
  const plan = productionPlan(state);
  const acceptedOrders = orders.filter((order) => accepted.includes(order.id));
  const acceptedViews = acceptedOrders.map((order) => ({
    order,
    item: productOf(state, order.productId),
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
  const plants = factoryLayout(state, plan.capUsed);
  const loads = orderCapLoads(state);

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
        <Stage id="ceo" title="经理室">
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
          summary={
            orders.length
              ? `销售 ${state.staff.sales} 人 · 已接 ${accepted.length}/${orders.length} 张`
              : `销售 ${state.staff.sales} 人 · 本月订单尚未开出`
          }
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
                  const item = productOf(state, order.productId);
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
                      <div className="meta">
                        <div className="meta-row">
                          <span>订单收入 {money(view.revenue)}</span>
                          <span>毛利 {money(view.gross)}</span>
                        </div>
                        <div className="meta-row">
                          <span>现销 {money(view.cash)}</span>
                          <span>赊销 {money(view.credit)}</span>
                        </div>
                        <div className="meta-row">
                          <span className={view.stock >= order.qty ? 'good' : 'bad'}>库存 {view.stock}</span>
                          <span className={trial.ok ? 'good' : 'bad'}>{orderGapText(state, trial)}</span>
                        </div>
                        {order.kind === 'contract' && !on ? (
                          <div className="meta-row">
                            <span>不接扣 {money(order.penalty)} 违约金</span>
                          </div>
                        ) : null}
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
          now={acting}
        >
          <Facts>
            <div className="sheet-wrap">
              <table className="sheet dark compact bom-sheet">
                <thead>
                  <tr>
                    <th>已有产品</th>
                    <th className="num">账面成本</th>
                    <th className="num">本期采购</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((item) => (
                    <tr key={item.id}>
                      <td>
                        {item.tier} · {item.name}
                        <span className="bom-recipe">{bomLabel(item.bom)}</span>
                      </td>
                      <td className="num">{money(bomBookCost(state, item.id))}</td>
                      <td className="num">{money(bomCost(state, item.id))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Facts>
          <Actions>
            <div className="spot-list">
              {visibleMaterials.map((item) => {
                const remaining = spotOf(state, item.id);
                const pick = Math.min(cart[item.id] ?? 0, remaining);
                const line = buyLineCost(state, item.id, pick);
                const steps = purchaseQtyOptions(remaining, materialCrateSize(item.id));
                const stock = state.materials[item.id] ?? 0;
                const age = materialMaxAge(state, item.id);
                const provision = materialProvisionOf(state, item.id);
                const aged = stock > 0 && (age >= 2 || provision > 0);
                const soldOut = remaining <= 0;
                return (
                  <article key={item.id} className={['spot-card', soldOut ? 'soldout' : '', pick > 0 ? 'on' : ''].filter(Boolean).join(' ')}>
                    <header className="spot-top">
                      <b>{item.name}</b>
                      <span>{money(state.materialPrices[item.id])} / 件</span>
                    </header>
                    <div className="spot-row">
                      <p className="spot-meta">
                        <span>库存 {qty(stock)}</span>
                        <span className={soldOut ? 'bad' : 'good'}>{soldOut ? '现货售罄' : `现货 ${qty(remaining)}`}</span>
                      </p>
                      {soldOut ? null : (
                        <div className="spot-lots">
                          {steps.map((n) => (
                            <button
                              key={n}
                              type="button"
                              className={pick === n ? 'chip on' : 'chip'}
                              disabled={!acting}
                              onClick={() =>
                                setCart((prev) => ({ ...prev, [item.id]: pick === n ? 0 : n }))
                              }
                            >
                              {n === remaining ? `全 ${n}` : n}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {aged ? (
                      <p className="spot-age">
                        库龄 {age} 个月
                        {provision > 0 ? ` · 跌价准备 ${money(provision)}` : ''}
                      </p>
                    ) : null}
                    {pick > 0 ? <p className="spot-pay">付现 {money(line)}</p> : null}
                  </article>
                );
              })}
            </div>
            {state.modifiers.nextBuyDiscount > 0 && (
              <p className="hint" style={{ marginTop: 8 }}>
                本单集采折扣 {Math.round(state.modifiers.nextBuyDiscount * 100)}%。
              </p>
            )}
          </Actions>
          <Actions
            note={
              acting
                ? buyApFree
                  ? '第三、四季度采购不耗行动点，仍要付现。本月没买完的额度月底作废。'
                  : '本月没买完的额度月底作废。'
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
          <Facts title="原料报价">
            <table className="sheet dark compact quote-sheet">
              <thead>
                <tr>
                  <th>原料</th>
                  {state.month > 1 ? <th className="num">上期</th> : null}
                  <th className="num">本期</th>
                </tr>
              </thead>
              <tbody>
                {visibleMaterials.map((item) => {
                  const now = state.materialPrices[item.id] ?? 0;
                  const prev = state.prevMaterialPrices?.[item.id] ?? now;
                  const tone = state.month > 1 ? priceDelta(now, prev).tone : 'flat';
                  return (
                    <tr key={item.id}>
                      <td>{item.name}</td>
                      {state.month > 1 ? <td className="num muted">{money(prev)}</td> : null}
                      <td className={tone === 'flat' ? 'num' : `num delta-${tone}`}>{money(now)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Facts>
        </Stage>
        )}

        {active === 'production' && (
        <Stage
          id="production"
          title="生产部"
          summary={`产能 ${capacityOf(state)} · 设备 ${state.machines} 台 · 生产工 ${state.staff.production} 人`}
          now={producing}
        >
          <Facts>
            <PlantBoard
              plants={plants}
              openIndex={openPlant >= plants.length ? -1 : openPlant}
              extraCapacity={state.modifiers.extraCapacity}
              onToggle={(index) => setOpenPlant(openPlant === index ? -1 : index)}
            />
          </Facts>
          <ScheduleBoard
            state={state}
            plan={plan}
            products={products}
            loads={loads}
            canEdit={acting || producing}
            producing={producing}
            onToggleOrder={(id) => dispatch({ type: 'TOGGLE_ORDER', id })}
            onExtra={(productId, extraQty) => dispatch({ type: 'SET_EXTRA_PRODUCE', productId, qty: extraQty })}
            onSettle={() => setSettleOpen(true)}
            onBack={() => dispatch({ type: 'BACK_TO_ACTIONS' })}
          />
          <div className="hire-action plant-actions">
            <button className="chip" disabled={!canAct} onClick={() => setHireRole('production')}>
              招聘生产人员
            </button>
            <button className="chip" disabled={!canAct} onClick={() => setPlantKind('machine')}>
              购买设备
            </button>
            <button className="chip" disabled={!canAct} onClick={() => setPlantKind('factory')}>
              扩建厂区
            </button>
          </div>
          {acting || producing ? null : <p className="hint">事件结束后才能改编制和产线。</p>}
        </Stage>
        )}

        {active === 'rd' && (
        <Stage
          id="rd"
          title="研发部"
          summary={`产品组 ${rdTrackStaff(state, 'product')} 人 · 工艺组 ${rdTrackStaff(state, 'tech')} 人 · 知识产权 ${(state.ownedIps ?? []).length}/${IP_CATALOG.length}`}
        >
          <Facts>
            <div className="rd-labs">
              <RdLabCard
                state={state}
                track="product"
                acting={acting}
                onOpenProduct={() => dispatch({ type: 'OPEN_PRODUCT_RD' })}
              />
              <RdLabCard state={state} track="tech" acting={acting} />
            </div>
            <p className="hint" style={{ marginTop: 12 }}>
              产品课题 3 个月，BOM 随机生成；工艺课题 2 个月，第一次派人时可自选知识产权。每人 +20% 成功率，上限 80%。有人值守才走表，招人不加速进度。
              {rdCapacityBonus(state) > 0 ? ` 已装备知识产权为本月产能 +${rdCapacityBonus(state)}。` : ''}
            </p>
          </Facts>
          <Facts title="知识产权">
            <IpRack
              state={state}
              acting={acting}
              onPick={(ipId) => dispatch({ type: 'PICK_RD_TECH', ipId })}
            />
          </Facts>
          {(state.extraProducts?.length ?? 0) > 0 && (
            <Facts title="已交付产品">
              <p className="hint">{(state.extraProducts ?? []).map((item) => item.name).join('、')}</p>
            </Facts>
          )}
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
            {ROLE_HINT[hireRole] ? <p className="lead">{ROLE_HINT[hireRole]}</p> : null}
            {hireRole === 'rd' ? (
              <div className="rd-hire-picks">
                <button
                  type="button"
                  className="rd-hire-pick"
                  disabled={state.cash < HIRE_COST || !canAct}
                  onClick={() => {
                    dispatch({ type: 'HIRE', role: 'rd', rdTrack: 'product' });
                    setHireRole(null);
                  }}
                >
                  <span className="suit">{RD_TRACK_LABEL.product}</span>
                  <b>编入{RD_TRACK_LABEL.product}</b>
                  <span>
                    {currentProductProject(state)?.name ??
                      ((state.extraProducts?.length ?? 0) < MAX_RD_PRODUCTS ? '入职后随机开题' : '课题已结')}
                    {' · '}
                    成功率提升至 {pctLabel(rdTrackRate(state, 'product', 1))}
                  </span>
                  <ul>
                    {hireEffectLines(state, 'rd', 'product')
                      .slice(0, -1)
                      .map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                  </ul>
                </button>
                {currentTechProject(state) ? (
                  <button
                    type="button"
                    className="rd-hire-pick"
                    disabled={state.cash < HIRE_COST || !canAct}
                    onClick={() => {
                      dispatch({ type: 'HIRE', role: 'rd', rdTrack: 'tech' });
                      setHireRole(null);
                    }}
                  >
                    <span className="suit">{RD_TRACK_LABEL.tech}</span>
                    <b>编入{RD_TRACK_LABEL.tech}</b>
                    <span>
                      {currentTechProject(state)?.name}
                      {' · '}
                      成功率提升至 {pctLabel(rdTrackRate(state, 'tech', 1))}
                    </span>
                    <ul>
                      {hireEffectLines(state, 'rd', 'tech')
                        .slice(0, -1)
                        .map((line) => (
                          <li key={line}>{line}</li>
                        ))}
                    </ul>
                  </button>
                ) : (
                  <div className="rd-hire-tech">
                    <p className="sheet-caption">选择工艺课题并编入</p>
                    <div className="rd-hire-row">
                      {availableTechIps(state).length === 0 ? (
                        <button
                          type="button"
                          className="rd-hire-pick"
                          disabled={state.cash < HIRE_COST || !canAct}
                          onClick={() => {
                            dispatch({ type: 'HIRE', role: 'rd', rdTrack: 'tech' });
                            setHireRole(null);
                          }}
                        >
                          <span className="suit">{RD_TRACK_LABEL.tech}</span>
                          <b>编入工艺实验室</b>
                          <span>工艺专利已经齐了 · 成功率提升至 {pctLabel(rdTrackRate(state, 'tech', 1))}</span>
                        </button>
                      ) : (
                        availableTechIps(state).map((ip) => (
                          <button
                            key={ip.id}
                            type="button"
                            className="rd-hire-pick"
                            disabled={state.cash < HIRE_COST || !canAct}
                            onClick={() => {
                              dispatch({ type: 'HIRE', role: 'rd', rdTrack: 'tech', ipId: ip.id });
                              setHireRole(null);
                            }}
                          >
                            <span className="suit">{ip.effect}</span>
                            <b>{ip.name}</b>
                            <span>{ip.blurb}</span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <ul className="hire-points">
                {hireEffectLines(state, hireRole).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            )}
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
              {hireRole === 'rd' ? null : (
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
              )}
            </div>
          </div>
        </div>
      )}

      {plantKind && (
        <div className="overlay hire-overlay" onClick={() => setPlantKind(null)}>
          <div className="modal hire-modal" onClick={(event) => event.stopPropagation()}>
            {(() => {
              const copy = plantConfirmCopy(state, plantKind);
              return (
                <>
                  <p className="kicker" style={{ color: '#8a7040' }}>
                    {copy.kicker}
                  </p>
                  <h2>{copy.title}</h2>
                  <p className="sheet-caption">即刻发生</p>
                  <ul className="hire-points">
                    {copy.instant.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <p className="sheet-caption">后续持续</p>
                  <ul className="hire-points">
                    {copy.ongoing.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <div className="hire-costs">
                    {copy.costs.map((cost) => (
                      <div key={cost.label}>
                        <em>{cost.label}</em>
                        <strong>{cost.value}</strong>
                        <span>{cost.note}</span>
                      </div>
                    ))}
                  </div>
                  {copy.blocked ? <p className="hint">{copy.blocked}</p> : null}
                  <div className="footer-actions">
                    <button className="btn ghost" onClick={() => setPlantKind(null)}>
                      取消
                    </button>
                    <button
                      className="btn"
                      disabled={!copy.canConfirm || !canAct}
                      onClick={() => {
                        if (plantKind === 'machine') dispatch({ type: 'BUY_MACHINE' });
                        else {
                          dispatch({ type: 'EXPAND_FACTORY' });
                          setOpenPlant(state.factories);
                        }
                        setPlantKind(null);
                      }}
                    >
                      {copy.confirm}
                    </button>
                  </div>
                </>
              );
            })()}
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
