import type { Strings } from '../../types';

export const accessibilityStatement: Strings['accessibilityStatement'] = {
  eyebrow: 'Informações legais',
  title: 'Declaração de acessibilidade',
  updated: 'Emitida a 5 de outubro de 2026',
  intro:
    'A Lumen compromete-se a tornar o seu site acessível a todas as pessoas, em conformidade com o referencial francês de acessibilidade (RGAA), versão 4.1.2. Esta declaração aplica-se a toda a loja online.',
  statusTitle: 'Estado de conformidade',
  statusBody: [
    'A Lumen está parcialmente conforme com o RGAA 4.1.2. As páginas da loja seguem os critérios do referencial: navegação por teclado, janelas de diálogo, mensagens lidas pelos leitores de ecrã, rótulos dos campos, contraste e ausência de prazos impostos.',
    'Os conteúdos que ainda não são acessíveis estão listados mais abaixo.',
  ],
  issuesTitle: 'Conteúdos não acessíveis',
  issuesIntro: 'Os seguintes conteúdos ainda não são acessíveis ou dependem de um serviço de terceiros:',
  issues: [
    'A escolha de um ponto de recolha Mondial Relay é feita através de um módulo e de um mapa fornecidos pela Mondial Relay, difíceis de usar com o teclado ou com um leitor de ecrã. A entrega ao domicílio continua disponível, e também nos pode escrever: ajudamo-lo a escolher o seu ponto de recolha.',
    'A animação de abertura do site e algumas animações decorativas não podem ser pausadas a partir da página. Param se a definição de redução de movimento do seu dispositivo estiver ativada.',
    'Os campos de pagamento com cartão e os botões de pagamento expresso são fornecidos pela Stripe, numa moldura cujo conteúdo não controlamos.',
    'Os vídeos de demonstração estão alojados no YouTube; os seus passos também estão descritos por escrito na mesma página.',
  ],
  preparationTitle: 'Elaboração desta declaração',
  preparationBody: [
    'Esta declaração foi emitida a 5 de outubro de 2026.',
    'Tecnologias utilizadas na criação do site: HTML, CSS, JavaScript e WAI-ARIA.',
  ],
  contactTitle: 'Comentários e contacto',
  contactBody:
    'Se não conseguir aceder a um conteúdo ou a um serviço, escreva-nos: indicaremos uma alternativa acessível ou enviaremos o conteúdo noutro formato.',
  contactEmailLabel: 'Endereço de e-mail',
  contactFormLabel: 'Formulário',
  contactPageLink: 'Formulário de contacto',
};
