const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const DB_PATH = path.join(__dirname, 'database.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error en obrir la base de dades:', err.message);
    process.exit(1);
  }
});

const testVotes = {
  'Junts': 5,
  'ERC': 2,
  'PSC': 2,
  'SitgesGI': 1,
  'Verds Comuns Sitges': 0,
  'Guanyem': 1,
  'Vox': 1,
  'Fets per Sitges': 1,
  'PP': 1,
  'Solucions': 0,
  'Aliança Catalana': 7
};

db.serialize(() => {
  db.run('BEGIN TRANSACTION');
  
  db.run('UPDATE vots SET vots_count = 0');
  db.run('DELETE FROM registre_ip');

  const stmt = db.prepare('UPDATE vots SET vots_count = ? WHERE partit = ?');
  for (const [partit, vots] of Object.entries(testVotes)) {
    stmt.run(vots, partit);
  }
  stmt.finalize();

  db.run('COMMIT', (err) => {
    if (err) {
      console.error(err);
    } else {
      console.log('Dades de prova injectades correctament.');
      console.log('S\'ha buidat el registre de votants d\'IP perquè puguis provar de votar un cop des del teu navegador local.');
    }
    db.close();
  });
});
