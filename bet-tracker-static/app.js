// Simple static Bet Tracker (no build step).
// Data stored in localStorage under 'bet-tracker:v1'.

const LS_KEY = 'bet-tracker:v1';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const state = {
  bets: [],
  filters: { q:'', result:'All', sport:'All', from:'', to:'' },
  editingId: null,
};

function uuid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function toNumber(v){ const n = Number(String(v||'').trim()); return Number.isFinite(n) ? n : 0; }
function fmt$(n){ return (n<0?'-':'')+'$'+Math.abs(n).toFixed(2); }
function parseDate(d){ const t=new Date(d); return isNaN(t.getTime())?new Date():t; }

function americanProfit(stake, odds){
  const s = toNumber(stake), o = toNumber(odds);
  if(!s||!o) return 0;
  if(o>0) return (s*o)/100;
  return (s*100)/Math.abs(o);
}
function decimalProfit(stake, dec){
  const s = toNumber(stake), d = toNumber(dec);
  if(!s||!d) return 0;
  return s*(d-1);
}
function profitForBet(b){
  const stake = toNumber(b.stake);
  const profit = b.oddsType==='American' ? americanProfit(stake, b.odds) : decimalProfit(stake, b.odds);
  switch(b.result){
    case 'Won': return profit;
    case 'Lost': return -stake;
    default: return 0;
  }
}
function payoutIfWin(b){
  const stake = toNumber(b.stake);
  return stake + (b.oddsType==='American' ? americanProfit(stake,b.odds) : decimalProfit(stake,b.odds));
}

function load(){ try{ state.bets = JSON.parse(localStorage.getItem(LS_KEY))||[]; }catch{ state.bets=[]; } }
function save(){ localStorage.setItem(LS_KEY, JSON.stringify(state.bets)); }

function applyFilters(list){
  const {q,result,sport,from,to} = state.filters;
  return list
    .filter(b => result==='All' ? true : b.result===result)
    .filter(b => sport==='All' ? true : (b.sport||'')===sport)
    .filter(b => {
      if(!from && !to) return true;
      const t = parseDate(b.date).getTime();
      const f = from ? parseDate(from).getTime() : -Infinity;
      const tt = to ? parseDate(to).getTime() + 24*3600*1000-1 : Infinity;
      return t>=f && t<=tt;
    })
    .filter(b => {
      const qq = q.trim().toLowerCase();
      if(!qq) return true;
      const hay = [b.book,b.sport,b.event,b.market,b.notes].join('\n').toLowerCase();
      return hay.includes(qq);
    })
    .sort((a,b)=> parseDate(b.date)-parseDate(a.date));
}

let chart;
function renderChart(rows){
  const completed = rows.filter(b=>b.result!=='Pending').sort((a,b)=>parseDate(a.date)-parseDate(b.date));
  let cum=0; const labels=[], data=[];
  completed.forEach(b=>{ cum+=profitForBet(b); labels.push(b.date); data.push(Number(cum.toFixed(2))); });
  $('#chartEmpty').classList.toggle('hidden', completed.length>0);
  const ctx = document.getElementById('pnlChart');
  if(chart){ chart.destroy(); }
  chart = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets: [{ label:'P&L', data, borderWidth:2, tension:0.25 }]},
    options: { responsive:true, scales:{ y:{ beginAtZero:false } } }
  });
}

function renderStats(rows){
  const totalStake = rows.reduce((a,b)=>a+toNumber(b.stake),0);
  const realized = rows.reduce((a,b)=>a+profitForBet(b),0);
  const pendingStake = rows.filter(b=>b.result==='Pending').reduce((a,b)=>a+toNumber(b.stake),0);
  const won = rows.filter(b=>b.result==='Won').length;
  const lost = rows.filter(b=>b.result==='Lost').length;
  const pending = rows.filter(b=>b.result==='Pending').length;
  const pushes = rows.filter(b=>b.result==='Push'||b.result==='Void').length;
  const roi = totalStake ? (realized/totalStake)*100 : 0;
  $('#sRealized').textContent = fmt$(realized);
  $('#sROI').textContent = `ROI ${roi.toFixed(1)}%`;
  $('#sStaked').textContent = fmt$(totalStake);
  $('#sPendingStake').textContent = `Pending stake ${fmt$(pendingStake)}`;
  $('#sRecord').textContent = `${won}-${lost}-${pushes}`;
  $('#sPending').textContent = `${pending} pending`;
  $('#sCount').textContent = String(rows.length);
  $('#countBadge').textContent = String(rows.length);
}

function oddsDisplay(b){
  if(b.oddsType==='American') return String(b.odds);
  const d = toNumber(b.odds);
  if(!d) return '';
  const am = d>=2 ? (d-1)*100 : -100/(d-1);
  return am>0 ? `+${Math.round(am)}` : `${Math.round(am)}`;
}

function renderTable(rows){
  const tbody = $('#rows');
  tbody.innerHTML='';
  if(rows.length===0){ $('#empty').classList.remove('hidden'); } else { $('#empty').classList.add('hidden'); }
  rows.forEach(b=>{
    const tr = document.createElement('tr');
    tr.className='border-t align-top';
    tr.innerHTML = `
      <td class="py-2 pr-3">${b.date}</td>
      <td class="py-2 pr-3">${b.book||'—'}</td>
      <td class="py-2 pr-3">${b.sport||'—'}</td>
      <td class="py-2 pr-3">
        <div class="font-medium">${b.event||'—'}</div>
        <div class="text-xs text-slate-500">${b.market||''}</div>
      </td>
      <td class="py-2 pr-3"><span class="badge">${b.oddsType}</span> ${oddsDisplay(b)}</td>
      <td class="py-2 pr-3">${fmt$(toNumber(b.stake))}</td>
      <td class="py-2 pr-3">
        <span class="badge ${b.result==='Won'?'bg-emerald-100 text-emerald-800': b.result==='Lost'?'bg-rose-100 text-rose-800': b.result==='Pending'?'bg-amber-100 text-amber-800':'bg-slate-100'}">${b.result}</span>
      </td>
      <td class="py-2 pr-3">${fmt$(payoutIfWin(b))}</td>
      <td class="py-2 pr-3 ${profitForBet(b)>=0?'text-emerald-600':'text-rose-600'} font-medium">${fmt$(profitForBet(b))}</td>
      <td class="py-2 pr-3 whitespace-nowrap">
        <button class="btn btn-secondary h-8 px-2 mr-1" data-act="edit" data-id="${b.id}">Edit</button>
        <button class="btn btn-danger h-8 px-2" data-act="del" data-id="${b.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('button[data-act="edit"]').forEach(btn=>{
    btn.addEventListener('click', ()=> openModal(state.bets.find(x=>x.id===btn.dataset.id)));
  });
  tbody.querySelectorAll('button[data-act="del"]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.id;
      state.bets = state.bets.filter(b=>b.id!==id);
      save(); refresh();
    });
  });
}

function refresh(){
  const rows = applyFilters(state.bets);
  renderStats(rows);
  renderChart(rows);
  renderTable(rows);
}

function openModal(bet){
  $('#modal').classList.remove('hidden');
  $('#modal').classList.add('flex');
  $('#modalTitle').textContent = bet ? 'Edit Bet' : 'Add a Bet';
  const today = new Date().toISOString().slice(0,10);
  const d = bet || { id:'', date:today, book:'', sport:'Other', event:'', market:'', oddsType:'American', odds:'', stake:'', result:'Pending', notes:'' };
  state.editingId = bet ? bet.id : null;
  $('#mDate').value = d.date;
  $('#mBook').value = d.book;
  $('#mSport').value = d.sport || 'Other';
  $('#mEvent').value = d.event;
  $('#mMarket').value = d.market;
  $('#mOddsType').value = d.oddsType;
  $('#mOdds').value = d.odds;
  $('#mStake').value = d.stake;
  $('#mResult').value = d.result;
  $('#mNotes').value = d.notes;
}
function closeModal(){
  $('#modal').classList.add('hidden');
  $('#modal').classList.remove('flex');
  state.editingId = null;
}

function gatherModal(){
  return {
    id: state.editingId || uuid(),
    date: $('#mDate').value,
    book: $('#mBook').value.trim(),
    sport: $('#mSport').value,
    event: $('#mEvent').value.trim(),
    market: $('#mMarket').value.trim(),
    oddsType: $('#mOddsType').value,
    odds: $('#mOdds').value.trim(),
    stake: $('#mStake').value.trim(),
    result: $('#mResult').value,
    notes: $('#mNotes').value.trim(),
  };
}

function exportJSON(){
  const blob = new Blob([JSON.stringify(state.bets, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bets.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importJSON(file){
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      if(Array.isArray(data)){ state.bets = data; save(); refresh(); }
      else alert('Invalid JSON');
    } catch(e){ alert('Invalid JSON'); }
  };
  reader.readAsText(file);
}

function init(){
  load();
  refresh();

  // Filter bindings
  $('#q').addEventListener('input', e=>{ state.filters.q=e.target.value; refresh(); });
  $('#fResult').addEventListener('change', e=>{ state.filters.result=e.target.value; refresh(); });
  $('#fSport').addEventListener('change', e=>{ state.filters.sport=e.target.value; refresh(); });
  $('#fFrom').addEventListener('change', e=>{ state.filters.from=e.target.value; refresh(); });
  $('#fTo').addEventListener('change', e=>{ state.filters.to=e.target.value; refresh(); });

  // Buttons
  $('#addBtn').addEventListener('click', ()=> openModal(null));
  $('#closeModal').addEventListener('click', closeModal);
  $('#saveBet').addEventListener('click', ()=>{
    const bet = gatherModal();
    const idx = state.bets.findIndex(b=>b.id===bet.id);
    if(idx>=0) state.bets[idx]=bet; else state.bets.unshift(bet);
    save(); closeModal(); refresh();
  });
  $('#exportBtn').addEventListener('click', exportJSON);
  $('#importFile').addEventListener('change', (e)=>{
    if(e.target.files && e.target.files[0]) importJSON(e.target.files[0]);
    e.target.value = '';
  });
  $('#clearBtn').addEventListener('click', ()=>{
    if(confirm('This will delete ALL bets from this device. Continue?')){
      state.bets=[]; save(); refresh();
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
