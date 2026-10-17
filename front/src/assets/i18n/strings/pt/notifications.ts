import type { Strings } from '../../types';

export const notifications: Strings['notifications'] = {
  pageTitle: 'Notificações',
  emailsSectionTitle: 'E-mails',
  emailsMasterLabel: 'Receber emails',
  emailsMasterDescription:
    'O interruptor principal. Desligado = silêncio total (exceto reposição de palavra-passe e segurança crítica). Ligado = escolhes canal a canal.',
  primaryEmailLabel: 'Endereço principal',
  verifiedBadge: 'Verificado',
  unverifiedBadge: 'Não verificado',
  unverifiedBanner:
    'Confirma o teu email para receberes os alertas divertidos (novidades, carrinho, favoritos…). Já podes configurar as tuas preferências abaixo.',
  loading: 'A carregar…',
  loadError: 'Não foi possível carregar as tuas preferências. Tenta novamente daqui a pouco.',
  masterDisableConfirmTitle: 'Desativar todos os emails?',
  masterDisableConfirmMessage:
    'Sem mais resumos de encomendas, faturas ou alertas. Podes continuar a iniciar sessão e a repor a palavra-passe.',
  transactionalSectionTitle: 'Encomendas e segurança',
  marketingSectionTitle: 'Inspiração e carrinho',
  disableConfirmButton: 'Desativar',
  cancelButton: 'Cancelar',
  orderConfirmation: {
    title: 'Confirmação de encomenda',
    description:
      'O “está tudo certo, confirmado” logo após o pagamento. Um pequeno high-five na tua caixa de entrada.',
    disableConfirmTitle: 'Desativar as confirmações de encomenda?',
    disableConfirmMessage:
      'Deixas de receber o resumo por email após uma compra. Continua disponível na tua conta.',
  },
  orderShipped: {
    title: 'Encomenda enviada',
    description: 'O aviso de “está a caminho” quando os teus sets saem do ateliê.',
    disableConfirmTitle: 'Desativar os emails de envio?',
    disableConfirmMessage: 'Sem email quando uma encomenda é enviada. O rastreio continua na tua conta.',
  },
  invoice: {
    title: 'Fatura',
    description: 'Fatura em PDF na tua caixa de entrada, útil para despesas e reembolsos.',
    disableConfirmTitle: 'Desativar os emails de fatura?',
    disableConfirmMessage: 'Podes continuar a descarregar as faturas a partir das tuas encomendas.',
  },
  security: {
    title: 'Alertas de segurança',
    description:
      'Resumos de segurança opcionais. O essencial (bloqueio, reposição de palavra-passe) é sempre enviado.',
    disableConfirmTitle: 'Desativar os alertas de segurança opcionais?',
    disableConfirmMessage:
      'Os emails de reposição de palavra-passe, bloqueio de conta e eliminação continuam sempre a ser enviados.',
  },
  chatReply: {
    title: 'Respostas do chat',
    description: 'Receba um e-mail quando a Lumen responder enquanto não estiver a consultar a conversa.',
    disableConfirmTitle: 'Desativar as notificações do chat?',
    disableConfirmMessage: 'Pode continuar a ler as respostas na sua conversa.',
  },
  loyaltyExpiry: {
    title: 'Loyalty expiry reminder',
    description: 'A heads-up before your loyalty credit expires.',
    disableConfirmTitle: 'Turn off loyalty expiry reminders?',
    disableConfirmMessage: 'You may lose credit without a reminder before the expiry date.',
  },
  nouveautes: {
    title: 'Novidades',
    description: 'Novidades frescas na galeria. Para não perderes aquele set incrível.',
    disableConfirmTitle: 'Desativar as novidades?',
    disableConfirmMessage: 'Deixas de ser avisada quando chegam sets novos.',
  },
  cartReminder: {
    title: 'Carrinho à espera',
    description: 'Um empurrãozinho simpático se deixaste peças no carrinho. Sem spam agressivo.',
    disableConfirmTitle: 'Desativar os lembretes de carrinho?',
    disableConfirmMessage: 'Não te lembraremos de um carrinho por terminar.',
  },
  favoriteSold: {
    title: 'Favorito vendido',
    description: 'O teu preferido acabou de sair. Para saberes que não foi uma falha de stock.',
    disableConfirmTitle: 'Desativar os alertas de favorito vendido?',
    disableConfirmMessage: 'Não saberás quando um favorito se esgota.',
  },
  favoriteRestock: {
    title: 'Favorito reposto',
    description: 'Reviravolta: voltou. Avisamos-te antes que desapareça outra vez.',
    disableConfirmTitle: 'Desativar os alertas de reposição?',
    disableConfirmMessage: 'Sem alerta quando um favorito volta a estar disponível.',
  },
  promo: {
    title: 'Ofertas e códigos',
    description: 'Os verdadeiros descontos (códigos, lançamentos). Raro, não é uma newsletter semanal.',
    disableConfirmTitle: 'Desativar as ofertas?',
    disableConfirmMessage: 'Deixas de receber códigos promocionais por email.',
  },
};
