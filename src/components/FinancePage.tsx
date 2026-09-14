import { booksForView } from '../game/engine';
import { money, roundMoney, signedMoney } from '../game/format';
import type { MonthBooks, MonthLedger } from '../game/types';
import type { GameState } from '../game/types';

function profitOf(ledger: MonthLedger): number {
  return roundMoney(
    ledger.revenue - ledger.cogs - ledger.taxes - ledger.selling - ledger.admin - ledger.finance + ledger.extraIncome - ledger.extraExpense,
  );
}

function operateCf(ledger: MonthLedger): number {
  return roundMoney(
    ledger.cfSales - ledger.cfBuy - ledger.cfEmployees - ledger.cfTaxes + ledger.cfOtherOpIn - ledger.cfOtherOpOut,
  );
}

function investCf(ledger: MonthLedger): number {
  return roundMoney(-ledger.cfCapex);
}

function financeCf(ledger: MonthLedger): number {
  return roundMoney(ledger.cfBorrow - ledger.cfRepay - ledger.cfInterest);
}

function cashChange(ledger: MonthLedger): number {
  return roundMoney(operateCf(ledger) + investCf(ledger) + financeCf(ledger));
}

function occurred(...values: number[]): boolean {
  return values.some((value) => Math.abs(value) > 1e-6);
}

function Delta({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) {
  const delta = roundMoney(current - previous);
  const good = invert ? delta < 0 : delta > 0;
  const bad = invert ? delta > 0 : delta < 0;
  return <span className={good ? 'good' : bad ? 'bad' : 'muted'}>{signedMoney(delta)}</span>;
}

function Cell({ value, empty = '—' }: { value: number | null; empty?: string }) {
  if (value === null) return <span className="muted">{empty}</span>;
  return <>{money(value)}</>;
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
      <table className="sheet dark">
        <thead>
          <tr>
            <th>科目</th>
            <th className="num">{prevLabel}</th>
            <th className="num">{currLabel}</th>
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
              <tr key={line.label} className={line.total ? 'sheet-total' : undefined}>
                <td className={line.indent ? 'indent' : undefined}>{line.label}</td>
                <td className="num">
                  <Cell value={line.prev} />
                </td>
                <td className="num">
                  <Cell value={line.curr} />
                </td>
                <td className="num">
                  <Delta current={line.curr} previous={line.prev} invert={line.invert} />
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      )}
    </section>
  );
}

function maybe(label: string, prev: number, curr: number, extra?: Partial<Line>): Line | null {
  if (!occurred(prev, curr)) return null;
  return { label, prev, curr, ...extra };
}

function balanceLines(prev: MonthBooks, curr: MonthBooks): Array<Line | { section: string }> {
  const assets = [
    maybe('货币资金', prev.cash, curr.cash),
    maybe('存货', prev.inventory, curr.inventory),
    maybe('固定资产', prev.fixedAssets, curr.fixedAssets),
  ].filter(Boolean) as Line[];
  const assetTotal = {
    label: '资产合计',
    prev: roundMoney(prev.cash + prev.inventory + prev.fixedAssets),
    curr: roundMoney(curr.cash + curr.inventory + curr.fixedAssets),
    total: true,
  };
  const debts = [maybe('短期借款', prev.borrowings, curr.borrowings, { invert: true })].filter(Boolean) as Line[];
  const debtTotal = occurred(prev.borrowings, curr.borrowings)
    ? { label: '负债合计', prev: prev.borrowings, curr: curr.borrowings, invert: true, total: true }
    : null;
  const equity = { label: '未分配利润', prev: prev.equity, curr: curr.equity, total: true };
  const both = {
    label: '负债和所有者权益合计',
    prev: roundMoney(prev.borrowings + prev.equity),
    curr: roundMoney(curr.borrowings + curr.equity),
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
    { ...equity, indent: true },
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
    maybe('减：财务费用', prev.finance, curr.finance, { invert: true }),
    maybe('加：营业外收入', prev.extraIncome, curr.extraIncome),
    maybe('减：营业外支出', prev.extraExpense, curr.extraExpense, { invert: true }),
  ].filter(Boolean) as Line[];
  if (!rows.length && !occurred(profitOf(prev), profitOf(curr))) return [];
  return [...rows, { label: '净利润', prev: profitOf(prev), curr: profitOf(curr), total: true }];
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
      prev: operateCf(prev),
      curr: operateCf(curr),
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
  const prevLabel = prev.title;
  const currLabel = currClosed ? curr.title : '本月';
  const income = incomeLines(prev.ledger, curr.ledger);

  return (
    <div className="page-stack">
      <Statement
        title="资产负债表"
        hint={`${prevLabel} 与 ${currLabel} 对比。存货按市价估算，固定资产按账面价值。`}
        prevLabel={prevLabel}
        currLabel={currLabel}
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
        prevLabel={prevLabel}
        currLabel={currLabel}
        lines={income}
      />
      <Statement
        title="现金流量表"
        hint={currClosed ? `${curr.title} 已结。未发生的科目不列。` : '本月尚未结算，只列目前已经发生的现金流。'}
        prevLabel={prevLabel}
        currLabel={currLabel}
        lines={cashFlowLines(prev.ledger, curr.ledger)}
      />
    </div>
  );
}
