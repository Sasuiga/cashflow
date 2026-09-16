import { useState } from 'react';
import { AR_OVERDUE_CHANCE, AR_RECOVER_PER_SALES, AR_TERM_MONTHS, CREDIT_SALE_RATE, INTEREST_RATE, LOAN_DEFAULT_RATE, LOAN_LATE_FEE_RATE, LOAN_PER_MACHINE, LOAN_TERM_MONTHS, arCreditLossRate, arRecoveryRate } from '../game/data';
import { booksForView, netProfitOf, operatingCashOf, operatingProfitOf, profitBeforeTaxOf } from '../game/engine';
import { MONTH_NAMES, amount, money, roundMoney, signedMoney } from '../game/format';
import { buildBalanceRows, buildCashRows, buildPnlRows, liveFacts, storyChildren } from '../game/settlementStory';
import type { MonthBooks, MonthLedger, SettleRow } from '../game/types';
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

function occurred(...values: Array<number | null | undefined>): boolean {
  return values.some((value) => value != null && Math.abs(value) > 1e-6);
}

function Cell({ value, empty = '—' }: { value: number | null; empty?: string }) {
  if (value === null) return <span className="muted">{empty}</span>;
  return <>{amount(value)}</>;
}

interface Line {
  label: string;
  curr: number | null;
  prev: number | null;
  older: number | null;
  invert?: boolean;
  indent?: boolean;
  total?: boolean;
  details?: SettleRow[];
}

function Header({ label, sub }: { label: string; sub?: string | null }) {
  return (
    <>
      {label}
      {sub ? <small>{sub}</small> : <small className="muted">无</small>}
    </>
  );
}

function Statement({
  title,
  hint,
  currLabel,
  prevLabel,
  olderLabel,
  currTitle,
  prevTitle,
  olderTitle,
  lines,
}: {
  title: string;
  hint: string;
  currLabel: string;
  prevLabel: string;
  olderLabel: string;
  currTitle: string;
  prevTitle: string | null;
  olderTitle: string | null;
  lines: Array<Line | { section: string }>;
}) {
  const [open, setOpen] = useState<string | null>(null);
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
                <th className="num">
                  <Header label={currLabel} sub={currTitle} />
                </th>
                <th className="num">
                  <Header label={prevLabel} sub={prevTitle} />
                </th>
                <th className="num">
                  <Header label={olderLabel} sub={olderTitle} />
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) =>
                'section' in line ? (
                  <tr key={line.section} className="sheet-section">
                    <td colSpan={4}>{line.section}</td>
                  </tr>
                ) : (
                  <SheetLine
                    key={line.label}
                    line={line}
                    open={open === line.label}
                    onToggle={() => setOpen((current) => (current === line.label ? null : line.label))}
                  />
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SheetLine({
  line,
  open,
  onToggle,
}: {
  line: Line;
  open: boolean;
  onToggle: () => void;
}) {
  const details = line.details ?? [];
  const clickable = details.length > 0;
  const moved = line.curr != null && line.prev != null && Math.abs(line.curr - line.prev) > 1e-6;
  return (
    <>
      <tr className={[line.total ? 'sheet-total' : '', moved ? 'sheet-moved' : '', clickable ? 'sheet-click' : ''].filter(Boolean).join(' ') || undefined}>
        <td className={line.indent ? 'indent' : undefined}>
          {clickable ? (
            <button type="button" className="sheet-toggle" aria-expanded={open} onClick={onToggle}>
              {line.label}
            </button>
          ) : (
            line.label
          )}
        </td>
        <td className="num">
          <Cell value={line.curr} />
        </td>
        <td className="num">
          <Cell value={line.prev} />
        </td>
        <td className="num">
          <Cell value={line.older} />
        </td>
      </tr>
      {open && clickable ? (
        <tr className="sheet-explain">
          <td colSpan={4}>
            <div className="sheet-explain-list">
              {details.map((row, index) => (
                <div key={`${row.label}-${index}`} className={`level-${row.level ?? 1}`}>
                  <span>
                    {row.label}
                    {row.detail ? <small>{row.detail}</small> : null}
                  </span>
                  {row.value != null ? (
                    <strong className={row.tone === 'good' ? 'good' : row.tone === 'bad' ? 'bad' : 'muted'}>
                      {row.signed === false ? money(row.value) : signedMoney(row.value)}
                    </strong>
                  ) : null}
                </div>
              ))}
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function maybe(label: string, curr: number | null, prev: number | null, older: number | null, extra?: Partial<Line>): Line | null {
  if (!occurred(curr, prev, older)) return null;
  return { label, curr, prev, older, ...extra };
}

function inventoryNet(books: MonthBooks): number {
  return roundMoney((books.inventory ?? 0) - (books.inventoryProvision ?? 0));
}

function arNet(books: MonthBooks): number {
  return books.receivablesNet ?? roundMoney((books.receivables ?? 0) - (books.badDebtProvision ?? 0));
}

function n(books: MonthBooks | null, read: (books: MonthBooks) => number): number | null {
  return books ? read(books) : null;
}

function withDetails(line: Line, rows: SettleRow[]): Line {
  const details = storyChildren(rows, line.label);
  return details.length ? { ...line, details } : line;
}

function annotate(lines: Array<Line | { section: string }>, rows: SettleRow[]): Array<Line | { section: string }> {
  return lines.map((line) => ('section' in line ? line : withDetails(line, rows)));
}

function balanceLines(curr: MonthBooks, prev: MonthBooks, older: MonthBooks | null): Array<Line | { section: string }> {
  const assets = [
    { label: '货币资金', curr: curr.cash, prev: prev.cash, older: n(older, (item) => item.cash) },
    ...([
      maybe('应收账款', curr.receivables ?? 0, prev.receivables ?? 0, n(older, (item) => item.receivables ?? 0)),
      maybe('减：坏账准备', curr.badDebtProvision ?? 0, prev.badDebtProvision ?? 0, n(older, (item) => item.badDebtProvision ?? 0), { invert: true }),
      occurred(curr.receivables ?? 0, prev.receivables ?? 0, older?.receivables)
        ? { label: '应收账款账面价值', curr: arNet(curr), prev: arNet(prev), older: older ? arNet(older) : null, total: true }
        : null,
    ].filter(Boolean) as Line[]),
    { label: '存货', curr: curr.inventory, prev: prev.inventory, older: n(older, (item) => item.inventory) },
    ...([
      maybe('其中：原材料', curr.materials ?? 0, prev.materials ?? 0, n(older, (item) => item.materials ?? 0)),
      maybe('其中：在产品', curr.wip ?? 0, prev.wip ?? 0, n(older, (item) => item.wip ?? 0)),
      maybe('其中：库存商品', curr.finished ?? 0, prev.finished ?? 0, n(older, (item) => item.finished ?? 0)),
      maybe('减：存货跌价准备', curr.inventoryProvision ?? 0, prev.inventoryProvision ?? 0, n(older, (item) => item.inventoryProvision ?? 0), {
        invert: true,
      }),
    ].filter(Boolean) as Line[]),
    { label: '存货账面价值', curr: inventoryNet(curr), prev: inventoryNet(prev), older: older ? inventoryNet(older) : null, total: true },
    ...([maybe('预付账款', curr.prepaid ?? 0, prev.prepaid ?? 0, n(older, (item) => item.prepaid ?? 0))].filter(Boolean) as Line[]),
    {
      label: '固定资产原价',
      curr: curr.fixedAssetCost ?? curr.fixedAssets,
      prev: prev.fixedAssetCost ?? prev.fixedAssets,
      older: n(older, (item) => item.fixedAssetCost ?? item.fixedAssets),
    },
    {
      label: '减：累计折旧',
      curr: curr.accumDep ?? 0,
      prev: prev.accumDep ?? 0,
      older: n(older, (item) => item.accumDep ?? 0),
      invert: true,
    },
    { label: '固定资产账面价值', curr: curr.fixedAssets, prev: prev.fixedAssets, older: n(older, (item) => item.fixedAssets), total: true },
  ];
  const liabCurr = roundMoney(curr.borrowings + (curr.wagesPayable ?? 0) + (curr.taxPayable ?? 0));
  const liabPrev = roundMoney(prev.borrowings + (prev.wagesPayable ?? 0) + (prev.taxPayable ?? 0));
  const liabOlder = older ? roundMoney(older.borrowings + (older.wagesPayable ?? 0) + (older.taxPayable ?? 0)) : null;
  const assetTotal = {
    label: '资产合计',
    curr: roundMoney(curr.cash + arNet(curr) + inventoryNet(curr) + (curr.prepaid ?? 0) + curr.fixedAssets),
    prev: roundMoney(prev.cash + arNet(prev) + inventoryNet(prev) + (prev.prepaid ?? 0) + prev.fixedAssets),
    older: older ? roundMoney(older.cash + arNet(older) + inventoryNet(older) + (older.prepaid ?? 0) + older.fixedAssets) : null,
    total: true,
  };
  const debts = [
    maybe('短期借款', curr.borrowings, prev.borrowings, n(older, (item) => item.borrowings), { invert: true }),
    maybe('应付职工薪酬', curr.wagesPayable ?? 0, prev.wagesPayable ?? 0, n(older, (item) => item.wagesPayable ?? 0), { invert: true }),
    maybe('应交税费', curr.taxPayable ?? 0, prev.taxPayable ?? 0, n(older, (item) => item.taxPayable ?? 0), { invert: true }),
  ].filter(Boolean) as Line[];
  const debtTotal = occurred(liabCurr, liabPrev, liabOlder)
    ? { label: '负债合计', curr: liabCurr, prev: liabPrev, older: liabOlder, invert: true, total: true }
    : null;
  const equity = [
    { label: '实收资本', curr: curr.paidInCapital ?? 0, prev: prev.paidInCapital ?? 0, older: n(older, (item) => item.paidInCapital ?? 0) },
    { label: '盈余公积', curr: curr.surplusReserve ?? 0, prev: prev.surplusReserve ?? 0, older: n(older, (item) => item.surplusReserve ?? 0) },
    {
      label: '未分配利润',
      curr: curr.retainedEarnings ?? curr.equity,
      prev: prev.retainedEarnings ?? prev.equity,
      older: n(older, (item) => item.retainedEarnings ?? item.equity),
    },
    { label: '所有者权益合计', curr: curr.equity, prev: prev.equity, older: n(older, (item) => item.equity), total: true },
  ];
  const both = {
    label: '负债和所有者权益合计',
    curr: roundMoney(liabCurr + curr.equity),
    prev: roundMoney(liabPrev + prev.equity),
    older: older && liabOlder != null ? roundMoney(liabOlder + older.equity) : null,
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

function incomeLines(curr: MonthLedger, prev: MonthLedger, older: MonthLedger | null): Array<Line | { section: string }> {
  const o = (read: (ledger: MonthLedger) => number) => (older ? read(older) : null);
  const rows = [
    maybe('营业收入', curr.revenue, prev.revenue, o((item) => item.revenue)),
    maybe('减：营业成本', curr.cogs, prev.cogs, o((item) => item.cogs), { invert: true }),
    maybe('减：税金及附加', curr.taxes, prev.taxes, o((item) => item.taxes), { invert: true }),
    maybe('减：销售费用', curr.selling, prev.selling, o((item) => item.selling), { invert: true }),
    maybe('减：管理费用', curr.admin, prev.admin, o((item) => item.admin), { invert: true }),
    maybe('减：研发费用', curr.rd ?? 0, prev.rd ?? 0, o((item) => item.rd ?? 0), { invert: true }),
    maybe('减：财务费用', curr.finance, prev.finance, o((item) => item.finance), { invert: true }),
    maybe('减：信用减值损失', curr.creditImpairment ?? 0, prev.creditImpairment ?? 0, o((item) => item.creditImpairment ?? 0), { invert: true }),
    maybe('加：坏账准备转回', curr.creditReversal ?? 0, prev.creditReversal ?? 0, o((item) => item.creditReversal ?? 0)),
    maybe('减：资产减值损失', curr.assetImpairment ?? 0, prev.assetImpairment ?? 0, o((item) => item.assetImpairment ?? 0), { invert: true }),
  ].filter(Boolean) as Line[];
  const extras = [
    maybe('加：营业外收入', curr.extraIncome, prev.extraIncome, o((item) => item.extraIncome)),
    maybe('减：营业外支出', curr.extraExpense, prev.extraExpense, o((item) => item.extraExpense), { invert: true }),
  ].filter(Boolean) as Line[];
  const currOp = operatingProfitOf(curr);
  const prevOp = operatingProfitOf(prev);
  const olderOp = older ? operatingProfitOf(older) : null;
  const currPbt = profitBeforeTaxOf(curr);
  const prevPbt = profitBeforeTaxOf(prev);
  const olderPbt = older ? profitBeforeTaxOf(older) : null;
  const currNp = netProfitOf(curr);
  const prevNp = netProfitOf(prev);
  const olderNp = older ? netProfitOf(older) : null;
  if (!rows.length && !extras.length && !occurred(currOp, prevOp, olderOp, currPbt, prevPbt, olderPbt, currNp, prevNp, olderNp, curr.incomeTax, prev.incomeTax, older?.incomeTax)) {
    return [];
  }
  const taxLine = maybe('减：所得税费用', curr.incomeTax ?? 0, prev.incomeTax ?? 0, o((item) => item.incomeTax ?? 0), { invert: true });
  return [
    ...rows,
    { label: '营业利润', curr: currOp, prev: prevOp, older: olderOp, total: true },
    ...extras,
    { label: '利润总额', curr: currPbt, prev: prevPbt, older: olderPbt, total: true },
    ...(taxLine ? [taxLine] : []),
    { label: '净利润', curr: currNp, prev: prevNp, older: olderNp, total: true },
  ];
}

function cashFlowLines(curr: MonthLedger, prev: MonthLedger, older: MonthLedger | null): Array<Line | { section: string }> {
  const o = (read: (ledger: MonthLedger) => number) => (older ? read(older) : null);
  const operate = [
    maybe('销售商品、提供劳务收到的现金', curr.cfSales, prev.cfSales, o((item) => item.cfSales)),
    maybe('购买商品、接受劳务支付的现金', curr.cfBuy, prev.cfBuy, o((item) => item.cfBuy), { invert: true }),
    maybe('支付给职工以及为职工支付的现金', curr.cfEmployees, prev.cfEmployees, o((item) => item.cfEmployees), { invert: true }),
    maybe('支付的各项税费', curr.cfTaxes, prev.cfTaxes, o((item) => item.cfTaxes), { invert: true }),
    maybe('收到其他与经营活动有关的现金', curr.cfOtherOpIn, prev.cfOtherOpIn, o((item) => item.cfOtherOpIn)),
    maybe('支付其他与经营活动有关的现金', curr.cfOtherOpOut, prev.cfOtherOpOut, o((item) => item.cfOtherOpOut), { invert: true }),
  ].filter(Boolean) as Line[];
  const invest = [maybe('购建固定资产、无形资产和其他长期资产支付的现金', curr.cfCapex, prev.cfCapex, o((item) => item.cfCapex), { invert: true })].filter(Boolean) as Line[];
  const finance = [
    maybe('取得借款收到的现金', curr.cfBorrow, prev.cfBorrow, o((item) => item.cfBorrow)),
    maybe('偿还债务支付的现金', curr.cfRepay, prev.cfRepay, o((item) => item.cfRepay), { invert: true }),
    maybe('分配股利、利润或偿付利息支付的现金', curr.cfInterest, prev.cfInterest, o((item) => item.cfInterest), { invert: true }),
  ].filter(Boolean) as Line[];
  const lines: Array<Line | { section: string }> = [];
  if (operate.length) {
    lines.push({ section: '经营活动产生的现金流量' }, ...operate.map((line) => ({ ...line, indent: true })), {
      label: '经营活动产生的现金流量净额',
      curr: operatingCashOf(curr),
      prev: operatingCashOf(prev),
      older: older ? operatingCashOf(older) : null,
      total: true,
    });
  }
  if (invest.length) {
    lines.push({ section: '投资活动产生的现金流量' }, ...invest.map((line) => ({ ...line, indent: true })), {
      label: '投资活动产生的现金流量净额',
      curr: investCf(curr),
      prev: investCf(prev),
      older: older ? investCf(older) : null,
      total: true,
    });
  }
  if (finance.length) {
    lines.push({ section: '筹资活动产生的现金流量' }, ...finance.map((line) => ({ ...line, indent: true })), {
      label: '筹资活动现金流量净额',
      curr: financeCf(curr),
      prev: financeCf(prev),
      older: older ? financeCf(older) : null,
      total: true,
    });
  }
  lines.push({
    label: '现金及现金等价物净增加额',
    curr: cashChange(curr),
    prev: cashChange(prev),
    older: older ? cashChange(older) : null,
    total: true,
  });
  if (occurred(curr.openingCash, prev.openingCash, older?.openingCash)) {
    lines.push(
      {
        label: '加：期初现金及现金等价物余额',
        curr: curr.openingCash,
        prev: prev.openingCash,
        older: older ? older.openingCash : null,
      },
      {
        label: '期末现金及现金等价物余额',
        curr: roundMoney(curr.openingCash + cashChange(curr)),
        prev: roundMoney(prev.openingCash + cashChange(prev)),
        older: older ? roundMoney(older.openingCash + cashChange(older)) : null,
        total: true,
      },
    );
  }
  return lines;
}

function currentStories(state: GameState, prev: MonthBooks, curr: MonthBooks, currClosed: boolean) {
  if (currClosed && curr.pnlRows?.length) {
    return { pnl: curr.pnlRows, bs: curr.balanceRows ?? [], cf: curr.cashRows ?? [] };
  }
  const facts = liveFacts(state);
  return {
    pnl: buildPnlRows(facts, curr.ledger, operatingProfitOf(curr.ledger), profitBeforeTaxOf(curr.ledger), netProfitOf(curr.ledger)),
    bs: buildBalanceRows(prev, curr, facts),
    cf: buildCashRows(facts, curr.ledger, curr.cash, operatingCashOf(curr.ledger)),
  };
}

export function FinancePage({ state }: { state: GameState }) {
  const { prev, curr, older, currClosed } = booksForView(state);
  const stories = currentStories(state, prev, curr, currClosed);
  const income = annotate(incomeLines(curr.ledger, prev.ledger, older?.ledger ?? null), stories.pnl);
  const monthName = MONTH_NAMES[state.month - 1] ?? `${state.month}月`;

  return (
    <div className="page-stack">
      <Statement
        title="资产负债表"
        hint={`左列是${currClosed ? '本月期末' : '本月至今已入账'}的影响，含经营操作和已经发生的固定事项（如已计提工资）。折旧、销售结转、催收等仍待月结。点科目可看本月数字怎么来的。存货按库龄计提跌价：0–1 月不提，2 月 10%，3 月 25%，4–5 月 40%，6 月及以上 70%。应收账款到期整笔收回，${Math.round(AR_OVERDUE_CHANCE * 100)}% 概率整笔逾期后再催 3 个月（底表 ${Math.round(arRecoveryRate(1) * 100)}% / ${Math.round(arRecoveryRate(2) * 100)}% / ${Math.round(arRecoveryRate(3) * 100)}%，每名销售 +${Math.round(AR_RECOVER_PER_SALES * 100)}%，均按余额计算）。坏账准备：未到期 5%，刚逾期 20%，催收第 1 / 2 个月 ${Math.round(arCreditLossRate(1, true) * 100)}% / ${Math.round(arCreditLossRate(2, true) * 100)}%，第 3 个月 100% 后核销。货款默认 ${Math.round(CREDIT_SALE_RATE * 100)}% 赊销、账期 ${AR_TERM_MONTHS} 个月。短期借款按设备抵押：每台上限 ${LOAN_PER_MACHINE} 万，月息 ${Math.round(INTEREST_RATE * 100)}%，期限 ${LOAN_TERM_MONTHS} 个月；到期未还一次性违约金 ${Math.round(LOAN_DEFAULT_RATE * 100)}%，另加滞纳金 ${Math.round(LOAN_LATE_FEE_RATE * 100)}%/月。价款不含增值税。`}
        currLabel={currClosed ? '本月期末' : '本月至今'}
        prevLabel="上月期末"
        olderLabel="上上月期末"
        currTitle={currClosed ? curr.title : monthName}
        prevTitle={prev.title}
        olderTitle={older?.title ?? null}
        lines={annotate(balanceLines(curr, prev, older), stories.bs)}
      />
      <Statement
        title="利润表"
        hint={
          income.some((line) => !('section' in line))
            ? currClosed
              ? `${curr.title} 已结。点科目看形成过程。未发生的科目不列。`
              : `${monthName}尚未结算，左列只含目前已经发生的损益。点科目可看工资等明细。`
            : '本期尚无损益发生。'
        }
        currLabel={currClosed ? '本月期末' : '本月至今'}
        prevLabel="上月期末"
        olderLabel="上上月期末"
        currTitle={currClosed ? curr.title : monthName}
        prevTitle={prev.title}
        olderTitle={older?.title ?? null}
        lines={income}
      />
      <Statement
        title="现金流量表"
        hint={currClosed ? `${curr.title} 已结。点科目看形成过程。未发生的科目不列。` : `${monthName}尚未结算，左列只含目前已经发生的现金流。`}
        currLabel={currClosed ? '本月期末' : '本月至今'}
        prevLabel="上月期末"
        olderLabel="上上月期末"
        currTitle={currClosed ? curr.title : monthName}
        prevTitle={prev.title}
        olderTitle={older?.title ?? null}
        lines={annotate(cashFlowLines(curr.ledger, prev.ledger, older?.ledger ?? null), stories.cf)}
      />
    </div>
  );
}
