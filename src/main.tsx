import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ShieldCheck, LockKeyhole, Plus, Search, Download, Upload, Folder, KeyRound, Pencil, Trash2, X, Eye, EyeOff, Copy, ArrowRight, Sun, Moon, Check, Shuffle, Info } from './icons';
import { CategoryIcon, categoryIconLabel, DEFAULT_CATEGORY_ICON, randomCategoryIcon, searchCategoryIcons } from './category-icons';
import { createVault, openVault, decryptVault, parseEnvelope, seal, masterPasswordProblem, normalizeNotes, MAX_FILE_SIZE, type Vault, type Entry, type Category, type Envelope } from './vault';
import { uniqueEntryNames, matchEntryNames } from './name-suggest';
import { saveSessionKey, loadSessionKey, clearSessionKey } from './session';
import './style.css';
const STORAGE = 'quiet-vault.v1';
const THEME_KEY = 'quiet-vault.theme';
// Marker written synchronously on manual lock so a refresh right after locking can never auto-unlock.
const LOCKED_KEY = 'quiet-vault.locked';
// iOS document pickers grey out unknown extensions like .qvault, so exports use .json.
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// 密码框用文本输入 + CSS 掩码，避免 Chrome/Safari 把它当成密码字段弹出自动填充；不支持的浏览器回退为 type="password"。
const supportsTextSecurity = typeof CSS !== 'undefined' && CSS.supports('-webkit-text-security', 'disc');
type Session = { key: CryptoKey; vault: Vault; envelope: Envelope };
type Theme = 'light' | 'dark';
function readTheme(): Theme {
  try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}
function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#0c1310' : '#edf4ee');
}
const initialTheme = readTheme();
applyTheme(initialTheme);
const blankEntry = (): Entry => ({ id: crypto.randomUUID(), name: '', username: '', password: '', notes: '', categoryId: '', updatedAt: '' });
function entryLabel(entry: Entry) { return entry.name.trim() || entry.username || '未命名条目'; }
function entrySubtitle(entry: Entry) { return entry.name.trim() ? entry.username : entry.username ? '未填写名称' : entry.password ? '未填写账号' : ''; }
function entryClipboard(entry: Entry) {
  return [entry.name.trim() && `名称：${entry.name.trim()}`, entry.username && `账号：${entry.username}`, entry.password && `密码：${entry.password}`, entry.notes?.trim() && `备注：${entry.notes.trim()}`].filter(Boolean).join('\n');
}
// 放置目标用 data-category-drop 标记：空字符串代表「未分类」，null 代表没有命中任何分类。
function dropCategoryAt(x: number, y: number): string | null {
  const target = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-category-drop]');
  return target ? target.getAttribute('data-category-drop') ?? '' : null;
}
// 备份文件名用设备本地时间，避免 UTC 造成的日期/时刻偏差。
function localStamp(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}
function App() {
  const [stored, setStored] = useState<Envelope | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const [pending, setPending] = useState<Envelope | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('*');
  const [view, setView] = useState<'vault' | 'about'>('vault');
  const [query, setQuery] = useState('');
  const [categoryQuery, setCategoryQuery] = useState('');
  const [editor, setEditor] = useState<Entry | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  // 分类编辑器独立于「管理分类」列表：id 为空表示新建，否则编辑对应分类。
  const [categoryEditor, setCategoryEditor] = useState<{ id?: string; name: string; icon: string } | null>(null);
  const [revealed, setRevealed] = useState(false);
  // 行内归类：ids 为一次要改分类的条目，anchor 是触发按钮，菜单贴着它展开。
  const [menu, setMenu] = useState<{ ids: string[]; current?: string; anchor: HTMLElement } | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 拖拽归类：条目左侧头像作为手柄，拖到侧边栏分类（窄屏为底部托盘）上即可改分类。
  const dragSession = useRef<{ id: string; label: string; startX: number; startY: number; pointerId: number; active: boolean } | null>(null);
  const dragPoint = useRef({ x: 0, y: 0 });
  const ghostRef = useRef<HTMLDivElement>(null);
  const ghostSize = useRef({ width: 0, height: 0 });
  const [drag, setDrag] = useState<{ id: string; label: string; over: string | null } | null>(null);
  const [newCategory, setNewCategory] = useState('');
  const [startupError, setStartupError] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const fileRef = useRef<HTMLInputElement>(null);
  const entrySaveRef = useRef<(() => void) | null>(null);
  const version = useRef<string | null>(null);
  const generation = useRef(0);
  function assign(value: Session | null) { sessionRef.current = value; setSession(value); }
  function toggleTheme() { setTheme(value => value === 'dark' ? 'light' : 'dark'); }
  function clearSession() {
    generation.current++;
    assign(null); setEditor(null); setCategoriesOpen(false); setPassword(''); setConfirmPassword(''); setRevealed(false); setQuery(''); setCategoryQuery(''); setCategoryEditor(null); setPending(null); setFilter('*'); setView('vault');
    setMenu(null); setSelecting(false); setSelectedIds(new Set()); setNewCategory('');
    dragSession.current = null; setDrag(null); document.body.classList.remove('entry-dragging');
  }
  function changeFilter(value: string) {
    setFilter(value); setView('vault'); setMenu(null); setSelecting(false); setSelectedIds(new Set());
  }
  function openAbout() {
    setView('about'); setMenu(null); setSelecting(false); setSelectedIds(new Set());
  }
  // Locking is deliberate: mark it synchronously, then drop the persisted key.
  function lock() {
    try { localStorage.setItem(LOCKED_KEY, '1'); } catch {}
    clearSession();
    void clearSessionKey().catch(() => {});
  }
  async function restoreSession(envelope: Envelope): Promise<Session | null> {
    let saved: { key: CryptoKey; salt: string } | null = null;
    try { saved = await loadSessionKey(); } catch { return null; }
    if (!saved || saved.salt !== envelope.salt) return null;
    try { return { key: saved.key, vault: await decryptVault(envelope, saved.key), envelope }; }
    catch { void clearSessionKey().catch(() => {}); return null; }
  }
  function readStored(): Envelope | null {
    const raw = localStorage.getItem(STORAGE);
    version.current = raw;
    return raw ? parseEnvelope(raw) : null;
  }
  async function reloadFromStorage(): Promise<boolean> {
    let envelope: Envelope | null;
    try { envelope = readStored(); }
    catch { setStartupError(true); setError('另一个标签页写入了无法读取的数据，请导入备份。'); return false; }
    setStored(envelope); setStartupError(false);
    const restored = envelope ? await restoreSession(envelope) : null;
    if (restored) {
      generation.current++;
      setEditor(null); setCategoriesOpen(false); setRevealed(false);
      assign(restored);
      return true;
    }
    clearSession();
    if (!envelope) void clearSessionKey().catch(() => {});
    return false;
  }
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let envelope: Envelope | null = null;
      try {
        envelope = readStored();
        if (!cancelled) setStored(envelope);
        if (!crypto.subtle) setError('当前环境不支持 Web Crypto。请通过 HTTPS 或本机 localhost 打开。');
      } catch {
        if (!cancelled) { setStartupError(true); setError('无法读取浏览器保险库。请保留原始数据并导入备份；不要清理浏览器存储。'); }
      }
      let lockedByUser = false;
      try { lockedByUser = localStorage.getItem(LOCKED_KEY) === '1'; } catch {}
      if (envelope && !lockedByUser) {
        const restored = await restoreSession(envelope);
        if (!cancelled && restored) assign(restored);
      }
      if (!cancelled) setRestoring(false);
    })();
    const changed = (event: StorageEvent) => {
      if (event.key === LOCKED_KEY) {
        if (event.newValue === '1') { clearSession(); setNotice('已在另一个标签页锁定'); }
        return;
      }
      if (event.key !== STORAGE && event.key !== null) return;
      if (busyRef.current) return;
      void reloadFromStorage().then(ok => {
        if (ok) setNotice('另一个标签页已更新保险库，已加载最新版本');
        else setError('保险库已在其他标签页改变，请重新解锁');
      });
    };
    window.addEventListener('storage', changed);
    return () => { cancelled = true; window.removeEventListener('storage', changed); };
  }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { applyTheme(theme); try { localStorage.setItem(THEME_KEY, theme); } catch {} }, [theme]);
  // Cmd/Ctrl+S 保存编辑中的条目，同时挡住浏览器自己的「保存网页」。
  useEffect(() => {
    const shortcut = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLocaleLowerCase() !== 's') return;
      const submit = entrySaveRef.current;
      if (!submit) return;
      e.preventDefault();
      if (!busyRef.current) submit();
    };
    document.addEventListener('keydown', shortcut);
    return () => document.removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => { if (!editor) entrySaveRef.current = null; }, [editor]);
  // 浮层在拖拽开始时才挂载，这里补一次初始位置，之后的移动直接改 transform 避免整页重渲染。
  useLayoutEffect(() => {
    if (!drag || !ghostRef.current) return;
    ghostSize.current = { width: ghostRef.current.offsetWidth, height: ghostRef.current.offsetHeight };
    positionGhost(dragPoint.current.x, dragPoint.current.y);
  }, [drag?.id]);
  async function run(task: (token: number) => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    const token = generation.current;
    try { await task(token); } catch (e) { if (token === generation.current) setError(e instanceof Error ? e.message : '操作失败，请重试'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function persist(next: Session, token: number) {
    if (!navigator.locks) throw new Error('当前浏览器不支持安全的多标签页保存，请更新浏览器');
    return navigator.locks.request(STORAGE, async () => {
      if (token !== generation.current) return false;
      // Compare immediately before writing: stale tabs must never silently overwrite a newer vault.
      if (localStorage.getItem(STORAGE) !== version.current) {
        const reloaded = await reloadFromStorage();
        setError(reloaded ? '保险库已在其他标签页改变，此次更改未保存' : '保险库已在其他标签页改变，请重新解锁');
        return false;
      }
      const raw = JSON.stringify(next.envelope);
      try { localStorage.setItem(STORAGE, raw); } catch { throw new Error('浏览器保存失败（存储已满或被禁用），此次更改未保存'); }
      version.current = raw; setStored(next.envelope); assign(next); setStartupError(false);
      // Keep the non-extractable key so a refresh can restore the session without the master password.
      try { await saveSessionKey(next.key, next.envelope.salt); localStorage.removeItem(LOCKED_KEY); } catch {}
      return true;
    });
  }
  async function unlock(e: React.FormEvent) {
    e.preventDefault();
    const target = pending ?? stored;
    if (!target) {
      if (password !== confirmPassword) { setError('两次输入的主密码不一致'); return; }
      const problem = masterPasswordProblem(password);
      if (problem) { setError(problem); return; }
    }
    await run(async token => {
      const next = target ? await openVault(target, password) : await createVault(password);
      if (pending && !window.confirm('导入将替换此浏览器的保险库。请确认已经导出当前备份。继续？')) return;
      if (await persist(next, token)) { setPending(null); setPassword(''); setConfirmPassword(''); setNotice(target ? '保险库已解锁' : '保险库已创建并加密保存'); }
    });
  }
  async function save(vault: Vault, done?: () => void) {
    const current = sessionRef.current;
    if (!current) return;
    await run(async token => {
      const envelope = await seal(vault, current.key, current.envelope.salt);
      if (await persist({ ...current, vault, envelope }, token)) { done?.(); setNotice('已加密保存到此浏览器'); }
    });
  }
  // 行内归类：一次可作用于单条或批量选中的多条，允许顺手创建新分类。
  async function assignCategory(ids: string[], categoryId: string, newName?: string) {
    const current = sessionRef.current;
    if (!current || !ids.length) return;
    setMenu(null);
    let categories = current.vault.categories;
    let target = categoryId;
    if (newName) {
      const name = newName.trim();
      const existing = categories.find(c => c.name.toLocaleLowerCase() === name.toLocaleLowerCase());
      if (existing) target = existing.id;
      else { target = crypto.randomUUID(); categories = [...categories, { id: target, name, icon: DEFAULT_CATEGORY_ICON }]; }
    }
    const idSet = new Set(ids);
    const stamp = new Date().toISOString();
    const label = categories.find(c => c.id === target)?.name ?? '未分类';
    await save({
      categories,
      entries: current.vault.entries.map(e => idSet.has(e.id) ? { ...e, categoryId: target, updatedAt: stamp } : e),
    }, () => {
      setNotice(ids.length > 1 ? `已将 ${ids.length} 条密码移至「${label}」` : `已移至「${label}」`);
      setSelecting(false); setSelectedIds(new Set());
    });
  }
  // 指针拖拽手柄：移动超过阈值才进入拖拽，松手时按指针下方的分类放置。
  function positionGhost(x: number, y: number) {
    const ghost = ghostRef.current;
    if (!ghost) return;
    const { width, height } = ghostSize.current;
    // 靠近视口右下角时翻到指针另一侧，避免浮层盖住正在悬停的放置目标。
    const left = x + 14 + width + 8 > innerWidth ? x - width - 14 : x + 14;
    const top = y + 14 + height + 8 > innerHeight ? y - height - 14 : y + 14;
    ghost.style.transform = `translate3d(${Math.max(8, left)}px, ${Math.max(8, top)}px, 0)`;
  }
  function startEntryDrag(event: React.PointerEvent<HTMLElement>, entry: Entry) {
    if (event.button !== 0 || selecting || busyRef.current) return;
    dragSession.current = { id: entry.id, label: entryLabel(entry), startX: event.clientX, startY: event.clientY, pointerId: event.pointerId, active: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function moveEntryDrag(event: React.PointerEvent<HTMLElement>) {
    const session = dragSession.current;
    if (!session || session.pointerId !== event.pointerId) return;
    dragPoint.current = { x: event.clientX, y: event.clientY };
    if (!session.active) {
      if (Math.hypot(event.clientX - session.startX, event.clientY - session.startY) < 6) return;
      session.active = true;
      document.body.classList.add('entry-dragging');
      setDrag({ id: session.id, label: session.label, over: dropCategoryAt(event.clientX, event.clientY) });
    }
    event.preventDefault();
    positionGhost(event.clientX, event.clientY);
    const over = dropCategoryAt(event.clientX, event.clientY);
    setDrag(current => current && current.over !== over ? { ...current, over } : current);
  }
  function endEntryDrag(event: React.PointerEvent<HTMLElement>, cancelled = false) {
    const session = dragSession.current;
    if (!session || session.pointerId !== event.pointerId) return;
    dragSession.current = null;
    document.body.classList.remove('entry-dragging');
    const target = cancelled ? null : dropCategoryAt(event.clientX, event.clientY);
    setDrag(null);
    if (!session.active || target === null) return;
    const current = sessionRef.current;
    const entry = current?.vault.entries.find(item => item.id === session.id);
    if (!current || !entry) return;
    if (entry.categoryId === target) {
      const label = target === '' ? '未分类' : current.vault.categories.find(category => category.id === target)?.name;
      if (label) setNotice(`已在「${label}」`);
      return;
    }
    void assignCategory([session.id], target);
  }
  async function createCategoryInline(name: string, apply: (id: string) => void) {
    const current = sessionRef.current;
    if (!current) return;
    const existing = current.vault.categories.find(c => c.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (existing) { apply(existing.id); return; }
    const id = crypto.randomUUID();
    await save({ ...current.vault, categories: [...current.vault.categories, { id, name, icon: DEFAULT_CATEGORY_ICON }] }, () => { apply(id); setNotice(`已创建分类「${name}」`); });
  }
  function toggleSelected(id: string) {
    setSelectedIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  async function importFile(file?: File) {
    if (!file || busyRef.current) return;
    await run(async token => {
      if (file.size > MAX_FILE_SIZE) throw new Error('文件不能超过 5 MB');
      const envelope = parseEnvelope(await file.text());
      if (token !== generation.current) return;
      clearSession(); setPending(envelope); setNotice('请输入导入文件的主密码；解锁成功前不会替换现有数据');
    });
  }
  function exportFile() {
    const envelope = sessionRef.current?.envelope ?? stored;
    if (!envelope) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(envelope)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `quiet-vault-${localStamp()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('已请求下载密文备份，请确认文件已保存');
  }
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); setNotice('已复制。使用后请清理剪贴板'); } catch { setError('无法访问剪贴板，请显示后手动复制'); } }
  const vault = session?.vault;
  const selected = filter === '*' ? '所有密码' : filter === '' ? '未分类' : vault?.categories.find(c => c.id === filter)?.name ?? '所有密码';
  const entries = vault?.entries.filter(e => (filter === '*' || e.categoryId === filter) && [e.name,e.username,vault.categories.find(c=>c.id===e.categoryId)?.name ?? '未分类'].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? [];
  const nameOptions = vault && editor ? uniqueEntryNames(vault.entries, editor.id) : [];
  const dropClass = (categoryId: string) => drag ? ` drop-ready${drag.over === categoryId ? ' drop-hover' : ''}` : '';
  return <>
    <input ref={fileRef} type="file" accept={isIOS ? undefined : '.json,.qvault,application/json'} hidden onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ''; }}/>
    {restoring ? <main className="gate gate-restoring"><section className="gate-card"><div className="lock-emblem"><LockKeyhole size={30}/></div><p className="eyebrow">QUIET VAULT</p><h1>正在解锁…</h1><p className="muted">正在从此设备恢复加密会话。</p></section></main> : !session ? <main className="gate">
      <div className="gate-top"><div className="gate-brand"><ShieldCheck size={30}/><span>Quiet Vault<span className="brand-dot">.</span></span></div><ThemeToggle theme={theme} onToggle={toggleTheme}/></div>
      <section className="gate-card"><div className="lock-emblem"><LockKeyhole size={30}/></div><p className="eyebrow">YOUR PASSWORDS. YOUR CONTROL.</p>
        <h1>{pending ? '打开加密备份' : stored ? '欢迎回来' : '给你的密码，一个安全的家'}</h1><p className="muted">{pending ? '使用备份文件的主密码解锁。' : stored ? '输入主密码，解锁此设备上的保险库。' : '没有账号，没有云端。只有你和你的主密码。'}</p>
        <form onSubmit={unlock}><label>主密码<input autoFocus id="master-password" aria-describedby={!stored && !pending ? 'master-password-hint' : undefined} type="password" autoComplete={stored || pending ? 'current-password':'new-password'} value={password} onChange={e=>setPassword(e.target.value)} required placeholder={stored || pending ? '输入主密码' : '至少 12 位，含大小写字母和数字'} maxLength={1024}/></label>
          {!stored && !pending && <label>再次输入主密码<input type="password" autoComplete="new-password" value={confirmPassword} onChange={e=>setConfirmPassword(e.target.value)} required/></label>}
          {!stored && !pending && <p className="password-hint" id="master-password-hint">主密码至少 12 位，且同时包含大写字母、小写字母和数字。</p>}
          <button className="primary wide" disabled={busy || (startupError && !pending)}>{busy ? '正在派生密钥…' : pending || stored ? '解锁保险库' : '创建保险库'}<ArrowRight size={18}/></button>
        </form><div className="gate-actions"><button onClick={()=>fileRef.current?.click()} disabled={busy}><Upload size={16}/>导入加密文件</button>{stored && <button onClick={exportFile} disabled={busy}><Download size={16}/>导出备份</button>}{pending && <button onClick={()=>{setPending(null);setPassword('');}}>取消导入</button>}</div>
        <div className="security-note"><ShieldCheck size={18}/><span>Argon2id + AES-256-GCM · 仅在你的浏览器中解密</span></div>
      </section><p className="gate-foot">请牢记主密码。我们无法找回或重置它。<br/>浏览器存储不是备份，请定期导出加密文件。</p>
    </main> : <div className="app-shell">
      <header className="app-header"><div className="brand-block"><a className="brand" href="#"><ShieldCheck/><span>Quiet Vault<span className="brand-dot">.</span></span></a><div className="workspace-label">个人空间 <span>LOCAL</span></div></div><div className="header-actions"><ThemeToggle theme={theme} onToggle={toggleTheme}/><button onClick={lock} disabled={busy}><LockKeyhole size={16}/>锁定</button></div></header>
      <div className="app-body">
      <aside className="sidebar" aria-label="分类导航">
        <p className="sidebar-title">分类</p>
        <nav className="category-nav" aria-label="分类">
          <button type="button" className={filter==='*'&&view==='vault'?'nav-item active':'nav-item'} aria-current={filter==='*'&&view==='vault'?'page':undefined} onClick={()=>changeFilter('*')}><KeyRound size={16}/><span className="nav-name">所有密码</span><span className="nav-count">{vault!.entries.length}</span></button>
          {vault!.categories.map(c=><button type="button" data-category-drop={c.id} className={(filter===c.id&&view==='vault'?'nav-item active':'nav-item')+dropClass(c.id)} aria-current={filter===c.id&&view==='vault'?'page':undefined} key={c.id} onClick={()=>changeFilter(c.id)}><CategoryIcon icon={c.icon} size={16}/><span className="nav-name">{c.name}</span><span className="nav-count">{vault!.entries.filter(e=>e.categoryId===c.id).length}</span></button>)}
          <button type="button" data-category-drop="" className={(filter===''&&view==='vault'?'nav-item active':'nav-item')+dropClass('')} aria-current={filter===''&&view==='vault'?'page':undefined} onClick={()=>changeFilter('')}><Folder size={16}/><span className="nav-name">未分类</span><span className="nav-count">{vault!.entries.filter(e=>!e.categoryId).length}</span></button>
        </nav>
        <div className="sidebar-tools">
          <button type="button" className={view==='about'?'sidebar-link active':'sidebar-link'} aria-current={view==='about'?'page':undefined} onClick={openAbout}><Info size={15}/>简介</button>
          <button type="button" className="sidebar-link" onClick={()=>setCategoryEditor({name:'',icon:DEFAULT_CATEGORY_ICON})}><Plus size={15}/>新建分类</button>
          <button type="button" className="sidebar-link" onClick={()=>setCategoriesOpen(true)}><Pencil size={15}/>管理分类</button>
        </div>
      </aside>
      <main className="workspace"><div className="content"><div className="list-head"><p className="breadcrumb">个人保险库 <span>/</span> {view === 'about' ? '简介' : selected}</p>{view === 'vault' && <button className="primary" disabled={busy} onClick={()=>{setEditor({...blankEntry(),categoryId:filter==='*'?'':filter});setRevealed(false);}}><Plus size={18}/>新增密码</button>}</div>
          {view === 'about' ? <AboutPage/> : <>
          <div className="toolbar"><div className="search"><Search size={19}/><input aria-label="搜索密码" placeholder="搜索名称、账号或分类…" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="file-actions"><button disabled={busy} onClick={()=>fileRef.current?.click()}><Upload size={15}/>导入</button><button disabled={busy} onClick={exportFile}><Download size={15}/>导出备份</button></div></div>
          {busy && <div className="save-status"><span/><span>正在加密保存…</span></div>}
          {filter === '' && entries.length > 0 && !selecting && <div className="hint-bar">
            <div className="hint-icon"><Folder size={17}/></div>
            <div><strong>{entries.length} 条密码还没有分类</strong><p>勾选多条，一次归入同一个分类。</p></div>
            <button type="button" onClick={()=>{setSelecting(true);setSelectedIds(new Set());setMenu(null);}}>批量归类</button>
          </div>}
          <section className="entry-list" aria-label="密码列表">{entries.length ? entries.sort((a,b)=>entryLabel(a).localeCompare(entryLabel(b))).map(e=>{
            const category = vault!.categories.find(c=>c.id===e.categoryId);
            const name = category?.name;
            const isSelected = selectedIds.has(e.id);
            return <article className={`entry${selecting?' selecting':''}${isSelected?' selected':''}${drag?.id===e.id?' dragging':''}`} key={e.id}>
              {selecting ? <span className={`select-box${isSelected?' checked':''}`} aria-hidden="true">{isSelected && <Check size={15}/>}</span> : <span className="entry-avatar drag-handle" aria-hidden="true" title="拖拽到分类可快速归类" onPointerDown={ev=>startEntryDrag(ev,e)} onPointerMove={moveEntryDrag} onPointerUp={endEntryDrag} onPointerCancel={ev=>endEntryDrag(ev,true)} onLostPointerCapture={ev=>endEntryDrag(ev,true)}>{entryLabel(e).slice(0,1)}</span>}
              <time className="entry-date" dateTime={e.updatedAt} title={`更新时间：${e.updatedAt}`} aria-label={`更新时间：${e.updatedAt}`}>{/^\d{4}-\d{2}-\d{2}/.test(e.updatedAt) ? e.updatedAt.slice(0,10) : '—'}</time>
              <button className="entry-main" onClick={selecting ? ()=>toggleSelected(e.id) : ()=>{setEditor({...e});setRevealed(false);}} aria-pressed={selecting ? isSelected : undefined}><strong>{entryLabel(e)}</strong>{entrySubtitle(e) && <span>{entrySubtitle(e)}</span>}{e.notes?.trim() && <span className="entry-notes">{e.notes}</span>}</button>
              {selecting ? <span className={`tag${name?'':' unset'}${category?.icon?' with-icon':''}`}>{category && <CategoryIcon icon={category.icon} size={12}/>}{name ?? '未分类'}</span> : <button type="button" className={`tag tag-button${name?'':' unset'}${category?.icon?' with-icon':''}`} aria-haspopup="true" aria-expanded={menu?.ids.length===1 && menu.ids[0]===e.id} aria-label={`修改分类：${entryLabel(e)}，当前 ${name ?? '未分类'}`} onClick={ev=>{const anchor=ev.currentTarget;setMenu(menu?.anchor===anchor?null:{ ids:[e.id], current:e.categoryId, anchor });}}>{category && <CategoryIcon icon={category.icon} size={12}/>}{name ?? '未分类'}</button>}
              {!selecting && <button className="icon-button" aria-label={`复制 ${entryLabel(e)} 的名称、账号、密码和备注`} onClick={()=>void copy(entryClipboard(e))}><Copy size={18}/></button>}
            </article>;
          }) : <div className="empty"><div className="empty-icon"><KeyRound size={30}/></div><h2>{query ? '没有匹配的密码' : filter === '' ? '没有未分类的密码' : '从第一个密码开始'}</h2><p>{query ? '试试其他关键词，或选择其他分类。' : filter === '' ? '所有密码都已归类。' : '添加登录信息，或导入已有的加密备份。'}</p>{!query && filter !== '' && <button onClick={()=>{setEditor({...blankEntry(),categoryId:filter==='*'?'':filter});setRevealed(false);}}><Plus size={17}/>添加密码</button>}</div>}</section>
          </>}
        </div>
      </main>
      </div>
      {selecting && <div className="selection-bar" role="toolbar" aria-label="批量归类">
        <span className="selection-count">已选 {selectedIds.size} 条</span>
        <button type="button" onClick={()=>setSelectedIds(selectedIds.size===entries.length ? new Set() : new Set(entries.map(e=>e.id)))}>{selectedIds.size===entries.length ? '取消全选' : '全选'}</button>
        <button type="button" className="primary" disabled={!selectedIds.size || busy} onClick={ev=>{const anchor=ev.currentTarget;setMenu(menu?.anchor===anchor?null:{ ids:[...selectedIds], anchor });}}>移至分类</button>
        <button type="button" onClick={()=>{setSelecting(false);setSelectedIds(new Set());setMenu(null);}}>取消</button>
      </div>}
    </div>}
    {editor && vault && <Modal error={error} title={vault.entries.some(e=>e.id===editor.id)?'编辑密码':'新增密码'} icon={<KeyRound size={18}/>} close={()=>{entrySaveRef.current=null;setEditor(null);}} disabled={busy}>
      {requestClose => {
      const submit = () => {
        if (!editor.name.trim() && !editor.username.trim() && !editor.password && !editor.notes?.trim()) { setError('请至少填写名称、账号、密码或备注中的一项'); return; }
        const next={...editor,username:editor.username.trim(),notes:normalizeNotes(editor.notes),updatedAt:new Date().toISOString()};
        void save({...vault,entries:[...vault.entries.filter(x=>x.id!==next.id),next]},requestClose);
      };
      entrySaveRef.current = submit;
      // 不使用原生 form 提交：Chrome 会把含密码字段的表单当作登录表单并弹出「要保存密码吗」。
      // 同理，Chrome 会忽略登录表单里文本字段的 autocomplete="off"，统一用 new-password 阻断自动填充和输入历史。
      return <div>
        <NameCombobox value={editor.name} options={nameOptions} onChange={name=>setEditor({...editor,name})}/>
        <label>账号<input autoComplete="new-password" maxLength={1000} value={editor.username} onChange={e=>setEditor({...editor,username:e.target.value})}/></label>
        <label>密码<div className="password-field"><input id="entry-password" type={revealed || supportsTextSecurity ? 'text' : 'password'} className={!revealed && supportsTextSecurity ? 'masked-secret' : undefined} autoComplete={supportsTextSecurity ? 'off' : 'new-password'} autoCapitalize="off" autoCorrect="off" spellCheck={false} maxLength={4096} value={editor.password} onChange={e=>setEditor({...editor,password:e.target.value})}/><div className="password-tools"><button type="button" aria-label={revealed?'隐藏密码':'显示密码'} onClick={()=>setRevealed(!revealed)}>{revealed?<EyeOff size={18}/>:<Eye size={18}/>}</button><button type="button" aria-label="复制密码" onClick={()=>void copy(editor.password)}><Copy size={18}/></button></div></div></label>
        <label>备注（非必填）<textarea rows={3} maxLength={2000} autoComplete="off" placeholder="添加备注，例如安全问题、恢复方式…" value={editor.notes ?? ''} onChange={e=>setEditor({...editor,notes:e.target.value})}/></label>
        <div className="field-label" id="entry-category-label">分类</div>
        <div className="category-field" role="group" aria-labelledby="entry-category-label">
          <button type="button" className="category-chip" aria-pressed={editor.categoryId===''} onClick={()=>setEditor({...editor,categoryId:''})}><CategoryIcon icon={DEFAULT_CATEGORY_ICON} size={14}/>未分类</button>
          {vault.categories.map(c=><button type="button" className="category-chip" key={c.id} aria-pressed={editor.categoryId===c.id} onClick={()=>setEditor({...editor,categoryId:c.id})}><CategoryIcon icon={c.icon} size={14}/>{c.name}</button>)}
        </div>
        <div className="category-create"><input aria-label="新建分类" autoComplete="off" value={newCategory} maxLength={60} placeholder="新建分类，按回车创建" onChange={e=>setNewCategory(e.target.value)} onKeyDown={e=>{
          if (e.key !== 'Enter') return;
          e.preventDefault();
          const name = newCategory.trim();
          if (!name) return;
          void createCategoryInline(name, id => { setEditor(current => current ? {...current, categoryId: id} : current); setNewCategory(''); });
        }}/></div>
        <div className="modal-actions">{vault.entries.some(e=>e.id===editor.id) && <button className="danger" type="button" disabled={busy} onClick={()=>{if(confirm('删除此密码条目？此操作无法撤销。'))void save({...vault,entries:vault.entries.filter(e=>e.id!==editor.id)},requestClose);}}><Trash2 size={16}/>删除</button>}<button type="button" className="primary" disabled={busy} onClick={submit}>{busy ? <><span className="spinner" aria-hidden="true"/>加密中…</> : '加密保存'}</button></div>
      </div>;
      }}
    </Modal>}
    {categoriesOpen && vault && <Modal error={error} title="管理分类" icon={<Folder size={18}/>} close={()=>{setCategoriesOpen(false);setCategoryQuery('');}} disabled={busy}>
      <p className="muted">编辑或删除已有分类。删除分类时，其中的密码会移至「未分类」。</p>
      {vault.categories.length > 0 && <label>查找分类<input value={categoryQuery} onChange={e=>setCategoryQuery(e.target.value)} placeholder="输入分类名称…"/></label>}
      {vault.categories.length > 0 && <div className="category-list">{vault.categories.filter(c=>c.name.toLocaleLowerCase().includes(categoryQuery.trim().toLocaleLowerCase())).map(c=><div key={c.id}><CategoryIcon icon={c.icon} size={17}/><span>{c.name}</span><button aria-label={`编辑分类 ${c.name}`} disabled={busy} onClick={()=>setCategoryEditor({id:c.id,name:c.name,icon:c.icon ?? DEFAULT_CATEGORY_ICON})}><Pencil size={17}/></button><button className="danger" aria-label={`删除分类 ${c.name}`} disabled={busy} onClick={()=>{if(confirm(`删除分类「${c.name}」？条目将移至未分类。`))void save({categories:vault.categories.filter(x=>x.id!==c.id),entries:vault.entries.map(e=>e.categoryId===c.id?{...e,categoryId:''}:e)},()=>{if(filter===c.id)changeFilter('');});}}><Trash2 size={17}/></button></div>)}</div>}
      {vault.categories.length > 0 && !vault.categories.some(c=>c.name.toLocaleLowerCase().includes(categoryQuery.trim().toLocaleLowerCase())) && <p className="category-list-empty">没有匹配的分类。</p>}
      {!vault.categories.length && <p className="category-list-empty">还没有分类。关闭本窗口后，点击侧边栏的「新建分类」创建。</p>}
    </Modal>}
    {categoryEditor && vault && <Modal error={error} className="modal-compact" title={categoryEditor.id ? '编辑分类' : '新建分类'} icon={categoryEditor.id ? <Pencil size={18}/> : <Folder size={18}/>} close={()=>setCategoryEditor(null)} disabled={busy}>
      {requestClose => (
      <form className="category-form" onSubmit={e=>{e.preventDefault();const name=categoryEditor.name.trim();if(!name)return;if(vault.categories.some(c=>c.id!==categoryEditor.id&&c.name.toLocaleLowerCase()===name.toLocaleLowerCase())){setError('分类名称已存在');return;}void save({...vault,categories:categoryEditor.id?vault.categories.map(c=>c.id===categoryEditor.id?{...c,name,icon:categoryEditor.icon}:c):[...vault.categories,{id:crypto.randomUUID(),name,icon:categoryEditor.icon}]},requestClose);}}>
        <label>分类名称<input autoFocus required maxLength={60} value={categoryEditor.name} onChange={e=>setCategoryEditor({...categoryEditor,name:e.target.value})}/></label>
        <IconPicker value={categoryEditor.icon} onChange={icon=>setCategoryEditor({...categoryEditor,icon})}/>
        <div className="category-form-actions"><button type="button" onClick={requestClose}>取消</button><button className="primary" disabled={busy}>{categoryEditor.id?'保存修改':'创建分类'}</button></div>
      </form>
      )}
    </Modal>}
    {menu && vault && <CategoryMenu anchor={menu.anchor} current={menu.current} categories={vault.categories} onPick={id=>void assignCategory(menu.ids,id)} onCreate={name=>void assignCategory(menu.ids,'',name)} onClose={()=>setMenu(null)}/>}
    {drag && <div ref={ghostRef} className="drag-ghost" aria-hidden="true"><span className="entry-avatar">{drag.label.slice(0,1)}</span><span className="drag-ghost-label">{drag.label}</span></div>}
    {drag && vault && <div className="drag-tray" role="toolbar" aria-label="拖动到分类">
      <span className="drag-tray-label">移至分类</span>
      <div className="drag-tray-chips">
        <button type="button" data-category-drop="" className={`drag-chip unset${dropClass('')}`}><Folder size={14}/><span>未分类</span></button>
        {vault.categories.map(c=><button type="button" key={c.id} data-category-drop={c.id} className={`drag-chip${dropClass(c.id)}`}><CategoryIcon icon={c.icon} size={14}/><span>{c.name}</span></button>)}
      </div>
    </div>}
    {error && <div className="toast error" role="alert"><span>{error}</span><button aria-label="关闭错误" onClick={()=>setError('')}><X size={18}/></button></div>}
    {notice && <div className="toast" role="status">{notice}</div>}
  </>;
}
function AboutPage() {
  return <div className="about">
    <header className="about-head">
      <p className="eyebrow">ABOUT QUIET VAULT</p>
      <h1>简介</h1>
      <p className="about-lede">Quiet Vault 是一个只保存在当前浏览器里的密码保险库。没有账号、没有云端、没有后台服务——主密码和密码数据都不会离开这台设备。</p>
    </header>
    <section className="about-card">
      <div className="about-card-head"><span className="about-icon"><ShieldCheck/></span><div><h2>本地保存，安心掌控</h2><p>条目加密后存放在浏览器的本地存储中，只在输入主密码后于本机解密。</p></div></div>
      <p className="about-warn">浏览器数据可能被清理、覆盖或随设备一起丢失。请定期导出加密备份，在其他设备导入即可继续使用。</p>
    </section>
    <section className="about-card">
      <h2>怎么用</h2>
      <ol className="about-steps">
        <li><div><strong>新增与编辑</strong><span>点击「新增密码」填写名称、账号和密码，可同时选择分类；点条目即可修改，删除也在编辑窗口里。</span></div></li>
        <li><div><strong>搜索与分类</strong><span>顶部搜索框支持名称、账号和分类；拖动条目左侧头像到分类上可快速归类，点条目右侧的分类标签也能修改，「未分类」中还能勾选多条批量归类。</span></div></li>
        <li><div><strong>复制信息</strong><span>点复制按钮会一次性复制名称、账号、密码和备注。粘贴使用后，请记得清理剪贴板。</span></div></li>
        <li><div><strong>备份与迁移</strong><span>「导出备份」会下载一份加密文件；换设备或浏览器时用「导入」选择该文件，再输入主密码即可恢复。</span></div></li>
        <li><div><strong>锁定与解锁</strong><span>只有点击「锁定」才会退出。刷新或重新打开页面会自动恢复本机会话；锁定后必须重新输入主密码。</span></div></li>
      </ol>
    </section>
    <section className="about-card">
      <h2>安全与隐私</h2>
      <ul className="about-list">
        <li><LockKeyhole/><span><strong>端到本地加密 · 无后台服务</strong>：加解密全部在浏览器内完成，数据不会上传到任何服务器。</span></li>
        <li><ShieldCheck/><span><strong>Argon2id + AES-256-GCM</strong>：主密码经 Argon2id 派生密钥，条目使用 AES-256-GCM 加密后再保存。</span></li>
        <li><Upload/><span><strong>备份仍是密文</strong>：导出的文件需要主密码才能打开，可以放心保存到自己的网盘或移动硬盘。</span></li>
        <li><KeyRound/><span><strong>主密码无法找回</strong>：主密码不会被保存，也没有重置入口，请务必牢记。</span></li>
      </ul>
    </section>
    <p className="about-foot">浏览器存储不是备份。定期导出加密文件，是保护密码最稳妥的方式。</p>
  </div>;
}
function ThemeToggle({theme,onToggle}:{theme:Theme;onToggle:()=>void}) {
  const next = theme === 'dark' ? '亮色' : '暗色';
  return <button className="theme-toggle" type="button" onClick={onToggle} aria-label={`切换到${next}主题`} title={`切换到${next}主题`}>{theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>}<span>{next}</span></button>;
}
// 名称字段的自动补全：建议来自已有条目的名称，输入即过滤，支持方向键、回车和 Esc。
function NameCombobox({value,options,onChange}:{value:string;options:string[];onChange:(name:string)=>void}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const comboRef = useRef<HTMLDivElement>(null);
  const matches = matchEntryNames(options, value);
  const visible = open && matches.length > 0;
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!comboRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  useEffect(() => { setActive(-1); }, [value]);
  function choose(name: string) {
    onChange(name); setOpen(false); setActive(-1);
  }
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      if (!visible) return;
      e.preventDefault(); e.stopPropagation();
      setOpen(false); setActive(-1);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!matches.length) return;
      e.preventDefault();
      setOpen(true);
      setActive(current => {
        if (!visible) return e.key === 'ArrowDown' ? 0 : matches.length - 1;
        return e.key === 'ArrowDown' ? (current + 1) % matches.length : (current - 1 + matches.length) % matches.length;
      });
      return;
    }
    if (e.key === 'Enter' && visible && active >= 0 && active < matches.length) {
      e.preventDefault();
      choose(matches[active]);
    }
  }
  return <div className="name-field">
    <label htmlFor="entry-name">名称</label>
    <div className="name-combo" ref={comboRef}>
      <input id="entry-name" autoFocus autoComplete="new-password" maxLength={1000} value={value} role="combobox" aria-expanded={visible} aria-controls="entry-name-options" aria-autocomplete="list" aria-activedescendant={visible && active >= 0 ? `entry-name-option-${active}` : undefined} onChange={e=>{onChange(e.target.value);setOpen(true);}} onFocus={()=>setOpen(true)} onBlur={e=>{if(!comboRef.current?.contains(e.relatedTarget as Node))setOpen(false);}} onKeyDown={handleKeyDown}/>
      {visible && <div className="name-suggest" id="entry-name-options" role="listbox" aria-label="已有名称">
        {matches.map((name,index)=><button type="button" role="option" tabIndex={-1} id={`entry-name-option-${index}`} aria-selected={index===active} className={index===active?'name-option active':'name-option'} key={name} onMouseDown={e=>e.preventDefault()} onMouseEnter={()=>setActive(index)} onClick={()=>choose(name)}><span>{name}</span></button>)}
      </div>}
    </div>
  </div>;
}
function CategoryMenu({anchor,current,categories,onPick,onCreate,onClose}:{anchor:HTMLElement;current?:string;categories:Category[];onPick:(id:string)=>void;onCreate:(name:string)=>void;onClose:()=>void}) {
  const ref = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [place, setPlace] = useState<React.CSSProperties>({ visibility: 'hidden' });
  // 菜单跟随触发按钮：滚动或内容高度变化时重新测量，而不是直接收起。
  const reposition = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const gap = 8, margin = 12;
    const box = anchor.getBoundingClientRect();
    const width = el.offsetWidth, height = el.offsetHeight;
    const left = Math.max(margin, Math.min(box.right - width, innerWidth - width - margin));
    const below = box.bottom + gap;
    setPlace(below + height <= innerHeight - margin ? { left, top: below } : { left, bottom: innerHeight - box.top + gap });
  }, [anchor]);
  useLayoutEffect(reposition, [reposition, query]);
  useEffect(() => {
    // 触发按钮自身不当作外部点击，方便再次点击时收起菜单。
    const outside = (e: PointerEvent) => { const target = e.target as Node; if (ref.current?.contains(target) || anchor.contains(target)) return; onClose(); };
    const escape = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape); window.removeEventListener('scroll', reposition, true); window.removeEventListener('resize', reposition); };
  }, [anchor, onClose, reposition]);
  const q = query.trim();
  const filtered = categories.filter(c => c.name.toLocaleLowerCase().includes(q.toLocaleLowerCase()));
  const canCreate = q.length > 0 && !categories.some(c => c.name.toLocaleLowerCase() === q.toLocaleLowerCase());
  function submit() {
    if (canCreate) onCreate(q);
    else if (filtered.length === 1) onPick(filtered[0].id);
  }
  return <div className="category-menu" ref={ref} style={place} role="group" aria-label="选择分类">
    <input autoFocus className="category-menu-search" aria-label="搜索或新建分类" placeholder="搜索或新建分类…" maxLength={60} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{ if (e.key === 'Enter') { e.preventDefault(); submit(); } }}/>
    <div className="category-menu-list">
      <button type="button" className={current===''?'category-option active':'category-option'} aria-current={current===''||undefined} onClick={()=>onPick('')}><Folder size={15}/><span>未分类</span></button>
      {filtered.map(c=><button type="button" key={c.id} className={current===c.id?'category-option active':'category-option'} aria-current={current===c.id||undefined} onClick={()=>onPick(c.id)}><CategoryIcon icon={c.icon} size={15}/><span>{c.name}</span></button>)}
      {canCreate && <button type="button" className="category-option create" onClick={()=>onCreate(q)}><Plus size={15}/><span>新建分类「{q}」</span></button>}
      {!filtered.length && !canCreate && <p className="category-menu-empty">没有分类。输入名称即可新建。</p>}
    </div>
  </div>;
}
function IconPicker({value,onChange}:{value:string;onChange:(icon:string)=>void}) {
  const [query, setQuery] = useState('');
  const options = searchCategoryIcons(query);
  const iconName = value.slice('lucide:'.length);
  const iconLabel = categoryIconLabel(value);
  return <div className="icon-picker">
    <div className="icon-picker-head">
      <span className="icon-preview" aria-hidden="true"><CategoryIcon icon={value} size={20}/></span>
      <div className="icon-picker-meta"><strong>分类图标</strong><span>{iconLabel === iconName ? iconName : `${iconLabel} · ${iconName}`}</span></div>
      <button type="button" className="icon-random" onClick={()=>onChange(randomCategoryIcon(value))}><Shuffle size={15}/>随机</button>
    </div>
    <input className="icon-search" aria-label="搜索分类图标" placeholder="搜索图标，如 home、工作、邮箱…" maxLength={40} value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')e.preventDefault();}}/>
    <div className="icon-grid" role="group" aria-label="选择分类图标">
      {options.map(option=>{
        const icon = `lucide:${option.name}`;
        return <button type="button" key={option.name} className="icon-choice" aria-label={`使用图标 ${option.label}`} aria-pressed={value===icon} title={`${option.label} · ${option.name}`} onClick={()=>onChange(icon)}><CategoryIcon icon={icon} size={18}/></button>;
      })}
    </div>
    {!options.length && <p className="icon-empty">没有匹配的图标，试试英文名称。</p>}
  </div>;
}
function Modal({title,icon,close,disabled,children,error,className}:{title:string;icon?:React.ReactNode;close:()=>void;disabled:boolean;children:React.ReactNode|((requestClose:()=>void)=>React.ReactNode);error:string;className?:string}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const closeRef = useRef(close);
  closeRef.current = close;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);
  function requestClose() {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
  }
  useEffect(() => {
    if (!closing) return;
    const finish = () => { if (ref.current?.open) ref.current.close(); closeRef.current(); };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { finish(); return; }
    const timer = window.setTimeout(finish, 220);
    return () => clearTimeout(timer);
  }, [closing]);
  return <dialog ref={ref} className={[className, closing ? 'closing' : ''].filter(Boolean).join(' ') || undefined} onCancel={e=>{e.preventDefault();if(!disabledRef.current)requestClose();}} onPointerDown={e=>{
    if (e.target !== e.currentTarget || disabledRef.current) return;
    const box = e.currentTarget.getBoundingClientRect();
    if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) requestClose();
  }}>
    <div className="modal-heading"><div className="modal-title">{icon && <span className="modal-icon">{icon}</span>}<h2>{title}</h2></div><button className="modal-close" type="button" aria-label="关闭弹窗" disabled={disabled} onClick={requestClose}><X size={18}/></button></div>
    <div className="modal-body">{error && <p className="inline-error" role="alert">{error}</p>}{typeof children === 'function' ? children(requestClose) : children}</div>
  </dialog>;
}
createRoot(document.getElementById('root')!).render(<App/>);
