export interface IslamicContentItem {
  id: string;
  type: 'HADITH' | 'DUA' | 'ADHKAR' | 'PRAYER' | 'HAJJ_UMRAH' | 'RAMADAN';
  title: string;
  arabicText: string;
  transliteration?: string;
  translation: string;
  sourceCollection: string;
  sourceReference: string;
  authenticityStatus: 'SAHIH' | 'HASAN' | 'VERIFIED';
}

export class IslamicContentService {
  private verifiedHadiths: IslamicContentItem[] = [
    {
      id: 'h1',
      type: 'HADITH',
      title: 'Intentions in Actions',
      arabicText: 'إِنَّمَا الأَعْمَالُ بِالنِّيَّاتِ، وَإِنَّمَا لِكُلِّ امْرِئٍ مَا نَوَى',
      transliteration: "Innamal 'amalu bin-niyyat, wa innama likullim-ri'in ma nawa",
      translation: 'Actions are according to intentions, and every person will get what was intended.',
      sourceCollection: 'Sahih al-Bukhari',
      sourceReference: 'Book 1, Hadith 1',
      authenticityStatus: 'SAHIH',
    },
    {
      id: 'h2',
      type: 'HADITH',
      title: 'Truthfulness and Honesty',
      arabicText: 'عَلَيْكُمْ بِالصِّدْقِ فَإِنَّ الصِّدْقَ يَهْدِي إِلَى الْبِرِّ وَإِنَّ الْبِرَّ يَهْدِي إِلَى الْجَنَّةِ',
      transliteration: " 'Alaykum bis-sidqi fa-innas-sidqa yahdi ilal-birri wa innal-birra yahdi ilal-jannah",
      translation: 'You must be truthful, for truthfulness leads to righteousness, and righteousness leads to Paradise.',
      sourceCollection: 'Sahih Muslim',
      sourceReference: 'Book 45, Hadith 134',
      authenticityStatus: 'SAHIH',
    },
    {
      id: 'h3',
      type: 'HADITH',
      title: 'Belief and Good Speech',
      arabicText: 'مَنْ كَانَ يُؤْمِنُ بِاللَّهِ وَالْيَوْمِ الآخِرِ فَلْيَقُلْ خَيْرًا أَوْ لِيَصْمُتْ',
      transliteration: "Man kana yu'minu billahi wal-yawmil-akhiri fal-yaqul khayran aw li-yasmut",
      translation: 'Whoever believes in Allah and the Last Day should speak good or remain silent.',
      sourceCollection: 'Sahih al-Bukhari',
      sourceReference: 'Book 78, Hadith 165',
      authenticityStatus: 'SAHIH',
    },
  ];

  private verifiedDuas: IslamicContentItem[] = [
    {
      id: 'd1',
      type: 'DUA',
      title: "Iftar Supplication (Break Fasting)",
      arabicText: 'ذَهَبَ الظَّمَأُ وَابْتَلَّتِ الْعُرُوقُ وَثَبَتَ الأَجْرُ إِنْ شَاءَ اللَّهُ',
      transliteration: "Dhahaba adh-dhama'u, wabtallatil-'uruqu, wa thabatal-ajru in sha' Allah",
      translation: 'The thirst is gone, the veins are moistened, and the reward is confirmed, if Allah wills.',
      sourceCollection: 'Sunan Abi Dawud',
      sourceReference: 'Hadith 2357',
      authenticityStatus: 'HASAN',
    },
    {
      id: 'd2',
      type: 'DUA',
      title: 'Seeking Beneficial Knowledge and Provision',
      arabicText: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ عِلْمًا نَافِعًا وَرِزْقًا طَيِّبًا وَعَمَلاً مُتَقَبَّلاً',
      transliteration: "Allahumma inni as'aluka 'ilman nafi'an, wa rizqan tayyiban, wa 'amalan mutaqabbala",
      translation: 'O Allah, I ask You for beneficial knowledge, wholesome provision, and acceptable deeds.',
      sourceCollection: 'Sunan Ibn Majah',
      sourceReference: 'Book 5, Hadith 925',
      authenticityStatus: 'SAHIH',
    },
    {
      id: 'd3',
      type: 'DUA',
      title: 'Seeking Guidance and Steadfastness',
      arabicText: 'يَا مُقَلِّبَ الْقُلُوبِ ثَبِّتْ قَلْبِي عَلَى دِينِكَ',
      transliteration: 'Ya Muqallibal-qulubi thabbit qalbi \'ala dinik',
      translation: 'O Turner of the hearts, make my heart steadfast upon Your religion.',
      sourceCollection: 'Jami\' at-Tirmidhi',
      sourceReference: 'Hadith 2140',
      authenticityStatus: 'SAHIH',
    },
  ];

  private morningAdhkar: IslamicContentItem[] = [
    {
      id: 'a1',
      type: 'ADHKAR',
      title: 'Morning Adhkar — Gratitude & Protection',
      arabicText: 'أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ وَالْحَمْدُ لِلَّهِ لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ',
      transliteration: "Asbahna wa asbahal-mulku lillahi wal-hamdu lillah, la ilaha illallahu wahdahu la sharika lah",
      translation: 'We have entered the morning and the kingdom belongs to Allah, and all praise is due to Allah. There is no deity worthy of worship except Allah alone, with no partner.',
      sourceCollection: 'Sahih Muslim',
      sourceReference: 'Hadith 2723',
      authenticityStatus: 'SAHIH',
    },
  ];

  private eveningAdhkar: IslamicContentItem[] = [
    {
      id: 'a2',
      type: 'ADHKAR',
      title: 'Evening Adhkar — Seeking Protection',
      arabicText: 'أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ وَالْحَمْدُ لِلَّهِ لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ',
      transliteration: "Amsayna wa amsal-mulku lillahi wal-hamdu lillah, la ilaha illallahu wahdahu la sharika lah",
      translation: 'We have reached the evening and the kingdom belongs to Allah, and all praise is due to Allah. There is no deity worthy of worship except Allah alone, with no partner.',
      sourceCollection: 'Sahih Muslim',
      sourceReference: 'Hadith 2723',
      authenticityStatus: 'SAHIH',
    },
  ];

  getDailyHadith(): IslamicContentItem {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    return this.verifiedHadiths[dayOfYear % this.verifiedHadiths.length];
  }

  getDailyDua(): IslamicContentItem {
    const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
    return this.verifiedDuas[dayOfYear % this.verifiedDuas.length];
  }

  getMorningAdhkar(): IslamicContentItem {
    return this.morningAdhkar[0];
  }

  getEveningAdhkar(): IslamicContentItem {
    return this.eveningAdhkar[0];
  }

  getHajjUmrahGuide(): string {
    return `🕋 HAJJ & UMRAH EDUCATIONAL GUIDE
━━━━━━━━━━━━━━━━━━
📌 STEPS OF UMRAH:
1. Ihram: Intention at Miqat & reciting Talbiyah ("Labbayk Allahumma Labbayk...")
2. Tawaf: 7 circuits around the Holy Ka'bah counter-clockwise starting from the Black Stone.
3. Sa'i: 7 trips between Safa and Marwah starting at Safa.
4. Halq / Qasr: Shaving or trimming hair to exit Ihram.

📌 CORE DAYS OF HAJJ:
• 8th Dhul-Hijjah: Arrival in Mina.
• 9th Dhul-Hijjah: Day of Arafah (the peak pillar of Hajj) -> Night in Muzdalifah.
• 10th Dhul-Hijjah: Stoning Jamarat al-Aqaba, Sacrifice, Halq/Qasr, Tawaf al-Ifadah.
• 11th–13th Dhul-Hijjah: Days of Tashreeq in Mina & Farewell Tawaf (Tawaf al-Wada).

Source: Al-Fiqh al-Islami / Verified Sunni Consensus Manuals`;
  }
}
