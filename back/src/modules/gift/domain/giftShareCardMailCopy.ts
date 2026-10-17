import type { Language } from '../../../utils/language.js';

export interface GiftShareCardMailCopy {
  subject: (receiverName: string) => string;
  title: string;
  intro: (giverDisplayName: string) => string;
  filesParagraph: string;
  codeParagraph: string;
  securityParagraph: string;
  trackParagraph: string;
  activeUntil: (date: string) => string;
  activeUntilDefault: string;
  ctaLabel: string;
  ctaFallbackHint: string;
}

/** Copy for `giverShareCardEmail` (the PDF/JPG gift card email), one per
 * supported language. `GIVER_PROMISE_MAIL_DATE_LOCALES` (giverPromiseMailCopy.ts)
 * covers the date locale for `activeUntil`. */
export const GIFT_SHARE_CARD_MAIL: Record<Language, GiftShareCardMailCopy> = {
  fr: {
    subject: (receiverName) => `Carte cadeau pour ${receiverName}`,
    title: 'Ta carte cadeau est prête',
    intro: (giverDisplayName) => `Bonjour ${giverDisplayName},`,
    filesParagraph:
      'Deux fichiers sont joints à cet e-mail : un PDF et un JPG. Le PDF place ta carte 5 x 3 pouces sur une page A4. Imprime-le et découpe-la le long des pointillés. Le JPG est la carte seule, au même format, pour l’envoyer telle quelle.',
    codeParagraph:
      'Donne aussi le code à 4 chiffres choisi à la création. Sans ce code, on ne peut pas ouvrir le cadeau. Le code te permettra aussi d’accéder à l’espace cadeau pour procéder au paiement. N’oublie pas ce code, sans lui tu ne pourras pas finaliser ton cadeau.',
    securityParagraph:
      'Pour plus de sécurité, ne communique pas le code par le même canal que la carte ou le lien : par exemple imprime la carte et envoie le code par SMS.',
    trackParagraph: 'Pour suivre le cadeau ou payer plus tard, ouvre ton espace cadeau.',
    activeUntil: (date) => `L’offre cadeau reste active jusqu’au ${date}.`,
    activeUntilDefault: 'L’offre cadeau reste active selon la durée réglée dans la boutique.',
    ctaLabel: 'Ton espace cadeau',
    ctaFallbackHint: 'Si le bouton ne fonctionne pas, tu peux utiliser ce lien :',
  },
  en: {
    subject: (receiverName) => `Gift card for ${receiverName}`,
    title: 'Your gift card is ready',
    intro: (giverDisplayName) => `Hi ${giverDisplayName},`,
    filesParagraph:
      'Two files are attached to this email: a PDF and a JPG. The PDF places your 5 x 3 inch card on an A4 page. Print it and cut along the dotted line. The JPG is the card alone, same size, ready to send as is.',
    codeParagraph:
      'Also give the 4-digit code chosen at creation. Without this code, the gift cannot be opened. The code also lets you access the gift space to complete payment. Do not forget this code, without it you cannot finalize your gift.',
    securityParagraph:
      'For extra security, do not share the code through the same channel as the card or the link: for example, print the card and send the code by text message.',
    trackParagraph: 'To track the gift or pay later, open your gift space.',
    activeUntil: (date) => `The gift offer stays active until ${date}.`,
    activeUntilDefault: 'The gift offer stays active for the duration set in the shop.',
    ctaLabel: 'Your gift space',
    ctaFallbackHint: 'If the button does not work, you can use this link:',
  },
  es: {
    subject: (receiverName) => `Tarjeta regalo para ${receiverName}`,
    title: 'Tu tarjeta regalo está lista',
    intro: (giverDisplayName) => `Hola ${giverDisplayName},`,
    filesParagraph:
      'Este correo incluye dos archivos adjuntos: un PDF y un JPG. El PDF coloca tu tarjeta de 5 x 3 pulgadas en una página A4. Imprímela y recórtala siguiendo la línea punteada. El JPG es la tarjeta sola, al mismo tamaño, para enviarla tal cual.',
    codeParagraph:
      'Dale también el código de 4 cifras elegido al crearlo. Sin este código, no se puede abrir el regalo. El código también te permitirá acceder al espacio regalo para proceder al pago. No olvides este código, sin él no podrás finalizar tu regalo.',
    securityParagraph:
      'Por mayor seguridad, no compartas el código por el mismo canal que la tarjeta o el enlace: por ejemplo, imprime la tarjeta y envía el código por SMS.',
    trackParagraph: 'Para seguir el regalo o pagar más tarde, abre tu espacio regalo.',
    activeUntil: (date) => `La oferta de regalo sigue activa hasta el ${date}.`,
    activeUntilDefault: 'La oferta de regalo sigue activa según la duración configurada en la tienda.',
    ctaLabel: 'Tu espacio regalo',
    ctaFallbackHint: 'Si el botón no funciona, puedes usar este enlace:',
  },
  it: {
    subject: (receiverName) => `Carta regalo per ${receiverName}`,
    title: 'La tua carta regalo è pronta',
    intro: (giverDisplayName) => `Ciao ${giverDisplayName},`,
    filesParagraph:
      'Due file sono allegati a questa email: un PDF e un JPG. Il PDF posiziona la tua carta 5 x 3 pollici su una pagina A4. Stampala e tagliala lungo la linea punteggiata. Il JPG è la carta da sola, nello stesso formato, pronta da inviare così com’è.',
    codeParagraph:
      'Dai anche il codice a 4 cifre scelto alla creazione. Senza questo codice, non si può aprire il regalo. Il codice ti permetterà anche di accedere allo spazio regalo per procedere al pagamento. Non dimenticare questo codice, senza di esso non potrai finalizzare il tuo regalo.',
    securityParagraph:
      'Per maggiore sicurezza, non condividere il codice tramite lo stesso canale della carta o del link: ad esempio, stampa la carta e invia il codice via SMS.',
    trackParagraph: 'Per seguire il regalo o pagare più tardi, apri il tuo spazio regalo.',
    activeUntil: (date) => `L’offerta regalo resta attiva fino al ${date}.`,
    activeUntilDefault: 'L’offerta regalo resta attiva per la durata impostata nel negozio.',
    ctaLabel: 'Il tuo spazio regalo',
    ctaFallbackHint: 'Se il pulsante non funziona, puoi usare questo link:',
  },
  nl: {
    subject: (receiverName) => `Cadeaukaart voor ${receiverName}`,
    title: 'Je cadeaukaart is klaar',
    intro: (giverDisplayName) => `Hoi ${giverDisplayName},`,
    filesParagraph:
      'Bij deze e-mail zitten twee bestanden: een PDF en een JPG. De PDF plaatst je kaart van 5 x 3 inch op een A4-pagina. Print hem uit en knip langs de stippellijn. De JPG is de kaart alleen, op hetzelfde formaat, klaar om zo te versturen.',
    codeParagraph:
      'Geef ook de 4-cijferige code die bij het aanmaken is gekozen. Zonder deze code kan het cadeau niet worden geopend. Met de code kun je ook naar de cadeauruimte om te betalen. Vergeet deze code niet, zonder code kun je je cadeau niet afronden.',
    securityParagraph:
      'Voor extra veiligheid: deel de code niet via hetzelfde kanaal als de kaart of de link. Print bijvoorbeeld de kaart en stuur de code per sms.',
    trackParagraph: 'Om het cadeau te volgen of later te betalen, open je cadeauruimte.',
    activeUntil: (date) => `Het cadeau-aanbod blijft actief tot ${date}.`,
    activeUntilDefault: 'Het cadeau-aanbod blijft actief voor de duur die in de winkel is ingesteld.',
    ctaLabel: 'Jouw cadeauruimte',
    ctaFallbackHint: 'Werkt de knop niet, dan kun je deze link gebruiken:',
  },
  pt: {
    subject: (receiverName) => `Cartão presente para ${receiverName}`,
    title: 'O teu cartão presente está pronto',
    intro: (giverDisplayName) => `Olá ${giverDisplayName},`,
    filesParagraph:
      'Este e-mail tem dois ficheiros anexados: um PDF e um JPG. O PDF coloca o teu cartão de 5 x 3 polegadas numa página A4. Imprime-o e corta ao longo da linha pontilhada. O JPG é o cartão sozinho, no mesmo formato, pronto para enviar como está.',
    codeParagraph:
      'Dá também o código de 4 dígitos escolhido na criação. Sem este código, não é possível abrir o presente. O código também te permitirá aceder ao espaço presente para efetuar o pagamento. Não te esqueças deste código, sem ele não poderás finalizar o teu presente.',
    securityParagraph:
      'Para maior segurança, não partilhes o código pelo mesmo canal que o cartão ou o link: por exemplo, imprime o cartão e envia o código por SMS.',
    trackParagraph: 'Para acompanhar o presente ou pagar mais tarde, abre o teu espaço presente.',
    activeUntil: (date) => `A oferta presente permanece ativa até ${date}.`,
    activeUntilDefault: 'A oferta presente permanece ativa pelo período definido na loja.',
    ctaLabel: 'O teu espaço presente',
    ctaFallbackHint: 'Se o botão não funcionar, podes usar este link:',
  },
  th: {
    subject: (receiverName) => `การ์ดของขวัญสำหรับ ${receiverName}`,
    title: 'การ์ดของขวัญของคุณพร้อมแล้ว',
    intro: (giverDisplayName) => `สวัสดี ${giverDisplayName},`,
    filesParagraph:
      'อีเมลนี้มีไฟล์แนบสองไฟล์ คือ PDF และ JPG ไฟล์ PDF จะจัดการ์ดขนาด 5 x 3 นิ้วของคุณไว้บนหน้ากระดาษ A4 พิมพ์ออกมาแล้วตัดตามเส้นประ ไฟล์ JPG คือการ์ดเดี่ยว ขนาดเท่ากัน พร้อมส่งได้ทันที',
    codeParagraph:
      'บอกโค้ด 4 หลักที่เลือกไว้ตอนสร้างด้วย ถ้าไม่มีโค้ดนี้จะเปิดของขวัญไม่ได้ โค้ดนี้ยังใช้เข้าพื้นที่ของขวัญเพื่อชำระเงินได้ด้วย อย่าลืมโค้ดนี้ ถ้าไม่มีโค้ดจะทำของขวัญให้เสร็จสมบูรณ์ไม่ได้',
    securityParagraph:
      'เพื่อความปลอดภัยมากขึ้น อย่าส่งโค้ดผ่านช่องทางเดียวกับการ์ดหรือลิงก์ เช่น พิมพ์การ์ดออกมาแล้วส่งโค้ดทาง SMS แทน',
    trackParagraph: 'หากต้องการติดตามของขวัญหรือชำระเงินทีหลัง ให้เปิดพื้นที่ของขวัญของคุณ',
    activeUntil: (date) => `ข้อเสนอของขวัญยังใช้ได้ถึงวันที่ ${date}`,
    activeUntilDefault: 'ข้อเสนอของขวัญยังใช้ได้ตามระยะเวลาที่ตั้งไว้ในร้าน',
    ctaLabel: 'พื้นที่ของขวัญของคุณ',
    ctaFallbackHint: 'ถ้าปุ่มใช้ไม่ได้ คุณสามารถใช้ลิงก์นี้:',
  },
};
