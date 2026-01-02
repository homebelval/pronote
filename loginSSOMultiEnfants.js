// Charger les variables d'environnement depuis le fichier .env
require('dotenv').config();

const puppeteer = require('puppeteer');
const { scrapePronoteData } = require('./scrapePronote');

// URLs
const AUCOLLEGE84_URL = 'https://www.aucollege84.vaucluse.fr/auth/saml/wayf?callback=https%3A%2F%2Fwww.aucollege84.vaucluse.fr%2F#/';
const PRONOTE_URL = process.env.PRONOTE_URL;

// Récupérer les identifiants depuis les variables d'environnement
const USERNAME = process.env.SSO_USERNAME;
const PASSWORD = process.env.SSO_PASSWORD;

// Configuration des enfants
const ENFANTS = [
  {
    id: 'zxvjGHsYdlwt2I6bhGBg', // ID Firestore de Kélia
    nom: 'Kélia',
    selecteur: 'BELVAL Kélia'
  },
  {
    id: 'dZyDqjwOabEaLff8qK27', // ID Firestore de Maëlie
    nom: 'Maëlie',
    selecteur: 'BELVAL Maëlie'
  }
];

// Fonction helper pour remplacer waitForTimeout
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fonction de connexion via SSO (appelée automatiquement après le clic sur "Responsable d'élèves")
 */
const handleSSOLogin = async (page) => {
  try {
    console.log('\n🔐 Page SSO EduConnect détectée...');
    
    // Attendre que la page SSO charge
    await wait(3000);
    await page.screenshot({ path: 'screenshot_sso_page.png', fullPage: true });

    // Sélection profil élève
    console.log('Vérification de l\'écran de sélection de profil...');
    const profilEleveSelector = '#bouton_eleve';
    
    const needsProfileSelection = await page.$(profilEleveSelector);
    if (needsProfileSelection) {
      console.log('Écran de sélection détecté. Clic sur "Élève"...');
      await page.click(profilEleveSelector);
      await page.waitForSelector('#username', { visible: true, timeout: 30000 });
      console.log('✓ Formulaire de connexion affiché');
      await wait(1000);
    }

    // Déterminer les sélecteurs
    const usernameSelector = '#username';
    const passwordSelector = '#password';
    const submitSelector = '#bouton_valider';

    // Saisie des identifiants
    console.log('Saisie des identifiants SSO...');
    await page.waitForSelector(usernameSelector, { visible: true, timeout: 20000 });
    await page.type(usernameSelector, USERNAME, { delay: 100 });
    await page.type(passwordSelector, PASSWORD, { delay: 100 });

    await wait(1000);
    await page.screenshot({ path: 'screenshot_sso_filled.png', fullPage: true });

    console.log('Soumission du formulaire SSO...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 }),
      page.click(submitSelector)
    ]);
    
    await wait(3000);
    await page.screenshot({ path: 'screenshot_after_sso.png', fullPage: true });

    console.log('✅ Connexion SSO réussie');

  } catch (error) {
    console.error('❌ Erreur lors de la connexion SSO:', error.message);
    await page.screenshot({ path: 'screenshot_sso_error.png', fullPage: true });
    throw error;
  }
};

/**
 * Sélectionner un enfant dans Pronote
 */
const selectEnfant = async (page, enfant) => {
  try {
    console.log(`\n👤 Sélection de l'enfant: ${enfant.nom}...`);
    
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
      await wait(2000);
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 20000 }).catch(() => {});
      await wait(1000);
    } else {
      console.log(`⚠️  Impossible de trouver le sélecteur pour ${enfant.nom}`);
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
    console.log('=== DÉMARRAGE DU SCRIPT PRONOTE ===\n');
    
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
        console.log(`⚠️  Enfant "${enfantArg}" non trouvé. Scraping pour tous.\n`);
      }
    } else {
      console.log(`🎯 Scraping pour tous les enfants: ${ENFANTS.map(e => e.nom).join(', ')}\n`);
    }
    
    const PUPPETEER_OPTIONS = {
      headless: "new",
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--disable-blink-features=AutomationControlled'
      ],
      ...(process.env.PUPPETEER_EXECUTABLE_PATH && {
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH
      })
    };
    
    browser = await puppeteer.launch(PUPPETEER_OPTIONS);
    const page = await browser.newPage();
    
    // Headers réalistes
    await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    });
    
    await page.setCacheEnabled(true);
    page.setDefaultNavigationTimeout(180000);
    await page.setViewport({ width: 1280, height: 900 });

    // ===================================================================
    // ÉTAPE 1 : Aller sur "au college 84" et cliquer sur "Responsable d'élèves"
    // ===================================================================
    console.log('📍 Étape 1/3 : Navigation vers "au college 84"...');
    await page.goto(AUCOLLEGE84_URL, { waitUntil: 'networkidle2', timeout: 120000 });
    await wait(5000);
    
    let currentUrl = page.url();
    console.log(`URL actuelle: ${currentUrl}`);
    await page.screenshot({ path: 'screenshot_aucollege84_initial.png', fullPage: true });
    
    console.log('\n🎯 Recherche du bouton "Responsable d\'élèves"...');
    
    const responsableClicked = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('*'));
      
      const responsableBtn = elements.find(el => {
        const text = (el.innerText || el.textContent || '').trim();
        return text.includes('Responsable') && text.includes('élève');
      });
      
      if (responsableBtn) {
        console.log('🎯 Bouton trouvé!');
        responsableBtn.click();
        return true;
      }
      return false;
    });
    
    if (!responsableClicked) {
      console.log('❌ Bouton "Responsable d\'élèves" NON TROUVÉ');
      
      const clickables = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('*'))
          .map(el => ({
            tag: el.tagName,
            text: (el.innerText || el.textContent || '').substring(0, 80).trim()
          }))
          .filter(b => b.text && b.text.length > 5 && b.text.length < 100);
      });
      console.log('📋 Textes visibles:', JSON.stringify(clickables.slice(0, 20), null, 2));
      
      throw new Error('Impossible de trouver "Responsable d\'élèves"');
    }
    
    console.log('✅ Clic sur "Responsable d\'élèves" effectué');
    
    // ===================================================================
    // ÉTAPE 2 : Attendre la redirection vers SSO et se connecter
    // ===================================================================
    console.log('\n📍 Étape 2/3 : Attente de la redirection vers SSO EduConnect...');
    await wait(3000);
    
    // Attendre soit une navigation, soit que l'URL change
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 }).catch(() => {});
    await wait(3000);
    
    currentUrl = page.url();
    console.log(`URL après clic: ${currentUrl}`);
    
    if (currentUrl.includes('educonnect')) {
      await handleSSOLogin(page);
    } else {
      console.log('⚠️ Pas de redirection vers SSO détectée');
      throw new Error('Redirection SSO non détectée');
    }
    
    // ===================================================================
    // ÉTAPE 3 : Attendre la redirection vers Pronote
    // ===================================================================
    console.log('\n📍 Étape 3/3 : Attente de la redirection vers Pronote...');
    await wait(5000);
    
    currentUrl = page.url();
    console.log(`URL actuelle: ${currentUrl}`);
    
    if (currentUrl.includes('pronote') || currentUrl.includes('index-education')) {
      console.log('✅ Redirection vers Pronote réussie !');
    } else {
      console.log('⚠️ Pas sur Pronote, URL:', currentUrl);
      throw new Error('Redirection Pronote non détectée');
    }
    
    await page.screenshot({ path: 'screenshot_pronote_interface.png', fullPage: true });
    console.log('\n✅ Accès à Pronote OK, début du scraping...\n');
    
    // ===================================================================
    // SCRAPING POUR CHAQUE ENFANT
    // ===================================================================
    for (const enfant of enfantsToScrape) {
      console.log('\n' + '='.repeat(80));
      console.log(`👧 SCRAPING POUR: ${enfant.nom.toUpperCase()}`);
      console.log('='.repeat(80));
      
      await selectEnfant(page, enfant);
      
      console.log(`\n=== LANCEMENT DU SCRAPING PRONOTE POUR ${enfant.nom} ===`);
      await scrapePronoteData(page, PRONOTE_URL, enfant);
      
      console.log(`\n✅ Scraping terminé pour ${enfant.nom}`);
      
      if (enfantsToScrape.indexOf(enfant) < enfantsToScrape.length - 1) {
        await wait(2000);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('=== SCRIPT TERMINÉ AVEC SUCCÈS ===');
    console.log('='.repeat(80));
    
  } catch (error) {
    console.error('\n❌ ERREUR FATALE:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
};

if (require.main === module) {
  run();
}

module.exports = { run };