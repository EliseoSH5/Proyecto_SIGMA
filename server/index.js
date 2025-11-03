// server/index.js
import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { Pool } from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

// Rutas (IMPORTS ARRIBA)
import buildOperativoRoutes from './routes/operativo.js';
import buildOperativoExport from './routes/operativo_export.js';

dotenv.config();

const app = express();
console.log('DB cfg =>', process.env.PGHOST, process.env.PGPORT, process.env.PGDATABASE, process.env.PGUSER);

// Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Seguridad / parseo
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json());
app.use(cookieParser());

// Logger simple
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// DB
const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

// Utils
function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES || '1d',
  });
}
function authMiddleware(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).json({ ok: false, error: 'No autorizado' });
  try {
    const data = jwt.verify(token, process.env.JWT_SECRET);
    req.user = data;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Token inválido' });
  }
}

// ====== Rutas API (auth) ======
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, remember } = req.body || {};
    if (!email || !password) return res.status(400).json({ ok: false, error: 'Faltan campos' });

    const { rows } = await pool.query(
      'SELECT id, full_name, email, password_hash FROM users WHERE email=$1 LIMIT 1',
      [email],
    );
    if (!rows.length) return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ ok: false, error: 'Credenciales inválidas' });

    const token = signToken({ id: user.id, email: user.email, fullName: user.full_name });

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // true si sirves por HTTPS
      maxAge: remember ? 1000 * 60 * 60 * 24 * 7 : undefined, // 7 días si “Recordarme”
    });

    return res.json({ ok: true, user: { id: user.id, email: user.email, fullName: user.full_name } });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false, error: 'Error del servidor' });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  return res.json({ ok: true, user: req.user });
});

app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie('token', { httpOnly: true, sameSite: 'lax', secure: false });
  res.json({ ok: true });
});

// === Proteger páginas HTML (sólo autenticados) ===
app.get('/dashboard.html', authMiddleware, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'dashboard.html'));
});

app.get('/operativo_matriz.html',       authMiddleware, (_req,res)=>res.sendFile(path.join(PUBLIC_DIR,'operativo_matriz.html')));
app.get('/operativo_pozo_form.html',    authMiddleware, (_req,res)=>res.sendFile(path.join(PUBLIC_DIR,'operativo_pozo_form.html')));
app.get('/operativo_etapas.html',       authMiddleware, (_req,res)=>res.sendFile(path.join(PUBLIC_DIR,'operativo_etapas.html')));
app.get('/operativo_materiales.html',   authMiddleware, (_req,res)=>res.sendFile(path.join(PUBLIC_DIR,'operativo_materiales.html')));
app.get('/operativo_material_form.html',authMiddleware, (_req,res)=>res.sendFile(path.join(PUBLIC_DIR,'operativo_material_form.html')));
app.get('/operativo_alertas.html',      authMiddleware, (_req,res)=>res.sendFile(path.join(PUBLIC_DIR,'operativo_alertas.html')));
app.get('/operativo_reportes.html',     authMiddleware, (_req,res)=>res.sendFile(path.join(PUBLIC_DIR,'operativo_reportes.html')));

// ====== Routers de módulo Operativo ======
app.use('/api/operativo', authMiddleware, buildOperativoRoutes(pool));
// Protegemos también la exportación (si prefieres pública, quita authMiddleware aquí)
app.use('/api/operativo', authMiddleware, buildOperativoExport(pool));

// ====== Servir frontend estático ======
app.use(express.static(PUBLIC_DIR));
app.get('*', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

// ====== Seeder opcional (crea usuario si no existe) ======
async function seed(email, full, pass) {
  const hash = await bcrypt.hash(pass, 10);
  await pool.query(
    `INSERT INTO users (full_name, email, password_hash)
     VALUES ($1,$2,$3)
     ON CONFLICT (email) DO NOTHING`,
    [full, email, hash],
  );
  console.log(`Usuario semilla: ${email} / ${pass}`);
}

const PORT = Number(process.env.PORT || 3000);
if (process.argv[2] === 'seed') {
  console.log(process.argv);
  const email = process.argv[3];
  const full = process.argv[4];
  const pass = process.argv[5];
  seed(email, full, pass).then(() => process.exit(0));
} else {
  app.listen(PORT, () => console.log(`SIGMA server en http://localhost:${PORT}`));
}
