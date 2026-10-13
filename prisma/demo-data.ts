/**
 * Catálogo de DEMOSTRACIÓN. Todo lo que se crea desde aquí lleva isDemo = true y se
 * puede borrar de una vez desde /admin/ajustes → "Eliminar datos de demostración".
 */

type DemoVariant = { name: string; servings?: string; price: number };
type DemoOptionGroup = {
  id: string;
  name: string;
  required?: boolean;
  multiple?: boolean;
  choices: { id: string; label: string; delta?: number }[];
};

export type DemoProduct = {
  slug: string;
  name: string;
  category: string;
  image: string;
  imageAlt: string;
  short: string;
  description: string;
  price: number;
  variants?: DemoVariant[];
  ingredients: string;
  allergens: string[];
  mayContain?: string[];
  occasions: string[];
  options?: DemoOptionGroup[];
  dedication?: boolean;
  referencePhoto?: boolean;
  availability?: "AVAILABLE" | "ON_DEMAND" | "SEASONAL" | "SOLD_OUT";
  leadTimeHours?: number;
  maxPerOrder?: number;
  featured?: boolean;
  isNew?: boolean;
  boost?: number;
};

export const DEMO_CATEGORIES = [
  {
    slug: "tartas-personalizadas",
    name: "Tartas personalizadas",
    image: "/demo/tarta-personalizada-nombre.svg",
    description: "Diseñadas contigo: sabores, colores, nombre y decoración a tu gusto.",
    content:
      "Una tarta personalizada empieza siempre con una conversación: para quién es, qué le gusta y qué queréis celebrar. A partir de ahí elegimos juntos el bizcocho, el relleno, la cobertura y la decoración, y te enseñamos un precio claro antes de confirmar nada.\n\nTrabajamos con mantequilla, huevos camperos y fruta de temporada. No usamos bizcochos congelados: cada tarta se hornea entre 24 y 48 horas antes de la entrega para que llegue en su punto.\n\nSi tienes una idea muy concreta, súbenos una foto de inspiración desde el personalizador. Para diseños con figuras modeladas o temáticas complejas te preparamos un presupuesto a medida sin compromiso.",
  },
  {
    slug: "tartas-de-cumpleanos",
    name: "Tartas de cumpleaños",
    image: "/demo/tarta-cumpleanos-velas.svg",
    description: "Las favoritas para soplar velas: chocolate, red velvet, queso, zanahoria…",
    content:
      "Nuestras tartas de cumpleaños están pensadas para gustar a todos los invitados, de los más pequeños a los abuelos. Puedes elegir el tamaño según el número de personas y añadir una dedicatoria escrita a mano con chocolate.\n\nLas más pedidas son la tarta de queso al horno, la de triple chocolate y la red velvet. Todas se pueden encargar con 48 horas de antelación y recogerse en el obrador o recibirse en casa dentro de nuestra zona de reparto.",
  },
  {
    slug: "tartas-de-boda",
    name: "Tartas de boda",
    image: "/demo/tarta-boda-tres-pisos.svg",
    description: "Tartas nupciales de varios pisos, prueba de sabores incluida.",
    content:
      "Para una boda cuidamos cada detalle: prueba de sabores previa, diseño en coherencia con la decoración del evento y coordinación con el catering o la finca para el montaje.\n\nRecomendamos reservar la fecha con al menos tres semanas de antelación (en temporada alta, cuanto antes mejor). Cuéntanos el número de invitados y el estilo de vuestra boda y os enviaremos una propuesta personalizada.",
  },
  {
    slug: "cupcakes",
    name: "Cupcakes",
    image: "/demo/cupcakes-variados.svg",
    description: "Bizcocho esponjoso y crema suave, en cajas de 4, 6 o 12.",
    content:
      "Nuestros cupcakes se hornean cada mañana y se decoran con buttercream de merengue suizo, más ligera y menos dulce que la crema de mantequilla tradicional.\n\nSon perfectos para regalar, para meriendas de cumpleaños infantiles o para mesas dulces. Los cupcakes personalizados con toppers se encargan con tres días de antelación.",
  },
  {
    slug: "galletas-artesanales",
    name: "Galletas artesanales",
    image: "/demo/galletas-decoradas.svg",
    description: "Galletas de mantequilla, cookies y galletas decoradas con glasa.",
    content:
      "Masa de mantequilla reposada durante una noche, horneado lento y decoración a mano con glasa real. Así hacemos nuestras galletas, ya sean las clásicas para el café o las decoradas para regalos y eventos.\n\nLas galletas decoradas se pueden personalizar con nombres, fechas, logotipos o la temática de tu fiesta y se entregan embolsadas una a una.",
  },
  {
    slug: "brownies",
    name: "Brownies y blondies",
    image: "/demo/brownie-nueces.svg",
    description: "Intensos, húmedos por dentro y crujientes por fuera.",
    content:
      "Nuestro brownie lleva chocolate negro de 70 % y nueces tostadas; el blondie, chocolate blanco y frambuesas. Se venden en bandejas listas para compartir en la oficina o en casa.",
  },
  {
    slug: "postres-individuales",
    name: "Postres individuales",
    image: "/demo/vasitos-tiramisu.svg",
    description: "Tiramisú, tartaletas, macarons y bocados para servir en raciones.",
    content:
      "Los postres individuales son la solución ideal para comidas familiares, eventos de empresa o como broche de una cena especial: cada invitado tiene su ración y no hace falta cortar ni emplatar.",
  },
  {
    slug: "packs-celebraciones",
    name: "Packs para celebraciones",
    image: "/demo/pack-cumpleanos.svg",
    description: "Todo lo dulce para tu fiesta en un solo pedido.",
    content:
      "Combinamos tartas, cupcakes, galletas y postres en packs pensados para celebraciones de distintos tamaños. Salen más económicos que comprar cada producto por separado y te ahorran tiempo.",
  },
  {
    slug: "temporada",
    name: "Productos de temporada",
    image: "/demo/tarta-calabaza.svg",
    description: "Recetas que solo hacemos unas semanas al año.",
    content:
      "Seguimos el calendario: calabaza y especias en otoño, huesos de santo y buñuelos para Todos los Santos, roscón en Navidad y torrijas en Semana Santa. Cuando se acaba la temporada, desaparecen hasta el año siguiente.",
  },
] as const;

const cakeSizes = (p15: number, p18: number, p22: number): DemoVariant[] => [
  { name: "Ø 15 cm", servings: "6-8 raciones", price: p15 },
  { name: "Ø 18 cm", servings: "10-12 raciones", price: p18 },
  { name: "Ø 22 cm", servings: "15-18 raciones", price: p22 },
];

const spongeOptions: DemoOptionGroup = {
  id: "bizcocho",
  name: "Sabor del bizcocho",
  required: true,
  choices: [
    { id: "vainilla", label: "Vainilla" },
    { id: "chocolate", label: "Chocolate" },
    { id: "red-velvet", label: "Red velvet", delta: 300 },
    { id: "limon", label: "Limón" },
  ],
};

const fillingOptions: DemoOptionGroup = {
  id: "relleno",
  name: "Relleno",
  required: true,
  choices: [
    { id: "nata-fresa", label: "Nata y fresa" },
    { id: "trufa", label: "Trufa" },
    { id: "queso", label: "Crema de queso", delta: 200 },
    { id: "pistacho", label: "Pistacho", delta: 500 },
  ],
};

const extras: DemoOptionGroup = {
  id: "extras",
  name: "Extras",
  multiple: true,
  choices: [
    { id: "velas", label: "Velas de colores", delta: 250 },
    { id: "tarjeta", label: "Tarjeta de felicitación escrita a mano", delta: 300 },
  ],
};

export const DEMO_PRODUCTS: DemoProduct[] = [
  {
    slug: "tarta-personalizada-con-nombre",
    name: "Tarta personalizada con nombre",
    category: "tartas-personalizadas",
    image: "/demo/tarta-personalizada-nombre.svg",
    imageAlt: "Tarta rosa con goteo dorado, rosetas de crema y topper con el nombre Lucía",
    short: "Buttercream rosa, goteo dorado y topper con el nombre que quieras.",
    description:
      "Nuestra tarta más fotografiada. Tres capas de bizcocho del sabor que elijas, relleno a tu gusto y cobertura de buttercream suave en rosa empolvado, con goteo dorado y rosetas de crema.\n\nCorona la tarta un topper de madera dorada con el nombre o el mensaje que nos indiques en la dedicatoria. Si prefieres otros colores, indícalo en las notas o diseña la tuya desde el personalizador.",
    price: 3800,
    variants: cakeSizes(3800, 4800, 6200),
    ingredients:
      "Harina de trigo, mantequilla, azúcar, huevos camperos, nata, leche, chocolate blanco, colorante alimentario, levadura, vainilla natural.",
    allergens: ["gluten", "huevos", "lacteos"],
    mayContain: ["frutos-cascara", "soja"],
    occasions: ["cumpleanos", "aniversario", "bautizo-comunion", "baby-shower"],
    options: [spongeOptions, fillingOptions, extras],
    dedication: true,
    referencePhoto: true,
    leadTimeHours: 72,
    maxPerOrder: 3,
    featured: true,
    boost: 12,
  },
  {
    slug: "tarta-con-foto-comestible",
    name: "Tarta con foto comestible",
    category: "tartas-personalizadas",
    image: "/demo/tarta-foto-comestible.svg",
    imageAlt: "Tarta blanca con una fotografía impresa en papel de azúcar en la parte superior",
    short: "Tu foto impresa en papel de azúcar sobre una tarta de nata o chocolate.",
    description:
      "Sube la fotografía que quieras (un recuerdo familiar, el logo de tu empresa o el personaje favorito del cumpleañero) y la imprimimos con tintas comestibles sobre papel de azúcar.\n\nLa tarta lleva bizcocho de vainilla o chocolate, relleno de nata o trufa y un borde de perlas de crema en el color que elijas. Usa una imagen de buena calidad y horizontal para el mejor resultado.",
    price: 3600,
    variants: cakeSizes(3600, 4400, 5800),
    ingredients: "Harina de trigo, nata, azúcar, huevos camperos, mantequilla, papel de azúcar (almidón, azúcar, glucosa), tintas alimentarias.",
    allergens: ["gluten", "huevos", "lacteos"],
    mayContain: ["frutos-cascara"],
    occasions: ["cumpleanos", "empresa", "bautizo-comunion"],
    options: [
      { id: "sabor", name: "Sabor", required: true, choices: [{ id: "nata", label: "Vainilla y nata" }, { id: "trufa", label: "Chocolate y trufa" }] },
    ],
    dedication: true,
    referencePhoto: true,
    leadTimeHours: 48,
    maxPerOrder: 3,
  },
  {
    slug: "naked-cake-de-flores",
    name: "Naked cake de flores",
    category: "tartas-personalizadas",
    image: "/demo/naked-cake-flores.svg",
    imageAlt: "Tarta semidesnuda con capas de bizcocho visibles y flores comestibles",
    short: "Bizcocho a la vista, crema de mascarpone y flores comestibles.",
    description:
      "Estilo rústico y elegante a la vez: capas de bizcocho que se dejan ver bajo una fina capa de crema de mascarpone, decorada con flores comestibles de temporada y hojas naturales.\n\nIdeal para celebraciones al aire libre, bautizos y pedidas de mano.",
    price: 4200,
    variants: cakeSizes(4200, 5200, 6800),
    ingredients: "Harina de trigo, mascarpone, nata, azúcar, huevos camperos, mantequilla, flores comestibles, vainilla.",
    allergens: ["gluten", "huevos", "lacteos"],
    occasions: ["boda", "aniversario", "bautizo-comunion"],
    options: [spongeOptions],
    dedication: false,
    leadTimeHours: 72,
    maxPerOrder: 2,
    isNew: true,
  },
  {
    slug: "tarta-triple-chocolate",
    name: "Tarta de triple chocolate",
    category: "tartas-de-cumpleanos",
    image: "/demo/tarta-chocolate-triple.svg",
    imageAlt: "Tarta de chocolate con goteo de chocolate negro y virutas",
    short: "Bizcocho de cacao, trufa de chocolate con leche y ganache negro.",
    description:
      "Para los amantes del chocolate: bizcocho húmedo de cacao, relleno de trufa de chocolate con leche y cobertura de ganache de chocolate negro de 70 %, con goteo y virutas.\n\nIntensa pero equilibrada, gusta tanto a niños como a adultos.",
    price: 3200,
    variants: cakeSizes(3200, 4200, 5600),
    ingredients: "Chocolate negro 70 %, chocolate con leche, harina de trigo, mantequilla, nata, azúcar, huevos camperos, cacao puro.",
    allergens: ["gluten", "huevos", "lacteos", "soja"],
    mayContain: ["frutos-cascara"],
    occasions: ["cumpleanos", "merienda"],
    options: [extras],
    dedication: true,
    leadTimeHours: 48,
    featured: true,
    boost: 10,
  },
  {
    slug: "tarta-red-velvet",
    name: "Tarta red velvet",
    category: "tartas-de-cumpleanos",
    image: "/demo/red-velvet.svg",
    imageAlt: "Tarta red velvet con capas rojas y crema de queso blanca",
    short: "El clásico americano con crema de queso y un toque de cacao.",
    description:
      "Bizcocho aterciopelado con un toque de cacao y suero de leche, relleno y cubierto con nuestra crema de queso suave. Decorada con frutos rojos frescos.",
    price: 3400,
    variants: cakeSizes(3400, 4400, 5800),
    ingredients: "Harina de trigo, queso crema, mantequilla, azúcar, huevos camperos, suero de leche, cacao, colorante natural, frutos rojos.",
    allergens: ["gluten", "huevos", "lacteos"],
    occasions: ["cumpleanos", "aniversario", "san-valentin"],
    options: [extras],
    dedication: true,
    leadTimeHours: 48,
    boost: 6,
  },
  {
    slug: "tarta-de-queso-al-horno",
    name: "Tarta de queso al horno",
    category: "tartas-de-cumpleanos",
    image: "/demo/tarta-queso.svg",
    imageAlt: "Tarta de queso al horno con la superficie tostada y el interior cremoso",
    short: "Cremosa por dentro, tostada por fuera. Nuestra receta más vendida.",
    description:
      "Horneada a alta temperatura para conseguir esa superficie caramelizada y un centro cremoso que casi fluye. Solo cinco ingredientes de calidad, sin base de galleta.\n\nPuedes pedirla tal cual o con una cobertura de frutos rojos o de dulce de leche.",
    price: 2800,
    variants: [
      { name: "Ø 18 cm", servings: "8 raciones", price: 2800 },
      { name: "Ø 24 cm", servings: "14 raciones", price: 4200 },
    ],
    ingredients: "Queso crema, nata, huevos camperos, azúcar, harina de trigo.",
    allergens: ["gluten", "huevos", "lacteos"],
    occasions: ["cumpleanos", "merienda", "regalo"],
    options: [
      {
        id: "cobertura",
        name: "Cobertura",
        required: true,
        choices: [
          { id: "natural", label: "Natural" },
          { id: "frutos-rojos", label: "Frutos rojos", delta: 300 },
          { id: "dulce-leche", label: "Dulce de leche", delta: 300 },
        ],
      },
    ],
    leadTimeHours: 24,
    featured: true,
    boost: 15,
  },
  {
    slug: "tarta-de-zanahoria",
    name: "Tarta de zanahoria",
    category: "tartas-de-cumpleanos",
    image: "/demo/tarta-zanahoria.svg",
    imageAlt: "Tarta de zanahoria con frosting de queso y nueces",
    short: "Especiada, jugosa y con nueces. Frosting de queso suave.",
    description: "Bizcocho de zanahoria rallada, canela, nuez moscada y nueces, relleno y cubierto con frosting de queso crema.",
    price: 3000,
    variants: cakeSizes(3000, 3900, 5200),
    ingredients: "Zanahoria, harina de trigo, nueces, azúcar moreno, aceite de girasol, huevos camperos, queso crema, mantequilla, especias.",
    allergens: ["gluten", "huevos", "lacteos", "frutos-cascara"],
    occasions: ["cumpleanos", "merienda"],
    dedication: true,
    leadTimeHours: 48,
    boost: 3,
  },
  {
    slug: "tarta-de-cumpleanos-con-velas",
    name: "Tarta de cumpleaños con velas",
    category: "tartas-de-cumpleanos",
    image: "/demo/tarta-cumpleanos-velas.svg",
    imageAlt: "Tarta azul con goteo rosa, fideos de colores y tres velas encendidas",
    short: "Colores alegres, fideos de azúcar y velas incluidas. ¡A soplar!",
    description:
      "Pensada para cumpleaños infantiles: bizcocho de vainilla con relleno de nata y fresa, buttercream en azul cielo o rosa, goteo de color y lluvia de fideos de azúcar. Incluye tres velas.",
    price: 3600,
    variants: cakeSizes(3600, 4600, 6000),
    ingredients: "Harina de trigo, nata, fresas, mantequilla, azúcar, huevos camperos, fideos de azúcar, colorantes alimentarios.",
    allergens: ["gluten", "huevos", "lacteos"],
    mayContain: ["soja"],
    occasions: ["cumpleanos"],
    options: [
      { id: "color", name: "Color", required: true, choices: [{ id: "azul", label: "Azul cielo" }, { id: "rosa", label: "Rosa" }, { id: "lila", label: "Lila" }] },
    ],
    dedication: true,
    leadTimeHours: 48,
    boost: 8,
  },
  {
    slug: "tarta-nupcial-tres-pisos",
    name: "Tarta nupcial de tres pisos",
    category: "tartas-de-boda",
    image: "/demo/tarta-boda-tres-pisos.svg",
    imageAlt: "Tarta de boda blanca de tres pisos con perlas y cascada de flores",
    short: "Elegancia clásica con cascada de flores. Incluye prueba de sabores.",
    description:
      "Tres pisos cubiertos de fondant blanco marfil con perlas de azúcar y una cascada de flores naturales en los tonos de vuestra boda. Cada piso puede tener un sabor distinto.\n\nIncluye una prueba de sabores para dos personas en el obrador y la entrega y montaje en el lugar de celebración dentro de nuestra zona de reparto.",
    price: 28000,
    variants: [
      { name: "Tres pisos", servings: "60-70 raciones", price: 28000 },
      { name: "Cuatro pisos", servings: "90-100 raciones", price: 39000 },
    ],
    ingredients: "Harina de trigo, mantequilla, azúcar, huevos camperos, nata, fondant (azúcar, glucosa, grasa vegetal), flores naturales no comestibles retirables.",
    allergens: ["gluten", "huevos", "lacteos"],
    mayContain: ["frutos-cascara", "soja"],
    occasions: ["boda", "aniversario"],
    dedication: false,
    referencePhoto: true,
    availability: "ON_DEMAND",
    leadTimeHours: 21 * 24,
    maxPerOrder: 1,
  },
  {
    slug: "tarta-de-boda-semidesnuda",
    name: "Tarta de boda semidesnuda",
    category: "tartas-de-boda",
    image: "/demo/tarta-boda-semidesnuda.svg",
    imageAlt: "Tarta de boda de dos pisos semidesnuda decorada con flores",
    short: "Dos pisos de estilo natural para bodas íntimas.",
    description: "Dos pisos de bizcocho con crema de mascarpone a la vista, flores y follaje. Perfecta para bodas en el campo y celebraciones íntimas.",
    price: 16000,
    variants: [{ name: "Dos pisos", servings: "35-40 raciones", price: 16000 }],
    ingredients: "Harina de trigo, mascarpone, nata, mantequilla, azúcar, huevos camperos, flores naturales.",
    allergens: ["gluten", "huevos", "lacteos"],
    occasions: ["boda"],
    referencePhoto: true,
    availability: "ON_DEMAND",
    leadTimeHours: 14 * 24,
    maxPerOrder: 1,
  },
  {
    slug: "caja-6-cupcakes-variados",
    name: "Caja de 6 cupcakes variados",
    category: "cupcakes",
    image: "/demo/cupcakes-variados.svg",
    imageAlt: "Tres cupcakes con cápsulas pastel, crema y cerezas",
    short: "Vainilla, chocolate y red velvet en una caja lista para regalar.",
    description: "Seis cupcakes surtidos: dos de vainilla con cereza, dos de chocolate con frutos rojos y dos de red velvet con fideos. Se presentan en caja con ventana.",
    price: 1800,
    ingredients: "Harina de trigo, mantequilla, azúcar, huevos camperos, leche, cacao, claras de huevo, frutos rojos.",
    allergens: ["gluten", "huevos", "lacteos"],
    mayContain: ["soja", "frutos-cascara"],
    occasions: ["cumpleanos", "regalo", "merienda"],
    leadTimeHours: 24,
    maxPerOrder: 10,
    boost: 7,
  },
  {
    slug: "cupcakes-red-velvet",
    name: "Cupcakes red velvet (caja de 4)",
    category: "cupcakes",
    image: "/demo/cupcakes-red-velvet.svg",
    imageAlt: "Cupcakes red velvet con frosting blanco y migas rojas",
    short: "Cuatro cupcakes rojos con frosting de queso.",
    description: "Bizcocho red velvet con frosting de queso crema y migas del propio bizcocho por encima.",
    price: 1300,
    ingredients: "Harina de trigo, queso crema, mantequilla, azúcar, huevos camperos, suero de leche, cacao.",
    allergens: ["gluten", "huevos", "lacteos"],
    occasions: ["merienda", "san-valentin", "regalo"],
    leadTimeHours: 24,
  },
  {
    slug: "cupcakes-personalizados-docena",
    name: "Cupcakes personalizados (docena)",
    category: "cupcakes",
    image: "/demo/cupcakes-personalizados.svg",
    imageAlt: "Cupcakes de colores pastel con toppers decorados con corazones",
    short: "Doce cupcakes con toppers a juego con tu fiesta.",
    description: "Elige los colores de la crema y la temática de los toppers (nombre, edad, logotipo…). Indícanos los detalles en la dedicatoria o sube una foto de referencia.",
    price: 3600,
    ingredients: "Harina de trigo, mantequilla, azúcar, huevos camperos, leche, claras de huevo, pasta de azúcar.",
    allergens: ["gluten", "huevos", "lacteos"],
    mayContain: ["soja"],
    occasions: ["cumpleanos", "baby-shower", "bautizo-comunion", "empresa"],
    options: [spongeOptions],
    dedication: true,
    referencePhoto: true,
    leadTimeHours: 72,
    maxPerOrder: 5,
  },
  {
    slug: "galletas-decoradas-personalizadas",
    name: "Galletas decoradas personalizadas (docena)",
    category: "galletas-artesanales",
    image: "/demo/galletas-decoradas.svg",
    imageAlt: "Galletas redondas decoradas con glasa pastel, corazones, flores y estrellas",
    short: "Decoradas a mano con glasa real y embolsadas una a una.",
    description: "Galletas de mantequilla decoradas con glasa real según la temática de tu evento: nombres, iniciales, fechas o motivos. Perfectas como detalle para invitados.",
    price: 3000,
    ingredients: "Harina de trigo, mantequilla, azúcar glas, huevos camperos, claras de huevo, vainilla, colorantes alimentarios.",
    allergens: ["gluten", "huevos", "lacteos"],
    occasions: ["boda", "bautizo-comunion", "baby-shower", "empresa", "regalo"],
    dedication: true,
    referencePhoto: true,
    leadTimeHours: 96,
    maxPerOrder: 10,
  },
  {
    slug: "galletas-de-mantequilla",
    name: "Galletas de mantequilla (250 g)",
    category: "galletas-artesanales",
    image: "/demo/galletas-mantequilla.svg",
    imageAlt: "Galletas de mantequilla doradas con azúcar",
    short: "Las de toda la vida: crujientes y con mucha mantequilla.",
    description: "Bolsa de 250 g de galletas de mantequilla con un toque de vainilla y azúcar por encima. Ideales para el café.",
    price: 750,
    ingredients: "Harina de trigo, mantequilla (35 %), azúcar, huevo campero, vainilla, sal.",
    allergens: ["gluten", "huevos", "lacteos"],
    occasions: ["merienda", "regalo"],
    leadTimeHours: 0,
    maxPerOrder: 20,
  },
  {
    slug: "cookies-pepitas-chocolate",
    name: "Cookies con pepitas de chocolate (6 uds.)",
    category: "galletas-artesanales",
    image: "/demo/cookies-chocolate.svg",
    imageAlt: "Cookies grandes con pepitas de chocolate sobre un plato",
    short: "Grandes, crujientes por fuera y tiernas por dentro.",
    description: "Seis cookies de estilo neoyorquino con trozos de chocolate negro y con leche y un toque de sal en escamas.",
    price: 1200,
    ingredients: "Harina de trigo, mantequilla, azúcar moreno, chocolate negro, chocolate con leche, huevo campero, sal en escamas.",
    allergens: ["gluten", "huevos", "lacteos", "soja"],
    mayContain: ["frutos-cascara"],
    occasions: ["merienda", "regalo"],
    leadTimeHours: 0,
    isNew: true,
    boost: 4,
  },
  {
    slug: "brownie-chocolate-nueces",
    name: "Brownie de chocolate y nueces",
    category: "brownies",
    image: "/demo/brownie-nueces.svg",
    imageAlt: "Porciones de brownie de chocolate con nueces",
    short: "Chocolate negro de 70 % y nueces tostadas.",
    description: "Bandeja de brownie húmedo y denso, con costra crujiente y nueces tostadas.",
    price: 2200,
    variants: [
      { name: "Bandeja de 9 porciones", price: 2200 },
      { name: "Bandeja de 16 porciones", price: 3600 },
    ],
    ingredients: "Chocolate negro 70 %, mantequilla, azúcar, huevos camperos, nueces, harina de trigo, cacao.",
    allergens: ["gluten", "huevos", "lacteos", "frutos-cascara", "soja"],
    occasions: ["merienda", "empresa", "regalo"],
    leadTimeHours: 24,
    boost: 5,
  },
  {
    slug: "blondie-chocolate-blanco-frambuesa",
    name: "Blondie de chocolate blanco y frambuesa",
    category: "brownies",
    image: "/demo/blondie-frambuesa.svg",
    imageAlt: "Porciones de blondie dorado con frambuesas",
    short: "El hermano rubio del brownie, con frambuesas frescas.",
    description: "Bandeja de 9 porciones de blondie de mantequilla tostada, chocolate blanco y frambuesas.",
    price: 2400,
    ingredients: "Mantequilla, azúcar moreno, chocolate blanco, harina de trigo, huevos camperos, frambuesas.",
    allergens: ["gluten", "huevos", "lacteos", "soja"],
    occasions: ["merienda", "regalo"],
    leadTimeHours: 24,
    isNew: true,
  },
  {
    slug: "vasitos-de-tiramisu",
    name: "Vasitos de tiramisú (4 uds.)",
    category: "postres-individuales",
    image: "/demo/vasitos-tiramisu.svg",
    imageAlt: "Vasitos individuales de tiramisú con capas de crema y cacao",
    short: "Mascarpone, bizcocho empapado en café y cacao puro.",
    description: "Cuatro vasitos de tiramisú tradicional con crema de mascarpone, bizcocho de soletilla empapado en café y cacao en polvo.",
    price: 1600,
    ingredients: "Mascarpone, huevos camperos, azúcar, bizcochos de soletilla (harina de trigo, huevo, azúcar), café, cacao. Contiene licor de café.",
    allergens: ["gluten", "huevos", "lacteos"],
    occasions: ["merienda", "empresa"],
    leadTimeHours: 24,
    boost: 3,
  },
  {
    slug: "tartaletas-limon-merengue",
    name: "Tartaletas de limón y merengue (4 uds.)",
    category: "postres-individuales",
    image: "/demo/tartaletas-limon.svg",
    imageAlt: "Tartaletas de crema de limón con picos de merengue tostado",
    short: "Masa sablé, crema de limón ácida y merengue tostado.",
    description: "Cuatro tartaletas individuales de masa sablé, crema de limón natural y merengue italiano tostado al soplete.",
    price: 1500,
    ingredients: "Harina de trigo, mantequilla, azúcar, huevos camperos, limón, claras de huevo.",
    allergens: ["gluten", "huevos", "lacteos"],
    mayContain: ["frutos-cascara"],
    occasions: ["merienda"],
    leadTimeHours: 24,
  },
  {
    slug: "macarons-surtidos",
    name: "Macarons surtidos (caja de 12)",
    category: "postres-individuales",
    image: "/demo/macarons.svg",
    imageAlt: "Pirámide de macarons de colores pastel",
    short: "Pistacho, frambuesa, vainilla, chocolate, limón y caramelo salado.",
    description: "Doce macarons de almendra con seis sabores distintos, presentados en caja regalo.",
    price: 1900,
    ingredients: "Almendra molida, azúcar, claras de huevo, mantequilla, nata, chocolate, pistacho, frambuesa.",
    allergens: ["frutos-cascara", "huevos", "lacteos"],
    mayContain: ["gluten", "soja"],
    occasions: ["regalo", "boda", "san-valentin"],
    leadTimeHours: 48,
    boost: 4,
  },
  {
    slug: "pack-cumpleanos-feliz",
    name: "Pack «Cumpleaños feliz»",
    category: "packs-celebraciones",
    image: "/demo/pack-cumpleanos.svg",
    imageAlt: "Caja regalo con lazo dorado, cupcake decorado y velas",
    short: "Tarta de 18 cm + 6 cupcakes + velas. Para 15-18 personas.",
    description: "Todo lo necesario para un cumpleaños: tarta de 18 cm del sabor que elijas con dedicatoria, caja de seis cupcakes a juego y velas de colores.",
    price: 5800,
    ingredients: "Ver ingredientes de cada producto. Harina de trigo, mantequilla, azúcar, huevos camperos, nata, chocolate.",
    allergens: ["gluten", "huevos", "lacteos"],
    mayContain: ["soja", "frutos-cascara"],
    occasions: ["cumpleanos"],
    options: [
      {
        id: "tarta",
        name: "Tarta del pack",
        required: true,
        choices: [
          { id: "chocolate", label: "Triple chocolate" },
          { id: "queso", label: "Tarta de queso" },
          { id: "red-velvet", label: "Red velvet" },
        ],
      },
    ],
    dedication: true,
    leadTimeHours: 48,
    featured: true,
    boost: 9,
  },
  {
    slug: "pack-merienda-para-10",
    name: "Pack merienda para 10",
    category: "packs-celebraciones",
    image: "/demo/pack-merienda.svg",
    imageAlt: "Caja regalo con galletas decoradas y cookies",
    short: "Brownies, cookies y vasitos de tiramisú para compartir.",
    description: "Bandeja de brownie (9 porciones), 6 cookies con pepitas de chocolate y 4 vasitos de tiramisú. Perfecto para la oficina o una merienda en familia.",
    price: 4900,
    ingredients: "Ver ingredientes de cada producto.",
    allergens: ["gluten", "huevos", "lacteos", "frutos-cascara", "soja"],
    occasions: ["empresa", "merienda"],
    leadTimeHours: 24,
  },
  {
    slug: "mesa-dulce-eventos",
    name: "Mesa dulce para eventos",
    category: "packs-celebraciones",
    image: "/demo/mesa-dulce.svg",
    imageAlt: "Mesa dulce con soporte de cupcakes y macarons",
    short: "Cupcakes, macarons, galletas y mini postres coordinados con tu evento.",
    description: "Diseñamos una mesa dulce completa con la paleta de colores de tu celebración. El precio incluye montaje dentro de nuestra zona de reparto; para otras zonas, pide presupuesto.",
    price: 18000,
    variants: [
      { name: "Para 25 personas", price: 18000 },
      { name: "Para 50 personas", price: 32000 },
    ],
    ingredients: "Ver ingredientes de cada producto.",
    allergens: ["gluten", "huevos", "lacteos", "frutos-cascara"],
    mayContain: ["soja", "sesamo"],
    occasions: ["boda", "bautizo-comunion", "baby-shower", "empresa"],
    referencePhoto: true,
    availability: "ON_DEMAND",
    leadTimeHours: 10 * 24,
    maxPerOrder: 1,
  },
  {
    slug: "tarta-calabaza-especias",
    name: "Tarta de calabaza y especias",
    category: "temporada",
    image: "/demo/tarta-calabaza.svg",
    imageAlt: "Tarta de calabaza con rosetas de crema y hojas",
    short: "Solo en otoño: calabaza asada, canela y jengibre.",
    description: "Base de galleta especiada, crema de calabaza asada con canela, jengibre y nuez moscada, y rosetas de nata. Disponible de octubre a noviembre.",
    price: 2900,
    ingredients: "Calabaza asada, nata, huevos camperos, azúcar moreno, galleta (harina de trigo, mantequilla), especias.",
    allergens: ["gluten", "huevos", "lacteos"],
    occasions: ["merienda", "halloween"],
    availability: "SEASONAL",
    leadTimeHours: 24,
    isNew: true,
    boost: 2,
  },
  {
    slug: "huesos-de-santo-y-bunuelos",
    name: "Huesos de santo y buñuelos",
    category: "temporada",
    image: "/demo/huesos-santo.svg",
    imageAlt: "Huesos de santo de mazapán y buñuelos rellenos espolvoreados de azúcar",
    short: "La caja de Todos los Santos: 6 huesos de santo y 12 buñuelos.",
    description: "Huesos de santo de mazapán rellenos de yema y buñuelos de viento rellenos de crema o nata. Solo disponibles en las semanas previas al 1 de noviembre.",
    price: 1400,
    ingredients: "Almendra, azúcar, yema de huevo, harina de trigo, leche, mantequilla, nata.",
    allergens: ["frutos-cascara", "huevos", "gluten", "lacteos"],
    occasions: ["regalo", "merienda"],
    availability: "SEASONAL",
    leadTimeHours: 24,
    isNew: true,
  },
];

// Zona de reparto de EJEMPLO alrededor del mercado: añade tus códigos postales y precios reales
// en /admin/reparto (o desactiva el envío a domicilio si solo hay recogida en el puesto).
export const DEMO_ZONES = [
  {
    slug: "bailen-miraflores",
    name: "Bailén-Miraflores",
    postalCodes: ["29009"],
    fee: 400,
    minOrder: 2000,
    freeFrom: 6000,
    description: "",
  },
];

export const DEMO_REVIEWS = [
  {
    authorName: "Cliente de ejemplo",
    rating: 5,
    text: "Esta es una opinión de demostración para que veas cómo se mostrarán las reseñas reales. Bórrala desde el panel cuando empieces a recibir opiniones de tus clientes.",
  },
  {
    authorName: "Opinión de muestra",
    rating: 5,
    text: "Las opiniones solo aparecen en la web después de que las apruebes en /admin/opiniones. Así controlas lo que se publica sin inventar reseñas.",
  },
];

export const DEMO_PROMOTIONS = [
  {
    title: "10 % en tu primer pedido online",
    description: "Usa el código BIENVENIDA10 en pedidos desde 25 €. Válido para recogida y entrega a domicilio.",
    badge: "Bienvenida",
    ctaLabel: "Ver productos",
    ctaHref: "/productos",
  },
  {
    title: "Ya está aquí la tarta de calabaza",
    description: "Nuestra receta de otoño solo estará unas semanas. Encárgala con 24 h de antelación.",
    badge: "Temporada",
    ctaLabel: "Descubrir",
    ctaHref: "/categoria/temporada",
    imageUrl: "/demo/tarta-calabaza.svg",
  },
];

// Horario por defecto: el del Mercado de Bailén, de lunes a sábado por la mañana (las fuentes
// públicas dan 9:00-14:00 u 8:00-15:00: confírmalo y ajústalo en /admin/ajustes → Horario).
export const DEFAULT_OPENING_HOURS = [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opensAt: "09:00", closesAt: "14:00" }));
