export function TitleScreen({ onStart }: { onStart: () => void }) {
  return (
    <section className="title-screen">
      <div className="title-card">
        <p className="kicker">Solo Board Game · Demo</p>
        <h1>CASHFLOW</h1>
        <p className="sub">十二个月 · 经营一间制造公司，活过行情、事件与结算。</p>
        <div className="month-track" aria-hidden>
          {Array.from({ length: 12 }, (_, i) => (
            <div key={i} className="month-pip on" />
          ))}
        </div>
        <div className="rule-grid">
          <article className="rule">
            <b>一月一事</b>
            <p>每回合是一个月。先开董事会定本季目标，再看行情与本月事项，然后花行动点经营。</p>
          </article>
          <article className="rule">
            <b>五条基本盘</b>
            <p>扩建产线、招聘五类员工、按 BOM 采购、按设备抵押融资。开局只有一台设备和一名工人，办公室编制要自己招。断料有三条活路：改配方、做供应链、付钱抢货。销售部开出订单，整张交得出才接；产能有余可以超产入库。</p>
          </article>
          <article className="rule">
            <b>破产或年报</b>
            <p>结算后净资产为负即破产。活过十二月后，按生存、董事会考核和净资产计分。</p>
          </article>
        </div>
        <button className="btn" onClick={onStart}>
          开始经营
        </button>
      </div>
    </section>
  );
}
