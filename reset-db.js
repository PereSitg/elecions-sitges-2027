const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const DB_PATH = path.join(__dirname, 'database.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Error en obrir la base de dades:', err.message);
    process.exit(1);
  }
});

db.serialize(() => {
  db.run('BEGIN TRANSACTION');

  // Reset de tots els vots a 0
  db.run('UPDATE vots SET vots_count = 0', (err) => {
    if (err) console.error('Error al posar a zero els vots:', err.message);
  });

  // Netejar la taula de registre d'IPs
  db.run('DELETE FROM registre_ip', (err) => {
    if (err) console.error('Error en buidar registre_ip:', err.message);
  });

  db.run('COMMIT', (err) => {
    if (err) {
      console.error('Error en finalitzar la transacció:', err.message);
    } else {
      console.log('Base de dades reiniciada completament.');
      console.log('Tots els vots estan a 0 i s\'ha buidat el registre d\'IPs.');
    }
    db.close();
  });
});
