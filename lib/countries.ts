// ISO 3166-1 alpha-2 codes; display names come from Intl.DisplayNames so no name table is needed.
export const COUNTRY_CODES =
  "US CA GB AU NZ IE VN SG MY TH PH ID JP KR CN HK TW IN AE SA IL TR MX BR AR CL CO PE ZA NG KE EG MA DE FR ES IT PT NL BE LU CH AT SE NO DK FI IS PL CZ SK HU RO BG GR HR SI RS UA LT LV EE RU AF AL DZ AD AO AM AZ BH BD BY BZ BO BA BW BN KH CM CR CU CY DO EC SV GE GH GT HN IQ IR JM JO KZ KW KG LA LB LY MO MK MG MV MT MU MD MC MN ME MM NA NP NI OM PK PA PY QA SN LK TN TZ UG UY UZ VE YE ZM ZW".split(" ");

let names: Intl.DisplayNames | undefined;
export const countryName = (code: string) => {
  try {
    names ??= new Intl.DisplayNames(["en"], { type: "region" });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
};

/** US first, then alphabetical by English name */
export const COUNTRIES = [...new Set(COUNTRY_CODES)]
  .map((code) => ({ code, name: countryName(code) }))
  .sort((a, b) => (a.code === "US" ? -1 : b.code === "US" ? 1 : a.name.localeCompare(b.name)));
