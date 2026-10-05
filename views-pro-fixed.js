import { h, screen, button, iconBtn, toast, field, textInput, selectEl, openSheet } from './ui.js';
import { navigate } from './router.js';
import { listInventory, loadInventory, subscribeInventory } from './inventory.js';
import { listSuppliers, addSupplier, createPurchaseOrder, listPurchaseOrders, receiveDelivery, listDeliveries, recordWaste, startStocktake, updateStocktake, finalizeStocktake, listStocktakes, listLots, createProductionBatch, completeProductionBatch, planRecipe, analyticsSummary, adjustStockPro, wasteReport, salesDeplete, parseSalesCsv, importSalesCsv, reorderSuggestions, expiryAlerts, runInventoryAutopilot } from './pro.js';
import { listRecipes, getSetting, setSetting } from './recipes.js';

const units=[['g','g'],['kg','kg'],['ml','ml'],['l','l'],['szt','szt'],['opak','opak']];
const n=(v)=>Number(v||0);
const money=(v)=>n(v).toLocaleString('pl-PL',{maximumFractionDigits:2});

export function proView(){
 const s=screen({title:'Żarłok PRO',right:iconBtn('refresh','Odśwież',()=>render())});
 let tab=new URLSearchParams(location.hash.split('?')[1]||'').get('tab')||'dashboard',unsub;
 const nav=(id,label)=>button(label,{sm:true,kind:tab===id?'primary':'ghost',onClick:()=>{tab=id;render();}});
 async function render(){
  const menu=h('div',{class:'pro-nav'},nav('dashboard','Dashboard'),nav('delivery','Dostawy'),nav('orders','Zamówienia'),nav('production','Produkcja'),nav('planning','Planowanie'),nav('analytics','Analityka'),nav('waste','Straty'),nav('stocktakes','Inwentaryzacje'),nav('lots','Partie i terminy'),nav('automation','Automatyzacje'));
  if(tab==='waste'){
    s.content.replaceChildren(menu,h('div',{class:'stack'},h('div',{class:'card'},h('h3',null,'Raport strat'),h('p',{class:'muted'},'Ładuję raport tygodniowy…'))));
    try{s.content.replaceChildren(menu,await wasteView());}catch(e){console.error(e);s.content.replaceChildren(menu,h('div',{class:'card'},h('h3',null,'Raport strat'),h('p',{class:'muted'},'Nie udało się wczytać raportu strat.')));}
    return;
  }
  if(tab==='lots'){
    s.content.replaceChildren(menu,h('div',{class:'stack'},h('div',{class:'card'},h('h3',null,'Partie i terminy ważności'),h('p',{class:'muted'},'Ładuję partie…'))));
    try{s.content.replaceChildren(menu,await lotsView());}catch(e){console.error(e);s.content.replaceChildren(menu,h('div',{class:'card'},h('h3',null,'Partie i terminy ważności'),h('p',{class:'muted'},'Nie udało się wczytać partii.')));}
    return;
  }
  if(tab==='stocktakes'){
    s.content.replaceChildren(menu,h('div',{class:'stack'},h('div',{class:'card'},h('h3',null,'Inwentaryzacje'),h('p',{class:'muted'},'Ładuję historię spisów…'))));
    try{s.content.replaceChildren(menu,await stocktakesView());}catch(e){console.error(e);s.content.replaceChildren(menu,h('div',{class:'card'},h('h3',null,'Inwentaryzacje'),h('p',{class:'muted'},'Nie udało się wczytać historii inwentaryzacji.')));}
    return;
  }
  if(tab==='automation'){
    s.content.replaceChildren(menu,h('div',{class:'stack'},h('div',{class:'card'},h('h3',null,'Autopilot magazynu'),h('p',{class:'muted'},'Ładuję automatyzacje…'))));
    try{s.content.replaceChildren(menu,await automationView());}catch(e){console.error(e);s.content.replaceChildren(menu,h('div',{class:'card'},h('h3',null,'Autopilot magazynu'),h('p',{class:'muted'},'Nie udało się wczytać automatyzacji.')));}
    return;
  }

  s.content.replaceChildren(menu,h('p',{class:'muted'},'Ładuję dane…'));

  try{
    await loadInventory();
    const summary=await analyticsSummary();
    const inv=listInventory();
    const [suppliers,orders,deliveries]=await Promise.all([listSuppliers(),listPurchaseOrders(),listDeliveries()]);
    let body;
    if(tab==='dashboard') body=h('div',{class:'stack'},
      h('div',{class:'results-grid'},
        stat('Produkty',summary.products),stat('Niskie stany',summary.low),stat('Wartość',money(summary.stockValue)+' zł'),stat('Straty',money(summary.wasteValue)+' zł'),
        stat('Dostawy',summary.deliveries),stat('Zamówienia',summary.orders),stat('Ruchy',summary.movements),stat('Spisy',summary.stocktakes)),
      h('div',{class:'card'},h('h3',null,'Operacje'),button('Nowa dostawa',{kind:'primary',onClick:()=>deliverySheet(suppliers)}),button('Strata',{onClick:()=>wasteSheet(inv)}),button('Korekta',{onClick:()=>adjustSheet(inv)}),button('Inwentaryzacja',{onClick:()=>stocktake()})));
    else if(tab==='delivery') body=listBlock('Dostawy',deliveries.map(x=>x.supplierName||'Bez dostawcy'),()=>deliverySheet(suppliers),'Nowa dostawa');
    else if(tab==='orders') body=listBlock('Zamówienia',orders.map(x=>(x.supplierName||'Bez dostawcy')+' · '+x.status),()=>orderSheet(suppliers),'Nowe zamówienie');
    else if(tab==='production') body=h('div',{class:'stack'},h('h3',null,'Produkcja półproduktów'),button('Nowa produkcja',{kind:'primary',onClick:()=>productionSheet()}),h('p',{class:'muted'},'Produkcja może korzystać z receptury wejściowej i automatycznie przyjąć wynik do Magazynu.'));
    else if(tab==='planning') body=h('div',{class:'stack'},h('h3',null,'Planowanie'),...listRecipes().slice(0,30).map(r=>h('div',{class:'card'},h('div',{class:'row between'},h('strong',null,r.name),button('Sprawdź braki',{sm:true,onClick:async()=>{const x=await planRecipe(r,1);const m=x.filter(z=>z.missing>0);toast(m.length?'Braki: '+m.map(z=>z.name+' '+z.missing+' '+z.unit).join(', '):'Komplet składników');}})))));
    else body=h('div',{class:'stack'},h('h3',null,'Analityka'),stat('Ruchy',summary.movements),stat('Straty',summary.waste),stat('Dostawy',summary.deliveries),stat('Zamówienia',summary.orders),h('div',{class:'card'},h('strong',null,'Historia cen'),...summary.priceChanges.slice(0,12).map(x=>h('p',null,x.inventoryName+': '+money(x.price)+' zł/'+x.priceUnit))));
    s.content.replaceChildren(menu,body);
  }catch(e){
    console.error(e);
    s.content.replaceChildren(menu,h('div',{class:'card'},h('h3',null,'Nie udało się wczytać danych PRO'),h('p',{class:'muted'},String(e?.message||e))));
  }
 }
 const stat=(k,v)=>h('div',{class:'result'},h('span',{class:'result-k'},k),h('strong',{class:'result-v'},String(v)));
 const listBlock=(title,rows,action,label)=>h('div',{class:'stack'},h('div',{class:'row between'},h('h3',null,title),button(label,{kind:'primary',onClick:action})),...rows.map(x=>h('div',{class:'card'},x)));
 function deliverySheet(suppliers){let supplierId='',supplierName='',name='',qty='',unit='kg',price='',lot='',expiryAt='',documentNo='';const form=h('div',{class:'stack'},field('Dostawca',selectEl([['','Brak'],...suppliers.map(x=>[x.id,x.name])],'',v=>{supplierId=v;supplierName=suppliers.find(x=>x.id===v)?.name||''})),textInput({label:'Produkt',onInput:v=>name=v}),textInput({type:'number',label:'Ilość',onInput:v=>qty=v}),selectEl(units,unit,v=>unit=v),textInput({type:'number',label:'Cena zakupu',onInput:v=>price=v}),textInput({label:'Numer dokumentu',placeholder:'FV / WZ',onInput:v=>documentNo=v}),textInput({label:'Partia',onInput:v=>lot=v}),textInput({type:'date',label:'Termin ważności',onInput:v=>expiryAt=v}));openSheet({title:'Dostawa',variant:'sheet',body:form,actions:[{label:'Anuluj',kind:'ghost'},{label:'Przyjmij',kind:'primary',onClick:async()=>{const result=await receiveDelivery({supplierId,supplierName,documentNo,items:[{name,quantity:qty,unit,purchasePrice:price,priceUnit:unit,lot,expiryAt:expiryAt?new Date(expiryAt+'T23:59:59').getTime():null}]});toast('Dostawa przyjęta');render();}}]});}
 function bulkOrderSheet(suppliers,reorders){let supplierId='',supplierName='';const form=h('div',{class:'stack'},field('Dostawca',selectEl([['','Brak'],...suppliers.map(x=>[x.id,x.name])],'',v=>{supplierId=v;supplierName=suppliers.find(x=>x.id===v)?.name||''})),h('div',{class:'card'},h('strong',null,'Pozycje zamówienia'),...reorders.map(x=>h('p',null,x.name+' · '+money(x.orderQuantity)+' '+x.unit))));openSheet({title:'Zamówienie z sugestii',variant:'sheet',body:form,actions:[{label:'Anuluj',kind:'ghost'},{label:'Utwórz zamówienie',kind:'primary',onClick:async()=>{await createPurchaseOrder({supplierId,supplierName,status:'ordered',notes:'Utworzone z autopilota magazynu',items:reorders.map(x=>({id:'suggest_'+x.id,name:x.name,amount:x.orderQuantity,unit:x.unit}))});toast('Zamówienie utworzone 📦');render();}}]});}
 function orderSheet(suppliers){let supplierId='',supplierName='',name='',qty='',unit='kg';const form=h('div',{class:'stack'},field('Dostawca',selectEl([['','Brak'],...suppliers.map(x=>[x.id,x.name])],'',v=>{supplierId=v;supplierName=suppliers.find(x=>x.id===v)?.name||''})),textInput({label:'Produkt',onInput:v=>name=v}),textInput({type:'number',label:'Ilość',onInput:v=>qty=v}),selectEl(units,unit,v=>unit=v));openSheet({title:'Zamówienie',variant:'sheet',body:form,actions:[{label:'Anuluj',kind:'ghost'},{label:'Zapisz',kind:'primary',onClick:async()=>{await createPurchaseOrder({supplierId,supplierName,status:'ordered',items:[{name,amount:qty,unit}]});toast('Zamówienie zapisane');render();}}]});}
 function wasteSheet(inv){
  if(!inv.length)return toast('Magazyn jest pusty',{type:'error'});
  let id=inv[0].id,qty='',reason='zepsucie',note='';
  const reasons=[['zepsucie','Zepsucie'],['przeterminowanie','Przeterminowanie'],['błąd produkcji','Błąd produkcji'],['zwrot','Zwrot'],['inne','Inne']];
  const form=h('div',{class:'stack'},
    h('p',{class:'muted'},'Zapisz wyrzucony produkt. Stan magazynu zostanie pomniejszony automatycznie.'),
    field('Produkt',selectEl(inv.map(x=>[x.id,x.name]),id,v=>id=v)),
    textInput({type:'number',label:'Ilość',placeholder:'np. 0,5',onInput:v=>qty=v}),
    field('Powód',selectEl(reasons,reason,v=>reason=v)),
    textInput({label:'Notatka',placeholder:'np. uszkodzone opakowanie',onInput:v=>note=v})
  );
  openSheet({title:'Dodaj stratę',variant:'sheet',body:form,actions:[
    {label:'Anuluj',kind:'ghost'},
    {label:'Zapisz stratę',kind:'primary',icon:'check',onClick:async()=>{
      try{const row=await recordWaste(id,qty,reason,note);toast('Strata zapisana · '+money(row.costValue||0)+' zł');render();}
      catch(e){toast(e.message||'Nie udało się zapisać straty',{type:'error'});return false;}
    }}
  ]});
}
 async function stocktakesView(){
  const rows=await listStocktakes();
  if(!rows.length) return h('div',{class:'stack'},
    h('div',{class:'card'},h('h3',null,'Inwentaryzacje'),h('p',{class:'muted'},'Nie wykonano jeszcze żadnego spisu.')),
    button('Nowa inwentaryzacja',{kind:'primary',onClick:()=>stocktake()}));
  const cards=rows.map(t=>{
    const closed=t.status==='closed';
    const differences=(t.items||[]).filter(x=>n(x.difference)!==0);
    const counted=(t.items||[]).filter(x=>x.countedQuantity!=null).length;
    const total=t.items?.length||0;
    const net=differences.reduce((s,x)=>s+n(x.difference),0);
    return h('div',{class:'card'},
      h('div',{class:'row between'},
        h('div',null,h('strong',null,new Date(t.closedAt||t.createdAt).toLocaleDateString('pl-PL')),h('p',{class:'muted'},closed?'Zamknięta':'W toku')),
        h('strong',null,closed?(differences.length+' różnic'):(counted+'/'+total+' policzonych'))
      ),
      h('p',{class:'muted'},closed?'Łączna różnica ilościowa: '+(net>0?'+':'')+money(net):'Spis można kontynuować z poziomu Magazynu.'),
      t.note?h('p',{class:'muted'},'Notatka: '+t.note):null
    );
  });
  return h('div',{class:'stack'},
    h('div',{class:'row between'},h('div',null,h('h3',null,'Historia inwentaryzacji'),h('p',{class:'muted'},rows.length+' spis'+(rows.length===1?'':'y'))),button('Nowa inwentaryzacja',{kind:'primary',onClick:()=>stocktake()})),
    ...cards
  );
 }

 async function lotsView(){
  const rows=await listLots();
    let filter='all';
  const host=h('div',{class:'stack'});
  const now=Date.now(), soonLimit=now+7*86400000;
  const getState=(x)=>x.expiryAt&&x.expiryAt<now?'expired':x.expiryAt&&x.expiryAt<=soonLimit?'soon':'normal';
  const renderLots=()=>{
    const filtered=rows.filter(x=>filter==='all'||getState(x)===filter);
    const visible=filtered.length?filtered.map(x=>{
      const state=getState(x);
      const expiry=x.expiryAt?new Date(x.expiryAt).toLocaleDateString('pl-PL',{day:'2-digit',month:'2-digit',year:'numeric'}):'Brak terminu';
      const label=state==='expired'?'PRZETERMINOWANA':state==='soon'?'WKRÓTCE':x.expiryAt? 'W TERMINIE':'BEZ TERMINU';
      return h('div',{class:'card'},
        h('div',{class:'row between'},
          h('div',null,h('strong',null,x.inventoryName||'Produkt'),h('p',{class:'muted'},x.lot?'Partia: '+x.lot:'Partia: brak numeru')),
          h('strong',{class:state==='expired'?'danger-text':''},label)
        ),
        h('div',{class:'row between'},h('span',null,'Ilość'),h('strong',null,money(x.quantity)+' '+(x.unit||''))),
        h('div',{class:'row between'},h('span',null,'Termin ważności'),h('strong',{class:state==='expired'?'danger-text':''},expiry)),
        x.documentNo?h('p',{class:'muted'},'Dostawa: '+x.documentNo+' · '+new Date(x.at||Date.now()).toLocaleDateString('pl-PL')):h('p',{class:'muted'},'Źródło dostawy: brak numeru')
      );
    }):[h('div',{class:'card'},h('p',{class:'muted'},'Brak partii dla wybranego filtra.'))];
    host.replaceChildren(h('div',{class:'row between wrap'},button('Wszystkie',{sm:true,kind:filter==='all'?'primary':'ghost',onClick:()=>{filter='all';renderLots();}}),button('Wkrótce',{sm:true,kind:filter==='soon'?'primary':'ghost',onClick:()=>{filter='soon';renderLots();}}),button('Przeterminowane',{sm:true,kind:filter==='expired'?'primary':'ghost',onClick:()=>{filter='expired';renderLots();}})),h('div',{class:'card'},h('h3',null,'Partie i terminy ważności'),h('p',{class:'muted'},rows.length+' part'+(rows.length===1?'ia':rows.length<5?'ie':'ii')+' · Wkrótce = 7 dni')), ...visible);
  };
  renderLots();
  return host;
 }
 async function wasteView(){
  const r=await wasteReport();
  const range=new Date(r.start).toLocaleDateString('pl-PL',{day:'2-digit',month:'2-digit'})+'–'+new Date(r.end).toLocaleDateString('pl-PL',{day:'2-digit',month:'2-digit'});
  const productRows=r.products.length
    ? r.products.map(x=>h('div',{class:'row between'},h('span',null,x.name+' · '+money(x.amount)+' '+x.unit),h('strong',null,money(x.cost)+' zł')))
    : [h('p',{class:'muted'},'Brak danych.')];
  const reasonRows=r.reasons.length
    ? r.reasons.map(x=>h('div',{class:'row between'},h('span',null,x.reason),h('strong',null,money(x.cost)+' zł')))
    : [h('p',{class:'muted'},'Brak danych.')];
  return h('div',{class:'stack'},
    h('div',{class:'card'},h('div',{class:'row between'},
      h('div',null,h('h3',null,'Raport strat'),h('p',{class:'muted'},'Bieżący tydzień · '+range)),
      h('strong',null,money(r.totalCost)+' zł')
    ),h('p',{class:'muted'},r.totalEntries?'Koszt liczony według ceny z chwili wyrzucenia.':'Brak strat w tym tygodniu.'),
      button('Dodaj stratę',{kind:'primary',icon:'plus',onClick:()=>wasteSheet(listInventory())})),
    h('div',{class:'card'},h('h3',null,'Największe straty'),...productRows),
    h('div',{class:'card'},h('h3',null,'Według powodu'),...reasonRows)
  );
}

async function automationView(){
  const enabled=!!getSetting('inventoryAutoShopping');
  const [reorders,expiring]=await Promise.all([reorderSuggestions(),expiryAlerts(3)]);
  const reorderRows=reorders.length
    ? reorders.slice(0,10).map(x=>h('div',{class:'row between'},h('span',null,x.name+' · stan '+money(x.quantity)+' '+x.unit),h('strong',null,'+'+money(x.orderQuantity)+' '+x.unit)))
    : [h('p',{class:'muted'},'Brak pozycji wymagających uzupełnienia.')];
  const expired=expiring.filter(x=>x.expiryAt< Date.now());
  const soon=expiring.filter(x=>x.expiryAt>=Date.now());
  const expiryRows=[...expired,...soon].length
    ? [...expired,...soon].slice(0,10).map(x=>h('div',{class:'row between'},
        h('span',null,x.inventoryName),
        h('strong',{class:expired.includes(x)?'danger-text':''},expired.includes(x)?'PRZETERMINOWANE':new Date(x.expiryAt).toLocaleDateString('pl-PL'))
      ))
    : [h('p',{class:'muted'},'Brak partii kończących się w ciągu 3 dni.')];
  return h('div',{class:'stack'},
    h('div',{class:'card'},
      h('div',{class:'row between'},h('div',null,h('h3',null,'Autopilot magazynu'),h('p',{class:'muted'},enabled?'AKTYWNY · zakupy mogą być uzupełniane automatycznie.':'WYŁĄCZONY · nic nie zostanie dodane automatycznie.')),
        button(enabled?'Wyłącz autopilota':'Włącz autopilota',{sm:true,kind:enabled?'ghost':'primary',onClick:async()=>{await setSetting('inventoryAutoShopping',!enabled);toast(!enabled?'Autopilot włączony':'Autopilot wyłączony');render();}})
      ),
      h('p',{class:'muted'},'Po rozliczeniu sprzedaży Kucharek sprawdza braki według minimum i stanu docelowego.'),
      button('Uruchom autopilota teraz',{kind:'primary',onClick:async()=>{
        const result=await runInventoryAutopilot();
        toast(result.enabled?(result.added?'Dodano brakujące pozycje do zakupów 📦':'Brak nowych zakupów'):'Autopilot jest wyłączony');
        render();
      }}),
      button('Utwórz zamówienie'+(reorders.length?' ('+reorders.length+')':''),{kind:'ghost',onClick:async()=>{if(!reorders.length){toast('Brak pozycji do zamówienia');return;}const suppliers=await listSuppliers();bulkOrderSheet(suppliers,reorders);}}),
      button('Dodaj propozycje do zakupów'+(reorders.length?' ('+reorders.length+')':''),{kind:'ghost',onClick:async()=>{
        const {addItems}=await import('./shopping.js');
        await addItems(reorders.map(x=>({name:x.name,amount:x.orderQuantity,unit:x.unit,recipeName:'Autopilot magazynu'})));
        toast(reorders.length?'Propozycje dodane do zakupów':'Brak pozycji do zamówienia');
        render();
      }})
    ),
    h('div',{class:'card'},h('h3',null,'Do uzupełnienia'),...reorderRows),
    h('div',{class:'card'},h('h3',null,'Terminy ważności'),h('p',{class:'muted'},expired.length?'Najpierw pokazuję partie już przeterminowane.':'Najbliższe 3 dni'),...expiryRows),
    h('div',{class:'card'},
      h('h3',null,'Sprzedaż'),
      h('p',{class:'muted'},'Eksport sprzedaży z POS raz na zmianę wystarczy. Import rozbije sprzedaż na składniki receptur i odejmie je atomowo.'),
      button('Import CSV sprzedaży',{kind:'primary',onClick:()=>salesImportSheet()})
    )
  );
}

function salesImportSheet(){ let text=''; const form=h('div',{class:'stack'},h('p',{class:'muted'},'CSV: nazwa receptury, ilość. Obsługiwany separator , lub ;.'),textInput({label:'CSV sprzedaży',placeholder:'Pizza Margherita,12',onInput:v=>text=v})); openSheet({title:'Import sprzedaży',variant:'sheet',body:form,actions:[{label:'Anuluj',kind:'ghost'},{label:'Importuj',kind:'primary',onClick:async()=>{const r=await importSalesCsv(text);if(!r.ok){toast(r.missing?.length?'Nie znaleziono receptur: '+r.missing.map(x=>x.name).join(', '):'Nie udało się zaimportować',{type:'error'});return false;}toast('Sprzedaż rozliczona, magazyn zaktualizowany 📦');render();}}]}); }
 function adjustSheet(inv){if(!inv.length)return toast('Magazyn jest pusty',{type:'error'});let id=inv[0].id,delta='',reason='korekta';const form=h('div',{class:'stack'},field('Produkt',selectEl(inv.map(x=>[x.id,x.name]),id,v=>id=v)),textInput({type:'number',label:'Zmiana',onInput:v=>delta=v}),textInput({label:'Powód',onInput:v=>reason=v}));openSheet({title:'Korekta',variant:'sheet',body:form,actions:[{label:'Anuluj',kind:'ghost'},{label:'Zapisz',kind:'primary',onClick:async()=>{await adjustStockPro(id,delta,reason);toast('Korekta zapisana');render();}}]});}
 async function stocktake(){
  const t=await startStocktake();
  let index=0;
  const ask=async()=>{
    const row=t.items[index];
    if(!row){await finalizeStocktake(t.id);toast('Inwentaryzacja zamknięta');render();return;}
    openSheet({title:'Inwentaryzacja '+(index+1)+'/'+t.items.length,variant:'sheet',body:h('div',{class:'stack'},h('strong',null,row.name),h('p',{class:'muted'},'Stan systemowy: '+row.systemQuantity+' '+row.unit),textInput({type:'number',label:'Policzono fizycznie',onInput:v=>row._count=v})),actions:[{label:'Anuluj',kind:'ghost'},{label:index===t.items.length-1?'Zakończ':'Dalej',kind:'primary',onClick:async()=>{if(row._count==null||row._count==='')return toast('Wpisz policzoną ilość',{type:'error'});await updateStocktake(t.id,row.inventoryId,row._count);index++;await ask();}}]});
  };
  await ask();
 }
 function productionSheet(){let name='',qty='',unit='kg',recipeId='',factor=1;const rs=listRecipes();const form=h('div',{class:'stack'},textInput({label:'Półprodukt',onInput:v=>name=v}),textInput({type:'number',label:'Ilość',onInput:v=>qty=v}),selectEl(units,unit,v=>unit=v),field('Receptura wejściowa',selectEl([['','Brak'],...rs.map(x=>[x.id,x.name])],'',v=>recipeId=v)),textInput({type:'number',label:'Mnożnik',value:factor,onInput:v=>factor=v}));openSheet({title:'Produkcja',variant:'sheet',body:form,actions:[{label:'Anuluj',kind:'ghost'},{label:'Przyjmij',kind:'primary',onClick:async()=>{const row=await createProductionBatch({productName:name,quantity:qty,unit,recipeId,factor});await completeProductionBatch(row.id);toast('Produkcja przyjęta');render();}}]});}
 render();
 unsub=subscribeInventory(()=>{if(tab==='dashboard'||tab==='analytics')render();});
 return {el:s.el,destroy:()=>unsub&&unsub()};
}
