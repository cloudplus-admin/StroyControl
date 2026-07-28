export type ObjectTemplateCode = 'high_rise' | 'typical_house' | 'renovation';

export interface TemplateSection {
  name: string;
}

export interface TemplateStage {
  name: string;
  sections: TemplateSection[];
}

export const OBJECT_TEMPLATES: Record<ObjectTemplateCode, TemplateStage[]> = {
  high_rise: [
    {
      name: 'Земляные работы',
      sections: [{ name: 'Разработка котлована' }, { name: 'Устройство фундамента' }],
    },
    {
      name: 'Каркас здания',
      sections: [
        { name: 'Монолитные работы, нижние этажи' },
        { name: 'Монолитные работы, верхние этажи' },
        { name: 'Кладка наружных стен' },
      ],
    },
    {
      name: 'Инженерные системы',
      sections: [{ name: 'Электромонтаж' }, { name: 'Сантехника и вентиляция' }],
    },
  ],
  typical_house: [
    {
      name: 'Земляные работы',
      sections: [{ name: 'Разработка котлована' }, { name: 'Устройство фундамента' }],
    },
    {
      name: 'Коробка дома',
      sections: [{ name: 'Кладка стен' }, { name: 'Кровля' }],
    },
    {
      name: 'Отделка',
      sections: [{ name: 'Черновая отделка' }, { name: 'Чистовая отделка' }],
    },
  ],
  renovation: [
    {
      name: 'Демонтаж',
      sections: [{ name: 'Демонтаж перегородок' }, { name: 'Вывоз мусора' }],
    },
    {
      name: 'Инженерные системы',
      sections: [{ name: 'Электрика' }, { name: 'Сантехника' }],
    },
    {
      name: 'Отделочные работы',
      sections: [{ name: 'Штукатурка и стяжка' }, { name: 'Чистовая отделка' }],
    },
  ],
};

export function isValidTemplateCode(code: string): code is ObjectTemplateCode {
  return code in OBJECT_TEMPLATES;
}
