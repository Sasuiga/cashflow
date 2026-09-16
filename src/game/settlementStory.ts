import {
  FACTORY_COST,
  FACTORY_UPKEEP,
  INCOME_TAX_RATE,
  MACHINE_COST,
  MATERIAL_IDS,
  ROLES,
  SALARY,
  arCreditLossRate,
  catalogOf,
  inventoryWriteDownRate,
} from './data';
import { ROLE_LABEL, materialName, money, pctLabel, productName, roundMoney } from './format';
import type { GameState, MonthBooks, MonthLedger, ProductId, Role, SettleRow, SettlementFacts, SettlementWage } from './types';

function occurred(...values: number[]): boolean {
  return values.some((value) => Math.abs(value) > 1e-6);
}

function leftover(total: number, ...parts: number[]): number {
  return roundMoney(total - parts.reduce((sum, part) => sum + part, 0));
}

function wageOf(facts: SettlementFacts, role: Role): SettlementWage {
  return facts.wages.find((item) => item.role === role) ?? { role, count: 0, unit: 0, total: 0 };
}

function wageHeads(item: SettlementWage): number {
  if (item.unit > 0 && occurred(item.total)) {
    const implied = item.total / item.unit;
    const rounded = roundMoney(implied);
    if (Math.abs(implied - rounded) < 1e-6 && rounded > 0) return rounded;
  }
  return item.count;
}

function wageDetail(item: SettlementWage): string {
  const heads = wageHeads(item);
  if (heads <= 0) return `${ROLE_LABEL[item.role]}人员 0 人`;
  return `${ROLE_LABEL[item.role]}人员 ${heads} 人 × 月薪 ${money(item.unit)}，小计 ${money(item.total)}`;
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

function opProfit(ledger: MonthLedger): number {
  return roundMoney(
    ledger.revenue -
      ledger.cogs -
      ledger.taxes -
      ledger.selling -
      ledger.admin -
      (ledger.rd ?? 0) -
      ledger.finance -
      (ledger.creditImpairment ?? 0) +
      (ledger.creditReversal ?? 0) -
      (ledger.assetImpairment ?? 0),
  );
}

function pbtOf(ledger: MonthLedger): number {
  return roundMoney(opProfit(ledger) + ledger.extraIncome - ledger.extraExpense);
}

function npOf(ledger: MonthLedger): number {
  return roundMoney(pbtOf(ledger) - (ledger.incomeTax ?? 0));
}

function operatingCash(ledger: MonthLedger): number {
  return roundMoney(
    ledger.cfSales - ledger.cfBuy - ledger.cfEmployees - ledger.cfTaxes + ledger.cfOtherOpIn - ledger.cfOtherOpOut,
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
    value: curr.cash,
    tone: toneOf(curr.cash - prev.cash),
    level: 1,
  }, true);
  push(rows, {
    label: '应收账款',
    detail: [
      occurred(facts.creditSales) ? `本月赊销 ${money(facts.creditSales)}` : '',
      occurred(facts.arCollected) ? `收回 ${money(facts.arCollected)}` : '',
      occurred(facts.arWritten) ? `核销 ${money(facts.arWritten)}` : '',
      occurred(expectedAr - currAr) ? `账面 ${money(currAr)}` : '',
    ]
      .filter(Boolean)
      .join('，') || undefined,
    value: currAr,
    tone: 'mute',
    level: 1,
  }, true);
  push(rows, {
    label: '减：坏账准备',
    value: -(curr.badDebtProvision ?? 0),
    tone: 'bad',
    level: 2,
  });
  push(rows, { label: '应收账款账面价值', value: arNet(curr), total: true, level: 1 }, true);
  push(rows, {
    label: '存货',
    detail: `原材料 ${money(curr.materials ?? 0)} + 在产品 ${money(curr.wip ?? 0)} + 库存商品 ${money(curr.finished ?? 0)}`,
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
  push(rows, {
    label: '固定资产账面价值',
    detail: `原价 ${money(curr.fixedAssetCost ?? curr.fixedAssets)} − 累计折旧 ${money(curr.accumDep ?? 0)}`,
    value: curr.fixedAssets,
    total: true,
    level: 1,
  }, true);
  const assetTotal = roundMoney(curr.cash + arNet(curr) + inventoryNet(curr) + (curr.prepaid ?? 0) + curr.fixedAssets);
  push(rows, { label: '资产合计', value: assetTotal, total: true }, true);

  const currPay = curr.wagesPayable ?? 0;
  const currTax = curr.taxPayable ?? 0;
  const openingPay = prev.wagesPayable ?? 0;
  const accruedPay = roundMoney(facts.wages.reduce((sum, item) => sum + item.total, 0));
  const paidPay = roundMoney(openingPay + accruedPay - currPay);
  const liab = roundMoney(curr.borrowings + currPay + currTax);
  push(rows, { label: '负债', level: 0 }, true);
  push(rows, {
    label: '短期借款',
    value: curr.borrowings,
    tone: curr.borrowings > 0 ? 'bad' : 'mute',
    level: 1,
  });
  push(rows, {
    label: '应付职工薪酬',
    detail: '各岗位月薪合计；月薪先入负债，下月结算时付现',
    value: currPay,
    tone: currPay > 0 ? 'bad' : 'mute',
    level: 1,
  }, true);
  for (const item of facts.wages) {
    if (item.count <= 0 && !occurred(item.total)) continue;
    push(rows, {
      label: wageDetail(item),
      detail: item.role === 'production' ? '生产工费先进入在产品，随完工转入存货' : undefined,
      value: item.total,
      tone: 'mute',
      level: 2,
    });
  }
  if (occurred(openingPay)) {
    push(rows, { label: '期初尚未支付', value: openingPay, tone: 'mute', level: 2 });
  }
  if (occurred(paidPay)) {
    push(rows, { label: '本月已付现金', value: -paidPay, tone: 'good', level: 2 });
  }
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
    detail: `所有者权益 ${money(curr.equity)} − 实收资本 ${money(curr.paidInCapital ?? 0)} − 盈余公积 ${money(curr.surplusReserve ?? 0)}`,
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

export interface ExplainCtx {
  state: GameState;
  books: MonthBooks;
  ledger: MonthLedger;
  facts: SettlementFacts;
}

function unsigned(label: string, value: number | undefined, extra?: Partial<SettleRow>): SettleRow {
  return { label, value, signed: false, level: 1, ...extra };
}

function signed(label: string, value: number, extra?: Partial<SettleRow>): SettleRow {
  return { label, value, signed: true, level: 1, tone: extra?.tone ?? (value >= 0 ? 'good' : 'bad'), ...extra };
}

function note(label: string, extra?: Partial<SettleRow>): SettleRow {
  return { label, level: 1, ...extra };
}

function pushOcc(rows: SettleRow[], row: SettleRow, always = false): void {
  if (!always && row.value != null && !occurred(row.value)) return;
  rows.push(row);
}

function sumTotal(rows: SettleRow[], label: string, value: number, extra?: Partial<SettleRow>): SettleRow[] {
  rows.push(unsigned(label, value, { total: true, ...extra }));
  return rows;
}

function skuNameOf(state: GameState, id: ProductId): string {
  return productName(id, catalogOf(state));
}

function stockAge(receivedMonth: number, month: number, bias: number): number {
  return Math.max(0, month - receivedMonth + bias);
}

function explainCash(ctx: ExplainCtx): SettleRow[] {
  const { books, ledger } = ctx;
  const rows: SettleRow[] = [];
  rows.push(unsigned('月初现金结余', ledger.openingCash, { tone: 'mute' }));
  pushOcc(rows, unsigned('加：销售商品收到的现金', ledger.cfSales, { tone: 'good' }));
  pushOcc(rows, unsigned('减：购买商品支付的现金', ledger.cfBuy, { tone: 'bad' }));
  pushOcc(rows, unsigned('减：支付给职工的现金', ledger.cfEmployees, { tone: 'bad' }));
  pushOcc(rows, unsigned('减：支付的各项税费', ledger.cfTaxes, { tone: 'bad' }));
  pushOcc(rows, unsigned('加：收到其他经营现金', ledger.cfOtherOpIn, { tone: 'good' }));
  pushOcc(rows, unsigned('减：支付其他经营现金', ledger.cfOtherOpOut, { tone: 'bad' }));
  pushOcc(rows, unsigned('减：购建固定资产支付的现金', ledger.cfCapex, { tone: 'bad' }));
  pushOcc(rows, unsigned('加：取得借款收到的现金', ledger.cfBorrow, { tone: 'good' }));
  pushOcc(rows, unsigned('减：偿还债务支付的现金', ledger.cfRepay, { tone: 'bad' }));
  pushOcc(rows, unsigned('减：偿付利息支付的现金', ledger.cfInterest, { tone: 'bad' }));
  return sumTotal(rows, '货币资金', books.cash);
}

function explainReceivables(ctx: ExplainCtx): SettleRow[] {
  const { state, books, facts } = ctx;
  const rows: SettleRow[] = [];
  const lots = state.receivables ?? [];
  if (lots.length) {
    for (const lot of lots) {
      const past = state.month - lot.dueMonth;
      const overdue = Boolean(lot.overdue) || past >= 1;
      rows.push(
        unsigned(`${lot.originMonth}月形成`, lot.amount, {
          detail: overdue ? `已逾期 ${Math.max(0, past)} 个月` : `账期至 ${lot.dueMonth} 月`,
          tone: overdue ? 'bad' : 'mute',
        }),
      );
    }
  } else {
    pushOcc(rows, unsigned('本月赊销尚未收回', facts.creditSales));
  }
  return sumTotal(rows, '应收账款', books.receivables ?? 0);
}

function explainBadDebt(ctx: ExplainCtx): SettleRow[] {
  const { state, books } = ctx;
  const rows: SettleRow[] = [];
  for (const lot of state.receivables ?? []) {
    const past = state.month - lot.dueMonth;
    const overdue = Boolean(lot.overdue) || past >= 1;
    const rate = arCreditLossRate(past, overdue);
    const value = roundMoney(lot.amount * rate);
    rows.push(
      unsigned(`${lot.originMonth}月应收 × ${pctLabel(rate)}`, value, {
        detail: overdue ? `逾期账龄 ${Math.max(0, past)} 个月` : '未到期按 5% 计提',
        tone: 'bad',
      }),
    );
  }
  if (!rows.length) {
    rows.push(note('没有未收回账款，不计提坏账准备'));
  }
  return sumTotal(rows, '坏账准备', books.badDebtProvision ?? 0, { tone: 'bad' });
}

function explainArNet(ctx: ExplainCtx): SettleRow[] {
  const { books } = ctx;
  const rows: SettleRow[] = [
    unsigned('应收账款', books.receivables ?? 0),
    unsigned('减：坏账准备', books.badDebtProvision ?? 0, { tone: 'bad' }),
  ];
  return sumTotal(rows, '应收账款账面价值', arNet(books));
}

function explainMaterials(ctx: ExplainCtx): SettleRow[] {
  const { state, books } = ctx;
  const rows: SettleRow[] = [];
  for (const id of MATERIAL_IDS) {
    const qty = state.materials?.[id] ?? 0;
    const cost = state.materialCost?.[id] ?? 0;
    if (qty <= 0 && !occurred(cost)) continue;
    rows.push(unsigned(`${materialName(id)} ${qty} 件`, cost, { tone: 'mute' }));
  }
  return sumTotal(rows, '原材料', books.materials ?? 0);
}

function explainWip(ctx: ExplainCtx): SettleRow[] {
  const { books, facts } = ctx;
  const rows: SettleRow[] = [];
  const production = wageOf(facts, 'production');
  if (production.count > 0 || occurred(production.total)) {
    rows.push(unsigned(wageDetail(production), production.total, { detail: '生产工费先进入在产品' }));
  }
  const other = leftover(books.wip ?? 0, production.total);
  pushOcc(rows, unsigned('其他在产品', other));
  if (!rows.length) rows.push(note('本月没有在产品'));
  return sumTotal(rows, '在产品', books.wip ?? 0);
}

function explainFinished(ctx: ExplainCtx): SettleRow[] {
  const { state, books } = ctx;
  const rows: SettleRow[] = [];
  (Object.keys(state.finished ?? {}) as ProductId[]).forEach((id) => {
    const qty = state.finished[id] ?? 0;
    const cost = state.finishedCost?.[id] ?? 0;
    if (qty <= 0 && !occurred(cost)) return;
    rows.push(unsigned(`${skuNameOf(state, id)} ${qty} 件`, cost, { tone: 'mute' }));
  });
  if (!rows.length) rows.push(note('没有库存商品'));
  return sumTotal(rows, '库存商品', books.finished ?? 0);
}

function explainInventory(ctx: ExplainCtx): SettleRow[] {
  const { books } = ctx;
  const rows: SettleRow[] = [];
  pushOcc(rows, unsigned('原材料', books.materials ?? 0), true);
  pushOcc(rows, unsigned('在产品', books.wip ?? 0), true);
  pushOcc(rows, unsigned('库存商品', books.finished ?? 0), true);
  return sumTotal(rows, '存货', books.inventory ?? 0);
}

function explainInvProvision(ctx: ExplainCtx): SettleRow[] {
  const { state, books } = ctx;
  const bias = state.modifiers?.stockAgeBias ?? 0;
  const rows: SettleRow[] = [];
  for (const id of MATERIAL_IDS) {
    for (const layer of state.materialLayers?.[id] ?? []) {
      const age = stockAge(layer.receivedMonth, state.month, bias);
      const rate = inventoryWriteDownRate(age);
      if (rate <= 0 || !occurred(layer.cost)) continue;
      rows.push(
        unsigned(`${materialName(id)} 库龄 ${age} 个月 × ${pctLabel(rate)}`, roundMoney(layer.cost * rate), {
          detail: `账面 ${money(layer.cost)}`,
          tone: 'bad',
        }),
      );
    }
  }
  (Object.keys(state.finishedLayers ?? {}) as ProductId[]).forEach((id) => {
    for (const layer of state.finishedLayers?.[id] ?? []) {
      const age = stockAge(layer.receivedMonth, state.month, bias);
      const rate = inventoryWriteDownRate(age);
      if (rate <= 0 || !occurred(layer.cost)) continue;
      rows.push(
        unsigned(`${skuNameOf(state, id)} 库龄 ${age} 个月 × ${pctLabel(rate)}`, roundMoney(layer.cost * rate), {
          detail: `账面 ${money(layer.cost)}`,
          tone: 'bad',
        }),
      );
    }
  });
  if (!rows.length) rows.push(note('库龄未到计提标准，不提跌价准备'));
  return sumTotal(rows, '存货跌价准备', books.inventoryProvision ?? 0, { tone: 'bad' });
}

function explainInventoryNet(ctx: ExplainCtx): SettleRow[] {
  const { books } = ctx;
  const rows: SettleRow[] = [
    unsigned('存货', books.inventory ?? 0),
    unsigned('减：存货跌价准备', books.inventoryProvision ?? 0, { tone: 'bad' }),
  ];
  return sumTotal(rows, '存货账面价值', inventoryNet(books));
}

function explainPrepaid(ctx: ExplainCtx): SettleRow[] {
  const { state, books } = ctx;
  const rows: SettleRow[] = [];
  const contract = state.supplyContract?.prepaid ?? 0;
  pushOcc(rows, unsigned('供应协议预付', contract, { detail: '尚未到货摊销的预付款' }));
  const other = leftover(books.prepaid ?? 0, contract);
  pushOcc(rows, unsigned('其他预付款', other));
  if (!rows.length) rows.push(note('预付账款为尚未摊销的预付款'));
  return sumTotal(rows, '预付账款', books.prepaid ?? 0);
}

function explainFaCost(ctx: ExplainCtx): SettleRow[] {
  const { state, books, facts } = ctx;
  const machines = roundMoney(state.machineGross ?? facts.machines * MACHINE_COST);
  const factories = roundMoney(state.factoryGross ?? facts.factories * FACTORY_COST);
  const cost = books.fixedAssetCost ?? books.fixedAssets;
  const rows: SettleRow[] = [
    unsigned(`设备 ${facts.machines} 台 × ${money(MACHINE_COST)}`, machines),
    unsigned(`厂区 ${facts.factories} 座 × ${money(FACTORY_COST)}`, factories),
  ];
  pushOcc(rows, unsigned('其他固定资产', leftover(cost, machines, factories)));
  return sumTotal(rows, '固定资产原价', cost);
}

function explainAccumDep(ctx: ExplainCtx): SettleRow[] {
  const { state, books, facts } = ctx;
  const rows: SettleRow[] = [
    unsigned('设备累计折旧', state.accumDepMachines ?? 0, { tone: 'bad' }),
    unsigned('厂区累计折旧', state.accumDepFactories ?? 0, { tone: 'bad' }),
  ];
  if (facts.settled !== false && occurred(facts.machineDep, facts.factoryDep)) {
    rows.push(
      note(`其中本月计提：设备 ${money(facts.machineDep)}、厂区 ${money(facts.factoryDep)}`, { level: 2 }),
    );
  }
  return sumTotal(rows, '累计折旧', books.accumDep ?? 0, { tone: 'bad' });
}

function explainFaNet(ctx: ExplainCtx): SettleRow[] {
  const { books } = ctx;
  const cost = books.fixedAssetCost ?? books.fixedAssets;
  const dep = books.accumDep ?? 0;
  const rows: SettleRow[] = [unsigned('固定资产原价', cost), unsigned('减：累计折旧', dep, { tone: 'bad' })];
  return sumTotal(rows, '固定资产账面价值', books.fixedAssets);
}

function explainAssetTotal(ctx: ExplainCtx): SettleRow[] {
  const { books } = ctx;
  const rows: SettleRow[] = [
    unsigned('货币资金', books.cash),
    unsigned('应收账款账面价值', arNet(books)),
    unsigned('存货账面价值', inventoryNet(books)),
  ];
  pushOcc(rows, unsigned('预付账款', books.prepaid ?? 0));
  rows.push(unsigned('固定资产账面价值', books.fixedAssets));
  const total = roundMoney(books.cash + arNet(books) + inventoryNet(books) + (books.prepaid ?? 0) + books.fixedAssets);
  return sumTotal(rows, '资产合计', total);
}

function explainLoans(ctx: ExplainCtx): SettleRow[] {
  const { state, books } = ctx;
  const rows: SettleRow[] = [];
  for (const lot of state.loans ?? []) {
    rows.push(
      unsigned(`${lot.originMonth}月借入`, lot.amount, {
        detail: `到期 ${lot.dueMonth} 月${lot.defaultCharged ? '，已违约' : ''}`,
        tone: 'bad',
      }),
    );
  }
  if (!rows.length && occurred(books.borrowings)) {
    rows.push(unsigned('短期借款余额', books.borrowings, { tone: 'bad' }));
  }
  return sumTotal(rows, '短期借款', books.borrowings, { tone: books.borrowings > 0 ? 'bad' : 'mute' });
}

function explainWages(ctx: ExplainCtx): SettleRow[] {
  const { books, facts } = ctx;
  const currPay = books.wagesPayable ?? 0;
  const accrued = roundMoney(facts.wages.reduce((sum, item) => sum + item.total, 0));
  const prior = leftover(currPay, accrued);
  const rows: SettleRow[] = [];
  pushOcc(rows, unsigned('尚未支付的以前薪酬', prior, { tone: 'mute' }));
  for (const item of facts.wages) {
    if (item.count <= 0 && !occurred(item.total)) continue;
    rows.push(
      unsigned(wageDetail(item), item.total, {
        detail: item.role === 'production' ? '生产工费先进入在产品，随完工转入存货' : undefined,
      }),
    );
  }
  if (!rows.length) rows.push(note('本月尚未计提职工薪酬'));
  return sumTotal(rows, '应付职工薪酬', currPay, { tone: currPay > 0 ? 'bad' : 'mute' });
}

function explainTaxPayable(ctx: ExplainCtx): SettleRow[] {
  const { books, ledger } = ctx;
  const pbt = pbtOf(ledger);
  const rows: SettleRow[] = [];
  if (pbt > 0) {
    rows.push(
      unsigned(`利润总额 ${money(pbt)} × ${pctLabel(INCOME_TAX_RATE)}`, ledger.incomeTax ?? 0, {
        detail: '亏损不征税',
        tone: 'bad',
      }),
    );
  } else {
    rows.push(note('利润总额未为正数，不征所得税'));
  }
  const other = leftover(books.taxPayable ?? 0, ledger.incomeTax ?? 0);
  pushOcc(rows, unsigned('其他应交税费', other, { tone: 'bad' }));
  return sumTotal(rows, '应交税费', books.taxPayable ?? 0, { tone: (books.taxPayable ?? 0) > 0 ? 'bad' : 'mute' });
}

function explainLiabTotal(ctx: ExplainCtx): SettleRow[] {
  const { books } = ctx;
  const rows: SettleRow[] = [];
  pushOcc(rows, unsigned('短期借款', books.borrowings, { tone: 'bad' }));
  pushOcc(rows, unsigned('应付职工薪酬', books.wagesPayable ?? 0, { tone: 'bad' }));
  pushOcc(rows, unsigned('应交税费', books.taxPayable ?? 0, { tone: 'bad' }));
  const total = roundMoney(books.borrowings + (books.wagesPayable ?? 0) + (books.taxPayable ?? 0));
  return sumTotal(rows, '负债合计', total, { tone: total > 0 ? 'bad' : 'mute' });
}

function explainPaidIn(ctx: ExplainCtx): SettleRow[] {
  return [unsigned('开业投入的股东资本', ctx.books.paidInCapital ?? 0, { total: true })];
}

function explainSurplus(ctx: ExplainCtx): SettleRow[] {
  const { books, facts } = ctx;
  const rows: SettleRow[] = [];
  if (occurred(facts.reserve)) {
    rows.push(unsigned('本月按净利润 10% 提取', facts.reserve, { detail: '累计不超过实收资本的 50%' }));
  }
  const prior = leftover(books.surplusReserve ?? 0, facts.reserve);
  pushOcc(rows, unsigned('以前月份累计提取', prior, { tone: 'mute' }));
  if (!rows.length) rows.push(note('尚未提取盈余公积（亏损月不提，或累计已达上限）'));
  return sumTotal(rows, '盈余公积', books.surplusReserve ?? 0);
}

function explainRetained(ctx: ExplainCtx): SettleRow[] {
  const { books } = ctx;
  const paidIn = books.paidInCapital ?? 0;
  const surplus = books.surplusReserve ?? 0;
  const retained = books.retainedEarnings ?? books.equity;
  const rows: SettleRow[] = [
    unsigned('所有者权益合计', books.equity),
    unsigned('减：实收资本', paidIn),
    unsigned('减：盈余公积', surplus),
  ];
  return sumTotal(rows, '未分配利润', retained);
}

function explainEquityTotal(ctx: ExplainCtx): SettleRow[] {
  const { books } = ctx;
  const rows: SettleRow[] = [
    unsigned('实收资本', books.paidInCapital ?? 0),
    unsigned('盈余公积', books.surplusReserve ?? 0),
    unsigned('未分配利润', books.retainedEarnings ?? books.equity),
  ];
  return sumTotal(rows, '所有者权益合计', books.equity);
}

function explainLiabAndEquity(ctx: ExplainCtx): SettleRow[] {
  const { books } = ctx;
  const liab = roundMoney(books.borrowings + (books.wagesPayable ?? 0) + (books.taxPayable ?? 0));
  const rows: SettleRow[] = [unsigned('负债合计', liab), unsigned('所有者权益合计', books.equity)];
  return sumTotal(rows, '负债和所有者权益合计', roundMoney(liab + books.equity));
}

function explainRevenue(ctx: ExplainCtx): SettleRow[] {
  const { facts, ledger } = ctx;
  const rows: SettleRow[] = [];
  const skuRevenue = roundMoney(facts.skus.reduce((sum, sku) => sum + sku.revenue, 0));
  for (const sku of facts.skus) {
    if (!occurred(sku.revenue) && sku.sold <= 0) continue;
    rows.push(unsigned(`${sku.name} ${sku.sold} 件 × ${money(sku.unitPrice)}`, sku.revenue, { tone: 'good' }));
  }
  if (occurred(facts.cashSales, facts.creditSales) && occurred(skuRevenue)) {
    rows.push(unsigned('其中现销', facts.cashSales, { detail: '货款当场进现金', level: 2, tone: 'good' }));
    rows.push(unsigned('其中赊销', facts.creditSales, { detail: '记入应收账款', level: 2, tone: 'mute' }));
  }
  pushOcc(rows, unsigned('其他营业收入', leftover(ledger.revenue, skuRevenue), { detail: '清库、事项等', tone: 'good' }));
  if (!rows.length) rows.push(note('本月尚未确认营业收入'));
  return sumTotal(rows, '营业收入', ledger.revenue, { tone: 'good' });
}

function explainCogs(ctx: ExplainCtx): SettleRow[] {
  const { facts, ledger } = ctx;
  const rows: SettleRow[] = [];
  const skuCogs = roundMoney(facts.skus.reduce((sum, sku) => sum + sku.cogs, 0));
  for (const sku of facts.skus) {
    if (!occurred(sku.cogs) && sku.sold <= 0) continue;
    rows.push(
      unsigned(`售出 ${sku.name} ${sku.sold} 件`, sku.cogs, {
        detail: '按存货账面结转',
        tone: 'bad',
      }),
    );
  }
  pushOcc(rows, unsigned('其他出库成本', leftover(ledger.cogs, skuCogs), { detail: '清库等', tone: 'bad' }));
  if (!rows.length) rows.push(note('本月尚未结转营业成本'));
  return sumTotal(rows, '营业成本', ledger.cogs, { tone: 'bad' });
}

function explainSelling(ctx: ExplainCtx): SettleRow[] {
  const { facts, ledger } = ctx;
  const sales = wageOf(facts, 'sales');
  const rows: SettleRow[] = [];
  if (sales.count > 0 || occurred(sales.total)) rows.push(unsigned(wageDetail(sales), sales.total, { tone: 'bad' }));
  pushOcc(rows, unsigned('其他销售支出', leftover(ledger.selling, sales.total), { tone: 'bad' }));
  if (!rows.length) rows.push(note('本月没有销售费用'));
  return sumTotal(rows, '销售费用', ledger.selling, { tone: 'bad' });
}

function explainAdmin(ctx: ExplainCtx): SettleRow[] {
  const { facts, ledger } = ctx;
  const production = wageOf(facts, 'production');
  const management = wageOf(facts, 'management');
  const procurement = wageOf(facts, 'procurement');
  const dep = roundMoney(facts.machineDep + facts.factoryDep);
  const idleFixed = facts.settled !== false && !facts.produced ? roundMoney(production.total + dep + facts.upkeep) : 0;
  const rows: SettleRow[] = [];
  if (management.count > 0 || occurred(management.total)) {
    rows.push(unsigned(wageDetail(management), management.total, { tone: 'bad' }));
  }
  if (procurement.count > 0 || occurred(procurement.total)) {
    rows.push(unsigned(wageDetail(procurement), procurement.total, { tone: 'bad' }));
  }
  if (occurred(idleFixed)) {
    rows.push(
      unsigned('未投产的固定支出', idleFixed, {
        detail: [production.count > 0 ? wageDetail(production) : '', occurred(dep) ? `折旧 ${money(dep)}` : '', occurred(facts.upkeep) ? `厂区维护 ${money(facts.upkeep)}` : '']
          .filter(Boolean)
          .join('；'),
        tone: 'bad',
      }),
    );
  }
  pushOcc(
    rows,
    unsigned('其他管理支出', leftover(ledger.admin, management.total, procurement.total, idleFixed), {
      detail: '招聘费、事项、加价采购等',
      tone: 'bad',
    }),
  );
  if (!rows.length) rows.push(note('本月没有管理费用'));
  return sumTotal(rows, '管理费用', ledger.admin, { tone: 'bad' });
}

function explainRd(ctx: ExplainCtx): SettleRow[] {
  const { facts, ledger } = ctx;
  const rd = wageOf(facts, 'rd');
  const rows: SettleRow[] = [];
  if (rd.count > 0 || occurred(rd.total)) {
    const labs =
      facts.rdProductStaff + facts.rdTechStaff > 0
        ? `产品实验室 ${facts.rdProductStaff} 人，工艺实验室 ${facts.rdTechStaff} 人`
        : undefined;
    rows.push(unsigned(wageDetail(rd), rd.total, { detail: labs, tone: 'bad' }));
  }
  pushOcc(rows, unsigned('其他研发支出', leftover(ledger.rd ?? 0, rd.total), { tone: 'bad' }));
  if (!rows.length) rows.push(note('本月没有研发费用'));
  return sumTotal(rows, '研发费用', ledger.rd ?? 0, { tone: 'bad' });
}

function explainFinanceExp(ctx: ExplainCtx): SettleRow[] {
  const { facts, ledger } = ctx;
  const rows: SettleRow[] = [];
  pushOcc(rows, unsigned('短期借款利息', facts.interest, { tone: 'bad' }));
  pushOcc(rows, unsigned('其他财务费用', leftover(ledger.finance, facts.interest), { tone: 'bad' }));
  if (!rows.length) rows.push(note('本月没有财务费用'));
  return sumTotal(rows, '财务费用', ledger.finance, { tone: 'bad' });
}

function explainExtraExpense(ctx: ExplainCtx): SettleRow[] {
  const { facts, ledger } = ctx;
  const rows: SettleRow[] = [];
  pushOcc(rows, unsigned('借款违约金', facts.defaultFee, { tone: 'bad' }));
  pushOcc(rows, unsigned('滞纳金', facts.lateFee, { tone: 'bad' }));
  pushOcc(rows, unsigned('合同违约金', facts.contractPenalty, { tone: 'bad' }));
  pushOcc(rows, unsigned('其他营业外支出', leftover(ledger.extraExpense, facts.defaultFee, facts.lateFee, facts.contractPenalty), { tone: 'bad' }));
  if (!rows.length) rows.push(note('本月没有营业外支出'));
  return sumTotal(rows, '营业外支出', ledger.extraExpense, { tone: 'bad' });
}

function explainOpProfit(ctx: ExplainCtx): SettleRow[] {
  const { ledger } = ctx;
  const rows: SettleRow[] = [];
  pushOcc(rows, signed('营业收入', ledger.revenue, { tone: 'good' }));
  pushOcc(rows, signed('减：营业成本', -ledger.cogs, { tone: 'bad' }));
  pushOcc(rows, signed('减：税金及附加', -ledger.taxes, { tone: 'bad' }));
  pushOcc(rows, signed('减：销售费用', -ledger.selling, { tone: 'bad' }));
  pushOcc(rows, signed('减：管理费用', -ledger.admin, { tone: 'bad' }));
  pushOcc(rows, signed('减：研发费用', -(ledger.rd ?? 0), { tone: 'bad' }));
  pushOcc(rows, signed('减：财务费用', -ledger.finance, { tone: 'bad' }));
  pushOcc(rows, signed('减：信用减值损失', -(ledger.creditImpairment ?? 0), { tone: 'bad' }));
  pushOcc(rows, signed('加：坏账准备转回', ledger.creditReversal ?? 0, { tone: 'good' }));
  pushOcc(rows, signed('减：资产减值损失', -(ledger.assetImpairment ?? 0), { tone: (ledger.assetImpairment ?? 0) >= 0 ? 'bad' : 'good' }));
  const value = opProfit(ledger);
  rows.push(signed('营业利润', value, { total: true, tone: toneOf(value) }));
  return rows;
}

function explainPbt(ctx: ExplainCtx): SettleRow[] {
  const { ledger } = ctx;
  const rows: SettleRow[] = [signed('营业利润', opProfit(ledger), { tone: toneOf(opProfit(ledger)) })];
  pushOcc(rows, signed('加：营业外收入', ledger.extraIncome, { tone: 'good' }));
  pushOcc(rows, signed('减：营业外支出', -ledger.extraExpense, { tone: 'bad' }));
  const value = pbtOf(ledger);
  rows.push(signed('利润总额', value, { total: true, tone: toneOf(value) }));
  return rows;
}

function explainTaxExpense(ctx: ExplainCtx): SettleRow[] {
  const { ledger } = ctx;
  const pbt = pbtOf(ledger);
  const rows: SettleRow[] = [];
  if (pbt > 0) {
    rows.push(unsigned(`利润总额 ${money(pbt)} × ${pctLabel(INCOME_TAX_RATE)}`, ledger.incomeTax ?? 0, { tone: 'bad' }));
  } else {
    rows.push(note('本月亏损，不征所得税'));
  }
  return sumTotal(rows, '所得税费用', ledger.incomeTax ?? 0, { tone: 'bad' });
}

function explainNetProfit(ctx: ExplainCtx): SettleRow[] {
  const { ledger } = ctx;
  const rows: SettleRow[] = [signed('利润总额', pbtOf(ledger), { tone: toneOf(pbtOf(ledger)) })];
  pushOcc(rows, signed('减：所得税费用', -(ledger.incomeTax ?? 0), { tone: 'bad' }));
  const value = npOf(ledger);
  rows.push(signed('净利润', value, { total: true, tone: toneOf(value) }));
  return rows;
}

function explainCfSales(ctx: ExplainCtx): SettleRow[] {
  const { facts, ledger } = ctx;
  const rows: SettleRow[] = [];
  pushOcc(rows, unsigned('本月现销', facts.cashSales, { detail: skuSoldLine(facts), tone: 'good' }));
  pushOcc(rows, unsigned('收回以前应收账款', facts.arCollected, { tone: 'good' }));
  pushOcc(rows, unsigned('其他销售收款', leftover(ledger.cfSales, facts.cashSales, facts.arCollected), { tone: 'good' }));
  if (!rows.length) rows.push(note('本月没有销售收款'));
  return sumTotal(rows, '销售商品收到的现金', ledger.cfSales, { tone: 'good' });
}

function explainCfBuy(ctx: ExplainCtx): SettleRow[] {
  return [unsigned('采购原材料等付现', ctx.ledger.cfBuy, { total: true, tone: 'bad' })];
}

function explainCfEmployees(ctx: ExplainCtx): SettleRow[] {
  const { facts, ledger } = ctx;
  const staff = facts.wages.filter((item) => item.count > 0).map((item) => `${ROLE_LABEL[item.role]} ${item.count}人`).join('、');
  return [
    unsigned('结算时支付职工薪酬', ledger.cfEmployees, {
      detail: staff || '本月无人在册',
      total: true,
      tone: 'bad',
    }),
  ];
}

function explainCfTaxes(ctx: ExplainCtx): SettleRow[] {
  return [unsigned('缴纳的所得税等税费', ctx.ledger.cfTaxes, { total: true, tone: 'bad' })];
}

function explainCfOtherIn(ctx: ExplainCtx): SettleRow[] {
  return [unsigned('其他与经营有关的现金流入', ctx.ledger.cfOtherOpIn, { total: true, tone: 'good' })];
}

function explainCfOtherOut(ctx: ExplainCtx): SettleRow[] {
  const { facts, ledger } = ctx;
  const rows: SettleRow[] = [];
  if (facts.produced) pushOcc(rows, unsigned(`厂区维护 ${facts.factories} 座`, facts.upkeep, { tone: 'bad' }));
  pushOcc(rows, unsigned('其他经营付现', leftover(ledger.cfOtherOpOut, facts.produced ? facts.upkeep : 0), { detail: '招聘费、事项等', tone: 'bad' }));
  if (!rows.length) rows.push(note('本月没有其他经营付现'));
  return sumTotal(rows, '支付其他经营现金', ledger.cfOtherOpOut, { tone: 'bad' });
}

function explainOpCash(ctx: ExplainCtx): SettleRow[] {
  const { ledger } = ctx;
  const rows: SettleRow[] = [];
  pushOcc(rows, signed('销售商品收到的现金', ledger.cfSales, { tone: 'good' }));
  pushOcc(rows, signed('减：购买商品支付的现金', -ledger.cfBuy, { tone: 'bad' }));
  pushOcc(rows, signed('减：支付给职工的现金', -ledger.cfEmployees, { tone: 'bad' }));
  pushOcc(rows, signed('减：支付的各项税费', -ledger.cfTaxes, { tone: 'bad' }));
  pushOcc(rows, signed('加：收到其他经营现金', ledger.cfOtherOpIn, { tone: 'good' }));
  pushOcc(rows, signed('减：支付其他经营现金', -ledger.cfOtherOpOut, { tone: 'bad' }));
  const value = operatingCash(ledger);
  rows.push(signed('经营活动现金流量净额', value, { total: true, tone: toneOf(value) }));
  return rows;
}

function explainCapex(ctx: ExplainCtx): SettleRow[] {
  return [unsigned('买设备、扩建厂区付现', ctx.ledger.cfCapex, { total: true, tone: 'bad' })];
}

function explainInvestCash(ctx: ExplainCtx): SettleRow[] {
  const { ledger } = ctx;
  const rows: SettleRow[] = [];
  pushOcc(rows, signed('减：购建固定资产支付的现金', -ledger.cfCapex, { tone: 'bad' }));
  const value = investCf(ledger);
  rows.push(signed('投资活动现金流量净额', value, { total: true, tone: toneOf(value) }));
  return rows;
}

function explainBorrow(ctx: ExplainCtx): SettleRow[] {
  return [unsigned('本月借入到账', ctx.ledger.cfBorrow, { total: true, tone: 'good' })];
}

function explainRepay(ctx: ExplainCtx): SettleRow[] {
  return [unsigned('本月偿还本金', ctx.ledger.cfRepay, { total: true, tone: 'bad' })];
}

function explainInterestPaid(ctx: ExplainCtx): SettleRow[] {
  return [unsigned('本月支付借款利息', ctx.ledger.cfInterest, { total: true, tone: 'bad' })];
}

function explainFinanceCash(ctx: ExplainCtx): SettleRow[] {
  const { ledger } = ctx;
  const rows: SettleRow[] = [];
  pushOcc(rows, signed('取得借款收到的现金', ledger.cfBorrow, { tone: 'good' }));
  pushOcc(rows, signed('减：偿还债务支付的现金', -ledger.cfRepay, { tone: 'bad' }));
  pushOcc(rows, signed('减：偿付利息支付的现金', -ledger.cfInterest, { tone: 'bad' }));
  const value = financeCf(ledger);
  rows.push(signed('筹资活动现金流量净额', value, { total: true, tone: toneOf(value) }));
  return rows;
}

function explainCashChange(ctx: ExplainCtx): SettleRow[] {
  const { ledger } = ctx;
  const rows: SettleRow[] = [];
  pushOcc(rows, signed('经营活动现金流量净额', operatingCash(ledger)));
  pushOcc(rows, signed('投资活动现金流量净额', investCf(ledger)));
  pushOcc(rows, signed('筹资活动现金流量净额', financeCf(ledger)));
  const value = cashChange(ledger);
  rows.push(signed('现金及现金等价物净增加额', value, { total: true, tone: toneOf(value) }));
  return rows;
}

function explainOpeningCash(ctx: ExplainCtx): SettleRow[] {
  return [unsigned('本月开始时账上现金', ctx.ledger.openingCash, { total: true, tone: 'mute' })];
}

function explainEndingCash(ctx: ExplainCtx): SettleRow[] {
  const { ledger, books } = ctx;
  const change = cashChange(ledger);
  const ending = roundMoney(ledger.openingCash + change);
  const rows: SettleRow[] = [
    unsigned('期初现金', ledger.openingCash, { tone: 'mute' }),
    signed('加：现金净增加额', change, { tone: toneOf(change) }),
  ];
  rows.push(unsigned('期末现金', books.cash ?? ending, { total: true }));
  return rows;
}

const EXPLAIN: Record<string, (ctx: ExplainCtx) => SettleRow[]> = {
  货币资金: explainCash,
  应收账款: explainReceivables,
  '减：坏账准备': explainBadDebt,
  应收账款账面价值: explainArNet,
  存货: explainInventory,
  '其中：原材料': explainMaterials,
  '其中：在产品': explainWip,
  '其中：库存商品': explainFinished,
  '减：存货跌价准备': explainInvProvision,
  存货账面价值: explainInventoryNet,
  预付账款: explainPrepaid,
  固定资产原价: explainFaCost,
  '减：累计折旧': explainAccumDep,
  固定资产账面价值: explainFaNet,
  资产合计: explainAssetTotal,
  短期借款: explainLoans,
  应付职工薪酬: explainWages,
  应交税费: explainTaxPayable,
  负债合计: explainLiabTotal,
  实收资本: explainPaidIn,
  盈余公积: explainSurplus,
  未分配利润: explainRetained,
  所有者权益合计: explainEquityTotal,
  负债和所有者权益合计: explainLiabAndEquity,
  营业收入: explainRevenue,
  '减：营业成本': explainCogs,
  '减：税金及附加': (ctx) => [unsigned('本月税金及附加', ctx.ledger.taxes, { total: true, tone: 'bad' })],
  '减：销售费用': explainSelling,
  '减：管理费用': explainAdmin,
  '减：研发费用': explainRd,
  '减：财务费用': explainFinanceExp,
  '减：信用减值损失': (ctx) => [unsigned('按账龄补提的坏账准备', ctx.ledger.creditImpairment ?? 0, { total: true, tone: 'bad' })],
  '加：坏账准备转回': (ctx) => [unsigned('收回或核销后转回多提的准备', ctx.ledger.creditReversal ?? 0, { total: true, tone: 'good' })],
  '减：资产减值损失': (ctx) => [
    unsigned('存货跌价准备变动', ctx.ledger.assetImpairment ?? 0, {
      detail: '负数表示转回',
      total: true,
      tone: (ctx.ledger.assetImpairment ?? 0) >= 0 ? 'bad' : 'good',
    }),
  ],
  营业利润: explainOpProfit,
  '加：营业外收入': (ctx) => [unsigned('本月营业外收入', ctx.ledger.extraIncome, { total: true, tone: 'good' })],
  '减：营业外支出': explainExtraExpense,
  利润总额: explainPbt,
  '减：所得税费用': explainTaxExpense,
  净利润: explainNetProfit,
  销售商品收到的现金: explainCfSales,
  '销售商品、提供劳务收到的现金': explainCfSales,
  购买商品支付的现金: explainCfBuy,
  '购买商品、接受劳务支付的现金': explainCfBuy,
  支付给职工的现金: explainCfEmployees,
  '支付给职工以及为职工支付的现金': explainCfEmployees,
  支付的各项税费: explainCfTaxes,
  收到其他经营现金: explainCfOtherIn,
  '收到其他与经营活动有关的现金': explainCfOtherIn,
  支付其他经营现金: explainCfOtherOut,
  '支付其他与经营活动有关的现金': explainCfOtherOut,
  经营活动现金流量净额: explainOpCash,
  经营活动产生的现金流量净额: explainOpCash,
  购建固定资产支付的现金: explainCapex,
  '购建固定资产、无形资产和其他长期资产支付的现金': explainCapex,
  投资活动现金流量净额: explainInvestCash,
  投资活动产生的现金流量净额: explainInvestCash,
  取得借款收到的现金: explainBorrow,
  偿还债务支付的现金: explainRepay,
  偿付利息支付的现金: explainInterestPaid,
  '分配股利、利润或偿付利息支付的现金': explainInterestPaid,
  筹资活动现金流量净额: explainFinanceCash,
  筹资活动产生的现金流量净额: explainFinanceCash,
  现金及现金等价物净增加额: explainCashChange,
  '加：期初现金': explainOpeningCash,
  '加：期初现金及现金等价物余额': explainOpeningCash,
  期末现金: explainEndingCash,
  期末现金及现金等价物余额: explainEndingCash,
};

export function explainAccount(label: string, ctx: ExplainCtx): SettleRow[] {
  return EXPLAIN[label]?.(ctx) ?? [];
}
