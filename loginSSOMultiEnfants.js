// Charger les variables d'environnement depuis le fichier .env
require('dotenv').config();

const puppeteer = require('puppeteer');
const { scrapePronoteData } = require('./scrapePronote');

// URLs
const SSO_URL = 'https://educonnect.education.gouv.fr/idp/profile/SAML2/Redirect/SSO?execution=e1s2';
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
    console.log('Vérification de l\'écran de sélection de profil...');
    const profilEleveSelector = '#bouton_eleve';
    
    const needsProfileSelection = await page.$(profilEleveSelector);
    if (needsProfileSelection) {
      console.log('Écran de sélection détecté. Clic sur "Élève"...');
      await page.click(profilEleveSelector);
      await page.waitForSelector('#username', { visible: true, timeout: 20000 });
      console.log('✓ Formulaire de connexion affiché après sélection de profil');
      await wait(1000);
    }

    // Analyse de la page
    console.log('🔍 Analyse de la page pour détecter les champs de formulaire...');
    const formInfo = await page.evaluate(() => {
      const result = { inputs: [], buttons: [], forms: [] };
      document.querySelectorAll('input').forEach((input, index) => {
        result.inputs.push({
          index, type: input.type, name: input.name, id: input.id, 
          placeholder: input.placeholder, className: input.className, autocomplete: input.autocomplete
        });
      });
      document.querySelectorAll('button, input[type="submit"]').forEach((btn, index) => {
        result.buttons.push({
          index, type: btn.type, id: btn.id, className: btn.className, text: btn.innerText || btn.value
        });
      });
      document.querySelectorAll('form').forEach((form, index) => {
        result.forms.push({ index, id: form.id, action: form.action, method: form.method });
      });
      return result;
    });

    console.log('📋 Formulaires détectés:', JSON.stringify(formInfo, null, 2));

    // Détermination des sélecteurs
    let usernameSelector = null;
    const possibleUsernameInputs = formInfo.inputs.filter(input => 
      input.type === 'text' || input.type === 'email' ||
      (input.name && input.name.toLowerCase().includes('user')) ||
      (input.id && input.id.toLowerCase().includes('user')) ||
      (input.placeholder && input.placeholder.toLowerCase().includes('identif'))
    );

    if (possibleUsernameInputs.length > 0) {
      const firstInput = possibleUsernameInputs[0];
      usernameSelector = firstInput.id ? `#${firstInput.id}` : `input[name="${firstInput.name}"]`;
      console.log(`✓ Sélecteur username choisi: ${usernameSelector}`);
    } else {
      usernameSelector = '#username';
    }

    let passwordSelector = null;
    const possiblePasswordInputs = formInfo.inputs.filter(input => input.type === 'password');
    if (possiblePasswordInputs.length > 0) {
      passwordSelector = possiblePasswordInputs[0].id ? `#${possiblePasswordInputs[0].id}` : '#password';
      console.log(`✓ Sélecteur password choisi: ${passwordSelector}`);
    } else {
      throw new Error('Aucun champ password trouvé');
    }

    // Saisie des identifiants
    console.log('Attente du champ identifiant...');
    await page.waitForSelector(usernameSelector, { visible: true, timeout: 10000 });
    console.log('Saisie de l\'identifiant...');
    await page.type(usernameSelector, USERNAME, { delay: 100 });

    console.log('Saisie du mot de passe...');
    await page.type(passwordSelector, PASSWORD, { delay: 100 });

    await wait(1000);
    await page.screenshot({ path: 'screenshot_after_typing.png', fullPage: true });

    let submitSelector = '#bouton_valider';
    
    console.log('Clic sur le bouton de connexion...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
      page.click(submitSelector).catch(async () => {
        console.log('⚠️ Tentative de soumission via formulaire...');
        await page.evaluate(() => document.querySelector('form')?.submit());
      })
    ]);
    
    console.log('✓ Formulaire soumis');
    await wait(3000);
    await page.screenshot({ path: 'screenshot_after_login.png', fullPage: true });

    const errorMessage = await page.evaluate(() => {
      const errorElement = document.querySelector('.error, .alert-danger, .fr-error-text');
      return errorElement ? errorElement.innerText : null;
    });

    if (errorMessage) throw new Error(`Erreur de connexion: ${errorMessage}`);

    console.log('✅ Connexion SSO réussie');

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
    
    // Chercher le sélecteur d'enfant
    const enfantSelectionne = await page.evaluate((selecteur) => {
      // Chercher tous les éléments qui pourraient être le sélecteur d'enfant
      const elements = Array.from(document.querySelectorAll('a, button, div[onclick], span, select option'));
      const enfantElement = elements.find(el => 
        el.innerText && el.innerText.includes(selecteur)
      );
      
      if (enfantElement) {
        // Si c'est une option de select
        if (enfantElement.tagName === 'OPTION') {
          const select = enfantElement.closest('select');
          if (select) {
            select.value = enfantElement.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        } else {
          // Sinon cliquer sur l'élément
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
    console.log('=== DÉMARRAGE DU SCRIPT DE CONNEXION MULTI-ENFANTS ===\n');
    
    // Récupérer l'enfant depuis les arguments ou scraper pour tous
    const enfantArg = process.argv[2]; // Ex: node loginSSO.js kelia
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
        console.log(`⚠️  Enfant "${enfantArg}" non trouvé. Scraping pour tous les enfants.\n`);
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
    console.log('\n📍 Navigation vers Pronote...');
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
      
      // Sélectionner l'enfant
      await selectEnfant(page, enfant);
      
      // Scraper les données
      console.log(`\n=== LANCEMENT DU SCRAPING PRONOTE POUR ${enfant.nom} ===`);
      await scrapePronoteData(page, PRONOTE_URL, enfant);
      
      console.log(`\n✅ Scraping terminé pour ${enfant.nom}`);
      
      // Attendre un peu avant de passer au suivant
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

// Exécuter si ce script est lancé directement
if (require.main === module) {
  run();
}

module.exports = { loginWithSSO, selectEnfant, run };
