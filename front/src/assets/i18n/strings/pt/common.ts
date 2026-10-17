import type { Strings } from '../../types';

/** Top-level labels belonging to no single screen. */
export const common: {
  [
    K in
      | 'skip'
      | 'skipFooter'
      | 'backLink'
      | 'brandAria'
      | 'navAria'
      | 'menuOpenAria'
      | 'menuCloseAria'
      | 'newWindowAria'
      | 'continueAction'
      | 'requiredFieldsNote'
  ]: Strings[K];
} = {
  skip: 'Ir para o conteúdo principal',
  skipFooter: 'Ir para o rodapé',
  backLink: 'Voltar',
  brandAria: 'Lumen, voltar ao início',
  navAria: 'Navegação principal',
  menuOpenAria: 'Abrir menu',
  menuCloseAria: 'Fechar menu',
  newWindowAria: 'nova janela',
  continueAction: 'Continuar',
  requiredFieldsNote: 'Os campos marcados com um asterisco (*) são obrigatórios.',
};
