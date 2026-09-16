import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import type { MunicipalityResult, MunicipalityPollResponse, PollSummary, Candidate, MatchedDiff } from '$lib/types';
import AdmZip from 'adm-zip';

const MUNICIPALITY_CODES: { code: string; name: string }[] = [
  {
    "code": "0114",
    "name": "Upplands Väsby"
  },
  {
    "code": "0115",
    "name": "Vallentuna"
  },
  {
    "code": "0117",
    "name": "Österåker"
  },
  {
    "code": "0120",
    "name": "Värmdö"
  },
  {
    "code": "0123",
    "name": "Järfälla"
  },
  {
    "code": "0125",
    "name": "Ekerö"
  },
  {
    "code": "0126",
    "name": "Huddinge"
  },
  {
    "code": "0127",
    "name": "Botkyrka"
  },
  {
    "code": "0128",
    "name": "Salem"
  },
  {
    "code": "0136",
    "name": "Haninge"
  },
  {
    "code": "0138",
    "name": "Tyresö"
  },
  {
    "code": "0139",
    "name": "Upplands-Bro"
  },
  {
    "code": "0140",
    "name": "Nykvarn"
  },
  {
    "code": "0160",
    "name": "Täby"
  },
  {
    "code": "0162",
    "name": "Danderyd"
  },
  {
    "code": "0163",
    "name": "Sollentuna"
  },
  {
    "code": "0180",
    "name": "Stockholm"
  },
  {
    "code": "0181",
    "name": "Södertälje"
  },
  {
    "code": "0182",
    "name": "Nacka"
  },
  {
    "code": "0183",
    "name": "Sundbyberg"
  },
  {
    "code": "0184",
    "name": "Solna"
  },
  {
    "code": "0186",
    "name": "Lidingö"
  },
  {
    "code": "0187",
    "name": "Vaxholm"
  },
  {
    "code": "0188",
    "name": "Norrtälje"
  },
  {
    "code": "0191",
    "name": "Sigtuna"
  },
  {
    "code": "0192",
    "name": "Nynäshamn"
  },
  {
    "code": "0305",
    "name": "Håbo"
  },
  {
    "code": "0319",
    "name": "Älvkarleby"
  },
  {
    "code": "0330",
    "name": "Knivsta"
  },
  {
    "code": "0331",
    "name": "Heby"
  },
  {
    "code": "0360",
    "name": "Tierp"
  },
  {
    "code": "0380",
    "name": "Uppsala"
  },
  {
    "code": "0381",
    "name": "Enköping"
  },
  {
    "code": "0382",
    "name": "Östhammar"
  },
  {
    "code": "0428",
    "name": "Vingåker"
  },
  {
    "code": "0461",
    "name": "Gnesta"
  },
  {
    "code": "0480",
    "name": "Nyköping"
  },
  {
    "code": "0481",
    "name": "Oxelösund"
  },
  {
    "code": "0482",
    "name": "Flen"
  },
  {
    "code": "0483",
    "name": "Katrineholm"
  },
  {
    "code": "0484",
    "name": "Eskilstuna"
  },
  {
    "code": "0486",
    "name": "Strängnäs"
  },
  {
    "code": "0488",
    "name": "Trosa"
  },
  {
    "code": "0509",
    "name": "Ödeshög"
  },
  {
    "code": "0512",
    "name": "Ydre"
  },
  {
    "code": "0513",
    "name": "Kinda"
  },
  {
    "code": "0560",
    "name": "Boxholm"
  },
  {
    "code": "0561",
    "name": "Åtvidaberg"
  },
  {
    "code": "0562",
    "name": "Finspång"
  },
  {
    "code": "0563",
    "name": "Valdemarsvik"
  },
  {
    "code": "0580",
    "name": "Linköping"
  },
  {
    "code": "0581",
    "name": "Norrköping"
  },
  {
    "code": "0582",
    "name": "Söderköping"
  },
  {
    "code": "0583",
    "name": "Motala"
  },
  {
    "code": "0584",
    "name": "Vadstena"
  },
  {
    "code": "0586",
    "name": "Mjölby"
  },
  {
    "code": "0604",
    "name": "Aneby"
  },
  {
    "code": "0617",
    "name": "Gnosjö"
  },
  {
    "code": "0642",
    "name": "Mullsjö"
  },
  {
    "code": "0643",
    "name": "Habo"
  },
  {
    "code": "0662",
    "name": "Gislaved"
  },
  {
    "code": "0665",
    "name": "Vaggeryd"
  },
  {
    "code": "0680",
    "name": "Jönköping"
  },
  {
    "code": "0682",
    "name": "Nässjö"
  },
  {
    "code": "0683",
    "name": "Värnamo"
  },
  {
    "code": "0684",
    "name": "Sävsjö"
  },
  {
    "code": "0685",
    "name": "Vetlanda"
  },
  {
    "code": "0686",
    "name": "Eksjö"
  },
  {
    "code": "0687",
    "name": "Tranås"
  },
  {
    "code": "0760",
    "name": "Uppvidinge"
  },
  {
    "code": "0761",
    "name": "Lessebo"
  },
  {
    "code": "0763",
    "name": "Tingsryd"
  },
  {
    "code": "0764",
    "name": "Alvesta"
  },
  {
    "code": "0765",
    "name": "Älmhult"
  },
  {
    "code": "0767",
    "name": "Markaryd"
  },
  {
    "code": "0780",
    "name": "Växjö"
  },
  {
    "code": "0781",
    "name": "Ljungby"
  },
  {
    "code": "0821",
    "name": "Högsby"
  },
  {
    "code": "0834",
    "name": "Torsås"
  },
  {
    "code": "0840",
    "name": "Mörbylånga"
  },
  {
    "code": "0860",
    "name": "Hultsfred"
  },
  {
    "code": "0861",
    "name": "Mönsterås"
  },
  {
    "code": "0862",
    "name": "Emmaboda"
  },
  {
    "code": "0880",
    "name": "Kalmar"
  },
  {
    "code": "0881",
    "name": "Nybro"
  },
  {
    "code": "0882",
    "name": "Oskarshamn"
  },
  {
    "code": "0883",
    "name": "Västervik"
  },
  {
    "code": "0884",
    "name": "Vimmerby"
  },
  {
    "code": "0885",
    "name": "Borgholm"
  },
  {
    "code": "0980",
    "name": "Gotland"
  },
  {
    "code": "1060",
    "name": "Olofström"
  },
  {
    "code": "1080",
    "name": "Karlskrona"
  },
  {
    "code": "1081",
    "name": "Ronneby"
  },
  {
    "code": "1082",
    "name": "Karlshamn"
  },
  {
    "code": "1083",
    "name": "Sölvesborg"
  },
  {
    "code": "1214",
    "name": "Svalöv"
  },
  {
    "code": "1230",
    "name": "Staffanstorp"
  },
  {
    "code": "1231",
    "name": "Burlöv"
  },
  {
    "code": "1233",
    "name": "Vellinge"
  },
  {
    "code": "1256",
    "name": "Östra Göinge"
  },
  {
    "code": "1257",
    "name": "Örkelljunga"
  },
  {
    "code": "1260",
    "name": "Bjuv"
  },
  {
    "code": "1261",
    "name": "Kävlinge"
  },
  {
    "code": "1262",
    "name": "Lomma"
  },
  {
    "code": "1263",
    "name": "Svedala"
  },
  {
    "code": "1264",
    "name": "Skurup"
  },
  {
    "code": "1265",
    "name": "Sjöbo"
  },
  {
    "code": "1266",
    "name": "Hörby"
  },
  {
    "code": "1267",
    "name": "Höör"
  },
  {
    "code": "1270",
    "name": "Tomelilla"
  },
  {
    "code": "1272",
    "name": "Bromölla"
  },
  {
    "code": "1273",
    "name": "Osby"
  },
  {
    "code": "1275",
    "name": "Perstorp"
  },
  {
    "code": "1276",
    "name": "Klippan"
  },
  {
    "code": "1277",
    "name": "Åstorp"
  },
  {
    "code": "1278",
    "name": "Båstad"
  },
  {
    "code": "1280",
    "name": "Malmö"
  },
  {
    "code": "1281",
    "name": "Lund"
  },
  {
    "code": "1282",
    "name": "Landskrona"
  },
  {
    "code": "1283",
    "name": "Helsingborg"
  },
  {
    "code": "1284",
    "name": "Höganäs"
  },
  {
    "code": "1285",
    "name": "Eslöv"
  },
  {
    "code": "1286",
    "name": "Ystad"
  },
  {
    "code": "1287",
    "name": "Trelleborg"
  },
  {
    "code": "1290",
    "name": "Kristianstad"
  },
  {
    "code": "1291",
    "name": "Simrishamn"
  },
  {
    "code": "1292",
    "name": "Ängelholm"
  },
  {
    "code": "1293",
    "name": "Hässleholm"
  },
  {
    "code": "1315",
    "name": "Hylte"
  },
  {
    "code": "1380",
    "name": "Halmstad"
  },
  {
    "code": "1381",
    "name": "Laholm"
  },
  {
    "code": "1382",
    "name": "Falkenberg"
  },
  {
    "code": "1383",
    "name": "Varberg"
  },
  {
    "code": "1384",
    "name": "Kungsbacka"
  },
  {
    "code": "1401",
    "name": "Härryda"
  },
  {
    "code": "1402",
    "name": "Partille"
  },
  {
    "code": "1407",
    "name": "Öckerö"
  },
  {
    "code": "1415",
    "name": "Stenungsund"
  },
  {
    "code": "1419",
    "name": "Tjörn"
  },
  {
    "code": "1421",
    "name": "Orust"
  },
  {
    "code": "1427",
    "name": "Sotenäs"
  },
  {
    "code": "1430",
    "name": "Munkedal"
  },
  {
    "code": "1435",
    "name": "Tanum"
  },
  {
    "code": "1438",
    "name": "Dals-Ed"
  },
  {
    "code": "1439",
    "name": "Färgelanda"
  },
  {
    "code": "1440",
    "name": "Ale"
  },
  {
    "code": "1441",
    "name": "Lerum"
  },
  {
    "code": "1442",
    "name": "Vårgårda"
  },
  {
    "code": "1443",
    "name": "Bollebygd"
  },
  {
    "code": "1444",
    "name": "Grästorp"
  },
  {
    "code": "1445",
    "name": "Essunga"
  },
  {
    "code": "1446",
    "name": "Karlsborg"
  },
  {
    "code": "1447",
    "name": "Gullspång"
  },
  {
    "code": "1452",
    "name": "Tranemo"
  },
  {
    "code": "1460",
    "name": "Bengtsfors"
  },
  {
    "code": "1461",
    "name": "Mellerud"
  },
  {
    "code": "1462",
    "name": "Lilla Edet"
  },
  {
    "code": "1463",
    "name": "Mark"
  },
  {
    "code": "1465",
    "name": "Svenljunga"
  },
  {
    "code": "1466",
    "name": "Herrljunga"
  },
  {
    "code": "1470",
    "name": "Vara"
  },
  {
    "code": "1471",
    "name": "Götene"
  },
  {
    "code": "1472",
    "name": "Tibro"
  },
  {
    "code": "1473",
    "name": "Töreboda"
  },
  {
    "code": "1480",
    "name": "Göteborg"
  },
  {
    "code": "1481",
    "name": "Mölndal"
  },
  {
    "code": "1482",
    "name": "Kungälv"
  },
  {
    "code": "1484",
    "name": "Lysekil"
  },
  {
    "code": "1485",
    "name": "Uddevalla"
  },
  {
    "code": "1486",
    "name": "Strömstad"
  },
  {
    "code": "1487",
    "name": "Vänersborg"
  },
  {
    "code": "1488",
    "name": "Trollhättan"
  },
  {
    "code": "1489",
    "name": "Alingsås"
  },
  {
    "code": "1490",
    "name": "Borås"
  },
  {
    "code": "1491",
    "name": "Ulricehamn"
  },
  {
    "code": "1492",
    "name": "Åmål"
  },
  {
    "code": "1493",
    "name": "Mariestad"
  },
  {
    "code": "1494",
    "name": "Lidköping"
  },
  {
    "code": "1495",
    "name": "Skara"
  },
  {
    "code": "1496",
    "name": "Skövde"
  },
  {
    "code": "1497",
    "name": "Hjo"
  },
  {
    "code": "1498",
    "name": "Tidaholm"
  },
  {
    "code": "1499",
    "name": "Falköping"
  },
  {
    "code": "1715",
    "name": "Kil"
  },
  {
    "code": "1730",
    "name": "Eda"
  },
  {
    "code": "1737",
    "name": "Torsby"
  },
  {
    "code": "1760",
    "name": "Storfors"
  },
  {
    "code": "1761",
    "name": "Hammarö"
  },
  {
    "code": "1762",
    "name": "Munkfors"
  },
  {
    "code": "1763",
    "name": "Forshaga"
  },
  {
    "code": "1764",
    "name": "Grums"
  },
  {
    "code": "1765",
    "name": "Årjäng"
  },
  {
    "code": "1766",
    "name": "Sunne"
  },
  {
    "code": "1780",
    "name": "Karlstad"
  },
  {
    "code": "1781",
    "name": "Kristinehamn"
  },
  {
    "code": "1782",
    "name": "Filipstad"
  },
  {
    "code": "1783",
    "name": "Hagfors"
  },
  {
    "code": "1784",
    "name": "Arvika"
  },
  {
    "code": "1785",
    "name": "Säffle"
  },
  {
    "code": "1814",
    "name": "Lekeberg"
  },
  {
    "code": "1860",
    "name": "Laxå"
  },
  {
    "code": "1861",
    "name": "Hallsberg"
  },
  {
    "code": "1862",
    "name": "Degerfors"
  },
  {
    "code": "1863",
    "name": "Hällefors"
  },
  {
    "code": "1864",
    "name": "Ljusnarsberg"
  },
  {
    "code": "1880",
    "name": "Örebro"
  },
  {
    "code": "1881",
    "name": "Kumla"
  },
  {
    "code": "1882",
    "name": "Askersund"
  },
  {
    "code": "1883",
    "name": "Karlskoga"
  },
  {
    "code": "1884",
    "name": "Nora"
  },
  {
    "code": "1885",
    "name": "Lindesberg"
  },
  {
    "code": "1904",
    "name": "Skinnskatteberg"
  },
  {
    "code": "1907",
    "name": "Surahammar"
  },
  {
    "code": "1960",
    "name": "Kungsör"
  },
  {
    "code": "1961",
    "name": "Hallstahammar"
  },
  {
    "code": "1962",
    "name": "Norberg"
  },
  {
    "code": "1980",
    "name": "Västerås"
  },
  {
    "code": "1981",
    "name": "Sala"
  },
  {
    "code": "1982",
    "name": "Fagersta"
  },
  {
    "code": "1983",
    "name": "Köping"
  },
  {
    "code": "1984",
    "name": "Arboga"
  },
  {
    "code": "2021",
    "name": "Vansbro"
  },
  {
    "code": "2023",
    "name": "Malung-Sälen"
  },
  {
    "code": "2026",
    "name": "Gagnef"
  },
  {
    "code": "2029",
    "name": "Leksand"
  },
  {
    "code": "2031",
    "name": "Rättvik"
  },
  {
    "code": "2034",
    "name": "Orsa"
  },
  {
    "code": "2039",
    "name": "Älvdalen"
  },
  {
    "code": "2061",
    "name": "Smedjebacken"
  },
  {
    "code": "2062",
    "name": "Mora"
  },
  {
    "code": "2080",
    "name": "Falun"
  },
  {
    "code": "2081",
    "name": "Borlänge"
  },
  {
    "code": "2082",
    "name": "Säter"
  },
  {
    "code": "2083",
    "name": "Hedemora"
  },
  {
    "code": "2084",
    "name": "Avesta"
  },
  {
    "code": "2085",
    "name": "Ludvika"
  },
  {
    "code": "2101",
    "name": "Ockelbo"
  },
  {
    "code": "2104",
    "name": "Hofors"
  },
  {
    "code": "2121",
    "name": "Ovanåker"
  },
  {
    "code": "2132",
    "name": "Nordanstig"
  },
  {
    "code": "2161",
    "name": "Ljusdal"
  },
  {
    "code": "2180",
    "name": "Gävle"
  },
  {
    "code": "2181",
    "name": "Sandviken"
  },
  {
    "code": "2182",
    "name": "Söderhamn"
  },
  {
    "code": "2183",
    "name": "Bollnäs"
  },
  {
    "code": "2184",
    "name": "Hudiksvall"
  },
  {
    "code": "2260",
    "name": "Ånge"
  },
  {
    "code": "2262",
    "name": "Timrå"
  },
  {
    "code": "2280",
    "name": "Härnösand"
  },
  {
    "code": "2281",
    "name": "Sundsvall"
  },
  {
    "code": "2282",
    "name": "Kramfors"
  },
  {
    "code": "2283",
    "name": "Sollefteå"
  },
  {
    "code": "2284",
    "name": "Örnsköldsvik"
  },
  {
    "code": "2303",
    "name": "Ragunda"
  },
  {
    "code": "2305",
    "name": "Bräcke"
  },
  {
    "code": "2309",
    "name": "Krokom"
  },
  {
    "code": "2313",
    "name": "Strömsund"
  },
  {
    "code": "2321",
    "name": "Åre"
  },
  {
    "code": "2326",
    "name": "Berg"
  },
  {
    "code": "2361",
    "name": "Härjedalen"
  },
  {
    "code": "2380",
    "name": "Östersund"
  },
  {
    "code": "2401",
    "name": "Nordmaling"
  },
  {
    "code": "2403",
    "name": "Bjurholm"
  },
  {
    "code": "2404",
    "name": "Vindeln"
  },
  {
    "code": "2409",
    "name": "Robertsfors"
  },
  {
    "code": "2417",
    "name": "Norsjö"
  },
  {
    "code": "2418",
    "name": "Malå"
  },
  {
    "code": "2421",
    "name": "Storuman"
  },
  {
    "code": "2422",
    "name": "Sorsele"
  },
  {
    "code": "2425",
    "name": "Dorotea"
  },
  {
    "code": "2460",
    "name": "Vännäs"
  },
  {
    "code": "2462",
    "name": "Vilhelmina"
  },
  {
    "code": "2463",
    "name": "Åsele"
  },
  {
    "code": "2480",
    "name": "Umeå"
  },
  {
    "code": "2481",
    "name": "Lycksele"
  },
  {
    "code": "2482",
    "name": "Skellefteå"
  },
  {
    "code": "2505",
    "name": "Arvidsjaur"
  },
  {
    "code": "2506",
    "name": "Arjeplog"
  },
  {
    "code": "2510",
    "name": "Jokkmokk"
  },
  {
    "code": "2513",
    "name": "Överkalix"
  },
  {
    "code": "2514",
    "name": "Kalix"
  },
  {
    "code": "2518",
    "name": "Övertorneå"
  },
  {
    "code": "2521",
    "name": "Pajala"
  },
  {
    "code": "2523",
    "name": "Gällivare"
  },
  {
    "code": "2560",
    "name": "Älvsbyn"
  },
  {
    "code": "2580",
    "name": "Luleå"
  },
  {
    "code": "2581",
    "name": "Piteå"
  },
  {
    "code": "2582",
    "name": "Boden"
  },
  {
    "code": "2583",
    "name": "Haparanda"
  },
  {
    "code": "2584",
    "name": "Kiruna"
  }
];

import { simulateElectedCandidates, type ValkretsCandidatesMap } from '$lib/server/candidates';

let mpRegisteredMunicipalitiesCache: { timestamp: number; codes: Set<string>; candidates: Map<string, ValkretsCandidatesMap> } | null = null;

async function getMpRegisteredMunicipalities(): Promise<{ codes: Set<string>; candidates: Map<string, ValkretsCandidatesMap> }> {
  const now = Date.now();
  if (mpRegisteredMunicipalitiesCache && (now - mpRegisteredMunicipalitiesCache.timestamp) < 3600 * 1000) {
    return mpRegisteredMunicipalitiesCache;
  }

  const set = new Set<string>();
  const candidatesMap = new Map<string, ValkretsCandidatesMap>();

  const years = ['2026', '2022'];
  for (const year of years) {
    try {
      const url = `https://data.val.se/filer/val${year}/parti/kandidaturer.csv`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const text = await res.text();
        const lines = text.split(/\r\n|\n|\r/);
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(';');
          if (cols[0] && cols[0].endsWith('KF') && (cols[5] === 'Miljöpartiet de gröna' || cols[6] === 'MP' || cols[7] === '0055')) {
            const mCode = cols[1];
            const vkCode = cols[3] || 'default';
            const vkName = cols[4] || '';
            const order = parseInt(cols[11], 10) || 999;
            const name = cols[16];
            const age = cols[17];
            const info = cols[20];
            if (mCode && name) {
              set.add(mCode);
              if (!candidatesMap.has(mCode)) candidatesMap.set(mCode, new Map());
              const vkMap = candidatesMap.get(mCode)!;
              if (!vkMap.has(vkCode)) vkMap.set(vkCode, { name: vkName, candidates: [] });
              vkMap.get(vkCode)!.candidates.push({ order, name, age, info });
            }
          }
        }
        if (set.size > 0) break;
      }
    } catch (e) {
      // Ignore fallback
    }
  }

  for (const vkMap of candidatesMap.values()) {
    for (const vk of vkMap.values()) {
      vk.candidates.sort((a, b) => a.order - b.order);
    }
  }

  mpRegisteredMunicipalitiesCache = { timestamp: now, codes: set, candidates: candidatesMap };
  return { codes: set, candidates: candidatesMap };
}

let activeYearCache: { year: string; timestamp: number } | null = null;

async function detectActiveYear(phase: 'preliminary' | 'final'): Promise<string> {
  const now = Date.now();
  if (activeYearCache && (now - activeYearCache.timestamp) < 600 * 1000) {
    return activeYearCache.year;
  }
  const filePrefix = phase === 'final' ? 'slutlig' : 'preliminar';
  try {
    const res = await fetch(`https://resultat.val.se/resultatfiler/val2026/p/kf/Val_2026_${filePrefix}_0180_KF.zip`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) {
      activeYearCache = { year: '2026', timestamp: now };
      return '2026';
    }
  } catch (e) {
    // 2026 not ready
  }
  activeYearCache = { year: '2022', timestamp: now };
  return '2022';
}

async function fetchLiveMunicipalityData(
  code: string, 
  nameFallback: string, 
  phase: 'preliminary' | 'final',
  targetYear: string,
  registeredMpSet: Set<string>,
  mpCandidatesMap: Map<string, ValkretsCandidatesMap>
): Promise<{ result: MunicipalityResult; year: string } | null> {
  const filePrefix = phase === 'final' ? 'slutlig' : 'preliminar';
  const yearsToTry = targetYear === '2026' ? ['2026', '2022'] : ['2022'];
  let response: Response | null = null;
  let usedYear = targetYear;

  for (const year of yearsToTry) {
    const url = `https://resultat.val.se/resultatfiler/val${year}/p/kf/Val_${year}_${filePrefix}_${code}_KF.zip`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (res.ok) {
        response = res;
        usedYear = year;
        break;
      }
    } catch (e) {
      // Ignore network errors during fallback attempt
    }
  }

  if (!response || !response.ok) {
    return null;
  }

  const arrayBuffer = await response.arrayBuffer();
  const zip = new AdmZip(Buffer.from(arrayBuffer));
  
  const mandatFilename = `Val_${usedYear}_${filePrefix}_mandatfordelning_${code}_KF.json`;
  const zipEntry = zip.getEntry(mandatFilename);
  
  if (!zipEntry) {
    return null;
  }

  const jsonText = zipEntry.getData().toString('utf8');
  const data = JSON.parse(jsonText);
  const vo = data.valomrade || {};

  let mpMandates = 0;
  let mpMandatesChange = 0;
  let mpVotesPct = 0;
  let mpVotesPctChange = 0;
  let mpVotesCount = 0;
  let mpVotesCountChange = 0;

  const partyMandates: { code: string; name: string; mandates: number; mandatesChange?: number }[] = [];

  for (const p of vo.mandatfordelning?.partiLista || []) {
    const mandates = p.antalMandat || 0;
    const pCode = p.partiforkortning || p.partikod || 'ÖVR';
    const pName = p.partinamn || pCode;
    const mandatesChange = p.forandringAntalMandat ?? p.forandringMandat ?? 0;

    if (p.partiforkortning === 'MP' || p.partikod === '0055') {
      mpMandates = mandates;
      mpMandatesChange = mandatesChange;
    }

    if (mandates > 0) {
      partyMandates.push({
        code: pCode,
        name: pName,
        mandates,
        mandatesChange
      });
    }
  }

  partyMandates.sort((a, b) => b.mandates - a.mandates);

  const allPartyVotes: { code: string; votes: number }[] = [];
  if (vo.rostfordelning?.rosterPaverkaMandat?.partiRoster) {
    for (const pr of vo.rostfordelning.rosterPaverkaMandat.partiRoster) {
      const pCode = pr.partiforkortning || pr.partikod || 'ÖVR';
      const votes = pr.antalRoster || 0;
      allPartyVotes.push({ code: pCode, votes });

      if (pr.partiforkortning === 'MP' || pr.partikod === '0055') {
        mpVotesPct = pr.andelRoster !== undefined ? Number(pr.andelRoster) : 0;
        mpVotesPctChange = pr.forandringAndelRoster !== undefined ? Number(pr.forandringAndelRoster) : 0;
        mpVotesCount = pr.antalRoster || 0;
        mpVotesCountChange = pr.forandringAntalRoster ?? 0;
      }
    }
  }

  let totalValidVotes = vo.totaltAntalRoster || 0;
  if (!totalValidVotes && vo.rostfordelning?.rosterPaverkaMandat?.partiRoster) {
    totalValidVotes = vo.rostfordelning.rosterPaverkaMandat.partiRoster.reduce(
      (sum: number, p: any) => sum + (p.antalRoster || 0),
      0
    );
  }
  if (!totalValidVotes && mpVotesCount > 0 && mpVotesPct > 0) {
    totalValidVotes = Math.round((mpVotesCount / mpVotesPct) * 100);
  }

  // Municipal threshold is either 2.0% (single constituency) or 3.0% (multiple constituencies)
  const thresholdPct = vo.valomradessparrProcent ? Number(vo.valomradessparrProcent) : 2.0;
  const thresholdVotesCount = Math.ceil(totalValidVotes * (thresholdPct / 100));
  const votesDiffFromThreshold = mpVotesCount - thresholdVotesCount;

  // Preserve official mandate allocation from Valmyndigheten if mandates were won
  const hasMandate = mpMandates > 0;
  const isOverThreshold = hasMandate || (mpVotesPct >= thresholdPct);

  // Calculate Sainte-Laguë quotients across all parties
  interface QuotientItem {
    code: string;
    quotient: number;
  }

  const totalMandates = vo.totaltAntalMandat || 31;
  const maxMandatesToTest = Math.max(100, totalMandates + 10);
  const quotients: QuotientItem[] = [];
  for (const pv of allPartyVotes) {
    for (let k = 1; k <= maxMandatesToTest; k++) {
      const divisor = k === 1 ? 1.2 : (2 * (k - 1) + 1);
      quotients.push({ code: pv.code, quotient: pv.votes / divisor });
    }
  }
  quotients.sort((a, b) => b.quotient - a.quotient);

  const winnerQuotients = quotients.slice(0, totalMandates);
  const loserQuotients = quotients.slice(totalMandates);

  const otherWinners = winnerQuotients.filter((q) => q.code !== 'MP');
  const otherLosers = loserQuotients.filter((q) => q.code !== 'MP');

  const targetWinnerQ = otherWinners[otherWinners.length - 1]?.quotient || winnerQuotients[winnerQuotients.length - 1]?.quotient || 0;

  // Votes needed for MP's NEXT mandate
  const mpCurrentCount = mpMandates;
  const mpNextIndex = mpCurrentCount + 1;
  const mpNextDivisor = mpNextIndex === 1 ? 1.2 : (2 * (mpNextIndex - 1) + 1);

  let votesToNextMandate = Math.max(1, Math.ceil(targetWinnerQ * mpNextDivisor - mpVotesCount));
  if (mpCurrentCount === 0) {
    const votesToSparr = Math.max(0, thresholdVotesCount - mpVotesCount);
    votesToNextMandate = Math.max(votesToNextMandate, votesToSparr);
  }

  // Votes MP can lose before LOSING sista mandatet
  let votesToLoseMandate = 0;
  if (mpCurrentCount >= 1) {
    const mpLastDivisor = mpCurrentCount === 1 ? 1.2 : (2 * (mpCurrentCount - 1) + 1);
    const runnerUpQ = otherLosers[0]?.quotient || loserQuotients[0]?.quotient || 0;

    const voteDropToLoseQuotient = Math.max(1, Math.floor(mpVotesCount - runnerUpQ * mpLastDivisor));
    const voteDropToLoseSparr = Math.max(1, mpVotesCount - thresholdVotesCount);

    votesToLoseMandate = Math.min(voteDropToLoseQuotient, voteDropToLoseSparr);
  }

  const previousMandates = mpMandates - mpMandatesChange;
  const isNewRegionWithMandate = hasMandate && previousMandates <= 0;

  const districtsCounted = vo.antalValdistriktRaknade || 0;
  const districtsTotal = vo.antalValdistriktSomSkaRaknas || 0;
  const hasRegisteredMpList = registeredMpSet.size > 0 ? registeredMpSet.has(code) : true;
  const vkMap = mpCandidatesMap.get(code);
  const candidates = hasRegisteredMpList ? simulateElectedCandidates(vkMap, mpMandates) : undefined;

  const diffVsPrevious: MatchedDiff = {
    finalVotes: mpVotesCount,
    finalVotesPct: mpVotesPct,
    comparisonVotes: mpVotesCount - mpVotesCountChange,
    comparisonVotesPct: Number((mpVotesPct - mpVotesPctChange).toFixed(2)),
    votesDiff: mpVotesCountChange,
    votesPctDiff: mpVotesPctChange,
    districtsCounted,
    districtsTotal
  };

  return {
    year: usedYear,
    result: {
      code,
      name: vo.namn || nameFallback,
      mpMandates,
      mpMandatesChange,
      mpVotesPct,
      mpVotesPctChange,
      mpVotesCount,
      mpVotesCountChange,
      totalValidVotes,
      thresholdVotesCount,
      thresholdPct,
      votesDiffFromThreshold,
      totalMandates,
      districtsCounted,
      districtsTotal,
      hasMandate,
      isCountingComplete: districtsTotal > 0 && districtsCounted >= districtsTotal,
      isNewRegionWithMandate,
      partyMandates,
      votesToNextMandate,
      votesToLoseMandate,
      hasRegisteredMpList,
      candidates,
      diffVsPrevious
    }
  };
}

// In-memory cache (5 minutes TTL) to protect Valmyndigheten & optimize high-concurrency traffic
const CACHE_TTL_MS = 5 * 60 * 1000;
const memoryCache: Record<string, { timestamp: number; data: MunicipalityPollResponse }> = {};

export const GET: RequestHandler = async ({ url }) => {
  const phaseParam = url.searchParams.get('phase');
  const phase: 'preliminary' | 'final' = phaseParam === 'final' ? 'final' : 'preliminary';
  const now = Date.now();

  // Return cached result if fresh (< 5m)
  if (memoryCache[phase] && (now - memoryCache[phase].timestamp) < CACHE_TTL_MS) {
    return json(memoryCache[phase].data, {
      headers: {
        'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=60'
      }
    });
  }

  try {
    const registeredMpData = await getMpRegisteredMunicipalities();
    const activeYear = await detectActiveYear(phase);

    // Process in parallel batches of 15 to avoid overwhelming network
    const BATCH_SIZE = 15;
    const results: { result: MunicipalityResult; year: string }[] = [];

    for (let i = 0; i < MUNICIPALITY_CODES.length; i += BATCH_SIZE) {
      const batch = MUNICIPALITY_CODES.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(m => fetchLiveMunicipalityData(m.code, m.name, phase, activeYear, registeredMpData.codes, registeredMpData.candidates))
      );
      for (const res of batchResults) {
        if (res) results.push(res);
      }
      // Small throttle between batches
      if (i + BATCH_SIZE < MUNICIPALITY_CODES.length) {
        await new Promise(r => setTimeout(r, 20));
      }
    }

    if (results.length === 0) {
      if (memoryCache[phase]) {
        return json(memoryCache[phase].data, {
          headers: { 'Cache-Control': 'public, max-age=10, s-maxage=10' }
        });
      }
      return json(
        {
          timestamp: new Date().toISOString(),
          source: 'live',
          status: 'error',
          electionYear: '2026',
          countingPhase: phase,
          errorDetails: 'Inga kommunresultat kunde hämtas från val.se'
        },
        { status: 504 }
      );
    }

    const municipalities = results.map((r) => r.result);
    const electionYear = results[0]?.year || '2026';

    const totalMpMandates = municipalities.reduce((sum, r) => sum + r.mpMandates, 0);
    const totalMpMandatesChange = municipalities.reduce((sum, r) => sum + r.mpMandatesChange, 0);
    const totalMpVotes = municipalities.reduce((sum, r) => sum + r.mpVotesCount, 0);
    const totalMpVotesChange = municipalities.reduce((sum, r) => sum + r.mpVotesCountChange, 0);

    const regionsWithMandatesCount = municipalities.filter((r) => r.hasMandate).length;
    const newlyGainedRegionsCount = municipalities.filter((r) => r.isNewRegionWithMandate).length;
    const regionsBelowThresholdCount = municipalities.filter((r) => r.mpVotesPct < (r.thresholdPct || 2.0)).length;
    const totalVotesNeededBelowThreshold = municipalities
      .filter((r) => r.mpVotesPct < (r.thresholdPct || 2.0))
      .reduce((sum, r) => sum + Math.max(0, r.votesToNextMandate), 0);

    const totalDistrictsCounted = municipalities.reduce((sum, r) => sum + r.districtsCounted, 0);
    const totalDistrictsTotal = municipalities.reduce((sum, r) => sum + r.districtsTotal, 0);

    const validPctCount = municipalities.filter((r) => r.mpVotesPct > 0).length;
    const averageMpVotePct =
      validPctCount > 0
        ? Number((municipalities.reduce((sum, r) => sum + r.mpVotesPct, 0) / validPctCount).toFixed(2))
        : 0;

    const averageMpVotePctChange =
      validPctCount > 0
        ? Number((municipalities.reduce((sum, r) => sum + r.mpVotesPctChange, 0) / validPctCount).toFixed(2))
        : 0;

    const summary: PollSummary = {
      totalMpMandates,
      totalMpMandatesChange,
      totalMpVotes,
      totalMpVotesChange,
      regionsWithMandatesCount,
      newlyGainedRegionsCount,
      regionsBelowThresholdCount,
      totalVotesNeededBelowThreshold,
      totalRegions: municipalities.length,
      totalDistrictsCounted,
      totalDistrictsTotal,
      averageMpVotePct,
      averageMpVotePctChange
    };

    const response: MunicipalityPollResponse = {
      timestamp: new Date().toISOString(),
      source: 'live',
      status: 'success',
      electionYear,
      countingPhase: phase,
      summary,
      municipalities
    };

    memoryCache[phase] = { timestamp: now, data: response };

    return json(response, {
      headers: {
        'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=30'
      }
    });
  } catch (err: any) {
    if (memoryCache[phase]) {
      return json(memoryCache[phase].data, {
        headers: { 'Cache-Control': 'public, max-age=10, s-maxage=10' }
      });
    }

    return json(
      {
        timestamp: new Date().toISOString(),
        source: 'live',
        status: 'error',
        electionYear: '2026',
        countingPhase: phase,
        errorDetails: err?.message || 'Internt fel vid hämtning av kommunresultat'
      },
      { status: 500 }
    );
  }
};
