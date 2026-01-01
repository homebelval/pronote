const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

// Initialiser Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

/**
 * Script de vérification des données Pronote dans Firestore
 */
const verifyPronoteData = async () => {
  try {
    console.log('🔍 VÉRIFICATION DES DONNÉES PRONOTE DANS FIRESTORE\n');
    console.log('='.repeat(80));
    
    // === VÉRIFIER children/{childId}/pronote ===
    console.log('\n📂 Vérification: children/{childId}/pronote/\n');
    
    const childrenIds = [
      { id: 'zxvjGHsYdlwt2I6bhGBg', nom: 'Kélia' },
      { id: 'dZyDqjwOabEaLff8qK27', nom: 'Maëlie' }
    ];
    
    for (const child of childrenIds) {
      console.log(`\n👧 ${child.nom} (${child.id}):`);
      
      try {
        // Vérifier la sous-collection pronote
        const pronoteSnapshot = await db
          .collection('children')
          .doc(child.id)
          .collection('pronote')
          .get();
        
        if (pronoteSnapshot.empty) {
          console.log('   ❌ Aucune sous-collection "pronote" trouvée');
        } else {
          console.log(`   ✅ ${pronoteSnapshot.size} document(s) trouvé(s) dans pronote/`);
          
          pronoteSnapshot.forEach(doc => {
            const data = doc.data();
            console.log(`      - ${doc.id}: ${data.count || 0} élément(s)`);
          });
        }
      } catch (error) {
        console.log(`   ❌ Erreur: ${error.message}`);
      }
    }
    
    // === VÉRIFIER pronote/ (ancienne structure) ===
    console.log('\n' + '='.repeat(80));
    console.log('\n📂 Vérification: pronote/ (ancienne structure)\n');
    
    try {
      const pronoteSnapshot = await db.collection('pronote').get();
      
      if (pronoteSnapshot.empty) {
        console.log('❌ Collection "pronote" vide ou inexistante');
      } else {
        console.log(`✅ ${pronoteSnapshot.size} document(s) dans pronote/`);
        
        pronoteSnapshot.forEach(doc => {
          const data = doc.data();
          console.log(`   - ${doc.id}: ${data.count || 0} élément(s)`);
          if (data.childName) {
            console.log(`     └─ Enfant: ${data.childName}`);
          }
        });
      }
    } catch (error) {
      console.log(`❌ Erreur: ${error.message}`);
    }
    
    // === VÉRIFIER pronote_snapshots ===
    console.log('\n' + '='.repeat(80));
    console.log('\n📂 Vérification: pronote_snapshots/\n');
    
    try {
      const snapshotsQuery = await db
        .collection('pronote_snapshots')
        .orderBy('lastUpdate', 'desc')
        .limit(5)
        .get();
      
      if (snapshotsQuery.empty) {
        console.log('❌ Aucun snapshot trouvé');
      } else {
        console.log(`✅ ${snapshotsQuery.size} snapshot(s) récent(s):\n`);
        
        snapshotsQuery.forEach((doc, index) => {
          const data = doc.data();
          const date = data.lastUpdate?.toDate?.() || new Date(data.scrapedAt);
          
          console.log(`${index + 1}. ${data.childName || 'Anonyme'} - ${date.toLocaleString('fr-FR')}`);
          console.log(`   - Devoirs: ${data.stats?.totalDevoirs || 0}`);
          console.log(`   - EDT: ${data.stats?.totalEDT || 0}`);
          console.log(`   - Notes: ${data.stats?.totalNotes || 0}`);
        });
      }
    } catch (error) {
      console.log(`❌ Erreur: ${error.message}`);
    }
    
    // === TEST D'ÉCRITURE ===
    console.log('\n' + '='.repeat(80));
    console.log('\n🧪 TEST D\'ÉCRITURE DANS children/pronote/\n');
    
    try {
      const testRef = db
        .collection('children')
        .doc('zxvjGHsYdlwt2I6bhGBg')
        .collection('pronote')
        .doc('_test');
      
      await testRef.set({
        test: true,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log('✅ Test d\'écriture réussi !');
      console.log('📍 Chemin: children/zxvjGHsYdlwt2I6bhGBg/pronote/_test');
      
      // Vérifier que le document existe
      const testDoc = await testRef.get();
      if (testDoc.exists) {
        console.log('✅ Document de test confirmé dans Firestore');
        console.log('📄 Contenu:', testDoc.data());
        
        // Supprimer le document de test
        await testRef.delete();
        console.log('🗑️  Document de test supprimé');
      }
      
    } catch (error) {
      console.log(`❌ Erreur lors du test d'écriture: ${error.message}`);
      console.log('📋 Stack:', error.stack);
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('\n✅ Vérification terminée\n');
    
  } catch (error) {
    console.error('❌ Erreur fatale:', error);
  } finally {
    process.exit();
  }
};

verifyPronoteData();
