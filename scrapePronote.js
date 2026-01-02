const admin = require('firebase-admin');
const db = require('./firebase');

// Fonction helper pour attendre
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper pour les captures d'écran sécurisées
const safeScreenshot = async (page, path) => {
  try {
    await wait(1000);
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight
    }));
    
    if (dimensions.width > 0 && dimensions.height > 0) {
      await page.screenshot({ path, fullPage: true });
      return true;
    }
    return false;
  } catch (error) {
    return false;
  }
};

/**
 * Navigation directe vers "Travail à faire"
 */
const naviguerVersTravailAFaire = async (page) => {
  try {
    console.log('\n📝 Navigation vers "Travail à faire"...');
    
    // Chercher directement "Travail à faire" (pas besoin de passer par "Cahier de textes")
    const travailClicked = await page.evaluate(() => {
      const allElements = Array.from(document.querySelectorAll('*'));
      const travailElement = allElements.find(el => {
        const text = el.innerText?.trim();
        return text === 'Travail à faire';
      });
      
      if (travailElement) {
        travailElement.click();
        return true;
      }
      return false;
    });
    
    if (!travailClicked) {
      console.log('⚠️ "Travail à faire" non trouvé, vérification si déjà dans la bonne vue...');
      const alreadyInView = await page.evaluate(() => {
        return document.body.innerText.includes('Pour lundi') || 
               document.body.innerText.includes('Pour mardi') ||
               document.body.innerText.includes('Vue chronologique');
      });
      
      if (!alreadyInView) {
        throw new Error('❌ Impossible de trouver "Travail à faire"');
      } else {
        console.log('✅ Déjà dans la bonne vue');
        return;
      }
    }
    
    console.log('✅ Clic sur "Travail à faire" effectué');
    await wait(3000);
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
    await wait(1000);
    
    await safeScreenshot(page, 'screenshot_travail_a_faire.png');
    console.log('✅ Navigation vers "Travail à faire" terminée');
    
  } catch (error) {
    console.error('❌ Erreur lors de la navigation:', error.message);
    throw error;
  }
};

/**
 * Scraper TOUS les devoirs directement depuis la vue "Toutes les matières"
 */
const scraperTousLesDevoirs = async (page) => {
  try {
    console.log('\n📚 Scraping de tous les devoirs...');
    
    const devoirs = await page.evaluate(() => {
      const devoirsArray = [];
      
      // Chercher tous les titres de date "Pour [date]" (H2)
      const dateTitles = Array.from(document.querySelectorAll('h2.ie-titre-gros, h2')).filter(el => {
        const text = el.innerText?.trim();
        return text && text.startsWith('Pour ') && text.length < 50;
      });
      
      // Pour chaque date
      dateTitles.forEach(dateTitle => {
        const datePour = dateTitle.innerText.replace('Pour ', '').trim();
        
        // Les devoirs sont dans le frère suivant du PARENT du H2
        let currentElement = dateTitle.parentElement.nextElementSibling;
        
        while (currentElement) {
          // Si c'est un UL.liste-element, parser les LI à l'intérieur
          if (currentElement.tagName === 'UL' && currentElement.className.includes('liste-element')) {
            const listItems = Array.from(currentElement.querySelectorAll('li'));
            
            listItems.forEach(li => {
              const fullText = li.innerText || '';
              
              if (fullText.includes('Donné le') && fullText.length > 20) {
            
            // Extraire la matière (première ligne en MAJUSCULES)
            const lines = fullText.split('\n').map(l => l.trim()).filter(l => l);
            let matiere = '';
            
            for (const line of lines) {
              if (line.length >= 3 && 
                  line.length < 50 && 
                  /^[A-ZÀ-Ü\s\-&']+$/.test(line) &&
                  !line.includes('Donné') &&
                  !line.includes('Voir')) {
                matiere = line;
                break;
              }
            }
            
            // Extraire "Donné le"
            const donneLe = fullText.match(/Donné le\s+([^\[]+)/i);
            
            // Extraire les jours restants
            const joursMatch = fullText.match(/\[(\d+)\s*Jours?\]/i);
            
            // Extraire le statut
            let statut = 'Non Fait';
            if (fullText.includes('Fait') && !fullText.includes('Non Fait')) {
              statut = 'Fait';
            }
            
            // Extraire le contenu
            let contenu = fullText
              .split('\n')
              .map(line => line.trim())
              .filter(line => {
                return line.length > 0 &&
                       !/^[A-ZÀ-Ü\s\-&']+$/.test(line) &&
                       !line.startsWith('Donné le') &&
                       !line.includes('[') && !line.includes(']') &&
                       !line.includes('Fait') &&
                       !line.includes('Non Fait') &&
                       !line.includes('Voir le cours') &&
                       !line.match(/\.docx|\.pdf|\.jpg|\.png/i);
              })
              .join(' ')
              .trim();
            
            // Détecter le bouton "Voir le cours"
            const boutonCours = fullText.includes('Voir le cours');
            
            if (matiere && contenu && contenu.length > 5) {
              devoirsArray.push({
                matiere: matiere,
                datePour: datePour,
                donneLe: donneLe ? donneLe[1].trim() : '',
                joursRestants: joursMatch ? joursMatch[1] : '',
                statut: statut,
                contenu: contenu,
                boutonCours: boutonCours,
                timestamp: new Date().toISOString()
              });
            }
              }
            });
            
            break;
          }
          
          currentElement = currentElement.nextElementSibling;
        }
      });
      
      return devoirsArray;
    });
    
    console.log(`✅ ${devoirs.length} devoir(s) trouvé(s)`);
    
    // Afficher un résumé par matière
    const parMatiere = {};
    devoirs.forEach(devoir => {
      if (!parMatiere[devoir.matiere]) {
        parMatiere[devoir.matiere] = 0;
      }
      parMatiere[devoir.matiere]++;
    });
    
    console.log('\n📊 Répartition par matière:');
    Object.entries(parMatiere).forEach(([matiere, count]) => {
      console.log(`   - ${matiere}: ${count} devoir(s)`);
    });
    
    return devoirs;
    
  } catch (error) {
    console.error('❌ Erreur lors du scraping:', error.message);
    return [];
  }
};

/**
 * Fonction principale de récupération des données Pronote
 */
const scrapePronoteData = async (page, pronoteUrl, enfant = null) => {
  try {
    const enfantInfo = enfant ? ` pour ${enfant.nom}` : '';
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔍 DÉBUT DU SCRAPING PRONOTE${enfantInfo}`);
    console.log('='.repeat(80));
    
    await wait(2000);
    
    await naviguerVersTravailAFaire(page);
    await scraperTousLesDevoirs(page);
    
    const devoirs = await scraperTousLesDevoirs(page);
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ SCRAPING TERMINÉ${enfantInfo}`);
    console.log(`📊 Total: ${devoirs.length} devoirs scrapés`);
    console.log('='.repeat(80));
    
    const scrapedData = {
      devoirs: devoirs,
      scrapedAt: new Date().toISOString(),
      stats: {
        totalDevoirs: devoirs.length,
        parMatiere: {}
      }
    };
    
    devoirs.forEach(devoir => {
      if (!scrapedData.stats.parMatiere[devoir.matiere]) {
        scrapedData.stats.parMatiere[devoir.matiere] = 0;
      }
      scrapedData.stats.parMatiere[devoir.matiere]++;
    });
    
    await saveToFirestore(scrapedData, enfant);
    
    return scrapedData;
    
  } catch (error) {
    console.error('❌ Erreur lors du scraping Pronote:', error.message);
    throw error;
  }
};

/**
 * Fonction de nettoyage des snapshots
 */
const cleanOldSnapshots = async () => {
  try {
    console.log('\n🧹 Nettoyage des snapshots du mois précédent...');
    
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    const startOfCurrentMonth = new Date(currentYear, currentMonth, 1);
    
    const oldSnapshotsQuery = db.collection('pronote_snapshots')
      .where('lastUpdate', '<', startOfCurrentMonth);
    
    const oldSnapshots = await oldSnapshotsQuery.get();
    
    if (oldSnapshots.empty) {
      console.log('✓ Aucun snapshot du mois précédent à nettoyer');
      return;
    }
    
    const batch = db.batch();
    let deleteCount = 0;
    
    oldSnapshots.forEach((doc) => {
      batch.delete(doc.ref);
      deleteCount++;
    });
    
    await batch.commit();
    console.log(`✓ ${deleteCount} snapshot(s) supprimé(s)`);
    
  } catch (error) {
    console.error('⚠️ Erreur nettoyage snapshots:', error.message);
  }
};

/**
 * Fonction de sauvegarde dans Firestore
 */
const saveToFirestore = async (data, enfant = null) => {
  try {
    const enfantInfo = enfant ? ` pour ${enfant.nom}` : '';
    console.log(`\n💾 Envoi des données vers Firestore${enfantInfo}...`);
    
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    let devoirsRef;
    
    if (enfant && enfant.id) {
      devoirsRef = db.collection('children')
        .doc(enfant.id)
        .collection('pronote')
        .doc('devoirs');
    } else {
      devoirsRef = db.collection('pronote').doc('devoirs');
    }

    if (data.devoirs && data.devoirs.length > 0) {
      await devoirsRef.set({
        devoirs: data.devoirs,
        count: data.devoirs.length,
        stats: data.stats,
        childId: enfant?.id,
        childName: enfant?.nom,
        lastUpdate: timestamp,
      }, { merge: false });
      
      console.log(`✓ ${data.devoirs.length} devoirs sauvegardés${enfantInfo}`);
    } else {
      await devoirsRef.delete().catch(() => {});
      console.log(`⚠️  Aucun devoir trouvé${enfantInfo}`);
    }

    const snapshotRef = db.collection('pronote_snapshots').doc();
    await snapshotRef.set({
      ...data,
      childId: enfant?.id,
      childName: enfant?.nom,
      lastUpdate: timestamp,
    });
    console.log(`✓ Snapshot complet sauvegardé${enfantInfo}`);

    await cleanOldSnapshots();

  } catch (error) {
    console.error('❌ Erreur sauvegarde Firestore:', error.message);
    throw error;
  }
};

module.exports = { scrapePronoteData, saveToFirestore };
