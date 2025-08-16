/** URL文字列をURLに変換する*/
export const detectURL = (
  text: URL | string,
  base?: URL | string,
): URL | string => {
  if (text instanceof URL) return text;
  try {
    return new URL(text);
  } catch (e: unknown) {
    if (!(e instanceof TypeError)) throw e;
    if (!base) return text;
    // 相対パスへの変換を試みる
    // ./や../や/で始まらない文字列は、相対パス扱いしない
    if (!/^\.\/|^\.\.\/|^\//.test(text)) return text;
    try {
      return new URL(text, base);
    } catch (e: unknown) {
      if (!(e instanceof TypeError)) throw e;
      // NOTE: ここに到達するのは base 文字列が URL として不正なときのみ。
      // new URL(text) で TypeError, かつ base あり, かつ new URL(text, base) も TypeError
      // を再現するには URL コンストラクタをモンキーパッチするか不正 base を与える必要がある。
      // 異常系であり価値が低いのでテスト対象外 (intentionally skipped).
      return text;
    }
  }
};
