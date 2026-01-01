const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const inspectDevoirs = async () => {
  try {
    console.log('🔍 INSPECTION DÉTAILLÉE DES DEVOIRS\n');
    console.log('='.repeat(80));
    
    // Récupérer les devoirs de Kélia
    const devoirsDoc = await db
      .collection('children')
      .doc('zxvjGHsYdlwt2I6bhGBg')
      .collection('pronote')
      .doc('devoirs')
      .get();
    
    if (!devoirsDoc.exists) {
      console.log('❌ Aucun devoir trouvé');
      process.exit(0);
    }
    
    const data = devoirsDoc.data();
    const devoirs = data.devoirs || [];
    
    console.log(`\n📚 ${devoirs.length} devoirs trouvés pour Kélia\n`);
    
    devoirs.forEach((devoir, index) => {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`DEVOIR #${index + 1}`);
      console.log('='.repeat(80));
      console.log(JSON.stringify(devoir, null, 2));
      console.log('\n📝 Texte complet:');
      console.log(devoir.texteComplet);
      console.log('='.repeat(80));
    });
    
  } catch (error) {
    console.error('❌ Erreur:', error);
  } finally {
    process.exit();
  }
};

inspectDevoirs();
