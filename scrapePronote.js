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
 * Calculer le lundi de la semaine cible
 * @returns {Date} Date du lundi à scraper
 */
const calculerLundiCible = () => {
  const maintenant = new Date();
  const jourSemaine = maintenant.getDay(); // 0 = Dimanche, 1 = Lundi, ..., 5 = Vendredi
  const heures = maintenant.getHours();
  
  let lundiCible = new Date(maintenant);
  
  // Calculer le lundi de la semaine EN COURS
  const joursDepuisLundi = jourSemaine === 0 ? 6 : jourSemaine - 1; // Dimanche = 6 jours depuis lundi
  lundiCible.setDate(maintenant.getDate() - joursDepuisLundi);
  
  // Si on est Vendredi >= 12h OU Samedi OU Dimanche → semaine SUIVANTE
  const estVendrediApresMidi = (jourSemaine === 5 && heures >= 12);
  const estWeekend = (jourSemaine === 6 || jourSemaine === 0);
  
  if (estVendrediApresMidi || estWeekend) {
    lundiCible.setDate(lundiCible.getDate() + 7);
    console.log('📅 Période de basculement détectée → Scraping semaine SUIVANTE');
  } else {
    console.log('📅 Scraping semaine EN COURS');
  }
  
  // Réinitialiser à minuit pour avoir une date propre
  lundiCible.setHours(0, 0, 0, 0);
  
  return lundiCible;
};

/**
 * Formater une date au format "lun. 01 janv."
 */
const formaterDatePronote = (date) => {
  const jours = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const mois = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  
  const jourSemaine = jours[date.getDay()];
  const numeroJour = date.getDate().toString().padStart(2, '0');
  const nomMois = mois[date.getMonth()];
  
  return `${jourSemaine} ${numeroJour} ${nomMois}`;
};

/**
 * Formater une date au format ISO (YYYY-MM-DD)
 */
const formaterDateISO = (date) => {
  const annee = date.getFullYear();
  const mois = (date.getMonth() + 1).toString().padStart(2, '0');
  const jour = date.getDate().toString().padStart(2, '0');
  return `${annee}-${mois}-${jour}`;
};

/**
 * Naviguer vers une date spécifique via l'input date
 */
const naviguerVersDate = async (page, dateTarget) => {
  try {
    console.log(`\n📆 Navigation vers le ${formaterDatePronote(dateTarget)}...`);
    
    // Formater la date au format ISO pour l'input HTML5: "2026-01-12"
    const dateISO = formaterDateISO(dateTarget);
    const dateFormatPronote = formaterDatePronote(dateTarget); // "lun. 12 janv."
    console.log(`🎯 Date cible (ISO): ${dateISO}`);
    console.log(`🎯 Date cible (Pronote): ${dateFormatPronote}`);
    
    // Attendre que l'input date soit présent (peut être chargé dynamiquement)
    console.log('⏳ Attente du chargement de l\'input date...');
    await wait(3000);
    
    // Prendre un screenshot avant pour debug
    await safeScreenshot(page, 'screenshot_avant_modification_date.png');
    
    // DEBUG EXHAUSTIF: Chercher TOUS les éléments qui pourraient servir à changer la date
    const allDateElements = await page.evaluate(() => {
      const results = {
        inputs: [],
        buttons: [],
        spans: [],
        divs: [],
        selecteurs: []
      };
      
      // Tous les inputs
      const inputs = Array.from(document.querySelectorAll('input'));
      results.inputs = inputs.map(input => ({
        type: input.type,
        value: input.value,
        className: input.className,
        id: input.id,
        placeholder: input.placeholder
      }));
      
      // Tous les boutons/liens avec du texte lié aux dates
      const clickables = Array.from(document.querySelectorAll('button, a, div[onclick], span[onclick]'));
      clickables.forEach(el => {
        const text = el.innerText || '';
        if (text.includes('depuis') || text.includes('Semaine') || text.includes('semaine') || 
            /\d{2}\s+(janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc)/.test(text)) {
          results.buttons.push({
            tag: el.tagName,
            text: text.substring(0, 100),
            className: el.className,
            id: el.id
          });
        }
      });
      
      // Les spans qui contiennent des dates
      const spans = Array.from(document.querySelectorAll('span'));
      spans.forEach(span => {
        const text = span.innerText || '';
        if (/\d{2}\s+(janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc)/.test(text) ||
            text.includes('depuis') || text.includes('Semaine')) {
          results.spans.push({
            text: text.substring(0, 100),
            className: span.className,
            id: span.id
          });
        }
      });
      
      // Les divs avec "depuis"
      const divs = Array.from(document.querySelectorAll('div'));
      divs.forEach(div => {
        const text = div.innerText || '';
        if ((text.includes('depuis') || text.includes('Semaine')) && text.length < 200) {
          results.divs.push({
            text: text.substring(0, 100),
            className: div.className,
            id: div.id
          });
        }
      });
      
      // Tous les select
      const selects = Array.from(document.querySelectorAll('select'));
      results.selecteurs = selects.map(select => ({
        id: select.id,
        className: select.className,
        options: Array.from(select.options).slice(0, 5).map(o => o.text)
      }));
      
      return results;
    });
    
    console.log('🔍 DEBUG EXHAUSTIF - Éléments de navigation date:');
    console.log('   Inputs:', JSON.stringify(allDateElements.inputs, null, 2));
    console.log('   Boutons/Liens:', JSON.stringify(allDateElements.buttons, null, 2));
    console.log('   Spans:', JSON.stringify(allDateElements.spans, null, 2));
    console.log('   Divs:', JSON.stringify(allDateElements.divs, null, 2));
    console.log('   Sélecteurs:', JSON.stringify(allDateElements.selecteurs, null, 2));
    
    // DEBUG: Chercher la date actuellement affichée
    const currentDate = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const dateInput = inputs.find(input => {
        const value = input.value || '';
        return /\d{2}\s+(janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc)/.test(value);
      });
      return dateInput ? dateInput.value : 'Non trouvé';
    });
    
    console.log(`📅 Date actuellement affichée dans la page`);
    
    // STRATÉGIE: Chercher N'IMPORTE QUEL élément qui contient la date "lun. 01 déc."
    console.log('🖱️  Recherche de l\'élément qui affiche la date...');
    
    const dateElementInfo = await page.evaluate(() => {
      // Chercher TOUS les éléments
      const allElements = Array.from(document.querySelectorAll('*'));
      
      // Filtrer ceux qui contiennent exactement le pattern de date
      const candidates = allElements.filter(el => {
        const text = el.innerText || el.textContent || '';
        // Pattern: "lun. 01 déc" avec point optionnel à la fin
        return /\b(lun|mar|mer|jeu|ven|sam|dim)\.\s+\d{2}\s+(janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc)\.?/i.test(text);
      });
      
      // Trier par longueur de texte (le plus court = le plus spécifique)
      candidates.sort((a, b) => {
        const textA = a.innerText || a.textContent || '';
        const textB = b.innerText || b.textContent || '';
        return textA.length - textB.length;
      });
      
      if (candidates.length > 0) {
        const dateEl = candidates[0];
        const rect = dateEl.getBoundingClientRect();
        
        return {
          found: true,
          tag: dateEl.tagName,
          className: dateEl.className,
          text: (dateEl.innerText || dateEl.textContent || '').substring(0, 100),
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2
        };
      }
      
      return { found: false };
    });
    
    if (!dateElementInfo || !dateElementInfo.found) {
      throw new Error('❌ Élément date non trouvé');
    }
    
    console.log(`✅ Élément date trouvé:`);
    console.log(`   Tag: ${dateElementInfo.tag}`);
    console.log(`   Classe: ${dateElementInfo.className}`);
    console.log(`   Texte: ${dateElementInfo.text}`);
    console.log(`   Position: x=${Math.round(dateElementInfo.x)}, y=${Math.round(dateElementInfo.y)}`);
    
    // Cliquer sur l'élément date (au centre)
    console.log('🖱️  Clic sur l\'élément date...');
    await page.mouse.click(dateElementInfo.x, dateElementInfo.y);
    await wait(500);
    
    // Screenshot immédiat après le clic
    await safeScreenshot(page, 'screenshot_juste_apres_clic.png');
    console.log('📸 Screenshot pris juste après le clic');
    
    await wait(1000);
    
    await safeScreenshot(page, 'screenshot_apres_clic_input.png');
    
    // Vérifier si un calendrier est apparu
    const calendarAppeared = await page.evaluate(() => {
      // Chercher des éléments de calendrier
      const possibleCalendars = [
        ...Array.from(document.querySelectorAll('table')),
        ...Array.from(document.querySelectorAll('.calendar')),
        ...Array.from(document.querySelectorAll('[class*="calendar"]')),
        ...Array.from(document.querySelectorAll('[class*="picker"]')),
        ...Array.from(document.querySelectorAll('[class*="date"]'))
      ];
      
      for (const el of possibleCalendars) {
        const text = el.innerText || '';
        // Vérifier si contient des jours de semaine ou des chiffres de dates
        if (text.includes('Lun') || text.includes('Mar') || text.includes('Mer') ||
            /\b([1-9]|[12][0-9]|3[01])\b/.test(text)) {
          console.log('📅 Calendrier détecté !', el.tagName, el.className);
          return {
            appeared: true,
            tag: el.tagName,
            className: el.className
          };
        }
      }
      
      return { appeared: false };
    });
    
    console.log(`📅 Calendrier apparu: ${calendarAppeared.appeared ? 'OUI' : 'NON'}`);
    
    if (calendarAppeared.appeared) {
      // SI CALENDRIER : Naviguer dedans pour sélectionner la date
      console.log('✅ Calendrier ouvert ! Recherche de la date cible...');
      
      // Cliquer sur la date dans le calendrier
      const dateInCalendarClicked = await page.evaluate((targetDay) => {
        // Chercher tous les éléments du calendrier
        const allElements = Array.from(document.querySelectorAll('td, div, span, button, a'));
        
        // Chercher celui qui contient exactement le jour (5 pour le 5 janvier)
        const dayElement = allElements.find(el => {
          const text = (el.innerText || el.textContent || '').trim();
          return text === targetDay.toString();
        });
        
        if (dayElement) {
          console.log('✅ Jour trouvé dans le calendrier:', dayElement.tagName);
          dayElement.click();
          return true;
        }
        
        return false;
      }, dateTarget.getDate());
      
      if (dateInCalendarClicked) {
        console.log('✅ Date cliquée dans le calendrier');
        await wait(2000);
      } else {
        console.log('⚠️  Date non trouvée dans le calendrier, tentative clavier...');
        // Utiliser les flèches pour naviguer
        await page.keyboard.press('ArrowRight');
        await wait(200);
        await page.keyboard.press('Enter');
        await wait(2000);
      }
    } else {
      // SI PAS DE CALENDRIER : Modifier l'input directement
      console.log('⚠️  Pas de calendrier, modification directe de l\'input...');
      
      await page.evaluate((dateFormatPronote) => {
        const inputs = Array.from(document.querySelectorAll('input'));
        const dateInput = inputs.find(input => {
          const value = input.value || '';
          return /\b(lun|mar|mer|jeu|ven|sam|dim)\.\s+\d{2}\s+/.test(value);
        });
        
        if (dateInput) {
          dateInput.focus();
          dateInput.select();
          dateInput.value = dateFormatPronote;
          dateInput.dispatchEvent(new Event('input', { bubbles: true }));
          dateInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, dateFormatPronote);
      
      await wait(500);
      await page.keyboard.press('Enter');
      await wait(2000);
    }
    
    // Prendre un screenshot après modification
    await safeScreenshot(page, 'screenshot_apres_clic_date.png');
    
    // Chercher et cliquer sur un bouton "À faire" ou similaire pour recharger
    const buttonClicked = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button, a, div[role="button"]'));
      
      // Chercher bouton "À faire"
      const aFaireBtn = buttons.find(btn => {
        const text = btn.innerText || '';
        const id = btn.id || '';
        return text.includes('À faire') || id.includes('afaire') || text === 'A faire';
      });
      
      if (aFaireBtn) {
        console.log('✅ Bouton "À faire" trouvé, clic...');
        aFaireBtn.click();
        return true;
      }
      
      return false;
    });
    
    if (buttonClicked) {
      console.log('✅ Bouton "À faire" cliqué');
      await wait(2000);
    }
    
    // Attendre le rechargement de la page
    console.log('⏳ Attente du rechargement...');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {
      console.log('⚠️  Pas de navigation complète détectée, on continue...');
    });
    
    await wait(3000);
    
    // Vérifier la date après modification
    const newDate = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      const dateInput = inputs.find(input => {
        const value = input.value || '';
        return /\d{2}\s+(janv|févr|mars|avr|mai|juin|juil|août|sept|oct|nov|déc)/.test(value);
      });
      return dateInput ? dateInput.value : 'Non trouvé';
    });
    
    console.log(`📅 Date après modification: ${newDate}`);
    
    // Vérifier aussi quel est le premier devoir affiché
    const premierDevoir = await page.evaluate(() => {
      const titles = Array.from(document.querySelectorAll('h2'));
      const premierDate = titles.find(h2 => h2.innerText?.startsWith('Pour '));
      return premierDate ? premierDate.innerText : 'Non trouvé';
    });
    
    console.log(`📋 Premier devoir affiché: ${premierDevoir}`);
    
    await safeScreenshot(page, 'screenshot_apres_selection_date.png');
    console.log(`✅ Navigation vers ${formaterDatePronote(dateTarget)} terminée`);
    
    // Vérifier que la date a bien changé
    if (newDate === currentDate) {
      console.log('⚠️  ATTENTION: La date n\'a pas changé dans l\'interface !');
      console.log('⚠️  La modification de l\'input n\'a peut-être pas déclenché le rechargement');
    }
    
  } catch (error) {
    console.error('❌ Erreur lors de la navigation vers la date:', error.message);
    await safeScreenshot(page, 'screenshot_erreur_navigation_date.png');
    throw error;
  }
};

/**
 * Navigation directe vers "Travail à faire"
 */
const naviguerVersTravailAFaire = async (page) => {
  try {
    console.log('\n🔍 Navigation vers "Travail à faire"...');
    
    // Attendre que la page soit bien chargée
    await wait(3000);
    
    // DEBUG: URL et titre de la page
    const pageInfo = await page.evaluate(() => ({
      url: window.location.href,
      title: document.title,
      bodyText: document.body.innerText.substring(0, 500)
    }));
    
    console.log(`🔍 URL: ${pageInfo.url}`);
    console.log(`🔍 Titre page: ${pageInfo.title}`);
    
    // Screenshot avant navigation
    await safeScreenshot(page, 'screenshot_avant_travail_a_faire.png');
    
    // DEBUG: Chercher tous les liens/boutons de menu
    const menuItems = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('a, button, div[role="tab"], li'));
      return elements
        .filter(el => {
          const text = (el.innerText || '').trim();
          return text.length > 0 && text.length < 50;
        })
        .map(el => ({
          tag: el.tagName,
          text: el.innerText?.substring(0, 40),
          className: el.className
        }))
        .slice(0, 30); // Limiter pour ne pas surcharger les logs
    });
    
    console.log('🔍 DEBUG - Éléments de menu trouvés:', JSON.stringify(menuItems, null, 2));
    
    // Chercher directement "Travail à faire"
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
               document.body.innerText.includes('Pour mercredi') ||
               document.body.innerText.includes('Vue chronologique') ||
               document.body.innerText.includes('Toutes les matières');
      });
      
      if (!alreadyInView) {
        // Essayer de cliquer sur "Cahier de textes" puis "Travail à faire"
        console.log('⚠️  Tentative via "Cahier de textes"...');
        const cahierClicked = await page.evaluate(() => {
          const allElements = Array.from(document.querySelectorAll('*'));
          const cahierElement = allElements.find(el => {
            const text = el.innerText?.trim();
            return text === 'Cahier de textes' || text === 'Cahier de texte';
          });
          
          if (cahierElement) {
            cahierElement.click();
            return true;
          }
          return false;
        });
        
        if (cahierClicked) {
          console.log('✅ Clic sur "Cahier de textes"');
          await wait(3000);
          
          // Maintenant chercher "Travail à faire"
          const travailClicked2 = await page.evaluate(() => {
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
          
          if (travailClicked2) {
            console.log('✅ Clic sur "Travail à faire"');
            await wait(3000);
          } else {
            throw new Error('❌ "Travail à faire" non trouvé après "Cahier de textes"');
          }
        } else {
          throw new Error('❌ Impossible de trouver "Travail à faire" ou "Cahier de textes"');
        }
      } else {
        console.log('✅ Déjà dans la bonne vue');
        return;
      }
    } else {
      console.log('✅ Clic sur "Travail à faire" effectué');
      await wait(3000);
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
      await wait(1000);
    }
    
    await safeScreenshot(page, 'screenshot_travail_a_faire.png');
    console.log('✅ Navigation vers "Travail à faire" terminée');
    
  } catch (error) {
    console.error('❌ Erreur lors de la navigation:', error.message);
    await safeScreenshot(page, 'screenshot_erreur_travail_a_faire.png');
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
    
    if (devoirs.length > 0) {
      console.log('\n📊 Répartition par matière:');
      Object.entries(parMatiere).forEach(([matiere, count]) => {
        console.log(`   - ${matiere}: ${count} devoir(s)`);
      });
    }
    
    return devoirs;
    
  } catch (error) {
    console.error('❌ Erreur lors du scraping:', error.message);
    return [];
  }
};

/**
 * Fonction principale de récupération des données Pronote avec fallback intelligent
 */
const scrapePronoteData = async (page, pronoteUrl, enfant = null) => {
  try {
    const enfantInfo = enfant ? ` pour ${enfant.nom}` : '';
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔍 DÉBUT DU SCRAPING PRONOTE${enfantInfo}`);
    console.log('='.repeat(80));
    
    await wait(2000);
    
    // Navigation vers "Travail à faire"
    await naviguerVersTravailAFaire(page);
    
    // Calculer le lundi de la semaine cible
    let lundiCible = calculerLundiCible();
    console.log(`\n🎯 Lundi cible initial: ${formaterDatePronote(lundiCible)} (${formaterDateISO(lundiCible)})`);
    
    // Sauvegarder le lundi de la semaine en cours pour fallback
    const maintenant = new Date();
    const jourSemaine = maintenant.getDay();
    const joursDepuisLundi = jourSemaine === 0 ? 6 : jourSemaine - 1;
    const lundiSemaineEnCours = new Date(maintenant);
    lundiSemaineEnCours.setDate(maintenant.getDate() - joursDepuisLundi);
    lundiSemaineEnCours.setHours(0, 0, 0, 0);
    
    let devoirs = [];
    let lundiScrappe = null;
    const intervallesTestes = [0, 7, 14, 21]; // Semaine cible, puis +7, +14, +21
    
    // Tester les différents intervalles
    for (const joursSupplementaires of intervallesTestes) {
      const dateTest = new Date(lundiCible);
      dateTest.setDate(lundiCible.getDate() + joursSupplementaires);
      
      const label = joursSupplementaires === 0 ? 'semaine cible' : `+${joursSupplementaires} jours`;
      console.log(`\n📅 Test ${label}: ${formaterDatePronote(dateTest)}`);
      
      await naviguerVersDate(page, dateTest);
      devoirs = await scraperTousLesDevoirs(page);
      
      if (devoirs.length > 0) {
        console.log(`✅ ${devoirs.length} devoirs trouvés à ${formaterDatePronote(dateTest)} !`);
        lundiScrappe = dateTest;
        break;
      } else {
        console.log(`⚠️  Aucun devoir à ${formaterDatePronote(dateTest)}, tentative suivante...`);
      }
    }
    
    // Si toujours aucun devoir, revenir à la semaine en cours
    if (devoirs.length === 0 && lundiCible.getTime() !== lundiSemaineEnCours.getTime()) {
      console.log('\n⚠️  Aucun devoir trouvé dans les semaines futures, retour à la semaine EN COURS...');
      await naviguerVersDate(page, lundiSemaineEnCours);
      devoirs = await scraperTousLesDevoirs(page);
      lundiScrappe = lundiSemaineEnCours;
      
      if (devoirs.length === 0) {
        console.log('⚠️  Aucun devoir trouvé, même en semaine en cours');
      }
    }
    
    // Si lundiScrappe est null, utiliser lundiCible
    if (!lundiScrappe) {
      lundiScrappe = lundiCible;
    }
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ SCRAPING TERMINÉ${enfantInfo}`);
    console.log(`📊 Total: ${devoirs.length} devoirs scrapés`);
    console.log(`📅 Semaine scrapée: ${formaterDatePronote(lundiScrappe)} (${formaterDateISO(lundiScrappe)})`);
    console.log('='.repeat(80));
    
    const scrapedData = {
      devoirs: devoirs,
      scrapedAt: new Date().toISOString(),
      semaineScrapee: formaterDateISO(lundiScrappe),
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
    
    return scrapedData; // 🆕 Retourner les données pour les logs
    
  } catch (error) {
    console.error('❌ Erreur lors du scraping Pronote:', error.message);
    throw error;
  }
};

/**
 * Fonction de sauvegarde dans Firestore (CLEAN: suppression puis création)
 */
const saveToFirestore = async (data, enfant = null) => {
  try {
    const enfantInfo = enfant ? ` pour ${enfant.nom}` : '';
    console.log(`\n💾 Sauvegarde des données vers Firestore${enfantInfo}...`);
    
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

    // ÉTAPE 1: Supprimer l'ancien document
    console.log('🗑️  Suppression des anciens devoirs...');
    await devoirsRef.delete().catch(() => {
      console.log('ℹ️  Aucun ancien document à supprimer');
    });
    
    await wait(500); // Petite pause pour s'assurer que la suppression est bien propagée
    
    // ÉTAPE 2: Créer le nouveau document
    if (data.devoirs && data.devoirs.length > 0) {
      console.log('📝 Création du nouveau document...');
      await devoirsRef.set({
        devoirs: data.devoirs,
        count: data.devoirs.length,
        stats: data.stats,
        semaineScrapee: data.semaineScrapee,
        childId: enfant?.id,
        childName: enfant?.nom,
        lastUpdate: timestamp,
      });
      
      console.log(`✅ ${data.devoirs.length} devoirs sauvegardés${enfantInfo}`);
      console.log(`📅 Semaine scrapée: ${data.semaineScrapee}`);
    } else {
      console.log(`⚠️  Aucun devoir à sauvegarder${enfantInfo}`);
      // On laisse le document supprimé, pas de création
    }

  } catch (error) {
    console.error('❌ Erreur sauvegarde Firestore:', error.message);
    throw error;
  }
};

module.exports = { scrapePronoteData, saveToFirestore };