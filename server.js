require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3001;

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Simple session store (in-memory – fine for single-instance / demo)
const sessions = new Map();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- AUTH MIDDLEWARE ----------
function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (!token || !sessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  req.admin = sessions.get(token);
  next();
}

// ---------- AUTH ROUTES ----------
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const adminEmail = process.env.ADMIN_EMAIL || 'alex@vanta.pk';
  const adminPass = process.env.ADMIN_PASSWORD || 'vantaadmin2025';

  if (email === adminEmail && password === adminPass) {
    const token = uuidv4();
    sessions.set(token, { email, loginAt: Date.now() });
    // Clean old sessions occasionally
    if (sessions.size > 50) {
      const keys = [...sessions.keys()];
      keys.slice(0, 20).forEach(k => sessions.delete(k));
    }
    return res.json({ token, email });
  }
  res.status(401).json({ error: 'Invalid credentials' });
});

app.post('/api/logout', requireAuth, (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  sessions.delete(token);
  res.json({ success: true });
});

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ email: req.admin.email });
});

// ---------- DASHBOARD STATS ----------
app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const { data: orders } = await supabase.from('vanta_orders').select('total, status, created_at, items');
    const { data: products } = await supabase.from('vanta_products').select('id, name, stock');

    const totalOrders = orders?.length || 0;
    const totalSales = (orders || [])
      .filter(o => o.status !== 'Cancelled')
      .reduce((s, o) => s + Number(o.total || 0), 0);

    // Best sellers
    const productCount = {};
    (orders || []).forEach(o => {
      if (o.status === 'Cancelled') return;
      (o.items || []).forEach(item => {
        const key = item.product_name || item.product_id;
        productCount[key] = (productCount[key] || 0) + (item.quantity || 1);
      });
    });
    const bestSellers = Object.entries(productCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, qty]) => ({ name, qty }));

    const lowStock = (products || []).filter(p => p.stock < 10).length;

    res.json({
      totalOrders,
      totalSales,
      bestSellers,
      lowStock,
      productCount: products?.length || 0
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load stats' });
  }
});

// ---------- PRODUCTS ----------
app.get('/api/products', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vanta_products')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

app.post('/api/products', requireAuth, async (req, res) => {
  try {
    const p = req.body;
    if (!p.name || !p.price) {
      return res.status(400).json({ error: 'Name and price are required' });
    }
    const { data, error } = await supabase
      .from('vanta_products')
      .insert({
        name: p.name,
        description: p.description || '',
        price: Number(p.price),
        category: p.category || 'T-Shirts',
        image_url: p.image_url || '',
        sizes: p.sizes || ['S', 'M', 'L', 'XL'],
        colors: p.colors || ['Black'],
        stock: Number(p.stock) || 0,
        is_active: p.is_active !== false
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

app.put('/api/products/:id', requireAuth, async (req, res) => {
  try {
    const p = req.body;
    const update = {
      name: p.name,
      description: p.description,
      price: Number(p.price),
      category: p.category,
      image_url: p.image_url,
      sizes: p.sizes,
      colors: p.colors,
      stock: Number(p.stock),
      is_active: p.is_active
    };
    const { data, error } = await supabase
      .from('vanta_products')
      .update(update)
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update product' });
  }
});

app.delete('/api/products/:id', requireAuth, async (req, res) => {
  try {
    const { error } = await supabase
      .from('vanta_products')
      .delete()
      .eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete product' });
  }
});

// Image upload to Supabase Storage
app.post('/api/upload', requireAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const ext = path.extname(req.file.originalname) || '.jpg';
    const fileName = `products/${uuidv4()}${ext}`;

    const { data, error } = await supabase.storage
      .from('product-images')
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: false
      });

    if (error) throw error;

    const { data: publicUrl } = supabase.storage
      .from('product-images')
      .getPublicUrl(fileName);

    res.json({ url: publicUrl.publicUrl });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed. Ensure the product-images bucket exists and is public.' });
  }
});

// ---------- ORDERS ----------
app.get('/api/orders', requireAuth, async (req, res) => {
  try {
    const { status, search } = req.query;
    let query = supabase
      .from('vanta_orders')
      .select('*')
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;

    let orders = data || [];
    if (search) {
      const q = search.toLowerCase();
      orders = orders.filter(o =>
        o.order_number?.toLowerCase().includes(q) ||
        o.full_name?.toLowerCase().includes(q) ||
        o.phone?.includes(q) ||
        o.email?.toLowerCase().includes(q)
      );
    }
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

app.get('/api/orders/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('vanta_orders')
      .select('*')
      .eq('id', req.params.id)
      .single();
    if (error || !data) return res.status(404).json({ error: 'Order not found' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

app.patch('/api/orders/:id/status', requireAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['New', 'Confirmed', 'Dispatched', 'Delivered', 'Cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const { data, error } = await supabase
      .from('vanta_orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// Health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', app: 'vanta-admin' });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`VANTA Admin running on http://localhost:${PORT}`);
  });
}

module.exports = app;