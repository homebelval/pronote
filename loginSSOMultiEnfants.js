// Charger les variables d'environnement
require('dotenv').config();

const puppeteer = require('puppeteer');
const { scrapePronoteData } = require('./scrapePronote');

// URLs
const SSO_URL = 'https://educonnect.education.gouv.fr/idp/profile/SAML2/Redirect/SSO?execution=e1s2';
const PRONOTE_URL = process.env.PRONOTE_URL;

const USERNAME = process.env.SSO_USERNAME;
const PASSWORD = process.env.SSO_PASSWORD;

// Configuration des enfants
const ENFANTS = [
  {
    id: 'zxvjGHsYdlwt2I6bhGBg',
    nom: 'Kélia',
    selecteur: 'BELVAL Kélia'
  },
  {
    id: 'dZyDqjwOabEaLff8qK27',
    nom: 'Maëlie',
    selecteur: 'BELVAL Maëlie'
  }
];

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper pour les captures d'écran sécurisées
const safeScreenshot = async (page, path) => {
  try {
    await wait(500);
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
    console.log(`⚠️  Screenshot ${path} ignoré:`, error.message);
    return false;
  }
};

/**
 * Fonction de connexion via SSO
 */
const loginWithSSO = async (page) => {
  try {
    console.log('Ouverture de la page SSO EduConnect...');
    await page.goto(SSO_URL, { 
      waitUntil: 'networkidle2',
      timeout: 60000 
    });
    console.log('Page SSO chargée');

    await wait(2000);
    await safeScreenshot(page, 'screenshot_initial.png');
    console.log('📸 Capture initiale prise');

    // Sélection profil élève
    const profilEleveSelector = '#bouton_eleve';
    const needsProfileSelection = await page.$(profilEleveSelector);
    if (needsProfileSelection) {
      console.log('Écran de sélection détecté. Clic sur "Élève"...');
      await page.click(profilEleveSelector);
      await page.waitForSelector('#username', { visible: true, timeout: 20000 });
      console.log('✓ Formulaire de connexion affiché');
      await wait(1000);
    }

    // Saisie des identifiants
    console.log('Saisie de l\'identifiant...');
    await page.waitForSelector('#username', { visible: true, timeout: 10000 });
    await page.type('#username', USERNAME, { delay: 100 });

    console.log('Saisie du mot de passe...');
    await page.type('#password', PASSWORD, { delay: 100 });

    await wait(1000);
    await safeScreenshot(page, 'screenshot_after_typing.png');

    console.log('Clic sur le bouton de connexion...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
      page.click('#bouton_valider').catch(async () => {
        await page.evaluate(() => document.querySelector('form')?.submit());
      })
    ]);
    
    console.log('✓ Formulaire soumis');
    await wait(3000);
    await safeScreenshot(page, 'screenshot_after_login.png');

    console.log('✅ Connexion SSO réussie');
    
    // 🆕 AJOUT: Vérifier si on est redirigé vers "au college 84"
    await wait(3000);
    const currentUrl = page.url();
    console.log(`🔍 URL après SSO: ${currentUrl}`);
    
    if (currentUrl.includes('aucollege84') || currentUrl.includes('wayf')) {
      console.log('🔄 Détection de la page "au college 84"...');
      await safeScreenshot(page, 'screenshot_aucollege84.png');
      
      // Cliquer sur "Responsable d'élèves" sur cette page
      console.log('🎯 Clic sur "Responsable d\'élèves" (page au college 84)...');
      const clicked = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('*'));
        const btn = elements.find(el => {
          const text = (el.innerText || el.textContent || '').trim();
          return text.includes('Responsable') && text.includes('élève');
        });
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });
      
      if (clicked) {
        console.log('✅ Clic effectué, attente de la redirection vers Pronote...');
        await wait(5000);
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
        await wait(3000);
        console.log(`🔍 Nouvelle URL: ${page.url()}`);
      } else {
        console.log('⚠️ Bouton non trouvé sur la page au college 84');
      }
    }

  } catch (error) {
    console.error('❌ Erreur lors de la connexion SSO:', error.message);
    await safeScreenshot(page, 'screenshot_error.png');
    throw error;
  }
};

/**
 * Sélectionner un enfant dans Pronote
 */
const selectEnfant = async (page, enfant) => {
  try {
    console.log(`\n👤 Sélection de l'enfant: ${enfant.nom}...`);
    
    // Attendre que la page soit bien chargée
    await wait(3000);
    
    // DEBUG: Afficher l'URL actuelle
    const currentUrl = page.url();
    console.log(`🔍 URL actuelle: ${currentUrl}`);
    
    // Screenshot avant sélection
    await safeScreenshot(page, `screenshot_avant_selection_${enfant.nom}.png`);
    
    // DEBUG: Chercher tous les éléments qui pourraient être des sélecteurs d'enfants
    const debugSelectors = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('a, button, div[onclick], span, select, option'));
      return elements
        .filter(el => {
          const text = el.innerText || el.textContent || '';
          return text.length > 0 && text.length < 100 && 
                 (text.includes('BELVAL') || text.includes('Kélia') || text.includes('Maëlie'));
        })
        .map(el => ({
          tag: el.tagName,
          text: (el.innerText || el.textContent || '').substring(0, 50),
          className: el.className,
          id: el.id
        }));
    });
    
    console.log('🔍 DEBUG - Sélecteurs d\'enfants trouvés:', JSON.stringify(debugSelectors, null, 2));
    
    const enfantSelectionne = await page.evaluate((selecteur) => {
      const elements = Array.from(document.querySelectorAll('a, button, div[onclick], span, select option'));
      const enfantElement = elements.find(el => 
        el.innerText && el.innerText.includes(selecteur)
      );
      
      if (enfantElement) {
        if (enfantElement.tagName === 'OPTION') {
          const select = enfantElement.closest('select');
          if (select) {
            select.value = enfantElement.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        } else {
          enfantElement.click();
          return true;
        }
      }
      return false;
    }, enfant.selecteur);
    
    if (enfantSelectionne) {
      console.log(`✅ ${enfant.nom} sélectionné(e)`);
      await wait(3000);
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {
        console.log('⚠️  Pas de navigation après sélection enfant');
      });
      await wait(2000);
      
      // Screenshot après sélection
      await safeScreenshot(page, `screenshot_apres_selection_${enfant.nom}.png`);
    } else {
      console.log(`⚠️  Impossible de trouver le sélecteur pour ${enfant.nom}`);
      console.log(`⚠️  Recherché: "${enfant.selecteur}"`);
      console.log(`⚠️  Le script continue quand même (peut-être déjà sélectionné par défaut)`);
    }
    
  } catch (error) {
    console.error(`❌ Erreur lors de la sélection de ${enfant.nom}:`, error.message);
  }
};

/**
 * Exécution principale
 */
const run = async () => {
  let browser = null;
  try {
    console.log('=== DÉMARRAGE DU SCRIPT DE SCRAPING PRONOTE V3 ===\n');
    console.log('🆕 Nouvelle version avec gestion intelligente des semaines\n');
    
    const enfantArg = process.argv[2];
    let enfantsToScrape = ENFANTS;
    
    if (enfantArg) {
      const enfantFound = ENFANTS.find(e => 
        e.nom.toLowerCase() === enfantArg.toLowerCase() ||
        e.id === enfantArg
      );
      
      if (enfantFound) {
        enfantsToScrape = [enfantFound];
        console.log(`🎯 Scraping uniquement pour: ${enfantFound.nom}\n`);
      } else {
        console.log(`⚠️ Enfant "${enfantArg}" non trouvé.\n`);
      }
    } else {
      console.log(`🎯 Scraping pour tous les enfants: ${ENFANTS.map(e => e.nom).join(', ')}\n`);
    }
    
    browser = await puppeteer.launch({ 
      headless: "new", 
      args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // Connexion SSO
    await loginWithSSO(page);
    
    // Navigation vers Pronote
    console.log('\n🔗 Navigation vers Pronote...');
    await page.goto(PRONOTE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await wait(3000);
    console.log('✅ Page Pronote chargée');
    
    await safeScreenshot(page, 'screenshot_pronote_choix.png');
    
    // DEBUG: Afficher le contenu de la page avant le clic
    const avantClic = await page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        bodyText: document.body ? document.body.innerText.substring(0, 500) : 'VIDE',
        hasResponsableButton: Array.from(document.querySelectorAll('a, button, div[onclick], span'))
          .some(el => el.innerText && (
            el.innerText.includes('Responsable d\'élève') || 
            el.innerText.includes('Responsable d\'élèves') ||
            el.innerText.includes('Parent')
          ))
      };
    });
    
    console.log('🔍 DEBUG AVANT clic sur Responsable:');
    console.log(`   URL: ${avantClic.url}`);
    console.log(`   Title: ${avantClic.title}`);
    console.log(`   Bouton trouvé: ${avantClic.hasResponsableButton ? 'OUI' : 'NON'}`);
    console.log(`   Début du body: ${avantClic.bodyText.substring(0, 200)}...`);
    
    // Clic sur "Responsable d'élèves"
    console.log('\n🎯 Recherche du bouton "Responsable d\'élèves"...');
    
    const responsableButtonClicked = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('a, button, div[onclick], span'));
      const responsableBtn = elements.find(el => 
        el.innerText && (
          el.innerText.includes('Responsable d\'élève') || 
          el.innerText.includes('Responsable d\'élèves') ||
          el.innerText.includes('Parent')
        )
      );
      
      if (responsableBtn) {
        console.log('Élément trouvé:', responsableBtn.tagName, responsableBtn.className, responsableBtn.href || 'pas de href');
        responsableBtn.click();
        return true;
      }
      return false;
    });
    
    if (responsableButtonClicked) {
      console.log('✅ Clic sur "Responsable d\'élèves" effectué');
      
      // Attendre la navigation
      await wait(3000);
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {
        console.log('⚠️  Navigation timeout, on continue...');
      });
      
      // Attendre beaucoup plus longtemps que le contenu se charge
      console.log('⏳ Attente du chargement du contenu JavaScript...');
      await wait(8000); // Augmenté à 8 secondes
      
      // Attendre spécifiquement que le body ait du contenu
      let retries = 0;
      const maxRetries = 5;
      let pageLoaded = false;
      
      while (retries < maxRetries && !pageLoaded) {
        const content = await page.evaluate(() => {
          return {
            bodyLength: document.body ? document.body.innerText.length : 0,
            title: document.title
          };
        });
        
        console.log(`   Tentative ${retries + 1}/${maxRetries}: ${content.bodyLength} caractères`);
        
        if (content.bodyLength > 100) {
          pageLoaded = true;
          console.log('✅ Contenu chargé !');
        } else {
          console.log('⏳ En attente de contenu...');
          await wait(3000);
          retries++;
        }
      }
      
      if (!pageLoaded) {
        console.log('⚠️  La page n\'a pas chargé complètement après 5 tentatives');
      }
    } else {
      console.log('⚠️  Bouton "Responsable d\'élèves" non trouvé');
    }
    
    await wait(2000);
    await safeScreenshot(page, 'screenshot_pronote_after_click.png');
    
    // DEBUG: Afficher l'URL actuelle et du contenu de la page
    const currentUrl = page.url();
    const pageContent = await page.evaluate(() => {
      return {
        url: window.location.href,
        title: document.title,
        bodyLength: document.body ? document.body.innerText.length : 0,
        hasContent: document.body ? document.body.innerText.length > 100 : false
      };
    });
    
    console.log('🔍 DEBUG après clic:');
    console.log(`   URL: ${currentUrl}`);
    console.log(`   Title: ${pageContent.title}`);
    console.log(`   Body length: ${pageContent.bodyLength} caractères`);
    console.log(`   Page chargée: ${pageContent.hasContent ? 'OUI' : 'NON'}`);
    
    if (!pageContent.hasContent) {
      console.log('⚠️  ATTENTION: La page semble vide ou mal chargée !');
      console.log('⚠️  On continue quand même...');
    }
    
    // Scraper pour chaque enfant
    const enfantsResults = []; // 🆕 Stocker les résultats pour le log final
    
    for (const enfant of enfantsToScrape) {
      console.log('\n' + '='.repeat(80));
      console.log(`👧 SCRAPING POUR: ${enfant.nom.toUpperCase()}`);
      console.log('='.repeat(80));
      
      await selectEnfant(page, enfant);
      const resultData = await scrapePronoteData(page, PRONOTE_URL, enfant);
      
      // 🆕 Sauvegarder le résultat
      enfantsResults.push({
        enfant: enfant,
        data: resultData
      });
      
      console.log(`\n✅ Scraping terminé pour ${enfant.nom}`);
      
      // 🆕 DÉTAILS DU SCRAPING
      if (resultData && resultData.devoirs) {
        console.log(`\n📋 Détails pour ${enfant.nom}:`);
        console.log(`   📊 Total devoirs: ${resultData.devoirs.length}`);
        console.log(`   📅 Semaine scrapée: ${resultData.semaineScrapee}`);
        console.log(`   🕐 Scraping à: ${new Date(resultData.scrapedAt).toLocaleString('fr-FR')}`);
        
        if (resultData.stats && resultData.stats.parMatiere) {
          console.log(`   📚 Par matière:`);
          Object.entries(resultData.stats.parMatiere).forEach(([matiere, count]) => {
            console.log(`      - ${matiere}: ${count} devoir(s)`);
          });
        }
      }
      
      if (enfantsToScrape.indexOf(enfant) < enfantsToScrape.length - 1) {
        await wait(2000);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('=== SCRIPT TERMINÉ AVEC SUCCÈS ===');
    console.log('='.repeat(80));
    
    // 🆕 RÉSUMÉ DÉTAILLÉ
    console.log('\n📊 RÉSUMÉ DE L\'EXÉCUTION:');
    console.log('─'.repeat(80));
    
    const now = new Date();
    const dayNames = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
    const currentDay = dayNames[now.getDay()];
    const currentHour = now.getHours();
    
    console.log(`📅 Date/Heure d'exécution: ${currentDay} ${now.toLocaleString('fr-FR')}`);
    console.log(`🎯 Période détectée: ${currentHour >= 12 && now.getDay() === 5 || now.getDay() === 6 || now.getDay() === 0 ? 'Basculement (Ven 12h-Dim)' : 'Semaine en cours (Lun-Ven 11h59)'}`);
    console.log(`👥 Enfants traités: ${enfantsToScrape.map(e => e.nom).join(', ')}`);
    console.log(`✅ Statut: Succès`);
    
    console.log('\n📸 Screenshots générés:');
    const screenshots = [
      'screenshot_initial.png',
      'screenshot_after_typing.png', 
      'screenshot_after_login.png',
      'screenshot_pronote_choix.png',
      'screenshot_pronote_after_click.png',
      'screenshot_travail_a_faire.png',
      'screenshot_avant_modification_date.png',
      'screenshot_juste_apres_clic.png',
      'screenshot_apres_clic_input.png',
      'screenshot_apres_clic_date.png',
      'screenshot_apres_selection_date.png'
    ];
    screenshots.forEach(s => console.log(`   📷 ${s}`));
    
    console.log('\n💾 Données sauvegardées dans Firebase:');
    enfantsToScrape.forEach(enfant => {
      console.log(`   📁 children/${enfant.id}/pronote/devoirs`);
    });
    
    console.log('\n' + '='.repeat(80));
    
    // 🆕 CRÉATION DU FICHIER DE LOG
    const fs = require('fs');
    const path = require('path');
    
    // Créer le dossier logs s'il n'existe pas
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Nom du fichier avec timestamp
    const timestamp = now.toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const logFileName = `success_${timestamp}.log`;
    const logFilePath = path.join(logsDir, logFileName);
    
    // Contenu du log
    let logContent = '';
    logContent += '='.repeat(80) + '\n';
    logContent += 'PRONOTE SCRAPER - RAPPORT D\'EXÉCUTION RÉUSSIE\n';
    logContent += '='.repeat(80) + '\n\n';
    
    logContent += '📅 INFORMATIONS D\'EXÉCUTION:\n';
    logContent += '─'.repeat(80) + '\n';
    logContent += `Date/Heure: ${currentDay} ${now.toLocaleString('fr-FR')}\n`;
    logContent += `Jour de la semaine: ${currentDay}\n`;
    logContent += `Heure: ${currentHour}h${now.getMinutes().toString().padStart(2, '0')}\n`;
    logContent += `Période: ${currentHour >= 12 && now.getDay() === 5 || now.getDay() === 6 || now.getDay() === 0 ? 'Basculement (Ven 12h-Dim)' : 'Semaine en cours (Lun-Ven 11h59)'}\n`;
    logContent += `Statut: SUCCÈS ✅\n\n`;
    
    logContent += '👥 ENFANTS TRAITÉS:\n';
    logContent += '─'.repeat(80) + '\n';
    enfantsToScrape.forEach(enfant => {
      logContent += `- ${enfant.nom} (ID: ${enfant.id})\n`;
    });
    logContent += '\n';
    
    logContent += '📊 DÉTAILS PAR ENFANT:\n';
    logContent += '─'.repeat(80) + '\n';
    enfantsResults.forEach(result => {
      const { enfant, data } = result;
      logContent += `\n${enfant.nom}:\n`;
      logContent += `  ID: ${enfant.id}\n`;
      if (data && data.devoirs) {
        logContent += `  Total devoirs: ${data.devoirs.length}\n`;
        logContent += `  Semaine scrapée: ${data.semaineScrapee}\n`;
        logContent += `  Scraping à: ${new Date(data.scrapedAt).toLocaleString('fr-FR')}\n`;
        
        if (data.stats && data.stats.parMatiere) {
          logContent += `  Par matière:\n`;
          Object.entries(data.stats.parMatiere).forEach(([matiere, count]) => {
            logContent += `    - ${matiere}: ${count} devoir(s)\n`;
          });
        }
        
        // Ajouter quelques devoirs en exemple
        if (data.devoirs.length > 0) {
          logContent += `  \n  Exemples de devoirs:\n`;
          data.devoirs.slice(0, 3).forEach((devoir, idx) => {
            logContent += `    ${idx + 1}. ${devoir.matiere} - Pour ${devoir.datePour}\n`;
            logContent += `       ${devoir.contenu.substring(0, 80)}${devoir.contenu.length > 80 ? '...' : ''}\n`;
          });
          if (data.devoirs.length > 3) {
            logContent += `    ... et ${data.devoirs.length - 3} autre(s) devoir(s)\n`;
          }
        }
      } else {
        logContent += `  Aucun devoir trouvé\n`;
      }
    });
    logContent += '\n';
    
    logContent += '💾 FIREBASE - EMPLACEMENTS:\n';
    logContent += '─'.repeat(80) + '\n';
    enfantsToScrape.forEach(enfant => {
      logContent += `children/${enfant.id}/pronote/devoirs\n`;
    });
    logContent += '\n';
    
    logContent += '📸 SCREENSHOTS GÉNÉRÉS:\n';
    logContent += '─'.repeat(80) + '\n';
    screenshots.forEach(s => {
      logContent += `${s}\n`;
    });
    logContent += '\n';
    
    logContent += '='.repeat(80) + '\n';
    logContent += 'FIN DU RAPPORT\n';
    logContent += '='.repeat(80) + '\n';
    
    // Écrire le fichier
    fs.writeFileSync(logFilePath, logContent, 'utf8');
    console.log(`\n📝 Rapport de succès sauvegardé: ${logFilePath}`);
    
  } catch (error) {
    console.error('\n❌ ERREUR FATALE:', error.message);
    
    // 🆕 RÉSUMÉ D'ERREUR
    console.log('\n📊 RÉSUMÉ DE L\'ERREUR:');
    console.log('─'.repeat(80));
    
    const now = new Date();
    console.log(`📅 Date/Heure: ${now.toLocaleString('fr-FR')}`);
    console.log(`❌ Type d'erreur: ${error.name}`);
    console.log(`📝 Message: ${error.message}`);
    
    if (error.stack) {
      console.log(`\n🔍 Stack trace (premières lignes):`);
      const stackLines = error.stack.split('\n').slice(0, 5);
      stackLines.forEach(line => console.log(`   ${line}`));
    }
    
    console.log('\n📸 Screenshots de debug disponibles:');
    const debugScreenshots = [
      'screenshot_error.png',
      'screenshot_erreur_navigation_date.png',
      'screenshot_avant_modification_date.png'
    ];
    debugScreenshots.forEach(s => console.log(`   📷 ${s}`));
    
    console.log('\n' + '='.repeat(80));
    
    // 🆕 CRÉATION DU FICHIER DE LOG D'ERREUR
    const fs = require('fs');
    const path = require('path');
    
    // Créer le dossier logs s'il n'existe pas
    const logsDir = path.join(__dirname, 'logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Nom du fichier avec timestamp
    const timestamp = now.toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const logFileName = `error_${timestamp}.log`;
    const logFilePath = path.join(logsDir, logFileName);
    
    // Contenu du log
    let logContent = '';
    logContent += '='.repeat(80) + '\n';
    logContent += 'PRONOTE SCRAPER - RAPPORT D\'ERREUR\n';
    logContent += '='.repeat(80) + '\n\n';
    
    logContent += '📅 INFORMATIONS D\'EXÉCUTION:\n';
    logContent += '─'.repeat(80) + '\n';
    logContent += `Date/Heure: ${now.toLocaleString('fr-FR')}\n`;
    logContent += `Statut: ÉCHEC ❌\n\n`;
    
    logContent += '❌ DÉTAILS DE L\'ERREUR:\n';
    logContent += '─'.repeat(80) + '\n';
    logContent += `Type: ${error.name}\n`;
    logContent += `Message: ${error.message}\n\n`;
    
    if (error.stack) {
      logContent += '🔍 STACK TRACE:\n';
      logContent += '─'.repeat(80) + '\n';
      logContent += error.stack + '\n\n';
    }
    
    logContent += '📸 SCREENSHOTS DE DEBUG:\n';
    logContent += '─'.repeat(80) + '\n';
    debugScreenshots.forEach(s => {
      logContent += `${s}\n`;
    });
    logContent += '\n';
    
    logContent += '='.repeat(80) + '\n';
    logContent += 'FIN DU RAPPORT D\'ERREUR\n';
    logContent += '='.repeat(80) + '\n';
    
    // Écrire le fichier
    fs.writeFileSync(logFilePath, logContent, 'utf8');
    console.log(`\n📝 Rapport d'erreur sauvegardé: ${logFilePath}`);
    
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
};

if (require.main === module) {
  run();
}

module.exports = { loginWithSSO, selectEnfant, run };