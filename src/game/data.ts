import type { Bom, CardDef, EventDef, IpDef, IpId, MaterialDef, MaterialId, ProductDef, ProductId, RdTrack, Role } from './types';

export const TOTAL_MONTHS = 12;
export const HAND_LIMIT = 5;
export const BASE_AP = 3;
export const BASE_MONTH_ORDERS = 3;
export const MAX_MONTH_ORDERS = 6;
export const MACHINE_COST = 10;
export const MACHINE_LIFE_MONTHS = 12;
export const MACHINE_BASE_CAP = 6;
export const WORKERS_PER_MACHINE = 4;
export const CAP_PER_WORKER = 4;
export const CAP_OVERFLOW = 1;
export const FACTORY_COST = 20;
export const FACTORY_LIFE_MONTHS = 24;
export const INCOME_TAX_RATE = 0.25;
export const STATUTORY_RESERVE_RATE = 0.1;
export const STATUTORY_RESERVE_CAP = 0.5;
export const CREDIT_SALE_RATE = 0.35;
export const AR_TERM_MONTHS = 1;
export const AR_WRITEOFF_PAST_DUE = 3;
export const AR_OVERDUE_CHANCE = 0.1;
export const AR_RECOVER_MONTHS = 3;
export const AR_RECOVER_RATES = [0.4, 0.3, 0.2] as const;
export const AR_RECOVER_PER_SALES = 0.05;
export const SLOTS_PER_FACTORY = 3;
export const FACTORY_UPKEEP = 1;
export const LOAN_PER_MACHINE = 10;
export const INTEREST_RATE = 0.04;
export const LOAN_TERM_MONTHS = 3;
export const LOAN_DEFAULT_RATE = 0.1;
export const LOAN_LATE_FEE_RATE = 0.05;
export const SALARY: Record<Role, number> = {
  production: 0.5,
  management: 0.8,
  sales: 1,
  rd: 1.5,
  procurement: 0.8,
};
export const HIRE_COST: Record<Role, number> = {
  production: 0,
  management: SALARY.management,
  sales: SALARY.sales,
  rd: 2,
  procurement: SALARY.procurement,
};
export const ROLES: Role[] = ['production', 'management', 'sales', 'rd', 'procurement'];
export const PRODUCT_RD_MONTHS = 3;
export const TECH_RD_MONTHS = 2;
export const RD_STAFF_CAP = 3;
export const RD_SUCCESS_PER_HEAD = 0.3;
export const RD_SUCCESS_CAP = 0.9;
export const RD_FAIL_BONUS = 0.1;
export const IP_YIELD_EVERY = 5;
export const IP_PRICE_BONUS = 0.08;
export const IP_JIG_CAPACITY = 4;
export const IP_AUTO_PER_MACHINE = 2;
export const IP_LEAN_RATE = 0.5;
export const TRADER_PRICE_MULT: Record<MaterialId, number> = { a: 1.5, b: 1.5, c: 2, d: 2 };
export const SPOT_STAFF_ADD: Record<MaterialId, number> = { a: 4, b: 4, c: 1, d: 0 };
export const SPOT_HARD_CAP: Record<MaterialId, number> = { a: 36, b: 36, c: 10, d: 5 };
export const TRADER_HARD_CAP: Record<MaterialId, number> = { a: 16, b: 16, c: 4, d: 2 };
export const CONTRACT_COVER_MONTHS = 3;
export const LAST_CONTRACT_SIGN_MONTH = 9;

export function inventoryWriteDownRate(ageMonths: number): number {
  if (ageMonths >= 6) return 0.7;
  if (ageMonths >= 4) return 0.4;
  if (ageMonths >= 3) return 0.25;
  if (ageMonths >= 2) return 0.1;
  return 0;
}

export function arRecoveryRate(monthsPastDue: number, sales = 0): number {
  if (monthsPastDue < 1 || monthsPastDue > AR_RECOVER_MONTHS) return 0;
  const base = AR_RECOVER_RATES[monthsPastDue - 1] ?? 0;
  return Math.round(Math.min(1, Math.max(0, base + Math.max(0, sales) * AR_RECOVER_PER_SALES)) * 100) / 100;
}

export function arCreditLossRate(monthsPastDue: number, overdue = monthsPastDue >= 1): number {
  if (!overdue) return 0.05;
  if (monthsPastDue <= 0) return 0.2;
  if (monthsPastDue === 1) return 0.4;
  if (monthsPastDue === 2) return 0.7;
  return 1;
}

export const MATERIALS: MaterialDef[] = [
  { id: 'a', name: '钢材', short: 'A', basePrice: 0.4 },
  { id: 'b', name: '塑料', short: 'B', basePrice: 0.4 },
  { id: 'c', name: '芯片', short: 'C', basePrice: 1 },
  { id: 'd', name: '特种合金', short: 'D', basePrice: 2 },
];

export const PRODUCTS: ProductDef[] = [
  {
    id: 'basic',
    name: '基础款',
    tier: '低端',
    bom: { a: 2, b: 1 },
    basePrice: 1.5,
    baseDemand: 20,
    blurb: '走量产品。BOM 简单，需求稳定。',
  },
  {
    id: 'standard',
    name: '标准款',
    tier: '普通',
    bom: { a: 1, b: 2, c: 1 },
    basePrice: 4,
    baseDemand: 10,
    blurb: '利润更厚，但吃芯片。需求随销售扩张。',
  },
  {
    id: 'premium',
    name: '旗舰款',
    tier: '高端',
    bom: { b: 1, c: 2 },
    basePrice: 6,
    baseDemand: 5,
    blurb: '高单价、低需求。芯片行情好时溢价更明显。',
  },
];

export const MAX_RD_PRODUCTS = 2;

export const RD_NAME_STEMS = [
  '轻量',
  '紧凑',
  '家用',
  '户外',
  '加固',
  '节能',
  '迅装',
  '便携',
  '耐磨',
  '静音',
  '快装',
  '薄壁',
  '加厚',
  '防潮',
  '民用',
  '出口',
  '工矿',
  '冷链',
  '精工',
  '迅达',
];

export const LEGACY_RD_PRODUCTS: ProductDef[] = [
  {
    id: 'economy',
    name: '经济款',
    tier: '走量',
    bom: { a: 1, b: 1 },
    basePrice: 1.5,
    baseDemand: 20,
    blurb: '研发成果：更省料的走量结构。',
  },
  {
    id: 'special',
    name: '特种款',
    tier: '高端',
    bom: { b: 1, d: 1 },
    basePrice: 5,
    baseDemand: 8,
    blurb: '解锁特种合金后的高毛利产品。',
  },
];

export interface ProductCatalogSource {
  extraProducts?: ProductDef[];
  rdProductDraft?: ProductDef | null;
  unlockedProducts?: ProductId[];
}

export const IP_CATALOG: IpDef[] = [
  {
    id: 'jig',
    name: '工装夹具',
    blurb: '定位更稳，产线少一次对刀。',
    effect: '永久产能 +4',
  },
  {
    id: 'yield',
    name: '良率专利',
    blurb: '抽检口径收紧，报废变成库存。',
    effect: '每产出 5 件，额外入库 1 件',
  },
  {
    id: 'spec',
    name: '工艺标准',
    blurb: '客户按新标准给溢价。',
    effect: '售价永久 +8%',
  },
  {
    id: 'lean',
    name: '节材配方',
    blurb: '下料损耗被压住，批量越大越省。',
    effect: '生产耗料按五折计，批量越大越省',
  },
  {
    id: 'auto',
    name: '自研工装',
    blurb: '换型不用再靠老师傅找节拍。',
    effect: '每台设备基础产能 +2',
  },
];

export function rdCycleOf(track: RdTrack): number {
  return track === 'product' ? PRODUCT_RD_MONTHS : TECH_RD_MONTHS;
}

export function rdSuccessRate(staff: number, failBonus = 0): number {
  const heads = Math.min(RD_STAFF_CAP, Math.max(0, staff));
  const raw = heads * RD_SUCCESS_PER_HEAD + Math.max(0, failBonus);
  return Math.round(Math.min(RD_SUCCESS_CAP, raw) * 100) / 100;
}

export function ipById(id: IpId): IpDef {
  const found = IP_CATALOG.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown IP ${id}`);
  return found;
}

export const CARDS: CardDef[] = [
  {
    id: 'overtime',
    name: '加班赶工',
    suit: 'production',
    cost: 1,
    blurb: '本月产能 +10。',
    playText: '产线灯火通明，本月产能 +10。',
  },
  {
    id: 'kaizen',
    name: '现场改善',
    suit: 'production',
    cost: 0.5,
    blurb: '本月产能 +5，下一次采购九折。',
    playText: '产线节拍被拧紧，产能 +5，下次采购九折。',
  },
  {
    id: 'lean',
    name: '精益例会',
    suit: 'management',
    cost: 1,
    blurb: '立刻获得 1 点行动点。',
    playText: '会议很短，决定很快。行动点 +1。',
  },
  {
    id: 'bulk',
    name: '集采谈判',
    suit: 'management',
    cost: 1,
    blurb: '下一次原料采购八折。',
    playText: '供应商松口了。下次采购八折。',
  },
  {
    id: 'client',
    name: '大客户拜访',
    suit: 'sales',
    cost: 1,
    blurb: '本月加一张走量订单。',
    playText: '渠道加了一张走量订单。',
  },
  {
    id: 'premiumPush',
    name: '高端发布',
    suit: 'sales',
    cost: 1,
    blurb: '本月售价 +20%。',
    playText: '发布会造成短时溢价，本月售价 +20%。',
  },
  {
    id: 'labRush',
    name: '实验室通宵',
    suit: 'rd',
    cost: 1,
    blurb: '立刻给进行中的课题推进 1 个月。',
    playText: '样品在天亮前跑通，课题进度 +1 个月。',
  },
  {
    id: 'bridge',
    name: '过桥资金',
    suit: 'management',
    cost: 0.5,
    blurb: '立刻到账 ¥5万，同时增加等额负债。',
    playText: '现金到账，账上也多了一笔债。',
  },
  {
    id: 'clearance',
    name: '折价清库',
    suit: 'production',
    cost: 1,
    blurb: '成品库存按账面成本七折变现，清掉库龄。',
    playText: '成品按七折出清，现金回笼，库龄归零。',
  },
  {
    id: 'collect',
    name: '催收专班',
    suit: 'sales',
    cost: 1,
    blurb: '到期及逾期应收账款本月全部收回。',
    playText: '催收组上门对账，到期和逾期账款一次收回。',
  },
  {
    id: 'creditPush',
    name: '赊销铺货',
    suit: 'sales',
    cost: 1,
    blurb: '加一张走量单，货款全部赊销，账期多一个月。',
    playText: '渠道愿接货，但货款全挂应收，账期拉长。',
  },
  {
    id: 'rushBuy',
    name: '紧急调货',
    suit: 'procurement',
    cost: 1,
    blurb: '选择一种原料，本月现货钢材/塑料 +8，芯片 +2，合金 +1。',
    playText: '货代把一车料抢了回来，本月额度放宽。',
  },
  {
    id: 'secondSource',
    name: '第二货源',
    suit: 'procurement',
    cost: 1,
    blurb: '选择一种原料，本季剩余月份现货生成时钢材/塑料 +4，芯片/合金 +1。',
    playText: '备用供应商备案完成，本季配额加一档。',
  },
  {
    id: 'importChips',
    name: '进口到港',
    suit: 'procurement',
    cost: 1,
    blurb: '本月芯片现货 +3。',
    playText: '报关单下来了，芯片额度松了一截。',
  },
];

export const EVENTS: EventDef[] = [
  {
    id: 'steelSpike',
    title: '钢厂临时限售',
    monthHint: '原料',
    body: '北方钢厂联合限售。现货被抬上去，你们名下的到货配额也被砍了一刀。补库存会更贵，本月能买到的钢材也更少。',
    impact: '钢材报价上调，库存钢材被划走一部分，本月钢材现货额度同步收紧。幅度随月份浮动。',
    tone: 'bad',
    family: 'material',
    weight: 3,
  },
  {
    id: 'plasticSpike',
    title: '塑料粒断供',
    monthHint: '原料',
    body: '华东聚合装置检修。塑料现货被抢，你们的到货也少了一截，本月能买到的塑料更紧。',
    impact: '塑料报价上调，库存塑料被划走一部分，本月塑料现货额度同步收紧。幅度随月份浮动。',
    tone: 'bad',
    family: 'material',
    weight: 2,
  },
  {
    id: 'bigOrder',
    title: '连锁超市加单',
    monthHint: '订单',
    body: '合同已经盖章，不是询盘。基础款必须在本月交齐，交不出就按合同扣违约金。',
    impact: '合同单：基础款。交不出扣违约金。件数和罚金随月份浮动。',
    tone: 'mixed',
    family: 'order',
    weight: 2,
    channelOnly: true,
  },
  {
    id: 'resign',
    title: '骨干被挖走',
    monthHint: '人事',
    body: '对岸开出了你们跟不上的价。人今早没来打卡，产线立刻缺一档。',
    impact: '失去 1 名生产人员；若编制已空，本月产能再削一档。',
    tone: 'bad',
    family: 'hr',
    weight: 3,
  },
  {
    id: 'quality',
    title: '抽检不合格',
    monthHint: '合规',
    body: '市监局抽中了库存成品。罚款当场划走，渠道也把订单砍了一截。',
    impact: '罚款并清零成品库存，本月需求收紧。罚款和订单收缩随月份浮动。',
    tone: 'bad',
    family: 'quality',
    weight: 3,
  },
  {
    id: 'dump',
    title: '竞品清仓库',
    monthHint: '价格战',
    body: '隔壁厂按成本价甩货。货架还在，但标价和订单量都被压下去了。',
    impact: '本月售价与需求同步下压。幅度随月份浮动。',
    tone: 'bad',
    family: 'price',
    weight: 3,
  },
  {
    id: 'blackout',
    title: '工业错峰限电',
    monthHint: '产能',
    body: '供电所通知本周错峰。产线必须停半班，没有备用电可买。本月能出的货比计划少一截。',
    impact: '本月产能下降。幅度随月份浮动。',
    tone: 'bad',
    family: 'capacity',
    weight: 3,
  },
  {
    id: 'tax',
    title: '进项转出补税',
    monthHint: '税务',
    body: '金税标红的进项被要求转出。税局直接从基本户扣款，没有申诉窗口。手头立刻紧一档。',
    impact: '补税现金当场划走。金额随月份浮动。',
    tone: 'bad',
    family: 'tax',
    weight: 3,
  },
  {
    id: 'chipSqueeze',
    title: '芯片交期拉长',
    monthHint: '原料',
    body: '分销商把现货和配额一起收紧。标准款、旗舰款的料更贵，库里那点芯片也少了一片，本月几乎买不到。',
    impact: '芯片报价上调，库存芯片被划走，本月芯片现货额度同步收紧。幅度随月份浮动。',
    tone: 'bad',
    family: 'material',
    weight: 3,
    minMonth: 3,
  },
  {
    id: 'machineDown',
    title: '关键设备停机',
    monthHint: '基建',
    body: '主轴过热，一条线本月修不好。抢修预付已经划走，产能按少一台设备算。',
    impact: '预付抢修，本月产能按少一台设备计算。预付额随月份浮动。',
    tone: 'bad',
    family: 'capacity',
    weight: 3,
  },
  {
    id: 'channelHold',
    title: '渠道压款退货',
    monthHint: '回款',
    body: '两家经销商同步压款，并退回一部分意向单。账上先被划走一笔准备金，本月能卖掉的件数也少了。',
    impact: '划走准备金，本月需求收紧。金额随月份浮动。',
    tone: 'bad',
    family: 'ar',
    weight: 3,
  },
  {
    id: 'bankCall',
    title: '银行抽贷审查',
    monthHint: '融资',
    body: '客户经理带着审查名单上门。有负债就先扣回一截；没负债也要交评估费。',
    impact: '有负债则强制收回一截；无负债则交评估费。金额随月份浮动。',
    tone: 'bad',
    family: 'finance',
    weight: 2,
  },
  {
    id: 'rushOrder',
    title: '经销商压货',
    monthHint: '旺季',
    body: '渠道把锁货函直接传真过来。量是给了，单价被砍了一刀。交不齐同样按违约处理。',
    impact: '合同单：基础款；售价下压。件数和罚金随月份浮动。',
    tone: 'mixed',
    family: 'order',
    weight: 2,
    channelOnly: true,
  },
  {
    id: 'rushStandard',
    title: '标准款加急',
    monthHint: '订单',
    body: '渠道点名要标准款。量不大，但本月必须交齐，交不出按违约扣。',
    impact: '合同单：标准款 2–4 件。件数和罚金随月份浮动。',
    tone: 'mixed',
    family: 'order',
    weight: 2,
    minMonth: 4,
    channelOnly: true,
  },
  {
    id: 'poach',
    title: '实验室被挖空',
    monthHint: '研发',
    body: '猎头把实验室的人挖走了。有研发编制就立刻缺人；没人值守的话，工艺也跟着松一档。',
    impact: '失去 1 名研发；若无人在岗，研发进度回退，本月产能 -3。',
    tone: 'bad',
    family: 'hr',
    weight: 2,
    minMonth: 4,
    requires: ['rdStaff'],
  },
  {
    id: 'rebate',
    title: '出口退税到账',
    monthHint: '政策',
    body: '一笔小额退税进了基本户。能缓一口气，但撑不起整月的产销。',
    impact: '现金到账。金额随月份浮动。',
    tone: 'good',
    family: 'policy',
    weight: 2,
  },
  {
    id: 'stockAge',
    title: '库龄专项审计',
    monthHint: '存货',
    body: '事务所把呆滞料单贴到了墙上。库龄被往后推一档，跌价准备要按更老的口径提。',
    impact: '全部存货库龄 +1 个月，按新库龄补提存货跌价。',
    tone: 'bad',
    family: 'inventory',
    weight: 2,
  },
  {
    id: 'dampStock',
    title: '原料受潮结块',
    monthHint: '存货',
    body: '雨季仓库渗水。在库超过一个月的原料可变现净值明显下降，当月要加提跌价。',
    impact: '库龄不少于 1 个月的原材料库龄加快 2 个月，按新库龄补提存货跌价。',
    tone: 'bad',
    family: 'inventory',
    weight: 2,
    minMonth: 2,
  },
  {
    id: 'arDelay',
    title: '经销商压账',
    monthHint: '回款',
    body: '两家经销商同步把承兑往后推。货已经出了，现金却要再等一个月。',
    impact: '全部应收账款到期日推迟 1 个月。',
    tone: 'bad',
    family: 'ar',
    weight: 2,
    minMonth: 2,
    requires: ['receivables'],
  },
  {
    id: 'customerBreak',
    title: '客户失联跑路',
    monthHint: '信用',
    body: '最大一笔逾期客户联系不上。律师函发出去了，账上那笔应收要按核销处理。',
    impact: '核销金额最大的一笔逾期应收；若无逾期则核销最早一笔应收的一半。',
    tone: 'bad',
    family: 'ar',
    weight: 2,
    minMonth: 3,
    requires: ['receivables'],
  },
  {
    id: 'arRecover',
    title: '陈欠清收回笼',
    monthHint: '回款',
    body: '法务把一笔拖了很久的货款追回来了。现金进账，坏账准备跟着转回。',
    impact: '收回金额最大的一笔已到期应收。',
    tone: 'good',
    family: 'ar',
    weight: 2,
    minMonth: 3,
    requires: ['receivables'],
  },
  {
    id: 'talentIn',
    title: '校招补到人',
    monthHint: '人事',
    body: '职校把人直接送到岗。不用付招聘费，产线立刻多一双手。',
    impact: '免费入职 1 名生产人员，当月薪酬照计。',
    tone: 'good',
    family: 'hr',
    weight: 2,
  },
  {
    id: 'govSubsidy',
    title: '稳岗补贴到账',
    monthHint: '政策',
    body: '人社把一笔稳岗返还打进基本户。钱不多，但能垫一笔工资。',
    impact: '现金到账。金额随月份浮动。',
    tone: 'good',
    family: 'policy',
    weight: 2,
  },
  {
    id: 'priceRally',
    title: '渠道补库存',
    monthHint: '行情',
    body: '下游突然补货。标价有空间，意向单也密了一档。',
    impact: '本月售价上浮，需求放宽。幅度随月份浮动。',
    tone: 'good',
    family: 'price',
    weight: 2,
  },
  {
    id: 'chipAlloc',
    title: '芯片配额到货',
    monthHint: '原料',
    body: '分销商把一小波配额划给你们。一部分直接入库，本月还能多买几片。',
    impact: '免费到货一批芯片，按市价入账；本月芯片现货额度放宽。',
    tone: 'good',
    family: 'material',
    weight: 2,
    minMonth: 3,
  },
  {
    id: 'vendorCredit',
    title: '供应商给账期',
    monthHint: '采购',
    body: '原料商愿意让一刀。下一次采购按折扣结算。',
    impact: '下一次原料采购八五折。',
    tone: 'good',
    family: 'finance',
    weight: 2,
  },
  {
    id: 'inspectBonus',
    title: '抽检合格公示',
    monthHint: '合规',
    body: '市监局把合格名单贴了出来。渠道愿意多接一点货。',
    impact: '本月需求放宽。幅度随月份浮动。',
    tone: 'good',
    family: 'quality',
    weight: 2,
  },
  {
    id: 'wageAudit',
    title: '社保补缴通知',
    monthHint: '人事',
    body: '稽核组按人数倒算差额。补缴款直接从基本户划走。',
    impact: '补缴现金当场划走。金额随月份浮动。',
    tone: 'bad',
    family: 'tax',
    weight: 2,
    minMonth: 2,
  },
  {
    id: 'logisticsJam',
    title: '运力紧张',
    monthHint: '产能',
    body: '高速限行，成品发不出去，原料也进得慢。产线和订单一起松一档。',
    impact: '本月产能和需求同步下降。幅度随月份浮动。',
    tone: 'bad',
    family: 'capacity',
    weight: 2,
  },
  {
    id: 'idleSeason',
    title: '淡季空窗',
    monthHint: '订单',
    body: '渠道集体观望。询盘还在，真正能落的单少了一截。',
    impact: '本月需求明显收紧。幅度随月份浮动。',
    tone: 'bad',
    family: 'order',
    weight: 2,
  },
  {
    id: 'moldWear',
    title: '模具磨损',
    monthHint: '基建',
    body: '型腔已经跑毛。要换配件，产线本月也快不起来。',
    impact: '预付配件，本月产能下降。金额随月份浮动。',
    tone: 'bad',
    family: 'capacity',
    weight: 2,
  },
  {
    id: 'salesLeave',
    title: '销售离职',
    monthHint: '人事',
    body: '负责跟单的人把电脑交了。有编制就立刻缺人；没人在岗，本月订单也会少一截。',
    impact: '失去 1 名销售；若编制已空，本月需求再收一档。',
    tone: 'bad',
    family: 'hr',
    weight: 2,
    minMonth: 2,
  },
  {
    id: 'utilityBill',
    title: '电费清算',
    monthHint: '税务',
    body: '供电所把上季度差额一并开票。现金当场划走。',
    impact: '电费现金当场划走。金额随月份浮动。',
    tone: 'bad',
    family: 'tax',
    weight: 2,
  },
  {
    id: 'traderDump',
    title: '钢贸压货',
    monthHint: '原料',
    body: '钢贸商库存压不住了，厂供额度松一档，加价盘上也多出几车。',
    impact: '本月钢材现货 +8，贸易商钢材 +4。报价不变。',
    tone: 'good',
    family: 'material',
    weight: 2,
  },
  {
    id: 'plasticRestart',
    title: '聚合装置复产',
    monthHint: '原料',
    body: '华东装置重新开车。有一小波塑料按市价划到你们名下，本月还能再买一些。',
    impact: '免费入库塑料 4 件，按市价入账；本月塑料现货再 +4。',
    tone: 'good',
    family: 'material',
    weight: 2,
  },
  {
    id: 'contractWindow',
    title: '协议窗口',
    monthHint: '采购',
    body: '供应商本月愿意签季度锁量。预付能少一刀，合同也不占行动点。',
    impact: '本月签订长期协议不耗行动点，预付按九折。仍只能有一份。',
    tone: 'mixed',
    family: 'material',
    weight: 2,
    minMonth: 2,
  },
  {
    id: 'buyerLeave',
    title: '采购跳槽',
    monthHint: '人事',
    body: '对岸把你们的采购挖走了。货源还在，但本月能买到的量立刻瘦一圈。',
    impact: '有采购则 -1 人；否则本月现货各砍一档。',
    tone: 'bad',
    family: 'hr',
    weight: 2,
    minMonth: 3,
  },
];

export const MATERIAL_IDS: MaterialId[] = ['a', 'b', 'c', 'd'];

export function bomKey(bom: Bom): string {
  return MATERIAL_IDS.map((id) => `${id}:${bom[id] ?? 0}`).join('|');
}

export function isVolumeProduct(def: ProductDef): boolean {
  return def.tier === '低端' || def.tier === '走量' || def.baseDemand >= 16;
}

export function isPremiumProduct(def: ProductDef): boolean {
  return def.tier === '高端' || def.id === 'premium' || def.id === 'special';
}

export function catalogOf(state: ProductCatalogSource): ProductDef[] {
  const list: ProductDef[] = [...PRODUCTS];
  const seen = new Set(list.map((item) => item.id));
  for (const item of state.extraProducts ?? []) {
    if (seen.has(item.id)) continue;
    list.push(item);
    seen.add(item.id);
  }
  const draft = state.rdProductDraft;
  if (draft && !seen.has(draft.id)) {
    list.push(draft);
    seen.add(draft.id);
  }
  for (const item of LEGACY_RD_PRODUCTS) {
    if (!(state.unlockedProducts ?? []).includes(item.id) || seen.has(item.id)) continue;
    list.push(item);
    seen.add(item.id);
  }
  return list;
}

export function unlockedCatalog(state: ProductCatalogSource): ProductDef[] {
  const unlocked = new Set(state.unlockedProducts ?? []);
  return catalogOf(state).filter((item) => unlocked.has(item.id));
}

export function productFrom(catalog: ProductDef[], id: string): ProductDef {
  const found = catalog.find((item) => item.id === id);
  if (found) return found;
  const legacy = LEGACY_RD_PRODUCTS.find((item) => item.id === id);
  if (legacy) return legacy;
  const core = PRODUCTS.find((item) => item.id === id);
  if (core) return core;
  throw new Error(`Unknown product ${id}`);
}

export function productById(id: string, catalog?: ProductDef[]): ProductDef {
  return productFrom(catalog ?? [...PRODUCTS, ...LEGACY_RD_PRODUCTS], id);
}

export function cardById(id: string): CardDef {
  const found = CARDS.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown card ${id}`);
  return found;
}

export function cardNeedsMaterial(id: string): boolean {
  return id === 'rushBuy' || id === 'secondSource';
}

export function rushSpotBonus(id: MaterialId): number {
  if (id === 'a' || id === 'b') return 8;
  if (id === 'c') return 2;
  return 1;
}

export function seasonSpotBonus(id: MaterialId): number {
  return id === 'a' || id === 'b' ? 4 : 1;
}

export function eventById(id: string): EventDef {
  const found = EVENTS.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown event ${id}`);
  return found;
}

export function materialById(id: MaterialId): MaterialDef {
  return MATERIALS.find((item) => item.id === id)!;
}
