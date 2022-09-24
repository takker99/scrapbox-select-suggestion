/** URL文字列をURLに変換する*/
export const detectURL = (text: URL | string): URL | string => {
  if (text instanceof URL) return text;
  try {
    const url = new URL(text);
    return url;
  } catch (e: unknown) {
    if (e instanceof TypeError) return text;
    throw e;
  }
};
