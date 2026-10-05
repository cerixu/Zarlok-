import {
  h, icon, screen, button, iconBtn, openSheet, confirmDialog, emptyState, toast,
  field, textInput, selectEl, numInput, focusPreservingPaint, segmented,
} from './ui.js';
import { navigate } from './router.js';
import { getSetting, setSetting } from './recipes.js';
import { openBarcodeScanner } from './barcode-scanner.js';
import {
  loadInventory, listInventory, saveInventoryItem, adjustInventory, removeInventoryItem,
  stockState, subscribeInventory, normalizeEAN, validEAN,
} from './inventory.js';
const ingredientIcon = () => icon('list', 22);

const UNITS=[['g','g'],['kg','kg'],['ml','ml'],['l','l'],['szt','szt'],['opak','opak']];
const PRICE_UNITS=[['kg','zł / kg'],['l','zł / l'],['szt','zł / szt'],['opak','zł / opak']];
const fmt=n=>Number.isInteger(Number(n))?String(n):String(Number(Number(n).toFixed(3)));
const stateLabel=(st)=>st==='empty'?'BRAK':st==='low'?'MAŁO':'OK';
const stateRank=(st)=>st==='empty'?0:st==='low'?1:2;

export function inventoryView(){
  const search=h('input',{
    class:'input search-input',
    type:'search',
    placeholder:'Szukaj produktu…',
    'aria-label':'Szukaj produktu',
    autocomplete:'off'
  });
  const s=screen({
    title:'Magazyn',
    right:h('div',{class:'row'},
      button('PRO',{sm:true,onClick:()=>navigate('/pro')}),
      iconBtn('barcode','Skanuj kod kreskowy',()=>scanProduct()),
      iconBtn('plus','Dodaj produkt',()=>openEditor())
    ),
    sub:h('div',{class:'searchbox'},icon('search',20),search),
    cls:'inventory inventory-v2'
  });
  let q='', filter='all';

  const matches=(item)=>{
    const hay=(item.name+' '+(item.category||'')+' '+(item.ean||'')+' '+(item.aliases||[]).join(' ')).toLocaleLowerCase();
    const state=stockState(item);
    return (!q||hay.includes(q.toLocaleLowerCase()))
      && (filter==='all'||(filter==='low'&&state==='low')||(filter==='empty'&&state==='empty'));
  };

  const sorted=(items)=>items.slice().sort((a,b)=>{
    const sr=stateRank(stockState(a))-stateRank(stockState(b));
    return sr || String(a.name||'').localeCompare(String(b.name||''),'pl');
  });

  function automationSheet(){
    const autoConsumption=getSetting('inventoryAutoConsumption')!==false;
    const autoShopping=getSetting('inventoryAutoShopping')!==false;
    const body=h('div',{class:'stack'},
      h('div',{class:'inventory-tool-intro'},
        icon('sparkle',20),
        h('div',null,
          h('strong',null,'Magazyn może robić to za Ciebie.'),
          h('p',{class:'muted'},'Automatyka działa w tle. Tutaj tylko decydujesz, co ma być aktywne.')
        )
      ),
      h('label',{class:'setting-toggle'},
        h('span',null,
          h('strong',null,'Zużycie przy gotowaniu'),
          h('small',{class:'muted'},'Po zakończeniu gotowania odejmuje składniki z magazynu.')
        ),
        h('input',{type:'checkbox',checked:autoConsumption,onChange:async e=>{
          await setSetting('inventoryAutoConsumption',e.target.checked);
          toast(e.target.checked?'Automatyczne zużycie włączone':'Automatyczne zużycie wyłączone');
        }})
      ),
      h('label',{class:'setting-toggle'},
        h('span',null,
          h('strong',null,'Sugestie zakupów'),
          h('small',{class:'muted'},'Niskie i zerowe stany mogą trafiać do listy zakupów.')
        ),
        h('input',{type:'checkbox',checked:autoShopping,onChange:async e=>{
          await setSetting('inventoryAutoShopping',e.target.checked);
          toast(e.target.checked?'Sugestie zakupów włączone':'Sugestie zakupów wyłączone');
        }})
      ),
      h('div',{class:'inventory-tool-actions'},
        button('Lista zakupów',{icon:'cart',onClick:()=>navigate('/shopping')}),
        button('Centrum PRO',{kind:'ghost',onClick:()=>navigate('/pro?tab=automation')})
      )
    );
    openSheet({title:'Automatyzacja magazynu',variant:'sheet',body,actions:[{label:'Gotowe',kind:'primary'}]});
  }

  async function openDetail(item){
    const st=stockState(item);
    const qty=h('strong',{class:'inventory-detail-qty'},fmt(item.quantity)+' '+item.unit);
    const status=h('span',{class:'inventory-state-pill '+st},stateLabel(st));
    const amount=numInput({value:1,min:0,step:'any',label:'Ile zmienić',aria:'Ile zmienić stan'});
    const update=async(delta)=>{
      const value=Number(amount.value);
      if(!(value>0)){toast('Podaj ilość większą od zera',{type:'error'});return;}
      await adjustInventory(item.id,delta*value,'manual');
      toast(delta>0?'Stan zwiększony':'Stan zmniejszony');
      closeSheet?.();
      paint();
    };
    let closeSheet=null;
    const body=h('div',{class:'stack inventory-detail'},
      h('div',{class:'inventory-detail-hero'},
        h('div',{class:'inventory-detail-icon'},ingredientIcon(item)),
        h('div',{class:'grow',},
          h('div',{class:'inventory-detail-title'},item.name),
          h('div',{class:'inventory-detail-meta'},item.category||'Bez kategorii')
        ),
        status
      ),
      h('div',{class:'inventory-detail-stock'},
        h('span',{class:'muted'},'Aktualny stan'),
        qty
      ),
      h('div',{class:'inventory-detail-actions'},
        button('− Odejmij',{onClick:()=>update(-1)}),
        button('+ Dodaj',{kind:'primary',onClick:()=>update(1)})
      ),
      h('div',{class:'inventory-detail-info'},
        h('div',null,h('span',{class:'muted'},'Alert poniżej'),h('strong',null,item.minQuantity>0?fmt(item.minQuantity)+' '+item.unit:'Wyłączony')),
        h('div',null,h('span',{class:'muted'},'Stan docelowy'),h('strong',null,item.targetQuantity>0?fmt(item.targetQuantity)+' '+item.unit:'—')),
        h('div',null,h('span',{class:'muted'},'Cena zakupu'),h('strong',null,item.purchasePrice!=null?fmt(item.purchasePrice)+' zł / '+(item.priceUnit||item.unit):'—')),
        h('div',null,h('span',{class:'muted'},'EAN'),h('strong',null,item.ean||'—'))
      )
    );
    const actions=[
      {label:'Edytuj dane',icon:'edit',onClick:()=>openEditor(item)},
      {label:'Automatyka',kind:'ghost',onClick:()=>automationSheet(),close:false},
      {label:'Usuń produkt',kind:'ghost',onClick:async()=>{
        const ok=await confirmDialog('Usunąć produkt?','Tej operacji nie można cofnąć.',{danger:true});
        if(!ok)return false;
        await removeInventoryItem(item.id);
        toast('Produkt usunięty');
        paint();
      }}
    ];
    const api=openSheet({title:item.name,variant:'sheet',body,actions});
    closeSheet=api.close;
  }

  const row=(item)=>{
    const st=stockState(item);
    return h('article',{class:'stock-row inventory-product '+st},
      h('button',{
        type:'button',
        class:'inventory-product-main',
        'aria-label':item.name+' — '+stateLabel(st)+' — '+fmt(item.quantity)+' '+item.unit,
        onClick:()=>openDetail(item)
      },
        h('div',{class:'inventory-product-visual '+st},
          ingredientIcon(item)
        ),
        h('div',{class:'inventory-product-copy'},
          h('div',{class:'inventory-product-title'},item.name),
          h('div',{class:'inventory-product-meta'},
            fmt(item.quantity)+' '+item.unit,
            item.minQuantity>0?' · próg '+fmt(item.minQuantity)+' '+item.unit:'',
            item.category?' · '+item.category:''
          )
        ),
        h('span',{class:'stock-state'},stateLabel(st)),
        icon('right',18)
      ),
      h('div',{class:'inventory-product-actions'},
        iconBtn('minus','Odejmij 1 '+item.unit+' — '+item.name,()=>{adjustInventory(item.id,-1,'manual').then(paint);},'quiet'),
        iconBtn('plus','Dodaj 1 '+item.unit+' — '+item.name,()=>{adjustInventory(item.id,1,'manual').then(paint);},'quiet'),
      )
    );
  };

  async function paint(){
    const all=listInventory();
    const counts={
      empty:all.filter(x=>stockState(x)==='empty').length,
      low:all.filter(x=>stockState(x)==='low').length,
      ok:all.filter(x=>stockState(x)==='ok').length
    };
    const filtered=sorted(all.filter(matches));

    const summary=h('section',{class:'inventory-summary-v2'},
      h('div',{class:'inventory-summary-main'},
        h('span',{class:'inventory-eyebrow'},'STAN MAGAZYNU'),
        h('strong',null,String(all.length)),
        h('span',null,all.length===1?'produkt':'produkty')
      ),
      h('div',{class:'inventory-health'},
        h('button',{type:'button',class:'inventory-health-chip empty '+(filter==='empty'?'active':''),'aria-label':'Filtr: Brak',onClick:()=>{filter=filter==='empty'?'all':'empty';paint();}},
          h('strong',null,String(counts.empty)),h('span',null,'Brak')),
        h('button',{type:'button',class:'inventory-health-chip low '+(filter==='low'?'active':''),'aria-label':'Filtr: Mało',onClick:()=>{filter=filter==='low'?'all':'low';paint();}},
          h('strong',null,String(counts.low)),h('span',null,'Mało')),
        h('button',{type:'button',class:'inventory-health-chip ok '+(filter==='all'?'active':''),'aria-label':'Filtr: Wszystkie',onClick:()=>{filter='all';paint();}},
          h('strong',null,String(counts.ok)),h('span',null,'OK'))
      )
    );

    const filterBar=h('div',{class:'inventory-filterbar'},
      h('button',{type:'button',class:'inventory-filter '+(filter==='all'?'on':''),onClick:()=>{filter='all';paint();}},'Wszystkie'),
      h('button',{type:'button',class:'inventory-filter '+(filter==='low'?'on':''),onClick:()=>{filter='low';paint();}},'Niskie'),
      h('button',{type:'button',class:'inventory-filter '+(filter==='empty'?'on':''),onClick:()=>{filter='empty';paint();}},'Braki'),
      h('button',{type:'button',class:'inventory-automation-link',onClick:automationSheet},icon('sparkles',16),'Automatyka')
    );

    const content=[summary,filterBar];
    if(!filtered.length){
      content.push(emptyState('📦',all.length?'Brak wyników':'Magazyn jest pusty',all.length?'Zmień wyszukiwanie lub filtr.':'Dodaj pierwszy produkt, żeby zacząć.',button('Dodaj produkt',{kind:'primary',icon:'plus',onClick:()=>openEditor()})));
    }else{
      content.push(h('div',{class:'inventory-list-head'},
        h('span',null,filter==='all'?'Produkty':'Wybrane produkty'),
        h('span',{class:'muted'},String(filtered.length))
      ));
      content.push(h('div',{class:'stock-list'},filtered.map(row)));
    }
    s.content.replaceChildren(...content);
  }

  function scanProduct(){
    openBarcodeScanner({
      onDetected:async code=>{
        const found=listInventory().find(x=>normalizeEAN(x.ean||'')===normalizeEAN(code));
        if(found){toast('Znaleziono: '+found.name);openEditor(found);}
        else{toast('Nowy kod EAN: '+code);openEditor(null,code);}
      }
    });
  }

  function openEditor(item=null,initialEAN=''){
    let eanInput=null,name=item?.name||'',quantity=item?.quantity??0,unit=item?.unit||'g',
      minQuantity=item?.minQuantity??0,targetQuantity=item?.targetQuantity??0,purchasePrice=item?.purchasePrice??'',
      priceUnit=item?.priceUnit||'kg',ean=item?.ean||initialEAN||'',category=item?.category||'',
      aliases=(item?.aliases||[]).join(', ');

    const form=h('div',{class:'stack inventory-editor'},
      h('div',{class:'inventory-editor-section'},
        h('div',{class:'inventory-editor-kicker'},'PODSTAWOWE'),
        field('Produkt',textInput({value:name,label:'Nazwa produktu',placeholder:'np. Mąka 00',onInput:v=>{name=v;}})),
        field('Stan',h('div',{class:'grid-2'},
          textInput({value:quantity,type:'number',label:'Ilość',onInput:v=>{quantity=v;}}),
          selectEl(UNITS,unit,v=>{unit=v})
        ))
      ),
      h('div',{class:'inventory-editor-section'},
        h('div',{class:'inventory-editor-kicker'},'ALERTY'),
        field('Próg minimalny',textInput({value:minQuantity,type:'number',label:'Alert poniżej tej ilości',onInput:v=>{minQuantity=v;}})),
        field('Stan docelowy',textInput({value:targetQuantity,type:'number',label:'Ile chcesz mieć po uzupełnieniu',onInput:v=>{targetQuantity=v;}}))
      ),
      h('div',{class:'inventory-editor-section'},
        h('div',{class:'inventory-editor-kicker'},'CENA I IDENTYFIKACJA'),
        field('Cena zakupu',h('div',{class:'grid-2'},
          textInput({value:purchasePrice,type:'number',label:'Cena',onInput:v=>{purchasePrice=v;}}),
          selectEl(PRICE_UNITS,priceUnit,v=>{priceUnit=v})
        )),
        field('EAN',h('div',{class:'ean-entry'},
          (eanInput=textInput({value:ean,type:'text',label:'Kod EAN',inputmode:'numeric',placeholder:'opcjonalnie',onInput:v=>{ean=v;}})),
          button('Skanuj',{sm:true,icon:'barcode',onClick:()=>openBarcodeScanner({onDetected:async code=>{ean=code;eanInput.value=code;toast('Odczytano EAN: '+code);}})})
        )),
        field('Kategoria',textInput({value:category,label:'Kategoria',placeholder:'np. Nabiał',onInput:v=>{category=v;}})),
        field('Nazwy alternatywne',textInput({value:aliases,label:'Nazwy alternatywne',placeholder:'np. mozzarella fior di latte, mozzarella',onInput:v=>{aliases=v;}}))
      )
    );
    openSheet({title:item?'Edytuj produkt':'Nowy produkt',variant:'sheet',body:form,actions:[
      {label:'Anuluj',kind:'ghost'},
      {label:'Zapisz',kind:'primary',icon:'check',onClick:async()=>{
        try{
          if(ean&&!validEAN(ean))throw new Error('Nieprawidłowy kod EAN.');
          await saveInventoryItem({
            id:item?.id,createdAt:item?.createdAt,name,quantity,unit,minQuantity,targetQuantity,
            purchasePrice,priceUnit,ean:normalizeEAN(ean),
            aliases:aliases.split(',').map(x=>x.trim()).filter(Boolean),category
          });
          toast(item?'Zapisano produkt':'Dodano produkt');
          paint();
        }catch(e){
          toast(e.message||'Nie udało się zapisać',{type:'error'});
          return false;
        }
      }}
    ]});
  }

  search.addEventListener('input',()=>{q=search.value.trim();focusPreservingPaint(paint,s.el);});
  loadInventory().then(paint).catch(e=>toast(e.message||'Nie udało się wczytać magazynu',{type:'error'}));
  const unsub=subscribeInventory(()=>paint());
  return{el:s.el,destroy:unsub};
}
