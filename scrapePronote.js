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
 * Fonction de récupération des données Pronote
 * @param {Page} page - Page Puppeteer
 * @param {string} pronoteUrl - URL Pronote
 * @param {Object} enfant - Objet enfant {id, nom, selecteur}
 */
const scrapePronoteData = async (page, pronoteUrl, enfant = null) => {
  try {
    const enfantInfo = enfant ? ` pour ${enfant.nom}` : '';
    console.log(`🔍 Extraction des données Pronote${enfantInfo}...\n`);
    
    // La page est déjà chargée, on attend juste que tout soit prêt
    await wait(3000);
    await safeScreenshot(page, 'screenshot_pronote_data.png');

    // === SCRAPING DU CAHIER DE TEXTES (DEVOIRS) ===
    console.log('📚 Extraction des devoirs (Cahier de textes)...');
    
    // D'abord, extraire la date du datepicker
    const dateSelectionnee = await page.evaluate(() => {
      // Chercher le datepicker avec différentes stratégies
      const datepickers = [
        document.querySelector('.as-date-picker input'),
        document.querySelector('[class*="date-picker"] input'),
        document.querySelector('input[type="date"]'),
        document.querySelector('.ObjetSaisie input'),
        ...Array.from(document.querySelectorAll('input'))
          .filter(input => input.value && input.value.match(/\d{1,2}\/\d{1,2}\/\d{4}/))
      ];
      
      for (const picker of datepickers) {
        if (picker && picker.value) {
          return picker.value;
        }
      }
      
      // Fallback: chercher dans le texte de la page
      const pageText = document.body.innerText;
      const dateMatch = pageText.match(/(?:depuis|le|du)?\s*(\w+\.?\s+\d{1,2}\s+\w+\.?)/i);
      if (dateMatch) {
        return dateMatch[1];
      }
      
      return '';
    });
    
    console.log(`📅 Date sélectionnée dans le datepicker: "${dateSelectionnee}"`);
    
    const devoirs = await page.evaluate((dateParDefaut) => {
      const devoirsData = [];
      
      // Chercher les conteneurs de devoirs par date
      const datesContainers = document.querySelectorAll('[id^="Pour"], .liste-date');
      
      // Si pas de conteneurs de dates, chercher directement les devoirs
      let devoirElements = [];
      
      if (datesContainers.length > 0) {
        // Parcourir chaque date
        datesContainers.forEach(dateContainer => {
          const dateText = dateContainer.innerText?.trim() || '';
          const dateMatch = dateText.match(/Pour\s+(.+)/i);
          const dateDevoir = dateMatch ? dateMatch[1].trim() : dateText;
          
          // Chercher les devoirs après cet élément de date
          let nextElement = dateContainer.nextElementSibling;
          while (nextElement && !nextElement.id?.startsWith('Pour')) {
            if (nextElement.classList.contains('conteneur-item') || 
                nextElement.querySelector('.conteneur-item')) {
              const items = nextElement.classList.contains('conteneur-item') 
                ? [nextElement] 
                : Array.from(nextElement.querySelectorAll('.conteneur-item'));
              
              items.forEach(item => {
                devoirElements.push({ element: item, date: dateDevoir });
              });
            }
            nextElement = nextElement.nextElementSibling;
          }
        });
      } else {
        // Fallback: chercher tous les conteneurs de devoirs
        const allItems = document.querySelectorAll('.conteneur-item, .conteneur-CDT');
        allItems.forEach(item => {
          devoirElements.push({ element: item, date: dateParDefaut });
        });
      }
      
      // Extraire les informations de chaque devoir
      devoirElements.forEach(({ element, date }) => {
        try {
          const text = element.innerText || '';
          const html = element.innerHTML || '';
          
          // Ignorer si trop court
          if (text.trim().length < 5) return;
          
          const lines = text.split('\n').filter(l => l.trim());
          
          const devoir = {
            date: date || dateParDefaut || '',
            matiere: '',
            contenu: '',
            fait: false,
            donneLe: '',
            joursRestants: '',
            piecesJointes: [],
            lienCours: false,
            texteComplet: text.trim(),
            timestamp: new Date().toISOString()
          };
          
          // Détecter le statut Fait/Non Fait
          if (text.includes('Fait') || html.includes('Fait') || element.classList.contains('est-fait')) {
            devoir.fait = true;
          }
          if (text.includes('Non Fait') || html.includes('Non Fait')) {
            devoir.fait = false;
          }
          
          // Extraire la date si pas déjà définie (depuis le texte "Pour...")
          if (!devoir.date) {
            const dateMatch = text.match(/Pour\s+([^\n]+)/i);
            if (dateMatch) {
              devoir.date = dateMatch[1].trim();
            }
          }
          
          // Extraction de "Donné le"
          const donneLe = text.match(/Donné le\s+([^\n\[]+)/i);
          if (donneLe) {
            devoir.donneLe = donneLe[1].trim();
          }
          
          // Extraction des jours restants
          const joursMatch = text.match(/\[(\d+)\s*Jours?\]/i);
          if (joursMatch) {
            devoir.joursRestants = joursMatch[1];
          }
          
          // Extraction de la matière (généralement en majuscules)
          const matiereMatch = lines.find(line => 
            /^[A-ZÀ-Ü\s\-&]+$/.test(line) && 
            line.length > 2 && 
            line.length < 50 &&
            !line.includes('Pour') &&
            !line.includes('Donné')
          );
          if (matiereMatch) {
            devoir.matiere = matiereMatch.trim();
          }
          
          // Extraction du contenu (le texte principal du devoir)
          const contentLines = lines.filter(line => 
            !line.includes('Pour ') && 
            !line.includes('Donné le') && 
            !line.includes('Fait') &&
            !line.includes('Non Fait') &&
            !line.match(/\[\d+\s*Jours?\]/i) &&
            line !== devoir.matiere &&
            line.length > 2
          );
          devoir.contenu = contentLines.join(' ').trim();
          
          // Détecter les pièces jointes
          const pjElements = element.querySelectorAll('.piece-jointe, .chips-pj, [class*="fichier"]');
          pjElements.forEach(pj => {
            const pjText = pj.innerText?.trim() || pj.getAttribute('title') || '';
            if (pjText && !devoir.piecesJointes.includes(pjText)) {
              devoir.piecesJointes.push(pjText);
            }
          });
          
          // Détecter le lien "Voir le cours"
          const coursBtn = element.querySelector('.btnCours');
          if (coursBtn) {
            devoir.lienCours = true;
          }
          
          // Ajouter seulement si on a un contenu significatif
          if (devoir.contenu || devoir.matiere) {
            devoirsData.push(devoir);
          }
        } catch (err) {
          console.error('Erreur extraction devoir:', err);
        }
      });
      
      return devoirsData;
    }, dateSelectionnee);

    console.log(`✓ ${devoirs.length} devoirs extraits`);

    // === SCRAPING DE L'EMPLOI DU TEMPS ===
    console.log('\n📅 Extraction de l\'emploi du temps...');
    
    // Pour l'emploi du temps, il faudrait cliquer sur l'onglet approprié
    // Pour l'instant, on cherche les éléments visibles
    const emploiDuTemps = await page.evaluate(() => {
      const edtData = [];
      
      // Chercher les éléments de calendrier ou planning
      const edtElements = document.querySelectorAll('[class*="cours"], [class*="planning"], [id*="Planning"]');
      
      edtElements.forEach((element) => {
        const text = element.innerText?.trim();
        if (text && text.length > 5) {
          edtData.push({
            contenu: text,
            timestamp: new Date().toISOString()
          });
        }
      });
      
      return edtData;
    });

    console.log(`✓ ${emploiDuTemps.length} éléments d\'emploi du temps extraits`);

    // === SCRAPING DES NOTES ===
    console.log('\n📊 Extraction des notes...');
    
    const notes = await page.evaluate(() => {
      const notesData = [];
      
      // Chercher les éléments de notes
      const noteElements = document.querySelectorAll('[class*="note"], [class*="eval"], [class*="moyenne"]');
      
      noteElements.forEach((element) => {
        const text = element.innerText?.trim();
        if (text && text.length > 2 && !text.includes('Note')) {
          notesData.push({
            contenu: text,
            timestamp: new Date().toISOString()
          });
        }
      });
      
      return notesData;
    });

    console.log(`✓ ${notes.length} notes extraites`);

    // === EXTRACTION DES MENUS DISPONIBLES ===
    console.log('\n🔍 Analyse des onglets disponibles...');
    
    const ongletsDisponibles = await page.evaluate(() => {
      const onglets = [];
      
      // Chercher tous les onglets/menus
      const menuElements = document.querySelectorAll('.item-menu_niveau0, .item-menu_niveau1, [class*="menu"]');
      
      menuElements.forEach((element) => {
        const text = element.innerText?.trim();
        if (text && text.length > 0 && text.length < 50) {
          onglets.push({
            texte: text,
            classe: element.className,
            id: element.id,
            cliquable: element.tagName === 'A' || element.onclick !== null
          });
        }
      });
      
      return onglets;
    });

    console.log(`✓ ${ongletsDisponibles.length} onglets/menus détectés`);
    console.log('Onglets disponibles:', ongletsDisponibles.map(o => o.texte).join(', '));

    // Préparer les données complètes
    const scrapedData = {
      devoirs,
      emploiDuTemps,
      notes,
      ongletsDisponibles,
      scrapedAt: new Date().toISOString(),
      stats: {
        totalDevoirs: devoirs.length,
        totalEDT: emploiDuTemps.length,
        totalNotes: notes.length
      }
    };

    // Sauvegarder dans Firestore
    await saveToFirestore(scrapedData, enfant);

    return scrapedData;

  } catch (error) {
    console.error('❌ Erreur lors du scraping Pronote:', error.message);
    throw error;
  }
};

/**
 * Fonction de nettoyage des snapshots du mois précédent
 * Garde uniquement les snapshots du mois en cours
 */
const cleanOldSnapshots = async () => {
  try {
    console.log('\n🧹 Nettoyage des snapshots du mois précédent...');
    
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    // Date du début du mois en cours
    const startOfCurrentMonth = new Date(currentYear, currentMonth, 1);
    
    console.log(`📅 Mois en cours: ${startOfCurrentMonth.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}`);
    console.log(`🗑️  Suppression des snapshots avant le: ${startOfCurrentMonth.toLocaleDateString('fr-FR')}`);
    
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
    console.log(`✓ ${deleteCount} snapshot(s) du mois précédent supprimé(s)`);
    
  } catch (error) {
    console.error('⚠️ Erreur lors du nettoyage des snapshots:', error.message);
    // Ne pas bloquer si le nettoyage échoue
  }
};

/**
 * Fonction de sauvegarde dans Firestore
 * ÉCRASE les données existantes à chaque exécution
 * @param {Object} data - Données à sauvegarder
 * @param {Object} enfant - Objet enfant {id, nom, selecteur}
 */
const saveToFirestore = async (data, enfant = null) => {
  try {
    const enfantInfo = enfant ? ` pour ${enfant.nom}` : '';
    console.log(`\n💾 Envoi des données vers Firestore${enfantInfo}...`);
    console.log('⚠️  Mode: ÉCRASEMENT des données existantes\n');
    
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    // Construire les références Firestore
    let devoirsRef, edtRef, notesRef;
    
    if (enfant && enfant.id) {
      // Sauvegarder dans children/{childId}/pronote/{document}
      console.log(`📂 Chemin de sauvegarde: children/${enfant.id}/pronote/`);
      
      devoirsRef = db.collection('children')
        .doc(enfant.id)
        .collection('pronote')
        .doc('devoirs');
      
      edtRef = db.collection('children')
        .doc(enfant.id)
        .collection('pronote')
        .doc('emploi_du_temps');
      
      notesRef = db.collection('children')
        .doc(enfant.id)
        .collection('pronote')
        .doc('notes');
    } else {
      // Fallback: sauvegarder dans pronote/ (sans enfant)
      console.log(`📂 Chemin de sauvegarde: pronote/`);
      
      devoirsRef = db.collection('pronote').doc('devoirs');
      edtRef = db.collection('pronote').doc('emploi_du_temps');
      notesRef = db.collection('pronote').doc('notes');
    }

    // ÉCRASER les devoirs
    if (data.devoirs && data.devoirs.length > 0) {
      await devoirsRef.set({
        devoirs: data.devoirs,
        count: data.devoirs.length,
        childId: enfant?.id,
        childName: enfant?.nom,
        lastUpdate: timestamp,
      }, { merge: false });
      console.log(`✓ ${data.devoirs.length} devoirs sauvegardés${enfantInfo}`);
    } else {
      await devoirsRef.delete().catch(() => {});
      console.log(`⚠️  Aucun devoir trouvé${enfantInfo}`);
    }

    // ÉCRASER l'emploi du temps
    if (data.emploiDuTemps && data.emploiDuTemps.length > 0) {
      await edtRef.set({
        emploiDuTemps: data.emploiDuTemps,
        count: data.emploiDuTemps.length,
        childId: enfant?.id,
        childName: enfant?.nom,
        lastUpdate: timestamp,
      }, { merge: false });
      console.log(`✓ ${data.emploiDuTemps.length} éléments d'emploi du temps sauvegardés${enfantInfo}`);
    } else {
      await edtRef.delete().catch(() => {});
      console.log(`⚠️  Aucun élément d'emploi du temps${enfantInfo}`);
    }

    // ÉCRASER les notes
    if (data.notes && data.notes.length > 0) {
      await notesRef.set({
        notes: data.notes,
        count: data.notes.length,
        childId: enfant?.id,
        childName: enfant?.nom,
        lastUpdate: timestamp,
      }, { merge: false });
      console.log(`✓ ${data.notes.length} notes sauvegardées${enfantInfo}`);
    } else {
      await notesRef.delete().catch(() => {});
      console.log(`⚠️  Aucune note${enfantInfo}`);
    }

    // Sauvegarder un snapshot complet pour l'historique
    const snapshotRef = db.collection('pronote_snapshots').doc();
    await snapshotRef.set({
      ...data,
      childId: enfant?.id,
      childName: enfant?.nom,
      lastUpdate: timestamp,
    });
    console.log(`✓ Snapshot complet sauvegardé${enfantInfo}`);

    console.log('\n✅ Toutes les données ont été envoyées à Firestore avec succès');
    console.log('📊 Statistiques:');
    console.log(`   - Devoirs: ${data.stats.totalDevoirs}`);
    console.log(`   - Emploi du temps: ${data.stats.totalEDT}`);
    console.log(`   - Notes: ${data.stats.totalNotes}`);

    // Nettoyer les anciens snapshots
    await cleanOldSnapshots();

  } catch (error) {
    console.error('❌ Erreur lors de la sauvegarde Firestore:', error.message);
    throw error;
  }
};

module.exports = { scrapePronoteData, saveToFirestore };