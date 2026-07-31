/**
 * Génère le modèle .xlsx téléchargeable pour l'import d'effectif (Effectif → Importer un effectif).
 * One-off : à relancer manuellement (`node scripts/generate-import-template.js`) si les colonnes
 * ou les valeurs autorisées changent. Sortie committée dans public/templates/ (web) et copiée dans
 * mobile/assets/templates/ (mobile), lues telles quelles au runtime — aucune génération à la volée.
 */
const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

const POSITIONS = ['Gardien', 'Meneur', 'Ailier', 'Pivot'];
const FEET = ['Droit', 'Gauche', 'Ambidextre'];

const COLUMNS = [
  { header: 'Prénom', key: 'first_name', width: 18 },
  { header: 'Nom', key: 'last_name', width: 18 },
  { header: 'Date de naissance (JJ/MM/AAAA)', key: 'birth_date', width: 28 },
  { header: 'Poste', key: 'position', width: 14 },
  { header: 'Pied fort', key: 'strong_foot', width: 14 },
  { header: 'Numéro (optionnel)', key: 'number', width: 18 },
];

const LAST_TEMPLATE_ROW = 200; // marge large pour un effectif complet + saisies additionnelles

async function main() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'FutsalHub';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Effectif', {
    views: [{ state: 'frozen', ySplit: 1 }],
  });
  sheet.columns = COLUMNS;

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3B82F6' } };
  headerRow.alignment = { vertical: 'middle', wrapText: true };
  headerRow.height = 32;

  sheet.addRow({
    first_name: 'Lucas',
    last_name: 'Martin',
    birth_date: '15/03/2005',
    position: 'Ailier',
    strong_foot: 'Droit',
    number: 10,
  });
  const exampleRow = sheet.getRow(2);
  exampleRow.font = { italic: true, color: { argb: 'FF697585' } };
  exampleRow.eachCell((cell) => { cell.note = 'Exemple — à remplacer ou supprimer'; });

  // Listes déroulantes natives Excel (Poste / Pied fort) pour éviter les fautes de saisie.
  for (let r = 2; r <= LAST_TEMPLATE_ROW; r++) {
    sheet.getCell(`D${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${POSITIONS.join(',')}"`],
      showErrorMessage: true,
      errorTitle: 'Poste invalide',
      error: `Choisissez une valeur dans la liste : ${POSITIONS.join(', ')}.`,
    };
    sheet.getCell(`E${r}`).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${FEET.join(',')}"`],
      showErrorMessage: true,
      errorTitle: 'Pied fort invalide',
      error: `Choisissez une valeur dans la liste : ${FEET.join(', ')}.`,
    };
  }

  const outputs = [
    path.join(__dirname, '..', 'public', 'templates', 'modele_import_effectif.xlsx'),
    path.join(__dirname, '..', 'mobile', 'assets', 'templates', 'modele_import_effectif.xlsx'),
  ];
  for (const output of outputs) {
    fs.mkdirSync(path.dirname(output), { recursive: true });
    await workbook.xlsx.writeFile(output);
    console.log('Généré :', output);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
