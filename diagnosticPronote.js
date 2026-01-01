const puppeteer = require('puppeteer');
const fs = require('fs');
require('dotenv').config();

const SSO_URL = 'https://educonnect.education.gouv.fr/idp/profile/SAML2/Redirect/SSO?execution=e1s2';
const PRONOTE_URL = process.env.PRONOTE_URL;
const USERNAME = process.env.SSO_USERNAME;
const PASSWORD = process.env.SSO_PASSWORD;

// Validation
if (!PRONOTE_URL || !USERNAME || !PASSWORD) {
  console.error('❌ Variables d\'environnement manquantes dans .env');
  process.exit(1);
}

console.log('✅ Configuration chargée:');
console.log(`   - Username: ${USERNAME}`);
console.log(`   - Pronote URL: ${PRONOTE_URL}\n`);

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const loginWithSSO = async (page) => {
  console.log('🔐 Connexion SSO...');
  await page.goto(SSO_URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await wait(2000);

  // Sélection profil élève si nécessaire
  const profilEleveSelector = '#bouton_eleve';
  const needsProfileSelection = await page.$(profilEleveSelector);
  if (needsProfileSelection) {
    await page.click(profilEleveSelector);
    await page.waitForSelector('#username', { visible: true, timeout: 20000 });
    await wait(1000);
  }

  // Saisie des identifiants
  await page.waitForSelector('#username', { visible: true, timeout: 10000 });
  await page.type('#username', USERNAME, { delay: 100 });
  await page.type('#password', PASSWORD, { delay: 100 });
  await wait(1000);

  // Soumission
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {}),
    page.click('#bouton_valider').catch(async () => {
      await page.evaluate(() => document.querySelector('form')?.submit());
    })
  ]);
  
  await wait(3000);
  console.log('✅ Connexion SSO réussie');
  
  const currentUrl = page.url();
  console.log(`📍 URL actuelle: ${currentUrl}\n`);
};

const analyzePronote = async (page) => {
  console.log('🔍 ANALYSE DE LA STRUCTURE PRONOTE\n');
  
  // On est déjà sur Pronote, pas besoin de naviguer à nouveau
  await wait(2000);
  const finalUrl = page.url();
  console.log(`✅ Analyse de la page: ${finalUrl}\n`);

  // Faire une capture d'écran
  await page.screenshot({ path: 'pronote_screenshot.png', fullPage: true });
  console.log('📸 Capture d\'écran sauvegardée: pronote_screenshot.png\n');

  // Sauvegarder le HTML complet
  const html = await page.content();
  fs.writeFileSync('pronote_page.html', html);
  console.log('✅ HTML complet sauvegardé dans pronote_page.html\n');

  // Analyser toutes les classes CSS utilisées
  const analysis = await page.evaluate(() => {
    const result = {
      allClasses: new Set(),
      allIds: new Set(),
      potentialTimetable: [],
      potentialHomework: [],
      potentialGrades: [],
      iframes: [],
      divs: [],
      mainElements: []
    };

    // Récupérer toutes les classes et IDs
    document.querySelectorAll('*').forEach(el => {
      if (el.className && typeof el.className === 'string') {
        el.className.split(' ').forEach(cls => {
          if (cls.trim()) result.allClasses.add(cls.trim());
        });
      }
      if (el.id) result.allIds.add(el.id);
    });

    // Chercher les principaux conteneurs
    document.querySelectorAll('div[id*="GInterface"], div[class*="interface"]').forEach(el => {
      result.mainElements.push({
        tag: el.tagName,
        id: el.id,
        class: el.className,
        childrenCount: el.children.length
      });
    });

    // Chercher des éléments qui pourraient être l'emploi du temps
    const timetableKeywords = ['emploi', 'edt', 'cours', 'planning', 'horaire', 'semaine', 'calendrier', 'timetable'];
    document.querySelectorAll('div, section, table, ul').forEach(el => {
      const text = el.innerText?.toLowerCase() || '';
      const className = el.className?.toLowerCase() || '';
      const id = el.id?.toLowerCase() || '';
      
      timetableKeywords.forEach(keyword => {
        if (text.includes(keyword) || className.includes(keyword) || id.includes(keyword)) {
          result.potentialTimetable.push({
            tag: el.tagName,
            class: el.className,
            id: el.id,
            textPreview: el.innerText?.substring(0, 100)
          });
        }
      });
    });

    // Chercher des éléments qui pourraient être les devoirs
    const homeworkKeywords = ['devoir', 'travail', 'faire', 'cahier', 'texte'];
    document.querySelectorAll('div, section, ul, li').forEach(el => {
      const text = el.innerText?.toLowerCase() || '';
      const className = el.className?.toLowerCase() || '';
      const id = el.id?.toLowerCase() || '';
      
      homeworkKeywords.forEach(keyword => {
        if (text.includes(keyword) || className.includes(keyword) || id.includes(keyword)) {
          result.potentialHomework.push({
            tag: el.tagName,
            class: el.className,
            id: el.id,
            textPreview: el.innerText?.substring(0, 100)
          });
        }
      });
    });

    // Chercher des éléments qui pourraient être les notes
    const gradeKeywords = ['note', 'eval', 'devoir', 'moyenne', 'competence'];
    document.querySelectorAll('div, section, table, span').forEach(el => {
      const text = el.innerText?.toLowerCase() || '';
      const className = el.className?.toLowerCase() || '';
      const id = el.id?.toLowerCase() || '';
      
      gradeKeywords.forEach(keyword => {
        if (text.includes(keyword) || className.includes(keyword) || id.includes(keyword)) {
          result.potentialGrades.push({
            tag: el.tagName,
            class: el.className,
            id: el.id,
            textPreview: el.innerText?.substring(0, 100)
          });
        }
      });
    });

    // Vérifier les iframes (Pronote utilise souvent des iframes)
    document.querySelectorAll('iframe').forEach(iframe => {
      result.iframes.push({
        id: iframe.id,
        name: iframe.name,
        src: iframe.src
      });
    });

    // Lister les principales divs
    document.querySelectorAll('div[id], div[class*="Pronote"], div[class*="ie_"]').forEach(div => {
      result.divs.push({
        id: div.id,
        class: div.className,
        textPreview: div.innerText?.substring(0, 50)
      });
    });

    return {
      ...result,
      allClasses: Array.from(result.allClasses).sort(),
      allIds: Array.from(result.allIds).sort()
    };
  });

  // Afficher les résultats
  console.log('📊 RÉSULTATS DE L\'ANALYSE\n');
  
  console.log('🎯 IFRAMES DÉTECTÉS:', analysis.iframes.length);
  if (analysis.iframes.length > 0) {
    console.log(JSON.stringify(analysis.iframes, null, 2));
    console.log('\n⚠️  Pronote utilise probablement des iframes. Vous devrez naviguer dans l\'iframe pour scraper les données.\n');
  }

  console.log('🏠 ÉLÉMENTS PRINCIPAUX:', analysis.mainElements.length);
  if (analysis.mainElements.length > 0) {
    console.log(JSON.stringify(analysis.mainElements.slice(0, 5), null, 2));
  }

  console.log('\n📅 ÉLÉMENTS POTENTIELS POUR L\'EMPLOI DU TEMPS:', analysis.potentialTimetable.length);
  if (analysis.potentialTimetable.length > 0) {
    console.log(JSON.stringify(analysis.potentialTimetable.slice(0, 5), null, 2));
  }

  console.log('\n📚 ÉLÉMENTS POTENTIELS POUR LES DEVOIRS:', analysis.potentialHomework.length);
  if (analysis.potentialHomework.length > 0) {
    console.log(JSON.stringify(analysis.potentialHomework.slice(0, 5), null, 2));
  }

  console.log('\n📊 ÉLÉMENTS POTENTIELS POUR LES NOTES:', analysis.potentialGrades.length);
  if (analysis.potentialGrades.length > 0) {
    console.log(JSON.stringify(analysis.potentialGrades.slice(0, 5), null, 2));
  }

  console.log('\n🏷️  PRINCIPALES DIVS:', analysis.divs.length);
  console.log(JSON.stringify(analysis.divs.slice(0, 10), null, 2));

  console.log('\n🎨 TOUTES LES CLASSES CSS (échantillon):');
  console.log(analysis.allClasses.slice(0, 50).join(', '));

  console.log('\n🆔 TOUS LES IDs (échantillon):');
  console.log(analysis.allIds.slice(0, 50).join(', '));

  // Sauvegarder l'analyse complète
  fs.writeFileSync('pronote_analysis.json', JSON.stringify(analysis, null, 2));
  console.log('\n✅ Analyse complète sauvegardée dans pronote_analysis.json');
};

const run = async () => {
  const browser = await puppeteer.launch({ 
    headless: false,  // Mode visible pour mieux voir
    args: ['--no-sandbox', '--disable-setuid-sandbox'] 
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });

  try {
    await loginWithSSO(page);
    
    // Navigation vers Pronote
    console.log('📍 Navigation vers Pronote...');
    await page.goto(PRONOTE_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await wait(3000);
    
    await page.screenshot({ path: 'pronote_choix_profil.png', fullPage: true });
    console.log('📸 Capture de la page de choix de profil\n');
    
    // === CLIC SUR "RESPONSABLE D'ÉLÈVES" ===
    console.log('🎯 Recherche et clic sur "Responsable d\'élèves"...');
    
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
        console.log('Bouton trouvé:', responsableBtn.innerText);
        responsableBtn.click();
        return true;
      }
      return false;
    });
    
    if (responsableButtonClicked) {
      console.log('✅ Clic effectué');
      await wait(3000);
      await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
      await wait(2000);
    } else {
      console.log('⚠️  Bouton non trouvé');
    }
    
    await page.screenshot({ path: 'pronote_after_profil_click.png', fullPage: true });
    console.log('📸 Capture après sélection du profil\n');
    
    // Continuer l'analyse
    await analyzePronote(page);

    console.log('\n✅ Analyse terminée. Appuyez sur Ctrl+C pour fermer le navigateur.');
    console.log('📁 Fichiers générés:');
    console.log('   - pronote_choix_profil.png');
    console.log('   - pronote_after_profil_click.png');
    console.log('   - pronote_screenshot.png');
    console.log('   - pronote_page.html');
    console.log('   - pronote_analysis.json\n');
    
    // Garder le navigateur ouvert pour inspection manuelle
    await new Promise(() => {});
  } catch (error) {
    console.error('\n❌ Erreur:', error.message);
    await browser.close();
    process.exit(1);
  }
};

run();