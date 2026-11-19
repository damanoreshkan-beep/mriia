const A3 = "AFGAF ALAAX ALBAL DZADZ ASMAS ANDAD AGOAO AIAAI ATAAQ ATGAG ARGAR ARMAM ABWAW AUSAU AUTAT AZEAZ BHSBS BHRBH BGDBD BRBBB BLRBY BELBE BLZBZ BENBJ BMUBM BTNBT BOLBO BESBQ BIHBA BWABW BVTBV BRABR IOTIO BRNBN BGRBG BFABF BDIBI CPVCV KHMKH CMRCM CANCA CYMKY CAFCF TCDTD CHLCL CHNCN CXRCX CCKCC COLCO COMKM COGCG CODCD COKCK CRICR CIVCI HRVHR CUBCU CUWCW CYPCY CZECZ DNKDK DJIDJ DMADM DOMDO ECUEC EGYEG SLVSV GNQGQ ERIER ESTEE SWZSZ ETHET FLKFK FROFO FJIFJ FINFI FRAFR GUFGF PYFPF ATFTF GABGA GMBGM GEOGE DEUDE GHAGH GIBGI GRCGR GRLGL GRDGD GLPGP GUMGU GTMGT GGYGG GINGN GNBGW GUYGY HTIHT HMDHM VATVA HNDHN HKGHK HUNHU ISLIS INDIN IDNID IRNIR IRQIQ IRLIE IMNIM ISRIL ITAIT JAMJM JPNJP JEYJE JORJO KAZKZ KENKE KIRKI PRKKP KORKR KWTKW KGZKG LAOLA LVALV LBNLB LSOLS LBRLR LBYLY LIELI LTULT LUXLU MACMO MDGMG MWIMW MYSMY MDVMV MLIML MLTMT MHLMH MTQMQ MRTMR MUSMU MYTYT MEXMX FSMFM MDAMD MCOMC MNGMN MNEME MSRMS MARMA MOZMZ MMRMM NAMNA NRUNR NPLNP NLDNL NCLNC NZLNZ NICNI NERNE NGANG NIUNU NFKNF MKDMK MNPMP NORNO OMNOM PAKPK PLWPW PSEPS PANPA PNGPG PRYPY PERPE PHLPH PCNPN POLPL PRTPT PRIPR QATQA REURE ROURO RUSRU RWARW BLMBL SHNSH KNAKN LCALC MAFMF SPMPM VCTVC WSMWS SMRSM STPST SAUSA SENSN SRBRS SYCSC SLESL SGPSG SXMSX SVKSK SVNSI SLBSB SOMSO ZAFZA SGSGS SSDSS ESPES LKALK SDNSD SURSR SJMSJ SWESE CHECH SYRSY TWNTW TJKTJ TZATZ THATH TLSTL TGOTG TKLTK TONTO TTOTT TUNTN TURTR TKMTM TCATC TUVTV UGAUG UKRUA AREAE GBRGB USAUS UMIUM URYUY UZBUZ VUTVU VENVE VNMVN VGBVG VIRVI WLFWF ESHEH YEMYE ZMBZM ZWEZW";
const TO2 = new Map(A3.split(" ").map((t) => [t.slice(0, 3), t.slice(3)]));
const TWO = new Set(TO2.values());

/**
 * The ISO 3166-1 alpha-2 code of a country given as alpha-2 or alpha-3, any case.
 * @param code "USA", "us", "UKR", …
 * @returns the alpha-2 code ("US"), or "" when the code is not a country
 */
export function alpha2(code) {
  const c = String(code || "").trim().toUpperCase();
  if (c.length === 2) return TWO.has(c) ? c : "";
  return TO2.get(c) || "";
}

/**
 * The flag of a country as its pair of regional indicator symbols.
 * @param code alpha-2 or alpha-3
 * @returns the flag ("🇺🇸"), or "" when the code is not a country
 */
export function flagOf(code) {
  const a = alpha2(code);
  return a ? String.fromCodePoint(...[...a].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65)) : "";
}

/**
 * The country's name in the given language, from the platform's own region names.
 * @param code alpha-2 or alpha-3
 * @param locale a BCP 47 language ("uk", "en", …)
 * @returns the name ("США" for "USA" in uk), or "" when the code is not a country
 */
export function countryName(code, locale = "en") {
  const a = alpha2(code);
  if (!a) return "";
  try { return new Intl.DisplayNames([locale], { type: "region" }).of(a) || ""; } catch { return ""; }
}

/**
 * Who stands behind a launch, an agency or a company: its country's flag and name, then its own name. A list of
 * several countries ("FRA,ITA,DEU") shows the first three flags and how many more there are.
 * @param name the organisation's name
 * @param codes one alpha-2/alpha-3 code, or several joined by commas
 * @param locale the language of the country name
 * @returns "🇺🇸 США · SpaceX", "🇫🇷🇮🇹🇩🇪 +20 · European Space Agency", or the name alone
 */
export function whoLabel(name, codes, locale = "en") {
  const list = String(codes || "").split(",").map(alpha2).filter(Boolean);
  const who = String(name || "").trim();
  if (!list.length) return who;
  const mark = list.length === 1
    ? `${flagOf(list[0])} ${countryName(list[0], locale)}`.trim()
    : `${list.slice(0, 3).map(flagOf).join("")}${list.length > 3 ? ` +${list.length - 3}` : ""}`;
  return who ? `${mark} · ${who}` : mark;
}
