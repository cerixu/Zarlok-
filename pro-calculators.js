import { allIngredients } from './recipes.js';
import { recipeCost } from './calculator.js';

export function scaleBatch(baseAmount, baseYield, targetYield){const b=Number(baseAmount),y=Number(baseYield),t=Number(targetYield);if(!(b>=0&&y>0&&t>=0))return 0;return b*t/y;}
export function productionYield(input, output){const i=Number(input),o=Number(output);return i>0&&o>=0?o/i*100:0;}
export function lossPercent(input, output){const i=Number(input),o=Number(output);return i>0&&o>=0?Math.max(0,(i-o)/i*100):0;}
export function batchPlan(recipe, targetYield){const base=Number(recipe?.yieldAmount);if(!(base>0))return null;const factor=Number(targetYield)/base;return {factor,ingredients:allIngredients(recipe).map(i=>({...i,amount:i.amount==null?i.amount:i.amount*factor}))};}
export function costBreakdown(recipe, factor=1, priceResolver){const out=recipeCost(recipe,factor,{priceResolver});return {total:out.total,perPortion:out.perPortion,foodCostPct:out.foodCostPct,missing:out.missing,lines:out.lines};}
export function inventoryCoverage(required,available){const r=Number(required),a=Number(available);if(!(r>0))return {ratio:1,missing:0,percent:100};return {ratio:a/r,missing:Math.max(0,r-a),percent:Math.min(100,a/r*100)};}

export function realFoodCost(recipe, factor=1, options={}) {
  const base=costBreakdown(recipe,factor,options.priceResolver);
  const packaging=Number(options.packaging||0);
  const wastePercent=Math.max(0,Number(options.wastePercent||0))/100;
  const ingredientWithWaste=base.total*(1+wastePercent);
  const total=ingredientWithWaste+packaging;
  const portions=recipe?.servings?Number(recipe.servings)*Number(factor||1):null;
  return { ...base, packaging, wastePercent, ingredientWithWaste, total, perPortion:portions?total/portions:null };
}
export function priceTrend(history){
  const rows=[...(history||[])].filter(x=>Number.isFinite(Number(x.price))).sort((a,b)=>a.at-b.at);
  if(rows.length<2)return {first:rows[0]?.price??null,last:rows.at(-1)?.price??null,change:0,percent:0};
  const first=Number(rows[0].price),last=Number(rows.at(-1).price);
  return {first,last,change:last-first,percent:first?((last-first)/first)*100:0};
}
