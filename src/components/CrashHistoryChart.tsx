import type { CorrectionHistory } from "../lib/correction-history";
import { DrawdownHistoryChart } from "./DrawdownHistoryChart";

type Props = {
  history: CorrectionHistory;
  label: string;
  variant?: "page" | "teaser";
};

export function CrashHistoryChart(props: Props) {
  return <DrawdownHistoryChart {...props} mode="crash" />;
}
