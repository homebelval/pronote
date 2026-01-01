const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Initialiser Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

/**
 * Script pour créer des données d'exemple Pronote dans Firestore
 */
const createSamplePronoteData = async () => {
  try {
    console.log('🚀 Création des données Pronote dans Firestore...\n');

    // === DEVOIRS D'EXEMPLE ===
    const devoirsExemple = [
      {
        date: 'lundi 02 décembre',
        matiere: 'MATHEMATIQUES',
        contenu: 'Exercices page 45 numéros 1 à 5. Revoir le théorème de Pythagore.',
        fait: false,
        texteComplet: 'Pour lundi 02 décembre\nMATHEMATIQUES\nDonné le mar. 26 nov. [6 Jours]\nExercices page 45 numéros 1 à 5. Revoir le théorème de Pythagore.',
        timestamp: new Date().toISOString()
      },
      {
        date: 'mardi 03 décembre',
        matiere: 'FRANCAIS',
        contenu: 'Lire le chapitre 3 du livre "Le Petit Prince". Préparer un résumé de 10 lignes.',
        fait: false,
        texteComplet: 'Pour mardi 03 décembre\nFRANCAIS\nDonné le ven. 29 nov. [4 Jours]\nLire le chapitre 3 du livre "Le Petit Prince". Préparer un résumé de 10 lignes.',
        timestamp: new Date().toISOString()
      },
      {
        date: 'mercredi 04 décembre',
        matiere: 'ANGLAIS',
        contenu: 'Apprendre le vocabulaire Unit 5 (page 78). Faire les exercices de grammaire.',
        fait: true,
        texteComplet: 'Pour mercredi 04 décembre\nANGLAIS\nDonné le lun. 25 nov. [9 Jours]\nFait\nApprendre le vocabulaire Unit 5 (page 78). Faire les exercices de grammaire.',
        timestamp: new Date().toISOString()
      },
      {
        date: 'jeudi 05 décembre',
        matiere: 'HISTOIRE-GEOGRAPHIE',
        contenu: 'Réviser le cours sur la Révolution Française. Contrôle prévu.',
        fait: false,
        texteComplet: 'Pour jeudi 05 décembre\nHISTOIRE-GEOGRAPHIE\nDonné le jeu. 28 nov. [7 Jours]\nRéviser le cours sur la Révolution Française. Contrôle prévu.',
        timestamp: new Date().toISOString()
      },
      {
        date: 'vendredi 06 décembre',
        matiere: 'SCIENCES',
        contenu: 'Compléter la fiche de TP sur les volcans. Apporter des photos de volcans.',
        fait: false,
        texteComplet: 'Pour vendredi 06 décembre\nSCIENCES\nDonné le ven. 29 nov. [7 Jours]\nCompléter la fiche de TP sur les volcans. Apporter des photos de volcans.',
        timestamp: new Date().toISOString()
      }
    ];

    // Sauvegarder les devoirs
    const devoirsRef = db.collection('pronote').doc('devoirs');
    await devoirsRef.set({
      devoirs: devoirsExemple,
      count: devoirsExemple.length,
      lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`✅ ${devoirsExemple.length} devoirs créés`);

    // === EMPLOI DU TEMPS D'EXEMPLE ===
    const emploiDuTempsExemple = [
      {
        jour: 'Lundi',
        heure: '08h00 - 09h00',
        matiere: 'MATHEMATIQUES',
        professeur: 'M. Dupont',
        salle: 'B204',
        timestamp: new Date().toISOString()
      },
      {
        jour: 'Lundi',
        heure: '09h00 - 10h00',
        matiere: 'FRANCAIS',
        professeur: 'Mme Martin',
        salle: 'A103',
        timestamp: new Date().toISOString()
      },
      {
        jour: 'Lundi',
        heure: '10h15 - 11h15',
        matiere: 'ANGLAIS',
        professeur: 'Mme Smith',
        salle: 'C201',
        timestamp: new Date().toISOString()
      },
      {
        jour: 'Lundi',
        heure: '11h15 - 12h15',
        matiere: 'HISTOIRE-GEOGRAPHIE',
        professeur: 'M. Leroy',
        salle: 'B105',
        timestamp: new Date().toISOString()
      },
      {
        jour: 'Mardi',
        heure: '08h00 - 09h00',
        matiere: 'SCIENCES',
        professeur: 'Mme Dubois',
        salle: 'Labo 1',
        timestamp: new Date().toISOString()
      },
      {
        jour: 'Mardi',
        heure: '09h00 - 10h00',
        matiere: 'MATHEMATIQUES',
        professeur: 'M. Dupont',
        salle: 'B204',
        timestamp: new Date().toISOString()
      },
      {
        jour: 'Mardi',
        heure: '10h15 - 11h15',
        matiere: 'SPORT',
        professeur: 'M. Bernard',
        salle: 'Gymnase',
        timestamp: new Date().toISOString()
      },
      {
        jour: 'Mardi',
        heure: '11h15 - 12h15',
        matiere: 'ARTS PLASTIQUES',
        professeur: 'Mme Petit',
        salle: 'Salle Arts',
        timestamp: new Date().toISOString()
      }
    ];

    // Sauvegarder l'emploi du temps
    const edtRef = db.collection('pronote').doc('emploi_du_temps');
    await edtRef.set({
      emploiDuTemps: emploiDuTempsExemple,
      count: emploiDuTempsExemple.length,
      lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`✅ ${emploiDuTempsExemple.length} cours créés dans l'emploi du temps`);

    // === NOTES D'EXEMPLE ===
    const notesExemple = [
      {
        matiere: 'MATHEMATIQUES',
        devoir: 'Contrôle Chapitre 3',
        note: '15/20',
        coefficient: 2,
        date: '2024-11-20',
        moyenne_classe: '12.5/20',
        appreciation: 'Bon travail, continue ainsi',
        timestamp: new Date().toISOString()
      },
      {
        matiere: 'FRANCAIS',
        devoir: 'Rédaction',
        note: '14/20',
        coefficient: 3,
        date: '2024-11-22',
        moyenne_classe: '13/20',
        appreciation: 'Bonne expression écrite',
        timestamp: new Date().toISOString()
      },
      {
        matiere: 'ANGLAIS',
        devoir: 'Vocabulaire Unit 4',
        note: '17/20',
        coefficient: 1,
        date: '2024-11-25',
        moyenne_classe: '14/20',
        appreciation: 'Excellent',
        timestamp: new Date().toISOString()
      },
      {
        matiere: 'HISTOIRE-GEOGRAPHIE',
        devoir: 'Exposé Révolution',
        note: '16/20',
        coefficient: 2,
        date: '2024-11-28',
        moyenne_classe: '13.5/20',
        appreciation: 'Très bonne présentation',
        timestamp: new Date().toISOString()
      },
      {
        matiere: 'SCIENCES',
        devoir: 'TP Volcans',
        note: '18/20',
        coefficient: 1,
        date: '2024-11-29',
        moyenne_classe: '15/20',
        appreciation: 'Excellent travail pratique',
        timestamp: new Date().toISOString()
      }
    ];

    // Sauvegarder les notes
    const notesRef = db.collection('pronote').doc('notes');
    await notesRef.set({
      notes: notesExemple,
      count: notesExemple.length,
      moyenneGenerale: '16/20',
      lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`✅ ${notesExemple.length} notes créées`);

    // === SNAPSHOT COMPLET ===
    const snapshotRef = db.collection('pronote_snapshots').doc();
    await snapshotRef.set({
      devoirs: devoirsExemple,
      emploiDuTemps: emploiDuTempsExemple,
      notes: notesExemple,
      scrapedAt: new Date().toISOString(),
      stats: {
        totalDevoirs: devoirsExemple.length,
        totalEDT: emploiDuTempsExemple.length,
        totalNotes: notesExemple.length
      },
      lastUpdate: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('✅ Snapshot complet créé');

    console.log('\n🎉 Toutes les données ont été créées avec succès !');
    console.log('\n📊 Résumé:');
    console.log(`   - Collection: pronote/devoirs → ${devoirsExemple.length} devoirs`);
    console.log(`   - Collection: pronote/emploi_du_temps → ${emploiDuTempsExemple.length} cours`);
    console.log(`   - Collection: pronote/notes → ${notesExemple.length} notes`);
    console.log(`   - Collection: pronote_snapshots → 1 snapshot`);

  } catch (error) {
    console.error('❌ Erreur lors de la création des données:', error);
  } finally {
    process.exit();
  }
};

// Exécuter le script
createSamplePronoteData();
