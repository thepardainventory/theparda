import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import './App.css'

// ── DB row shapes ──────────────────────────────────────────────────────────────

type DbProduct = {
  id: string
  name: string
  size: string
  category: string
  quantity: number
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
  created_at: string
  products: { name: string; size: string; category: string } | null
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
  size: string
  category: string
  quantity: number
  updatedAt: string
  updatedBy: string
  racks: ProductRack[]
}

type StockUpdate = {
  id: string
  product: string
  rack: string
  type: 'Stock In' | 'Stock Out'
  quantity: number
  by: string
  date: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso))

/**
 * Format a size value for display, appending " inch" as the inches suffix.
 * Guards against double-appending if the value already ends with "in" or "inch".
 * Returns "—" for empty/blank values.
 */
const sizeLabel = (size: string): string => {
  if (!size || !size.trim()) return '—'
  const trimmed = size.trim()
  if (/\bin(ch(es?)?)?\s*$/i.test(trimmed)) return trimmed
  return `${trimmed} inch`
}

/** Display identity for a product: "name · size (in) · category" */
const productLabel = (name: string, size: string, category: string) =>
  `${name} · ${sizeLabel(size)} · ${category}`

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
    size: row.size,
    category: row.category,
    quantity: row.quantity,
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
  const p = row.products
  const productDisplay = p
    ? productLabel(p.name, p.size, p.category)
    : '(deleted)'
  return {
    id: row.id,
    product: productDisplay,
    rack: row.rack_number,
    type: row.movement_type === 'stock_in' ? 'Stock In' : 'Stock Out',
    quantity: row.quantity,
    by: row.updated_by,
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

    const { error: anonError } = await supabase.auth.signInAnonymously()
    if (anonError) {
      setLoading(false)
      return onNotice(anonError.message)
    }

    const { data: staffRows, error: staffError } = await supabase
      .from('staff')
      .select('name, active')
      .ilike('name', username)

    if (staffError) {
      await supabase.auth.signOut()
      setLoading(false)
      return onNotice(staffError.message)
    }

    const activeRow = staffRows?.find(
      (s: { name: string; active: boolean }) => s.active === true,
    )

    if (!activeRow) {
      await supabase.auth.signOut()
      setLoading(false)
      return onNotice(
        `No active staff member named "${username}". Ask the owner to add you under Users.`,
      )
    }

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
          <form
            className="form"
            onSubmit={(e) => {
              void handleStaffLogin(e)
            }}
          >
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
          <form
            className="form"
            onSubmit={(e) => {
              void handleOwnerLogin(e)
            }}
          >
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

type PageKey =
  | 'dashboard'
  | 'products'
  | 'history'
  | 'users'
  | 'add-product'
  | 'all-products'

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
  const [notice, setNotice] = useState('')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)

  // Auto-dismiss the toast after 5 seconds whenever a new notice appears.
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), 5000)
    return () => clearTimeout(timer)
  }, [notice])

  // Close the mobile nav drawer on Escape, and lock body scroll while open.
  useEffect(() => {
    if (!mobileNavOpen) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setMobileNavOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [mobileNavOpen])

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
        .select('*, products(name, size, category)')
        .order('created_at', { ascending: false })
        .limit(200),
      supabase.from('staff').select('*').eq('active', true).order('name'),
    ])

    setLoading(false)

    if (prodRes.error) {
      setFetchError(prodRes.error.message)
      return
    }
    if (racksRes.error) {
      setFetchError(racksRes.error.message)
      return
    }
    if (txRes.error) {
      setFetchError(txRes.error.message)
      return
    }
    if (staffRes.error) {
      setFetchError(staffRes.error.message)
      return
    }

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

  const filtered = products.filter((p) =>
    `${p.name} ${p.size} ${p.category}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  )

  // ── Sign out ──────────────────────────────────────────────────────────────────

  const handleSignOut = async () => {
    if (!supabase) return
    clearStoredStaffName()
    await supabase.auth.signOut()
  }

  // ── Add product ───────────────────────────────────────────────────────────────

  const addProduct = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    const data = new FormData(event.currentTarget)
    const name = String(data.get('name')).trim()
    const size = String(data.get('size')).trim()
    const category = String(data.get('category')).trim()
    const openingQty = Number(data.get('opening_qty'))
    const openingRack = String(data.get('opening_rack') ?? '').trim()

    if (!name || !size || !category) {
      setNotice('Product name, size, and category are required.')
      return
    }
    const sizeNum = Number(size)
    if (!size || !Number.isInteger(sizeNum) || sizeNum < 1) {
      setNotice('Size must be a positive whole number (in inches).')
      return
    }

    const { data: insertedRows, error } = await supabase
      .from('products')
      .insert({
        name,
        size,
        category,
        updated_by: identityName,
      })
      .select('id')
      .single()

    if (error || !insertedRows) {
      const msg = error?.message ?? 'Failed to add product.'
      // unique (name, size, category) violation
      if (error?.code === '23505' || msg.includes('unique')) {
        setNotice(
          `A product "${name} · ${size} · ${category}" already exists.`,
        )
      } else {
        setNotice(msg)
      }
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
          onRefresh={() => {
            void fetchAll()
          }}
          onNotice={setNotice}
        />
      )
    if (page === 'products')
      return (
        <Products products={filtered} search={search} setSearch={setSearch} />
      )
    if (page === 'add-product')
      return (
        <AddProductPage
          onSubmit={(e) => {
            void addProduct(e)
          }}
        />
      )
    if (page === 'all-products')
      return (
        <AllProductsPage
          products={products}
          onRefresh={() => {
            void fetchAll()
          }}
          onNotice={setNotice}
        />
      )
    return (
      <Dashboard
        products={products}
        stockUpdates={stockUpdates}
        identityName={identityName}
        onRefresh={() => {
          void fetchAll()
        }}
        onNotice={setNotice}
      />
    )
  }, [page, products, stockUpdates, filtered, search, staff]) // eslint-disable-line react-hooks/exhaustive-deps

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
        ? 'Find and check every product in your store.'
        : page === 'history'
          ? 'A complete record of every stock update.'
          : page === 'users'
            ? 'Manage your staff roster.'
            : page === 'all-products'
              ? 'Edit product details. Quantity is managed by stock updates.'
              : 'Add a new product to the inventory.'

  return (
    <div className={`app-shell${mobileNavOpen ? ' nav-open' : ''}`}>
      <div className="mobile-topbar">
        <div className="brand">
          <div className="brand-mark">P</div>
          <strong>The Parda</strong>
        </div>
        <button
          className="hamburger"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open navigation menu"
        >
          ☰
        </button>
      </div>
      <div
        className="drawer-backdrop"
        onClick={() => setMobileNavOpen(false)}
        aria-hidden="true"
      />
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">P</div>
          <div>
            <strong>The Parda</strong>
            <span>Inventory portal</span>
          </div>
        </div>
        <nav aria-label="Main navigation" onClick={() => setMobileNavOpen(false)}>
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
            onClick={() => {
              void handleSignOut()
            }}
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
    </div>
  )
}

// ── AllProductsPage ────────────────────────────────────────────────────────────

type EditDraft = {
  name: string
  size: string
  category: string
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
    size: '',
    category: '',
  })
  const [saving, setSaving] = useState(false)

  const openEdit = (p: Product) => {
    setDraft({ name: p.name, size: p.size, category: p.category })
    setEditingId(p.id)
  }

  const closeEdit = () => {
    setEditingId(null)
  }

  const handleSave = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!supabase || !editingId) return

    const name = draft.name.trim()
    const size = draft.size.trim()
    const category = draft.category.trim()

    if (!name) {
      onNotice('Product name is required.')
      return
    }
    if (!size) {
      onNotice('Size is required.')
      return
    }
    const sizeNum = Number(size)
    if (!Number.isInteger(sizeNum) || sizeNum < 1) {
      onNotice('Size must be a positive whole number (in inches).')
      return
    }
    if (!category) {
      onNotice('Category is required.')
      return
    }

    setSaving(true)
    const { error } = await supabase
      .from('products')
      .update({ name, size, category })
      .eq('id', editingId)
    setSaving(false)

    if (error) {
      if (error.code === '23505' || error.message.includes('unique')) {
        onNotice(
          `A product "${name} · ${size} · ${category}" already exists.`,
        )
      } else {
        onNotice(error.message)
      }
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
              <th>Product name</th>
              <th>Size</th>
              <th>Type</th>
              <th>Stock (read-only)</th>
              <th>Last updated</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td data-label="Product name">
                  <b>{p.name}</b>
                </td>
                <td data-label="Size">{sizeLabel(p.size)}</td>
                <td data-label="Type">{p.category}</td>
                <td data-label="Stock">
                  <span className="stock-count">{p.quantity}</span>
                  <span className="stock-min">trigger-managed</span>
                </td>
                <td data-label="Last updated">
                  {p.updatedAt}
                  <span>by {p.updatedBy}</span>
                </td>
                <td data-label="Action">
                  <button
                    className="text-button"
                    onClick={() => openEdit(p)}
                  >
                    Edit
                  </button>
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

      {editingId && editingProduct && (
        <Modal
          title={`Edit: ${productLabel(editingProduct.name, editingProduct.size, editingProduct.category)}`}
          onClose={closeEdit}
        >
          <form
            className="form"
            onSubmit={(e) => {
              void handleSave(e)
            }}
          >
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
                Size (inches)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={draft.size}
                  onChange={(e) => setDraft({ ...draft, size: e.target.value })}
                  required
                  placeholder="e.g. 84"
                />
              </label>
              <label>
                Category
                <input
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({ ...draft, category: e.target.value })
                  }
                  required
                  placeholder="e.g. Blackout"
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
              <input name="name" required placeholder="e.g. Sand" />
            </label>
            <label>
              Size (inches)
              <input
                name="size"
                type="number"
                min="1"
                step="1"
                required
                placeholder="e.g. 84"
              />
            </label>
            <label>
              Category / Type
              <input
                name="category"
                placeholder="e.g. Blackout"
                required
              />
            </label>
            <label>
              Opening rack <span>optional</span>
              <input name="opening_rack" placeholder="e.g. A-01" />
            </label>
            <label>
              Opening quantity
              <input
                name="opening_qty"
                type="number"
                min="0"
                defaultValue="0"
                required
              />
            </label>
          </div>
          <button className="button primary" type="submit">
            Add product
          </button>
        </form>
      </div>
    </section>
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

  const fetchAllStaff = async () => {
    if (!supabase) return
    setLoadingAll(true)
    const { data, error } = await supabase
      .from('staff')
      .select('*')
      .order('name')
    setLoadingAll(false)
    if (error) {
      onNotice(error.message)
      return
    }
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
                  <td data-label="Name">
                    <b>{s.name}</b>
                  </td>
                  <td data-label="Status">
                    <span className={`type-pill ${s.active ? 'in' : 'out'}`}>
                      {s.active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td data-label="Added">{fmtDate(s.created_at)}</td>
                  <td data-label="Action">
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

type DashboardAction = 'stock_in' | 'stock_out' | null

// Inline per-rack quick stock adjust: one qty box + green (+) / red (−) buttons.
function RackAdjustCell({
  productId,
  name,
  rackNumber,
  quantity,
  identityName,
  onNotice,
  onRefresh,
}: {
  productId: string
  name: string
  rackNumber: string
  quantity: number
  identityName: string
  onNotice: (msg: string) => void
  onRefresh: () => void
}) {
  const [qty, setQty] = useState('')
  const [busy, setBusy] = useState(false)

  // No rack to adjust (product with no stock rows yet).
  if (rackNumber === '—') return <span className="no-racks">—</span>

  const run = async (type: 'stock_in' | 'stock_out') => {
    if (!supabase) return
    const n = Number(qty)
    if (!Number.isInteger(n) || n <= 0) {
      onNotice('Enter a valid quantity.')
      return
    }
    if (type === 'stock_out' && n > quantity) {
      onNotice(`Only ${quantity} available on rack ${rackNumber}.`)
      return
    }
    setBusy(true)
    const { error } = await supabase.from('stock_transactions').insert({
      product_id: productId,
      rack_number: rackNumber,
      movement_type: type,
      quantity: n,
      updated_by: identityName,
    })
    setBusy(false)
    if (error) {
      onNotice(error.message)
      return
    }
    onNotice(
      `${type === 'stock_in' ? 'Stock In' : 'Stock Out'} recorded for ${name} · ${rackNumber}.`,
    )
    setQty('')
    onRefresh()
  }

  return (
    <div className="adjust-cell">
      <input
        className="adjust-input"
        type="number"
        min="1"
        inputMode="numeric"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        disabled={busy}
        aria-label={`Quantity to adjust for ${name} rack ${rackNumber}`}
      />
      <button
        type="button"
        className="adjust-btn adjust-in"
        onClick={() => {
          void run('stock_in')
        }}
        disabled={busy || !qty}
        title="Add to this rack"
        aria-label={`Stock in for ${name} rack ${rackNumber}`}
      >
        ＋
      </button>
      <button
        type="button"
        className="adjust-btn adjust-out"
        onClick={() => {
          void run('stock_out')
        }}
        disabled={busy || !qty}
        title="Remove from this rack"
        aria-label={`Stock out for ${name} rack ${rackNumber}`}
      >
        −
      </button>
    </div>
  )
}

function Dashboard({
  products,
  stockUpdates,
  identityName,
  onRefresh,
  onNotice,
}: {
  products: Product[]
  stockUpdates: StockUpdate[]
  identityName: string
  onRefresh: () => void
  onNotice: (msg: string) => void
}) {
  const [activeAction, setActiveAction] = useState<DashboardAction>(null)
  const [dashSearch, setDashSearch] = useState('')
  const [filterName, setFilterName] = useState('')
  const [filterSize, setFilterSize] = useState('')
  const [filterType, setFilterType] = useState('')

  const toggleAction = (key: DashboardAction) => {
    setActiveAction((prev) => (prev === key ? null : key))
  }

  const clearFilters = () => {
    setDashSearch('')
    setFilterName('')
    setFilterSize('')
    setFilterType('')
  }

  // product_racks rows derived from products for the dashboard table
  // One row per (product, rack); products with no racks show once with qty 0 / rack "—"
  type RackRow = {
    productId: string
    name: string
    size: string
    category: string
    quantity: number
    rackNumber: string
  }

  const rackRows = useMemo<RackRow[]>(() => {
    const rows: RackRow[] = []
    for (const p of products) {
      if (p.racks.length === 0) {
        rows.push({
          productId: p.id,
          name: p.name,
          size: p.size,
          category: p.category,
          quantity: 0,
          rackNumber: '—',
        })
      } else {
        for (const r of p.racks) {
          rows.push({
            productId: p.id,
            name: p.name,
            size: p.size,
            category: p.category,
            quantity: r.quantity,
            rackNumber: r.rackNumber,
          })
        }
      }
    }
    return rows
  }, [products])

  // Distinct filter options — independent of each other, derived from all products
  const nameFilterOptions = useMemo<SearchableSelectOption[]>(() => {
    const seen = new Set<string>()
    const opts: SearchableSelectOption[] = [{ value: '', label: 'All Names' }]
    for (const p of products) {
      if (!seen.has(p.name)) {
        seen.add(p.name)
        opts.push({ value: p.name, label: p.name })
      }
    }
    return opts
  }, [products])

  const sizeFilterOptions = useMemo<SearchableSelectOption[]>(() => {
    const seen = new Set<string>()
    const opts: SearchableSelectOption[] = [{ value: '', label: 'All Sizes' }]
    for (const p of products) {
      if (!seen.has(p.size)) {
        seen.add(p.size)
        opts.push({ value: p.size, label: sizeLabel(p.size) })
      }
    }
    return opts
  }, [products])

  const typeFilterOptions = useMemo<SearchableSelectOption[]>(() => {
    const seen = new Set<string>()
    const opts: SearchableSelectOption[] = [{ value: '', label: 'All Types' }]
    for (const p of products) {
      if (!seen.has(p.category)) {
        seen.add(p.category)
        opts.push({ value: p.category, label: p.category })
      }
    }
    return opts
  }, [products])

  const filteredRackRows = useMemo(() => {
    let rows = rackRows
    // Text search filter (existing behaviour)
    if (dashSearch.trim()) {
      const q = dashSearch.toLowerCase()
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.size.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q),
      )
    }
    // Dropdown filters (AND-combined, exact match on selected value)
    if (filterName) {
      rows = rows.filter((r) => r.name === filterName)
    }
    if (filterSize) {
      rows = rows.filter((r) => r.size === filterSize)
    }
    if (filterType) {
      rows = rows.filter((r) => r.category === filterType)
    }
    return rows
  }, [rackRows, dashSearch, filterName, filterSize, filterType])

  const hasActiveFilters =
    dashSearch.trim() !== '' ||
    filterName !== '' ||
    filterSize !== '' ||
    filterType !== ''

  const lastUpdated = stockUpdates[0]?.date ?? '—'

  return (
    <>
      {/* Metric cards */}
      <section className="metrics">
        {/* Info card: total products */}
        <div className="metric">
          <div className="metric-icon">▣</div>
          <div>
            <span>Total products</span>
            <strong>{products.length}</strong>
          </div>
        </div>

        {/* Action card: Stock In */}
        <div
          className={`metric metric-clickable metric-action ${activeAction === 'stock_in' ? 'metric-active metric-action-in' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => toggleAction('stock_in')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              toggleAction('stock_in')
            }
          }}
          aria-pressed={activeAction === 'stock_in'}
          aria-label={`Stock In. Click to ${activeAction === 'stock_in' ? 'close' : 'open'} form.`}
        >
          <div className="metric-icon metric-icon-in">↓</div>
          <div>
            <strong className="metric-action-label">Stock In</strong>
          </div>
        </div>

        {/* Action card: Stock Out */}
        <div
          className={`metric metric-clickable metric-action ${activeAction === 'stock_out' ? 'metric-active metric-action-out' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => toggleAction('stock_out')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              toggleAction('stock_out')
            }
          }}
          aria-pressed={activeAction === 'stock_out'}
          aria-label={`Stock Out. Click to ${activeAction === 'stock_out' ? 'close' : 'open'} form.`}
        >
          <div className="metric-icon metric-icon-out">↑</div>
          <div>
            <strong className="metric-action-label">Stock Out</strong>
          </div>
        </div>

        {/* Info card: Last updated */}
        <div className="metric">
          <div className="metric-icon">◷</div>
          <div>
            <span>Last updated</span>
            <strong className="date-value">{lastUpdated}</strong>
          </div>
        </div>
      </section>

      {/* Inline Stock In form */}
      {activeAction === 'stock_in' && (
        <StockInForm
          products={products}
          identityName={identityName}
          onRefresh={onRefresh}
          onNotice={onNotice}
          onClose={() => setActiveAction(null)}
        />
      )}

      {/* Inline Stock Out form */}
      {activeAction === 'stock_out' && (
        <StockOutForm
          products={products}
          identityName={identityName}
          onRefresh={onRefresh}
          onNotice={onNotice}
          onClose={() => setActiveAction(null)}
        />
      )}

      {/* Dashboard product-rack table */}
      <section className="panel products-panel">
        <div className="table-tools dash-table-tools">
          <div className="dash-filters">
            <label className="search">
              ⌕{' '}
              <input
                value={dashSearch}
                onChange={(e) => setDashSearch(e.target.value)}
                placeholder="Search name, size or type"
              />
            </label>
            <div className="dash-filter-dropdowns">
              <label className="dash-filter-label">
                Product Name
                <SearchableSelect
                  id="dash-filter-name"
                  placeholder="All Names"
                  options={nameFilterOptions}
                  value={filterName}
                  onChange={setFilterName}
                />
              </label>
              <label className="dash-filter-label">
                Size
                <SearchableSelect
                  id="dash-filter-size"
                  placeholder="All Sizes"
                  options={sizeFilterOptions}
                  value={filterSize}
                  onChange={setFilterSize}
                />
              </label>
              <label className="dash-filter-label">
                Type
                <SearchableSelect
                  id="dash-filter-type"
                  placeholder="All Types"
                  options={typeFilterOptions}
                  value={filterType}
                  onChange={setFilterType}
                />
              </label>
            </div>
          </div>
          <div className="dash-tools-right">
            <span>{filteredRackRows.length} rows</span>
            {hasActiveFilters && (
              <button
                className="text-button dash-clear-filters"
                type="button"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product name</th>
                <th>Size</th>
                <th>Type</th>
                <th>Quantity</th>
                <th>Rack no.</th>
                <th>Adjust stock</th>
              </tr>
            </thead>
            <tbody>
              {filteredRackRows.map((r, idx) => (
                <tr key={`${r.productId}-${r.rackNumber}-${idx}`}>
                  <td data-label="Product name">
                    <b>{r.name}</b>
                  </td>
                  <td data-label="Size">{sizeLabel(r.size)}</td>
                  <td data-label="Type">{r.category}</td>
                  <td data-label="Quantity">
                    <span className="stock-count dash-rack-qty">
                      {r.quantity}
                    </span>
                  </td>
                  <td data-label="Rack no.">
                    {r.rackNumber === '—' ? (
                      <span className="no-racks">—</span>
                    ) : (
                      <code>{r.rackNumber}</code>
                    )}
                  </td>
                  <td data-label="Adjust stock">
                    <RackAdjustCell
                      productId={r.productId}
                      name={r.name}
                      rackNumber={r.rackNumber}
                      quantity={r.quantity}
                      identityName={identityName}
                      onNotice={onNotice}
                      onRefresh={onRefresh}
                    />
                  </td>
                </tr>
              ))}
              {filteredRackRows.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      textAlign: 'center',
                      color: 'var(--muted)',
                      padding: '28px',
                    }}
                  >
                    {products.length === 0
                      ? 'No products yet.'
                      : 'No results match your search.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

// ── SearchableSelect ───────────────────────────────────────────────────────────

type SearchableSelectOption = {
  value: string
  label: string
}

function SearchableSelect({
  id,
  placeholder,
  options,
  value,
  onChange,
  disabled,
}: {
  id?: string
  placeholder: string
  options: SearchableSelectOption[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)

  const selectedOption = options.find((o) => o.value === value)

  const filtered = useMemo(() => {
    if (!query.trim()) return options
    const q = query.toLowerCase()
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, query])

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
        setHighlightIdx(-1)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Scroll highlighted option into view
  useEffect(() => {
    if (!listRef.current || highlightIdx < 0) return
    const item = listRef.current.children[highlightIdx] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx])

  const openDropdown = () => {
    if (disabled) return
    setOpen(true)
    setQuery('')
    setHighlightIdx(-1)
  }

  const selectOption = (opt: SearchableSelectOption) => {
    onChange(opt.value)
    setOpen(false)
    setQuery('')
    setHighlightIdx(-1)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
      setHighlightIdx(-1)
      return
    }
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        openDropdown()
      }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightIdx >= 0 && filtered[highlightIdx]) {
        selectOption(filtered[highlightIdx])
      } else if (filtered.length === 1) {
        selectOption(filtered[0])
      }
    }
  }

  const displayValue = open ? query : (selectedOption?.label ?? '')

  return (
    <div
      ref={containerRef}
      className={`searchable-select${disabled ? ' searchable-select-disabled' : ''}`}
    >
      <input
        ref={inputRef}
        id={id}
        className="searchable-select-input"
        type="text"
        placeholder={disabled ? '—' : placeholder}
        value={displayValue}
        disabled={disabled}
        autoComplete="off"
        onFocus={openDropdown}
        onClick={openDropdown}
        onChange={(e) => {
          setQuery(e.target.value)
          setOpen(true)
          setHighlightIdx(-1)
        }}
        onKeyDown={handleKeyDown}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-autocomplete="list"
      />
      {open && !disabled && (
        <ul
          ref={listRef}
          className="searchable-select-options"
          role="listbox"
        >
          {filtered.length === 0 ? (
            <li className="searchable-select-empty">No matches</li>
          ) : (
            filtered.map((opt, idx) => (
              <li
                key={opt.value}
                className={`searchable-select-option${idx === highlightIdx ? ' searchable-select-option-active' : ''}${opt.value === value ? ' searchable-select-option-selected' : ''}`}
                role="option"
                aria-selected={opt.value === value}
                onMouseDown={(e) => {
                  // prevent input blur before click fires
                  e.preventDefault()
                  selectOption(opt)
                }}
                onMouseEnter={() => setHighlightIdx(idx)}
              >
                {opt.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

// ── StockInForm ────────────────────────────────────────────────────────────────

function StockInForm({
  products,
  identityName,
  onRefresh,
  onNotice,
  onClose,
}: {
  products: Product[]
  identityName: string
  onRefresh: () => void
  onNotice: (msg: string) => void
  onClose: () => void
}) {
  const [selectedName, setSelectedName] = useState('')
  const [selectedSize, setSelectedSize] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedRackNumber, setSelectedRackNumber] = useState('')
  const [useNewRack, setUseNewRack] = useState(false)
  const [newRackInput, setNewRackInput] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Distinct names
  const nameOptions = useMemo<SearchableSelectOption[]>(() => {
    const seen = new Set<string>()
    const opts: SearchableSelectOption[] = []
    for (const p of products) {
      if (!seen.has(p.name)) {
        seen.add(p.name)
        opts.push({ value: p.name, label: p.name })
      }
    }
    return opts
  }, [products])

  // Sizes for selected name (label shows inches suffix, value stays raw)
  const sizeOptions = useMemo<SearchableSelectOption[]>(() => {
    if (!selectedName) return []
    const seen = new Set<string>()
    const opts: SearchableSelectOption[] = []
    for (const p of products) {
      if (p.name === selectedName && !seen.has(p.size)) {
        seen.add(p.size)
        opts.push({ value: p.size, label: sizeLabel(p.size) })
      }
    }
    return opts
  }, [products, selectedName])

  // Categories for selected name+size
  const categoryOptions = useMemo<SearchableSelectOption[]>(() => {
    if (!selectedName || !selectedSize) return []
    const seen = new Set<string>()
    const opts: SearchableSelectOption[] = []
    for (const p of products) {
      if (p.name === selectedName && p.size === selectedSize && !seen.has(p.category)) {
        seen.add(p.category)
        opts.push({ value: p.category, label: p.category })
      }
    }
    return opts
  }, [products, selectedName, selectedSize])

  // Resolved product (unique by name+size+category)
  const resolvedProduct = useMemo(
    () =>
      selectedName && selectedSize && selectedCategory
        ? (products.find(
            (p) =>
              p.name === selectedName &&
              p.size === selectedSize &&
              p.category === selectedCategory,
          ) ?? null)
        : null,
    [products, selectedName, selectedSize, selectedCategory],
  )

  // Rack options for the searchable dropdown (existing racks + add-new sentinel)
  const rackOptions = useMemo<SearchableSelectOption[]>(() => {
    const opts: SearchableSelectOption[] = (resolvedProduct?.racks ?? []).map(
      (r) => ({
        value: r.rackNumber,
        label: `${r.rackNumber} (${r.quantity} in stock)`,
      }),
    )
    opts.push({ value: '__new__', label: '+ Add new rack' })
    return opts
  }, [resolvedProduct])

  const racks = resolvedProduct?.racks ?? []

  const handleNameChange = (name: string) => {
    setSelectedName(name)
    setSelectedSize('')
    setSelectedCategory('')
    setSelectedRackNumber('')
    setUseNewRack(false)
    setNewRackInput('')
  }

  const handleSizeChange = (size: string) => {
    setSelectedSize(size)
    setSelectedCategory('')
    setSelectedRackNumber('')
    setUseNewRack(false)
    setNewRackInput('')
  }

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat)
    setSelectedRackNumber('')
    setUseNewRack(false)
    setNewRackInput('')
  }

  const handleRackChange = (val: string) => {
    if (val === '__new__') {
      setUseNewRack(true)
      setSelectedRackNumber('')
      setNewRackInput('')
    } else {
      setUseNewRack(false)
      setSelectedRackNumber(val)
      setNewRackInput('')
    }
  }

  // When product resolves and it has zero racks, auto-switch to new-rack mode
  useEffect(() => {
    if (resolvedProduct && racks.length === 0) {
      setUseNewRack(true)
      setSelectedRackNumber('')
    } else if (resolvedProduct && racks.length > 0) {
      setUseNewRack(false)
    }
  }, [resolvedProduct, racks.length])

  const effectiveRack = useNewRack ? newRackInput.trim() : selectedRackNumber

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!supabase) return

    const data = new FormData(e.currentTarget)
    const quantity = Number(data.get('quantity'))

    if (!resolvedProduct) {
      onNotice('Select a product (Name, Size and Type).')
      return
    }
    if (!effectiveRack) {
      onNotice('Enter or select a rack number.')
      return
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      onNotice('Enter a valid quantity.')
      return
    }

    setSubmitting(true)
    const { error } = await supabase.from('stock_transactions').insert({
      product_id: resolvedProduct.id,
      rack_number: effectiveRack,
      movement_type: 'stock_in',
      quantity,
      updated_by: identityName,
    })
    setSubmitting(false)

    if (error) {
      onNotice(error.message)
      return
    }

    onNotice('Stock In recorded successfully.')
    onClose()
    onRefresh()
  }

  return (
    <section className="inline-form-panel panel">
      <div className="inline-form-heading">
        <h3>Stock In</h3>
        <button className="text-button" onClick={onClose}>
          Close ×
        </button>
      </div>
      <div className="inline-form-body">
        <form
          className="form"
          onSubmit={(e) => {
            void handleSubmit(e)
          }}
        >
          <div className="form-grid form-grid-3">
            <label>
              Select Product Name
              <SearchableSelect
                placeholder="Type to search…"
                options={nameOptions}
                value={selectedName}
                onChange={handleNameChange}
              />
            </label>
            <label>
              Select Size
              <SearchableSelect
                placeholder={selectedName ? 'Type to search…' : 'Choose name first'}
                options={sizeOptions}
                value={selectedSize}
                onChange={handleSizeChange}
                disabled={!selectedName}
              />
            </label>
            <label>
              Select Type
              <SearchableSelect
                placeholder={selectedSize ? 'Type to search…' : 'Choose size first'}
                options={categoryOptions}
                value={selectedCategory}
                onChange={handleCategoryChange}
                disabled={!selectedSize}
              />
            </label>
          </div>

          <div className="form-grid">
            <label>
              Rack No.
              {resolvedProduct ? (
                <>
                  {racks.length > 0 && !useNewRack ? (
                    <SearchableSelect
                      placeholder="Select a rack…"
                      options={rackOptions}
                      value={selectedRackNumber || ''}
                      onChange={handleRackChange}
                    />
                  ) : useNewRack ? (
                    <div className="new-rack-wrap">
                      <input
                        className="new-rack-input"
                        placeholder="e.g. A-01"
                        value={newRackInput}
                        onChange={(e) => setNewRackInput(e.target.value)}
                        autoFocus={racks.length > 0}
                      />
                      {racks.length > 0 && (
                        <button
                          type="button"
                          className="rack-cancel-new"
                          onClick={() => {
                            setUseNewRack(false)
                            setSelectedRackNumber('')
                          }}
                        >
                          Cancel — pick existing
                        </button>
                      )}
                    </div>
                  ) : (
                    /* zero racks — auto new rack mode */
                    <input
                      className="new-rack-input"
                      placeholder="e.g. A-01 (first rack for this product)"
                      value={newRackInput}
                      onChange={(e) => setNewRackInput(e.target.value)}
                    />
                  )}
                </>
              ) : (
                <input
                  disabled
                  placeholder="Resolve product first"
                  className="all-products-qty-readonly"
                />
              )}
            </label>
            <label>
              Quantity
              <input name="quantity" type="number" min="1" required />
            </label>
          </div>

          <button
            className="button primary"
            type="submit"
            disabled={submitting || !resolvedProduct}
          >
            {submitting ? 'Saving…' : 'Record Stock In'}
          </button>
        </form>
      </div>
    </section>
  )
}

// ── StockOutForm ───────────────────────────────────────────────────────────────

function StockOutForm({
  products,
  identityName,
  onRefresh,
  onNotice,
  onClose,
}: {
  products: Product[]
  identityName: string
  onRefresh: () => void
  onNotice: (msg: string) => void
  onClose: () => void
}) {
  const [selectedName, setSelectedName] = useState('')
  const [selectedSize, setSelectedSize] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('')
  const [selectedRackNumber, setSelectedRackNumber] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Distinct names
  const nameOptions = useMemo<SearchableSelectOption[]>(() => {
    const seen = new Set<string>()
    const opts: SearchableSelectOption[] = []
    for (const p of products) {
      if (!seen.has(p.name)) {
        seen.add(p.name)
        opts.push({ value: p.name, label: p.name })
      }
    }
    return opts
  }, [products])

  // Sizes for selected name (label shows inches suffix, value stays raw)
  const sizeOptions = useMemo<SearchableSelectOption[]>(() => {
    if (!selectedName) return []
    const seen = new Set<string>()
    const opts: SearchableSelectOption[] = []
    for (const p of products) {
      if (p.name === selectedName && !seen.has(p.size)) {
        seen.add(p.size)
        opts.push({ value: p.size, label: sizeLabel(p.size) })
      }
    }
    return opts
  }, [products, selectedName])

  // Categories for selected name+size
  const categoryOptions = useMemo<SearchableSelectOption[]>(() => {
    if (!selectedName || !selectedSize) return []
    const seen = new Set<string>()
    const opts: SearchableSelectOption[] = []
    for (const p of products) {
      if (p.name === selectedName && p.size === selectedSize && !seen.has(p.category)) {
        seen.add(p.category)
        opts.push({ value: p.category, label: p.category })
      }
    }
    return opts
  }, [products, selectedName, selectedSize])

  // Resolved product (unique by name+size+category)
  const resolvedProduct = useMemo(
    () =>
      selectedName && selectedSize && selectedCategory
        ? (products.find(
            (p) =>
              p.name === selectedName &&
              p.size === selectedSize &&
              p.category === selectedCategory,
          ) ?? null)
        : null,
    [products, selectedName, selectedSize, selectedCategory],
  )

  // Only racks with qty > 0
  const racksWithStock = useMemo(
    () => (resolvedProduct?.racks ?? []).filter((r) => r.quantity > 0),
    [resolvedProduct],
  )

  const rackOptions = useMemo<SearchableSelectOption[]>(
    () =>
      racksWithStock.map((r) => ({
        value: r.rackNumber,
        label: `${r.rackNumber} (${r.quantity} available)`,
      })),
    [racksWithStock],
  )

  const selectedRackObj = racksWithStock.find(
    (r) => r.rackNumber === selectedRackNumber,
  )
  const availableQty = selectedRackObj?.quantity ?? 0

  const hasStock = racksWithStock.length > 0

  const handleNameChange = (name: string) => {
    setSelectedName(name)
    setSelectedSize('')
    setSelectedCategory('')
    setSelectedRackNumber('')
  }

  const handleSizeChange = (size: string) => {
    setSelectedSize(size)
    setSelectedCategory('')
    setSelectedRackNumber('')
  }

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat)
    setSelectedRackNumber('')
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (!supabase) return

    const data = new FormData(e.currentTarget)
    const quantity = Number(data.get('quantity'))
    const rack = selectedRackNumber.trim()

    if (!resolvedProduct) {
      onNotice('Select a product (Name, Size and Type).')
      return
    }
    if (!rack) {
      onNotice('Select a rack.')
      return
    }
    if (!Number.isInteger(quantity) || quantity <= 0) {
      onNotice('Enter a valid quantity.')
      return
    }
    if (quantity > availableQty) {
      onNotice(
        `Only ${availableQty} items available on rack ${rack} for this product.`,
      )
      return
    }

    setSubmitting(true)
    const { error } = await supabase.from('stock_transactions').insert({
      product_id: resolvedProduct.id,
      rack_number: rack,
      movement_type: 'stock_out',
      quantity,
      updated_by: identityName,
    })
    setSubmitting(false)

    if (error) {
      onNotice(error.message)
      return
    }

    onNotice('Stock Out recorded successfully.')
    onClose()
    onRefresh()
  }

  return (
    <section className="inline-form-panel panel">
      <div className="inline-form-heading">
        <h3>Stock Out</h3>
        <button className="text-button" onClick={onClose}>
          Close ×
        </button>
      </div>
      <div className="inline-form-body">
        <form
          className="form"
          onSubmit={(e) => {
            void handleSubmit(e)
          }}
        >
          <div className="form-grid form-grid-3">
            <label>
              Select Product Name
              <SearchableSelect
                placeholder="Type to search…"
                options={nameOptions}
                value={selectedName}
                onChange={handleNameChange}
              />
            </label>
            <label>
              Select Size
              <SearchableSelect
                placeholder={selectedName ? 'Type to search…' : 'Choose name first'}
                options={sizeOptions}
                value={selectedSize}
                onChange={handleSizeChange}
                disabled={!selectedName}
              />
            </label>
            <label>
              Select Type
              <SearchableSelect
                placeholder={selectedSize ? 'Type to search…' : 'Choose size first'}
                options={categoryOptions}
                value={selectedCategory}
                onChange={handleCategoryChange}
                disabled={!selectedSize}
              />
            </label>
          </div>

          <div className="form-grid">
            <label>
              Rack No.
              {resolvedProduct ? (
                hasStock ? (
                  <SearchableSelect
                    placeholder="Select a rack…"
                    options={rackOptions}
                    value={selectedRackNumber}
                    onChange={setSelectedRackNumber}
                  />
                ) : (
                  <input
                    disabled
                    value="No stock available for this product"
                    className="all-products-qty-readonly"
                  />
                )
              ) : (
                <input
                  disabled
                  placeholder="Resolve product first"
                  className="all-products-qty-readonly"
                />
              )}
            </label>
            <label>
              Quantity{availableQty > 0 && <span>max {availableQty}</span>}
              <input
                name="quantity"
                type="number"
                min="1"
                max={availableQty > 0 ? availableQty : undefined}
                required
                disabled={!hasStock || !selectedRackNumber}
              />
            </label>
          </div>

          {resolvedProduct && !hasStock && (
            <p className="empty-state" style={{ margin: 0, padding: 0 }}>
              This product has no stock on any rack. Record a Stock In first.
            </p>
          )}

          <button
            className="button primary"
            type="submit"
            disabled={submitting || !resolvedProduct || !hasStock || !selectedRackNumber}
          >
            {submitting ? 'Saving…' : 'Record Stock Out'}
          </button>
        </form>
      </div>
    </section>
  )
}

// ── Products page ──────────────────────────────────────────────────────────────

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
            placeholder="Search name, size or category"
          />
        </label>
        <span>{products.length} products</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Product name</th>
              <th>Size</th>
              <th>Type</th>
              <th>Quantity</th>
              <th>Racks</th>
              <th>Last updated</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td data-label="Product name">
                  <b>{p.name}</b>
                </td>
                <td data-label="Size">{sizeLabel(p.size)}</td>
                <td data-label="Type">{p.category}</td>
                <td data-label="Quantity">
                  <span className="stock-count">{p.quantity}</span>
                </td>
                <td data-label="Racks">
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
                <td data-label="Last updated">
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

// ── History page ───────────────────────────────────────────────────────────────

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
              <th>Type</th>
              <th>Quantity</th>
              <th>Rack</th>
              <th>Updated by</th>
            </tr>
          </thead>
          <tbody>
            {stockUpdates.map((m) => (
              <tr key={m.id}>
                <td data-label="Date & time">{m.date}</td>
                <td data-label="Product">
                  <b>{m.product}</b>
                </td>
                <td data-label="Type">
                  <span
                    className={`type-pill ${m.type === 'Stock In' ? 'in' : 'out'}`}
                  >
                    {m.type}
                  </span>
                </td>
                <td data-label="Quantity">
                  <b>{m.quantity}</b>
                </td>
                <td data-label="Rack">
                  <code>{m.rack}</code>
                </td>
                <td data-label="Updated by">{m.by}</td>
              </tr>
            ))}
            {stockUpdates.length === 0 && (
              <tr>
                <td
                  colSpan={6}
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
