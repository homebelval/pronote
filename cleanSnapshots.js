const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Initialiser Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

/**
 * Script de nettoyage mensuel des snapshots Pronote
 * Mode 1: node cleanSnapshots.js             → Garde uniquement le mois en cours
 * Mode 2: node cleanSnapshots.js --keep 2    → Garde les 2 derniers mois
 * Mode 3: node cleanSnapshots.js --days 30   → Garde les 30 derniers jours
 */
const cleanSnapshots = async () => {
  try {
    const args = process.argv.slice(2);
    let mode = 'monthly'; // par défaut: mensuel
    let keepMonths = 1; // par défaut: garder le mois en cours uniquement
    let keepDays = null;
    
    // Parser les arguments
    if (args.includes('--keep')) {
      const index = args.indexOf('--keep');
      keepMonths = parseInt(args[index + 1]) || 1;
    } else if (args.includes('--days')) {
      const index = args.indexOf('--days');
      keepDays = parseInt(args[index + 1]) || 30;
      mode = 'days';
    }
    
    console.log(`🧹 Nettoyage des snapshots Pronote...\n`);
    
    let cutoffDate;
    
    if (mode === 'monthly') {
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      
      // Calculer le mois à partir duquel on garde les snapshots
      cutoffDate = new Date(currentYear, currentMonth - (keepMonths - 1), 1);
      
      console.log(`📅 Mode: Nettoyage mensuel`);
      console.log(`✅ Conservation: ${keepMonths} dernier(s) mois`);
      console.log(`🗑️  Suppression des snapshots avant: ${cutoffDate.toLocaleDateString('fr-FR')}`);
    } else {
      cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - keepDays);
      
      console.log(`📅 Mode: Nettoyage par jours`);
      console.log(`✅ Conservation: ${keepDays} derniers jours`);
      console.log(`🗑️  Suppression des snapshots avant: ${cutoffDate.toLocaleDateString('fr-FR')}`);
    }
    
    console.log('');
    
    // Récupérer tous les snapshots
    const allSnapshotsQuery = db.collection('pronote_snapshots');
    const allSnapshots = await allSnapshotsQuery.get();
    
    console.log(`📊 Total de snapshots trouvés: ${allSnapshots.size}`);
    
    if (allSnapshots.empty) {
      console.log('✓ Aucun snapshot trouvé');
      process.exit(0);
    }
    
    // Filtrer les snapshots à supprimer
    const snapshotsToDelete = [];
    const snapshotsToKeep = [];
    const snapshotsGroupedByMonth = {};
    
    allSnapshots.forEach((doc) => {
      const data = doc.data();
      let snapshotDate;
      
      // Essayer de récupérer la date du snapshot
      if (data.lastUpdate && data.lastUpdate.toDate) {
        snapshotDate = data.lastUpdate.toDate();
      } else if (data.scrapedAt) {
        snapshotDate = new Date(data.scrapedAt);
      } else {
        // Si pas de date, on le garde par sécurité
        snapshotsToKeep.push(doc);
        return;
      }
      
      // Grouper par mois pour les statistiques
      const monthKey = `${snapshotDate.getFullYear()}-${String(snapshotDate.getMonth() + 1).padStart(2, '0')}`;
      if (!snapshotsGroupedByMonth[monthKey]) {
        snapshotsGroupedByMonth[monthKey] = 0;
      }
      snapshotsGroupedByMonth[monthKey]++;
      
      if (snapshotDate < cutoffDate) {
        snapshotsToDelete.push({
          id: doc.id,
          date: snapshotDate,
          ref: doc.ref
        });
      } else {
        snapshotsToKeep.push(doc);
      }
    });
    
    console.log(`\n📈 Répartition par mois:`);
    Object.entries(snapshotsGroupedByMonth)
      .sort()
      .forEach(([month, count]) => {
        const [year, monthNum] = month.split('-');
        const date = new Date(year, monthNum - 1);
        const monthName = date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        const willKeep = date >= cutoffDate;
        console.log(`   ${willKeep ? '✅' : '🗑️ '} ${monthName}: ${count} snapshot(s)`);
      });
    
    console.log(`\n✅ Snapshots à conserver: ${snapshotsToKeep.length}`);
    console.log(`🗑️  Snapshots à supprimer: ${snapshotsToDelete.length}\n`);
    
    if (snapshotsToDelete.length === 0) {
      console.log('✓ Aucun snapshot à nettoyer');
      process.exit(0);
    }
    
    // Afficher les 10 premiers snapshots qui seront supprimés
    console.log('📋 Snapshots qui seront supprimés (10 premiers):');
    snapshotsToDelete.slice(0, 10).forEach(snapshot => {
      console.log(`   - ${snapshot.id.substring(0, 20)}... (${snapshot.date.toLocaleDateString('fr-FR')})`);
    });
    
    if (snapshotsToDelete.length > 10) {
      console.log(`   ... et ${snapshotsToDelete.length - 10} autres`);
    }
    
    console.log('\n🔄 Suppression en cours...');
    
    // Supprimer par batch (max 500 par batch)
    const batchSize = 500;
    let deletedCount = 0;
    
    for (let i = 0; i < snapshotsToDelete.length; i += batchSize) {
      const batch = db.batch();
      const batchSnapshots = snapshotsToDelete.slice(i, i + batchSize);
      
      batchSnapshots.forEach(snapshot => {
        batch.delete(snapshot.ref);
      });
      
      await batch.commit();
      deletedCount += batchSnapshots.length;
      console.log(`   ✓ ${deletedCount}/${snapshotsToDelete.length} snapshots supprimés`);
    }
    
    console.log(`\n✅ Nettoyage terminé !`);
    console.log(`📊 Résumé:`);
    console.log(`   - Snapshots supprimés: ${deletedCount}`);
    console.log(`   - Snapshots conservés: ${snapshotsToKeep.length}`);
    console.log(`   - Espace libéré: ~${(deletedCount * 0.001).toFixed(2)} MB (estimation)\n`);
    
  } catch (error) {
    console.error('❌ Erreur lors du nettoyage:', error);
  } finally {
    process.exit();
  }
};

// Exécuter le script
cleanSnapshots();
