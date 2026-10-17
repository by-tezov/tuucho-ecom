import type { Strings } from '../../types';

export const accessibilityStatement: Strings['accessibilityStatement'] = {
  eyebrow: 'Informazioni legali',
  title: 'Dichiarazione di accessibilità',
  updated: 'Redatta il 5 ottobre 2026',
  intro:
    'Lumen si impegna a rendere il proprio sito accessibile a tutte e a tutti, in conformità con il referenziale francese di accessibilità (RGAA), versione 4.1.2. La presente dichiarazione si applica all’intero negozio online.',
  statusTitle: 'Stato di conformità',
  statusBody: [
    'Lumen è parzialmente conforme al RGAA 4.1.2. Le pagine del negozio seguono i criteri del referenziale: navigazione da tastiera, finestre di dialogo, messaggi letti dagli screen reader, etichette dei campi, contrasti e assenza di limiti di tempo imposti.',
    'I contenuti che non sono ancora accessibili sono elencati più sotto.',
  ],
  issuesTitle: 'Contenuti non accessibili',
  issuesIntro: 'I seguenti contenuti non sono ancora accessibili o dipendono da un servizio di terzi:',
  issues: [
    'La scelta di un punto di ritiro Mondial Relay avviene tramite un modulo e una mappa forniti da Mondial Relay, difficili da usare da tastiera o con uno screen reader. La consegna a domicilio resta disponibile e può anche scriverci: la aiuteremo a scegliere il punto di ritiro.',
    'L’animazione di apertura del sito e alcune animazioni decorative non possono essere messe in pausa dalla pagina. Si fermano se l’impostazione di riduzione del movimento del suo dispositivo è attiva.',
    'I campi di pagamento con carta e i pulsanti di pagamento rapido sono forniti da Stripe, in un riquadro di cui non controlliamo il contenuto.',
    'I video dimostrativi sono ospitati su YouTube; i loro passaggi sono descritti anche per iscritto nella stessa pagina.',
  ],
  preparationTitle: 'Redazione della presente dichiarazione',
  preparationBody: [
    'La presente dichiarazione è stata redatta il 5 ottobre 2026.',
    'Tecnologie utilizzate per realizzare il sito: HTML, CSS, JavaScript e WAI-ARIA.',
  ],
  contactTitle: 'Segnalazioni e contatti',
  contactBody:
    'Se non riesce ad accedere a un contenuto o a un servizio, ci scriva: le indicheremo un’alternativa accessibile o le invieremo il contenuto in un altro formato.',
  contactEmailLabel: 'Indirizzo e-mail',
  contactFormLabel: 'Modulo',
  contactPageLink: 'Modulo di contatto',
};
