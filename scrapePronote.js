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
    console.log('⏳ Navigation dans chaque devoir pour extraire les détails complets...\n');
    
    const devoirs = await page.evaluate(async () => {
      const devoirsData = [];
      
      // Helper pour attendre
      const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      
      // Trouver tous les conteneurs de devoirs avec matière
      const matiereElements = document.querySelectorAll('.conteneur-item .titre-matiere, .conteneur-item strong, .conteneur-liste-CDT .conteneur-item');
      
      console.log(`Trouvé ${matiereElements.length} éléments de devoirs`);
      
      for (let i = 0; i < matiereElements.length; i++) {
        const element = matiereElements[i];
        
        try {
          // Récupérer le conteneur parent
          const conteneur = element.closest('.conteneur-item') || element;
          
          // Extraire les infos de base visibles
          const texteVisible = conteneur.innerText || '';
          
          // Chercher le lien "Voir le cours" ou élément cliquable
          const lienDetails = conteneur.querySelector('.btnCours, a[href*="cours"], button');
          
          const devoir = {
            date: '',
            matiere: '',
            contenu: '',
            fait: false,
            donneLe: '',
            joursRestants: '',
            piecesJointes: [],
            lienCours: false,
            texteComplet: texteVisible.trim(),
            timestamp: new Date().toISOString()
          };
          
          // Extraire la matière du texte visible
          const lines = texteVisible.split('\n').filter(l => l.trim());
          const matiereMatch = lines.find(line => 
            /^[A-ZÀ-Ü\s\-&]+$/.test(line) && 
            line.length > 2 && 
            line.length < 50 &&
            !line.includes('Fait') &&
            !line.includes('Non Fait') &&
            !line.includes('Pour')
          );
          
          if (matiereMatch) {
            devoir.matiere = matiereMatch.trim();
          }
          
          // Détecter le statut Fait/Non Fait
          if (texteVisible.includes('Fait') || conteneur.classList.contains('est-fait')) {
            devoir.fait = true;
          }
          if (texteVisible.includes('Non Fait')) {
            devoir.fait = false;
          }
          
          // Extraire le contenu (enlever matière et statut)
          devoir.contenu = lines.filter(line => 
            line !== devoir.matiere &&
            !line.includes('Fait') &&
            !line.includes('Non Fait') &&
            !line.includes('Donné le') &&
            !line.includes('Pour ') &&
            !line.match(/\[\d+\s*Jours?\]/i) &&
            line.length > 3
          ).join(' ').trim();
          
          // Chercher les pièces jointes
          const pjElements = conteneur.querySelectorAll('.piece-jointe, .chips-pj, [class*="fichier"]');
          pjElements.forEach(pj => {
            const pjText = pj.innerText?.trim() || pj.getAttribute('title') || '';
            if (pjText && !devoir.piecesJointes.includes(pjText)) {
              devoir.piecesJointes.push(pjText);
            }
          });
          
          // Chercher le lien "Voir le cours"
          if (lienDetails) {
            devoir.lienCours = true;
          }
          
          // Ajouter le devoir si on a au moins une matière ou du contenu
          if (devoir.matiere || devoir.contenu) {
            devoirsData.push(devoir);
          }
          
        } catch (err) {
          console.error('Erreur extraction devoir:', err);
        }
      }
      
      return devoirsData;
    });
    
    console.log(`✓ ${devoirs.length} devoirs extraits (extraction de base)`);
    
    // === NAVIGATION AVANCÉE POUR EXTRAIRE LES DÉTAILS COMPLETS ===
    console.log('\n🔍 Extraction des détails complets par navigation...');
    
    try {
      // Essayer de trouver les dates affichées
      const datesDisponibles = await page.evaluate(() => {
        const dates = [];
        
        // Chercher les éléments de date dans le format "Pour lundi 05 janvier"
        const dateElements = document.querySelectorAll('[id^="Pour"], h3, .liste-date, [class*="date"]');
        
        dateElements.forEach(el => {
          const text = el.innerText?.trim();
          if (text && text.match(/Pour\s+/i)) {
            dates.push({
              texte: text,
              id: el.id
            });
          }
        });
        
        return dates;
      });
      
      console.log(`Dates trouvées: ${datesDisponibles.map(d => d.texte).join(', ')}`);
      
      // Pour chaque date, extraire les détails des devoirs
      for (const dateInfo of datesDisponibles) {
        console.log(`\n  📅 Traitement de: ${dateInfo.texte}`);
        
        // Extraire les devoirs de cette date avec leurs détails
        const devoirsDeDate = await page.evaluate((dateTexte) => {
          const devoirsAvecDetails = [];
          
          // Trouver l'élément de date
          const dateElement = Array.from(document.querySelectorAll('[id^="Pour"], h3, .liste-date')).find(el => 
            el.innerText?.includes(dateTexte.replace('Pour ', ''))
          );
          
          if (!dateElement) return devoirsAvecDetails;
          
          // Parcourir les éléments après cette date jusqu'à la prochaine date
          let currentElement = dateElement.nextElementSibling;
          
          while (currentElement && !currentElement.id?.startsWith('Pour')) {
            // Chercher les conteneurs de devoirs
            const devoirContainers = currentElement.classList.contains('conteneur-item') 
              ? [currentElement]
              : Array.from(currentElement.querySelectorAll('.conteneur-item'));
            
            devoirContainers.forEach(container => {
              const text = container.innerText || '';
              const lines = text.split('\n').filter(l => l.trim());
              
              if (lines.length > 0) {
                const devoir = {
                  date: dateTexte.replace('Pour ', ''),
                  matiere: '',
                  contenu: '',
                  fait: false,
                  donneLe: '',
                  joursRestants: '',
                  piecesJointes: [],
                  lienCours: false,
                  texteComplet: text.trim()
                };
                
                // Extraire "Donné le"
                const donneLe = text.match(/Donné le\s+([^\n\[]+)/i);
                if (donneLe) {
                  devoir.donneLe = donneLe[1].trim();
                }
                
                // Extraire les jours restants
                const joursMatch = text.match(/\[(\d+)\s*Jours?\]/i);
                if (joursMatch) {
                  devoir.joursRestants = joursMatch[1];
                }
                
                // Extraire la matière
                const matiereMatch = lines.find(line => 
                  /^[A-ZÀ-Ü\s\-&]+$/.test(line) && 
                  line.length > 2 && 
                  line.length < 50 &&
                  !line.includes('Fait')
                );
                if (matiereMatch) {
                  devoir.matiere = matiereMatch.trim();
                }
                
                // Statut
                if (text.includes('Fait') && !text.includes('Non Fait')) {
                  devoir.fait = true;
                }
                
                // Contenu
                devoir.contenu = lines.filter(line => 
                  line !== devoir.matiere &&
                  !line.includes('Fait') &&
                  !line.includes('Donné le') &&
                  !line.match(/\[\d+\s*Jours?\]/i) &&
                  line.length > 3
                ).join(' ').trim();
                
                // Pièces jointes
                const pjElements = container.querySelectorAll('.piece-jointe, .chips-pj');
                pjElements.forEach(pj => {
                  const pjText = pj.innerText?.trim();
                  if (pjText && !devoir.piecesJointes.includes(pjText)) {
                    devoir.piecesJointes.push(pjText);
                  }
                });
                
                // Lien cours
                if (container.querySelector('.btnCours')) {
                  devoir.lienCours = true;
                }
                
                if (devoir.matiere || devoir.contenu) {
                  devoirsAvecDetails.push(devoir);
                }
              }
            });
            
            currentElement = currentElement.nextElementSibling;
          }
          
          return devoirsAvecDetails;
        }, dateInfo.texte);
        
        console.log(`    ✓ ${devoirsDeDate.length} devoir(s) extrait(s) pour cette date`);
        
        // Fusionner avec les devoirs existants ou ajouter
        devoirsDeDate.forEach(nouveauDevoir => {
          // Chercher si on a déjà ce devoir (par matière)
          const existant = devoirs.find(d => 
            d.matiere === nouveauDevoir.matiere && 
            d.texteComplet === nouveauDevoir.texteComplet
          );
          
          if (existant) {
            // Mettre à jour avec les nouvelles infos
            Object.assign(existant, nouveauDevoir);
          } else {
            // Ajouter le nouveau devoir
            nouveauDevoir.timestamp = new Date().toISOString();
            devoirs.push(nouveauDevoir);
          }
        });
      }
      
      console.log(`\n✓ ${devoirs.length} devoirs au total après extraction complète`);
      
    } catch (error) {
      console.log(`⚠️ Impossible d'extraire les détails avancés: ${error.message}`);
      console.log('Les devoirs de base ont été conservés.');
    }

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