import { AR_TERM_MONTHS, CREDIT_SALE_RATE, arCreditLossRate } from '../game/data';
import { booksForView, netProfitOf, operatingCashOf, operatingProfitOf, profitBeforeTaxOf } from '../game/engine';
import { amount, roundMoney, signedAmount } from '../game/format';
import type { MonthBooks, MonthLedger } from '../game/types';
import type { GameState } from '../game/types';

function investCf(ledger: MonthLedger): number {
  return roundMoney(-ledger.cfCapex);
}

function financeCf(ledger: MonthLedger): number {
  return roundMoney(ledger.cfBorrow - ledger.cfRepay - ledger.cfInterest);
}

function cashChange(ledger: MonthLedger): number {
  return roundMoney(operatingCashOf(ledger) + investCf(ledger) + financeCf(ledger));
}

function occurred(...values: number[]): boolean {
  return values.some((value) => Math.abs(value) > 1e-6);
}

function Delta({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) {
  const delta = roundMoney(current - previous);
  const good = invert ? delta < 0 : delta > 0;
  const bad = invert ? delta > 0 : delta < 0;
  return <span className={good ? 'good' : bad ? 'bad' : 'muted'}>{signedAmount(delta)}</span>;
}

function Cell({ value, empty = '—' }: { value: number | null; empty?: string }) {
  if (value === null) return <span className="muted">{empty}</span>;
  return <>{amount(value)}</>;
}

interface Line {
  label: string;
  prev: number;
  curr: number;
  invert?: boolean;
  indent?: boolean;
  total?: boolean;
}

function Statement({
  title,
  hint,
  prevLabel,
  currLabel,
  lines,
}: {
  title: string;
  hint: string;
  prevLabel: string;
  currLabel: string;
  lines: Array<Line | { section: string }>;
}) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      <p className="hint">{hint}</p>
      {lines.length === 0 ? null : (
      <div className="sheet-wrap">
      <table className="sheet dark">
        <thead>
          <tr>
            <th>科目</th>
            <th className="num">{currLabel}</th>
            <th className="num">{prevLabel}</th>
            <th className="num">变动</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line) =>
            'section' in line ? (
              <tr key={line.section} className="sheet-section">
                <td colSpan={4}>{line.section}</td>
              </tr>
            ) : (
              <tr
                key={line.label}
                className={[line.total ? 'sheet-total' : '', Math.abs(line.curr - line.prev) > 1e-6 ? 'sheet-moved' : '']
                  .filter(Boolean)
                  .join(' ') || undefined}
              >
                <td className={line.indent ? 'indent' : undefined}>{line.label}</td>
                <td className="num">
                  <Cell value={line.curr} />
                </td>
                <td className="num">
                  <Cell value={line.prev} />
                </td>
                <td className="num">
                  <Delta current={line.curr} previous={line.prev} invert={line.invert} />
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      </div>
      )}
    </section>
  );
}

function maybe(label: string, prev: number, curr: number, extra?: Partial<Line>): Line | null {
  if (!occurred(prev, curr)) return null;
  return { label, prev, curr, ...extra };
}

function inventoryNet(books: MonthBooks): number {
  return roundMoney((books.inventory ?? 0) - (books.inventoryProvision ?? 0));
}

function arNet(books: MonthBooks): number {
  return books.receivablesNet ?? roundMoney((books.receivables ?? 0) - (books.badDebtProvision ?? 0));
}

function balanceLines(prev: MonthBooks, curr: MonthBooks): Array<Line | { section: string }> {
  const prevPay = prev.wagesPayable ?? 0;
  const currPay = curr.wagesPayable ?? 0;
  const prevTax = prev.taxPayable ?? 0;
  const currTax = curr.taxPayable ?? 0;
  const assets = [
    { label: '货币资金', prev: prev.cash, curr: curr.cash },
    ...([
      maybe('应收账款', prev.receivables ?? 0, curr.receivables ?? 0),
      maybe('减：坏账准备', prev.badDebtProvision ?? 0, curr.badDebtProvision ?? 0, { invert: true }),
      occurred(prev.receivables ?? 0, curr.receivables ?? 0)
        ? { label: '应收账款账面价值', prev: arNet(prev), curr: arNet(curr), total: true }
        : null,
    ].filter(Boolean) as Line[]),
    { label: '存货', prev: prev.inventory, curr: curr.inventory },
    ...([
      maybe('其中：原材料', prev.materials ?? 0, curr.materials ?? 0),
      maybe('其中：在产品', prev.wip ?? 0, curr.wip ?? 0),
      maybe('其中：库存商品', prev.finished ?? 0, curr.finished ?? 0),
      maybe('减：存货跌价准备', prev.inventoryProvision ?? 0, curr.inventoryProvision ?? 0, { invert: true }),
    ].filter(Boolean) as Line[]),
    { label: '存货账面价值', prev: inventoryNet(prev), curr: inventoryNet(curr), total: true },
    ...([maybe('预付账款', prev.prepaid ?? 0, curr.prepaid ?? 0)].filter(Boolean) as Line[]),
    { label: '固定资产原价', prev: prev.fixedAssetCost ?? prev.fixedAssets, curr: curr.fixedAssetCost ?? curr.fixedAssets },
    { label: '减：累计折旧', prev: prev.accumDep ?? 0, curr: curr.accumDep ?? 0, invert: true },
    { label: '固定资产账面价值', prev: prev.fixedAssets, curr: curr.fixedAssets, total: true },
  ];
  const assetTotal = {
    label: '资产合计',
    prev: roundMoney(prev.cash + arNet(prev) + inventoryNet(prev) + (prev.prepaid ?? 0) + prev.fixedAssets),
    curr: roundMoney(curr.cash + arNet(curr) + inventoryNet(curr) + (curr.prepaid ?? 0) + curr.fixedAssets),
    total: true,
  };
  const debts = [
    maybe('短期借款', prev.borrowings, curr.borrowings, { invert: true }),
    maybe('应付职工薪酬', prevPay, currPay, { invert: true }),
    maybe('应交税费', prevTax, currTax, { invert: true }),
  ].filter(Boolean) as Line[];
  const prevLiab = roundMoney(prev.borrowings + prevPay + prevTax);
  const currLiab = roundMoney(curr.borrowings + currPay + currTax);
  const debtTotal = occurred(prevLiab, currLiab)
    ? { label: '负债合计', prev: prevLiab, curr: currLiab, invert: true, total: true }
    : null;
  const equity = [
    { label: '实收资本', prev: prev.paidInCapital ?? 0, curr: curr.paidInCapital ?? 0 },
    { label: '盈余公积', prev: prev.surplusReserve ?? 0, curr: curr.surplusReserve ?? 0 },
    { label: '未分配利润', prev: prev.retainedEarnings ?? prev.equity, curr: curr.retainedEarnings ?? curr.equity },
    { label: '所有者权益合计', prev: prev.equity, curr: curr.equity, total: true },
  ];
  const both = {
    label: '负债和所有者权益合计',
    prev: roundMoney(prevLiab + prev.equity),
    curr: roundMoney(currLiab + curr.equity),
    total: true,
  };
  return [
    { section: '资产' },
    ...assets.map((line) => ({ ...line, indent: true })),
    assetTotal,
    ...(debts.length
      ? [{ section: '负债' }, ...debts.map((line) => ({ ...line, indent: true })), ...(debtTotal ? [debtTotal] : [])]
      : []),
    { section: '所有者权益' },
    ...equity.map((line) => ({ ...line, indent: true })),
    both,
  ];
}

function incomeLines(prev: MonthLedger, curr: MonthLedger): Array<Line | { section: string }> {
  const rows = [
    maybe('营业收入', prev.revenue, curr.revenue),
    maybe('减：营业成本', prev.cogs, curr.cogs, { invert: true }),
    maybe('减：税金及附加', prev.taxes, curr.taxes, { invert: true }),
    maybe('减：销售费用', prev.selling, curr.selling, { invert: true }),
    maybe('减：管理费用', prev.admin, curr.admin, { invert: true }),
    maybe('减：研发费用', prev.rd ?? 0, curr.rd ?? 0, { invert: true }),
    maybe('减：财务费用', prev.finance, curr.finance, { invert: true }),
    maybe('减：信用减值损失', prev.creditImpairment ?? 0, curr.creditImpairment ?? 0, { invert: true }),
    maybe('减：资产减值损失', prev.assetImpairment ?? 0, curr.assetImpairment ?? 0, { invert: true }),
  ].filter(Boolean) as Line[];
  const extras = [
    maybe('加：营业外收入', prev.extraIncome, curr.extraIncome),
    maybe('减：营业外支出', prev.extraExpense, curr.extraExpense, { invert: true }),
  ].filter(Boolean) as Line[];
  const prevOp = operatingProfitOf(prev);
  const currOp = operatingProfitOf(curr);
  const prevPbt = profitBeforeTaxOf(prev);
  const currPbt = profitBeforeTaxOf(curr);
  const prevNp = netProfitOf(prev);
  const currNp = netProfitOf(curr);
  if (!rows.length && !extras.length && !occurred(prevOp, currOp, prevPbt, currPbt, prevNp, currNp, prev.incomeTax ?? 0, curr.incomeTax ?? 0)) {
    return [];
  }
  const taxLine = maybe('减：所得税费用', prev.incomeTax ?? 0, curr.incomeTax ?? 0, { invert: true });
  return [
    ...rows,
    { label: '营业利润', prev: prevOp, curr: currOp, total: true },
    ...extras,
    { label: '利润总额', prev: prevPbt, curr: currPbt, total: true },
    ...(taxLine ? [taxLine] : []),
    { label: '净利润', prev: prevNp, curr: currNp, total: true },
  ];
}

function cashFlowLines(prev: MonthLedger, curr: MonthLedger): Array<Line | { section: string }> {
  const operate = [
    maybe('销售商品、提供劳务收到的现金', prev.cfSales, curr.cfSales),
    maybe('购买商品、接受劳务支付的现金', prev.cfBuy, curr.cfBuy, { invert: true }),
    maybe('支付给职工以及为职工支付的现金', prev.cfEmployees, curr.cfEmployees, { invert: true }),
    maybe('支付的各项税费', prev.cfTaxes, curr.cfTaxes, { invert: true }),
    maybe('收到其他与经营活动有关的现金', prev.cfOtherOpIn, curr.cfOtherOpIn),
    maybe('支付其他与经营活动有关的现金', prev.cfOtherOpOut, curr.cfOtherOpOut, { invert: true }),
  ].filter(Boolean) as Line[];
  const invest = [maybe('购建固定资产、无形资产和其他长期资产支付的现金', prev.cfCapex, curr.cfCapex, { invert: true })].filter(Boolean) as Line[];
  const finance = [
    maybe('取得借款收到的现金', prev.cfBorrow, curr.cfBorrow),
    maybe('偿还债务支付的现金', prev.cfRepay, curr.cfRepay, { invert: true }),
    maybe('分配股利、利润或偿付利息支付的现金', prev.cfInterest, curr.cfInterest, { invert: true }),
  ].filter(Boolean) as Line[];
  const lines: Array<Line | { section: string }> = [];
  if (operate.length) {
    lines.push({ section: '经营活动产生的现金流量' }, ...operate.map((line) => ({ ...line, indent: true })), {
      label: '经营活动产生的现金流量净额',
      prev: operatingCashOf(prev),
      curr: operatingCashOf(curr),
      total: true,
    });
  }
  if (invest.length) {
    lines.push({ section: '投资活动产生的现金流量' }, ...invest.map((line) => ({ ...line, indent: true })), {
      label: '投资活动产生的现金流量净额',
      prev: investCf(prev),
      curr: investCf(curr),
      total: true,
    });
  }
  if (finance.length) {
    lines.push({ section: '筹资活动产生的现金流量' }, ...finance.map((line) => ({ ...line, indent: true })), {
      label: '筹资活动产生的现金流量净额',
      prev: financeCf(prev),
      curr: financeCf(curr),
      total: true,
    });
  }
  lines.push({
    label: '现金及现金等价物净增加额',
    prev: cashChange(prev),
    curr: cashChange(curr),
    total: true,
  });
  if (occurred(prev.openingCash, curr.openingCash)) {
    lines.push(
      { label: '加：期初现金及现金等价物余额', prev: prev.openingCash, curr: curr.openingCash },
      { label: '期末现金及现金等价物余额', prev: roundMoney(prev.openingCash + cashChange(prev)), curr: roundMoney(curr.openingCash + cashChange(curr)), total: true },
    );
  }
  return lines;
}

export function FinancePage({ state }: { state: GameState }) {
  const { prev, curr, currClosed } = booksForView(state);
  const income = incomeLines(prev.ledger, curr.ledger);

  return (
    <div className="page-stack">
      <Statement
        title="资产负债表"
        hint={`存货按库龄计提跌价：0–1 月不提，2 月 10%，3 月 25%，4–5 月 40%，6 月及以上 70%。应收账款按逾期计提坏账：未到期 5%，逾期 1 / 2 / 3 个月及以上分别为 ${Math.round(arCreditLossRate(1) * 100)}% / ${Math.round(arCreditLossRate(2) * 100)}% / 100%。货款默认 ${Math.round(CREDIT_SALE_RATE * 100)}% 赊销、账期 ${AR_TERM_MONTHS} 个月。价款不含增值税。`}
        prevLabel="上期"
        currLabel="本月"
        lines={balanceLines(prev, curr)}
      />
      <Statement
        title="利润表"
        hint={
          income.length
            ? currClosed
              ? `${curr.title} 已结。未发生的科目不列。`
              : '本月尚未结算，只列目前已经发生的损益。'
            : '本期尚无损益发生。'
        }
        prevLabel="上期"
        currLabel="本月"
        lines={income}
      />
      <Statement
        title="现金流量表"
        hint={currClosed ? `${curr.title} 已结。未发生的科目不列。` : '本月尚未结算，只列目前已经发生的现金流。'}
        prevLabel="上期"
        currLabel="本月"
        lines={cashFlowLines(prev.ledger, curr.ledger)}
      />
    </div>
  );
}
