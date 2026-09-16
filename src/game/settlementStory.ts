import { FACTORY_UPKEEP, ROLES, SALARY } from './data';
import { ROLE_LABEL, money, roundMoney } from './format';
import type { GameState, MonthBooks, MonthLedger, Role, SettleRow, SettlementFacts, SettlementWage } from './types';

function occurred(...values: number[]): boolean {
  return values.some((value) => Math.abs(value) > 1e-6);
}

function leftover(total: number, ...parts: number[]): number {
  return roundMoney(total - parts.reduce((sum, part) => sum + part, 0));
}

function wageOf(facts: SettlementFacts, role: Role): SettlementWage {
  return facts.wages.find((item) => item.role === role) ?? { role, count: 0, unit: 0, total: 0 };
}

function wageDetail(item: SettlementWage): string {
  if (item.count <= 0) return `${ROLE_LABEL[item.role]}人员 0 人`;
  return `${ROLE_LABEL[item.role]}人员 ${item.count} 人 × 月薪 ${money(item.unit)}，小计 ${money(item.total)}`;
}

function push(
  rows: SettleRow[],
  row: Omit<SettleRow, 'level'> & { level?: 0 | 1 | 2 },
  always = false,
): void {
  if (!always && row.value != null && !occurred(row.value)) return;
  rows.push({ level: 0, ...row });
}

function toneOf(value: number, invert = false): SettleRow['tone'] {
  if (!occurred(value)) return 'mute';
  const good = invert ? value < 0 : value > 0;
  return good ? 'good' : 'bad';
}

function inventoryNet(books: MonthBooks): number {
  return roundMoney((books.inventory ?? 0) - (books.inventoryProvision ?? 0));
}

function arNet(books: MonthBooks): number {
  return books.receivablesNet ?? roundMoney((books.receivables ?? 0) - (books.badDebtProvision ?? 0));
}

function investCf(ledger: MonthLedger): number {
  return roundMoney(-ledger.cfCapex);
}

function financeCf(ledger: MonthLedger): number {
  return roundMoney(ledger.cfBorrow - ledger.cfRepay - ledger.cfInterest);
}

function cashChange(ledger: MonthLedger): number {
  return roundMoney(
    ledger.cfSales - ledger.cfBuy - ledger.cfEmployees - ledger.cfTaxes + ledger.cfOtherOpIn - ledger.cfOtherOpOut + investCf(ledger) + financeCf(ledger),
  );
}

function skuSoldLine(facts: SettlementFacts): string {
  const sold = facts.skus.filter((sku) => sku.sold > 0);
  if (!sold.length) return '本月没有售出成品';
  return sold.map((sku) => `${sku.name} ${sku.sold}件 × ${money(sku.unitPrice)}`).join('；');
}

export function buildPnlRows(
  facts: SettlementFacts,
  ledger: MonthLedger,
  operatingProfit: number,
  profitBeforeTax: number,
  netProfit: number,
): SettleRow[] {
  const rows: SettleRow[] = [];
  const production = wageOf(facts, 'production');
  const sales = wageOf(facts, 'sales');
  const management = wageOf(facts, 'management');
  const procurement = wageOf(facts, 'procurement');
  const rd = wageOf(facts, 'rd');
  const skuRevenue = roundMoney(facts.skus.reduce((sum, sku) => sum + sku.revenue, 0));
  const skuCogs = roundMoney(facts.skus.reduce((sum, sku) => sum + sku.cogs, 0));
  const materialIn = roundMoney(facts.skus.reduce((sum, sku) => sum + sku.materialIn, 0));
  const conversionIn = roundMoney(facts.skus.reduce((sum, sku) => sum + sku.conversionIn, 0));
  const otherRevenue = leftover(ledger.revenue, skuRevenue);
  const otherCogs = leftover(ledger.cogs, skuCogs);
  const dep = roundMoney(facts.machineDep + facts.factoryDep);

  push(rows, { label: '营业收入', value: ledger.revenue, tone: 'good' }, true);
  for (const sku of facts.skus) {
    if (!occurred(sku.revenue) && sku.sold <= 0) continue;
    push(rows, {
      label: `${sku.name} ${sku.sold}件`,
      detail: `单价 ${money(sku.unitPrice)}`,
      value: sku.revenue,
      tone: 'good',
      level: 1,
    });
  }
  if (occurred(facts.cashSales, facts.creditSales) && occurred(skuRevenue)) {
    push(rows, {
      label: '其中现销',
      detail: '本月货款当场进现金',
      value: facts.cashSales,
      tone: 'good',
      level: 1,
    }, true);
    push(rows, {
      label: '其中赊销',
      detail: '记入应收账款，账期内再收回',
      value: facts.creditSales,
      tone: 'mute',
      level: 1,
    }, true);
  }
  push(rows, { label: '其他营业收入', detail: '清库、事项等', value: otherRevenue, tone: 'good', level: 1 });

  push(rows, { label: '减：营业成本', value: -ledger.cogs, tone: 'bad' });
  for (const sku of facts.skus) {
    if (!occurred(sku.cogs) && sku.sold <= 0) continue;
    push(rows, {
      label: `售出 ${sku.name} ${sku.sold}件`,
      detail: sku.openingQty > 0 ? '按存货账面结转，含期初库存' : '按存货账面结转',
      value: -sku.cogs,
      tone: 'bad',
      level: 1,
    });
  }
  push(rows, { label: '其他出库成本', detail: '清库等', value: -otherCogs, tone: 'bad', level: 1 });

  if (facts.produced && occurred(materialIn, conversionIn)) {
    push(rows, {
      label: '本月新投入产成品',
      detail: '先入存货；售出后才进营业成本，未售出留在库存',
      level: 1,
    }, true);
    push(rows, {
      label: '可变成本 · 材料',
      detail: facts.skus
        .filter((sku) => sku.produced > 0)
        .map((sku) => `${sku.name} ${sku.produced}件 ${money(sku.materialIn)}`)
        .join('；') || '无',
      level: 2,
    }, true);
    push(rows, {
      label: '固定成本 · 转入产成品',
      detail: [wageDetail(production), `设备折旧 ${money(facts.machineDep)}`, `厂区折旧 ${money(facts.factoryDep)}`, `厂区维护 ${facts.factories}座 × ${money(FACTORY_UPKEEP)}`].join('；'),
      level: 2,
    }, true);
  } else if (facts.settled !== false && !facts.produced) {
    push(rows, {
      label: '本月未投产',
      detail: `生产工费、折旧 ${money(dep)}、厂区维护 ${money(facts.upkeep)} 记入管理费用，不进产成品`,
      level: 1,
    }, true);
  }

  const leftoverQty = facts.skus.reduce((sum, sku) => sum + sku.leftover, 0);
  if (leftoverQty > 0) {
    push(rows, {
      label: '未售出成品',
      detail: facts.skus.filter((sku) => sku.leftover > 0).map((sku) => `${sku.name} ${sku.leftover}件`).join('；') + '，留在存货',
      level: 1,
    }, true);
  }

  push(rows, { label: '减：税金及附加', value: -ledger.taxes, tone: 'bad' });

  const otherSelling = leftover(ledger.selling, sales.total);
  push(rows, { label: '减：销售费用', value: -ledger.selling, tone: 'bad' });
  if (sales.count > 0 || occurred(sales.total)) {
    push(rows, { label: wageDetail(sales), value: -sales.total, tone: 'bad', level: 1 });
  }
  push(rows, { label: '其他销售支出', value: -otherSelling, tone: 'bad', level: 1 });

  const idleFixed = facts.settled !== false && !facts.produced ? roundMoney(production.total + dep + facts.upkeep) : 0;
  const otherAdmin = leftover(ledger.admin, management.total, procurement.total, idleFixed);
  push(rows, {
    label: '减：管理费用',
    detail: facts.settled === false ? '月结前已入账部分，含已计提工资；折旧和厂维待结算' : undefined,
    value: -ledger.admin,
    tone: 'bad',
  });
  if (management.count > 0 || occurred(management.total)) {
    push(rows, { label: wageDetail(management), value: -management.total, tone: 'bad', level: 1 });
  }
  if (procurement.count > 0 || occurred(procurement.total)) {
    push(rows, { label: wageDetail(procurement), value: -procurement.total, tone: 'bad', level: 1 });
  }
  if (facts.settled !== false && !facts.produced && occurred(idleFixed)) {
    push(rows, {
      label: '未投产的固定支出',
      detail: [production.count > 0 ? wageDetail(production) : '', occurred(dep) ? `折旧 ${money(dep)}` : '', occurred(facts.upkeep) ? `厂区维护 ${facts.factories}座 ${money(facts.upkeep)}` : '']
        .filter(Boolean)
        .join('；'),
      value: -idleFixed,
      tone: 'bad',
      level: 1,
    });
  }
  push(rows, { label: '其他管理支出', detail: '招聘费、事项、加价采购等', value: -otherAdmin, tone: 'bad', level: 1 });

  const otherRd = leftover(ledger.rd ?? 0, rd.total);
  push(rows, { label: '减：研发费用', value: -(ledger.rd ?? 0), tone: 'bad' });
  if (rd.count > 0 || occurred(rd.total)) {
    const labs =
      facts.rdProductStaff + facts.rdTechStaff > 0
        ? `产品实验室 ${facts.rdProductStaff} 人，工艺实验室 ${facts.rdTechStaff} 人`
        : undefined;
    push(rows, { label: wageDetail(rd), detail: labs, value: -rd.total, tone: 'bad', level: 1 });
  }
  push(rows, { label: '其他研发支出', value: -otherRd, tone: 'bad', level: 1 });

  push(rows, { label: '减：财务费用', value: -ledger.finance, tone: 'bad' });
  push(rows, { label: '短期借款利息', value: -facts.interest, tone: 'bad', level: 1 });
  const otherFinance = leftover(ledger.finance, facts.interest);
  push(rows, { label: '其他财务费用', value: -otherFinance, tone: 'bad', level: 1 });

  push(rows, { label: '减：信用减值损失', detail: '补提坏账准备', value: -(ledger.creditImpairment ?? 0), tone: 'bad' });
  push(rows, { label: '加：坏账准备转回', detail: '收回或核销后转回多提的准备', value: ledger.creditReversal ?? 0, tone: 'good' });
  push(rows, {
    label: '减：资产减值损失',
    detail: '存货跌价准备变动；负数表示转回',
    value: -(ledger.assetImpairment ?? 0),
    tone: (ledger.assetImpairment ?? 0) >= 0 ? 'bad' : 'good',
  });

  push(rows, { label: '营业利润', value: operatingProfit, tone: toneOf(operatingProfit), total: true }, true);
  push(rows, { label: '加：营业外收入', value: ledger.extraIncome, tone: 'good' });
  const extraBits = [
    occurred(facts.defaultFee) ? `借款违约金 ${money(facts.defaultFee)}` : '',
    occurred(facts.lateFee) ? `滞纳金 ${money(facts.lateFee)}` : '',
    occurred(facts.contractPenalty) ? `合同违约金 ${money(facts.contractPenalty)}` : '',
  ].filter(Boolean);
  const otherExtra = leftover(ledger.extraExpense, facts.defaultFee, facts.lateFee, facts.contractPenalty);
  push(rows, { label: '减：营业外支出', detail: extraBits.join('；') || undefined, value: -ledger.extraExpense, tone: 'bad' });
  push(rows, { label: '其他营业外支出', value: -otherExtra, tone: 'bad', level: 1 });
  push(rows, { label: '利润总额', value: profitBeforeTax, tone: toneOf(profitBeforeTax), total: true }, true);
  push(rows, {
    label: '减：所得税费用',
    detail: profitBeforeTax > 0 ? '利润总额 × 25%，亏损不征税' : '本月亏损，不征所得税',
    value: -(ledger.incomeTax ?? 0),
    tone: 'bad',
  });
  push(rows, { label: '净利润', value: netProfit, tone: toneOf(netProfit), total: true }, true);
  push(rows, {
    label: '提取法定盈余公积',
    detail: '净利润的 10%，累计不超过实收资本的 50%',
    value: -facts.reserve,
    tone: 'mute',
  });
  return rows;
}

export function buildBalanceRows(prev: MonthBooks, curr: MonthBooks, facts: SettlementFacts): SettleRow[] {
  const rows: SettleRow[] = [];
  const prevAr = prev.receivables ?? 0;
  const currAr = curr.receivables ?? 0;
  const expectedAr = roundMoney(prevAr + facts.creditSales - facts.arCollected - facts.arWritten);
  push(rows, { label: '资产', level: 0 }, true);
  push(rows, {
    label: '货币资金',
    detail: `期初 ${money(prev.cash)} → 期末 ${money(curr.cash)}`,
    value: curr.cash,
    tone: toneOf(curr.cash - prev.cash),
    level: 1,
  }, true);
  push(rows, {
    label: '应收账款',
    detail: `期初 ${money(prevAr)} + 本月赊销 ${money(facts.creditSales)} − 收回 ${money(facts.arCollected)}${occurred(facts.arWritten) ? ` − 核销 ${money(facts.arWritten)}` : ''}${occurred(expectedAr - currAr) ? `（账面 ${money(currAr)}）` : ''}`,
    value: currAr,
    tone: 'mute',
    level: 1,
  }, true);
  push(rows, {
    label: '减：坏账准备',
    detail: `期初 ${money(prev.badDebtProvision ?? 0)} → 期末 ${money(curr.badDebtProvision ?? 0)}`,
    value: -(curr.badDebtProvision ?? 0),
    tone: 'bad',
    level: 2,
  });
  push(rows, { label: '应收账款账面价值', value: arNet(curr), total: true, level: 1 }, true);
  push(rows, {
    label: '存货',
    detail: `期初 ${money(prev.inventory)} → 期末 ${money(curr.inventory)}`,
    value: curr.inventory,
    level: 1,
  }, true);
  push(rows, { label: '其中：原材料', value: curr.materials ?? 0, tone: 'mute', level: 2 });
  push(rows, { label: '其中：在产品', value: curr.wip ?? 0, tone: 'mute', level: 2 });
  push(rows, { label: '其中：库存商品', value: curr.finished ?? 0, tone: 'mute', level: 2 });
  push(rows, {
    label: '减：存货跌价准备',
    value: -(curr.inventoryProvision ?? 0),
    tone: 'bad',
    level: 2,
  });
  push(rows, { label: '存货账面价值', value: inventoryNet(curr), total: true, level: 1 }, true);
  push(rows, { label: '预付账款', value: curr.prepaid ?? 0, level: 1 });
  push(rows, {
    label: '固定资产原价',
    detail: `设备 ${facts.machines}台、厂区 ${facts.factories}座`,
    value: curr.fixedAssetCost ?? curr.fixedAssets,
    level: 1,
  }, true);
  push(rows, {
    label: '减：累计折旧',
    detail: `本月计提设备 ${money(facts.machineDep)}、厂区 ${money(facts.factoryDep)}`,
    value: -(curr.accumDep ?? 0),
    tone: 'bad',
    level: 2,
  }, true);
  push(rows, { label: '固定资产账面价值', value: curr.fixedAssets, total: true, level: 1 }, true);
  const assetTotal = roundMoney(curr.cash + arNet(curr) + inventoryNet(curr) + (curr.prepaid ?? 0) + curr.fixedAssets);
  push(rows, { label: '资产合计', value: assetTotal, total: true }, true);

  const currPay = curr.wagesPayable ?? 0;
  const currTax = curr.taxPayable ?? 0;
  const liab = roundMoney(curr.borrowings + currPay + currTax);
  push(rows, { label: '负债', level: 0 }, true);
  push(rows, {
    label: '短期借款',
    detail: `期初 ${money(prev.borrowings)} → 期末 ${money(curr.borrowings)}`,
    value: curr.borrowings,
    tone: curr.borrowings > 0 ? 'bad' : 'mute',
    level: 1,
  });
  push(rows, {
    label: '应付职工薪酬',
    detail: '月薪先计提，结算时按现金支付',
    value: currPay,
    tone: currPay > 0 ? 'bad' : 'mute',
    level: 1,
  });
  push(rows, { label: '应交税费', value: currTax, tone: currTax > 0 ? 'bad' : 'mute', level: 1 });
  push(rows, { label: '负债合计', value: liab, total: true, tone: liab > 0 ? 'bad' : 'mute' }, true);

  push(rows, { label: '所有者权益', level: 0 }, true);
  push(rows, { label: '实收资本', value: curr.paidInCapital ?? 0, level: 1 }, true);
  push(rows, {
    label: '盈余公积',
    detail: occurred(facts.reserve) ? `本月提取 ${money(facts.reserve)}` : '本月未提取',
    value: curr.surplusReserve ?? 0,
    level: 1,
  }, true);
  push(rows, {
    label: '未分配利润',
    detail: `期初 ${money(prev.retainedEarnings ?? prev.equity)} → 期末 ${money(curr.retainedEarnings ?? curr.equity)}`,
    value: curr.retainedEarnings ?? curr.equity,
    level: 1,
  }, true);
  push(rows, { label: '所有者权益合计', value: curr.equity, total: true }, true);
  push(rows, { label: '净资产', detail: '资产合计 − 负债合计', value: roundMoney(assetTotal - liab), total: true }, true);
  return rows.map((row) => (row.value == null ? row : { ...row, signed: false }));
}

export function buildCashRows(facts: SettlementFacts, ledger: MonthLedger, endingCash: number, operatingCash: number): SettleRow[] {
  const rows: SettleRow[] = [];
  const otherSales = leftover(ledger.cfSales, facts.cashSales, facts.arCollected);
  const change = cashChange(ledger);

  push(rows, { label: '经营活动产生的现金流量', level: 0 }, true);
  push(rows, { label: '销售商品收到的现金', value: ledger.cfSales, tone: 'good', level: 1 });
  push(rows, { label: '本月现销', detail: skuSoldLine(facts), value: facts.cashSales, tone: 'good', level: 2 });
  push(rows, { label: '收回以前应收账款', value: facts.arCollected, tone: 'good', level: 2 });
  push(rows, { label: '其他销售收款', value: otherSales, tone: 'good', level: 2 });
  push(rows, { label: '购买商品支付的现金', detail: '采购原材料等', value: -ledger.cfBuy, tone: 'bad', level: 1 });
  push(rows, {
    label: '支付给职工的现金',
    detail: facts.wages
      .filter((item) => item.count > 0)
      .map((item) => `${ROLE_LABEL[item.role]} ${item.count}人`)
      .join('、') || '本月无人在册',
    value: -ledger.cfEmployees,
    tone: 'bad',
    level: 1,
  });
  push(rows, { label: '支付的各项税费', value: -ledger.cfTaxes, tone: 'bad', level: 1 });
  push(rows, { label: '收到其他经营现金', value: ledger.cfOtherOpIn, tone: 'good', level: 1 });
  push(rows, {
    label: '支付其他经营现金',
    detail: facts.produced ? `含厂区维护 ${money(facts.upkeep)} 等` : undefined,
    value: -ledger.cfOtherOpOut,
    tone: 'bad',
    level: 1,
  });
  push(rows, { label: '经营活动现金流量净额', value: operatingCash, tone: toneOf(operatingCash), total: true }, true);

  if (occurred(ledger.cfCapex)) {
    push(rows, { label: '投资活动产生的现金流量', level: 0 }, true);
    push(rows, { label: '购建固定资产支付的现金', detail: '买设备、扩建厂区', value: -ledger.cfCapex, tone: 'bad', level: 1 });
    push(rows, { label: '投资活动现金流量净额', value: investCf(ledger), tone: toneOf(investCf(ledger)), total: true }, true);
  }

  if (occurred(ledger.cfBorrow, ledger.cfRepay, ledger.cfInterest)) {
    push(rows, { label: '筹资活动产生的现金流量', level: 0 }, true);
    push(rows, { label: '取得借款收到的现金', value: ledger.cfBorrow, tone: 'good', level: 1 });
    push(rows, { label: '偿还债务支付的现金', value: -ledger.cfRepay, tone: 'bad', level: 1 });
    push(rows, { label: '偿付利息支付的现金', value: -ledger.cfInterest, tone: 'bad', level: 1 });
    push(rows, { label: '筹资活动现金流量净额', value: financeCf(ledger), tone: toneOf(financeCf(ledger)), total: true }, true);
  }

  push(rows, { label: '现金及现金等价物净增加额', value: change, tone: toneOf(change), total: true }, true);
  push(rows, { label: '加：期初现金', value: ledger.openingCash, tone: 'mute', signed: false }, true);
  push(rows, { label: '期末现金', value: endingCash, tone: toneOf(endingCash), total: true, signed: false }, true);
  return rows;
}

export function liveFacts(state: GameState): SettlementFacts {
  return {
    skus: [],
    wages: ROLES.map((role) => ({
      role,
      count: state.staff[role] ?? 0,
      unit: SALARY[role],
      total: state.wagesAccruedByRole?.[role] ?? 0,
    })),
    rdProductStaff: state.rdProductStaff ?? 0,
    rdTechStaff: state.rdTechStaff ?? 0,
    produced: false,
    settled: false,
    factories: state.factories,
    machines: state.machines,
    machineDep: 0,
    factoryDep: 0,
    upkeep: roundMoney(state.factories * FACTORY_UPKEEP),
    cashSales: 0,
    creditSales: 0,
    arCollected: 0,
    arWritten: 0,
    interest: 0,
    defaultFee: 0,
    lateFee: 0,
    contractPenalty: 0,
    taxPaid: 0,
    reserve: 0,
  };
}

export function storyChildren(rows: SettleRow[], label: string): SettleRow[] {
  const index = rows.findIndex((row) => row.label === label);
  if (index < 0) return [];
  const parent = rows[index]!;
  const level = parent.level ?? 0;
  const out: SettleRow[] = [];
  if (parent.detail) out.push({ label: parent.detail, level: Math.min(2, level + 1) as 1 | 2 });
  for (let i = index + 1; i < rows.length; i += 1) {
    const row = rows[i]!;
    if ((row.level ?? 0) <= level) break;
    out.push(row);
  }
  return out;
}
