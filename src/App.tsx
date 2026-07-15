import { type FormEvent, type ReactNode, useMemo, useState } from 'react'
import './App.css'

type Product = {
  id: string
  name: string
  sku: string
  category: string
  color: string
  quantity: number
  rack: string
  minimum: number
  updatedAt: string
  updatedBy: string
}

type Movement = {
  id: string
  product: string
  sku: string
  type: 'Stock In' | 'Stock Out'
  quantity: number
  by: string
  remarks: string
  date: string
}

const initialProducts: Product[] = [
  { id: '1', name: 'Velvet Blackout — Sand', sku: 'VBL-SND-001', category: 'Blackout', color: 'Sand', quantity: 8, rack: 'A-01', minimum: 10, updatedAt: 'Today, 10:42 AM', updatedBy: 'Riya' },
  { id: '2', name: 'Linen Sheer — Ivory', sku: 'LSH-IVR-014', category: 'Sheer', color: 'Ivory', quantity: 42, rack: 'B-04', minimum: 12, updatedAt: 'Today, 9:16 AM', updatedBy: 'Riya' },
  { id: '3', name: 'Jacquard Floral — Moss', sku: 'JFL-MOS-022', category: 'Designer', color: 'Moss', quantity: 6, rack: 'C-02', minimum: 8, updatedAt: 'Yesterday, 4:20 PM', updatedBy: 'Arjun' },
  { id: '4', name: 'Cotton Duck — Stone', sku: 'CDK-STN-008', category: 'Plain', color: 'Stone', quantity: 31, rack: 'A-05', minimum: 10, updatedAt: 'Yesterday, 3:05 PM', updatedBy: 'Riya' },
]

const initialMovements: Movement[] = [
  { id: 'm1', product: 'Velvet Blackout — Sand', sku: 'VBL-SND-001', type: 'Stock Out', quantity: 4, by: 'Riya', remarks: 'Walk-in customer', date: 'Today, 10:42 AM' },
  { id: 'm2', product: 'Linen Sheer — Ivory', sku: 'LSH-IVR-014', type: 'Stock In', quantity: 24, by: 'Riya', remarks: 'Supplier delivery', date: 'Today, 9:16 AM' },
  { id: 'm3', product: 'Jacquard Floral — Moss', sku: 'JFL-MOS-022', type: 'Stock Out', quantity: 2, by: 'Arjun', remarks: 'Order #1842', date: 'Yesterday, 4:20 PM' },
]

const nowLabel = () => new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date())

function App() {
  const [products, setProducts] = useState(initialProducts)
  const [movements, setMovements] = useState(initialMovements)
  const [page, setPage] = useState<'dashboard' | 'products' | 'history'>('dashboard')
  const [username, setUsername] = useState('Riya')
  const [search, setSearch] = useState('')
  const [showMovement, setShowMovement] = useState(false)
  const [showProduct, setShowProduct] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [notice, setNotice] = useState('')

  const lowStock = products.filter((product) => product.quantity <= product.minimum)
  const totalStock = products.reduce((sum, product) => sum + product.quantity, 0)
  const filtered = products.filter((product) => `${product.name} ${product.sku} ${product.category} ${product.rack}`.toLowerCase().includes(search.toLowerCase()))

  const recordMovement = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const productId = String(data.get('product'))
    const type = String(data.get('type')) as Movement['type']
    const quantity = Number(data.get('quantity'))
    const remarks = String(data.get('remarks') || '')
    const product = products.find((item) => item.id === productId)
    if (!product || !Number.isInteger(quantity) || quantity <= 0) return setNotice('Enter a valid quantity.')
    if (type === 'Stock Out' && quantity > product.quantity) return setNotice(`Only ${product.quantity} items are available for ${product.name}.`)
    const date = nowLabel()
    const updated = products.map((item) => item.id === product.id ? { ...item, quantity: type === 'Stock In' ? item.quantity + quantity : item.quantity - quantity, updatedAt: date, updatedBy: username || 'Unknown user' } : item)
    setProducts(updated)
    setMovements([{ id: crypto.randomUUID(), product: product.name, sku: product.sku, type, quantity, by: username || 'Unknown user', remarks, date }, ...movements])
    setShowMovement(false)
    setNotice(`${type} recorded successfully.`)
  }

  const addProduct = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const sku = String(data.get('sku')).trim().toUpperCase()
    if (products.some((product) => product.sku === sku)) return setNotice('That SKU already exists. Use a unique SKU.')
    const quantity = Number(data.get('quantity'))
    const date = nowLabel()
    setProducts([{ id: crypto.randomUUID(), name: String(data.get('name')), sku, category: String(data.get('category')), color: String(data.get('color')), quantity, rack: String(data.get('rack')), minimum: Number(data.get('minimum')), updatedAt: date, updatedBy: username || 'Admin' }, ...products])
    setShowProduct(false)
    setNotice('Product added successfully.')
  }

  const content = useMemo(() => {
    if (page === 'history') return <History movements={movements} />
    if (page === 'products') return <Products products={filtered} search={search} setSearch={setSearch} />
    return <Dashboard products={products} movements={movements} lowStock={lowStock} totalStock={totalStock} onViewLow={() => setPage('products')} />
  }, [page, products, movements, filtered, search, lowStock, totalStock])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">P</div><div><strong>The Parda</strong><span>Inventory portal</span></div></div>
        <nav aria-label="Main navigation">
          <Nav active={page === 'dashboard'} icon="▦" label="Dashboard" onClick={() => setPage('dashboard')} />
          <Nav active={page === 'products'} icon="◫" label="Products" onClick={() => setPage('products')} />
          <Nav active={page === 'history'} icon="◷" label="Transaction history" onClick={() => setPage('history')} />
        </nav>
        <div className="sidebar-bottom"><button className="settings" onClick={() => setAdminOpen(true)}>⚙ <span>Admin settings</span></button><div className="user-card"><div className="avatar">{username.slice(0, 1).toUpperCase() || 'U'}</div><div><b>{username || 'User'}</b><small>Staff member</small></div></div></div>
      </aside>
      <main>
        <header><div><p className="eyebrow">CURTAIN STORE · INVENTORY</p><h1>{page === 'dashboard' ? 'Good morning, Riya' : page === 'products' ? 'Products' : 'Transaction history'}</h1><p className="subhead">{page === 'dashboard' ? 'Here is the latest overview of your stock.' : page === 'products' ? 'Find and check every SKU in your store.' : 'A complete record of every stock movement.'}</p></div><div className="header-actions"><label className="username">Logged in as <input value={username} onChange={(event) => setUsername(event.target.value)} aria-label="Staff username" /></label><button className="button secondary" onClick={() => setShowMovement(true)}>↕ Record movement</button><button className="button primary" onClick={() => setShowProduct(true)}>＋ Add product</button></div></header>
        <div className="demo-banner"><b>Demo mode</b><span>Sample inventory only — changes are not shared until Supabase is connected.</span></div>
        {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss message">×</button></div>}
        {content}
      </main>
      {showMovement && <Modal title="Record stock movement" onClose={() => setShowMovement(false)}><form className="form" onSubmit={recordMovement}><label>Product<select name="product" required>{products.map((product) => <option key={product.id} value={product.id}>{product.name} · {product.sku} ({product.quantity} in stock)</option>)}</select></label><div className="form-grid"><label>Movement type<select name="type"><option>Stock In</option><option>Stock Out</option></select></label><label>Quantity<input name="quantity" type="number" min="1" required /></label></div><label>Remarks <span>optional</span><textarea name="remarks" placeholder="e.g. Supplier delivery or order number" /></label><button className="button primary full" type="submit">Save movement</button></form></Modal>}
      {showProduct && <Modal title="Add new product" onClose={() => setShowProduct(false)}><form className="form" onSubmit={addProduct}><div className="form-grid"><label>Product name<input name="name" required /></label><label>SKU<input name="sku" placeholder="e.g. VBL-SND-001" required /></label><label>Category<input name="category" placeholder="e.g. Blackout" required /></label><label>Color<input name="color" required /></label><label>Opening quantity<input name="quantity" type="number" min="0" required /></label><label>Rack number<input name="rack" placeholder="e.g. A-01" required /></label><label>Minimum stock<input name="minimum" type="number" min="0" required /></label></div><button className="button primary full" type="submit">Add product</button></form></Modal>}
      {adminOpen && <Modal title="Admin settings" onClose={() => setAdminOpen(false)}><p className="setup-copy">In the production version, this section is restricted to the Supabase Auth owner account. The database migration included with this project enforces the same rule.</p><label className="form">Admin email<input placeholder="owner@example.com" /><button className="button primary full" onClick={() => { setAdminOpen(false); setNotice('Connect Supabase to enable admin sign-in.') }}>Save settings</button></label></Modal>}
    </div>
  )
}

function Nav({ active, icon, label, onClick }: { active: boolean; icon: string; label: string; onClick: () => void }) { return <button className={`nav-item ${active ? 'active' : ''}`} onClick={onClick}><span>{icon}</span>{label}</button> }
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) { return <div className="modal-backdrop" role="presentation"><section className="modal" role="dialog" aria-modal="true" aria-label={title}><div className="modal-title"><h2>{title}</h2><button onClick={onClose} aria-label="Close">×</button></div>{children}</section></div> }
function Dashboard({ products, movements, lowStock, totalStock, onViewLow }: { products: Product[]; movements: Movement[]; lowStock: Product[]; totalStock: number; onViewLow: () => void }) { return <><section className="metrics"><Metric label="Total products" value={products.length} icon="▣" /><Metric label="Total stock quantity" value={totalStock} icon="◫" /><Metric label="Low stock products" value={lowStock.length} icon="!" danger /><Metric label="Last updated" value={movements[0]?.date || '—'} icon="◷" text /></section>{lowStock.length > 0 && <section className="low-alert"><div className="alert-icon">!</div><div><b>Low stock needs your attention</b><p>{lowStock.length} products are at or below their minimum stock level.</p></div><button onClick={onViewLow}>View low stock <span>→</span></button></section>}<section className="two-col"><div className="panel"><div className="panel-heading"><div><h2>Recent transactions</h2><p>Latest stock activity</p></div><button className="text-button" onClick={() => onViewLow()}>View all</button></div><div className="transactions">{movements.slice(0, 4).map((movement) => <div className="transaction" key={movement.id}><div className={`movement-icon ${movement.type === 'Stock In' ? 'in' : 'out'}`}>{movement.type === 'Stock In' ? '↓' : '↑'}</div><div className="transaction-detail"><b>{movement.product}</b><span>{movement.sku} · {movement.by}</span></div><div className="transaction-amount"><b className={movement.type === 'Stock In' ? 'positive' : 'negative'}>{movement.type === 'Stock In' ? '+' : '−'}{movement.quantity}</b><span>{movement.date}</span></div></div>)}</div></div><div className="panel stock-panel"><div className="panel-heading"><div><h2>Low stock</h2><p>Products below minimum level</p></div><button className="text-button" onClick={onViewLow}>View all</button></div>{lowStock.map((product) => <div className="low-row" key={product.id}><div><b>{product.name}</b><span>{product.sku} · Rack {product.rack}</span></div><div><b>{product.quantity} left</b><span>Min. {product.minimum}</span></div></div>)}</div></section></> }
function Metric({ label, value, icon, danger, text }: { label: string; value: string | number; icon: string; danger?: boolean; text?: boolean }) { return <div className="metric"><div className={`metric-icon ${danger ? 'danger' : ''}`}>{icon}</div><div><span>{label}</span><strong className={text ? 'date-value' : ''}>{value}</strong></div></div> }
function Products({ products, search, setSearch }: { products: Product[]; search: string; setSearch: (value: string) => void }) { return <section className="panel products-panel"><div className="table-tools"><label className="search">⌕ <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, SKU, category or rack" /></label><span>{products.length} products</span></div><div className="table-wrap"><table><thead><tr><th>Product</th><th>SKU</th><th>Category</th><th>Rack</th><th>Stock</th><th>Last updated</th></tr></thead><tbody>{products.map((product) => <tr key={product.id}><td><b>{product.name}</b><span>{product.color}</span></td><td><code>{product.sku}</code></td><td>{product.category}</td><td>{product.rack}</td><td><span className={`stock-pill ${product.quantity <= product.minimum ? 'low' : ''}`}>{product.quantity} / min {product.minimum}</span></td><td>{product.updatedAt}<span>by {product.updatedBy}</span></td></tr>)}</tbody></table></div></section> }
function History({ movements }: { movements: Movement[] }) { return <section className="panel products-panel"><div className="table-tools"><b>All movements</b><span>{movements.length} transactions</span></div><div className="table-wrap"><table><thead><tr><th>Date & time</th><th>Product</th><th>Type</th><th>Quantity</th><th>Updated by</th><th>Remarks</th></tr></thead><tbody>{movements.map((movement) => <tr key={movement.id}><td>{movement.date}</td><td><b>{movement.product}</b><span>{movement.sku}</span></td><td><span className={`type-pill ${movement.type === 'Stock In' ? 'in' : 'out'}`}>{movement.type}</span></td><td><b>{movement.quantity}</b></td><td>{movement.by}</td><td>{movement.remarks || '—'}</td></tr>)}</tbody></table></div></section> }

export default App
