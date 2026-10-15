/**
 * Writes spoken slashes as symbols: "in slash downloads" → "in /downloads",
 * "clone slash fork" → "clone/fork", "tilde slash desktop" → "~/desktop".
 * Runs after proofreading, like numbers, and changes nothing else.
 *
 * "slash" becomes a symbol only directly before a word. It joins the previous
 * word unless that word introduces the path ("in", "the", "dans"); it stays a
 * word when it names the character ("a slash", "the slash is", "slash command").
 */

// Words after which a slash starts a path instead of joining two words.
const introducers = new Set([
  // English function words and dictation verbs.
  "a",
  "about",
  "also",
  "an",
  "and",
  "any",
  "are",
  "at",
  "be",
  "but",
  "by",
  "call",
  "called",
  "check",
  "create",
  "for",
  "from",
  "go",
  "her",
  "his",
  "hit",
  "in",
  "inside",
  "into",
  "is",
  "it",
  "its",
  "just",
  "like",
  "my",
  "named",
  "of",
  "on",
  "onto",
  "open",
  "or",
  "our",
  "run",
  "save",
  "say",
  "see",
  "so",
  "some",
  "that",
  "the",
  "their",
  "then",
  "these",
  "this",
  "those",
  "to",
  "try",
  "type",
  "under",
  "use",
  "via",
  "visit",
  "was",
  "were",
  "with",
  "write",
  "your",
  // French.
  "au",
  "aux",
  "avec",
  "ce",
  "cet",
  "cette",
  "comme",
  "dans",
  "de",
  "des",
  "du",
  "en",
  "est",
  "et",
  "l",
  "la",
  "le",
  "les",
  "leur",
  "ma",
  "mes",
  "mon",
  "notre",
  "ou",
  "ouvre",
  "par",
  "pour",
  "sa",
  "ses",
  "son",
  "sous",
  "sur",
  "ta",
  "tape",
  "tes",
  "ton",
  "un",
  "une",
  "va",
  "vers",
  "votre",
  "à",
]);

// After these, "slash" names the character itself.
const articles = new Set(["a", "an", "un", "une"]);

// Before these, "slash" names the character itself ("slash command", "the slash is").
const characterNouns = new Set([
  "button",
  "character",
  "characters",
  "command",
  "commands",
  "key",
  "separator",
  "sign",
  "symbol",
]);

interface Token {
  text: string;
  /** Lowercased word without surrounding punctuation; undefined for spaces. */
  word?: string;
  /** Punctuation glued to the word, kept around the result. */
  leading: string;
  trailing: string;
}

const wordPattern = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u;

function tokenize(text: string): Token[] {
  return text
    .split(/(\s+)/)
    .filter((part) => part.length > 0)
    .map((part) => {
      if (/^\s+$/.test(part)) return { text: part, leading: "", trailing: "" };
      const [, leading = "", core = "", trailing = ""] = wordPattern.exec(part) ?? [];
      return { text: part, word: core ? core.toLowerCase() : undefined, leading, trailing };
    });
}

function wordAt(tokens: Token[], index: number, step: 1 | -1) {
  for (let cursor = index + step; cursor >= 0 && cursor < tokens.length; cursor += step) {
    if (tokens[cursor]!.word !== undefined) return cursor;
    if (!/^\s+$/.test(tokens[cursor]!.text)) return undefined;
  }
  return undefined;
}

const core = (token: Token) =>
  token.text.slice(token.leading.length, token.text.length - token.trailing.length);

export function writeSpokenPaths(text: string) {
  if (!/slash/i.test(text)) return text;
  const tokens = tokenize(text);
  for (let index = 0; index < tokens.length; index += 1) {
    const slash = tokens[index]!;
    if (slash.word !== "slash" || slash.trailing) continue;
    let next = wordAt(tokens, index, 1);
    if (next === undefined) continue;
    const target = tokens[next]!;
    if (target.leading || target.word === "slash") continue;
    if (characterNouns.has(target.word!)) continue;
    let previous = wordAt(tokens, index, -1);
    // "forward slash" is the same symbol; "tilde slash" is the home folder.
    const modifier =
      previous !== undefined && !slash.leading && !tokens[previous]!.trailing
        ? tokens[previous]!.word
        : undefined;
    const modified = modifier === "forward" || modifier === "tilde";
    const prefix = modifier === "tilde" ? "~/" : "/";
    const beforeIndex = modified ? wordAt(tokens, previous!, -1) : previous;
    const beforeWord = beforeIndex === undefined ? undefined : tokens[beforeIndex]!.word;
    // "and slash or" is the one function-word pair spoken as a symbol.
    const andOr = beforeWord === "and" && target.word === "or" && !modified;
    if (introducers.has(target.word!) && !andOr) continue;
    if (beforeWord && articles.has(beforeWord) && modifier !== "tilde") continue;
    if (modified) {
      tokens.splice(previous!, index - previous!);
      next -= index - previous!;
      index = previous!;
      previous = wordAt(tokens, index, -1);
    }
    const before = previous === undefined ? undefined : tokens[previous]!;
    const joins =
      prefix === "/" &&
      !slash.leading &&
      before !== undefined &&
      !before.trailing &&
      (andOr || !introducers.has(before.word!));
    const path = prefix + core(target) + target.trailing;
    if (joins) {
      const joined = before.text + path;
      tokens.splice(previous!, next - previous! + 1, {
        text: joined,
        word: joined.toLowerCase(),
        leading: before.leading,
        trailing: target.trailing,
      });
      index = previous!;
    } else {
      const text = slash.leading + path;
      tokens.splice(index, next - index + 1, {
        text,
        word: text.toLowerCase(),
        leading: slash.leading,
        trailing: target.trailing,
      });
    }
  }
  return tokens.map((token) => token.text).join("");
}
