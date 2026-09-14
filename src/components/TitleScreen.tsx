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
            <p>每回合是一个月。先看原料与市价，再应对随机事件，然后花行动点做决策。</p>
          </article>
          <article className="rule">
            <b>四条基本盘</b>
            <p>扩建产线、招聘四类员工、按 BOM 采购、按设备抵押融资。月中只能排一种产品产销。</p>
          </article>
          <article className="rule">
            <b>破产或年报</b>
            <p>结算后净资产为负即破产；撑过十二月，按净资产评级。卡片在团队壮大或进入三月后解锁。</p>
          </article>
        </div>
        <button className="btn" onClick={onStart}>
          开始经营
        </button>
      </div>
    </section>
  );
}
