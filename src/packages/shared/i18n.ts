export type SupportedLanguage = 'en' | 'fr' | 'es' | 'ar' | 'hi' | 'ur' | 'ha';

export const i18n = {
  en: {
    welcome: (username: string, accessLabel: string) =>
      `Welcome ${username} 👋\n\nYou are connected to Hikima X10 AI.\n\n🟢 AI SCAN ENGINE: ACTIVE\n📡 Monitored Markets: 22 Assets\n⚡ Real-time Multi-Strategy Signals\n🛡 Automatic Signal Monitoring\n\nAccess: ${accessLabel}\n\nUse the bottom menu buttons below to navigate instantly!`,
    signals: '📊 Signals',
    markets: '📈 Markets',
    strategies: '🧠 Strategies',
    premium: '💎 Premium',
    scan_status: '⚡ Scan Status',
    performance: '📊 Performance',
    settings: '⚙️ Settings',
    help: '❓ Help',
    language_updated: '🌐 Language updated to English.',
  },
  fr: {
    welcome: (username: string, accessLabel: string) =>
      `Bienvenue ${username} 👋\n\nVous êtes connecté à Hikima X10 AI.\n\n🟢 MOTEUR DE SCAN AI : ACTIF\n📡 Marchés surveillés : 22 actifs\n⚡ Signaux multi-stratégies en temps réel\n🛡 Surveillance automatique des signaux\n\nAccès : ${accessLabel}\n\nUtilisez le menu ci-dessous pour naviguer instantanément !`,
    signals: '📊 Signaux',
    markets: '📈 Marchés',
    strategies: '🧠 Stratégies',
    premium: '💎 Premium',
    scan_status: '⚡ État du Scan',
    performance: '📊 Performance',
    settings: '⚙️ Paramètres',
    help: '❓ Aide',
    language_updated: '🌐 Langue changée en Français.',
  },
  es: {
    welcome: (username: string, accessLabel: string) =>
      `¡Bienvenido ${username} 👋\n\nEstás conectado a Hikima X10 AI.\n\n🟢 MOTOR DE ESCANEO IA: ACTIVO\n📡 Mercados Monitoreados: 22 Activos\n⚡ Señales Multiestrategia en Tiempo Real\n🛡 Monitoreo Automático de Señales\n\nAcceso: ${accessLabel}\n\n¡Usa los botones del menú a continuación para navegar al instante!`,
    signals: '📊 Señales',
    markets: '📈 Mercados',
    strategies: '🧠 Estrategias',
    premium: '💎 Premium',
    scan_status: '⚡ Estado del Escaneo',
    performance: '📊 Rendimiento',
    settings: '⚙️ Configuración',
    help: '❓ Ayuda',
    language_updated: '🌐 Idioma cambiado a Español.',
  },
  ar: {
    welcome: (username: string, accessLabel: string) =>
      `مرحباً بك ${username} 👋\n\nأنت الآن متصل بـ Hikima X10 AI.\n\n🟢 محرك المسح بالذكاء الاصطناعي: نشط\n📡 الأسواق المراقبة: 22 أصلاً\n⚡ إشارات متعددة الاستراتيجيات في الوقت الفعلي\n🛡 مراقبة تلقائية للإشارات\n\nنوع الاشتراك: ${accessLabel}\n\nاستخدم القائمة في الأسفل للتنقل الفوري!`,
    signals: '📊 الإشارات',
    markets: '📈 الأسواق',
    strategies: '🧠 الاستراتيجيات',
    premium: '💎 الباقة المميزة',
    scan_status: '⚡ حالة المسح',
    performance: '📊 الأداء',
    settings: '⚙️ الإعدادات',
    help: '❓ المساعدة',
    language_updated: '🌐 تم تغيير اللغة إلى العربية بنجاح.',
  },
  hi: {
    welcome: (username: string, accessLabel: string) =>
      `नमस्ते ${username} 👋\n\nआप Hikima X10 AI से जुड़ चुके हैं।\n\n🟢 AI स्कैन इंजन: सक्रिय\n📡 मॉनिटर किए गए बाज़ार: 22 संपत्तियां\n⚡ रीयल-टाइम मल्टी-रणनीति सिग्नल\n🛡 स्वचालित सिग्नल मॉनिटरिंग\n\nपहुंच: ${accessLabel}\n\nत्वरित नेविगेट करने के लिए नीचे दिए गए बटन का उपयोग करें!`,
    signals: '📊 सिग्नल',
    markets: '📈 बाज़ार',
    strategies: '🧠 रणनीतियाँ',
    premium: '💎 प्रीमियम',
    scan_status: '⚡ स्कैन स्थिति',
    performance: '📊 प्रदर्शन',
    settings: '⚙️ सेटिंग्स',
    help: '❓ सहायता',
    language_updated: '🌐 भाषा बदलकर हिंदी कर दी गई है।',
  },
  ur: {
    welcome: (username: string, accessLabel: string) =>
      `خوش آمدید ${username} 👋\n\nآپ Hikima X10 AI سے منسلک ہیں۔\n\n🟢 AI اسکین انجن: فعال\n📡 مانیٹر شدہ مارکیٹس: 22 اثاثے\n⚡ ریئل ٹائم ملٹی حکمت عملی سگنلز\n🛡 خودکار سگنل نگرانی\n\nرسائی: ${accessLabel}\n\nفوری نيویگیٹ کرنے کے لیے نیچے دیے گئے بٹنز کا استعمال کریں!`,
    signals: '📊 سگنلز',
    markets: '📈 مارکیٹس',
    strategies: '🧠 حکمت عملیاں',
    premium: '💎 پریمیم',
    scan_status: '⚡ اسکین کی صورتحال',
    performance: '📊 کارکردگی',
    settings: '⚙️ سیٹنگز',
    help: '❓ مدد',
    language_updated: '🌐 زبان تبدیل کر کے اردو کر دی گئی ہے۔',
  },
  ha: {
    welcome: (username: string, accessLabel: string) =>
      `Barka da zuwa ${username} 👋\n\nKuna haɗe da Hikima X10 AI.\n\n🟢 INJIN SCAN AI: YANA AIKI\n📡 Kasuwanni da ake bibiya: Kasuwanni 22\n⚡ Sakonnin AI Masu inganci\n🛡 Sa ido na atomatik\n\nSamun Dama: ${accessLabel}\n\nYi amfani da maballan da ke ƙasa don zaɓa cikin sauri!`,
    signals: '📊 Sakonni',
    markets: '📈 Kasuwanni',
    strategies: '🧠 Dabaru',
    premium: '💎 Babban Buga (Premium)',
    scan_status: '⚡ Yanayin Scan',
    performance: '📊 Ayyuka',
    settings: '⚙️ Tsare-tsare',
    help: '❓ Taimako',
    language_updated: '🌐 An canza harshe zuwa Hausa.',
  },
};

export function getText(lang: string = 'en', key: keyof typeof i18n['en'], ...args: any[]): any {
  const supported = ['en', 'fr', 'es', 'ar', 'hi', 'ur', 'ha'];
  const selectedLang = (supported.includes(lang) ? lang : 'en') as SupportedLanguage;
  const val = i18n[selectedLang][key] || i18n['en'][key];
  if (typeof val === 'function') {
    return (val as Function)(...args);
  }
  return val;
}
