import { MemosApp } from "../memos/MemosApp";

/** Singular direct route used by platform shortcuts; /memos remains supported. */
export default function MemoPage() {
  return <MemosApp />;
}
