const small = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"];
function under100(n: number, beforeMille = false): string {
  if (n < 17) return small[n];
  if (n < 20) return `dix-${small[n - 10]}`;
  if (n < 70) {
    const tens = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"][Math.floor(n / 10)];
    return tens + (n % 10 === 1 ? " et un" : n % 10 ? `-${small[n % 10]}` : "");
  }
  if (n < 80) return `soixante${n === 71 ? " et " : "-"}${under100(n - 60)}`;
  return "quatre-vingt" + (n === 80 ? (beforeMille ? "" : "s") : `-${under100(n - 80)}`);
}
function under1000(n: number, beforeMille = false): string {
  if (n < 100) return under100(n, beforeMille);
  const c = Math.floor(n / 100), rest = n % 100;
  return (c === 1 ? "cent" : `${small[c]} cent${rest === 0 && !beforeMille ? "s" : ""}`) + (rest ? ` ${under100(rest, beforeMille)}` : "");
}
export function numberInWords(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0 || n >= 1e12) throw new RangeError("Montant hors limites.");
  if (n < 1000) return under1000(n);
  const parts: string[] = [];
  for (const [size, label] of [[1e9, "milliard"], [1e6, "million"]] as const) {
    const count = Math.floor(n / size);
    if (count) { parts.push(`${under1000(count)} ${label}${count > 1 ? "s" : ""}`); n %= size; }
  }
  const thousands = Math.floor(n / 1000);
  if (thousands) parts.push(thousands === 1 ? "mille" : `${under1000(thousands, true)} mille`);
  if (n % 1000) parts.push(under1000(n % 1000));
  return parts.join(" ");
}
/** La devise est incluse une seule fois, y compris les centimes. */
export function amountInWords(amount: number): string {
  const cents = Math.round(amount * 100);
  const dirhams = Math.floor(cents / 100), rest = cents % 100;
  const de = dirhams !== 0 && dirhams % 1000000 === 0 ? " de" : "";
  const phrase = `${numberInWords(dirhams)}${de} dirham${dirhams > 1 ? "s" : ""}${rest ? ` et ${numberInWords(rest)} centime${rest > 1 ? "s" : ""}` : ""}`;
  return phrase.replace(/(^|[\s-])\p{L}/gu, c => c.toLocaleUpperCase("fr-FR"));
}
