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
import rateLimit from 'express-rate-limit';

// Rutas (IMPORTS ARRIBA)
import buildOperativoRoutes from './routes/operativo.js';
import buildOperativoExport from './routes/operativo_export.js';

dotenv.config();

const app = express();

// Si más adelante pones SIGMA detrás de un proxy (Nginx, etc.),
// esto ayuda a que express-rate-limit use la IP real del cliente.
app.set('trust proxy', 1);

// Ocultar cabecera X-Powered-By: Express
app.disable('x-powered-by');

console.log(
  'DB cfg =>',
  process.env.PGHOST,
  process.env.PGPORT,
  process.env.PGDATABASE,
  process.env.PGUSER,
);

// === Entorno (dev / prod) ===
const isProd = process.env.NODE_ENV === 'production';

function buildCookieOptions(remember) {
  return {
    httpOnly: true,
    sameSite: isProd ? 'strict' : 'lax',
    secure: isProd, // en prod requiere HTTPS
    // 7 días si “Recordarme”, 8 horas si no
    maxAge: remember
      ? 1000 * 60 * 60 * 24 * 7
      : 1000 * 60 * 60 * 8,
  };
}

// Rate limiting para login: máx 10 intentos cada 15 minutos por IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,                  // máximo 10 intentos por ventana
  standardHeaders: true,    // X-RateLimit-* headers
  legacyHeaders: false,     // desactiva X-RateLimit-*
  message: {
    ok: false,
    error: 'Demasiados intentos de inicio de sesión. Intenta de nuevo más tarde.',
  },
});


// Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Seguridad / parseo
app.use(helmet({ crossOriginResourcePolicy: false }));

// Limitar tamaño de JSON (1 MB es más que suficiente para tus payloads actuales)
app.use(express.json({ limit: '1mb' }));

// Limitar también formularios urlencoded
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.use(cookieParser());



// Logger simple
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// CSRF ligero
app.use(csrfGuard);

// CSRF ligero: valida Origin / Referer para métodos que modifican estado
function csrfGuard(req, res, next) {
  const method = req.method.toUpperCase();

  // Sólo aplicamos a métodos que cambian estado
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    return next();
  }

  const origin = req.headers.origin;
  const referer = req.headers.referer;
  const host = req.headers.host;

  // Si no hay Origin ni Referer, de momento lo permitimos (modo "ligero")
  if (!origin && !referer) {
    return next();
  }

  try {
    if (origin) {
      const url = new URL(origin);
      if (url.host !== host) {
        console.warn('CSRF bloqueado por Origin:', origin, 'host esperado:', host);
        return res.status(403).json({ ok: false, error: 'Solicitud CSRF bloqueada (origin)' });
      }
      return next();
    }

    if (referer) {
      const url = new URL(referer);
      if (url.host !== host) {
        console.warn('CSRF bloqueado por Referer:', referer, 'host esperado:', host);
        return res.status(403).json({ ok: false, error: 'Solicitud CSRF bloqueada (referer)' });
      }
      return next();
    }

    // Por si acaso
    return next();
  } catch (e) {
    console.warn('Error analizando Origin/Referer para CSRF:', e);
    return res.status(403).json({ ok: false, error: 'Solicitud CSRF bloqueada' });
  }
}


// DB
const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
});

// Utils
function signToken(payload, remember) {
  // 7 días si “Recordarme”, si no usa JWT_EXPIRES o 8h por defecto
  const expiresIn = remember ? '7d' : (process.env.JWT_EXPIRES || '8h');
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn });
}

function authMiddleware(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ ok: false, error: 'No autorizado' });
  }
  try {
    const data = jwt.verify(token, process.env.JWT_SECRET);
    req.user = data;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Token inválido' });
  }
}

// ====== Rutas API (auth) ======
app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { email, password, remember } = req.body || {};
    if (!email || !password) {
      return res
        .status(400)
        .json({ ok: false, error: 'Faltan campos' });
    }

    const { rows } = await pool.query(
      'SELECT id, full_name, email, password_hash, role FROM users WHERE email=$1 LIMIT 1',
      [email],
    );
    if (!rows.length) {
      return res
        .status(401)
        .json({ ok: false, error: 'Credenciales inválidas' });
    }

    const user = rows[0];
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res
        .status(401)
        .json({ ok: false, error: 'Credenciales inválidas' });
    }

    const rememberFlag = !!remember;

    const token = signToken(
      { id: user.id, email: user.email, fullName: user.full_name, role: user.role },
      rememberFlag,
    );

    res.cookie('token', token, buildCookieOptions(rememberFlag));

    return res.json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
      },
    });

  } catch (e) {
    console.error(e);
    return res
      .status(500)
      .json({ ok: false, error: 'Error interno. Contacta al administrador.' });
  }

});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  return res.json({ ok: true, user: req.user });
});

app.post('/api/auth/logout', (_req, res) => {
  // limpiamos la cookie con las mismas opciones base
  res.clearCookie('token', buildCookieOptions(false));
  res.json({ ok: true });
});

// === Proteger páginas HTML (sólo autenticados) ===
app.get('/dashboard.html', authMiddleware, (_req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'dashboard.html'));
});

app.get(
  '/operativo_matriz.html',
  authMiddleware,
  (_req, res) =>
    res.sendFile(path.join(PUBLIC_DIR, 'operativo_matriz.html')),
);
app.get(
  '/operativo_pozo_form.html',
  authMiddleware,
  (_req, res) =>
    res.sendFile(path.join(PUBLIC_DIR, 'operativo_pozo_form.html')),
);
app.get(
  '/operativo_etapas.html',
  authMiddleware,
  (_req, res) =>
    res.sendFile(path.join(PUBLIC_DIR, 'operativo_etapas.html')),
);
app.get(
  '/operativo_materiales.html',
  authMiddleware,
  (_req, res) =>
    res.sendFile(path.join(PUBLIC_DIR, 'operativo_materiales.html')),
);
app.get(
  '/operativo_material_form.html',
  authMiddleware,
  (_req, res) =>
    res.sendFile(path.join(PUBLIC_DIR, 'operativo_material_form.html')),
);
app.get(
  '/operativo_alertas.html',
  authMiddleware,
  (_req, res) =>
    res.sendFile(path.join(PUBLIC_DIR, 'operativo_alertas.html')),
);
app.get(
  '/operativo_reportes.html',
  authMiddleware,
  (_req, res) =>
    res.sendFile(path.join(PUBLIC_DIR, 'operativo_reportes.html')),
);

// ====== Routers de módulo Operativo ======
app.use(
  '/api/operativo',
  authMiddleware,
  buildOperativoRoutes(pool),
);
// Protegemos también la exportación (si prefieres pública, quita authMiddleware aquí)
app.use(
  '/api/operativo',
  authMiddleware,
  buildOperativoExport(pool),
);


// 404 genérico para cualquier ruta /api/* que no exista
app.use('/api', (req, res) => {
  res.status(404).json({ ok: false, error: 'Ruta no encontrada' });
});

// ====== Servir frontend estático ======
app.use(express.static(PUBLIC_DIR));
app.get('*', (_req, res) =>
  res.sendFile(path.join(PUBLIC_DIR, 'index.html')),
);

// ====== Seeder opcional (crea usuario si no existe) ======
async function seed(email, fullName, password, role = 'viewer') {
  const hash = await bcrypt.hash(password, 10);

  await pool.query(
    `INSERT INTO users (email, full_name, password_hash, role)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE
       SET full_name = EXCLUDED.full_name,
           password_hash = EXCLUDED.password_hash,
           role = EXCLUDED.role`,
    [email, fullName, hash, role]
  );

  console.log(`Usuario seed creado/actualizado: ${email} (${role})`);
}


// ====== Manejo global de errores ======

// saber si la ruta es de API
function isApiRequest(req) {
  return req.path.startsWith('/api/');
}

// middleware de error
// IMPORTANTE: debe ir después de todas las rutas y middlewares
app.use((err, req, res, next) => {
  console.error('Error no controlado:', err);

  if (res.headersSent) {
    return next(err);
  }

  if (isApiRequest(req)) {
    // Nunca exponemos detalles técnicos al frontend
    return res
      .status(500)
      .json({ ok: false, error: 'Error interno. Contacta al administrador.' });
  }

  // Para páginas HTML, respuesta sencilla
  return res
    .status(500)
    .send('Error interno. Contacta al administrador.');
});

// users
const PORT = Number(process.env.PORT || 3000);

if (process.argv[2] === 'seed') {
  console.log(process.argv);

  const email = process.argv[3];
  const full = process.argv[4];
  const pass = process.argv[5];
  const role = process.argv[6] || 'viewer'; // por defecto viewer

  const allowedRoles = ['admin', 'editor', 'viewer'];

  if (!email || !full || !pass) {
    console.error('Uso: node index.js seed <email> "<Nombre completo>" <password> [rol]');
    console.error('Roles válidos (opcional): admin | editor | viewer');
    process.exit(1);
  }

  if (!allowedRoles.includes(role)) {
    console.error(`Rol inválido: ${role}. Roles válidos: admin | editor | viewer`);
    process.exit(1);
  }

  seed(email, full, pass, role)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error en seed:', err);
      process.exit(1);
    });
} else {
  app.listen(PORT, () =>
    console.log(`SIGMA server en http://localhost:${PORT}`),
  );
}
