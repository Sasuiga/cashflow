export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'open', name: '开业大吉', desc: '北港制造正式开工。' },
  { id: 'firstSettle', name: '第一笔账', desc: '完成第一次月度结算。' },
  { id: 'cards', name: '立项开工', desc: '完成一次提案立项。' },
  { id: 'hire6', name: '班子齐了', desc: '编制达到 6 人。' },
  { id: 'machine2', name: '产线扩容', desc: '设备不少于 2 台。' },
  { id: 'factory2', name: '开第二厂', desc: '厂区不少于 2 座。' },
  { id: 'rd1', name: '实验室亮灯', desc: '招到第一名研发人员。' },
  { id: 'newProduct', name: '产品上新', desc: '研发出新产品。' },
  { id: 'patent', name: '第一件装备', desc: '拿到第一项知识产权。' },
  { id: 'cash500', name: '现金过半百', desc: '现金达到 ¥50.0万。' },
  { id: 'net1000', name: '百万身家', desc: '净资产达到 ¥100.0万。' },
  { id: 'loan', name: '加杠杆', desc: '账上出现负债。' },
  { id: 'debtFree', name: '无债一身轻', desc: '借过钱并全部还清。' },
  { id: 'survive6', name: '半年报', desc: '经营满 6 个月。' },
  { id: 'premium', name: '旗舰出货', desc: '以旗舰款完成一次结算。' },
];
