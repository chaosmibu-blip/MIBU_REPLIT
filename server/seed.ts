import { db } from "./db";
import { countries, regions, districts, categories, subcategories } from "@shared/schema";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("Starting database seed...");

  // ============ COUNTRIES ============
  const [taiwan] = await db.insert(countries).values({
    code: "TW",
    nameEn: "Taiwan",
    nameZh: "台灣",
    nameJa: "台湾",
    nameKo: "대만",
    isActive: true,
  }).onConflictDoNothing().returning();

  let taiwanId = taiwan?.id;
  if (!taiwanId) {
    const [existing] = await db.select().from(countries).where(eq(countries.code, "TW")).limit(1);
    taiwanId = existing?.id;
  }
  
  if (!taiwanId) {
    const existing = await db.select().from(countries).limit(1);
    console.log("Using existing country:", existing[0]?.id);
    taiwanId = existing[0]?.id;
  }

  console.log("Country seeded:", taiwanId);

  // ============ REGIONS (Taiwan Cities/Counties - 縣市) ============
  const regionData = [
    { code: "taipei_city", nameEn: "Taipei City", nameZh: "台北市", nameJa: "台北市", nameKo: "타이베이시" },
    { code: "new_taipei_city", nameEn: "New Taipei City", nameZh: "新北市", nameJa: "新北市", nameKo: "신베이시" },
    { code: "taoyuan_city", nameEn: "Taoyuan City", nameZh: "桃園市", nameJa: "桃園市", nameKo: "타오위안시" },
    { code: "taichung_city", nameEn: "Taichung City", nameZh: "台中市", nameJa: "台中市", nameKo: "타이중시" },
    { code: "tainan_city", nameEn: "Tainan City", nameZh: "台南市", nameJa: "台南市", nameKo: "타이난시" },
    { code: "kaohsiung_city", nameEn: "Kaohsiung City", nameZh: "高雄市", nameJa: "高雄市", nameKo: "가오슝시" },
    { code: "keelung_city", nameEn: "Keelung City", nameZh: "基隆市", nameJa: "基隆市", nameKo: "지룽시" },
    { code: "hsinchu_city", nameEn: "Hsinchu City", nameZh: "新竹市", nameJa: "新竹市", nameKo: "신주시" },
    { code: "chiayi_city", nameEn: "Chiayi City", nameZh: "嘉義市", nameJa: "嘉義市", nameKo: "자이시" },
    { code: "hsinchu_county", nameEn: "Hsinchu County", nameZh: "新竹縣", nameJa: "新竹県", nameKo: "신주현" },
    { code: "miaoli_county", nameEn: "Miaoli County", nameZh: "苗栗縣", nameJa: "苗栗県", nameKo: "먀오리현" },
    { code: "changhua_county", nameEn: "Changhua County", nameZh: "彰化縣", nameJa: "彰化県", nameKo: "창화현" },
    { code: "nantou_county", nameEn: "Nantou County", nameZh: "南投縣", nameJa: "南投県", nameKo: "난터우현" },
    { code: "yunlin_county", nameEn: "Yunlin County", nameZh: "雲林縣", nameJa: "雲林県", nameKo: "윈린현" },
    { code: "chiayi_county", nameEn: "Chiayi County", nameZh: "嘉義縣", nameJa: "嘉義県", nameKo: "자이현" },
    { code: "pingtung_county", nameEn: "Pingtung County", nameZh: "屏東縣", nameJa: "屏東県", nameKo: "핑둥현" },
    { code: "yilan_county", nameEn: "Yilan County", nameZh: "宜蘭縣", nameJa: "宜蘭県", nameKo: "이란현" },
    { code: "hualien_county", nameEn: "Hualien County", nameZh: "花蓮縣", nameJa: "花蓮県", nameKo: "화롄현" },
    { code: "taitung_county", nameEn: "Taitung County", nameZh: "台東縣", nameJa: "台東県", nameKo: "타이둥현" },
    { code: "penghu_county", nameEn: "Penghu County", nameZh: "澎湖縣", nameJa: "澎湖県", nameKo: "펑후현" },
    { code: "kinmen_county", nameEn: "Kinmen County", nameZh: "金門縣", nameJa: "金門県", nameKo: "진먼현" },
    { code: "lienchiang_county", nameEn: "Lienchiang County", nameZh: "連江縣", nameJa: "連江県", nameKo: "롄장현" },
  ];

  const insertedRegions: Record<string, number> = {};
  for (const region of regionData) {
    const [inserted] = await db.insert(regions).values({
      countryId: taiwanId!,
      ...region,
      isActive: true,
    }).onConflictDoNothing().returning();
    if (inserted) insertedRegions[region.code] = inserted.id;
  }

  const allRegions = await db.select().from(regions);
  const regionMap: Record<string, number> = {};
  allRegions.forEach(r => { regionMap[r.code] = r.id; });

  console.log("Regions (Cities/Counties) seeded:", Object.keys(regionMap).length);

  // ============ DISTRICTS (鄉鎮市區) ============
  const districtData: Record<string, Array<{ code: string; nameEn: string; nameZh: string; nameJa: string; nameKo: string }>> = {
    taipei_city: [
      { code: "songshan", nameEn: "Songshan District", nameZh: "松山區", nameJa: "松山区", nameKo: "송산구" },
      { code: "xinyi", nameEn: "Xinyi District", nameZh: "信義區", nameJa: "信義区", nameKo: "신의구" },
      { code: "daan", nameEn: "Da'an District", nameZh: "大安區", nameJa: "大安区", nameKo: "다안구" },
      { code: "zhongshan", nameEn: "Zhongshan District", nameZh: "中山區", nameJa: "中山区", nameKo: "중산구" },
      { code: "zhongzheng", nameEn: "Zhongzheng District", nameZh: "中正區", nameJa: "中正区", nameKo: "중정구" },
      { code: "datong", nameEn: "Datong District", nameZh: "大同區", nameJa: "大同区", nameKo: "대동구" },
      { code: "wanhua", nameEn: "Wanhua District", nameZh: "萬華區", nameJa: "萬華区", nameKo: "만화구" },
      { code: "wenshan", nameEn: "Wenshan District", nameZh: "文山區", nameJa: "文山区", nameKo: "문산구" },
      { code: "nangang", nameEn: "Nangang District", nameZh: "南港區", nameJa: "南港区", nameKo: "남항구" },
      { code: "neihu", nameEn: "Neihu District", nameZh: "內湖區", nameJa: "内湖区", nameKo: "내호구" },
      { code: "shilin", nameEn: "Shilin District", nameZh: "士林區", nameJa: "士林区", nameKo: "사림구" },
      { code: "beitou", nameEn: "Beitou District", nameZh: "北投區", nameJa: "北投区", nameKo: "북투구" },
    ],
    new_taipei_city: [
      { code: "banqiao", nameEn: "Banqiao District", nameZh: "板橋區", nameJa: "板橋区", nameKo: "판교구" },
      { code: "sanchong", nameEn: "Sanchong District", nameZh: "三重區", nameJa: "三重区", nameKo: "삼중구" },
      { code: "zhonghe", nameEn: "Zhonghe District", nameZh: "中和區", nameJa: "中和区", nameKo: "중화구" },
      { code: "yonghe", nameEn: "Yonghe District", nameZh: "永和區", nameJa: "永和区", nameKo: "영화구" },
      { code: "xinzhuang", nameEn: "Xinzhuang District", nameZh: "新莊區", nameJa: "新荘区", nameKo: "신장구" },
      { code: "tucheng", nameEn: "Tucheng District", nameZh: "土城區", nameJa: "土城区", nameKo: "토성구" },
      { code: "xindian", nameEn: "Xindian District", nameZh: "新店區", nameJa: "新店区", nameKo: "신점구" },
      { code: "luzhou", nameEn: "Luzhou District", nameZh: "蘆洲區", nameJa: "蘆洲区", nameKo: "노주구" },
      { code: "wugu", nameEn: "Wugu District", nameZh: "五股區", nameJa: "五股区", nameKo: "오고구" },
      { code: "taishan", nameEn: "Taishan District", nameZh: "泰山區", nameJa: "泰山区", nameKo: "태산구" },
      { code: "linkou", nameEn: "Linkou District", nameZh: "林口區", nameJa: "林口区", nameKo: "임구구" },
      { code: "danshui", nameEn: "Tamsui District", nameZh: "淡水區", nameJa: "淡水区", nameKo: "담수구" },
      { code: "ruifang", nameEn: "Ruifang District", nameZh: "瑞芳區", nameJa: "瑞芳区", nameKo: "서방구" },
      { code: "xizhi", nameEn: "Xizhi District", nameZh: "汐止區", nameJa: "汐止区", nameKo: "석지구" },
    ],
    taoyuan_city: [
      { code: "taoyuan_dist", nameEn: "Taoyuan District", nameZh: "桃園區", nameJa: "桃園区", nameKo: "도원구" },
      { code: "zhongli", nameEn: "Zhongli District", nameZh: "中壢區", nameJa: "中壢区", nameKo: "중력구" },
      { code: "pingzhen", nameEn: "Pingzhen District", nameZh: "平鎮區", nameJa: "平鎮区", nameKo: "평진구" },
      { code: "bade", nameEn: "Bade District", nameZh: "八德區", nameJa: "八德区", nameKo: "팔덕구" },
      { code: "yangmei", nameEn: "Yangmei District", nameZh: "楊梅區", nameJa: "楊梅区", nameKo: "양매구" },
      { code: "luzhu", nameEn: "Luzhu District", nameZh: "蘆竹區", nameJa: "蘆竹区", nameKo: "노죽구" },
      { code: "guishan", nameEn: "Guishan District", nameZh: "龜山區", nameJa: "亀山区", nameKo: "귀산구" },
      { code: "daxi", nameEn: "Daxi District", nameZh: "大溪區", nameJa: "大渓区", nameKo: "대계구" },
    ],
    taichung_city: [
      { code: "central", nameEn: "Central District", nameZh: "中區", nameJa: "中区", nameKo: "중구" },
      { code: "east", nameEn: "East District", nameZh: "東區", nameJa: "東区", nameKo: "동구" },
      { code: "south", nameEn: "South District", nameZh: "南區", nameJa: "南区", nameKo: "남구" },
      { code: "west", nameEn: "West District", nameZh: "西區", nameJa: "西区", nameKo: "서구" },
      { code: "north", nameEn: "North District", nameZh: "北區", nameJa: "北区", nameKo: "북구" },
      { code: "xitun", nameEn: "Xitun District", nameZh: "西屯區", nameJa: "西屯区", nameKo: "서둔구" },
      { code: "nantun", nameEn: "Nantun District", nameZh: "南屯區", nameJa: "南屯区", nameKo: "남둔구" },
      { code: "beitun", nameEn: "Beitun District", nameZh: "北屯區", nameJa: "北屯区", nameKo: "북둔구" },
      { code: "fengyuan", nameEn: "Fengyuan District", nameZh: "豐原區", nameJa: "豊原区", nameKo: "풍원구" },
      { code: "dali", nameEn: "Dali District", nameZh: "大里區", nameJa: "大里区", nameKo: "대리구" },
      { code: "taiping", nameEn: "Taiping District", nameZh: "太平區", nameJa: "太平区", nameKo: "태평구" },
    ],
    tainan_city: [
      { code: "west_central", nameEn: "West Central District", nameZh: "中西區", nameJa: "中西区", nameKo: "중서구" },
      { code: "east_dist", nameEn: "East District", nameZh: "東區", nameJa: "東区", nameKo: "동구" },
      { code: "south_dist", nameEn: "South District", nameZh: "南區", nameJa: "南区", nameKo: "남구" },
      { code: "north_dist", nameEn: "North District", nameZh: "北區", nameJa: "北区", nameKo: "북구" },
      { code: "anping", nameEn: "Anping District", nameZh: "安平區", nameJa: "安平区", nameKo: "안평구" },
      { code: "annan", nameEn: "Annan District", nameZh: "安南區", nameJa: "安南区", nameKo: "안남구" },
      { code: "yongkang", nameEn: "Yongkang District", nameZh: "永康區", nameJa: "永康区", nameKo: "영강구" },
      { code: "rende", nameEn: "Rende District", nameZh: "仁德區", nameJa: "仁德区", nameKo: "인덕구" },
    ],
    kaohsiung_city: [
      { code: "lingya", nameEn: "Lingya District", nameZh: "苓雅區", nameJa: "苓雅区", nameKo: "영아구" },
      { code: "xinxing", nameEn: "Xinxing District", nameZh: "新興區", nameJa: "新興区", nameKo: "신흥구" },
      { code: "qianjin", nameEn: "Qianjin District", nameZh: "前金區", nameJa: "前金区", nameKo: "전금구" },
      { code: "qianzhen", nameEn: "Qianzhen District", nameZh: "前鎮區", nameJa: "前鎮区", nameKo: "전진구" },
      { code: "sanmin", nameEn: "Sanmin District", nameZh: "三民區", nameJa: "三民区", nameKo: "삼민구" },
      { code: "zuoying", nameEn: "Zuoying District", nameZh: "左營區", nameJa: "左營区", nameKo: "좌영구" },
      { code: "gushan", nameEn: "Gushan District", nameZh: "鼓山區", nameJa: "鼓山区", nameKo: "고산구" },
      { code: "fengshan", nameEn: "Fengshan District", nameZh: "鳳山區", nameJa: "鳳山区", nameKo: "봉산구" },
      { code: "xiaogang", nameEn: "Xiaogang District", nameZh: "小港區", nameJa: "小港区", nameKo: "소항구" },
    ],
    keelung_city: [
      { code: "zhongzheng_kl", nameEn: "Zhongzheng District", nameZh: "中正區", nameJa: "中正区", nameKo: "중정구" },
      { code: "xinyi_kl", nameEn: "Xinyi District", nameZh: "信義區", nameJa: "信義区", nameKo: "신의구" },
      { code: "ren_ai", nameEn: "Ren'ai District", nameZh: "仁愛區", nameJa: "仁愛区", nameKo: "인애구" },
      { code: "zhongshan_kl", nameEn: "Zhongshan District", nameZh: "中山區", nameJa: "中山区", nameKo: "중산구" },
      { code: "anle", nameEn: "Anle District", nameZh: "安樂區", nameJa: "安楽区", nameKo: "안락구" },
      { code: "qidu", nameEn: "Qidu District", nameZh: "七堵區", nameJa: "七堵区", nameKo: "칠두구" },
      { code: "nuannuan", nameEn: "Nuannuan District", nameZh: "暖暖區", nameJa: "暖暖区", nameKo: "난난구" },
    ],
    hsinchu_city: [
      { code: "east_hc", nameEn: "East District", nameZh: "東區", nameJa: "東区", nameKo: "동구" },
      { code: "north_hc", nameEn: "North District", nameZh: "北區", nameJa: "北区", nameKo: "북구" },
      { code: "xiangshan", nameEn: "Xiangshan District", nameZh: "香山區", nameJa: "香山区", nameKo: "향산구" },
    ],
    chiayi_city: [
      { code: "east_cy", nameEn: "East District", nameZh: "東區", nameJa: "東区", nameKo: "동구" },
      { code: "west_cy", nameEn: "West District", nameZh: "西區", nameJa: "西区", nameKo: "서구" },
    ],
    hsinchu_county: [
      { code: "zhubei", nameEn: "Zhubei City", nameZh: "竹北市", nameJa: "竹北市", nameKo: "죽북시" },
      { code: "hukou", nameEn: "Hukou Township", nameZh: "湖口鄉", nameJa: "湖口郷", nameKo: "호구향" },
      { code: "xinfeng", nameEn: "Xinfeng Township", nameZh: "新豐鄉", nameJa: "新豊郷", nameKo: "신풍향" },
      { code: "zhudong", nameEn: "Zhudong Township", nameZh: "竹東鎮", nameJa: "竹東鎮", nameKo: "죽동진" },
      { code: "guanxi", nameEn: "Guanxi Township", nameZh: "關西鎮", nameJa: "関西鎮", nameKo: "관서진" },
    ],
    miaoli_county: [
      { code: "miaoli", nameEn: "Miaoli City", nameZh: "苗栗市", nameJa: "苗栗市", nameKo: "묘율시" },
      { code: "toufen", nameEn: "Toufen City", nameZh: "頭份市", nameJa: "頭份市", nameKo: "두분시" },
      { code: "zhunan", nameEn: "Zhunan Township", nameZh: "竹南鎮", nameJa: "竹南鎮", nameKo: "죽남진" },
      { code: "sanyi", nameEn: "Sanyi Township", nameZh: "三義鄉", nameJa: "三義郷", nameKo: "삼의향" },
      { code: "nanzhuang", nameEn: "Nanzhuang Township", nameZh: "南庄鄉", nameJa: "南庄郷", nameKo: "남장향" },
    ],
    changhua_county: [
      { code: "changhua", nameEn: "Changhua City", nameZh: "彰化市", nameJa: "彰化市", nameKo: "창화시" },
      { code: "yuanlin", nameEn: "Yuanlin City", nameZh: "員林市", nameJa: "員林市", nameKo: "원림시" },
      { code: "hemei", nameEn: "Hemei Township", nameZh: "和美鎮", nameJa: "和美鎮", nameKo: "화미진" },
      { code: "lugang", nameEn: "Lugang Township", nameZh: "鹿港鎮", nameJa: "鹿港鎮", nameKo: "녹항진" },
      { code: "tianzhong", nameEn: "Tianzhong Township", nameZh: "田中鎮", nameJa: "田中鎮", nameKo: "전중진" },
    ],
    nantou_county: [
      { code: "nantou", nameEn: "Nantou City", nameZh: "南投市", nameJa: "南投市", nameKo: "남투시" },
      { code: "puli", nameEn: "Puli Township", nameZh: "埔里鎮", nameJa: "埔里鎮", nameKo: "포리진" },
      { code: "caotun", nameEn: "Caotun Township", nameZh: "草屯鎮", nameJa: "草屯鎮", nameKo: "초둔진" },
      { code: "jiji", nameEn: "Jiji Township", nameZh: "集集鎮", nameJa: "集集鎮", nameKo: "집집진" },
      { code: "renai", nameEn: "Ren'ai Township", nameZh: "仁愛鄉", nameJa: "仁愛郷", nameKo: "인애향" },
    ],
    yunlin_county: [
      { code: "douliu", nameEn: "Douliu City", nameZh: "斗六市", nameJa: "斗六市", nameKo: "두육시" },
      { code: "huwei", nameEn: "Huwei Township", nameZh: "虎尾鎮", nameJa: "虎尾鎮", nameKo: "호미진" },
      { code: "dounan", nameEn: "Dounan Township", nameZh: "斗南鎮", nameJa: "斗南鎮", nameKo: "두남진" },
      { code: "xiluo", nameEn: "Xiluo Township", nameZh: "西螺鎮", nameJa: "西螺鎮", nameKo: "서라진" },
      { code: "beigang", nameEn: "Beigang Township", nameZh: "北港鎮", nameJa: "北港鎮", nameKo: "북항진" },
    ],
    chiayi_county: [
      { code: "taibao", nameEn: "Taibao City", nameZh: "太保市", nameJa: "太保市", nameKo: "태보시" },
      { code: "puzi", nameEn: "Puzi City", nameZh: "朴子市", nameJa: "朴子市", nameKo: "박자시" },
      { code: "minxiong", nameEn: "Minxiong Township", nameZh: "民雄鄉", nameJa: "民雄郷", nameKo: "민웅향" },
      { code: "dalin", nameEn: "Dalin Township", nameZh: "大林鎮", nameJa: "大林鎮", nameKo: "대림진" },
      { code: "alishan", nameEn: "Alishan Township", nameZh: "阿里山鄉", nameJa: "阿里山郷", nameKo: "아리산향" },
    ],
    pingtung_county: [
      { code: "pingtung", nameEn: "Pingtung City", nameZh: "屏東市", nameJa: "屏東市", nameKo: "핑둥시" },
      { code: "chaozhou", nameEn: "Chaozhou Township", nameZh: "潮州鎮", nameJa: "潮州鎮", nameKo: "조주진" },
      { code: "donggang", nameEn: "Donggang Township", nameZh: "東港鎮", nameJa: "東港鎮", nameKo: "동항진" },
      { code: "hengchun", nameEn: "Hengchun Township", nameZh: "恆春鎮", nameJa: "恆春鎮", nameKo: "항춘진" },
      { code: "kenting", nameEn: "Kenting", nameZh: "墾丁", nameJa: "墾丁", nameKo: "컨딩" },
    ],
    yilan_county: [
      { code: "yilan", nameEn: "Yilan City", nameZh: "宜蘭市", nameJa: "宜蘭市", nameKo: "의란시" },
      { code: "luodong", nameEn: "Luodong Township", nameZh: "羅東鎮", nameJa: "羅東鎮", nameKo: "라동진" },
      { code: "jiaoxi", nameEn: "Jiaoxi Township", nameZh: "礁溪鄉", nameJa: "礁溪郷", nameKo: "초계향" },
      { code: "toucheng", nameEn: "Toucheng Township", nameZh: "頭城鎮", nameJa: "頭城鎮", nameKo: "두성진" },
      { code: "suao", nameEn: "Su'ao Township", nameZh: "蘇澳鎮", nameJa: "蘇澳鎮", nameKo: "소오진" },
    ],
    hualien_county: [
      { code: "hualien", nameEn: "Hualien City", nameZh: "花蓮市", nameJa: "花蓮市", nameKo: "화련시" },
      { code: "ji_an", nameEn: "Ji'an Township", nameZh: "吉安鄉", nameJa: "吉安郷", nameKo: "길안향" },
      { code: "xincheng", nameEn: "Xincheng Township", nameZh: "新城鄉", nameJa: "新城郷", nameKo: "신성향" },
      { code: "shoufeng", nameEn: "Shoufeng Township", nameZh: "壽豐鄉", nameJa: "壽豊郷", nameKo: "수풍향" },
      { code: "fenglin", nameEn: "Fenglin Township", nameZh: "鳳林鎮", nameJa: "鳳林鎮", nameKo: "봉림진" },
      { code: "ruisui", nameEn: "Ruisui Township", nameZh: "瑞穗鄉", nameJa: "瑞穂郷", nameKo: "서수향" },
    ],
    taitung_county: [
      { code: "taitung", nameEn: "Taitung City", nameZh: "台東市", nameJa: "台東市", nameKo: "태동시" },
      { code: "chishang", nameEn: "Chishang Township", nameZh: "池上鄉", nameJa: "池上郷", nameKo: "지상향" },
      { code: "guanshan", nameEn: "Guanshan Township", nameZh: "關山鎮", nameJa: "関山鎮", nameKo: "관산진" },
      { code: "luye", nameEn: "Luye Township", nameZh: "鹿野鄉", nameJa: "鹿野郷", nameKo: "녹야향" },
      { code: "green_island", nameEn: "Green Island", nameZh: "綠島鄉", nameJa: "緑島郷", nameKo: "녹도향" },
      { code: "orchid_island", nameEn: "Orchid Island", nameZh: "蘭嶼鄉", nameJa: "蘭嶼郷", nameKo: "난서향" },
    ],
    penghu_county: [
      { code: "magong", nameEn: "Magong City", nameZh: "馬公市", nameJa: "馬公市", nameKo: "마공시" },
      { code: "huxi", nameEn: "Huxi Township", nameZh: "湖西鄉", nameJa: "湖西郷", nameKo: "호서향" },
      { code: "baisha", nameEn: "Baisha Township", nameZh: "白沙鄉", nameJa: "白沙郷", nameKo: "백사향" },
      { code: "xiyu", nameEn: "Xiyu Township", nameZh: "西嶼鄉", nameJa: "西嶼郷", nameKo: "서서향" },
    ],
    kinmen_county: [
      { code: "jincheng", nameEn: "Jincheng Township", nameZh: "金城鎮", nameJa: "金城鎮", nameKo: "금성진" },
      { code: "jinhu", nameEn: "Jinhu Township", nameZh: "金湖鎮", nameJa: "金湖鎮", nameKo: "금호진" },
      { code: "jinsha", nameEn: "Jinsha Township", nameZh: "金沙鎮", nameJa: "金沙鎮", nameKo: "금사진" },
      { code: "jinning", nameEn: "Jinning Township", nameZh: "金寧鄉", nameJa: "金寧郷", nameKo: "금녕향" },
      { code: "lieyu", nameEn: "Lieyu Township", nameZh: "烈嶼鄉", nameJa: "烈嶼郷", nameKo: "열서향" },
    ],
    lienchiang_county: [
      { code: "nangan", nameEn: "Nangan Township", nameZh: "南竿鄉", nameJa: "南竿郷", nameKo: "남간향" },
      { code: "beigan", nameEn: "Beigan Township", nameZh: "北竿鄉", nameJa: "北竿郷", nameKo: "북간향" },
      { code: "juguang", nameEn: "Juguang Township", nameZh: "莒光鄉", nameJa: "莒光郷", nameKo: "거광향" },
      { code: "dongyin", nameEn: "Dongyin Township", nameZh: "東引鄉", nameJa: "東引郷", nameKo: "동인향" },
    ],
  };

  for (const [regionCode, districtList] of Object.entries(districtData)) {
    const regionId = regionMap[regionCode];
    if (!regionId) continue;
    
    for (const district of districtList) {
      await db.insert(districts).values({
        regionId,
        ...district,
        isActive: true,
      }).onConflictDoNothing();
    }
  }

  console.log("Districts seeded");

  // ============ CATEGORIES ============
  const categoryData = [
    { code: "food", nameEn: "Food", nameZh: "食", nameJa: "食事", nameKo: "음식", colorHex: "#ef4444", sortOrder: 1 },
    { code: "stay", nameEn: "Accommodation", nameZh: "宿", nameJa: "宿泊", nameKo: "숙박", colorHex: "#8b5cf6", sortOrder: 2 },
    { code: "education", nameEn: "Culture & Education", nameZh: "生態文化教育", nameJa: "文化教育", nameKo: "문화교육", colorHex: "#10b981", sortOrder: 3 },
    { code: "experience", nameEn: "Tours & Experiences", nameZh: "遊程體驗", nameJa: "体験ツアー", nameKo: "체험투어", colorHex: "#f59e0b", sortOrder: 4 },
    { code: "entertainment", nameEn: "Entertainment", nameZh: "娛樂設施", nameJa: "エンタメ", nameKo: "오락", colorHex: "#ec4899", sortOrder: 5 },
    { code: "activity", nameEn: "Activities", nameZh: "活動", nameJa: "アクティビティ", nameKo: "활동", colorHex: "#06b6d4", sortOrder: 6 },
    { code: "scenery", nameEn: "Scenery", nameZh: "景點", nameJa: "景色", nameKo: "경치", colorHex: "#84cc16", sortOrder: 7 },
    { code: "shopping", nameEn: "Shopping", nameZh: "購物", nameJa: "ショッピング", nameKo: "쇼핑", colorHex: "#6366f1", sortOrder: 8 },
  ];

  const categoryMap: Record<string, number> = {};
  for (const cat of categoryData) {
    const [inserted] = await db.insert(categories).values({
      ...cat,
      isActive: true,
    }).onConflictDoNothing().returning();
    if (inserted) categoryMap[cat.code] = inserted.id;
  }

  const allCategories = await db.select().from(categories);
  allCategories.forEach(c => { categoryMap[c.code] = c.id; });

  console.log("Categories seeded:", Object.keys(categoryMap).length);

  // ============ SUBCATEGORIES ============
  const subcategoryData: Record<string, Array<{ code: string; nameEn: string; nameZh: string; nameJa: string; nameKo: string; searchKeywords?: string }>> = {
    food: [
      { code: "hotpot", nameEn: "Hot Pot", nameZh: "火鍋", nameJa: "火鍋", nameKo: "훠궈", searchKeywords: "火鍋 hot pot 鍋物" },
      { code: "teppanyaki", nameEn: "Teppanyaki", nameZh: "鐵板燒", nameJa: "鉄板焼き", nameKo: "철판요리", searchKeywords: "鐵板燒 teppanyaki" },
      { code: "steak", nameEn: "Steak", nameZh: "排餐", nameJa: "ステーキ", nameKo: "스테이크", searchKeywords: "排餐 牛排 steak" },
      { code: "ramen", nameEn: "Ramen", nameZh: "拉麵", nameJa: "ラーメン", nameKo: "라멘", searchKeywords: "拉麵 ramen 麵" },
      { code: "sushi", nameEn: "Sushi", nameZh: "壽司", nameJa: "寿司", nameKo: "스시", searchKeywords: "壽司 sushi 日本料理" },
      { code: "italian", nameEn: "Italian", nameZh: "義式料理", nameJa: "イタリアン", nameKo: "이탈리안", searchKeywords: "義式 義大利 italian pasta pizza" },
      { code: "breakfast", nameEn: "Breakfast", nameZh: "早午餐", nameJa: "朝食", nameKo: "브런치", searchKeywords: "早午餐 brunch 早餐" },
      { code: "cafe", nameEn: "Cafe", nameZh: "咖啡廳", nameJa: "カフェ", nameKo: "카페", searchKeywords: "咖啡 cafe coffee" },
      { code: "dessert", nameEn: "Dessert", nameZh: "甜點", nameJa: "デザート", nameKo: "디저트", searchKeywords: "甜點 dessert 蛋糕" },
      { code: "nightmarket", nameEn: "Night Market", nameZh: "夜市", nameJa: "夜市", nameKo: "야시장", searchKeywords: "夜市 night market 小吃" },
      { code: "taiwanese", nameEn: "Taiwanese", nameZh: "台菜", nameJa: "台湾料理", nameKo: "대만요리", searchKeywords: "台菜 台灣料理 traditional taiwanese" },
      { code: "japanese", nameEn: "Japanese", nameZh: "日式料理", nameJa: "和食", nameKo: "일식", searchKeywords: "日式 日本料理 japanese" },
      { code: "korean", nameEn: "Korean", nameZh: "韓式料理", nameJa: "韓国料理", nameKo: "한식", searchKeywords: "韓式 韓國料理 korean bbq" },
      { code: "chinese", nameEn: "Chinese", nameZh: "中式料理", nameJa: "中華料理", nameKo: "중식", searchKeywords: "中式 中華料理 chinese" },
      { code: "seafood", nameEn: "Seafood", nameZh: "海鮮", nameJa: "シーフード", nameKo: "해산물", searchKeywords: "海鮮 seafood 海產" },
      { code: "vegetarian", nameEn: "Vegetarian", nameZh: "素食", nameJa: "ベジタリアン", nameKo: "채식", searchKeywords: "素食 vegetarian vegan" },
      { code: "bbq", nameEn: "BBQ", nameZh: "燒烤", nameJa: "焼肉", nameKo: "바베큐", searchKeywords: "燒烤 bbq 烤肉" },
      { code: "teahouse", nameEn: "Tea House", nameZh: "茶館", nameJa: "茶館", nameKo: "찻집", searchKeywords: "茶館 tea house 喝茶" },
    ],
    stay: [
      { code: "luxury_hotel", nameEn: "Luxury Hotel", nameZh: "五星酒店", nameJa: "高級ホテル", nameKo: "럭셔리호텔", searchKeywords: "五星 luxury hotel 酒店" },
      { code: "boutique_hotel", nameEn: "Boutique Hotel", nameZh: "精品旅館", nameJa: "ブティックホテル", nameKo: "부티크호텔", searchKeywords: "精品 boutique hotel" },
      { code: "hostel", nameEn: "Hostel", nameZh: "青年旅舍", nameJa: "ホステル", nameKo: "호스텔", searchKeywords: "青年旅舍 hostel 背包客" },
      { code: "bnb", nameEn: "B&B", nameZh: "民宿", nameJa: "民宿", nameKo: "민박", searchKeywords: "民宿 bnb bed breakfast" },
      { code: "hot_spring", nameEn: "Hot Spring Hotel", nameZh: "溫泉旅館", nameJa: "温泉旅館", nameKo: "온천호텔", searchKeywords: "溫泉 hot spring 泡湯" },
      { code: "resort", nameEn: "Resort", nameZh: "度假村", nameJa: "リゾート", nameKo: "리조트", searchKeywords: "度假村 resort" },
    ],
    education: [
      { code: "museum", nameEn: "Museum", nameZh: "博物館", nameJa: "博物館", nameKo: "박물관", searchKeywords: "博物館 museum" },
      { code: "art_gallery", nameEn: "Art Gallery", nameZh: "美術館", nameJa: "美術館", nameKo: "미술관", searchKeywords: "美術館 art gallery" },
      { code: "temple", nameEn: "Temple", nameZh: "寺廟", nameJa: "寺院", nameKo: "사찰", searchKeywords: "寺廟 temple 宮廟" },
      { code: "historic_site", nameEn: "Historic Site", nameZh: "古蹟", nameJa: "史跡", nameKo: "유적지", searchKeywords: "古蹟 historic site 歷史" },
      { code: "eco_farm", nameEn: "Eco Farm", nameZh: "生態農場", nameJa: "エコファーム", nameKo: "생태농장", searchKeywords: "生態農場 eco farm 有機" },
      { code: "cultural_center", nameEn: "Cultural Center", nameZh: "文化中心", nameJa: "文化センター", nameKo: "문화센터", searchKeywords: "文化中心 cultural center" },
      { code: "library", nameEn: "Library", nameZh: "圖書館", nameJa: "図書館", nameKo: "도서관", searchKeywords: "圖書館 library" },
    ],
    experience: [
      { code: "cooking_class", nameEn: "Cooking Class", nameZh: "料理課程", nameJa: "料理教室", nameKo: "요리교실", searchKeywords: "料理課程 cooking class DIY" },
      { code: "tea_ceremony", nameEn: "Tea Ceremony", nameZh: "茶道體驗", nameJa: "茶道", nameKo: "다도체험", searchKeywords: "茶道 tea ceremony 泡茶" },
      { code: "pottery", nameEn: "Pottery", nameZh: "陶藝體驗", nameJa: "陶芸", nameKo: "도예체험", searchKeywords: "陶藝 pottery 手作" },
      { code: "guided_tour", nameEn: "Guided Tour", nameZh: "導覽行程", nameJa: "ガイドツアー", nameKo: "가이드투어", searchKeywords: "導覽 guided tour 遊程" },
      { code: "workshop", nameEn: "Workshop", nameZh: "手作工坊", nameJa: "ワークショップ", nameKo: "워크샵", searchKeywords: "手作 workshop DIY" },
      { code: "farm_experience", nameEn: "Farm Experience", nameZh: "農場體驗", nameJa: "農場体験", nameKo: "농장체험", searchKeywords: "農場體驗 farm experience 採果" },
    ],
    entertainment: [
      { code: "ktv", nameEn: "KTV", nameZh: "KTV", nameJa: "カラオケ", nameKo: "노래방", searchKeywords: "KTV karaoke 唱歌" },
      { code: "cinema", nameEn: "Cinema", nameZh: "電影院", nameJa: "映画館", nameKo: "영화관", searchKeywords: "電影院 cinema 電影" },
      { code: "arcade", nameEn: "Arcade", nameZh: "遊樂場", nameJa: "ゲームセンター", nameKo: "오락실", searchKeywords: "遊樂場 arcade 電玩" },
      { code: "theme_park", nameEn: "Theme Park", nameZh: "主題樂園", nameJa: "テーマパーク", nameKo: "테마파크", searchKeywords: "主題樂園 theme park 遊樂園" },
      { code: "escape_room", nameEn: "Escape Room", nameZh: "密室逃脫", nameJa: "脱出ゲーム", nameKo: "방탈출", searchKeywords: "密室逃脫 escape room" },
      { code: "bowling", nameEn: "Bowling", nameZh: "保齡球", nameJa: "ボウリング", nameKo: "볼링", searchKeywords: "保齡球 bowling" },
      { code: "nightclub", nameEn: "Night Club", nameZh: "夜店", nameJa: "ナイトクラブ", nameKo: "나이트클럽", searchKeywords: "夜店 night club bar" },
    ],
    activity: [
      { code: "hiking", nameEn: "Hiking", nameZh: "登山健行", nameJa: "ハイキング", nameKo: "하이킹", searchKeywords: "登山 hiking 步道" },
      { code: "cycling", nameEn: "Cycling", nameZh: "自行車", nameJa: "サイクリング", nameKo: "자전거", searchKeywords: "自行車 cycling 腳踏車" },
      { code: "water_sports", nameEn: "Water Sports", nameZh: "水上活動", nameJa: "ウォータースポーツ", nameKo: "수상스포츠", searchKeywords: "水上活動 water sports 衝浪" },
      { code: "diving", nameEn: "Diving", nameZh: "潛水", nameJa: "ダイビング", nameKo: "다이빙", searchKeywords: "潛水 diving 浮潛" },
      { code: "spa", nameEn: "Spa", nameZh: "SPA按摩", nameJa: "スパ", nameKo: "스파", searchKeywords: "SPA 按摩 massage" },
      { code: "yoga", nameEn: "Yoga", nameZh: "瑜珈", nameJa: "ヨガ", nameKo: "요가", searchKeywords: "瑜珈 yoga" },
      { code: "paragliding", nameEn: "Paragliding", nameZh: "滑翔傘", nameJa: "パラグライダー", nameKo: "패러글라이딩", searchKeywords: "滑翔傘 paragliding 飛行傘" },
    ],
    scenery: [
      { code: "mountain", nameEn: "Mountain", nameZh: "山景", nameJa: "山景", nameKo: "산경치", searchKeywords: "山景 mountain 高山" },
      { code: "ocean", nameEn: "Ocean View", nameZh: "海景", nameJa: "海景", nameKo: "바다경치", searchKeywords: "海景 ocean 海邊" },
      { code: "sunset", nameEn: "Sunset Spot", nameZh: "夕陽景點", nameJa: "夕日スポット", nameKo: "일몰명소", searchKeywords: "夕陽 sunset 日落" },
      { code: "night_view", nameEn: "Night View", nameZh: "夜景", nameJa: "夜景", nameKo: "야경", searchKeywords: "夜景 night view 城市燈火" },
      { code: "park", nameEn: "Park", nameZh: "公園", nameJa: "公園", nameKo: "공원", searchKeywords: "公園 park" },
      { code: "waterfall", nameEn: "Waterfall", nameZh: "瀑布", nameJa: "滝", nameKo: "폭포", searchKeywords: "瀑布 waterfall" },
      { code: "lake", nameEn: "Lake", nameZh: "湖泊", nameJa: "湖", nameKo: "호수", searchKeywords: "湖泊 lake 湖" },
      { code: "botanical_garden", nameEn: "Botanical Garden", nameZh: "植物園", nameJa: "植物園", nameKo: "식물원", searchKeywords: "植物園 botanical garden 花園" },
    ],
    shopping: [
      { code: "department_store", nameEn: "Department Store", nameZh: "百貨公司", nameJa: "デパート", nameKo: "백화점", searchKeywords: "百貨公司 department store" },
      { code: "shopping_mall", nameEn: "Shopping Mall", nameZh: "購物中心", nameJa: "ショッピングモール", nameKo: "쇼핑몰", searchKeywords: "購物中心 shopping mall" },
      { code: "market", nameEn: "Market", nameZh: "市場", nameJa: "市場", nameKo: "시장", searchKeywords: "市場 market 傳統市場" },
      { code: "outlet", nameEn: "Outlet", nameZh: "暢貨中心", nameJa: "アウトレット", nameKo: "아울렛", searchKeywords: "暢貨中心 outlet" },
      { code: "souvenir", nameEn: "Souvenir Shop", nameZh: "伴手禮店", nameJa: "お土産店", nameKo: "기념품점", searchKeywords: "伴手禮 souvenir 特產" },
      { code: "bookstore", nameEn: "Bookstore", nameZh: "書店", nameJa: "書店", nameKo: "서점", searchKeywords: "書店 bookstore" },
      { code: "fashion", nameEn: "Fashion Street", nameZh: "服飾街", nameJa: "ファッション街", nameKo: "패션거리", searchKeywords: "服飾 fashion 潮流" },
    ],
  };

  for (const [catCode, subList] of Object.entries(subcategoryData)) {
    const categoryId = categoryMap[catCode];
    if (!categoryId) continue;
    
    for (const sub of subList) {
      await db.insert(subcategories).values({
        categoryId,
        ...sub,
        isActive: true,
      }).onConflictDoNothing();
    }
  }

  console.log("Subcategories seeded");
  console.log("Database seed completed!");
}

seed().catch(console.error).finally(() => process.exit(0));
