import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ShieldCheck, LockKeyhole, Plus, Search, Download, Upload, Folder, KeyRound, Pencil, Trash2, X, Eye, EyeOff, Copy, ArrowRight, Sun, Moon } from './icons';
import { createVault, openVault, parseEnvelope, seal, masterPasswordProblem, MAX_FILE_SIZE, type Vault, type Entry, type Envelope } from './vault';
import './style.css';
const STORAGE = 'quiet-vault.v1';
const THEME_KEY = 'quiet-vault.theme';
type Session = { key: CryptoKey; vault: Vault; envelope: Envelope };
type Theme = 'light' | 'dark';
function readTheme(): Theme {
  try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'; } catch { return 'light'; }
}
function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#1d1f21' : '#f6f5f1');
}
const initialTheme = readTheme();
applyTheme(initialTheme);
const blankEntry = (): Entry => ({ id: crypto.randomUUID(), title: '', username: '', password: '', url: '', notes: '', categoryId: '', updatedAt: '' });
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
  const [query, setQuery] = useState('');
  const [categoryQuery, setCategoryQuery] = useState('');
  const [editor, setEditor] = useState<Entry | null>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [categoryName, setCategoryName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [startupError, setStartupError] = useState(false);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const fileRef = useRef<HTMLInputElement>(null);
  const version = useRef<string | null>(null);
  const generation = useRef(0);
  function assign(value: Session | null) { sessionRef.current = value; setSession(value); }
  function toggleTheme() { setTheme(value => value === 'dark' ? 'light' : 'dark'); }
  function lock() {
    generation.current++;
    assign(null); setEditor(null); setCategoriesOpen(false); setPassword(''); setConfirmPassword(''); setRevealed(false); setQuery(''); setCategoryQuery(''); setCategoryName(''); setCategoryId(''); setPending(null); setFilter('*');
  }
  useEffect(() => {
    try { const raw = localStorage.getItem(STORAGE); version.current = raw; if (raw) setStored(parseEnvelope(raw)); if (!crypto.subtle) setError('当前环境不支持 Web Crypto。请通过 HTTPS 或本机 localhost 打开。'); }
    catch { setStartupError(true); setError('无法读取浏览器保险库。请保留原始数据并导入备份；不要清理浏览器存储。'); }
    const changed = (e: StorageEvent) => {
      if (e.key !== STORAGE && e.key !== null) return;
      lock();
      try { const raw = localStorage.getItem(STORAGE); version.current = raw; setStored(raw ? parseEnvelope(raw) : null); setStartupError(false); setError('另一个标签页已更新保险库，请重新解锁。'); }
      catch { setStartupError(true); setError('另一个标签页写入了无法读取的数据，请导入备份。'); }
    };
    const hide = () => { if (document.hidden && (sessionRef.current || busyRef.current)) lock(); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('storage', changed);
    return () => { window.removeEventListener('storage', changed); document.removeEventListener('visibilitychange', hide); };
  }, []);
  useEffect(() => {
    if (!session) return;
    let timer = window.setTimeout(lock, 5 * 60 * 1000);
    const reset = () => { clearTimeout(timer); timer = window.setTimeout(lock, 5 * 60 * 1000); };
    window.addEventListener('pointerdown', reset); window.addEventListener('keydown', reset);
    return () => { clearTimeout(timer); window.removeEventListener('pointerdown', reset); window.removeEventListener('keydown', reset); };
  }, [!!session]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(timer); }, [notice]);
  useEffect(() => { applyTheme(theme); try { localStorage.setItem(THEME_KEY, theme); } catch {} }, [theme]);
  async function run(task: (token: number) => Promise<void>) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setError('');
    const token = generation.current;
    try { await task(token); } catch (e) { if (token === generation.current) setError(e instanceof Error ? e.message : '操作失败，请重试'); }
    finally { busyRef.current = false; setBusy(false); }
  }
  async function persist(next: Session, token: number) {
    if (!navigator.locks) throw new Error('当前浏览器不支持安全的多标签页保存，请更新浏览器');
    return navigator.locks.request(STORAGE, () => {
      if (document.hidden) { lock(); return false; }
      if (token !== generation.current) return false;
      // Compare immediately before writing: stale tabs must never silently overwrite a newer vault.
      if (localStorage.getItem(STORAGE) !== version.current) { lock(); setError('保险库已在其他标签页改变，请刷新后重新解锁'); return false; }
      const raw = JSON.stringify(next.envelope);
      try { localStorage.setItem(STORAGE, raw); } catch { throw new Error('浏览器保存失败（存储已满或被禁用），此次更改未保存'); }
      version.current = raw; setStored(next.envelope); assign(next); setStartupError(false); return true;
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
  async function importFile(file?: File) {
    if (!file || busyRef.current) return;
    await run(async token => {
      if (file.size > MAX_FILE_SIZE) throw new Error('文件不能超过 5 MB');
      const envelope = parseEnvelope(await file.text());
      if (token !== generation.current) return;
      lock(); setPending(envelope); setNotice('请输入导入文件的主密码；解锁成功前不会替换现有数据');
    });
  }
  function exportFile() {
    const envelope = sessionRef.current?.envelope ?? stored;
    if (!envelope) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(envelope)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `quiet-vault-${new Date().toISOString().replaceAll(':','-')}.qvault`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('已请求下载密文备份，请确认文件已保存');
  }
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); setNotice('已复制。使用后请清理剪贴板'); } catch { setError('无法访问剪贴板，请显示后手动复制'); } }
  const vault = session?.vault;
  const selected = filter === '*' ? '所有密码' : filter === '' ? '未分类' : vault?.categories.find(c => c.id === filter)?.name ?? '所有密码';
  const entries = vault?.entries.filter(e => (filter === '*' || e.categoryId === filter) && [e.title,e.username,e.url,e.notes,vault.categories.find(c=>c.id===e.categoryId)?.name ?? '未分类'].join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? [];
  return <>
    <input ref={fileRef} type="file" accept=".qvault,.json,application/json" hidden onChange={e => { void importFile(e.target.files?.[0]); e.target.value = ''; }}/>
    {!session ? <main className="gate">
      <div className="gate-top"><div className="gate-brand"><ShieldCheck size={30}/><span>quiet vault<span className="brand-dot">.</span></span></div><ThemeToggle theme={theme} onToggle={toggleTheme}/></div>
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
      <aside><a className="brand" href="#"><ShieldCheck/><span>quiet vault<span className="brand-dot">.</span></span></a><div className="workspace-label">个人空间 <span>LOCAL</span></div>
        <nav aria-label="密码分类"><button className={filter==='*'?'nav-item active':'nav-item'} onClick={()=>setFilter('*')}><KeyRound size={19}/>所有密码<span>{vault!.entries.length}</span></button>
          <div className="category-heading">分类<button aria-label="管理分类" onClick={()=>setCategoriesOpen(true)}><Plus size={17}/></button></div>
          <input className="category-search" aria-label="搜索分类" placeholder="查找分类…" value={categoryQuery} onChange={e=>setCategoryQuery(e.target.value)}/>
          {vault!.categories.filter(c=>c.name.toLocaleLowerCase().includes(categoryQuery.toLocaleLowerCase())).map(c=><button className={filter===c.id?'nav-item active':'nav-item'} key={c.id} onClick={()=>setFilter(c.id)}><Folder size={18}/>{c.name}<span>{vault!.entries.filter(e=>e.categoryId===c.id).length}</span></button>)}
          <button className={filter===''?'nav-item active':'nav-item'} onClick={()=>setFilter('')}><Folder size={18}/>未分类<span>{vault!.entries.filter(e=>!e.categoryId).length}</span></button>
        </nav><div className="aside-bottom"><div className="local-badge"><span/>本地保险库</div><p>数据只属于你。<br/>记得为它留一份备份。</p><button onClick={()=>setCategoriesOpen(true)}><Pencil size={16}/>管理分类</button></div>
      </aside>
      <main className="workspace"><header><div className="breadcrumb">个人保险库 <span>/</span> {selected}</div><div className="header-actions"><ThemeToggle theme={theme} onToggle={toggleTheme}/><button onClick={()=>setCategoriesOpen(true)} disabled={busy}><Folder size={16}/>分类</button><button onClick={lock} disabled={busy}><LockKeyhole size={16}/>锁定</button></div></header>
        <div className="content"><div className="page-heading"><div><p className="eyebrow">PRIVATE BY DESIGN</p><h1>{selected}<span>{entries.length}</span></h1><p className="muted">把重要的登录信息，安心放在这里。</p></div><button className="primary" disabled={busy} onClick={()=>{setEditor({...blankEntry(),categoryId:filter==='*'?'':filter});setRevealed(false);}}><Plus size={18}/>新增密码</button></div>
          <div className="toolbar"><div className="search"><Search size={19}/><input aria-label="搜索密码" placeholder="搜索名称、账号、网址或备注…" value={query} onChange={e=>setQuery(e.target.value)}/></div><div className="file-actions"><button disabled={busy} onClick={()=>fileRef.current?.click()}><Upload size={17}/>导入</button><button disabled={busy} onClick={exportFile}><Download size={17}/>导出备份</button></div></div>
          <div className="save-status"><span/><span>{busy ? '正在加密保存…':'所有更改已加密保存在此浏览器'}</span><span className="sort-note">按名称排序</span></div>
          <section className="entry-list" aria-label="密码列表">{entries.length ? entries.sort((a,b)=>a.title.localeCompare(b.title)).map(e=><article className="entry" key={e.id}><time className="entry-date" dateTime={e.updatedAt} title={`更新时间：${e.updatedAt}`} aria-label={`更新时间：${e.updatedAt}`}>{/^\d{4}-\d{2}-\d{2}/.test(e.updatedAt) ? e.updatedAt.slice(0,10) : '—'}</time><button className="entry-main" onClick={()=>{setEditor({...e});setRevealed(false);}}><strong>{e.title}</strong><span>{e.username || e.url || '未填写账号'}</span></button><span className="tag">{vault!.categories.find(c=>c.id===e.categoryId)?.name ?? '未分类'}</span><button className="icon-button" aria-label={`复制 ${e.title} 密码`} onClick={()=>void copy(e.password)}><Copy size={18}/></button><button className="icon-button" aria-label={`编辑 ${e.title}`} onClick={()=>{setEditor({...e});setRevealed(false);}}><Pencil size={17}/></button></article>) : <div className="empty"><div className="empty-icon"><KeyRound size={30}/></div><h2>{query ? '没有匹配的密码' : '从第一个密码开始'}</h2><p>{query ? '试试其他关键词，或选择其他分类。' : '添加登录信息，或导入已有的加密备份。'}</p>{!query && <button onClick={()=>{setEditor({...blankEntry(),categoryId:filter==='*'?'':filter});setRevealed(false);}}><Plus size={17}/>添加密码</button>}</div>}</section>
          <div className="backup-note"><ShieldCheck size={22}/><div><strong>本地保存，安心掌控</strong><p>浏览器数据可能被清理。定期导出加密备份，在其他设备导入即可继续使用。</p></div><button onClick={exportFile} disabled={busy}>备份保险库<ArrowRight size={17}/></button></div>
          <footer><span><LockKeyhole size={13}/>端到本地加密 · 无后台服务</span><span>切到后台会丢弃未保存表单 · 闲置 5 分钟锁定</span></footer>
        </div>
      </main>
    </div>}
    {editor && vault && <Modal error={error} title={vault.entries.some(e=>e.id===editor.id)?'编辑密码':'新增密码'} close={()=>setEditor(null)} disabled={busy}>
      <form onSubmit={e=>{e.preventDefault();const next={...editor,title:editor.title.trim(),updatedAt:new Date().toISOString()};if(!next.title)return;void save({...vault,entries:[...vault.entries.filter(x=>x.id!==next.id),next]},()=>setEditor(null));}}>
        <label>名称<input autoFocus required maxLength={200} value={editor.title} onChange={e=>setEditor({...editor,title:e.target.value})}/></label>
        <label>账号<input autoComplete="off" maxLength={1000} value={editor.username} onChange={e=>setEditor({...editor,username:e.target.value})}/></label>
        <label htmlFor="entry-password">密码</label><div className="password-field"><input id="entry-password" required type={revealed?'text':'password'} autoComplete="new-password" maxLength={4096} value={editor.password} onChange={e=>setEditor({...editor,password:e.target.value})}/><button type="button" aria-label={revealed?'隐藏密码':'显示密码'} onClick={()=>setRevealed(!revealed)}>{revealed?<EyeOff size={18}/>:<Eye size={18}/>}</button><button type="button" aria-label="复制密码" onClick={()=>void copy(editor.password)}><Copy size={18}/></button></div>
        <label>网址<input placeholder="https://example.com" maxLength={2000} value={editor.url} onChange={e=>setEditor({...editor,url:e.target.value})}/></label>
        <label>分类<select value={editor.categoryId} onChange={e=>setEditor({...editor,categoryId:e.target.value})}><option value="">未分类</option>{vault.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>备注<textarea rows={3} maxLength={10000} value={editor.notes} onChange={e=>setEditor({...editor,notes:e.target.value})}/></label>
        <div className="modal-actions">{vault.entries.some(e=>e.id===editor.id) && <button className="danger" type="button" disabled={busy} onClick={()=>{if(confirm('删除此密码条目？此操作无法撤销。'))void save({...vault,entries:vault.entries.filter(e=>e.id!==editor.id)},()=>setEditor(null));}}><Trash2 size={16}/>删除</button>}<button className="primary" disabled={busy}>加密保存</button></div>
      </form>
    </Modal>}
    {categoriesOpen && vault && <Modal error={error} title="管理分类" close={()=>{setCategoriesOpen(false);setCategoryName('');setCategoryId('');}} disabled={busy}>
      <p className="muted">删除分类时，密码条目将移至「未分类」。</p><form onSubmit={e=>{e.preventDefault();const name=categoryName.trim();if(!name)return;if(vault.categories.some(c=>c.id!==categoryId&&c.name.toLocaleLowerCase()===name.toLocaleLowerCase())){setError('分类名称已存在');return;}void save({...vault,categories:categoryId?vault.categories.map(c=>c.id===categoryId?{...c,name}:c):[...vault.categories,{id:crypto.randomUUID(),name}]},()=>{setCategoryName('');setCategoryId('');});}}><label>{categoryId?'编辑分类名称':'新分类名称'}<input required maxLength={60} value={categoryName} onChange={e=>setCategoryName(e.target.value)}/></label><button className="primary" disabled={busy}>{categoryId?'保存分类':'添加分类'}</button>{categoryId&&<button type="button" onClick={()=>{setCategoryId('');setCategoryName('');}}>取消编辑</button>}</form>
      <label>查找分类<input value={categoryQuery} onChange={e=>setCategoryQuery(e.target.value)} placeholder="输入分类名称…"/></label><div className="category-list">{vault.categories.filter(c=>c.name.toLocaleLowerCase().includes(categoryQuery.toLocaleLowerCase())).map(c=><div key={c.id}><Folder size={17}/><span>{c.name}</span><button aria-label={`编辑分类 ${c.name}`} disabled={busy} onClick={()=>{setCategoryName(c.name);setCategoryId(c.id);}}><Pencil size={17}/></button><button className="danger" aria-label={`删除分类 ${c.name}`} disabled={busy} onClick={()=>{if(confirm(`删除分类「${c.name}」？条目将移至未分类。`))void save({categories:vault.categories.filter(x=>x.id!==c.id),entries:vault.entries.map(e=>e.categoryId===c.id?{...e,categoryId:''}:e)},()=>{if(filter===c.id)setFilter('');if(categoryId===c.id){setCategoryId('');setCategoryName('');}});}}><Trash2 size={17}/></button></div>)}</div>
    </Modal>}
    {error && <div className="toast error" role="alert"><span>{error}</span><button aria-label="关闭错误" onClick={()=>setError('')}><X size={18}/></button></div>}
    {notice && <div className="toast" role="status">{notice}</div>}
  </>;
}
function ThemeToggle({theme,onToggle}:{theme:Theme;onToggle:()=>void}) {
  const next = theme === 'dark' ? '亮色' : '暗色';
  return <button className="theme-toggle" type="button" onClick={onToggle} aria-label={`切换到${next}主题`} title={`切换到${next}主题`}>{theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>}<span>{next}</span></button>;
}
function Modal({title,close,disabled,children,error}:{title:string;close:()=>void;disabled:boolean;children:React.ReactNode;error:string}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(()=>{ref.current?.showModal();},[]);
  return <dialog ref={ref} onCancel={e=>{e.preventDefault();if(!disabled)close();}}><div className="modal-heading"><h2>{title}</h2><button aria-label="关闭弹窗" disabled={disabled} onClick={close}><X size={21}/></button></div>{error && <p className="inline-error" role="alert">{error}</p>}{children}</dialog>;
}
createRoot(document.getElementById('root')!).render(<App/>);
