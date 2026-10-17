import type { Strings } from '../../types';

export const guide: Strings['guide'] = {
  eyebrow: 'Guia de tamanhos',
  title: 'Encontre o seu tamanho',
  leadTitle: 'Na maioria dos casos, um tamanho padrão convém-lhe',
  leadSub:
    'A maioria das peças corresponde a um dos quatro tamanhos prontos a usar abaixo. Compara a largura indicada com o espaço de que dispões.',
  customTitle: 'Nenhum tamanho padrão serve?',
  customSub:
    'Sem problema: uma peça à medida é possível. Indica a largura de que precisas e o atelier responde-te.',
  howTitle: 'Como escolher o teu formato',
  howSub: 'Compara a largura indicada, sem ferramentas especiais.',
  steps: [
    {
      n: '1',
      title: 'Coloque a fita',
      desc: 'Cole um pedaço de fita transparente com o espaço previsto para a peça.',
    },
    {
      n: '2',
      title: 'Marque a largura',
      desc: 'Com uma caneta fina, trace um traço de cada lado, no ponto mais largo do formato.',
    },
    {
      n: '3',
      title: 'Meça em mm',
      desc: 'Retire a fita, coloque-a plana e meça a distância entre os dois traços com uma régua. Anote o valor de cada dedo.',
    },
  ],
  chartTitle: 'Tabela de tamanhos padrão',
  chartSub:
    'Cada número de tamanho corresponde a uma largura precisa. Compare as suas medidas com esta tabela.',
  chartNum: 'Tamanho',
  chartMm: 'Largura (mm)',
  fingers: ['Medida 1', 'Medida 2', 'Medida 3', 'Medida 4', 'Medida 5'],
  ctaOrder: 'Ver a galeria para encontrar um conjunto que me sirva',
  tipSetsNote: 'Os números vão do polegar ao mindinho.',
};
