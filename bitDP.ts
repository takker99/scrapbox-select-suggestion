/** 検索函数 */
export interface Filter {
  /** 与えた文字列に一致する編集距離のリストを計算する
   *
   * @param text 検索対象の文字列
   * @return i番目に、textのi番目の近似文字列出現の編集距離を格納した配列
   */
  (text: string): number[];
}

/** あいまい検索する
 *
 * @param query 検索文字列
 * @return 検索用函数
 */
export const bitDP = (query: string): Filter => {
  // 末尾が最初の文字のビットを表す
  const Peq = new Map<string, number>();
  const rquery = [...query].reverse(); // 書記素に分割しておく
  {
    let i = 1;
    for (const q of rquery) {
      Peq.set(q, (Peq.get(q) ?? 0) | i);
      const pil = q.toLowerCase();
      Peq.set(pil, (Peq.get(pil) ?? 0) | i);
      const piu = q.toUpperCase();
      Peq.set(piu, (Peq.get(piu) ?? 0) | i);
      i <<= 1;
    }
  }

  const m = rquery.length; //文字列数
  const Pv0 = ~(~(0) << m); // 右側からm個のbitsが立ったビット列
  const accept = 1 << (m - 1);

  return (text: string): number[] => {
    let Mv = 0;
    let Pv = Pv0;
    const rtext = [...text].reverse();
    const Cm: number[] = [];
    let j = rtext.length;
    Cm[j] = m;

    for (const t of rtext) {
      const Eq = Peq.get(t) ?? 0;
      const Xv = Eq | Mv;
      const Xh = (((Eq & Pv) + Pv) ^ Pv) | Eq;
      const Ph = Mv | ~(Xh | Pv);
      const Mh = Pv & Xh;
      Cm[j - 1] = Cm[j] +
        ((Ph & accept) !== 0 ? 1 : (Mh & accept) !== 0 ? -1 : 0);

      Pv = (Mh << 1) | ~(Xv | (Ph << 1));
      Mv = (Ph << 1) & Xv;
      j--;
    }

    return Cm;
  };
};
