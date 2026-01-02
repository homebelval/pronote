// Charger les variables d'environnement
require('dotenv').config();

const puppeteer = require('puppeteer');
const { scrapePronoteData } = require('./scrapePronoteV3');

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
    await page.screenshot({ path: 'screenshot_initial.png', fullPage: true });
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
    await page.screenshot({ path: 'screenshot_after_typing.png', fullPage: true });

    console.log('Clic sur le bouton de connexion...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
      page.click('#bouton_valider').catch(async () => {
        await page.evaluate(() => document.querySelector('form')?.submit());
      })
    ]);
    
    console.log('✓ Formulaire soumis');
    await wait(3000);
    await page.screenshot({ path: 'screenshot_after_login.png', fullPage: true });

    console.log('✅ Connexion SSO réussie');
    
    // 🆕 AJOUT: Vérifier si on est redirigé vers "au college 84"
    await wait(3000);
    const currentUrl = page.url();
    console.log(`📍 URL après SSO: ${currentUrl}`);
    
    if (currentUrl.includes('aucollege84') || currentUrl.includes('wayf')) {
      console.log('🔄 Détection de la page "au college 84"...');
      await page.screenshot({ path: 'screenshot_aucollege84.png', fullPage: true });
      
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
        console.log(`📍 Nouvelle URL: ${page.url()}`);
      } else {
        console.log('⚠️ Bouton non trouvé sur la page au college 84');
      }
    }

  } catch (error) {
    console.error('❌ Erreur lors de la connexion SSO:', error.message);
    await page.screenshot({ path: 'screenshot_error.png', fullPage: true });
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
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
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
    console.log('=== DÉMARRAGE DU SCRIPT DE SCRAPING PRONOTE V2 ===\n');
    
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
    
    await page.screenshot({ path: 'screenshot_pronote_choix.png', fullPage: true });
    
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
        responsableBtn.click();
        return true;
      }
      return false;
    });
    
    if (responsableButtonClicked) {
      console.log('✅ Clic sur "Responsable d\'élèves" effectué');
      await wait(3000);
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
      await wait(2000);
    }
    
    await page.screenshot({ path: 'screenshot_pronote_after_click.png', fullPage: true });
    
    // Scraper pour chaque enfant
    for (const enfant of enfantsToScrape) {
      console.log('\n' + '='.repeat(80));
      console.log(`👧 SCRAPING POUR: ${enfant.nom.toUpperCase()}`);
      console.log('='.repeat(80));
      
      await selectEnfant(page, enfant);
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
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
};

if (require.main === module) {
  run();
}

module.exports = { loginWithSSO, selectEnfant, run };