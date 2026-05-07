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
    const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7);
    const weekCount = entries.filter((e) => new Date(e.entry_time) >= weekStart).length;
    const uniqueVehicles = new Set(entries.map((e) => e.vehicle_number.toLowerCase())).size;
    return { total: entries.length, today: todayCount, week: weekCount, uniqueVehicles };
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
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/30 to-background">
      <header className="border-b bg-card/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg">
              <Fuel className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold leading-tight">Parth Fuel Corporation</h1>
              <p className="text-xs text-muted-foreground">Vehicle Entry Log</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin ? (
              <>
                <span className="hidden sm:inline text-xs text-muted-foreground">{userEmail}</span>
                <Button variant="outline" size="sm" onClick={handleLogout}>
                  <LogOut className="w-4 h-4 mr-1" /> Logout
                </Button>
              </>
            ) : (
              <Link to="/login">
                <Button size="sm">
                  <LogIn className="w-4 h-4 mr-1" /> Admin Login
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Entries", value: stats.total },
            { label: "Today", value: stats.today },
            { label: "Last 7 days", value: stats.week },
            { label: "Unique Vehicles", value: stats.uniqueVehicles },
          ].map((s) => (
            <div key={s.label} className="bg-card border rounded-xl p-3 sm:p-4 shadow-sm">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-2xl font-bold mt-1">{s.value}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Search by PC, name, vehicle..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setShowFilters((s) => !s)}>
              <FilterIcon className="w-4 h-4 mr-1" /> Filters
            </Button>
            <Button variant="ghost" size="sm" onClick={fetchEntries} title="Refresh">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="w-4 h-4 mr-1" /> Print
            </Button>
            <Button variant="outline" size="sm" onClick={exportPdf}>
              <FileDown className="w-4 h-4 mr-1" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={exportExcel}>
              <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
            </Button>
            {isAdmin && (
              <Button size="sm" onClick={() => setShowAdd((s) => !s)}>
                <Plus className="w-4 h-4 mr-1" /> {showAdd ? "Cancel" : "Add Entry"}
              </Button>
            )}
          </div>
        </div>

        {showFilters && (
          <div className="bg-card border rounded-xl p-4 space-y-3 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground mr-1"><Calendar className="w-3 h-3 inline mr-1" />Date:</span>
              {([
                ["all", "All time"],
                ["today", "Today"],
                ["week", "Last 7 days"],
                ["month", "Last 30 days"],
                ["custom", "Custom"],
              ] as [DatePreset, string][]).map(([k, l]) => (
                <button key={k} onClick={() => setDatePreset(k)}
                  className={`px-3 py-1 rounded-full text-xs border transition ${datePreset === k ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted"}`}>
                  {l}
                </button>
              ))}
              <Button variant="ghost" size="sm" className="ml-auto" onClick={clearFilters}>Clear all</Button>
            </div>
            {datePreset === "custom" && (
              <div className="flex flex-wrap gap-3 items-end">
                <div className="space-y-1">
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-auto" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-auto" />
                </div>
              </div>
            )}
          </div>
        )}

        {isAdmin && selectedIds.size > 0 && (
          <div className="bg-primary/10 border border-primary/30 rounded-xl px-4 py-2 flex items-center justify-between">
            <span className="text-sm font-medium">{selectedIds.size} selected</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Clear</Button>
              <Button size="sm" variant="destructive" onClick={handleBulkDelete}>
                <Trash2 className="w-4 h-4 mr-1" /> Delete selected
              </Button>
            </div>
          </div>
        )}

        {isAdmin && showAdd && (
          <form onSubmit={handleAdd} className="bg-card border rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end shadow-sm">
            <div className="space-y-1">
              <Label className="text-xs">PC No.</Label>
              <Input value={form.pc_no} onChange={(e) => setForm({ ...form, pc_no: e.target.value })} placeholder="PC-001" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Driver name" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Vehicle Number</Label>
              <Input value={form.vehicle_number} onChange={(e) => setForm({ ...form, vehicle_number: e.target.value })} placeholder="GJ 01 AB 1234" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Time</Label>
              <Input type="datetime-local" value={form.entry_time} onChange={(e) => setForm({ ...form, entry_time: e.target.value })} />
            </div>
            <Button type="submit"><Save className="w-4 h-4 mr-1" /> Save</Button>
          </form>
        )}

        <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  {isAdmin && (
                    <TableHead className="w-[40px]">
                      <input type="checkbox" checked={allVisibleSelected} onChange={() => toggleSelectAll(filtered.map((e) => e.id))} />
                    </TableHead>
                  )}
                  <TableHead className="w-[140px]"><SortBtn k="pc_no" label="PC No." /></TableHead>
                  <TableHead><SortBtn k="name" label="Name" /></TableHead>
                  <TableHead><SortBtn k="vehicle_number" label="Vehicle Number" /></TableHead>
                  <TableHead className="w-[200px]"><SortBtn k="entry_time" label="Time" /></TableHead>
                  {isAdmin && <TableHead className="w-[140px] text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={isAdmin ? 6 : 4} className="text-center py-12 text-muted-foreground">Loading...</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={isAdmin ? 6 : 4} className="text-center py-12 text-muted-foreground">No entries match the filters.</TableCell></TableRow>
                ) : (
                  filtered.map((e) => {
                    const editing = editingId === e.id;
                    return (
                      <TableRow key={e.id} className="hover:bg-muted/30">
                        {isAdmin && (
                          <TableCell>
                            <input type="checkbox" checked={selectedIds.has(e.id)} onChange={() => toggleSelect(e.id)} />
                          </TableCell>
                        )}
                        <TableCell className="font-medium">
                          {editing ? (
                            <Input value={editForm.pc_no as string} onChange={(ev) => setEditForm({ ...editForm, pc_no: ev.target.value })} />
                          ) : e.pc_no}
                        </TableCell>
                        <TableCell>
                          {editing ? (
                            <Input value={editForm.name as string} onChange={(ev) => setEditForm({ ...editForm, name: ev.target.value })} />
                          ) : e.name}
                        </TableCell>
                        <TableCell>
                          {editing ? (
                            <Input value={editForm.vehicle_number as string} onChange={(ev) => setEditForm({ ...editForm, vehicle_number: ev.target.value })} />
                          ) : e.vehicle_number}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {editing ? (
                            <Input type="datetime-local" value={editForm.entry_time as string} onChange={(ev) => setEditForm({ ...editForm, entry_time: ev.target.value })} />
                          ) : formatDisplay(e.entry_time)}
                        </TableCell>
                        {isAdmin && (
                          <TableCell className="text-right">
                            {editing ? (
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="ghost" onClick={saveEdit}><Save className="w-4 h-4" /></Button>
                                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}><X className="w-4 h-4" /></Button>
                              </div>
                            ) : (
                              <div className="flex justify-end gap-1">
                                <Button size="sm" variant="ghost" onClick={() => startEdit(e)}><Pencil className="w-4 h-4" /></Button>
                                <Button size="sm" variant="ghost" onClick={() => handleDelete(e.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                              </div>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center pt-4">
          Showing {filtered.length} of {entries.length} entries · {isAdmin ? "Admin mode" : "Public view"}
        </p>
      </main>
    </div>
  );
}