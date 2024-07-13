import { useEffect, useRef } from "./deps/preact.tsx";

/** Reactの外に値を公開するhooks */
export const useExports = <
  ExportNames extends string,
  ExportObject extends Record<ExportNames, unknown>,
>(
  exporter: (
    exportObject: ExportObject | Record<ExportNames, undefined>,
  ) => void,
  exportObject: ExportObject,
): void => {
  const ref = useRef<ExportObject>({ ...exportObject });
  useEffect(
    () => {
      Object.assign(ref.current, exportObject);
      return () => {
        for (const key of Object.keys(exportObject)) {
          delete ref.current[key as ExportNames];
        }
      };
    },
    [...Object.keys(exportObject)].sort().map((key) =>
      exportObject[key as ExportNames]
    ),
  );
  useEffect(() => {
    exporter(ref.current);
  }, [exporter]);
};
