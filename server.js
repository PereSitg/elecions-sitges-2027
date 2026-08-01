const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'database.db');

// Middleware
app.use(cors());
app.use(express.json());

// Servir fitxers de frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});
app.get('/style.css', (req, res) => {
  res.sendFile(path.join(__dirname, 'style.css'));
});
app.get('/app.js', (req, res) => {
  res.sendFile(path.join(__dirname, 'app.js'));
});

// Inicialitzar base de dades SQLite
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error en obrir la base de dades:', err.message);
  } else {
    console.log('Connectat a la base de dades SQLite.');
    initializeDatabase();
  }
});

// Partits oficials per a la votació
const PARTITS = [
  'ERC',
  'Junts',
  'PSC',
  'Fets per Sitges',
  'Solucions',
  'PP',
  'Vox',
  'Guanyem',
  'Verds Comuns Sitges',
  'Aliança Catalana',
  'SitgesGI'
];

// Composició Actual de l'Ajuntament (Mandat 2023-2027)
const COMPOSICIO_ACTUAL = [
  { partit: 'Junts', escons: 4 },
  { partit: 'ERC', escons: 4 },
  { partit: 'PSC', escons: 4 },
  { partit: 'SitgesGI', escons: 3 },
  { partit: 'Verds Comuns Sitges', escons: 2 },
  { partit: 'Guanyem', escons: 1 },
  { partit: 'Vox', escons: 1 },
  { partit: 'Fets per Sitges', escons: 1 },
  { partit: 'PP', escons: 1 },
  { partit: 'Solucions', escons: 0 },
  { partit: 'Aliança Catalana', escons: 0 }
];

function initializeDatabase() {
  db.serialize(() => {
    // Taula per als vots agregats
    db.run(`
      CREATE TABLE IF NOT EXISTS vots (
        partit TEXT PRIMARY KEY,
        vots_count INTEGER DEFAULT 0
      )
    `);

    // Taula per registrar els hashes de les IP dels votants
    db.run(`
      CREATE TABLE IF NOT EXISTS registre_ip (
        ip_hash TEXT PRIMARY KEY,
        data_vot DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Inserir els partits si no existeixen
    const stmt = db.prepare('INSERT OR IGNORE INTO vots (partit, vots_count) VALUES (?, 0)');
    PARTITS.forEach((partit) => {
      stmt.run(partit);
    });
    stmt.finalize();
    console.log('Base de dades inicialitzada correctament.');
  });
}

// Funció per obtenir el hash SHA-256 de la IP
function getIPHash(req) {
  let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  // Si hi ha múltiples IPs a x-forwarded-for, agafem la primera
  if (ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }
  // Netejar adreces IPv4 mapejades en IPv6 (ex: ::ffff:127.0.0.1)
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }
  return crypto.createHash('sha256').update(ip).digest('hex');
}

// Algorisme de la Llei D'Hondt
function calcularDHondt(votsPartits, totalVots) {
  const llindar = totalVots * 0.05; // 5% de llindar mínim
  
  // Filtrar partits que superen el llindar del 5%
  let partitsValids = votsPartits
    .filter(p => p.vots >= llindar && p.vots > 0)
    .map(p => ({ partit: p.partit, vots: p.vots, escons: 0 }));

  const esconsTotals = 21;

  if (partitsValids.length === 0) {
    // Si ningú té vots o ningú passa el llindar, no es poden repartir escons així com així.
    // Retornem 0 per a tots.
    return PARTITS.map(partit => ({ partit, escons: 0 }));
  }

  // Repartiment d'escons (21 iteracions)
  for (let i = 0; i < esconsTotals; i++) {
    let maxQuotient = -1;
    let maxIndex = -1;

    for (let j = 0; j < partitsValids.length; j++) {
      const q = partitsValids[j].vots / (partitsValids[j].escons + 1);
      if (q > maxQuotient) {
        maxQuotient = q;
        maxIndex = j;
      } else if (q === maxQuotient) {
        // En cas d'empat, s'assigna al partit amb més vots totals
        if (partitsValids[j].vots > partitsValids[maxIndex].vots) {
          maxIndex = j;
        } else if (partitsValids[j].vots === partitsValids[maxIndex].vots) {
          // Si encara empaten, resolució alfabètica per estabilitat
          if (partitsValids[j].partit < partitsValids[maxIndex].partit) {
            maxIndex = j;
          }
        }
      }
    }

    if (maxIndex !== -1) {
      partitsValids[maxIndex].escons += 1;
    }
  }

  // Ajuntar resultats incloent partits amb 0 escons o exclosos del llindar
  return PARTITS.map(partit => {
    const trobat = partitsValids.find(p => p.partit === partit);
    return {
      partit,
      escons: trobat ? trobat.escons : 0
    };
  });
}

// Rutes API
app.get('/api/status', (req, res) => {
  const ipHash = getIPHash(req);

  // Comprovar si l'usuari ja ha votat
  db.get('SELECT 1 FROM registre_ip WHERE ip_hash = ?', [ipHash], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Error en consultar el registre d\'IP.' });
    }

    const jaVotat = !!row;

    // Obtenir tots els vots
    db.all('SELECT partit, vots_count AS vots FROM vots', [], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Error en llegir els vots.' });
      }

      const totalVots = rows.reduce((sum, r) => sum + r.vots, 0);
      const simulatedSeats = calcularDHondt(rows, totalVots);

      res.json({
        jaVotat,
        vots: rows,
        totalVots,
        composicioActual: COMPOSICIO_ACTUAL,
        composicioSimulada: simulatedSeats
      });
    });
  });
});

app.post('/api/vote', (req, res) => {
  const { partit } = req.body;
  const ipHash = getIPHash(req);

  if (!partit || !PARTITS.includes(partit)) {
    return res.status(400).json({ error: 'Partit polític no vàlid.' });
  }

  // Comprovar si ja ha votat
  db.get('SELECT 1 FROM registre_ip WHERE ip_hash = ?', [ipHash], (err, row) => {
    if (err) {
      return res.status(500).json({ error: 'Error de base de dades.' });
    }

    if (row) {
      return res.status(400).json({ error: 'Ja has participat en aquest simulacre de votació. El teu vot ja ha estat comptabilitzat.' });
    }

    // Registrar vot i IP de forma atòmica
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      db.run('INSERT INTO registre_ip (ip_hash) VALUES (?)', [ipHash], function(err) {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: 'Error en registrar la IP.' });
        }

        db.run('UPDATE vots SET vots_count = vots_count + 1 WHERE partit = ?', [partit], function(err) {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: 'Error en guardar el vot.' });
          }

          db.run('COMMIT', (err) => {
            if (err) {
              return res.status(500).json({ error: 'Error en finalitzar la transacció.' });
            }

            // Tot ha anat bé, retornar les dades actualitzades
            db.all('SELECT partit, vots_count AS vots FROM vots', [], (err, rows) => {
              if (err) {
                // El vot ja s'ha guardat, així que no fem rollback, només informem de l'error del status
                return res.json({ success: true, warning: 'Vot desat, però no s\'han pogut recuperar les dades actualitzades.' });
              }

              const totalVots = rows.reduce((sum, r) => sum + r.vots, 0);
              const simulatedSeats = calcularDHondt(rows, totalVots);

              res.json({
                success: true,
                jaVotat: true,
                vots: rows,
                totalVots,
                composicioActual: COMPOSICIO_ACTUAL,
                composicioSimulada: simulatedSeats
              });
            });
          });
        });
      });
    });
  });
});

// Engegar el servidor
app.listen(PORT, () => {
  console.log(`Servidor actiu a http://localhost:${PORT}`);
});
