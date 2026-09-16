import { booksForView, collectReceivables, createInitialState, equityAccounts, factoryLayout, hireEffectLines, loanAmountOptions, loanLimit, lowestUnlockedMargin, bomSpotCost, netAssetsOf, netProfitOf, orderCapLoads, previewLoanCharges, purchaseQtyOptions, rdRevealOptions, reduce, traderOf, unitsNeeded } from '../src/game/engine';
import { AR_OVERDUE_CHANCE, HIRE_COST, INTEREST_RATE, IP_LEAN_RATE, LOAN_DEFAULT_RATE, LOAN_LATE_FEE_RATE, LOAN_PER_MACHINE, LOAN_TERM_MONTHS, RD_FAIL_BONUS, RD_STAFF_CAP, SALARY, arCreditLossRate, arRecoveryRate, rdSuccessRate } from '../src/game/data';
import { explainAccount, storyChildren } from '../src/game/settlementStory';
import { goalById } from '../src/game/board';
import { roundMoney } from '../src/game/format';
import type { GameState } from '../src/game/types';

function confirmBoard(state: GameState): GameState {
  const id = (state.challengePoolIds ?? [])[0];
  if (!id) throw new Error('Board pool empty');
  if (!state.challengeDraft.includes(id)) state = reduce(state, { type: 'TOGGLE_BOARD_GOAL', id });
  return reduce(state, { type: 'CONFIRM_BOARD' });
}

function assignPendingRd(state: GameState): GameState {
  while ((state.pendingRdReveals ?? []).length > 0) {
    const options = rdRevealOptions(state);
    const retry = options.find((item) => item.assign.kind === 'retry');
    state = reduce(state, { type: 'ASSIGN_RD_REVEAL', assign: (retry ?? options[0])?.assign ?? { kind: 'idle' } });
  }
  return state;
}

function assert(cond: boolean, message: string): void {
  if (!cond) throw new Error(message);
}

function checkBalance(state: GameState, label: string): void {
  const inventory =
    (state.materialCost?.a ?? 0) +
    (state.materialCost?.b ?? 0) +
    (state.materialCost?.c ?? 0) +
    (state.materialCost?.d ?? 0) +
    (state.wip ?? 0) +
    Object.values(state.finishedCost ?? {}).reduce((sum, n) => sum + (n ?? 0), 0);
  const ar = (state.receivables ?? []).reduce((sum, lot) => sum + lot.amount, 0);
  const assets = roundMoney(
    state.cash +
      ar -
      (state.badDebtProvision ?? 0) +
      (state.prepaid ?? 0) +
      inventory -
      (state.inventoryProvision ?? 0) +
      (state.machineGross ?? 0) +
      (state.factoryGross ?? 0) -
      (state.accumDepMachines ?? 0) -
      (state.accumDepFactories ?? 0),
  );
  const equity = netAssetsOf(state);
  const liab = roundMoney(state.debt + state.wagesPayable + (state.taxPayable ?? 0));
  assert(Math.abs(assets - roundMoney(liab + equity)) < 1e-6, `${label} 资产负债不平：资产 ${assets}，负债 ${liab}，权益 ${equity}`);
  const accounts = equityAccounts(state);
  assert(Math.abs(roundMoney(accounts.paidIn + accounts.surplus + accounts.retained) - accounts.total) < 1e-6, `${label} 权益分项不平`);
}

function checkBoardVariety(): void {
  const deals = Array.from({ length: 12 }, () => reduce(createInitialState(), { type: 'START_GAME' }));
  const basics = new Set(deals.map((state) => state.basicGoalId));
  const pools = deals.map((state) => state.challengePoolIds.join('|'));
  assert(deals.every((state) => state.challengePoolIds.length === 4), '每季挑战议题应为 4 条');
  assert(
    deals.every((state) => new Set(state.challengePoolIds.map((id) => goalById(id).axis)).size === 4),
    '四条挑战议题应分属不同经营轴',
  );
  assert(basics.size >= 2 || new Set(pools).size >= 2, '开局目标组合应出现差异');
}

function checkMarketQuotes(): void {
  let state = reduce(createInitialState(), { type: 'START_GAME' });
  assert(typeof state.marketTrend?.materials.a === 'number', '开季应写下行情定调');
  assert((state.challengePoolIds ?? []).length === 4, '开局应发出四条挑战议题');
  state = confirmBoard(state);
  assert(state.phase === 'briefing', '确认目标后应进入月报');
  const diffA = Math.abs(state.materialPrices.a - state.prevMaterialPrices.a);
  assert(diffA < 0.05 || Math.abs(diffA - 0.1) < 1e-6, `钢材月度台阶应为 0 或 0.1，实际 ${diffA}`);
  const basic = state.productPrices.basic ?? 1.5;
  const prevBasic = state.prevProductPrices.basic ?? 1.5;
  const diffP = Math.abs(basic - prevBasic);
  assert(diffP < 0.05 || Math.abs(diffP - 0.2) < 1e-6, `基础款月度台阶应为 0 或 0.2，实际 ${diffP}`);
  assert((state.materialSpot?.a ?? 0) >= 4 && (state.materialSpot?.a ?? 0) <= 24, `钢材现货应在 4–24，实际 ${state.materialSpot?.a}`);
  assert((state.materialSpot?.c ?? 0) <= 6, `芯片现货应不超过 6，实际 ${state.materialSpot?.c}`);
  assert((state.traderSpot?.a ?? 0) >= 4 && (state.traderSpot?.a ?? 0) <= 16, `钢材贸易商应在 4–16，实际 ${state.traderSpot?.a}`);
}

function checkSalesOrders(): void {
  const opened = reduce(createInitialState(), { type: 'START_GAME' });
  assert(opened.staff.sales === 0, `开局应无销售人员，实际 ${opened.staff.sales}`);
  let state = confirmBoard(opened);
  state = reduce(state, { type: 'CONFIRM_BRIEFING' });
  state = reduce(state, { type: 'ACK_EVENT' });
  const orders = state.monthOrders ?? [];
  assert(orders.length >= 2 && orders.length <= 6, `无销售时月初订单应为 2–6 张，实际 ${orders.length}`);
  const lines = hireEffectLines(state, 'sales');
  assert(lines[0]?.includes(`本月订单 ${orders.length} → ${orders.length + 1} 张`), `招销售当月应加一张，实际 ${lines[0]}`);
  assert(lines[1]?.includes('每 2 名销售人员使月初订单 +1'), `招销售应说明下月按两人加一张，实际 ${lines[1]}`);
  assert(lines[1]?.includes('下月月初订单仍为 3 张'), `一名销售不应抬高下月基数，实际 ${lines[1]}`);
  assert(lines[2]?.includes('追回'), `招销售应说明逾期追回加成，实际 ${lines[2]}`);
}

function checkPurchaseLots(): void {
  assert(purchaseQtyOptions(12, 4).join(',') === '4,8,12', '钢材 12 件应是一箱、两箱或全买');
  assert(purchaseQtyOptions(24, 4).join(',') === '4,12,24', '大宗现货应收敛成三档');
  assert(purchaseQtyOptions(1, 1).join(',') === '1', '芯片 1 件只应能全买');
  assert(purchaseQtyOptions(0, 4).length === 0, '售罄不应有买量');
}

function checkFactoryLayout(): void {
  const opened = reduce(createInitialState(), { type: 'START_GAME' });
  const plants = factoryLayout(opened, 0);
  assert(plants.length === 1, `开局应有一座厂区，实际 ${plants.length}`);
  assert(plants[0]?.name === '一号厂区', `开局厂区名应为 一号厂区，实际 ${plants[0]?.name}`);
  assert(plants[0]?.machineCount === 1, `开局应有 1 台设备，实际 ${plants[0]?.machineCount}`);
  assert(plants[0]?.machines[0]?.workers === 2, `开局 1 号机应有 2 人，实际 ${plants[0]?.machines[0]?.workers}`);
  assert(plants[0]?.machines[0]?.cap === 14, `开局 1 号机产能应为 14，实际 ${plants[0]?.machines[0]?.cap}`);
  assert(plants[0]?.cap === 14, `开局厂区产能应为 14，实际 ${plants[0]?.cap}`);
  assert(plants[0]?.machines[1]?.filled === false, '开局 2 号机位应空置');

  const overflowed = factoryLayout({ ...opened, staff: { ...opened.staff, production: 5 } }, 0);
  assert(overflowed[0]?.overflow === 1, `5 名生产工应对 1 台设备超编 1 人，实际 ${overflowed[0]?.overflow}`);
  assert(overflowed[0]?.cap === 23, `超编后厂区产能应为 23，实际 ${overflowed[0]?.cap}`);

  const expanded = factoryLayout({ ...opened, factories: 2, slots: 6, machines: 4 }, 10);
  assert(expanded.length === 2, `两座厂区应拆成两个标签，实际 ${expanded.length}`);
  assert(expanded[0]?.machineCount === 3 && expanded[1]?.machineCount === 1, '设备应先填满一号厂区');
  assert(expanded[0]?.used === 10 && expanded[1]?.used === 0, `占用应先摊到一号厂区，实际 ${expanded[0]?.used}/${expanded[1]?.used}`);
  assert(expanded[1]?.name === '二号厂区', `第二座应为二号厂区，实际 ${expanded[1]?.name}`);

  const penalized = factoryLayout({ ...opened, modifiers: { ...opened.modifiers, extraCapacity: -3 } }, 0);
  assert(penalized[0]?.cap === 11, `事件减产能后一号厂区应为 11，实际 ${penalized[0]?.cap}`);

  const scheduled = orderCapLoads({
    ...opened,
    finished: { ...opened.finished, basic: 4 },
    monthOrders: [{ id: 't1', productId: 'basic', qty: 10, kind: 'market', penalty: 0 }],
    acceptedOrderIds: ['t1'],
  });
  assert(scheduled[0]?.fromStock === 4 && scheduled[0]?.cap === 6, `库存应先抵订单产能，实际 库存${scheduled[0]?.fromStock} 占用${scheduled[0]?.cap}`);
}

function checkSpotPurchase(): void {
  let state = confirmBoard(reduce(createInitialState(), { type: 'START_GAME' }));
  state = reduce(state, { type: 'CONFIRM_BRIEFING' });
  state = reduce(state, { type: 'ACK_EVENT' });
  const volumes = (state.monthOrders ?? []).filter((order) => order.productId === 'basic' || order.productId === 'economy');
  const premiums = (state.monthOrders ?? []).filter((order) => order.productId === 'premium' || order.productId === 'special');
  assert(volumes.length >= 1, '每月应保底一张走量单');
  assert(
    volumes.every((order) => order.qty >= 6),
    `走量单件数应明显大于高端，实际 ${volumes.map((order) => order.qty).join(',')}`,
  );
  if (premiums.length > 0) {
    assert(
      premiums.every((order) => order.qty <= 3),
      `旗舰单不应走量，实际 ${premiums.map((order) => order.qty).join(',')}`,
    );
  }
  const beforeA = state.materials.a;
  const spotA = state.materialSpot?.a ?? 0;
  state = reduce(state, { type: 'BUY_MATERIAL', material: 'a', qty: spotA + 20 });
  assert(state.materials.a === beforeA + spotA, `采购不得超过本月现货，库存 ${state.materials.a} 期望 ${beforeA + spotA}`);
  assert((state.materialSpot?.a ?? 0) === 0, '买完后钢材现货应扣尽');
}

function checkProposals(): void {
  let state = confirmBoard(reduce(createInitialState(), { type: 'START_GAME' }));
  assert(state.shop.length === 3, '确认目标后应出示三份本月提案');
  state = reduce(state, { type: 'CONFIRM_BRIEFING' });
  state = reduce(state, { type: 'ACK_EVENT' });
  assert(state.shop.length === 3, '行动阶段仍应保留本月提案');
  const cash = state.cash;
  const ap = state.ap;
  const picked = state.shop[0]!;
  state = reduce(state, { type: 'BUY_CARD', index: 0 });
  assert(state.cash === cash, '立项不应扣现金');
  assert(state.ap === ap, '立项不应耗行动点');
  assert(state.hand.length === 1 && state.hand[0]?.defId === picked.defId, '立项后应进入待执行');
  assert(state.hand[0]?.readyMonth === state.month + 1, '新立项次月才能落地');
  assert(state.cardsBoughtThisMonth === 1, '本月立项计数应为 1');
  const blocked = reduce(state, { type: 'PLAY_CARD', uid: state.hand[0]!.uid });
  assert(blocked.hand.length === 1, '当月不能落地刚立项的提案');
  const twice = reduce(state, { type: 'BUY_CARD', index: 0 });
  assert(twice.hand.length === 1 && twice.cardsBoughtThisMonth === 1, '每月只能立项一份');

  state.hand[0]!.readyMonth = state.month;
  state.cash = 0;
  const uid = state.hand[0]!.uid;
  state = reduce(state, { type: 'PLAY_CARD', uid, material: 'a' });
  assert(state.hand.length === 0, '次月应能落地已立项提案');
  assert(picked.defId === 'bridge' ? state.cash === 5 : state.cash === 0, '落地不应另扣现金');
}

function checkLoans(): void {
  assert(LOAN_PER_MACHINE === 10, `每台抵押额度应为 10 万，实际 ${LOAN_PER_MACHINE}`);
  assert(INTEREST_RATE === 0.04, `普通借款月息应为 4%，实际 ${INTEREST_RATE}`);
  assert(LOAN_TERM_MONTHS === 3, `借款期限应为 3 个月，实际 ${LOAN_TERM_MONTHS}`);
  assert(loanLimit(1) === 10 && loanLimit(2) === 20, '抵押额度应按台数放大');
  assert(loanAmountOptions(10).join(',') === '2,4,10', `1 台额度挡位应为 2/4/10，实际 ${loanAmountOptions(10)}`);
  assert(loanAmountOptions(5).join(',') === '2,4,5', `额度 5 万时最大挡应是 5，实际 ${loanAmountOptions(5)}`);
  assert(loanAmountOptions(1).join(',') === '1', `还可借 1 万时应只出 1 万挡，实际 ${loanAmountOptions(1)}`);
  assert(loanAmountOptions(0).length === 0, '没有可借可还时不应出挡位');
  assert(loanAmountOptions(20).at(-1) === 20, '两台设备时最大挡应为 20 万');

  const due = previewLoanCharges({
    ...createInitialState(),
    month: 4,
    debt: 10,
    loans: [{ amount: 10, originMonth: 1, dueMonth: 4 }],
  });
  assert(due.interest === 0.4, `10 万借款月息应为 0.4 万，实际 ${due.interest}`);
  assert(due.defaultFee === roundMoney(10 * LOAN_DEFAULT_RATE), `到期未还违约金应为 ${roundMoney(10 * LOAN_DEFAULT_RATE)}，实际 ${due.defaultFee}`);
  assert(due.lateFee === roundMoney(10 * LOAN_LATE_FEE_RATE), `到期未还滞纳金应为 ${roundMoney(10 * LOAN_LATE_FEE_RATE)}，实际 ${due.lateFee}`);

  const current = previewLoanCharges({
    ...createInitialState(),
    month: 1,
    debt: 4,
    loans: [{ amount: 4, originMonth: 1, dueMonth: 4 }],
  });
  assert(current.defaultFee === 0 && current.lateFee === 0, '未到期不应计提违约金或滞纳金');

  let state = confirmBoard(reduce(createInitialState(), { type: 'START_GAME' }));
  state = reduce(state, { type: 'CONFIRM_BRIEFING' });
  state = reduce(state, { type: 'ACK_EVENT' });
  const cash = state.cash;
  const ap = state.ap;
  state = reduce(state, { type: 'BORROW', amount: 10 });
  assert(state.debt === 10, `应借入 10 万，实际 ${state.debt}`);
  assert(state.cash === roundMoney(cash + 10), '借款应立刻到账');
  assert(state.ap === ap - 1, '借款应耗 1 AP');
  assert(state.loans.length === 1 && state.loans[0]?.dueMonth === state.month + LOAN_TERM_MONTHS, '新借款应按 3 个月记到期');
  const blocked = reduce(state, { type: 'BORROW', amount: 2 });
  assert(blocked.debt === 10, '超过设备抵押上限后不应再借入');
}

function checkOpeningAccounts(): void {
  const opened = reduce(createInitialState(), { type: 'START_GAME' });
  const net = netAssetsOf(opened);
  const accounts = equityAccounts(opened);
  assert(accounts.paidIn === net, `开业实收资本 ${accounts.paidIn} 应等于净资产 ${net}`);
  assert(accounts.surplus === 0, '开业盈余公积应为 0');
  assert(accounts.retained === 0, `开业未分配利润应为 0，实际 ${accounts.retained}`);
  assert(opened.materialCost.a === 6.4 && opened.materialCost.b === 3.2 && opened.materialCost.c === 2, '开业原材料未按历史成本入账');
  assert(opened.machineGross === 10 && opened.factoryGross === 20, '开业固定资产未按原价入账');
  assert(opened.maxAp === 3 && opened.ap === 3, '开业 1 名管理应维持 3 点行动点上限');
  checkBalance(opened, '开业');
}

function settleFirstMonth(): GameState {
  let state = reduce(createInitialState(), { type: 'START_GAME' });
  const paidIn = state.paidInCapital;
  for (let i = 0; i < 40; i += 1) {
    if (state.phase === 'report') {
      checkBalance(state, '一月结算');
      assert(state.paidInCapital === paidIn, '实收资本在月结后不应变动');
      const np = netProfitOf(state.ledger);
      const report = state.lastReport;
      if (!report) throw new Error('一月结算应生成底稿');
      const view = booksForView(state);
      assert(view.currClosed, '一月结算后本月列应为期末');
      assert(view.prev.title === '开业', `上月期末应为开业，实际 ${view.prev.title}`);
      assert(view.older == null, '一月不应有上上月期末');
      assert(report.pnlRows.some((row) => row.label === '净利润' && row.value === np), '利润表展开应落到净利润');
      assert(report.pnlRows.some((row) => row.label === '营业收入'), '利润表展开应有营业收入');
      assert(report.balanceRows.some((row) => row.label === '净资产'), '资产负债表展开应有净资产');
      const wageKids = storyChildren(report.balanceRows, '应付职工薪酬');
      assert(wageKids.some((row) => row.label.includes('生产人员')), '应付职工薪酬应拆出生产工费');
      assert(wageKids.some((row) => row.label.includes('管理人员')), '应付职工薪酬应拆出管理工费');
      const ctx = { state, books: view.curr, ledger: view.curr.ledger, facts: { ...report.facts, settled: true } };
      const wageExplain = explainAccount('应付职工薪酬', ctx);
      assert(wageExplain.some((row) => row.label.includes('生产人员') && row.label.includes('×')), '报表点开应付职工薪酬应看到人数×月薪');
      assert(wageExplain.some((row) => row.label.includes('管理人员')), '报表点开应付职工薪酬应看到管理工费');
      const materialExplain = explainAccount('其中：原材料', ctx);
      assert(materialExplain.some((row) => row.label.includes('件')), '点开原材料应看到各材料件数和成本');
      const faCostExplain = explainAccount('固定资产原价', ctx);
      assert(faCostExplain.some((row) => row.label.includes('设备')), '点开固定资产原价应看到设备×单价');
      const cashExplain = explainAccount('货币资金', ctx);
      assert(cashExplain.some((row) => row.label.includes('月初现金')), '货币资金应按本月现金收支加总，而不是上下期对比');
      const adminExplain = explainAccount('减：管理费用', ctx);
      assert(adminExplain.some((row) => row.label.includes('管理人员') || row.label.includes('管理')), '点开管理费用应看到费用构成');
      const cfExplain = explainAccount('销售商品、提供劳务收到的现金', ctx);
      assert(cfExplain.length > 0, '现金流量表长科目名应能点开看到收款构成');
      assert(report.cashRows.some((row) => row.label === '期末现金'), '现金流量表展开应有期末现金');
      const reserve = state.surplusReserve ?? 0;
      if (np > 0) {
        assert(reserve === roundMoney(np * 0.1), `盈利月法定盈余公积应为净利润 10%，净利润 ${np} 公积 ${reserve}`);
      } else {
        assert(reserve === 0, `亏损月不应提取盈余公积，实际 ${reserve}`);
      }
      assert((state.accumDepMachines ?? 0) + (state.accumDepFactories ?? 0) > 0, '开业固定资产应从一月计提折旧');
      return state;
    }
    if (state.phase === 'board') {
      state = confirmBoard(state);
      continue;
    }
    if (state.phase === 'briefing') {
      state = reduce(state, { type: 'CONFIRM_BRIEFING' });
      continue;
    }
    if (state.phase === 'event') {
      state = reduce(state, { type: 'ACK_EVENT' });
      continue;
    }
    if (state.phase === 'actions') {
      state = reduce(state, { type: 'GO_PRODUCE' });
      continue;
    }
    if (state.phase === 'produce') {
      for (const order of state.monthOrders ?? []) {
        if (!(state.acceptedOrderIds ?? []).includes(order.id)) {
          state = reduce(state, { type: 'TOGGLE_ORDER', id: order.id });
        }
      }
      state = reduce(state, { type: 'SETTLE' });
      continue;
    }
    throw new Error(`Unexpected phase ${state.phase}`);
  }
  throw new Error('Did not reach first settlement');
}

function checkRdLabs(): void {
  assert(rdSuccessRate(0) === 0, '无人时成功率应为 0');
  assert(rdSuccessRate(1) === 0.3, '1 人成功率应为 30%');
  assert(rdSuccessRate(3) === 0.9, '3 人成功率应为 90% 上限');
  assert(rdSuccessRate(4) === 0.9, '超过 3 人仍应封顶 90%');
  assert(rdSuccessRate(1, 0.1) === 0.4, '失败经验应抬高小团队成功率');
  assert(rdSuccessRate(3, 0.1) === 1, '3 人失败后续攻应能到 100%');

  let state = confirmBoard(reduce(createInitialState(), { type: 'START_GAME' }));
  state = reduce(state, { type: 'CONFIRM_BRIEFING' });
  state = reduce(state, { type: 'ACK_EVENT' });
  assert(state.phase === 'actions', '应进入行动阶段');
  assert(state.maxAp === 3, `开局 1 名管理行动点上限应为 3，实际 ${state.maxAp}`);
  const mgmtLines = hireEffectLines(state, 'management');
  assert(mgmtLines[0]?.includes('每名管理人员'), `招管理应说明每人 +1 行动点，实际 ${mgmtLines[0]}`);
  assert(mgmtLines[0]?.includes('基础 2'), `招管理应说明基础 2 点，实际 ${mgmtLines[0]}`);
  const hiredMgmt = reduce(state, { type: 'HIRE', role: 'management' });
  assert(hiredMgmt.staff.management === 2, '应招入第二名管理');
  assert(hiredMgmt.maxAp === 4, `再招 1 名管理应把上限提到 4，实际 ${hiredMgmt.maxAp}`);
  assert(hiredMgmt.ap === state.ap, '本月剩余行动点不因招聘补发');
  const cash = state.cash;
  const ap = state.ap;
  const bought = reduce({ ...state, ap: 0 }, { type: 'BUY_MACHINE' });
  assert(bought.machines === state.machines + 1, '没有行动点也应能买设备');
  assert(bought.ap === 0, '买设备不应消耗行动点');
  const expanded = reduce({ ...state, ap: 0, cash: roundMoney(Math.max(state.cash, 20)) }, { type: 'EXPAND_FACTORY' });
  assert(expanded.factories === state.factories + 1, '没有行动点也应能扩建厂区');
  assert(expanded.ap === 0, '扩建厂区不应消耗行动点');
  const productLines = hireEffectLines(state, 'rd', 'product');
  assert(productLines[0]?.includes('产品实验室'), `招研发应说明编入产品实验室，实际 ${productLines[0]}`);
  assert(productLines[0]?.includes('成功率'), `招研发应说明人数只影响成功率，实际 ${productLines[0]}`);
  assert(productLines[1]?.includes('开题'), `开局产品课题应说明入职后开题，实际 ${productLines[1]}`);
  assert(!productLines.some((line) => line.includes('本次：')), `已开题信息不该在招聘说明里重复，实际 ${productLines.join(' / ')}`);

  const floor = lowestUnlockedMargin(state);
  state = reduce(state, { type: 'HIRE', role: 'rd', rdTrack: 'product' });
  assert(state.staff.rd === 1 && state.rdProductStaff === 1 && state.rdTechStaff === 0, '第一名研发应编入产品组');
  assert(state.rdProductProgress === 0, `入职不应推进进度，实际 ${state.rdProductProgress}`);
  assert(!state.rdProductDraft, '入职不应自动开题');
  {
    let packed = state;
    packed = reduce(packed, { type: 'HIRE', role: 'rd', rdTrack: 'product' });
    packed = reduce(packed, { type: 'HIRE', role: 'rd', rdTrack: 'product' });
    assert(packed.rdProductStaff === RD_STAFF_CAP, `产品组应能招满 ${RD_STAFF_CAP} 人`);
    const cashBefore = packed.cash;
    const blocked = reduce(packed, { type: 'HIRE', role: 'rd', rdTrack: 'product' });
    assert(blocked.rdProductStaff === RD_STAFF_CAP, '产品组第 4 人不应入职');
    assert(blocked.staff.rd === packed.staff.rd, '满员招聘不应增加编制');
    assert(blocked.cash === cashBefore, '满员招聘不应扣招聘费');
  }
  state = reduce(state, { type: 'OPEN_PRODUCT_RD', archetype: 'margin' });
  assert(state.rdProductDraft, '选定方向后应生成课题');
  assert(state.rdProductDraft?.name.endsWith('款'), `产品名应以款结尾，实际 ${state.rdProductDraft?.name}`);
  const hiredProductLines = hireEffectLines(state, 'rd', 'product');
  assert(
    !hiredProductLines.some((line) => line.includes('本次：') || line.includes('本月结算后')),
    `已开题信息不该在招聘说明里重复，实际 ${hiredProductLines.join(' / ')}`,
  );
  const draftCost = bomSpotCost(state, state.rdProductDraft!.bom);
  const draftMargin = roundMoney(state.rdProductDraft!.basePrice - draftCost);
  assert(draftMargin > floor, `新 BOM 毛利应高于现有最低档 ${floor}，实际 ${draftMargin}`);
  assert(state.cash === roundMoney(cash - HIRE_COST.rd), '研发招聘费应为 2 万');
  assert(state.ap === ap, '招聘不应消耗行动点');

  state.ap = 0;
  state = reduce(state, { type: 'HIRE', role: 'rd', rdTrack: 'tech', ipId: 'jig' });
  assert(state.rdProductStaff === 1 && state.rdTechStaff === 1, '第二名研发应编入工艺组');
  assert(state.rdTechProgress === 0, `工艺入职不应推进进度，实际 ${state.rdTechProgress}`);
  assert(state.rdTechProjectId === 'jig', '第一次编入工艺组时应选定工装夹具');
  assert(state.ap === 0, '没有行动点也应能招聘');

  state = reduce(state, { type: 'GO_PRODUCE' });
  for (const order of state.monthOrders ?? []) {
    const next = reduce(state, { type: 'TOGGLE_ORDER', id: order.id });
    if (next !== state) state = next;
  }
  state = reduce(state, { type: 'SETTLE' });
  assert(state.phase === 'report', '一月结算后应出报告');
  assert(state.rdProductProgress === 1, `一月结算后产品进度应为 1/3，实际 ${state.rdProductProgress}`);
  assert(state.rdTechProgress === 1, `一月结算后工艺进度应为 1/2，实际 ${state.rdTechProgress}`);
  assert((state.pendingRdReveals ?? []).length === 0, '满周期前不应弹出研发成果');
  state = assignPendingRd(state);
  state = reduce(state, { type: 'NEXT_MONTH' });
  if (state.phase === 'board') state = confirmBoard(state);
  if (state.phase === 'briefing') state = reduce(state, { type: 'CONFIRM_BRIEFING' });
  if (state.phase === 'event') state = reduce(state, { type: 'ACK_EVENT' });
  state = reduce(state, { type: 'GO_PRODUCE' });
  for (const order of state.monthOrders ?? []) {
    const next = reduce(state, { type: 'TOGGLE_ORDER', id: order.id });
    if (next !== state) state = next;
  }
  state = reduce(state, { type: 'SETTLE' });
  assert(state.rdProductProgress === 2, `二月结算后产品进度应为 2/3，实际 ${state.rdProductProgress}`);
  assert(state.rdTechProgress === 0, '工艺 2 个月周期应在二月结算时掷骰并清零进度');
  assert((state.pendingRdReveals ?? []).some((item) => item.track === 'tech'), '二月结算应弹出工艺研发成果');
  const techReveal = (state.pendingRdReveals ?? []).find((item) => item.track === 'tech');
  if (techReveal && !techReveal.success) {
    const stayed = reduce(state, { type: 'ASSIGN_RD_REVEAL', assign: { kind: 'retry' } });
    assert(stayed.rdTechProjectId === 'jig', '失败续攻应留下原课题');
    assert(stayed.rdTechFailBonus === RD_FAIL_BONUS, '失败续攻应保留成功率加成');
    const switched = reduce(state, { type: 'ASSIGN_RD_REVEAL', assign: { kind: 'tech', ipId: 'yield' } });
    assert(switched.rdTechProjectId === 'yield', '失败转题应换到新知识产权');
    assert(switched.rdTechFailBonus === 0, '转题应清掉失败加成');
    assert(switched.rdTechStaff === 1, '转题后工艺组人数不变');
  } else if (techReveal?.success) {
    const next = reduce(state, { type: 'ASSIGN_RD_REVEAL', assign: { kind: 'tech', ipId: 'yield' } });
    assert((next.ownedIps ?? []).includes('jig'), '成功后应留下已装备的工装夹具');
    assert(next.rdTechProjectId === 'yield', '成功后应立即开下一档工艺');
  }
  state = assignPendingRd(state);
}

function play(): GameState {
  let state = reduce(createInitialState(), { type: 'START_GAME' });
  let bounced = false;
  for (let i = 0; i < 120; i += 1) {
    if (state.phase === 'ended') return state;
    if ((state.pendingRdReveals ?? []).length > 0) {
      state = assignPendingRd(state);
      continue;
    }
    if (state.phase === 'board') {
      const fallback = {
        1: ['q1-sold30'],
        2: ['q2-machine'],
        3: ['q3-rd'],
        4: ['q4-flagship'],
      }[state.quarter]!;
      const pool = (state.challengePoolIds ?? []).filter((id) => id.startsWith(`q${state.quarter}-`));
      const id = (pool[0] ?? fallback[0])!;
      if (!state.challengeDraft.includes(id)) state = reduce(state, { type: 'TOGGLE_BOARD_GOAL', id });
      state = reduce(state, { type: 'CONFIRM_BOARD' });
      continue;
    }
    if (state.phase === 'briefing') {
      state = reduce(state, { type: 'CONFIRM_BRIEFING' });
      continue;
    }
    if (state.phase === 'event') {
      state = reduce(state, { type: 'ACK_EVENT' });
      continue;
    }
    if (state.phase === 'actions') {
      if (state.ap > 0 && state.cash > 80) {
        const qty = Math.min(20, state.materialSpot?.a ?? 0);
        if (qty > 0) state = reduce(state, { type: 'BUY_MATERIAL', material: 'a', qty });
      }
      if (state.ap > 0 && state.cash > 80) {
        const qty = Math.min(10, state.materialSpot?.b ?? 0);
        if (qty > 0) state = reduce(state, { type: 'BUY_MATERIAL', material: 'b', qty });
      }
      if ((state.cardsBoughtThisMonth ?? 0) === 0 && state.shop[0]) {
        const replaceUid = state.hand.length >= 5 ? state.hand[0]?.uid : undefined;
        state = reduce(state, { type: 'BUY_CARD', index: 0, replaceUid });
      }
      const ready = state.hand.find((card) => (card.readyMonth ?? 0) <= state.month);
      if (ready && state.ap > 0 && state.cash > 40) {
        state = reduce(state, { type: 'PLAY_CARD', uid: ready.uid });
      }
      state = reduce(state, { type: 'GO_PRODUCE' });
      continue;
    }
    if (state.phase === 'produce') {
      if (!bounced) {
        // 验证新增的取消排产路径：排产 → 返回经营 → 再进入排产
        state = reduce(state, { type: 'BACK_TO_ACTIONS' });
        if (state.phase !== 'actions') throw new Error('BACK_TO_ACTIONS did not return to actions');
        state = reduce(state, { type: 'GO_PRODUCE' });
        if (state.phase !== 'produce') throw new Error('GO_PRODUCE did not re-enter produce');
        bounced = true;
      }
      for (const order of state.monthOrders ?? []) {
        if (!(state.acceptedOrderIds ?? []).includes(order.id)) {
          state = reduce(state, { type: 'TOGGLE_ORDER', id: order.id });
        }
      }
      state = reduce(state, { type: 'SETTLE' });
      continue;
    }
    if (state.phase === 'report') {
      while ((state.pendingRdReveals ?? []).length > 0) {
        state = assignPendingRd(state);
      }
      state = reduce(state, { type: 'NEXT_MONTH' });
      continue;
    }
    throw new Error(`Stuck in phase ${state.phase}`);
  }
  throw new Error('Loop exceeded');
}

function checkSupplyChannels(): void {
  assert(IP_LEAN_RATE === 0.5, `节材应为五折，实际 ${IP_LEAN_RATE}`);
  let state = confirmBoard(reduce(createInitialState(), { type: 'START_GAME' }));
  state = reduce(state, { type: 'CONFIRM_BRIEFING' });
  state = reduce(state, { type: 'ACK_EVENT' });
  const traderA = traderOf(state, 'a');
  assert(traderA >= 4 && traderA <= 16, `开局贸易商钢材应在 4–16，实际 ${traderA}`);
  const beforeMat = state.materials.a;
  const beforeCash = state.cash;
  const beforeAp = state.ap;
  const buyQty = Math.min(4, traderA);
  state = reduce(state, { type: 'BUY_MATERIALS', items: [{ material: 'a', qty: buyQty, channel: 'trader' }] });
  assert(state.materials.a === beforeMat + buyQty, `贸易商采购应入库 ${buyQty}，实际 ${state.materials.a - beforeMat}`);
  assert(state.cash < beforeCash, '贸易商采购应付现');
  assert(state.ap === beforeAp - 1, 'Q1 贸易商采购应耗 AP');

  state = confirmBoard(reduce(createInitialState(), { type: 'START_GAME' }));
  state = reduce(state, { type: 'CONFIRM_BRIEFING' });
  state = reduce(state, { type: 'ACK_EVENT' });
  const beforeSpot = { ...state.materialSpot };
  const lines = hireEffectLines(state, 'procurement');
  assert(lines[0]?.includes('现货'), `招采购应说明放宽额度，实际 ${lines[0]}`);
  state = reduce(state, { type: 'HIRE', role: 'procurement' });
  assert(state.staff.procurement === 1, '应招到 1 名采购');
  const bumped = (['a', 'b', 'c'] as const).some((id) => (state.materialSpot[id] ?? 0) > (beforeSpot[id] ?? 0));
  assert(bumped, '入职当月应放宽至少一种现货');

  state = confirmBoard(reduce(createInitialState(), { type: 'START_GAME' }));
  state = reduce(state, { type: 'CONFIRM_BRIEFING' });
  state = reduce(state, { type: 'ACK_EVENT' });
  const cash = state.cash;
  const ap = state.ap;
  state = reduce(state, { type: 'SIGN_CONTRACT', material: 'a', monthlyQty: 4 });
  assert(state.supplyContract?.material === 'a', '应签下钢材协议');
  assert(state.supplyContract?.remainingMonths === 3, '协议应覆盖未来 3 个月');
  assert(state.prepaid > 0, '预付应记资产');
  assert(state.cash < cash, '签约应付预付');
  assert(state.ap === ap - 1, '签约应耗 1 AP');

  const leanNeed = unitsNeeded({ ...createInitialState(), ownedIps: ['lean'] }, 'basic', 10);
  assert(leanNeed.a === 10 && leanNeed.b === 5, `节材五折后 10 件基础款应为 10 钢 5 塑，实际 ${leanNeed.a}/${leanNeed.b}`);
}

function checkHirePay(): void {
  let state = confirmBoard(reduce(createInitialState(), { type: 'START_GAME' }));
  state = reduce(state, { type: 'CONFIRM_BRIEFING' });
  state = reduce(state, { type: 'ACK_EVENT' });
  const cash = state.cash;
  const production = reduce(state, { type: 'HIRE', role: 'production' });
  assert(production.staff.production === state.staff.production + 1, '应能招聘生产人员');
  assert(production.cash === cash, '生产人员不应收招聘费');
  const management = reduce(state, { type: 'HIRE', role: 'management' });
  assert(management.cash === roundMoney(cash - HIRE_COST.management), '管理人员招聘费应等于一个月工资');
  assert(HIRE_COST.management === SALARY.management, '管理人员招聘费应等于月薪');
  const sales = reduce(state, { type: 'HIRE', role: 'sales' });
  assert(sales.cash === roundMoney(cash - HIRE_COST.sales), '销售人员招聘费应等于一个月工资');
  const procurement = reduce(state, { type: 'HIRE', role: 'procurement' });
  assert(procurement.cash === roundMoney(cash - HIRE_COST.procurement), '采购人员招聘费应等于一个月工资');
  assert(HIRE_COST.rd === 2, '研发招聘费应为 2 万');
}

function checkArOverdue(): void {
  assert(arRecoveryRate(1, 0) === 0.3, '逾期首月底表应为 30%');
  assert(arRecoveryRate(2, 0) === 0.2, '逾期次月底表应为 20%');
  assert(arRecoveryRate(3, 0) === 0.15, '逾期第三月底表应为 15%');
  assert(arRecoveryRate(1, 1) === 0.35, '1 名销售应使首月追回 35%');
  assert(arRecoveryRate(1, 40) === 1, '追回比例应封顶 100%');
  assert(arCreditLossRate(-1, false) === 0.05, '未到期坏账准备应为 5%');
  assert(arCreditLossRate(0, true) === 0.2, '刚逾期坏账准备应为 20%');
  assert(arCreditLossRate(1, true) === 0.4, '催收第 1 个月坏账准备应为 40%');
  assert(arCreditLossRate(2, true) === 0.7, '催收第 2 个月坏账准备应为 70%');
  assert(arCreditLossRate(3, true) === 1, '催收第 3 个月坏账准备应为 100%');

  const orig = Math.random;
  let state = reduce(createInitialState(), { type: 'START_GAME' });
  state.month = 2;
  state.receivables = [{ amount: 10, originMonth: 1, dueMonth: 2 }];
  Math.random = () => 0.5;
  const paid = collectReceivables(state, 0, true);
  Math.random = orig;
  assert(paid === 10, `到期未逾期应整笔收回，实际 ${paid}`);
  assert((state.receivables ?? []).length === 0, '按时结清后应收应清空');

  state = reduce(createInitialState(), { type: 'START_GAME' });
  state.month = 2;
  state.receivables = [{ amount: 10, originMonth: 1, dueMonth: 2 }];
  Math.random = () => 0;
  const missed = collectReceivables(state, 0, true);
  Math.random = orig;
  assert(missed === 0, `刚确认逾期当月不应催收，实际 ${missed}`);
  assert(state.receivables[0]?.overdue === true && state.receivables[0]?.amount === 10, '逾期应留下整笔');

  state.month = 3;
  const first = collectReceivables(state, 0, true);
  assert(first === 3, `逾期首月底表应追回 30%，实际 ${first}`);
  assert(state.receivables[0]?.amount === 7, `逾期首月后余额应为 7，实际 ${state.receivables[0]?.amount}`);

  state.staff.sales = 2;
  state.month = 4;
  const second = collectReceivables(state, 0, true);
  assert(second === 2.1, `2 名销售逾期次月应追回 30%，实际 ${second}`);

  state = reduce(createInitialState(), { type: 'START_GAME' });
  state.month = 2;
  state.receivables = [{ amount: 10, originMonth: 1, dueMonth: 2 }];
  Math.random = () => 0;
  const forced = collectReceivables(state, 1, true);
  Math.random = orig;
  assert(forced === 10, `催收提案应在到期月整笔收回，实际 ${forced}`);
  assert(AR_OVERDUE_CHANCE === 0.1, '到期逾期概率应为 10%');
}

checkOpeningAccounts();
checkLoans();
checkSupplyChannels();
checkBoardVariety();
checkMarketQuotes();
checkSalesOrders();
checkPurchaseLots();
checkFactoryLayout();
checkSpotPurchase();
checkProposals();
checkRdLabs();
checkHirePay();
checkArOverdue();
settleFirstMonth();

const result = play();
if (result.phase !== 'ended' || !result.endKind) {
  throw new Error(`Unexpected end state: ${result.phase} ${result.endKind}`);
}
console.log(
  JSON.stringify(
    {
      endKind: result.endKind,
      month: result.month,
      cash: result.cash,
      debt: result.debt,
      machines: result.machines,
      staff: result.staff,
      products: result.unlockedProducts,
    },
    null,
    2,
  ),
);
