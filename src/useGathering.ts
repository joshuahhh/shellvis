
import { useCallback, useState } from "react";

export function useGathering<T>(): [Record<string, T>, (id: string, value: T | undefined) => void] {
  const [values, setValues] = useState<Record<string, T>>({});
  const reportValue = useCallback((id: string, value: T | undefined) => {
    setValues((values) => {
      let newValues = { ...values };
      if (value === undefined) {
        delete newValues[id];
      } else {
        newValues[id] = value;
      }
      return newValues;
    });
  }, [setValues]);
  return [values, reportValue];
}
