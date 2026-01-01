// Charger les variables d'environnement depuis le fichier .env
require('dotenv').config();

const puppeteer = require('puppeteer');
const admin = require('firebase-admin');
const db = require('./firebase');  // Firebase Admin SDK

// URLs
const SSO_URL = 'https://educonnect.education.gouv.fr/idp/profile/SAML2/Redirect/SSO?execution=e1s2';
const PROFILE_URL = 'https://moncompte.educonnect.education.gouv.fr/educt-self-service/profil/consultationProfil';
const PRONOTE_URL = process.env.PRONOTE_URL || 'https://0840014j.index-education.net/pronote/parent.html?identifiant=t8tXBYNE6zG2s6Jr';

// Récupérer les identifiants depuis les variables d'environnement
const USERNAME = process.env.SSO_USERNAME;
const PASSWORD = process.env.SSO_PASSWORD;

// Fonction helper pour remplacer waitForTimeout
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Fonction pour détecter automatiquement les sélecteurs de formulaire (votre logique originale)
 */
const detectFormSelectors = async (page) => {
  console.log('🔍 Détection automatique des sélecteurs...');
  
  const selectors = await page.evaluate(() => {
    const result = {
      usernameSelectors: [],
      passwordSelectors: [],
      submitSelectors: []
    };

    // Chercher les champs username/email
    const usernameInputs = document.querySelectorAll('input[type="text"], input[type="email"], input[name*="user"], input[id*="user"], input[placeholder*="identifiant"], input[placeholder*="utilisateur"]');
    usernameInputs.forEach(input => {
      if (input.id) result.usernameSelectors.push(`#${input.id}`);
      if (input.name) result.usernameSelectors.push(`[name="${input.name}"]`);
      if (input.className) result.usernameSelectors.push(`.${input.className.split(' ')[0]}`);
    });

    // Chercher les champs password
    const passwordInputs = document.querySelectorAll('input[type="password"]');
    passwordInputs.forEach(input => {
      if (input.id) result.passwordSelectors.push(`#${input.id}`);
      if (input.name) result.passwordSelectors.push(`[name="${input.name}"]`);
      if (input.className) result.passwordSelectors.push(`.${input.className.split(' ')[0]}`);
    });

    // Chercher les boutons submit
    const submitButtons = document.querySelectorAll('button[type="submit"], input[type="submit"], button:not([type])');
    submitButtons.forEach(btn => {
      if (btn.id) result.submitSelectors.push(`#${btn.id}`);
      if (btn.className) result.submitSelectors.push(`.${btn.className.split(' ')[0]}`);
      result.submitSelectors.push('button[type="submit"]');
    });

    return result;
  });

  console.log('Sélecteurs détectés:', JSON.stringify(selectors, null, 2));
  return selectors;
};

/**
 * Fonction de connexion via SSO corrigée
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

    // --- CORRECTION : SÉLECTION DU PROFIL ---
    console.log('Vérification de l\'écran de sélection de profil...');
    const profilEleveSelector = '#bouton_eleve';
    
    const needsProfileSelection = await page.$(profilEleveSelector);
    if (needsProfileSelection) {
      console.log('Écran de sélection détecté. Clic sur "Élève"...');
      // On clique et on attend que le champ username apparaisse au lieu d'attendre la navigation entière
      await page.click(profilEleveSelector);
      await page.waitForSelector('#username', { visible: true, timeout: 20000 });
      console.log('✓ Formulaire de connexion affiché après sélection de profil');
      await wait(1000);
    }

    // --- ANALYSE DE LA PAGE (votre logique originale) ---
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

    // Détermination des sélecteurs (votre logique originale)
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
    await page.screenshot({ path: 'screenshot_after_typing.png', fullPage: true });

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
    await page.screenshot({ path: 'screenshot_after_login.png', fullPage: true });

    // Vérification finale
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
 * Fonction de récupération de l'emploi du temps (votre logique originale)
 */
const scrapeTimetable = async (page) => {
  try {
    console.log('Navigation vers la page Pronote...');
    await page.goto(PRONOTE_URL, { waitUntil: 'networkidle0', timeout: 60000 });
    console.log('Page Pronote chargée');

    await wait(5000); // Laisser Pronote charger ses widgets

    const timetable = await page.evaluate(() => {
      // Sélecteurs génériques Pronote (à adapter si nécessaire)
      const timetableElements = document.querySelectorAll('.EmplacementCours, .timetable-class');
      const timetableData = [];
      
      timetableElements.forEach((el) => {
        const text = el.innerText.trim().replace(/\s\s+/g, ' ');
        if (text) {
          timetableData.push({ info: text, time: new Date().toISOString() });
        }
      });
      return timetableData;
    });

    return timetable;
  } catch (error) {
    console.error('Erreur lors du scraping:', error.message);
    return [];
  }
};

/**
 * Fonction Firestore
 */
const saveToFirestore = async (data) => {
  try {
    console.log('Envoi des données vers Firestore...');
    const docRef = db.collection('timetable').doc('current_schedule');
    await docRef.set({
      timetable: data,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('Données envoyées à Firestore avec succès');
  } catch (error) {
    console.error('Erreur Firestore:', error.message);
  }
};

/**
 * Exécution principale
 */
const run = async () => {
  let browser = null;
  try {
    console.log('=== DÉMARRAGE DU SCRIPT ===');
    browser = await puppeteer.launch({ 
      headless: "new", 
      args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });

    await loginWithSSO(page);
    const data = await scrapeTimetable(page);
    await saveToFirestore(data);

    console.log('\n=== SCRIPT TERMINÉ AVEC SUCCÈS ===');
  } catch (error) {
    console.error('\n❌ ERREUR FATALE:', error.message);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
};

run();