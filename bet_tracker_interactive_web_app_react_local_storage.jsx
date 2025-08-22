import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Download, Upload, Plus, Trash2, Pencil, Filter, Search, RefreshCcw, CheckCircle2, XCircle, CircleHelp } from "lucide-react";

// ---------------------------------------------
// Types & Helpers
// ---------------------------------------------
const DEFAULT_BET = {
  id: "",
  date: new Date().toISOString().slice(0, 10), // yyyy-mm-dd
  book: "",
  sport: "",
  event: "",
  market: "",
  oddsType: "American", // American | Decimal
  odds: "",
  stake: "",
  result: "Pending", // Pending | Won | Lost | Push | Void
  notes: "",
};

function uuid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function toNumber(n) {
  const v = typeof n === "string" ? n.trim() : n;
  const num = Number(v);
  return Number.isFinite(num) ? num : 0;
}

function americanProfit(stake, americanOdds) {
  const s = toNumber(stake);
  const o = toNumber(americanOdds);
  if (!s || !o) return 0;
  if (o > 0) return (s * o) / 100;
  return (s * 100) / Math.abs(o);
}

function decimalProfit(stake, decimalOdds) {
  const s = toNumber(stake);
  const d = toNumber(decimalOdds);
  if (!s || !d) return 0;
  return s * (d - 1);
}

function impliedProb({ oddsType, odds }) {
  const o = toNumber(odds);
  if (!o) return 0;
  if (oddsType === "Decimal") return 1 / o;
  // American
  if (o > 0) return 100 / (o + 100);
  return Math.abs(o) / (Math.abs(o) + 100);
}

function profitForBet(bet) {
  const stake = toNumber(bet.stake);
  const odds = toNumber(bet.odds);
  const profit = bet.oddsType === "American" ? americanProfit(stake, odds) : decimalProfit(stake, odds);
  switch (bet.result) {
    case "Won":
      return profit; // profit excludes returned stake
    case "Lost":
      return -stake;
    case "Push":
    case "Void":
    case "Pending":
    default:
      return 0;
  }
}

function payoutIfWin(bet) {
  const stake = toNumber(bet.stake);
  return stake + (bet.oddsType === "American" ? americanProfit(stake, bet.odds) : decimalProfit(stake, bet.odds));
}

function formatCurrency(n) {
  return (n < 0 ? "-" : "") + "$" + Math.abs(n).toFixed(2);
}

function saveToFile(filename, text) {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function parseDate(d) {
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? new Date() : t;
}

// ---------------------------------------------
// Main Component
// ---------------------------------------------
export default function BetTracker() {
  const [bets, setBets] = useState(() => {
    try {
      const raw = localStorage.getItem("bet-tracker:v1");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });
  const [showAdd, setShowAdd] = useState(false);
  const [newBet, setNewBet] = useState({ ...DEFAULT_BET });
  const [query, setQuery] = useState("");
  const [resultFilter, setResultFilter] = useState("All");
  const [sportFilter, setSportFilter] = useState("All");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [decimalView, setDecimalView] = useState(false);

  useEffect(() => {
    localStorage.setItem("bet-tracker:v1", JSON.stringify(bets));
  }, [bets]);

  const filtered = useMemo(() => {
    return bets
      .filter((b) => (resultFilter === "All" ? true : b.result === resultFilter))
      .filter((b) => (sportFilter === "All" ? true : (b.sport || "").toLowerCase() === sportFilter.toLowerCase()))
      .filter((b) => {
        if (!fromDate && !toDate) return true;
        const t = parseDate(b.date).getTime();
        const from = fromDate ? parseDate(fromDate).getTime() : -Infinity;
        const to = toDate ? parseDate(toDate).getTime() + 24 * 3600 * 1000 - 1 : Infinity;
        return t >= from && t <= to;
      })
      .filter((b) => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        const hay = [b.book, b.sport, b.event, b.market, b.notes].join("\n").toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => parseDate(b.date) - parseDate(a.date));
  }, [bets, resultFilter, sportFilter, fromDate, toDate, query]);

  const stats = useMemo(() => {
    const totalStake = filtered.reduce((acc, b) => acc + toNumber(b.stake), 0);
    const realized = filtered.reduce((acc, b) => acc + profitForBet(b), 0);
    const pendingStake = filtered.filter((b) => b.result === "Pending").reduce((acc, b) => acc + toNumber(b.stake), 0);
    const won = filtered.filter((b) => b.result === "Won").length;
    const lost = filtered.filter((b) => b.result === "Lost").length;
    const pending = filtered.filter((b) => b.result === "Pending").length;
    const pushes = filtered.filter((b) => b.result === "Push" || b.result === "Void").length;
    const roi = totalStake ? (realized / totalStake) * 100 : 0;
    return { totalStake, realized, pendingStake, won, lost, pending, pushes, roi };
  }, [filtered]);

  const pnlSeries = useMemo(() => {
    const byDate = [...filtered]
      .filter((b) => b.result !== "Pending")
      .sort((a, b) => parseDate(a.date) - parseDate(b.date));
    let cumulative = 0;
    return byDate.map((b) => {
      cumulative += profitForBet(b);
      return { date: b.date, pnl: Number(cumulative.toFixed(2)) };
    });
  }, [filtered]);

  // ---------------------------------------------
  // Handlers
  // ---------------------------------------------
  function resetForm() {
    setNewBet({ ...DEFAULT_BET, id: "", date: new Date().toISOString().slice(0, 10) });
  }

  function addBet() {
    const bet = { ...newBet, id: uuid() };
    setBets((prev) => [bet, ...prev]);
    resetForm();
    setShowAdd(false);
  }

  function updateBet(id, patch) {
    setBets((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function removeBet(id) {
    setBets((prev) => prev.filter((b) => b.id !== id));
  }

  function exportJSON() {
    saveToFile("bets.json", JSON.stringify(bets, null, 2));
  }

  function importJSON(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (Array.isArray(data)) setBets(data);
      } catch (err) {
        alert("Invalid JSON file");
      }
    };
    reader.readAsText(file);
  }

  function clearAll() {
    if (confirm("This will delete ALL bets from this device. Continue?")) {
      setBets([]);
      localStorage.removeItem("bet-tracker:v1");
    }
  }

  // ---------------------------------------------
  // UI
  // ---------------------------------------------
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 text-slate-900">
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        <header className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Bet Tracker</h1>
            <p className="text-sm text-slate-500">Track every wager. Analyze performance. Own your edge.</p>
          </div>
          <div className="flex items-center gap-2">
            <Dialog open={showAdd} onOpenChange={setShowAdd}>
              <DialogTrigger asChild>
                <Button className="gap-2"><Plus className="w-4 h-4"/>Add Bet</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Add a Bet</DialogTitle>
                </DialogHeader>
                <BetForm bet={newBet} onChange={setNewBet} decimalView={decimalView} setDecimalView={setDecimalView} />
                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="ghost" onClick={resetForm}>Reset</Button>
                  <Button onClick={addBet}>Save</Button>
                </div>
              </DialogContent>
            </Dialog>
            <Button variant="secondary" onClick={exportJSON} className="gap-2"><Download className="w-4 h-4"/>Export</Button>
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="file" accept="application/json" className="hidden" onChange={importJSON} />
              <span className="px-3 py-2 rounded-md border bg-white hover:bg-slate-50 flex items-center gap-2"><Upload className="w-4 h-4"/>Import</span>
            </label>
            <Button variant="destructive" onClick={clearAll} className="gap-2"><Trash2 className="w-4 h-4"/>Clear</Button>
          </div>
        </header>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="grid md:grid-cols-6 gap-3 items-end">
              <div className="md:col-span-2">
                <label className="text-xs text-slate-500">Search</label>
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"/>
                  <Input value={query} onChange={(e)=>setQuery(e.target.value)} className="pl-8" placeholder="book, event, market, notes..."/>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-500">Result</label>
                <Select value={resultFilter} onValueChange={setResultFilter}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    {['All','Pending','Won','Lost','Push','Void'].map(x=> <SelectItem key={x} value={x}>{x}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-slate-500">Sport</label>
                <Select value={sportFilter} onValueChange={setSportFilter}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent>
                    {['All','NFL','NBA','MLB','NHL','NCAAF','NCAAB','Soccer','Tennis','Golf','MMA','Other'].map(x=> <SelectItem key={x} value={x}>{x}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-slate-500">From</label>
                <Input type="date" value={fromDate} onChange={(e)=>setFromDate(e.target.value)}/>
              </div>
              <div>
                <label className="text-xs text-slate-500">To</label>
                <Input type="date" value={toDate} onChange={(e)=>setToDate(e.target.value)}/>
              </div>
              <div className="flex items-center gap-3">
                <Switch checked={decimalView} onCheckedChange={setDecimalView}/>
                <span className="text-sm text-slate-600">Show decimal odds</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid md:grid-cols-4 gap-4 mb-6">
          <StatCard title="Realized P&L" value={formatCurrency(stats.realized)} subtitle={`ROI ${stats.roi.toFixed(1)}%`} positive={stats.realized>=0}/>
          <StatCard title="Total Staked" value={formatCurrency(stats.totalStake)} subtitle={`Pending stake ${formatCurrency(stats.pendingStake)}`}/>
          <StatCard title="Record" value={`${stats.won}-${stats.lost}-${stats.pushes}`} subtitle={`${stats.pending} pending`}/>
          <StatCard title="Bets Tracked" value={`${filtered.length}`} subtitle={`All time ${bets.length}`}/>
        </div>

        {/* Chart */}
        <Card className="mb-6">
          <CardHeader className="pb-2"><CardTitle>Cumulative P&L</CardTitle></CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={pnlSeries} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v)=>formatCurrency(v)} />
                <ReferenceLine y={0} stroke="#94a3b8" />
                <Line type="monotone" dataKey="pnl" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader className="pb-2 flex items-center justify-between">
            <CardTitle className="text-lg">Bets</CardTitle>
            <Badge variant="secondary" className="gap-1"><Filter className="w-3 h-3"/> {filtered.length}</Badge>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-2 pr-3">Date</th>
                  <th className="py-2 pr-3">Book</th>
                  <th className="py-2 pr-3">Sport</th>
                  <th className="py-2 pr-3">Event / Market</th>
                  <th className="py-2 pr-3">Odds</th>
                  <th className="py-2 pr-3">Stake</th>
                  <th className="py-2 pr-3">Result</th>
                  <th className="py-2 pr-3">Payout (if Win)</th>
                  <th className="py-2 pr-3">Realized</th>
                  <th className="py-2 pr-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((b)=> <BetRow key={b.id} bet={b} decimalView={decimalView} onUpdate={updateBet} onDelete={removeBet} />)}
                {filtered.length===0 && (
                  <tr>
                    <td colSpan={10} className="text-center py-10 text-slate-500">No bets found. Try adjusting filters.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <footer className="text-xs text-slate-500 text-center my-6">
          Data is stored locally in your browser (no server). Export regularly for backup.
        </footer>
      </div>
    </div>
  );
}

// ---------------------------------------------
// Subcomponents
// ---------------------------------------------
function StatCard({ title, value, subtitle, positive }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        <div className={`text-2xl font-semibold ${positive === undefined ? "" : positive ? "text-emerald-600" : "text-rose-600"}`}>{value}</div>
        {subtitle && <div className="text-xs text-slate-500 mt-1">{subtitle}</div>}
      </CardContent>
    </Card>
  );
}

function BetForm({ bet, onChange, decimalView, setDecimalView }) {
  const implied = impliedProb({ oddsType: decimalView ? "Decimal" : "American", odds: bet.odds });
  const payout = payoutIfWin({ ...bet, oddsType: decimalView ? "Decimal" : "American" });
  return (
    <div className="grid md:grid-cols-3 gap-3">
      <div className="md:col-span-1">
        <label className="text-xs text-slate-500">Date</label>
        <Input type="date" value={bet.date} onChange={(e)=>onChange({ ...bet, date: e.target.value })}/>
      </div>
      <div>
        <label className="text-xs text-slate-500">Book</label>
        <Input value={bet.book} onChange={(e)=>onChange({ ...bet, book: e.target.value })} placeholder="DraftKings, FanDuel..."/>
      </div>
      <div>
        <label className="text-xs text-slate-500">Sport</label>
        <Select value={bet.sport || "Other"} onValueChange={(v)=>onChange({ ...bet, sport: v })}>
          <SelectTrigger><SelectValue/></SelectTrigger>
          <SelectContent>
            {["NFL","NBA","MLB","NHL","NCAAF","NCAAB","Soccer","Tennis","Golf","MMA","Other"].map(s=> <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="md:col-span-2">
        <label className="text-xs text-slate-500">Event</label>
        <Input value={bet.event} onChange={(e)=>onChange({ ...bet, event: e.target.value })} placeholder="Team A vs Team B"/>
      </div>
      <div>
        <label className="text-xs text-slate-500">Market</label>
        <Input value={bet.market} onChange={(e)=>onChange({ ...bet, market: e.target.value })} placeholder="Moneyline, Spread -3.5, Over 210.5"/>
      </div>
      <div className="md:col-span-1 flex items-center gap-3">
        <Switch checked={decimalView} onCheckedChange={setDecimalView}/>
        <span className="text-sm">Decimal odds</span>
      </div>
      <div>
        <label className="text-xs text-slate-500">{decimalView ? "Odds (Decimal)" : "Odds (American)"}</label>
        <Input value={bet.odds} onChange={(e)=>onChange({ ...bet, odds: e.target.value })} placeholder={decimalView ? "e.g. 1.80" : "e.g. -120 or +150"}/>
      </div>
      <div>
        <label className="text-xs text-slate-500">Stake ($)</label>
        <Input value={bet.stake} onChange={(e)=>onChange({ ...bet, stake: e.target.value })} placeholder="e.g. 25"/>
      </div>
      <div>
        <label className="text-xs text-slate-500">Result</label>
        <Select value={bet.result} onValueChange={(v)=>onChange({ ...bet, result: v })}>
          <SelectTrigger><SelectValue/></SelectTrigger>
          <SelectContent>
            {["Pending","Won","Lost","Push","Void"].map(r=> <SelectItem key={r} value={r}>{r}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="md:col-span-3">
        <label className="text-xs text-slate-500">Notes</label>
        <Textarea rows={3} value={bet.notes} onChange={(e)=>onChange({ ...bet, notes: e.target.value })} placeholder="Reasoning, injury notes, CLV, etc."/>
      </div>
      <div className="md:col-span-3 grid grid-cols-2 gap-3 text-sm text-slate-600">
        <div>Implied probability: <strong>{(implied*100).toFixed(1)}%</strong></div>
        <div>Payout if win: <strong>{formatCurrency(payout)}</strong></div>
      </div>
    </div>
  );
}

function BetRow({ bet, decimalView, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(bet);
  useEffect(()=>setDraft(bet), [bet]);

  const oddsDisplay = useMemo(()=>{
    if (decimalView && bet.oddsType === "American") {
      const am = toNumber(bet.odds);
      const dec = am ? (am > 0 ? 1 + am/100 : 1 + 100/Math.abs(am)) : 0;
      return dec ? dec.toFixed(2) : "";
    }
    if (!decimalView && bet.oddsType === "Decimal") {
      const d = toNumber(bet.odds);
      const am = d ? (d >= 2 ? (d-1)*100 : -100/(d-1)) : 0;
      return am ? (am>0?`+${Math.round(am)}`:`${Math.round(am)}`) : "";
    }
    return String(bet.odds);
  }, [decimalView, bet.oddsType, bet.odds]);

  const realized = profitForBet(bet);
  const payout = payoutIfWin(bet);

  function save() {
    onUpdate(bet.id, { ...draft });
    setEditing(false);
  }

  return (
    <tr className="border-t">
      <td className="py-2 pr-3 align-top min-w-[110px]">
        {editing ? (
          <Input type="date" value={draft.date} onChange={(e)=>setDraft({ ...draft, date: e.target.value })} />
        ) : (
          <div className="font-medium">{bet.date}</div>
        )}
      </td>
      <td className="py-2 pr-3 align-top">
        {editing ? <Input value={draft.book} onChange={(e)=>setDraft({ ...draft, book: e.target.value })}/> : bet.book || <span className="text-slate-400">—</span>}
      </td>
      <td className="py-2 pr-3 align-top">
        {editing ? (
          <Select value={draft.sport || "Other"} onValueChange={(v)=>setDraft({ ...draft, sport: v })}>
            <SelectTrigger className="h-8"><SelectValue/></SelectTrigger>
            <SelectContent>
              {["NFL","NBA","MLB","NHL","NCAAF","NCAAB","Soccer","Tennis","Golf","MMA","Other"].map(s=> <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          bet.sport || <span className="text-slate-400">—</span>
        )}
      </td>
      <td className="py-2 pr-3 align-top">
        {editing ? (
          <div className="grid grid-cols-2 gap-2">
            <Input value={draft.event} onChange={(e)=>setDraft({ ...draft, event: e.target.value })} placeholder="Event"/>
            <Input value={draft.market} onChange={(e)=>setDraft({ ...draft, market: e.target.value })} placeholder="Market"/>
          </div>
        ) : (
          <div>
            <div className="font-medium">{bet.event || <span className="text-slate-400">—</span>}</div>
            <div className="text-xs text-slate-500">{bet.market || ""}</div>
          </div>
        )}
      </td>
      <td className="py-2 pr-3 align-top">
        {editing ? (
          <div className="grid grid-cols-2 gap-2">
            <Select value={draft.oddsType} onValueChange={(v)=>setDraft({ ...draft, oddsType: v })}>
              <SelectTrigger className="h-8"><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="American">American</SelectItem>
                <SelectItem value="Decimal">Decimal</SelectItem>
              </SelectContent>
            </Select>
            <Input value={draft.odds} onChange={(e)=>setDraft({ ...draft, odds: e.target.value })}/>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Badge variant="outline">{bet.oddsType}</Badge>
            <span>{oddsDisplay || ""}</span>
          </div>
        )}
      </td>
      <td className="py-2 pr-3 align-top">
        {editing ? <Input value={draft.stake} onChange={(e)=>setDraft({ ...draft, stake: e.target.value })}/> : formatCurrency(toNumber(bet.stake))}
      </td>
      <td className="py-2 pr-3 align-top">
        {editing ? (
          <Select value={draft.result} onValueChange={(v)=>setDraft({ ...draft, result: v })}>
            <SelectTrigger className="h-8"><SelectValue/></SelectTrigger>
            <SelectContent>
              {["Pending","Won","Lost","Push","Void"].map(r=> <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : (
          <ResultBadge result={bet.result} />
        )}
      </td>
      <td className="py-2 pr-3 align-top">{formatCurrency(payout)}</td>
      <td className="py-2 pr-3 align-top font-medium {realized>=0? 'text-emerald-600':'text-rose-600'}">{formatCurrency(realized)}</td>
      <td className="py-2 pr-3 align-top whitespace-nowrap">
        {editing ? (
          <div className="flex gap-1">
            <Button size="sm" className="h-8" onClick={save}><CheckCircle2 className="w-4 h-4 mr-1"/>Save</Button>
            <Button size="sm" variant="secondary" className="h-8" onClick={()=>{setEditing(false); setDraft(bet);}}><RefreshCcw className="w-4 h-4 mr-1"/>Cancel</Button>
          </div>
        ) : (
          <div className="flex gap-1">
            <Button size="sm" variant="secondary" className="h-8" onClick={()=>setEditing(true)}><Pencil className="w-4 h-4 mr-1"/>Edit</Button>
            <Button size="sm" variant="destructive" className="h-8" onClick={()=>onDelete(bet.id)}><Trash2 className="w-4 h-4 mr-1"/>Delete</Button>
          </div>
        )}
      </td>
    </tr>
  );
}

function ResultBadge({ result }) {
  const map = {
    Pending: "bg-amber-100 text-amber-800",
    Won: "bg-emerald-100 text-emerald-800",
    Lost: "bg-rose-100 text-rose-800",
    Push: "bg-slate-100 text-slate-800",
    Void: "bg-slate-100 text-slate-800",
  };
  return <span className={`px-2 py-1 rounded text-xs font-medium ${map[result] || "bg-slate-100"}`}>{result}</span>;
}
