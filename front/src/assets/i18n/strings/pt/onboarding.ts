import type { Strings } from '../../types';

export const onboarding: Strings['onboarding'] = {
  closeAria: 'Fechar a apresentação',
  prevAria: 'Diapositivo anterior',
  nextLabel: 'Seguinte',
  doneLabel: 'Percebi',
  stepAria: (current, total) => `Passo ${current} de ${total}`,
  handmade: {
    title: 'Lumen',
    headline: 'Qualidade feita à mão',
    body: 'Cada conjunto é limado, pintado e decorado à mão, um a um. Sem produção em massa: uma peça cuidada, preparada para ti.',
  },
  deals: {
    title: 'Vantagens',
    headline: 'Descontos e portes grátis',
    subheadline:
      'Os lotes fazem-te poupar assim que encomendas vários conjuntos, e os portes grátis ativam-se automaticamente quando atinges o montante previsto.',
    volumeTitle: 'Descontos de volume',
    volumeLead: 'Quanto mais conjuntos encomendas, mais poupas.',
    volumeTier: (qty, percent) => `${qty} conjuntos −${percent} %`,
    volumeJoin: ' · ',
    volumeHint: 'A barra do carrinho sobe a cada conjunto que adicionas.',
    freeShippingTitle: 'Entrega',
    freeShippingLead: (amount) => `Portes grátis a partir de ${amount} de mercadoria.`,
    freeShippingHint: 'O limiar depende do país de entrega.',
    genericBody:
      'Descontos de volume nos conjuntos e portes grátis a partir de um certo montante esperam-te no carrinho.',
  },
  loyalty: {
    title: 'Mealheiro',
    headline: 'Ganha crédito nas tuas encomendas',
    body: 'Com uma conta, acumulas crédito de fidelidade nas encomendas e podes usá-lo num carrinho seguinte.',
  },
  custom: {
    title: 'Sob medida',
    headline: 'Tamanho ou design personalizado',
    body: 'Um tamanho ou design que não está na loja? Escreve-me a partir da página Contacto: vemos juntas o que é possível.',
  },
};
