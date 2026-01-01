const admin = require('firebase-admin');

// Remplacer par le chemin de ton fichier de clé JSON, ici il est dans le même dossier
const serviceAccount = require('./serviceAccountKey.json'); // Assure-toi que le fichier est bien présent ici

// Initialiser Firebase Admin SDK avec les informations de la clé de service
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://<ton-projet>.firebaseio.com',  // Remplace par l'URL de la base de données Firebase
});

const db = admin.firestore();
module.exports = db;