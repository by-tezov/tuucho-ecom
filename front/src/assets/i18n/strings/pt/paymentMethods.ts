import type { Strings } from '../../types';

export const paymentMethods: Strings['paymentMethods'] = {
  pageTitle: 'Os meus métodos de pagamento',
  pageSubtitle:
    'Guarda aqui o teu cartão e escolhe os teus métodos de pagamento para os encontrares rapidamente em cada encomenda.',
  addButton: 'Adicionar um cartão bancário',
  deleteButton: 'Eliminar',
  deleteConfirm: 'Eliminar este cartão?',
  emptyState: 'Ainda não tem nenhum cartão guardado.',
  addCardModalTitle: 'Adicionar um cartão bancário',
  cardholderNameLabel: 'Nome do titular do cartão',
  cardholderNamePlaceholder: 'Ex. João Silva',
  cardholderNameRequiredError: 'Indique o nome do titular do cartão.',
  rememberCardLabel: 'Quero memorizar este cartão para as minhas próximas compras.',
  useCardButton: 'Usar este cartão',
  saveCardButton: 'Guardar cartão',
  savingCardButton: 'A guardar…',
  preparingCardForm: 'A preparar o formulário seguro…',
  saveCardError: 'Não foi possível guardar o cartão. Tente novamente.',
  expiresLabel: 'Expira',
  paypalDescription: 'Pagamento seguro com PayPal.',
  googlePayDescription: 'Pagamento seguro com Google Pay.',
  applePayDescription: 'Pagamento seguro com Apple Pay.',
  bancontactDescription: 'Pagamento direto seguro com Bancontact (Bélgica / EUR).',
  paypalEnableAction: 'Mostrar',
  paypalDisableAction: 'Ocultar',
  paypalDisableConfirmTitle: 'Ocultar o PayPal?',
  paypalDisableConfirmMessage:
    'Deixará de aparecer na lista principal do carrinho, mas continuará disponível em « Outros métodos de pagamento ».',
  bancontactDisableConfirmTitle: 'Ocultar o Bancontact?',
  bancontactDisableConfirmMessage:
    'Deixará de aparecer na lista principal do carrinho, mas continuará disponível em « Outros métodos de pagamento ».',
  googlePayDisableConfirmTitle: 'Ocultar o Google Pay?',
  googlePayDisableConfirmMessage:
    'Deixará de aparecer na lista principal do carrinho, mas continuará disponível em « Outros métodos de pagamento ».',
  applePayDisableConfirmTitle: 'Ocultar o Apple Pay?',
  applePayDisableConfirmMessage:
    'Deixará de aparecer na lista principal do carrinho, mas continuará disponível em « Outros métodos de pagamento ».',
  newCardDescription: 'Introduz um cartão novo no momento do pagamento.',
  newCardDisableConfirmTitle: 'Ocultar Novo cartão bancário?',
  newCardDisableConfirmMessage:
    'Deixará de aparecer na lista principal do carrinho, mas continuará disponível em « Outros métodos de pagamento ». Os cartões já guardados continuam visíveis.',
  secureDataNotice: 'Os seus dados bancários são encriptados e geridos pelo nosso prestador de pagamentos.',
};
