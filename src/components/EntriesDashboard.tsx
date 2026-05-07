import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Save, X, FileDown, FileSpreadsheet,
  LogIn, LogOut, Search, Fuel, ArrowUpDown, ArrowUp, ArrowDown,
  Calendar, Printer, RefreshCw, Filter as FilterIcon,
} from "lucide-react";

type Entry = {
  id: string;
  pc_no: string;
  name: string;
  vehicle_number: string;
  entry_time: string;
  created_at: string;
  updated_at: string;
};

function toLocalDatetimeInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalDatetimeInput(v: string) {
  return new Date(v).toISOString();
}
function formatDisplay(iso: string) {
  return new Date(iso).toLocaleString();
}

type SortKey = "entry_time" | "pc_no" | "name" | "vehicle_number";
type SortDir = "asc" | "desc";
type DatePreset = "all" | "today" | "week" | "month" | "custom";

export function EntriesDashboard() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // filters
  const [datePreset, setDatePreset] = useState<DatePreset>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("entry_time");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showFilters, setShowFilters] = useState(false);

  // selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // new row form
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ pc_no: "", name: "", vehicle_number: "", entry_time: toLocalDatetimeInput(new Date().toISOString()) });

  // editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Entry>>({});

  const isAdmin = !!userEmail;

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserEmail(session?.user?.email ?? null);
    });
    supabase.auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user?.email ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    fetchEntries();
    const channel = supabase
      .channel("entries-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "entries" }, () => fetchEntries())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function fetchEntries() {
    setLoading(true);
    const { data, error } = await supabase
      .from("entries")
      .select("*")
      .order("entry_time", { ascending: false });
    if (error) toast.error(error.message);
    else setEntries((data as Entry[]) ?? []);
    setLoading(false);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.pc_no || !form.name || !form.vehicle_number) {
      toast.error("Please fill all fields");
      return;
    }
    const { error } = await supabase.from("entries").insert({
      pc_no: form.pc_no,
      name: form.name,
      vehicle_number: form.vehicle_number,
      entry_time: fromLocalDatetimeInput(form.entry_time),
    });
    if (error) return toast.error(error.message);
    toast.success("Entry added");
    setForm({ pc_no: "", name: "", vehicle_number: "", entry_time: toLocalDatetimeInput(new Date().toISOString()) });
    setShowAdd(false);
  }

  function startEdit(entry: Entry) {
    setEditingId(entry.id);
    setEditForm({ ...entry, entry_time: toLocalDatetimeInput(entry.entry_time) });
  }

  async function saveEdit() {
    if (!editingId) return;
    const payload: any = {
      pc_no: editForm.pc_no,
      name: editForm.name,
      vehicle_number: editForm.vehicle_number,
      entry_time: fromLocalDatetimeInput(editForm.entry_time as string),
    };
    const { error } = await supabase.from("entries").update(payload).eq("id", editingId);
    if (error) return toast.error(error.message);
    toast.success("Updated");
    setEditingId(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this entry?")) return;
    const { error } = await supabase.from("entries").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} entries?`)) return;
    const { error } = await supabase.from("entries").delete().in("id", Array.from(selectedIds));
    if (error) return toast.error(error.message);
    toast.success(`Deleted ${selectedIds.size} entries`);
    setSelectedIds(new Set());
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(ids: string[]) {
    setSelectedIds((prev) => {
      if (ids.every((i) => prev.has(i))) return new Set();
      return new Set(ids);
    });
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function clearFilters() {
    setSearch("");
    setDatePreset("all");
    setDateFrom("");
    setDateTo("");
    setSortKey("entry_time");
    setSortDir("desc");
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    toast.success("Logged out");
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = entries;
    if (q) {
      list = list.filter(
        (e) =>
          e.pc_no.toLowerCase().includes(q) ||
          e.name.toLowerCase().includes(q) ||
          e.vehicle_number.toLowerCase().includes(q),
      );
    }
    // date filter
    let from: Date | null = null;
    let to: Date | null = null;
    const now = new Date();
    if (datePreset === "today") {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (datePreset === "week") {
      from = new Date(now); from.setDate(now.getDate() - 7);
    } else if (datePreset === "month") {
      from = new Date(now); from.setMonth(now.getMonth() - 1);
    } else if (datePreset === "custom") {
      if (dateFrom) from = new Date(dateFrom);
      if (dateTo) { to = new Date(dateTo); to.setHours(23, 59, 59, 999); }
    }
    if (from || to) {
      list = list.filter((e) => {
        const t = new Date(e.entry_time).getTime();
        if (from && t < from.getTime()) return false;
        if (to && t > to.getTime()) return false;
        return true;
      });
    }
    // sort
    list = [...list].sort((a, b) => {
      let av: any = a[sortKey];
      let bv: any = b[sortKey];
      if (sortKey === "entry_time") { av = new Date(av).getTime(); bv = new Date(bv).getTime(); }
      else { av = String(av).toLowerCase(); bv = String(bv).toLowerCase(); }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [entries, search, datePreset, dateFrom, dateTo, sortKey, sortDir]);

  const stats = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayCount = entries.filter((e) => new Date(e.entry_time) >= today).length;
    return { total: entries.length, today: todayCount };
  }, [entries]);

  async function exportPdf() {
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Parth Fuel Corporation — Vehicle Entries", 14, 16);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()} • ${filtered.length} records`, 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [["PC No.", "Name", "Vehicle Number", "Time"]],
      body: filtered.map((e) => [e.pc_no, e.name, e.vehicle_number, formatDisplay(e.entry_time)]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [40, 80, 180] },
    });
    doc.save(`entries-${Date.now()}.pdf`);
  }

  async function exportExcel() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet(
      filtered.map((e) => ({
        "PC No.": e.pc_no,
        Name: e.name,
        "Vehicle Number": e.vehicle_number,
        Time: formatDisplay(e.entry_time),
      })),
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Entries");
    XLSX.writeFile(wb, `entries-${Date.now()}.xlsx`);
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every((e) => selectedIds.has(e.id));

  const SortBtn = ({ k, label }: { k: SortKey; label: string }) => (
    <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-foreground">
      {label}
      {sortKey === k ? (sortDir === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-50" />}
    </button>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/30 to-background pb-10">
      <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg shrink-0">
              <Fuel className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm sm:text-xl font-bold leading-tight truncate">Parth Fuel Corporation</h1>
              <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Vehicle Entry Log</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isAdmin ? (
              <div className="flex items-center gap-2">
                <span className="hidden lg:inline text-xs text-muted-foreground max-w-[150px] truncate">{userEmail}</span>
                <Button variant="outline" size="sm" onClick={handleLogout} className="h-8 sm:h-9 px-2 sm:px-4 text-xs sm:text-sm">
                  <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-1" /> <span className="hidden sm:inline">Logout</span>
                </Button>
              </div>
            ) : (
              <Link to="/login">
                <Button size="sm" className="h-8 sm:h-9 px-2 sm:px-4 text-xs sm:text-sm">
                  <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4 sm:mr-1" /> Admin Login
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-2 sm:gap-4">
          {[
            { label: "Total Entries", value: stats.total, color: "text-primary" },
            { label: "Today", value: stats.today, color: "text-blue-600" },
          ].map((s) => (
            <div key={s.label} className="bg-card border rounded-xl p-3 sm:p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="text-[10px] sm:text-xs font-medium text-muted-foreground uppercase tracking-wider">{s.label}</div>
              <div className={`text-xl sm:text-2xl font-bold mt-1 ${s.color}`}>{s.value}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input 
                className="pl-9 h-10 sm:h-11" 
                placeholder="Search by PC, name, vehicle..." 
                value={search} 
                onChange={(e) => setSearch(e.target.value)} 
              />
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" className="flex-1 sm:flex-none h-10 sm:h-11" onClick={() => setShowFilters((s) => !s)}>
                <FilterIcon className="w-4 h-4 mr-2" /> Filters
              </Button>
              <Button variant="ghost" size="icon" className="h-10 w-10 sm:h-11 sm:w-11" onClick={fetchEntries} title="Refresh">
                <RefreshCw className="w-4 h-4" />
              </Button>
              {isAdmin && (
                <Button className="flex-1 sm:flex-none h-10 sm:h-11 shadow-md" onClick={() => setShowAdd((s) => !s)}>
                  <Plus className={`w-4 h-4 mr-2 transition-transform ${showAdd ? "rotate-45" : ""}`} /> 
                  {showAdd ? "Cancel" : "Add Entry"}
                </Button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
            <Button variant="outline" size="sm" onClick={() => window.print()} className="shrink-0 whitespace-nowrap">
              <Printer className="w-3.5 h-3.5 mr-1.5" /> Print
            </Button>
            <Button variant="outline" size="sm" onClick={exportPdf} className="shrink-0 whitespace-nowrap">
              <FileDown className="w-3.5 h-3.5 mr-1.5" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={exportExcel} className="shrink-0 whitespace-nowrap">
              <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" /> Excel
            </Button>
          </div>
        </div>

        {showFilters && (
          <div className="bg-card border rounded-xl p-4 space-y-4 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex flex-col gap-3">
              <span className="text-xs font-semibold text-muted-foreground flex items-center gap-2">
                <Calendar className="w-3.5 h-3.5" /> DATE RANGE PRESETS
              </span>
              <div className="flex flex-wrap gap-2">
                {([
                  ["all", "All time"],
                  ["today", "Today"],
                  ["month", "30 Days"],
                  ["custom", "Custom"],
                ] as [DatePreset, string][]).map(([k, l]) => (
                  <button key={k} onClick={() => setDatePreset(k)}
                    className={`px-4 py-2 rounded-lg text-xs font-medium border transition-all ${
                      datePreset === k 
                        ? "bg-primary text-primary-foreground border-primary shadow-sm" 
                        : "bg-background hover:bg-muted text-muted-foreground"
                    }`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            {datePreset === "custom" && (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">From</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">To</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full" />
                </div>
              </div>
            )}
            <div className="flex justify-end pt-2">
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-xs">
                Reset All Filters
              </Button>
            </div>
          </div>
        )}

        {isAdmin && selectedIds.size > 0 && (
          <div className="bg-primary/5 border border-primary/20 rounded-xl px-4 py-3 flex items-center justify-between shadow-sm sticky top-[73px] sm:top-[89px] z-10 backdrop-blur-md">
            <span className="text-sm font-semibold text-primary">{selectedIds.size} entries selected</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} className="text-xs">Cancel</Button>
              <Button size="sm" variant="destructive" onClick={handleBulkDelete} className="text-xs shadow-sm">
                <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
              </Button>
            </div>
          </div>
        )}

        {isAdmin && showAdd && (
          <form onSubmit={handleAdd} className="bg-card border-2 border-primary/20 rounded-xl p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end shadow-lg animate-in zoom-in-95 duration-200">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-tight">PC No.</Label>
              <Input value={form.pc_no} onChange={(e) => setForm({ ...form, pc_no: e.target.value })} placeholder="PC-001" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-tight">Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Driver name" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-tight">Vehicle Number</Label>
              <Input value={form.vehicle_number} onChange={(e) => setForm({ ...form, vehicle_number: e.target.value })} placeholder="GJ 01 AB 1234" className="h-10" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-tight">Time</Label>
              <Input type="datetime-local" value={form.entry_time} onChange={(e) => setForm({ ...form, entry_time: e.target.value })} className="h-10" />
            </div>
            <Button type="submit" className="w-full h-10"><Save className="w-4 h-4 mr-2" /> Save Entry</Button>
          </form>
        )}

        {/* Entries Display: Card View on Mobile, Table on Desktop */}
        <div className="space-y-4">
          {loading ? (
            <div className="bg-card border rounded-xl p-12 text-center text-muted-foreground shadow-sm">
              <RefreshCw className="w-6 h-6 mx-auto mb-3 animate-spin opacity-20" />
              Loading entries...
            </div>
          ) : filtered.length === 0 ? (
            <div className="bg-card border rounded-xl p-12 text-center text-muted-foreground shadow-sm">
              <Search className="w-6 h-6 mx-auto mb-3 opacity-20" />
              No entries match the filters.
            </div>
          ) : (
            <>
              {/* Card View (Mobile) */}
              <div className="grid grid-cols-1 gap-3 lg:hidden">
                {filtered.map((e) => {
                  const editing = editingId === e.id;
                  const selected = selectedIds.has(e.id);
                  return (
                    <div key={e.id} className={`bg-card border rounded-xl p-4 shadow-sm transition-all ${selected ? "ring-2 ring-primary bg-primary/5" : ""}`}>
                      <div className="flex justify-between items-start mb-3">
                        <div className="flex items-center gap-3">
                          {isAdmin && (
                            <input 
                              type="checkbox" 
                              className="w-4 h-4 rounded border-muted"
                              checked={selected} 
                              onChange={() => toggleSelect(e.id)} 
                            />
                          )}
                          <div>
                            {editing ? (
                              <div className="space-y-2">
                                <Label className="text-[10px] font-bold">PC NO.</Label>
                                <Input size={1} className="h-8" value={editForm.pc_no as string} onChange={(ev) => setEditForm({ ...editForm, pc_no: ev.target.value })} />
                              </div>
                            ) : (
                              <span className="text-xs font-bold px-2 py-1 bg-secondary rounded text-secondary-foreground uppercase tracking-wider">{e.pc_no}</span>
                            )}
                          </div>
                        </div>
                        {isAdmin && (
                          <div className="flex gap-1">
                            {editing ? (
                              <>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={saveEdit}><Save className="w-4 h-4" /></Button>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditingId(null)}><X className="w-4 h-4" /></Button>
                              </>
                            ) : (
                              <>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => startEdit(e)}><Pencil className="w-4 h-4" /></Button>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleDelete(e.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                              </>
                            )}
                          </div>
                        )}
                      </div>
                      
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Name</span>
                            <div className="text-sm font-medium">
                              {editing ? (
                                <Input className="h-8" value={editForm.name as string} onChange={(ev) => setEditForm({ ...editForm, name: ev.target.value })} />
                              ) : e.name}
                            </div>
                          </div>
                          <div className="space-y-1 text-right">
                            <span className="text-[10px] text-muted-foreground uppercase font-semibold">Vehicle Number</span>
                            <div className="text-sm font-bold">
                              {editing ? (
                                <Input className="h-8" value={editForm.vehicle_number as string} onChange={(ev) => setEditForm({ ...editForm, vehicle_number: ev.target.value })} />
                              ) : e.vehicle_number}
                            </div>
                          </div>
                        </div>
                        <div className="pt-2 border-t flex justify-between items-center">
                          <span className="text-[10px] text-muted-foreground uppercase font-semibold">Entry Time</span>
                          <span className="text-[11px] font-medium italic">
                            {editing ? (
                              <Input type="datetime-local" className="h-8" value={editForm.entry_time as string} onChange={(ev) => setEditForm({ ...editForm, entry_time: ev.target.value })} />
                            ) : formatDisplay(e.entry_time)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Table View (Desktop) */}
              <div className="hidden lg:block bg-card border rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        {isAdmin && (
                          <TableHead className="w-[40px] pl-4">
                            <input 
                              type="checkbox" 
                              className="w-4 h-4 rounded border-muted"
                              checked={allVisibleSelected} 
                              onChange={() => toggleSelectAll(filtered.map((e) => e.id))} 
                            />
                          </TableHead>
                        )}
                        <TableHead className="w-[140px]"><SortBtn k="pc_no" label="PC No." /></TableHead>
                        <TableHead><SortBtn k="name" label="Name" /></TableHead>
                        <TableHead><SortBtn k="vehicle_number" label="Vehicle Number" /></TableHead>
                        <TableHead className="w-[200px]"><SortBtn k="entry_time" label="Time" /></TableHead>
                        {isAdmin && <TableHead className="w-[140px] text-right pr-4">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((e) => {
                        const editing = editingId === e.id;
                        const selected = selectedIds.has(e.id);
                        return (
                          <TableRow key={e.id} className={`hover:bg-muted/30 transition-colors ${selected ? "bg-primary/5" : ""}`}>
                            {isAdmin && (
                              <TableCell className="pl-4">
                                <input 
                                  type="checkbox" 
                                  className="w-4 h-4 rounded border-muted"
                                  checked={selected} 
                                  onChange={() => toggleSelect(e.id)} 
                                />
                              </TableCell>
                            )}
                            <TableCell className="font-semibold">
                              {editing ? (
                                <Input className="h-8" value={editForm.pc_no as string} onChange={(ev) => setEditForm({ ...editForm, pc_no: ev.target.value })} />
                              ) : <span className="text-xs font-bold px-2 py-1 bg-secondary rounded text-secondary-foreground">{e.pc_no}</span>}
                            </TableCell>
                            <TableCell>
                              {editing ? (
                                <Input className="h-8" value={editForm.name as string} onChange={(ev) => setEditForm({ ...editForm, name: ev.target.value })} />
                              ) : e.name}
                            </TableCell>
                            <TableCell className="font-mono">
                              {editing ? (
                                <Input className="h-8" value={editForm.vehicle_number as string} onChange={(ev) => setEditForm({ ...editForm, vehicle_number: ev.target.value })} />
                              ) : e.vehicle_number}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {editing ? (
                                <Input type="datetime-local" className="h-8" value={editForm.entry_time as string} onChange={(ev) => setEditForm({ ...editForm, entry_time: ev.target.value })} />
                              ) : formatDisplay(e.entry_time)}
                            </TableCell>
                            {isAdmin && (
                              <TableCell className="text-right pr-4">
                                {editing ? (
                                  <div className="flex justify-end gap-1">
                                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={saveEdit}><Save className="w-4 h-4" /></Button>
                                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setEditingId(null)}><X className="w-4 h-4" /></Button>
                                  </div>
                                ) : (
                                  <div className="flex justify-end gap-1">
                                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => startEdit(e)}><Pencil className="w-4 h-4" /></Button>
                                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => handleDelete(e.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                                  </div>
                                )}
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col items-center gap-2 pt-6">
          <p className="text-[10px] sm:text-xs text-muted-foreground font-medium bg-muted/30 px-3 py-1 rounded-full">
            Showing {filtered.length} of {entries.length} entries · {isAdmin ? "Admin mode" : "Public view"}
          </p>
          <div className="flex items-center gap-1 opacity-50">
            <Fuel className="w-3 h-3" />
            <span className="text-[10px] font-bold uppercase tracking-widest">Parth Fuel Corporation</span>
          </div>
        </div>
      </main>
    </div>
  );
}