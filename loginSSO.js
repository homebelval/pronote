// Charger les variables d'environnement depuis le fichier .env
require('dotenv').config();

const puppeteer = require('puppeteer');
const { scrapePronoteData } = require('./scrapePronote');

// URLs
const SSO_URL = 'https://educonnect.education.gouv.fr/idp/profile/SAML2/Redirect/SSO?execution=e1s2';
const PRONOTE_URL = process.env.PRONOTE_URL || 'https://0840014j.index-education.net/pronote/parent.html?identifiant=t8tXBYNE6zG2s6Jr';

// Récupérer les identifiants depuis les variables d'environnement
const USERNAME = process.env.SSO_USERNAME;
const PASSWORD = process.env.SSO_PASSWORD;

// Fonction helper pour remplacer waitForTimeout
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper pour les captures d'écran sécurisées
const safeScreenshot = async (page, path) => {
  try {
    // Attendre que la page soit complètement chargée
    await wait(1000);
    
    // Vérifier les dimensions de la page
    const dimensions = await page.evaluate(() => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight
    }));
    
    if (dimensions.width > 0 && dimensions.height > 0) {
      await page.screenshot({ path, fullPage: true });
      return true;
    } else {
      console.log(`⚠️ Impossible de faire la capture ${path} (dimensions invalides)`);
      return false;
    }
  } catch (error) {
    console.log(`⚠️ Erreur capture d'écran ${path}: ${error.message}`);
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

    // --- SÉLECTION DU PROFIL ---
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

    // --- ANALYSE DE LA PAGE ---
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
      usernameSelector = '#username'; // Fallback
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
    await safeScreenshot(page, 'screenshot_after_typing.png');

    // Recherche et clic sur le bouton de soumission
    let submitSelector = '#bouton_valider'; // Standard EduConnect
    
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
    await safeScreenshot(page, 'screenshot_after_login.png');

    // Vérification finale
    const errorMessage = await page.evaluate(() => {
      const errorElement = document.querySelector('.error, .alert-danger, .fr-error-text');
      return errorElement ? errorElement.innerText : null;
    });

    if (errorMessage) throw new Error(`Erreur de connexion: ${errorMessage}`);

    console.log('✅ Connexion SSO réussie');

  } catch (error) {
    console.error('❌ Erreur lors de la connexion SSO:', error.message);
    await safeScreenshot(page, 'screenshot_error.png');
    throw error;
  }
};

/**
 * Exécution principale
 */
const run = async () => {
  let browser = null;
  try {
    console.log('=== DÉMARRAGE DU SCRIPT DE CONNEXION ===');
    browser = await puppeteer.launch({ 
      headless: "new", 
      args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    // Connexion SSO
    await loginWithSSO(page);
    
    // Navigation vers Pronote (avec session SSO active)
    console.log('\n📍 Navigation vers Pronote...');
    await page.goto(PRONOTE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await wait(3000);
    console.log('✅ Page Pronote chargée');
    
    await safeScreenshot(page, 'screenshot_pronote_choix.png');
    
    // === ÉTAPE SUPPLÉMENTAIRE : CLIC SUR "RESPONSABLE D'ÉLÈVES" ===
    console.log('\n🎯 Recherche du bouton "Responsable d\'élèves"...');
    
    // Chercher le bouton par son texte
    const responsableButtonClicked = await page.evaluate(() => {
      // Chercher tous les éléments qui pourraient être le bouton
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
    } else {
      console.log('⚠️  Bouton "Responsable d\'élèves" non trouvé, tentative de continuer...');
    }
    
    await safeScreenshot(page, 'screenshot_pronote_after_click.png');
    console.log('📸 Capture après clic sur Responsable');
    
    console.log('\n=== LANCEMENT DU SCRIPT DE SCRAPING PRONOTE ===');
    
    // Lancer le scraping Pronote (la page est déjà connectée et sur le bon profil)
    await scrapePronoteData(page, PRONOTE_URL);

    console.log('\n=== SCRIPT TERMINÉ AVEC SUCCÈS ===');
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

module.exports = { loginWithSSO, run };