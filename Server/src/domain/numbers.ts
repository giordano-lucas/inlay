/**
 * Writes spoken English and French numbers as digits ("three thousand and
 * three" → "3003", "vingt-cinq pour cent" → "25 %"). Runs after proofreading,
 * whose validation must still compare number words, and changes nothing else.
 *
 * A lone word below ten ("one of", "un des") stays a word unless a cue
 * ("number", "version", "page") precedes it or a unit follows it. A lone scale
 * word ("thousand", "mille") also stays a word.
 */

type Language = "en" | "fr";
type Kind = "unit" | "teen" | "tens" | "hundred" | "scale";

interface NumberWord {
  value: number;
  kind: Kind;
}

const english = new Map<string, NumberWord>();
const french = new Map<string, NumberWord>();
const define = (map: Map<string, NumberWord>, kind: Kind, entries: [string, number][]) => {
  for (const [word, value] of entries) map.set(word, { value, kind });
};

define(english, "unit", [
  ["zero", 0],
  ["oh", 0], // a digit inside a number only: "one oh four"
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
]);
define(english, "teen", [
  ["ten", 10],
  ["eleven", 11],
  ["twelve", 12],
  ["thirteen", 13],
  ["fourteen", 14],
  ["fifteen", 15],
  ["sixteen", 16],
  ["seventeen", 17],
  ["eighteen", 18],
  ["nineteen", 19],
]);
define(english, "tens", [
  ["twenty", 20],
  ["thirty", 30],
  ["forty", 40],
  ["fifty", 50],
  ["sixty", 60],
  ["seventy", 70],
  ["eighty", 80],
  ["ninety", 90],
]);
define(english, "hundred", [["hundred", 100]]);
define(english, "scale", [
  ["thousand", 1_000],
  ["million", 1_000_000],
  ["billion", 1_000_000_000],
]);

define(french, "unit", [
  ["zéro", 0],
  ["un", 1],
  ["une", 1],
  ["deux", 2],
  ["trois", 3],
  ["quatre", 4],
  ["cinq", 5],
  ["six", 6],
  ["sept", 7],
  ["huit", 8],
  ["neuf", 9],
]);
define(french, "teen", [
  ["dix", 10],
  ["onze", 11],
  ["douze", 12],
  ["treize", 13],
  ["quatorze", 14],
  ["quinze", 15],
  ["seize", 16],
]);
define(french, "tens", [
  ["vingt", 20],
  ["vingts", 20],
  ["trente", 30],
  ["quarante", 40],
  ["cinquante", 50],
  ["soixante", 60],
]);
define(french, "hundred", [
  ["cent", 100],
  ["cents", 100],
]);
define(french, "scale", [
  ["mille", 1_000],
  ["million", 1_000_000],
  ["millions", 1_000_000],
  ["milliard", 1_000_000_000],
  ["milliards", 1_000_000_000],
]);

const lexicons: Record<Language, Map<string, NumberWord>> = { en: english, fr: french };
const conjunctions: Record<Language, string> = { en: "and", fr: "et" };
const decimalWords: Record<Language, string> = { en: "point", fr: "virgule" };

/** Words before a number that mark it as an identifier or measurement. */
const cues = new Set(
  (
    "number numbers pr prs issue issues ticket tickets version page pages step steps chapter " +
    "line lines port room item row column episode season level build release sprint figure table " +
    "numéro numéros étape étapes chapitre ligne lignes salle"
  ).split(" "),
);
/** Words after a number that make even a small number a measurement.
 * Durations ("three hours") are left out: small ones read better as words. */
const units = new Set(
  "am pm a.m p.m percent ms gb mb kb tb km kg dollars euros pounds bucks x k h go mo".split(" "),
);

interface Token {
  text: string;
  word?: string; // lowercased letters, when the token is a word
}

const tokenPattern = /\p{L}+(?:[.’']\p{L}+)*\.?|[^\p{L}]+/gu;

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  for (const match of text.matchAll(tokenPattern)) {
    let piece = match[0];
    // Keep a sentence-final period out of the word except in "a.m.".
    if (/^\p{L}/u.test(piece) && piece.endsWith(".") && !/\p{L}\.\p{L}/u.test(piece)) {
      tokens.push({ text: piece.slice(0, -1), word: piece.slice(0, -1).toLowerCase() });
      piece = ".";
      tokens.push({ text: piece });
      continue;
    }
    tokens.push(
      /^\p{L}/u.test(piece)
        ? { text: piece, word: piece.toLowerCase().replace(/\.$/, "") }
        : { text: piece },
    );
  }
  return tokens;
}

const joiner = (token: Token | undefined) => !!token && !token.word && /^[  -]+$/.test(token.text);
const isNumberWord = (token: Token | undefined, language: Language) =>
  !!token?.word && lexicons[language].has(token.word);

interface Parsed {
  value: number;
  words: number; // number words used
  end: number; // token index after the number
}

/** Parses one number starting at a number word; stops where a new number begins. */
function parseNumber(tokens: Token[], start: number, language: Language): Parsed {
  const lexicon = lexicons[language];
  let total = 0;
  let group = 0;
  let last: Kind | undefined;
  let lastValue = 0;
  let lastScale = Infinity;
  let words = 0;
  let end = start;
  let index = start;
  while (index < tokens.length) {
    const token = tokens[index]!;
    const entry = token.word ? lexicon.get(token.word) : undefined;
    let accepted = false;
    if (entry) {
      const tail = group % 100;
      switch (entry.kind) {
        case "unit":
          if (entry.value === 0) {
            accepted = words === 0;
            if (accepted) words = -1; // zero is a complete number
          } else if (
            tail === 0 ||
            (last === "tens" && tail % 10 === 0 && lastValue !== 0) ||
            // French 17–19 and 77–79, 97–99: dix-sept, soixante-dix-huit.
            (language === "fr" && last === "teen" && lastValue === 10 && entry.value >= 7)
          ) {
            accepted = true;
            group += entry.value;
          }
          break;
        case "teen":
          // French 70 and 90: soixante-dix, quatre-vingt-dix.
          if (
            tail === 0 ||
            (language === "fr" && last === "tens" && (tail === 60 || tail === 80))
          ) {
            accepted = true;
            group += entry.value;
          }
          break;
        case "tens":
          if (language === "fr" && entry.value === 20 && last === "unit" && tail === 4) {
            accepted = true; // quatre-vingt(s)
            group += 76;
          } else if (tail === 0) {
            accepted = true;
            group += entry.value;
          }
          break;
        case "hundred":
          if (group > 0 && group < 10 && last === "unit") {
            accepted = true;
            group *= 100;
          } else if (language === "en" && total === 0 && group >= 10 && group < 100) {
            accepted = true; // "fifteen hundred", "twenty five hundred"
            group *= 100;
          } else if (language === "fr" && group === 0 && words > 0) {
            accepted = true; // "mille cent"
            group = 100;
          } else if (language === "fr" && group === 0 && words === 0) {
            accepted = true; // "cent", "cent vingt"
            group = 100;
          }
          break;
        case "scale":
          if (
            entry.value < lastScale &&
            (group > 0 || (language === "fr" && entry.value === 1000))
          ) {
            accepted = true;
            total += (group || 1) * entry.value;
            group = 0;
            lastScale = entry.value;
          }
          break;
      }
      if (accepted) {
        last = entry.kind;
        lastValue = entry.value;
        if (words >= 0) words += 1;
        else words = 1;
        end = index + 1;
        if (entry.kind === "unit" && entry.value === 0) break;
      }
    } else if (
      token.word === conjunctions[language] &&
      words > 0 &&
      isNumberWord(tokens[index + 2], language) &&
      joiner(tokens[index + 1])
    ) {
      // "three thousand and three", "vingt et un"
      const next = lexicon.get(tokens[index + 2]!.word!)!;
      const fits =
        language === "en"
          ? (last === "hundred" || last === "scale") &&
            (next.kind === "unit" || next.kind === "teen" || next.kind === "tens")
          : last === "tens" && (next.value === 1 || next.value === 11);
      if (fits) {
        index += 2;
        continue;
      }
    }
    if (!accepted) break;
    // Continue only across spaces or hyphens.
    if (!joiner(tokens[index + 1])) break;
    index += 2;
  }
  return { value: total + group, words: Math.max(words, 1), end };
}

function format(value: number, language: Language) {
  if (value < 10_000) return String(value);
  return value
    .toLocaleString(language === "fr" ? "fr-FR" : "en-US")
    .replace(/\s/g, language === "fr" ? " " : ",");
}

function previousWord(tokens: Token[], index: number) {
  for (let i = index - 1; i >= 0; i--) {
    const token = tokens[i]!;
    if (token.word) return token.word;
    if (!/^[\s#]*$/.test(token.text)) return token.text.includes("#") ? "#" : undefined;
  }
  return undefined;
}

function nextWord(tokens: Token[], index: number) {
  for (let i = index; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.word) return token.word;
    if (/%/.test(token.text)) return "percent";
    if (!/^\s*$/.test(token.text)) return undefined;
  }
  return undefined;
}

/** Hyphenated into a non-number word ("twenty-first", "two-factor"). */
function partOfCompound(tokens: Token[], start: number, end: number) {
  const before = tokens[start - 1];
  const after = tokens[end];
  return (
    (before?.text === "-" && !!tokens[start - 2]?.word) ||
    (after?.text === "-" && !!tokens[end + 1]?.word)
  );
}

export function digitizeNumbers(text: string) {
  const tokens = tokenize(text);
  const output: string[] = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index]!;
    let language: Language | undefined = isNumberWord(token, "en")
      ? "en"
      : isNumberWord(token, "fr")
        ? "fr"
        : undefined;
    if (!language || token.word === "oh") {
      output.push(token.text);
      index += 1;
      continue;
    }
    // A word in both lexicons ("six") reads in the language that goes further.
    let numbers = parseRun(tokens, index, language);
    if (language === "en" && isNumberWord(token, "fr")) {
      const alternative = parseRun(tokens, index, "fr");
      if (alternative.at(-1)!.end > numbers.at(-1)!.end) {
        numbers = alternative;
        language = "fr";
      }
    }
    const end = numbers.at(-1)!.end;
    if (end <= index) {
      // A scale word that starts no number ("thousand", "hundred").
      output.push(token.text);
      index += 1;
      continue;
    }
    const decimal = numbers.length === 1 ? decimalAt(tokens, end, language) : undefined;
    const cue = previousWord(tokens, index);
    const cued = !!cue && (cues.has(cue) || cue === "#");
    const unitAfter = nextWord(tokens, end);
    const first = numbers[0]!;
    const lone = numbers.length === 1 && first.words === 1;
    const loneEntry = lexicons[language].get(token.word!)!;
    if (
      partOfCompound(tokens, index, end) ||
      (lone && loneEntry.kind === "scale") ||
      (lone && loneEntry.kind === "hundred") ||
      (lone && first.value < 10 && !cued && !decimal && !(unitAfter && units.has(unitAfter)))
    ) {
      // Leave the original words.
      for (let i = index; i < end; i++) output.push(tokens[i]!.text);
      index = end;
      continue;
    }
    let replacement: string;
    const year =
      numbers.length === 2 &&
      (first.value === 19 || first.value === 20) &&
      first.words === 1 &&
      numbers[1]!.value >= 10 &&
      numbers[1]!.value < 100;
    if (numbers.length > 1 && (cued || year)) {
      replacement = numbers.map((number) => String(number.value)).join("");
    } else {
      replacement = numbers.map((number) => format(number.value, language)).join(" ");
    }
    index = end;
    if (decimal) {
      replacement = `${replacement}${language === "fr" ? "," : "."}${decimal.digits}`;
      index = decimal.end;
    }
    // Percent: "25%" in English, "25 %" in French.
    const percent = percentAt(tokens, index);
    if (percent) {
      replacement += language === "fr" ? " %" : "%";
      index = percent;
    }
    output.push(replacement);
  }
  return output.join("");
}

/** Digits after "point" / "virgule" ("three point one four"), if next. */
function decimalAt(tokens: Token[], index: number, language: Language) {
  if (!joiner(tokens[index]) || tokens[index + 1]?.word !== decimalWords[language])
    return undefined;
  let digits = "";
  let cursor = index + 2;
  while (joiner(tokens[cursor])) {
    const entry = tokens[cursor + 1]?.word
      ? lexicons[language].get(tokens[cursor + 1]!.word!)
      : undefined;
    if (!entry || entry.kind !== "unit") break;
    digits += entry.value;
    cursor += 2;
  }
  return digits ? { digits, end: cursor } : undefined;
}

/** A run of numbers: "eighty two seventy five" parses as 82, 75. */
function parseRun(tokens: Token[], start: number, language: Language) {
  const numbers: Parsed[] = [];
  let cursor = start;
  for (;;) {
    const parsed = parseNumber(tokens, cursor, language);
    if (parsed.end <= cursor) break;
    numbers.push(parsed);
    if (!joiner(tokens[parsed.end]) || tokens[parsed.end]!.text.includes("-")) break;
    if (!isNumberWord(tokens[parsed.end + 1], language)) break;
    cursor = parsed.end + 1;
  }
  return numbers.length ? numbers : [{ value: 0, words: 1, end: start }];
}

/** Index after "percent", "per cent", "pour cent", or "pourcent", if next. */
function percentAt(tokens: Token[], index: number) {
  if (!joiner(tokens[index])) return undefined;
  const word = tokens[index + 1]?.word;
  if (word === "percent" || word === "pourcent") return index + 2;
  if (
    (word === "per" || word === "pour") &&
    joiner(tokens[index + 2]) &&
    tokens[index + 3]?.word === "cent"
  )
    return index + 4;
  return undefined;
}
