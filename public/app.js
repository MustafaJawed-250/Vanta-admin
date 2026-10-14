/* VANTA Admin Dashboard */
const API = '/api';
let token = localStorage.getItem('vanta_admin_token') || '';
let currentView = 'overview';

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

// ---------- AUTH ----------
async function checkAuth() {
  if (!token) return showLogin();
  try {
    const res = await fetch(`${API}/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Unauthorized');
    const data = await res.json();
    $('#adminEmail').textContent = data.email;
    showDashboard();
    loadOverview();
  } catch {
    token = '';
    localStorage.removeItem('vanta_admin_token');
    showLogin();
  }
}

function showLogin() {
  $('#loginScreen').classList.remove('hidden');
  $('#dashboard').classList.add('hidden');
}

function showDashboard() {
  $('#loginScreen').classList.add('hidden');
  $('#dashboard').classList.remove('hidden');
}

$('#loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('#loginEmail').value.trim();
  const password = $('#loginPassword').value;
  $('#loginError').textContent = '';
  try {
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    token = data.token;
    localStorage.setItem('vanta_admin_token', token);
    $('#adminEmail').textContent = data.email;
    showDashboard();
    loadOverview();
  } catch (err) {
    $('#loginError').textContent = err.message;
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  try {
    await fetch(`${API}/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch {}
  token = '';
  localStorage.removeItem('vanta_admin_token');
  showLogin();
});

// ---------- NAV ----------
$$('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentView = btn.dataset.view;
    $$('.view').forEach(v => v.classList.add('hidden'));
    $(`#view-${currentView}`).classList.remove('hidden');
    $('#pageTitle').textContent = btn.textContent;
    if (currentView === 'overview') loadOverview();
    if (currentView === 'products') loadProducts();
    if (currentView === 'orders') loadOrders();
  });
});

// ---------- HELPERS ----------
function authHeaders() {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

function formatPrice(n) {
  return `PKR ${Number(n).toLocaleString('en-PK')}`;
}

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-PK', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

// ---------- OVERVIEW ----------
async function loadOverview() {
  try {
    const res = await fetch(`${API}/stats`, { headers: authHeaders() });
    const data = await res.json();
    $('#statOrders').textContent = data.totalOrders;
    $('#statSales').textContent = formatPrice(data.totalSales);
    $('#statProducts').textContent = data.productCount;
    $('#statLowStock').textContent = data.lowStock;

    const list = $('#bestSellers');
    if (!data.bestSellers?.length) {
      list.innerHTML = '<li>No sales data yet</li>';
    } else {
      list.innerHTML = data.bestSellers
        .map(b => `<li><span>${b.name}</span><span>${b.qty} sold</span></li>`)
        .join('');
    }
  } catch (err) {
    console.error(err);
  }
}

// ---------- PRODUCTS ----------
async function loadProducts() {
  try {
    const res = await fetch(`${API}/products`, { headers: authHeaders() });
    const products = await res.json();
    const tbody = $('#productsTable');
    if (!products.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#666">No products yet</td></tr>';
      return;
    }
    tbody.innerHTML = products.map(p => `
      <tr>
        <td><img class="thumb" src="${p.image_url || 'https://via.placeholder.com/48x60?text=—'}" alt="" /></td>
        <td>${p.name}</td>
        <td>${p.category}</td>
        <td>${formatPrice(p.price)}</td>
        <td>${p.stock}</td>
        <td>${p.is_active ? 'Yes' : 'No'}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="editProduct('${p.id}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="deleteProduct('${p.id}')">Delete</button>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

let allProductsCache = [];

async function editProduct(id) {
  if (!allProductsCache.length) {
    const res = await fetch(`${API}/products`, { headers: authHeaders() });
    allProductsCache = await res.json();
  }
  const p = allProductsCache.find(x => x.id === id);
  if (!p) return;

  $('#productModalTitle').textContent = 'Edit Product';
  $('#productId').value = p.id;
  $('#pName').value = p.name;
  $('#pDesc').value = p.description || '';
  $('#pPrice').value = p.price;
  $('#pStock').value = p.stock;
  $('#pCategory').value = p.category;
  $('#pSizes').value = (p.sizes || []).join(', ');
  $('#pColors').value = (p.colors || []).join(', ');
  $('#pImageUrl').value = p.image_url || '';
  $('#pActive').checked = p.is_active !== false;
  if (p.image_url) {
    $('#pImagePreview').src = p.image_url;
    $('#pImagePreview').classList.remove('hidden');
  } else {
    $('#pImagePreview').classList.add('hidden');
  }
  $('#productModal').classList.add('open');
}

async function deleteProduct(id) {
  if (!confirm('Delete this product?')) return;
  try {
    const res = await fetch(`${API}/products/${id}`, {
      method: 'DELETE',
      headers: authHeaders()
    });
    if (!res.ok) throw new Error('Delete failed');
    loadProducts();
  } catch (err) {
    alert(err.message);
  }
}

$('#addProductBtn').addEventListener('click', () => {
  $('#productModalTitle').textContent = 'Add Product';
  $('#productForm').reset();
  $('#productId').value = '';
  $('#pImageUrl').value = '';
  $('#pImagePreview').classList.add('hidden');
  $('#pActive').checked = true;
  $('#productModal').classList.add('open');
});

$('#productModalClose').addEventListener('click', () => {
  $('#productModal').classList.remove('open');
});

$('#pImage').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('image', file);
  try {
    const res = await fetch(`${API}/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    $('#pImageUrl').value = data.url;
    $('#pImagePreview').src = data.url;
    $('#pImagePreview').classList.remove('hidden');
  } catch (err) {
    alert(err.message);
  }
});

$('#productForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = $('#productId').value;
  const payload = {
    name: $('#pName').value.trim(),
    description: $('#pDesc').value.trim(),
    price: Number($('#pPrice').value),
    stock: Number($('#pStock').value),
    category: $('#pCategory').value,
    sizes: $('#pSizes').value.split(',').map(s => s.trim()).filter(Boolean),
    colors: $('#pColors').value.split(',').map(c => c.trim()).filter(Boolean),
    image_url: $('#pImageUrl').value,
    is_active: $('#pActive').checked
  };

  try {
    const url = id ? `${API}/products/${id}` : `${API}/products`;
    const method = id ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: authHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Save failed');
    }
    $('#productModal').classList.remove('open');
    allProductsCache = [];
    loadProducts();
  } catch (err) {
    alert(err.message);
  }
});

// ---------- ORDERS ----------
async function loadOrders() {
  const status = $('#statusFilter').value;
  const search = $('#orderSearch').value.trim();
  try {
    let url = `${API}/orders?status=${status}`;
    if (search) url += `&search=${encodeURIComponent(search)}`;
    const res = await fetch(url, { headers: authHeaders() });
    const orders = await res.json();
    const tbody = $('#ordersTable');
    if (!orders.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#666">No orders found</td></tr>';
      return;
    }
    tbody.innerHTML = orders.map(o => `
      <tr>
        <td><strong>${o.order_number}</strong></td>
        <td>${o.full_name}<br><small style="color:#888">${o.phone}</small></td>
        <td>${formatPrice(o.total)}</td>
        <td><span class="badge badge-${o.status.toLowerCase()}">${o.status}</span></td>
        <td>${formatDate(o.created_at)}</td>
        <td><button class="btn btn-sm btn-primary" onclick="viewOrder('${o.id}')">View</button></td>
      </tr>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

$('#statusFilter').addEventListener('change', loadOrders);
$('#orderSearch').addEventListener('input', () => {
  clearTimeout(window._searchTimer);
  window._searchTimer = setTimeout(loadOrders, 300);
});

async function viewOrder(id) {
  try {
    const res = await fetch(`${API}/orders/${id}`, { headers: authHeaders() });
    const o = await res.json();
    if (!res.ok) throw new Error('Failed to load order');

    $('#orderModalTitle').textContent = o.order_number;
    $('#orderDetailBody').innerHTML = `
      <div class="order-meta">
        <div><span>Customer</span><br>${o.full_name}</div>
        <div><span>Phone</span><br>${o.phone}</div>
        <div><span>Email</span><br>${o.email}</div>
        <div><span>City</span><br>${o.city}</div>
        <div style="grid-column:1/-1"><span>Address</span><br>${o.address}</div>
        <div><span>Payment</span><br>${o.payment_method}</div>
        <div><span>Status</span><br><span class="badge badge-${o.status.toLowerCase()}">${o.status}</span></div>
      </div>
      <div class="order-items">
        <h4 style="margin-bottom:12px;font-size:0.85rem">Items</h4>
        ${(o.items || []).map(item => `
          <div class="order-item">
            <img src="${item.product_image || ''}" alt="" />
            <div>
              <strong>${item.product_name}</strong><br>
              <small>${item.size} / ${item.color} × ${item.quantity}</small><br>
              ${formatPrice(item.line_total)}
            </div>
          </div>
        `).join('')}
      </div>
      <div style="text-align:right;font-size:0.95rem">
        <div>Subtotal: ${formatPrice(o.subtotal)}</div>
        <div>Delivery: ${formatPrice(o.delivery_charge)}</div>
        <div style="font-weight:700;margin-top:6px">Total: ${formatPrice(o.total)}</div>
      </div>
      <div class="status-actions">
        <span style="width:100%;font-size:0.75rem;color:#888;margin-bottom:4px">Update Status:</span>
        ${['New','Confirmed','Dispatched','Delivered','Cancelled'].map(s => `
          <button class="btn btn-sm ${s === o.status ? 'btn-primary' : ''}" 
            style="${s === o.status ? '' : 'background:transparent;color:#ccc;border:1px solid #444'}"
            onclick="updateStatus('${o.id}','${s}')">${s}</button>
        `).join('')}
      </div>
    `;
    $('#orderModal').classList.add('open');
  } catch (err) {
    alert(err.message);
  }
}

async function updateStatus(id, status) {
  try {
    const res = await fetch(`${API}/orders/${id}/status`, {
      method: 'PATCH',
      headers: authHeaders(),
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('Update failed');
    $('#orderModal').classList.remove('open');
    loadOrders();
    if (currentView === 'overview') loadOverview();
  } catch (err) {
    alert(err.message);
  }
}

$('#orderModalClose').addEventListener('click', () => {
  $('#orderModal').classList.remove('open');
});

// Close modals on overlay
['productModal', 'orderModal'].forEach(id => {
  $(`#${id}`).addEventListener('click', (e) => {
    if (e.target.id === id) $(`#${id}`).classList.remove('open');
  });
});

// Init
checkAuth();

// Expose for inline onclick
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.viewOrder = viewOrder;
window.updateStatus = updateStatus;