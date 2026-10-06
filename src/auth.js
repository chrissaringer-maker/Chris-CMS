import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SESSION_TTL_MS = 7 * 24 * 3600 * 1000;
const COOKIE = 'cms_session';

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

// Legt beim ersten Start einen Admin an. Passwort aus ADMIN_PASSWORD oder zufällig (wird einmalig ausgegeben).
export function ensureAdmin(db, log = console.log) {
  if (db.prepare('SELECT 1 FROM users LIMIT 1').get()) return;
  const username = process.env.ADMIN_USER || 'admin';
  const generated = !process.env.ADMIN_PASSWORD;
  const password = process.env.ADMIN_PASSWORD || randomBytes(9).toString('base64url');
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hashPassword(password));
  log(`Admin angelegt: Benutzer "${username}"${generated ? `, Passwort "${password}" (jetzt notieren, wird nicht erneut angezeigt)` : ''}`);
}

function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map((c) => c.trim().split('=')).filter((p) => p.length === 2).map(([k, v]) => [k, decodeURIComponent(v)]),
  );
}

export function login(db, res, username, password) {
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  // Auch bei unbekanntem Benutzer hashen, damit die Antwortzeit nicht verrät, ob er existiert.
  const ok = user ? verifyPassword(password, user.password_hash) : (verifyPassword(password, hashPassword('x')), false);
  if (!ok) return null;
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, Date.now() + SESSION_TTL_MS);
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}${secure}`);
  return { id: user.id, username: user.username };
}

export function logout(db, req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

export function requireAuth(db) {
  return (req, res, next) => {
    const token = parseCookies(req.headers.cookie)[COOKIE];
    const row = token && db.prepare(
      'SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?',
    ).get(token, Date.now());
    if (!row) return res.status(401).json({ error: 'Nicht angemeldet' });
    req.user = row;
    next();
  };
}
