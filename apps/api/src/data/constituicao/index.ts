import type { LegalDocumentIndex } from "../types.js";
import { r } from "../types.js";

export const CONSTITUICAO_INDEX: LegalDocumentIndex = {
  title: "Índice da Constituição da República Portuguesa",
  sections: [
    {
      title: "Princípios fundamentais",
      description: "República, Estado de direito, soberania, cidadania, território, relações internacionais, tarefas do Estado, sufrágio e símbolos nacionais.",
      articles: [r(1, 11)],
    },
    {
      number: "I",
      title: "Direitos e deveres fundamentais",
      articles: [r(12, 79)],
      subsections: [
        {
          number: "I",
          title: "Princípios gerais",
          description: "Universalidade, igualdade, portugueses no estrangeiro, estrangeiros, acesso ao direito, responsabilidade civil do Estado, estado de sítio e emergência.",
          articles: [r(12, 23)],
        },
        {
          number: "II",
          title: "Direitos, liberdades e garantias",
          articles: [r(24, 57)],
          subsections: [
            {
              number: "I",
              title: "Direitos, liberdades e garantias pessoais",
              description: "Vida, integridade, identidade, liberdade, segurança, processo criminal, inviolabilidade, família, expressão, informação, reunião, associação e deslocação.",
              articles: [r(24, 47)],
            },
            {
              number: "II",
              title: "Participação política",
              description: "Participação pública, sufrágio, acesso a cargos públicos, partidos políticos, petição e ação popular.",
              articles: [r(48, 52)],
            },
            {
              number: "III",
              title: "Direitos dos trabalhadores",
              description: "Segurança no emprego, comissões de trabalhadores, liberdade sindical, contratação coletiva e greve.",
              articles: [r(53, 57)],
            },
          ],
        },
        {
          number: "III",
          title: "Direitos e deveres económicos, sociais e culturais",
          articles: [r(58, 79)],
          subsections: [
            {
              number: "I",
              title: "Direitos e deveres económicos",
              description: "Trabalho, direitos dos trabalhadores, consumidores, iniciativa económica e propriedade privada.",
              articles: [r(58, 62)],
            },
            {
              number: "II",
              title: "Direitos e deveres sociais",
              description: "Segurança social, saúde, habitação, ambiente, família, paternidade, infância, juventude, deficiência e terceira idade.",
              articles: [r(63, 72)],
            },
            {
              number: "III",
              title: "Direitos e deveres culturais",
              description: "Educação, ensino, cultura, ciência, criação cultural, cultura física e desporto.",
              articles: [r(73, 79)],
            },
          ],
        },
      ],
    },
    {
      number: "II",
      title: "Organização económica",
      articles: [r(80, 107)],
      subsections: [
        { number: "I", title: "Princípios gerais", articles: [r(80, 89)] },
        { number: "II", title: "Planos", articles: [r(90, 92)] },
        { number: "III", title: "Políticas agrícola, comercial e industrial", articles: [r(93, 100)] },
        { number: "IV", title: "Sistema financeiro e fiscal", articles: [r(101, 107)] },
      ],
    },
    {
      number: "III",
      title: "Organização do poder político",
      articles: [r(108, 276)],
      subsections: [
        { number: "I", title: "Princípios gerais", description: "Órgãos de soberania, separação de poderes, atos normativos, eleições, partidos, referendo e estatuto dos titulares.", articles: [r(108, 119)] },
        { number: "II", title: "Presidente da República", description: "Estatuto, eleição, mandato, competência e Conselho de Estado.", articles: [r(120, 146)] },
        { number: "III", title: "Assembleia da República", description: "Deputados, eleições, competência, processo legislativo, organização e funcionamento.", articles: [r(147, 181)] },
        { number: "IV", title: "Governo", description: "Função, estrutura, formação, responsabilidade e competência política, legislativa e administrativa.", articles: [r(182, 201)] },
        { number: "V", title: "Tribunais", description: "Função jurisdicional, categorias de tribunais, juízes e Ministério Público.", articles: [r(202, 220)] },
        { number: "VI", title: "Tribunal Constitucional", articles: [r(221, 224)] },
        { number: "VII", title: "Regiões Autónomas", articles: [r(225, 234)] },
        { number: "VIII", title: "Poder Local", description: "Autarquias locais, freguesias, municípios, regiões administrativas e organizações de moradores.", articles: [r(235, 265)] },
        { number: "IX", title: "Administração Pública", articles: [r(266, 272)] },
        { number: "X", title: "Defesa Nacional", articles: [r(273, 276)] },
      ],
    },
    {
      number: "IV",
      title: "Garantia e revisão da Constituição",
      articles: [r(277, 289)],
      subsections: [
        { number: "I", title: "Fiscalização da constitucionalidade", articles: [r(277, 283)] },
        { number: "II", title: "Revisão constitucional", articles: [r(284, 289)] },
      ],
    },
    {
      title: "Disposições finais e transitórias",
      description: "Direito anterior, distritos, PIDE/DGS, reprivatizações, autarquias, referendo europeu e entrada em vigor.",
      articles: [r(290, 296)],
    },
  ],
};
