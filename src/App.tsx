import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import './App.css'

// ── DB row shapes ──────────────────────────────────────────────────────────────

type DbProduct = {
  id: string
  name: string
  sku: string
  category: string
  color: string
  quantity: number
  minimum_stock_level: number
  notes: string | null
  updated_at: string
  updated_by: string
  created_at: string
}

type DbProductRack = {
  id: string
  product_id: string
  rack_number: string
  quantity: number
}

type DbTransaction = {
  id: string
  product_id: string
  rack_number: string
  movement_type: 'stock_in' | 'stock_out'
  quantity: number
  updated_by: string
  remarks: string | null
  created_at: string
  products: { name: string; sku: string } | null
}

type DbStaff = {
  id: string
  name: string
  active: boolean
  created_at: string
}

type Profile = {
  display_name: string
  role: 'admin' | 'staff'
}

// ── Normalised UI shapes ───────────────────────────────────────────────────────

type ProductRack = {
  id: string
  rackNumber: string
  quantity: number
}

type Product = {
  id: string
  name: string
  sku: string
  category: string
  color: string
  quantity: number
  minimum: number
  updatedAt: string
  updatedBy: string
  racks: ProductRack[]
}

type StockUpdate = {
  id: string
  product: string
  sku: string
  rack: string
  type: 'Stock In' | 'Stock Out'
  quantity: number
  by: string
  remarks: string
  date: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))

const STAFF_NAME_KEY = 'parda_staff_name'

function loadStoredStaffName(): string {
  try {
    return localStorage.getItem(STAFF_NAME_KEY) ?? ''
  } catch {
    return ''
  }
}

function saveStoredStaffName(name: string) {
  try {
    localStorage.setItem(STAFF_NAME_KEY, name)
  } catch {
    // ignore
  }
}

function clearStoredStaffName() {
  try {
    localStorage.removeItem(STAFF_NAME_KEY)
  } catch {
    // ignore
  }
}

function toProduct(row: DbProduct, racks: DbProductRack[]): Product {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    category: row.category,
    color: row.color,
    quantity: row.quantity,
    minimum: row.minimum_stock_level,
    updatedAt: fmtDate(row.updated_at),
    updatedBy: row.updated_by,
    racks: racks.map((r) => ({
      id: r.id,
      rackNumber: r.rack_number,
      quantity: r.quantity,
    })),
  }
}

function toStockUpdate(row: DbTransaction): StockUpdate {
  return {
    id: row.id,
    product: row.products?.name ?? '(deleted)',
    sku: row.products?.sku ?? '—',
    rack: row.rack_number,
    type: row.movement_type === 'stock_in' ? 'Stock In' : 'Stock Out',
    quantity: row.quantity,
    by: row.updated_by,
    remarks: row.remarks ?? '',
    date: fmtDate(row.created_at),
  }
}

// ── Login screen ───────────────────────────────────────────────────────────────

function LoginScreen({ onNotice }: { onNotice: (msg: string) => void }) {
  const [loading, setLoading] = useState(false)
  const [loginMode, setLoginMode] = useState<'staff' | 'owner'>('staff')

  const handleStaffLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) {
      return onNotice(
        'Supabase client not initialised — check environment variables.',
      )
    }
    const formData = new FormData(event.currentTarget)
    const username = String(formData.get('username')).trim()

    if (!username) {
      return onNotice('Enter your username.')
    }

    setLoading(true)

    // Step 1: sign in anonymously
    const { error: anonError } = await supabase.auth.signInAnonymously()
    if (anonError) {
      setLoading(false)
      return onNotice(anonError.message)
    }

    // Step 2: validate username against staff roster (case-insensitive)
    const { data: staffRows, error: staffError } = await supabase
      .from('staff')
      .select('name, active')
      .ilike('name', username)

    if (staffError) {
      await supabase.auth.signOut()
      setLoading(false)
      return onNotice(staffError.message)
    }

    const activeRow = staffRows?.find((s: { name: string; active: boolean }) => s.active === true)

    if (!activeRow) {
      await supabase.auth.signOut()
      setLoading(false)
      return onNotice(
        `No active staff member named "${username}". Ask the owner to add you under Users.`,
      )
    }

    // Step 3: persist the canonical staff name and proceed
    saveStoredStaffName(activeRow.name)
    setLoading(false)
  }

  const handleOwnerLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) {
      return onNotice(
        'Supabase client not initialised — check environment variables.',
      )
    }
    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email')).trim()
    const password = String(formData.get('password'))
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    setLoading(false)
    if (error) onNotice(error.message)
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand login-brand">
          <div className="brand-mark">P</div>
          <div>
            <strong>The Parda</strong>
            <span>Inventory portal</span>
          </div>
        </div>
        <h2 className="login-heading">Sign in to continue</h2>

        {/* Sign-in-as selector */}
        <div className="login-mode-row">
          <label htmlFor="login-mode-select" className="login-mode-label">
            Sign in as
          </label>
          <select
            id="login-mode-select"
            className="login-mode-select"
            value={loginMode}
            onChange={(e) => setLoginMode(e.target.value as 'staff' | 'owner')}
          >
            <option value="staff">Staff</option>
            <option value="owner">Owner</option>
          </select>
        </div>

        {loginMode === 'staff' ? (
          <form className="form" onSubmit={(e) => { void handleStaffLogin(e) }}>
            <label>
              Username
              <input
                name="username"
                type="text"
                autoComplete="username"
                required
                placeholder="Your name as registered"
              />
            </label>
            <button
              className="button primary full"
              type="submit"
              disabled={loading}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : (
          <form className="form" onSubmit={(e) => { void handleOwnerLogin(e) }}>
            <label>
              Email
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
              />
            </label>
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                placeholder="••••••••"
              />
            </label>
            <button
              className="button primary full"
              type="submit"
              disabled={loading}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

// ── Main app ───────────────────────────────────────────────────────────────────

type PageKey = 'dashboard' | 'products' | 'history' | 'users' | 'add-product' | 'all-products'

function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [stockUpdates, setStockUpdates] = useState<StockUpdate[]>([])
  const [staff, setStaff] = useState<DbStaff[]>([])
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [page, setPage] = useState<PageKey>('dashboard')
  const [search, setSearch] = useState('')
  const [showUpdate, setShowUpdate] = useState(false)
  const [notice, setNotice] = useState('')

  // ── Auth ──────────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!supabase) {
      setSession(null)
      return
    }
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, newSession) => {
        setSession(newSession)
      },
    )
    return () => listener.subscription.unsubscribe()
  }, [])

  // ── Profile ───────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!session || !supabase) {
      setProfile(null)
      return
    }
    supabase
      .from('profiles')
      .select('display_name, role')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error }) => {
        if (error || !data) {
          setProfile(null)
          return
        }
        setProfile({
          display_name: data.display_name as string,
          role: data.role as 'admin' | 'staff',
        })
      })
  }, [session])

  // ── Identity resolution ───────────────────────────────────────────────────────

  // isAdmin: profile exists and role === 'admin'
  // identityName: profile.display_name for admin, localStorage staff name for anon staff
  const isAdmin = profile?.role === 'admin'
  const identityName: string = isAdmin
    ? (profile?.display_name ?? session?.user?.email ?? 'Owner')
    : (loadStoredStaffName() || session?.user?.email || 'Staff')

  // ── Data fetch ────────────────────────────────────────────────────────────────

  const fetchAll = async () => {
    if (!supabase || !session) return
    setLoading(true)
    setFetchError('')

    const [prodRes, racksRes, txRes, staffRes] = await Promise.all([
      supabase.from('products').select('*').order('name'),
      supabase.from('product_racks').select('*'),
      supabase
        .from('stock_transactions')
        .select('*, products(name, sku)')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('staff')
        .select('*')
        .eq('active', true)
        .order('name'),
    ])

    setLoading(false)

    if (prodRes.error) { setFetchError(prodRes.error.message); return }
    if (racksRes.error) { setFetchError(racksRes.error.message); return }
    if (txRes.error) { setFetchError(txRes.error.message); return }
    if (staffRes.error) { setFetchError(staffRes.error.message); return }

    const racksData = racksRes.data as DbProductRack[]
    const racksByProduct: Record<string, DbProductRack[]> = {}
    for (const r of racksData) {
      if (!racksByProduct[r.product_id]) racksByProduct[r.product_id] = []
      racksByProduct[r.product_id].push(r)
    }

    setProducts(
      (prodRes.data as DbProduct[]).map((p) =>
        toProduct(p, racksByProduct[p.id] ?? []),
      ),
    )
    setStockUpdates(
      (txRes.data as unknown as DbTransaction[]).map(toStockUpdate),
    )
    setStaff(staffRes.data as DbStaff[])
  }

  useEffect(() => {
    void fetchAll()
  }, [session]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived ───────────────────────────────────────────────────────────────────

  const lowStock = products.filter((p) => p.quantity <= p.minimum)
  const totalStock = products.reduce((sum, p) => sum + p.quantity, 0)
  const filtered = products.filter((p) =>
    `${p.name} ${p.sku} ${p.category}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  )

  // ── Sign out ──────────────────────────────────────────────────────────────────

  const handleSignOut = async () => {
    if (!supabase) return
    clearStoredStaffName()
    await supabase.auth.signOut()
  }

  // ── Record stock update ───────────────────────────────────────────────────────

  const recordStockUpdate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return

    const data = new FormData(event.currentTarget)
    const productId = String(data.get('product'))
    const movementType = String(data.get('type')) as 'stock_in' | 'stock_out'
    const quantity = Number(data.get('quantity'))
    const rawRack = String(data.get('rack') ?? '').trim()
    const remarks = String(data.get('remarks') || '') || null

    if (!rawRack) {
      setNotice('Enter a rack number.')
      return
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      setNotice('Enter a valid quantity.')
      return
    }

    // Client-side guard for stock_out: check specific rack quantity
    const product = products.find((p) => p.id === productId)
    if (product && movementType === 'stock_out') {
      const rackEntry = product.racks.find((r) => r.rackNumber === rawRack)
      if (!rackEntry) {
        setNotice(
          `No stock exists on rack ${rawRack} for ${product.name}. Use a rack that has stock.`,
        )
        return
      }
      if (quantity > rackEntry.quantity) {
        setNotice(
          `Only ${rackEntry.quantity} items are available on rack ${rawRack} for ${product.name}.`,
        )
        return
      }
    }

    const { error } = await supabase.from('stock_transactions').insert({
      product_id: productId,
      rack_number: rawRack,
      movement_type: movementType,
      quantity,
      updated_by: identityName,
      remarks,
    })

    if (error) {
      setNotice(error.message)
      return
    }

    setShowUpdate(false)
    setNotice(
      `${movementType === 'stock_in' ? 'Stock In' : 'Stock Out'} recorded successfully.`,
    )
    await fetchAll()
  }

  // ── Add product ───────────────────────────────────────────────────────────────

  const addProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    const data = new FormData(event.currentTarget)
    const sku = String(data.get('sku')).trim().toUpperCase()
    if (products.some((p) => p.sku === sku)) {
      setNotice('That SKU already exists. Use a unique SKU.')
      return
    }
    const openingQty = Number(data.get('opening_qty'))
    const openingRack = String(data.get('opening_rack') ?? '').trim()

    const { data: insertedRows, error } = await supabase
      .from('products')
      .insert({
        name: String(data.get('name')),
        sku,
        category: String(data.get('category')),
        color: String(data.get('color')),
        minimum_stock_level: Number(data.get('minimum')),
        notes: String(data.get('notes') || '') || null,
        updated_by: identityName,
      })
      .select('id')
      .single()

    if (error || !insertedRows) {
      setNotice(error?.message ?? 'Failed to add product.')
      return
    }

    const newProductId = insertedRows.id as string

    if (openingQty > 0 && openingRack) {
      const { error: txError } = await supabase
        .from('stock_transactions')
        .insert({
          product_id: newProductId,
          rack_number: openingRack,
          movement_type: 'stock_in',
          quantity: openingQty,
          updated_by: identityName,
          remarks: 'Opening stock',
        })
      if (txError) {
        setNotice(`Product added, but opening stock failed: ${txError.message}`)
        setPage('products')
        await fetchAll()
        return
      }
    }

    setNotice('Product added successfully.')
    setPage('products')
    await fetchAll()
  }

  // ── Content memo ──────────────────────────────────────────────────────────────

  const content = useMemo(() => {
    if (page === 'history') return <History stockUpdates={stockUpdates} />
    if (page === 'users')
      return (
        <UsersPage
          staff={staff}
          onRefresh={() => { void fetchAll() }}
          onNotice={setNotice}
        />
      )
    if (page === 'products')
      return (
        <Products
          products={filtered}
          search={search}
          setSearch={setSearch}
        />
      )
    if (page === 'add-product')
      return (
        <AddProductPage
          onSubmit={(e) => { void addProduct(e) }}
        />
      )
    if (page === 'all-products')
      return (
        <AllProductsPage
          products={products}
          onRefresh={() => { void fetchAll() }}
          onNotice={setNotice}
        />
      )
    return (
      <Dashboard
        products={products}
        stockUpdates={stockUpdates}
        lowStock={lowStock}
        totalStock={totalStock}
        onViewLow={() => setPage('products')}
        onViewHistory={() => setPage('history')}
      />
    )
  }, [page, products, stockUpdates, filtered, search, lowStock, totalStock, staff]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Render guards ─────────────────────────────────────────────────────────────

  if (session === undefined) {
    return (
      <div className="app-init">
        <div className="spinner" aria-label="Loading" />
      </div>
    )
  }

  if (!session) {
    return (
      <>
        <LoginScreen onNotice={setNotice} />
        {notice && (
          <div className="toast" role="status">
            {notice}
            <button onClick={() => setNotice('')} aria-label="Dismiss message">
              ×
            </button>
          </div>
        )}
      </>
    )
  }

  // ── Authenticated content ─────────────────────────────────────────────────────

  const avatarChar = identityName.slice(0, 1).toUpperCase()

  const pageTitle =
    page === 'dashboard'
      ? `Good morning, ${identityName}`
      : page === 'products'
        ? 'Products'
        : page === 'history'
          ? 'Update history'
          : page === 'users'
            ? 'Users'
            : page === 'all-products'
              ? 'All Products'
              : 'Add product'

  const pageSubhead =
    page === 'dashboard'
      ? 'Here is the latest overview of your stock.'
      : page === 'products'
        ? 'Find and check every SKU in your store.'
        : page === 'history'
          ? 'A complete record of every stock update.'
          : page === 'users'
            ? 'Manage your staff roster.'
            : page === 'all-products'
              ? 'Edit product details. Quantity is managed by stock updates.'
              : 'Add a new product to the inventory.'

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">P</div>
          <div>
            <strong>The Parda</strong>
            <span>Inventory portal</span>
          </div>
        </div>
        <nav aria-label="Main navigation">
          <Nav
            active={page === 'dashboard'}
            icon="▦"
            label="Dashboard"
            onClick={() => setPage('dashboard')}
          />
          <Nav
            active={page === 'products'}
            icon="◫"
            label="Products"
            onClick={() => setPage('products')}
          />
          <Nav
            active={page === 'history'}
            icon="◷"
            label="Update history"
            onClick={() => setPage('history')}
          />
          {isAdmin && (
            <Nav
              active={page === 'users'}
              icon="⊙"
              label="Users"
              onClick={() => setPage('users')}
            />
          )}
          {isAdmin && (
            <Nav
              active={page === 'add-product'}
              icon="＋"
              label="Add product"
              onClick={() => setPage('add-product')}
            />
          )}
          {isAdmin && (
            <Nav
              active={page === 'all-products'}
              icon="✎"
              label="All Products"
              onClick={() => setPage('all-products')}
            />
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="user-card">
            <div className="avatar">{avatarChar}</div>
            <div>
              <b>{identityName}</b>
              <small>{isAdmin ? 'Owner' : 'Staff'}</small>
            </div>
          </div>
          <button
            className="signout-btn"
            onClick={() => { void handleSignOut() }}
            aria-label="Sign out"
          >
            ⎋ <span>Sign out</span>
          </button>
        </div>
      </aside>

      <main>
        <header>
          <div>
            <p className="eyebrow">CURTAIN STORE · INVENTORY</p>
            <h1>{pageTitle}</h1>
            <p className="subhead">{pageSubhead}</p>
          </div>
          <div className="header-actions">
            <button
              className="button secondary"
              onClick={() => {
                setShowUpdate(true)
              }}
            >
              ↕ Stock Update
            </button>
          </div>
        </header>

        {loading && (
          <div className="loading-bar" role="status" aria-label="Loading data">
            <span className="loading-bar-fill" />
          </div>
        )}
        {fetchError && (
          <div className="fetch-error" role="alert">
            <b>Could not load data:</b> {fetchError}
            <button
              onClick={() => {
                void fetchAll()
              }}
              aria-label="Retry"
            >
              Retry
            </button>
          </div>
        )}

        {notice && (
          <div className="toast" role="status">
            {notice}
            <button onClick={() => setNotice('')} aria-label="Dismiss message">
              ×
            </button>
          </div>
        )}

        {content}
      </main>

      {/* Stock Update modal */}
      {showUpdate && (
        <StockUpdateModal
          products={products}
          onClose={() => setShowUpdate(false)}
          onSubmit={(e) => {
            void recordStockUpdate(e)
          }}
        />
      )}
    </div>
  )
}

// ── AllProductsPage ────────────────────────────────────────────────────────────

type EditDraft = {
  name: string
  sku: string
  category: string
  color: string
  minimum_stock_level: string
  notes: string
}

function AllProductsPage({
  products,
  onRefresh,
  onNotice,
}: {
  products: Product[]
  onRefresh: () => void
  onNotice: (msg: string) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<EditDraft>({
    name: '',
    sku: '',
    category: '',
    color: '',
    minimum_stock_level: '0',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  // We need notes from the original DB row, but Product doesn't carry notes.
  // We fetch it fresh when the modal opens so we always show the stored notes.
  const openEditWithNotes = async (p: Product) => {
    if (!supabase) return
    const { data, error } = await supabase
      .from('products')
      .select('notes')
      .eq('id', p.id)
      .single()
    setDraft({
      name: p.name,
      sku: p.sku,
      category: p.category,
      color: p.color,
      minimum_stock_level: String(p.minimum),
      notes: error || !data ? '' : ((data.notes as string | null) ?? ''),
    })
    setEditingId(p.id)
  }

  const closeEdit = () => {
    setEditingId(null)
  }

  const handleSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!supabase || !editingId) return

    const name = draft.name.trim()
    const sku = draft.sku.trim().toUpperCase()
    const category = draft.category.trim()
    const color = draft.color.trim()
    const minimum_stock_level = parseInt(draft.minimum_stock_level, 10)
    const notes = draft.notes.trim() || null

    if (!name) { onNotice('Product name is required.'); return }
    if (!sku) { onNotice('SKU is required.'); return }
    if (!category) { onNotice('Category is required.'); return }
    if (!color) { onNotice('Color is required.'); return }
    if (!Number.isInteger(minimum_stock_level) || minimum_stock_level < 0) {
      onNotice('Minimum stock level must be a whole number 0 or greater.')
      return
    }

    setSaving(true)
    const { error } = await supabase
      .from('products')
      .update({ name, sku, category, color, minimum_stock_level, notes })
      .eq('id', editingId)
    setSaving(false)

    if (error) {
      onNotice(error.message)
      return
    }

    onNotice(`"${name}" updated successfully.`)
    closeEdit()
    onRefresh()
  }

  const editingProduct = editingId
    ? products.find((p) => p.id === editingId) ?? null
    : null

  return (
    <section className="panel products-panel">
      <div className="table-tools">
        <b>All products</b>
        <span>{products.length} products</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>Category</th>
              <th>Stock (read-only)</th>
              <th>Min. stock</th>
              <th>Last updated</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>
                  <b>{p.name}</b>
                  <span>{p.color}</span>
                </td>
                <td>
                  <code>{p.sku}</code>
                </td>
                <td>{p.category}</td>
                <td>
                  <span className={`stock-count ${p.quantity <= p.minimum ? 'low' : ''}`}>
                    {p.quantity}
                  </span>
                  <span className="stock-min">trigger-managed</span>
                </td>
                <td>{p.minimum}</td>
                <td>
                  {p.updatedAt}
                  <span>by {p.updatedBy}</span>
                </td>
                <td>
                  <button
                    className="text-button"
                    onClick={() => { void openEditWithNotes(p) }}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  style={{ textAlign: 'center', color: 'var(--muted)', padding: '28px' }}
                >
                  No products found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {editingId && editingProduct && (
        <Modal title={`Edit: ${editingProduct.name}`} onClose={closeEdit}>
          <form className="form" onSubmit={(e) => { void handleSave(e) }}>
            <div className="form-grid">
              <label>
                Product name
                <input
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  required
                />
              </label>
              <label>
                SKU <span>uppercased automatically</span>
                <input
                  value={draft.sku}
                  onChange={(e) =>
                    setDraft({ ...draft, sku: e.target.value.toUpperCase() })
                  }
                  required
                />
              </label>
              <label>
                Category
                <input
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  required
                />
              </label>
              <label>
                Color
                <input
                  value={draft.color}
                  onChange={(e) => setDraft({ ...draft, color: e.target.value })}
                  required
                />
              </label>
              <label>
                Minimum stock level
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={draft.minimum_stock_level}
                  onChange={(e) =>
                    setDraft({ ...draft, minimum_stock_level: e.target.value })
                  }
                  required
                />
              </label>
              <label>
                Quantity <span>read-only — managed by stock updates</span>
                <input
                  value={editingProduct.quantity}
                  disabled
                  className="all-products-qty-readonly"
                />
              </label>
            </div>
            <label>
              Notes <span>optional</span>
              <textarea
                value={draft.notes}
                onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                placeholder="Any additional details"
              />
            </label>
            <div className="all-products-modal-actions">
              <button
                type="button"
                className="button secondary"
                onClick={closeEdit}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="button primary"
                type="submit"
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}

// ── AddProductPage ─────────────────────────────────────────────────────────────

function AddProductPage({
  onSubmit,
}: {
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
}) {
  return (
    <section className="panel products-panel add-product-page">
      <div className="table-tools">
        <b>New product details</b>
      </div>
      <div className="add-product-body">
        <form className="form" onSubmit={onSubmit}>
          <div className="form-grid">
            <label>
              Product name
              <input name="name" required />
            </label>
            <label>
              SKU
              <input
                name="sku"
                placeholder="e.g. VBL-SND-001"
                required
              />
            </label>
            <label>
              Category
              <input
                name="category"
                placeholder="e.g. Blackout"
                required
              />
            </label>
            <label>
              Color
              <input name="color" required />
            </label>
            <label>
              Opening rack <span>optional</span>
              <input
                name="opening_rack"
                placeholder="e.g. A-01"
              />
            </label>
            <label>
              Opening quantity
              <input name="opening_qty" type="number" min="0" defaultValue="0" required />
            </label>
            <label>
              Minimum stock
              <input name="minimum" type="number" min="0" required />
            </label>
          </div>
          <label>
            Notes <span>optional</span>
            <textarea name="notes" placeholder="Any additional details" />
          </label>
          <button className="button primary" type="submit">
            Add product
          </button>
        </form>
      </div>
    </section>
  )
}

// ── StockUpdateModal ───────────────────────────────────────────────────────────

function StockUpdateModal({
  products,
  onClose,
  onSubmit,
}: {
  products: Product[]
  onClose: () => void
  onSubmit: (e: FormEvent<HTMLFormElement>) => void
}) {
  const [selectedProductId, setSelectedProductId] = useState(
    products[0]?.id ?? '',
  )
  const [movementType, setMovementType] = useState<'stock_in' | 'stock_out'>(
    'stock_in',
  )
  const [rackInput, setRackInput] = useState('')
  const [useNewRack, setUseNewRack] = useState(false)

  const selectedProduct = products.find((p) => p.id === selectedProductId)
  const racks = selectedProduct?.racks ?? []

  // When product changes, reset rack selection
  const handleProductChange = (id: string) => {
    setSelectedProductId(id)
    setRackInput('')
    setUseNewRack(false)
  }

  // For stock_out, only existing racks make sense; for stock_in, new rack is allowed
  const showNewRackOption = movementType === 'stock_in'

  const effectiveRack =
    useNewRack || racks.length === 0 ? rackInput : rackInput || (racks[0]?.rackNumber ?? '')

  // Keep rackInput in sync when switching from existing dropdown
  const handleRackSelect = (value: string) => {
    if (value === '__new__') {
      setUseNewRack(true)
      setRackInput('')
    } else {
      setUseNewRack(false)
      setRackInput(value)
    }
  }

  return (
    <Modal title="Record stock update" onClose={onClose}>
      <form className="form" onSubmit={onSubmit}>
        <label>
          Product
          <select
            name="product"
            required
            value={selectedProductId}
            onChange={(e) => handleProductChange(e.target.value)}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.sku} ({p.quantity} total)
              </option>
            ))}
          </select>
        </label>

        <div className="form-grid">
          <label>
            Update type
            <select
              name="type"
              value={movementType}
              onChange={(e) => {
                setMovementType(e.target.value as 'stock_in' | 'stock_out')
                setUseNewRack(false)
                setRackInput(racks[0]?.rackNumber ?? '')
              }}
            >
              <option value="stock_in">Stock In</option>
              <option value="stock_out">Stock Out</option>
            </select>
          </label>
          <label>
            Quantity
            <input name="quantity" type="number" min="1" required />
          </label>
        </div>

        <label>
          Rack
          {racks.length > 0 && !useNewRack ? (
            <select
              value={rackInput || racks[0]?.rackNumber}
              onChange={(e) => handleRackSelect(e.target.value)}
            >
              {racks.map((r) => (
                <option key={r.id} value={r.rackNumber}>
                  {r.rackNumber} ({r.quantity} in stock)
                </option>
              ))}
              {showNewRackOption && (
                <option value="__new__">+ Enter new rack number</option>
              )}
            </select>
          ) : null}
          {(racks.length === 0 || useNewRack) && (
            <input
              placeholder="e.g. A-01"
              value={rackInput}
              onChange={(e) => setRackInput(e.target.value)}
            />
          )}
          {useNewRack && (
            <button
              type="button"
              className="rack-cancel-new"
              onClick={() => {
                setUseNewRack(false)
                setRackInput(racks[0]?.rackNumber ?? '')
              }}
            >
              Cancel — use existing rack
            </button>
          )}
        </label>

        {/* Hidden field carries the resolved rack_number */}
        <input type="hidden" name="rack" value={effectiveRack} />

        <label>
          Remarks <span>optional</span>
          <textarea
            name="remarks"
            placeholder="e.g. Supplier delivery or order number"
          />
        </label>
        <button className="button primary full" type="submit">
          Save stock update
        </button>
      </form>
    </Modal>
  )
}

// ── UsersPage ──────────────────────────────────────────────────────────────────

function UsersPage({
  staff,
  onRefresh,
  onNotice,
}: {
  staff: DbStaff[]
  onRefresh: () => void
  onNotice: (msg: string) => void
}) {
  const [allStaff, setAllStaff] = useState<DbStaff[]>([])
  const [loadingAll, setLoadingAll] = useState(false)
  const [addingName, setAddingName] = useState('')
  const [saving, setSaving] = useState(false)

  // Fetch all (including inactive) for display in management page
  const fetchAllStaff = async () => {
    if (!supabase) return
    setLoadingAll(true)
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .order('name')
    setLoadingAll(false)
    if (error) { onNotice(error.message); return }
    setAllStaff(data as DbStaff[])
  }

  useEffect(() => {
    void fetchAllStaff()
  }, [staff]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleAdd = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!supabase) return
    const name = addingName.trim()
    if (!name) return
    setSaving(true)
    const { error } = await supabase
      .from('staff')
      .insert({ name, active: true })
    setSaving(false)
    if (error) {
      onNotice(
        error.message.includes('unique') || error.code === '23505'
          ? `A staff member named "${name}" already exists.`
          : error.message,
      )
      return
    }
    setAddingName('')
    onNotice(`Staff member "${name}" added.`)
    onRefresh()
  }

  const toggleActive = async (member: DbStaff) => {
    if (!supabase) return
    const { error } = await supabase
      .from('staff')
      .update({ active: !member.active })
      .eq('id', member.id)
    if (error) {
      onNotice(error.message)
      return
    }
    onNotice(
      member.active
        ? `${member.name} deactivated.`
        : `${member.name} reactivated.`,
    )
    onRefresh()
  }

  return (
    <section className="panel products-panel">
      <div className="table-tools">
        <b>Staff roster</b>
        <span>{allStaff.filter((s) => s.active).length} active members</span>
      </div>

      {/* Add staff form */}
      <div className="add-staff-form">
        <form
          className="form-inline"
          onSubmit={(e) => {
            void handleAdd(e)
          }}
        >
          <input
            className="staff-name-input"
            placeholder="New staff member name"
            value={addingName}
            onChange={(e) => setAddingName(e.target.value)}
            required
          />
          <button
            className="button primary"
            type="submit"
            disabled={saving || !addingName.trim()}
          >
            {saving ? 'Adding…' : 'Add user'}
          </button>
        </form>
      </div>

      <div className="table-wrap">
        {loadingAll ? (
          <p className="empty-state">Loading…</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Added</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {allStaff.map((s) => (
                <tr key={s.id} className={s.active ? '' : 'row-inactive'}>
                  <td>
                    <b>{s.name}</b>
                  </td>
                  <td>
                    <span
                      className={`type-pill ${s.active ? 'in' : 'out'}`}
                    >
                      {s.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>{fmtDate(s.created_at)}</td>
                  <td>
                    <button
                      className="text-button"
                      onClick={() => {
                        void toggleActive(s)
                      }}
                    >
                      {s.active ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
              {allStaff.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    style={{
                      textAlign: 'center',
                      color: 'var(--muted)',
                      padding: '28px',
                    }}
                  >
                    No staff members yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function Nav({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: string
  label: string
  onClick: () => void
}) {
  return (
    <button
      className={`nav-item ${active ? 'active' : ''}`}
      onClick={onClick}
    >
      <span>{icon}</span>
      {label}
    </button>
  )
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="modal-title">
          <h2>{title}</h2>
          <button onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  )
}

// ── Dashboard ──────────────────────────────────────────────────────────────────

type DashboardPanel = 'total-products' | 'total-stock' | 'low-stock' | null

function Dashboard({
  products,
  stockUpdates,
  lowStock,
  totalStock,
  onViewLow,
  onViewHistory,
}: {
  products: Product[]
  stockUpdates: StockUpdate[]
  lowStock: Product[]
  totalStock: number
  onViewLow: () => void
  onViewHistory: () => void
}) {
  const [activePanel, setActivePanel] = useState<DashboardPanel>(null)

  const togglePanel = (key: DashboardPanel) => {
    setActivePanel((prev) => (prev === key ? null : key))
  }

  return (
    <>
      <section className="metrics">
        <MetricCard
          label="Total products"
          value={products.length}
          icon="▣"
          panelKey="total-products"
          activePanel={activePanel}
          onToggle={togglePanel}
        />
        <MetricCard
          label="Total stock quantity"
          value={totalStock}
          icon="◫"
          panelKey="total-stock"
          activePanel={activePanel}
          onToggle={togglePanel}
        />
        <MetricCard
          label="Low stock products"
          value={lowStock.length}
          icon="!"
          danger
          panelKey="low-stock"
          activePanel={activePanel}
          onToggle={togglePanel}
        />
        {/* Non-clickable last-updated card */}
        <div className="metric">
          <div className="metric-icon">◷</div>
          <div>
            <span>Last updated</span>
            <strong className="date-value">{stockUpdates[0]?.date ?? '—'}</strong>
          </div>
        </div>
      </section>

      {/* Expandable metric panel */}
      {activePanel === 'total-products' && (
        <section className="metric-detail-panel">
          <div className="metric-detail-heading">
            <h3>All products</h3>
            <button className="text-button" onClick={() => setActivePanel(null)}>Close ×</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th>Stock</th>
                  <th>Last updated</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td><b>{p.name}</b><span>{p.color}</span></td>
                    <td><code>{p.sku}</code></td>
                    <td>{p.category}</td>
                    <td>
                      <span className={`stock-count ${p.quantity <= p.minimum ? 'low' : ''}`}>{p.quantity}</span>
                      <span className="stock-min">min {p.minimum}</span>
                    </td>
                    <td>{p.updatedAt}<span>by {p.updatedBy}</span></td>
                  </tr>
                ))}
                {products.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: '28px' }}>No products found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activePanel === 'total-stock' && (
        <section className="metric-detail-panel">
          <div className="metric-detail-heading">
            <h3>Stock quantity by product</h3>
            <button className="text-button" onClick={() => setActivePanel(null)}>Close ×</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Total qty</th>
                  <th>Per rack</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td><b>{p.name}</b><span>{p.color}</span></td>
                    <td><code>{p.sku}</code></td>
                    <td>
                      <span className={`stock-count ${p.quantity <= p.minimum ? 'low' : ''}`}>{p.quantity}</span>
                    </td>
                    <td>
                      {p.racks.length === 0 ? (
                        <span className="no-racks">—</span>
                      ) : (
                        <span className="rack-list">
                          {p.racks.map((r) => `${r.rackNumber} · ${r.quantity}`).join(', ')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
                {products.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--muted)', padding: '28px' }}>No products found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activePanel === 'low-stock' && (
        <section className="metric-detail-panel">
          <div className="metric-detail-heading">
            <h3>Low stock products</h3>
            <button className="text-button" onClick={() => setActivePanel(null)}>Close ×</button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th>Category</th>
                  <th>Stock</th>
                  <th>Minimum</th>
                </tr>
              </thead>
              <tbody>
                {lowStock.map((p) => (
                  <tr key={p.id}>
                    <td><b>{p.name}</b><span>{p.color}</span></td>
                    <td><code>{p.sku}</code></td>
                    <td>{p.category}</td>
                    <td><span className="stock-count low">{p.quantity}</span></td>
                    <td><span className="stock-min">{p.minimum}</span></td>
                  </tr>
                ))}
                {lowStock.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--muted)', padding: '28px' }}>All products are well stocked.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {lowStock.length > 0 && (
        <section className="low-alert">
          <div className="alert-icon">!</div>
          <div>
            <b>Low stock needs your attention</b>
            <p>
              {lowStock.length} product
              {lowStock.length !== 1 ? 's are' : ' is'} at or below minimum
              stock level.
            </p>
          </div>
          <button onClick={onViewLow}>
            View low stock <span>→</span>
          </button>
        </section>
      )}
      <section className="two-col">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <h2>Recent stock updates</h2>
              <p>Latest stock activity</p>
            </div>
            <button className="text-button" onClick={onViewHistory}>
              View all
            </button>
          </div>
          <div className="transactions">
            {stockUpdates.slice(0, 4).map((m) => (
              <div className="transaction" key={m.id}>
                <div
                  className={`movement-icon ${m.type === 'Stock In' ? 'in' : 'out'}`}
                >
                  {m.type === 'Stock In' ? '↓' : '↑'}
                </div>
                <div className="transaction-detail">
                  <b>{m.product}</b>
                  <span>
                    {m.sku} · Rack {m.rack} · {m.by}
                  </span>
                </div>
                <div className="transaction-amount">
                  <b className={m.type === 'Stock In' ? 'positive' : 'negative'}>
                    {m.type === 'Stock In' ? '+' : '−'}
                    {m.quantity}
                  </b>
                  <span>{m.date}</span>
                </div>
              </div>
            ))}
            {stockUpdates.length === 0 && (
              <p className="empty-state">No stock updates yet.</p>
            )}
          </div>
        </div>
        <div className="panel stock-panel">
          <div className="panel-heading">
            <div>
              <h2>Low stock</h2>
              <p>Products below minimum level</p>
            </div>
            <button className="text-button" onClick={onViewLow}>
              View all
            </button>
          </div>
          {lowStock.length === 0 && (
            <p className="empty-state">All products are well stocked.</p>
          )}
          {lowStock.map((p) => (
            <div className="low-row" key={p.id}>
              <div>
                <b>{p.name}</b>
                <span>{p.sku}</span>
              </div>
              <div>
                <b>{p.quantity} left</b>
                <span>Min. {p.minimum}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

// ── MetricCard (clickable) ─────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  icon,
  danger,
  panelKey,
  activePanel,
  onToggle,
}: {
  label: string
  value: string | number
  icon: string
  danger?: boolean
  panelKey: DashboardPanel
  activePanel: DashboardPanel
  onToggle: (key: DashboardPanel) => void
}) {
  const isActive = activePanel === panelKey
  return (
    <div
      className={`metric metric-clickable ${isActive ? 'metric-active' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => onToggle(panelKey)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onToggle(panelKey)
        }
      }}
      aria-pressed={isActive}
      aria-label={`${label}: ${value}. Click to ${isActive ? 'hide' : 'show'} details.`}
    >
      <div className={`metric-icon ${danger ? 'danger' : ''}`}>{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  )
}

function Products({
  products,
  search,
  setSearch,
}: {
  products: Product[]
  search: string
  setSearch: (v: string) => void
}) {
  return (
    <section className="panel products-panel">
      <div className="table-tools">
        <label className="search">
          ⌕{' '}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, SKU or category"
          />
        </label>
        <span>{products.length} products</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Product</th>
              <th>SKU</th>
              <th>Category</th>
              <th>Stock</th>
              <th>Racks</th>
              <th>Last updated</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>
                  <b>{p.name}</b>
                  <span>{p.color}</span>
                </td>
                <td>
                  <code>{p.sku}</code>
                </td>
                <td>{p.category}</td>
                <td>
                  <span
                    className={`stock-count ${p.quantity <= p.minimum ? 'low' : ''}`}
                  >
                    {p.quantity}
                  </span>
                  <span className="stock-min">min {p.minimum}</span>
                </td>
                <td>
                  {p.racks.length === 0 ? (
                    <span className="no-racks">—</span>
                  ) : (
                    <span className="rack-list">
                      {p.racks
                        .map((r) => `${r.rackNumber} · ${r.quantity}`)
                        .join(', ')}
                    </span>
                  )}
                </td>
                <td>
                  {p.updatedAt}
                  <span>by {p.updatedBy}</span>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  style={{
                    textAlign: 'center',
                    color: 'var(--muted)',
                    padding: '28px',
                  }}
                >
                  No products found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function History({ stockUpdates }: { stockUpdates: StockUpdate[] }) {
  return (
    <section className="panel products-panel">
      <div className="table-tools">
        <b>All stock updates</b>
        <span>{stockUpdates.length} records</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date &amp; time</th>
              <th>Product</th>
              <th>Rack</th>
              <th>Type</th>
              <th>Quantity</th>
              <th>Updated by</th>
              <th>Remarks</th>
            </tr>
          </thead>
          <tbody>
            {stockUpdates.map((m) => (
              <tr key={m.id}>
                <td>{m.date}</td>
                <td>
                  <b>{m.product}</b>
                  <span>{m.sku}</span>
                </td>
                <td>
                  <code>{m.rack}</code>
                </td>
                <td>
                  <span
                    className={`type-pill ${m.type === 'Stock In' ? 'in' : 'out'}`}
                  >
                    {m.type}
                  </span>
                </td>
                <td>
                  <b>{m.quantity}</b>
                </td>
                <td>{m.by}</td>
                <td>{m.remarks || '—'}</td>
              </tr>
            ))}
            {stockUpdates.length === 0 && (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    textAlign: 'center',
                    color: 'var(--muted)',
                    padding: '28px',
                  }}
                >
                  No stock updates yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default App
