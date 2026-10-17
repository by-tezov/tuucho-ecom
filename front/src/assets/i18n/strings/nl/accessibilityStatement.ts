import type { Strings } from '../../types';

export const accessibilityStatement: Strings['accessibilityStatement'] = {
  eyebrow: 'Juridische informatie',
  title: 'Toegankelijkheidsverklaring',
  updated: 'Opgesteld op 5 oktober 2026',
  intro:
    'Lumen zet zich in om zijn website voor iedereen toegankelijk te maken, in overeenstemming met de Franse toegankelijkheidsstandaard (RGAA), versie 4.1.2. Deze verklaring geldt voor de hele webwinkel.',
  statusTitle: 'Nalevingsstatus',
  statusBody: [
    'Lumen is gedeeltelijk conform RGAA 4.1.2. De pagina’s van de webwinkel volgen de criteria: navigatie met het toetsenbord, dialoogvensters, berichten die schermlezers voorlezen, labels van velden, contrast en geen opgelegde tijdslimieten.',
    'Inhoud die nog niet toegankelijk is, staat hieronder.',
  ],
  issuesTitle: 'Niet-toegankelijke inhoud',
  issuesIntro: 'De volgende inhoud is nog niet toegankelijk of hangt af van een externe dienst:',
  issues: [
    'Het kiezen van een Mondial Relay-afhaalpunt gebeurt via een module en een kaart van Mondial Relay, die lastig te gebruiken zijn met het toetsenbord of een schermlezer. Levering aan huis blijft mogelijk, en u kunt ons ook schrijven: dan helpen wij u een afhaalpunt te kiezen.',
    'De openingsanimatie van de website en enkele decoratieve animaties kunnen niet vanaf de pagina worden gepauzeerd. Ze stoppen als de instelling voor minder beweging op uw apparaat is ingeschakeld.',
    'De velden voor betaling met kaart en de knoppen voor snel betalen worden geleverd door Stripe, in een kader waarvan wij de inhoud niet beheren.',
    'De demonstratievideo’s worden gehost op YouTube; hun stappen staan ook uitgeschreven op dezelfde pagina.',
  ],
  preparationTitle: 'Opstelling van deze verklaring',
  preparationBody: [
    'Deze verklaring is opgesteld op 5 oktober 2026.',
    'Technologieën gebruikt voor de website: HTML, CSS, JavaScript en WAI-ARIA.',
  ],
  contactTitle: 'Feedback en contact',
  contactBody:
    'Kunt u een inhoud of dienst niet gebruiken? Schrijf ons: wij wijzen u een toegankelijk alternatief of sturen u de inhoud in een andere vorm.',
  contactEmailLabel: 'E-mailadres',
  contactFormLabel: 'Formulier',
  contactPageLink: 'Contactformulier',
};
