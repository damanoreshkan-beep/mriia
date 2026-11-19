import { assertEquals } from "jsr:@std/assert@1";
import { alpha2, flagOf, countryName, whoLabel } from "../country.js";

Deno.test("alpha2 reads alpha-3 and alpha-2 codes and refuses what is not a country", () => {
  assertEquals(alpha2("USA"), "US");
  assertEquals(alpha2("ukr"), "UA");
  assertEquals(alpha2("GUF"), "GF");
  assertEquals(alpha2("de"), "DE");
  assertEquals(alpha2("XXX"), "");
  assertEquals(alpha2("ZZ"), "");
  assertEquals(alpha2(null), "");
});

Deno.test("flagOf builds the regional indicator pair", () => {
  assertEquals(flagOf("USA"), "\u{1F1FA}\u{1F1F8}");
  assertEquals(flagOf("UKR"), "\u{1F1FA}\u{1F1E6}");
  assertEquals(flagOf("N/A"), "");
});

Deno.test("countryName speaks the asked language", () => {
  assertEquals(countryName("CHN", "en"), "China");
  assertEquals(countryName("FRA", "uk"), "Франція");
  assertEquals(countryName("", "uk"), "");
});

Deno.test("whoLabel puts the country before the organisation", () => {
  assertEquals(whoLabel("Rocket Lab", "NZL", "en"), "\u{1F1F3}\u{1F1FF} New Zealand · Rocket Lab");
  assertEquals(whoLabel("ESA", "FRA,ITA,DEU,ESP,CHE", "en"), "\u{1F1EB}\u{1F1F7}\u{1F1EE}\u{1F1F9}\u{1F1E9}\u{1F1EA} +2 · ESA");
  assertEquals(whoLabel("ExPace", "", "uk"), "ExPace");
  assertEquals(whoLabel("", "JPN", "en"), "\u{1F1EF}\u{1F1F5} Japan");
});
