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
  
  // Check if regions already exist
  const existingRegions = await db.select().from(regions);
  const existingRegionCodes = new Set(existingRegions.map(r => r.code));
  
  for (const region of regionData) {
    // Skip if region already exists
    if (existingRegionCodes.has(region.code)) {
      continue;
    }
    const [inserted] = await db.insert(regions).values({
      countryId: taiwanId!,
      ...region,
      isActive: true,
    }).returning();
    if (inserted) insertedRegions[region.code] = inserted.id;
  }

  const allRegions = await db.select().from(regions);
  const regionMap: Record<string, number> = {};
  allRegions.forEach(r => { regionMap[r.code] = r.id; });

  console.log("Regions (Cities/Counties) seeded:", Object.keys(regionMap).length);

  // ============ DISTRICTS (鄉鎮市區) - 完整 368 個行政區 ============
  const districtData: Record<string, Array<{ code: string; nameEn: string; nameZh: string; nameJa: string; nameKo: string }>> = {
    taipei_city: [
      { code: "zhongzheng", nameEn: "Zhongzheng District", nameZh: "中正區", nameJa: "中正区", nameKo: "중정구" },
      { code: "datong", nameEn: "Datong District", nameZh: "大同區", nameJa: "大同区", nameKo: "대동구" },
      { code: "zhongshan", nameEn: "Zhongshan District", nameZh: "中山區", nameJa: "中山区", nameKo: "중산구" },
      { code: "songshan", nameEn: "Songshan District", nameZh: "松山區", nameJa: "松山区", nameKo: "송산구" },
      { code: "daan", nameEn: "Da'an District", nameZh: "大安區", nameJa: "大安区", nameKo: "다안구" },
      { code: "wanhua", nameEn: "Wanhua District", nameZh: "萬華區", nameJa: "萬華区", nameKo: "만화구" },
      { code: "xinyi", nameEn: "Xinyi District", nameZh: "信義區", nameJa: "信義区", nameKo: "신의구" },
      { code: "shilin", nameEn: "Shilin District", nameZh: "士林區", nameJa: "士林区", nameKo: "사림구" },
      { code: "beitou", nameEn: "Beitou District", nameZh: "北投區", nameJa: "北投区", nameKo: "북투구" },
      { code: "neihu", nameEn: "Neihu District", nameZh: "內湖區", nameJa: "内湖区", nameKo: "내호구" },
      { code: "nangang", nameEn: "Nangang District", nameZh: "南港區", nameJa: "南港区", nameKo: "남항구" },
      { code: "wenshan", nameEn: "Wenshan District", nameZh: "文山區", nameJa: "文山区", nameKo: "문산구" },
    ],
    new_taipei_city: [
      { code: "banqiao", nameEn: "Banqiao District", nameZh: "板橋區", nameJa: "板橋区", nameKo: "판교구" },
      { code: "sanchong", nameEn: "Sanchong District", nameZh: "三重區", nameJa: "三重区", nameKo: "삼중구" },
      { code: "zhonghe", nameEn: "Zhonghe District", nameZh: "中和區", nameJa: "中和区", nameKo: "중화구" },
      { code: "yonghe", nameEn: "Yonghe District", nameZh: "永和區", nameJa: "永和区", nameKo: "영화구" },
      { code: "xinzhuang", nameEn: "Xinzhuang District", nameZh: "新莊區", nameJa: "新荘区", nameKo: "신장구" },
      { code: "xindian", nameEn: "Xindian District", nameZh: "新店區", nameJa: "新店区", nameKo: "신점구" },
      { code: "tucheng", nameEn: "Tucheng District", nameZh: "土城區", nameJa: "土城区", nameKo: "토성구" },
      { code: "luzhou", nameEn: "Luzhou District", nameZh: "蘆洲區", nameJa: "蘆洲区", nameKo: "노주구" },
      { code: "shulin", nameEn: "Shulin District", nameZh: "樹林區", nameJa: "樹林区", nameKo: "수림구" },
      { code: "yingge", nameEn: "Yingge District", nameZh: "鶯歌區", nameJa: "鶯歌区", nameKo: "앵가구" },
      { code: "sanxia", nameEn: "Sanxia District", nameZh: "三峽區", nameJa: "三峽区", nameKo: "삼협구" },
      { code: "danshui", nameEn: "Tamsui District", nameZh: "淡水區", nameJa: "淡水区", nameKo: "담수구" },
      { code: "xizhi", nameEn: "Xizhi District", nameZh: "汐止區", nameJa: "汐止区", nameKo: "석지구" },
      { code: "ruifang", nameEn: "Ruifang District", nameZh: "瑞芳區", nameJa: "瑞芳区", nameKo: "서방구" },
      { code: "wugu", nameEn: "Wugu District", nameZh: "五股區", nameJa: "五股区", nameKo: "오고구" },
      { code: "taishan", nameEn: "Taishan District", nameZh: "泰山區", nameJa: "泰山区", nameKo: "태산구" },
      { code: "linkou", nameEn: "Linkou District", nameZh: "林口區", nameJa: "林口区", nameKo: "임구구" },
      { code: "shenkeng", nameEn: "Shenkeng District", nameZh: "深坑區", nameJa: "深坑区", nameKo: "심갱구" },
      { code: "shiding", nameEn: "Shiding District", nameZh: "石碇區", nameJa: "石碇区", nameKo: "석정구" },
      { code: "pinglin", nameEn: "Pinglin District", nameZh: "坪林區", nameJa: "坪林区", nameKo: "평림구" },
      { code: "sanzhi", nameEn: "Sanzhi District", nameZh: "三芝區", nameJa: "三芝区", nameKo: "삼지구" },
      { code: "shimen", nameEn: "Shimen District", nameZh: "石門區", nameJa: "石門区", nameKo: "석문구" },
      { code: "bali", nameEn: "Bali District", nameZh: "八里區", nameJa: "八里区", nameKo: "팔리구" },
      { code: "pingxi", nameEn: "Pingxi District", nameZh: "平溪區", nameJa: "平溪区", nameKo: "평계구" },
      { code: "shuangxi", nameEn: "Shuangxi District", nameZh: "雙溪區", nameJa: "双溪区", nameKo: "쌍계구" },
      { code: "gongliao", nameEn: "Gongliao District", nameZh: "貢寮區", nameJa: "貢寮区", nameKo: "공료구" },
      { code: "jinshan", nameEn: "Jinshan District", nameZh: "金山區", nameJa: "金山区", nameKo: "금산구" },
      { code: "wanli", nameEn: "Wanli District", nameZh: "萬里區", nameJa: "萬里区", nameKo: "만리구" },
      { code: "wulai", nameEn: "Wulai District", nameZh: "烏來區", nameJa: "烏来区", nameKo: "오래구" },
    ],
    taoyuan_city: [
      { code: "taoyuan_dist", nameEn: "Taoyuan District", nameZh: "桃園區", nameJa: "桃園区", nameKo: "도원구" },
      { code: "zhongli", nameEn: "Zhongli District", nameZh: "中壢區", nameJa: "中壢区", nameKo: "중력구" },
      { code: "daxi", nameEn: "Daxi District", nameZh: "大溪區", nameJa: "大渓区", nameKo: "대계구" },
      { code: "yangmei", nameEn: "Yangmei District", nameZh: "楊梅區", nameJa: "楊梅区", nameKo: "양매구" },
      { code: "luzhu", nameEn: "Luzhu District", nameZh: "蘆竹區", nameJa: "蘆竹区", nameKo: "노죽구" },
      { code: "dayuan", nameEn: "Dayuan District", nameZh: "大園區", nameJa: "大園区", nameKo: "대원구" },
      { code: "guishan", nameEn: "Guishan District", nameZh: "龜山區", nameJa: "亀山区", nameKo: "귀산구" },
      { code: "bade", nameEn: "Bade District", nameZh: "八德區", nameJa: "八德区", nameKo: "팔덕구" },
      { code: "longtan", nameEn: "Longtan District", nameZh: "龍潭區", nameJa: "龍潭区", nameKo: "용담구" },
      { code: "pingzhen", nameEn: "Pingzhen District", nameZh: "平鎮區", nameJa: "平鎮区", nameKo: "평진구" },
      { code: "xinwu", nameEn: "Xinwu District", nameZh: "新屋區", nameJa: "新屋区", nameKo: "신옥구" },
      { code: "guanyin", nameEn: "Guanyin District", nameZh: "觀音區", nameJa: "観音区", nameKo: "관음구" },
      { code: "fuxing", nameEn: "Fuxing District", nameZh: "復興區", nameJa: "復興区", nameKo: "부흥구" },
    ],
    taichung_city: [
      { code: "central", nameEn: "Central District", nameZh: "中區", nameJa: "中区", nameKo: "중구" },
      { code: "east", nameEn: "East District", nameZh: "東區", nameJa: "東区", nameKo: "동구" },
      { code: "south", nameEn: "South District", nameZh: "南區", nameJa: "南区", nameKo: "남구" },
      { code: "west", nameEn: "West District", nameZh: "西區", nameJa: "西区", nameKo: "서구" },
      { code: "north", nameEn: "North District", nameZh: "北區", nameJa: "北区", nameKo: "북구" },
      { code: "beitun", nameEn: "Beitun District", nameZh: "北屯區", nameJa: "北屯区", nameKo: "북둔구" },
      { code: "xitun", nameEn: "Xitun District", nameZh: "西屯區", nameJa: "西屯区", nameKo: "서둔구" },
      { code: "nantun", nameEn: "Nantun District", nameZh: "南屯區", nameJa: "南屯区", nameKo: "남둔구" },
      { code: "taiping", nameEn: "Taiping District", nameZh: "太平區", nameJa: "太平区", nameKo: "태평구" },
      { code: "dali", nameEn: "Dali District", nameZh: "大里區", nameJa: "大里区", nameKo: "대리구" },
      { code: "wufeng", nameEn: "Wufeng District", nameZh: "霧峰區", nameJa: "霧峰区", nameKo: "무봉구" },
      { code: "wuri", nameEn: "Wuri District", nameZh: "烏日區", nameJa: "烏日区", nameKo: "오일구" },
      { code: "fengyuan", nameEn: "Fengyuan District", nameZh: "豐原區", nameJa: "豊原区", nameKo: "풍원구" },
      { code: "houli", nameEn: "Houli District", nameZh: "后里區", nameJa: "后里区", nameKo: "후리구" },
      { code: "shigang", nameEn: "Shigang District", nameZh: "石岡區", nameJa: "石岡区", nameKo: "석강구" },
      { code: "dongshi", nameEn: "Dongshi District", nameZh: "東勢區", nameJa: "東勢区", nameKo: "동세구" },
      { code: "heping", nameEn: "Heping District", nameZh: "和平區", nameJa: "和平区", nameKo: "화평구" },
      { code: "xinshe", nameEn: "Xinshe District", nameZh: "新社區", nameJa: "新社区", nameKo: "신사구" },
      { code: "tanzi", nameEn: "Tanzi District", nameZh: "潭子區", nameJa: "潭子区", nameKo: "담자구" },
      { code: "daya", nameEn: "Daya District", nameZh: "大雅區", nameJa: "大雅区", nameKo: "대아구" },
      { code: "shengang", nameEn: "Shengang District", nameZh: "神岡區", nameJa: "神岡区", nameKo: "신강구" },
      { code: "dadu", nameEn: "Dadu District", nameZh: "大肚區", nameJa: "大肚区", nameKo: "대두구" },
      { code: "shalu", nameEn: "Shalu District", nameZh: "沙鹿區", nameJa: "沙鹿区", nameKo: "사록구" },
      { code: "longjing", nameEn: "Longjing District", nameZh: "龍井區", nameJa: "龍井区", nameKo: "용정구" },
      { code: "wuqi", nameEn: "Wuqi District", nameZh: "梧棲區", nameJa: "梧棲区", nameKo: "오서구" },
      { code: "qingshui", nameEn: "Qingshui District", nameZh: "清水區", nameJa: "清水区", nameKo: "청수구" },
      { code: "dajia", nameEn: "Dajia District", nameZh: "大甲區", nameJa: "大甲区", nameKo: "대갑구" },
      { code: "waipu", nameEn: "Waipu District", nameZh: "外埔區", nameJa: "外埔区", nameKo: "외포구" },
      { code: "daan_tc", nameEn: "Da'an District", nameZh: "大安區", nameJa: "大安区", nameKo: "대안구" },
    ],
    tainan_city: [
      { code: "west_central", nameEn: "West Central District", nameZh: "中西區", nameJa: "中西区", nameKo: "중서구" },
      { code: "east_dist", nameEn: "East District", nameZh: "東區", nameJa: "東区", nameKo: "동구" },
      { code: "south_dist", nameEn: "South District", nameZh: "南區", nameJa: "南区", nameKo: "남구" },
      { code: "north_dist", nameEn: "North District", nameZh: "北區", nameJa: "北区", nameKo: "북구" },
      { code: "anping", nameEn: "Anping District", nameZh: "安平區", nameJa: "安平区", nameKo: "안평구" },
      { code: "annan", nameEn: "Annan District", nameZh: "安南區", nameJa: "安南区", nameKo: "안남구" },
      { code: "yongkang", nameEn: "Yongkang District", nameZh: "永康區", nameJa: "永康区", nameKo: "영강구" },
      { code: "guiren", nameEn: "Guiren District", nameZh: "歸仁區", nameJa: "帰仁区", nameKo: "귀인구" },
      { code: "xinhua", nameEn: "Xinhua District", nameZh: "新化區", nameJa: "新化区", nameKo: "신화구" },
      { code: "zuozhen", nameEn: "Zuozhen District", nameZh: "左鎮區", nameJa: "左鎮区", nameKo: "좌진구" },
      { code: "yujing", nameEn: "Yujing District", nameZh: "玉井區", nameJa: "玉井区", nameKo: "옥정구" },
      { code: "nanxi", nameEn: "Nanxi District", nameZh: "楠西區", nameJa: "楠西区", nameKo: "남서구" },
      { code: "nanhua", nameEn: "Nanhua District", nameZh: "南化區", nameJa: "南化区", nameKo: "남화구" },
      { code: "rende", nameEn: "Rende District", nameZh: "仁德區", nameJa: "仁德区", nameKo: "인덕구" },
      { code: "guanmiao", nameEn: "Guanmiao District", nameZh: "關廟區", nameJa: "関廟区", nameKo: "관묘구" },
      { code: "longqi", nameEn: "Longqi District", nameZh: "龍崎區", nameJa: "龍崎区", nameKo: "용기구" },
      { code: "guantian", nameEn: "Guantian District", nameZh: "官田區", nameJa: "官田区", nameKo: "관전구" },
      { code: "madou", nameEn: "Madou District", nameZh: "麻豆區", nameJa: "麻豆区", nameKo: "마두구" },
      { code: "jiali", nameEn: "Jiali District", nameZh: "佳里區", nameJa: "佳里区", nameKo: "가리구" },
      { code: "xigang", nameEn: "Xigang District", nameZh: "西港區", nameJa: "西港区", nameKo: "서항구" },
      { code: "qigu", nameEn: "Qigu District", nameZh: "七股區", nameJa: "七股区", nameKo: "칠고구" },
      { code: "jiangjun", nameEn: "Jiangjun District", nameZh: "將軍區", nameJa: "将軍区", nameKo: "장군구" },
      { code: "xuejia", nameEn: "Xuejia District", nameZh: "學甲區", nameJa: "学甲区", nameKo: "학갑구" },
      { code: "beimen", nameEn: "Beimen District", nameZh: "北門區", nameJa: "北門区", nameKo: "북문구" },
      { code: "xinying", nameEn: "Xinying District", nameZh: "新營區", nameJa: "新営区", nameKo: "신영구" },
      { code: "houbi", nameEn: "Houbi District", nameZh: "後壁區", nameJa: "後壁区", nameKo: "후벽구" },
      { code: "baihe", nameEn: "Baihe District", nameZh: "白河區", nameJa: "白河区", nameKo: "백하구" },
      { code: "dongshan", nameEn: "Dongshan District", nameZh: "東山區", nameJa: "東山区", nameKo: "동산구" },
      { code: "liujia", nameEn: "Liujia District", nameZh: "六甲區", nameJa: "六甲区", nameKo: "육갑구" },
      { code: "xiaying", nameEn: "Xiaying District", nameZh: "下營區", nameJa: "下営区", nameKo: "하영구" },
      { code: "liuying", nameEn: "Liuying District", nameZh: "柳營區", nameJa: "柳営区", nameKo: "유영구" },
      { code: "yanshui", nameEn: "Yanshui District", nameZh: "鹽水區", nameJa: "塩水区", nameKo: "염수구" },
      { code: "shanhua", nameEn: "Shanhua District", nameZh: "善化區", nameJa: "善化区", nameKo: "선화구" },
      { code: "danei", nameEn: "Danei District", nameZh: "大內區", nameJa: "大内区", nameKo: "대내구" },
      { code: "shanshang", nameEn: "Shanshang District", nameZh: "山上區", nameJa: "山上区", nameKo: "산상구" },
      { code: "xinshi", nameEn: "Xinshi District", nameZh: "新市區", nameJa: "新市区", nameKo: "신시구" },
      { code: "anding", nameEn: "Anding District", nameZh: "安定區", nameJa: "安定区", nameKo: "안정구" },
    ],
    kaohsiung_city: [
      { code: "yancheng", nameEn: "Yancheng District", nameZh: "鹽埕區", nameJa: "塩埕区", nameKo: "염정구" },
      { code: "gushan", nameEn: "Gushan District", nameZh: "鼓山區", nameJa: "鼓山区", nameKo: "고산구" },
      { code: "zuoying", nameEn: "Zuoying District", nameZh: "左營區", nameJa: "左營区", nameKo: "좌영구" },
      { code: "nanzi", nameEn: "Nanzi District", nameZh: "楠梓區", nameJa: "楠梓区", nameKo: "남자구" },
      { code: "sanmin", nameEn: "Sanmin District", nameZh: "三民區", nameJa: "三民区", nameKo: "삼민구" },
      { code: "xinxing", nameEn: "Xinxing District", nameZh: "新興區", nameJa: "新興区", nameKo: "신흥구" },
      { code: "qianjin", nameEn: "Qianjin District", nameZh: "前金區", nameJa: "前金区", nameKo: "전금구" },
      { code: "lingya", nameEn: "Lingya District", nameZh: "苓雅區", nameJa: "苓雅区", nameKo: "영아구" },
      { code: "qianzhen", nameEn: "Qianzhen District", nameZh: "前鎮區", nameJa: "前鎮区", nameKo: "전진구" },
      { code: "qijin", nameEn: "Qijin District", nameZh: "旗津區", nameJa: "旗津区", nameKo: "기진구" },
      { code: "xiaogang", nameEn: "Xiaogang District", nameZh: "小港區", nameJa: "小港区", nameKo: "소항구" },
      { code: "fengshan", nameEn: "Fengshan District", nameZh: "鳳山區", nameJa: "鳳山区", nameKo: "봉산구" },
      { code: "linyuan", nameEn: "Linyuan District", nameZh: "林園區", nameJa: "林園区", nameKo: "임원구" },
      { code: "daliao", nameEn: "Daliao District", nameZh: "大寮區", nameJa: "大寮区", nameKo: "대료구" },
      { code: "dashu", nameEn: "Dashu District", nameZh: "大樹區", nameJa: "大樹区", nameKo: "대수구" },
      { code: "dashe", nameEn: "Dashe District", nameZh: "大社區", nameJa: "大社区", nameKo: "대사구" },
      { code: "renwu", nameEn: "Renwu District", nameZh: "仁武區", nameJa: "仁武区", nameKo: "인무구" },
      { code: "niaosong", nameEn: "Niaosong District", nameZh: "鳥松區", nameJa: "鳥松区", nameKo: "조송구" },
      { code: "gangshan", nameEn: "Gangshan District", nameZh: "岡山區", nameJa: "岡山区", nameKo: "강산구" },
      { code: "qiaotou", nameEn: "Qiaotou District", nameZh: "橋頭區", nameJa: "橋頭区", nameKo: "교두구" },
      { code: "yanchao", nameEn: "Yanchao District", nameZh: "燕巢區", nameJa: "燕巣区", nameKo: "연소구" },
      { code: "tianliao", nameEn: "Tianliao District", nameZh: "田寮區", nameJa: "田寮区", nameKo: "전료구" },
      { code: "alian", nameEn: "Alian District", nameZh: "阿蓮區", nameJa: "阿蓮区", nameKo: "아련구" },
      { code: "luzhu_kh", nameEn: "Luzhu District", nameZh: "路竹區", nameJa: "路竹区", nameKo: "로죽구" },
      { code: "hunei", nameEn: "Hunei District", nameZh: "湖內區", nameJa: "湖内区", nameKo: "호내구" },
      { code: "qieding", nameEn: "Qieding District", nameZh: "茄萣區", nameJa: "茄萣区", nameKo: "가정구" },
      { code: "yongan", nameEn: "Yong'an District", nameZh: "永安區", nameJa: "永安区", nameKo: "영안구" },
      { code: "mituo", nameEn: "Mituo District", nameZh: "彌陀區", nameJa: "弥陀区", nameKo: "미타구" },
      { code: "ziguan", nameEn: "Ziguan District", nameZh: "梓官區", nameJa: "梓官区", nameKo: "자관구" },
      { code: "qishan", nameEn: "Qishan District", nameZh: "旗山區", nameJa: "旗山区", nameKo: "기산구" },
      { code: "meinong", nameEn: "Meinong District", nameZh: "美濃區", nameJa: "美濃区", nameKo: "미농구" },
      { code: "liugui", nameEn: "Liugui District", nameZh: "六龜區", nameJa: "六亀区", nameKo: "육귀구" },
      { code: "jiaxian", nameEn: "Jiaxian District", nameZh: "甲仙區", nameJa: "甲仙区", nameKo: "갑선구" },
      { code: "shanlin", nameEn: "Shanlin District", nameZh: "杉林區", nameJa: "杉林区", nameKo: "삼림구" },
      { code: "neimen", nameEn: "Neimen District", nameZh: "內門區", nameJa: "内門区", nameKo: "내문구" },
      { code: "maolin", nameEn: "Maolin District", nameZh: "茂林區", nameJa: "茂林区", nameKo: "무림구" },
      { code: "taoyuan_kh", nameEn: "Taoyuan District", nameZh: "桃源區", nameJa: "桃源区", nameKo: "도원구" },
      { code: "namaxia", nameEn: "Namaxia District", nameZh: "那瑪夏區", nameJa: "那瑪夏区", nameKo: "나마하구" },
    ],
    keelung_city: [
      { code: "ren_ai", nameEn: "Ren'ai District", nameZh: "仁愛區", nameJa: "仁愛区", nameKo: "인애구" },
      { code: "xinyi_kl", nameEn: "Xinyi District", nameZh: "信義區", nameJa: "信義区", nameKo: "신의구" },
      { code: "zhongzheng_kl", nameEn: "Zhongzheng District", nameZh: "中正區", nameJa: "中正区", nameKo: "중정구" },
      { code: "zhongshan_kl", nameEn: "Zhongshan District", nameZh: "中山區", nameJa: "中山区", nameKo: "중산구" },
      { code: "anle", nameEn: "Anle District", nameZh: "安樂區", nameJa: "安楽区", nameKo: "안락구" },
      { code: "nuannuan", nameEn: "Nuannuan District", nameZh: "暖暖區", nameJa: "暖暖区", nameKo: "난난구" },
      { code: "qidu", nameEn: "Qidu District", nameZh: "七堵區", nameJa: "七堵区", nameKo: "칠두구" },
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
      { code: "zhudong", nameEn: "Zhudong Township", nameZh: "竹東鎮", nameJa: "竹東鎮", nameKo: "죽동진" },
      { code: "xinpu", nameEn: "Xinpu Township", nameZh: "新埔鎮", nameJa: "新埔鎮", nameKo: "신포진" },
      { code: "guanxi", nameEn: "Guanxi Township", nameZh: "關西鎮", nameJa: "関西鎮", nameKo: "관서진" },
      { code: "hukou", nameEn: "Hukou Township", nameZh: "湖口鄉", nameJa: "湖口郷", nameKo: "호구향" },
      { code: "xinfeng", nameEn: "Xinfeng Township", nameZh: "新豐鄉", nameJa: "新豊郷", nameKo: "신풍향" },
      { code: "qionglin", nameEn: "Qionglin Township", nameZh: "芎林鄉", nameJa: "芎林郷", nameKo: "궁림향" },
      { code: "hengshan", nameEn: "Hengshan Township", nameZh: "橫山鄉", nameJa: "横山郷", nameKo: "횡산향" },
      { code: "beipu", nameEn: "Beipu Township", nameZh: "北埔鄉", nameJa: "北埔郷", nameKo: "북포향" },
      { code: "baoshan", nameEn: "Baoshan Township", nameZh: "寶山鄉", nameJa: "宝山郷", nameKo: "보산향" },
      { code: "emei", nameEn: "Emei Township", nameZh: "峨眉鄉", nameJa: "峨眉郷", nameKo: "아미향" },
      { code: "jianshi", nameEn: "Jianshi Township", nameZh: "尖石鄉", nameJa: "尖石郷", nameKo: "첨석향" },
      { code: "wufeng_hc", nameEn: "Wufeng Township", nameZh: "五峰鄉", nameJa: "五峰郷", nameKo: "오봉향" },
    ],
    miaoli_county: [
      { code: "miaoli", nameEn: "Miaoli City", nameZh: "苗栗市", nameJa: "苗栗市", nameKo: "묘율시" },
      { code: "toufen", nameEn: "Toufen City", nameZh: "頭份市", nameJa: "頭份市", nameKo: "두분시" },
      { code: "yuanli", nameEn: "Yuanli Township", nameZh: "苑裡鎮", nameJa: "苑裡鎮", nameKo: "원리진" },
      { code: "tongxiao", nameEn: "Tongxiao Township", nameZh: "通霄鎮", nameJa: "通霄鎮", nameKo: "통소진" },
      { code: "zhunan", nameEn: "Zhunan Township", nameZh: "竹南鎮", nameJa: "竹南鎮", nameKo: "죽남진" },
      { code: "houlong", nameEn: "Houlong Township", nameZh: "後龍鎮", nameJa: "後龍鎮", nameKo: "후룡진" },
      { code: "zhuolan", nameEn: "Zhuolan Township", nameZh: "卓蘭鎮", nameJa: "卓蘭鎮", nameKo: "탁란진" },
      { code: "dahu", nameEn: "Dahu Township", nameZh: "大湖鄉", nameJa: "大湖郷", nameKo: "대호향" },
      { code: "gongguan", nameEn: "Gongguan Township", nameZh: "公館鄉", nameJa: "公館郷", nameKo: "공관향" },
      { code: "tongluo", nameEn: "Tongluo Township", nameZh: "銅鑼鄉", nameJa: "銅鑼郷", nameKo: "동라향" },
      { code: "nanzhuang", nameEn: "Nanzhuang Township", nameZh: "南庄鄉", nameJa: "南庄郷", nameKo: "남장향" },
      { code: "touwu", nameEn: "Touwu Township", nameZh: "頭屋鄉", nameJa: "頭屋郷", nameKo: "두옥향" },
      { code: "sanyi", nameEn: "Sanyi Township", nameZh: "三義鄉", nameJa: "三義郷", nameKo: "삼의향" },
      { code: "xihu", nameEn: "Xihu Township", nameZh: "西湖鄉", nameJa: "西湖郷", nameKo: "서호향" },
      { code: "zaoqiao", nameEn: "Zaoqiao Township", nameZh: "造橋鄉", nameJa: "造橋郷", nameKo: "조교향" },
      { code: "sanwan", nameEn: "Sanwan Township", nameZh: "三灣鄉", nameJa: "三湾郷", nameKo: "삼만향" },
      { code: "shitan", nameEn: "Shitan Township", nameZh: "獅潭鄉", nameJa: "獅潭郷", nameKo: "사담향" },
      { code: "taian", nameEn: "Tai'an Township", nameZh: "泰安鄉", nameJa: "泰安郷", nameKo: "태안향" },
    ],
    changhua_county: [
      { code: "changhua", nameEn: "Changhua City", nameZh: "彰化市", nameJa: "彰化市", nameKo: "창화시" },
      { code: "yuanlin", nameEn: "Yuanlin City", nameZh: "員林市", nameJa: "員林市", nameKo: "원림시" },
      { code: "lugang", nameEn: "Lugang Township", nameZh: "鹿港鎮", nameJa: "鹿港鎮", nameKo: "녹항진" },
      { code: "hemei", nameEn: "Hemei Township", nameZh: "和美鎮", nameJa: "和美鎮", nameKo: "화미진" },
      { code: "beidou", nameEn: "Beidou Township", nameZh: "北斗鎮", nameJa: "北斗鎮", nameKo: "북두진" },
      { code: "xihu_ch", nameEn: "Xihu Township", nameZh: "溪湖鎮", nameJa: "渓湖鎮", nameKo: "계호진" },
      { code: "tianzhong", nameEn: "Tianzhong Township", nameZh: "田中鎮", nameJa: "田中鎮", nameKo: "전중진" },
      { code: "erlin", nameEn: "Erlin Township", nameZh: "二林鎮", nameJa: "二林鎮", nameKo: "이림진" },
      { code: "xianxi", nameEn: "Xianxi Township", nameZh: "線西鄉", nameJa: "線西郷", nameKo: "선서향" },
      { code: "shengang_ch", nameEn: "Shengang Township", nameZh: "伸港鄉", nameJa: "伸港郷", nameKo: "신항향" },
      { code: "fuxing_ch", nameEn: "Fuxing Township", nameZh: "福興鄉", nameJa: "福興郷", nameKo: "복흥향" },
      { code: "xiushui", nameEn: "Xiushui Township", nameZh: "秀水鄉", nameJa: "秀水郷", nameKo: "수수향" },
      { code: "huatan", nameEn: "Huatan Township", nameZh: "花壇鄉", nameJa: "花壇郷", nameKo: "화단향" },
      { code: "fenyuan", nameEn: "Fenyuan Township", nameZh: "芬園鄉", nameJa: "芬園郷", nameKo: "분원향" },
      { code: "dacun", nameEn: "Dacun Township", nameZh: "大村鄉", nameJa: "大村郷", nameKo: "대촌향" },
      { code: "puyan", nameEn: "Puyan Township", nameZh: "埔鹽鄉", nameJa: "埔塩郷", nameKo: "포염향" },
      { code: "puxin", nameEn: "Puxin Township", nameZh: "埔心鄉", nameJa: "埔心郷", nameKo: "포심향" },
      { code: "yongjing", nameEn: "Yongjing Township", nameZh: "永靖鄉", nameJa: "永靖郷", nameKo: "영정향" },
      { code: "shetou", nameEn: "Shetou Township", nameZh: "社頭鄉", nameJa: "社頭郷", nameKo: "사두향" },
      { code: "ershui", nameEn: "Ershui Township", nameZh: "二水鄉", nameJa: "二水郷", nameKo: "이수향" },
      { code: "tianwei", nameEn: "Tianwei Township", nameZh: "田尾鄉", nameJa: "田尾郷", nameKo: "전미향" },
      { code: "pitou", nameEn: "Pitou Township", nameZh: "埤頭鄉", nameJa: "埤頭郷", nameKo: "비두향" },
      { code: "fangyuan", nameEn: "Fangyuan Township", nameZh: "芳苑鄉", nameJa: "芳苑郷", nameKo: "방원향" },
      { code: "dacheng", nameEn: "Dacheng Township", nameZh: "大城鄉", nameJa: "大城郷", nameKo: "대성향" },
      { code: "zhutang", nameEn: "Zhutang Township", nameZh: "竹塘鄉", nameJa: "竹塘郷", nameKo: "죽당향" },
      { code: "xizhou", nameEn: "Xizhou Township", nameZh: "溪州鄉", nameJa: "渓州郷", nameKo: "계주향" },
    ],
    nantou_county: [
      { code: "nantou", nameEn: "Nantou City", nameZh: "南投市", nameJa: "南投市", nameKo: "남투시" },
      { code: "puli", nameEn: "Puli Township", nameZh: "埔里鎮", nameJa: "埔里鎮", nameKo: "포리진" },
      { code: "caotun", nameEn: "Caotun Township", nameZh: "草屯鎮", nameJa: "草屯鎮", nameKo: "초둔진" },
      { code: "zhushan", nameEn: "Zhushan Township", nameZh: "竹山鎮", nameJa: "竹山鎮", nameKo: "죽산진" },
      { code: "jiji", nameEn: "Jiji Township", nameZh: "集集鎮", nameJa: "集集鎮", nameKo: "집집진" },
      { code: "mingjian", nameEn: "Mingjian Township", nameZh: "名間鄉", nameJa: "名間郷", nameKo: "명간향" },
      { code: "lugu", nameEn: "Lugu Township", nameZh: "鹿谷鄉", nameJa: "鹿谷郷", nameKo: "록곡향" },
      { code: "zhongliao", nameEn: "Zhongliao Township", nameZh: "中寮鄉", nameJa: "中寮郷", nameKo: "중료향" },
      { code: "yuchi", nameEn: "Yuchi Township", nameZh: "魚池鄉", nameJa: "魚池郷", nameKo: "어지향" },
      { code: "guoxing", nameEn: "Guoxing Township", nameZh: "國姓鄉", nameJa: "国姓郷", nameKo: "국성향" },
      { code: "shuili", nameEn: "Shuili Township", nameZh: "水里鄉", nameJa: "水里郷", nameKo: "수리향" },
      { code: "xinyi_nt", nameEn: "Xinyi Township", nameZh: "信義鄉", nameJa: "信義郷", nameKo: "신의향" },
      { code: "renai", nameEn: "Ren'ai Township", nameZh: "仁愛鄉", nameJa: "仁愛郷", nameKo: "인애향" },
    ],
    yunlin_county: [
      { code: "douliu", nameEn: "Douliu City", nameZh: "斗六市", nameJa: "斗六市", nameKo: "두육시" },
      { code: "dounan", nameEn: "Dounan Township", nameZh: "斗南鎮", nameJa: "斗南鎮", nameKo: "두남진" },
      { code: "huwei", nameEn: "Huwei Township", nameZh: "虎尾鎮", nameJa: "虎尾鎮", nameKo: "호미진" },
      { code: "xiluo", nameEn: "Xiluo Township", nameZh: "西螺鎮", nameJa: "西螺鎮", nameKo: "서라진" },
      { code: "tuku", nameEn: "Tuku Township", nameZh: "土庫鎮", nameJa: "土庫鎮", nameKo: "토고진" },
      { code: "beigang", nameEn: "Beigang Township", nameZh: "北港鎮", nameJa: "北港鎮", nameKo: "북항진" },
      { code: "gukeng", nameEn: "Gukeng Township", nameZh: "古坑鄉", nameJa: "古坑郷", nameKo: "고갱향" },
      { code: "dapi", nameEn: "Dapi Township", nameZh: "大埤鄉", nameJa: "大埤郷", nameKo: "대비향" },
      { code: "citong", nameEn: "Citong Township", nameZh: "莿桐鄉", nameJa: "莿桐郷", nameKo: "자동향" },
      { code: "linnei", nameEn: "Linnei Township", nameZh: "林內鄉", nameJa: "林内郷", nameKo: "임내향" },
      { code: "erlun", nameEn: "Erlun Township", nameZh: "二崙鄉", nameJa: "二崙郷", nameKo: "이륜향" },
      { code: "lunbei", nameEn: "Lunbei Township", nameZh: "崙背鄉", nameJa: "崙背郷", nameKo: "륜배향" },
      { code: "mailiao", nameEn: "Mailiao Township", nameZh: "麥寮鄉", nameJa: "麦寮郷", nameKo: "맥료향" },
      { code: "dongshi_yl", nameEn: "Dongshi Township", nameZh: "東勢鄉", nameJa: "東勢郷", nameKo: "동세향" },
      { code: "baozhong", nameEn: "Baozhong Township", nameZh: "褒忠鄉", nameJa: "褒忠郷", nameKo: "포충향" },
      { code: "taixi", nameEn: "Taixi Township", nameZh: "臺西鄉", nameJa: "台西郷", nameKo: "태서향" },
      { code: "yuanchang", nameEn: "Yuanchang Township", nameZh: "元長鄉", nameJa: "元長郷", nameKo: "원장향" },
      { code: "sihu", nameEn: "Sihu Township", nameZh: "四湖鄉", nameJa: "四湖郷", nameKo: "사호향" },
      { code: "kouhu", nameEn: "Kouhu Township", nameZh: "口湖鄉", nameJa: "口湖郷", nameKo: "구호향" },
      { code: "shuilin", nameEn: "Shuilin Township", nameZh: "水林鄉", nameJa: "水林郷", nameKo: "수림향" },
    ],
    chiayi_county: [
      { code: "taibao", nameEn: "Taibao City", nameZh: "太保市", nameJa: "太保市", nameKo: "태보시" },
      { code: "puzi", nameEn: "Puzi City", nameZh: "朴子市", nameJa: "朴子市", nameKo: "박자시" },
      { code: "budai", nameEn: "Budai Township", nameZh: "布袋鎮", nameJa: "布袋鎮", nameKo: "포대진" },
      { code: "dalin", nameEn: "Dalin Township", nameZh: "大林鎮", nameJa: "大林鎮", nameKo: "대림진" },
      { code: "minxiong", nameEn: "Minxiong Township", nameZh: "民雄鄉", nameJa: "民雄郷", nameKo: "민웅향" },
      { code: "xikou", nameEn: "Xikou Township", nameZh: "溪口鄉", nameJa: "渓口郷", nameKo: "계구향" },
      { code: "xingang", nameEn: "Xingang Township", nameZh: "新港鄉", nameJa: "新港郷", nameKo: "신항향" },
      { code: "liujiao", nameEn: "Liujiao Township", nameZh: "六腳鄉", nameJa: "六脚郷", nameKo: "육각향" },
      { code: "dongshi_cy", nameEn: "Dongshi Township", nameZh: "東石鄉", nameJa: "東石郷", nameKo: "동석향" },
      { code: "yizhu", nameEn: "Yizhu Township", nameZh: "義竹鄉", nameJa: "義竹郷", nameKo: "의죽향" },
      { code: "lucao", nameEn: "Lucao Township", nameZh: "鹿草鄉", nameJa: "鹿草郷", nameKo: "녹초향" },
      { code: "shuishang", nameEn: "Shuishang Township", nameZh: "水上鄉", nameJa: "水上郷", nameKo: "수상향" },
      { code: "zhongpu", nameEn: "Zhongpu Township", nameZh: "中埔鄉", nameJa: "中埔郷", nameKo: "중포향" },
      { code: "zhuqi", nameEn: "Zhuqi Township", nameZh: "竹崎鄉", nameJa: "竹崎郷", nameKo: "죽기향" },
      { code: "meishan", nameEn: "Meishan Township", nameZh: "梅山鄉", nameJa: "梅山郷", nameKo: "매산향" },
      { code: "fanlu", nameEn: "Fanlu Township", nameZh: "番路鄉", nameJa: "番路郷", nameKo: "번로향" },
      { code: "dapu", nameEn: "Dapu Township", nameZh: "大埔鄉", nameJa: "大埔郷", nameKo: "대포향" },
      { code: "alishan", nameEn: "Alishan Township", nameZh: "阿里山鄉", nameJa: "阿里山郷", nameKo: "아리산향" },
    ],
    pingtung_county: [
      { code: "pingtung", nameEn: "Pingtung City", nameZh: "屏東市", nameJa: "屏東市", nameKo: "핑둥시" },
      { code: "chaozhou", nameEn: "Chaozhou Township", nameZh: "潮州鎮", nameJa: "潮州鎮", nameKo: "조주진" },
      { code: "donggang", nameEn: "Donggang Township", nameZh: "東港鎮", nameJa: "東港鎮", nameKo: "동항진" },
      { code: "hengchun", nameEn: "Hengchun Township", nameZh: "恆春鎮", nameJa: "恆春鎮", nameKo: "항춘진" },
      { code: "wandan", nameEn: "Wandan Township", nameZh: "萬丹鄉", nameJa: "萬丹郷", nameKo: "만단향" },
      { code: "changzhi", nameEn: "Changzhi Township", nameZh: "長治鄉", nameJa: "長治郷", nameKo: "장치향" },
      { code: "linluo", nameEn: "Linluo Township", nameZh: "麟洛鄉", nameJa: "麟洛郷", nameKo: "인락향" },
      { code: "jiuru", nameEn: "Jiuru Township", nameZh: "九如鄉", nameJa: "九如郷", nameKo: "구여향" },
      { code: "ligang", nameEn: "Ligang Township", nameZh: "里港鄉", nameJa: "里港郷", nameKo: "이항향" },
      { code: "yanpu", nameEn: "Yanpu Township", nameZh: "鹽埔鄉", nameJa: "塩埔郷", nameKo: "염포향" },
      { code: "gaoshu", nameEn: "Gaoshu Township", nameZh: "高樹鄉", nameJa: "高樹郷", nameKo: "고수향" },
      { code: "wanluan", nameEn: "Wanluan Township", nameZh: "萬巒鄉", nameJa: "萬巒郷", nameKo: "만만향" },
      { code: "neipu", nameEn: "Neipu Township", nameZh: "內埔鄉", nameJa: "内埔郷", nameKo: "내포향" },
      { code: "zhutian", nameEn: "Zhutian Township", nameZh: "竹田鄉", nameJa: "竹田郷", nameKo: "죽전향" },
      { code: "xinpi", nameEn: "Xinpi Township", nameZh: "新埤鄉", nameJa: "新埤郷", nameKo: "신비향" },
      { code: "fangliao", nameEn: "Fangliao Township", nameZh: "枋寮鄉", nameJa: "枋寮郷", nameKo: "방료향" },
      { code: "xinyuan", nameEn: "Xinyuan Township", nameZh: "新園鄉", nameJa: "新園郷", nameKo: "신원향" },
      { code: "kanding", nameEn: "Kanding Township", nameZh: "崁頂鄉", nameJa: "崁頂郷", nameKo: "감정향" },
      { code: "linbian", nameEn: "Linbian Township", nameZh: "林邊鄉", nameJa: "林辺郷", nameKo: "임변향" },
      { code: "nanzhou", nameEn: "Nanzhou Township", nameZh: "南州鄉", nameJa: "南州郷", nameKo: "남주향" },
      { code: "jiadong", nameEn: "Jiadong Township", nameZh: "佳冬鄉", nameJa: "佳冬郷", nameKo: "가동향" },
      { code: "liuqiu", nameEn: "Liuqiu Township", nameZh: "琉球鄉", nameJa: "琉球郷", nameKo: "유구향" },
      { code: "checheng", nameEn: "Checheng Township", nameZh: "車城鄉", nameJa: "車城郷", nameKo: "차성향" },
      { code: "manzhou", nameEn: "Manzhou Township", nameZh: "滿州鄉", nameJa: "満州郷", nameKo: "만주향" },
      { code: "fangshan", nameEn: "Fangshan Township", nameZh: "枋山鄉", nameJa: "枋山郷", nameKo: "방산향" },
      { code: "sandimen", nameEn: "Sandimen Township", nameZh: "三地門鄉", nameJa: "三地門郷", nameKo: "삼지문향" },
      { code: "wutai", nameEn: "Wutai Township", nameZh: "霧臺鄉", nameJa: "霧台郷", nameKo: "무대향" },
      { code: "majia", nameEn: "Majia Township", nameZh: "瑪家鄉", nameJa: "瑪家郷", nameKo: "마가향" },
      { code: "taiwu", nameEn: "Taiwu Township", nameZh: "泰武鄉", nameJa: "泰武郷", nameKo: "태무향" },
      { code: "laiyi", nameEn: "Laiyi Township", nameZh: "來義鄉", nameJa: "來義郷", nameKo: "래의향" },
      { code: "chunri", nameEn: "Chunri Township", nameZh: "春日鄉", nameJa: "春日郷", nameKo: "춘일향" },
      { code: "shizi", nameEn: "Shizi Township", nameZh: "獅子鄉", nameJa: "獅子郷", nameKo: "사자향" },
      { code: "mudan", nameEn: "Mudan Township", nameZh: "牡丹鄉", nameJa: "牡丹郷", nameKo: "모란향" },
    ],
    yilan_county: [
      { code: "yilan", nameEn: "Yilan City", nameZh: "宜蘭市", nameJa: "宜蘭市", nameKo: "의란시" },
      { code: "luodong", nameEn: "Luodong Township", nameZh: "羅東鎮", nameJa: "羅東鎮", nameKo: "라동진" },
      { code: "suao", nameEn: "Su'ao Township", nameZh: "蘇澳鎮", nameJa: "蘇澳鎮", nameKo: "소오진" },
      { code: "toucheng", nameEn: "Toucheng Township", nameZh: "頭城鎮", nameJa: "頭城鎮", nameKo: "두성진" },
      { code: "jiaoxi", nameEn: "Jiaoxi Township", nameZh: "礁溪鄉", nameJa: "礁溪郷", nameKo: "초계향" },
      { code: "zhuangwei", nameEn: "Zhuangwei Township", nameZh: "壯圍鄉", nameJa: "壮囲郷", nameKo: "장위향" },
      { code: "yuanshan", nameEn: "Yuanshan Township", nameZh: "員山鄉", nameJa: "員山郷", nameKo: "원산향" },
      { code: "dongshan_yl", nameEn: "Dongshan Township", nameZh: "冬山鄉", nameJa: "冬山郷", nameKo: "동산향" },
      { code: "wujie", nameEn: "Wujie Township", nameZh: "五結鄉", nameJa: "五結郷", nameKo: "오결향" },
      { code: "sanxing", nameEn: "Sanxing Township", nameZh: "三星鄉", nameJa: "三星郷", nameKo: "삼성향" },
      { code: "datong_yl", nameEn: "Datong Township", nameZh: "大同鄉", nameJa: "大同郷", nameKo: "대동향" },
      { code: "nanao", nameEn: "Nan'ao Township", nameZh: "南澳鄉", nameJa: "南澳郷", nameKo: "남오향" },
    ],
    hualien_county: [
      { code: "hualien", nameEn: "Hualien City", nameZh: "花蓮市", nameJa: "花蓮市", nameKo: "화련시" },
      { code: "fenglin", nameEn: "Fenglin Township", nameZh: "鳳林鎮", nameJa: "鳳林鎮", nameKo: "봉림진" },
      { code: "yuli", nameEn: "Yuli Township", nameZh: "玉里鎮", nameJa: "玉里鎮", nameKo: "옥리진" },
      { code: "xincheng", nameEn: "Xincheng Township", nameZh: "新城鄉", nameJa: "新城郷", nameKo: "신성향" },
      { code: "ji_an", nameEn: "Ji'an Township", nameZh: "吉安鄉", nameJa: "吉安郷", nameKo: "길안향" },
      { code: "shoufeng", nameEn: "Shoufeng Township", nameZh: "壽豐鄉", nameJa: "壽豊郷", nameKo: "수풍향" },
      { code: "guangfu", nameEn: "Guangfu Township", nameZh: "光復鄉", nameJa: "光復郷", nameKo: "광복향" },
      { code: "fengbin", nameEn: "Fengbin Township", nameZh: "豐濱鄉", nameJa: "豊浜郷", nameKo: "풍빈향" },
      { code: "ruisui", nameEn: "Ruisui Township", nameZh: "瑞穗鄉", nameJa: "瑞穂郷", nameKo: "서수향" },
      { code: "fuli", nameEn: "Fuli Township", nameZh: "富里鄉", nameJa: "富里郷", nameKo: "부리향" },
      { code: "xiulin", nameEn: "Xiulin Township", nameZh: "秀林鄉", nameJa: "秀林郷", nameKo: "수림향" },
      { code: "wanrong", nameEn: "Wanrong Township", nameZh: "萬榮鄉", nameJa: "萬榮郷", nameKo: "만영향" },
      { code: "zhuoxi", nameEn: "Zhuoxi Township", nameZh: "卓溪鄉", nameJa: "卓渓郷", nameKo: "탁계향" },
    ],
    taitung_county: [
      { code: "taitung", nameEn: "Taitung City", nameZh: "臺東市", nameJa: "台東市", nameKo: "태동시" },
      { code: "chenggong", nameEn: "Chenggong Township", nameZh: "成功鎮", nameJa: "成功鎮", nameKo: "성공진" },
      { code: "guanshan", nameEn: "Guanshan Township", nameZh: "關山鎮", nameJa: "関山鎮", nameKo: "관산진" },
      { code: "beinan", nameEn: "Beinan Township", nameZh: "卑南鄉", nameJa: "卑南郷", nameKo: "비남향" },
      { code: "dawu", nameEn: "Dawu Township", nameZh: "大武鄉", nameJa: "大武郷", nameKo: "대무향" },
      { code: "taimali", nameEn: "Taimali Township", nameZh: "太麻里鄉", nameJa: "太麻里郷", nameKo: "태마리향" },
      { code: "donghe", nameEn: "Donghe Township", nameZh: "東河鄉", nameJa: "東河郷", nameKo: "동하향" },
      { code: "changbin", nameEn: "Changbin Township", nameZh: "長濱鄉", nameJa: "長浜郷", nameKo: "장빈향" },
      { code: "luye", nameEn: "Luye Township", nameZh: "鹿野鄉", nameJa: "鹿野郷", nameKo: "녹야향" },
      { code: "chishang", nameEn: "Chishang Township", nameZh: "池上鄉", nameJa: "池上郷", nameKo: "지상향" },
      { code: "green_island", nameEn: "Green Island", nameZh: "綠島鄉", nameJa: "緑島郷", nameKo: "녹도향" },
      { code: "yanping", nameEn: "Yanping Township", nameZh: "延平鄉", nameJa: "延平郷", nameKo: "연평향" },
      { code: "haiduan", nameEn: "Haiduan Township", nameZh: "海端鄉", nameJa: "海端郷", nameKo: "해단향" },
      { code: "daren", nameEn: "Daren Township", nameZh: "達仁鄉", nameJa: "達仁郷", nameKo: "달인향" },
      { code: "jinfeng", nameEn: "Jinfeng Township", nameZh: "金峰鄉", nameJa: "金峰郷", nameKo: "금봉향" },
      { code: "orchid_island", nameEn: "Orchid Island", nameZh: "蘭嶼鄉", nameJa: "蘭嶼郷", nameKo: "난서향" },
    ],
    penghu_county: [
      { code: "magong", nameEn: "Magong City", nameZh: "馬公市", nameJa: "馬公市", nameKo: "마공시" },
      { code: "huxi", nameEn: "Huxi Township", nameZh: "湖西鄉", nameJa: "湖西郷", nameKo: "호서향" },
      { code: "baisha", nameEn: "Baisha Township", nameZh: "白沙鄉", nameJa: "白沙郷", nameKo: "백사향" },
      { code: "xiyu", nameEn: "Xiyu Township", nameZh: "西嶼鄉", nameJa: "西嶼郷", nameKo: "서서향" },
      { code: "wangan", nameEn: "Wang'an Township", nameZh: "望安鄉", nameJa: "望安郷", nameKo: "망안향" },
      { code: "qimei", nameEn: "Qimei Township", nameZh: "七美鄉", nameJa: "七美郷", nameKo: "칠미향" },
    ],
    kinmen_county: [
      { code: "jincheng", nameEn: "Jincheng Township", nameZh: "金城鎮", nameJa: "金城鎮", nameKo: "금성진" },
      { code: "jinhu", nameEn: "Jinhu Township", nameZh: "金湖鎮", nameJa: "金湖鎮", nameKo: "금호진" },
      { code: "jinsha", nameEn: "Jinsha Township", nameZh: "金沙鎮", nameJa: "金沙鎮", nameKo: "금사진" },
      { code: "jinning", nameEn: "Jinning Township", nameZh: "金寧鄉", nameJa: "金寧郷", nameKo: "금녕향" },
      { code: "lieyu", nameEn: "Lieyu Township", nameZh: "烈嶼鄉", nameJa: "烈嶼郷", nameKo: "열서향" },
      { code: "wuqiu", nameEn: "Wuqiu Township", nameZh: "烏坵鄉", nameJa: "烏坵郷", nameKo: "오구향" },
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
