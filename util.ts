/** URL文字列をURLに変換する*/
export const detectURL = (
  text: URL | string,
  base?: URL | string,
): URL | string => {
  if (text instanceof URL) return text;
  // ./や../や/で始まらない文字列は、相対パス扱いしない
  if (base && !text.startsWith(".") && !text.startsWith("/")) return text;
  try {
    const url = new URL(text, base);
    return url;
  } catch (e: unknown) {
    if (e instanceof TypeError) return text;
    throw e;
  }
};